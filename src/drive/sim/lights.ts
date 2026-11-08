/** Traffic lights: a fixed 20 s cycle per signalised node (x-axis roads first), offset per node. Pure. */
export type Light = 'green' | 'yellow' | 'red';
export const LIGHT_CYCLE = 20;
const GREEN = 8, YELLOW = 2;

/** State for traffic travelling along the x axis (axisX) or the z axis at sim time t. */
export function lightState(t: number, offset: number, axisX: boolean): Light {
  let u = (((t + offset) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (!axisX) u = (u + LIGHT_CYCLE / 2) % LIGHT_CYCLE;
  return u < GREEN ? 'green' : u < GREEN + YELLOW ? 'yellow' : 'red';
}
