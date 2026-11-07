/** Static colliders (buildings, fences, rails, islands, trees) in a uniform spatial grid. Pure, no three. */
export interface SBox { kind: 'box'; x: number; z: number; hw: number; hd: number; rot: number; c: number; s: number; tag: number }
export interface SCircle { kind: 'circle'; x: number; z: number; r: number; tag: number }
export type SCollider = SBox | SCircle;

export interface Contact { nx: number; nz: number; depth: number; px: number; pz: number; tag: number }

/** Collider tags (for sounds/effects). */
export const TAG = { building: 1, fence: 2, rail: 3, tree: 4, island: 5, rock: 6, edge: 7 } as const;

export class StaticWorld {
  readonly cell: number;
  readonly half: number;          // world spans [-half, half] on both axes
  private n: number;
  private grid: number[][];
  readonly items: SCollider[] = [];
  private stamp: Uint32Array = new Uint32Array(0);
  private stampId = 0;

  constructor(half = 1600, cell = 32) {
    this.half = half;
    this.cell = cell;
    this.n = Math.ceil((half * 2) / cell);
    this.grid = Array.from({ length: this.n * this.n }, () => []);
  }

  addBox(x: number, z: number, w: number, d: number, rot: number, tag: number): void {
    const b: SBox = { kind: 'box', x, z, hw: w / 2, hd: d / 2, rot, c: Math.cos(rot), s: Math.sin(rot), tag };
    const ext = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hd;
    const ezt = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hd;
    this.insert(b, x - ext, z - ezt, x + ext, z + ezt);
  }
  addCircle(x: number, z: number, r: number, tag: number): void {
    this.insert({ kind: 'circle', x, z, r, tag }, x - r, z - r, x + r, z + r);
  }
  /** A thin wall from (ax,az) to (bx,bz). */
  addWall(ax: number, az: number, bx: number, bz: number, thick: number, tag: number): void {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    // box local x axis along the wall: rot so that (cos, sin) = dir
    this.addBox((ax + bx) / 2, (az + bz) / 2, len, thick, Math.atan2(dz, dx), tag);
  }

  private insert(c: SCollider, x0: number, z0: number, x1: number, z1: number): void {
    const idx = this.items.length;
    this.items.push(c);
    const i0 = this.ci(x0), i1 = this.ci(x1), j0 = this.ci(z0), j1 = this.ci(z1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grid[j * this.n + i]?.push(idx);
  }
  private ci(v: number): number { return Math.max(0, Math.min(this.n - 1, Math.floor((v + this.half) / this.cell))); }

  /** Calls fn for every collider whose cell overlaps the query AABB (each at most once). */
  query(x0: number, z0: number, x1: number, z1: number, fn: (c: SCollider) => void): void {
    if (this.stamp.length !== this.items.length) { this.stamp = new Uint32Array(this.items.length); this.stampId = 0; }
    this.stampId = (this.stampId + 1) >>> 0;
    if (this.stampId === 0) { this.stamp.fill(0); this.stampId = 1; }
    const i0 = this.ci(x0), i1 = this.ci(x1), j0 = this.ci(z0), j1 = this.ci(z1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.grid[j * this.n + i];
      if (!list) continue;
      for (const k of list) {
        if (this.stamp[k] === this.stampId) continue;
        this.stamp[k] = this.stampId;
        const c = this.items[k];
        if (c) fn(c);
      }
    }
  }

  /** Contacts of a circle against the static world (pushes out along nx,nz by depth). */
  circleContacts(x: number, z: number, r: number, out: Contact[]): number {
    let n = 0;
    this.query(x - r, z - r, x + r, z + r, (c) => {
      const k = circleVs(c, x, z, r);
      if (k) { out[n++] = k; }
    });
    out.length = n;
    return n;
  }

  /** True when the point is inside a collider (with margin). */
  blocked(x: number, z: number, margin = 0): boolean {
    let hit = false;
    this.query(x - margin, z - margin, x + margin, z + margin, (c) => { if (!hit && circleVs(c, x, z, Math.max(margin, 0.01))) hit = true; });
    return hit;
  }

  /** Ray cast on the plane: returns the distance to the first collider hit, or maxD. Coarse (samples). */
  rayFree(x: number, z: number, dx: number, dz: number, maxD: number, r = 1): number {
    const step = Math.max(1.5, r);
    for (let d = step; d <= maxD; d += step) {
      if (this.blocked(x + dx * d, z + dz * d, r)) return d - step;
    }
    return maxD;
  }
}

function circleVs(c: SCollider, x: number, z: number, r: number): Contact | null {
  if (c.kind === 'circle') {
    const dx = x - c.x, dz = z - c.z;
    const d2 = dx * dx + dz * dz, rr = r + c.r;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1e-6;
    return { nx: dx / d, nz: dz / d, depth: rr - d, px: c.x + (dx / d) * c.r, pz: c.z + (dz / d) * c.r, tag: c.tag };
  }
  // into box local frame (local x along (c, s))
  const rx = x - c.x, rz = z - c.z;
  const lx = rx * c.c + rz * c.s;
  const lz = -rx * c.s + rz * c.c;
  const qx = Math.max(-c.hw, Math.min(c.hw, lx));
  const qz = Math.max(-c.hd, Math.min(c.hd, lz));
  let nlx = lx - qx, nlz = lz - qz;
  const d2 = nlx * nlx + nlz * nlz;
  let depth: number;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nlx /= d; nlz /= d;
    depth = r - d;
  } else {
    // center inside the box: push out along the smallest axis
    const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
    if (px < pz) { nlx = lx < 0 ? -1 : 1; nlz = 0; depth = px + r; } else { nlx = 0; nlz = lz < 0 ? -1 : 1; depth = pz + r; }
  }
  const nx = nlx * c.c - nlz * c.s;
  const nz = nlx * c.s + nlz * c.c;
  const wx = c.x + qx * c.c - qz * c.s, wz = c.z + qx * c.s + qz * c.c;
  return { nx, nz, depth, px: wx, pz: wz, tag: c.tag };
}
