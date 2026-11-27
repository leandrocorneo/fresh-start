import type { Match, Team } from './types';
import { teamKey } from './teams';

/** Campanha de um time numa fase Swiss. Chaves são teamKey(nome). */
export interface Rec {
  key: string;
  name: string;
  seed: number; // 0 = seed 1
  w: number;
  l: number;
  opps: string[];
}
export type Recs = Map<string, Rec>;

export const isDone = (r: Rec) => r.w >= 3 || r.l >= 3;

export function emptyRecs(teams: Team[]): Recs {
  const recs: Recs = new Map();
  teams.forEach((t, i) => {
    const key = teamKey(t.name);
    if (!recs.has(key)) recs.set(key, { key, name: t.name, seed: i, w: 0, l: 0, opps: [] });
  });
  return recs;
}

export function applyResult(recs: Recs, a: string, b: string, winner: string) {
  const ra = recs.get(a);
  const rb = recs.get(b);
  if (!ra || !rb) return;
  ra.opps.push(b);
  rb.opps.push(a);
  if (winner === a) {
    ra.w++;
    rb.l++;
  } else {
    rb.w++;
    ra.l++;
  }
}

/** Monta as campanhas a partir dos resultados reais (em ordem cronológica). */
export function recordsFromMatches(teams: Team[], matches: Match[]): Recs {
  const recs = emptyRecs(teams);
  for (const m of matches) {
    const a = teamKey(m.team1);
    const b = teamKey(m.team2);
    const ra = recs.get(a);
    const rb = recs.get(b);
    if (!ra || !rb || isDone(ra) || isDone(rb)) continue;
    if (m.score1 === m.score2) continue;
    applyResult(recs, a, b, m.score1 > m.score2 ? a : b);
  }
  return recs;
}

export function buchholz(recs: Recs, key: string): number {
  const r = recs.get(key);
  if (!r) return 0;
  return r.opps.reduce((s, o) => {
    const ro = recs.get(o);
    return s + (ro ? ro.w - ro.l : 0);
  }, 0);
}

/** Classificação: vitórias, menos derrotas, Buchholz, seed. */
export function standings(recs: Recs): Rec[] {
  return [...recs.values()].sort(
    (a, b) => b.w - a.w || a.l - b.l || buchholz(recs, b.key) - buchholz(recs, a.key) || a.seed - b.seed,
  );
}

export function qualifiersFromRecs(recs: Recs): Team[] {
  return standings(recs)
    .filter((r) => r.w >= 3)
    .map((r) => ({ name: r.name }));
}

// ---------------------------------------------------------------- simulação

export interface SimMatch {
  id: string;
  a: string;
  b: string;
  group: string; // ex.: "1-1"
  winner: string | null;
  real: boolean; // resultado veio da HLTV
}
export interface SimRound {
  n: number;
  matches: SimMatch[];
}
export interface SimResult {
  rounds: SimRound[];
  recs: Recs;
  done: boolean;
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|');
export const matchId = (round: number, a: string, b: string) => `${round}:${pairKey(a, b)}`;

function pairGroup(list: string[], recs: Recs): [string, string][] | null {
  if (list.length === 0) return [];
  if (list.length === 1) return null;
  const [first, ...rest] = list as [string, ...string[]];
  // maior seed do grupo enfrenta o menor seed possível sem repetir confronto
  for (let i = rest.length - 1; i >= 0; i--) {
    const cand = rest[i]!;
    if (recs.get(first)!.opps.includes(cand)) continue;
    const sub = pairGroup(rest.filter((_, j) => j !== i), recs);
    if (sub) return [[first, cand], ...sub];
  }
  return null;
}

function pairRound(recs: Recs): [string, string][] {
  const active = [...recs.values()].filter((r) => !isDone(r));
  const groups = new Map<string, Rec[]>();
  for (const r of active) {
    const g = `${r.w}-${r.l}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const ordered = [...groups.entries()].sort((x, y) => {
    const [xw = 0, xl = 0] = x[0].split('-').map(Number);
    const [yw = 0, yl = 0] = y[0].split('-').map(Number);
    return yw - xw || xl - yl;
  });
  const pairs: [string, string][] = [];
  let carry: string[] = [];
  for (const [, members] of ordered) {
    const keys = [
      ...carry,
      ...members
        .sort((a, b) => buchholz(recs, b.key) - buchholz(recs, a.key) || a.seed - b.seed)
        .map((r) => r.key),
    ];
    carry = [];
    if (keys.length % 2 === 1) carry = [keys.pop()!]; // não deveria acontecer com 16 times
    const p = pairGroup(keys, recs);
    if (p) pairs.push(...p);
    else for (let i = 0; i < keys.length / 2; i++) pairs.push([keys[i]!, keys[keys.length - 1 - i]!]);
  }
  return pairs;
}

/**
 * Simula a fase Swiss (16 times, 3 vitórias classificam, 3 derrotas eliminam).
 * Rodada 1: seed 1 x 9, 2 x 10 ... Rodadas seguintes: dentro de cada campanha,
 * melhor colocado (Buchholz, depois seed) x pior, sem repetir confronto.
 * Resultados reais da HLTV têm prioridade sobre os cliques do usuário.
 */
export function simulateSwiss(teams: Team[], decisions: Record<string, string>, real: Match[]): SimResult {
  const recs = emptyRecs(teams);
  const realWinner = new Map<string, string>();
  for (const m of real) {
    if (m.score1 === m.score2) continue;
    const a = teamKey(m.team1);
    const b = teamKey(m.team2);
    realWinner.set(pairKey(a, b), m.score1 > m.score2 ? a : b);
  }
  const keys = [...recs.keys()];
  const rounds: SimRound[] = [];
  for (let n = 1; n <= 5; n++) {
    if ([...recs.values()].every(isDone)) break;
    const half = keys.length / 2;
    const pairs: [string, string][] = n === 1 ? keys.slice(0, half).map((k, i) => [k, keys[i + half]!]) : pairRound(recs);
    const matches: SimMatch[] = pairs.map(([a, b]) => {
      const id = matchId(n, a, b);
      const rw = realWinner.get(pairKey(a, b));
      const w = rw ?? decisions[id] ?? null;
      const ra = recs.get(a)!;
      return { id, a, b, group: `${ra.w}-${ra.l}`, winner: w === a || w === b ? w : null, real: !!rw };
    });
    rounds.push({ n, matches });
    if (matches.some((m) => !m.winner)) return { rounds, recs, done: false };
    matches.forEach((m) => applyResult(recs, m.a, m.b, m.winner!));
  }
  return { rounds, recs, done: [...recs.values()].every(isDone) };
}
