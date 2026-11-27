import type { SimResult } from '../lib/swiss';
import { standings } from '../lib/swiss';
import TeamLogo from './TeamLogo';

interface Props {
  sim: SimResult;
  nameOf: (key: string) => string;
  logoOf: (key: string) => string | null;
  onPick: (matchId: string, winnerKey: string) => void;
  onReset: () => void;
  onUse: () => void;
  canUse: boolean;
}

const BUCKETS: { label: string; test: (w: number, l: number) => boolean; cls: string }[] = [
  { label: '3-0', test: (w, l) => w === 3 && l === 0, cls: 'border-green-600/60 bg-green-900/30' },
  { label: '3-1', test: (w, l) => w === 3 && l === 1, cls: 'border-sky-600/60 bg-sky-900/30' },
  { label: '3-2', test: (w, l) => w === 3 && l === 2, cls: 'border-sky-600/60 bg-sky-900/30' },
  { label: '2-3', test: (w, l) => w === 2 && l === 3, cls: 'border-red-800/50 bg-red-950/30' },
  { label: '1-3', test: (w, l) => w === 1 && l === 3, cls: 'border-red-800/50 bg-red-950/30' },
  { label: '0-3', test: (w, l) => w === 0 && l === 3, cls: 'border-red-600/60 bg-red-900/30' },
];

export default function SwissSimulator({ sim, nameOf, logoOf, onPick, onReset, onUse, canUse }: Props) {
  const table = standings(sim.recs);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Clique no vencedor de cada jogo. Jogos com selo <span className="font-semibold text-amber-300">HLTV</span> já
          aconteceram e não mudam.
        </p>
        <button className="btn-ghost shrink-0" onClick={onReset}>
          Limpar
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {sim.rounds.map((round) => {
          const groups = [...new Set(round.matches.map((m) => m.group))];
          return (
            <div key={round.n} className="min-w-[190px] flex-1 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rodada {round.n}</h4>
              {groups.map((g) => (
                <div key={g} className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500">{g}</div>
                  {round.matches
                    .filter((m) => m.group === g)
                    .map((m) => (
                      <div key={m.id} className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0d1528]">
                        {m.real && (
                          <span className="absolute right-1 top-1 rounded bg-amber-400/90 px-1 text-[9px] font-bold text-slate-900">
                            HLTV
                          </span>
                        )}
                        {[m.a, m.b].map((k) => {
                          const won = m.winner === k;
                          const lost = m.winner && m.winner !== k;
                          return (
                            <button
                              key={k}
                              disabled={m.real}
                              onClick={() => onPick(m.id, k)}
                              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition ${
                                won ? 'bg-green-600/25 font-semibold' : lost ? 'opacity-40' : 'hover:bg-white/5'
                              } disabled:cursor-default`}
                            >
                              <TeamLogo name={nameOf(k)} logo={logoOf(k)} size={22} />
                              <span className="truncate">{nameOf(k)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {sim.done && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {BUCKETS.map((b) => (
              <div key={b.label} className={`rounded-lg border p-2 ${b.cls}`}>
                <div className="mb-1 text-xs font-bold">{b.label}</div>
                {table
                  .filter((r) => b.test(r.w, r.l))
                  .map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5 py-0.5 text-xs">
                      <TeamLogo name={r.name} logo={logoOf(r.key)} size={18} />
                      <span className="truncate">{r.name}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={onUse} disabled={!canUse}>
            Usar esta simulação no meu Pick'em
          </button>
        </div>
      )}
    </div>
  );
}
