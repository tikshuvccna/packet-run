/** A densified path (polyline) with arc length, projection, a smoothed racing line and a speed profile. Pure. */
import type { Vec2 } from '../contract';
import { clamp } from './math';

export interface TrackPoint { x: number; z: number; dx: number; dz: number; s: number; hw: number; v: number; curv: number }

export class Track {
  readonly pts: TrackPoint[] = [];
  readonly length: number;
  readonly closed: boolean;
  private step: number;

  /** halfWidth(x,z): drivable half width of the road there (used for the racing line). */
  constructor(path: Vec2[], closed: boolean, halfWidth: (x: number, z: number) => number = () => 5, step = 3) {
    this.closed = closed;
    this.step = step;
    const src = path.slice();
    if (closed) {
      const a = src[0] as Vec2, b = src[src.length - 1] as Vec2;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 0.5) src.push({ x: a.x, z: a.z });
    }
    // densify
    const raw: Vec2[] = [];
    for (let i = 0; i < src.length - 1; i++) {
      const a = src[i] as Vec2, b = src[i + 1] as Vec2;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k < n; k++) raw.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    if (!closed) raw.push({ ...(src[src.length - 1] as Vec2) });
    let s = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i] as Vec2;
      if (i > 0) { const q = raw[i - 1] as Vec2; s += Math.hypot(p.x - q.x, p.z - q.z); }
      this.pts.push({ x: p.x, z: p.z, dx: 0, dz: -1, s, hw: halfWidth(p.x, p.z), v: 30, curv: 0 });
    }
    if (closed) { const p = raw[0] as Vec2, q = raw[raw.length - 1] as Vec2; s += Math.hypot(p.x - q.x, p.z - q.z); }
    this.length = s;
    this.computeDirs();
  }

  get count(): number { return this.pts.length; }
  pt(i: number): TrackPoint {
    const n = this.pts.length;
    if (this.closed) i = ((i % n) + n) % n; else i = clamp(i, 0, n - 1);
    return this.pts[i] as TrackPoint;
  }

  private computeDirs(): void {
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const a = this.pt(i - 1), b = this.pt(i + 1), p = this.pts[i] as TrackPoint;
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      p.dx = dx / l; p.dz = dz / l;
    }
  }

  /** Position and direction at arc length s. */
  sample(s: number): { x: number; z: number; dx: number; dz: number; i: number } {
    if (this.closed) s = ((s % this.length) + this.length) % this.length; else s = clamp(s, 0, this.length);
    // binary search
    let lo = 0, hi = this.pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((this.pts[mid] as TrackPoint).s <= s) lo = mid; else hi = mid - 1; }
    const a = this.pts[lo] as TrackPoint, b = this.pt(lo + 1);
    const segLen = (lo + 1 < this.pts.length ? b.s : this.length) - a.s;
    const t = segLen > 1e-6 ? clamp((s - a.s) / segLen, 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: a.dx + (b.dx - a.dx) * t, dz: a.dz + (b.dz - a.dz) * t, i: lo };
  }

  /** Project a point to arc length. With a hint, searches a window around it (no jumps across corners). */
  project(x: number, z: number, hint?: number, back = 25, ahead = 70): { s: number; lat: number; d: number } {
    const n = this.pts.length;
    let i0 = 0, i1 = n - 1;
    if (hint !== undefined) {
      const hi = Math.round(this.sample(hint).i);
      i0 = hi - Math.ceil(back / this.step); i1 = hi + Math.ceil(ahead / this.step);
    }
    let best = Infinity, bs = 0, blat = 0;
    for (let k = i0; k < i1; k++) {
      if (!this.closed && (k < 0 || k >= n - 1)) continue;
      const a = this.pt(k), b = this.pt(k + 1);
      const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
      const t = l2 > 0 ? clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1) : 0;
      const qx = a.x + ex * t, qz = a.z + ez * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < best) {
        best = d;
        const segS = this.closed && k + 1 >= n ? this.length - a.s : b.s - a.s;
        let sv = a.s + segS * t;
        if (hint !== undefined && this.closed) {
          // keep s continuous around the hint (no wrap jumps)
          while (sv - hint > this.length / 2) sv -= this.length;
          while (hint - sv > this.length / 2) sv += this.length;
        }
        bs = sv;
        blat = ((x - qx) * -ez + (z - qz) * ex) / Math.sqrt(l2 || 1);
      }
    }
    return { s: bs, lat: blat, d: best };
  }

  /** Signed lateral offset helper: right vector of the direction (dx,dz) is (-dz, dx). */
  static right(dx: number, dz: number): [number, number] { return [-dz, dx]; }
}

/**
 * Racing line: Laplacian smoothing of the center line kept inside the road (|offset| <= hw - margin; corners may cut
 * into the intersection square), then a speed profile from curvature (v = sqrt(aLat * R)) with a braking back-pass.
 */
export function racingLine(center: Track, aLat = 12, aBrake = 14, vMax = 60): Track {
  const n = center.count;
  const xs = center.pts.map((p) => p.x), zs = center.pts.map((p) => p.z);
  const lim = center.pts.map((p, i) => {
    // more room near sharp center-line corners (the intersection box)
    const a = center.pt(i - 4), b = center.pt(i + 4);
    const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
    return Math.max(0.5, p.hw - 2.2 + (turn > 0.6 ? p.hw * 0.7 : 0));
  });
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < n; i++) {
      if (!center.closed && (i === 0 || i === n - 1)) continue;
      const im = center.closed ? (i - 1 + n) % n : i - 1, ip = center.closed ? (i + 1) % n : i + 1;
      const nx = ((xs[im] as number) + (xs[ip] as number)) / 2, nz = ((zs[im] as number) + (zs[ip] as number)) / 2;
      let x = (xs[i] as number) + (nx - (xs[i] as number)) * 0.6, z = (zs[i] as number) + (nz - (zs[i] as number)) * 0.6;
      const c = center.pts[i] as TrackPoint;
      const ox = x - c.x, oz = z - c.z, d = Math.hypot(ox, oz), L = lim[i] as number;
      if (d > L) { x = c.x + (ox / d) * L; z = c.z + (oz / d) * L; }
      xs[i] = x; zs[i] = z;
    }
  }
  const pts = xs.map((x, i) => ({ x, z: zs[i] as number }));
  const line = new Track(pts, center.closed, () => 5, 3);
  // copy widths from the center line by index proximity
  for (let i = 0; i < line.count; i++) (line.pts[i] as TrackPoint).hw = center.pt(Math.round((i / line.count) * n)).hw;
  // curvature and speed
  const m = line.count;
  for (let i = 0; i < m; i++) {
    const a = line.pt(i - 3), p = line.pt(i), b = line.pt(i + 3);
    const ax = p.x - a.x, az = p.z - a.z, bx = b.x - p.x, bz = b.z - p.z;
    const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(b.x - a.x, b.z - a.z);
    const curv = la * lb * lc > 1e-6 ? (2 * cr) / (la * lb * lc) : 0;   // 1/R signed
    p.curv = curv;
    p.v = Math.min(vMax, Math.sqrt(aLat / Math.max(1e-4, Math.abs(curv))));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = m - 1; i >= 0; i--) {
      if (!line.closed && i === m - 1) continue;
      const p = line.pt(i), q = line.pt(i + 1);
      const ds = Math.max(0.5, Math.hypot(q.x - p.x, q.z - p.z));
      p.v = Math.min(p.v, Math.sqrt(q.v * q.v + 2 * aBrake * ds));
    }
  }
  return line;
}
