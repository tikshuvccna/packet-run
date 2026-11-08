/** Particles (smoke, dust, sparks, nitro, confetti) as one Points cloud, and skid marks as a ring buffer of quads. */
import * as THREE from 'three';

const MAXP = 900;

export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAXP * 3);
  private vel = new Float32Array(MAXP * 3);
  private col = new Float32Array(MAXP * 4);
  private size = new Float32Array(MAXP);
  private life = new Float32Array(MAXP);
  private maxLife = new Float32Array(MAXP);
  private grow = new Float32Array(MAXP);
  private grav = new Float32Array(MAXP);
  private a0 = new Float32Array(MAXP);
  private next = 0;
  private geo: THREE.BufferGeometry;
  scale = 1;

  constructor(pixelRatio: number) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { pr: { value: pixelRatio * 600 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; uniform float pr; varying vec4 vC;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(psize * pr / max(1.0, -mv.z), 90.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
        float a = vC.a * smoothstep(0.5, 0.25, r); gl_FragColor = vec4(vC.rgb * (1.0 - r * 0.35), a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, r: number, g: number, b: number, a: number, grav = 0): void {
    if (this.scale < 1 && Math.random() > this.scale) return;
    const i = this.next;
    this.next = (this.next + 1) % MAXP;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.a0[i] = a; this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.grav[i] = grav;
  }

  update(dt: number): void {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i]! <= 0) { if (this.col[i * 4 + 3]! > 0) this.col[i * 4 + 3] = 0; continue; }
      this.life[i]! -= dt;
      const k = i * 3;
      this.vel[k + 1]! -= this.grav[i]! * dt;
      const drag = 1 - dt * 1.5;
      this.vel[k]! *= drag; this.vel[k + 2]! *= drag;
      this.pos[k]! += this.vel[k]! * dt; this.pos[k + 1]! += this.vel[k + 1]! * dt; this.pos[k + 2]! += this.vel[k + 2]! * dt;
      this.size[i]! += this.grow[i]! * dt;
      const f = Math.max(0, this.life[i]! / this.maxLife[i]!);
      this.col[i * 4 + 3] = this.a0[i]! * Math.min(1, f * 2.5);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('pcolor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
  }

  smoke(x: number, y: number, z: number, amt: number, dark = false): void {
    const c = dark ? 0.35 : 0.92;
    this.emit(x, y + 0.3, z, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5, 1.1 + Math.random() * 0.6, 0.8 * amt + 0.4, 2.4, c, c, c * 1.02, 0.45 * Math.min(1, amt));
  }
  dust(x: number, y: number, z: number, amt: number): void {
    this.emit(x, y + 0.2, z, (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 2, 0.9, 0.7, 2.2, 0.82, 0.72, 0.52, 0.5 * Math.min(1, amt));
  }
  sparks(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) this.emit(x, y + 0.5, z, (Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9, 0.4 + Math.random() * 0.3, 0.22, -0.2, 1, 0.85, 0.3, 1, 14);
  }
  boost(x: number, y: number, z: number, vx: number, vz: number, tier = 0): void {
    const col: [number, number, number] = tier >= 3 ? [1, 0.45, 1] : tier === 2 ? [1, 0.6, 0.2] : [0.5, 0.85, 1];
    this.emit(x, y, z, vx + (Math.random() - 0.5), 0.3 + Math.random() * 0.4, vz + (Math.random() - 0.5), 0.25, 0.38, -0.6, col[0], col[1], col[2], 0.85);
  }
  confetti(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const h = Math.random();
      const c = new THREE.Color().setHSL(h, 0.85, 0.6);
      this.emit(x, y + 1, z, (Math.random() - 0.5) * 10, 5 + Math.random() * 7, (Math.random() - 0.5) * 10, 1.6 + Math.random(), 0.35, 0, c.r, c.g, c.b, 1, 9);
    }
  }
}

const MAXQ = 2400;
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(MAXQ * 4 * 3);
  private alpha = new Float32Array(MAXQ * 4);
  private n = 0;
  private geo = new THREE.BufferGeometry();
  private last = new Map<string, { x: number; y: number; z: number; rx: number; rz: number }>();

  constructor() {
    const idx = new Uint32Array(MAXQ * 6);
    for (let q = 0; q < MAXQ; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6); }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('a', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.08,0.08,0.1, vA * 0.55); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Track point for wheel `key` at (x,y,z); width w; strength a (0 = lift the pen). rx,rz = right vector. */
  mark(key: string, x: number, y: number, z: number, rx: number, rz: number, w: number, a: number): void {
    const prev = this.last.get(key);
    if (a <= 0.05) { this.last.delete(key); return; }
    if (!prev) { this.last.set(key, { x, y, z, rx, rz }); return; }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < 0.6) return;
    if (d > 4) { this.last.set(key, { x, y, z, rx, rz }); return; }
    const q = this.n % MAXQ;
    this.n++;
    const h = w / 2, o = q * 12;
    const yy = 0.09;
    this.pos.set([prev.x - prev.rx * h, prev.y + yy, prev.z - prev.rz * h, prev.x + prev.rx * h, prev.y + yy, prev.z + prev.rz * h, x + rx * h, y + yy, z + rz * h, x - rx * h, y + yy, z - rz * h], o);
    this.alpha.set([a, a, a, a], q * 4);
    this.last.set(key, { x, y, z, rx, rz });
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('a') as THREE.BufferAttribute).needsUpdate = true;
  }
}
