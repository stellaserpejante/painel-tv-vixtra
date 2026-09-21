/**
 * Schema do banco (Postgres / Supabase).
 *
 * Três famílias de tabelas:
 *   1. CACHE      — o que os jobs de 2h gravam e o dashboard lê.
 *   2. HISTÓRICO  — snapshots imutáveis, para evolução e auditoria.
 *   3. CONTEÚDO   — o que a Stella edita no painel admin.
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  boolean,
  date,
  serial,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/* ================================================================== *
 * 1. CACHE
 * ================================================================== */

/**
 * Uma linha por fonte de dados. É o coração da regra "erro nunca zera dado":
 * o job só sobrescreve `payload` quando a busca dá certo. Se falhar, grava
 * apenas `status`, `error` e `last_attempt`, preservando o último payload
 * válido e o horário do último sucesso.
 */
export const dataCache = pgTable('data_cache', {
  /** Identificador da fonte. Ex.: 'hubspot.meta', 'slack.avatars', 'weather'. */
  source: text('source').primaryKey(),
  /** Último conjunto de dados válido. Nunca sobrescrito por um erro. */
  payload: jsonb('payload'),
  /** 'ok' | 'error' | 'stale' */
  status: text('status').notNull().default('ok'),
  /** Horário da última atualização BEM-SUCEDIDA — é este que o dashboard mostra. */
  lastSuccessfulUpdate: timestamp('last_successful_update', { withTimezone: true }),
  /** Horário da última tentativa, com ou sem sucesso. */
  lastAttempt: timestamp('last_attempt', { withTimezone: true }),
  /** Quando o job deve rodar de novo (informativo, para a página de diagnóstico). */
  nextUpdate: timestamp('next_update', { withTimezone: true }),
  /** Mensagem do último erro, limpa a cada sucesso. */
  error: text('error'),
  /** Quantas falhas consecutivas — alimenta o alerta na página de diagnóstico. */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  /** Duração da última execução, em milissegundos. */
  durationMs: integer('duration_ms'),
});

/* ================================================================== *
 * 2. HISTÓRICO
 * ================================================================== */

/**
 * Snapshot imutável de cada atualização bem-sucedida. Nunca sobrescrito.
 * Permite, no futuro, montar gráficos de evolução e auditar "o que o
 * dashboard mostrava às 10h do dia 21".
 */
export const metricSnapshots = pgTable(
  'metric_snapshots',
  {
    id: serial('id').primaryKey(),
    source: text('source').notNull(),
    /** Período a que o dado se refere. Ex.: '2026-09'. */
    periodKey: text('period_key').notNull(),
    payload: jsonb('payload').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('metric_snapshots_source_idx').on(t.source, t.capturedAt),
    index('metric_snapshots_period_idx').on(t.periodKey),
  ]
);

/** Log de execução dos jobs — alimenta a página de diagnóstico do admin. */
export const integrationLogs = pgTable(
  'integration_logs',
  {
    id: serial('id').primaryKey(),
    source: text('source').notNull(),
    /** 'info' | 'warn' | 'error' */
    level: text('level').notNull().default('info'),
    message: text('message').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('integration_logs_created_idx').on(t.createdAt)]
);

/* ================================================================== *
 * 3. CONTEÚDO EDITÁVEL (painel admin)
 * ================================================================== */

/**
 * Meta mensal — o único número que a Stella digita todo mês.
 * O dashboard sempre busca a linha do mês vigente; se não existir,
 * mostra um aviso em vez de inventar um valor.
 */
