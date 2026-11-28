const KEY = 'pickem-singapore-2026:identity';

export interface Identity {
  name: string;
  playerId: string;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.playerId && v?.name ? { name: v.name, playerId: v.playerId } : null;
  } catch {
    return null;
  }
}

export function saveIdentity(i: Identity) {
  localStorage.setItem(KEY, JSON.stringify(i));
}

const SIM_KEY = 'pickem-singapore-2026:sims';
export function loadSims(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(SIM_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveSims(s: Record<string, Record<string, string>>) {
  localStorage.setItem(SIM_KEY, JSON.stringify(s));
}
