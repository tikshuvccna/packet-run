/**
 * Car visuals. Loads `assets/models/car_<id>.glb` (art agent) when it exists, otherwise builds a toon car in code.
 * Each model is reduced to a template of a few merged geometries (fixed parts with vertex colours, paintable shell,
 * lights, vinyl decal, spoiler, flame, wheels) so a car costs ~8-14 draw calls. CarVisual applies a CarLook and poses.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarId, CarLook, VinylId, WheelId } from '../drive/contract';
import type { CarState } from '../drive/sim/car';
import { CAR_DIMS } from '../drive/sim/cars';
import { outlineMat, toon, toonGradient } from './toon';
import { kitObject, loadKit } from './kit';

export interface CarTemplate {
  fixed: THREE.BufferGeometry | null; paint: THREE.BufferGeometry | null; lights: THREE.BufferGeometry | null;
  vinyl: THREE.BufferGeometry | null; spoilerFixed: THREE.BufferGeometry | null; spoilerPaint: THREE.BufferGeometry | null;
  flame: THREE.BufferGeometry | null;
  wheelPos: THREE.Vector3[];       // FL FR RL RR
  ownWheel: WheelTemplate | null;  // wheel geometry from the car file (right-side)
  fromGlb: boolean;
}
export interface WheelTemplate { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry | null; r: number }

const ROLE_COLORS: Record<string, string> = {
  Trim: '#2b2f3a', Glass: '#1f2b3b', Chrome: '#d8dde3', Rubber: '#25282e', Light_head: '#fff6d0', Light_tail: '#ff3b3b', Rim: '#d8dde3',
};

const loader = new GLTFLoader();
const exists = new Map<string, Promise<boolean>>();
/** Vite serves index.html for missing files, so check the content type. */
export function assetExists(url: string): Promise<boolean> {
  let p = exists.get(url);
  if (!p) {
    p = fetch(url, { method: 'HEAD' }).then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')).catch(() => false);
    exists.set(url, p);
  }
  return p;
}
export const assetUrl = (rel: string): string => `${import.meta.env.BASE_URL ?? './'}assets/${rel}`;

function normalize(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color | null, keepUv: boolean): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  geo.applyMatrix4(m);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', geo.getAttribute('position'));
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  out.setAttribute('normal', geo.getAttribute('normal'));
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const cc = color ?? new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (keepUv) {
    const uv = geo.getAttribute('uv');
    out.setAttribute('uv', uv ?? new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  geo = out;
  return geo;
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const g = list.length === 1 ? (list[0] as THREE.BufferGeometry) : mergeGeometries(list, false);
  g?.computeBoundingSphere();
  return g ?? null;
}

const templates = new Map<CarId, Promise<CarTemplate>>();
export function carTemplate(id: CarId): Promise<CarTemplate> {
  let p = templates.get(id);
  if (!p) {
    const url = assetUrl(`models/car_${id}.glb`);
    p = assetExists(url).then(async (ok) => {
      if (!ok) return proceduralCar(id);
      try { return fromGltf((await loader.loadAsync(url)).scene); } catch (e) { console.warn('car glb failed', id, e); return proceduralCar(id); }
    });
    templates.set(id, p);
  }
  return p;
}
const wheelTemplates = new Map<WheelId, Promise<WheelTemplate | null>>();
export function wheelTemplate(id: WheelId): Promise<WheelTemplate | null> {
  let p = wheelTemplates.get(id);
  if (!p) {
    const url = assetUrl(`models/wheel_${id}.glb`);
    p = assetExists(url).then(async (ok) => {
      if (!ok) return null;
      try {
        const sc = (await loader.loadAsync(url)).scene;
        sc.updateMatrixWorld(true);
        const tire: THREE.BufferGeometry[] = [], rim: THREE.BufferGeometry[] = [];
        sc.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const name = (m.material as THREE.Material).name ?? '';
          const col = new THREE.Color(ROLE_COLORS[name] ?? (m.material as THREE.MeshStandardMaterial).color?.getStyle() ?? '#333');
          if (name === 'Rim') rim.push(normalize(m.geometry, m.matrixWorld, null, false)); else tire.push(normalize(m.geometry, m.matrixWorld, col, false));
        });
        const t = merge(tire);
        return t ? { tire: t, rim: merge(rim), r: 0.34 } : null;
      } catch { return null; }
    });
    wheelTemplates.set(id, p);
  }
  return p;
}

