import 'server-only';
import { getEnv } from '@/lib/env';

const API_BASE = 'https://slack.com/api';

export class SlackError extends Error {
  constructor(message: string, readonly slackError?: string) {
    super(message);
    this.name = 'SlackError';
  }
}

async function call<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const env = getEnv();
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: new URLSearchParams(params),
    cache: 'no-store',
  });

  const data = (await res.json()) as { ok: boolean; error?: string } & T;

  if (!data.ok) {
    const hints: Record<string, string> = {
      invalid_auth: 'token inválido ou revogado',
      not_in_channel: 'o bot não foi convidado para o canal — rode /invite no #celebrations',
      missing_scope: 'faltou um escopo no app do Slack',
      channel_not_found: 'canal não encontrado ou o bot não tem acesso',
    };
    const hint = data.error && hints[data.error] ? ` — ${hints[data.error]}` : '';
    throw new SlackError(`Slack: ${data.error ?? 'erro desconhecido'}${hint}`, data.error);
  }

  return data;
}

/* ------------------------------------------------------------------ *
 * PESSOAS E FOTOS
 * ------------------------------------------------------------------ */

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  deleted: boolean;
}

interface RawSlackUser {
  id: string;
  name: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: {
    real_name?: string;
    display_name?: string;
    email?: string;
    image_512?: string;
    image_192?: string;
    image_72?: string;
  };
}

/**
 * Lista todos os usuários do workspace com suas fotos.
 * Chamado uma vez por ciclo de atualização; o resultado vai para o cache,
 * então o dashboard nunca bate na API do Slack durante a renderização.
 */
export async function listUsers(): Promise<SlackUser[]> {
  const users: SlackUser[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { limit: '200' };
    if (cursor) params.cursor = cursor;

    const data = await call<{
      members: RawSlackUser[];
      response_metadata?: { next_cursor?: string };
    }>('users.list', params);

    for (const m of data.members) {
      const p = m.profile ?? {};
      users.push({
        id: m.id,
        name: m.name,
        realName: p.real_name ?? m.real_name ?? m.name,
        displayName: p.display_name || p.real_name || m.real_name || m.name,
        email: p.email ?? null,
        avatarUrl: p.image_512 ?? p.image_192 ?? p.image_72 ?? null,
        isBot: Boolean(m.is_bot),
        deleted: Boolean(m.deleted),
      });
    }

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return users.filter((u) => !u.isBot && !u.deleted);
}

/* ------------------------------------------------------------------ *
 * CASAMENTO DE NOMES → USUÁRIO DO SLACK
 *
 * As fontes chamam a mesma pessoa de jeitos diferentes: o HubSpot usa
 * "Guilherme Belotto", a planilha de tempo de casa usa "Gui Belotto", e a
 * mensagem do #celebrations também usa o apelido. Por isso o casamento é
 * feito em camadas, da mais confiável para a mais tolerante.
 * ------------------------------------------------------------------ */

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PersonMatch {
  slackUserId: string;
  avatarUrl: string | null;
  matchedBy: 'email' | 'nome-completo' | 'primeiro-ultimo' | 'display-name' | 'primeiro-nome';
  confidence: 'alta' | 'media' | 'baixa';
}

/**
 * Encontra o usuário do Slack correspondente a uma pessoa.
 * Devolve null quando não há correspondência segura — nesse caso o
 * dashboard usa o avatar de fallback com as iniciais, sem quebrar o layout.
 */
export function matchPerson(
  input: { name?: string | null; email?: string | null },
  users: SlackUser[]
): PersonMatch | null {
  // 1. E-mail — a chave mais confiável.
  if (input.email) {
    const email = input.email.toLowerCase().trim();
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit) {
      return { slackUserId: hit.id, avatarUrl: hit.avatarUrl, matchedBy: 'email', confidence: 'alta' };
    }
  }

  if (!input.name) return null;
  const target = normalizeName(input.name);
  if (!target) return null;

  // 2. Nome completo idêntico.
  const exact = users.find(
    (u) => normalizeName(u.realName) === target || normalizeName(u.displayName) === target
  );
  if (exact) {
    return { slackUserId: exact.id, avatarUrl: exact.avatarUrl, matchedBy: 'nome-completo', confidence: 'alta' };
  }

  const parts = target.split(' ').filter(Boolean);

  // 3. Primeiro + último nome (resolve "Guilherme Belotto" vs "Guilherme M. Belotto").
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const candidates = users.filter((u) => {
      const p = normalizeName(u.realName).split(' ').filter(Boolean);
      const d = normalizeName(u.displayName).split(' ').filter(Boolean);
      const match = (arr: string[]) =>
        arr.length >= 2 && arr[0] === first && arr[arr.length - 1] === last;
      return match(p) || match(d);
    });
    if (candidates.length === 1) {
      return {
        slackUserId: candidates[0].id,
        avatarUrl: candidates[0].avatarUrl,
        matchedBy: 'primeiro-ultimo',
        confidence: 'alta',
      };
    }
  }

  // 4. Apelido contido no nome real — resolve "Gui Belotto" → "Guilherme Belotto".
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const first = parts[0];
    const candidates = users.filter((u) => {
      const real = normalizeName(u.realName);
      const realParts = real.split(' ').filter(Boolean);
      return (
        realParts.includes(last) &&
        realParts.some((rp) => rp.startsWith(first) || first.startsWith(rp))
      );
    });
    if (candidates.length === 1) {
      return {
        slackUserId: candidates[0].id,
        avatarUrl: candidates[0].avatarUrl,
        matchedBy: 'display-name',
        confidence: 'media',
      };
    }
  }

  // 5. Primeiro nome único no workspace — último recurso, confiança baixa.
  if (parts.length === 1) {
    const candidates = users.filter((u) => {
      const real = normalizeName(u.realName).split(' ')[0];
      const disp = normalizeName(u.displayName).split(' ')[0];
      return real === parts[0] || disp === parts[0];
    });
    if (candidates.length === 1) {
      return {
        slackUserId: candidates[0].id,
        avatarUrl: candidates[0].avatarUrl,
        matchedBy: 'primeiro-nome',
        confidence: 'baixa',
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * MENSAGENS DO CANAL
 * ------------------------------------------------------------------ */

export interface SlackMessage {
  ts: string;
  text: string;
  user?: string;
  botId?: string;
  username?: string;
}

/** Lê o histórico recente de um canal. */
export async function readChannel(
  channelId: string,
  options: { limit?: number; oldest?: Date } = {}
): Promise<SlackMessage[]> {
  const params: Record<string, string> = {
    channel: channelId,
    limit: String(options.limit ?? 100),
  };
  if (options.oldest) {
    params.oldest = String(Math.floor(options.oldest.getTime() / 1000));
  }

  const data = await call<{
    messages: { ts: string; text?: string; user?: string; bot_id?: string; username?: string }[];
  }>('conversations.history', params);

  return data.messages.map((m) => ({
    ts: m.ts,
    text: m.text ?? '',
    user: m.user,
    botId: m.bot_id,
    username: m.username,
  }));
}

/** Verifica credencial e acesso ao canal — usada na página de diagnóstico. */
export async function healthCheck(): Promise<{ ok: true; team: string; botId: string }> {
  const data = await call<{ team: string; bot_id: string }>('auth.test');
  return { ok: true, team: data.team, botId: data.bot_id };
}
