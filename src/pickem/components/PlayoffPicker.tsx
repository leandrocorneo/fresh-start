import { QF_PAIRS } from '../lib/scoring';
import type { PickStatus, PlayoffPicks, PlayoffRound, Team } from '../lib/types';
import { sameTeam } from '../lib/teams';
import TeamLogo from './TeamLogo';

interface Props {
  teams: Team[]; // 8, ordem = seed
  draft: PlayoffPicks;
  onChange: (p: PlayoffPicks) => void;
  locked: boolean;
  statusOf: (team: string, round: PlayoffRound) => PickStatus;
  logoOf: (name: string) => string | null;
}

export default function PlayoffPicker({ teams, draft, onChange, locked, statusOf, logoOf }: Props) {
  const qfMatches = QF_PAIRS.map(([a, b]) => [teams[a]?.name ?? '', teams[b]?.name ?? '']);
  const sfMatches = [
    [draft.qf[0], draft.qf[1]],
    [draft.qf[2], draft.qf[3]],
  ];
  const finalMatch = [draft.sf[0], draft.sf[1]];

  function set(round: PlayoffRound, idx: number, team: string) {
    if (locked || !team) return;
    const next: PlayoffPicks = { qf: [...draft.qf], sf: [...draft.sf], final: [...draft.final] };
    next[round][idx] = team;
    // remove escolhas posteriores que ficaram impossíveis
    for (let i = 0; i < 2; i++) {
      const pool = [next.qf[i * 2], next.qf[i * 2 + 1]];
      if (next.sf[i] && !pool.some((t) => t && sameTeam(t, next.sf[i]))) next.sf[i] = '';
    }
    if (next.final[0] && !next.sf.some((t) => t && sameTeam(t, next.final[0]))) next.final[0] = '';
    onChange(next);
  }

  const column = (title: string, round: PlayoffRound, matches: string[][]) => (
    <div className="flex min-w-[180px] flex-1 flex-col justify-around gap-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      {matches.map((pair, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-white/10 bg-[#0d1528]">
          {pair.map((t, j) => {
            const picked = !!t && !!draft[round][i] && sameTeam(draft[round][i], t);
            return (
              <button
                key={j}
                disabled={locked || !t}
                onClick={() => set(round, i, t)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                  picked ? 'bg-green-600/25 font-semibold' : 'hover:bg-white/5'
                } disabled:cursor-default`}
              >
                {t ? (
                  <>
                    <TeamLogo name={t} logo={logoOf(t)} size={22} status={picked ? statusOf(t, round) : null} />
                    <span className="truncate">{t}</span>
                  </>
                ) : (
                  <span className="py-0.5 text-slate-500">a definir</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {column('Quartas', 'qf', qfMatches)}
      {column('Semifinais', 'sf', sfMatches)}
      {column('Final', 'final', [finalMatch])}
    </div>
  );
}
