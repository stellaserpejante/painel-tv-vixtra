import TV from '@/components/TV';
import { buildDashboardPayload } from '@/lib/dashboard';
import type { DashboardPayload } from '@/lib/types';
import { getCurrentPeriod } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * A TV.
 *
 * Renderiza no servidor com os dados do cache, então a tela já aparece
 * preenchida no primeiro frame — importante para um painel que fica ligado
 * numa televisão e pode reiniciar sozinho.
 */
export default async function Home() {
  let data: DashboardPayload;

  try {
    data = await buildDashboardPayload();
  } catch {
    // Se o banco ainda não foi migrado ou está fora do ar, a TV mostra um
    // estado neutro em vez de uma tela de erro do Next.
    const period = getCurrentPeriod();
    data = {
      slides: [],
      monthName: period.monthName,
      year: period.year,
      lastUpdate: null,
      degraded: ['banco de dados'],
      generatedAt: new Date().toISOString(),
    };
  }

  return <TV initialData={data} />;
}
