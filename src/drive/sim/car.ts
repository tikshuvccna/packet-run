/**
 * Arcade-but-realistic car: dynamic bicycle model (slip angles, saturating lateral tyre force with a slide falloff),
 * engine torque curve with an automatic 5-gear box, brakes, reverse, handbrake drift with assisted sustain and recovery,
 * nitro, airtime off ramps, and visual suspension (pitch/roll springs + terrain tilt). Pure and deterministic.
 */
import type { CarId, CarStats, DriveInput, WheelId } from '../contract';
import { CAR_DIMS, type CarDims } from './cars';
import { approach, clamp, cross2, lerp, wrapAngle } from './math';
import type { Contact, StaticWorld } from './statics';

export const G = 9.81;
export const SURF = { road: 0, grass: 1, sand: 2, water: 3 } as const;

export interface Terrain {
  heightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): number;
  statics: StaticWorld;
}

export interface CarState {
  id: number;
  carId: CarId;
  wheels: WheelId;
  dims: CarDims;
  stats: CarStats;
  // body
  x: number; z: number; y: number; h: number;
  vx: number; vz: number; vy: number; r: number;
  // derived each step
  speed: number; vf: number; vl: number; slip: number;  // slip = body slip angle (rad)
  // controls
  steer: number; throttle: number; brakeIn: number;
  gear: number; rpm: number; shiftT: number;
  // abilities
  nitro: number; boosting: boolean; boostT: number;
  airborne: boolean; airT: number; lastAir: number;
  // drift
  rearGrip: number; drifting: boolean; driftT: number; driftScore: number; driftChain: number;
  /** mini-turbo tier reached in the current drift (0..3) and the boost tier released on the last step (0 = none) */
  driftTier: number; turboOut: number;
  /** slipstream 0..1 (set by the world each step) */
  draft: number;
  // effects
  oilT: number; glueT: number; bubbleT: number; ghostT: number; spinDir: number;
  // visuals (springs)
  pitch: number; roll: number; pitchV: number; rollV: number; gPitch: number; gRoll: number; wheelSpin: number;
  skid: number;              // 0..1 tyre squeal amount
  surface: number;
  // collision bookkeeping
  lastImpact: number; impactX: number; impactZ: number;
  stuckT: number;
  landImpact: number;        // >0 on the step it landed (m/s)
  /** body damage 0 (new) .. 1 (wrecked): a badly damaged car is slower */
  dmg: number;
}

export function createCar(id: number, carId: CarId, stats: CarStats, x: number, z: number, h: number, terrain?: Terrain, wheels: WheelId = 'std'): CarState {
  const y = terrain ? terrain.heightAt(x, z) : 0;
  return {
    id, carId, wheels, dims: CAR_DIMS[carId], stats: { ...stats },
    x, z, y, h, vx: 0, vz: 0, vy: 0, r: 0,
    speed: 0, vf: 0, vl: 0, slip: 0,
    steer: 0, throttle: 0, brakeIn: 0, gear: 0, rpm: 900, shiftT: 0,
    nitro: stats.nitroCap, boosting: false, boostT: 0,
    airborne: false, airT: 0, lastAir: 0,
    rearGrip: 1, drifting: false, driftT: 0, driftScore: 0, driftChain: 0, driftTier: 0, turboOut: 0, draft: 0,
    oilT: 0, glueT: 0, bubbleT: 0, ghostT: 0, spinDir: 1,
    pitch: 0, roll: 0, pitchV: 0, rollV: 0, gPitch: 0, gRoll: 0, wheelSpin: 0, skid: 0, surface: 0,
    lastImpact: 0, impactX: 0, impactZ: 0, stuckT: 0, landImpact: 0, dmg: 0,
  };
}

/** Gear tops as fractions of the base top speed. */
const GEAR_TOP = [0.24, 0.42, 0.6, 0.8, 1.04];
const GEAR_MUL = [1.3, 1.12, 1.0, 0.9, 0.82];
const MU = 1.55;               // base tyre friction (arcade high)
const ALPHA_F = 0.13, ALPHA_R = 0.11;
const REVERSE_MAX = 10;

/** Tyre lateral curve: rises to 1 at u = 1, then falls toward 0.82 (sliding). */
function tyre(u: number): number {
  const a = Math.abs(u);
  const f = a < 1 ? a * (2 - a) : 1 - 0.18 * Math.min(1, (a - 1) / 2.5);
  return u < 0 ? -f : f;
}

