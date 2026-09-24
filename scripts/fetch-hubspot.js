/**
 * fetch-hubspot.js
 * ---------------------------------------------------------------------------
 * Busca no HubSpot tudo que o painel mostra automaticamente e imprime um JSON
 * no stdout. O merge-and-save.js aplica esse JSON por cima do data.json,
 * preservando os slides manuais.
 *
 * Requer a variável de ambiente HUBSPOT_TOKEN (app privado com escopo
 * crm.objects.deals.read e crm.objects.owners.read).
 *
 * CADA CONSULTA AQUI É CÓPIA DE UM RELATÓRIO SALVO DO PORTAL 44743501. O
 * número do relatório está em cima de cada função. Se alguém mexer no
 * relatório lá dentro, é aqui que se acerta — e a forma de conferir é sempre
 * a mesma: abrir o relatório e comparar o número com o do painel.
 * ---------------------------------------------------------------------------
 */

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Erro: HUBSPOT_TOKEN não definido.');
  process.exit(1);
}

const BASE = 'https://api.hubapi.com';

/* --------------------------------------------------------------------- */
/* Datas                                                                  */
/* --------------------------------------------------------------------- */

/**
 * Deslocamento do fuso de São Paulo num dado instante, em milissegundos.
 *
 * Isto existe porque a rotina roda num servidor em UTC. `new Date(ano, mes, 1)`
 * lá dentro dá meia-noite UTC, não meia-noite de São Paulo — três horas antes.
 * Era esse o motivo de o forecasting do painel vir meio milhão abaixo do
 * relatório: negócios que fecham depois das 21h do último dia do mês caíam
 * fora da janela.
 */
function deslocamentoSaoPaulo(instante) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(
    f.formatToParts(new Date(instante)).map((x) => [x.type, x.value])
  );
  const comoSeFosseUtc = Date.UTC(
    +p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second
  );
  return comoSeFosseUtc - instante;
}

/** Epoch (ms) de uma data/hora civil de São Paulo. */
function emSaoPaulo(ano, mes, dia, h = 0, min = 0, s = 0) {
  const palpite = Date.UTC(ano, mes, dia, h, min, s);
  return palpite - deslocamentoSaoPaulo(palpite);
}

/** Mês vigente. Nunca uma data escrita à mão. */
function mesVigente() {
  const agora = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  return {
    ano,
    mes: mes + 1,
    // Propriedades do tipo `date` guardam meia-noite UTC — sem fuso.
    inicioData: String(Date.UTC(ano, mes, 1)),
    fimData: String(Date.UTC(ano, mes + 1, 0)),
    // Propriedades `datetime` guardam um instante: usa-se o fuso de São Paulo.
    inicioHora: String(emSaoPaulo(ano, mes, 1)),
    fimHora: String(emSaoPaulo(ano, mes + 1, 1) - 1),
  };
}

/* --------------------------------------------------------------------- */
/* IDs deste portal (44743501)                                            */
/* --------------------------------------------------------------------- */

const PIPELINES = {
  COMERCIAL: '670574125',
  FRETE: '877239977',
  RETARGETING: '670475949',
};

// Etapas que caracterizam cliente ativado.
const STAGES_ATIVADO = ['983479988', '1208919954'];

const STAGE_FARMING_FORECAST = '1412586077';
const STAGE_EMBARQUE = '1315985497';
const TEAM_RETARGETING = '60328493';
const DATE_RETARGETING = 'hs_v2_date_entered_983301662';

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
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
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

