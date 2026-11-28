// Edge function de administração, protegida pelo secret ADMIN_PIN.
// Ações:
//   { pin, action: 'check' }
//   { pin, action: 'update_stage', stage_id, patch: { hltv_event_id?, lock_at?, source?, teams?, matches? } }
//   { pin, action: 'delete_player', player_id }
//   { pin, action: 'history', player_id?, stage_id? }   -> histórico de alterações dos palpites
//   { pin, action: 'restore_pick', history_id }        -> volta um palpite para uma versão antiga
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALLOWED = ['hltv_event_id', 'lock_at', 'source', 'teams', 'matches'];

const PRIVATE_IP = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i;

/** Cidade, região e país de um IP (ipwho.is, sem chave). null = não deu para consultar agora. */
async function lookupIp(ip: string): Promise<string | null> {
  if (PRIVATE_IP.test(ip)) return 'rede interna';
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,connection`, {
      signal: AbortSignal.timeout(4000),
    });
    const j = await res.json();
    if (!j.success) return 'desconhecida';
    const place = [j.city, j.region, j.country].filter(Boolean).join(', ');
    const isp = j.connection?.isp ? ` (${j.connection.isp})` : '';
    return (place || 'desconhecida') + isp;
  } catch {
    return null;
  }
}

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
    case 'history': {
      let q = sb
        .from('pick_history')
        .select('id, player_id, stage_id, picks, source, ip, user_agent, headers, location, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (body.player_id) q = q.eq('player_id', body.player_id);
      if (body.stage_id) q = q.eq('stage_id', body.stage_id);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 400);
      const rows = data ?? [];
      // localização: consulta os IPs que ainda não têm e guarda no banco
      const pending = [...new Set(rows.filter((r) => r.ip && !r.location).map((r) => r.ip as string))].slice(0, 15);
      for (const ip of pending) {
        const loc = await lookupIp(ip);
        if (!loc) continue;
        await sb.from('pick_history').update({ location: loc }).eq('ip', ip).is('location', null);
        rows.forEach((r) => {
          if (r.ip === ip) r.location = loc;
        });
      }
      return json({ ok: true, rows });
    }
    case 'restore_pick': {
      const { error } = await sb.rpc('admin_restore_pick', { p_history_id: body.history_id });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    default:
      return json({ error: 'Ação desconhecida' }, 400);
  }
});