function fromGltf(scene: THREE.Object3D): CarTemplate {
  scene.updateMatrixWorld(true);
  const fixed: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], vinyl: THREE.BufferGeometry[] = [];
  const spF: THREE.BufferGeometry[] = [], spP: THREE.BufferGeometry[] = [], flame: THREE.BufferGeometry[] = [];
  const wheelPos: THREE.Vector3[] = [];
  const wheelTire: THREE.BufferGeometry[] = [], wheelRim: THREE.BufferGeometry[] = [];
  for (const n of ['WheelFL', 'WheelFR', 'WheelRL', 'WheelRR']) {
    const w = scene.getObjectByName(n);
    wheelPos.push(w ? new THREE.Vector3().setFromMatrixPosition(w.matrixWorld) : new THREE.Vector3());
  }
  const partOf = (o: THREE.Object3D): string => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (/^(NitroFlame|Spoiler|Vinyl|Wheel(FL|FR|RL|RR)|Body)$/.test(p.name)) return p.name;
    return 'Body';
  };
  const frWheel = scene.getObjectByName('WheelFR');
  const frInv = frWheel ? new THREE.Matrix4().copy(frWheel.matrixWorld).invert() : new THREE.Matrix4();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const name = mat.name ?? '';
    const part = partOf(m);
    const base = new THREE.Color(ROLE_COLORS[name] ?? (mat.color ? mat.color.getStyle() : '#888'));
    if (part.startsWith('Wheel')) {
      if (part !== 'WheelFR') return;
      const mm = new THREE.Matrix4().multiplyMatrices(frInv, m.matrixWorld);
      if (name === 'Rim') wheelRim.push(normalize(m.geometry, mm, null, false)); else wheelTire.push(normalize(m.geometry, mm, base, false));
      return;
    }
    if (part === 'NitroFlame') { flame.push(normalize(m.geometry, m.matrixWorld, new THREE.Color(name === 'Emissive' ? '#7fd4ff' : '#ffb84a'), false)); return; }
    if (part === 'Vinyl' || name === 'VinylMat') { vinyl.push(normalize(m.geometry, m.matrixWorld, null, true)); return; }
    const isPaint = name === 'Paint';
    const isLight = name === 'Light_head' || name === 'Light_tail' || name === 'Emissive';
    const g = normalize(m.geometry, m.matrixWorld, isPaint ? null : base, false);
    if (part === 'Spoiler') (isPaint ? spP : spF).push(g);
    else if (isPaint) paint.push(g);
    else if (isLight) lights.push(g);
    else fixed.push(g);
  });
  const tire = merge(wheelTire);
  return {
    fixed: merge(fixed), paint: merge(paint), lights: merge(lights), vinyl: merge(vinyl), spoilerFixed: merge(spF), spoilerPaint: merge(spP),
    flame: merge(flame), wheelPos, ownWheel: tire ? { tire, rim: merge(wheelRim), r: 0.34 } : null, fromGlb: true,
  };
}

