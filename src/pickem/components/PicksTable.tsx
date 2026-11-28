import { SWISS_PASS } from '../lib/config';
import type { Grade } from '../lib/scoring';
import { teamKey } from '../lib/teams';
import type { AnyPicks, GradedPick, Player } from '../lib/types';
import TeamLogo from './TeamLogo';

export interface TableRow {
  player: Player;
  picks: AnyPicks | null;
  submitted: boolean;
  grade: Grade | null;
}

interface Props {
  rows: TableRow[];
  playoff: boolean;
  locked: boolean;
  myId?: string;
  logoOf: (name: string) => string | null;
  /** Coluna opcional de previsão (texto por jogador). Sem ela a tabela fica como antes. */
  forecast?: { label: string; hint: string; values: Map<string, string> } | undefined;
}

const SWISS_GROUPS = [
  { slot: 'three_zero', label: '3:0', bg: 'bg-green-700/60', n: 2 },
  { slot: 'advance', label: '3:1 3:2', bg: 'bg-blue-800/60', n: 6 },
  { slot: 'zero_three', label: '0:3', bg: 'bg-red-800/60', n: 2 },
];
const PLAYOFF_GROUPS = [
  { slot: 'qf', label: 'Quartas', bg: 'bg-blue-800/60', n: 4 },
  { slot: 'sf', label: 'Semis', bg: 'bg-indigo-800/60', n: 2 },
  { slot: 'final', label: 'Campeão', bg: 'bg-amber-700/60', n: 1 },
];

export default function PicksTable({ rows, playoff, locked, myId, logoOf, forecast }: Props) {
  const groups = playoff ? PLAYOFF_GROUPS : SWISS_GROUPS;
  if (rows.length === 0) return <p className="text-sm text-slate-400">Ninguém entrou ainda.</p>;

  // Só exibição: cada time ganha uma coluna fixa dentro do grupo, escolhida para que o máximo de
  // palpites em comum fique na mesma posição para todo mundo. Quando dois times de uma pessoa
  // disputam a mesma coluna, o mais escolhido pela galera fica nela e o outro vai para a vaga livre.
  const layout = new Map<string, { col: Map<string, number>; rank: Map<string, number> }>();
  for (const g of groups) {
    const sets = rows
      .filter((r) => r.picks)
      .map((r) => (r.grade?.items ?? []).filter((i) => i.slot === g.slot).map((i) => teamKey(i.team)));
    const count = new Map<string, number>();
    sets.forEach((set) => set.forEach((k) => count.set(k, (count.get(k) ?? 0) + 1)));
    const pop = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
    const rank = new Map(pop.map((k, i) => [k, i]));
    const col = new Map<string, number>();
    const score = () => sets.reduce((acc, set) => acc + new Set(set.filter((k) => col.has(k)).map((k) => col.get(k))).size, 0);
    for (const k of pop) {
      let best = -1;
      let bestCol = 0;
      for (let c = 0; c < g.n; c++) {
        col.set(k, c);
        const v = score();
        if (v > best) [best, bestCol] = [v, c];
      }
      col.set(k, bestCol);
    }
    for (let improved = true; improved; ) {
      improved = false;
      for (const k of pop) {
        const base = score();
        const old = col.get(k)!;
        for (let c = 0; c < g.n; c++) {
          col.set(k, c);
          if (score() > base) {
            improved = true;
            break;
          }
          col.set(k, old);
        }
      }
    }
    layout.set(g.slot, { col, rank });
  }
  const placed = (items: GradedPick[], slot: string, n: number): (GradedPick | null)[] => {
    const { col, rank } = layout.get(slot)!;
    const mine = items
      .filter((i) => i.slot === slot)
      .sort((a, b) => (rank.get(teamKey(a.team)) ?? 0) - (rank.get(teamKey(b.team)) ?? 0));
    const out: (GradedPick | null)[] = Array.from({ length: n }, () => null);
    const rest: GradedPick[] = [];
    for (const it of mine) {
      const c = col.get(teamKey(it.team));
      if (c !== undefined && c < n && !out[c]) out[c] = it;
      else rest.push(it);
    }
    for (const it of rest) {
      const free = out.findIndex((x) => !x);
      if (free >= 0) out[free] = it;
    }
    return out;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-xs text-slate-300">
            <th className="sticky left-0 bg-[#111a2e] px-2 text-left">Jogador</th>
            {groups.map((g) => (
              <th key={g.slot} className="px-2 text-center font-bold">
                {g.label}
              </th>
            ))}
            <th className="px-2 text-center">Acertos</th>
            {forecast && (
              <th className="px-2 text-center" title={forecast.hint}>
                {forecast.label}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, picks, submitted, grade }) => {
            const me = player.id === myId;
            const items: GradedPick[] = grade?.items ?? [];
            return (
              <tr key={player.id}>
                <td className={`sticky left-0 z-10 rounded-l-lg bg-[#16213a] px-3 py-2 font-bold uppercase ${me ? 'text-sky-300' : ''}`}>
                  {player.name}
                  {me && <span className="ml-1 text-[10px] font-normal normal-case text-slate-400">(você)</span>}
                </td>
                {picks ? (
                  groups.map((g) => {
                    const cell = placed(items, g.slot, g.n);
                    return (
                      <td key={g.slot} className={`px-2 py-1.5 ${g.bg}`}>
                        <div className="flex justify-center gap-1">
                          {cell.map((it, i) =>
                            it ? (
                              <TeamLogo key={i} name={it.team} logo={logoOf(it.team)} size={36} status={it.status} />
                            ) : (
                              <div key={i} className="h-9 w-9 rounded-full border border-dashed border-white/20" />
                            ),
                          )}
                        </div>
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={groups.length} className="bg-white/5 px-3 py-2 text-center text-slate-400">
                    {submitted ? '✓ palpite enviado' : 'ainda não enviou'}
                  </td>
                )}
                <td className={`${forecast ? '' : 'rounded-r-lg '}bg-[#16213a] px-3 py-2 text-center`}>
                  {grade && picks ? (
                    <div className="leading-tight">
                      <span className="font-bold text-green-400">{grade.correct}</span>
                      <span className="text-slate-500"> / </span>
                      <span className="font-bold text-red-400">{grade.wrong}</span>
                      {!playoff && grade.correct >= SWISS_PASS && (
                        <div className="text-[10px] font-bold text-green-400">PASSOU</div>
                      )}
                      {!playoff && locked && grade.correct + grade.pending < SWISS_PASS && (
                        <div className="text-[10px] font-bold text-red-400">ELIMINADO</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                {forecast && (
                  <td className="rounded-r-lg bg-[#16213a] px-3 py-2 text-center font-mono font-bold" title={forecast.hint}>
                    {forecast.values.get(player.id) ?? <span className="font-sans font-normal text-slate-500">—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
