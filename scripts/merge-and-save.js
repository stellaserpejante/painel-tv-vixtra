/**
 * merge-and-save.js
 * ------------------------------------------------------------------
 * Lê o data.json atual (se existir), aplica por cima os dados extraídos
 * pelos outros scripts (HubSpot, trânsito, carteira) e grava de volta.
 *
 * Isso preserva os campos que continuam sendo manuais (aniversários,
 * novo talento, novidades da empresa, celebração) e só atualiza os
 * campos automatizados.
 *
 * Uso:
 *   node scripts/fetch-hubspot.js > /tmp/hubspot.json
 *   node scripts/fetch-transito.js > /tmp/transito.json
 *   node scripts/fetch-cr2.js > /tmp/cr2.json
 *   node scripts/merge-and-save.js /tmp/hubspot.json /tmp/transito.json /tmp/cr2.json data.json
 *
 * Qualquer um dos três primeiros argumentos pode ser "" (string vazia)
 * se você só quiser atualizar uma parte dos dados.
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

function findSlide(slides, type) {
  return slides.find((s) => s.type === type);
}

function main() {
  const slides = readJSON(dataJsonPath, []);
  if (!Array.isArray(slides) || slides.length === 0) {
    console.error(
      `Aviso: ${dataJsonPath} não encontrado ou vazio. Rode isso a partir de uma cópia existente do data.json (exportada do painel) para não perder os slides manuais.`
    );
    process.exit(1);
  }

  const hubspot = hubspotPath ? readJSON(hubspotPath) : null;
  const transito = transitoPath ? readJSON(transitoPath) : null;
  const cr2 = cr2Path ? readJSON(cr2Path) : null;

  if (hubspot) {
    // Slide "goal" (Progresso da meta + clientes ativados)
    const goal = findSlide(slides, 'goal');
    if (goal) {
      goal.atual = hubspot.ativados.volumeAtivado;
      goal.clientesAtivados = hubspot.ativados.clientesAtivados;
      goal.clientesLista = hubspot.ativados.clientesLista;
    }

    // Slide "funnel" (Pipeline de closing)
    const funnel = findSlide(slides, 'funnel');
    if (funnel) {
      funnel.quenteTotal = hubspot.pipeline.quenteTotal;
      funnel.mornoTotal = hubspot.pipeline.mornoTotal;
      funnel.top3 = hubspot.pipeline.top3;
    }

    // Top vendedores: ainda manual até as divisões restantes serem
    // mapeadas (ver README.md) — quando estiverem prontas, atualizar aqui
    // os dois slides type:'ranking' da mesma forma.
  }

  if (transito) {
    const weather = findSlide(slides, 'weather');
    if (weather) {
      weather.rodizio = transito.rodizio;
      weather.trafficUpdatedAt = transito.trafficUpdatedAt;
      weather.traffic = transito.traffic;
    }
  }

  if (cr2) {
    const wallet = findSlide(slides, 'wallet');
    if (wallet) {
      wallet.current = cr2.current;
      wallet.pctChange = cr2.pctChange;
      wallet.series = cr2.series;
    }
  }

  fs.writeFileSync(dataJsonPath, JSON.stringify(slides, null, 2));
  console.log(`OK: ${dataJsonPath} atualizado.`);
}

main();

