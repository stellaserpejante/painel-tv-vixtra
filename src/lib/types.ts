/**
 * Tipos normalizados do dashboard.
 *
 * Nenhuma estrutura específica do HubSpot ou do Slack atravessa esta
 * fronteira: o frontend só conhece os tipos daqui. Trocar uma fonte de dados
 * amanhã não obriga a mexer em componente nenhum.
 */

export interface Person {
  id: string;
  name: string;
  slackUserId?: string | null;
  avatarUrl?: string | null;
  /** Cor de fallback do avatar quando não há foto. */
  color?: string;
}

export type SlideType =
  | 'goal'
  | 'funnel'
  | 'farming'
  | 'wallet'
  | 'ranking'
  | 'celebration'
  | 'birthdays'
  | 'companyAnniv'
  | 'newhire'
  | 'news'
  | 'weather';

export interface BaseSlide {
  type: SlideType;
  duration: number;
  eyebrow: string;
  showMonth?: boolean;
  /** Horário da última atualização bem-sucedida da fonte deste slide. */
  updatedAt?: string | null;
  /** Marcado quando a fonte falhou e estamos exibindo o último dado válido. */
  stale?: boolean;
}

export interface GoalSlide extends BaseSlide {
  type: 'goal';
  metaValor: number | null;
  atual: number;
  clientesAtivados: number;
  clientesLista: string[];
  creditoAprovado: number;
}

export interface FunnelSlide extends BaseSlide {
  type: 'funnel';
  subtitle: string;
  quenteTotal: number;
  mornoTotal: number;
  top3: {
    name: string;
    value: number;
    temp: string;
    owner: string | null;
    ownerAvatar?: string | null;
  }[];
}

export interface FarmingSlide extends BaseSlide {
  type: 'farming';
  farmers: {
    name: string;
    avatarUrl?: string | null;
    novaOperacao: number;
    renovacao: number;
    total: number;
  }[];
  totalNovaOperacao: number;
  totalRenovacao: number;
}

export interface WalletSlide extends BaseSlide {
  type: 'wallet';
  imageUrl: string | null;
  caption?: string | null;
  uploadedAt?: string | null;
}

export interface RankingSeller {
  name: string;
  avatarUrl?: string | null;
  color?: string;
  value?: number;
  deals?: number;
  oportunidades?: number;
  metricLabel?: string;
  people?: Person[];
}

export interface RankingSlide extends BaseSlide {
  type: 'ranking';
  divisions: { name: string; sellers: RankingSeller[] }[];
}

export interface CelebrationSlide extends BaseSlide {
  type: 'celebration';
  who: string;
  whoAvatar?: string | null;
  partner?: string | null;
  partnerAvatar?: string | null;
  client: string;
  amount: string;
  approvedLimit?: string | null;
  activationDate?: string | null;
}

export interface BirthdaysSlide extends BaseSlide {
  type: 'birthdays';
  people: { name: string; date: string; avatarUrl?: string | null; color?: string }[];
}

export interface CompanyAnnivSlide extends BaseSlide {
  type: 'companyAnniv';
  people: { name: string; date: string; years: number; avatarUrl?: string | null; color?: string }[];
}

export interface NewHireSlide extends BaseSlide {
  type: 'newhire';
  name: string;
  role: string | null;
  quote: string | null;
  joined: string;
  avatarUrl?: string | null;
}

export interface NewsSlide extends BaseSlide {
  type: 'news';
  items: { tag: string; title: string; text: string }[];
}

export interface WeatherSlide extends BaseSlide {
  type: 'weather';
  city: string;
  temp: string;
  feelsLike: string;
  cond: string;
  icon: string;
  tempMax: string;
  tempMin: string;
  rainProbability: number;
  rodizio: string;
  traffic: { name: string; km: number; pct: number; level: string }[];
  trafficUpdatedAt: string;
  trafficAviso?: string;
}

export type Slide =
  | GoalSlide
  | FunnelSlide
  | FarmingSlide
  | WalletSlide
  | RankingSlide
  | CelebrationSlide
  | BirthdaysSlide
  | CompanyAnnivSlide
  | NewHireSlide
  | NewsSlide
  | WeatherSlide;

export interface DashboardPayload {
  slides: Slide[];
  monthName: string;
  year: number;
  /** Horário da atualização mais recente entre todas as fontes. */
  lastUpdate: string | null;
  /** Fontes com problema no momento — o rodapé mostra discretamente. */
  degraded: string[];
  generatedAt: string;
}
