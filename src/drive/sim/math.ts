/** Small math helpers. Plane coordinates (x, z): x east, z south. Heading h: 0 = north (-z), clockwise positive.
 * forward = (sin h, -cos h), right = (cos h, sin h). In (x, z) math, h grows like a standard 2D angle, so a yaw rate
 * r = dh/dt acts as the usual 2D angular velocity: point velocity = v + (-r * rz, r * rx). */
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v < 0 ? -1 : 1);
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
/** Move v toward target by at most step. */
export function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}
export const cross2 = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;
export const fwdX = (h: number): number => Math.sin(h);
export const fwdZ = (h: number): number => -Math.cos(h);
/** Heading of a direction vector. */
export const headingOf = (dx: number, dz: number): number => Math.atan2(dx, -dz);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Distance from a point to a segment, plus the param t (0..1). */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return { d: Math.sqrt(qx * qx + qz * qz), t };
}
