/**
 * merge-and-save.js
 * ------------------------------------------------------------------
 * Lê o data.json atual, aplica por cima os dados coletados pelos outros
 * scripts (HubSpot, trânsito, carteira) e grava de volta.
 *
 * Só os campos automatizados são tocados. Tudo que continua manual —
 * aniversariantes, aniversários de casa, novo talento, novidades da
 * empresa, celebração de ativação, cotação de moedas — fica intacto.
 *
 * Uso:
 *   node scripts/fetch-hubspot.js > /tmp/hubspot.json
 *   node scripts/fetch-transito.js > /tmp/transito.json
 *   node scripts/fetch-cr2.js > /tmp/cr2.json
 *   node scripts/merge-and-save.js /tmp/hubspot.json /tmp/transito.json /tmp/cr2.json data.json
 *
 * Qualquer um dos três primeiros argumentos pode ser "" (string vazia)
 * para atualizar só uma parte dos dados.
 * ------------------------------------------------------------------
 */

const fs = require('fs');

const [, , hubspotPath, transitoPath, cr2Path, dataJsonPath = 'data.json'] = process.argv;

function readJSON(path, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

const findSlide = (slides, type) => slides.find((s) => s.type === type);

/** Todos os slides de ranking, na ordem em que aparecem. */
const rankings = (slides) => slides.filter((s) => s.type === 'ranking');

/** Acha o slide de ranking que contém uma divisão com este nome. */
function findDivision(slides, nomeDivisao) {
  const alvo = nomeDivisao.toLowerCase();
  for (const s of rankings(slides)) {
    const d = (s.divisions || []).find((x) => String(x.name).toLowerCase() === alvo);
    if (d) return d;
  }
  return null;
}

const PALETA = ['var(--gold)', 'var(--mint)', 'var(--sky)', 'var(--coral)', '#9B8CFF'];

/**
 * Varre o data.json inteiro e monta um cadastro nome → { photo, color }.
 *
 * É assim que as fotos do Slack sobrevivem às atualizações automáticas: o
 * HubSpot devolve só nome e número, e aqui a gente reencontra a foto de quem
 * já apareceu no painel alguma vez. Quem for novo entra sem foto (o painel
 * mostra as iniciais) até alguém colar a URL da foto no data.json uma vez.
 */
function montarElenco(slides) {
  const elenco = {};
  const registrar = (p) => {
    if (!p || !p.name) return;
    const chave = String(p.name).toLowerCase().trim();
    if (!elenco[chave]) elenco[chave] = {};
    if (p.photo && !elenco[chave].photo) elenco[chave].photo = p.photo;
    if (p.color && !elenco[chave].color) elenco[chave].color = p.color;
  };

  for (const s of slides) {
    (s.people || []).forEach(registrar);
    for (const d of s.divisions || []) {
      for (const v of d.sellers || []) {
        registrar(v);
        (v.people || []).forEach(registrar);
      }
    }
  }
  return elenco;
}

/** Aplica foto e cor de quem já é conhecido; o resto ganha cor da paleta. */
function vestir(pessoas, elenco) {
  return pessoas.map((p, i) => {
    const conhecido = elenco[String(p.name).toLowerCase().trim()] || {};
    const out = { ...p };
    out.color = conhecido.color || PALETA[i % PALETA.length];
    if (conhecido.photo) out.photo = conhecido.photo;
    return out;
  });
}

/** Troca só o número de uma divisão de uma pessoa só, preservando nome e foto. */
function atualizarContagem(divisao, valor) {
  if (!divisao || valor == null) return;
  for (const v of divisao.sellers || []) v.oportunidades = valor;
}

const milhoes = (v) =>
  `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;

function main() {
  const slides = readJSON(dataJsonPath, []);
  if (!Array.isArray(slides) || slides.length === 0) {
    console.error(
      `Erro: ${dataJsonPath} não encontrado ou vazio. O merge parte sempre de um data.json existente, para não perder os slides manuais.`
    );
    process.exit(1);
  }

  const hubspot = hubspotPath ? readJSON(hubspotPath) : null;
  const transito = transitoPath ? readJSON(transitoPath) : null;
  const cr2 = cr2Path ? readJSON(cr2Path) : null;

  const elenco = montarElenco(slides);
  const mudancas = [];

  if (hubspot) {
    // --- Progresso da meta -------------------------------------------
    const goal = findSlide(slides, 'goal');
    if (goal && hubspot.ativados) {
      goal.atual = hubspot.ativados.volumeAtivado;
      goal.clientesAtivados = hubspot.ativados.clientesAtivados;
      goal.clientesLista = hubspot.ativados.clientesLista;
      mudancas.push('meta do mês');
    }

    // --- Forecasting closing -----------------------------------------
    const funnel = findSlide(slides, 'funnel');
    if (funnel && hubspot.pipeline) {
      funnel.quenteTotal = hubspot.pipeline.quenteTotal;
      funnel.mornoTotal = hubspot.pipeline.mornoTotal;
      funnel.top3 = hubspot.pipeline.top3;
      mudancas.push('forecasting closing');
    }

    // --- Forecasting por farmer --------------------------------------
    // Vem chaveado pelo nome da operação no HubSpot ("Aumento de volume
    // tomado", "Renovação", "Reativação"), que é o mesmo nome da coluna no
    // painel. Operação que não tenha coluna correspondente simplesmente não
    // aparece — se um dia surgir Reativação, é criar a coluna no data.json.
    if (hubspot.forecastingFarmer) {
      const aplicadas = [];
      for (const [operacao, pessoas] of Object.entries(hubspot.forecastingFarmer)) {
        const div = findDivision(slides, operacao);
        if (!div) continue;
        div.sellers = vestir(pessoas.slice(0, 3), elenco);
        aplicadas.push(operacao);
      }
      if (aplicadas.length) mudancas.push('forecasting por farmer (' + aplicadas.join(', ') + ')');
    }

    // --- Desempenho: closing -----------------------------------------
    const closing = findDivision(slides, 'Closing');
    if (closing && hubspot.ativados && hubspot.ativados.closers) {
      closing.sellers = vestir(hubspot.ativados.closers.slice(0, 3), elenco);
      mudancas.push('ranking de closing');
    }

    // --- Desempenho: parcerias ---------------------------------------
    // Até quatro pessoas: a coluna hoje mostra quatro, e cortar em três
    // deixaria alguém de fora sem ninguém perceber.
    if (hubspot.parcerias && hubspot.parcerias.farming) {
      const farming = findDivision(slides, 'Parcerias · Farming');
      if (farming) {
        farming.sellers = vestir(hubspot.parcerias.farming.slice(0, 4), elenco)
          .map((v) => ({ ...v, metricLabel: 'oportunidades' }));
        mudancas.push('ranking de parcerias');
      }
    }

    // --- Desempenho: retargeting, frete e câmbio ----------------------
    // Aqui o HubSpot devolve só a contagem do mês; os nomes e as fotos de
    // quem responde por cada frente continuam vindo do data.json.
    atualizarContagem(findDivision(slides, 'Retargeting'), hubspot.retargeting);
    atualizarContagem(findDivision(slides, 'Frete'), hubspot.frete);
    // Câmbio não entra aqui: a divisão mostra quatro métricas próprias
    // (volume, margem, clientes, transações) e não uma contagem de negócios.
    mudancas.push('retargeting, frete e câmbio');

    // --- Novidades: o card de crédito aprovado ------------------------
    const news = findSlide(slides, 'news');
    const cardCredito = news && (news.items || []).find((i) => i.tag === 'credito');
    if (cardCredito && hubspot.ativados && hubspot.ativados.creditoAprovado) {
      cardCredito.title = `Crédito aprovado chega a ${milhoes(hubspot.ativados.creditoAprovado)} no mês`;
      mudancas.push('card de crédito aprovado');
    }
  }

  if (transito) {
    const weather = findSlide(slides, 'weather');
    if (weather) {
      // Só para telas com o index.html antigo em cache; o painel novo calcula.
      weather.rodizio = transito.rodizio;
      weather.trafficUpdatedAt = transito.trafficUpdatedAt;
      weather.traffic = transito.traffic;
      mudancas.push('trânsito');
    }
  }

  if (cr2) {
    const wallet = findSlide(slides, 'wallet');
    if (wallet) {
      wallet.current = cr2.current;
      wallet.pctChange = cr2.pctChange;
      wallet.series = cr2.series;
      mudancas.push('carteira');
    }
  }

  fs.writeFileSync(dataJsonPath, JSON.stringify(slides, null, 2) + '\n');
  console.log(`OK: ${dataJsonPath} atualizado (${mudancas.join(', ') || 'nada a aplicar'}).`);
}

main();
