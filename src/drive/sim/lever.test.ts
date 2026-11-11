import { describe, expect, it } from 'vitest';
import { createCar, stepCar } from './car';
import { baseStats } from './cars';
import { flatTerrain, inp } from './testutil';
import type { DriveInput } from '../contract';

const DT = 1 / 120;
const run = (c: ReturnType<typeof createCar>, i: DriveInput, sec: number): void => { const t = flatTerrain(); for (let k = 0; k < sec / DT; k++) stepCar(c, i, t, DT, () => 0.5); };
const car = (): ReturnType<typeof createCar> => createCar(0, 'hatch', baseStats('hatch'), 0, 0, 0, flatTerrain());

describe('power lever (touch gearbox)', () => {
  it('R drives backward, the brake stops it and never reverses on its own', () => {
    const c = car();
    run(c, inp({ reverse: 1 }), 4);
    expect(c.vf).toBeLessThan(-6);
    expect(c.vf).toBeGreaterThan(-11);
    run(c, inp({ reverse: 0, brake: 1 }), 2);
    expect(Math.abs(c.vf)).toBeLessThan(0.2);
    run(c, inp({ reverse: 0, brake: 1 }), 2);            // holding the brake at a stop stays stopped
    expect(Math.abs(c.vf)).toBeLessThan(0.2);
  });

  it('R while rolling forward brakes first', () => {
    const c = car();
    run(c, inp({ reverse: 0, throttle: 1 }), 5);
    const v = c.vf;
    expect(v).toBeGreaterThan(20);
    run(c, inp({ reverse: 1 }), 0.5);
    expect(c.vf).toBeLessThan(v - 5);
    expect(c.vf).toBeGreaterThan(0);
  });

  it('the lever position sets the cruise speed: half power is clearly slower than full', () => {
    const full = car(), half = car();
    run(full, inp({ reverse: 0, throttle: 1 }), 14);
    run(half, inp({ reverse: 0, throttle: 0.5 }), 14);
    expect(full.speed).toBeGreaterThan(36);
    expect(half.speed).toBeGreaterThan(18);
    expect(half.speed).toBeLessThan(full.speed * 0.75);
  });

  it('the keyboard (no lever) keeps the old feel: brake at a stop reverses', () => {
    const c = car();
    run(c, inp({ brake: 1 }), 3);
    expect(c.vf).toBeLessThan(-5);
  });
});
