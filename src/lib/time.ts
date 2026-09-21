/**
 * CAMADA CENTRAL DE DATAS — fonte única de verdade do projeto.
 *
 * REGRA DE OURO: nenhum outro arquivo do sistema pode escrever um mês, um ano
 * ou uma data literal. Toda consulta mensal, trimestral ou de "últimos 30 dias"
 * passa obrigatoriamente por aqui. Assim, quando virar outubro, novembro ou
 * dezembro, o dashboard inteiro muda de período sozinho, sem deploy.
 *
 * Todo cálculo é ancorado no fuso America/Sao_Paulo, que é também o fuso do
 * portal HubSpot da Vixtra (confirmado via API: timeZone "America/Sao_Paulo").
 */

import { TZDate } from '@date-fns/tz';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfDay,
  endOfDay,
  subDays,
  getMonth,
  getYear,
  getQuarter,
} from 'date-fns';

export const TIMEZONE = 'America/Sao_Paulo';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

/**
 * "Agora" no fuso de São Paulo. Aceita uma data injetada para testes
 * determinísticos — em produção é sempre chamada sem argumento.
 */
export function nowInSaoPaulo(reference?: Date): TZDate {
  return new TZDate(reference ?? new Date(), TIMEZONE);
}

/** Mês vigente, 1 = Janeiro ... 12 = Dezembro. */
export function getCurrentMonth(reference?: Date): number {
  return getMonth(nowInSaoPaulo(reference)) + 1;
}

/** Ano vigente (4 dígitos). */
export function getCurrentYear(reference?: Date): number {
  return getYear(nowInSaoPaulo(reference));
}

/** Nome do mês vigente em português, capitalizado. Ex.: "Setembro". */
export function getCurrentMonthName(reference?: Date): string {
  return MONTH_NAMES_PT[getCurrentMonth(reference) - 1];
}

/** Nome de um mês qualquer (1-12) em português. */
export function getMonthName(month: number): string {
  return MONTH_NAMES_PT[month - 1];
}

/** Primeiro instante do mês vigente, no fuso de São Paulo. */
export function getMonthStart(reference?: Date): Date {
  return new Date(startOfMonth(nowInSaoPaulo(reference)).getTime());
}

/** Último instante do mês vigente (23:59:59.999), no fuso de São Paulo. */
export function getMonthEnd(reference?: Date): Date {
  return new Date(endOfMonth(nowInSaoPaulo(reference)).getTime());
}

/** Quarter vigente: número (1-4), ano e limites do período. */
export function getCurrentQuarter(reference?: Date): {
  quarter: number;
  year: number;
  start: Date;
  end: Date;
} {
  const now = nowInSaoPaulo(reference);
  return {
    quarter: getQuarter(now),
    year: getYear(now),
    start: new Date(startOfQuarter(now).getTime()),
    end: new Date(endOfQuarter(now).getTime()),
  };
}

/**
 * Janela móvel dos últimos 30 dias — sempre relativa a hoje, nunca fixa.
 * Usada no slide de Evolução da Carteira.
 */
export function getLast30Days(reference?: Date): { start: Date; end: Date } {
  const now = nowInSaoPaulo(reference);
  return {
    start: new Date(startOfDay(subDays(now, 29)).getTime()),
    end: new Date(endOfDay(now).getTime()),
  };
}

/** Período mensal pronto para uso nas consultas, com rótulos já formatados. */
export interface MonthlyPeriod {
  month: number;
  year: number;
  monthName: string;
  /** Chave estável usada no banco e no cache. Ex.: "2026-09". */
  key: string;
  start: Date;
  end: Date;
}

export function getCurrentPeriod(reference?: Date): MonthlyPeriod {
  const month = getCurrentMonth(reference);
  const year = getCurrentYear(reference);
  return {
    month,
    year,
    monthName: getMonthName(month),
    key: `${year}-${String(month).padStart(2, '0')}`,
    start: getMonthStart(reference),
    end: getMonthEnd(reference),
  };
}

/* ------------------------------------------------------------------ *
 * Conversões para os filtros da API do HubSpot
 * ------------------------------------------------------------------ */

/**
 * Propriedades do tipo `date` no HubSpot (ex.: data_da_ativacao,
 * data_da_oportunidade) são armazenadas como meia-noite UTC do dia.
 * Filtrar por elas exige mandar exatamente meia-noite UTC — mandar o
 * instante local faz o primeiro e o último dia do mês escaparem do filtro.
 */
export function toHubSpotDateValue(date: Date): string {
  const tz = new TZDate(date, TIMEZONE);
  return String(
    Date.UTC(tz.getFullYear(), tz.getMonth(), tz.getDate(), 0, 0, 0, 0)
  );
}

/** Propriedades `datetime` (ex.: createdate) usam epoch em milissegundos. */
export function toHubSpotDateTimeValue(date: Date): string {
  return String(date.getTime());
}

/** Intervalo pronto para o operador BETWEEN em propriedades `date`. */
export function toHubSpotDateRange(start: Date, end: Date): {
  value: string;
  highValue: string;
} {
  return {
    value: toHubSpotDateValue(start),
    highValue: toHubSpotDateValue(end),
  };
}

/* ------------------------------------------------------------------ *
 * Formatação para exibição
 * ------------------------------------------------------------------ */

/** "14:32" no fuso de São Paulo — usado no selo "Última atualização". */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  }).format(date);
}

/** "21/09/2026" no fuso de São Paulo. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

/** "21/09" — formato curto usado nos cards de aniversário. */
export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TIMEZONE,
  }).format(date);
}
