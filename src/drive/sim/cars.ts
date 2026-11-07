import type { CarId, CarStats } from '../contract';

/** Physical dimensions per body type (meters). a = CG to front axle, b = CG to rear axle. */
export interface CarDims { length: number; width: number; height: number; a: number; b: number; wheelR: number; track: number; cgH: number }

export const CAR_DIMS: Record<CarId, CarDims> = {
  van:   { length: 4.6, width: 2.0, height: 2.0, a: 1.35, b: 1.45, wheelR: 0.36, track: 1.7, cgH: 0.75 },
  hatch: { length: 4.0, width: 1.8, height: 1.5, a: 1.2, b: 1.25, wheelR: 0.33, track: 1.55, cgH: 0.55 },
  sport: { length: 4.5, width: 1.95, height: 1.25, a: 1.3, b: 1.35, wheelR: 0.35, track: 1.68, cgH: 0.45 },
  jeep:  { length: 4.5, width: 2.0, height: 1.95, a: 1.35, b: 1.4, wheelR: 0.42, track: 1.72, cgH: 0.8 },
  super: { length: 4.7, width: 2.0, height: 1.15, a: 1.4, b: 1.4, wheelR: 0.36, track: 1.72, cgH: 0.4 },
};

/** Reasonable default stats (used by AI rivals, traffic and the dev harness; the game computes the player's own). */
export function baseStats(car: CarId): CarStats {
  const b: Record<CarId, [number, number, number, number, number]> = {
    van: [40, 13, 1.0, 1.0, 1800], hatch: [42, 15, 1.1, 1.12, 1100], sport: [48, 17, 1.15, 1.15, 1300],
    jeep: [43, 14, 1.25, 0.95, 2000], super: [54, 19, 1.2, 1.2, 1400],
  };
  const [topSpeed, accel, grip, handling, mass] = b[car];
  return { topSpeed, accel, brake: 30, grip, handling, mass, nitroCap: 2.5, nitroRegen: 0.12, nitroPower: 1.35, armor: 0, itemSlots: 1 };
}

export const CAR_IDS: CarId[] = ['van', 'hatch', 'sport', 'jeep', 'super'];