/* ------------------------------------------------------------------ procedural fallback car */
function proceduralCar(id: CarId): CarTemplate {
  const d = CAR_DIMS[id];
  const L = d.length, W = d.width;
  // side profile (z forward = -Z): [z, y] points, counter-clockwise
  const prof: Partial<Record<CarId, { body: [number, number][]; cab: [number, number][] }>> = {
    van: { body: [[-L / 2, 0.35], [L / 2, 0.35], [L / 2, 1.0], [L / 2 - 0.2, 1.15], [-L / 2 + 0.9, 1.15], [-L / 2 + 0.1, 0.95], [-L / 2, 0.6]], cab: [[L / 2 - 0.1, 1.1], [L / 2 - 0.15, 2.0], [-L / 2 + 1.5, 2.0], [-L / 2 + 0.95, 1.12]] },
    hatch: { body: [[-L / 2, 0.32], [L / 2, 0.32], [L / 2, 0.9], [L / 2 - 0.25, 1.0], [-L / 2 + 0.7, 0.95], [-L / 2, 0.7]], cab: [[L / 2 - 0.2, 0.95], [L / 2 - 0.45, 1.5], [-L / 2 + 1.6, 1.5], [-L / 2 + 0.85, 0.95]] },
    sport: { body: [[-L / 2, 0.3], [L / 2, 0.3], [L / 2, 0.8], [L / 2 - 0.3, 0.85], [-L / 2 + 0.4, 0.75], [-L / 2, 0.5]], cab: [[L / 2 - 0.5, 0.82], [L / 2 - 1.1, 1.25], [-L / 2 + 1.9, 1.25], [-L / 2 + 0.95, 0.8]] },
    jeep: { body: [[-L / 2, 0.55], [L / 2, 0.55], [L / 2, 1.3], [-L / 2 + 0.2, 1.3], [-L / 2, 1.1]], cab: [[L / 2 - 0.1, 1.28], [L / 2 - 0.15, 1.95], [-L / 2 + 1.4, 1.95], [-L / 2 + 1.1, 1.28]] },
    super: { body: [[-L / 2, 0.28], [L / 2, 0.28], [L / 2, 0.75], [L / 2 - 0.4, 0.8], [-L / 2 + 0.3, 0.6], [-L / 2, 0.42]], cab: [[L / 2 - 1.1, 0.78], [L / 2 - 1.6, 1.12], [-L / 2 + 2.0, 1.1], [-L / 2 + 1.0, 0.7]] },
  };
  const ext = (pts: [number, number][], width: number, color: THREE.Color | null, bevel = 0.08): THREE.BufferGeometry => {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    // shape x -> car z, shape y -> y, extrude z -> car x
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -(width - bevel * 2) / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    return normalize(g, new THREE.Matrix4(), color, false);
  };
  const p = prof[id] ?? (d.height > 1.5 ? prof.jeep : prof.sport) as { body: [number, number][]; cab: [number, number][] };
  const paint = ext(p.body, W, null, 0.1);
  const cab = ext(p.cab, W - 0.16, new THREE.Color('#1f2b3b'), 0.06);
  const lights: THREE.BufferGeometry[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, dd: number, c: string): THREE.BufferGeometry => normalize(new THREE.BoxGeometry(w, h, dd), new THREE.Matrix4().makeTranslation(x, y, z), new THREE.Color(c), false);
  const fy = (p.body[2]?.[1] ?? 0.9) - 0.15;
  for (const sx of [-1, 1]) {
    lights.push(box(sx * (W / 2 - 0.3), fy, -L / 2 - 0.01, 0.4, 0.16, 0.06, '#fff6d0'));
    lights.push(box(sx * (W / 2 - 0.3), fy - 0.05, L / 2 + 0.01, 0.4, 0.14, 0.06, '#ff3b3b'));
  }
  const fixed = merge([cab, box(0, 0.32, -L / 2 + 0.05, W - 0.1, 0.22, 0.2, '#2b2f3a'), box(0, 0.32, L / 2 - 0.05, W - 0.1, 0.22, 0.2, '#2b2f3a')]);
  const tire = normalize(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 14).rotateZ(Math.PI / 2), new THREE.Matrix4(), new THREE.Color('#25282e'), false);
  const rim = normalize(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.01, 0, 0), null, false);
  const wx = d.track / 2, zf = -d.a - 0.05, zr = d.b + 0.05;
  const spoiler = merge([box(0, 1.25, L / 2 - 0.25, W - 0.2, 0.08, 0.45, '#ffffff'), box(-0.6, 1.05, L / 2 - 0.25, 0.08, 0.4, 0.2, '#2b2f3a'), box(0.6, 1.05, L / 2 - 0.25, 0.08, 0.4, 0.2, '#2b2f3a')]);
  const flame = normalize(new THREE.ConeGeometry(0.16, 0.9, 8).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.45, L / 2 + 0.5), new THREE.Color('#7fd4ff'), false);
  // vinyl: two side planes + hood plane with uvs
  const vin: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(L * 0.8, 0.5).rotateY(sx * Math.PI / 2);
    g.translate(sx * (W / 2 + 0.01), (p.body[2]?.[1] ?? 0.9) * 0.62, 0);
    vin.push(normalize(g, new THREE.Matrix4(), null, true));
  }
  return { fixed, paint, lights: merge(lights), vinyl: merge(vin), spoilerFixed: null, spoilerPaint: spoiler, flame, wheelPos: [new THREE.Vector3(-wx, 0.34, zf), new THREE.Vector3(wx, 0.34, zf), new THREE.Vector3(-wx, 0.34, zr), new THREE.Vector3(wx, 0.34, zr)], ownWheel: { tire, rim, r: 0.34 }, fromGlb: false };
}

