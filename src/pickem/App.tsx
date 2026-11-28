import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVENT_NAME, HIDE_PICKS_UNTIL_LOCK, POLL_MS, STAGES, SYNC_STALE_MS } from './lib/config';
import { loadData, savePicks, triggerSync, type AppData } from './lib/api';
import { loadIdentity, loadSims, saveSims, type Identity } from './lib/identity';
import { deriveAll, isLocked, type SwissDerived } from './lib/derive';
import {
  emptyPlayoffs,
  emptySwiss,
  gradePlayoffs,
  gradeSwiss,
  isPlayoffComplete,
  isSwissComplete,
  picksFromRecs,
  playoffPickStatus,
  swissPickStatus,
  type Grade,
} from './lib/scoring';
import { teamKey } from './lib/teams';
import { useForecast } from './lib/useForecast';
import type { AnyPicks, PlayoffPicks, StageId, StageRow, SwissPicks, SwissStageId } from './lib/types';
import NameGate from './components/NameGate';
import SwissSimulator from './components/SwissSimulator';
import SwissPickEditor from './components/SwissPickEditor';
import PlayoffPicker from './components/PlayoffPicker';
import RealStandings from './components/RealStandings';
import PicksTable, { type TableRow } from './components/PicksTable';
import TeamLogo from './components/TeamLogo';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function defaultTab(stages: StageRow[]): StageId {
  const now = Date.now();
  const upcoming = stages.filter((s) => s.lock_at && new Date(s.lock_at).getTime() > now).sort((a, b) => a.sort - b.sort)[0];
  return upcoming?.id ?? 'stage1';
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity());
  const [editingName, setEditingName] = useState(false);
  const [data, setData] = useState<AppData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<StageId | null>(null);
  const [sims, setSims] = useState<Record<string, Record<string, string>>>(() => loadSims());
  const [drafts, setDrafts] = useState<Partial<Record<StageId, AnyPicks>>>({});
  const [dirty, setDirty] = useState<Partial<Record<StageId, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await loadData(identity?.playerId);
      setData(d);
      setLoadErr(null);
      return d;
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [identity?.playerId]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerSync();
    } catch (e) {
      console.warn('sync', e);
    } finally {
      setSyncing(false);
      await reload();
    }
  }, [reload]);

  // carga inicial + atualização periódica + sync com a HLTV quando os dados estão velhos
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await reload();
      if (!alive || !d) return;
      const last = Math.max(0, ...d.stages.map((s) => (s.last_sync ? new Date(s.last_sync).getTime() : 0)));
      if (Date.now() - last > SYNC_STALE_MS) sync();
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [reload, sync]);

  useEffect(() => {
    if (data && !tab) setTab(defaultTab(data.stages));
  }, [data, tab]);

  // carrega meus palpites salvos nos rascunhos que não estão sendo editados
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of data.mine) if (!dirty[m.stage_id]) next[m.stage_id] = m.picks;
      return next;
    });
  }, [data, dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stageMap = useMemo(() => {
    const m: Partial<Record<StageId, StageRow>> = {};
    data?.stages.forEach((s) => (m[s.id] = s));
    return m;
  }, [data]);

  const d = useMemo(() => deriveAll(stageMap, sims), [stageMap, sims]);

  const gradeFor = useCallback(
    (stage: StageId, picks: AnyPicks): Grade =>
      stage === 'playoffs' ? gradePlayoffs(picks as PlayoffPicks, d.playoffs.recs) : gradeSwiss(picks as SwissPicks, d[stage].realRecs),
    [d],
  );

  /** Palpite visível de um jogador numa fase (dos outros só depois do fechamento; o meu sempre). */
  const visiblePicks = useCallback(
    (playerId: string, stage: StageId): AnyPicks | null => {
      if (!data) return null;
      if (playerId === identity?.playerId) return data.mine.find((m) => m.stage_id === stage)?.picks ?? null;
      const row = data.picks.find((p) => p.player_id === playerId && p.stage_id === stage);
      if (!row) return null;
      if (HIDE_PICKS_UNTIL_LOCK && !isLocked(stageMap[stage])) return null;
      return row.picks;
    },
    [data, identity?.playerId, stageMap],
  );

  const forecast = useForecast(tab, d, stageMap, data, visiblePicks);

  if (!identity || editingName) {
    return (
      <NameGate
        current={identity}
        onDone={(i) => {
          setIdentity(i);
          setEditingName(false);
        }}
        {...(identity ? { onCancel: () => setEditingName(false) } : {})}
      />
    );
  }

  if (!data || !tab) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-slate-400">
        {loadErr ? `Erro ao carregar: ${loadErr}` : 'Carregando…'}
      </div>
    );
  }

  const row = stageMap[tab];
  const locked = isLocked(row);
  const isPlayoff = tab === 'playoffs';
  const swissD: SwissDerived | null = isPlayoff ? null : d[tab as SwissStageId];
  const draft: AnyPicks = drafts[tab] ?? (isPlayoff ? emptyPlayoffs() : emptySwiss());
  const complete = isPlayoff ? isPlayoffComplete(draft as PlayoffPicks) : isSwissComplete(draft as SwissPicks);
  const savedMine = data.mine.find((m) => m.stage_id === tab);

  const setDraft = (p: AnyPicks) => {
    setDrafts((prev) => ({ ...prev, [tab]: p }));
    setDirty((prev) => ({ ...prev, [tab]: true }));
  };

  async function save() {
    if (!identity) return;
    setSaving(true);
    try {
      await savePicks(identity.playerId, tab!, draft);
      setDirty((prev) => ({ ...prev, [tab!]: false }));
      await reload();
      setToast({ ok: true, msg: 'Palpite salvo!' });
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const updateSim = (next: Record<string, string>) => {
    const all = { ...sims, [tab]: next };
    setSims(all);
    saveSims(all);
  };

  const keyToTeam = new Map((swissD?.teams ?? []).map((t) => [teamKey(t.name), t]));
  const nameOf = (k: string) => keyToTeam.get(k)?.name ?? k;
  const logoByKey = (k: string) => keyToTeam.get(k)?.logo ?? d.logoOf(nameOf(k));

  const tableRows: TableRow[] = data.players.map((p) => {
    const picks = visiblePicks(p.id, tab);
    return {
      player: p,
      picks,
      submitted: data.submitted.some((s) => s.player_id === p.id && s.stage_id === tab),
      grade: picks ? gradeFor(tab, picks) : null,
    };
  });
  if (locked) tableRows.sort((a, b) => (b.grade?.correct ?? -1) - (a.grade?.correct ?? -1));

  const ranking = data.players
    .map((p) => {
      const per = STAGES.map((s) => {
        const pk = visiblePicks(p.id, s.id);
        return pk ? gradeFor(s.id, pk).correct : null;
      });
      return { p, per, total: per.reduce<number>((a, b) => a + (b ?? 0), 0) };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {/* topo */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pick'em · {EVENT_NAME}</h1>
          <p className="text-sm text-slate-400">Simule as fases, salve seus palpites e acompanhe quem está errando.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Você é</span>
          <span className="font-bold text-sky-300">{identity.name}</span>
          <button className="btn-ghost" onClick={() => setEditingName(true)}>
            Trocar conta
          </button>
        </div>
      </header>

      {/* abas */}
      <nav className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const r = stageMap[s.id];
          const l = isLocked(r);
          return (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`rounded-lg px-4 py-2 text-left text-sm transition ${
                tab === s.id ? 'bg-sky-500 text-slate-950' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="font-bold">{s.label}</div>
              <div className={`text-[11px] ${tab === s.id ? 'text-slate-900' : 'text-slate-400'}`}>
                {s.dates} · {l ? 'fechado' : 'aberto'}
              </div>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* simulador */}
        <section className="card space-y-3 lg:col-span-2">
          <h2 className="text-lg font-bold">Simulador · {STAGES.find((s) => s.id === tab)!.label}</h2>
          {isPlayoff ? (
            d.playoffs.teams.length < 8 ? (
              <p className="text-sm text-slate-400">
                Os 8 times dos playoffs saem da Stage 3. Termine a simulação da Stage 3 (ou espere o resultado real) para montar a
                chave.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-400">
                  {d.playoffs.fromReal ? 'Chave real (classificação da Stage 3).' : 'Chave montada a partir da sua simulação da Stage 3.'}{' '}
                  Clique em quem vence cada jogo.
                </p>
                <PlayoffPicker
                  teams={d.playoffs.teams}
                  draft={draft as PlayoffPicks}
                  onChange={setDraft}
                  locked={locked}
                  logoOf={d.logoOf}
                  statusOf={(t, r) => playoffPickStatus(r, d.playoffs.recs.get(teamKey(t)))}
                />
              </>
            )
          ) : swissD && swissD.sim ? (
            <SwissSimulator
              sim={swissD.sim}
              nameOf={nameOf}
              logoOf={logoByKey}
              onPick={(id, w) => updateSim({ ...(sims[tab] ?? {}), [id]: w })}
              onReset={() => updateSim({})}
              onUse={() => {
                setDraft(picksFromRecs(swissD.sim!.recs));
                setToast({ ok: true, msg: 'Simulação copiada para o seu Pick’em. Não esqueça de salvar.' });
              }}
              canUse={!locked}
            />
          ) : (
            <p className="text-sm text-slate-400">
              Ainda faltam times nesta fase. Simule a fase anterior até o fim (ou espere o resultado real) para liberar.
            </p>
          )}
        </section>

        {/* meu pickem + classificação real */}
        <aside className="space-y-5">
          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Meu Pick'em</h2>
              <span className={`text-xs ${locked ? 'text-red-400' : 'text-slate-400'}`}>
                {locked ? 'Fechado' : row?.lock_at ? `Fecha ${fmt(row.lock_at)}` : 'Aberto'}
              </span>
            </div>
            {isPlayoff ? (
              <ul className="space-y-1 text-sm">
                {(['qf', 'sf', 'final'] as const).map((r) => (
                  <li key={r} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-slate-400">{r === 'qf' ? 'Quartas' : r === 'sf' ? 'Semis' : 'Campeão'}</span>
                    {(draft as PlayoffPicks)[r].filter(Boolean).map((t) => (
                      <TeamLogo key={t} name={t} logo={d.logoOf(t)} size={30} status={playoffPickStatus(r, d.playoffs.recs.get(teamKey(t)))} />
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <SwissPickEditor
                teams={swissD!.teams}
                draft={draft as SwissPicks}
                onChange={setDraft}
                locked={locked}
                logoOf={d.logoOf}
                statusOf={(t, c) => swissPickStatus(c, swissD!.realRecs.get(teamKey(t)))}
              />
            )}
            {!locked && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {dirty[tab] ? 'Alterações não salvas' : savedMine ? `Salvo em ${fmt(savedMine.updated_at)}` : 'Nada salvo ainda'}
                </span>
                <button className="btn-primary" onClick={save} disabled={!complete || saving}>
                  {saving ? 'Salvando…' : 'Salvar palpite'}
                </button>
              </div>
            )}
          </section>

          <section className="card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Resultado real (HLTV)</h2>
              <button className="btn-ghost text-xs" onClick={sync} disabled={syncing}>
                {syncing ? 'Atualizando…' : 'Atualizar'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Último sync: {fmt(row?.last_sync ?? null)}
              {row?.source === 'manual' && ' · resultados manuais'}
            </p>
            {row?.sync_error && <p className="text-xs text-amber-400">Aviso do sync: {row.sync_error}</p>}
            {isPlayoff ? (
              d.playoffs.matches.length ? (
                <ul className="space-y-1 text-sm">
                  {d.playoffs.matches.map((m, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className={m.score1 > m.score2 ? 'font-bold' : 'text-slate-400'}>{m.team1}</span>
                      <span className="font-mono">
                        {m.score1}-{m.score2}
                      </span>
                      <span className={m.score2 > m.score1 ? 'font-bold' : 'text-slate-400'}>{m.team2}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Nenhum jogo de playoff ainda.</p>
              )
            ) : swissD!.matches.length ? (
              <RealStandings recs={swissD!.realRecs} logoOf={d.logoOf} />
            ) : (
              <p className="text-sm text-slate-400">Nenhum jogo desta fase ainda.</p>
            )}
          </section>
        </aside>
      </div>

      {/* tabela da galera */}
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Palpites da galera · {STAGES.find((s) => s.id === tab)!.label}</h2>
        <PicksTable rows={tableRows} playoff={isPlayoff} locked={locked} myId={identity.playerId} logoOf={d.logoOf} forecast={forecast} />
        <p className="text-xs text-slate-500">
          ✗ vermelho = palpite que já não tem como acertar · ✓ verde = acerto confirmado · sem marca = em aberto. 3:0 só vale com
          3-0, 3:1/3:2 só vale classificando com 3-1 ou 3-2, 0:3 só vale com 0-3.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Ranking geral</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-1">#</th>
                <th className="py-1">Jogador</th>
                {STAGES.map((s) => (
                  <th key={s.id} className="py-1 text-center">
                    {s.label}
                  </th>
                ))}
                <th className="py-1 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(({ p, per, total }, i) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-1.5 text-slate-500">{i + 1}</td>
                  <td className={`py-1.5 font-semibold ${p.id === identity.playerId ? 'text-sky-300' : ''}`}>{p.name}</td>
                  {per.map((c, j) => (
                    <td key={j} className="py-1.5 text-center font-mono">
                      {c ?? '—'}
                    </td>
                  ))}
                  <td className="py-1.5 text-center font-mono font-bold">{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="pb-4 text-center text-xs text-slate-500">
        Dados de times, logos e resultados: HLTV.org · atualização automática a cada ~10 min
      </footer>

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold shadow-lg ${
            toast.ok ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
