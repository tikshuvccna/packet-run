/** AI drivers: race rivals on the racing line, and civilian traffic on the road graph. Both produce DriveInput. */
import type { DriveInput } from '../contract';
import { type CarState, maxSteerAt } from './car';
import { clamp, headingOf, wrapAngle } from './math';
import type { Track } from './track';
import type { SimCity } from './types';

/* ------------------------------------------------------------------ racers */
export interface RacerAI {
  line: Track; s: number; lane: number; laneT: number;
  skill: number; aggr: number; prefLane: number;
  wobble: number; stuckT: number; smokeT: number; itemWait: number;
  /** progress watchdog */ checkS: number; checkT: number; offT: number;
}

export function createRacerAI(line: Track, s: number, skill: number, aggr: number, prefLane: number): RacerAI {
  return { line, s, lane: prefLane, laneT: prefLane, skill, aggr, prefLane, wobble: 0, stuckT: 0, smokeT: 0, itemWait: 2, checkS: s, checkT: 0, offT: 0 };
}

/** Pure-pursuit steering toward a world point. */
export function steerToward(c: CarState, tx: number, tz: number): number {
  const dx = tx - c.x, dz = tz - c.z;
  const L = Math.max(4, Math.hypot(dx, dz));
  const err = wrapAngle(headingOf(dx, dz) - c.h);
  const wb = c.dims.a + c.dims.b;
  const delta = Math.atan((2 * Math.sin(err) * wb) / L);
  const reverse = c.vf < -0.5 ? -1 : 1;
  return clamp((delta / Math.max(0.05, maxSteerAt(c))) * reverse, -1, 1);
}

/**
 * rubber: speed multiplier from the race director (about 0.93 .. 1.08). others: all cars (to avoid/overtake).
 */
export function racerInput(ai: RacerAI, c: CarState, others: CarState[], rubber: number, rng: () => number): DriveInput {
  const line = ai.line;
  const pr = line.project(c.x, c.z, ai.s);
  ai.s = pr.s;
  // watchdog: no progress for 4 s, or far off the line for 2 s -> ask the world for a reset (stuckT > 3.5)
  ai.checkT += 1 / 120;
  if (ai.checkT > 4) { if (ai.s - ai.checkS < 15) ai.stuckT = 9; ai.checkT = 0; ai.checkS = ai.s; }
  ai.offT = pr.d > line.pt(line.sample(ai.s).i).hw + 9 ? ai.offT + 1 / 120 : 0;
  if (ai.offT > 2) ai.stuckT = 9;
  const v = c.speed;
  // traffic ahead: overtake on the freer side, brake if boxed in
  let blockD = Infinity, blockV = 0;
  const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = Math.cos(c.h), rz = Math.sin(c.h);
  let leftFree = true, rightFree = true;
  for (const o of others) {
    if (o === c || o.ghostT > 0) continue;
    const dx = o.x - c.x, dz = o.z - c.z;
    const fwd = dx * fx + dz * fz, lat = dx * rx + dz * rz;
    if (fwd < -6 || fwd > 32 || Math.abs(lat) > 7) continue;
    if (Math.abs(lat) < 2.6 && fwd > 0) { if (fwd < blockD) { blockD = fwd; blockV = o.vf; } }
    if (fwd > -4 && fwd < 10) { if (lat < 0 && lat > -4.5) leftFree = false; if (lat > 0 && lat < 4.5) rightFree = false; }
  }
  const p = line.sample(ai.s);
  const hw = Math.max(1, (line.pt(p.i).hw ?? 5) - 2.2);
  if (blockD < 30 && blockV < v + 1) {
    if (ai.laneT === ai.prefLane || Math.abs(ai.laneT) < 0.5) ai.laneT = rightFree && (!leftFree || ai.lane >= 0) ? hw * 0.8 : -hw * 0.8;
  } else if (rng() < 0.004) ai.laneT = ai.prefLane;
  ai.lane += clamp(ai.laneT - ai.lane, -3 * (1 / 120), 3 * (1 / 120)) * 2;
  ai.lane = clamp(ai.lane, -hw, hw);

  const look = 7 + v * 0.42;
  const tp = line.sample(ai.s + look);
  const [nx, nz] = [-tp.dz, tp.dx];
  ai.wobble += (rng() - 0.5) * 0.02;
  ai.wobble *= 0.995;
  const noise = (1 - ai.skill) * ai.wobble * 6 + (ai.smokeT > 0 ? Math.sin(ai.s * 0.2) * 3 : 0);
  ai.smokeT = Math.max(0, ai.smokeT - 1 / 120);
  let steer = steerToward(c, tp.x + nx * (ai.lane + noise), tp.z + nz * (ai.lane + noise));

  // speed target from the line profile (scaled by the car's grip and the driver's skill)
  const sp = line.pt(line.sample(ai.s + 3 + v * 0.3).i);
  let vt = sp.v * Math.sqrt(c.stats.grip) * (0.84 + 0.18 * ai.skill) * rubber;
  if (blockD < 12 && blockV < v) vt = Math.min(vt, Math.max(0, blockV - 1));
  if (ai.smokeT > 0) vt *= 0.85;
  let throttle = 0, brake = 0;
  if (vt > v + 0.5) throttle = clamp((vt - v) / 2.5, 0.35, 1);
  else if (v > vt + 1.2) brake = clamp((v - vt) / 7, 0.15, 1);
  else throttle = 0.3;
  // nitro on straights
  let nitro = false;
  if (c.nitro > 0.4 && ai.aggr > 0.2 && v > 14) {
    const far = line.pt(line.sample(ai.s + 30 + v).i).v;
    nitro = far > v * 1.25 && sp.v > v * 1.2 && rng() < 0.2 + ai.aggr * 0.6;
  }
  // stuck: reverse a little (the world resets after a while)
  if (v < 2) ai.stuckT += 1 / 120; else if (v > 5) ai.stuckT = Math.max(0, ai.stuckT - 1 / 60);
  if (ai.stuckT > 1.2 && ai.stuckT < 2.2) { throttle = 0; brake = 1; steer = -steer; }
  return { p: 0, throttle, brake, steer, nitro, handbrake: false, useItem: false, look: false, reset: false };
}

