import { describe, expect, it } from 'vitest';
import { MISSIONS, advance, currentStep, failStep, stepPoi, stepSatisfied } from './missions';
import { emptySave, emptyLesson } from '../core/save';
import { LINES } from '../content';
import { buildCity } from '../world3d/city';

describe('missions', () => {
  it('every step points at a real POI and real dialogue lines, with short texts', () => {
    const city = buildCity(11);
    const ids = new Set(city.pois.map((p) => p.id));
    for (const m of MISSIONS) {
      expect(m.steps.length).toBeGreaterThan(0);
      for (const st of m.steps) {
        if (st.t === 'say') for (const l of st.lines) expect(LINES[l], l).toBeTruthy();
        else { expect(ids.has(stepPoi(st) as string), `${m.id}: ${stepPoi(st)}`).toBe(true); expect(st.text.length).toBeLessThanOrEqual(40); }
      }
    }
  });

  it('timed steps are reachable: at least 14 m/s in a straight line is never needed', () => {
    const city = buildCity(11);
    const pos = (id: string): { x: number; z: number } => city.pois.find((p) => p.id === id) as { x: number; z: number };
    for (const m of MISSIONS) {
      let budget = 0, dist = 0;
      m.steps.forEach((st, i) => {
        if (st.t !== 'goto') return;
        const prev = m.steps[i - 1];
        if (st.sec !== undefined) { budget = st.sec; dist = 0; }
        if ((st.sec !== undefined || st.keep) && prev && prev.t === 'goto') {
          const a = pos(prev.poi), b = pos(st.poi);
          dist += Math.abs(a.x - b.x) + Math.abs(a.z - b.z);   // city-block distance
          expect(dist / budget, `${m.id} step ${i}`).toBeLessThan(14);
        }
      });
    }
  });

  it('advances, rewards at the end, skips finished lessons, and fails back to the pick-up', () => {
    const s = emptySave();
    expect(currentStep(s)?.t).toBe('say');
    expect(advance(s)).toBeNull();          // talk -> pick-up
    expect(advance(s)).toBeNull();          // pick-up -> timed delivery
    expect(s.mission).toEqual({ idx: 0, step: 2 });
    failStep(s);
    expect(s.mission.step).toBe(1);         // back to the pick-up
    advance(s);
    expect(advance(s)?.id).toBe('m1');      // mission complete
    expect(s.mission).toEqual({ idx: 1, step: 0 });
    advance(s);
    const st = currentStep(s);
    expect(st?.t).toBe('lesson');
    expect(stepSatisfied(s, st!)).toBe(false);
    s.lessons['lesson06'] = { ...emptyLesson(), done: true };
    expect(stepSatisfied(s, st!)).toBe(true);
    // broadcast run of m3: failing on the third stop returns to the first timed stop
    s.mission = { idx: 2, step: 5 };
    failStep(s);
    expect(s.mission.step).toBe(3);
  });
});
