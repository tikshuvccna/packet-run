import { describe, expect, it } from 'vitest';
import type { CarLook } from '../contract';
import { NO_INPUT } from '../contract';
import { buildCity } from '../../world3d/city';
import { kitSize } from '../../world3d/city';
import { baseStats } from './cars';
import { LIGHT_CYCLE, lightState } from './lights';
import { DriveSim, DT } from './world';

const LOOK: CarLook = { car: 'van', paint: '#f2b134', vinyl: null, vinylColor: '#fff', wheels: 'std', rim: '#ddd', spoiler: false };
const city = buildCity(1);
const mk = (traffic = 0): DriveSim => new DriveSim(city, { seed: 5, look: LOOK, stats: baseStats('van'), spawn: city.spawn, gates: [], traffic });

describe('traffic lights', () => {
  it('cycles green, yellow, red and the two axes are never green together', () => {
    const seen = new Set<string>();
    for (let t = 0; t < LIGHT_CYCLE * 2; t += 0.1) {
      const x = lightState(t, 3.3, true), z = lightState(t, 3.3, false);
      seen.add(x);
      expect(x === 'green' && z === 'green').toBe(false);
    }
    expect([...seen].sort()).toEqual(['green', 'red', 'yellow']);
  });
  it('the city has signalised avenue crossings', () => {
    expect(city.signals.size).toBeGreaterThan(5);
    for (const id of city.signals.keys()) expect(city.nodes[id]!.round).toBe(0);
  });
  it('civilian traffic waits at red lights some of the time (and drives on)', () => {
    const s = mk(24);
    // go where the lights are: the signalised node with the most signalised neighbours nearby
    const ids = [...city.signals.keys()];
    const best = ids.map((id) => city.nodes[id]!).sort((a, b) => ids.filter((k) => Math.hypot(city.nodes[k]!.x - b.x, city.nodes[k]!.z - b.z) < 400).length - ids.filter((k) => Math.hypot(city.nodes[k]!.x - a.x, city.nodes[k]!.z - a.z) < 400).length)[0]!;
    s.teleport(best.x + 30, best.z + 30, 0);
    s.player.ghostT = 45;    // the player is a ghost (no contacts) during the test
    let stoppedNearSignal = 0, moving = 0;
    for (let i = 0; i < 120 * 40; i++) {
      s.step(NO_INPUT);
      if (i % 120 !== 0) continue;
      for (const d of s.drivers) {
        if (d.kind !== 'traffic') continue;
        if (d.car.speed > 4) moving++;
        if (d.car.speed < 0.5) for (const id of city.signals.keys()) { const n = city.nodes[id]!; if (Math.hypot(n.x - d.car.x, n.z - d.car.z) < 35) { stoppedNearSignal++; break; } }
      }
    }
    expect(stoppedNearSignal).toBeGreaterThan(0);
    expect(moving).toBeGreaterThan(stoppedNearSignal);
  });
});

describe('races: rivals, standings, ghost', () => {
  it('races exactly the requested rivals (rival ladder) and reports standings and beaten rivals', () => {
    const def = city.races.find((r) => r.kind === 'circuit')!;
    const s = mk();
    s.startRace({ ...def, laps: 1, rivals: 2, rivalIds: ['bit', 'frame'] });
    const ids = s.drivers.filter((d) => d.kind === 'rival').map((d) => d.rivalId).sort();
    expect(ids).toEqual(['bit', 'frame']);
    // let the rivals race while the player idles: the result must list everybody, player last, nobody beaten
    s.player.x = 1400; s.player.z = -1400;
    let res = null as null | import('../contract').RaceResult;
    for (let i = 0; i < 120 * 200 && !res; i++) {
      s.step(NO_INPUT);
      for (const e of s.events) if (e.t === 'raceEnd') res = e.result;
      s.events.length = 0;
      // end the race for the test once both rivals finished: move the player over the line
      if (s.race && s.race.cars.slice(1).every((c) => c.finished) && !res) { s.race.cars[0]!.s = s.race.totalLen + 1; }
    }
    expect(res).not.toBeNull();
    expect(res!.standings!.length).toBe(3);
    expect(res!.standings!.find((x) => x.player)!.place).toBe(3);
    expect(res!.beaten).toEqual([]);
  }, 60000);

  it('the grand prix always includes the Noise', () => {
    const gp = city.races.find((r) => r.id === 'grandprix')!;
    const s = mk();
    s.startRace(gp);
    expect(s.drivers.some((d) => d.rivalId === 'noise')).toBe(true);
    expect(s.drivers.filter((d) => d.kind === 'rival').length).toBe(gp.rivals);
  });

  it('the ghost replays a recorded run at the race clock', () => {
    const def = { ...city.races.find((r) => r.kind === 'timetrial')! };
    const s = mk();
    const ghost: number[] = [];
    for (let k = 0; k < 100; k++) ghost.push(100 + k, 200, 0, 0.5);
    s.startRace(def, ghost);
    for (let i = 0; i < 120 * 3.5; i++) s.step(NO_INPUT);   // countdown 3 s, then 0.5 s of racing
    const g = s.ghostPose()!;
    expect(g).not.toBeNull();
    expect(g.x).toBeGreaterThan(103);
    expect(g.x).toBeLessThan(107);
    expect(g.h).toBeCloseTo(0.5, 3);
    void DT;
  });

  it('teleport (tow truck) mid-race is safe: the car lands on the spot and the sim keeps stepping', () => {
    const s = mk(6);
    s.startRace(city.races.find((r) => r.kind === 'circuit')!);
    for (let i = 0; i < 400; i++) s.step(NO_INPUT);
    const g = city.pois.find((p) => p.id === 'garage_main')!;
    s.endRace();
    s.teleport(g.x, g.z, 0);
    for (let i = 0; i < 240; i++) s.step(NO_INPUT);
    expect(s.race).toBeNull();
    expect(Math.hypot(s.player.x - g.x, s.player.z - g.z)).toBeLessThan(3);
    expect(Number.isFinite(s.player.y)).toBe(true);
  });
});

describe('kit sizing', () => {
  it('kit buildings fill their colliders (footprint = model bounds x scale)', () => {
    let n = 0;
    for (const b of city.buildings) {
      if (b.ks <= 0) continue;
      const [kx, ky, kz] = kitSize(b.kit);
      expect(b.w).toBeCloseTo(kx * b.ks, 3);
      expect(b.d).toBeCloseTo(kz * b.ks, 3);
      expect(b.h).toBeCloseTo(ky * b.ks, 3);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });
});
