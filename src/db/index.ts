import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

/**
 * Conexão preguiçosa.
 *
 * A conexão só é aberta na primeira consulta de verdade, nunca no momento em
 * que o módulo é importado. Isso é essencial porque o build do Next.js carrega
 * os módulos das rotas para analisá-las: se abríssemos a conexão aqui, o build
 * exigiria DATABASE_URL e falharia em qualquer máquina sem o banco configurado.
 *
 * `prepare: false` é exigido pelo pooler do Supabase em modo transaction.
 */
const globalForDb = globalThis as unknown as {
  __vixtraSql?: ReturnType<typeof postgres>;
  __vixtraDb?: PostgresJsDatabase<typeof schema>;
};

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.__vixtraDb) {
    globalForDb.__vixtraSql ??= postgres(getEnv().DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
    globalForDb.__vixtraDb = drizzle(globalForDb.__vixtraSql, { schema });
  }
  return globalForDb.__vixtraDb;
}

/**
 * Proxy que encaminha cada chamada para a instância real, criada sob demanda.
 * Do ponto de vista de quem usa, é o `db` do Drizzle normalmente.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