/** Wheel-type tweaks (offroad wheels hate asphalt less than grass, sport wheels slide nicer). */
function surfaceGrip(surface: number, wheels: WheelId): { grip: number; drag: number; top: number } {
  if (surface === SURF.road) return { grip: 1, drag: 0, top: 1 };
  const off = wheels === 'offroad';
  if (surface === SURF.sand) return off ? { grip: 0.85, drag: 1.2, top: 0.85 } : { grip: 0.62, drag: 3.0, top: 0.6 };
  if (surface === SURF.water) return { grip: 0.4, drag: 8, top: 0.3 };
  return off ? { grip: 0.95, drag: 0.4, top: 0.95 } : { grip: 0.78, drag: 1.6, top: 0.78 };
}

/** Maximum front wheel angle at a forward speed (speed sensitive steering). */
export function maxSteerAt(c: CarState, vf = c.vf): number {
  return (0.62 / (1 + Math.max(0, Math.abs(vf) - 6) / (c.drifting ? 26 : 17))) * clamp(c.stats.handling, 0.6, 1.6);
}

/**
 * One fixed step. rng() is used only for item-driven spins (seeded by the owner).
 */
export function stepCar(c: CarState, inp: DriveInput, t: Terrain, dt: number, rng: () => number): void {
  const st = c.stats, d = c.dims;
  const L = d.a + d.b;
  const m = st.mass;
  const I = m * d.a * d.b * 1.05;
  const sh = Math.sin(c.h), ch = Math.cos(c.h);
  const fx = sh, fz = -ch, rx = ch, rz = sh;
  let vf = c.vx * fx + c.vz * fz;
  let vl = c.vx * rx + c.vz * rz;
  const speed = Math.hypot(c.vx, c.vz);
  c.landImpact = 0;
  c.turboOut = 0;

  // ---- timers
  c.oilT = Math.max(0, c.oilT - dt);
  c.glueT = Math.max(0, c.glueT - dt);
  c.bubbleT = Math.max(0, c.bubbleT - dt);
  c.ghostT = Math.max(0, c.ghostT - dt);
  c.boostT = Math.max(0, c.boostT - dt);
  c.shiftT = Math.max(0, c.shiftT - dt);
  c.lastImpact = Math.max(0, c.lastImpact - dt * 3);

  // ---- surface
  c.surface = t.surfaceAt(c.x, c.z);
  const sg = surfaceGrip(c.surface, c.wheels);

  // ---- input shaping
  const throttleIn = clamp(inp.throttle, 0, 1);
  const brakeIn = clamp(inp.brake, 0, 1);
  c.throttle = approach(c.throttle, inp.reverse !== undefined && throttleIn > 0 ? Math.max(throttleIn, 0.85) : throttleIn, dt * 6);
  c.brakeIn = brakeIn;
  // speed sensitive steering: wide lock when slow, calmer at speed (but drifting keeps more lock for counter-steer)
  const maxSteer = maxSteerAt(c, vf);
  const steerTarget = clamp(inp.steer, -1, 1) * maxSteer;
  const steerRate = (c.drifting ? 5.5 : 3.6) * clamp(st.handling, 0.6, 1.6);
  c.steer = approach(c.steer, steerTarget, steerRate * dt);

  // ---- nitro
  const wantsBoost = inp.nitro && c.nitro > 0.02 && vf > -1 && c.bubbleT <= 0;
  c.boosting = (wantsBoost || c.boostT > 0);
  if (wantsBoost) c.nitro = Math.max(0, c.nitro - dt);
  else if (!c.airborne && speed > st.topSpeed * 0.55 && c.surface === SURF.road) c.nitro = Math.min(st.nitroCap, c.nitro + st.nitroRegen * dt);

  // ---- engine and gears
  const topEff = st.topSpeed * sg.top * (c.boosting ? st.nitroPower : 1) * (c.glueT > 0 ? 0.45 : 1) * (1 + 0.07 * c.draft) * (1 - 0.3 * Math.max(0, c.dmg - 0.4) / 0.6);
  const absVf = Math.abs(vf);
  const gTop = (g: number): number => (GEAR_TOP[g] ?? 1) * st.topSpeed;
  if (c.gear < 4 && absVf > gTop(c.gear) * 0.97 && c.throttle > 0.1) { c.gear++; c.shiftT = 0.14; }
  else if (c.gear > 0 && absVf < gTop(c.gear - 1) * 0.68) { c.gear--; }
  const rpmN = clamp(absVf / gTop(c.gear), 0, 1.05);
  let rpmTarget = 900 + rpmN * 6100;
  if (c.airborne && c.throttle > 0.2) rpmTarget = 6400;
  if (absVf < 1 && c.throttle > 0.2) rpmTarget = 2600 + c.throttle * 1800;   // revving at a standstill
  c.rpm = lerp(c.rpm, rpmTarget, clamp(dt * 14, 0, 1));
  const torque = (0.72 + 0.5 * rpmN - 0.36 * rpmN * rpmN) / 0.89;
  let aDrive = 0;
  let aBrake = 0;
  let reversing = false;
  // gearbox mode (touch lever): `reverse` is given, so the brake only brakes and the lever position caps the cruise speed
  const lever = inp.reverse !== undefined;
  const revIn = clamp(inp.reverse ?? 0, 0, 1);
  const capV = lever ? topEff * (0.25 + 0.75 * throttleIn) : topEff;
  if (throttleIn > 0 && vf > -0.5) {
    const lim = speed < capV ? 1 - Math.pow(speed / capV, 3) : 0;
    aDrive = c.throttle * st.accel * 0.82 * torque * (GEAR_MUL[c.gear] ?? 1) * lim;
    if (c.shiftT > 0) aDrive *= 0.35;
    if (c.boosting) aDrive += (st.accel * 0.7 + 3.0) * Math.max(0, 1 - Math.pow(speed / topEff, 3));
  } else if (throttleIn > 0 && vf <= -0.5) {
    aBrake = st.brake * 0.8 * throttleIn;   // throttle while rolling backward = brake
  }
  if (lever) {
    if (brakeIn > 0) aBrake = Math.max(aBrake, st.brake * 0.72 * brakeIn);
    if (revIn > 0) {
      if (vf > 0.6) aBrake = Math.max(aBrake, st.brake * 0.72 * revIn);
      else if (brakeIn <= 0) {
        reversing = true;
        const rmax = REVERSE_MAX * (0.4 + 0.6 * revIn);
        aDrive = -revIn * 7 * (vf > -rmax ? 1 - Math.max(0, -vf) / rmax : 0);
      }
    }
  } else if (brakeIn > 0) {
    if (vf > 0.6) aBrake = Math.max(aBrake, st.brake * 0.72 * brakeIn);
    else if (throttleIn <= 0) {
      reversing = true;
      aDrive = -brakeIn * 7 * (vf > -REVERSE_MAX ? 1 - Math.max(0, -vf) / REVERSE_MAX : 0);
    }
  }
  if (c.boosting && !wantsBoost && c.boostT > 0) aDrive += 5 * Math.max(0, 1 - Math.pow(speed / topEff, 3));
  if (c.draft > 0 && throttleIn > 0) aDrive += 2.2 * c.draft;
  // over-speed (after nitro) bleed
  const over = speed > topEff ? Math.min(6, (speed / topEff - 1) * 25) : 0;
  const coast = (throttleIn === 0 && brakeIn === 0 && revIn === 0) || (lever && speed > capV + 1 && vf > 0) ? 1.1 + (lever && speed > capV + 1 ? 3 : 0) : 0;
  const aRes = 0.18 + 0.00022 * speed * speed + sg.drag * Math.min(1, speed / 10) + over + coast + (c.glueT > 0 ? 4 : 0);

  if (c.airborne) {
    // ---- airborne: ballistic, light air control on yaw
    c.airT += dt;
    c.vy -= G * dt;
    c.r = lerp(c.r, inp.steer * 0.9, dt * 1.5);
    c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
    c.h = wrapAngle(c.h + c.r * dt);
    const gy = t.heightAt(c.x, c.z);
    c.pitchV += (0.18 - c.pitch) * dt * 2;    // nose dips slowly (visual pitch > 0 = nose down)
    c.pitch += c.pitchV * dt;
    if (c.y <= gy) {
      c.landImpact = Math.max(0.1, -c.vy);
      c.y = gy; c.vy = 0; c.airborne = false; c.lastAir = c.airT;
      if (c.airT > 0.35) c.nitro = Math.min(st.nitroCap, c.nitro + Math.min(1, c.airT * 0.5));
      c.airT = 0;
      c.pitchV += c.landImpact * 0.08;
      // land facing a little more along velocity (forgiving)
      const vh = Math.atan2(c.vx, -c.vz);
      if (speed > 5 && Math.abs(wrapAngle(vh - c.h)) < 0.5) c.h = wrapAngle(c.h + wrapAngle(vh - c.h) * 0.5);
    }
    updateDerived(c, dt);
    return;
  }

  // ---- grounded: tyre forces (bicycle model)
  const gripMul = st.grip * sg.grip * (c.oilT > 0 ? 0.28 : 1) * (c.bubbleT > 0 ? 0.5 : 1);
  // weight transfer (longitudinal) from the last accel estimate
  const ax = aDrive - aBrake * Math.sign(vf);
  const transfer = clamp((ax * d.cgH) / L / G, -0.25, 0.25);
  const FzF = m * G * (d.b / L - transfer);
  const FzR = m * G * (d.a / L + transfer);

  // handbrake and drift state
  const hb = inp.handbrake && speed > 4;
  const steerFrac = Math.abs(inp.steer);
  // brake-tap drift (accessible without the handbrake): hard steer + brake at speed while on throttle
  const tapDrift = brakeIn > 0.5 && throttleIn > 0.5 && steerFrac > 0.6 && vf > 16;
  let rearTarget = 1;
  if (hb) rearTarget = 0.34;
  else if (tapDrift) rearTarget = 0.5;
  else if (c.drifting) {
    // sustain: while the player holds the slide (throttle + steer), keep the rear light; let go to recover.
    rearTarget = throttleIn > 0.3 && steerFrac > 0.25 ? 0.62 : 1;
  }
  c.rearGrip = approach(c.rearGrip, rearTarget, dt * (rearTarget < c.rearGrip ? 4.5 : 1.6));

  const absV = Math.max(absVf, 0.5);
  const sgnV = vf >= 0 ? 1 : -1;
  const alphaF = Math.atan2(vl + c.r * d.a, absV) - c.steer * sgnV;
  const alphaR = Math.atan2(vl - c.r * d.b, absV);
  const FmaxF = MU * FzF * gripMul;
  let FmaxR = MU * FzR * gripMul * c.rearGrip;
  // friction circle at the driven rear axle
  const FxR = (aDrive - (hb ? 0 : aBrake * 0.4 * sgnV)) * m * 0.5;
  FmaxR = Math.sqrt(Math.max(FmaxR * FmaxR * 0.15, FmaxR * FmaxR - FxR * FxR * 0.5));
  const FyF = -FmaxF * tyre(alphaF / ALPHA_F);
  const FyR = -FmaxR * tyre(alphaR / ALPHA_R);
  const cs = Math.cos(c.steer), sn = Math.sin(c.steer);

  // longitudinal forces along the body (signs: + forward)
  let Fx = m * aDrive - m * aRes * sgnV * Math.min(1, absVf);
  let brakeF = m * aBrake;
  if (hb) brakeF += m * 5.5;
  const FlatF = FyF * cs, FlongF = -FyF * sn;
  Fx += FlongF;
  let Fy = FlatF + FyR;
  // arcade drift helper: in a held drift, push gently forward so the slide keeps its speed
  if (c.drifting && throttleIn > 0.3) Fx += m * Math.min(4.5, Math.abs(c.slip) * 9) * c.throttle * Math.max(0, 1 - speed / (topEff * 0.85));

  let yawT = d.a * FlatF - d.b * FyR;
  // yaw damping (stability) when not drifting
  if (!c.drifting && !hb) yawT -= c.r * I * 1.4 * clamp(speed / 30, 0, 1);
  // oil spin
  if (c.oilT > 0) yawT += c.spinDir * I * 3.2;
  if (c.bubbleT > 0) yawT += c.spinDir * I * 5;

  // integrate velocity in the body frame then convert
  let newVf = vf + (Fx / m) * dt;
  // braking never reverses the direction by itself
  const bdv = (brakeF / m) * dt;
  if (Math.abs(newVf) <= bdv) newVf = reversing ? newVf : 0; else newVf -= Math.sign(newVf) * bdv;
  let newVl = vl + (Fy / m) * dt;
  let newR = c.r + (yawT / I) * dt;

  // low speed: blend toward the kinematic bicycle (no jitter at a stop)
  const k = clamp((speed - 1.5) / 5, 0, 1);
  const rKin = (newVf * Math.tan(c.steer)) / L;
  newR = lerp(rKin, newR, k);
  newVl = newVl * k;

  // drift state + spin protection
  const slip = speed > 3 ? Math.atan2(newVl, Math.abs(newVf)) : 0;
  if (!c.drifting && speed > 11 && Math.abs(slip) > 0.17 && (hb || tapDrift || c.rearGrip < 0.8)) {
    c.drifting = true; c.driftT = 0; c.driftTier = 0;
  }
  if (c.drifting) {
    c.driftT += dt;
    if (speed < 7 || (Math.abs(slip) < 0.07 && c.rearGrip > 0.9) || c.lastImpact > 0.6) {
      if (c.driftT > 0.6) c.driftChain++;
      // mini-turbo: release the tier reached (not after a crash)
      if (c.driftTier > 0 && c.lastImpact <= 0.6) { c.turboOut = c.driftTier; c.boostT = Math.max(c.boostT, [0, 0.55, 0.95, 1.5][c.driftTier] ?? 0); }
      c.drifting = false; c.driftTier = 0;
    } else {
      c.driftTier = c.driftT > 2.6 ? 3 : c.driftT > 1.6 ? 2 : c.driftT > 0.8 ? 1 : 0;
      c.driftScore += Math.abs(slip) * speed * dt * 2;
      c.nitro = Math.min(st.nitroCap, c.nitro + dt * 0.3);
    }
    // keep the slide inside a fun window: past ~55 degrees, pull the nose back toward the travel direction
    // (slip > 0: travel is to the right of the nose, so rotating clockwise (+r) reduces it)
    const maxSlip = 0.95;
    if (Math.abs(slip) > maxSlip) newR += Math.sign(slip) * (Math.abs(slip) - maxSlip) * 40 * dt;
    // counter-steer (steering toward the travel direction) helps catch the slide
    if (Math.sign(inp.steer) === Math.sign(slip) && Math.abs(inp.steer) > 0.2) newR *= 1 - dt * 2.2;
  } else if (!hb && speed > 8) {
    // grip mode: keep body slip small (arcade stability)
    const lim = 0.12 + (1 - c.rearGrip) * 0.6;
    if (Math.abs(slip) > lim) newVl *= 1 - dt * 6 * (Math.abs(slip) - lim) / lim;
  }
  if (c.oilT <= 0 && c.bubbleT <= 0) newR = clamp(newR, -3.2, 3.2);

  c.vx = newVf * fx + newVl * rx;
  c.vz = newVf * fz + newVl * rz;
  c.r = newR;
  c.h = wrapAngle(c.h + c.r * dt);
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.slip = slip;
  c.skid = clamp(Math.max(Math.abs(slip) * 2.2 - 0.15, (hb ? 0.5 : 0) + (aBrake > 20 && speed > 8 ? 0.5 : 0)) * clamp(speed / 10, 0, 1), 0, 1);
  if (c.surface !== SURF.road) c.skid *= 0.5;

  // ---- vertical: follow the ground, launch when it falls away faster than gravity
  // ground vertical speed from the slope along the travel direction (robust to small steps in the height field)
  const gy = t.heightAt(c.x, c.z);
  const sp = Math.hypot(c.vx, c.vz);
  // vertical speed from the slope just travelled (back window); take off when the road ahead falls away faster
  let groundVy = 0, aheadVy = 0;
  if (sp > 0.5) {
    const win = Math.max(1.5, sp * 0.08), k = win / sp;
    groundVy = clamp(((gy - t.heightAt(c.x - c.vx * k, c.z - c.vz * k)) / win) * sp, -25, 25);
    aheadVy = clamp(((t.heightAt(c.x + c.vx * k, c.z + c.vz * k) - gy) / win) * sp, -25, 25);
  }
  if (c.vy > aheadVy + 2.5 && speed > 8 && gy <= c.y + 0.01) {
    c.airborne = true; c.airT = 0;
    c.y = Math.max(gy, c.y + c.vy * dt);
  } else {
    c.vy = groundVy;
    c.y = gy;
  }

  // ---- visual suspension: pitch from accel, roll from lateral accel, ground tilt from terrain
  const aLong = (newVf - vf) / dt;
  const aLat = c.r * newVf;
  const pT = clamp(-aLong * 0.006, -0.08, 0.08), rT = clamp(aLat * 0.007, -0.1, 0.1);
  c.pitchV += ((pT - c.pitch) * 140 - c.pitchV * 16) * dt;
  c.rollV += ((rT - c.roll) * 120 - c.rollV * 14) * dt;
  c.pitch += c.pitchV * dt;
  c.roll += c.rollV * dt;
  const hf = t.heightAt(c.x + fx * d.a, c.z + fz * d.a), hr = t.heightAt(c.x - fx * d.b, c.z - fz * d.b);
  const hR = t.heightAt(c.x + rx * d.track * 0.5, c.z + rz * d.track * 0.5), hL = t.heightAt(c.x - rx * d.track * 0.5, c.z - rz * d.track * 0.5);
  c.gPitch = lerp(c.gPitch, Math.atan2(hf - hr, L), clamp(dt * 20, 0, 1));
  c.gRoll = lerp(c.gRoll, Math.atan2(hR - hL, d.track), clamp(dt * 20, 0, 1));
  updateDerived(c, dt);
}

