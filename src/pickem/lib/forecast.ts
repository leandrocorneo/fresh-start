/**
 * Previsão estatística das chances de cada palpite. Módulo independente: não altera o simulador,
 * a correção nem nenhum dado; só lê times, resultados reais e palpites.
 *
 * - Chance de cada jogo: pontos do VRS com a fórmula da Valve (ver vrs.ts).
 * - Fases Swiss: simula as partidas que faltam muitas vezes, com os confrontos montados pela regra
 *   oficial do Major Supplemental Rulebook (1x9 na rodada 1; maior x menor seed nas rodadas 2 e 3;
 *   tabela de prioridades nas rodadas 4 e 5). Chance de passar = fração das simulações com
 *   SWISS_PASS acertos ou mais.
 * - Playoffs: cálculo exato (128 combinações) dos acertos esperados.
 */
import { SWISS_PASS } from './config';
import { QF_PAIRS, type PlayoffRecs } from './scoring';
import { teamKey } from './teams';
import type { Match, PlayoffPicks, SwissPicks, Team } from './types';
import { vrsPoints, winProbability } from './vrs';

// ---------------------------------------------------------------- utilidades

/** Gerador pseudoaleatório com semente fixa: a mesma entrada dá sempre o mesmo número. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function probMatrix(teams: Team[]): number[][] {
  const pts = teams.map((t) => vrsPoints(t.name));
  return pts.map((ra) => pts.map((rb) => winProbability(ra, rb)));
}

// ---------------------------------------------------------------- Swiss

export interface SwissState {
  w: number[];
  l: number[];
  opps: number[][];
}

const done = (s: SwissState, i: number) => s.w[i]! >= 3 || s.l[i]! >= 3;

/** Tabela oficial para grupos de 6 nas rodadas 4 e 5 (índices 0..5 = seeds 1..6 do grupo). */
const PRIORITY_6: [number, number][][] = [
  [[0, 5], [1, 4], [2, 3]],
  [[0, 5], [1, 3], [2, 4]],
  [[0, 4], [1, 5], [2, 3]],
  [[0, 4], [1, 3], [2, 5]],
  [[0, 3], [1, 5], [2, 4]],
  [[0, 3], [1, 4], [2, 5]],
  [[0, 5], [1, 2], [3, 4]],
  [[0, 4], [1, 2], [3, 5]],
  [[0, 2], [1, 5], [3, 4]],
  [[0, 2], [1, 4], [3, 5]],
  [[0, 3], [1, 2], [4, 5]],
  [[0, 2], [1, 3], [4, 5]],
  [[0, 1], [2, 5], [3, 4]],
  [[0, 1], [2, 4], [3, 5]],
  [[0, 1], [2, 3], [4, 5]],
];

/** Maior seed contra o menor disponível sem revanche (com volta atrás se travar). */
function pairHighLow(list: number[], s: SwissState): [number, number][] | null {
  if (list.length === 0) return [];
  const [first, ...rest] = list as [number, ...number[]];
  for (let i = rest.length - 1; i >= 0; i--) {
    const cand = rest[i]!;
    if (s.opps[first]!.includes(cand)) continue;
    const sub = pairHighLow(rest.filter((_, j) => j !== i), s);
    if (sub) return [[first, cand], ...sub];
  }
  return null;
}

function pairGroup(group: number[], s: SwissState, round: number): [number, number][] {
  if (round >= 4 && group.length === 6) {
    const rematch = (a: number, b: number) => s.opps[group[a]!]!.includes(group[b]!);
    const row = PRIORITY_6.find((r) => r.every(([a, b]) => !rematch(a, b))) ?? PRIORITY_6[0]!;
    return row.map(([a, b]) => [group[a]!, group[b]!]);
  }
  const p = pairHighLow(group, s);
  if (p) return p;
  // sem saída sem revanche: maior x menor mesmo assim
  const out: [number, number][] = [];
  for (let i = 0; i < group.length / 2; i++) out.push([group[i]!, group[group.length - 1 - i]!]);
  return out;
}

