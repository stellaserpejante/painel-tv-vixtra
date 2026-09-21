/**
 * IDs e propriedades do portal HubSpot da Vixtra (portal 44743501).
 *
 * TUDO neste arquivo foi extraído da definição interna dos relatórios salvos
 * que a Stella indicou como fonte de verdade — não há nenhum valor inventado.
 * Cada bloco cita o relatório de origem para auditoria futura.
 *
 * Se algum número mudar no HubSpot (uma etapa renomeada, um pipeline novo),
 * este é o único arquivo que precisa ser editado.
 */

export const PORTAL_ID = 44743501;

/* ------------------------------------------------------------------ *
 * PIPELINES
 * ------------------------------------------------------------------ */
export const PIPELINES = {
  /** Pipeline comercial principal (Closing / Forecasting / Oportunidades). */
  COMERCIAL: '670574125',
  /** Pipeline de Farming — relatório "Farmers - Funil de Operação". */
  FARMING: '799124839',
  /** Pipeline de Frete — relatório "Lista com Embarques Confirmados - mês". */
  FRETE: '877239977',
} as const;

/* ------------------------------------------------------------------ *
 * ETAPAS (dealstage)
 * ------------------------------------------------------------------ */
export const DEAL_STAGES = {
  /**
   * Etapas que caracterizam um cliente ATIVADO.
   * Fonte: "Volume Ativado - Este mês" (140792840), "Clientes Ativados - Este
   * mês" (149250442) e "Limite de Crédito Ativado - Este mês" (148884903) —
   * os três usam exatamente este par.
   */
  ATIVADOS: ['983479988', '1208919954'],

  /**
   * Etapas em aberto que compõem o pipeline de closing.
   * Fonte: "Forecasting do quarter - Por mês (volume)" (140793599).
   */
  PIPELINE_ABERTO: ['983479985', '983479986', '983479987', '1268615190'],

  /**
   * Etapa de embarque confirmado no pipeline de Frete.
   * Fonte: "Lista com Embarques Confirmados - mês" (169003255).
   */
  EMBARQUE_CONFIRMADO: '1315985497',
} as const;

/* ------------------------------------------------------------------ *
 * PROPRIEDADES CUSTOMIZADAS
 * ------------------------------------------------------------------ */
export const PROPS = {
  /** Valor efetivamente ativado no negócio (moeda). */
  VOLUME_ATIVADO: 'volume_ativado',
  /** Limite de crédito aprovado/ativado (moeda). */
  LIMITE_APROVADO: 'limite_aprovado_credito',
  /** Data em que o negócio foi ativado (tipo `date`). */
  DATA_ATIVACAO: 'data_da_ativacao',
  /** Data em que a oportunidade foi registrada (tipo `date`). */
  DATA_OPORTUNIDADE: 'data_da_oportunidade',
  /** Temperatura do negócio: Quente / Morno / Frio. */
  TEMPERATURA: 'temperatura_do_negocio',
  /** Canal macro: Direto / Farming / Parceirias / Trading. */
  MACRO_CANAL: 'macro_canal',
  /** Tipo de operação no funil de Farming: Nova Operação / Renovação. */
  TIPO_OPERACAO: 'tipo_de_operacao',
  /** Marcação de lead pequeno — vale 0,5 ponto em Parcerias Farming. */
  SMALL_LEAD: 'small_lead',
  /** Pessoa de BDR / Hunter / Farmer associada ao negócio. */
  NOME_BDR: 'nome_bdr__hunter__farmer_',
  /** Padrão HubSpot. */
  OWNER: 'hubspot_owner_id',
  AMOUNT: 'amount',
  DEALNAME: 'dealname',
  DEALSTAGE: 'dealstage',
  PIPELINE: 'pipeline',
  CREATEDATE: 'createdate',
  CLOSEDATE: 'closedate',
} as const;

/**
 * Valores da propriedade `temperatura_do_negocio`.
 * Atenção: no HubSpot o rótulo de "Quente" vem com espaço duplo
 * ("Quente  (Quente)" no dataset do relatório), então a comparação é
 * normalizada em lib/hubspot/metrics.ts em vez de igualdade literal.
 */
export const TEMPERATURAS = {
  QUENTE: 'Quente',
  MORNO: 'Morno',
  FRIO: 'Frio',
} as const;

