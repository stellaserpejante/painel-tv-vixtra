import 'server-only';
import { getEnv } from '@/lib/env';

const API_BASE = 'https://api.hubapi.com';

export interface HubSpotFilter {
  propertyName: string;
  operator:
    | 'EQ' | 'NEQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
    | 'BETWEEN' | 'IN' | 'NOT_IN'
    | 'HAS_PROPERTY' | 'NOT_HAS_PROPERTY';
  value?: string;
  values?: string[];
  highValue?: string;
}

export interface HubSpotRecord {
  id: string;
  properties: Record<string, string | null>;
}

/** Erro tipado para diferenciar problema de credencial de instabilidade. */
export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = 'HubSpotError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getEnv();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (res.status === 429) {
    // Rate limit do HubSpot: espera o tempo indicado e tenta uma vez mais.
    const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    return request<T>(path, init);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint =
      res.status === 401
        ? ' — token inválido ou revogado'
        : res.status === 403
          ? ' — o Private App não tem o escopo necessário'
          : '';
    throw new HubSpotError(`HubSpot ${res.status}${hint}`, res.status, body.slice(0, 500));
  }

  return res.json() as Promise<T>;
}

/**
 * Busca negócios com paginação automática.
 * O endpoint /search devolve no máximo 100 por página e limita a 10.000
 * resultados no total — suficiente para todos os recortes mensais aqui.
 */
export async function searchDeals(params: {
  filterGroups: { filters: HubSpotFilter[] }[];
  properties: string[];
  limit?: number;
  sorts?: { propertyName: string; direction: 'ASCENDING' | 'DESCENDING' }[];
}): Promise<HubSpotRecord[]> {
  const results: HubSpotRecord[] = [];
  let after: string | undefined;
  const pageSize = Math.min(params.limit ?? 100, 100);

  do {
    const body: Record<string, unknown> = {
      filterGroups: params.filterGroups,
      properties: params.properties,
      limit: pageSize,
    };
    if (params.sorts) body.sorts = params.sorts;
    if (after) body.after = after;

    const page = await request<{
      total: number;
      results: HubSpotRecord[];
      paging?: { next?: { after: string } };
    }>('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    results.push(...page.results);
    after = page.paging?.next?.after;

    if (params.limit && results.length >= params.limit) break;
  } while (after);

  return params.limit ? results.slice(0, params.limit) : results;
}

export interface HubSpotOwner {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
}

/** Lista todos os owners — usada para traduzir hubspot_owner_id em nome e e-mail. */
export async function listOwners(): Promise<HubSpotOwner[]> {
  const owners: HubSpotOwner[] = [];
  let after: string | undefined;

  do {
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const page = await request<{
      results: {
        id: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      }[];
      paging?: { next?: { after: string } };
    }>(`/crm/v3/owners?${qs}`);

    for (const o of page.results) {
      const fullName = [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
      owners.push({
        id: o.id,
        email: o.email ?? null,
        firstName: o.firstName ?? null,
        lastName: o.lastName ?? null,
        fullName: fullName || o.email || `Owner ${o.id}`,
      });
    }
    after = page.paging?.next?.after;
  } while (after);

  return owners;
}

/** Verifica credencial e escopos — usada pela página de diagnóstico. */
export async function healthCheck(): Promise<{ ok: true; sample: number }> {
  const page = await request<{ total: number }>('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({ filterGroups: [], properties: ['dealname'], limit: 1 }),
  });
  return { ok: true, sample: page.total };
}
