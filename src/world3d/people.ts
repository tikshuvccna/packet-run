/**
 * People on the sidewalks: walkers, people standing and chatting, children. Visual only (not part of the sim) and never
 * hit: when a car comes at them they hop out of the way. Six instanced meshes for the whole crowd.
 */
import * as THREE from 'three';
import type { CarState } from '../drive/sim/car';
import type { City, RoadEdge, RoadNode } from './city';
import { toonGradient } from './toon';

interface Ped {
  edge: number; side: number; s: number; dir: number; v: number; off: number; phase: number; wait: number;
  scale: number; skirt: boolean; head: number;   // head: 0 hair, 1 scarf, 2 cap
  ox: number; oz: number; tx: number; tz: number; hop: number; calm: number;
  x: number; z: number; y: number; h: number;
}

const TOPS = ['#e55a4e', '#3f8f93', '#f2b134', '#6a3f73', '#58c46a', '#4a90e2', '#f3e4c4', '#b4553a', '#35d3b0', '#ff7fb0', '#7b8794', '#ffffff'];
const BOTTOMS = ['#2b2f3a', '#3e4486', '#5b6b7a', '#4a3b32', '#1f2b3b', '#6b5b4a'];
const SKIRTS = ['#3e4486', '#6a3f73', '#2b2f3a', '#a94a62', '#2f7d6f', '#5b6b7a', '#b4553a'];
const SKIN = ['#f1c9a5', '#e0ac7e', '#c68a5c', '#8d5a3b', '#f6d7bd'];
const HAIR = ['#2b2118', '#4a3323', '#7a4a26', '#c9a24a', '#1b1b1f', '#9a9a9a'];
const SCARF = ['#f3e4c4', '#b79ae0', '#4ad6c8', '#ff7f6e', '#ffffff', '#3e4486', '#ffd23f'];
const CAPS = ['#2b2f3a', '#e55a4e', '#3f8f93', '#f3e4c4'];

export class People {
  readonly group = new THREE.Group();
  /** called when the player's car makes someone jump aside */
  onScare: (() => void) | null = null;
  private peds: Ped[] = [];
  private leg: THREE.InstancedMesh; private arm: THREE.InstancedMesh; private torso: THREE.InstancedMesh;
  private skirt: THREE.InstancedMesh; private head: THREE.InstancedMesh; private hair: THREE.InstancedMesh; private blob: THREE.InstancedMesh;
  private upkeepT = 0;
  private first = true;
  private base = new THREE.Matrix4(); private loc = new THREE.Matrix4(); private out = new THREE.Matrix4();
  private q = new THREE.Quaternion(); private e = new THREE.Euler(); private p = new THREE.Vector3(); private sc = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private col = new THREE.Color();

