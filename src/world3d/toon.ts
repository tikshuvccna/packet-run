/** Toon shading helpers: 3-step gradient, material cache, inverted-hull outlines. */
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  // 3 steps: shadow, mid, lit (slightly warm)
  const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; vertexColors?: boolean; map?: THREE.Texture | null; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshToonMaterial {
  const key = JSON.stringify([new THREE.Color(color).getHexString(), opts.emissive ? new THREE.Color(opts.emissive).getHexString() : 0, opts.emissiveIntensity ?? 0, !!opts.vertexColors, opts.map?.uuid ?? 0, !!opts.transparent, opts.opacity ?? 1, opts.side ?? 0]);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color, gradientMap: toonGradient(), vertexColors: !!opts.vertexColors, map: opts.map ?? null,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
    });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    cache.set(key, m);
  }
  return m;
}

/** Outline material: back faces pushed out along the normal (smooth meshes), constant colour. */
const outlineCache = new Map<string, THREE.MeshBasicMaterial>();
export function outlineMat(thickness = 0.04, color = 0x1b1f2a): THREE.MeshBasicMaterial {
  const key = `${thickness}_${color}`;
  let m = outlineCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const t = thickness;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${t.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline_${t}`;
  outlineCache.set(key, m);
  return m;
}
/** Outline material for merged geometry whose hull is already enlarged (plain back faces). */
let hullMat: THREE.MeshBasicMaterial | null = null;
export function hullMaterial(): THREE.MeshBasicMaterial {
  if (!hullMat) hullMat = new THREE.MeshBasicMaterial({ color: 0x1b1f2a, side: THREE.BackSide, fog: true });
  return hullMat;
}

/** Add inverted-hull outlines to every mesh under root (skipping names in skip). */
export function addOutlines(root: THREE.Object3D, thickness = 0.035, skip: (o: THREE.Object3D) => boolean = () => false): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline && !skip(o)) meshes.push(o as THREE.Mesh); });
  for (const m of meshes) {
    const ol = new THREE.Mesh(m.geometry, outlineMat(thickness));
    ol.userData.outline = true;
    ol.castShadow = false; ol.receiveShadow = false;
    ol.raycast = () => {};
    m.add(ol);
  }
}

/** A canvas texture with centered Hebrew text (signs, labels). */
export function textTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; border?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = opts.bg ?? '#1b1f2a';
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, h * 0.22); g.fill();
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 8; g.stroke(); }
  g.fillStyle = opts.fg ?? '#fff';
  g.font = opts.font ?? `bold ${Math.round(h * 0.52)}px "Rubik", "Segoe UI", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl';
  let size = Math.round(h * 0.52);
  while (g.measureText(text).width > w - 40 && size > 12) { size -= 2; g.font = `bold ${size}px "Rubik", "Segoe UI", Arial, sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
