/**
 * fetch-transito.js
 * ------------------------------------------------------------------
 * Extrai os dados de "Trânsito Agora" do site da CET-SP (cetsp.com.br).
 * Não existe API pública — isso faz parsing do HTML da página inicial.
 *
 * Como o HTML da CET pode mudar sem aviso, este script foi escrito para
 * ser tolerante a pequenas variações, mas vale revisar se ele parar de
 * funcionar (o seletor principal são os títulos de região: Norte, Sul,
 * Leste, Oeste, Centro, cada um seguido de "X km" e "(Y%)").
 *
 * Uso:
 *   node scripts/fetch-transito.js > transito-data.json
 * ------------------------------------------------------------------
 */

async function fetchTransito() {
  const res = await fetch('https://www.cetsp.com.br/');
  if (!res.ok) throw new Error(`CET-SP retornou HTTP ${res.status}`);
  const html = await res.text();

  // Rodízio (ex: "Rodízio: Placas de final 7 e 8")
  const rodizioMatch = html.match(/Rod[íi]zio:\s*Placas de final\s*([\dA-Za-z\s e]+?)</i);
  const rodizio = rodizioMatch ? `Placas final ${rodizioMatch[1].trim()}` : null;

  // Data (ex: "São Paulo, 20 de agosto de 2026")
  const dataMatch = html.match(/S[ãa]o Paulo,\s*(\d{1,2} de \w+ de \d{4})/i);
  const dataAtualizacao = dataMatch ? dataMatch[1] : null;

  // Cada região: nome, seguido em algum ponto próximo por "NN km" e "(NN%)"
  const regioes = ['Norte', 'Oeste', 'Centro', 'Leste', 'Sul'];
  const traffic = [];

  for (const nome of regioes) {
    // Procura o bloco de HTML entre o nome da região e a próxima ocorrência
    // de "km" seguida de "%", tolerando tags HTML no meio.
    const regex = new RegExp(
      `${nome}[\\s\\S]{0,200}?(\\d+)\\s*km[\\s\\S]{0,100}?\\((\\d+)%\\)`,
      'i'
    );
    const m = html.match(regex);
    if (m) {
      const km = Number(m[1]);
      const pct = Number(m[2]);
      const level = pct < 15 ? 'ok' : pct < 25 ? 'mid' : 'bad';
      traffic.push({ name: nome, km, pct, level });
    }
  }

  // Ordena da maior para a menor lentidão, como no painel
  traffic.sort((a, b) => b.pct - a.pct);

  return {
    rodizio,
    trafficUpdatedAt: dataAtualizacao
      ? `${dataAtualizacao} (fonte: CET-SP)`
      : 'fonte: CET-SP',
    traffic,
  };
}

fetchTransito()
  .then((data) => console.log(JSON.stringify(data, null, 2)))
  .catch((e) => {
    console.error('Erro ao buscar dados de trânsito da CET-SP:', e);
    process.exit(1);
  });
