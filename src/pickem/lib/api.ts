import { supabase } from './supabase';
import type { AnyPicks, PickRow, Player, StageId, StageRow } from './types';

export interface AppData {
  stages: StageRow[];
  players: Player[];
  picks: PickRow[]; // só das fases fechadas (regra do banco)
  submitted: { player_id: string; stage_id: StageId }[];
  mine: { stage_id: StageId; picks: AnyPicks; updated_at: string }[];
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

export async function loadData(token?: string): Promise<AppData> {
  const [stages, players, picks, submitted, mine] = await Promise.all([
    supabase.from('stages').select('*').order('sort'),
    supabase.from('players').select('id,name').order('created_at'),
    supabase.from('picks').select('player_id,stage_id,picks,updated_at'),
    supabase.rpc('submitted_players'),
    token ? supabase.rpc('get_my_picks', { p_token: token }) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    stages: check(stages) as StageRow[],
    players: check(players) as Player[],
    picks: check(picks) as PickRow[],
    submitted: check(submitted) as AppData['submitted'],
    mine: check(mine) as AppData['mine'],
  };
}

export async function registerPlayer(name: string, token: string): Promise<string> {
  const { data, error } = await supabase.rpc('register_player', { p_name: name, p_token: token });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function savePicks(token: string, stage: StageId, picks: AnyPicks) {
  const { error } = await supabase.rpc('save_picks', { p_token: token, p_stage: stage, p_picks: picks });
  if (error) throw new Error(error.message);
}

export async function triggerSync(force = false, pin?: string) {
  const { data, error } = await supabase.functions.invoke('sync-hltv', { body: { force, pin } });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminCall(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch {
      /* ignora */
    }
    throw new Error(msg);
  }
  return data;
}
