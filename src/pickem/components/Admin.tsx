import { useEffect, useMemo, useState } from 'react';
import { adminCall, loadData, triggerSync } from '../lib/api';
import { deriveAll, type Derived } from '../lib/derive';
import type { Player, StageId, StageRow } from '../lib/types';
import ResultsEditor from './ResultsEditor';
import PickHistory from './PickHistory';

const PIN_KEY = 'pickem-admin-pin';

/** Converte ISO -> valor de <input type="datetime-local"> no fuso do navegador. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function StageEditor({
  stage,
  d,
  pin,
  onSaved,
}: {
  stage: StageRow;
  d: Derived;
  pin: string;
  onSaved: (msg: string) => void;
}) {
  const [eventId, setEventId] = useState(stage.hltv_event_id?.toString() ?? '');
  const [lockAt, setLockAt] = useState(toLocal(stage.lock_at));
  const [source, setSource] = useState(stage.source);
  const [teams, setTeams] = useState(JSON.stringify(stage.teams, null, 1));
  const [matches, setMatches] = useState(JSON.stringify(stage.matches, null, 1));
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    try {
      const patch: Record<string, unknown> = {
        hltv_event_id: eventId ? Number(eventId) : null,
        lock_at: lockAt ? new Date(lockAt).toISOString() : null,
        source,
        teams: JSON.parse(teams),
      };
      if (source === 'manual') patch['matches'] = JSON.parse(matches);
      await adminCall({ pin, action: 'update_stage', stage_id: stage.id, patch });
      onSaved(`${stage.name} salvo`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-bold">{stage.name}</h3>
      <details open={stage.source === 'manual'} className="rounded-lg border border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Lançar resultados {stage.source === 'manual' ? '(modo manual)' : '(ao salvar, a fase passa para manual)'}
        </summary>
        <div className="mt-3">
          <ResultsEditor stage={stage} d={d} pin={pin} onSaved={onSaved} />
        </div>
      </details>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-slate-400">
          ID do evento na HLTV
          <input className="input w-full" value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="ex.: 9303" />
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          Palpites fecham em (vazio = aberto)
          <input type="datetime-local" className="input w-full" value={lockAt} onChange={(e) => setLockAt(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          Origem dos resultados
          <select className="input w-full" value={source} onChange={(e) => setSource(e.target.value as 'hltv' | 'manual')}>
            <option value="hltv">HLTV (automático)</option>
            <option value="manual">Manual</option>
          </select>
        </label>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-slate-400">Times (JSON) — {stage.teams.length}</summary>
        <textarea className="input mt-2 h-40 w-full font-mono text-xs" value={teams} onChange={(e) => setTeams(e.target.value)} />
      </details>
      <details open={source === 'manual'}>
        <summary className="cursor-pointer text-xs text-slate-400">
          Partidas (JSON, ordem cronológica) — {stage.matches.length} · só são gravadas no modo manual
        </summary>
        <textarea
          className="input mt-2 h-40 w-full font-mono text-xs"
          value={matches}
          onChange={(e) => setMatches(e.target.value)}
          placeholder='[{"team1":"FURIA","team2":"MOUZ","score1":2,"score2":1}]'
        />
      </details>
      <p className="text-xs text-slate-500">
        Último sync: {stage.last_sync ?? '—'} {stage.sync_error && <span className="text-amber-400">· {stage.sync_error}</span>}
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className="btn-primary" onClick={save}>
        Salvar {stage.name}
      </button>
    </div>
  );
}

export default function Admin() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '');
  const [ok, setOk] = useState(false);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const d = useMemo(() => {
    const m: Partial<Record<StageId, StageRow>> = {};
    stages.forEach((s) => (m[s.id] = s));
    return deriveAll(m, {});
  }, [stages]);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      await adminCall({ pin, action: 'check' });
      sessionStorage.setItem(PIN_KEY, pin);
      setOk(true);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function refresh() {
    const d = await loadData();
    setStages(d.stages);
    setPlayers(d.players);
    setVersion((v) => v + 1);
  }

  useEffect(() => {
    if (pin) login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ok) refresh();
  }, [ok]);

  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <form onSubmit={login} className="card w-full max-w-xs space-y-3">
          <h1 className="text-lg font-bold">Admin</h1>
          <input className="input w-full" type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
          {msg && <p className="text-sm text-red-400">{msg}</p>}
          <button className="btn-primary w-full">Entrar</button>
          <a href="#" className="block text-center text-xs text-slate-400">
            voltar ao site
          </a>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Admin do Pick'em</h1>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={async () => {
              setMsg('Sincronizando…');
              try {
                const r = await triggerSync(true, pin);
                setMsg(JSON.stringify(r?.report ?? r));
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
              refresh();
            }}
          >
            Forçar sync HLTV
          </button>
          <a href="#" className="btn-ghost">
            Voltar ao site
          </a>
        </div>
      </header>
      {msg && <p className="break-all rounded-lg bg-white/5 p-3 font-mono text-xs text-slate-300">{msg}</p>}

      {stages.map((s) => (
        <StageEditor
          key={`${s.id}-${version}`}
          stage={s}
          d={d}
          pin={pin}
          onSaved={(m) => {
            setMsg(m);
            refresh();
          }}
        />
      ))}

      <section className="card space-y-2">
        <h3 className="font-bold">Jogadores ({players.length})</h3>
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm">
            <span>{p.name}</span>
            <button
              className="btn-ghost text-xs text-red-300"
              onClick={async () => {
                if (!confirm(`Apagar ${p.name} e todos os palpites dele? Não dá para desfazer.`)) return;
                await adminCall({ pin, action: 'delete_player', player_id: p.id });
                refresh();
              }}
            >
              Apagar
            </button>
          </div>
        ))}
      </section>

      <PickHistory
        pin={pin}
        players={players}
        onRestored={(m) => {
          setMsg(m);
          refresh();
        }}
      />
    </div>
  );
}
