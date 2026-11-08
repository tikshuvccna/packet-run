/**
 * City rendering: the static city is cut into 250 m chunks, each merged into a few meshes (ground, road, walls with a
 * window texture, solid details, outlines). Chunks stream in around the camera and are disposed when far.
 */
import * as THREE from 'three';
import { DISTRICTS } from '../drive/contract';
import { hash2 } from '../drive/sim/rng';
import type { Building, City, Prop, RoadEdge, RoadNode } from './city';
import { HALF } from './city';
import { GeoBuilder } from './geo';
import { hullMaterial, textTexture, toon, toonGradient } from './toon';

export const CHUNK = 250;
const NC = Math.ceil((HALF * 2) / CHUNK);

const col = (c: string): THREE.Color => new THREE.Color(c);
function shade(c: THREE.Color, k: number): THREE.Color { return c.clone().multiplyScalar(k); }
function jitter(c: THREE.Color, seed: number, amt = 0.08): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const r = hash2(seed, 7) - 0.5, r2 = hash2(seed, 13) - 0.5;
  return new THREE.Color().setHSL((hsl.h + r * amt * 0.5 + 1) % 1, Math.min(1, Math.max(0, hsl.s + r2 * amt)), Math.min(0.92, Math.max(0.1, hsl.l + r * amt)));
}
/** "Noise" look for districts not yet cleaned: greyer and darker. */
function noisy(c: THREE.Color, dirty: boolean): THREE.Color {
  if (!dirty) return c;
  const g = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  return new THREE.Color(c.r * 0.35 + g * 0.65, c.g * 0.35 + g * 0.65, c.b * 0.35 + g * 0.7).multiplyScalar(0.72);
}

let windowTex: THREE.CanvasTexture | null = null;
function windowTexture(): THREE.CanvasTexture {
  if (windowTex) return windowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e9e6e0'; g.fillRect(0, 0, 128, 10);           // floor band
  g.fillStyle = '#d9d5cc'; g.fillRect(20, 30, 88, 74);           // frame
  g.fillStyle = '#3d4f66'; g.fillRect(26, 36, 76, 62);           // glass
  g.fillStyle = '#6f87a6'; g.fillRect(26, 36, 76, 14);           // sky reflection
  g.fillStyle = '#d9d5cc'; g.fillRect(62, 36, 4, 62);            // mullion
  windowTex = new THREE.CanvasTexture(cv);
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  windowTex.colorSpace = THREE.SRGBColorSpace;
  windowTex.anisotropy = 4;
  return windowTex;
}

interface ChunkBins { buildings: Building[]; props: Prop[]; segs: { e: RoadEdge; t0: number; t1: number }[]; nodes: RoadNode[] }

export class CityMesh {
  readonly group = new THREE.Group();
  private bins: ChunkBins[] = [];
  private live = new Map<number, THREE.Group>();
  private queue: number[] = [];
  private cleaned: Set<number>;
  private outlines: boolean;
  private shadows: boolean;
  private matWalls: THREE.MeshToonMaterial;
  private matSolid: THREE.MeshToonMaterial;
  private matGlow: THREE.MeshToonMaterial;
  private lastKey = '';

