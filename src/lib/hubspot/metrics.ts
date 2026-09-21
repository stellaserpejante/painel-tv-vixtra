import 'server-only';
import { searchDeals, listOwners, type HubSpotRecord, type HubSpotFilter } from './client';
import { DEAL_STAGES, PIPELINES, PROPS, FORECAST_OWNER_IDS, MACRO_CANAIS_FORECAST } from './constants';
import { getCurrentPeriod, getCurrentQuarter, toHubSpotDateValue } from '@/lib/time';

/**
 * Reprodução fiel dos relatórios do HubSpot usando a API de objetos.
 *
 * Cada função abaixo replica exatamente os filtros do relatório salvo
 * correspondente — os IDs vêm de constants.ts, que documenta a origem.
 * Nenhum período é escrito à mão: tudo vem da camada central de datas.
 */

const num = (v: string | null | undefined): number => {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** O HubSpot devolve "Quente  (Quente)" com espaço duplo; normalizamos. */
const normalizeTemp = (v: string | null | undefined): string =>
  (v ?? '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

/* ================================================================== *
 * ATIVAÇÕES DO MÊS
 * Base dos relatórios 140792840, 149250442 e 148884903 — os três usam
 * os mesmos filtros, mudando apenas a métrica agregada.
 * ================================================================== */

function ativacoesDoMesFilters() {
  const period = getCurrentPeriod();
  return [
    {
      filters: [
        {
          propertyName: PROPS.DEALSTAGE,
          operator: 'IN' as const,
          values: [...DEAL_STAGES.ATIVADOS],
        },
        {
          propertyName: PROPS.DATA_ATIVACAO,
          operator: 'BETWEEN' as const,
          value: toHubSpotDateValue(period.start),
          highValue: toHubSpotDateValue(period.end),
        },
      ],
    },
  ];
}

export interface AtivacoesDoMes {
  periodKey: string;
  /** Soma de volume_ativado — o "Realizado" do slide da meta. */
  volumeAtivado: number;
  /** Contagem de negócios — "Clientes ativados". */
  clientesAtivados: number;
  /** Soma de limite_aprovado_credito — "Crédito aprovado no mês". */
  creditoAprovado: number;
  /** Lista dos clientes, para os chips do slide. */
  clientes: {
    dealId: string;
    nome: string;
    volume: number;
    limite: number;
    ownerId: string | null;
    dataAtivacao: string | null;
  }[];
  /** Ranking por closer, já somado e ordenado. */
  porCloser: { ownerId: string; nome: string; email: string | null; volume: number; negocios: number }[];
}

export async function fetchAtivacoesDoMes(): Promise<AtivacoesDoMes> {
  const period = getCurrentPeriod();
  const [deals, owners] = await Promise.all([
    searchDeals({
      filterGroups: ativacoesDoMesFilters(),
      properties: [
        PROPS.DEALNAME,
        PROPS.VOLUME_ATIVADO,
        PROPS.LIMITE_APROVADO,
        PROPS.DATA_ATIVACAO,
        PROPS.OWNER,
        PROPS.NOME_BDR,
      ],
    }),
    listOwners(),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const clientes = deals.map((d) => ({
    dealId: d.id,
    nome: d.properties[PROPS.DEALNAME] ?? 'Sem nome',
    volume: num(d.properties[PROPS.VOLUME_ATIVADO]),
    limite: num(d.properties[PROPS.LIMITE_APROVADO]),
    ownerId: d.properties[PROPS.OWNER] ?? null,
    dataAtivacao: d.properties[PROPS.DATA_ATIVACAO] ?? null,
  }));

  // Agrupamento por closer (item 11 da especificação).
  const closerMap = new Map<string, { volume: number; negocios: number }>();
  for (const c of clientes) {
    if (!c.ownerId) continue;
    const cur = closerMap.get(c.ownerId) ?? { volume: 0, negocios: 0 };
    cur.volume += c.volume;
    cur.negocios += 1;
    closerMap.set(c.ownerId, cur);
  }

  const porCloser = [...closerMap.entries()]
    .map(([ownerId, v]) => ({
      ownerId,
      nome: ownerById.get(ownerId)?.fullName ?? `Owner ${ownerId}`,
      email: ownerById.get(ownerId)?.email ?? null,
      volume: v.volume,
      negocios: v.negocios,
    }))
    .sort((a, b) => b.volume - a.volume);

  return {
    periodKey: period.key,
    volumeAtivado: clientes.reduce((s, c) => s + c.volume, 0),
    clientesAtivados: clientes.length,
    creditoAprovado: clientes.reduce((s, c) => s + c.limite, 0),
    clientes: clientes.sort((a, b) => b.volume - a.volume),
    porCloser,
  };
}

/* ================================================================== *
 * PIPELINE DE CLOSING — Quente / Morno
 * Relatório 140793599 "Forecasting do quarter - Por mês (volume)".
 * A Stella definiu que o slide mostra o recorte do MÊS VIGENTE.
 * ================================================================== */

export interface PipelineClosing {
  periodKey: string;
  quente: number;
  morno: number;
  frio: number;
  quenteQuarter: number;
  mornoQuarter: number;
  top3: {
    dealId: string;
    nome: string;
    valor: number;
    temperatura: string;
    ownerId: string | null;
    ownerNome: string | null;
    ownerEmail: string | null;
  }[];
}

export async function fetchPipelineClosing(): Promise<PipelineClosing> {
  const period = getCurrentPeriod();
  const quarter = getCurrentQuarter();

  const [deals, owners] = await Promise.all([
    searchDeals({
      filterGroups: [
        {
          filters: [
            { propertyName: PROPS.PIPELINE, operator: 'IN', values: [PIPELINES.COMERCIAL] },
            { propertyName: PROPS.DEALSTAGE, operator: 'IN', values: [...DEAL_STAGES.PIPELINE_ABERTO] },
            { propertyName: PROPS.MACRO_CANAL, operator: 'IN', values: [...MACRO_CANAIS_FORECAST] },
            { propertyName: PROPS.OWNER, operator: 'IN', values: [...FORECAST_OWNER_IDS] },
            {
              propertyName: PROPS.CLOSEDATE,
              operator: 'BETWEEN',
              value: String(quarter.start.getTime()),
              highValue: String(quarter.end.getTime()),
            },
          ],
        },
      ],
      properties: [
        PROPS.DEALNAME,
        PROPS.AMOUNT,
        PROPS.TEMPERATURA,
        PROPS.CLOSEDATE,
        PROPS.OWNER,
        PROPS.DEALSTAGE,
      ],
    }),
    listOwners(),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const inCurrentMonth = (d: HubSpotRecord) => {
    const close = d.properties[PROPS.CLOSEDATE];
    if (!close) return false;
    const t = new Date(close).getTime();
    return t >= period.start.getTime() && t <= period.end.getTime();
  };

  const sumBy = (records: HubSpotRecord[], temp: string) =>
    records
      .filter((d) => normalizeTemp(d.properties[PROPS.TEMPERATURA]) === temp)
      .reduce((s, d) => s + num(d.properties[PROPS.AMOUNT]), 0);

  const doMes = deals.filter(inCurrentMonth);

  // Top 3 em destaque: maiores valores do mês, priorizando os quentes.
  const rank = (d: HubSpotRecord) => {
    const t = normalizeTemp(d.properties[PROPS.TEMPERATURA]);
    return t === 'quente' ? 2 : t === 'morno' ? 1 : 0;
  };
  const top3 = [...doMes]
    .sort((a, b) => rank(b) - rank(a) || num(b.properties[PROPS.AMOUNT]) - num(a.properties[PROPS.AMOUNT]))
    .slice(0, 3)
    .map((d) => {
      const ownerId = d.properties[PROPS.OWNER] ?? null;
      const owner = ownerId ? ownerById.get(ownerId) : undefined;
      return {
        dealId: d.id,
        nome: d.properties[PROPS.DEALNAME] ?? 'Sem nome',
        valor: num(d.properties[PROPS.AMOUNT]),
        temperatura: normalizeTemp(d.properties[PROPS.TEMPERATURA]) || 'frio',
        ownerId,
        ownerNome: owner?.fullName ?? null,
        ownerEmail: owner?.email ?? null,
      };
    });

  return {
    periodKey: period.key,
    quente: sumBy(doMes, 'quente'),
    morno: sumBy(doMes, 'morno'),
    frio: sumBy(doMes, 'frio'),
    quenteQuarter: sumBy(deals, 'quente'),
    mornoQuarter: sumBy(deals, 'morno'),
    top3,
  };
}

/* ================================================================== *
 * PIPELINE FARMING — por farmer e por tipo de operação
 * Relatório 155079282 "Farmers - Funil de Operação".
 * ================================================================== */

export interface PipelineFarming {
  farmers: {
    ownerId: string;
    nome: string;
    email: string | null;
    novaOperacao: number;
    renovacao: number;
    total: number;
  }[];
  totalNovaOperacao: number;
  totalRenovacao: number;
}

export async function fetchPipelineFarming(): Promise<PipelineFarming> {
  const [deals, owners] = await Promise.all([
    searchDeals({
      filterGroups: [
        {
          filters: [{ propertyName: PROPS.PIPELINE, operator: 'IN', values: [PIPELINES.FARMING] }],
        },
      ],
      properties: [PROPS.DEALNAME, PROPS.AMOUNT, PROPS.TIPO_OPERACAO, PROPS.OWNER],
    }),
    listOwners(),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const map = new Map<string, { novaOperacao: number; renovacao: number }>();

  for (const d of deals) {
    const ownerId = d.properties[PROPS.OWNER];
    if (!ownerId) continue;
    const tipo = (d.properties[PROPS.TIPO_OPERACAO] ?? '').toLowerCase();
    const cur = map.get(ownerId) ?? { novaOperacao: 0, renovacao: 0 };
    const valor = num(d.properties[PROPS.AMOUNT]);
    if (tipo.includes('renova')) cur.renovacao += valor;
    else if (tipo.includes('nova')) cur.novaOperacao += valor;
    map.set(ownerId, cur);
  }

  const farmers = [...map.entries()]
    .map(([ownerId, v]) => ({
      ownerId,
      nome: ownerById.get(ownerId)?.fullName ?? `Owner ${ownerId}`,
      email: ownerById.get(ownerId)?.email ?? null,
      novaOperacao: v.novaOperacao,
      renovacao: v.renovacao,
      total: v.novaOperacao + v.renovacao,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    farmers,
    totalNovaOperacao: farmers.reduce((s, f) => s + f.novaOperacao, 0),
    totalRenovacao: farmers.reduce((s, f) => s + f.renovacao, 0),
  };
}

/* ================================================================== *
 * EMBARQUES CONFIRMADOS (Frete)
 * Relatório 169003255 "Lista com Embarques Confirmados - mês".
 * ================================================================== */

export async function fetchEmbarquesConfirmados(): Promise<{
  periodKey: string;
  quantidade: number;
  negocios: { dealId: string; nome: string; criadoEm: string | null }[];
}> {
  const period = getCurrentPeriod();
  const deals = await searchDeals({
    filterGroups: [
      {
        filters: [
          { propertyName: PROPS.PIPELINE, operator: 'IN', values: [PIPELINES.FRETE] },
          { propertyName: PROPS.DEALSTAGE, operator: 'IN', values: [DEAL_STAGES.EMBARQUE_CONFIRMADO] },
          {
            propertyName: PROPS.CREATEDATE,
            operator: 'BETWEEN',
            value: String(period.start.getTime()),
            highValue: String(period.end.getTime()),
          },
        ],
      },
    ],
    properties: [PROPS.DEALNAME, PROPS.CREATEDATE],
  });

  return {
    periodKey: period.key,
    quantidade: deals.length,
    negocios: deals.map((d) => ({
      dealId: d.id,
      nome: (d.properties[PROPS.DEALNAME] ?? '').trim() || 'Sem nome',
      criadoEm: d.properties[PROPS.CREATEDATE] ?? null,
    })),
  };
}

/* ================================================================== *
 * OPORTUNIDADES DO MÊS — Hunting, Farming (com Small Lead) e Retargeting
 *
 * A estrutura dos três relatórios é a mesma: filtrar negócios por pipeline
 * e por um conjunto de pessoas (nome_bdr__hunter__farmer_), dentro do mês
 * vigente segundo `data_da_oportunidade`, e agrupar por proprietário.
 *
 * Os IDs das pessoas de cada área ainda dependem de confirmação da Stella
 * sobre qual relatório pertence a qual dashboard — por isso a função é
 * parametrizada, e a configuração fica em um único lugar.
 * ================================================================== */

export interface OportunidadesConfig {
  pipeline: string;
  /** Valores da propriedade nome_bdr__hunter__farmer_ que pertencem à área. */
  bdrIds?: string[];
  /** Quando true, aplica a pontuação 0,5 / 1 baseada em small_lead. */
  usarSmallLead?: boolean;
}

export interface OportunidadesResultado {
  periodKey: string;
  pessoas: {
    ownerId: string;
    nome: string;
    email: string | null;
    quantidade: number;
    /** Igual a `quantidade` quando a área não usa Small Lead. */
    pontuacao: number;
  }[];
  total: number;
  totalPontuacao: number;
}

export async function fetchOportunidadesDoMes(
  config: OportunidadesConfig
): Promise<OportunidadesResultado> {
  const period = getCurrentPeriod();

  const filters: HubSpotFilter[] = [
    { propertyName: PROPS.PIPELINE, operator: 'IN' as const, values: [config.pipeline] },
    {
      propertyName: PROPS.DATA_OPORTUNIDADE,
      operator: 'BETWEEN' as const,
      value: toHubSpotDateValue(period.start),
      highValue: toHubSpotDateValue(period.end),
    },
  ];
  if (config.bdrIds?.length) {
    filters.push({
      propertyName: PROPS.NOME_BDR,
      operator: 'IN' as const,
      values: config.bdrIds,
    });
  }

  const [deals, owners] = await Promise.all([
    searchDeals({
      filterGroups: [{ filters }],
      properties: [PROPS.DEALNAME, PROPS.OWNER, PROPS.SMALL_LEAD, PROPS.NOME_BDR, PROPS.DATA_OPORTUNIDADE],
    }),
    listOwners(),
  ]);

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const map = new Map<string, { quantidade: number; pontuacao: number }>();

  for (const d of deals) {
    const ownerId = d.properties[PROPS.OWNER];
    if (!ownerId) continue;

    // Regra da especificação item 13: Small Lead = Sim vale 0,5; Não vale 1.
    let peso = 1;
    if (config.usarSmallLead) {
      const smallLead = (d.properties[PROPS.SMALL_LEAD] ?? '').trim().toLowerCase();
      peso = smallLead === 'sim' || smallLead === 'true' || smallLead === 'yes' ? 0.5 : 1;
    }

    const cur = map.get(ownerId) ?? { quantidade: 0, pontuacao: 0 };
    cur.quantidade += 1;
    cur.pontuacao += peso;
    map.set(ownerId, cur);
  }

  const pessoas = [...map.entries()]
    .map(([ownerId, v]) => ({
      ownerId,
      nome: ownerById.get(ownerId)?.fullName ?? `Owner ${ownerId}`,
      email: ownerById.get(ownerId)?.email ?? null,
      quantidade: v.quantidade,
      pontuacao: v.pontuacao,
    }))
    .sort((a, b) => b.pontuacao - a.pontuacao);

  return {
    periodKey: period.key,
    pessoas,
    total: pessoas.reduce((s, p) => s + p.quantidade, 0),
    totalPontuacao: pessoas.reduce((s, p) => s + p.pontuacao, 0),
  };
}
