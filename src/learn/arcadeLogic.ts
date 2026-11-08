import type { GameData, Level } from './types';
import { rng, shuffle } from './rng';

export type BeltKind = 'addr' | 'code' | 'fmt' | 'size' | 'time' | 'uni' | 'multi' | 'broad';
export interface BeltItem { kind: BeltKind; text: string; at: number }

const RULES: BeltKind[] = ['addr', 'code', 'fmt', 'size', 'time'];

/** Parcels for the sorting-belt game (lesson 06): defective parcels (a rule is broken) and radio calls (who should hear it). */
export function beltItems(data: GameData, level: Level, seed: number): BeltItem[] {
  const cfg = data.levels[level];
  const r = rng(seed);
  const n = cfg.items ?? 12;
  const gap = Math.max(1.4, (cfg.fallSec ?? 9) * 0.3);
  const casts = shuffle(data['cast'] as { text: string; answer: BeltKind }[], r);
  const useCast = level !== 'easy';
  const out: BeltItem[] = [];
  let bag: BeltKind[] = [];
  let ci = 0;
  for (let i = 0; i < n; i++) {
    if (useCast && i % 3 === 2) {
      const c = casts[ci++ % casts.length] as { text: string; answer: BeltKind };
      out.push({ kind: c.answer, text: c.text, at: 0.8 + i * gap });
    } else {
      if (bag.length === 0) bag = shuffle(RULES, r);
      out.push({ kind: bag.pop() as BeltKind, text: '', at: 0.8 + i * gap });
    }
  }
  return out;
}

export type PhaseKind = 'wrap' | 'peel';
export interface CranePhase { kind: PhaseKind; order: string[] }

const PDUS = ['Data', 'Segment', 'Packet', 'Frame', 'Bits'];

/** Stacking phases for the container game (lesson 08): wrap = innermost first, peel = outermost first. */
export function cranePhases(level: Level): CranePhase[] {
  const spec: Record<Level, [PhaseKind, number][]> = {
    easy: [['wrap', 3], ['peel', 3], ['wrap', 4]],
    medium: [['wrap', 4], ['peel', 4], ['wrap', 5], ['peel', 5]],
    hard: [['wrap', 5], ['peel', 5], ['wrap', 5], ['peel', 5], ['wrap', 5], ['peel', 5]],
  };
  return spec[level].map(([kind, n]) => {
    const seq = PDUS.slice(0, n);
    return { kind, order: kind === 'wrap' ? seq : [...seq].reverse() };
  });
}

/** What a container shows: its name (easy) or its contents (harder levels, so the player must know what each unit holds). */
export const PDU_HINT: Record<string, string> = {
  Data: 'רק המידע עצמו',
  Segment: 'מידע + פורטים',
  Packet: 'מקטע + כתובות IP',
  Frame: 'פאקטה + MAC + FCS',
  Bits: 'אפסים ואחדות באוויר',
};

export function phasePoints(level: Level): number { return cranePhases(level).reduce((a, p) => a + p.order.length, 0); }
