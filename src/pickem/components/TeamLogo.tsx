import { useState } from 'react';
import type { PickStatus } from '../lib/types';
import { initials } from '../lib/teams';

interface Props {
  name: string;
  logo?: string | null;
  size?: number;
  status?: PickStatus | null;
  className?: string;
}

/** Logo do time (HLTV) com fallback para iniciais e marcação de acerto/erro por cima. */
export default function TeamLogo({ name, logo, size = 36, status, className = '' }: Props) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-slate-800/80 ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      {logo && !broken ? (
        <img
          src={logo}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={`h-[72%] w-[72%] object-contain ${status === 'wrong' ? 'opacity-50' : ''}`}
        />
      ) : (
        <span className="font-bold text-slate-300" style={{ fontSize: size * 0.3 }}>
          {initials(name)}
        </span>
      )}
      {status === 'wrong' && (
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 h-full w-full text-red-500">
          <path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )}
      {status === 'correct' && (
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 h-full w-full text-green-400">
          <path d="M4 13 L10 19 L21 5" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
