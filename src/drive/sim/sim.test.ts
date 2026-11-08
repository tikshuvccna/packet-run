import { describe, expect, it } from 'vitest';
import type { CarLook, DriveInput, QuizGate, RaceDef } from '../contract';
import { NO_INPUT } from '../contract';
import { buildCity } from '../../world3d/city';
import { applyBoost, collideCars, collideStatic, createCar, stepCar } from './car';
import { baseStats } from './cars';
import { rollItem, stepItems, throwItem } from './items';
import { StaticWorld, TAG } from './statics';
import { racingLine, Track } from './track';
import { flatTerrain, inp } from './testutil';
import { DriveSim, DT } from './world';

const rnd = (): number => 0.37;
const run = (n: number, f: (i: number) => void): void => { for (let i = 0; i < n; i++) f(i); };
const LOOK: CarLook = { car: 'van', paint: '#f2b134', vinyl: null, vinylColor: '#fff', wheels: 'std', rim: '#ddd', spoiler: false };
const GATES: QuizGate[] = [
  { id: 'g1', q: 'כמה שכבות במודל OSI?', options: ['7', '4', '5'], correct: 0, lesson: 'lesson07' },
  { id: 'g2', q: 'איזו שכבה מנתבת?', options: ['תעבורה', 'רשת', 'פיזית'], correct: 1, lesson: 'lesson07' },
];