/* ------------------------------------------------------------------ vinyl textures */
const vinylTex = new Map<VinylId, Promise<THREE.Texture>>();
/** The art file when it exists, else a procedural canvas (a new texture each way: never resize a live texture). */
function vinylTexture(id: VinylId): Promise<THREE.Texture> {
  let p = vinylTex.get(id);
  if (!p) {
    const url = assetUrl(`tex/vinyl_${id}.png`);
    p = assetExists(url).then((ok) => new Promise<THREE.Texture>((res) => {
      const done = (t: THREE.Texture): void => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); };
      if (ok) new THREE.TextureLoader().load(url, done, undefined, () => done(new THREE.CanvasTexture(proceduralVinyl(id))));
      else done(new THREE.CanvasTexture(proceduralVinyl(id)));
    }));
    vinylTex.set(id, p);
  }
  return p;
}
function proceduralVinyl(id: VinylId): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  if (id === 'stripes') { g.fillRect(0, 96, 256, 22); g.fillRect(0, 138, 256, 22); }
  else if (id === 'checker') { for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2) g.fillRect(x * 16, 96 + y * 16, 16, 16); }
  else if (id === 'stars') { g.font = '48px sans-serif'; for (let k = 0; k < 5; k++) g.fillText('★', 10 + k * 50, 150); }
  else if (id === 'flames') { g.beginPath(); g.moveTo(0, 200); for (let x = 0; x <= 256; x += 32) { g.quadraticCurveTo(x + 16, 60 + (x % 64), x + 32, 200); } g.fill(); }
  else { g.strokeStyle = '#fff'; g.lineWidth = 6; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(30 + k * 40, 128, 12, 0, 6.3); g.stroke(); g.beginPath(); g.moveTo(42 + k * 40, 128); g.lineTo(58 + k * 40, 128); g.stroke(); } }
  return cv;
}

