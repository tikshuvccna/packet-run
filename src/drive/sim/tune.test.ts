import { it } from 'vitest';
import { baseStats } from './cars';
import { createCar, stepCar } from './car';
import { flatTerrain, inp } from './testutil';

const DT = 1 / 120;
const rnd = (): number => 0.5;

it.skipIf(!process.env.TUNE)('tuning printout', () => {
  const t = flatTerrain();
  for (const id of ['van', 'sport'] as const) {
    const c = createCar(0, id, baseStats(id), 0, 0, 0, t);
    let t100 = -1, time = 0;
    for (let i = 0; i < 120 * 30; i++) {
      stepCar(c, inp({ throttle: 1 }), t, DT, rnd); time += DT;
      if (t100 < 0 && c.speed * 3.6 >= 100) t100 = time;
    }
    const top = c.speed;
    let dist = 0;
    const v0 = c.speed;
    let bt = 0;
    while (c.speed > 0.1 && bt < 20) { const x = c.x, z = c.z; stepCar(c, inp({ brake: 1 }), t, DT, rnd); dist += Math.hypot(c.x - x, c.z - z); bt += DT; }
    console.log(id, '0-100', t100.toFixed(2), 'top', (top * 3.6).toFixed(1), 'kmh brake from', (v0 * 3.6).toFixed(0), 'dist', dist.toFixed(1), 'gear', c.gear);
    // cornering at full steer at ~25 m/s
    for (const sp of [15, 25, 35]) {
      const d = createCar(0, id, baseStats(id), 0, 0, 0, t);
      d.vx = 0; d.vz = -sp;
      let maxLat = 0, slipMax = 0;
      for (let i = 0; i < 120 * 4; i++) {
        stepCar(d, inp({ throttle: 0.6, steer: 1 }), t, DT, rnd);
        if (i > 240) { maxLat = Math.max(maxLat, Math.abs(d.r * d.vf)); slipMax = Math.max(slipMax, Math.abs(d.slip)); }
      }
      console.log('  corner v0', sp, 'speed', d.speed.toFixed(1), 'latG', (maxLat / 9.81).toFixed(2), 'slip', slipMax.toFixed(2), 'radius', (d.speed / Math.abs(d.r)).toFixed(1));
    }
    // handbrake drift: 30 m/s, steer right + handbrake 0.5s, then hold throttle+steer
    const e = createCar(0, id, baseStats(id), 0, 0, 0, t);
    e.vz = -30;
    const log: string[] = [];
    for (let i = 0; i < 120 * 4; i++) {
      const hb = i < 60;
      const steer = i < 200 ? 1 : -0.4;
      stepCar(e, inp({ throttle: 1, steer, handbrake: hb }), t, DT, rnd);
      if (i % 30 === 0) log.push(`${(i / 120).toFixed(2)}s v${e.speed.toFixed(1)} slip${e.slip.toFixed(2)} r${e.r.toFixed(2)} d${e.drifting ? 1 : 0} g${e.rearGrip.toFixed(2)}`);
    }
    console.log('  drift', log.join(' | '));
  }
});
