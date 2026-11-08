import { describe, expect, it } from 'vitest';
import { towerItems } from './rounds';
import { isCorrect, score, shuffleOptions } from './quizLogic';
import { GAMES, LESSONS, QUIZZES } from '../content';
import { LEVELS } from './types';

describe('content integrity', () => {
  it('lessons have valid steps and checks', () => {
    for (const l of Object.values(LESSONS)) {
      expect(l.steps.length).toBeGreaterThanOrEqual(5);
      for (const s of l.steps) {
        expect(s.check.correct).toBeGreaterThanOrEqual(0);
        expect(s.check.correct).toBeLessThan(s.check.options.length);
        const w = s.widget;
        if (w.type === 'sort') for (const it of w.items) expect(w.buckets.some((b) => b.id === it.bucket)).toBe(true);
        if (w.type === 'match') expect(w.pairs.length).toBeGreaterThanOrEqual(3);
        if (w.type === 'split') for (const c of w.capacities) expect(w.total % c).toBe(0);
      }
    }
  });
  it('quizzes are answerable', () => {
    for (const q of Object.values(QUIZZES)) {
      expect(q.questions.length).toBe(8);
      for (const x of q.questions) {
        if (x.type === 'order') expect((x.correct as number[]).length).toBe(x.options.length);
        else expect(x.correct as number).toBeLessThan(x.options.length);
      }
    }
  });
  it('shuffled options keep the right answer', () => {
    for (const q of Object.values(QUIZZES)) {
      for (const x of q.questions) {
        const y = shuffleOptions(x, 7);
        if (x.type === 'mcq') expect(y.options[y.correct as number]).toBe(x.options[x.correct as number]);
      }
    }
  });
  it('score and pass mark', () => {
    const q = QUIZZES['quiz06']!;
    expect(score(q, [true, true, true, true, true, false, false, false]).passed).toBe(true);
    expect(isCorrect(q.questions[7]!, [0, 1, 2, 3])).toBe(true);
    expect(isCorrect(q.questions[7]!, [1, 0, 2, 3])).toBe(false);
  });
});

describe('games are deterministic and sized', () => {
  it('tower items', () => {
    const g = GAMES['game07']!;
    for (const lv of LEVELS) {
      const it = towerItems(g, lv, 3);
      expect(it.length).toBe(g.levels[lv].items);
      for (const x of it) expect(g.levels[lv].layers).toContain(x.layer);
    }
  });
});
