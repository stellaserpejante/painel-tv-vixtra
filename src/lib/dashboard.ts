import 'server-only';
import { and, eq, gt, lte, or, isNull, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { monthlyGoals, newHires, companyNews, walletCharts } from '@/db/schema';
import { readAllCache, SOURCES, type CacheEntry } from './cache';
import { getCurrentPeriod, formatTime, formatDate } from './time';
import { getBirthdaysOfMonth, getWorkAnniversariesOfMonth } from './people';
import { getActiveActivations } from './slack/activations';
import type {
  DashboardPayload,
  Slide,
  RankingSeller,
} from './types';
import type { AtivacoesDoMes, PipelineClosing, PipelineFarming } from './hubspot/metrics';
import type { WeatherData } from './weather';
import type { TrafficData } from './traffic';

/**
 * Monta o payload que a TV consome.
 *
 * Princípio de projeto: esta função NUNCA vai ao HubSpot, ao Slack ou à CET.
 * Ela só lê o que os jobs de 2 em 2 horas deixaram no banco. É isso que faz o
 * dashboard abrir rápido e nunca depender de uma API externa estar de pé no
 * exato instante em que a TV renderiza.
 */

const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Paleta de fallback dos avatares, na ordem do design original. */
const CORES = ['var(--gold)', 'var(--sky)', 'var(--mint)', 'var(--coral)', '#9B8CFF'];
const cor = (i: number) => CORES[i % CORES.length];

export async function buildDashboardPayload(): Promise<DashboardPayload> {
  const period = getCurrentPeriod();

  const [cacheRows, goalRow, birthdays, anniversaries, activations, hires, news, wallet] =
    await Promise.all([
      readAllCache(),
      db
        .select()
        .from(monthlyGoals)
        .where(and(eq(monthlyGoals.year, period.year), eq(monthlyGoals.month, period.month)))
        .limit(1),
      getBirthdaysOfMonth(),
      getWorkAnniversariesOfMonth(),
      getActiveActivations(),
      db
        .select()
        .from(newHires)
        .where(
          and(
            eq(newHires.active, true),
            // Regra dos 7 dias: some sozinho, sem apagar o registro.
            sql`${newHires.joinedAt} > (CURRENT_DATE - INTERVAL '7 days')`
          )
        )
        .orderBy(desc(newHires.joinedAt)),
      db
        .select()
        .from(companyNews)
        .where(
          and(
            eq(companyNews.active, true),
            or(isNull(companyNews.startsAt), lte(companyNews.startsAt, new Date())),
            or(isNull(companyNews.endsAt), gt(companyNews.endsAt, new Date()))
          )
        )
        .orderBy(companyNews.sortOrder),
      db
        .select()
        .from(walletCharts)
        .where(eq(walletCharts.active, true))
        .orderBy(desc(walletCharts.uploadedAt))
        .limit(1),
    ]);

  const cache = new Map(cacheRows.map((c) => [c.source, c]));
  const get = <T>(source: string) => (cache.get(source)?.payload ?? null) as T | null;
  const stampOf = (source: string) => {
    const entry = cache.get(source);
    return entry?.lastSuccessfulUpdate ? formatTime(entry.lastSuccessfulUpdate) : null;
  };
  const isStale = (source: string) => cache.get(source)?.status === 'error';

  const ativacoes = get<AtivacoesDoMes>(SOURCES.META);
  const closing = get<PipelineClosing>(SOURCES.PIPELINE_CLOSING);
  const farming = get<PipelineFarming>(SOURCES.PIPELINE_FARMING);
  const hunting = get<{ pessoas: { nome: string; quantidade: number; pontuacao: number }[] }>(
    SOURCES.PARCERIAS_HUNTING
  );
  const parceriasFarming = get<{ pessoas: { nome: string; quantidade: number; pontuacao: number }[] }>(
    SOURCES.PARCERIAS_FARMING
  );
  const retargeting = get<{ quantidade: number; pessoa: string }>(SOURCES.RETARGETING);
  const frete = get<{ quantidade: number }>(SOURCES.FRETE);
  const cambio = get<{ quantidade: number; pessoas: string[] }>(SOURCES.CAMBIO);
  const weather = get<WeatherData>(SOURCES.CLIMA);
  const traffic = get<TrafficData>(SOURCES.TRANSITO);
  const avatarMap = get<Record<string, string>>(SOURCES.AVATARES) ?? {};

  const avatarDe = (nome?: string | null) =>
    nome ? (avatarMap[nome.toLowerCase().trim()] ?? null) : null;

  const slides: Slide[] = [];

  /* ---- 1. Progresso da meta ---- */
  slides.push({
    type: 'goal',
    duration: 20000,
    eyebrow: 'Progresso da meta',
    showMonth: true,
    updatedAt: stampOf(SOURCES.META),
    stale: isStale(SOURCES.META),
    metaValor: goalRow[0] ? Number(goalRow[0].goalAmount) : null,
    atual: ativacoes?.volumeAtivado ?? 0,
    clientesAtivados: ativacoes?.clientesAtivados ?? 0,
    clientesLista: (ativacoes?.clientes ?? []).map((c) => c.nome),
    creditoAprovado: ativacoes?.creditoAprovado ?? 0,
  });

  /* ---- 2. Pipeline de closing ---- */
  if (closing) {
    slides.push({
      type: 'funnel',
      duration: 20000,
      eyebrow: 'Pipeline de closing',
      showMonth: true,
      updatedAt: stampOf(SOURCES.PIPELINE_CLOSING),
      stale: isStale(SOURCES.PIPELINE_CLOSING),
      subtitle: 'Proposta em aprovação · Abertura de conta · Aguardando ativação',
      quenteTotal: closing.quente,
      mornoTotal: closing.morno,
      top3: closing.top3.map((d) => ({
        name: d.nome,
        value: d.valor,
        temp: d.temperatura,
        owner: d.ownerNome,
        ownerAvatar: avatarDe(d.ownerNome),
      })),
    });
  }

  /* ---- 3. Pipeline farming ---- */
  if (farming && farming.farmers.length > 0) {
    slides.push({
      type: 'farming',
      duration: 18000,
      eyebrow: 'Pipeline de farming',
      updatedAt: stampOf(SOURCES.PIPELINE_FARMING),
      stale: isStale(SOURCES.PIPELINE_FARMING),
      farmers: farming.farmers.map((f) => ({
        name: f.nome,
        avatarUrl: avatarDe(f.nome),
        novaOperacao: f.novaOperacao,
        renovacao: f.renovacao,
        total: f.total,
      })),
      totalNovaOperacao: farming.totalNovaOperacao,
      totalRenovacao: farming.totalRenovacao,
    });
  }

  /* ---- 4. Evolução da carteira ---- */
  slides.push({
    type: 'wallet',
    duration: 18000,
    eyebrow: 'Evolução da carteira · Últimos 30 dias',
    imageUrl: wallet[0]?.imageUrl ?? null,
    caption: wallet[0]
      ? `${wallet[0].caption ?? 'Fonte: CR2'} · enviado em ${formatDate(wallet[0].uploadedAt)}`
      : null,
    updatedAt: wallet[0] ? formatTime(wallet[0].uploadedAt) : null,
  });

  /* ---- 5. Desempenho dos vendedores (parte 1) ---- */
  const closers: RankingSeller[] = (ativacoes?.porCloser ?? []).map((c, i) => ({
    name: c.nome,
    avatarUrl: avatarDe(c.nome),
    color: cor(i),
    value: c.volume,
    deals: c.negocios,
  }));

  const huntingSellers: RankingSeller[] = (hunting?.pessoas ?? []).map((p, i) => ({
    name: p.nome,
    avatarUrl: avatarDe(p.nome),
    color: cor(i),
    oportunidades: p.quantidade,
  }));

  const farmingSellers: RankingSeller[] = (parceriasFarming?.pessoas ?? []).map((p, i) => ({
    name: p.nome,
    avatarUrl: avatarDe(p.nome),
    color: cor(i),
    oportunidades: p.pontuacao,
    metricLabel: 'pontos',
  }));

  slides.push({
    type: 'ranking',
    duration: 18000,
    eyebrow: 'Desempenho dos vendedores',
    showMonth: true,
    updatedAt: stampOf(SOURCES.META),
    divisions: [
      { name: 'Closing', sellers: closers },
      { name: 'Parcerias · Hunting', sellers: huntingSellers },
      { name: 'Parcerias · Farming', sellers: farmingSellers },
    ],
  });

  /* ---- 6. Desempenho dos vendedores (parte 2) ---- */
  slides.push({
    type: 'ranking',
    duration: 18000,
    eyebrow: 'Desempenho dos vendedores',
    showMonth: true,
    updatedAt: stampOf(SOURCES.RETARGETING),
    divisions: [
      {
        name: 'Onboarding e Retargeting',
        sellers: retargeting
          ? [
              {
                name: retargeting.pessoa,
                avatarUrl: avatarDe(retargeting.pessoa),
                color: cor(2),
                oportunidades: retargeting.quantidade,
              },
            ]
          : [],
      },
      {
        name: 'Frete',
        sellers: frete
          ? [
              {
                name: 'Luciana Turisco',
                avatarUrl: avatarDe('Luciana Turisco'),
                color: cor(1),
                oportunidades: frete.quantidade,
                metricLabel: 'embarques confirmados',
              },
            ]
          : [],
      },
      {
        name: 'Câmbio',
        sellers: cambio
          ? [
              {
                name: cambio.pessoas.join(' & '),
                oportunidades: cambio.quantidade,
                metricLabel: 'solicitações',
                people: cambio.pessoas.map((nome, i) => ({
                  id: `cambio-${i}`,
                  name: nome,
                  avatarUrl: avatarDe(nome),
                  color: cor(i + 3),
                })),
              },
            ]
          : [],
      },
    ],
  });

  /* ---- 7. Ativações recentes (5 dias) ---- */
  for (const a of activations) {
    slides.push({
      type: 'celebration',
      duration: 16000,
      eyebrow: 'Nova ativação',
      who: a.closerName ?? 'Time comercial',
      whoAvatar: a.closerAvatarUrl,
      partner: a.partnerName,
      partnerAvatar: a.partnerAvatarUrl,
      client: a.clientName,
      amount: a.activatedValue ? BRL(Number(a.activatedValue)) : '—',
      approvedLimit: a.approvedLimit ? BRL(Number(a.approvedLimit)) : null,
      activationDate: a.activationDate
        ? new Date(`${a.activationDate}T12:00:00-03:00`).toLocaleDateString('pt-BR')
        : null,
      updatedAt: stampOf(SOURCES.ATIVACOES),
    });
  }

  /* ---- 8. Aniversariantes ---- */
  slides.push({
    type: 'birthdays',
    duration: 16000,
    eyebrow: 'Aniversariantes do mês',
    showMonth: true,
    people: birthdays.map((p, i) => ({
      name: p.name,
      date: p.date,
      avatarUrl: p.avatarUrl,
      color: cor(i),
    })),
  });

  /* ---- 9. Aniversários de casa ---- */
  slides.push({
    type: 'companyAnniv',
    duration: 18000,
    eyebrow: 'Aniversários de casa',
    showMonth: true,
    people: anniversaries.map((p, i) => ({
      name: p.name,
      date: p.date,
      years: p.years,
      avatarUrl: p.avatarUrl,
      color: cor(i),
    })),
  });

  /* ---- 10. Novas contratações (7 dias) ---- */
  for (const h of hires) {
    slides.push({
      type: 'newhire',
      duration: 16000,
      eyebrow: 'Novo talento no time',
      name: h.name,
      role: h.role,
      quote: h.quote,
      joined: `Chegou em ${new Date(`${h.joinedAt}T12:00:00-03:00`).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })}`,
      avatarUrl: h.avatarUrl,
    });
  }

  /* ---- 11. Novidades da empresa ---- */
  if (news.length > 0) {
    slides.push({
      type: 'news',
      duration: 16000,
      eyebrow: 'Novidades da empresa',
      items: news.map((n) => ({ tag: n.tag, title: n.title, text: n.body })),
    });
  }

  /* ---- 12. Clima e trânsito ---- */
  if (weather || traffic) {
    slides.push({
      type: 'weather',
      duration: 18000,
      eyebrow: 'Clima e trânsito',
      updatedAt: stampOf(SOURCES.CLIMA),
      stale: isStale(SOURCES.CLIMA) || isStale(SOURCES.TRANSITO),
      city: weather?.city ?? 'São Paulo, SP',
      temp: weather ? `${weather.temp}°C` : '—',
      feelsLike: weather ? `${weather.feelsLike}°` : '—',
      cond: weather?.condition ?? '—',
      icon: weather?.icon ?? '⛅',
      tempMax: weather ? `${weather.tempMax}°` : '—',
      tempMin: weather ? `${weather.tempMin}°` : '—',
      rainProbability: weather?.rainProbability ?? 0,
      rodizio: traffic?.rodizio ?? '—',
      traffic: traffic?.regions ?? [],
      trafficUpdatedAt: stampOf(SOURCES.TRANSITO) ?? '—',
      trafficAviso: traffic?.aviso,
    });
  }

  /* ---- Rodapé de estado ---- */
  const stamps = cacheRows
    .map((c) => c.lastSuccessfulUpdate)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime());

  const degraded = cacheRows.filter((c: CacheEntry) => c.status === 'error').map((c) => c.source);

  return {
    slides,
    monthName: period.monthName,
    year: period.year,
    lastUpdate: stamps[0] ? formatTime(stamps[0]) : null,
    degraded,
    generatedAt: new Date().toISOString(),
  };
}
