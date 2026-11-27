import type { PickStatus, SwissCategory, SwissPicks, Team } from '../lib/types';
import { sameTeam } from '../lib/teams';
import TeamLogo from './TeamLogo';

export const SWISS_SLOTS: { cat: SwissCategory; label: string; max: number; bg: string; chip: string }[] = [
  { cat: 'three_zero', label: '3:0', max: 2, bg: 'bg-green-700/70', chip: 'bg-green-600 text-white' },
  { cat: 'advance', label: '3:1 / 3:2', max: 6, bg: 'bg-blue-800/70', chip: 'bg-blue-600 text-white' },
  { cat: 'zero_three', label: '0:3', max: 2, bg: 'bg-red-800/70', chip: 'bg-red-600 text-white' },
];

interface Props {
  teams: Team[];
  draft: SwissPicks;
  onChange: (p: SwissPicks) => void;
  locked: boolean;
  statusOf: (team: string, cat: SwissCategory) => PickStatus;
  logoOf: (name: string) => string | null;
}

export default function SwissPickEditor({ teams, draft, onChange, locked, statusOf, logoOf }: Props) {
  const catOf = (name: string) => SWISS_SLOTS.find((s) => draft[s.cat].some((t) => sameTeam(t, name)))?.cat ?? null;

  function toggle(name: string, cat: SwissCategory) {
    if (locked) return;
    const current = catOf(name);
    const next: SwissPicks = {
      three_zero: draft.three_zero.filter((t) => !sameTeam(t, name)),
      advance: draft.advance.filter((t) => !sameTeam(t, name)),
      zero_three: draft.zero_three.filter((t) => !sameTeam(t, name)),
    };
    if (current !== cat) {
      const max = SWISS_SLOTS.find((s) => s.cat === cat)!.max;
      if (next[cat].length >= max) return; // slot cheio
      next[cat] = [...next[cat], name];
    }
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SWISS_SLOTS.map((s) => (
          <div key={s.cat} className={`rounded-lg p-2 ${s.bg}`}>
            <div className="mb-1 text-center text-xs font-bold">{s.label}</div>
            <div className="flex gap-1.5">
              {Array.from({ length: s.max }).map((_, i) => {
                const t = draft[s.cat][i];
                return t ? (
                  <button key={i} onClick={() => toggle(t, s.cat)} disabled={locked} title={locked ? t : `Remover ${t}`}>
                    <TeamLogo name={t} logo={logoOf(t)} size={40} status={statusOf(t, s.cat)} />
                  </button>
                ) : (
                  <div key={i} className="h-10 w-10 rounded-full border-2 border-dashed border-white/25" />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!locked && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {teams.map((t) => {
            const cat = catOf(t.name);
            return (
              <div key={t.name} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
                <TeamLogo name={t.name} logo={t.logo ?? null} size={24} />
                <span className="flex-1 truncate text-sm">{t.name}</span>
                {SWISS_SLOTS.map((s) => {
                  const full = draft[s.cat].length >= s.max && cat !== s.cat;
                  return (
                    <button
                      key={s.cat}
                      onClick={() => toggle(t.name, s.cat)}
                      disabled={full}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        cat === s.cat ? s.chip : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      } disabled:opacity-30`}
                    >
                      {s.cat === 'advance' ? 'AV' : s.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