describe('car physics', () => {
  it('reaches about its top speed and not more', () => {
    const t = flatTerrain();
    const st = baseStats('van');
    const c = createCar(0, 'van', st, 0, 0, 0, t);
    run(120 * 40, () => stepCar(c, inp({ throttle: 1 }), t, DT, rnd));
    expect(c.speed).toBeGreaterThan(st.topSpeed * 0.92);
    expect(c.speed).toBeLessThan(st.topSpeed * 1.03);
    expect(c.gear).toBe(4);
  });

  it('nitro raises the speed above the normal top speed, and it bleeds back after', () => {
    const t = flatTerrain();
    const st = { ...baseStats('van'), nitroCap: 100 };
    const c = createCar(0, 'van', st, 0, 0, 0, t);
    run(120 * 30, () => stepCar(c, inp({ throttle: 1 }), t, DT, rnd));
    const normal = c.speed;
    run(120 * 8, () => stepCar(c, inp({ throttle: 1, nitro: true }), t, DT, rnd));
    expect(c.speed).toBeGreaterThan(normal * 1.2);
    expect(c.speed).toBeLessThan(st.topSpeed * st.nitroPower * 1.03);
    run(120 * 10, () => stepCar(c, inp({ throttle: 1 }), t, DT, rnd));
    expect(c.speed).toBeLessThan(normal * 1.04);
  });

  it('accelerates 0-100 km/h in a sane arcade time', () => {
    const t = flatTerrain();
    const c = createCar(0, 'van', baseStats('van'), 0, 0, 0, t);
    let time = 0;
    while (c.speed < 100 / 3.6 && time < 20) { stepCar(c, inp({ throttle: 1 }), t, DT, rnd); time += DT; }
    expect(time).toBeGreaterThan(2);
    expect(time).toBeLessThan(5.5);
  });

  it('braking distance from 100 km/h is short but physical', () => {
    const t = flatTerrain();
    const c = createCar(0, 'van', baseStats('van'), 0, 0, 0, t);
    c.vz = -100 / 3.6;
    let dist = 0;
    while (Math.hypot(c.vx, c.vz) > 0.05 && dist < 200) { const z = c.z; stepCar(c, inp({ brake: 1 }), t, DT, rnd); dist += Math.abs(c.z - z); }
    expect(dist).toBeGreaterThan(12);   // not a wall
    expect(dist).toBeLessThan(45);      // < ~1 g would be 39 m+ ... arcade brakes are strong
    expect(c.speed).toBeLessThan(0.2);  // and it does not start reversing by itself
  });

  it('lateral acceleration never exceeds the tyre limit (grip)', () => {
    const t = flatTerrain();
    for (const grip of [0.8, 1, 1.4]) {
      const st = { ...baseStats('sport'), grip };
      const c = createCar(0, 'sport', st, 0, 0, 0, t);
      c.vz = -30;
      let maxLat = 0;
      run(120 * 5, (i) => { stepCar(c, inp({ throttle: 0.5, steer: 1 }), t, DT, rnd); if (i > 60) maxLat = Math.max(maxLat, Math.abs(c.r * c.vf)); });
      expect(maxLat).toBeLessThan(1.55 * 9.81 * grip * 1.15);
      expect(maxLat).toBeGreaterThan(0.6 * 9.81 * grip);
    }
  });

  it('turns right with positive steer (heading increases clockwise)', () => {
    const t = flatTerrain();
    const c = createCar(0, 'hatch', baseStats('hatch'), 0, 0, 0, t);
    c.vz = -15;
    run(120, () => stepCar(c, inp({ throttle: 0.4, steer: 1 }), t, DT, rnd));
    expect(c.h).toBeGreaterThan(0.3);
    expect(c.x).toBeGreaterThan(1);
  });

  it('handbrake starts a drift that holds and then recovers when released', () => {
    const t = flatTerrain();
    const c = createCar(0, 'sport', baseStats('sport'), 0, 0, 0, t);
    c.vz = -28;
    run(60, () => stepCar(c, inp({ throttle: 1, steer: 1, handbrake: true }), t, DT, rnd));
    run(90, () => stepCar(c, inp({ throttle: 1, steer: 0.8 }), t, DT, rnd));
    expect(c.drifting).toBe(true);
    expect(Math.abs(c.slip)).toBeGreaterThan(0.25);
    expect(c.speed).toBeGreaterThan(18);   // a drift keeps speed (fun)
    let ended = false;
    run(120 * 4, () => { stepCar(c, inp({ throttle: 0.6, steer: 0 }), t, DT, rnd); if (!c.drifting) ended = true; });
    expect(ended).toBe(true);
    expect(Math.abs(c.slip)).toBeLessThan(0.1);
  });

  it('a long drift releases a mini-turbo', () => {
    const t = flatTerrain();
    const c = createCar(0, 'sport', baseStats('sport'), 0, 0, 0, t);
    c.vz = -28;
    let tier = 0;
    run(60, () => stepCar(c, inp({ throttle: 1, steer: 1, handbrake: true }), t, DT, rnd));
    run(240, () => { stepCar(c, inp({ throttle: 1, steer: 0.9 }), t, DT, rnd); });
    run(240, () => { stepCar(c, inp({ throttle: 0.2, steer: 0 }), t, DT, rnd); if (c.turboOut) tier = c.turboOut; });
    expect(tier).toBeGreaterThanOrEqual(1);
  });

  it('jumps off a ramp, flies, and lands', () => {
    const t = flatTerrain({ ramp: true });
    const c = createCar(0, 'van', baseStats('van'), 0, -60, 0, t);
    c.vz = -30;
    let air = 0, landed = 0;
    run(120 * 4, () => { stepCar(c, inp({ throttle: 1 }), t, DT, rnd); if (c.airborne) air += DT; if (c.landImpact > 0) landed++; });
    expect(air).toBeGreaterThan(0.4);
    expect(landed).toBe(1);
    expect(c.y).toBe(0);
  });

  it('slides along a wall instead of sticking', () => {
    const t = flatTerrain();
    t.statics.addWall(-200, -10, 200, -10, 1, TAG.building);  // east-west wall north of the car
    const c = createCar(0, 'van', baseStats('van'), 0, 0, 0.5, t);   // heading NE, into the wall at an angle
    const v = 25;
    c.vx = Math.sin(0.5) * v; c.vz = -Math.cos(0.5) * v;
    run(120 * 2, () => { stepCar(c, inp({ throttle: 1 }), t, DT, rnd); collideStatic(c, t.statics); });
    expect(c.z).toBeGreaterThan(-10);          // never through
    expect(c.speed).toBeGreaterThan(8);        // keeps moving along it
    expect(c.x).toBeGreaterThan(15);
  });

  it('a head-on wall hit stops the car without tunnelling, armor keeps more speed on glancing hits', () => {
    const go = (armor: number): number => {
      const t = flatTerrain();
      t.statics.addBox(0, -30, 40, 10, 0, TAG.building);
      const c = createCar(0, 'van', { ...baseStats('van'), armor }, 0, 0, 0.35, t);
      c.vx = Math.sin(0.35) * 35; c.vz = -Math.cos(0.35) * 35;
      run(120, () => { stepCar(c, inp({ throttle: 1 }), t, DT, rnd); collideStatic(c, t.statics); expect(c.z).toBeGreaterThan(-26); });
      return c.speed;
    };
    expect(go(0.8)).toBeGreaterThan(go(0));
  });

  it('car-to-car: momentum goes to the lighter car', () => {
    const t = flatTerrain();
    const heavy = createCar(0, 'jeep', baseStats('jeep'), 0, 0, 0, t);
    const light = createCar(1, 'hatch', baseStats('hatch'), 0, -5.5, 0, t);
    heavy.vz = -20;
    let hit = 0;
    run(60, () => { stepCar(heavy, NO_INPUT, t, DT, rnd); stepCar(light, NO_INPUT, t, DT, rnd); hit = Math.max(hit, collideCars(heavy, light)); });
    expect(hit).toBeGreaterThan(5);
    expect(-light.vz).toBeGreaterThan(-heavy.vz);
    expect(Math.hypot(heavy.x - light.x, heavy.z - light.z)).toBeGreaterThan(3.5);
  });

  it('no NaN over 10k random steps with walls, ramps and boosts', () => {
    const t = flatTerrain({ ramp: true });
    for (let k = -5; k <= 5; k++) t.statics.addBox(k * 30, -150, 8, 8, k, TAG.building);
    const c = createCar(0, 'super', baseStats('super'), 0, 0, 0, t);
    let seed = 5;
    const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let inpv: DriveInput = NO_INPUT;
    run(10000, (i) => {
      if (i % 60 === 0) inpv = inp({ throttle: r(), brake: r() < 0.2 ? 1 : 0, steer: r() * 2 - 1, handbrake: r() < 0.2, nitro: r() < 0.3 });
      if (i % 900 === 0) applyBoost(c, 1);
      stepCar(c, inpv, t, DT, r);
      collideStatic(c, t.statics);
      expect(Number.isFinite(c.x + c.z + c.y + c.vx + c.vz + c.h + c.r + c.pitch + c.roll)).toBe(true);
    });
  });
});

