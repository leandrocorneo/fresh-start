import { expect, test } from 'vitest';
import { SEEDS } from '../pickem/lib/config';
import { forecastPlayoffs, forecastSwiss, pairRound, realByRound, type SwissState } from '../pickem/lib/forecast';
import { playoffRecords } from '../pickem/lib/scoring';
import type { Match } from '../pickem/lib/types';
import { winProbability } from '../pickem/lib/vrs';

const teams = SEEDS.stage1.map((name) => ({ name }));
// Stage 1 real do PGL Major Singapore 2026: [time1, time2, vencedor 1 ou 2], em ordem cronológica
const s1: [string, string, 1 | 2][] = [
  ['HEROIC', 'Imperial', 2], ['9z', 'Lynn Vision', 2], ['Ninjas in Pyjamas', 'M80', 1], ['100 Thieves', 'Chinggis Warriors', 1],
  ['Liquid', 'BC.Game', 1], ['PARIVISION', 'DENDELE', 1], ['FaZe', 'Wildcard', 2], ['Eternal Fire', 'FlyQuest', 2],
  ['HEROIC', 'Chinggis Warriors', 1], ['Ninjas in Pyjamas', 'Lynn Vision', 1], ['9z', 'M80', 2], ['100 Thieves', 'Imperial', 2],
  ['Eternal Fire', 'DENDELE', 1], ['PARIVISION', 'FlyQuest', 2], ['Liquid', 'Wildcard', 1], ['FaZe', 'BC.Game', 1],
  ['Eternal Fire', '100 Thieves', 1], ['HEROIC', 'M80', 2], ['Wildcard', 'Lynn Vision', 2], ['PARIVISION', 'FaZe', 1],
  ['9z', 'DENDELE', 1], ['Imperial', 'FlyQuest', 2], ['Ninjas in Pyjamas', 'Liquid', 1], ['BC.Game', 'Chinggis Warriors', 2],
  ['M80', 'Eternal Fire', 2], ['HEROIC', 'FaZe', 1], ['Lynn Vision', 'PARIVISION', 2], ['100 Thieves', '9z', 1],
  ['Imperial', 'Liquid', 2], ['Wildcard', 'Chinggis Warriors', 1], ['Lynn Vision', 'HEROIC', 1], ['Imperial', 'Wildcard', 1],
  ['M80', '100 Thieves', 2],
];
const matches: Match[] = s1.map(([team1, team2, w]) => ({ team1, team2, score1: w === 1 ? 2 : 0, score2: w === 2 ? 2 : 0 }));

test('previsão: confrontos pela regra oficial batem com as 5 rodadas reais da stage 1', () => {
  const byRound = realByRound(teams, matches);
  const s: SwissState = { w: teams.map(() => 0), l: teams.map(() => 0), opps: teams.map(() => []) };
  const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join('-');
  for (let r = 1; r <= 5; r++) {
    const real = byRound.get(r) ?? [];
    const active = teams.map((_, i) => i).filter((i) => s.w[i]! < 3 && s.l[i]! < 3);
    const mine = pairRound(s, r, active).map(([a, b]) => key(a, b)).sort();
    expect(mine).toEqual(real.map((m) => key(m.a, m.b)).sort());
    for (const { a, b, winner } of real) {
      s.opps[a]!.push(b);
      s.opps[b]!.push(a);
      s.w[winner]! += 1;
      s.l[winner === a ? b : a]! += 1;
    }
  }
});

test('previsão: fase terminada dá 100% ou 0%', async () => {
  const ok = { three_zero: ['Ninjas in Pyjamas', 'FlyQuest'], advance: ['PARIVISION', 'Liquid', 'Eternal Fire', 'Lynn Vision', 'Imperial', '100 Thieves'], zero_three: ['BC.Game', 'Chinggis Warriors'] };
  const bad = { three_zero: ['FaZe', 'HEROIC'], advance: ['9z', 'M80', 'DENDELE', 'Wildcard', 'Liquid', 'Eternal Fire'], zero_three: ['Lynn Vision', 'FlyQuest'] };
  const f = await forecastSwiss({ teams, matches, picks: [{ playerId: 'ok', picks: ok }, { playerId: 'bad', picks: bad }] });
  expect(f.get('ok')).toBe(1);
  expect(f.get('bad')).toBe(0);
});

test('previsão: chance de jogo pela fórmula da Valve', () => {
  expect(winProbability(1500, 1500)).toBeCloseTo(0.5, 6);
  expect(winProbability(1721, 1318)).toBeCloseTo(0.905, 3); // FUT x FlyQuest
  expect(winProbability(1318, 1721) + winProbability(1721, 1318)).toBeCloseTo(1, 9);
});

test('previsão playoffs: somas fecham e resultado real manda', () => {
  const t8 = ['MOUZ', 'Vitality', 'FURIA', 'Aurora', 'Spirit', 'BetBoom', 'Falcons', 'Legacy'].map((name) => ({ name }));
  const one = (round: 'qf' | 'sf' | 'final') =>
    t8.map((t) => ({ playerId: t.name, picks: { qf: round === 'qf' ? [t.name] : [], sf: round === 'sf' ? [t.name] : [], final: round === 'final' ? [t.name] : [] } }));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  expect(sum(forecastPlayoffs(t8, playoffRecords([]), one('qf')))).toBeCloseTo(4, 9);
  expect(sum(forecastPlayoffs(t8, playoffRecords([]), one('sf')))).toBeCloseTo(2, 9);
  expect(sum(forecastPlayoffs(t8, playoffRecords([]), one('final')))).toBeCloseTo(1, 9);
  const recs = playoffRecords([{ team1: 'Legacy', team2: 'MOUZ', score1: 2, score2: 0 }]);
  const f = forecastPlayoffs(t8, recs, [
    { playerId: 'x', picks: { qf: ['MOUZ'], sf: ['MOUZ'], final: ['MOUZ'] } },
    { playerId: 'y', picks: { qf: ['Legacy'], sf: [], final: [] } },
  ]);
  expect(f.get('x')).toBe(0);
  expect(f.get('y')).toBe(1);
});