  constructor(private city: City, private max: number, shadows: boolean) {
    const mat = (): THREE.MeshToonMaterial => new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    const mk = (g: THREE.BufferGeometry, n: number, cast: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(g, mat(), Math.max(1, n));
      m.frustumCulled = false; m.castShadow = cast && shadows;
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, this.zero); m.setColorAt(i, this.col.set('#ffffff')); }
      this.group.add(m);
      return m;
    };
    // limbs hang from their pivot (hip, shoulder) so they can swing
    this.leg = mk(new THREE.BoxGeometry(0.17, 0.84, 0.19).translate(0, -0.42, 0), max * 2, false);
    this.arm = mk(new THREE.BoxGeometry(0.12, 0.62, 0.13).translate(0, -0.29, 0), max * 2, false);
    this.torso = mk(new THREE.CylinderGeometry(0.2, 0.24, 0.66, 8).scale(1.1, 1, 0.72), max, true);
    this.skirt = mk(new THREE.CylinderGeometry(0.23, 0.36, 0.72, 10).scale(1, 1, 0.8), max, true);
    this.head = mk(new THREE.SphereGeometry(0.175, 12, 9), max, true);
    this.hair = mk(new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), max, false);
    this.blob = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }), Math.max(1, max));
    this.blob.frustumCulled = false; this.blob.renderOrder = 2;
    for (let i = 0; i < max; i++) this.blob.setMatrixAt(i, this.zero);
    this.group.add(this.blob);
  }

  private pos(e: RoadEdge, side: number, s: number, off: number): [number, number, number] {
    const a = this.city.nodes[e.a] as RoadNode, b = this.city.nodes[e.b] as RoadNode;
    const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
    return [a.x + ux * s - uz * off * side, a.z + uz * s + ux * off * side, Math.atan2(ux, -uz)];
  }

  private nearEdges: RoadEdge[] = [];
  private spawn(px: number, pz: number, slot: number): boolean {
    const city = this.city;
    if (!this.nearEdges.length) return false;
    for (let tries = 0; tries < 16; tries++) {
      const e = this.nearEdges[Math.floor(Math.random() * this.nearEdges.length)];
      if (!e) continue;
      const a = city.nodes[e.a] as RoadNode, b = city.nodes[e.b] as RoadNode;
      const ma = (a.round ? a.round + 5 : 11) + 3, mb = (b.round ? b.round + 5 : 11) + 3;
      const s = ma + Math.random() * (e.len - ma - mb);
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = e.width / 2 + 0.75 + Math.random() * 0.75;
      const [x, z] = this.pos(e, side, s, off);
      const d = Math.hypot(x - px, z - pz);
      if (d > 170 || d < (this.first ? 12 : 60)) continue;
      if (city.surfaceAt(x, z) === 3 || z > city.coastZ(x) - 12 || city.statics.blocked(x, z, 0.5)) continue;
      const r = Math.random();
      const kid = r < 0.16, woman = !kid && r < 0.58;
      const girl = kid && Math.random() < 0.5;
      const standing = Math.random() < 0.18;
      const ped: Ped = {
        edge: e.id, side, s, off, dir: Math.random() < 0.5 ? -1 : 1, v: standing ? 0 : (kid ? 1.5 : 1.15) + Math.random() * 0.5, phase: Math.random() * 6, wait: 0,
        scale: kid ? 0.68 + Math.random() * 0.1 : 0.94 + Math.random() * 0.14, skirt: woman || girl, head: woman ? (Math.random() < 0.55 ? 1 : 0) : Math.random() < 0.4 ? 2 : 0,
        ox: 0, oz: 0, tx: 0, tz: 0, hop: 0, calm: 0, x, z, y: 0, h: 0,
      };
      this.peds[slot] = ped;
      const pick = (l: string[]): string => l[Math.floor(Math.random() * l.length)] as string;
      const top = pick(TOPS), skin = pick(SKIN);
      this.torso.setColorAt(slot, this.col.set(top));
      this.skirt.setColorAt(slot, this.col.set(pick(SKIRTS)));
      this.head.setColorAt(slot, this.col.set(skin));
      this.hair.setColorAt(slot, this.col.set(ped.head === 1 ? pick(SCARF) : ped.head === 2 ? pick(CAPS) : pick(HAIR)));
      const bottom = pick(BOTTOMS);
      for (const k of [0, 1]) { this.leg.setColorAt(slot * 2 + k, this.col.set(ped.skirt ? '#2b2f3a' : bottom)); this.arm.setColorAt(slot * 2 + k, this.col.set(top)); }
      for (const m of [this.torso, this.skirt, this.head, this.hair, this.leg, this.arm]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      return true;
    }
    return false;
  }

  private put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, sx = 1, sy = 1, sz = 1): void {
    this.e.set(rx, 0, 0);
    this.loc.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.sc.set(sx, sy, sz));
    this.out.multiplyMatrices(this.base, this.loc);
    mesh.setMatrixAt(i, this.out);
  }

  /** cars: every car near the player (index 0 = the player's). */
  update(dt: number, cars: CarState[], t: number): void {
    const pl = cars[0];
    if (!pl || this.max <= 0) return;
    // upkeep: drop far people, fill the free slots
    this.upkeepT -= dt;
    if (this.upkeepT <= 0) {
      this.upkeepT = 0.6;
      let budget = this.first ? this.max : 6;
      // streets around the player (sidewalks exist only on plain streets)
      this.nearEdges = this.city.edges.filter((e) => {
        if (e.tunnel || e.bridge || e.ramp || e.len < 60) return false;
        const a = this.city.nodes[e.a] as RoadNode, b = this.city.nodes[e.b] as RoadNode;
        return Math.hypot((a.x + b.x) / 2 - pl.x, (a.z + b.z) / 2 - pl.z) < 150 + e.len / 2;
      });
      let free = 0;
      for (let i = 0; i < this.max; i++) if (!this.peds[i]) free++;
      if (free > this.max * 0.6) { budget = this.max; this.first = true; }   // after a teleport: fill at once, also close by
      for (let i = 0; i < this.max; i++) {
        const p = this.peds[i];
        if (p && Math.hypot(p.x - pl.x, p.z - pl.z) > 200) delete this.peds[i];
        if (!this.peds[i] && budget > 0) { budget--; this.spawn(pl.x, pl.z, i); }
      }
      this.first = false;
    }
    const city = this.city;
    for (let i = 0; i < this.max; i++) {
      const p = this.peds[i];
      if (!p) { for (const m of [this.torso, this.skirt, this.head, this.hair, this.blob]) m.setMatrixAt(i, this.zero); for (const k of [0, 1]) { this.leg.setMatrixAt(i * 2 + k, this.zero); this.arm.setMatrixAt(i * 2 + k, this.zero); } continue; }
      const e = city.edges[p.edge] as RoadEdge;
      const a = city.nodes[e.a] as RoadNode, b = city.nodes[e.b] as RoadNode;
      const ma = (a.round ? a.round + 5 : 11) + 2, mb = (b.round ? b.round + 5 : 11) + 2;
      let moving = false;
      if (p.wait > 0) p.wait -= dt;
      else if (p.v > 0 && p.hop <= 0) {
        p.s += p.dir * p.v * dt; moving = true;
        if (p.s < ma) { p.s = ma; p.dir = 1; p.wait = 0.4 + Math.random() * 2; } else if (p.s > e.len - mb) { p.s = e.len - mb; p.dir = -1; p.wait = 0.4 + Math.random() * 2; }
      }
      const [bx, bz, eh] = this.pos(e, p.side, p.s, p.off);
      // cars: jump out of the way (people are never hit)
      for (let c = 0; c < cars.length; c++) {
        const car = cars[c] as CarState;
        const dx = bx + p.ox - car.x, dz = bz + p.oz - car.z;
        if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
        const fx = Math.sin(car.h), fz = -Math.cos(car.h), rx = Math.cos(car.h), rz = Math.sin(car.h);
        const sgn = car.vf >= 0 ? 1 : -1;
        const fwd = (dx * fx + dz * fz) * sgn, lat = dx * rx + dz * rz;
        const half = car.dims.width / 2 + 0.75;
        if (car.speed > 1.5 && fwd > -1.5 && fwd < 3.5 + car.speed * 0.5 && Math.abs(lat) < half) {
          const sd = lat !== 0 ? Math.sign(lat) : p.side;
          const push = sd * (half + 1.4) - lat;
          p.tx = p.ox + rx * push; p.tz = p.oz + rz * push;
          if (p.hop <= 0 && p.calm <= 0.2) { p.hop = 0.42; if (c === 0) this.onScare?.(); }
          p.calm = 2.2;
        }
        const d = Math.hypot(dx, dz), min = car.dims.length / 2 + 0.5;
        if (d < min && d > 0.01) { p.ox += (dx / d) * (min - d); p.oz += (dz / d) * (min - d); p.tx = p.ox; p.tz = p.oz; p.calm = Math.max(p.calm, 1.5); }
      }
      if (p.calm > 0) p.calm -= dt; else { p.tx = 0; p.tz = 0; }
      const ddx = p.tx - p.ox, ddz = p.tz - p.oz, dd = Math.hypot(ddx, ddz);
      if (dd > 0.001) { const stepLen = Math.min(dd, (p.calm > 0 ? 11 : 1.4) * dt); p.ox += (ddx / dd) * stepLen; p.oz += (ddz / dd) * stepLen; if (p.calm <= 0) moving = true; }
      if (p.hop > 0) p.hop -= dt;
      p.x = bx + p.ox; p.z = bz + p.oz;
      p.y = city.heightAt(bx, bz) + 0.16 + (p.hop > 0 ? Math.sin(Math.PI * (1 - p.hop / 0.42)) * 0.45 : 0);
      // facing: along the walk; people standing look at the street
      const want = p.v > 0 ? (p.dir > 0 ? eh : eh + Math.PI) : eh + (p.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      let dh = want - p.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      p.h += dh * Math.min(1, dt * 8);
      if (moving) p.phase += dt * (p.v > 0 ? p.v : 1.2) * 4.6;
      const sw = moving ? Math.sin(p.phase) * 0.6 : Math.sin(t * 1.3 + i) * 0.04;
      const S = p.scale;
      this.e.set(0, -p.h, 0);
      this.base.compose(this.p.set(p.x, p.y, p.z), this.q.setFromEuler(this.e), this.sc.set(S, S, S));
      const bob = moving ? Math.abs(Math.cos(p.phase)) * 0.03 : 0;
      this.put(this.leg, i * 2, -0.11, 0.86 + bob, 0, sw, 1, 1, 1);
      this.put(this.leg, i * 2 + 1, 0.11, 0.86 + bob, 0, -sw, 1, 1, 1);
      this.put(this.torso, i, 0, 1.15 + bob, 0, 0);
      if (p.skirt) this.put(this.skirt, i, 0, 0.66 + bob, 0, 0); else this.skirt.setMatrixAt(i, this.zero);
      const up = p.hop > 0 ? -2.4 : 0;   // arms up while jumping aside
      this.put(this.arm, i * 2, -0.29, 1.44 + bob, 0, up || -sw * 0.8);
      this.put(this.arm, i * 2 + 1, 0.29, 1.44 + bob, 0, up || sw * 0.8);
      this.put(this.head, i, 0, 1.66 + bob, 0, 0);
      if (p.head === 1) this.put(this.hair, i, 0, 1.63 + bob, 0.03, 0.42, 1.08, 1.5, 1.1);
      else if (p.head === 2) this.put(this.hair, i, 0, 1.72 + bob, -0.02, 0.1, 1.02, 0.6, 1.12);
      else this.put(this.hair, i, 0, 1.675 + bob, 0.025, 0.38, 1, p.skirt ? 1.35 : 0.95, 1.02);
      // ground shadow (not scaled by the hop)
      this.loc.makeTranslation(p.x, city.heightAt(p.x, p.z) + 0.19, p.z);
      this.blob.setMatrixAt(i, this.loc);
    }
    for (const m of [this.leg, this.arm, this.torso, this.skirt, this.head, this.hair, this.blob]) m.instanceMatrix.needsUpdate = true;
  }

  get count(): number { return this.peds.filter(Boolean).length; }
  /** for tests and the dev harness */
  list(): { x: number; z: number; ox: number; oz: number }[] { return this.peds.filter(Boolean).map((p) => ({ x: p.x, z: p.z, ox: p.ox, oz: p.oz })); }
}
