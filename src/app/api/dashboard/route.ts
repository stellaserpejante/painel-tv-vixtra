import { NextResponse } from 'next/server';
import { buildDashboardPayload } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Payload que a TV consome. Lê só o cache — nunca chama API externa. */
export async function GET() {
  try {
    const payload = await buildDashboardPayload();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
