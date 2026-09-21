import 'server-only';
import { runJob, SOURCES } from './cache';
import {
  fetchAtivacoesDoMes,
  fetchPipelineClosing,
  fetchPipelineFarming,
  fetchEmbarquesConfirmados,
  fetchOportunidadesDoMes,
  fetchRetargeting,
  fetchCambio,
} from './hubspot/metrics';
import { AREAS } from './hubspot/constants';
import { listUsers } from './slack/client';
import { syncActivations } from './slack/activations';
import { syncAvatars } from './people';
import { fetchWeather } from './weather';
import { fetchTraffic, type TrafficData } from './traffic';
import { setupDatabase } from './setup';

/**
 * Os jobs que rodam de 2 em 2 horas.
 *
 * Cada fonte é independente: se o HubSpot cair, o clima continua atualizando,
 * e vice-versa. Uma falha nunca apaga o dado anterior — quem garante isso é a
 * camada de cache, em runJob().
 */

export interface RefreshReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  setup?: unknown;
  resultados: { fonte: string; ok: boolean; erro?: string }[];
  sucessos: number;
  falhas: number;
}

/** Mapa nome → foto, consumido pelo dashboard sem tocar no Slack. */
async function buildAvatarMap(): Promise<Record<string, string>> {
  const users = await listUsers();
  const map: Record<string, string> = {};
  for (const u of users) {
    if (!u.avatarUrl) continue;
    for (const key of [u.realName, u.displayName, u.name]) {
      if (key) map[key.toLowerCase().trim()] = u.avatarUrl;
    }
  }
  return map;
}

export async function runAllJobs(): Promise<RefreshReport> {
  const startedAt = new Date();

  // Primeira coisa: garantir que as tabelas existem e o cadastro de pessoas
  // está carregado. É idempotente, então roda a cada ciclo sem efeito colateral
  // — e dispensa qualquer passo manual de terminal para colocar no ar.
  let setup: Awaited<ReturnType<typeof setupDatabase>> | null = null;
  try {
    setup = await setupDatabase();
  } catch (error) {
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      resultados: [
        {
          fonte: 'banco de dados',
          ok: false,
          erro: error instanceof Error ? error.message : String(error),
        },
      ],
      sucessos: 0,
      falhas: 1,
    };
  }

  const tarefas: { fonte: string; fn: () => Promise<unknown> }[] = [
    { fonte: SOURCES.META, fn: fetchAtivacoesDoMes },
    { fonte: SOURCES.PIPELINE_CLOSING, fn: fetchPipelineClosing },
    { fonte: SOURCES.PIPELINE_FARMING, fn: fetchPipelineFarming },
    { fonte: SOURCES.FRETE, fn: fetchEmbarquesConfirmados },
    { fonte: SOURCES.RETARGETING, fn: fetchRetargeting },
    { fonte: SOURCES.CAMBIO, fn: fetchCambio },
    {
      fonte: SOURCES.PARCERIAS_HUNTING,
      fn: () => fetchOportunidadesDoMes(AREAS.HUNTING),
    },
    {
      fonte: SOURCES.PARCERIAS_FARMING,
      fn: () => fetchOportunidadesDoMes(AREAS.FARMING),
    },
    { fonte: SOURCES.AVATARES, fn: buildAvatarMap },
    { fonte: SOURCES.ATIVACOES, fn: syncActivations },
    { fonte: SOURCES.CLIMA, fn: fetchWeather },
    {
      fonte: SOURCES.TRANSITO,
      fn: async () => {
        try {
          return await fetchTraffic();
        } catch (error) {
          // A CET pode falhar sem invalidar o rodízio, que é calculado por
          // regra. Se houver um resultado parcial, ele vale como sucesso.
          const partial = (error as { partial?: TrafficData }).partial;
          if (partial) return partial;
          throw error;
        }
      },
    },
  ];

  // Executa em paralelo: uma fonte lenta não atrasa as outras.
  const resultados = await Promise.all(
    tarefas.map(async ({ fonte, fn }) => {
      const r = await runJob(fonte, fn);
      return { fonte, ok: r.ok, erro: r.error };
    })
  );

  // As fotos das pessoas do cadastro dependem do Slack já ter respondido,
  // então rodam depois do mapa de avatares.
  const avatarJob = await runJob('people.avatars', syncAvatars);
  resultados.push({ fonte: 'people.avatars', ok: avatarJob.ok, erro: avatarJob.error });

  const finishedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    setup,
    resultados,
    sucessos: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
  };
}
