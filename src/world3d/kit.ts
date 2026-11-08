/**
 * Art kit library: loads the city/prop GLBs once and reduces each model to flat typed arrays (positions, normals,
 * vertex colours) split into a fixed part, a paintable part (material "Paint", white) and a glowing part (emissive
 * materials). KitBatch bakes many transformed copies into one merged geometry per chunk (fast, no per-vertex push).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetExists, assetUrl } from './carMesh';
import { KIT_BOUNDS } from './kitSizes';

export interface KitPart { pos: Float32Array; nor: Float32Array; col: Float32Array; count: number }
export interface KitModel { name: string; fixed: KitPart | null; paint: KitPart | null; glow: KitPart | null; bounds: [number, number, number, number, number, number] }

const models = new Map<string, KitModel>();
let loading: Promise<void> | null = null;

export function kitModel(name: string): KitModel | null { return models.get(name) ?? null; }
export function kitLoaded(): boolean { return models.size > 0; }

const SKIP = new Set(['sky_dome', 'sea_plane']);

/** Load every kit model listed in kitSizes (in parallel). Missing files are skipped (code fallbacks stay). */
export function loadKit(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const names = Object.keys(KIT_BOUNDS).filter((n) => !SKIP.has(n));
  let done = 0;
  loading = Promise.all(names.map(async (name) => {
    const url = assetUrl(`models/${name}.glb`);
    try {
      if (!(await assetExists(url))) return;
      const g = await loader.loadAsync(url);
      const m = reduce(name, g.scene);
      if (m) models.set(name, m);
    } catch (e) { console.warn('kit load failed', name, e); }
    finally { done++; onProgress?.(done, names.length); }
  })).then(() => undefined);
  return loading;
}

const GLOW_NAME = /^(Emissive|Light_|Glow|Beacon|Icon|Rule|Shine|Screen)/;

function reduce(name: string, scene: THREE.Object3D): KitModel | null {
  scene.updateMatrixWorld(true);
  const buckets: Record<'fixed' | 'paint' | 'glow', { pos: number[]; nor: number[]; col: number[] }> = {
    fixed: { pos: [], nor: [], col: [] }, paint: { pos: [], nor: [], col: [] }, glow: { pos: [], nor: [], col: [] },
  };
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const mname = mat.name ?? '';
    const emissive = !!mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05);
    const bucket = mname === 'Paint' ? 'paint' : GLOW_NAME.test(mname) || emissive ? 'glow' : 'fixed';
    const c = (emissive && bucket === 'glow' ? mat.emissive : mat.color) ?? new THREE.Color(1, 1, 1);
    const col = bucket === 'paint' ? new THREE.Color(1, 1, 1) : c.clone();
    if (bucket === 'glow' && emissive && mat.color) col.copy(mat.color).lerp(mat.emissive, 0.5);
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    let nr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!nr) { geo.computeVertexNormals(); nr = geo.getAttribute('normal') as THREE.BufferAttribute; }
    nm.getNormalMatrix(mesh.matrixWorld);
    const B = buckets[bucket];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize();
      B.pos.push(v.x, v.y, v.z); B.nor.push(n.x, n.y, n.z); B.col.push(col.r, col.g, col.b);
    }
  });
  const part = (b: { pos: number[]; nor: number[]; col: number[] }): KitPart | null =>
    b.pos.length ? { pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col), count: b.pos.length / 3 } : null;
  const bounds = KIT_BOUNDS[name] ?? [-1, 0, -1, 1, 1, 1];
  return { name, fixed: part(buckets.fixed), paint: part(buckets.paint), glow: part(buckets.glow), bounds };
}

/** A part as a standalone BufferGeometry (for dynamic objects). */
export function partGeometry(p: KitPart): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
  g.computeBoundingSphere();
  return g;
}

