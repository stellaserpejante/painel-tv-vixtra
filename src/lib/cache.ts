import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dataCache, metricSnapshots, integrationLogs } from '@/db/schema';
import { getCurrentPeriod } from './time';

/** Identificadores estáveis de cada fonte de dados do dashboard. */
export const SOURCES = {
  META: 'hubspot.meta',
  CLIENTES_ATIVADOS: 'hubspot.clientes_ativados',
  PIPELINE_CLOSING: 'hubspot.pipeline_closing',
  PIPELINE_FARMING: 'hubspot.pipeline_farming',
  CLOSERS: 'hubspot.closers',
  PARCERIAS_HUNTING: 'hubspot.parcerias_hunting',
  PARCERIAS_FARMING: 'hubspot.parcerias_farming',
  RETARGETING: 'hubspot.retargeting',
  FRETE: 'hubspot.frete',
  CAMBIO: 'hubspot.cambio',
  CREDITO_APROVADO: 'hubspot.credito_aprovado',
  ATIVACOES: 'slack.ativacoes',
  AVATARES: 'slack.avatares',
  CLIMA: 'weather',
  TRANSITO: 'traffic',
} as const;

export type SourceId = (typeof SOURCES)[keyof typeof SOURCES];

export interface CacheEntry<T = unknown> {
  source: string;
  payload: T | null;
  status: 'ok' | 'error' | 'stale';
  lastSuccessfulUpdate: Date | null;
  lastAttempt: Date | null;
  error: string | null;
  consecutiveFailures: number;
}

/** Intervalo padrão entre atualizações: 2 horas, conforme especificação. */
export const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * Grava um resultado BEM-SUCEDIDO: substitui o payload, zera o erro e o
 * contador de falhas, e registra um snapshot imutável no histórico.
 */
export async function writeSuccess<T>(
  source: string,
  payload: T,
  durationMs?: number
): Promise<void> {
  const now = new Date();
  const next = new Date(now.getTime() + REFRESH_INTERVAL_MS);

  await db
    .insert(dataCache)
    .values({
      source,
      payload: payload as never,
      status: 'ok',
      lastSuccessfulUpdate: now,
      lastAttempt: now,
      nextUpdate: next,
      error: null,
      consecutiveFailures: 0,
      durationMs: durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: dataCache.source,
      set: {
        payload: payload as never,
        status: 'ok',
        lastSuccessfulUpdate: now,
        lastAttempt: now,
        nextUpdate: next,
        error: null,
        consecutiveFailures: 0,
        durationMs: durationMs ?? null,
      },
    });

  await db.insert(metricSnapshots).values({
    source,
    periodKey: getCurrentPeriod().key,
    payload: payload as never,
  });
}

/**
 * Registra uma FALHA sem destruir o dado bom.
 *
 * Esta é a regra número 26 da especificação, e a parte mais importante deste
 * arquivo: o payload anterior permanece intocado. O dashboard continua
 * mostrando o último valor válido e o horário do último sucesso, em vez de
 * zerar ou quebrar.
 */
export async function writeFailure(source: string, error: unknown): Promise<void> {
  const now = new Date();
  const message = error instanceof Error ? error.message : String(error);

  await db
    .insert(dataCache)
    .values({
      source,
      payload: null,
      status: 'error',
      lastAttempt: now,
      error: message,
      consecutiveFailures: 1,
    })
    .onConflictDoUpdate({
      target: dataCache.source,
      set: {
        // Repare: `payload` e `lastSuccessfulUpdate` NÃO aparecem aqui.
        status: 'error',
        lastAttempt: now,
        error: message,
        consecutiveFailures: sql`${dataCache.consecutiveFailures} + 1`,
      },
    });

  await db.insert(integrationLogs).values({
    source,
    level: 'error',
    message,
  });
}

export async function readCache<T>(source: string): Promise<CacheEntry<T> | null> {
  const [row] = await db.select().from(dataCache).where(eq(dataCache.source, source)).limit(1);
  if (!row) return null;
  return {
    source: row.source,
    payload: (row.payload as T) ?? null,
    status: row.status as CacheEntry['status'],
    lastSuccessfulUpdate: row.lastSuccessfulUpdate,
    lastAttempt: row.lastAttempt,
    error: row.error,
    consecutiveFailures: row.consecutiveFailures,
  };
}

export async function readAllCache(): Promise<CacheEntry[]> {
  const rows = await db.select().from(dataCache);
  return rows.map((row) => ({
    source: row.source,
    payload: row.payload ?? null,
    status: row.status as CacheEntry['status'],
    lastSuccessfulUpdate: row.lastSuccessfulUpdate,
    lastAttempt: row.lastAttempt,
    error: row.error,
    consecutiveFailures: row.consecutiveFailures,
  }));
}

/**
 * Executa um job com retry exponencial e grava o resultado no cache.
 * Uma falha aqui nunca derruba as outras fontes — cada job é isolado.
 */
export async function runJob<T>(
  source: string,
  fn: () => Promise<T>,
  options: { retries?: number; retryDelayMs?: number } = {}
): Promise<{ ok: boolean; error?: string }> {
  const { retries = 2, retryDelayMs = 1500 } = options;
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      await writeSuccess(source, result, Date.now() - startedAt);
      return { ok: true };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
      }
    }
  }

  await writeFailure(source, lastError);
  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}