/** 'Quente  (Quente)' -> 'quente'. O HubSpot devolve o rótulo com sufixo. */
const temp = (v) => String(v || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

/**
 * Nome de cliente legível numa TV.
 *
 * O CRM guarda "EGGERDING BRASIL MINERAIS INDUSTRIAIS LTDA" e "PNEUTEK -
 * Crédito". Na tela isso vira ruído: tira-se o sufixo de produto, a forma
 * societária e o caixa alta. É só apresentação — o dado não muda.
 */
function nomeDeCliente(bruto) {
  let n = String(bruto || '').trim();
  n = n.replace(/\s*[-–]\s*(cr[ée]dito|c[âa]mbio|frete|conta de c[âa]mbio).*$/i, '');
  n = n.replace(/\s*\b(ltda|s\.?\s?a\.?|me|epp|eireli|s\/a)\b\.?\s*$/i, '');
  n = n.replace(/\s+/g, ' ').trim();
  // Caixa alta vira Capitalizado; nomes já mistos ficam como estão.
  if (n === n.toUpperCase()) {
    const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
    n = n.toLowerCase().split(' ').map((p, i) =>
      i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)
    ).join(' ');
  }
  return n;
}

/* --------------------------------------------------------------------- */
/* Consultas                                                              */
/* --------------------------------------------------------------------- */

/**
 * Ativações do mês: volume ativado, clientes, crédito aprovado e ranking de
 * closing. Etapas de ativado + data_da_ativacao no mês.
 */
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
      .map((d) => nomeDeCliente(d.properties.dealname)),
    closers: Object.entries(porCloser)
      .map(([id, v]) => ({ name: nomes[id] || `Owner ${id}`, value: v.valor, deals: v.negocios }))
      .sort((a, b) => b.value - a.value),
  };
}

/**
 * Forecasting closing — relatório 140793599
 * ("Forecasting do quarter - Por mês (volume)").
 *
 * O relatório abre o quarter inteiro e quebra por mês; o painel mostra só o
 * mês vigente, então aqui o recorte de closedate já vem no mês. Antes a
 * consulta pegava o quarter e filtrava o mês depois, em JavaScript, com as
 * bordas em UTC — e o painel ficava R$ 500 mil abaixo do relatório.
 */
async function forecastingClosing() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.COMERCIAL] },
      { propertyName: 'dealstage', operator: 'IN', values: ['983479985', '983479986', '983479987', '1268615190'] },
      { propertyName: 'macro_canal', operator: 'IN', values: ['Direto', 'Farming', 'Parceirias', 'Trading'] },
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: ['746504206', '19342453', '1115600915', '252246912', '1411261526', '84532627', '89091132', '2069515993'] },
      { propertyName: 'closedate', operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname', 'amount', 'temperatura_do_negocio', 'closedate', 'hubspot_owner_id']
  );

  const nomes = await owners();
  const soma = (t) => negocios
    .filter((d) => temp(d.properties.temperatura_do_negocio) === t)
    .reduce((s, d) => s + num(d.properties.amount), 0);

  const peso = (d) => {
    const t = temp(d.properties.temperatura_do_negocio);
    return t === 'quente' ? 2 : t === 'morno' ? 1 : 0;
  };

  return {
    quenteTotal: soma('quente'),
    mornoTotal: soma('morno'),
    top3: [...negocios]
      .sort((a, b) => peso(b) - peso(a) || num(b.properties.amount) - num(a.properties.amount))
      .slice(0, 3)
      .map((d) => ({
        name: nomeDeCliente(d.properties.dealname),
        value: num(d.properties.amount),
        temp: temp(d.properties.temperatura_do_negocio) || 'frio',
        owner: nomes[d.properties.hubspot_owner_id] || null,
      })),
  };
}

/**
 * Forecasting por farmer — relatório 347059207
 * ("[FARMING] Forecasting mês atual - por Farmer").
 *
 * Uma etapa só, mês vigente por closedate, e a quebra é pela propriedade
 * `operacao` — não `tipo_de_operacao`, que foi o palpite errado da primeira
 * versão e trazia o pipeline de farming inteiro, sem recorte de data.
 */
const OPERACOES_FARMER = ['Aumento de volume tomado', 'Reativação', 'Renovação'];