/** A whole kit model as a Group of meshes (fixed + paint + glow). paint colours the Paint material. */
export function kitObject(name: string, paint: THREE.ColorRepresentation = '#ffffff', opts: { shadow?: boolean } = {}): THREE.Group | null {
  const m = models.get(name);
  if (!m) return null;
  const g = new THREE.Group();
  const add = (p: KitPart | null, mat: THREE.Material): void => {
    if (!p) return;
    const mesh = new THREE.Mesh(partGeometry(p), mat);
    mesh.castShadow = !!opts.shadow;
    g.add(mesh);
  };
  add(m.fixed, VC_MAT());
  add(m.paint, new THREE.MeshToonMaterial({ color: paint, vertexColors: true, gradientMap: GRAD() }));
  add(m.glow, VC_GLOW());
  return g;
}
let vcMat: THREE.MeshToonMaterial | null = null, vcGlow: THREE.MeshToonMaterial | null = null;
let gradRef: (() => THREE.Texture) | null = null;
export function setKitMaterials(solid: THREE.MeshToonMaterial, glow: THREE.MeshToonMaterial, grad: () => THREE.Texture): void { vcMat = solid; vcGlow = glow; gradRef = grad; }
const VC_MAT = (): THREE.Material => vcMat ?? new THREE.MeshLambertMaterial({ vertexColors: true });
const VC_GLOW = (): THREE.Material => vcGlow ?? new THREE.MeshBasicMaterial({ vertexColors: true });
const GRAD = (): THREE.Texture | null => (gradRef ? gradRef() : null);

/** Bakes transformed copies of kit parts into one geometry. Transform = translate(x,y,z) * rotY(theta) * scale(sx,sy,sz). */
export class KitBatch {
  private items: { p: KitPart; x: number; y: number; z: number; th: number; sx: number; sy: number; sz: number; tint: ((r: number, g: number, b: number, out: number[]) => void) | null; color: THREE.Color | null; inflate: number; cx: number; cy: number; cz: number }[] = [];
  private total = 0;
  get empty(): boolean { return this.total === 0; }

  add(p: KitPart | null, x: number, y: number, z: number, th: number, sx: number, sy: number, sz: number, tint: ((r: number, g: number, b: number, out: number[]) => void) | null = null, color: THREE.Color | null = null, inflate = 0, center: [number, number, number] = [0, 0, 0]): void {
    if (!p) return;
    this.items.push({ p, x, y, z, th, sx, sy, sz, tint, color, inflate, cx: center[0], cy: center[1], cz: center[2] });
    this.total += p.count;
  }

  build(): THREE.BufferGeometry | null {
    if (!this.total) return null;
    const pos = new Float32Array(this.total * 3), nor = new Float32Array(this.total * 3), col = new Float32Array(this.total * 3);
    let o = 0;
    const tmp = [0, 0, 0];
    for (const it of this.items) {
      const c = Math.cos(it.th), s = Math.sin(it.th);
      const P = it.p.pos, N = it.p.nor, C = it.p.col;
      const ix = it.inflate || 1, iy = ix, iz = ix;   // inflate = uniform factor about the bounds center (outline hulls)
      for (let i = 0; i < it.p.count; i++) {
        const k = i * 3;
        let lx = P[k] as number, ly = P[k + 1] as number, lz = P[k + 2] as number;
        if (it.inflate) { lx = it.cx + (lx - it.cx) * ix; ly = it.cy + (ly - it.cy) * iy; lz = it.cz + (lz - it.cz) * iz; }
        lx *= it.sx; ly *= it.sy; lz *= it.sz;
        // three rotation.y = th: x' = x cos + z sin, z' = -x sin + z cos
        pos[o] = it.x + lx * c + lz * s; pos[o + 1] = it.y + ly; pos[o + 2] = it.z - lx * s + lz * c;
        const nx = N[k] as number, ny = N[k + 1] as number, nz = N[k + 2] as number;
        nor[o] = nx * c + nz * s; nor[o + 1] = ny; nor[o + 2] = -nx * s + nz * c;
        if (it.color) { col[o] = it.color.r; col[o + 1] = it.color.g; col[o + 2] = it.color.b; }
        else if (it.tint) { it.tint(C[k] as number, C[k + 1] as number, C[k + 2] as number, tmp); col[o] = tmp[0] as number; col[o + 1] = tmp[1] as number; col[o + 2] = tmp[2] as number; }
        else { col[o] = C[k] as number; col[o + 1] = C[k + 1] as number; col[o + 2] = C[k + 2] as number; }
        o += 3;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** World placement of a kit model whose bounds-center should sit at (x, z) with its front (-Z) facing (fx, fz). */
export function kitPlacement(name: string, x: number, z: number, fx: number, fz: number, scale: number): { ox: number; oz: number; th: number } {
  const b = KIT_BOUNDS[name] ?? [0, 0, 0, 0, 0, 0];
  const th = Math.atan2(-fx, -fz);
  const cx = ((b[0] + b[3]) / 2) * scale, cz = ((b[2] + b[5]) / 2) * scale;
  const c = Math.cos(th), s = Math.sin(th);
  // world offset of the local bounds center
  const wx = cx * c + cz * s, wz = -cx * s + cz * c;
  return { ox: x - wx, oz: z - wz, th };
}
