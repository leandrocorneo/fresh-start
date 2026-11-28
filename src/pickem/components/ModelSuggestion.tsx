import { useEffect, useState } from 'react';
import { isLocked, type Derived } from '../lib/derive';
import { suggestPlayoffs, suggestSwiss } from '../lib/suggest';
import { stageTeamsReal } from '../lib/useForecast';
import type { AnyPicks, StageId, StageRow } from '../lib/types';

interface Props {
  stage: StageId;
  row: StageRow | undefined;
  d: Derived;
  stageMap: Partial<Record<StageId, StageRow>>;
  /** Já existe algo no rascunho? (pede confirmação antes de substituir) */
  hasDraft: boolean;
  /** Coloca a sugestão no rascunho. Não salva: a pessoa ainda precisa clicar em "Salvar palpite". */
  onApply: (picks: AnyPicks) => void;
}

/**
 * Botão "Sugestão do modelo". Some quando a fase está fechada; confere o horário de novo no
 * clique e antes de aplicar, para nunca preencher o Pick'em depois do fechamento.
 */
export default function ModelSuggestion({ stage, row, d, stageMap, hasDraft, onApply }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setMsg(null), [stage]);

  if (isLocked(row, now)) return null;
  const finished = stage === 'playoffs' ? false : d[stage].realDone;
  if (!stageTeamsReal(stage, d, stageMap) || finished) return null;

  async function suggest() {
    if (isLocked(row, Date.now())) {
      setNow(Date.now());
      return;
    }
    if (hasDraft && !window.confirm('Substituir o palpite montado aqui pela sugestão do modelo? O que já está salvo só muda se você clicar em "Salvar palpite".')) return;
    setBusy(true);
    setMsg(null);
    try {
      let picks: AnyPicks;
      let text: string;
      if (stage === 'playoffs') {
        const r = suggestPlayoffs(d.playoffs.teams, d.playoffs.recs);
        picks = r.picks;
        text = `Sugestão aplicada: ${r.expected.toFixed(1).replace('.', ',')} acertos esperados de 7.`;
      } else {
        const r = await suggestSwiss(d[stage].teams, d[stage].matches);
        picks = r.picks;
        text = `Sugestão aplicada: chance estimada de passar ${Math.round(r.chance * 100)}%.`;
      }
      // a fase pode ter fechado enquanto calculava
      if (isLocked(row, Date.now())) {
        setNow(Date.now());
        setMsg({ ok: false, text: 'A fase fechou enquanto o cálculo rodava. Nada foi alterado.' });
        return;
      }
      onApply(picks);
      setMsg({ ok: true, text: `${text} Revise e clique em "Salvar palpite".` });
    } catch (e) {
      setMsg({ ok: false, text: `Não foi possível calcular: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 border-t border-white/10 pt-3">
      <button
        className="btn-ghost w-full"
        onClick={suggest}
        disabled={busy}
        title="Monta o palpite com a maior chance estimada, pela força de cada time no ranking VRS da Valve. Não salva sozinho."
      >
        {busy ? 'Calculando…' : 'Sugestão do modelo'}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
    </div>
  );
}
