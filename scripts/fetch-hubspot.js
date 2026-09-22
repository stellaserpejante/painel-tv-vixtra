/**
 * fetch-hubspot.js
 * ---------------------------------------------------------------------------
 * Busca no HubSpot tudo que o painel mostra automaticamente e imprime um JSON
 * no stdout. O merge-and-save.js aplica esse JSON por cima do data.json,
 * preservando os slides manuais (aniversários, novo talento, novidades).
 *
 * Requer a variável de ambiente HUBSPOT_TOKEN (token de app privado com
 * escopo crm.objects.deals.read e crm.objects.owners.read).
 *
 * IDs DESTE PORTAL (44743501) — extraídos da definição dos relatórios que a
 * Stella indicou como fonte de verdade. Não são padrão do HubSpot: se algum
 * pipeline ou etapa for recriado lá, é aqui que se atualiza.
 * ---------------------------------------------------------------------------
 */

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Erro: HUBSPOT_TOKEN não definido.');
  process.exit(1);
}

const BASE = 'https://api.hubapi.com';

/* --------------------------------------------------------------------- */
/* Mapeamento confirmado dashboard por dashboard                          */
/* --------------------------------------------------------------------- */

const PIPELINES = {
  COMERCIAL: '670574125',   // closing, forecasting e parcerias
  FARMING: '799124839',     // Farmers - Funil de Operação
  FRETE: '877239977',       // embarques
  RETARGETING: '670475949', // Opps neste mês (Retargeting)
  CAMBIO: '843320843',      // solicitações de cadastro
};

// Etapas que caracterizam cliente ATIVADO.
// Relatórios 140792840 / 149250442 / 148884903.
const STAGES_ATIVADO = ['983479988', '1208919954'];

// Etapas em aberto do pipeline de closing. Relatório 140793599.
const STAGES_PIPELINE = ['983479985', '983479986', '983479987', '1268615190'];

// Owners incluídos no forecasting. Relatório 140793599.
const OWNERS_FORECAST = [
  '746504206', '19342453', '1115600915', '252246912',
  '1411261526', '84532627', '89091132', '2069515993',
];

const MACRO_CANAIS = ['Direto', 'Farming', 'Parceirias', 'Trading'];

// Pessoas de parceria, na propriedade nome_bdr__hunter__farmer_.
// Relatório 168996449 (hunting) e 149259364 (farming).
const BDR_HUNTING = ['1598055246', '85322310'];
const BDR_FARMING = ['2069515993', '85322310', '1566756950'];

const STAGE_EMBARQUE = '1315985497';
const TEAM_RETARGETING = '60328493';
const DATE_RETARGETING = 'hs_v2_date_entered_983301662';

/* --------------------------------------------------------------------- */
/* Datas — sempre o mês vigente, nunca uma data escrita à mão             */
/* --------------------------------------------------------------------- */

/** Mês vigente no fuso de São Paulo, em epoch UTC (formato aceito pelo HubSpot). */
function mesVigente() {
  const agora = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  return {
    ano,
    mes: mes + 1,
    // Propriedades do tipo `date` guardam meia-noite UTC.
    inicioData: String(Date.UTC(ano, mes, 1)),
    fimData: String(Date.UTC(ano, mes + 1, 0)),
    // Propriedades `datetime` usam o instante local convertido.
    inicioHora: String(new Date(ano, mes, 1).getTime()),
    fimHora: String(new Date(ano, mes + 1, 0, 23, 59, 59).getTime()),
  };
}

/** Limites do trimestre vigente, usados no forecasting. */
function quarterVigente() {
  const agora = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const ano = agora.getFullYear();
  const q = Math.floor(agora.getMonth() / 3);
  return {
    inicio: String(new Date(ano, q * 3, 1).getTime()),
    fim: String(new Date(ano, q * 3 + 3, 0, 23, 59, 59).getTime()),
  };
}

/* --------------------------------------------------------------------- */
/* Cliente HTTP                                                           */
/* --------------------------------------------------------------------- */

async function buscarNegocios(filters, properties) {
  const resultados = [];
  let after;
  do {
    const corpo = { filterGroups: [{ filters }], properties, limit: 100 };
    if (after) corpo.after = after;

    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const pagina = await res.json();
    resultados.push(...pagina.results);
    after = pagina.paging && pagina.paging.next && pagina.paging.next.after;
  } while (after);

  return resultados;
}

