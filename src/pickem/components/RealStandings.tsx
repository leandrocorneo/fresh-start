import { buchholz, standings, type Recs } from '../lib/swiss';
import TeamLogo from './TeamLogo';

interface Props {
  recs: Recs;
  logoOf: (name: string) => string | null;
}

export default function RealStandings({ recs, logoOf }: Props) {
  const rows = standings(recs);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-400">
          <th className="py-1">Time</th>
          <th className="py-1 text-center">V-D</th>
          <th className="py-1 text-center" title="Buchholz">BH</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const status = r.w >= 3 ? 'text-green-400' : r.l >= 3 ? 'text-red-400' : 'text-slate-200';
          return (
            <tr key={r.key} className="border-t border-white/5">
              <td className="flex items-center gap-2 py-1">
                <TeamLogo name={r.name} logo={logoOf(r.name)} size={20} />
                <span className="truncate">{r.name}</span>
              </td>
              <td className={`py-1 text-center font-mono font-semibold ${status}`}>
                {r.w}-{r.l}
              </td>
              <td className="py-1 text-center font-mono text-slate-400">{buchholz(recs, r.key)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
