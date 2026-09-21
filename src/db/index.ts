import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

/**
 * Conexão única reaproveitada entre invocações (a Vercel mantém o processo
 * vivo entre requisições na mesma instância). `prepare: false` é exigido pelo
 * pooler do Supabase em modo transaction.
 */
const globalForDb = globalThis as unknown as {
  __vixtraSql?: ReturnType<typeof postgres>;
};

function getClient() {
  if (!globalForDb.__vixtraSql) {
    globalForDb.__vixtraSql = postgres(getEnv().DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return globalForDb.__vixtraSql;
}

export const db = drizzle(getClient(), { schema });
export { schema };
