/** Scene3D: renderer, lights, sky, streamed city, car visuals, pickups, items, race props, effects. Reads a DriveSim. */
import * as THREE from 'three';
import { DISTRICTS, type DriveConfig, type ItemId } from '../drive/contract';
import type { DriveSim, SimEvent } from '../drive/sim/world';
import { ChaseCam } from './camera';
import { CarVisual } from './carMesh';
import type { City } from './city';
import { CityMesh } from './cityMesh';
import { Particles, SkidMarks } from './fx';
import { Sky } from './sky';
import { lightState, type Light } from '../drive/sim/lights';
import { kitModel, kitObject, loadKit, partGeometry, setKitMaterials } from './kit';
import { textTexture, toon, toonGradient } from './toon';

export const QUALITY = {
  low: { pr: 0.75, shadows: false, outlines: false, draw: 300, traffic: 8, shadowSize: 0, particles: 0.5 },
  medium: { pr: 1.25, shadows: true, outlines: true, draw: 460, traffic: 14, shadowSize: 1024, particles: 1 },
  high: { pr: 2, shadows: true, outlines: true, draw: 620, traffic: 20, shadowSize: 2048, particles: 1 },
} as const;

const ITEM_COLORS: Record<ItemId, string> = { oil: '#2b2233', cones: '#ff8a2a', glue: '#9be36a', boostpad: '#2dc4e8', mine: '#ff7fb0', smoke: '#d8dde3' };

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly chase: ChaseCam;
  readonly cityMesh: CityMesh;
  private sky: Sky;
  private sun: THREE.DirectionalLight;
  private cars = new Map<number, CarVisual>();
  private fx: Particles;
  private skids = new SkidMarks();
  private coinMesh: THREE.InstancedMesh;
  private coinIds: { id: string; x: number; y: number; z: number }[] = [];
  private boxMesh: THREE.InstancedMesh;
  private boxIds: { id: string; x: number; y: number; z: number }[] = [];
  private parcels: { id: string; m: THREE.Object3D }[] = [];
  private pads: THREE.Object3D[] = [];
  private coinGlow: THREE.InstancedMesh | null = null;
  private boxGlow: THREE.InstancedMesh | null = null;
  private disposed = false;
  kitLoaded = false;
  private itemMeshes = new Map<number, THREE.Object3D>();
  private raceGroup = new THREE.Group();
  private raceKey = '';
  private gateMeshes: { key: string; boxes: THREE.Object3D[] }[] = [];
  private labels: HTMLDivElement;
  private labelEls: HTMLDivElement[] = [];
  private fogBase: THREE.Color;
  private q: (typeof QUALITY)[keyof typeof QUALITY];
  private t = 0;
  private dummy = new THREE.Object3D();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(readonly container: HTMLElement, readonly city: City, cfg: DriveConfig) {
    this.q = QUALITY[cfg.quality] ?? QUALITY.medium;
    this.renderer = new THREE.WebGLRenderer({ antialias: cfg.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:Rubik,"Segoe UI",Arial,sans-serif';
    container.appendChild(this.labels);

    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    this.chase = new ChaseCam(w / h, this.q.draw * 1.5);
    this.renderer.setSize(w, h, false);
    this.fogBase = new THREE.Color('#cfe6f5');
    this.scene.fog = new THREE.Fog(this.fogBase.clone(), this.q.draw * 0.35, this.q.draw);
    this.scene.background = this.fogBase.clone();

    const sunDir = new THREE.Vector3(-0.45, 0.8, -0.35).normalize();
    this.sky = new Sky(this.q.draw * 1.35, sunDir);
    this.scene.add(this.sky.group);
    this.scene.add(new THREE.HemisphereLight('#d6ecff', '#8f8570', 1.35));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    this.sun.position.copy(sunDir).multiplyScalar(150);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      const s = 70;
      Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 400 });
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.5;
    }
    this.scene.add(this.sun, this.sun.target);

    this.cityMesh = new CityMesh(city, cfg.cleaned, { outlines: this.q.outlines, shadows: this.q.shadows });
    this.scene.add(this.cityMesh.group);
    this.fx = new Particles(this.renderer.getPixelRatio());
    this.fx.scale = this.q.particles;
    this.scene.add(this.fx.points, this.skids.mesh, this.raceGroup);

    // pickups: coins + item boxes instanced, nitro pads + parcels as meshes
    const coins = city.pickups.filter((p) => p.kind === 'coin');
    this.coinIds = coins.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z }));
    this.coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 16).rotateX(Math.PI / 2), toon('#ffd23f', { emissive: '#7a5a00', emissiveIntensity: 0.6 }), Math.max(1, coins.length));
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
    const boxes = city.pickups.filter((p) => p.kind === 'item');
    this.boxIds = boxes.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z }));
    const qTex = textTexture('?', { w: 128, h: 128, bg: '#ff7fb0', fg: '#ffffff', border: '#ffffff' });
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshToonMaterial({ map: qTex, gradientMap: toonGradient(), emissive: '#ff7fb0', emissiveIntensity: 0.25 }), Math.max(1, boxes.length));
    this.boxMesh.frustumCulled = false;
    this.scene.add(this.boxMesh);
    const padGeo = new THREE.PlaneGeometry(3.4, 5).rotateX(-Math.PI / 2);
    const padTex = chevronTexture();
    for (const p of city.pickups.filter((q) => q.kind === 'nitro')) {
      const e = city.edges[city.edgeAt(p.x, p.z)];
      const m = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, color: '#5fe0ff' }));
      m.position.set(p.x, p.y + 0.1, p.z);
      if (e) { const a = city.nodes[e.a]!, b = city.nodes[e.b]!; m.rotation.y = -Math.atan2(b.x - a.x, -(b.z - a.z)); }
      this.scene.add(m);
      this.pads.push(m);
    }
    for (const p of city.pickups.filter((q) => q.kind === 'parcel')) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), toon('#c9a66b', { emissive: '#ffd23f', emissiveIntensity: 0.35 }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.18, depthWrite: false }));
      beam.position.y = 15;
      g.add(box, beam);
      g.position.set(p.x, p.y, p.z);
      this.scene.add(g);
      this.parcels.push({ id: p.id, m: g });
    }
    // POI rings
    for (const p of city.pois) {
      const c = p.kind === 'race' ? '#ffffff' : p.kind === 'lesson' ? '#ffd23f' : p.kind === 'garage' ? '#ff7f6e' : p.kind === 'shop' ? '#4ad6c8' : p.kind === 'fuel' ? '#7fd957' : '#b79ae0';
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.radius - 0.8, p.radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthWrite: false }));
      ring.position.set(p.x, city.heightAt(p.x, p.z) + 0.15, p.z);
      ring.renderOrder = 3;
      this.scene.add(ring);
      if (p.kind === 'race') {
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: textTexture(p.label, { bg: '#1b1f2a', fg: '#fff', border: '#ffd23f' }), side: THREE.DoubleSide, transparent: true }));
        flag.position.set(p.x, city.heightAt(p.x, p.z) + 5, p.z);
        flag.userData.billboard = true;
        this.scene.add(flag);
      }
    }
    this.resize();
    setKitMaterials(toon(0xffffff, { vertexColors: true }), toon(0xffffff, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.6 }), toonGradient);
    void loadKit().then(() => { if (!this.disposed) this.onKit(); });
  }

  /** The art kit arrived: swap code shapes for the models. */
  private onKit(): void {
    this.kitLoaded = true;
    this.cityMesh.kitReady();
    const swapInst = (old: THREE.InstancedMesh, name: string, scale: number, emissive: string): [THREE.InstancedMesh, THREE.InstancedMesh | null] => {
      const m = kitModel(name);
      if (!m || !m.fixed) return [old, null];
      const geo = partGeometry(m.fixed).scale(scale, scale, scale);
      const inst = new THREE.InstancedMesh(geo, toon(0xffffff, { vertexColors: true, emissive, emissiveIntensity: 0.25 }), old.count);
      inst.frustumCulled = false;
      this.scene.remove(old); this.scene.add(inst);
      let glow: THREE.InstancedMesh | null = null;
      if (m.glow) {
        glow = new THREE.InstancedMesh(partGeometry(m.glow).scale(scale, scale, scale), toon(0xffffff, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.7 }), old.count);
        glow.frustumCulled = false;
        this.scene.add(glow);
      }
      return [inst, glow];
    };
    [this.coinMesh, this.coinGlow] = swapInst(this.coinMesh, 'coin', 1.4, '#7a5a00');
    [this.boxMesh, this.boxGlow] = swapInst(this.boxMesh, 'item_box', 1.2, '#ff7fb0');
    // nitro pads
    for (const old of this.pads) {
      const o = kitObject('nitro_pad');
      if (!o) break;
      o.position.copy(old.position); o.position.y -= 0.08;
      o.rotation.y = old.rotation.y;
      o.scale.set(0.9, 1, 1.5);
      this.scene.remove(old); this.scene.add(o);
    }
    for (const p of this.parcels) {
      const o = kitObject('parcel');
      if (!o) break;
      o.position.y = 0.6;
      o.scale.setScalar(1.2);
      const box = p.m.children[0];
      if (box) p.m.remove(box);
      p.m.add(o);
    }
    this.raceKey = '';   // rebuild race props with kit gates
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.chase.cam.aspect = w / h;
    this.chase.cam.updateProjectionMatrix();
  }

  private visualFor(sim: DriveSim, i: number): CarVisual | null {
    const d = sim.drivers[i];
    if (!d) return null;
    let v = this.cars.get(d.car.id);
    if (!v) {
      const detail = d.kind !== 'traffic';
      v = new CarVisual(d.look, { outline: this.q.outlines && detail, shadow: this.q.shadows && d.kind === 'player', detail });
      this.cars.set(d.car.id, v);
      this.scene.add(v.root);
    }
    return v;
  }

  setPlayerLook(sim: DriveSim): void { this.cars.get(sim.player.id)?.apply(sim.playerDriver.look); }

  handleEvents(events: SimEvent[], sim: DriveSim): void {
    for (const e of events) {
      if (e.t === 'crash') { this.fx.sparks(e.x, sim.player.y, e.z, Math.min(24, Math.round(e.v * 1.5))); if (e.driver === 0) this.chase.shake(Math.min(1, e.v / 20)); }
      else if (e.t === 'land') { this.chase.shake(Math.min(0.8, e.v / 14)); const p = sim.player; for (let k = 0; k < 10; k++) this.fx.dust(p.x + (Math.random() - 0.5) * 3, p.y, p.z + (Math.random() - 0.5) * 3, 1); }
      else if (e.t === 'raceEnd') { const p = sim.player; this.fx.confetti(p.x, p.y, p.z, 80); }
      else if (e.t === 'turbo' && e.driver === 0) this.chase.shake(0.15 * e.tier);
    }
  }

  render(sim: DriveSim, dt: number, look: boolean): void {
    this.t += dt;
    const p = sim.player;
    // cars
    const alive = new Set<number>();
    for (let i = 0; i < sim.drivers.length; i++) {
      const d = sim.drivers[i]!;
      if (d.kind === 'traffic' && Math.hypot(d.car.x - p.x, d.car.z - p.z) > this.q.draw) continue;
      const v = this.visualFor(sim, i);
      if (!v) continue;
      alive.add(d.car.id);
      v.update(d.car, this.t);
      v.root.visible = d.car.ghostT <= 0 || Math.floor(this.t * 12) % 2 === 0 || d.kind !== 'player';
      this.carFx(d.car, d.kind === 'player', i);
    }
    for (const [id, v] of this.cars) if (!alive.has(id)) { v.dispose(); this.cars.delete(id); }
    this.ghost(sim);
    this.trafficLights(sim, dt);
    // camera
    this.chase.mode = sim.race?.state === 'done' ? 'orbit' : look ? 'back' : this.chase.mode === 'garage' ? 'garage' : 'chase';
    this.chase.update(p, dt, this.city.statics);
    const cam = this.chase.cam;
    // district tint for sky and fog
    const dist = DISTRICTS[this.city.districtAt(p.x, p.z) - 1];
    if (dist) {
      const dirty = !this.cleanedSet.has(dist.id);
      const hz = new THREE.Color(dist.palette.sky).lerp(new THREE.Color('#ffffff'), 0.35);
      if (dirty) hz.lerp(new THREE.Color('#9a98a6'), 0.45);
      this.fogBase.lerp(hz, 1 - Math.exp(-dt * 1.5));
      const fog = this.scene.fog as THREE.Fog;
      fog.color.copy(this.fogBase);
      (this.scene.background as THREE.Color).copy(this.fogBase);
      this.sky.setColors(new THREE.Color(dist.palette.sky).multiplyScalar(dirty ? 0.7 : 0.82), this.fogBase);
      fog.far += ((dirty ? this.q.draw * 0.7 : this.q.draw) - fog.far) * (1 - Math.exp(-dt));
      fog.near = fog.far * 0.35;
    }
    this.sky.update(cam, this.t);
    this.sun.position.set(p.x - 70, p.y + 130, p.z - 55);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.cityMesh.update(p.x, p.z, this.q.draw, 2);
    this.pickups(sim);
    this.items(sim);
    this.race(sim);
    this.fx.update(dt);
    this.scene.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(cam.quaternion); });
    this.renderer.render(this.scene, cam);
    this.updateLabels(sim);
  }

  private lightPoles = new Map<number, { g: THREE.Group; lamps: { m: THREE.MeshBasicMaterial; axisX: boolean; kind: Light }[] }>();
  private lightT = 0;
  private static LAMP_ON: Record<Light, string> = { red: '#ff3b3b', yellow: '#ffd23f', green: '#3bff7a' };
  /** Traffic-light poles around the player (pooled), lamps follow the sim cycle. */
  private trafficLights(sim: DriveSim, dt: number): void {
    const p = sim.player;
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.5;
      const near = new Set<number>();
      for (const [id] of this.city.signals) {
        const n = this.city.nodes[id];
        if (n && Math.abs(n.x - p.x) < 240 && Math.abs(n.z - p.z) < 240) near.add(id);
      }
      for (const [id, v] of this.lightPoles) if (!near.has(id)) { this.scene.remove(v.g); this.lightPoles.delete(id); }
      for (const id of near) {
        if (this.lightPoles.has(id)) continue;
        const n = this.city.nodes[id];
        if (!n) continue;
        const hw = Math.max(...n.edges.map((e) => (this.city.edges[e]?.width ?? 11) / 2)) + 1.6;
        const g = new THREE.Group();
        const lamps: { m: THREE.MeshBasicMaterial; axisX: boolean; kind: Light }[] = [];
        const y0 = this.city.heightAt(n.x, n.z);
        for (const [sx, sz, axisX] of [[1, 1, true], [-1, -1, true], [1, -1, false], [-1, 1, false]] as [number, number, boolean][]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 6), toon('#3b3f4a'));
          pole.position.set(n.x + sx * hw, y0 + 2.1, n.z + sz * hw);
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), toon('#2b2f3a'));
          box.position.set(n.x + sx * hw, y0 + 4.9, n.z + sz * hw);
          g.add(pole, box);
          (['red', 'yellow', 'green'] as Light[]).forEach((kind, k) => {
            const m = new THREE.MeshBasicMaterial({ color: '#333' });
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), m);
            s.position.set(n.x + sx * hw, y0 + 5.4 - k * 0.5, n.z + sz * hw);
            s.scale.set(1.5, 1, 1.5);
            g.add(s);
            lamps.push({ m, axisX, kind });
          });
        }
        this.scene.add(g);
        this.lightPoles.set(id, { g, lamps });
      }
    }
    for (const [id, v] of this.lightPoles) {
      const off = this.city.signals.get(id) ?? 0;
      const sx = lightState(sim.time, off, true), sz = lightState(sim.time, off, false);
      for (const l of v.lamps) {
        const on = (l.axisX ? sx : sz) === l.kind;
        l.m.color.set(on ? Scene3D.LAMP_ON[l.kind] : '#2a2c33');
      }
    }
  }

  private ghostVis: CarVisual | null = null;
  private ghostMade = false;
  /** Time-trial ghost: a see-through copy of the player's car on the best run. */
  private ghost(sim: DriveSim): void {
    const gp = sim.ghostPose();
    if (!gp) { if (this.ghostVis) this.ghostVis.root.visible = false; return; }
    if (!this.ghostVis) {
      this.ghostVis = new CarVisual(sim.playerDriver.look, { outline: false, shadow: false, detail: false });
      this.ghostMade = false;
      this.scene.add(this.ghostVis.root);
    }
    const v = this.ghostVis;
    if (v.isReady && !this.ghostMade) {
      this.ghostMade = true;
      v.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.Material).clone() as THREE.MeshToonMaterial;
        mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false;
        if ('emissive' in mat) { mat.emissive = new THREE.Color('#7fd4ff'); mat.emissiveIntensity = 0.5; }
        m.material = mat;
        m.castShadow = false;
      });
    }
    v.root.visible = true;
    v.root.position.set(gp.x, gp.y, gp.z);
    v.root.rotation.set(0, -gp.h, 0);
  }

  private cleanedSet = new Set<number>();
  setCleaned(c: number[]): void { this.cleanedSet = new Set(c); this.cityMesh.setCleaned(c); }

  private carFx(c: import('../drive/sim/car').CarState, player: boolean, idx: number): void {
    const fx = Math.sin(c.h), fz = -Math.cos(c.h), rx = Math.cos(c.h), rz = Math.sin(c.h);
    const back = c.dims.b, tw = c.dims.track / 2;
    for (const sd of [-1, 1]) {
      const wx = c.x - fx * back + rx * tw * sd, wz = c.z - fz * back + rz * tw * sd;
      const on = !c.airborne && c.skid > 0.3 && c.surface === 0;
      if (idx < 12) this.skids.mark(`${c.id}${sd}`, wx, c.y, wz, rx, rz, 0.32, on ? Math.min(1, c.skid) : 0);
      if (on && Math.random() < c.skid * 0.9) this.fx.smoke(wx, c.y, wz, c.skid, false);
      if (!c.airborne && c.surface !== 0 && c.speed > 8 && Math.random() < 0.5) this.fx.dust(wx, c.y, wz, c.speed / 30);
    }
    if (c.boosting && (player || Math.random() < 0.5)) {
      const tier = c.turboOut || (c.boostT > 0 && !player ? 0 : 0);
      this.fx.boost(c.x - fx * (c.dims.length / 2 + 0.3), c.y + 0.45, c.z - fz * (c.dims.length / 2 + 0.3), -fx * 6 + c.vx * 0.6, -fz * 6 + c.vz * 0.6, tier);
    }
    if (player && c.drifting && c.driftTier > 0) {
      const t = c.driftTier;
      const col: [number, number, number] = t >= 3 ? [1, 0.45, 1] : t === 2 ? [1, 0.6, 0.2] : [0.45, 0.8, 1];
      for (const sd of [-1, 1]) this.fx.emit(c.x - fx * back + rx * tw * sd, c.y + 0.2, c.z - fz * back + rz * tw * sd, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 0.3, 0, col[0], col[1], col[2], 1, 6);
    }
    if (c.bubbleT > 0) this.fx.emit(c.x, c.y + 1.5, c.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.6, 0.9, 1, 1, 0.6, 0.9, 0.5);
  }

  private pickups(sim: DriveSim): void {
    const t = this.t;
    this.coinIds.forEach((c, i) => {
      if (!sim.pickupVisible(c.id, 'coin')) { this.coinMesh.setMatrixAt(i, this.zero); this.coinGlow?.setMatrixAt(i, this.zero); return; }
      this.dummy.position.set(c.x, c.y + Math.sin(t * 3 + i) * 0.15, c.z);
      this.dummy.rotation.set(0, t * 3 + i * 0.3, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.coinMesh.setMatrixAt(i, this.dummy.matrix);
      this.coinGlow?.setMatrixAt(i, this.dummy.matrix);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
    if (this.coinGlow) this.coinGlow.instanceMatrix.needsUpdate = true;
    this.boxIds.forEach((c, i) => {
      if (!sim.pickupVisible(c.id, 'item')) { this.boxMesh.setMatrixAt(i, this.zero); this.boxGlow?.setMatrixAt(i, this.zero); return; }
      this.dummy.position.set(c.x, c.y + Math.sin(t * 2 + i) * 0.2, c.z);
      this.dummy.rotation.set(0.4, t * 1.5 + i, 0.2);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.boxMesh.setMatrixAt(i, this.dummy.matrix);
      this.boxGlow?.setMatrixAt(i, this.dummy.matrix);
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;
    if (this.boxGlow) this.boxGlow.instanceMatrix.needsUpdate = true;
    for (const p of this.parcels) { p.m.visible = sim.pickupVisible(p.id, 'parcel'); p.m.rotation.y = t; }
  }

  private items(sim: DriveSim): void {
    const seen = new Set<number>();
    for (const it of sim.items) {
      seen.add(it.id);
      let m = this.itemMeshes.get(it.id);
      if (!m) { m = itemMesh(it.kind); this.itemMeshes.set(it.id, m); this.scene.add(m); }
      m.position.set(it.x, it.y, it.z);
      if (it.kind === 'cones') m.rotation.set(it.spin, it.spin * 0.7, 0);
      if (it.kind === 'mine') { m.rotation.y = this.t * 2; m.position.y += Math.sin(this.t * 4) * 0.1; }
      if (it.kind === 'smoke') { m.scale.setScalar(it.r / 7); for (let k = 0; k < 2; k++) this.fx.smoke(it.x + (Math.random() - 0.5) * it.r, it.y, it.z + (Math.random() - 0.5) * it.r, 2, false); }
      if (it.kind === 'boostpad') (m as THREE.Mesh).rotation.y = this.t;
    }
    for (const [id, m] of this.itemMeshes) if (!seen.has(id)) { this.scene.remove(m); this.itemMeshes.delete(id); }
  }

  /** Race props: checkpoint arches, start line, quiz boxes. */
  private race(sim: DriveSim): void {
    const race = sim.race;
    const key = race ? race.def.id + race.lapLen.toFixed(0) : '';
    if (key !== this.raceKey) {
      this.raceKey = key;
      this.raceGroup.clear();
      this.gateMeshes = [];
      if (race) {
        const arch = (s: number, color: string, start: boolean): void => {
          const p = race.track.sample(s), hw = race.track.pt(p.i).hw + 1.2;
          const y = this.city.heightAt(p.x, p.z);
          const kg = kitObject('checkpoint_gate', color);
          if (kg) {
            const sc = (hw * 2 + 1) / 12;
            kg.scale.setScalar(sc);
            kg.position.set(p.x, y, p.z);
            kg.rotation.y = -Math.atan2(p.dx, -p.dz);
            this.raceGroup.add(kg);
            if (!start) return;
          }
          const g = new THREE.Group();
          const mat = toon(color);
          for (const sd of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), mat); post.position.set(sd * hw, 3, 0); g.add(post); }
          const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, start ? 1.6 : 0.6, 0.6), start ? new THREE.MeshBasicMaterial({ map: checkerTexture() }) : mat);
          bar.position.y = 6;
          g.add(bar);
          g.position.set(p.x, y, p.z);
          g.rotation.y = -Math.atan2(p.dx, -p.dz);
          if (!kg) this.raceGroup.add(g);
          if (start) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: checkerTexture(), depthWrite: false }));
            line.position.set(p.x, y + 0.12, p.z);
            line.rotation.y = g.rotation.y;
            this.raceGroup.add(line);
          }
        };
        arch(0, '#ffd23f', true);
        for (let k = 1; k < race.cpCount; k++) arch((k / race.cpCount) * race.lapLen, '#4ad6c8', false);
        // route arrows on the road
        const arrowTex = chevronTexture();
        for (let s = 20; s < race.lapLen - 10; s += 30) {
          const p = race.track.sample(s);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.55 }));
          m.position.set(p.x, this.city.heightAt(p.x, p.z) + 0.11, p.z);
          m.rotation.y = -Math.atan2(p.dx, -p.dz);
          this.raceGroup.add(m);
        }
      }
    }
    if (!race) return;
    // quiz boxes for the current groups
    const want = race.groups.filter((g) => !g.resolved);
    this.gateMeshes = this.gateMeshes.filter((gm) => {
      if (want.some((g) => g.key === gm.key)) return true;
      gm.boxes.forEach((b) => this.raceGroup.remove(b));
      return false;
    });
    const cols = ['#e55a4e', '#4a90e2', '#7fd957'];
    for (const g of want) {
      if (this.gateMeshes.some((gm) => gm.key === g.key)) continue;
      const sp = race.track.sample(g.s);
      const boxes = g.boxes.map((b) => {
        const kb = kitObject('answer_box', cols[b.opt] ?? '#fff');
        const m: THREE.Object3D = kb ?? new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), toon(cols[b.opt] ?? '#fff', { transparent: true, opacity: 0.85, emissive: cols[b.opt], emissiveIntensity: 0.3 }));
        if (kb) { kb.scale.setScalar(1.1); kb.rotation.y = Math.atan2(sp.dx, sp.dz); }
        m.position.set(b.x, this.city.heightAt(b.x, b.z) + (kb ? 0.1 : 1.3), b.z);
        m.userData.opt = b.opt;
        this.raceGroup.add(m);
        return m;
      });
      this.gateMeshes.push({ key: g.key, boxes });
    }
    for (const gm of this.gateMeshes) gm.boxes.forEach((b, i) => { if (!this.kitLoaded) b.rotation.y = this.t + i; b.position.y += Math.sin(this.t * 3 + i) * 0.004; });
    // rival ghost / time trial ghost could go here (not in this slice)
  }

  /** DOM labels for the nearest quiz boxes (answers, Hebrew). */
  private updateLabels(sim: DriveSim): void {
    const race = sim.race;
    const cam = this.chase.cam;
    const p = sim.player;
    const items: { x: number; y: number; z: number; text: string; color: string; sx: number; sy: number; ok: boolean }[] = [];
    if (race) {
      const cols = ['#e55a4e', '#4a90e2', '#3f9a2c'];
      for (const gm of this.gateMeshes) {
        const g = race.groups.find((q) => q.key === gm.key);
        if (!g) continue;
        for (const b of gm.boxes) {
          if (Math.hypot(b.position.x - p.x, b.position.z - p.z) > 75) continue;
          const opt = b.userData.opt as number;
          items.push({ x: b.position.x, y: b.position.y + (this.kitLoaded ? 2.3 : 2), z: b.position.z, text: g.gate.options[opt] ?? '', color: cols[opt] ?? '#333', sx: 0, sy: 0, ok: false });
        }
      }
    }
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const small = Math.min(w, h) < 420;
    const v = new THREE.Vector3();
    for (const it of items) {
      v.set(it.x, it.y, it.z).project(cam);
      it.ok = v.z <= 1 && Math.abs(v.x) < 1.2;
      it.sx = ((v.x + 1) / 2) * w; it.sy = ((1 - v.y) / 2) * h;
    }
    // push overlapping labels apart vertically (far boxes project close together)
    const order = items.filter((it) => it.ok).sort((a, b) => a.sx - b.sx);
    const lw = (t: string): number => t.length * (small ? 8 : 9.5) + 26;
    for (let i = 1; i < order.length; i++) {
      const a = order[i] as (typeof items)[number];
      for (let j = 0; j < i; j++) {
        const b = order[j] as (typeof items)[number];
        if (Math.abs(a.sx - b.sx) < (lw(a.text) + lw(b.text)) / 2 && Math.abs(a.sy - b.sy) < 28) a.sy = b.sy - 30;
      }
    }
    while (this.labelEls.length < items.length) {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;transform:translate(-50%,-100%);padding:2px 9px;border-radius:10px;color:#fff;font-weight:700;font-size:${small ? 12 : 15}px;white-space:nowrap;direction:rtl;border:2px solid #fff;box-shadow:0 2px 6px #0006`;
      this.labels.appendChild(el);
      this.labelEls.push(el);
    }
    this.labelEls.forEach((el, i) => {
      const it = items[i];
      if (!it || !it.ok) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.left = `${it.sx}px`;
      el.style.top = `${it.sy}px`;
      el.style.background = it.color;
      if (el.textContent !== it.text) el.textContent = it.text;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}

function itemMesh(kind: ItemId): THREE.Object3D {
  const c = ITEM_COLORS[kind];
  const k = kitObject(`item_${kind}`);
  if (k) {
    if (kind === 'oil' || kind === 'glue') k.scale.set(1.8, 1, 2.6);
    if (kind === 'boostpad') k.scale.set(1.6, 1, 2.6);
    if (kind === 'mine') { k.scale.setScalar(1.4); k.position.y = -0.9; const w = new THREE.Group(); w.add(k); return w; }
    if (kind === 'smoke') k.scale.setScalar(2.2);
    return k;
  }
  switch (kind) {
    case 'oil': case 'glue': {
      const m = new THREE.Mesh(new THREE.CircleGeometry(2.7, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: kind === 'oil' ? 0.85 : 0.75, depthWrite: false }));
      m.renderOrder = 3;
      return m;
    }
    case 'boostpad': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chevronTexture(), color: c, transparent: true, depthWrite: false }));
      return m;
    }
    case 'cones': {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 10), toon(c));
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.15, 10), toon('#ffffff'));
      stripe.position.y = 0.05;
      g.add(cone, stripe);
      return g;
    }
    case 'mine': {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient(), transparent: true, opacity: 0.7 })));
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      shine.position.set(-0.35, 0.4, -0.5);
      g.add(shine);
      return g;
    }
    default: {
      return new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false }));
    }
  }
}

let chev: THREE.CanvasTexture | null = null;
function chevronTexture(): THREE.CanvasTexture {
  if (chev) return chev;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 96;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(8, 50 + k * 34 - 20); g.lineTo(32, 26 + k * 34 - 20); g.lineTo(56, 50 + k * 34 - 20); g.lineTo(56, 64 + k * 34 - 20); g.lineTo(32, 40 + k * 34 - 20); g.lineTo(8, 64 + k * 34 - 20); g.closePath(); g.fill(); }
  chev = new THREE.CanvasTexture(cv);
  return chev;
}
let checker: THREE.CanvasTexture | null = null;
function checkerTexture(): THREE.CanvasTexture {
  if (checker) return checker;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 16;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
  checker = new THREE.CanvasTexture(cv);
  checker.magFilter = THREE.NearestFilter;
  return checker;
}
