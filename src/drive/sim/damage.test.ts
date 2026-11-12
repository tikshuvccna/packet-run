import { describe, expect, it } from 'vitest';
import { buildCity } from '../../world3d/city';
import { baseStats } from './cars';
import { DriveSim } from './world';
import { inp } from './testutil';
import type { CarLook } from '../contract';

const LOOK: CarLook = { car: 'hatch', paint: '#fff', vinyl: null, vinylColor: '#fff', wheels: 'std', rim: '#fff', spoiler: false };

/** A sim with the player aimed straight at the nearest building wall, `gap` meters away. */
function facingWall(gap: number, armor = 0, health?: number): DriveSim {
  const city = buildCity(11);
  const b = city.buildings.find((q) => Math.abs(q.rot) < 0.01 && q.w > 14 && city.onRoad(q.x, q.z + q.d / 2 + 9, 1) === false && !city.statics.blocked(q.x, q.z + q.d / 2 + gap, 2.5))
    ?? city.buildings[0]!;
  const st = baseStats('hatch'); st.armor = armor;
  // south of the building, facing north (heading 0 = -z)
  return new DriveSim(city, { seed: 3, look: LOOK, stats: st, spawn: { x: b.x, z: b.z + b.d / 2 + gap, heading: 0 }, gates: [], traffic: 0, health });
}
const run = (s: DriveSim, i: ReturnType<typeof inp>, sec: number): void => { for (let k = 0; k < sec * 120; k++) s.step(i); };

describe('car damage', () => {
  it('a slow touch does nothing, a hard crash dents the front and costs health', () => {
    const soft = facingWall(4);
    run(soft, inp({ throttle: 0.3 }), 1.2);
    expect(soft.health).toBe(1);

    const hard = facingWall(26);
    run(hard, inp({ throttle: 1 }), 4);
    expect(hard.health).toBeLessThan(0.95);
    expect(hard.health).toBeGreaterThan(0.5);
    expect(hard.zones[0]).toBeGreaterThan(0);                                  // front
    expect(hard.zones[0]).toBeGreaterThan(Math.max(hard.zones[1], hard.zones[2], hard.zones[3]));
    expect(hard.events.some((e) => e.t === 'damage')).toBe(true);
    expect(hard.hud(null).health).toBe(hard.health);
  });

  it('armour takes less damage from the same crash', () => {
    const a = facingWall(26), b = facingWall(26, 0.6);
    run(a, inp({ throttle: 1 }), 4); run(b, inp({ throttle: 1 }), 4);
    expect(1 - b.health).toBeLessThan((1 - a.health) * 0.8);
  });

  it('a wrecked car stops for an emergency fix and drives on at half health; repair() makes it new', () => {
    const s = facingWall(26, 0, 0.06);
    expect(s.player.dmg).toBeGreaterThan(0.9);
    run(s, inp({ throttle: 1 }), 4);
    expect(s.events.some((e) => e.t === 'wreck')).toBe(true);
    run(s, inp({ throttle: 1 }), 3);
    expect(s.stallT).toBe(0);
    expect(s.health).toBe(0.5);
    s.repair();
    expect(s.health).toBe(1);
    expect(s.zones).toEqual([0, 0, 0, 0]);
    expect(s.player.dmg).toBe(0);
  });

  it('a badly damaged car is slower', () => {
    const city = buildCity(11);
    const top = (health: number): number => {
      const s = new DriveSim(city, { seed: 3, look: LOOK, stats: baseStats('hatch'), spawn: city.spawn, gates: [], traffic: 0, health });
      let best = 0;
      for (let k = 0; k < 120 * 9; k++) { s.step(inp({ throttle: 1 })); best = Math.max(best, s.player.speed); if (s.health !== health) break; }
      return best;
    };
    expect(top(0.15)).toBeLessThan(top(1) * 0.9);
  });
});