/* ------------------------------------------------------------------ the visual */
const fixedMat = (): THREE.MeshToonMaterial => toon(0xffffff, { vertexColors: true });
const lightMat = (): THREE.MeshToonMaterial => toon(0xffffff, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.9 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

export class CarVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private spins: THREE.Group[] = [];
  private paintMat: THREE.MeshToonMaterial;
  private rimMat: THREE.MeshToonMaterial;
  private vinylMat: THREE.MeshToonMaterial;
  private vinylMesh: THREE.Mesh | null = null;
  private spoiler = new THREE.Group();
  private flame: THREE.Mesh | null = null;
  private look: CarLook;
  private tpl: CarTemplate | null = null;
  private wheelR = 0.34;
  private ready = false;
  bubble: THREE.Mesh | null = null;
  private moto = false;
  /** own copies of the body geometry that crash damage bends and darkens (player car only) */
  private deform: { geo: THREE.BufferGeometry; pos: Float32Array; col: Float32Array }[] = [];
  private dmgKey = '';

  constructor(look: CarLook, readonly opts: { outline: boolean; shadow: boolean; detail: boolean; deform?: boolean }) {
    this.look = { ...look };
    this.paintMat = new THREE.MeshToonMaterial({ color: look.paint, gradientMap: toonGradient(), vertexColors: true });
    this.rimMat = new THREE.MeshToonMaterial({ color: look.rim, gradientMap: toonGradient() });
    this.vinylMat = new THREE.MeshToonMaterial({ color: look.vinylColor, gradientMap: toonGradient(), transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    this.root.add(this.body);
    void this.build(look);
  }

  get isReady(): boolean { return this.ready; }

  private async build(look: CarLook): Promise<void> {
    if (look.extra === 'moto') {
      await loadKit();
      const o = kitObject('moto', look.paint);
      if (o) { this.body.clear(); this.body.add(o); this.moto = true; this.ready = true; return; }
    }
    const tpl = await carTemplate(look.car);
    if (this.look.car !== look.car) return;
    this.tpl = tpl;
    this.body.clear();
    this.wheels.forEach((w) => this.root.remove(w));
    this.wheels = []; this.spins = [];
    this.deform = []; this.dmgKey = '';
    const own = (g: THREE.BufferGeometry | null): THREE.BufferGeometry | null => {
      if (!g || !this.opts.deform) return g;
      const c = g.clone();
      this.deform.push({ geo: c, pos: Float32Array.from(c.getAttribute('position').array), col: Float32Array.from(c.getAttribute('color').array) });
      return c;
    };
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, parent: THREE.Object3D, outline = this.opts.outline): THREE.Mesh | null => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = this.opts.shadow;
      parent.add(mesh);
      if (outline) { const o = new THREE.Mesh(g, outlineMat(0.035)); o.raycast = () => {}; mesh.add(o); }
      return mesh;
    };
    add(own(tpl.paint), this.paintMat, this.body);
    add(own(tpl.fixed), fixedMat(), this.body);
    add(own(tpl.lights), lightMat(), this.body, false);
    if (this.opts.detail) {
      this.vinylMesh = add(tpl.vinyl, this.vinylMat, this.body, false);
      this.spoiler = new THREE.Group();
      add(tpl.spoilerPaint, this.paintMat, this.spoiler);
      add(tpl.spoilerFixed, fixedMat(), this.spoiler);
      this.body.add(this.spoiler);
    }
    this.flame = add(tpl.flame, flameMat, this.body, false);
    if (this.flame) this.flame.visible = false;
    // wheels
    tpl.wheelPos.forEach((p, i) => {
      const g = new THREE.Group();
      g.position.copy(p);
      const spin = new THREE.Group();
      g.add(spin);
      this.root.add(g);
      this.wheels.push(g); this.spins.push(spin);
      void i;
    });
    await this.setWheels(look.wheels);
    this.apply(look);
    this.ready = true;
    if (look.extra === 'taxi' || look.extra === 'police') {
      await loadKit();
      const o = kitObject(look.extra === 'taxi' ? 'taxi_sign' : 'police_bar');
      if (o) { o.position.set(0, CAR_DIMS[look.car].height - 0.06, 0.1); this.body.add(o); }
    }
  }

  private async setWheels(id: WheelId): Promise<void> {
    const tpl = this.tpl;
    if (!tpl) return;
    const w = (await wheelTemplate(id)) ?? tpl.ownWheel;
    if (!w) return;
    this.wheelR = w.r;
    this.spins.forEach((s, i) => {
      s.clear();
      const left = i % 2 === 0;
      const holder = new THREE.Group();
      if (left) holder.scale.x = -1;
      const t = new THREE.Mesh(w.tire, fixedMat());
      t.castShadow = this.opts.shadow;
      holder.add(t);
      if (w.rim) holder.add(new THREE.Mesh(w.rim, this.rimMat));
      if (this.opts.outline && this.opts.detail) { const o = new THREE.Mesh(w.tire, outlineMat(0.025)); holder.add(o); }
      s.add(holder);
    });
  }

  apply(look: CarLook): void {
    const prev = this.look;
    this.look = { ...look };
    if (this.moto) return;
    if (prev.car !== look.car || !this.tpl) { this.ready = false; void this.build(look); return; }
    this.paintMat.color.set(look.paint);
    this.rimMat.color.set(look.rim);
    this.vinylMat.color.set(look.vinylColor);
    if (this.vinylMesh) {
      this.vinylMesh.visible = !!look.vinyl;
      if (look.vinyl) { const v = look.vinyl; void vinylTexture(v).then((t) => { if (this.look.vinyl === v) { this.vinylMat.map = t; this.vinylMat.needsUpdate = true; } }); }
    }
    this.spoiler.visible = look.spoiler;
    if (prev.wheels !== look.wheels) void this.setWheels(look.wheels);
  }

  /** Crash damage per zone [front, rear, left, right] 0..1: crumples the body toward the inside and darkens it. */
  setDamage(z: readonly number[]): void {
    if (!this.ready || !this.deform.length) return;
    const key = z.map((v) => v.toFixed(2)).join();
    if (key === this.dmgKey) return;
    this.dmgKey = key;
    const d = CAR_DIMS[this.look.car], hl = d.length / 2, hw = d.width / 2;
    const sm = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
    const hash = (x: number, y: number, zz: number, k: number): number => { const s = Math.sin(Math.round(x * k) * 12.9898 + Math.round(y * k) * 78.233 + Math.round(zz * k) * 37.719) * 43758.5453; return s - Math.floor(s); };
    const [zf = 0, zr = 0, zl = 0, zR = 0] = z;
    for (const it of this.deform) {
      const pos = it.geo.getAttribute('position') as THREE.BufferAttribute, col = it.geo.getAttribute('color') as THREE.BufferAttribute;
      const pa = pos.array as Float32Array, ca = col.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = it.pos[i * 3] as number, y = it.pos[i * 3 + 1] as number, zz = it.pos[i * 3 + 2] as number;
        const n = hash(x, y, zz, 7), n2 = hash(x, y, zz, 3.1);
        const f = zf * sm((-zz - hl * 0.3) / (hl * 0.7)), r = zr * sm((zz - hl * 0.3) / (hl * 0.7));
        const l = zl * sm((-x - hw * 0.35) / (hw * 0.65)), rr = zR * sm((x - hw * 0.35) / (hw * 0.65));
        pa[i * 3] = x + (l - rr) * 0.2 * (0.35 + n) + (f + r) * (n2 - 0.5) * 0.1;
        pa[i * 3 + 1] = y - (f + r) * 0.12 * n * (y > 0.55 ? 1 : 0.2) + (l + rr) * (n - 0.5) * 0.06;
        pa[i * 3 + 2] = zz + (f - r) * 0.42 * (0.3 + n);
        const shade = 1 - Math.min(0.62, (f + r + l + rr) * (0.15 + 0.7 * n2));
        ca[i * 3] = (it.col[i * 3] as number) * shade; ca[i * 3 + 1] = (it.col[i * 3 + 1] as number) * shade; ca[i * 3 + 2] = (it.col[i * 3 + 2] as number) * shade;
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
  }

  /** Pose from the sim state. t = time (for flicker). */
  update(c: CarState, t: number, steerVis = c.steer): void {
    this.root.position.set(c.x, c.y, c.z);
    this.root.rotation.set(0, -c.h, 0);
    this.body.rotation.set(c.gPitch - c.pitch, 0, c.gRoll + c.roll + (this.moto ? Math.max(-0.5, Math.min(0.5, -c.r * c.speed * 0.035)) : 0), 'YXZ');
    this.body.position.y = 0.02 + Math.sin(t * 30) * 0.004 * Math.min(1, c.speed / 20);
    const spin = -c.wheelSpin * (0.34 / this.wheelR);
    this.spins.forEach((s) => (s.rotation.x = spin));
    if (this.wheels[0]) this.wheels[0].rotation.y = -steerVis;
    if (this.wheels[1]) this.wheels[1].rotation.y = -steerVis;
    // wheels follow the body tilt a little (suspension look)
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i] as THREE.Group, p = this.tpl?.wheelPos[i];
      if (!p) continue;
      w.position.y = p.y + (c.airborne ? -0.08 : 0);
    }
    if (this.flame) {
      this.flame.visible = c.boosting;
      if (c.boosting) this.flame.scale.set(1, 1, 0.8 + Math.sin(t * 60) * 0.25 + Math.random() * 0.15);
    }
  }

  dispose(): void { this.root.removeFromParent(); this.paintMat.dispose(); this.rimMat.dispose(); this.vinylMat.dispose(); }
}