function updateDerived(c: CarState, dt = 0): void {
  const fx = Math.sin(c.h), fz = -Math.cos(c.h);
  c.vf = c.vx * fx + c.vz * fz;
  c.vl = c.vx * Math.cos(c.h) + c.vz * Math.sin(c.h);
  c.speed = Math.hypot(c.vx, c.vz);
  c.wheelSpin = (c.wheelSpin + (c.vf / c.dims.wheelR) * dt) % (Math.PI * 2);
}

/* ------------------------------------------------------------ collisions */

const tmpContacts: Contact[] = [];

/** Collision circles of a car: front and rear centers (world), radius. */
export function carCircles(c: CarState): [number, number, number, number, number] {
  const off = c.dims.length * 0.27;
  const fx = Math.sin(c.h) * off, fz = -Math.cos(c.h) * off;
  return [c.x + fx, c.z + fz, c.x - fx, c.z - fz, c.dims.width * 0.52];
}

/** Resolve car vs static world. Returns the strongest normal impact speed (m/s). */
export function collideStatic(c: CarState, sw: StaticWorld): number {
  if (c.airborne && c.y - 0 > 6) { /* high in the air: still collide (buildings are tall) */ }
  let worst = 0;
  const [ax, az, bx, bz, r] = carCircles(c);
  const centers: [number, number][] = [[ax, az], [bx, bz]];
  const L = c.dims.a + c.dims.b;
  const I = c.stats.mass * c.dims.a * c.dims.b * 1.05;
  const m = c.stats.mass;
  for (let pass = 0; pass < 2; pass++) {
    for (const [cx0, cz0] of centers) {
      const ox = cx0 - c.x, oz = cz0 - c.z;
      const n = sw.circleContacts(c.x + ox, c.z + oz, r, tmpContacts);
      for (let i = 0; i < n; i++) {
        const k = tmpContacts[i];
        if (!k) continue;
        // positional correction
        c.x += k.nx * k.depth; c.z += k.nz * k.depth;
        // contact point relative to CG
        const px = ox - k.nx * r, pz = oz - k.nz * r;
        const vpx = c.vx - c.r * pz, vpz = c.vz + c.r * px;
        const vn = vpx * k.nx + vpz * k.nz;
        if (vn >= 0) continue;
        const e = 0.18 + clamp(-vn / 60, 0, 0.15);
        const rn = cross2(px, pz, k.nx, k.nz);
        const j = (-(1 + e) * vn) / (1 / m + (rn * rn) / I);
        c.vx += (j * k.nx) / m; c.vz += (j * k.nz) / m;
        c.r += (rn * j) / I * 0.6;
        // tangential: slide along the wall, lose some speed (armor reduces the loss)
        const tx = -k.nz, tz = k.nx;
        const vt = c.vx * tx + c.vz * tz;
        const loss = clamp(-vn / 30, 0, 0.45) * (1 - clamp(c.stats.armor, 0, 0.9));
        c.vx -= tx * vt * loss; c.vz -= tz * vt * loss;
        worst = Math.max(worst, -vn);
        c.impactX = c.x + px; c.impactZ = c.z + pz;
      }
    }
    if (worst === 0) break;
  }
  if (worst > 1.5) { c.lastImpact = Math.max(c.lastImpact, clamp(worst / 15, 0, 1)); c.rearGrip = Math.max(c.rearGrip, 0.85); }
  void L;
  c.speed = Math.hypot(c.vx, c.vz);
  return worst;
}

