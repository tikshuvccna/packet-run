/**
 * Deterministic procedural open city (pure, no three). About 2.8 x 2.8 km of roads inside a 3 x 3 km world.
 * Jittered street grid with straight avenues every third line, roundabouts, a river with bridges, a tunnel through a
 * mountain in the hills, a beach and sea on the south, rolling hills in the west. Seven districts (Voronoi on fixed
 * centers). Buildings on lots around every block, props, ramps, pickups, POIs (garages, shop, fuel, races) and RaceDefs.
 */
import { DISTRICTS, type Poi, type RaceDef, type Vec2 } from '../drive/contract';
import { SURF, type Terrain } from '../drive/sim/car';
import { clamp, headingOf, segDist, smoothstep, wrapAngle } from '../drive/sim/math';
import { Rng } from '../drive/sim/rng';
import { StaticWorld, TAG } from '../drive/sim/statics';

export const HALF = 1500;
const N = 13, S = 230, ORIGIN = -1380;
const RIVER_HALF = 22;
const AVENUE_W = 18, STREET_W = 11;
const RASTER = 4;

export interface RoadNode { id: number; x: number; z: number; gi: number; gj: number; round: number; edges: number[]; district: number }
export interface RoadEdge { id: number; a: number; b: number; avenue: boolean; width: number; bridge: boolean; tunnel: boolean; ramp: boolean; len: number; district: number }
export type BuildingStyle = 'warehouse' | 'frames' | 'house' | 'doors' | 'cafe' | 'garden' | 'tower' | 'special';
export interface Building {
  id: number; x: number; z: number; w: number; d: number; h: number; rot: number; district: number;
  style: BuildingStyle; kit: string; seed: number; base: number;
  /** unit vector (x,z) of the front face (toward the street) */
  fx: number; fz: number;
}
export type PropKind = 'tree' | 'tree2' | 'tree3' | 'lamp' | 'bush' | 'rock' | 'bench' | 'barrel' | 'crate' | 'hedge' | 'container' | 'crane' | 'statue' | 'lock' | 'bubble' | 'screen' | 'reel' | 'router' | 'palm';
export interface Prop { kind: PropKind; x: number; z: number; y: number; rot: number; s: number; color: number }
export interface Ramp { x: number; z: number; h: number; len: number; w: number; height: number }
export interface Pickup { id: string; kind: 'coin' | 'parcel' | 'nitro' | 'item'; x: number; z: number; y: number }
export interface Mountain { x: number; z: number; a: number; b: number; rot: number; edge: number }

export interface City extends Terrain {
  seed: number;
  nodes: RoadNode[];
  edges: RoadEdge[];
  buildings: Building[];
  props: Prop[];
  ramps: Ramp[];
  pickups: Pickup[];
  pois: Poi[];
  races: RaceDef[];
  river: Vec2[];
  riverHalf: number;
  mountain: Mountain | null;
  bridges: { x: number; z: number; rot: number; len: number; width: number }[];
  landmark: { x: number; z: number; r: number };
  spawn: { x: number; z: number; heading: number };
  coastZ(x: number): number;
  /** terrain without bridges and ramps (for the ground mesh) */
  groundAt(x: number, z: number): number;
  districtAt(x: number, z: number): number;
  nearestRoad(x: number, z: number, heading?: number): { x: number; z: number; heading: number; edge: number; t: number; d: number };
  edgeAt(x: number, z: number): number;
  onRoad(x: number, z: number, margin?: number): boolean;
}

/* ---------------------------------------------------------------- districts */
const CENTERS: [number, number][] = [
  [250, 960], [-950, 820], [-1000, -650], [0, 40], [-40, -1060], [1000, -800], [1060, 360],
];

/* ---------------------------------------------------------------- helpers */
function lineIntersect(p1x: number, p1z: number, d1x: number, d1z: number, p2x: number, p2z: number, d2x: number, d2z: number): [number, number] {
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return [p1x, p1z];
  const t = ((p2x - p1x) * d2z - (p2z - p1z) * d2x) / den;
  return [p1x + d1x * t, p1z + d1z * t];
}
function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}

