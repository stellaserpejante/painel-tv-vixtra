import 'server-only';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { people, monthlyGoals, companyNews } from '@/db/schema';
import seed from '@/data/people-seed.json';

/**
 * Preparação do banco: migrações e carga inicial.
 *
 * Roda sozinha na primeira execução do job, para que ninguém precise abrir
 * terminal nenhum para colocar o sistema no ar. É idempotente: pode rodar
 * quantas vezes for, que não duplica nada.
 */

interface SeedPerson {
  fullName: string;
  birthday: string | null;
  role: string | null;
  department: string | null;
  active: boolean;
  personType: string | null;
  hiredAt: string | null;
}

/** Aplica os arquivos .sql da pasta drizzle que ainda não foram aplicados. */
export async function runMigrations(): Promise<{ aplicadas: string[]; jaAplicadas: number }> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = join(process.cwd(), 'drizzle');
  const arquivos = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const existentes = await db.execute<{ name: string }>(sql`SELECT name FROM __migrations`);
  const aplicadasAntes = new Set(
    (existentes as unknown as { name: string }[]).map((r) => r.name)
  );

  const aplicadas: string[] = [];

  for (const arquivo of arquivos) {
    if (aplicadasAntes.has(arquivo)) continue;

    const conteudo = readFileSync(join(dir, arquivo), 'utf8');
    // O drizzle-kit separa os comandos com este marcador.
    const comandos = conteudo
      .split('--> statement-breakpoint')
      .map((c) => c.trim())
      .filter(Boolean);

    for (const comando of comandos) {
      await db.execute(sql.raw(comando));
    }

    await db.execute(sql`INSERT INTO __migrations (name) VALUES (${arquivo})`);
    aplicadas.push(arquivo);
  }

  return { aplicadas, jaAplicadas: aplicadasAntes.size };
}

/**
 * Carga inicial das pessoas, a partir das duas planilhas da Vixtra já
 * consolidadas. Usa o nome completo como chave: rodar de novo atualiza os
 * dados em vez de criar duplicatas, e nunca sobrescreve o vínculo com o
 * Slack que tenha sido ajustado à mão no admin.
 */
export async function seedPeople(): Promise<{ inseridas: number; atualizadas: number }> {
  const lista = seed as SeedPerson[];
  let inseridas = 0;
  let atualizadas = 0;

  for (const p of lista) {
    const existente = await db
      .select({ id: people.id })
      .from(people)
      .where(sql`lower(${people.fullName}) = lower(${p.fullName})`)
      .limit(1);

    if (existente.length > 0) {
      await db
        .update(people)
        .set({
          birthday: p.birthday,
          hiredAt: p.hiredAt,
          role: p.role,
          department: p.department,
          active: p.active,
          updatedAt: new Date(),
        })
        .where(sql`${people.id} = ${existente[0].id}`);
      atualizadas += 1;
    } else {
      await db.insert(people).values({
        fullName: p.fullName,
        birthday: p.birthday,
        hiredAt: p.hiredAt,
        role: p.role,
        department: p.department,
        active: p.active,
      });
      inseridas += 1;
    }
  }

  return { inseridas, atualizadas };
}

/**
 * Conteúdo inicial: a meta de setembro/2026 e o aviso das salas de reunião
 * que a Stella pediu para manter no ar (item 21 da especificação).
 */
export async function seedContent(): Promise<void> {
  await db
    .insert(monthlyGoals)
    .values({ year: 2026, month: 9, goalAmount: '13000000.00', updatedBy: 'carga inicial' })
    .onConflictDoNothing();

  const existentes = await db.select({ id: companyNews.id }).from(companyNews).limit(1);
  if (existentes.length === 0) {
    await db.insert(companyNews).values({
      tag: 'aviso',
      title: 'Uso das salas Itajaí, Shanghai e Santos',
      body: 'Priorizadas para reuniões com 2+ pessoas. Reserva pela plataforma Control Room ou adicionando a sala desejada no invite da reunião.',
      sortOrder: 0,
    });
  }
}

export async function setupDatabase() {
  const migracoes = await runMigrations();
  const pessoas = await seedPeople();
  await seedContent();
  return { migracoes, pessoas };
}
