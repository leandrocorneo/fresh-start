import { useState } from 'react';
import { registerPlayer } from '../lib/api';
import { newToken, saveIdentity, type Identity } from '../lib/identity';

interface Props {
  current?: Identity | null;
  onDone: (i: Identity) => void;
  onCancel?: () => void;
}

/** Pede o nome ao abrir o site. O token fica no localStorage e identifica a pessoa depois. */
export default function NameGate({ current, onDone, onCancel }: Props) {
  const [name, setName] = useState(current?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const token = current?.token ?? newToken();
      const playerId = await registerPlayer(name.trim(), token);
      const id = { token, name: name.trim(), playerId };
      saveIdentity(id);
      onDone(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold">{current ? 'Trocar nome' : 'Quem é você?'}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Seu nome aparece na tabela de palpites. Este navegador fica salvo como seu — se limpar os dados do site, você
            perde o acesso aos seus palpites.
          </p>
        </div>
        <input
          autoFocus
          className="input w-full"
          placeholder="Seu nome"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button className="btn-primary" disabled={busy || name.trim().length < 2}>
            {busy ? 'Salvando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
