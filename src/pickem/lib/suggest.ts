/**
 * "Sugestão do modelo": monta o palpite com a maior chance estimada, usando o mesmo modelo da
 * previsão (pontos do VRS + confrontos pela regra oficial). Só calcula: não salva nada e não
 * mexe em nenhum estado. Quem aplica no rascunho é o componente, e só se a fase estiver aberta.
 */
import { SWISS_PASS } from './config';
import { forecastPlayoffs, forecastSwiss, pairRound, realByRound, type SwissState } from './forecast';
import { QF_PAIRS, type PlayoffRecs } from './scoring';
import type { Match, PlayoffPicks, SwissPicks, Team } from './types';
import { vrsPoints, winProbability } from './vrs';

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

const yieldToPage = () => new Promise((r) => setTimeout(r, 0));

// categoria final de cada time: 1 = 3-0, 2 = 3-1/3-2, 3 = 0-3, 0 = outro
const CAT_3_0 = 1;
const CAT_ADV = 2;
const CAT_0_3 = 3;

/** Simula a fase `sims` vezes e guarda a categoria final de cada time em cada simulação. */
async function simulateOutcomes(teams: Team[], matches: Match[], sims: number, seed: number): Promise<Uint8Array> {
  const n = teams.length;
  const pts = teams.map((t) => vrsPoints(t.name));
  const P = pts.map((ra) => pts.map((rb) => winProbability(ra, rb)));
  const fixed = realByRound(teams, matches);
  const rand = mulberry32(seed);
  const out = new Uint8Array(sims * n);
  for (let sim = 0; sim < sims; sim++) {
    if (sim % 2_000 === 0 && sim > 0) await yieldToPage();
    const s: SwissState = { w: new Array(n).fill(0), l: new Array(n).fill(0), opps: teams.map(() => []) };
    for (let round = 1; round <= 5; round++) {
      const active: number[] = [];
      for (let i = 0; i < n; i++) if (s.w[i]! < 3 && s.l[i]! < 3) active.push(i);
      if (active.length === 0) break;
      const real = fixed.get(round) ?? [];
      const inReal = new Set(real.flatMap((r) => [r.a, r.b]));
      const pairs = pairRound(s, round, active.filter((i) => !inReal.has(i)));
      const results = [...real, ...pairs.map(([a, b]) => ({ a, b, winner: rand() < P[a]![b]! ? a : b }))];
      for (const { a, b, winner } of results) {
        s.opps[a]!.push(b);
        s.opps[b]!.push(a);
        s.w[winner]! += 1;
        s.l[winner === a ? b : a]! += 1;
      }
    }
    for (let i = 0; i < n; i++) {
      const w = s.w[i]!;
      const l = s.l[i]!;
      out[sim * n + i] = w === 3 ? (l === 0 ? CAT_3_0 : CAT_ADV) : l === 3 && w === 0 ? CAT_0_3 : 0;
    }
  }
  return out;
}

const SLOTS: [number, number][] = [
  [CAT_3_0, 2],
  [CAT_ADV, 6],
  [CAT_0_3, 2],
];

/**
 * Palpite Swiss com a maior chance de SWISS_PASS+ acertos.
 * Parte do "mais provável em cada vaga" e de alguns pontos aleatórios, e melhora trocando times
 * de vaga enquanto a chance subir. Devolve também a chance, calculada pela mesma previsão da tabela.
 */
