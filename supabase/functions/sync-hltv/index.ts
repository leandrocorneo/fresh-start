// Edge function: lê times, logos e resultados do Major na HLTV e grava na tabela `stages`.
// Chamada pela página (quando o último sync tem mais de 10 min) e/ou pelo pg_cron.
//
// Secrets opcionais:
//   ADMIN_PIN     -> permite { force: true, pin } para ignorar o intervalo mínimo
//   SCRAPE_PROXY  -> URL de um serviço de scraping, com {url} no lugar do endereço da HLTV.
//                    Ex.: https://api.scraperapi.com/?api_key=SUA_CHAVE&url={url}
//                    Use se a HLTV (Cloudflare) bloquear o acesso direto (erro 403).
//   PLAYOFFS_FROM -> data (yyyy-mm-dd) a partir da qual partidas do evento 8302 são playoffs. Padrão 2026-12-08.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DOMParser, type Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MIN_INTERVAL_MS = 3 * 60_000;
const PLAYOFFS_FROM = Deno.env.get('PLAYOFFS_FROM') ?? '2026-12-08';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface Team { name: string; logo?: string | null }
interface Match { team1: string; team2: string; score1: number; score2: number; date: string | null }

// ------------------------------------------------------------------ HTTP
async function getHtml(url: string): Promise<string> {
  const proxy = Deno.env.get('SCRAPE_PROXY');
  const target = proxy ? proxy.replace('{url}', encodeURIComponent(url)) : url;
  const res = await fetch(target, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.hltv.org/',
    },
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`HLTV respondeu ${res.status} em ${url}${res.status === 403 ? ' (Cloudflare: configure SCRAPE_PROXY)' : ''}`);
  if (/Just a moment|cf-chl|challenge-platform/i.test(html) && !/result-con|team-box/.test(html)) {
    throw new Error('Bloqueado pelo Cloudflare da HLTV (configure SCRAPE_PROXY)');
  }
  return html;
}
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')!;
const abs = (src?: string | null) => (!src ? null : src.startsWith('//') ? `https:${src}` : src.startsWith('/') ? `https://www.hltv.org${src}` : src);
const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ------------------------------------------------------------------ parsers
function parseTeams(html: string): Team[] {
  const doc = parse(html);
  const out: Team[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('.team-box').forEach((n) => {
    const box = n as Element;
    const img = (box.querySelector('img.logo.day-only') ?? box.querySelector('img.logo')) as Element | null;
    const name = clean(box.querySelector('.team-name .text')?.textContent) || clean(img?.getAttribute('title'));
    if (!name || /^tbd$/i.test(name) || seen.has(key(name))) return;
    seen.add(key(name));
    out.push({ name, logo: abs(img?.getAttribute('src')) });
  });
  return out;
}

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
function headlineDate(text: string): string | null {
  const m = text.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\w*\s+(\d{4})/);
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0');
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

function parseResultCon(rc: Element, date: string | null, logos: Map<string, string>): Match | null {
  const t1 = clean(rc.querySelector('.team1 .team')?.textContent);
  const t2 = clean(rc.querySelector('.team2 .team')?.textContent);
  const spans = [...rc.querySelectorAll('.result-score span')].map((s) => parseInt(clean(s.textContent), 10));
  if (!t1 || !t2 || spans.length < 2 || spans.some(isNaN)) return null;
  const l1 = abs((rc.querySelector('.team1 img.team-logo') as Element | null)?.getAttribute('src'));
  const l2 = abs((rc.querySelector('.team2 img.team-logo') as Element | null)?.getAttribute('src'));
  if (l1) logos.set(key(t1), l1);
  if (l2) logos.set(key(t2), l2);
  return { team1: t1, team2: t2, score1: spans[0], score2: spans[1], date };
}

/** Retorna as partidas em ordem cronológica (a HLTV lista da mais nova para a mais velha). */
function parseResults(html: string, logos: Map<string, string>): Match[] {
  const doc = parse(html);
  const root = (doc.querySelector('.results-all') ?? doc) as Element;
  const out: Match[] = [];
  const subs = root.querySelectorAll('.results-sublist');
  if (subs.length) {
    subs.forEach((s) => {
      const sub = s as Element;
      const date = headlineDate(clean(sub.querySelector('.standard-headline')?.textContent));
      sub.querySelectorAll('.result-con').forEach((rc) => {
        const m = parseResultCon(rc as Element, date, logos);
        if (m) out.push(m);
      });
    });
  } else {
    root.querySelectorAll('.result-con').forEach((rc) => {
      const m = parseResultCon(rc as Element, null, logos);
      if (m) out.push(m);
    });
  }
  return out.reverse();
}

// ------------------------------------------------------------------ swiss (para ordenar os 8 dos playoffs)
function stage3Qualifiers(teams: Team[], matches: Match[]): Team[] {
  type R = { name: string; seed: number; w: number; l: number; opps: string[] };
  const recs = new Map<string, R>();
  teams.forEach((t, i) => recs.set(key(t.name), { name: t.name, seed: i, w: 0, l: 0, opps: [] }));
  for (const m of matches) {
    const a = recs.get(key(m.team1));
    const b = recs.get(key(m.team2));
    if (!a || !b || a.w >= 3 || a.l >= 3 || b.w >= 3 || b.l >= 3 || m.score1 === m.score2) continue;
    a.opps.push(key(m.team2));
    b.opps.push(key(m.team1));
    if (m.score1 > m.score2) { a.w++; b.l++; } else { b.w++; a.l++; }
  }
  const bh = (r: R) => r.opps.reduce((s, o) => s + ((recs.get(o)?.w ?? 0) - (recs.get(o)?.l ?? 0)), 0);
  return [...recs.values()]
    .filter((r) => r.w >= 3)
    .sort((a, b) => b.w - a.w || a.l - b.l || bh(b) - bh(a) || a.seed - b.seed)
    .map((r) => teams.find((t) => key(t.name) === key(r.name))!);
}

// ------------------------------------------------------------------ handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const pin = Deno.env.get('ADMIN_PIN');
  const force = !!body.force && !!pin && body.pin === pin;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: stages, error } = await sb.from('stages').select('*').order('sort');
  if (error) return json({ error: error.message }, 500);

  const last = Math.max(0, ...stages.map((s) => (s.last_sync ? new Date(s.last_sync).getTime() : 0)));
  if (!force && Date.now() - last < MIN_INTERVAL_MS) return json({ skipped: true, last_sync: new Date(last).toISOString() });

  // marca o início para evitar várias páginas disparando o scraping ao mesmo tempo
  const startedAt = new Date().toISOString();
  await sb.from('stages').update({ last_sync: startedAt }).neq('id', '');

  const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
  const cache = new Map<number, { teams: Team[]; matches: Match[]; eventHtml: string }>();
  const report: Record<string, unknown> = {};

  async function loadEvent(id: number) {
    if (!cache.has(id)) {
      const [eventHtml, resultsHtml] = await Promise.all([
        getHtml(`https://www.hltv.org/events/${id}/event`),
        getHtml(`https://www.hltv.org/results?event=${id}`),
      ]);
      const logos = new Map<string, string>();
      const matches = parseResults(resultsHtml, logos);
      const teams = parseTeams(eventHtml).map((t) => ({ ...t, logo: t.logo ?? logos.get(key(t.name)) ?? null }));
      cache.set(id, { teams, matches, eventHtml });
    }
    return cache.get(id)!;
  }

  // descobre o ID da Stage 2 pelos "grouped events" das outras fases
  if (!byId.stage2?.hltv_event_id) {
    for (const s of ['stage1', 'stage3']) {
      const id = byId[s]?.hltv_event_id;
      if (!id) continue;
      try {
        const ev = await loadEvent(id);
        const m = ev.eventHtml.match(/\/events\/(\d+)\/[a-z0-9-]*stage-2/i);
        if (m) {
          byId.stage2.hltv_event_id = Number(m[1]);
          await sb.from('stages').update({ hltv_event_id: Number(m[1]) }).eq('id', 'stage2');
          break;
        }
      } catch (_) { /* tenta a próxima */ }
    }
  }

  for (const s of stages) {
    const eventId = byId[s.id].hltv_event_id as number | null;
    if (!eventId) { report[s.id] = 'sem ID da HLTV'; continue; }
    try {
      const ev = await loadEvent(eventId);
      let teams = ev.teams;
      let matches = ev.matches;
      if (s.id === 'stage3') matches = matches.filter((m) => !m.date || m.date < PLAYOFFS_FROM);
      if (s.id === 'playoffs') {
        const swiss = ev.matches.filter((m) => !m.date || m.date < PLAYOFFS_FROM);
        matches = ev.matches.filter((m) => m.date && m.date >= PLAYOFFS_FROM);
        const q = stage3Qualifiers(ev.teams, swiss);
        teams = q.length === 8 ? q : [];
      }
      const patch: Record<string, unknown> = { last_sync: new Date().toISOString(), sync_error: null };
      if (teams.length) patch.teams = teams;
      if (s.source !== 'manual') patch.matches = matches;
      await sb.from('stages').update(patch).eq('id', s.id);
      report[s.id] = { teams: teams.length, matches: matches.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from('stages').update({ sync_error: msg }).eq('id', s.id);
      report[s.id] = { error: msg };
    }
  }
  return json({ ok: true, report });
});
