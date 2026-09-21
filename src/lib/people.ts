import 'server-only';
import { sql, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { listUsers, matchPerson, type SlackUser } from './slack/client';
import { getCurrentMonth, getCurrentYear } from './time';

/**
 * Aniversariantes do mês e aniversários de casa — itens 17 e 18.
 *
 * Os dois slides leem a MESMA tabela `people`, que consolida as duas
 * planilhas da Vixtra. O filtro é sempre pelo mês vigente, calculado pela
 * camada central de datas: quando virar outubro, os nomes trocam sozinhos.
 */

export interface BirthdayPerson {
  id: number;
  name: string;
  /** "05/08" — dia e mês, como no design original. */
  date: string;
  day: number;
  avatarUrl: string | null;
  slackUserId: string | null;
  role: string | null;
  department: string | null;
}

export interface AnniversaryPerson extends BirthdayPerson {
  years: number;
}

/** Aniversariantes do mês vigente, ordenados por dia. */
export async function getBirthdaysOfMonth(): Promise<BirthdayPerson[]> {
  const month = getCurrentMonth();

  const rows = await db
    .select()
    .from(people)
    .where(
      sql`${people.birthday} IS NOT NULL
          AND EXTRACT(MONTH FROM ${people.birthday}) = ${month}
          AND ${people.active} = true`
    );

  return rows
    .map((r) => {
      const day = Number(String(r.birthday).slice(8, 10));
      return {
        id: r.id,
        name: r.displayName || r.fullName,
        date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
        day,
        avatarUrl: r.avatarUrl,
        slackUserId: r.slackUserId,
        role: r.role,
        department: r.department,
      };
    })
    .sort((a, b) => a.day - b.day);
}

/**
 * Aniversários de casa do mês vigente.
 * Quem entrou neste mesmo mês do ano corrente ainda não completou um ano,
 * então fica de fora — "0 anos de casa" não é aniversário.
 */
export async function getWorkAnniversariesOfMonth(): Promise<AnniversaryPerson[]> {
  const month = getCurrentMonth();
  const year = getCurrentYear();

  const rows = await db
    .select()
    .from(people)
    .where(
      sql`${people.hiredAt} IS NOT NULL
          AND EXTRACT(MONTH FROM ${people.hiredAt}) = ${month}
          AND ${people.active} = true`
    );

  return rows
    .map((r) => {
      const hired = String(r.hiredAt);
      const day = Number(hired.slice(8, 10));
      const years = year - Number(hired.slice(0, 4));
      return {
        id: r.id,
        name: r.displayName || r.fullName,
        date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
        day,
        years,
        avatarUrl: r.avatarUrl,
        slackUserId: r.slackUserId,
        role: r.role,
        department: r.department,
      };
    })
    .filter((p) => p.years >= 1)
    .sort((a, b) => a.day - b.day);
}

/* ------------------------------------------------------------------ *
 * SINCRONIZAÇÃO DAS FOTOS DO SLACK
 * ------------------------------------------------------------------ */

export interface AvatarSyncResult {
  total: number;
  casadas: number;
  semCorrespondencia: string[];
  porConfianca: Record<string, number>;
}

/**
 * Percorre o cadastro de pessoas e associa cada uma ao seu usuário do Slack,
 * gravando a foto. Roda junto com os jobs de 2h.
 *
 * Quem não casar fica listado em `semCorrespondencia` para aparecer no
 * painel admin — é lá que a Stella aponta manualmente o usuário do Slack
 * de gente que só tem apelido na planilha, como "Dri", "Beto" e "Toninho".
 */
export async function syncAvatars(): Promise<AvatarSyncResult> {
  const users: SlackUser[] = await listUsers();
  const rows = await db.select().from(people);

  const semCorrespondencia: string[] = [];
  const porConfianca: Record<string, number> = {};
  let casadas = 0;

  for (const row of rows) {
    // Quem já teve o Slack apontado à mão no admin só tem a foto atualizada.
    if (row.slackUserId) {
      const known = users.find((u) => u.id === row.slackUserId);
      if (known) {
        await db
          .update(people)
          .set({ avatarUrl: known.avatarUrl, updatedAt: new Date() })
          .where(sql`${people.id} = ${row.id}`);
        casadas += 1;
        porConfianca['manual'] = (porConfianca['manual'] ?? 0) + 1;
        continue;
      }
    }

    const match = matchPerson({ name: row.displayName || row.fullName, email: row.email }, users);

    if (match) {
      await db
        .update(people)
        .set({
          slackUserId: match.slackUserId,
          avatarUrl: match.avatarUrl,
          updatedAt: new Date(),
        })
        .where(sql`${people.id} = ${row.id}`);
      casadas += 1;
      porConfianca[match.confidence] = (porConfianca[match.confidence] ?? 0) + 1;
    } else {
      semCorrespondencia.push(row.fullName);
    }
  }

  return { total: rows.length, casadas, semCorrespondencia, porConfianca };
}

/** Pessoas ainda sem foto — alimenta a lista de pendências do admin. */
export async function getPeopleWithoutAvatar() {
  return db.select().from(people).where(sql`${people.avatarUrl} IS NULL AND ${people.active} = true`);
}

export { isNotNull };
