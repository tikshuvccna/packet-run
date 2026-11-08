/** Throwable road items: short ballistic flight, slide to rest, then act on cars. Pure. */
import type { ItemId } from '../contract';
import { applyBoost, applyBubble, applyGlue, applyOil, type CarState, G, type Terrain } from './car';

export interface ItemEnt {
  id: number; kind: ItemId; owner: number;
  x: number; z: number; y: number; vx: number; vz: number; vy: number;
  r: number; life: number; age: number; settled: boolean; dead: boolean;
  /** cones: a knocked cone flies and spins */ spin: number; knocked: boolean;
}

export const ITEM_LIFE: Record<ItemId, number> = { oil: 25, cones: 20, glue: 20, boostpad: 30, mine: 30, smoke: 7 };
const ITEM_R: Record<ItemId, number> = { oil: 2.7, cones: 0.45, glue: 2.8, boostpad: 2.3, mine: 1.0, smoke: 7 };

let nextId = 1;
export function resetItemIds(): void { nextId = 1; }

/** Spawn the item(s) behind the car. Returns the new entities. */
export function throwItem(kind: ItemId, c: CarState, t: Terrain, rng: () => number): ItemEnt[] {
  const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = Math.cos(c.h), rz = Math.sin(c.h);
  const back = c.dims.length / 2 + 1.6;
  const out: ItemEnt[] = [];
  const mk = (lat: number, extraBack: number, vlat: number): ItemEnt => {
    const x = c.x - fx * (back + extraBack) + rx * lat, z = c.z - fz * (back + extraBack) + rz * lat;
    return {
      id: nextId++, kind, owner: c.id, x, z, y: Math.max(c.y + 1.2, t.heightAt(x, z) + 0.6),
      vx: c.vx * 0.35 - fx * 3 + rx * vlat, vz: c.vz * 0.35 - fz * 3 + rz * vlat, vy: 3.2,
      r: ITEM_R[kind], life: ITEM_LIFE[kind], age: 0, settled: false, dead: false, spin: 0, knocked: false,
    };
  };
  if (kind === 'cones') {
    for (let k = 0; k < 5; k++) out.push(mk((k - 2) * 1.3, rng() * 1.5, (k - 2) * 1.2));
  } else if (kind === 'boostpad') {
    // the pad boosts its owner right away, and stays on the road for whoever comes next
    applyBoost(c, 1.3);
    out.push(mk(0, 0, 0));
  } else out.push(mk(0, 0, 0));
  return out;
}

/** Item physics + effects on cars. hits: callback(item, car) for sounds/events. */
export function stepItems(items: ItemEnt[], cars: CarState[], t: Terrain, dt: number, rng: () => number, onHit: (it: ItemEnt, c: CarState) => void): void {
  for (const it of items) {
    if (it.dead) continue;
    it.age += dt;
    it.life -= dt;
    if (it.life <= 0) { it.dead = true; continue; }
    // flight / slide
    if (!it.settled || it.knocked) {
      it.vy -= G * dt;
      it.x += it.vx * dt; it.z += it.vz * dt; it.y += it.vy * dt;
      it.spin += dt * (it.knocked ? 12 : 3);
      const gy = t.heightAt(it.x, it.z);
      const floor = gy + (it.kind === 'mine' ? 0.9 : it.kind === 'cones' ? 0.35 : 0.03);
      if (it.y <= floor) {
        it.y = floor;
        it.vy = Math.abs(it.vy) > 2 && it.kind === 'cones' ? -it.vy * 0.3 : 0;
        const fr = Math.max(0, 1 - dt * (it.kind === 'mine' ? 2 : 7));
        it.vx *= fr; it.vz *= fr;
        if (Math.hypot(it.vx, it.vz) < 0.3) { it.vx = it.vz = 0; it.settled = true; it.knocked = false; }
      }
      // walls stop flying things
      if (t.statics.blocked(it.x, it.z, 0.3)) { it.vx *= -0.3; it.vz *= -0.3; }
    }
    if (it.kind === 'smoke') { it.r = 4 + Math.min(4, it.age * 3); continue; }
    // magnetic bubble drifts toward the nearest other car
    if (it.kind === 'mine' && it.age > 0.7) {
      let best: CarState | null = null, bd = 16;
      for (const c of cars) { if (c.id === it.owner && it.age < 4) continue; const d = Math.hypot(c.x - it.x, c.z - it.z); if (d < bd) { bd = d; best = c; } }
      if (best) {
        const d = Math.max(0.1, bd);
        it.vx += ((best.x - it.x) / d) * 14 * dt; it.vz += ((best.z - it.z) / d) * 14 * dt;
        const sp = Math.hypot(it.vx, it.vz);
        if (sp > 9) { it.vx *= 9 / sp; it.vz *= 9 / sp; }
        it.settled = false;
      }
    }
    // contacts with cars
    for (const c of cars) {
      if (c.id === it.owner && it.age < 1.0) continue;
      if (c.ghostT > 0) continue;
      const rr = it.r + c.dims.width * 0.5;
      const dx = c.x - it.x, dz = c.z - it.z;
      if (dx * dx + dz * dz > rr * rr || Math.abs(c.y - it.y) > 2.5) continue;
      switch (it.kind) {
        case 'oil': if (c.oilT <= 0) { applyOil(c, rng); onHit(it, c); } break;
        case 'glue': if (c.glueT <= 0) { applyGlue(c); onHit(it, c); } break;
        case 'boostpad': if (c.boostT <= 0.2) { applyBoost(c, 1.0); onHit(it, c); } break;
        case 'mine': applyBubble(c, rng); it.dead = true; onHit(it, c); break;
        case 'cones':
          if (!it.knocked) {
            it.knocked = true; it.settled = false;
            it.vx = c.vx * 1.15 + (rng() - 0.5) * 4; it.vz = c.vz * 1.15 + (rng() - 0.5) * 4; it.vy = 4 + rng() * 3;
            c.vx *= 0.96; c.vz *= 0.96;
            it.life = Math.min(it.life, 4);
            onHit(it, c);
          }
          break;
        default: break;
      }
    }
  }
  // compact
  for (let i = items.length - 1; i >= 0; i--) if ((items[i] as ItemEnt).dead) items.splice(i, 1);
}

/** Item roll by race position (deterministic given the rng): leaders get defensive items, trailing racers strong ones. */
export function rollItem(place: number, total: number, rng: () => number): ItemId {
  const f = total > 1 ? (place - 1) / (total - 1) : 0.5;   // 0 leader .. 1 last
  const table: [ItemId, number][] = f < 0.34
    ? [['oil', 3], ['cones', 3], ['glue', 2], ['smoke', 1]]
    : f < 0.67
      ? [['glue', 2], ['smoke', 2], ['boostpad', 2], ['oil', 1], ['mine', 1]]
      : [['mine', 3], ['boostpad', 3], ['smoke', 1], ['glue', 1]];
  const sum = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * sum;
  for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
  return (table[0] as [ItemId, number])[0];
}