export const monthlyGoals = pgTable(
  'monthly_goals',
  {
    id: serial('id').primaryKey(),
    year: integer('year').notNull(),
    /** 1 = Janeiro ... 12 = Dezembro */
    month: integer('month').notNull(),
    /** Valor da meta em reais. numeric para não perder centavos. */
    goalAmount: numeric('goal_amount', { precision: 18, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [uniqueIndex('monthly_goals_year_month_idx').on(t.year, t.month)]
);

/**
 * Cadastro unificado de pessoas. Junta as duas planilhas (aniversários e
 * tempo de casa) e guarda o vínculo com o Slack, que é o que permite puxar
 * a foto. O e-mail é a chave de casamento preferida; o nome é o fallback.
 */
export const people = pgTable(
  'people',
  {
    id: serial('id').primaryKey(),
    fullName: text('full_name').notNull(),
    /** Nome como aparece no HubSpot/Slack, quando diferente do nome completo. */
    displayName: text('display_name'),
    email: text('email'),
    slackUserId: text('slack_user_id'),
    /** URL da foto, preenchida pelo job do Slack. Cacheada para não bater na API a cada render. */
    avatarUrl: text('avatar_url'),
    /** Data de nascimento — só dia e mês importam para o slide. */
    birthday: date('birthday'),
    /** Data de entrada na empresa — base do aniversário de casa. */
    hiredAt: date('hired_at'),
    department: text('department'),
    role: text('role'),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('people_email_idx').on(t.email),
    index('people_slack_idx').on(t.slackUserId),
  ]
);

/**
 * Ativações detectadas no #celebrations.
 * `slackMessageTs` é único — é ele que garante a regra de não duplicar,
 * mesmo que o job processe a mesma mensagem várias vezes.
 */
export const activations = pgTable(
  'activations',
  {
    id: serial('id').primaryKey(),
    slackMessageTs: text('slack_message_ts').notNull(),
    slackChannelId: text('slack_channel_id').notNull(),
    clientName: text('client_name').notNull(),
    /** Primeira pessoa citada na mensagem — o closer. */
    closerName: text('closer_name'),
    closerSlackId: text('closer_slack_id'),
    closerAvatarUrl: text('closer_avatar_url'),
    /** Segunda pessoa citada — farmer/BDR. A mensagem do HubSpot cita duas. */
    partnerName: text('partner_name'),
    partnerSlackId: text('partner_slack_id'),
    partnerAvatarUrl: text('partner_avatar_url'),
    /** Pode vir vazio na mensagem do Slack — por isso nullable. */
    approvedLimit: numeric('approved_limit', { precision: 18, scale: 2 }),
    activatedValue: numeric('activated_value', { precision: 18, scale: 2 }),
    activationDate: date('activation_date'),
    /** Deixa de aparecer no dashboard após esta data (data da ativação + 5 dias). */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Texto original, preservado para auditoria e reprocessamento. */
    rawText: text('raw_text'),
    /** ID do negócio no HubSpot, quando o cruzamento for bem-sucedido. */
    hubspotDealId: text('hubspot_deal_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('activations_slack_ts_idx').on(t.slackMessageTs),
    index('activations_expires_idx').on(t.expiresAt),
  ]
);

/**
 * Novas contratações. O slide some sozinho 7 dias após a data de entrada,
 * mas o registro permanece no banco — histórico não se apaga.
 */
export const newHires = pgTable('new_hires', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role'),
  quote: text('quote'),
  slackUserId: text('slack_user_id'),
  avatarUrl: text('avatar_url'),
  joinedAt: date('joined_at').notNull(),
  /** Permite esconder manualmente antes dos 7 dias, se necessário. */
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Avisos e novidades da empresa, com janela de exibição opcional. */
export const companyNews = pgTable('company_news', {
  id: serial('id').primaryKey(),
  /** Classe visual do selo: produto | imprensa | parceria | credito | aviso */
  tag: text('tag').notNull().default('aviso'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  /** Null = fica no ar até ser desativado manualmente. */
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Evolução da carteira — imagem enviada manualmente pela Stella.
 * Guarda o histórico de envios; o dashboard usa sempre o mais recente.
 */
export const walletCharts = pgTable('wallet_charts', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  caption: text('caption'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: text('uploaded_by'),
  active: boolean('active').notNull().default(true),
});