describe('track and racing line', () => {
  const sq = [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 }];
  it('projects and samples consistently', () => {
    const tr = new Track(sq, true, () => 6);
    expect(tr.length).toBeCloseTo(800, 0);
    const p = tr.sample(250);
    expect(tr.project(p.x, p.z).s).toBeCloseTo(250, 0);
  });
  it('the racing line cuts corners inside the road and slows for them', () => {
    const tr = new Track(sq, true, () => 6);
    const line = racingLine(tr);
    for (const p of line.pts) {
      const pr = tr.project(p.x, p.z);
      expect(pr.d).toBeLessThan(6 + 6 * 0.7 + 0.01);
    }
    const corner = line.pt(line.project(200, 0).s / 3 | 0);
    const straight = line.pt(line.project(100, 0).s / 3 | 0);
    expect(corner.v).toBeLessThan(straight.v);
  });
});

describe('items', () => {
  it('rolls defensive items for the leader and strong ones for the last', () => {
    let s = 1;
    const r = (): number => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    const lead = new Set(Array.from({ length: 200 }, () => rollItem(1, 8, r)));
    const last = new Set(Array.from({ length: 200 }, () => rollItem(8, 8, r)));
    expect(lead.has('mine')).toBe(false);
    expect(last.has('mine')).toBe(true);
    expect(last.has('oil')).toBe(false);
  });
  it('thrown oil lands behind the thrower and spins a car that drives over it', () => {
    const t = flatTerrain();
    const thrower = createCar(0, 'van', baseStats('van'), 0, 0, 0, t);
    thrower.vz = -10;
    const items = throwItem('oil', thrower, t, rnd);
    for (let i = 0; i < 240; i++) stepItems(items, [], t, DT, rnd, () => {});
    const it = items[0]!;
    expect(it.settled).toBe(true);
    expect(it.z).toBeGreaterThan(thrower.z);       // behind (south) of the car
    const victim = createCar(1, 'hatch', baseStats('hatch'), it.x, it.z + 20, 0, t);
    victim.vz = -20;
    let hit = false;
    for (let i = 0; i < 180; i++) { stepCar(victim, inp({ throttle: 1 }), t, DT, rnd); stepItems(items, [victim], t, DT, rnd, () => { hit = true; }); }
    expect(hit).toBe(true);
    expect(Math.abs(victim.h)).toBeGreaterThan(0.3);
  });
  it('the magnetic bubble seeks a nearby rival and pops it into the air (no explosion)', () => {
    const t = flatTerrain();
    const owner = createCar(0, 'van', baseStats('van'), 0, 0, 0, t);
    const items = throwItem('mine', owner, t, rnd);
    const rival = createCar(1, 'hatch', baseStats('hatch'), 3, 14, 0, t);
    let hit = false;
    for (let i = 0; i < 400 && !hit; i++) stepItems(items, [owner, rival], t, DT, rnd, (_it, c) => { if (c === rival) hit = true; });
    expect(hit).toBe(true);
    expect(rival.airborne).toBe(true);
    expect(rival.bubbleT).toBeGreaterThan(0);
  });
});