export async function suggestSwiss(teams: Team[], matches: Match[]): Promise<{ picks: SwissPicks; chance: number }> {
  const n = teams.length;
  const SIMS = 20_000;
  const cats = await simulateOutcomes(teams, matches, SIMS, 20261129);

  const marg = teams.map((_, i) => {
    const c = [0, 0, 0, 0];
    for (let s = 0; s < SIMS; s++) c[cats[s * n + i]!]! += 1;
    return c.map((k) => k / SIMS);
  });

  // pk[i] = categoria escolhida para o time i (0 = fora do palpite)
  const hitsOf = (pk: number[]) => {
    const h = new Uint8Array(SIMS);
    for (let s = 0; s < SIMS; s++) {
      let k = 0;
      for (let i = 0; i < n; i++) if (pk[i] && cats[s * n + i] === pk[i]) k++;
      h[s] = k;
    }
    return h;
  };
  const passCount = (h: Uint8Array) => h.reduce((acc, k) => acc + (k >= SWISS_PASS ? 1 : 0), 0);

  async function climb(start: number[]) {
    const pk = start.slice();
    let h = hitsOf(pk);
    let best = passCount(h);
    for (let iter = 0; iter < 50; iter++) {
      let move: [number, number] | null = null;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (pk[i] === pk[j]) continue;
          const ci = pk[i]!;
          const cj = pk[j]!;
          let count = 0;
          for (let s = 0; s < SIMS; s++) {
            const oi = cats[s * n + i];
            const oj = cats[s * n + j];
            const k = h[s]! - (ci && oi === ci ? 1 : 0) - (cj && oj === cj ? 1 : 0) + (cj && oi === cj ? 1 : 0) + (ci && oj === ci ? 1 : 0);
            if (k >= SWISS_PASS) count++;
          }
          if (count > best) {
            best = count;
            move = [i, j];
          }
        }
      }
      if (!move) break;
      const [i, j] = move;
      [pk[i], pk[j]] = [pk[j]!, pk[i]!];
      h = hitsOf(pk);
      await yieldToPage();
    }
    return { pk, best };
  }

  const greedy = () => {
    const pk = new Array<number>(n).fill(0);
    for (const [cat, k] of [SLOTS[0]!, SLOTS[2]!, SLOTS[1]!]) {
      teams
        .map((_, i) => i)
        .filter((i) => pk[i] === 0)
        .sort((a, b) => marg[b]![cat]! - marg[a]![cat]! || a - b)
        .slice(0, k)
        .forEach((i) => (pk[i] = cat));
    }
    return pk;
  };
  const rand = mulberry32(7);
  const randomStart = () => {
    const order = teams.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const pk = new Array<number>(n).fill(0);
    let at = 0;
    for (const [cat, k] of SLOTS) for (let x = 0; x < k; x++) pk[order[at++]!] = cat;
    return pk;
  };

  let winner = await climb(greedy());
  for (let r = 0; r < 4; r++) {
    const c = await climb(randomStart());
    if (c.best > winner.best) winner = c;
  }

  const namesOf = (cat: number) => teams.filter((_, i) => winner.pk[i] === cat).map((t) => t.name);
  const picks: SwissPicks = { three_zero: namesOf(CAT_3_0), advance: namesOf(CAT_ADV), zero_three: namesOf(CAT_0_3) };
  // a chance mostrada é a mesma conta da coluna "Chance de passar"
  const chance = (await forecastSwiss({ teams, matches, picks: [{ playerId: 'sugestao', picks }] })).get('sugestao') ?? 0;
  return { picks, chance };
}

/**
 * Chave dos playoffs com o maior número esperado de acertos (cálculo exato).
 * Testa todas as 128 chaves coerentes (quem é escolhido na semi precisa ter sido escolhido nas quartas).
 */
export function suggestPlayoffs(teams: Team[], recs: PlayoffRecs): { picks: PlayoffPicks; expected: number } {
  const reach = (round: 'qf' | 'sf' | 'final') =>
    forecastPlayoffs(
      teams,
      recs,
      teams.map((t) => ({
        playerId: t.name,
        picks: { qf: round === 'qf' ? [t.name] : [], sf: round === 'sf' ? [t.name] : [], final: round === 'final' ? [t.name] : [] },
      })),
    );
  const r1 = reach('qf');
  const r2 = reach('sf');
  const r3 = reach('final');
  const name = (i: number) => teams[i]!.name;

  let best: { picks: PlayoffPicks; expected: number } | null = null;
  for (let mask = 0; mask < 128; mask++) {
    const bit = (k: number) => (mask >> k) & 1;
    const qf = QF_PAIRS.map(([a, b], k) => name(bit(k) ? a : b));
    const sf = [bit(4) ? qf[0]! : qf[1]!, bit(5) ? qf[2]! : qf[3]!];
    const final = [bit(6) ? sf[0]! : sf[1]!];
    const expected =
      qf.reduce((acc, t) => acc + (r1.get(t) ?? 0), 0) +
      sf.reduce((acc, t) => acc + (r2.get(t) ?? 0), 0) +
      final.reduce((acc, t) => acc + (r3.get(t) ?? 0), 0);
    if (!best || expected > best.expected + 1e-12) best = { picks: { qf, sf, final }, expected };
  }
  return best!;
}
