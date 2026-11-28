import { SWISS_PASS } from '../lib/config';
import type { Grade } from '../lib/scoring';
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
                    const cell = items.filter((i) => i.slot === g.slot);
                    return (
                      <td key={g.slot} className={`px-2 py-1.5 ${g.bg}`}>
                        <div className="flex justify-center gap-1">
                          {Array.from({ length: g.n }).map((_, i) =>
                            cell[i] ? (
                              <TeamLogo key={i} name={cell[i].team} logo={logoOf(cell[i].team)} size={36} status={cell[i].status} />
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
