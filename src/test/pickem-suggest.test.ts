import { expect, test } from 'vitest';
import { SEEDS } from '../pickem/lib/config';
import { forecastSwiss } from '../pickem/lib/forecast';
import { playoffRecords } from '../pickem/lib/scoring';
import { suggestPlayoffs, suggestSwiss } from '../pickem/lib/suggest';

const stage2 = [...SEEDS.stage2, 'FlyQuest', 'Ninjas in Pyjamas', 'Liquid', 'Eternal Fire', 'PARIVISION', 'Imperial', 'Lynn Vision', '100 Thieves'].map((name) => ({ name }));

test('sugestão swiss: formato 2/6/2 e chance maior que a do palpite "mais provável em cada vaga"', async () => {
  const r = await suggestSwiss(stage2, []);
  const all = [...r.picks.three_zero, ...r.picks.advance, ...r.picks.zero_three];
  expect([r.picks.three_zero.length, r.picks.advance.length, r.picks.zero_three.length]).toEqual([2, 6, 2]);
  expect(new Set(all).size).toBe(10);
  const naive = { three_zero: ['FUT', 'Nemiga'], advance: ['G2', '1win', 'Natus Vincere', 'Astralis', 'The MongolZ', 'MIBR'], zero_three: ['Lynn Vision', 'FlyQuest'] };
  const f = await forecastSwiss({ teams: stage2, matches: [], picks: [{ playerId: 'n', picks: naive }] });
  expect(r.chance).toBeGreaterThan(f.get('n')!);
});

test('sugestão playoffs: chave coerente e time eliminado sai', () => {
  const t8 = ['MOUZ', 'Vitality', 'FURIA', 'Aurora', 'Spirit', 'BetBoom', 'Falcons', 'Legacy'].map((name) => ({ name }));
  const r = suggestPlayoffs(t8, playoffRecords([{ team1: 'Legacy', team2: 'MOUZ', score1: 2, score2: 0 }]));
  expect(r.picks.qf).toContain('Legacy');
  expect([...r.picks.sf, ...r.picks.final]).not.toContain('MOUZ');
  expect(r.picks.qf.slice(0, 2)).toContain(r.picks.sf[0]);
  expect(r.picks.qf.slice(2, 4)).toContain(r.picks.sf[1]);
  expect(r.picks.sf).toContain(r.picks.final[0]);
});