export function generateCity(seed: number): City {
  const rng = new Rng(seed * 7919 + 13);
  const ph = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  const centers = CENTERS.map(([x, z]) => [x + rng.range(-50, 50), z + rng.range(-50, 50)] as [number, number]);
  const districtAt = (x: number, z: number): number => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i] as [number, number];
      const w = i === 3 ? 0.92 : 1;   // the central district is a little smaller
      const d = Math.hypot(x - c[0], z - c[1]) / w;
      if (d < bd) { bd = d; best = i; }
    }
    return best + 1;
  };
  const coastPh = rng.range(0, 6.28);
  const coastZ = (x: number): number => 1262 + 45 * Math.sin(x / 260 + coastPh) + 20 * Math.sin(x / 97 + coastPh * 2);

  // river polyline (north -> sea)
  const rj = (): number => rng.range(-35, 35);
  const river: Vec2[] = [
    { x: -430 + rj(), z: -1600 }, { x: -470 + rj(), z: -1000 }, { x: -380 + rj(), z: -560 }, { x: -470 + rj(), z: -60 },
    { x: -380 + rj(), z: 420 }, { x: -450 + rj(), z: 900 }, { x: -360, z: 1600 },
  ];
  const riverDist = (x: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i] as Vec2, b = river[i + 1] as Vec2;
      if (z < Math.min(a.z, b.z) - 300 || z > Math.max(a.z, b.z) + 300) continue;
      const d = segDist(x, z, a.x, a.z, b.x, b.z).d;
      if (d < best) best = d;
    }
    return best;
  };
  const crossesRiver = (ax: number, az: number, bx: number, bz: number): boolean => {
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i] as Vec2, b = river[i + 1] as Vec2;
      if (segIntersect(ax, az, bx, bz, a.x, a.z, b.x, b.z)) return true;
    }
    return false;
  };

  /* ---------------- terrain (hills in district 3, gentle rolls in 6) */
  const c3 = centers[2] as [number, number], c6 = centers[5] as [number, number];
  const baseTerrain = (x: number, z: number): number => {
    const m3 = 1 - smoothstep(520, 860, Math.hypot(x - c3[0], z - c3[1]));
    const m6 = 1 - smoothstep(380, 700, Math.hypot(x - c6[0], z - c6[1]));
    let h = 0;
    if (m3 > 0) {
      const n = Math.sin(x / 170 + (ph[0] ?? 0)) * Math.sin(z / 205 + (ph[1] ?? 0)) * 0.65 + Math.sin(x / 83 + z / 121 + (ph[2] ?? 0)) * 0.35;
      h += m3 * (15 + 13 * n);
    }
    if (m6 > 0) h += m6 * (3 + 3 * Math.sin(x / 140 + (ph[3] ?? 0)) * Math.cos(z / 160));
    const rd = riverDist(x, z);
    h *= smoothstep(RIVER_HALF + 30, RIVER_HALF + 170, rd);
    return h;
  };

  /* ---------------- road nodes */
  const grid: (RoadNode | null)[] = new Array(N * N).fill(null);
  const nodes: RoadNode[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let x = ORIGIN + i * S + (i % 3 !== 0 ? rng.range(-30, 30) : 0);
    let z = ORIGIN + j * S + (j % 3 !== 0 ? rng.range(-30, 30) : 0);
    if (z > coastZ(x) - 75) continue;
    // keep nodes out of the river: slide sideways
    const rd = riverDist(x, z);
    if (rd < RIVER_HALF + 34) {
      const dir = riverDist(x + 1, z) > rd ? 1 : -1;
      for (let k = 0; k < 120 && riverDist(x, z) < RIVER_HALF + 40; k++) x += dir * 2;
    }
    const n: RoadNode = { id: nodes.length, x, z, gi: i, gj: j, round: 0, edges: [], district: districtAt(x, z) };
    nodes.push(n);
    grid[j * N + i] = n;
  }
  const at = (i: number, j: number): RoadNode | null => (i < 0 || j < 0 || i >= N || j >= N ? null : grid[j * N + i] ?? null);

  /* ---------------- edges */
  let edges: RoadEdge[] = [];
  const addEdge = (a: RoadNode, b: RoadNode, avenue: boolean): void => {
    const cross = crossesRiver(a.x, a.z, b.x, b.z);
    if (cross && !avenue && rng.next() > 0.5) return;
    if (!cross && !avenue && rng.next() < 0.1) return;   // a few missing streets = irregular blocks
    edges.push({ id: edges.length, a: a.id, b: b.id, avenue, width: avenue ? AVENUE_W : STREET_W, bridge: cross, tunnel: false, ramp: false, len: Math.hypot(b.x - a.x, b.z - a.z), district: districtAt((a.x + b.x) / 2, (a.z + b.z) / 2) });
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const n = at(i, j);
    if (!n) continue;
    const e = at(i + 1, j);
    if (e) addEdge(n, e, j % 3 === 0);
    const s = at(i, j + 1);
    if (s) addEdge(n, s, i % 3 === 0);
  }

  /* ---------------- tunnel + mountain: a horizontal street edge in the hills */
  let mountain: Mountain | null = null;
  {
    let best: RoadEdge | null = null, bd = Infinity;
    for (const e of edges) {
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      if (e.bridge || a.gj !== b.gj || e.avenue) continue;
      const d = Math.hypot((a.x + b.x) / 2 - (c3[0] - 120), (a.z + b.z) / 2 - (c3[1] - 330));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const a = nodes[best.a] as RoadNode, b = nodes[best.b] as RoadNode;
      best.tunnel = true;
      mountain = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, a: Math.min(95, best.len / 2 - 22), b: 100, rot: Math.atan2(b.z - a.z, b.x - a.x), edge: best.id };
    }
  }

  /* ---------------- connectivity: keep the largest component */
  const adj = (): void => { for (const n of nodes) n.edges = []; for (const e of edges) { (nodes[e.a] as RoadNode).edges.push(e.id); (nodes[e.b] as RoadNode).edges.push(e.id); } };
  adj();
  {
    const comp = new Int32Array(nodes.length).fill(-1);
    let bestC = -1, bestSize = 0;
    for (const n of nodes) {
      if (comp[n.id] !== -1 || n.edges.length === 0) continue;
      const stack = [n.id]; comp[n.id] = n.id; let size = 0;
      while (stack.length) {
        const id = stack.pop() as number; size++;
        for (const eid of (nodes[id] as RoadNode).edges) {
          const e = edges[eid] as RoadEdge;
          const o = e.a === id ? e.b : e.a;
          if (comp[o] === -1) { comp[o] = n.id; stack.push(o); }
        }
      }
      if (size > bestSize) { bestSize = size; bestC = n.id; }
    }
    edges = edges.filter((e) => comp[e.a] === bestC);
    edges.forEach((e, i) => (e.id = i));
    if (mountain) { const me = edges.findIndex((e) => e.tunnel); mountain.edge = me; if (me < 0) mountain = null; }
    for (const n of nodes) if (comp[n.id] !== bestC) { n.edges = []; grid[n.gj * N + n.gi] = null; }
    adj();
  }
  const liveNode = (n: RoadNode | null): n is RoadNode => !!n && n.edges.length > 0;

  /* ---------------- roundabouts: the center, plus a few avenue crossings */
  const center = at(6, 6);
  if (center && center.edges.length >= 3) center.round = 30;
  const avx = nodes.filter((n) => n.gi % 3 === 0 && n.gj % 3 === 0 && n.edges.length === 4 && n !== center && !n.edges.some((e) => (edges[e] as RoadEdge).tunnel));
  rng.shuffle(avx);
  for (const n of avx.slice(0, 3)) n.round = 16;

  /* ---------------- rasters: base height, surface */
  const RN = Math.ceil((HALF * 2) / RASTER) + 1;
  const hRaster = new Float32Array(RN * RN);
  const sRaster = new Uint8Array(RN * RN);
  for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
    const x = -HALF + i * RASTER, z = -HALF + j * RASTER;
    let h = baseTerrain(x, z);
    let s: number = SURF.grass;
    const rd = riverDist(x, z);
    if (rd < RIVER_HALF + 12) { h = -6 + 6 * smoothstep(RIVER_HALF - 4, RIVER_HALF + 12, rd); if (rd < RIVER_HALF) s = SURF.water; }
    const cz = coastZ(x);
    if (z > cz - 70) { s = s === SURF.water ? s : SURF.sand; }
    if (z > cz) { h = Math.min(h, -(z - cz) * 0.06); if (z > cz + 12) s = SURF.water; }
    hRaster[j * RN + i] = h;
    sRaster[j * RN + i] = s;
  }
  const rawHeight = (x: number, z: number): number => {
    const fx = clamp((x + HALF) / RASTER, 0, RN - 1.001), fz = clamp((z + HALF) / RASTER, 0, RN - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = j * RN + i;
    const h00 = hRaster[k] ?? 0, h10 = hRaster[k + 1] ?? 0, h01 = hRaster[k + RN] ?? 0, h11 = hRaster[k + RN + 1] ?? 0;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  // roads onto the surface raster (and edge lookup raster)
  const eRaster = new Int32Array(RN * RN).fill(-1);
  const markRoad = (e: RoadEdge): void => {
    const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
    const hw = e.width / 2 + 1;
    const x0 = Math.min(a.x, b.x) - hw, x1 = Math.max(a.x, b.x) + hw, z0 = Math.min(a.z, b.z) - hw, z1 = Math.max(a.z, b.z) + hw;
    for (let j = Math.floor((z0 + HALF) / RASTER); j <= Math.ceil((z1 + HALF) / RASTER); j++) for (let i = Math.floor((x0 + HALF) / RASTER); i <= Math.ceil((x1 + HALF) / RASTER); i++) {
      if (i < 0 || j < 0 || i >= RN || j >= RN) continue;
      const x = -HALF + i * RASTER, z = -HALF + j * RASTER;
      const d = segDist(x, z, a.x, a.z, b.x, b.z).d;
      if (d <= hw) { sRaster[j * RN + i] = SURF.road; eRaster[j * RN + i] = e.id; }
    }
  };
  edges.forEach(markRoad);
  for (const n of nodes) {
    if (!liveNode(n)) continue;
    const r = n.round ? n.round + 2 : AVENUE_W / 2 + 2;
    for (let j = Math.floor((n.z - r + HALF) / RASTER); j <= Math.ceil((n.z + r + HALF) / RASTER); j++) for (let i = Math.floor((n.x - r + HALF) / RASTER); i <= Math.ceil((n.x + r + HALF) / RASTER); i++) {
      if (i < 0 || j < 0 || i >= RN || j >= RN) continue;
      if (Math.hypot(-HALF + i * RASTER - n.x, -HALF + j * RASTER - n.z) <= r) sRaster[j * RN + i] = SURF.road;
    }
  }
  // smooth the terrain under roads a little so the asphalt never has bumps (average along the edge)
  for (const e of edges) {
    const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
    if (e.bridge) continue;
    void a; void b;
  }

  /* ---------------- bridges */
  const bridges: City['bridges'] = [];
  for (const e of edges) {
    if (!e.bridge) continue;
    const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
    // span: every sample of the edge that is over the channel (+ margin)
    let t0 = 1, t1 = 0;
    for (let t = 0; t <= 1; t += 0.005) {
      if (riverDist(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) < RIVER_HALF + 14) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    }
    if (t1 < t0) { t0 = 0.45; t1 = 0.55; }
    const tm = (t0 + t1) / 2;
    bridges.push({ x: a.x + (b.x - a.x) * tm, z: a.z + (b.z - a.z) * tm, rot: Math.atan2(b.z - a.z, b.x - a.x), len: (t1 - t0) * e.len + 10, width: e.width + 2 });
  }
  const onBridge = (x: number, z: number): boolean => {
    for (const br of bridges) {
      const dx = x - br.x, dz = z - br.z;
      const c = Math.cos(br.rot), s = Math.sin(br.rot);
      if (Math.abs(dx * c + dz * s) <= br.len / 2 && Math.abs(-dx * s + dz * c) <= br.width / 2) return true;
    }
    return false;
  };

  /* ---------------- ramps (jump spots): middle of some streets + beach */
  const ramps: Ramp[] = [];
  {
    const cands = edges.filter((e) => !e.avenue && !e.bridge && !e.tunnel && e.len > 180);
    rng.shuffle(cands);
    for (const e of cands.slice(0, 9)) {
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      const dir = rng.next() < 0.5;
      const [p, q] = dir ? [a, b] : [b, a];
      const t = 0.32;
      const h = headingOf(q.x - p.x, q.z - p.z);
      ramps.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, h, len: 12, w: 6.5, height: 2.3 });
      e.ramp = true;
    }
    // beach jumps
    for (let k = 0; k < 3; k++) {
      const x = -100 + k * 420 + rng.range(-60, 60);
      ramps.push({ x, z: coastZ(x) - 40, h: Math.PI / 2 * (k % 2 ? 1 : -1), len: 12, w: 7, height: 2.6 });
    }
  }
  const rampHeight = (x: number, z: number): number => {
    for (const r of ramps) {
      const dx = x - r.x, dz = z - r.z;
      if (dx * dx + dz * dz > 100) continue;
      const fx = Math.sin(r.h), fz = -Math.cos(r.h);
      const along = dx * fx + dz * fz + r.len / 2;   // 0 at the low end
      const lat = dx * Math.cos(r.h) + dz * Math.sin(r.h);
      if (along >= 0 && along <= r.len && Math.abs(lat) <= r.w / 2) return (along / r.len) * r.height;
    }
    return 0;
  };

  const heightAt = (x: number, z: number): number => {
    let h = rawHeight(x, z);
    if (h < 0 && onBridge(x, z)) h = 0;
    return h + rampHeight(x, z);
  };
  const surfaceAt = (x: number, z: number): number => {
    const i = Math.round((x + HALF) / RASTER), j = Math.round((z + HALF) / RASTER);
    if (i < 0 || j < 0 || i >= RN || j >= RN) return SURF.grass;
    const s = sRaster[j * RN + i] ?? SURF.grass;
    if (s === SURF.water && onBridge(x, z)) return SURF.road;
    return s;
  };
  const edgeAt = (x: number, z: number): number => {
    const i = Math.round((x + HALF) / RASTER), j = Math.round((z + HALF) / RASTER);
    if (i < 0 || j < 0 || i >= RN || j >= RN) return -1;
    return eRaster[j * RN + i] ?? -1;
  };

  /* ---------------- statics */
  const statics = new StaticWorld(1600, 32);
  // world boundary
  const B = HALF - 10;
  statics.addWall(-B, -B, B, -B, 4, TAG.edge); statics.addWall(B, -B, B, B, 4, TAG.edge);
  statics.addWall(B, B, -B, B, 4, TAG.edge); statics.addWall(-B, B, -B, -B, 4, TAG.edge);
  // sea wall a little into the water
  for (let x = -B; x < B; x += 12) statics.addWall(x, coastZ(x) + 14, x + 12, coastZ(x + 12) + 14, 2, TAG.rail);
  // river rails (gaps at bridges): sample along the river
  for (let i = 0; i < river.length - 1; i++) {
    const a = river[i] as Vec2, b = river[i + 1] as Vec2;
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (let s = 0; s < len; s += 10) {
      for (const side of [-1, 1]) {
        const off = RIVER_HALF + 7;
        const px = a.x + ux * s - uz * off * side, pz = a.z + uz * s + ux * off * side;
        const qx = px + ux * 10.5, qz = pz + uz * 10.5;
        if (pz > coastZ(px) + 10) continue;
        let gap = false;
        for (const br of bridges) if (Math.hypot((px + qx) / 2 - br.x, (pz + qz) / 2 - br.z) < br.width / 2 + RIVER_HALF + 14) {
          // inside the bridge corridor? (distance to the bridge axis line)
          const c = Math.cos(br.rot), sn = Math.sin(br.rot);
          const lat = -((px + qx) / 2 - br.x) * sn + ((pz + qz) / 2 - br.z) * c;
          if (Math.abs(lat) < br.width / 2 + 1.5) gap = true;
        }
        if (!gap) statics.addWall(px, pz, qx, qz, 1.2, TAG.rail);
      }
    }
  }
  // bridge side rails
  for (const br of bridges) {
    const c = Math.cos(br.rot), s = Math.sin(br.rot);
    for (const side of [-1, 1]) {
      const ox = -s * (br.width / 2 + 0.4) * side, oz = c * (br.width / 2 + 0.4) * side;
      statics.addWall(br.x - c * br.len / 2 + ox, br.z - s * br.len / 2 + oz, br.x + c * br.len / 2 + ox, br.z + s * br.len / 2 + oz, 0.8, TAG.rail);
    }
  }
  // roundabout islands
  for (const n of nodes) if (n.round) statics.addCircle(n.x, n.z, n.round * 0.55, TAG.island);
  // mountain
  if (mountain) {
    const M = mountain, c = Math.cos(M.rot), s = Math.sin(M.rot);
    const e = edges[M.edge] as RoadEdge;
    const hw = e.width / 2 + 1.5;
    for (let k = 0; k < 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      const lx = Math.cos(t) * M.a, lz = Math.sin(t) * M.b;
      if (Math.abs(lz) < hw + 7) continue;
      statics.addCircle(M.x + lx * c - lz * s, M.z + lx * s + lz * c, 9, TAG.rock);
    }
    for (const side of [-1, 1]) {
      const ox = -s * (hw + 1) * side, oz = c * (hw + 1) * side;
      statics.addBox(M.x + ox, M.z + oz, M.a * 2 + 8, 2, M.rot, TAG.rock);
    }
  }
  const inMountain = (x: number, z: number, margin: number): boolean => {
    if (!mountain) return false;
    const dx = x - mountain.x, dz = z - mountain.z, c = Math.cos(mountain.rot), s = Math.sin(mountain.rot);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    return (lx / (mountain.a + margin)) ** 2 + (lz / (mountain.b + margin)) ** 2 < 1;
  };

  /* ---------------- nearest road */
  const edgeGrid = new Map<number, number[]>();
  const EG = 100;
  const egKey = (i: number, j: number): number => i * 1000 + j;
  for (const e of edges) {
    const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
    for (let j = Math.floor(Math.min(a.z, b.z) / EG) - 1; j <= Math.floor(Math.max(a.z, b.z) / EG) + 1; j++)
      for (let i = Math.floor(Math.min(a.x, b.x) / EG) - 1; i <= Math.floor(Math.max(a.x, b.x) / EG) + 1; i++) {
        const k = egKey(i, j);
        let l = edgeGrid.get(k);
        if (!l) edgeGrid.set(k, (l = []));
        l.push(e.id);
      }
  }
  const nearestRoad = (x: number, z: number, heading?: number): ReturnType<City['nearestRoad']> => {
    let best: RoadEdge | null = null, bd = Infinity, bt = 0;
    for (let ring = 0; ring < 6 && !best; ring++) {
      const ci = Math.floor(x / EG), cj = Math.floor(z / EG);
      for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
        for (const id of edgeGrid.get(egKey(i, j)) ?? []) {
          const e = edges[id] as RoadEdge, a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
          const r = segDist(x, z, a.x, a.z, b.x, b.z);
          if (r.d < bd) { bd = r.d; best = e; bt = r.t; }
        }
      }
    }
    if (!best) return { x: 0, z: 0, heading: 0, edge: -1, t: 0, d: Infinity };
    const a = nodes[best.a] as RoadNode, b = nodes[best.b] as RoadNode;
    let h = headingOf(b.x - a.x, b.z - a.z);
    if (heading !== undefined && Math.abs(wrapAngle(heading - h)) > Math.PI / 2) h = wrapAngle(h + Math.PI);
    return { x: a.x + (b.x - a.x) * bt, z: a.z + (b.z - a.z) * bt, heading: h, edge: best.id, t: bt, d: bd };
  };
  const onRoad = (x: number, z: number, margin = 0): boolean => {
    const e = edgeAt(x, z);
    if (e >= 0) {
      const ed = edges[e] as RoadEdge, a = nodes[ed.a] as RoadNode, b = nodes[ed.b] as RoadNode;
      if (segDist(x, z, a.x, a.z, b.x, b.z).d <= ed.width / 2 - margin) return true;
    }
    const r = nearestRoad(x, z);
    const ed = edges[r.edge];
    if (ed && r.d <= ed.width / 2 - margin) return true;
    for (const n of nodes) if (n.edges.length && Math.hypot(n.x - x, n.z - z) < (n.round ? n.round + 4 : AVENUE_W / 2) - margin) return true;
    return false;
  };

  /* ---------------- special sites (garages, shop, fuel): reserved road-side spots */
  interface Site { id: string; kind: Poi['kind']; label: string; lesson?: string; x: number; z: number; bx: number; bz: number; rot: number; fx: number; fz: number; kit: string; w: number; d: number; h: number }
  const sites: Site[] = [];
  const reserved: { x: number; z: number; r: number }[] = [];
  const findSite = (tx: number, tz: number, avoidAvenue = false): { e: RoadEdge; side: number } | null => {
    let best: RoadEdge | null = null, bd = Infinity;
    for (const e of edges) {
      if (e.bridge || e.tunnel || e.ramp || (avoidAvenue && e.avenue)) continue;
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if (reserved.some((r) => Math.hypot(r.x - mx, r.z - mz) < r.r + 40)) continue;
      const d = Math.hypot(mx - tx, mz - tz);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const a = nodes[best.a] as RoadNode, b = nodes[best.b] as RoadNode;
    // choose the side facing the target (or toward the district center)
    const nx = -(b.z - a.z) / best.len, nz = (b.x - a.x) / best.len;
    const side = (tx - (a.x + b.x) / 2) * nx + (tz - (a.z + b.z) / 2) * nz >= 0 ? 1 : -1;
    return { e: best, side };
  };
  const addSite = (id: string, kind: Poi['kind'], label: string, tx: number, tz: number, kit: string, w: number, d: number, h: number, lesson?: string): void => {
    const f = findSite(tx, tz);
    if (!f) return;
    const a = nodes[f.e.a] as RoadNode, b = nodes[f.e.b] as RoadNode;
    const ux = (b.x - a.x) / f.e.len, uz = (b.z - a.z) / f.e.len;
    const nx = -uz * f.side, nz = ux * f.side;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const off = f.e.width / 2;
    const px = mx + nx * (off + 6), pz = mz + nz * (off + 6);
    const bx = mx + nx * (off + 12 + d / 2), bz = mz + nz * (off + 12 + d / 2);
    sites.push({ id, kind, label, lesson, x: px, z: pz, bx, bz, rot: Math.atan2(uz, ux), fx: -nx, fz: -nz, kit, w, d, h });
    reserved.push({ x: (px + bx) / 2, z: (pz + bz) / 2, r: Math.max(w, d) / 2 + 14 });
  };
  const c1 = centers[0] as [number, number], c4 = centers[3] as [number, number], c7 = centers[6] as [number, number], c2 = centers[1] as [number, number];
  addSite('garage_main', 'garage', 'המוסך של דינה', c1[0] - 160, c1[1] - 230, 'bld_garage_main', 26, 20, 9);
  addSite('garage_lesson06', 'lesson', 'מוסך החוקים', c1[0] + 160, c1[1] - 120, 'bld_garage_lesson06', 24, 20, 10, 'lesson06');
  addSite('garage_lesson07', 'lesson', 'מגדל האקדמיה', c4[0] + 150, c4[1] + 260, 'bld_garage_lesson07', 20, 20, 34, 'lesson07');
  addSite('garage_lesson08', 'lesson', 'מחסן המכולות', c7[0] - 300, c7[1] + 160, 'bld_garage_lesson08', 30, 22, 12, 'lesson08');
  addSite('shop_main', 'shop', 'חנות החלקים', c4[0] - 180, c4[1] + 200, 'bld_shop', 22, 16, 8);
  addSite('fuel1', 'fuel', 'תחנת דלק', c1[0] - 420, c1[1] - 60, 'bld_fuel', 22, 14, 6);
  addSite('fuel2', 'fuel', 'תחנת דלק', c2[0] + 200, c2[1] - 250, 'bld_fuel', 22, 14, 6);

  /* ---------------- buildings on lots */
  const buildings: Building[] = [];
  const props: Prop[] = [];
  const edgeBetween = (p: RoadNode, q: RoadNode): RoadEdge | null => {
    for (const id of p.edges) { const e = edges[id] as RoadEdge; if ((e.a === p.id && e.b === q.id) || (e.b === p.id && e.a === q.id)) return e; }
    return null;
  };
  const roundNodes = nodes.filter((n) => n.round > 0);
  const landmarkNode = center && center.round ? center : null;
  const styleOf = (d: number): BuildingStyle => (['warehouse', 'frames', 'house', 'doors', 'cafe', 'garden', 'tower'] as BuildingStyle[])[d - 1] ?? 'doors';
  const blocked = (x: number, z: number, r: number): boolean =>
    reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r) ||
    roundNodes.some((n) => Math.hypot(n.x - x, n.z - z) < n.round + 14 + r) ||
    inMountain(x, z, r + 8) || riverDist(x, z) < RIVER_HALF + 12 + r || z + r > coastZ(x) - 40;

  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
    if (!q.every(liveNode)) continue;
    const Q = q as RoadNode[];
    const cx = Q.reduce((s, n) => s + n.x, 0) / 4, cz = Q.reduce((s, n) => s + n.z, 0) / 4;
    const district = districtAt(cx, cz);
    const style = styleOf(district);
    // side lines offset inward
    const sideE: (RoadEdge | null)[] = [];
    const lines: [number, number, number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const p = Q[k] as RoadNode, n2 = Q[(k + 1) % 4] as RoadNode;
      const e = edgeBetween(p, n2);
      sideE.push(e);
      const len = Math.hypot(n2.x - p.x, n2.z - p.z);
      const ux = (n2.x - p.x) / len, uz = (n2.z - p.z) / len;
      let nx = -uz, nz = ux;
      if ((cx - p.x) * nx + (cz - p.z) * nz < 0) { nx = -nx; nz = -nz; }
      const inset = (e ? e.width / 2 : 3) + 4;
      lines.push([p.x + nx * inset, p.z + nz * inset, ux, uz]);
    }
    const corners: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const l0 = lines[(k + 3) % 4] as [number, number, number, number], l1 = lines[k] as [number, number, number, number];
      corners.push(lineIntersect(l0[0], l0[1], l0[2], l0[3], l1[0], l1[1], l1[2], l1[3]));
    }
    // available depth
    const w01 = Math.hypot((corners[0] as number[])[0]! - (corners[3] as number[])[0]!, (corners[0] as number[])[1]! - (corners[3] as number[])[1]!);
    const w12 = Math.hypot((corners[0] as number[])[0]! - (corners[1] as number[])[0]!, (corners[0] as number[])[1]! - (corners[1] as number[])[1]!);
    const maxDepth = Math.min(w01, w12) / 2 - 3;
    const D = clamp(style === 'house' || style === 'garden' ? rng.range(14, 22) : style === 'warehouse' ? rng.range(24, 38) : rng.range(18, 34), 10, maxDepth);
    for (let k = 0; k < 4; k++) {
      const e = sideE[k];
      const P = corners[k] as [number, number], Qc = corners[(k + 1) % 4] as [number, number];
      const len = Math.hypot(Qc[0] - P[0], Qc[1] - P[1]);
      const ux = (Qc[0] - P[0]) / len, uz = (Qc[1] - P[1]) / len;
      let nx = -uz, nz = ux;
      if ((cx - P[0]) * nx + (cz - P[1]) * nz < 0) { nx = -nx; nz = -nz; }
      if (!e) {
        // park strip with trees/hedges
        for (let s = 10; s < len - 10; s += rng.range(12, 20)) {
          const x = P[0] + ux * s + nx * rng.range(3, D), z = P[1] + uz * s + nz * rng.range(3, D);
          if (!blocked(x, z, 2)) props.push({ kind: rng.pick(['tree', 'tree2', 'tree3', 'bush'] as PropKind[]), x, z, y: 0, rot: rng.range(0, 6.28), s: rng.range(0.8, 1.3), color: district });
        }
        continue;
      }
      const start = k % 2 === 0 ? 0 : D + 2, end = k % 2 === 0 ? len : len - D - 2;
      let s = start;
      while (s < end - 8) {
        let wl = style === 'house' ? rng.range(12, 18) : style === 'warehouse' ? rng.range(24, 42) : style === 'tower' ? rng.range(18, 30) : rng.range(14, 30);
        if (end - s - wl < 10) wl = end - s;
        const gap = rng.range(1.5, 4);
        const bw = wl - gap;
        const setback = style === 'house' || style === 'garden' ? rng.range(3, 6) : rng.range(0, 2);
        const bd = Math.max(8, D - setback - rng.range(0, style === 'house' ? 6 : 3));
        const bx = P[0] + ux * (s + wl / 2) + nx * (setback + bd / 2);
        const bz = P[1] + uz * (s + wl / 2) + nz * (setback + bd / 2);
        s += wl;
        if (bw < 6) continue;
        if (blocked(bx, bz, Math.max(bw, bd) / 2)) continue;
        if ((style === 'house' || style === 'garden') && rng.next() < 0.3) {
          props.push({ kind: style === 'garden' ? 'hedge' : 'tree', x: bx, z: bz, y: 0, rot: Math.atan2(uz, ux), s: 1, color: district });
          continue;
        }
        let h: number;
        switch (style) {
          case 'warehouse': h = rng.range(8, 15); break;
          case 'frames': h = rng.range(12, 30); break;
          case 'house': h = rng.range(5, 8); break;
          case 'doors': h = rng.range(14, 38); break;
          case 'cafe': h = rng.range(7, 16); break;
          case 'garden': h = rng.range(5, 11); break;
          default: h = rng.range(26, 72);
        }
        const kitLetter = 'abcdef'[rng.int(0, 5)] ?? 'a';
        buildings.push({
          id: buildings.length, x: bx, z: bz, w: bw, d: bd, h, rot: Math.atan2(uz, ux), district, style,
          kit: `bld_d${district}_${kitLetter}`, seed: rng.int(0, 1 << 30), base: 0, fx: -nx, fz: -nz,
        });
      }
    }
    // courtyard props
    const inner = Math.max(0, maxDepth - D);
    if (inner > 6) {
      const count = style === 'garden' ? 7 : style === 'house' ? 5 : 3;
      for (let k = 0; k < count; k++) {
        const x = cx + rng.range(-inner, inner) * 0.8, z = cz + rng.range(-inner, inner) * 0.8;
        if (blocked(x, z, 2)) continue;
        let kind: PropKind = rng.pick(['tree', 'tree2', 'tree3', 'bush'] as PropKind[]);
        if (style === 'warehouse' && k === 0) kind = 'container';
        if (style === 'cafe' && k === 0) kind = 'bubble';
        if (style === 'garden' && k < 2) kind = k === 0 ? 'lock' : 'hedge';
        if (style === 'house' && k === 0) kind = 'router';
        if (style === 'tower' && k === 0) kind = 'screen';
        if (style === 'doors' && k === 0) kind = 'statue';
        props.push({ kind, x, z, y: 0, rot: rng.range(0, 6.28), s: rng.range(0.85, 1.25), color: district });
      }
    }
  }
  // special buildings
  for (const st of sites) {
    buildings.push({ id: buildings.length, x: st.bx, z: st.bz, w: st.w, d: st.d, h: st.h, rot: st.rot, district: districtAt(st.bx, st.bz), style: 'special', kit: st.kit, seed: 1, base: 0, fx: st.fx, fz: st.fz });
  }
  for (const b of buildings) {
    // base: the lowest terrain under the footprint (the mesh extends down into the ground)
    let lo = Infinity;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]] as [number, number][]) {
      const px = b.x + (lx * b.w / 2) * c - (lz * b.d / 2) * s, pz = b.z + (lx * b.w / 2) * s + (lz * b.d / 2) * c;
      lo = Math.min(lo, heightAt(px, pz));
    }
    b.base = lo;
    statics.addBox(b.x, b.z, b.w, b.d, b.rot, TAG.building);
  }

  /* ---------------- street props: sidewalk trees and lamps, docks cranes, beach palms */
  for (const e of edges) {
    if (e.tunnel || e.bridge) continue;
    const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
    const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
    const step = e.avenue ? 24 : 32;
    for (let s = 26; s < e.len - 26; s += step) {
      for (const side of [-1, 1]) {
        const off = e.width / 2 + 2.2;
        const x = a.x + ux * s - uz * off * side, z = a.z + uz * s + ux * off * side;
        if (blocked(x, z, 1) && !reserved.every((r) => Math.hypot(r.x - x, r.z - z) > r.r)) continue;
        if (riverDist(x, z) < RIVER_HALF + 10 || z > coastZ(x) - 30 || inMountain(x, z, 4)) continue;
        const lamp = (Math.round(s / step) + (side > 0 ? 1 : 0)) % 2 === 0;
        if (lamp && e.avenue) props.push({ kind: 'lamp', x, z, y: 0, rot: Math.atan2(uz, ux) + (side > 0 ? Math.PI : 0), s: 1, color: e.district });
        else if (!lamp && e.district !== 1 && rng.next() < 0.75) {
          props.push({ kind: e.district === 7 || e.district === 5 ? 'palm' : 'tree', x, z, y: 0, rot: rng.range(0, 6.28), s: rng.range(0.85, 1.15), color: e.district });
          statics.addCircle(x, z, 0.45, TAG.tree);
        } else if (!lamp && rng.next() < 0.25) props.push({ kind: rng.pick(['bench', 'barrel', 'crate', 'bush'] as PropKind[]), x, z, y: 0, rot: Math.atan2(uz, ux), s: 1, color: e.district });
      }
    }
  }
  // docks: cranes and container stacks along the beach; reels
  for (let x = c1[0] - 520; x < c1[0] + 520; x += rng.range(55, 90)) {
    const z = coastZ(x) - 58;
    if (riverDist(x, z) < RIVER_HALF + 20) continue;
    if (onRoad(x, z, -6)) continue;
    const k = rng.next();
    props.push({ kind: k < 0.35 ? 'crane' : k < 0.8 ? 'container' : 'reel', x, z, y: 0, rot: rng.next() < 0.5 ? 0 : Math.PI / 2, s: 1, color: rng.int(0, 5) });
    statics.addCircle(x, z, k < 0.35 ? 3 : 4.2, TAG.building);
  }
  // beach palms and rocks
  for (let x = -B + 40; x < B - 40; x += rng.range(30, 70)) {
    const z = coastZ(x) - rng.range(8, 30);
    if (riverDist(x, z) < RIVER_HALF + 10) continue;
    if (ramps.some((r) => Math.hypot(r.x - x, r.z - z) < 40)) continue;
    const rock = rng.next() < 0.3;
    props.push({ kind: rock ? 'rock' : 'palm', x, z, y: 0, rot: rng.range(0, 6.28), s: rng.range(0.8, 1.4), color: 1 });
    statics.addCircle(x, z, rock ? 1.6 : 0.5, rock ? TAG.rock : TAG.tree);
  }
  for (const p of props) p.y = heightAt(p.x, p.z);

  /* ---------------- pickups: coin lines, hidden parcels, nitro pads */
  const pickups: Pickup[] = [];
  {
    const cands = edges.filter((e) => !e.ramp && e.len > 120);
    rng.shuffle(cands);
    let gid = 0;
    for (const e of cands.slice(0, 70)) {
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      const lane = (rng.next() < 0.5 ? -1 : 1) * e.width * 0.25;
      const s0 = rng.range(40, e.len - 110);
      for (let k = 0; k < 6; k++) {
        const s = s0 + k * 9;
        const x = a.x + ux * s - uz * lane, z = a.z + uz * s + ux * lane;
        pickups.push({ id: `c${gid}_${k}`, kind: 'coin', x, z, y: heightAt(x, z) + 1 });
      }
      gid++;
    }
    // coins on ramp landings
    for (const [ri, r] of ramps.entries()) {
      for (let k = 0; k < 5; k++) {
        const d = 14 + k * 6;
        const x = r.x + Math.sin(r.h) * d, z = r.z - Math.cos(r.h) * d;
        pickups.push({ id: `cr${ri}_${k}`, kind: 'coin', x, z, y: heightAt(x, z) + 3.5 - Math.abs(k - 2) * 0.6 });
      }
    }
    // parcels: hidden in courtyards, on the beach, in the tunnel, by the river
    const spots: [number, number][] = [];
    if (mountain) spots.push([mountain.x, mountain.z]);
    for (let k = 0; k < 40 && spots.length < 14; k++) {
      const p = rng.pick(props.filter((q) => q.kind === 'tree' || q.kind === 'tree2' || q.kind === 'bush' || q.kind === 'palm'));
      const x = p.x + 3, z = p.z + 3;
      if (statics.blocked(x, z, 2) || spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 300)) continue;
      spots.push([x, z]);
    }
    spots.forEach(([x, z], k) => pickups.push({ id: `parcel${k}`, kind: 'parcel', x, z, y: heightAt(x, z) + 1.2 }));
    // nitro pads on avenues
    const av = edges.filter((e) => e.avenue && !e.ramp && !e.bridge && e.len > 150);
    rng.shuffle(av);
    for (const [k, e] of av.slice(0, 22).entries()) {
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      const t = rng.range(0.35, 0.65), lane = (rng.next() < 0.5 ? -1 : 1) * 4;
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      const x = a.x + (b.x - a.x) * t - uz * lane, z = a.z + (b.z - a.z) * t + ux * lane;
      pickups.push({ id: `n${k}`, kind: 'nitro', x, z, y: heightAt(x, z) });
    }
    // item boxes (free roam): rows of 3 across streets
    const ib = edges.filter((e) => !e.ramp && !e.bridge && !e.tunnel && e.len > 150);
    rng.shuffle(ib);
    for (const [k, e] of ib.slice(0, 24).entries()) {
      const a = nodes[e.a] as RoadNode, b = nodes[e.b] as RoadNode;
      const t = rng.range(0.55, 0.7);
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      for (let q = -1; q <= 1; q++) {
        const lane = q * e.width * 0.28;
        const x = a.x + (b.x - a.x) * t - uz * lane, z = a.z + (b.z - a.z) * t + ux * lane;
        pickups.push({ id: `i${k}_${q + 1}`, kind: 'item', x, z, y: heightAt(x, z) + 1.1 });
      }
    }
  }

  /* ---------------- races */
  const races: RaceDef[] = [];
  const usable = (e: RoadEdge | null): boolean => !!e && !e.tunnel;
  const nodeOk = (n: RoadNode | null): n is RoadNode => liveNode(n) && n.round === 0;
  /** a rectangle loop of cells (i0..i1, j0..j1) whose perimeter edges all exist; returns node list or null */
  const rectLoop = (i0: number, j0: number, i1: number, j1: number): RoadNode[] | null => {
    const pts: RoadNode[] = [];
    const push = (i: number, j: number): boolean => { const n = at(i, j); if (!nodeOk(n)) return false; pts.push(n); return true; };
    for (let i = i0; i < i1; i++) if (!push(i, j0)) return null;
    for (let j = j0; j < j1; j++) if (!push(i1, j)) return null;
    for (let i = i1; i > i0; i--) if (!push(i, j1)) return null;
    for (let j = j1; j > j0; j--) if (!push(i0, j)) return null;
    for (let k = 0; k < pts.length; k++) if (!usable(edgeBetween(pts[k] as RoadNode, pts[(k + 1) % pts.length] as RoadNode))) return null;
    return pts;
  };
  const findLoop = (district: number, wi: number, wj: number, avoid: Set<string>): RoadNode[] | null => {
    const c = centers[district - 1] as [number, number];
    const opts: { d: number; p: RoadNode[]; key: string }[] = [];
    for (let j = 0; j + wj < N; j++) for (let i = 0; i + wi < N; i++) {
      const key = `${i},${j},${wi},${wj}`;
      if (avoid.has(key)) continue;
      const p = rectLoop(i, j, i + wi, j + wj);
      if (!p) continue;
      const mx = p.reduce((s, n) => s + n.x, 0) / p.length, mz = p.reduce((s, n) => s + n.z, 0) / p.length;
      opts.push({ d: Math.hypot(mx - c[0], mz - c[1]), p, key });
    }
    opts.sort((a, b) => a.d - b.d);
    const o = opts[0];
    if (!o) return null;
    avoid.add(o.key);
    return o.p;
  };
  /** shortest node path (Dijkstra) between two nodes avoiding roundabouts and the tunnel unless allowed */
  const route = (from: RoadNode, to: RoadNode): RoadNode[] | null => {
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    dist[from.id] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let k = 0; k < nodes.length; k++) if (!done[k] && (dist[k] ?? Infinity) < bd) { bd = dist[k] ?? Infinity; u = k; }
      if (u < 0 || u === to.id) break;
      done[u] = 1;
      for (const eid of (nodes[u] as RoadNode).edges) {
        const e = edges[eid] as RoadEdge;
        const v = e.a === u ? e.b : e.a;
        const vn = nodes[v] as RoadNode;
        if (vn.round && vn !== to) continue;
        const w = e.len * (e.avenue ? 0.9 : 1);
        if (bd + w < (dist[v] ?? Infinity)) { dist[v] = bd + w; prev[v] = u; }
      }
    }
    if (prev[to.id] === -1) return null;
    const out: RoadNode[] = [];
    for (let k = to.id; k !== -1; k = prev[k] ?? -1) out.unshift(nodes[k] as RoadNode);
    return out;
  };
  const nearestNode = (x: number, z: number): RoadNode | null => {
    let best: RoadNode | null = null, bd = Infinity;
    for (const n of nodes) if (nodeOk(n)) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  /** closed loop: start in the middle of the first edge */
  const loopPath = (p: RoadNode[]): Vec2[] => {
    const a = p[0] as RoadNode, b = p[1] as RoadNode;
    const out: Vec2[] = [{ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }];
    for (let k = 1; k < p.length; k++) out.push({ x: (p[k] as RoadNode).x, z: (p[k] as RoadNode).z });
    out.push({ x: a.x, z: a.z });
    return out;
  };
  const openPath = (p: RoadNode[]): Vec2[] => {
    const a = p[0] as RoadNode, b = p[1] as RoadNode;
    const out: Vec2[] = [{ x: a.x + (b.x - a.x) * 0.35, z: a.z + (b.z - a.z) * 0.35 }];
    for (let k = 1; k < p.length; k++) out.push({ x: (p[k] as RoadNode).x, z: (p[k] as RoadNode).z });
    return out;
  };
  const avoid = new Set<string>();
  type Spec = { id: string; he: string; kind: RaceDef['kind']; district: number; w?: [number, number]; to?: number; laps: number; rivals: number; difficulty: number; reward: RaceDef['reward']; timeLimit?: number; gatesEvery?: number };
  const specs: Spec[] = [
    { id: 'r_docks', he: 'מעגל הרציפים', kind: 'circuit', district: 1, w: [2, 1], laps: 2, rivals: 5, difficulty: 0.2, reward: { gold: 60, silver: 35, bronze: 20 }, gatesEvery: 320 },
    { id: 'r_docks_delivery', he: 'משלוח לנמל', kind: 'delivery', district: 1, to: 4, laps: 1, rivals: 0, difficulty: 0.3, reward: { gold: 50, silver: 30, bronze: 15 } },
    { id: 'r_frames', he: 'ספרינט המסגרות', kind: 'sprint', district: 2, to: 1, laps: 1, rivals: 5, difficulty: 0.35, reward: { gold: 70, silver: 40, bronze: 20 }, gatesEvery: 300 },
    { id: 'r_hills', he: 'נגד השעון בגבעות', kind: 'timetrial', district: 3, w: [2, 2], laps: 2, rivals: 0, difficulty: 0.4, reward: { gold: 70, silver: 40, bronze: 20 } },
    { id: 'r_ports_drift', he: 'דריפט בכיכר הפורטים', kind: 'drift', district: 4, w: [1, 1], laps: 3, rivals: 0, difficulty: 0.4, reward: { gold: 70, silver: 40, bronze: 20 }, timeLimit: 75 },
    { id: 'r_sessions_delivery', he: 'משלוח השיחות', kind: 'delivery', district: 5, to: 6, laps: 1, rivals: 0, difficulty: 0.5, reward: { gold: 80, silver: 45, bronze: 25 } },
    { id: 'r_sessions', he: 'מעגל השיחות', kind: 'circuit', district: 5, w: [2, 1], laps: 2, rivals: 6, difficulty: 0.5, reward: { gold: 90, silver: 50, bronze: 25 }, gatesEvery: 300 },
    { id: 'r_cipher_drift', he: 'דריפט בגני הצופן', kind: 'drift', district: 6, w: [1, 2], laps: 2, rivals: 0, difficulty: 0.6, reward: { gold: 90, silver: 50, bronze: 25 }, timeLimit: 80 },
    { id: 'r_apps', he: 'ספרינט השדרה', kind: 'sprint', district: 7, to: 5, laps: 1, rivals: 6, difficulty: 0.65, reward: { gold: 100, silver: 60, bronze: 30 }, gatesEvery: 280 },
    { id: 'r_ports', he: 'מעגל הפורטים', kind: 'circuit', district: 4, w: [2, 2], laps: 2, rivals: 6, difficulty: 0.6, reward: { gold: 100, silver: 55, bronze: 30 }, gatesEvery: 320 },
    { id: 'grandprix', he: 'הגרנד פרי של הרשת', kind: 'circuit', district: 7, w: [3, 2], laps: 3, rivals: 7, difficulty: 0.85, reward: { gold: 250, silver: 120, bronze: 60 }, gatesEvery: 350 },
  ];
  for (const sp of specs) {
    let path: Vec2[] | null = null;
    if (sp.w) {
      let loop = findLoop(sp.district, sp.w[0], sp.w[1], avoid);
      if (!loop) loop = findLoop(sp.district, sp.w[1], sp.w[0], avoid);
      if (!loop) loop = findLoop(sp.district, 1, 1, avoid);
      if (loop) path = loopPath(loop);
    } else if (sp.to) {
      const c = centers[sp.district - 1] as [number, number], d = centers[sp.to - 1] as [number, number];
      const a = nearestNode(c[0] + (d[0] - c[0]) * 0.1, c[1] + (d[1] - c[1]) * 0.1), b = nearestNode(c[0] + (d[0] - c[0]) * 0.75, c[1] + (d[1] - c[1]) * 0.75);
      const r = a && b ? route(a, b) : null;
      if (r && r.length >= 3) path = openPath(r);
    }
    if (!path) continue;
    const len = path.reduce((s, p, k) => (k ? s + Math.hypot(p.x - (path as Vec2[])[k - 1]!.x, p.z - (path as Vec2[])[k - 1]!.z) : 0), 0);
    let timeLimit = sp.timeLimit;
    if (sp.kind === 'delivery') timeLimit = Math.round((len / 24) + 8);
    if (sp.kind === 'timetrial') timeLimit = Math.round((len * sp.laps) / 26);
    races.push({ id: sp.id, he: sp.he, kind: sp.kind, laps: sp.kind === 'sprint' || sp.kind === 'delivery' ? 1 : sp.laps, rivals: sp.rivals, difficulty: sp.difficulty, path, reward: sp.reward, district: sp.district, timeLimit, gatesEvery: sp.gatesEvery ?? 0 });
  }

  /* ---------------- POIs */
  const pois: Poi[] = [];
  for (const st of sites) pois.push({ id: st.id, kind: st.kind, district: districtAt(st.x, st.z), x: st.x, z: st.z, radius: 8, label: st.label, lesson: st.lesson });
  for (const r of races) {
    const p0 = r.path[0] as Vec2;
    pois.push({ id: `race_${r.id}`, kind: 'race', district: r.district, x: p0.x, z: p0.z, radius: 9, label: r.he, race: r });
  }
  // secret spots: the tunnel middle and far beach ends
  if (mountain) pois.push({ id: 'secret_tunnel', kind: 'secret', district: 3, x: mountain.x, z: mountain.z, radius: 6, label: 'מנהרת הסוד' });

  const main = sites.find((s) => s.id === 'garage_main');
  const spawn = main ? { x: main.x - main.fx * 0, z: main.z, heading: headingOf(-main.fx, -main.fz) } : { x: 0, z: 200, heading: 0 };
  if (main) {
    // face along the road, not into the building
    const r = nearestRoad(main.x, main.z);
    spawn.x = r.x; spawn.z = r.z; spawn.heading = r.heading;
  }

  return {
    seed, nodes, edges, buildings, props, ramps, pickups, pois, races, river, riverHalf: RIVER_HALF, mountain, bridges,
    landmark: landmarkNode ? { x: landmarkNode.x, z: landmarkNode.z, r: landmarkNode.round * 0.55 } : { x: 0, z: 0, r: 0 },
    spawn, coastZ, groundAt: rawHeight, districtAt, nearestRoad, edgeAt, onRoad, heightAt, surfaceAt, statics,
  };
}

export const DISTRICT_COUNT = DISTRICTS.length;

const cityCache = new Map<number, City>();
/** Cached city for a seed. Pure (no three): the UI may import this for the minimap and teleports. */
export function buildCity(seed: number): City {
  let c = cityCache.get(seed);
  if (!c) { c = generateCity(seed); cityCache.set(seed, c); }
  return c;
}

/** Road polylines for a minimap: [x0,z0,x1,z1,width] per edge. */
export function roadSegments(c: City): { ax: number; az: number; bx: number; bz: number; w: number; avenue: boolean }[] {
  return c.edges.map((e) => {
    const a = c.nodes[e.a] as RoadNode, b = c.nodes[e.b] as RoadNode;
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, w: e.width, avenue: e.avenue };
  });
}

/** District centres (approximate: mean of their road nodes). */
export function districtCentres(c: City): { id: number; x: number; z: number; he: string }[] {
  return DISTRICTS.map((d) => {
    const ns = c.nodes.filter((n) => n.edges.length && n.district === d.id);
    const x = ns.reduce((s, n) => s + n.x, 0) / Math.max(1, ns.length), z = ns.reduce((s, n) => s + n.z, 0) / Math.max(1, ns.length);
    return { id: d.id, x, z, he: d.he };
  });
}
