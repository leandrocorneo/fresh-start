import { useEffect, useMemo, useState } from 'react';
import type { AppData } from './api';
import type { Derived } from './derive';
import { forecastPlayoffs, forecastSwiss } from './forecast';
import type { AnyPicks, PlayoffPicks, StageId, StageRow, SwissPicks, SwissStageId } from './types';

export interface ForecastColumn {
  label: string;
  hint: string;
  values: Map<string, string>;
}

const PREV: Record<SwissStageId, SwissStageId | null> = { stage1: null, stage2: 'stage1', stage3: 'stage2' };

function pct(p: number): string {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  if (p > 0.99) return '>99%';
  if (p < 0.01) return '<1%';
  return `${Math.round(p * 100)}%`;
}

/**
 * Previsão da aba aberta: chance de passar (Swiss) ou acertos esperados (playoffs).
 * Só aparece quando os times da fase já são os reais (não os de uma simulação do usuário).
 */
export function useForecast(
  tab: StageId | null,
  d: Derived,
  stageMap: Partial<Record<StageId, StageRow>>,
  data: AppData | null,
  visiblePicks: (playerId: string, stage: StageId) => AnyPicks | null,
): ForecastColumn | undefined {
  const job = useMemo(() => {
    if (!tab || !data) return null;
    const picks = data.players
      .map((p) => ({ playerId: p.id, picks: visiblePicks(p.id, tab) }))
      .filter((p): p is { playerId: string; picks: AnyPicks } => !!p.picks);

    if (tab === 'playoffs') {
      const ready = d.playoffs.teams.length === 8 && (d.playoffs.fromReal || d.stage3.realDone);
      if (!ready) return null;
      return {
        kind: 'playoffs' as const,
        key: JSON.stringify([tab, d.playoffs.teams.map((t) => t.name), d.playoffs.matches, picks]),
        teams: d.playoffs.teams,
        picks: picks as { playerId: string; picks: PlayoffPicks }[],
      };
    }

    const sd = d[tab];
    const prev = PREV[tab];
    const realTeams = !prev || (stageMap[tab]?.teams.length ?? 0) >= 16 || d[prev].realDone;
    if (!sd.complete || !realTeams) return null;
    return {
      kind: 'swiss' as const,
      key: JSON.stringify([tab, sd.teams.map((t) => t.name), sd.matches, picks]),
      teams: sd.teams,
      matches: sd.matches,
      picks: picks as { playerId: string; picks: SwissPicks }[],
    };
  }, [tab, d, stageMap, data, visiblePicks]);

  const [result, setResult] = useState<{ key: string; column: ForecastColumn } | null>(null);
  const jobKey = job?.key ?? null;

  useEffect(() => {
    if (!job) return;
    if (job.kind === 'playoffs') {
      const exp = forecastPlayoffs(job.teams, d.playoffs.recs, job.picks);
      const values = new Map(
        job.picks.map(({ playerId, picks }) => {
          const n = picks.qf.filter(Boolean).length + picks.sf.filter(Boolean).length + picks.final.filter(Boolean).length;
          return [playerId, `${(exp.get(playerId) ?? 0).toFixed(1).replace('.', ',')} / ${n}`];
        }),
      );
      setResult({
        key: job.key,
        column: {
          label: 'Previsão',
          hint: 'Acertos esperados nos playoffs, pela força de cada time no ranking VRS da Valve (cálculo exato de todas as chaves possíveis).',
          values,
        },
      });
      return;
    }
    const signal = { cancelled: false };
    forecastSwiss({ teams: job.teams, matches: job.matches, picks: job.picks }, signal).then((probs) => {
      if (signal.cancelled) return;
      setResult({
        key: job.key,
        column: {
          label: 'Chance de passar',
          hint: 'Previsão: chance de terminar com 5+ acertos. Simula 20 mil vezes as partidas que faltam, com a força de cada time pelo ranking VRS da Valve e os confrontos pela regra oficial.',
          values: new Map([...probs].map(([id, p]) => [id, pct(p)])),
        },
      });
    });
    return () => {
      signal.cancelled = true;
    };
    // job muda de identidade a cada recarga; a chave só muda quando times, resultados ou palpites mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey]);

  if (!job || !result) return undefined;
  // enquanto recalcula, mantém o último valor da mesma aba
  return result.key === job.key || JSON.parse(result.key)[0] === tab ? result.column : undefined;
}
