/** Fast merged-geometry builder (positions, normals, vertex colours, uvs) for chunked static city meshes. */
import * as THREE from 'three';

const tmpC = new THREE.Color();

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  get empty(): boolean { return this.pos.length === 0; }

  /** Raw triangle with a flat normal. */
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, r: number, g: number, b: number, uvs?: number[]): void {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(r, g, b, r, g, b, r, g, b);
    if (uvs) this.uv.push(...uvs); else this.uv.push(0.99, 0.99, 0.99, 0.99, 0.99, 0.99);
  }

  /** Quad (a b c d counter-clockwise seen from the front). */
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, uvs?: number[]): void {
    tmpC.set(color);
    const [r, g, bl] = [tmpC.r, tmpC.g, tmpC.b];
    const u = uvs ?? [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
    this.tri(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!, r, g, bl, [u[0]!, u[1]!, u[2]!, u[3]!, u[4]!, u[5]!]);
    this.tri(a[0]!, a[1]!, a[2]!, c[0]!, c[1]!, c[2]!, d[0]!, d[1]!, d[2]!, r, g, bl, [u[0]!, u[1]!, u[4]!, u[5]!, u[6]!, u[7]!]);
  }

  /**
   * Oriented box. (cx, cz) center, y0 bottom, size w (local x), h, d (local z), rot = angle of the local x axis in the
   * (x, z) plane (city convention: local x = (cos r, sin r)). wallUv: u/v in meters / tile for the 4 side faces.
   */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, rot: number, color: THREE.ColorRepresentation, opts: { top?: THREE.ColorRepresentation; wallUv?: number; noBottom?: boolean; noTop?: boolean } = {}): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2, hd = d / 2;
    const P = (lx: number, y: number, lz: number): number[] => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
    const y1 = y0 + h;
    const p000 = P(-hw, y0, -hd), p100 = P(hw, y0, -hd), p110 = P(hw, y0, hd), p010 = P(-hw, y0, hd);
    const p001 = P(-hw, y1, -hd), p101 = P(hw, y1, -hd), p111 = P(hw, y1, hd), p011 = P(-hw, y1, hd);
    const t = opts.wallUv;
    const uvw = (len: number): number[] | undefined => (t ? [0, y0 / t, len / t, y0 / t, len / t, y1 / t, 0, y1 / t] : undefined);
    // sides (outward normals)
    this.quad(p010, p110, p111, p011, color, uvw(w));   // +z local
    this.quad(p100, p000, p001, p101, color, uvw(w));   // -z local
    this.quad(p110, p100, p101, p111, color, uvw(d));   // +x local
    this.quad(p000, p010, p011, p001, color, uvw(d));   // -x local
    if (!opts.noTop) this.quad(p001, p011, p111, p101, opts.top ?? color);
    if (!opts.noBottom) this.quad(p000, p100, p110, p010, color);
  }

  /** Gable roof prism on a w x d footprint, ridge along local x. */
  gable(cx: number, y0: number, cz: number, w: number, d: number, rh: number, rot: number, color: THREE.ColorRepresentation, gableColor: THREE.ColorRepresentation): void {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx: number, y: number, lz: number): number[] => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
    const hw = w / 2 + 0.4, hd = d / 2 + 0.5;
    const a = P(-hw, y0, -hd), b = P(hw, y0, -hd), cc = P(hw, y0, hd), dd = P(-hw, y0, hd), r0 = P(-hw, y0 + rh, 0), r1 = P(hw, y0 + rh, 0);
    this.quad(b, a, r0, r1, color);
    this.quad(dd, cc, r1, r0, color);
    tmpC.set(gableColor);
    this.tri(a[0]!, a[1]!, a[2]!, dd[0]!, dd[1]!, dd[2]!, r0[0]!, r0[1]!, r0[2]!, tmpC.r, tmpC.g, tmpC.b);
    this.tri(cc[0]!, cc[1]!, cc[2]!, b[0]!, b[1]!, b[2]!, r1[0]!, r1[1]!, r1[2]!, tmpC.r, tmpC.g, tmpC.b);
  }

  /** Vertical cylinder / cone (r0 bottom, r1 top). */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg: number, color: THREE.ColorRepresentation, cap = true): void {
    const y1 = y0 + h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad([cx + c1 * r0, y0, cz + s1 * r0], [cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], color);
      if (cap && r1 > 0.01) { tmpC.set(color); this.tri(cx, y1, cz, cx + c1 * r1, y1, cz + s1 * r1, cx + c0 * r1, y1, cz + s0 * r1, tmpC.r, tmpC.g, tmpC.b); }
    }
  }

  /** Low-poly blob (octahedron subdivided once) for tree crowns, bushes, rocks. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: THREE.ColorRepresentation, jag = 0, seed = 0): void {
    const g = BLOB;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    tmpC.set(color);
    const r = tmpC.r, gg = tmpC.g, b = tmpC.b;
    for (let i = 0; i < p.count; i += 3) {
      const v: number[] = [];
      for (let k = 0; k < 3; k++) {
        const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
        const j = jag ? 1 + jag * Math.sin(x * 12.9 + y * 7.3 + z * 5.1 + seed) : 1;
        v.push(cx + x * rx * j, cy + y * ry * j, cz + z * rz * j);
      }
      this.tri(v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!, v[6]!, v[7]!, v[8]!, r, gg, b);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const BLOB = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
