import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../drive/contract';
import { buildCity, generateCity } from './city';

const city = buildCity(1);

describe('city', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = generateCity(7), b = generateCity(7), c = generateCity(8);
    expect(a.buildings.length).toBe(b.buildings.length);
    expect(a.buildings.slice(0, 50)).toEqual(b.buildings.slice(0, 50));
    expect(a.races.map((r) => r.path)).toEqual(b.races.map((r) => r.path));
    expect(a.heightAt(-900, -600)).toBe(b.heightAt(-900, -600));
    expect(JSON.stringify(a.buildings.slice(0, 20))).not.toBe(JSON.stringify(c.buildings.slice(0, 20)));
  });

  it('generates quickly and has a reasonable size', () => {
    const t0 = performance.now();
    const c = generateCity(3);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
    expect(c.edges.length).toBeGreaterThan(150);
    expect(c.buildings.length).toBeGreaterThan(600);
    expect(c.buildings.length).toBeLessThan(6000);
    expect(c.bridges.length).toBeGreaterThan(2);
    expect(c.mountain).not.toBeNull();
    expect(c.ramps.length).toBeGreaterThan(5);
    console.log('city ms', ms.toFixed(0), 'edges', c.edges.length, 'bld', c.buildings.length, 'props', c.props.length, 'races', c.races.length, 'pickups', c.pickups.length);
  });

  it('has the POIs the UI needs, on roads and outside buildings', () => {
    for (const id of ['garage_main', 'garage_lesson06', 'garage_lesson07', 'garage_lesson08', 'shop_main', 'race_grandprix']) {
      expect(city.pois.find((p) => p.id === id), id).toBeTruthy();
    }
    for (const p of city.pois) {
      expect(city.statics.blocked(p.x, p.z, 1.5), p.id).toBe(false);
      expect(Math.abs(p.x)).toBeLessThan(1450);
      expect(Math.abs(p.z)).toBeLessThan(1450);
    }
    // lesson garages within reach of the main garage
    const main = city.pois.find((p) => p.id === 'garage_main')!;
    for (const id of ['garage_lesson06', 'garage_lesson07', 'garage_lesson08']) {
      const g = city.pois.find((p) => p.id === id)!;
      expect(Math.hypot(g.x - main.x, g.z - main.z), id).toBeLessThan(1700);
    }
    expect(city.onRoad(city.spawn.x, city.spawn.z)).toBe(true);
  });

  it('has 8+ valid races of all 5 kinds whose paths stay on roads', () => {
    expect(city.races.length).toBeGreaterThanOrEqual(8);
    const kinds = new Set(city.races.map((r) => r.kind));
    for (const k of ['circuit', 'sprint', 'timetrial', 'drift', 'delivery']) expect(kinds.has(k as never), k).toBe(true);
    expect(new Set(city.races.map((r) => r.district)).size).toBeGreaterThanOrEqual(5);
    const gp = city.races.find((r) => r.id === 'grandprix')!;
    expect(gp.kind).toBe('circuit');
    expect(gp.laps).toBeGreaterThanOrEqual(3);
    for (const r of city.races) {
      expect(r.path.length).toBeGreaterThanOrEqual(3);
      for (let k = 1; k < r.path.length; k++) {
        const a = r.path[k - 1] as Vec2, b = r.path[k] as Vec2;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        expect(len, r.id).toBeGreaterThan(5);
        for (let t = 0; t <= 1; t += 0.05) {
          const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          expect(city.onRoad(x, z), `${r.id} seg ${k} t ${t.toFixed(2)}`).toBe(true);
          expect(Math.abs(x) < 1450 && Math.abs(z) < 1450).toBe(true);
        }
      }
      if (r.kind === 'circuit' || r.kind === 'timetrial' || r.kind === 'drift') {
        const a = r.path[0] as Vec2, b = r.path[r.path.length - 1] as Vec2;
        expect(Math.hypot(a.x - b.x, a.z - b.z), r.id).toBeLessThan(260);
      }
    }
  });

  it('heights are finite and roads are drivable (no cliffs)', () => {
    for (const e of city.edges) {
      const a = city.nodes[e.a]!, b = city.nodes[e.b]!;
      let prev = city.heightAt(a.x, a.z);
      for (let t = 0.02; t <= 1; t += 0.02) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const h = city.heightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        if (!e.ramp) expect(Math.abs(h - prev) / (e.len * 0.02), `edge ${e.id}`).toBeLessThan(0.35);
        prev = h;
      }
    }
  });

  it('buildings do not sit on roads', () => {
    let bad = 0;
    for (const b of city.buildings) if (city.onRoad(b.x, b.z)) bad++;
    expect(bad).toBe(0);
  });
});
