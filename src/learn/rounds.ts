import type { GameData, Level } from './types';
import { rng, shuffle } from './rng';

type Item = { text: string; answer: string };

/** One question of the "beam" game (lesson 06). */
export interface BeamRound { kind: 'cast' | 'rule'; text: string; answer: string }
export function beamRounds(data: GameData, level: Level, seed: number): BeamRound[] {
  const cfg = data.levels[level];
  const r = rng(seed);
  const cast = shuffle(data['cast'] as Item[], r);
  const rule = shuffle(data['rule'] as Item[], r);
  const n = cfg.rounds ?? 8;
  const out: BeamRound[] = [];
  for (let i = 0; i < n; i++) {
    const useCast = i % 2 === 0;
    const arr = useCast ? cast : rule;
    const c = arr[Math.floor(i / 2) % arr.length] as Item;
    out.push({ kind: useCast ? 'cast' : 'rule', text: c.text, answer: c.answer });
  }
  return out;
}

/** Falling items of the "tower" game (lesson 07). `at` = spawn time in seconds. */
export interface TowerItem { label: string; layer: string; at: number }
export function towerItems(data: GameData, level: Level, seed: number): TowerItem[] {
  const cfg = data.levels[level];
  const r = rng(seed);
  const pool = (data['pool'] as { label: string; layer: string }[]).filter((p) => (cfg.layers ?? []).includes(p.layer));
  const n = cfg.items ?? 14;
  const fall = cfg.fallSec ?? 8;
  const gap = Math.max(1.3, fall * 0.34);
  const out: TowerItem[] = [];
  let bag: typeof pool = [];
  for (let i = 0; i < n; i++) {
    if (bag.length === 0) bag = shuffle(pool, r);
    const it = bag.pop() as { label: string; layer: string };
    out.push({ label: it.label, layer: it.layer, at: 0.8 + i * gap });
  }
  return out;
}

/** Tasks of the "crane" game (lesson 08). */
export type CraneTask =
  | { kind: 'wrap'; pdus: string[] }   // tap containers inner -> outer (sender)
  | { kind: 'peel'; pdus: string[] }   // tap containers outer -> inner (receiver)
  | { kind: 'layer'; text: string; answer: string }
  | { kind: 'port'; text: string; answer: string }
  | { kind: 'has'; text: string; answer: string };

export function craneTasks(data: GameData, level: Level, seed: number): CraneTask[] {
  const cfg = data.levels[level];
  const r = rng(seed);
  const mix = cfg.mix ?? ['wrap'];
  const pools: Record<string, Item[]> = {
    layer: shuffle(data['layer'] as Item[], r),
    port: shuffle(data['port'] as Item[], r),
    has: shuffle(data['has'] as Item[], r),
  };
  const used: Record<string, number> = { layer: 0, port: 0, has: 0 };
  const pdus = data['pdus'] as string[];
  const out: CraneTask[] = [];
  const n = cfg.rounds ?? 8;
  for (let i = 0; i < n; i++) {
    const k = mix[i % mix.length] as string;
    if (k === 'wrap' || k === 'peel') {
      const len = k === 'wrap' && level === 'easy' ? 3 : 4;
      const start = Math.floor(r() * (pdus.length - len + 1));
      out.push({ kind: k, pdus: pdus.slice(start, start + len) });
    } else {
      const arr = pools[k] as Item[];
      const t = arr[(used[k] as number) % arr.length] as Item;
      used[k] = (used[k] as number) + 1;
      out.push({ kind: k as 'layer' | 'port' | 'has', text: t.text, answer: t.answer });
    }
  }
  return out;
}