/** Canais considerados no forecasting. Fonte: relatório 140793599. */
export const MACRO_CANAIS_FORECAST = [
  'Direto',
  'Farming',
  'Parceirias', // grafia exata do HubSpot, com o "i" extra — não corrigir
  'Trading',
] as const;

/**
 * Owners incluídos no relatório de Forecasting do quarter.
 * Fonte: filtro `hubspot_owner_id IN (...)` do relatório 140793599.
 * Mantido explícito para reproduzir o gráfico fielmente; se o time mudar,
 * atualizar aqui.
 */
export const FORECAST_OWNER_IDS = [
  '746504206',
  '19342453',
  '1115600915',
  '252246912',
  '1411261526',
  '84532627',
  '89091132',
  '2069515993',
] as const;

/* ------------------------------------------------------------------ *
 * ÁREAS DE OPORTUNIDADES
 *
 * Mapeamento confirmado pela Stella, dashboard por dashboard, e validado
 * lendo a definição de cada relatório. Os números entre parênteses são os
 * valores que o HubSpot retornava em 21/09/2026, usados como referência
 * para conferir a implementação depois do deploy.
 * ------------------------------------------------------------------ */
export const AREAS = {
  /**
   * Parcerias Hunting — dashboard 20139959, relatório 168996449 (5 opps).
   * Contagem simples de oportunidades, sem pontuação.
   */
  HUNTING: {
    reportId: 168996449,
    dashboardId: 20139959,
    pipeline: PIPELINES.COMERCIAL,
    bdrIds: ['1598055246', '85322310'],
    dateProperty: PROPS.DATA_OPORTUNIDADE,
    usarSmallLead: false,
  },

  /**
   * Parcerias Farming — dashboard 17422192, relatório 149259364 (11 opps).
   * Aqui vale a regra de pontuação: Small Lead = Sim → 0,5; Não → 1.
   */
  FARMING: {
    reportId: 149259364,
    dashboardId: 17422192,
    pipeline: PIPELINES.COMERCIAL,
    bdrIds: ['2069515993', '85322310', '1566756950'],
    dateProperty: PROPS.DATA_OPORTUNIDADE,
    usarSmallLead: true,
  },
} as const;

/**
 * Retargeting — dashboard 20142518, relatório 169016141 (2 opps).
 * Estrutura diferente das demais: pipeline próprio, recorte pelo time
 * (não pelo proprietário) e data medida pela ENTRADA na etapa 983301662,
 * não por data_da_oportunidade.
 */
export const RETARGETING = {
  reportId: 169016141,
  dashboardId: 20142518,
  pipeline: '670475949',
  teamId: '60328493',
  /** Data de entrada na etapa que caracteriza a oportunidade. */
  dateProperty: 'hs_v2_date_entered_983301662',
  pessoa: 'Gal Silva',
} as const;

/**
 * Câmbio — dashboard 19074932, relatório 161366173 "Solicitações
 * semanalmente - Mensal" (5 solicitações em setembro/2026).
 * É a contagem de negócios criados no mês dentro do pipeline de câmbio.
 * O relatório não separa por pessoa: o número é do time, o que casa com o
 * pedido de mostrar Gabriella e Julia juntas.
 */
export const CAMBIO = {
  reportId: 161366173,
  dashboardId: 19074932,
  pipeline: '843320843',
  dateProperty: PROPS.CREATEDATE,
  pessoas: ['Gabriella Machado', 'Julia Guimaraes'],
} as const;

/** Frete — pessoa responsável (grafia confirmada pela Stella). */
export const FRETE = {
  reportId: 169003255,
  dashboardId: 19471670,
  pessoa: 'Luciana Turisco',
} as const;

/**
 * Relatórios de referência no HubSpot — guardados para rastreabilidade e
 * para a página de diagnóstico do admin.
 */
export const SOURCE_REPORTS = {
  VOLUME_ATIVADO: { id: 140792840, name: 'Volume Ativado - Este mês' },
  CLIENTES_ATIVADOS: { id: 149250442, name: 'Clientes Ativados - Este mês' },
  CREDITO_APROVADO: { id: 148884903, name: 'Limite de Crédito Ativado - Este mês' },
  FORECASTING_QUARTER: { id: 140793599, name: 'Forecasting do quarter - Por mês (volume)' },
  FARMERS_FUNIL: { id: 155079282, name: 'Farmers - Funil de Operação' },
  EMBARQUES: { id: 169003255, name: 'Lista com Embarques Confirmados - mês' },
} as const;
