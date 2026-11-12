import type { CarId, CarStats } from '../contract';

/** Physical dimensions per body type (meters). a = CG to front axle, b = CG to rear axle. */
export interface CarDims { length: number; width: number; height: number; a: number; b: number; wheelR: number; track: number; cgH: number }

export const CAR_DIMS: Record<CarId, CarDims> = {
  van:   { length: 4.6, width: 2.0, height: 2.0, a: 1.35, b: 1.45, wheelR: 0.36, track: 1.7, cgH: 0.75 },
  hatch: { length: 4.0, width: 1.8, height: 1.5, a: 1.2, b: 1.25, wheelR: 0.33, track: 1.55, cgH: 0.55 },
  sport: { length: 4.5, width: 1.95, height: 1.25, a: 1.3, b: 1.35, wheelR: 0.35, track: 1.68, cgH: 0.45 },
  jeep:  { length: 4.5, width: 2.0, height: 1.95, a: 1.35, b: 1.4, wheelR: 0.42, track: 1.72, cgH: 0.8 },
  super: { length: 4.7, width: 2.0, height: 1.15, a: 1.4, b: 1.4, wheelR: 0.36, track: 1.72, cgH: 0.4 },
  mini: { length: 3.74, width: 1.78, height: 1.55, a: 1.1, b: 1.1, wheelR: 0.34, track: 1.46, cgH: 0.55 },
  pickup: { length: 5.0, width: 1.98, height: 1.82, a: 1.5, b: 1.45, wheelR: 0.38, track: 1.68, cgH: 0.75 },
  muscle: { length: 4.84, width: 1.98, height: 1.36, a: 1.42, b: 1.36, wheelR: 0.35, track: 1.64, cgH: 0.5 },
  rally: { length: 4.18, width: 1.9, height: 1.55, a: 1.24, b: 1.24, wheelR: 0.36, track: 1.6, cgH: 0.55 },
  suv: { length: 4.63, width: 1.98, height: 1.72, a: 1.36, b: 1.34, wheelR: 0.36, track: 1.64, cgH: 0.72 },
  roadster: { length: 4.02, width: 1.86, height: 1.15, a: 1.22, b: 1.16, wheelR: 0.34, track: 1.56, cgH: 0.42 },
  gt: { length: 4.78, width: 1.98, height: 1.28, a: 1.4, b: 1.34, wheelR: 0.35, track: 1.64, cgH: 0.45 },
  electric: { length: 4.78, width: 1.96, height: 1.38, a: 1.4, b: 1.38, wheelR: 0.35, track: 1.66, cgH: 0.42 },
  concept: { length: 4.72, width: 2.1, height: 1.12, a: 1.42, b: 1.38, wheelR: 0.35, track: 1.72, cgH: 0.4 },
  hyper: { length: 4.89, width: 2.16, height: 1.08, a: 1.46, b: 1.42, wheelR: 0.36, track: 1.76, cgH: 0.38 },
};

/** Reasonable default stats (used by AI rivals, traffic and the dev harness; the game computes the player's own). */
export function baseStats(car: CarId): CarStats {
  const b: Record<CarId, [number, number, number, number, number]> = {
    van: [40, 13, 1.0, 1.0, 1800], hatch: [42, 15, 1.1, 1.12, 1100], sport: [48, 17, 1.15, 1.15, 1300],
    jeep: [43, 14, 1.25, 0.95, 2000], super: [54, 19, 1.2, 1.2, 1400],
    mini: [44, 16, 1.15, 1.25, 950], pickup: [43, 14.5, 1.2, 0.95, 2100], muscle: [50, 18, 1.0, 1.0, 1600],
    rally: [47, 17.5, 1.3, 1.2, 1250], suv: [46, 15.5, 1.2, 1.0, 1900], roadster: [50, 17.5, 1.2, 1.25, 1050],
    gt: [52, 17.5, 1.2, 1.12, 1450], electric: [51, 21, 1.2, 1.15, 1700], concept: [56, 19.5, 1.25, 1.2, 1300],
    hyper: [60, 21, 1.3, 1.22, 1350],
  };
  const [topSpeed, accel, grip, handling, mass] = b[car];
  return { topSpeed, accel, brake: 30, grip, handling, mass, nitroCap: 2.5, nitroRegen: 0.12, nitroPower: 1.35, armor: 0, itemSlots: 1 };
}

export const CAR_IDS: CarId[] = ['van', 'hatch', 'sport', 'jeep', 'super', 'mini', 'pickup', 'muscle', 'rally', 'suv', 'roadster', 'gt', 'electric', 'concept', 'hyper'];
