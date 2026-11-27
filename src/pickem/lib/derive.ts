import { SEEDS } from './config';
import type { Match, StageId, StageRow, SwissStageId, Team } from './types';
import { dedupeTeams, orderTeams, teamKey } from './teams';
import { isDone, qualifiersFromRecs, recordsFromMatches, simulateSwiss, type Recs, type SimResult } from './swiss';
import { playoffRecords, type PlayoffRecs } from './scoring';

export interface SwissDerived {
  id: SwissStageId;
  teams: Team[]; // ordem = seed
  complete: boolean; // 16 times definidos
  matches: Match[];
  realRecs: Recs;
  realDone: boolean;
  sim: SimResult | null;
  qualifiers: Team[]; // reais se a fase acabou, senão os da simulação do usuário
}

export interface PlayoffDerived {
  teams: Team[]; // 8, ordem = seed
  fromReal: boolean;
  matches: Match[];
  recs: PlayoffRecs;
}

export interface Derived {
  stage1: SwissDerived;
  stage2: SwissDerived;
  stage3: SwissDerived;
  playoffs: PlayoffDerived;
  logoOf: (name: string) => string | null;
}

export function deriveAll(
  stages: Partial<Record<StageId, StageRow>>,
  sims: Partial<Record<StageId, Record<string, string>>>,
): Derived {
  const logos = new Map<string, string>();
  Object.values(stages).forEach((s) =>
    (s?.teams ?? []).forEach((t) => {
      if (t.logo && !logos.has(teamKey(t.name))) logos.set(teamKey(t.name), t.logo);
    }),
  );
  const logoOf = (name: string) => logos.get(teamKey(name)) ?? null;
  const withLogo = (t: Team): Team => ({ name: t.name, logo: t.logo ?? logoOf(t.name) });

  function swiss(id: SwissStageId, prevQualifiers: Team[] | null): SwissDerived {
    const row = stages[id];
    const realTeams = row?.teams ?? [];
    let base: Team[];
    if (realTeams.length >= 16) base = realTeams;
    else if (id === 'stage1') base = dedupeTeams([...realTeams, ...SEEDS.stage1.map((name) => ({ name }))]);
    else {
      const invited = realTeams.length > 0 ? realTeams : SEEDS[id].map((name) => ({ name }));
      base = dedupeTeams([...invited, ...(prevQualifiers ?? [])]);
    }
    const tail = (prevQualifiers ?? []).map((t) => t.name);
    const teams = orderTeams(base, SEEDS[id], tail).slice(0, 16).map(withLogo);
    const complete = teams.length === 16;
    const matches = row?.matches ?? [];
    const realRecs = recordsFromMatches(teams, matches);
    const realDone = complete && [...realRecs.values()].every(isDone);
    const sim = complete ? simulateSwiss(teams, sims[id] ?? {}, matches) : null;
    const qualifiers = realDone ? qualifiersFromRecs(realRecs) : sim?.done ? qualifiersFromRecs(sim.recs) : [];
    return { id, teams, complete, matches, realRecs, realDone, sim, qualifiers: qualifiers.map(withLogo) };
  }

  const stage1 = swiss('stage1', null);
  const stage2 = swiss('stage2', stage1.qualifiers.length === 8 ? stage1.qualifiers : null);
  const stage3 = swiss('stage3', stage2.qualifiers.length === 8 ? stage2.qualifiers : null);

  const prow = stages.playoffs;
  const fromReal = (prow?.teams?.length ?? 0) >= 8;
  const pteams = (fromReal ? prow!.teams : stage3.qualifiers).slice(0, 8).map(withLogo);
  const pmatches = prow?.matches ?? [];

  return {
    stage1,
    stage2,
    stage3,
    playoffs: { teams: pteams, fromReal, matches: pmatches, recs: playoffRecords(pmatches) },
    logoOf,
  };
}

export function isLocked(row: StageRow | undefined, now = Date.now()): boolean {
  return !!row?.lock_at && now >= new Date(row.lock_at).getTime();
}