let cacheOwners = null;
async function owners() {
  if (cacheOwners) return cacheOwners;
  const mapa = {};
  let after;
  do {
    const qs = new URLSearchParams({ limit: '100' });
    if (after) qs.set('after', after);
    const res = await fetch(`${BASE}/crm/v3/owners?${qs}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) break;
    const pagina = await res.json();
    for (const o of pagina.results) {
      mapa[o.id] = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email;
    }
    after = pagina.paging && pagina.paging.next && pagina.paging.next.after;
  } while (after);
  cacheOwners = mapa;
  return mapa;
}

const num = (v) => (v ? Number(v) || 0 : 0);
const temp = (v) => String(v || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

/* --------------------------------------------------------------------- */
/* Consultas                                                              */
/* --------------------------------------------------------------------- */

/** Volume ativado, clientes ativados, crédito aprovado e ranking de closers. */
async function ativacoes() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'dealstage', operator: 'IN', values: STAGES_ATIVADO },
      { propertyName: 'data_da_ativacao', operator: 'BETWEEN', value: p.inicioData, highValue: p.fimData },
    ],
    ['dealname', 'volume_ativado', 'limite_aprovado_credito', 'data_da_ativacao', 'hubspot_owner_id']
  );

  const nomes = await owners();
  const porCloser = {};

  for (const d of negocios) {
    const dono = d.properties.hubspot_owner_id;
    if (!dono) continue;
    porCloser[dono] = porCloser[dono] || { valor: 0, negocios: 0 };
    porCloser[dono].valor += num(d.properties.volume_ativado);
    porCloser[dono].negocios += 1;
  }

  return {
    volumeAtivado: negocios.reduce((s, d) => s + num(d.properties.volume_ativado), 0),
    clientesAtivados: negocios.length,
    creditoAprovado: negocios.reduce((s, d) => s + num(d.properties.limite_aprovado_credito), 0),
    clientesLista: negocios
      .sort((a, b) => num(b.properties.volume_ativado) - num(a.properties.volume_ativado))
      .map((d) => (d.properties.dealname || '').trim()),
    closers: Object.entries(porCloser)
      .map(([id, v]) => ({ name: nomes[id] || `Owner ${id}`, value: v.valor, deals: v.negocios }))
      .sort((a, b) => b.value - a.value),
  };
}

/** Forecasting de closing: quente e morno do mês vigente + top 3 negócios. */
async function forecastingClosing() {
  const p = mesVigente();
  const q = quarterVigente();

  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.COMERCIAL] },
      { propertyName: 'dealstage', operator: 'IN', values: STAGES_PIPELINE },
      { propertyName: 'macro_canal', operator: 'IN', values: MACRO_CANAIS },
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: OWNERS_FORECAST },
      { propertyName: 'closedate', operator: 'BETWEEN', value: q.inicio, highValue: q.fim },
    ],
    ['dealname', 'amount', 'temperatura_do_negocio', 'closedate', 'hubspot_owner_id']
  );

  const nomes = await owners();
  const doMes = negocios.filter((d) => {
    const c = d.properties.closedate;
    if (!c) return false;
    const t = new Date(c).getTime();
    return t >= Number(p.inicioHora) && t <= Number(p.fimHora);
  });

  const soma = (lista, t) =>
    lista.filter((d) => temp(d.properties.temperatura_do_negocio) === t)
         .reduce((s, d) => s + num(d.properties.amount), 0);

  const peso = (d) => {
    const t = temp(d.properties.temperatura_do_negocio);
    return t === 'quente' ? 2 : t === 'morno' ? 1 : 0;
  };

  return {
    quenteTotal: soma(doMes, 'quente'),
    mornoTotal: soma(doMes, 'morno'),
    top3: [...doMes]
      .sort((a, b) => peso(b) - peso(a) || num(b.properties.amount) - num(a.properties.amount))
      .slice(0, 3)
      .map((d) => ({
        name: d.properties.dealname || 'Sem nome',
        value: num(d.properties.amount),
        temp: temp(d.properties.temperatura_do_negocio) || 'frio',
        owner: nomes[d.properties.hubspot_owner_id] || null,
      })),
  };
}

/** Forecasting por farmer: aumento de volume tomado e renovação. */
async function forecastingFarmer() {
  const negocios = await buscarNegocios(
    [{ propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.FARMING] }],
    ['dealname', 'amount', 'tipo_de_operacao', 'hubspot_owner_id']
  );

  const nomes = await owners();
  const porFarmer = {};

  for (const d of negocios) {
    const dono = d.properties.hubspot_owner_id;
    if (!dono) continue;
    const tipo = String(d.properties.tipo_de_operacao || '').toLowerCase();
    porFarmer[dono] = porFarmer[dono] || { aumento: 0, renovacao: 0 };
    if (tipo.includes('renova')) porFarmer[dono].renovacao += num(d.properties.amount);
    else porFarmer[dono].aumento += num(d.properties.amount);
  }

  const lista = Object.entries(porFarmer).map(([id, v]) => ({
    name: nomes[id] || `Owner ${id}`,
    aumento: v.aumento,
    renovacao: v.renovacao,
  }));

  return {
    aumento: lista.filter((f) => f.aumento > 0)
      .map((f) => ({ name: f.name, value: f.aumento }))
      .sort((a, b) => b.value - a.value),
    renovacao: lista.filter((f) => f.renovacao > 0)
      .map((f) => ({ name: f.name, value: f.renovacao }))
      .sort((a, b) => b.value - a.value),
  };
}

/**
 * Oportunidades de parcerias, agrupadas pela pessoa de BDR/parceria.
 * Em farming vale a regra de pontuação: com Small Lead conta 0,5.
 */
async function parcerias(bdrIds, usarSmallLead) {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.COMERCIAL] },
      { propertyName: 'nome_bdr__hunter__farmer_', operator: 'IN', values: bdrIds },
      { propertyName: 'data_da_oportunidade', operator: 'BETWEEN', value: p.inicioData, highValue: p.fimData },
    ],
    ['dealname', 'nome_bdr__hunter__farmer_', 'small_lead']
  );

  const nomes = await owners();
  const porPessoa = {};

  for (const d of negocios) {
    const bdr = d.properties.nome_bdr__hunter__farmer_;
    if (!bdr) continue;
    let valor = 1;
    if (usarSmallLead) {
      const sl = String(d.properties.small_lead || '').toLowerCase();
      valor = sl === 'true' || sl === 'sim' ? 0.5 : 1;
    }
    porPessoa[bdr] = (porPessoa[bdr] || 0) + valor;
  }

  return Object.entries(porPessoa)
    .map(([id, v]) => ({ name: nomes[id] || `Owner ${id}`, oportunidades: Number(v.toFixed(1)) }))
    .sort((a, b) => b.oportunidades - a.oportunidades);
}

/** Retargeting: recorte por time, data de entrada na etapa. */
async function retargeting() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.RETARGETING] },
      { propertyName: 'hubspot_team_id', operator: 'IN', values: [TEAM_RETARGETING] },
      { propertyName: DATE_RETARGETING, operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname']
  );
  return negocios.length;
}

/** Embarques confirmados no mês. */
async function frete() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.FRETE] },
      { propertyName: 'dealstage', operator: 'IN', values: [STAGE_EMBARQUE] },
      { propertyName: 'createdate', operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname']
  );
  return negocios.length;
}

/** Solicitações de cadastro de câmbio criadas no mês. */
async function cambio() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.CAMBIO] },
      { propertyName: 'createdate', operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname']
  );
  return negocios.length;
}

/* --------------------------------------------------------------------- */

async function main() {
  const p = mesVigente();

  const [ativados, closing, farmer, hunting, farmingParcerias, retg, frt, cmb] =
    await Promise.all([
      ativacoes(),
      forecastingClosing(),
      forecastingFarmer(),
      parcerias(BDR_HUNTING, false),
      parcerias(BDR_FARMING, true),
      retargeting(),
      frete(),
      cambio(),
    ]);

  console.log(JSON.stringify({
    geradoEm: new Date().toISOString(),
    periodo: `${p.ano}-${String(p.mes).padStart(2, '0')}`,
    ativados,
    pipeline: closing,
    forecastingFarmer: farmer,
    parcerias: { hunting, farming: farmingParcerias },
    retargeting: retg,
    frete: frt,
    cambio: cmb,
  }, null, 2));
}

main().catch((e) => {
  console.error('Erro ao buscar dados do HubSpot:', e.message);
  process.exit(1);
});