/** Confrontos da rodada para os times em `pending`, pela regra do rulebook. */
export function pairRound(s: SwissState, round: number, pending: number[]): [number, number][] {
  const pend = new Set(pending);
  const pairs: [number, number][] = [];
  if (round === 1) {
    for (let i = 0; i < 8; i++) {
      if (pend.has(i) && pend.has(i + 8)) {
        pairs.push([i, i + 8]);
        pend.delete(i);
        pend.delete(i + 8);
      }
    }
    if (pend.size === 0) return pairs;
  }
  const bh = (i: number) => s.opps[i]!.reduce((acc, o) => acc + s.w[o]! - s.l[o]!, 0);
  const groups = new Map<string, number[]>();
  for (const i of pend) {
    const g = `${s.w[i]}-${s.l[i]}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(i);
  }
  const ordered = [...groups.values()].sort((x, y) => s.w[y[0]!]! - s.w[x[0]!]! || s.l[x[0]!]! - s.l[y[0]!]!);
  let carry: number[] = [];
  for (const members of ordered) {
    // seed no meio da fase: campanha (já igual no grupo), Buchholz, seed inicial
    const keys = [...carry, ...members.sort((a, b) => bh(b) - bh(a) || a - b)];
    carry = keys.length % 2 === 1 ? [keys.pop()!] : [];
    pairs.push(...pairGroup(keys, s, round));
  }
  return pairs;
}

interface FixedResult {
  a: number;
  b: number;
  winner: number;
}

/** Separa os resultados reais por rodada (rodada = jogos que o time já tinha + 1). */
export function realByRound(teams: Team[], matches: Match[]): Map<number, FixedResult[]> {
  const idx = new Map(teams.map((t, i) => [teamKey(t.name), i]));
  const s: SwissState = { w: teams.map(() => 0), l: teams.map(() => 0), opps: teams.map(() => []) };
  const byRound = new Map<number, FixedResult[]>();
  for (const m of matches) {
    const a = idx.get(teamKey(m.team1));
    const b = idx.get(teamKey(m.team2));
    if (a === undefined || b === undefined || m.score1 === m.score2 || done(s, a) || done(s, b)) continue;
    const round = Math.max(s.w[a]! + s.l[a]!, s.w[b]! + s.l[b]!) + 1;
    const winner = m.score1 > m.score2 ? a : b;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push({ a, b, winner });
    s.opps[a]!.push(b);
    s.opps[b]!.push(a);
    s.w[winner]!++;
    s.l[winner === a ? b : a]!++;
  }
  return byRound;
}

export interface SwissForecastInput {
  teams: Team[]; // 16, ordem = seed
  matches: Match[]; // resultados reais, em ordem cronológica
  picks: { playerId: string; picks: SwissPicks }[];
}

const SIMS = 20_000;
const CHUNK = 2_000;

/**
 * Chance (0..1) de cada jogador terminar a fase com SWISS_PASS acertos ou mais.
 * Roda em blocos para não travar a página. `signal` cancela se a entrada mudar.
 */
export async function forecastSwiss(input: SwissForecastInput, signal?: { cancelled: boolean }): Promise<Map<string, number>> {
  const { teams, matches, picks } = input;
  const n = teams.length;
  const P = probMatrix(teams);
  const fixed = realByRound(teams, matches);
  const idx = new Map(teams.map((t, i) => [teamKey(t.name), i]));
  const toIdx = (names: string[]) => names.map((nm) => idx.get(teamKey(nm)) ?? -1);
  const players = picks.map((p) => ({
    id: p.playerId,
    t30: toIdx(p.picks.three_zero ?? []),
    adv: toIdx(p.picks.advance ?? []),
    t03: toIdx(p.picks.zero_three ?? []),
  }));
  const passes = new Array<number>(players.length).fill(0);
  const rand = mulberry32(20261128);

  for (let sim = 0; sim < SIMS; sim++) {
    if (sim % CHUNK === 0 && sim > 0) {
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.cancelled) return new Map();
    }
    const s: SwissState = { w: new Array(n).fill(0), l: new Array(n).fill(0), opps: teams.map(() => []) };
    for (let round = 1; round <= 5; round++) {
      const active: number[] = [];
      for (let i = 0; i < n; i++) if (!done(s, i)) active.push(i);
      if (active.length === 0) break;
      const real = fixed.get(round) ?? [];
      const inReal = new Set(real.flatMap((r) => [r.a, r.b]));
      const pairs = pairRound(s, round, active.filter((i) => !inReal.has(i)));
      const results: FixedResult[] = [
        ...real,
        ...pairs.map(([a, b]) => ({ a, b, winner: rand() < P[a]![b]! ? a : b })),
      ];
      for (const { a, b, winner } of results) {
        s.opps[a]!.push(b);
        s.opps[b]!.push(a);
        s.w[winner]!++;
        s.l[winner === a ? b : a]!++;
      }
    }
    for (let p = 0; p < players.length; p++) {
      const pl = players[p]!;
      let hits = 0;
      for (const i of pl.t30) if (i >= 0 && s.w[i] === 3 && s.l[i] === 0) hits++;
      for (const i of pl.adv) if (i >= 0 && s.w[i] === 3 && s.l[i]! > 0) hits++;
      for (const i of pl.t03) if (i >= 0 && s.l[i] === 3 && s.w[i] === 0) hits++;
      if (hits >= SWISS_PASS) passes[p]!++;
    }
  }
  return new Map(players.map((pl, p) => [pl.id, passes[p]! / SIMS]));
}

// ---------------------------------------------------------------- playoffs

/**
 * Acertos esperados de cada jogador nos playoffs (cálculo exato).
 * Percorre as 128 chaves possíveis, descarta as que contradizem os resultados reais
 * e pondera cada uma pela chance dos jogos.
 */
export function forecastPlayoffs(
  teams: Team[], // 8, ordem = seed
  recs: PlayoffRecs,
  picks: { playerId: string; picks: PlayoffPicks }[],
): Map<string, number> {
  const P = probMatrix(teams);
  const keys = teams.map((t) => teamKey(t.name));
  const reachProb = keys.map(() => [0, 0, 0, 0]); // reachProb[i][k] = P(time i com k+ vitórias)
  let total = 0;

  for (let mask = 0; mask < 128; mask++) {
    const bit = (k: number) => (mask >> k) & 1;
    const wins = new Array<number>(8).fill(0);
    let weight = 1;
    const play = (a: number, b: number, k: number) => {
      const winner = bit(k) ? a : b;
      weight *= winner === a ? P[a]![b]! : P[b]![a]!;
      wins[winner]!++;
      return winner;
    };
    const qf = QF_PAIRS.map(([a, b], k) => play(a, b, k));
    const sf1 = play(qf[0]!, qf[1]!, 4);
    const sf2 = play(qf[2]!, qf[3]!, 5);
    play(sf1, sf2, 6);
    // coerente com o que já aconteceu?
    const ok = keys.every((k, i) => {
      const r = recs.get(k);
      if (!r) return true;
      return wins[i]! >= r.wins && (!r.out || wins[i] === r.wins);
    });
    if (!ok) continue;
    total += weight;
    for (let i = 0; i < 8; i++) for (let k = 1; k <= wins[i]!; k++) reachProb[i]![k]! += weight;
  }

  const idx = new Map(keys.map((k, i) => [k, i]));
  const reach = (name: string, k: number) => {
    const i = idx.get(teamKey(name));
    return i === undefined || total === 0 ? 0 : reachProb[i]![k]! / total;
  };
  return new Map(
    picks.map(({ playerId, picks: p }) => {
      const exp =
        (p.qf ?? []).filter(Boolean).reduce((acc, t) => acc + reach(t, 1), 0) +
        (p.sf ?? []).filter(Boolean).reduce((acc, t) => acc + reach(t, 2), 0) +
        (p.final ?? []).filter(Boolean).reduce((acc, t) => acc + reach(t, 3), 0);
      return [playerId, exp];
    }),
  );
}
