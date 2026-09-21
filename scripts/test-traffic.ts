import { parseCetHtml, getRodizio } from '../src/lib/traffic';

// Trecho no formato real da página "Trânsito Agora" da CET
const html = `
<div class="regiao"><h3>Norte</h3><span class="sev">BAIXA</span><p>Lentidão: 22 km(9%)</p></div>
<div class="regiao"><h3>Oeste</h3><span class="sev">ALTA</span><p>Lentidão: 54 km(23%)</p></div>
<div class="regiao"><h3>Centro</h3><span class="sev">BAIXA</span><p>Lentid&atilde;o: 27 km(11%)</p></div>
<div class="regiao"><h3>Leste</h3><span class="sev">ALTA</span><p>Lentidão: 82 km(35%)</p></div>
<div class="regiao"><h3>Sul</h3><span class="sev">ALTA</span><p>Lentidão: 52 km(22%)</p></div>
<script>var x = "Norte Lentidão: 999 km(99%)";</script>`;

const r = parseCetHtml(html);
console.log('=== Lentidão extraída da CET ===');
r.forEach(x => console.log(`  ${x.name.padEnd(7)} ${String(x.km).padStart(3)} km  ${String(x.pct).padStart(2)}%  -> ${x.level}`));
const total = r.reduce((s,x)=>s+x.km,0);
console.log(`  total: ${total} km  |  regiões: ${r.length}/5`);
const okParse = r.length === 5 && total === 237 && r[0].name === 'Leste' && r[0].level === 'bad'
  && r.find(x=>x.name==='Norte')!.level === 'ok';
console.log(okParse ? '  PASSOU\n' : '  FALHOU\n');

console.log('=== Rodízio por dia (fuso São Paulo) ===');
const dias = ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
const nomes = ['seg','ter','qua','qui','sex','sáb','dom'];
dias.forEach((d,i) => {
  const foraFaixa = getRodizio(new Date(`${d}T14:00:00-03:00`));
  const naFaixa   = getRodizio(new Date(`${d}T08:30:00-03:00`));
  console.log(`  ${nomes[i]} ${d}: ${foraFaixa.texto}`);
  if (naFaixa.ativo) console.log(`         08h30 -> ${naFaixa.texto}`);
});
process.exit(okParse ? 0 : 1);