/** Car vs car (two circles each) with masses. Returns the impact speed or 0. */
/** bBias > 1 makes b yield more (lighter in the contact): the player vs rivals uses it for fairness. */
export function collideCars(a: CarState, b: CarState, bBias = 1): number {
  if (a.ghostT > 0 || b.ghostT > 0) return 0;
  if (Math.abs(a.y - b.y) > 2.2) return 0;
  const dx0 = a.x - b.x, dz0 = a.z - b.z;
  const reach = (a.dims.length + b.dims.length) * 0.5 + 0.5;
  if (dx0 * dx0 + dz0 * dz0 > reach * reach) return 0;
  const ca = carCircles(a), cb = carCircles(b);
  const ra = ca[4], rb = cb[4];
  let worst = 0;
  const Ia = a.stats.mass * a.dims.a * a.dims.b * 1.05, Ib = b.stats.mass * b.dims.a * b.dims.b * 1.05;
  const ima = 1 / a.stats.mass, imb = bBias / b.stats.mass;
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
    const ax = ca[i * 2] as number, az = ca[i * 2 + 1] as number;
    const bx = cb[k * 2] as number, bz = cb[k * 2 + 1] as number;
    let nx = ax - bx, nz = az - bz;
    const d = Math.hypot(nx, nz);
    const rr = ra + rb;
    if (d >= rr || d < 1e-6) continue;
    nx /= d; nz /= d;
    const depth = rr - d;
    const wa = ima / (ima + imb), wb = imb / (ima + imb);
    a.x += nx * depth * wa; a.z += nz * depth * wa;
    b.x -= nx * depth * wb; b.z -= nz * depth * wb;
    const cpx = bx + nx * rb, cpz = bz + nz * rb;
    const pax = cpx - a.x, paz = cpz - a.z, pbx = cpx - b.x, pbz = cpz - b.z;
    const vax = a.vx - a.r * paz, vaz = a.vz + a.r * pax;
    const vbx = b.vx - b.r * pbz, vbz = b.vz + b.r * pbx;
    const vn = (vax - vbx) * nx + (vaz - vbz) * nz;
    if (vn >= 0) continue;
    const rna = cross2(pax, paz, nx, nz), rnb = cross2(pbx, pbz, nx, nz);
    const e = 0.35;
    const j = (-(1 + e) * vn) / (ima + imb + (rna * rna) / Ia + (rnb * rnb) / Ib);
    a.vx += j * nx * ima; a.vz += j * nz * ima; a.r += (rna * j / Ia) * 0.5;
    b.vx -= j * nx * imb; b.vz -= j * nz * imb; b.r -= (rnb * j / Ib) * 0.5;
    worst = Math.max(worst, -vn);
  }
  if (worst > 2) { a.lastImpact = Math.max(a.lastImpact, clamp(worst / 15, 0, 1)); b.lastImpact = Math.max(b.lastImpact, clamp(worst / 15, 0, 1)); }
  return worst;
}

