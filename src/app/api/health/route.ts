import { NextResponse } from 'next/server';
import { readAllCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/** Estado das integrações, em JSON. A versão visual fica em /admin/status. */
export async function GET() {
  const rows = await readAllCache();
  return NextResponse.json({
    ok: rows.every((r) => r.status === 'ok'),
    fontes: rows.map((r) => ({
      fonte: r.source,
      status: r.status,
      ultimaAtualizacao: r.lastSuccessfulUpdate,
      ultimaTentativa: r.lastAttempt,
      falhasConsecutivas: r.consecutiveFailures,
      erro: r.error,
    })),
  });
}
