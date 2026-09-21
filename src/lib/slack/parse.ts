/**
 * Funções puras de leitura das mensagens de ativação do #celebrations.
 *
 * Fica separado de activations.ts (que fala com banco e Slack) justamente
 * para poder ser testado fora do Next.js — ver scripts/test-activation-parser.ts.
 */

/** Dias que o slide de ativação permanece no ar (item 20 da especificação). */
export const ACTIVATION_TTL_DAYS = 5;

export interface ParsedActivation {
  clientName: string;
  closerName: string | null;
  partnerName: string | null;
  approvedLimit: number | null;
  activatedValue: number | null;
  activationDate: string | null;
}

/**
 * Converte "R$ 472.534,72" em 472534.72.
 * O Slack usa espaço não separável depois do R$, por isso o \s inclui  .
 */
export function parseBRL(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/[\s ]/g, '')
    .trim();
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Converte "15/09/2026" em "2026-09-15". */
export function parseBRDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Reconhece se a mensagem é uma ativação do HubSpot. */
export function isActivationMessage(text: string): boolean {
  return /olha a ativa[çc][ãa]o/i.test(text) || /parab[ée]ns pela ativa[çc][ãa]o/i.test(text);
}

export function parseActivation(text: string): ParsedActivation | null {
  if (!isActivationMessage(text)) return null;

  const field = (label: string): string | undefined => {
    const re = new RegExp(`${label}\\s*:\\s*(.*)`, 'i');
    return text.match(re)?.[1]?.trim() || undefined;
  };

  const clientName = field('Neg[óo]cio');
  if (!clientName) return null;

  // "Parabéns pela ativação, Kaio Oliveira e Julia Porto!!!"
  let closerName: string | null = null;
  let partnerName: string | null = null;
  const peopleMatch = text.match(/parab[ée]ns pela ativa[çc][ãa]o,\s*([^!\n]+)/i);
  if (peopleMatch) {
    const names = peopleMatch[1]
      .split(/\s+e\s+|\s*,\s*/i)
      .map((n) => n.replace(/[!.]+$/, '').trim())
      .filter(Boolean);
    closerName = names[0] ?? null;
    partnerName = names[1] ?? null;
  }

  return {
    clientName,
    closerName,
    partnerName,
    approvedLimit: parseBRL(field('Limite aprovado ativado')),
    activatedValue: parseBRL(field('Valor da ativa[çc][ãa]o')),
    activationDate: parseBRDate(field('Data da ativa[çc][ãa]o')),
  };
}

/** Converte o timestamp do Slack ("1789496290.009429") em Date. */
export function slackTsToDate(ts: string): Date {
  return new Date(Number(ts.split('.')[0]) * 1000);
}