async function forecastingFarmer() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'dealstage', operator: 'IN', values: [STAGE_FARMING_FORECAST] },
      { propertyName: 'operacao', operator: 'IN', values: OPERACOES_FARMER },
      { propertyName: 'closedate', operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname', 'amount', 'operacao', 'closedate', 'hubspot_owner_id']
  );

  const nomes = await owners();
  const porOperacao = {};
  for (const d of negocios) {
    const dono = d.properties.hubspot_owner_id;
    const op = String(d.properties.operacao || '').trim();
    if (!dono || !op) continue;
    porOperacao[op] = porOperacao[op] || {};
    porOperacao[op][dono] = (porOperacao[op][dono] || 0) + num(d.properties.amount);
  }

  const lista = (op) => Object.entries(porOperacao[op] || {})
    .map(([id, v]) => ({ name: nomes[id] || `Owner ${id}`, value: v }))
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value);

  // Chaveado pelo nome da operação, que é o mesmo nome da coluna no painel.
  const saida = {};
  for (const op of OPERACOES_FARMER) saida[op] = lista(op);
  return saida;
}

/**
 * Parcerias farming — relatório 149259364 ("Oportunidades - Este Mês").
 *
 * Contagem de negócios por pessoa de BDR/hunter/farmer, com a regra de
 * pontuação da Stella: negócio marcado como Small Lead vale 0,5 oportunidade;
 * os demais valem 1.
 */
const BDR_FARMING = ['2069515993', '83054562', '85322310', '1566756950', '98365645'];

async function parceriasFarming() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.COMERCIAL] },
      { propertyName: 'nome_bdr__hunter__farmer_', operator: 'IN', values: BDR_FARMING },
      { propertyName: 'data_da_oportunidade', operator: 'BETWEEN', value: p.inicioData, highValue: p.fimData },
    ],
    ['dealname', 'nome_bdr__hunter__farmer_', 'small_lead']
  );

  const nomes = await owners();
  const porPessoa = {};
  for (const d of negocios) {
    const bdr = d.properties.nome_bdr__hunter__farmer_;
    if (!bdr) continue;
    const sl = String(d.properties.small_lead || '').toLowerCase();
    const vale = sl === 'true' || sl === 'sim' ? 0.5 : 1;
    porPessoa[bdr] = (porPessoa[bdr] || 0) + vale;
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

/**
 * Frete — relatório 168980717 ("Negócios com Embarques Confirmados - mês").
 *
 * O recorte é por closedate, não por createdate. Com createdate o painel
 * mostrava 12 onde o relatório mostrava 14.
 */
async function frete() {
  const p = mesVigente();
  const negocios = await buscarNegocios(
    [
      { propertyName: 'pipeline', operator: 'IN', values: [PIPELINES.FRETE] },
      { propertyName: 'dealstage', operator: 'IN', values: [STAGE_EMBARQUE] },
      { propertyName: 'closedate', operator: 'BETWEEN', value: p.inicioHora, highValue: p.fimHora },
    ],
    ['dealname']
  );
  return negocios.length;
}

/* --------------------------------------------------------------------- */

async function main() {
  const p = mesVigente();

  const [ativados, closing, farmer, farmingParcerias, retg, frt] = await Promise.all([
    ativacoes(),
    forecastingClosing(),
    forecastingFarmer(),
    parceriasFarming(),
    retargeting(),
    frete(),
  ]);

  console.log(JSON.stringify({
    geradoEm: new Date().toISOString(),
    periodo: `${p.ano}-${String(p.mes).padStart(2, '0')}`,
    ativados,
    pipeline: closing,
    forecastingFarmer: farmer,
    parcerias: { farming: farmingParcerias },
    retargeting: retg,
    frete: frt,
    // Câmbio não entra: a Stella manda esses números uma vez por semana.
  }, null, 2));
}

main().catch((e) => {
  console.error('Erro ao buscar dados do HubSpot:', e.message);
  process.exit(1);
});
