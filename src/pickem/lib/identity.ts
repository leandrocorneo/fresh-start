const KEY = 'pickem-singapore-2026:identity';

export interface Identity {
  token: string;
  name: string;
  playerId: string;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v?.token && v?.playerId ? v : null;
  } catch {
    return null;
  }
}

export function saveIdentity(i: Identity) {
  localStorage.setItem(KEY, JSON.stringify(i));
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
