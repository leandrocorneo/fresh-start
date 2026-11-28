import { teamKey } from './teams';

/**
 * Pontos do Valve Regional Standings (ranking global de 02/11/2026), o mesmo ranking que a Valve
 * usou para os seeds do Major. Fonte:
 * https://github.com/ValveSoftware/counter-strike_regional_standings/blob/main/invitation/2026/standings_global_2026_11_02.md
 * Ficam congelados durante o evento.
 */
const POINTS: Record<string, number> = {
  MOUZ: 1960,
  Vitality: 1922,
  FURIA: 1912,
  Aurora: 1860,
  Spirit: 1842,
  BetBoom: 1786,
  Falcons: 1764,
  FUT: 1721,
  Legacy: 1662,
  Nemiga: 1650,
  G2: 1616,
  '1win': 1598,
  'Natus Vincere': 1589,
  Astralis: 1572,
  'Ninjas in Pyjamas': 1564,
  PARIVISION: 1560,
  'The MongolZ': 1554,
  HEROIC: 1548,
  MIBR: 1546,
  FaZe: 1539,
  Liquid: 1528,
  'Eternal Fire': 1513,
  '100 Thieves': 1511,
  '9z': 1490,
  M80: 1489,
  DENDELE: 1466,
  Imperial: 1406,
  Wildcard: 1391,
  'BC.Game': 1337,
  FlyQuest: 1318,
  'Chinggis Warriors': 1272,
  'Lynn Vision': 1267,
};

const BY_KEY = new Map(Object.entries(POINTS).map(([name, pts]) => [teamKey(name), pts]));
/** Time sem pontos conhecidos recebe o menor valor da lista (não inventa força para ninguém). */
const FALLBACK = Math.min(...Object.values(POINTS));

export function vrsPoints(name: string): number {
  return BY_KEY.get(teamKey(name)) ?? FALLBACK;
}

// Fórmula que a própria Valve usa para avaliar o VRS (model/fit.js + model/glicko.js):
// Glicko com RD fixo de 75, ou seja P = 1 / (1 + 10^(-g * (Ra - Rb) / 400)).
const Q = Math.LN10 / 400;
const G = 1 / Math.sqrt(1 + (3 * Q * Q * 75 * 75) / (Math.PI * Math.PI));

/** Chance de um time com `ra` pontos vencer um com `rb` pontos. */
export function winProbability(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (-G * (ra - rb)) / 400));
}
