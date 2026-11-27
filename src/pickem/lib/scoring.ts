import type { GradedPick, Match, PickStatus, PlayoffPicks, PlayoffRound, SwissCategory, SwissPicks } from './types';
import type { Rec, Recs } from './swiss';
import { teamKey } from './teams';

/**
 * Regras do Pick'em do CS2 (fases Swiss):
 *  - 3-0: só acerta se o time terminar 3-0. Uma derrota já é erro.
 *  - Avança (3-1 / 3-2): acerta se classificar com 3-1 ou 3-2.
 *    Erra se for eliminado OU se classificar com 3-0.
 *  - 0-3: só acerta se terminar 0-3. Uma vitória já é erro.
 */
export function swissPickStatus(cat: SwissCategory, rec: Rec | undefined): PickStatus {
  if (!rec) return 'pending';
  const { w, l } = rec;
  if (cat === 'three_zero') return l > 0 ? 'wrong' : w >= 3 ? 'correct' : 'pending';
  if (cat === 'zero_three') return w > 0 ? 'wrong' : l >= 3 ? 'correct' : 'pending';
  if (l >= 3) return 'wrong';
  if (w >= 3) return l === 0 ? 'wrong' : 'correct';
  return 'pending';
}

export interface Grade {
  items: GradedPick[];
  correct: number;
  wrong: number;
  pending: number;
}

function tally(items: GradedPick[]): Grade {
  return {
    items,
    correct: items.filter((i) => i.status === 'correct').length,
    wrong: items.filter((i) => i.status === 'wrong').length,
    pending: items.filter((i) => i.status === 'pending').length,
  };
}

export function gradeSwiss(p: SwissPicks, recs: Recs): Grade {
  const items: GradedPick[] = [];
  (['three_zero', 'advance', 'zero_three'] as SwissCategory[]).forEach((cat) =>
    (p?.[cat] ?? []).forEach((team) => items.push({ team, slot: cat, status: swissPickStatus(cat, recs.get(teamKey(team))) })),
  );
  return tally(items);
}

// ---------------------------------------------------------------- playoffs

export interface PlayoffRec {
  wins: number; // vitórias antes da primeira derrota (ignora disputa de 3º lugar)
  out: boolean;
}
export type PlayoffRecs = Map<string, PlayoffRec>;

export function playoffRecords(matches: Match[]): PlayoffRecs {
  const recs: PlayoffRecs = new Map();
  const get = (k: string) => {
    if (!recs.has(k)) recs.set(k, { wins: 0, out: false });
    return recs.get(k)!;
  };
  for (const m of matches) {
    if (m.score1 === m.score2) continue;
    const a = get(teamKey(m.team1));
    const b = get(teamKey(m.team2));
    const [win, lose] = m.score1 > m.score2 ? [a, b] : [b, a];
    if (!win.out) win.wins++;
    lose.out = true;
  }
  return recs;
}

const NEEDED: Record<PlayoffRound, number> = { qf: 1, sf: 2, final: 3 };

export function playoffPickStatus(round: PlayoffRound, rec: PlayoffRec | undefined): PickStatus {
  if (!rec) return 'pending';
  if (rec.wins >= NEEDED[round]) return 'correct';
  return rec.out ? 'wrong' : 'pending';
}

export function gradePlayoffs(p: PlayoffPicks, recs: PlayoffRecs): Grade {
  const items: GradedPick[] = [];
  (['qf', 'sf', 'final'] as PlayoffRound[]).forEach((round) =>
    (p?.[round] ?? []).filter(Boolean).forEach((team) =>
      items.push({ team, slot: round, status: playoffPickStatus(round, recs.get(teamKey(team))) }),
    ),
  );
  return tally(items);
}

/** Converte uma simulação Swiss terminada em palpites. */
export function picksFromRecs(recs: Recs): SwissPicks {
  const all = [...recs.values()].sort((a, b) => a.seed - b.seed);
  return {
    three_zero: all.filter((r) => r.w === 3 && r.l === 0).map((r) => r.name),
    advance: all.filter((r) => r.w === 3 && r.l > 0).map((r) => r.name),
    zero_three: all.filter((r) => r.w === 0 && r.l === 3).map((r) => r.name),
  };
}

export const emptySwiss = (): SwissPicks => ({ three_zero: [], advance: [], zero_three: [] });
export const emptyPlayoffs = (): PlayoffPicks => ({ qf: ['', '', '', ''], sf: ['', ''], final: [''] });

export function isSwissComplete(p: SwissPicks) {
  return p.three_zero.length === 2 && p.advance.length === 6 && p.zero_three.length === 2;
}
export function isPlayoffComplete(p: PlayoffPicks) {
  return p.qf.filter(Boolean).length === 4 && p.sf.filter(Boolean).length === 2 && p.final.filter(Boolean).length === 1;
}

/** Quartas: 1x8, 4x5 (mesma chave) e 2x7, 3x6. */
export const QF_PAIRS: [number, number][] = [
  [0, 7],
  [3, 4],
  [1, 6],
  [2, 5],
];
