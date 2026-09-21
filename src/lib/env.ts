/**
 * Validação das variáveis de ambiente.
 *
 * SEGURANÇA: este módulo só pode ser importado por código de servidor.
 * Nenhuma destas variáveis tem o prefixo NEXT_PUBLIC_, então o Next.js
 * jamais as inclui no bundle enviado ao navegador. Se alguém tentar
 * importar este arquivo em um componente client, o build quebra — é
 * proposital.
 */

import 'server-only';
import { z } from 'zod';

const schema = z.object({
  /** Postgres (Supabase). Ex.: postgresql://user:senha@host:5432/postgres */
  DATABASE_URL: z.string().url(),

  /** Private App token do HubSpot. Começa com pat-na1- */
  HUBSPOT_TOKEN: z.string().min(20),

  /** Bot token do Slack. Começa com xoxb- */
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-'),

  /** ID do canal #celebrations. Confirmado via API: C07B4GWEJUD */
  SLACK_CELEBRATIONS_CHANNEL: z.string().default('C07B4GWEJUD'),

  /** Segredo que protege o endpoint /api/cron/refresh contra chamadas externas. */
  CRON_SECRET: z.string().min(16),

  /** Senha de acesso ao painel administrativo. */
  ADMIN_PASSWORD: z.string().min(8),

  /** Chave usada para assinar o cookie de sessão do admin. */
  ADMIN_SESSION_SECRET: z.string().min(32),

  /** Latitude/longitude de São Paulo para o Open-Meteo. */
  WEATHER_LAT: z.coerce.number().default(-23.5505),
  WEATHER_LON: z.coerce.number().default(-46.6333),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n  ${missing}\n\n` +
        'Confira o arquivo .env.example e as variáveis configuradas na Vercel.'
    );
  }
  cached = parsed.data;
  return cached;
}
