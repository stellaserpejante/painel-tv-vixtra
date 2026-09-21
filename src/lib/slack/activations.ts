import 'server-only';
import { eq, gt, desc } from 'drizzle-orm';
import { db } from '@/db';
import { activations } from '@/db/schema';
import { readChannel, listUsers, matchPerson, type SlackUser } from './client';
import { isActivationMessage, parseActivation, slackTsToDate, ACTIVATION_TTL_DAYS } from './parse';
import { getEnv } from '@/lib/env';

/**
 * Detecção automática de novas ativações no #celebrations.
 *
 * O formato da mensagem postada pelo HubSpot foi confirmado lendo o histórico
 * real do canal:
 *
 *   OLHA A ATIVAÇÃO AÍ!!! :bell::tada:
 *
 *   Toca o sino!!! Parabéns pela ativação, Kaio Oliveira e Julia Porto!!!
 *
 *   Negócio: EGGERDING BRASIL MINERAIS INDUSTRIAIS LTDA
 *   Limite aprovado ativado: R$ 500.000
 *   Valor da ativação: R$ 472.534,72
 *   Data da ativação: 15/09/2026
 *
 * Dois detalhes observados no histórico e tratados aqui: a mensagem cita
 * DUAS pessoas (closer e farmer/BDR), e "Limite aprovado ativado" às vezes
 * vem vazio.
 */

export interface SyncResult {
  lidas: number;
  novas: number;
  jaExistentes: number;
  ativas: number;
}

/**
 * Lê o canal, identifica ativações e grava as novas.
 *
 * A regra de não duplicar é garantida pelo banco: `slack_message_ts` tem
 * índice único e a inserção usa onConflictDoNothing. Mesmo que o job rode
 * duas vezes na mesma janela, ou que a mensagem seja editada, nunca nasce
 * um slide repetido.
 */
export async function syncActivations(): Promise<SyncResult> {
  const env = getEnv();

  // Janela de leitura: o dobro do TTL, para pegar mensagens antigas na
  // primeira execução sem varrer o canal inteiro a cada ciclo.
  const oldest = new Date(Date.now() - ACTIVATION_TTL_DAYS * 2 * 24 * 60 * 60 * 1000);

  const [messages, users] = await Promise.all([
    readChannel(env.SLACK_CELEBRATIONS_CHANNEL, { limit: 200, oldest }),
    listUsers(),
  ]);

  let novas = 0;
  let jaExistentes = 0;
  const candidatas = messages.filter((m) => isActivationMessage(m.text));

  for (const message of candidatas) {
    const parsed = parseActivation(message.text);
    if (!parsed) continue;

    const postedAt = slackTsToDate(message.ts);
    // A expiração conta a partir da data da ativação quando ela existe;
    // senão, a partir da postagem no Slack.
    const base = parsed.activationDate ? new Date(`${parsed.activationDate}T12:00:00-03:00`) : postedAt;
    const expiresAt = new Date(base.getTime() + ACTIVATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const closer = parsed.closerName ? matchPerson({ name: parsed.closerName }, users) : null;
    const partner = parsed.partnerName ? matchPerson({ name: parsed.partnerName }, users) : null;

    const inserted = await db
      .insert(activations)
      .values({
        slackMessageTs: message.ts,
        slackChannelId: env.SLACK_CELEBRATIONS_CHANNEL,
        clientName: parsed.clientName,
        closerName: parsed.closerName,
        closerSlackId: closer?.slackUserId ?? null,
        closerAvatarUrl: closer?.avatarUrl ?? null,
        partnerName: parsed.partnerName,
        partnerSlackId: partner?.slackUserId ?? null,
        partnerAvatarUrl: partner?.avatarUrl ?? null,
        approvedLimit: parsed.approvedLimit?.toFixed(2) ?? null,
        activatedValue: parsed.activatedValue?.toFixed(2) ?? null,
        activationDate: parsed.activationDate,
        expiresAt,
        rawText: message.text,
      })
      .onConflictDoNothing({ target: activations.slackMessageTs })
      .returning({ id: activations.id });

    if (inserted.length > 0) novas += 1;
    else jaExistentes += 1;
  }

  const ativas = await getActiveActivations();

  return {
    lidas: messages.length,
    novas,
    jaExistentes,
    ativas: ativas.length,
  };
}

/** Ativações ainda dentro dos 5 dias — o que o dashboard deve exibir. */
export async function getActiveActivations() {
  return db
    .select()
    .from(activations)
    .where(gt(activations.expiresAt, new Date()))
    .orderBy(desc(activations.createdAt));
}

/** Reprocessa uma mensagem específica (usado pelo admin em caso de correção). */
export async function deleteActivationByTs(ts: string): Promise<void> {
  await db.delete(activations).where(eq(activations.slackMessageTs, ts));
}

export type { SlackUser };

export * from './parse';
