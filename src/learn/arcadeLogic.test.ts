import { describe, expect, it } from 'vitest';
import { beltItems, cranePhases, phasePoints } from './arcadeLogic';
import { GAMES } from '../content';
import { LEVELS } from './types';

describe('belt', () => {
  it('is deterministic, sized, easy has only broken parcels, others add radio calls', () => {
    const g = GAMES['game06']!;
    for (const lv of LEVELS) {
      const a = beltItems(g, lv, 3);
      expect(a).toEqual(beltItems(g, lv, 3));
      expect(a.length).toBe(g.levels[lv].items);
      for (let i = 1; i < a.length; i++) expect(a[i]!.at).toBeGreaterThan(a[i - 1]!.at);
    }
    expect(beltItems(g, 'easy', 3).every((x) => ['addr', 'code', 'fmt', 'size', 'time'].includes(x.kind))).toBe(true);
    expect(beltItems(g, 'hard', 3).some((x) => ['uni', 'multi', 'broad'].includes(x.kind))).toBe(true);
  });
});

describe('crane phases', () => {
  it('wrap goes inner to outer, peel the reverse', () => {
    for (const lv of LEVELS) {
      for (const p of cranePhases(lv)) {
        if (p.kind === 'wrap') expect(p.order[0]).toBe('Data'); else expect(p.order[p.order.length - 1]).toBe('Data');
      }
    }
    expect(phasePoints('easy')).toBe(10);
    expect(GAMES['game08']!.levels.easy.pass).toBeLessThanOrEqual(phasePoints('easy'));
    expect(GAMES['game08']!.levels.hard.pass).toBeLessThanOrEqual(phasePoints('hard'));
  });
});
