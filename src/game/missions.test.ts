import { describe, expect, it } from 'vitest';
import { MISSIONS, SIDE_MISSIONS, SIDE_UNLOCK_IDX, advance, currentStep, failStep, sideAdvance, sideOfferAt, sideReward, stepPoi, stepSatisfied } from './missions';
import { emptySave, emptyLesson, normalize } from '../core/save';
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
    // the garage mission: talk, visit the garage, talk
    advance(s);
    expect(currentStep(s)?.t).toBe('visit');
    expect(stepPoi(currentStep(s))).toBe('garage_main');
    advance(s);
    expect(advance(s)?.id).toBe('m1b');
    advance(s);
    const st = currentStep(s);
    expect(st?.t).toBe('lesson');
    expect(stepSatisfied(s, st!)).toBe(false);
    s.lessons['lesson06'] = { ...emptyLesson(), done: true };
    expect(stepSatisfied(s, st!)).toBe(true);
    // broadcast run of m3: failing on the third stop returns to the first timed stop
    s.mission = { idx: MISSIONS.findIndex((m) => m.id === 'm3'), step: 5 };
    failStep(s);
    expect(s.mission.step).toBe(3);
  });

  it('side missions: real givers and targets, short texts, reachable clocks, one per giver', () => {
    const city = buildCity(11);
    const pos = (id: string): { x: number; z: number } => city.pois.find((p) => p.id === id) as { x: number; z: number };
    const ids = new Set(city.pois.map((p) => p.id));
    expect(new Set(SIDE_MISSIONS.map((m) => m.giver)).size).toBe(SIDE_MISSIONS.length);
    for (const m of SIDE_MISSIONS) {
      expect(ids.has(m.giver), m.id).toBe(true);
      expect(m.pitch.length).toBeLessThanOrEqual(60);
      let budget = 0, dist = 0, from = pos(m.giver);
      for (const st of m.steps) {
        expect(st.t).toBe('goto');
        if (st.t !== 'goto') continue;
        expect(ids.has(st.poi), `${m.id}: ${st.poi}`).toBe(true);
        expect(st.text.length).toBeLessThanOrEqual(40);
        const to = pos(st.poi);
        if (st.sec !== undefined) { budget = st.sec; dist = 0; }
        if (st.sec !== undefined || st.keep) {
          dist += Math.abs(from.x - to.x) + Math.abs(from.z - to.z);
          expect(dist / budget, `${m.id} ${st.poi}`).toBeLessThan(11.5);   // slower than the story: side jobs are relaxed
        }
        from = to;
      }
    }
  });

  it('side missions: locked at first, offered at the giver, full pay once and less on repeats', () => {
    const s = emptySave();
    const m = SIDE_MISSIONS[0]!;
    expect(sideOfferAt(s, m.giver)).toBeNull();
    s.mission.idx = SIDE_UNLOCK_IDX;
    expect(sideOfferAt(s, m.giver)?.id).toBe(m.id);
    s.side.active = { id: m.id, step: 0 };
    expect(sideOfferAt(s, SIDE_MISSIONS[1]!.giver)).toBeNull();   // one side mission at a time
    let fin = null;
    for (let k = 0; k < m.steps.length; k++) fin = sideAdvance(s);
    expect(fin?.reward).toBe(m.reward);
    expect(s.side.active).toBeNull();
    expect(s.mission.idx).toBe(SIDE_UNLOCK_IDX);                   // the story did not move
    expect(sideReward(s, m)).toBeLessThan(m.reward);
  });

  it('old saves keep their place after the garage mission was inserted', () => {
    const old = { ...emptySave(), mission: { idx: 3, step: 1 } } as Record<string, unknown>;
    delete old['mv']; delete old['side']; delete old['health'];
    const n = normalize(JSON.parse(JSON.stringify(old)));
    expect(n.mission).toEqual({ idx: 4, step: 1 });
    expect(n.side).toEqual({ active: null, done: {} });
    expect(n.health).toBe(1);
    expect(normalize(JSON.parse(JSON.stringify(n))).mission.idx).toBe(4);   // and only once
    const fresh = normalize(JSON.parse(JSON.stringify({ ...old, mission: { idx: 0, step: 2 } })));
    expect(fresh.mission).toEqual({ idx: 0, step: 2 });
  });
});