/* ------------------------------------------------------------------ traffic */
export interface TrafficAI { pts: { x: number; z: number; slow: boolean }[]; cur: number; edge: number; to: number; vBase: number; waitT: number }

function laneOff(city: SimCity, edge: number): number { return (city.edges[edge]?.avenue ? 4.4 : 2.5); }

/** Append the points for driving edge `edge` toward node `to`, plus the turn into the next edge. */
export function extendTraffic(t: TrafficAI, city: SimCity, rng: () => number): void {
  const e = city.edges[t.edge];
  if (!e) return;
  const fromId = e.a === t.to ? e.b : e.a;
  const A = city.nodes[fromId], B = city.nodes[t.to];
  if (!A || !B) return;
  const len = Math.max(1, Math.hypot(B.x - A.x, B.z - A.z));
  const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
  const rxv = -uz, rzv = ux;             // right of travel
  const lane = laneOff(city, t.edge);
  const rA = A.round ? A.round + 3 : 9, rB = B.round ? B.round + 3 : 9;
  const n = Math.max(1, Math.floor((len - rA - rB) / 25));
  for (let k = 0; k <= n; k++) {
    const s = rA + ((len - rA - rB) * k) / n;
    t.pts.push({ x: A.x + ux * s + rxv * lane, z: A.z + uz * s + rzv * lane, slow: false });
  }
  // choose the next edge
  const opts = B.edges.filter((id) => id !== t.edge && !city.edges[id]?.ramp);
  const next = opts.length ? (opts[Math.floor(rng() * opts.length)] as number) : t.edge;
  const ne = city.edges[next];
  if (!ne) return;
  const nto = ne.a === B.id ? ne.b : ne.a;
  const C = city.nodes[nto];
  if (!C) return;
  const l2 = Math.max(1, Math.hypot(C.x - B.x, C.z - B.z));
  const vx = (C.x - B.x) / l2, vz = (C.z - B.z) / l2;
  if (B.round) {
    // around the island counter-clockwise as seen from above (decreasing atan2(z, x) angle)
    const R = B.round * 0.55 + 5;
    const a0 = Math.atan2(uz * -1, ux * -1) + 0.0;   // entry: we come from -u
    let a1 = Math.atan2(vz, vx);                     // exit toward +v
    // offset entry/exit to the right-hand lane positions
    let start = Math.atan2(-uz + rzv * 0.35, -ux + rxv * 0.35);
    void a0;
    while (a1 >= start) a1 -= Math.PI * 2;
    if (start - a1 < 0.6) a1 -= Math.PI * 2;
    start -= 0.25;
    for (let a = start; a > a1 + 0.2; a -= 0.35) t.pts.push({ x: B.x + Math.cos(a) * R, z: B.z + Math.sin(a) * R, slow: true });
  } else {
    const turn = Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz));
    if (turn > 0.5) { const last = t.pts[t.pts.length - 1]; if (last) last.slow = true; }
  }
  t.edge = next; t.to = nto;
}

export function trafficInput(t: TrafficAI, c: CarState, city: SimCity, others: CarState[], rng: () => number): DriveInput {
  // advance the cursor past points that are close or behind
  for (let guard = 0; guard < 8; guard++) {
    const p = t.pts[t.cur];
    if (!p) break;
    const dx = p.x - c.x, dz = p.z - c.z;
    const fwd = dx * Math.sin(c.h) - dz * Math.cos(c.h);
    if (Math.hypot(dx, dz) < 7 || fwd < 0) t.cur++; else break;
  }
  if (t.pts.length - t.cur < 6) extendTraffic(t, city, rng);
  if (t.cur > 40) { t.pts.splice(0, t.cur); t.cur = 0; }
  const p = t.pts[t.cur] ?? { x: c.x, z: c.z, slow: true };
  const steer = steerToward(c, p.x, p.z);
  let vt = t.vBase;
  for (let k = t.cur; k < Math.min(t.pts.length, t.cur + 2); k++) if (t.pts[k]?.slow) vt = Math.min(vt, 8);
  // keep distance from anything ahead
  const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = Math.cos(c.h), rz = Math.sin(c.h);
  for (const o of others) {
    if (o === c) continue;
    const dx = o.x - c.x, dz = o.z - c.z;
    if (Math.abs(dx) > 25 || Math.abs(dz) > 25) continue;
    const fwd = dx * fx + dz * fz, lat = dx * rx + dz * rz;
    if (fwd > 0 && fwd < 22 && Math.abs(lat) < 2.6) vt = Math.min(vt, fwd < 8 ? 0 : Math.max(0, o.vf * 0.9 + (fwd - 8) * 0.3));
  }
  const v = c.vf;
  let throttle = 0, brake = 0;
  if (vt > v + 0.5) throttle = clamp((vt - v) / 4, 0.2, 0.7);
  else if (v > vt + 0.8) brake = clamp((v - vt) / 6, 0.2, 1);
  return { p: 0, throttle, brake, steer, nitro: false, handbrake: false, useItem: false, look: false, reset: false };
}
