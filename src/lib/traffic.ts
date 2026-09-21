import 'server-only';
import { TZDate } from '@date-fns/tz';
import { TIMEZONE, formatTime } from './time';

/**
 * TRÂNSITO E RODÍZIO — item 24 da especificação.
 *
 * INVESTIGAÇÃO DAS FONTES (feita antes de implementar, como pedido):
 *
 * 1. APILIB da Prefeitura de São Paulo publica a API oficial
 *    "LentidaoTransito v1" sob a tag CET, em
 *    gateway.apilib.prefeitura.sp.gov.br/cet/lentidao/v1, com autenticação
 *    Bearer. PORÉM: a base cobre apenas dados HISTÓRICOS de 2001 a 2018.
 *    Não serve para tempo real. Descartada para este uso.
 *
 * 2. A CET não publica webservice aberto de lentidão em tempo real. A página
 *    "Trânsito Agora" (cetsp.com.br/transito-agora.aspx) é renderizada no
 *    servidor e traz os números por região em texto, no formato
 *    "Lentidão: 22 km(9%)". É a fonte pública mais confiável disponível.
 *
 * DECISÃO: lemos essa página no backend, a cada 2 horas, e extraímos os
 * números por região. LIMITAÇÃO DOCUMENTADA: por não ser uma API versionada,
 * uma mudança no HTML da CET pode quebrar a extração. O sistema trata isso
 * como qualquer outra falha — mantém o último dado válido e sinaliza o erro
 * na página de diagnóstico, sem derrubar o slide.
 *
 * O RODÍZIO, por outro lado, é determinístico: não depende de fonte externa
 * nenhuma, é calculado por regra a partir do dia da semana.
 */

const CET_URL = 'https://www.cetsp.com.br/transito-agora.aspx';

export interface TrafficRegion {
  name: string;
  km: number;
  pct: number;
  level: 'ok' | 'mid' | 'bad';
}

export interface TrafficData {
  regions: TrafficRegion[];
  totalKm: number;
  rodizio: string;
  rodizioAtivo: boolean;
  source: string;
  updatedAt: string;
  updatedAtISO: string;
  /** Preenchido quando a leitura da CET falha mas o rodízio continua válido. */
  aviso?: string;
}

/* ------------------------------------------------------------------ *
 * RODÍZIO MUNICIPAL — regra fixa, sem fonte externa
 * Segunda 1 e 2 · Terça 3 e 4 · Quarta 5 e 6 · Quinta 7 e 8 · Sexta 9 e 0
 * Faixas de horário: 07h–10h e 17h–20h. Sábado e domingo não há rodízio.
 * ------------------------------------------------------------------ */

const RODIZIO_POR_DIA: Record<number, string> = {
  1: 'Placas final 1 e 2',
  2: 'Placas final 3 e 4',
  3: 'Placas final 5 e 6',
  4: 'Placas final 7 e 8',
  5: 'Placas final 9 e 0',
};

export function getRodizio(reference?: Date): { texto: string; ativo: boolean } {
  const now = new TZDate(reference ?? new Date(), TIMEZONE);
  const dia = now.getDay(); // 0 = domingo
  const regra = RODIZIO_POR_DIA[dia];

  if (!regra) {
    return { texto: 'Sem rodízio no fim de semana', ativo: false };
  }

  const hora = now.getHours();
  const emFaixa = (hora >= 7 && hora < 10) || (hora >= 17 && hora < 20);

  return {
    texto: emFaixa ? `${regra} — em vigor agora` : `${regra} · 7h-10h e 17h-20h`,
    ativo: true,
  };
}

/* ------------------------------------------------------------------ *
 * LENTIDÃO POR REGIÃO — leitura da página da CET
 * ------------------------------------------------------------------ */

const REGIOES = ['Norte', 'Sul', 'Leste', 'Oeste', 'Centro'] as const;

function nivel(pct: number): TrafficRegion['level'] {
  if (pct >= 25) return 'bad';
  if (pct >= 15) return 'mid';
  return 'ok';
}

/**
 * Extrai os números do HTML da CET.
 * Exportada separadamente para poder ser testada sem rede.
 */
export function parseCetHtml(html: string): TrafficRegion[] {
  const entidades: Record<string, string> = {
    '&nbsp;': ' ', '&atilde;': 'ã', '&aacute;': 'á', '&acirc;': 'â',
    '&ccedil;': 'ç', '&eacute;': 'é', '&ecirc;': 'ê', '&iacute;': 'í',
    '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&uacute;': 'ú',
    '&amp;': '&',
  };

  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, (e) => entidades[e.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ');

  const regions: TrafficRegion[] = [];

  for (const nome of REGIOES) {
    // Procura "Norte ... Lentidão: 22 km(9%)". O trecho entre o nome da
    // região e o número costuma trazer o rótulo de severidade ("ALTA" /
    // "BAIXA"), por isso o intervalo aceita qualquer caractere — de forma
    // preguiçosa, para casar sempre com a ocorrência mais próxima.
    const re = new RegExp(
      `\\b${nome}\\b[\\s\\S]{0,120}?Lentid[ãa]o\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*km\\s*\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*%`,
      'i'
    );
    const m = texto.match(re);
    if (!m) continue;

    const km = Number(m[1].replace(',', '.'));
    const pct = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(km) || !Number.isFinite(pct)) continue;

    regions.push({ name: nome, km, pct, level: nivel(pct) });
  }

  return regions.sort((a, b) => b.km - a.km);
}

export async function fetchTraffic(): Promise<TrafficData> {
  const now = new Date();
  const rodizio = getRodizio(now);

  const base: TrafficData = {
    regions: [],
    totalKm: 0,
    rodizio: rodizio.texto,
    rodizioAtivo: rodizio.ativo,
    source: 'CET-SP · Trânsito Agora',
    updatedAt: formatTime(now),
    updatedAtISO: now.toISOString(),
  };

  try {
    const res = await fetch(CET_URL, {
      cache: 'no-store',
      headers: {
        // A CET recusa requisições sem user-agent de navegador.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`CET respondeu ${res.status}`);

    const regions = parseCetHtml(await res.text());
    if (regions.length === 0) {
      throw new Error('não foi possível localizar os números de lentidão no HTML da CET');
    }

    return {
      ...base,
      regions,
      totalKm: Number(regions.reduce((s, r) => s + r.km, 0).toFixed(1)),
    };
  } catch (error) {
    // O rodízio é calculado por regra e continua correto mesmo sem a CET.
    // Devolvemos o que temos, sinalizando o aviso; a camada de cache
    // preserva as regiões da última leitura bem-sucedida.
    const message = error instanceof Error ? error.message : String(error);
    throw Object.assign(new Error(`Lentidão da CET indisponível: ${message}`), {
      partial: { ...base, aviso: 'Lentidão indisponível — exibindo apenas o rodízio' },
    });
  }
}
