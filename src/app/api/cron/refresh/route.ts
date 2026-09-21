import { NextResponse, type NextRequest } from 'next/server';
import { runAllJobs } from '@/lib/jobs';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Endpoint disparado a cada 2 horas pelo agendador (GitHub Actions).
 *
 * Protegido por CRON_SECRET: sem o cabeçalho correto, responde 401. Isso
 * impede que alguém de fora force atualizações e consuma a cota das APIs.
 */
async function handle(request: NextRequest) {
  const env = getEnv();
  const auth = request.headers.get('authorization');
  const secret = request.nextUrl.searchParams.get('secret');

  const autorizado = auth === `Bearer ${env.CRON_SECRET}` || secret === env.CRON_SECRET;
  if (!autorizado) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const report = await runAllJobs();
  return NextResponse.json(report, {
    status: report.falhas > 0 ? 207 : 200,
  });
}

export const GET = handle;
export const POST = handle;
