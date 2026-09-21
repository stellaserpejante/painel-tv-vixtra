/**
 * Testa o parser de ativações contra mensagens REAIS extraídas do
 * #celebrations da Vixtra, incluindo os casos-limite observados no canal.
 * Rode com: npx tsx scripts/test-activation-parser.ts
 */
import { parseActivation, parseBRL, parseBRDate, isActivationMessage } from '../src/lib/slack/parse';

const NBSP = ' ';

const casos = [
  {
    nome: 'ativação completa (Kaio Oliveira, 15/09)',
    texto: `OLHA A ATIVAÇÃO AÍ!!! :bell::tada:

Toca o sino!!! Parabéns pela ativação, Kaio Oliveira e Julia Porto!!!

Negócio: EGGERDING BRASIL MINERAIS INDUSTRIAIS LTDA
Limite aprovado ativado: R$${NBSP}500.000
Valor da ativação: R$${NBSP}472.534,72
Data da ativação: 15/09/2026`,
    esperado: {
      clientName: 'EGGERDING BRASIL MINERAIS INDUSTRIAIS LTDA',
      closerName: 'Kaio Oliveira',
      partnerName: 'Julia Porto',
      approvedLimit: 500000,
      activatedValue: 472534.72,
      activationDate: '2026-09-15',
    },
  },
  {
    nome: 'limite aprovado VAZIO (AR Fusion, 15/09)',
    texto: `OLHA A ATIVAÇÃO AÍ!!! :bell::tada:

Toca o sino!!! Parabéns pela ativação, Jarbas Vinícius e Gal Silva!!!

Negócio: AR FUSION BRASIL LTDA
Limite aprovado ativado:
Valor da ativação: R$${NBSP}500.000
Data da ativação: 15/09/2026`,
    esperado: {
      clientName: 'AR FUSION BRASIL LTDA',
      closerName: 'Jarbas Vinícius',
      partnerName: 'Gal Silva',
      approvedLimit: null,
      activatedValue: 500000,
      activationDate: '2026-09-15',
    },
  },
  {
    nome: 'nome de negócio com sufixo (Pneutek, 31/08)',
    texto: `OLHA A ATIVAÇÃO AÍ!!! :bell::tada:

Toca o sino!!! Parabéns pela ativação, Guilherme Belotto e Gal Silva!!!

Negócio: PNEUTEK - Crédito
Limite aprovado ativado:
Valor da ativação: R$${NBSP}600.000
Data da ativação: 31/08/2026`,
    esperado: {
      clientName: 'PNEUTEK - Crédito',
      closerName: 'Guilherme Belotto',
      partnerName: 'Gal Silva',
      approvedLimit: null,
      activatedValue: 600000,
      activationDate: '2026-08-31',
    },
  },
  {
    nome: 'valores milionários (Azul Pack, 28/08)',
    texto: `OLHA A ATIVAÇÃO AÍ!!! :bell::tada:

Toca o sino!!! Parabéns pela ativação, Jarbas Vinícius e Julia Porto!!!

Negócio: AZUL PACK FILMES E EMBALAGENS LTDA
Limite aprovado ativado: R$${NBSP}5.000.000
Valor da ativação: R$${NBSP}5.000.000
Data da ativação: 28/08/2026`,
    esperado: {
      clientName: 'AZUL PACK FILMES E EMBALAGENS LTDA',
      closerName: 'Jarbas Vinícius',
      partnerName: 'Julia Porto',
      approvedLimit: 5000000,
      activatedValue: 5000000,
      activationDate: '2026-08-28',
    },
  },
];

/** Mensagens humanas do canal que NÃO podem virar slide de ativação. */
const naoAtivacoes = [
  'Mais uma hoje posso pedir música?',
  ':rotating_light: *MAIS UMA CELEBRAÇÃO POR AQUI!* :tada::bell:\nA meta do time de *Farming foi batida em agosto!*',
  'Toooop, Gui e Ju! Parabéns pelas ativações!',
];

let falhas = 0;

console.log('\n=== Ativações reais do #celebrations ===\n');
for (const caso of casos) {
  const r = parseActivation(caso.texto);
  const erros: string[] = [];
  if (!r) {
    erros.push('não reconheceu a mensagem como ativação');
  } else {
    for (const [k, v] of Object.entries(caso.esperado)) {
      const got = (r as unknown as Record<string, unknown>)[k];
      if (got !== v) erros.push(`${k}: esperado ${JSON.stringify(v)}, veio ${JSON.stringify(got)}`);
    }
  }
  if (erros.length) {
    falhas += 1;
    console.log(`FALHOU  ${caso.nome}`);
    erros.forEach((e) => console.log(`        ${e}`));
  } else {
    console.log(`ok      ${caso.nome}`);
    console.log(`        ${r!.clientName} · ${r!.closerName} + ${r!.partnerName} · ${r!.activatedValue}`);
  }
}

console.log('\n=== Mensagens que NÃO são ativação ===\n');
for (const texto of naoAtivacoes) {
  const reconhecida = isActivationMessage(texto);
  const parsed = parseActivation(texto);
  const ok = !parsed;
  if (!ok) falhas += 1;
  console.log(`${ok ? 'ok     ' : 'FALHOU '} ignorada: "${texto.slice(0, 48).replace(/\n/g, ' ')}..."${reconhecida && !parsed ? ' (reconhecida mas sem campos — descartada)' : ''}`);
}

console.log('\n=== Conversão de valores ===\n');
const valores: [string, number | null][] = [
  [`R$${NBSP}472.534,72`, 472534.72],
  ['R$ 5.000.000', 5000000],
  ['R$ 1.234,56', 1234.56],
  ['', null],
  ['   ', null],
];
for (const [entrada, esperado] of valores) {
  const got = parseBRL(entrada);
  const ok = got === esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? 'ok     ' : 'FALHOU '} "${entrada}" -> ${got} (esperado ${esperado})`);
}

const dataOk = parseBRDate('31/08/2026') === '2026-08-31';
if (!dataOk) falhas += 1;
console.log(`${dataOk ? 'ok     ' : 'FALHOU '} "31/08/2026" -> ${parseBRDate('31/08/2026')}`);

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
