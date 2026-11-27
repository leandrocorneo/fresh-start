import { ALIASES } from './config';
import type { Team } from './types';

export function teamKey(name: string | null | undefined): string {
  const k = (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return ALIASES[k] ?? k;
}

export function sameTeam(a: string, b: string): boolean {
  return teamKey(a) === teamKey(b);
}

export function dedupeTeams(list: Team[]): Team[] {
  const seen = new Set<string>();
  const out: Team[] = [];
  for (const t of list) {
    const k = teamKey(t.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Ordena: primeiro quem está em `seedOrder`, depois quem está em `tailOrder`, depois o resto. */
export function orderTeams(list: Team[], seedOrder: string[], tailOrder: string[] = []): Team[] {
  const seedIdx = new Map(seedOrder.map((n, i) => [teamKey(n), i]));
  const tailIdx = new Map(tailOrder.map((n, i) => [teamKey(n), i]));
  return dedupeTeams(list)
    .map((t, i) => {
      const k = teamKey(t.name);
      const rank = seedIdx.has(k) ? seedIdx.get(k)! : tailIdx.has(k) ? 100 + tailIdx.get(k)! : 200 + i;
      return { t, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.t);
}

export function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 3).toUpperCase();
}
