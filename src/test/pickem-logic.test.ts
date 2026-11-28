import { expect, test } from 'vitest';
import { simulateSwiss, recordsFromMatches, isDone, matchId } from '../pickem/lib/swiss';
import { gradeSwiss, picksFromRecs, swissPickStatus, playoffRecords, gradePlayoffs, isSwissComplete } from '../pickem/lib/scoring';
import { deriveAll } from '../pickem/lib/derive';
import { SEEDS } from '../pickem/lib/config';
import { teamKey } from '../pickem/lib/teams';
import type { Match } from '../pickem/lib/types';

const teams = SEEDS.stage1.map((name) => ({ name }));

test('aliases', () => {
  expect(teamKey('PVISION')).toBe(teamKey('PARIVISION'));
  expect(teamKey('GOSH')).toBe(teamKey('BC.Game'));
});

test('simulação completa: melhor seed sempre vence', () => {
  let decisions: Record<string, string> = {};
  let sim = simulateSwiss(teams, decisions, []);
  for (let guard = 0; guard < 10 && !sim.done; guard++) {
    for (const r of sim.rounds)
      for (const m of r.matches) {
        if (m.winner) continue;
        const sa = sim.recs.get(m.a)!.seed, sb = sim.recs.get(m.b)!.seed;
        decisions[m.id] = sa < sb ? m.a : m.b;
      }
    sim = simulateSwiss(teams, decisions, []);
  }
  expect(sim.done).toBe(true);
  expect(sim.rounds[0]!.matches[0]!.a).toBe(teamKey('Ninjas in Pyjamas'));
  expect(sim.rounds[0]!.matches[0]!.b).toBe(teamKey('M80'));
  const p = picksFromRecs(sim.recs);
  expect(isSwissComplete(p)).toBe(true);
  // sem confrontos repetidos
  for (const r of sim.recs.values()) expect(new Set(r.opps).size).toBe(r.opps.length);
  expect([...sim.recs.values()].every(isDone)).toBe(true);
  expect([...sim.recs.values()].filter((r) => r.w === 3).length).toBe(8);
});

test('resultado real sobrepõe o clique', () => {
  const real: Match[] = [{ team1: 'M80', team2: 'Ninjas in Pyjamas', score1: 13, score2: 7 }];
  const id = matchId(1, teamKey('Ninjas in Pyjamas'), teamKey('M80'));
  const sim = simulateSwiss(teams, { [id]: teamKey('Ninjas in Pyjamas') }, real);
  const m = sim.rounds[0]!.matches[0]!;
  expect(m.real).toBe(true);
  expect(m.winner).toBe(teamKey('M80'));
});

test('regras do pickem', () => {
  const r = (w: number, l: number) => ({ key: 'x', name: 'x', seed: 0, w, l, opps: [] });
  expect(swissPickStatus('three_zero', r(3, 1))).toBe('wrong'); // marcou 3-0, passou 3-1
  expect(swissPickStatus('three_zero', r(2, 0))).toBe('pending');
  expect(swissPickStatus('three_zero', r(3, 0))).toBe('correct');
  expect(swissPickStatus('advance', r(3, 0))).toBe('wrong');
  expect(swissPickStatus('advance', r(3, 2))).toBe('correct');
  expect(swissPickStatus('advance', r(2, 3))).toBe('wrong');
  expect(swissPickStatus('advance', r(2, 0))).toBe('pending');
  expect(swissPickStatus('zero_three', r(1, 0))).toBe('wrong');
  expect(swissPickStatus('zero_three', r(0, 3))).toBe('correct');
});

test('grade com nomes alternativos', () => {
  const ms: Match[] = [
    { team1: 'PARIVISION', team2: 'DENDELE', score1: 13, score2: 3 },
    { team1: 'FlyQuest', team2: 'PARIVISION', score1: 13, score2: 9 },
  ];
  const recs = recordsFromMatches(teams, ms);
  const g = gradeSwiss({ three_zero: ['PVISION'], advance: [], zero_three: ['DENDELE'] }, recs);
  expect(g.wrong).toBe(1);
  expect(g.pending).toBe(1);
});

test('playoffs: disputa de 3º não conta', () => {
  const ms: Match[] = [
    { team1: 'A', team2: 'H', score1: 2, score2: 0 },
    { team1: 'A', team2: 'D', score1: 0, score2: 2 }, // A cai na semi
    { team1: 'A', team2: 'B', score1: 2, score2: 1 }, // 3º lugar
  ];
  const recs = playoffRecords(ms);
  const g = gradePlayoffs({ qf: ['A'], sf: ['A'], final: [] }, recs);
  expect(g.items.map((i) => i.status)).toEqual(['correct', 'wrong']);
});

test('derive: stage 2 usa classificados reais da stage 1', () => {
  // gera stage 1 inteira "real" com o melhor seed vencendo
  let decisions: Record<string, string> = {};
  let sim = simulateSwiss(teams, decisions, []);
  while (!sim.done) {
    for (const r of sim.rounds) for (const m of r.matches) if (!m.winner) decisions[m.id] = sim.recs.get(m.a)!.seed < sim.recs.get(m.b)!.seed ? m.a : m.b;
    sim = simulateSwiss(teams, decisions, []);
  }
  const name = (k: string) => sim.recs.get(k)!.name;
  const matches: Match[] = sim.rounds.flatMap((r) => r.matches.map((m) => ({ team1: name(m.a), team2: name(m.b), score1: m.winner === m.a ? 13 : 5, score2: m.winner === m.b ? 13 : 5 })));
  const d = deriveAll({ stage1: { id: 'stage1', name: 's1', sort: 1, hltv_event_id: 1, teams, matches, source: 'hltv', lock_at: null, last_sync: null, sync_error: null } }, {});
  expect(d.stage1.realDone).toBe(true);
  expect(d.stage2.teams.length).toBe(16);
  expect(d.stage2.teams[0]!.name).toBe('FUT');
  expect(d.stage2.complete).toBe(true);
  expect(d.stage3.complete).toBe(false);
});

test('stage 2: rodada 1 igual à oficial (resultados reais da stage 1)', () => {
  // [time1, time2, vencedor 1 ou 2], em ordem cronológica, como vieram da HLTV
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
  // times da stage 2 na ordem em que a HLTV lista (não é o seed)
  const s2teams = ['Natus Vincere', 'Nemiga', 'The MongolZ', 'FUT', 'G2', 'PARIVISION', '1win', 'MIBR', 'Liquid', 'Astralis',
    'Eternal Fire', 'Ninjas in Pyjamas', '100 Thieves', 'Lynn Vision', 'Imperial', 'FlyQuest'].map((name) => ({ name }));
  const row = (id: 'stage1' | 'stage2', t: { name: string }[], m: Match[]) =>
    ({ id, name: id, sort: 1, hltv_event_id: 1, teams: t, matches: m, source: 'hltv' as const, lock_at: null, last_sync: null, sync_error: null });
  const d = deriveAll({ stage1: row('stage1', teams, matches), stage2: row('stage2', s2teams, []) }, {});
  const r1 = d.stage2.sim!.rounds[0]!.matches.map((m) => [m.a, m.b]);
  const official = [
    ['FUT', 'FlyQuest'], ['Nemiga', 'Ninjas in Pyjamas'], ['G2', 'Liquid'], ['1win', 'Eternal Fire'],
    ['Natus Vincere', 'PARIVISION'], ['Astralis', 'Imperial'], ['The MongolZ', 'Lynn Vision'], ['MIBR', '100 Thieves'],
  ].map(([a, b]) => [teamKey(a), teamKey(b)]);
  expect(r1).toEqual(official);
});