/** Place the car at a pose, standing still (smart reset uses this). */
export function placeCar(c: CarState, x: number, z: number, h: number, t: Terrain): void {
  c.x = x; c.z = z; c.h = h; c.y = t.heightAt(x, z);
  c.vx = c.vz = c.vy = c.r = 0; c.steer = 0; c.airborne = false; c.airT = 0;
  c.drifting = false; c.rearGrip = 1; c.oilT = c.glueT = c.bubbleT = 0; c.gear = 0; c.ghostT = 1.2;
  c.pitch = c.roll = c.pitchV = c.rollV = 0; c.stuckT = 0;
  updateDerived(c);
}

/** Effects applied by items and pads. */
export function applyOil(c: CarState, rng: () => number): void { c.oilT = 1.3; c.spinDir = rng() < 0.5 ? -1 : 1; c.drifting = false; }
export function applyGlue(c: CarState): void { c.glueT = 1.6; }
export function applyBoost(c: CarState, sec: number): void { c.boostT = Math.max(c.boostT, sec); }
export function applyBubble(c: CarState, rng: () => number): void {
  c.bubbleT = 1.1; c.spinDir = rng() < 0.5 ? -1 : 1;
  c.vx *= 0.45; c.vz *= 0.45; c.vy = 6.5; c.airborne = true; c.airT = 0; c.y += 0.05;
}