describe('world, races and AI (on the real city)', () => {
  const city = buildCity(1);
  const mk = (traffic = 10): DriveSim => new DriveSim(city, { seed: 3, look: LOOK, stats: baseStats('van'), spawn: city.spawn, gates: GATES, traffic });

  it('is deterministic for a seed', () => {
    const a = mk(), b = mk();
    const drive = (s: DriveSim): void => { for (let i = 0; i < 1200; i++) s.step(inp({ throttle: 1, steer: Math.sin(i / 80) * 0.5, useItem: i === 500 })); };
    drive(a); drive(b);
    expect(a.hash()).toBe(b.hash());
  });

  it('traffic drives on roads and does not pile up', () => {
    const s = mk(16);
    for (let i = 0; i < 120 * 20; i++) s.step(NO_INPUT);
    const tr = s.drivers.filter((d) => d.kind === 'traffic');
    expect(tr.length).toBeGreaterThan(8);
    const moving = tr.filter((d) => d.car.speed > 3).length;
    const onRoad = tr.filter((d) => city.onRoad(d.car.x, d.car.z, -2)).length;
    expect(moving / tr.length).toBeGreaterThan(0.5);
    expect(onRoad / tr.length).toBeGreaterThan(0.85);
  });

  it('AI rivals finish every race kind with rivals, in a sane time', () => {
    for (const def of city.races.filter((r) => r.rivals > 0)) {
      const s = mk(4);
      s.startRace(def);
      const race = s.race!;
      // park the player out of the way
      s.player.x = 1400; s.player.z = -1400;
      let t = 0;
      // the player idles at the start; the rivals race
      while (t < 400 && race.cars.slice(1).some((c) => !c.finished)) { s.step(NO_INPUT); t += DT; }
      const fin = race.cars.slice(1).filter((c) => c.finished).length;
      const avgV = race.totalLen / t;
      expect(fin, def.id).toBe(race.cars.length - 1);
      expect(avgV, def.id).toBeGreaterThan(9);
    }
  }, 120000);

  it('a bot player can finish a circuit and gets a result with a medal field', () => {
    const def = city.races.find((r) => r.kind === 'circuit')!;
    const s = mk(0);
    s.startRace({ ...def, rivals: 2, laps: 1 });
    let res = null as null | { place: number; medal: string };
    let stuck = 0;
    for (let i = 0; i < 120 * 300 && !res; i++) {
      // drive the player with the same racer AI
      const race = s.race!;
      const ai = (s as unknown as { botAi?: ReturnType<typeof import('./ai').createRacerAI> }).botAi;
      void ai;
      const p = s.player;
      const pr = race.line.project(p.x, p.z, race.cars[0]!.s);
      const tp = race.line.sample(pr.s + 8 + p.speed * 0.4);
      const want = Math.atan2(tp.x - p.x, -(tp.z - p.z));
      let err = want - p.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
      const vt = race.line.pt(race.line.sample(pr.s + 4 + p.speed * 0.3).i).v;
      stuck = race.state === 'running' && p.speed < 1 ? stuck + 1 : 0;
      s.step(inp({ throttle: p.speed < vt ? 1 : 0, brake: p.speed > vt + 2 ? 0.6 : 0, steer: Math.max(-1, Math.min(1, err * 2.5)), reset: stuck > 240 }));
      if (stuck > 240) stuck = 0;
      for (const e of s.events) if (e.t === 'raceEnd') res = e.result;
      s.events.length = 0;
    }
    expect(res).not.toBeNull();
    expect(res!.place).toBeGreaterThanOrEqual(1);
    expect(['gold', 'silver', 'bronze', 'none']).toContain(res!.medal);
  }, 60000);

  it('quiz boxes: driving through the right box gives an item, the wrong one slows and counts', () => {
    const base = city.races.find((r) => (r.gatesEvery ?? 0) > 0)!;
    const def: RaceDef = { ...base, rivals: 0, gatesEvery: 200 };
    for (const want of ['right', 'wrong'] as const) {
      const s = mk(0);
      s.startRace(def);
      const race = s.race!;
      const g = race.groups[0]!;
      const opt = want === 'right' ? g.gate.correct : (g.gate.correct + 1) % 3;
      const box = g.boxes.find((b) => b.opt === opt)!;
      // countdown
      for (let i = 0; i < 120 * 3.2; i++) s.step(NO_INPUT);
      // place the player 25 m before the group in the box lane, facing along the track, and drive straight
      const q = race.track.sample(g.s - 25);
      const off = { x: box.x - race.track.sample(g.s).x, z: box.z - race.track.sample(g.s).z };
      s.teleport(q.x + off.x, q.z + off.z, Math.atan2(q.dx, -q.dz));
      race.cars[0]!.s = g.s - 25;
      s.player.ghostT = 0;
      s.player.vx = q.dx * 15; s.player.vz = q.dz * 15;
      const evs: string[] = [];
      for (let i = 0; i < 300; i++) { s.step(inp({ throttle: 0.5 })); for (const e of s.events) if (e.t === 'gate') evs.push(e.right ? 'right' : 'wrong'); s.events.length = 0; }
      expect(evs).toEqual([want]);
      if (want === 'right') { expect(race.gatesRight).toBe(1); expect(s.playerDriver.items.length).toBe(1); }
      else { expect(race.gatesWrong).toBe(1); expect(s.playerDriver.items.length).toBe(0); }
    }
  });

  it('collects coins and keeps them collected; reset puts the car back on a road', () => {
    const s = mk(0);
    const coin = city.pickups.find((p) => p.kind === 'coin')!;
    s.teleport(coin.x, coin.z + 6, 0);
    s.player.ghostT = 0;
    for (let i = 0; i < 240; i++) s.step(inp({ throttle: 0.6 }));
    expect(s.coins).toBeGreaterThanOrEqual(1);
    expect(s.collected.has(coin.id)).toBe(true);
    // reset from a courtyard
    const b = city.buildings[10]!;
    s.teleport(b.x + b.w, b.z + b.d, 0);
    s.step(inp({ reset: true }));
    expect(city.onRoad(s.player.x, s.player.z, -1)).toBe(true);
  });
});

void StaticWorld;
