export type StageId = 'stage1' | 'stage2' | 'stage3' | 'playoffs';
export type SwissStageId = Exclude<StageId, 'playoffs'>;

export interface Team {
  name: string;
  logo?: string | null;
}

/** Partida finalizada vinda da HLTV (ou inserida manualmente no admin). */
export interface Match {
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  date?: string | null; // yyyy-mm-dd
}

export interface StageRow {
  id: StageId;
  name: string;
  sort: number;
  hltv_event_id: number | null;
  teams: Team[];
  matches: Match[];
  source: 'hltv' | 'manual';
  lock_at: string | null;
  last_sync: string | null;
  sync_error: string | null;
}

export interface SwissPicks {
  three_zero: string[]; // 2
  advance: string[]; // 6 (3-1 ou 3-2)
  zero_three: string[]; // 2
}

export interface PlayoffPicks {
  qf: string[]; // 4 vencedores das quartas
  sf: string[]; // 2 vencedores das semis
  final: string[]; // 1 campeão
}

export type AnyPicks = SwissPicks | PlayoffPicks;

export interface Player {
  id: string;
  name: string;
}

export interface PickRow {
  player_id: string;
  stage_id: StageId;
  picks: AnyPicks;
  updated_at?: string;
}

export type PickStatus = 'correct' | 'wrong' | 'pending';
export type SwissCategory = 'three_zero' | 'advance' | 'zero_three';
export type PlayoffRound = 'qf' | 'sf' | 'final';

export interface GradedPick {
  team: string;
  slot: SwissCategory | PlayoffRound;
  status: PickStatus;
}