  constructor(readonly city: City, cleaned: number[], opts: { outlines: boolean; shadows: boolean }) {
    this.cleaned = new Set(cleaned);
    this.outlines = opts.outlines;
    this.shadows = opts.shadows;
    this.matWalls = toon(0xffffff, { vertexColors: true, map: windowTexture() });
    this.matSolid = toon(0xffffff, { vertexColors: true });
    this.matGlow = toon(0xffffff, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.55 });
    for (let i = 0; i < NC * NC; i++) this.bins.push({ buildings: [], props: [], segs: [], nodes: [] });
    const ci = (x: number, z: number): number => {
      const i = Math.max(0, Math.min(NC - 1, Math.floor((x + HALF) / CHUNK))), j = Math.max(0, Math.min(NC - 1, Math.floor((z + HALF) / CHUNK)));
      return j * NC + i;
    };
    for (const b of city.buildings) this.bins[ci(b.x, b.z)]?.buildings.push(b);
    for (const p of city.props) this.bins[ci(p.x, p.z)]?.props.push(p);
    for (const n of city.nodes) if (n.edges.length) this.bins[ci(n.x, n.z)]?.nodes.push(n);
    for (const e of city.edges) {
      const a = city.nodes[e.a] as RoadNode, b = city.nodes[e.b] as RoadNode;
      const n = Math.max(1, Math.ceil(e.len / 8));
      let cur = -1, t0 = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const c = k < n ? ci(a.x + (b.x - a.x) * (t + 0.5 / n), a.z + (b.z - a.z) * (t + 0.5 / n)) : -2;
        if (c !== cur) {
          if (cur >= 0) this.bins[cur]?.segs.push({ e, t0, t1: t });
          cur = c; t0 = t;
        }
      }
    }
    this.buildGlobal();
  }

  setCleaned(cleaned: number[]): void {
    const key = cleaned.slice().sort().join(',');
    if (key === [...this.cleaned].sort().join(',')) return;
    this.cleaned = new Set(cleaned);
    for (const [k, g] of this.live) { this.disposeGroup(g); this.live.delete(k); }
  }

  /** Stream chunks around (x, z) within radius. Builds at most `budget` chunks per call. */
  update(x: number, z: number, radius: number, budget = 2): void {
    const i0 = Math.floor((x - radius + HALF) / CHUNK), i1 = Math.floor((x + radius + HALF) / CHUNK);
    const j0 = Math.floor((z - radius + HALF) / CHUNK), j1 = Math.floor((z + radius + HALF) / CHUNK);
    const want = new Set<number>();
    for (let j = Math.max(0, j0); j <= Math.min(NC - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NC - 1, i1); i++) {
      const cx = -HALF + (i + 0.5) * CHUNK, cz = -HALF + (j + 0.5) * CHUNK;
      if (Math.hypot(cx - x, cz - z) < radius + CHUNK * 0.75) want.add(j * NC + i);
    }
    for (const [k, g] of this.live) if (!want.has(k)) {
      const i = k % NC, j = Math.floor(k / NC);
      const cx = -HALF + (i + 0.5) * CHUNK, cz = -HALF + (j + 0.5) * CHUNK;
      if (Math.hypot(cx - x, cz - z) > radius + CHUNK * 1.4) { this.disposeGroup(g); this.live.delete(k); }
    }
    const key = [...want].join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.queue = [...want].filter((k) => !this.live.has(k)).sort((a, b) => {
        const da = Math.hypot(-HALF + ((a % NC) + 0.5) * CHUNK - x, -HALF + (Math.floor(a / NC) + 0.5) * CHUNK - z);
        const db = Math.hypot(-HALF + ((b % NC) + 0.5) * CHUNK - x, -HALF + (Math.floor(b / NC) + 0.5) * CHUNK - z);
        return da - db;
      });
    }
    let n = 0;
    while (this.queue.length && n < budget) {
      const k = this.queue.shift() as number;
      if (this.live.has(k)) continue;
      const g = this.buildChunk(k);
      this.live.set(k, g);
      this.group.add(g);
      n++;
    }
  }
  get pending(): number { return this.queue.length; }

  private disposeGroup(g: THREE.Group): void {
    this.group.remove(g);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }

  /* ------------------------------------------------------------------ chunk build */
  private buildChunk(k: number): THREE.Group {
    const city = this.city;
    const i = k % NC, j = Math.floor(k / NC);
    const x0 = -HALF + i * CHUNK, z0 = -HALF + j * CHUNK;
    const bin = this.bins[k] as ChunkBins;
    const g = new THREE.Group();
    g.name = `chunk${k}`;
    const ground = new GeoBuilder(), road = new GeoBuilder(), walls = new GeoBuilder(), solid = new GeoBuilder(), hull = new GeoBuilder(), glow = new GeoBuilder();
    const dirtyAt = (x: number, z: number): boolean => !this.cleaned.has(city.districtAt(x, z));

    // ---- ground grid
    const STEP = 6.25, n = Math.round(CHUNK / STEP);
    const grassOf = (x: number, z: number): THREE.Color => {
      const d = DISTRICTS[city.districtAt(x, z) - 1];
      const base = col(d ? d.palette.ground : '#8aa070').lerp(col('#86b86a'), 0.45);
      const cz = city.coastZ(x);
      if (z > cz - 70) return noisy(col('#ecd9a0').lerp(base, Math.max(0, Math.min(1, (cz - 70 - z + 25) / 25))), dirtyAt(x, z));
      return noisy(base, dirtyAt(x, z));
    };
    const H: number[] = [], C: THREE.Color[] = [];
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
      const x = x0 + a * STEP, z = z0 + b * STEP;
      const h = city.groundAt(x, z);
      H.push(h);
      let c = grassOf(x, z);
      if (h < -1.2) c = col('#9c8f6e');                       // river bed / sea floor
      const v = 0.94 + hash2(Math.round(x / STEP), Math.round(z / STEP), 3) * 0.08;
      C.push(c.multiplyScalar(v));
    }
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const id = b * (n + 1) + a;
      const P = (aa: number, bb: number): number[] => [x0 + aa * STEP, H[bb * (n + 1) + aa] as number, z0 + bb * STEP];
      const c = C[id] as THREE.Color;
      ground.quad(P(a, b + 1), P(a + 1, b + 1), P(a + 1, b), P(a, b), c);
    }

    // ---- roads
    const asphaltAv = col('#4b505c'), asphaltSt = col('#585d68'), side = col('#cfc8b8'), curb = col('#a9a396');
    const white = col('#f4f1e8'), yellow = col('#f2c94c');
    const lift = 0.07;
    for (const sg of bin.segs) {
      const e = sg.e;
      const a = city.nodes[e.a] as RoadNode, b = city.nodes[e.b] as RoadNode;
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, rx = -uz, rz = ux;
      const hw = e.width / 2;
      const dirty = dirtyAt((a.x + b.x) / 2, (a.z + b.z) / 2);
      const asp = noisy(e.avenue ? asphaltAv : asphaltSt, dirty);
      const steps = Math.max(1, Math.ceil(((sg.t1 - sg.t0) * e.len) / 8));
      const trimA = (a.round ? a.round + 5 : 11), trimB = (b.round ? b.round + 5 : 11);
      for (let q = 0; q < steps; q++) {
        const t0 = sg.t0 + ((sg.t1 - sg.t0) * q) / steps, t1 = sg.t0 + ((sg.t1 - sg.t0) * (q + 1)) / steps;
        const s0 = t0 * e.len, s1 = t1 * e.len;
        const px = (s: number, o: number): number => a.x + ux * s + rx * o, pz = (s: number, o: number): number => a.z + uz * s + rz * o;
        const y = (s: number, o: number): number => city.heightAt(px(s, o), pz(s, o)) - (e.ramp ? rampLocal(city, px(s, o), pz(s, o)) : 0) + lift;
        const V = (s: number, o: number, dy = 0): number[] => [px(s, o), y(s, o) + dy, pz(s, o)];
        road.quad(V(s0, hw), V(s1, hw), V(s1, -hw), V(s0, -hw), asp);
        // sidewalks + curbs (not in tunnels/bridges, trimmed at nodes)
        const sa = Math.max(s0, trimA), sb = Math.min(s1, e.len - trimB);
        if (!e.tunnel && !e.bridge && sb > sa) {
          for (const sd of [-1, 1]) {
            const o0 = sd * hw, o1 = sd * (hw + 3);
            const q0 = sd > 0 ? [V(sa, o1, 0.16), V(sb, o1, 0.16), V(sb, o0, 0.16), V(sa, o0, 0.16)] : [V(sa, o0, 0.16), V(sb, o0, 0.16), V(sb, o1, 0.16), V(sa, o1, 0.16)];
            road.quad(q0[0]!, q0[1]!, q0[2]!, q0[3]!, noisy(side, dirty));
            // curb face
            const f = sd > 0 ? [V(sa, o0, 0), V(sb, o0, 0), V(sb, o0, 0.16), V(sa, o0, 0.16)] : [V(sb, o0, 0), V(sa, o0, 0), V(sa, o0, 0.16), V(sb, o0, 0.16)];
            road.quad(f[1]!, f[0]!, f[3]!, f[2]!, curb);
          }
        }
        // markings
        const mlift = 0.02;
        const dash = (o: number, w: number, c: THREE.Color, len: number, gap: number): void => {
          for (let s = Math.ceil(s0 / (len + gap)) * (len + gap); s < s1; s += len + gap) {
            const e0 = s, e1 = Math.min(s + len, s1);
            if (e0 < trimA + 2 || e1 > e.len - trimB - 2) continue;
            road.quad(V(e0, o + w, mlift), V(e1, o + w, mlift), V(e1, o - w, mlift), V(e0, o - w, mlift), c);
          }
        };
        if (e.avenue) {
          dash(0.25, 0.12, yellow, 1000, 0); dash(-0.25, 0.12, yellow, 1000, 0);
          dash(4.5, 0.12, white, 3, 6); dash(-4.5, 0.12, white, 3, 6);
        } else dash(0, 0.13, white, 3, 5);
        // zebra crossings near nodes
        for (const [s, nn] of [[trimA - 3.5, a], [e.len - trimB + 3.5, b]] as [number, RoadNode][]) {
          if (nn.round || s < s0 || s >= s1 || !e.avenue) continue;
          for (let o = -hw + 1; o < hw - 1; o += 1.6) road.quad(V(s - 2, o + 0.55, mlift), V(s + 2, o + 0.55, mlift), V(s + 2, o - 0.25, mlift), V(s - 2, o - 0.25, mlift), white);
        }
        // tunnel tube
        if (e.tunnel) {
          for (const sd of [-1, 1]) {
            const o = sd * (hw + 0.6);
            const wall = sd > 0 ? [V(s0, o, 0), V(s1, o, 0), V(s1, o, 6.5), V(s0, o, 6.5)] : [V(s1, o, 0), V(s0, o, 0), V(s0, o, 6.5), V(s1, o, 6.5)];
            solid.quad(wall[1]!, wall[0]!, wall[3]!, wall[2]!, col('#8d7f6e'));
            if (q % 2 === 0) glow.box(px((s0 + s1) / 2, sd * (hw - 0.2)), y((s0 + s1) / 2, 0) + 5.6, pz((s0 + s1) / 2, sd * (hw - 0.2)), 2, 0.25, 0.5, Math.atan2(uz, ux), col('#ffe9a8'));
          }
          solid.quad(V(s1, hw + 0.6, 6.5), V(s0, hw + 0.6, 6.5), V(s0, -hw - 0.6, 6.5), V(s1, -hw - 0.6, 6.5), col('#7a6d5e'));
        }
      }
    }
    for (const nd of bin.nodes) {
      const hwMax = Math.max(...nd.edges.map((id) => (city.edges[id]?.width ?? 11) / 2));
      const y = city.heightAt(nd.x, nd.z) + lift - 0.005;
      const dirty = dirtyAt(nd.x, nd.z);
      if (nd.round) {
        const R = nd.round + 5, seg = 32;
        for (let q = 0; q < seg; q++) {
          const a0 = (q / seg) * Math.PI * 2, a1 = ((q + 1) / seg) * Math.PI * 2;
          road.tri(nd.x, y, nd.z, nd.x + Math.cos(a1) * R, y, nd.z + Math.sin(a1) * R, nd.x + Math.cos(a0) * R, y, nd.z + Math.sin(a0) * R, ...rgb(noisy(asphaltAv, dirty)));
        }
        const ir = nd.round * 0.55;
        solid.cyl(nd.x, y - 0.1, nd.z, ir + 0.4, ir + 0.4, 0.4, 32, curb);
        solid.cyl(nd.x, y + 0.29, nd.z, ir, ir, 0.05, 32, noisy(col('#7fbf6a'), dirty));
        if (nd.round < 20) { solid.blob(nd.x, y + 1.2, nd.z, ir * 0.5, 1.2, ir * 0.5, col('#5aa05a')); solid.cyl(nd.x, y + 0.3, nd.z, 0.5, 0.4, 5, 8, col('#cfc8b8')); }
      } else {
        const e0 = city.edges[nd.edges[0] as number] as RoadEdge;
        const o = city.nodes[e0.a === nd.id ? e0.b : e0.a] as RoadNode;
        const rot = Math.atan2(o.z - nd.z, o.x - nd.x);
        road.box(nd.x, y - 0.3, nd.z, hwMax * 2 + 0.2, 0.3, hwMax * 2 + 0.2, rot, noisy(asphaltAv, dirty), { noBottom: true });
      }
    }

    // ---- buildings
    for (const b of bin.buildings) this.building(b, walls, solid, hull, glow, dirtyAt(b.x, b.z));
    // ---- props
    for (const p of bin.props) this.prop(p, solid, hull, glow, dirtyAt(p.x, p.z));

    const add = (gb: GeoBuilder, mat: THREE.Material, shadow: boolean, receive: boolean): void => {
      if (gb.empty) return;
      const m = new THREE.Mesh(gb.build(), mat);
      m.castShadow = shadow && this.shadows; m.receiveShadow = receive && this.shadows;
      m.matrixAutoUpdate = false;
      g.add(m);
    };
    add(ground, this.matSolid, false, true);
    add(road, this.matSolid, false, true);
    add(walls, this.matWalls, true, true);
    add(solid, this.matSolid, true, true);
    add(glow, this.matGlow, false, false);
    if (this.outlines) add(hull, hullMaterial(), false, false);
    return g;
  }

  private building(b: Building, walls: GeoBuilder, solid: GeoBuilder, hull: GeoBuilder, glow: GeoBuilder, dirty: boolean): void {
    const d = DISTRICTS[b.district - 1] ?? DISTRICTS[0]!;
    const pal = d.palette;
    const wall = noisy(jitter(col(pal.wall), b.seed, 0.12), dirty), roof = noisy(jitter(col(pal.roof), b.seed + 1, 0.08), dirty), acc = noisy(jitter(col(pal.accent), b.seed + 2, 0.06), dirty);
    const y0 = b.base - 2, top = b.base + b.h;
    const r = b.rot, c = Math.cos(r), s = Math.sin(r);
    // local helpers: front face is local -z when (fx,fz) = -(local z axis)... compute which local z side faces the street
    const lzFront = (b.fx * -s + b.fz * c) < 0 ? -1 : 1;     // sign of local z for the front
    const at = (lx: number, lz: number): [number, number] => [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
    const H = b.h + 2;
    const ol = 0.25;
    const outline = (cx: number, cz: number, w: number, h: number, dd: number, yb: number): void => { if (this.outlines) hull.box(cx, yb - ol, cz, w + ol * 2, h + ol * 2, dd + ol * 2, r, 0x000000, { noBottom: true }); };
    const fr = (lx: number, y: number, w: number, h: number, depth: number, color: THREE.Color, g: GeoBuilder = solid): void => {
      const [x, z] = at(lx, lzFront * (b.d / 2 + depth / 2));
      g.box(x, y, z, w, h, depth, r, color);
    };
    switch (b.style) {
      case 'warehouse': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: roof, wallUv: 6 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        // sawtooth roof
        const nT = Math.max(2, Math.round(b.w / 9));
        for (let k = 0; k < nT; k++) {
          const lx = -b.w / 2 + (k + 0.5) * (b.w / nT);
          const [x, z] = at(lx, 0);
          solid.gable(x, top, z, b.d - 1, b.w / nT - 0.6, 2.4, r + Math.PI / 2, roof, wall);
        }
        fr(0, b.base, Math.min(8, b.w * 0.4), Math.min(6, b.h * 0.6), 0.4, shade(acc, 0.9));
        fr(0, b.base + b.h * 0.75, b.w * 0.9, 0.8, 0.3, acc);
        break;
      }
      case 'frames': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: roof, wallUv: 4 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        // giant coloured window frames on the front
        const fw = b.w * 0.7, fh = Math.min(b.h * 0.55, 14), fy = b.base + b.h * 0.3;
        fr(0, fy, fw, 0.9, 0.8, acc); fr(0, fy + fh, fw, 0.9, 0.8, acc);
        fr(-fw / 2, fy, 0.9, fh + 0.9, 0.8, acc); fr(fw / 2, fy, 0.9, fh + 0.9, 0.8, acc);
        fr(0, fy + 0.9, fw - 0.9, fh - 0.9, 0.2, col('#2f3e52'), glow);
        solid.box(b.x, top, b.z, b.w + 0.6, 0.6, b.d + 0.6, r, roof);
        break;
      }
      case 'house': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: wall, wallUv: 3 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        solid.gable(b.x, top, b.z, b.w, b.d, Math.min(4.5, b.d * 0.35), r, roof, wall);
        fr(0, b.base, 1.6, 2.6, 0.3, shade(acc, 0.8));
        if (hash2(b.seed, 3) < 0.35) {    // router on the roof (blinking antennae)
          const [x, z] = at(b.w * 0.25, 0);
          solid.box(x, top + 1.2, z, 1.6, 0.5, 1, r, col('#f4f1e8'));
          solid.cyl(x - 0.5 * c, top + 1.7, z - 0.5 * s, 0.06, 0.06, 1.4, 4, col('#3b3f4a'));
          solid.cyl(x + 0.5 * c, top + 1.7, z + 0.5 * s, 0.06, 0.06, 1.4, 4, col('#3b3f4a'));
          glow.box(x, top + 1.45, z, 0.5, 0.1, 1.05, r, col('#7dff9b'));
        } else {
          const [x, z] = at(-b.w * 0.28, 0);
          solid.box(x, top + 0.5, z, 0.9, Math.min(4.5, b.d * 0.35) + 0.6, 0.9, r, shade(roof, 0.8));
        }
        break;
      }
      case 'doors': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: roof, wallUv: 4 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        // row of big coloured "port" doors
        const nd = Math.max(1, Math.floor(b.w / 4.5));
        const palette = [acc, col('#ffd23f'), col('#4a90e2'), col('#e55a4e'), col('#35d3b0')];
        for (let k = 0; k < nd; k++) {
          const lx = -b.w / 2 + (k + 0.5) * (b.w / nd);
          fr(lx, b.base, Math.min(3, b.w / nd - 0.8), 3.6, 0.35, noisy(palette[(k + b.seed) % palette.length] as THREE.Color, dirty));
          fr(lx, b.base + 3.8, 1.4, 0.7, 0.3, col('#f4f1e8'), glow);
        }
        solid.box(b.x, top, b.z, b.w * 0.7, 1.2, b.d * 0.7, r, shade(roof, 0.9));
        break;
      }
      case 'cafe': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: roof, wallUv: 3.5 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        // striped awning
        const nA = Math.max(2, Math.round(b.w / 1.6));
        for (let k = 0; k < nA; k++) {
          const lx = -b.w / 2 + (k + 0.5) * (b.w / nA);
          const [x, z] = at(lx, lzFront * (b.d / 2 + 1.2));
          solid.box(x, b.base + 3.2, z, b.w / nA, 0.25, 2.4, r, k % 2 ? col('#ffffff') : acc);
        }
        // speech bubble sign on the roof
        const [x, z] = at(0, 0);
        solid.blob(x, top + 2.6, z, 2.4, 1.7, 0.9, col('#ffffff'));
        solid.cyl(x - 1 * c, top + 0.4, z - 1 * s, 0.2, 0.7, 1.4, 5, col('#ffffff'));
        glow.box(x, top + 2.4, z, 2.2, 0.35, 1.9, r, acc);
        break;
      }
      case 'garden': {
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, wall, { top: col('#6fb36a'), wallUv: 3.5 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        for (let k = 0; k < 3; k++) { const [x, z] = at((k - 1) * b.w * 0.28, 0); solid.blob(x, top + 0.8, z, 1.4, 1, 1.4, col('#4f9a52')); }
        // lock emblem on the front
        const [x, z] = at(0, lzFront * (b.d / 2 + 0.3));
        solid.box(x, b.base + b.h * 0.45, z, 2.2, 1.8, 0.5, r, acc);
        solid.cyl(x, b.base + b.h * 0.45 + 1.8, z, 0.75, 0.75, 1.0, 8, col('#c0c8d0'), false);
        break;
      }
      case 'tower': {
        const t1 = b.h * 0.55;
        walls.box(b.x, y0, b.z, b.w, t1 + 2, b.d, r, wall, { top: roof, wallUv: 4 });
        walls.box(b.x, b.base + t1, b.z, b.w * 0.75, b.h - t1, b.d * 0.75, r, wall, { top: roof, wallUv: 4 });
        outline(b.x, b.z, b.w, t1 + 2, b.d, y0);
        outline(b.x, b.z, b.w * 0.75, b.h - t1, b.d * 0.75, b.base + t1);
        // big glowing screen on the front + antenna
        const [x, z] = at(0, lzFront * (b.d * 0.375 + 0.3));
        glow.box(x, b.base + t1 + 2, z, b.w * 0.55, Math.min(8, (b.h - t1) * 0.5), 0.4, r, acc);
        const [ax, az] = at(0, 0);
        solid.cyl(ax, top, az, 0.25, 0.08, 7, 5, col('#c0c8d0'));
        glow.box(ax, top + 7, az, 0.6, 0.6, 0.6, r, col('#ff5a5a'));
        break;
      }
      default: {   // special sites: garages, shop, fuel
        const kitAcc = b.kit.includes('lesson06') ? col('#ffd23f') : b.kit.includes('lesson07') ? col('#4ad6c8') : b.kit.includes('lesson08') ? col('#ff7f6e') : b.kit.includes('shop') ? col('#9b59d0') : b.kit.includes('fuel') ? col('#7fd957') : col('#ff9a3c');
        walls.box(b.x, y0, b.z, b.w, H, b.d, r, col('#f4ecd8'), { top: shade(kitAcc, 0.8), wallUv: 4 });
        outline(b.x, b.z, b.w, H, b.d, y0);
        fr(0, b.base, b.w * 0.6, Math.min(5.5, b.h * 0.6), 0.4, col('#5b6270'));
        for (let k = 0; k < 6; k++) fr(0, b.base + 0.6 + k * 0.85, b.w * 0.58, 0.12, 0.45, col('#7c8494'));
        fr(0, b.base + b.h - 1, b.w + 0.6, 1.4, 0.6, kitAcc);
        if (b.kit.includes('lesson07')) {   // academy tower: 7 glowing floors
          for (let k = 0; k < 7; k++) glow.box(b.x, b.base + 4 + k * 4.2, b.z, b.w + 0.4, 0.6, b.d + 0.4, r, new THREE.Color().setHSL(k / 7, 0.8, 0.6));
        }
        if (b.kit.includes('fuel')) {
          const [x, z] = at(0, lzFront * (b.d / 2 + 6));
          solid.box(x, b.base + 5, z, b.w + 4, 0.8, 8, r, kitAcc);
          for (const sx of [-1, 1]) { const [px, pz] = at(sx * b.w * 0.3, lzFront * (b.d / 2 + 6)); solid.cyl(px, b.base, pz, 0.35, 0.35, 5, 8, col('#f4f1e8')); }
        }
      }
    }
  }

  private prop(p: Prop, solid: GeoBuilder, hull: GeoBuilder, glow: GeoBuilder, dirty: boolean): void {
    const y = p.y, s = p.s;
    const leaf = noisy(col(['#5aa05a', '#6cb04f', '#4f9a6a', '#78b84f'][Math.floor(hash2(Math.round(p.x), Math.round(p.z)) * 4)] ?? '#5aa05a'), dirty);
    const trunk = col('#8a6a4a');
    const hullBlob = (x: number, yy: number, z: number, rx: number, ry: number, rz: number): void => { if (this.outlines) hull.blob(x, yy, z, rx + 0.18, ry + 0.18, rz + 0.18, 0x000000); };
    switch (p.kind) {
      case 'tree':
        solid.cyl(p.x, y, p.z, 0.3 * s, 0.22 * s, 2.6 * s, 6, trunk);
        solid.blob(p.x, y + 3.6 * s, p.z, 2.2 * s, 2.0 * s, 2.2 * s, leaf, 0.12, p.x);
        hullBlob(p.x, y + 3.6 * s, p.z, 2.2 * s, 2.0 * s, 2.2 * s);
        break;
      case 'tree2':
        solid.cyl(p.x, y, p.z, 0.3 * s, 0.2 * s, 2 * s, 6, trunk);
        solid.cyl(p.x, y + 1.5 * s, p.z, 2.0 * s, 0.1, 3.2 * s, 7, shade(leaf, 0.9));
        solid.cyl(p.x, y + 3.4 * s, p.z, 1.5 * s, 0.1, 2.6 * s, 7, leaf);
        break;
      case 'tree3':
        solid.cyl(p.x, y, p.z, 0.25 * s, 0.2 * s, 3 * s, 6, trunk);
        solid.blob(p.x - 0.8 * s, y + 3.2 * s, p.z, 1.4 * s, 1.3 * s, 1.4 * s, leaf, 0.15, p.z);
        solid.blob(p.x + 0.8 * s, y + 3.8 * s, p.z + 0.4, 1.5 * s, 1.4 * s, 1.5 * s, shade(leaf, 1.08), 0.15, p.x);
        hullBlob(p.x + 0.8 * s, y + 3.8 * s, p.z + 0.4, 1.5 * s, 1.4 * s, 1.5 * s);
        break;
      case 'palm':
        solid.cyl(p.x, y, p.z, 0.28, 0.2, 5.5 * s, 6, col('#a07a50'));
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + p.rot;
          solid.blob(p.x + Math.cos(a) * 1.6, y + 5.4 * s, p.z + Math.sin(a) * 1.6, 1.8, 0.25, 0.7, leaf);
        }
        break;
      case 'bush': solid.blob(p.x, y + 0.6, p.z, 1.2 * s, 0.8 * s, 1.2 * s, leaf, 0.15, p.x); break;
      case 'hedge': solid.box(p.x, y, p.z, 6 * s, 1.6, 1.4, p.rot, shade(leaf, 0.9)); break;
      case 'rock': solid.blob(p.x, y + 0.4, p.z, 1.6 * s, 1.0 * s, 1.3 * s, col('#a59e93'), 0.2, p.x); break;
      case 'lamp': {
        solid.cyl(p.x, y, p.z, 0.12, 0.09, 6, 6, col('#3b3f4a'));
        const ax = p.x + Math.cos(p.rot + Math.PI / 2) * 1.2, az = p.z + Math.sin(p.rot + Math.PI / 2) * 1.2;
        solid.box((p.x + ax) / 2, y + 5.9, (p.z + az) / 2, 0.15, 0.15, 1.3, p.rot, col('#3b3f4a'));
        glow.box(ax, y + 5.7, az, 0.5, 0.2, 0.8, p.rot, col('#fff2c4'));
        break;
      }
      case 'bench': solid.box(p.x, y + 0.45, p.z, 1.8, 0.15, 0.6, p.rot, col('#a07a50')); solid.box(p.x, y, p.z, 1.6, 0.45, 0.2, p.rot, col('#3b3f4a')); break;
      case 'barrel': solid.cyl(p.x, y, p.z, 0.4, 0.4, 1.0, 8, col('#3f8f93')); break;
      case 'crate': solid.box(p.x, y, p.z, 1.1, 1.1, 1.1, p.rot, col('#c9a66b')); break;
      case 'container': {
        const cs = ['#e55a4e', '#4a90e2', '#f2b134', '#35d3b0', '#9b59d0', '#ff9a3c'];
        for (let k = 0; k < 3; k++) solid.box(p.x, y + k * 2.6, p.z, 12, 2.6, 2.5, p.rot, noisy(col(cs[(p.color + k * 2) % cs.length] ?? '#e55a4e'), dirty));
        if (this.outlines) hull.box(p.x, y - 0.2, p.z, 12.4, 8.2, 2.9, p.rot, 0x000000, { noBottom: true });
        break;
      }
      case 'crane': {
        const yel = col('#f2c94c');
        for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) solid.box(p.x + dx!, y, p.z + dz!, 0.5, 18, 0.5, 0, yel);
        solid.box(p.x, y + 18, p.z, 5, 1.2, 5, 0, yel);
        solid.box(p.x, y + 19.2, p.z + 6, 1.4, 1.4, 26, 0, yel);
        solid.box(p.x, y + 19.6, p.z - 3, 3, 2, 3, 0, col('#e55a4e'));
        solid.cyl(p.x, y + 8, p.z + 14, 0.05, 0.05, 11, 3, col('#3b3f4a'));
        break;
      }
      case 'reel':
        solid.cyl(p.x, y, p.z, 4, 4, 0.8, 16, col('#c9a66b'));
        solid.cyl(p.x, y + 0.8, p.z, 2.6, 2.6, 3.2, 16, col('#2b2f3a'));
        solid.cyl(p.x, y + 4.0, p.z, 4, 4, 0.8, 16, col('#c9a66b'));
        break;
      case 'statue': solid.box(p.x, y, p.z, 2, 1.5, 2, p.rot, col('#cfc8b8')); solid.blob(p.x, y + 3, p.z, 1.2, 1.5, 1.2, col('#58c46a')); break;
      case 'lock':
        solid.box(p.x, y, p.z, 3.6, 3.2, 1.6, p.rot, col('#ffb84a'));
        solid.cyl(p.x, y + 3.2, p.z, 1.3, 1.3, 1.8, 10, col('#c0c8d0'), false);
        solid.box(p.x, y + 1.4, p.z, 0.5, 0.9, 1.7, p.rot, col('#3b3f4a'));
        if (this.outlines) hull.box(p.x, y - 0.2, p.z, 4, 3.6, 2, p.rot, 0x000000, { noBottom: true });
        break;
      case 'bubble':
        solid.cyl(p.x, y, p.z, 0.3, 0.3, 2.5, 6, col('#cfc8b8'));
        solid.blob(p.x, y + 4, p.z, 2.6, 1.8, 0.8, col('#ffffff'));
        glow.blob(p.x - 0.9, y + 4, p.z - 0.6, 0.3, 0.3, 0.3, col('#3e4486'));
        glow.blob(p.x, y + 4, p.z - 0.6, 0.3, 0.3, 0.3, col('#3e4486'));
        glow.blob(p.x + 0.9, y + 4, p.z - 0.6, 0.3, 0.3, 0.3, col('#3e4486'));
        break;
      case 'screen':
        solid.cyl(p.x, y, p.z, 0.3, 0.3, 4, 6, col('#3b3f4a'));
        glow.box(p.x, y + 4, p.z, 6, 3.4, 0.4, p.rot, col('#4ad6c8'));
        break;
      case 'router':
        solid.box(p.x, y, p.z, 3, 1.2, 2, p.rot, col('#f4f1e8'));
        solid.cyl(p.x - 1, y + 1.2, p.z, 0.08, 0.08, 2.4, 4, col('#3b3f4a'));
        solid.cyl(p.x + 1, y + 1.2, p.z, 0.08, 0.08, 2.4, 4, col('#3b3f4a'));
        glow.box(p.x, y + 0.6, p.z, 2, 0.15, 2.05, p.rot, col('#7dff9b'));
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ global (whole-map) pieces */
  private buildGlobal(): void {
    const city = this.city;
    const gl = new THREE.Group();
    // sea + river water: one big plane
    const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 4, HALF * 4, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x3f8fc9, gradientMap: toonGradient(), transparent: true, opacity: 0.88 }));
    water.position.y = -1.6;
    water.name = 'water';
    gl.add(water);
    const solid = new GeoBuilder(), glow = new GeoBuilder(), hull = new GeoBuilder();
    // bridges
    for (const br of city.bridges) {
      const c = Math.cos(br.rot), s = Math.sin(br.rot);
      solid.box(br.x, -1.2, br.z, br.len, 1.25, br.width, br.rot, col('#b9b2a4'), { noBottom: true });
      for (const sd of [-1, 1]) {
        const ox = -s * (br.width / 2) * sd, oz = c * (br.width / 2) * sd;
        solid.box(br.x + ox, 0, br.z + oz, br.len, 1.1, 0.5, br.rot, col('#e55a4e'));
        // arch
        for (let k = 0; k < 12; k++) {
          const t0 = k / 12, t1 = (k + 1) / 12;
          const xA = (t0 - 0.5) * br.len, xB = (t1 - 0.5) * br.len;
          const yA = 1.1 + Math.sin(t0 * Math.PI) * 6, yB = 1.1 + Math.sin(t1 * Math.PI) * 6;
          const mx = (xA + xB) / 2, my = (yA + yB) / 2;
          const len = Math.hypot(xB - xA, yB - yA);
          // approximate each arch piece with a small box (no tilt: stepped arch looks fine in toon)
          solid.box(br.x + mx * c + ox, my - 0.3, br.z + mx * s + oz, len, 0.6, 0.6, br.rot, col('#f4f1e8'));
          if (k % 2 === 0) solid.box(br.x + mx * c + ox, 1.1, br.z + mx * s + oz, 0.25, my - 1.1, 0.25, br.rot, col('#f4f1e8'));
        }
      }
      for (const sd of [-1, 1]) solid.box(br.x + c * br.len * 0.3 * sd, -6, br.z + s * br.len * 0.3 * sd, 2, 5, br.width - 2, br.rot, col('#a59e93'));
    }
    // mountain over the tunnel
    if (city.mountain) {
      const M = city.mountain, c = Math.cos(M.rot), s = Math.sin(M.rot);
      const e = city.edges[M.edge] as RoadEdge;
      const hw = e.width / 2 + 1;
      for (let k = 0; k < 46; k++) {
        const a = hash2(k, 1, 9) * Math.PI * 2, rr = Math.sqrt(hash2(k, 2, 9));
        let lx = Math.cos(a) * M.a * rr, lz = Math.sin(a) * M.b * rr;
        const size = 22 + hash2(k, 3, 9) * 26;
        if (Math.abs(lz) < hw + size * 0.5) lz = Math.sign(lz || 1) * (hw + size * 0.55);
        const x = M.x + lx * c - lz * s, z = M.z + lx * s + lz * c;
        const gy = city.groundAt(x, z);
        const rc = col(['#9c8f7e', '#a89a86', '#8d8273'][k % 3] as string);
        solid.blob(x, gy + size * 0.35, z, size * 0.75, size * (0.7 + hash2(k, 4, 9) * 0.6), size * 0.75, rc, 0.15, k);
        if (k % 3 === 0) solid.blob(x, gy + size * 1.05, z, size * 0.35, size * 0.25, size * 0.35, col('#f4f6f8'), 0.1, k);
        lx = 0;
      }
      // roof slab over the tube + portals
      const a = city.nodes[e.a] as RoadNode, b = city.nodes[e.b] as RoadNode;
      const gyM = city.heightAt(M.x, M.z);
      solid.box(M.x, gyM + 6.5, M.z, M.a * 2 + 10, 14, e.width + 30, M.rot, col('#9c8f7e'), { noBottom: true });
      for (const sd of [-1, 1]) {
        const px = M.x + c * (M.a + 4) * sd, pz = M.z + s * (M.a + 4) * sd;
        const py = city.heightAt(px, pz);
        solid.box(px, py + 6.5, pz, 2, 2.4, e.width + 6, M.rot, col('#e55a4e'));
        for (const sw of [-1, 1]) solid.box(px - s * (hw + 1.5) * sw, py, pz + c * (hw + 1.5) * sw, 2, 8.9, 2, M.rot, col('#e55a4e'));
      }
      void a; void b;
    }
    // ramps (striped wedges)
    for (const rp of city.ramps) {
      const fx = Math.sin(rp.h), fz = -Math.cos(rp.h), rx = Math.cos(rp.h), rz = Math.sin(rp.h);
      const base = city.groundAt(rp.x, rp.z) + 0.03;
      const P = (along: number, lat: number, up: number): number[] => [rp.x + fx * (along - rp.len / 2) + rx * lat, base + up, rp.z + fz * (along - rp.len / 2) + rz * lat];
      const stripes = 6;
      for (let k = 0; k < stripes; k++) {
        const a0 = (k / stripes) * rp.len, a1 = ((k + 1) / stripes) * rp.len;
        const h0 = (a0 / rp.len) * rp.height, h1 = (a1 / rp.len) * rp.height;
        const cc = k % 2 ? col('#2b2f3a') : col('#ffd23f');
        solid.quad(P(a0, rp.w / 2, h0), P(a1, rp.w / 2, h1), P(a1, -rp.w / 2, h1), P(a0, -rp.w / 2, h0), cc);
      }
      solid.quad(P(rp.len, -rp.w / 2, 0), P(rp.len, rp.w / 2, 0), P(rp.len, rp.w / 2, rp.height), P(rp.len, -rp.w / 2, rp.height), col('#e55a4e'));
      for (const sd of [-1, 1]) {
        const a = P(0, sd * rp.w / 2, 0), b = P(rp.len, sd * rp.w / 2, 0), c2 = P(rp.len, sd * rp.w / 2, rp.height);
        const cc = rgb(col('#e55a4e'));
        if (sd > 0) solid.tri(a[0]!, a[1]!, a[2]!, c2[0]!, c2[1]!, c2[2]!, b[0]!, b[1]!, b[2]!, ...cc); else solid.tri(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c2[0]!, c2[1]!, c2[2]!, ...cc);
      }
    }
    // landmark tower on the central island: seven glowing layers
    const L = city.landmark;
    if (L.r > 0) {
      const y = city.heightAt(L.x, L.z) + 0.3;
      solid.cyl(L.x, y, L.z, L.r * 0.7, L.r * 0.6, 3, 24, col('#f4f1e8'));
      for (let k = 0; k < 7; k++) {
        const rr = L.r * (0.55 - k * 0.05);
        const c = col(DISTRICTS[k]?.palette.accent ?? '#ffffff');
        solid.cyl(L.x, y + 3 + k * 6, L.z, rr, rr * 0.95, 4.4, 20, col('#f4f1e8'));
        glow.cyl(L.x, y + 7.4 + k * 6, L.z, rr * 1.04, rr * 1.0, 1.6, 20, c);
      }
      solid.cyl(L.x, y + 45, L.z, 0.5, 0.1, 14, 6, col('#c0c8d0'));
      glow.blob(L.x, y + 59, L.z, 1.4, 1.4, 1.4, col('#ffd23f'));
      if (this.outlines) hull.cyl(L.x, y + 2.8, L.z, L.r * 0.58, L.r * 0.25, 44, 20, 0x000000, false);
    }
    const mk = (gb: GeoBuilder, m: THREE.Material, shadow: boolean): void => {
      if (gb.empty) return;
      const mesh = new THREE.Mesh(gb.build(), m);
      mesh.castShadow = shadow && this.shadows; mesh.receiveShadow = this.shadows;
      gl.add(mesh);
    };
    mk(solid, this.matSolid, true);
    mk(glow, this.matGlow, false);
    // signs over special buildings (Hebrew canvas textures)
    for (const p of city.pois) {
      if (p.kind === 'race' || p.kind === 'secret') continue;
      const b = city.buildings.find((q) => q.style === 'special' && Math.hypot(q.x - p.x, q.z - p.z) < 60);
      if (!b) continue;
      const tex = textTexture(p.label, { bg: '#1b1f2a', fg: '#ffd23f', border: '#ffd23f' });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w, 16), Math.min(b.w, 16) / 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(b.x + b.fx * (b.d / 2 + 0.8), b.base + b.h + 2.6, b.z + b.fz * (b.d / 2 + 0.8));
      sign.rotation.y = Math.atan2(b.fx, b.fz);
      gl.add(sign);
    }
    this.group.add(gl);
  }
}

function rgb(c: THREE.Color): [number, number, number] { return [c.r, c.g, c.b]; }
/** Height contributed by a ramp at a point (to keep the road surface flat under ramps). */
function rampLocal(city: City, x: number, z: number): number { return city.heightAt(x, z) - city.groundAt(x, z) > 0.2 ? city.heightAt(x, z) - city.groundAt(x, z) : 0; }
