/** Gradient sky dome with a sun glow, and puffy toon clouds. Follows the camera. */
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { hash2 } from '../drive/sim/rng';

export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private clouds = new THREE.Group();
  constructor(radius: number, sunDir: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#4f9be0') }, horizon: { value: new THREE.Color('#cfe6f5') }, sun: { value: sunDir.clone().normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sun), 0.0); c += vec3(1.0,0.95,0.8) * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.18);
          if (vDir.y < 0.0) c = horizon; gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
    // clouds: clusters of blobs on a ring
    const gb = new GeoBuilder();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + hash2(k, 1) * 0.3, r = radius * (0.45 + hash2(k, 2) * 0.35);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = radius * (0.16 + hash2(k, 3) * 0.12);
      const n = 4 + Math.floor(hash2(k, 4) * 4);
      for (let q = 0; q < n; q++) {
        const s = radius * 0.03 * (0.7 + hash2(k, q + 10) * 0.8);
        gb.blob(cx + (q - n / 2) * s * 1.1, cy + hash2(k, q + 20) * s * 0.5, cz + (hash2(k, q + 30) - 0.5) * s, s * 1.3, s * 0.8, s, '#ffffff');
      }
      void cy;
    }
    const cm = new THREE.Mesh(gb.build(), new THREE.MeshToonMaterial({ vertexColors: true, fog: false, emissive: 0xbcd6ec, emissiveIntensity: 0.45 }));
    cm.frustumCulled = false;
    this.clouds.add(cm);
    this.group.add(this.clouds);
  }
  setColors(top: THREE.Color, horizon: THREE.Color): void {
    (this.mat.uniforms.top as { value: THREE.Color }).value.copy(top);
    (this.mat.uniforms.horizon as { value: THREE.Color }).value.copy(horizon);
  }
  update(cam: THREE.Camera, t: number): void {
    this.group.position.set(cam.position.x, 0, cam.position.z);
    this.clouds.rotation.y = t * 0.003;
  }
}
