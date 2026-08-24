/**
 * fetch-hubspot.js
 * ------------------------------------------------------------------
 * Extrai do HubSpot (API oficial, não o conector do Claude):
 *   - Volume ativado, clientes ativados e a lista de clientes (mês vigente)
 *   - Pipeline de closing por temperatura (quente/morno) + top 3 negócios
 *
 * Requer variável de ambiente HUBSPOT_TOKEN (token de app privado do HubSpot
 * com escopo crm.objects.deals.read). Veja o README.md para como criar.
 *
 * Uso:
 *   HUBSPOT_TOKEN=xxx node scripts/fetch-hubspot.js > hubspot-data.json
 * ------------------------------------------------------------------
 */

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
if (!HUBSPOT_TOKEN) {
  console.error('Erro: variável de ambiente HUBSPOT_TOKEN não definida.');
  process.exit(1);
}

const BASE = 'https://api.hubapi.com';

// ---------------------------------------------------------------------------
// IDs internos do HubSpot da Vixtra, já descobertos e validados.
// Se o HubSpot deles for reestruturado (pipelines/etapas renomeados ou
// recriados), esses IDs precisam ser atualizados — eles NÃO são padrão do
// HubSpot, são específicos deste portal (44743501).
// ---------------------------------------------------------------------------
const PIPELINE_CLOSING = '670574125';

// Etapas do "pipeline de closing" consideradas para o slide de pipeline
// (Proposta em Aprovação - Importador/Parceiro, Abertura de Conta, Aguardando Ativação)
const STAGES_PIPELINE_ATIVO = ['1268615190', '983479985', '983479986', '983479987'];

function monthRangeISO(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

async function hubspotSearch(objectType, body) {
  const res = await fetch(`${BASE}/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HubSpot API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function cleanName(name) {
  return (name || '').replace(/&nbsp;/g, '').trim();
}

/**
 * Clientes ativados no mês vigente.
 * IMPORTANTE: filtra por `data_da_ativacao`, não pela etapa atual — um
 * negócio já ativado pode ter avançado para outra etapa (ex: "Onboarding
 * Concluído") e ainda assim deve contar como ativado neste mês.
 */
async function getClientesAtivados() {
  const { start, end } = monthRangeISO();
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_CLOSING },
          {
            propertyName: 'data_da_ativacao',
            operator: 'BETWEEN',
            value: start,
            highValue: end,
          },
        ],
      },
    ],
    properties: ['dealname', 'volume_ativado', 'data_da_ativacao', 'hubspot_owner_id'],
    limit: 100,
  };
  const data = await hubspotSearch('deals', body);
  const deals = data.results || [];

  const volumeAtivado = deals.reduce(
    (acc, d) => acc + Number(d.properties.volume_ativado || 0),
    0
  );

  return {
    volumeAtivado,
    numeroDeAtivacoes: deals.length,
    clientesAtivados: deals.length,
    clientesLista: deals.map((d) => cleanName(d.properties.dealname)),
  };
}

/**
 * Pipeline de closing por temperatura (quente/morno) + top 3 negócios,
 * considerando negócios com fechamento previsto (closedate) no mês vigente.
 */
async function getPipeline() {
  const { start, end } = monthRangeISO();
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_CLOSING },
          { propertyName: 'dealstage', operator: 'IN', values: STAGES_PIPELINE_ATIVO },
          {
            propertyName: 'closedate',
            operator: 'BETWEEN',
            value: start,
            highValue: end,
          },
        ],
      },
    ],
    properties: ['dealname', 'amount', 'temperatura_do_negocio'],
    limit: 100,
  };
  const data = await hubspotSearch('deals', body);
  const deals = data.results || [];

  const temp = (d) => (d.properties.temperatura_do_negocio || '').trim();
  const amount = (d) => Number(d.properties.amount || 0);

  const quente = deals.filter((d) => temp(d) === 'Quente');
  const morno = deals.filter((d) => temp(d) === 'Morno');
  const sum = (arr) => arr.reduce((acc, d) => acc + amount(d), 0);

  const top3 = [...deals]
    .sort((a, b) => amount(b) - amount(a))
    .slice(0, 3)
    .map((d) => ({
      name: cleanName(d.properties.dealname),
      value: amount(d),
      temp: temp(d).toLowerCase(),
    }));

  return {
    quenteTotal: sum(quente),
    mornoTotal: sum(morno),
    top3,
  };
}

/**
 * Busca os nomes dos donos de negócio (para exibir nome em vez de ID).
 */
async function getOwnerNames(ownerIds) {
  const uniqueIds = [...new Set(ownerIds)].filter(Boolean);
  const names = {};
  for (const id of uniqueIds) {
    try {
      const res = await fetch(`${BASE}/crm/v3/owners/${id}`, {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      });
      if (res.ok) {
        const owner = await res.json();
        names[id] = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
      }
    } catch (e) {
      // se falhar para um owner específico, segue sem travar o script inteiro
      console.warn(`Não foi possível buscar o owner ${id}:`, e.message);
    }
  }
  return names;
}

async function main() {
  const [ativados, pipeline] = await Promise.all([
    getClientesAtivados(),
    getPipeline(),
  ]);

  const output = {
    geradoEm: new Date().toISOString(),
    ativados,
    pipeline,
    // Top vendedores por divisão: pipelines de Parcerias/Onboarding/Farming
    // ainda precisam ser confirmados (ver README.md) — quando estiverem
    // mapeados, adicionar aqui seguindo o mesmo padrão de getPipeline().
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error('Erro ao buscar dados do HubSpot:', e);
  process.exit(1);
});
