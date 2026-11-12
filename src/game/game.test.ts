import { describe, expect, it } from 'vitest';
import { emptySave, normalize, SaveStore } from '../core/save';
import { buyCar, buyUpgrade, buyVinyl, cleanedDistricts, grantPrize, nextLesson, statsFor } from './progress';
import { gatesFor } from '../content';

describe('progress', () => {
  it('next lesson follows done lessons', () => {
    const s = emptySave();
    expect(nextLesson(s)).toBe('lesson06');
    s.lessons['lesson06'] = { done: true, checks: {}, quizBest: 0, quizPassed: true, games: {} };
    expect(nextLesson(s)).toBe('lesson07');
    expect(cleanedDistricts(s)).toEqual([1, 2, 3]);
  });
  it('buying needs coins and respects caps', () => {
    const s = emptySave();
    expect(buyUpgrade(s, 'engine')).toBe(false);
    s.coins = 2000;
    for (let i = 0; i < 3; i++) expect(buyUpgrade(s, 'engine')).toBe(true);
    expect(buyUpgrade(s, 'engine')).toBe(false);
    expect(buyUpgrade(s, 'slots')).toBe(true);
    expect(buyUpgrade(s, 'slots')).toBe(false);
    expect(statsFor(s).itemSlots).toBe(2);
    expect(buyCar(s, 'sport')).toBe(true);
    expect(buyCar(s, 'sport')).toBe(false);
    expect(buyVinyl(s, 'flames')).toBe(true);
  });
  it('stats grow with upgrades and the car', () => {
    const s = emptySave();
    const base = statsFor(s);
    s.upgrades.engine = 2; s.upgrades.nitro = 3;
    const up = statsFor(s);
    expect(up.topSpeed).toBeGreaterThan(base.topSpeed);
    expect(up.nitroCap).toBeGreaterThan(base.nitroCap);
    s.look.car = 'super';
    expect(statsFor(s).topSpeed).toBeGreaterThan(up.topSpeed);
  });
  it('prizes are granted once', () => {
    const s = emptySave();
    expect(grantPrize(s, 'lesson06', 'hard')?.id).toBe('p06h');
    expect(s.cars).toContain('hatch');
    expect(grantPrize(s, 'lesson06', 'hard')).toBeNull();
    grantPrize(s, 'lesson06', 'medium');
    expect(s.vinyls).toContain('flames');
    expect(s.coins).toBe(40);
  });
});

describe('save', () => {
  it('survives corrupt data and old shapes', () => {
    const mem = { v: '', getItem() { return this.v || null; }, setItem(_k: string, v: string) { this.v = v; }, removeItem() { this.v = ''; } };
    mem.v = '{not json';
    expect(new SaveStore(mem).data.coins).toBe(0);
    mem.v = JSON.stringify({ coins: 12, lessons: { lesson06: { done: true } }, cars: [] });
    const st = new SaveStore(mem);
    expect(st.data.coins).toBe(12);
    expect(st.data.cars).toEqual(['van']);
    expect(st.lesson('lesson06').checks).toEqual({});
    expect(normalize(null).upgrades.engine).toBe(0);
  });
});

describe('quiz gates', () => {
  it('are made from learned lessons only, with the right answer present', () => {
    expect(gatesFor([])).toEqual([]);
    const g = gatesFor(['lesson06']);
    expect(g.length).toBeGreaterThanOrEqual(4);
    for (const x of g) {
      expect(x.lesson).toBe('lesson06');
      expect(x.options.length).toBe(3);
      expect(x.correct).toBeLessThan(3);
    }
  });
});

describe('car stats reach the engine', () => {
  it('a new car or an upgrade changes the stats the sim drives with', async () => {
    const { DriveSim } = await import('../drive/sim/world');
    const { buildCity } = await import('../world3d/city');
    const { emptySave } = await import('../core/save');
    const { statsFor, CARS } = await import('./progress');
    const s = emptySave();
    const city = buildCity(11);
    const sim = new DriveSim(city, { seed: 1, look: { ...s.look }, stats: statsFor(s), spawn: city.spawn, gates: [], traffic: 0 });
    const before = sim.player.stats.topSpeed;
    s.look.car = 'hyper';
    sim.setLook({ ...s.look }, statsFor(s));
    expect(sim.player.carId).toBe('hyper');
    expect(sim.player.stats.topSpeed).toBeGreaterThan(before + 15);
    s.upgrades.engine = 2;
    sim.setLook({ ...s.look }, statsFor(s));
    expect(sim.player.stats.topSpeed).toBe(60 + 6);
    expect(new Set(CARS.map((c) => c.id)).size).toBe(15);
    for (let k = 1; k < CARS.length; k++) expect(CARS[k]!.price).toBeGreaterThan(CARS[k - 1]!.price);
  });
});
