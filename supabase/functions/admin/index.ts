// Edge function de administração, protegida pelo secret ADMIN_PIN.
// Ações:
//   { pin, action: 'check' }
//   { pin, action: 'update_stage', stage_id, patch: { hltv_event_id?, lock_at?, source?, teams?, matches? } }
//   { pin, action: 'delete_player', player_id }
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALLOWED = ['hltv_event_id', 'lock_at', 'source', 'teams', 'matches'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const pin = Deno.env.get('ADMIN_PIN');
  if (!pin) return json({ error: 'Defina o secret ADMIN_PIN no projeto' }, 500);
  if (body.pin !== pin) return json({ error: 'PIN inválido' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  switch (body.action) {
    case 'check':
      return json({ ok: true });
    case 'update_stage': {
      const patch: Record<string, unknown> = {};
      for (const k of ALLOWED) if (k in (body.patch ?? {})) patch[k] = body.patch[k];
      if (patch.source && !['hltv', 'manual'].includes(patch.source as string)) return json({ error: 'source inválido' }, 400);
      if ('teams' in patch && !Array.isArray(patch.teams)) return json({ error: 'teams deve ser uma lista' }, 400);
      if ('matches' in patch && !Array.isArray(patch.matches)) return json({ error: 'matches deve ser uma lista' }, 400);
      const { error } = await sb.from('stages').update(patch).eq('id', body.stage_id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    case 'delete_player': {
      const { error } = await sb.from('players').delete().eq('id', body.player_id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    default:
      return json({ error: 'Ação desconhecida' }, 400);
  }
});
