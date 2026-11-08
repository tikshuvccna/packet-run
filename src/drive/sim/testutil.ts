import { NO_INPUT, type DriveInput } from '../contract';
import type { Terrain } from './car';
import { StaticWorld } from './statics';

/** Flat test terrain (optionally with a ramp at z in [-110,-100] rising toward -z). */
export function flatTerrain(opts: { ramp?: boolean; sand?: boolean } = {}): Terrain {
  const statics = new StaticWorld(1600, 32);
  return {
    statics,
    heightAt: (x, z) => {
      if (opts.ramp && Math.abs(x) < 4 && z < -100 && z > -112) return ((-100 - z) / 12) * 2.2;
      return 0;
    },
    surfaceAt: () => (opts.sand ? 2 : 0),
  };
}

export const inp = (o: Partial<DriveInput>): DriveInput => ({ ...NO_INPUT, ...o });
