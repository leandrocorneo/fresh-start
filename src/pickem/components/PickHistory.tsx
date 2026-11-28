import { useEffect, useMemo, useState } from 'react';
import { adminCall } from '../lib/api';
import { STAGES } from '../lib/config';
import type { AnyPicks, Player, PlayoffPicks, StageId, SwissPicks } from '../lib/types';

interface HistoryRow {
  id: number;
  player_id: string;
  stage_id: StageId;
  picks: AnyPicks;
  source: 'site' | 'admin_restore' | 'inicial';
  ip: string | null;
  user_agent: string | null;
  headers: Record<string, string> | null;
  location: string | null;
  created_at: string;
}

const SOURCE_LABEL: Record<HistoryRow['source'], string> = {
  site: 'site',
  admin_restore: 'restaurado pelo admin',
  inicial: 'antes do histórico',
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function browser(ua: string | null): string {
  if (!ua) return '—';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua.slice(0, 24);
  return [br, os].filter(Boolean).join(' · ');
}

function summary(stage: StageId, p: AnyPicks): string {
  if (stage === 'playoffs') {
    const x = p as PlayoffPicks;
    return `Quartas: ${(x.qf ?? []).filter(Boolean).join(', ')} · Semis: ${(x.sf ?? []).filter(Boolean).join(', ')} · Campeão: ${(x.final ?? []).filter(Boolean).join(', ')}`;
  }
  const x = p as SwissPicks;
  return `3-0: ${(x.three_zero ?? []).join(', ')} · 3-1/3-2: ${(x.advance ?? []).join(', ')} · 0-3: ${(x.zero_three ?? []).join(', ')}`;
}

/**
 * Histórico de alterações dos palpites (só no admin). Mostra quando, de onde (IP e local) e de
 * qual navegador cada versão foi salva, e deixa restaurar qualquer versão, mesmo com a fase fechada.
 */
export default function PickHistory({ pin, players, onRestored }: { pin: string; players: Player[]; onRestored: (msg: string) => void }) {
  const [playerId, setPlayerId] = useState('');
  const [stageId, setStageId] = useState('');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const stageName = (id: StageId) => STAGES.find((s) => s.id === id)?.label ?? id;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await adminCall({ pin, action: 'history', ...(playerId ? { player_id: playerId } : {}), ...(stageId ? { stage_id: stageId } : {}) });
      setRows((r?.rows ?? []) as HistoryRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, stageId]);

  // versão anterior do mesmo jogador na mesma fase (as linhas vêm da mais nova para a mais velha)
  const previous = useMemo(() => {
    const prev = new Map<number, HistoryRow>();
    const lastSeen = new Map<string, HistoryRow>();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]!;
      const k = `${r.player_id}|${r.stage_id}`;
      const before = lastSeen.get(k);
      if (before) prev.set(r.id, before);
      lastSeen.set(k, r);
    }
    return prev;
  }, [rows]);

  async function restore(r: HistoryRow) {
    const who = nameOf.get(r.player_id) ?? 'jogador';
    if (!confirm(`Restaurar o palpite de ${who} na ${stageName(r.stage_id)} para a versão de ${fmt(r.created_at)}?\n\nVale mesmo com a fase fechada.`)) return;
    try {
      await adminCall({ pin, action: 'restore_pick', history_id: r.id });
      onRestored(`Palpite de ${who} (${stageName(r.stage_id)}) restaurado para a versão de ${fmt(r.created_at)}`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Histórico de alterações dos palpites</h3>
        <div className="flex flex-wrap gap-2">
          <select className="input" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">Todos os jogadores</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Todas as fases</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Cada vez que um palpite é salvo, fica registrada uma versão com IP, local aproximado e navegador. Só aparece aqui no
        admin. <span className="text-amber-300">IP diferente</span> = salvo de um IP diferente da versão anterior do mesmo
        jogador.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {rows.length === 0 && !loading && <p className="text-sm text-slate-400">Nenhuma alteração registrada.</p>}
      <div className="space-y-2">
        {rows.map((r) => {
          const before = previous.get(r.id);
          const ipChanged = !!before && !!before.ip && !!r.ip && before.ip !== r.ip;
          return (
            <div key={r.id} className={`rounded-lg border p-3 text-sm ${ipChanged ? 'border-amber-400/50 bg-amber-400/5' : 'border-white/10'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{nameOf.get(r.player_id) ?? r.player_id}</span>
                  <span className="text-slate-400">{stageName(r.stage_id)}</span>
                  <span className="font-mono text-xs text-slate-400">{fmt(r.created_at)}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{SOURCE_LABEL[r.source] ?? r.source}</span>
                  {ipChanged && <span className="text-xs font-bold text-amber-300">IP diferente</span>}
                </div>
                <button className="btn-ghost text-xs" onClick={() => restore(r)}>
                  Restaurar esta versão
                </button>
              </div>
              <div className="mt-1 grid gap-x-4 text-xs text-slate-300 sm:grid-cols-3">
                <span>
                  IP: <span className="font-mono">{r.ip ?? '—'}</span>
                </span>
                <span>Local: {r.location ?? (r.ip ? 'consultando…' : '—')}</span>
                <span title={r.user_agent ?? ''}>Navegador: {browser(r.user_agent)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{summary(r.stage_id, r.picks)}</p>
              {r.headers && Object.keys(r.headers).length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-slate-500">cabeçalhos de origem</summary>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-slate-500">{JSON.stringify(r.headers, null, 1)}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
