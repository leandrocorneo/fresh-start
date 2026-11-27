import type { StageId } from './types';

export const EVENT_NAME = 'PGL Major Singapore 2026';

export const STAGES: { id: StageId; label: string; dates: string }[] = [
  { id: 'stage1', label: 'Stage 1', dates: '24–27 nov' },
  { id: 'stage2', label: 'Stage 2', dates: '28 nov – 1 dez' },
  { id: 'stage3', label: 'Stage 3', dates: '2–6 dez' },
  { id: 'playoffs', label: 'Playoffs', dates: '10–13 dez' },
];

/**
 * Seeds usados no simulador (ordem = seed 1, 2, 3...).
 * Stage 1: os 16 times. Stage 2 e 3: só os convidados diretos; os classificados
 * da fase anterior entram depois, na ordem em que terminaram.
 * Quando a HLTV já lista os 16 times de uma fase, os nomes de lá são usados e
 * esta lista só define a ordem.
 */
export const SEEDS: Record<Exclude<StageId, 'playoffs'>, string[]> = {
  stage1: [
    'Ninjas in Pyjamas', 'PARIVISION', 'HEROIC', 'FaZe', 'Liquid', 'Eternal Fire',
    '100 Thieves', '9z', 'M80', 'DENDELE', 'Imperial', 'Wildcard', 'BC.Game',
    'FlyQuest', 'Chinggis Warriors', 'Lynn Vision',
  ],
  stage2: ['FUT', 'Natus Vincere', '1win', 'MIBR', 'Nemiga', 'G2', 'Astralis', 'The MongolZ'],
  stage3: ['MOUZ', 'Vitality', 'Spirit', 'FURIA', 'Falcons', 'Aurora', 'Legacy', 'BetBoom'],
};

/**
 * Apelidos -> nome canônico (já normalizados: minúsculas, só letras/números).
 * Útil porque alguns times jogam com nome alternativo em Singapura.
 */
export const ALIASES: Record<string, string> = {
  pvision: 'parivision',
  gosh: 'bcgame',
  bcgameesports: 'bcgame',
  teamliquid: 'liquid',
  fazeclan: 'faze',
  '9zteam': '9z',
  dendelecs: 'dendele',
  imperialesports: 'imperial',
  lynnvisiongaming: 'lynnvision',
  navi: 'natusvincere',
  teamvitality: 'vitality',
  teamspirit: 'spirit',
  teamfalcons: 'falcons',
  furiaesports: 'furia',
  g2esports: 'g2',
  mongolz: 'themongolz',
  nip: 'ninjasinpyjamas',
  futesports: 'fut',
};

/** true = esconde os palpites dos outros até a fase fechar (o banco também precisa bloquear, ver docs/sql/003). */
export const HIDE_PICKS_UNTIL_LOCK = false;
/** Recarrega os dados da página a cada X ms. */
export const POLL_MS = 60_000;
/** Se o último sync com a HLTV for mais velho que isso, a página pede um novo. */
export const SYNC_STALE_MS = 10 * 60_000;
/** Acertos mínimos numa fase Swiss para "passar" (regra do Pick'em do CS2). */
export const SWISS_PASS = 5;
