import { useMemo, useState } from 'react';
import { adminCall } from '../lib/api';
import type { Derived } from '../lib/derive';
import { QF_PAIRS } from '../lib/scoring';
import { isDone, simulateSwiss } from '../lib/swiss';
import { sameTeam, teamKey } from '../lib/teams';
import type { Match, StageRow, Team } from '../lib/types';
import TeamLogo from './TeamLogo';

interface Props {
  stage: StageRow;
  d: Derived;
  pin: string;
  onSaved: (msg: string) => void;
}

interface Pending {
  a: string;
  b: string;
  label: string;
  bo3: boolean;
}

const today = () => {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** Vencedor do confronto a x b nos resultados (ou null). */
function winnerOf(matches: Match[], a: string, b: string): string | null {
  if (!a || !b) return null;
  const m = matches.find(
    (m) => (sameTeam(m.team1, a) && sameTeam(m.team2, b)) || (sameTeam(m.team1, b) && sameTeam(m.team2, a)),
  );
  if (!m || m.score1 === m.score2) return null;
  return m.score1 > m.score2 ? m.team1 : m.team2;
}

/** Próximos jogos sugeridos: rodada atual da Swiss (pelo emparelhamento do simulador) ou a chave dos playoffs. */
function pendingMatches(stage: StageRow, d: Derived): { teams: Team[]; active: Team[]; pending: Pending[] } {
  if (stage.id === 'playoffs') {
    const teams = d.playoffs.teams;
    const matches = d.playoffs.matches;
    const qf = QF_PAIRS.map(([x, y]) => [teams[x]?.name ?? '', teams[y]?.name ?? '']);
    const qfW = qf.map(([a, b]) => winnerOf(matches, a, b) ?? '');
    const sf = [
      [qfW[0] ?? '', qfW[1] ?? ''],
      [qfW[2] ?? '', qfW[3] ?? ''],
    ];
    const sfW = sf.map(([a, b]) => winnerOf(matches, a, b) ?? '');
    const all = [
      ...qf.map(([a, b]) => ({ a, b, label: 'Quartas' })),
      ...sf.map(([a, b]) => ({ a, b, label: 'Semi' })),
      { a: sfW[0] ?? '', b: sfW[1] ?? '', label: 'Final' },
    ];
    const pending = all.filter((p) => p.a && p.b && !winnerOf(matches, p.a, p.b)).map((p) => ({ ...p, bo3: true }));
    const out = new Set<string>();
    matches.forEach((m) => m.score1 !== m.score2 && out.add(teamKey(m.score1 > m.score2 ? m.team2 : m.team1)));
    return { teams, active: teams.filter((t) => !out.has(teamKey(t.name))), pending };
  }

  const sd = d[stage.id];
  if (!sd.complete) return { teams: sd.teams, active: sd.teams, pending: [] };
  const sim = simulateSwiss(sd.teams, {}, sd.matches);
  const last = sim.rounds.at(-1);
  const pending =
    last?.matches
      .filter((m) => !m.winner)
      .map((m) => {
        const [w = 0, l = 0] = m.group.split('-').map(Number);
        return {
          a: sim.recs.get(m.a)!.name,
          b: sim.recs.get(m.b)!.name,
          label: `Rodada ${last.n} · ${m.group}`,
          bo3: w === 2 || l === 2,
        };
      }) ?? [];
  const active = sd.teams.filter((t) => {
    const r = sd.realRecs.get(teamKey(t.name));
    return !r || !isDone(r);
  });
  return { teams: sd.teams, active, pending };
}

export default function ResultsEditor({ stage, d, pin, onSaved }: Props) {
  const matches = stage.matches;
  const { teams, active, pending } = useMemo(() => pendingMatches(stage, d), [stage, d]);
  const logoOf = d.logoOf;

  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [score1, setScore1] = useState('1');
  const [score2, setScore2] = useState('0');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function persist(next: Match[], msg: string) {
    setBusy(true);
    setErr(null);
    try {
      // modo manual: o sync da HLTV deixa de sobrescrever as partidas desta fase
      await adminCall({ pin, action: 'update_stage', stage_id: stage.id, patch: { source: 'manual', matches: next } });
      onSaved(msg);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function prefill(p: Pending, winner: string) {
    const loser = sameTeam(winner, p.a) ? p.b : p.a;
    setTeam1(winner);
    setTeam2(loser);
    setScore1(p.bo3 ? '2' : '1');
    setScore2('0');
    setErr(null);
  }

  function add() {
    const s1 = Number(score1);
    const s2 = Number(score2);
    if (!team1 || !team2) return setErr('Escolha os dois times');
    if (sameTeam(team1, team2)) return setErr('Os times precisam ser diferentes');
    if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) return setErr('Placar inválido');
    if (s1 === s2) return setErr('Precisa ter um vencedor');
    if (winnerOf(matches, team1, team2)) return setErr('Esse confronto já tem resultado nesta fase');
    const m: Match = { team1, team2, score1: s1, score2: s2, date: date || null };
    persist([...matches, m], `${stage.name}: ${team1} ${s1}-${s2} ${team2} salvo`).then((ok) => {
      if (!ok) return;
      setTeam1('');
      setTeam2('');
    });
  }

  function remove(i: number) {
    const m = matches[i];
    if (!m || !confirm(`Apagar ${m.team1} ${m.score1}-${m.score2} ${m.team2}?`)) return;
    persist(
      matches.filter((_, j) => j !== i),
      `${stage.name}: resultado apagado`,
    );
  }

  if (teams.length === 0) {
    return <p className="text-xs text-slate-500">Times desta fase ainda não definidos.</p>;
  }

  const options = (exclude: string) =>
    active
      .filter((t) => !exclude || !sameTeam(t.name, exclude))
      .map((t) => (
        <option key={t.name} value={t.name}>
          {t.name}
        </option>
      ));

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Próximos jogos (sugestão pelo emparelhamento do simulador). Clique no vencedor, ajuste o placar e clique em
            Adicionar. Se o confronto real for outro, escolha os times na mão.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {pending.map((p) => (
              <div key={`${p.a}|${p.b}`} className="overflow-hidden rounded-lg border border-white/10 bg-[#0d1528]">
                <div className="px-2 pt-1 text-[10px] font-semibold text-slate-500">
                  {p.label} · {p.bo3 ? 'MD3' : 'MD1'}
                </div>
                {[p.a, p.b].map((t) => {
                  const sel = team1 && team2 && sameTeam(team1, t) && [p.a, p.b].some((x) => sameTeam(x, team2));
                  return (
                    <button
                      key={t}
                      onClick={() => prefill(p, t)}
                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                        sel ? 'bg-green-600/25 font-semibold' : 'hover:bg-white/5'
                      }`}
                    >
                      <TeamLogo name={t} logo={logoOf(t)} size={20} />
                      <span className="truncate">{t}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-slate-400">
          Vencedor
          <select className="input block w-44" value={team1} onChange={(e) => setTeam1(e.target.value)}>
            <option value="">—</option>
            {options(team2)}
          </select>
        </label>
        <input
          className="input w-14 text-center"
          inputMode="numeric"
          value={score1}
          onChange={(e) => setScore1(e.target.value)}
          aria-label="Placar do vencedor"
        />
        <span className="pb-2 text-slate-500">x</span>
        <input
          className="input w-14 text-center"
          inputMode="numeric"
          value={score2}
          onChange={(e) => setScore2(e.target.value)}
          aria-label="Placar do perdedor"
        />
        <label className="space-y-1 text-xs text-slate-400">
          Perdedor
          <select className="input block w-44" value={team2} onChange={(e) => setTeam2(e.target.value)}>
            <option value="">—</option>
            {options(team1)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          Data
          <input type="date" className="input block" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={add} disabled={busy}>
          {busy ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="space-y-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Resultados ({matches.length})</h4>
        {matches.length === 0 && <p className="text-xs text-slate-500">Nenhum ainda.</p>}
        {matches.map((m, i) => (
          <div key={i} className="flex items-center gap-2 border-t border-white/5 py-1 text-sm">
            <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{m.date ?? ''}</span>
            <span className={`flex-1 truncate text-right ${m.score1 > m.score2 ? 'font-bold' : 'text-slate-400'}`}>
              {m.team1}
            </span>
            <span className="font-mono">
              {m.score1}-{m.score2}
            </span>
            <span className={`flex-1 truncate ${m.score2 > m.score1 ? 'font-bold' : 'text-slate-400'}`}>{m.team2}</span>
            <button className="btn-ghost px-2 py-0.5 text-xs text-red-300" onClick={() => remove(i)} disabled={busy}>
              Apagar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
