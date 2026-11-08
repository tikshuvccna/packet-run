/** Chase camera: spring yaw that leans toward the travel direction (drifts read well), look-ahead, speed FOV, shake,
 * wall avoidance, look-back, finish orbit. */
import * as THREE from 'three';
import type { CarState } from '../drive/sim/car';
import { clamp, wrapAngle } from '../drive/sim/math';
import type { StaticWorld } from '../drive/sim/statics';

export type CamMode = 'chase' | 'back' | 'orbit' | 'garage';

export class ChaseCam {
  readonly cam: THREE.PerspectiveCamera;
  private yaw = 0;
  private fov = 62;
  private shakeA = 0;
  private dist = 7.5;
  private hgt = 2.8;
  private orbitA = 0;
  private y = 0;
  private boostLag = 0;
  mode: CamMode = 'chase';

  constructor(aspect: number, far: number) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.3, far);
  }

  shake(a: number): void { this.shakeA = Math.min(1, this.shakeA + a); }

  snap(c: CarState): void { this.yaw = c.h; this.y = c.y; this.update(c, 1, null, 1); }

  update(c: CarState, dt: number, statics: StaticWorld | null, k = 0): void {
    const sp = c.speed;
    const velH = Math.atan2(c.vx, -c.vz);
    let target = c.h;
    if (sp > 6 && c.vf > 0) target = c.h + clamp(wrapAngle(velH - c.h), -0.7, 0.7) * 0.6;
    if (c.vf < -2) target = c.h;   // reversing: stay behind
    const yr = k || 1 - Math.exp(-dt * (c.drifting ? 3.2 : 5));
    this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * yr);
    this.boostLag += ((c.boosting ? 1 : 0) - this.boostLag) * (1 - Math.exp(-dt * 3));
    const wantD = 6.8 + Math.min(3.2, sp * 0.055) + this.boostLag * 1.4;
    const wantH = 2.5 + Math.min(1.2, sp * 0.02);
    this.dist += (wantD - this.dist) * (k || 1 - Math.exp(-dt * 3));
    this.hgt += (wantH - this.hgt) * (k || 1 - Math.exp(-dt * 3));
    this.y += (c.y - this.y) * (k || 1 - Math.exp(-dt * (c.airborne ? 4 : 10)));
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let px: number, py: number, pz: number, lx: number, ly: number, lz: number;
    if (this.mode === 'orbit' || this.mode === 'garage') {
      this.orbitA += dt * (this.mode === 'garage' ? 0.25 : 0.4);
      const r = this.mode === 'garage' ? 7.5 : 9;
      px = c.x + Math.sin(this.orbitA) * r; pz = c.z + Math.cos(this.orbitA) * r; py = c.y + (this.mode === 'garage' ? 2.2 : 3.2);
      lx = c.x; ly = c.y + 0.9; lz = c.z;
    } else if (this.mode === 'back') {
      px = c.x + Math.sin(c.h) * 6; pz = c.z - Math.cos(c.h) * 6; py = this.y + 2.4;
      lx = c.x - Math.sin(c.h) * 12; ly = c.y + 1; lz = c.z + Math.cos(c.h) * 12;
    } else {
      let d = this.dist;
      // pull in when a wall is between the car and the camera
      if (statics) for (let s = 2; s <= d; s += 1.5) if (statics.blocked(c.x - fx * s, c.z - fz * s, 0.6)) { d = Math.max(3, s - 1.2); break; }
      px = c.x - fx * d; pz = c.z - fz * d; py = this.y + this.hgt + (d < this.dist ? (this.dist - d) * 0.25 : 0);
      const la = 3.5 + Math.min(10, sp * 0.18);
      lx = c.x + Math.sin(c.h) * la; ly = c.y + 1.2; lz = c.z - Math.cos(c.h) * la;
    }
    if (this.shakeA > 0.001) {
      const s = this.shakeA * 0.35;
      px += (Math.random() - 0.5) * s; py += (Math.random() - 0.5) * s; pz += (Math.random() - 0.5) * s;
      this.shakeA *= Math.exp(-dt * 7);
    }
    // gentle high-speed rumble
    if (sp > 30) py += Math.sin(performance.now() * 0.05) * 0.015 * (sp - 30) / 20;
    this.cam.position.set(px, py, pz);
    this.cam.lookAt(lx, ly, lz);
    const wantFov = 60 + Math.min(16, sp * 0.3) + this.boostLag * 9 + (this.mode === 'garage' ? -14 : 0);
    this.fov += (wantFov - this.fov) * (k || 1 - Math.exp(-dt * 4));
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
