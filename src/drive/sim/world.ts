/**
 * DriveSim: the whole pure simulation at a fixed 120 Hz step. Player car, race rivals, civilian traffic, thrown items,
 * pickups, races with quiz boxes. No three, no DOM. The render layer reads the state and drains `events`.
 */
import type { CarLook, CarStats, DriveInput, HudState, ItemId, PoiKind, QuizGate, RaceDef, RaceResult } from '../contract';
import { NO_INPUT } from '../contract';
import { RIVALS, TRAFFIC_PAINTS } from '../rivals';
import { createRacerAI, extendTraffic, racerInput, type RacerAI, type TrafficAI, trafficInput } from './ai';
import { applyBoost, type CarState, collideCars, collideStatic, createCar, placeCar, stepCar, SURF } from './car';
import { baseStats, CAR_IDS } from './cars';
import { type ItemEnt, resetItemIds, rollItem, stepItems, throwItem } from './items';
import { clamp, headingOf, wrapAngle } from './math';
import { RaceSession } from './race';
import { Rng } from './rng';
import type { SimCity } from './types';

export const DT = 1 / 120;

export type DriverKind = 'player' | 'rival' | 'traffic';
export interface Driver {
  car: CarState; kind: DriverKind; name: string; look: CarLook; items: ItemId[];
  racer: RacerAI | null; traffic: TrafficAI | null; prevUse: boolean; rivalId?: string;
  near: boolean; nearT: number;
}

export type SimEvent =
  | { t: 'sfx'; name: string; x?: number; z?: number; vol?: number }
  | { t: 'toast'; text: string; kind?: 'info' | 'good' | 'bad' }
  | { t: 'pickup'; kind: 'coin' | 'parcel' | 'item'; amount: number; item?: ItemId; id?: string }
  | { t: 'gate'; id: string; right: boolean }
  | { t: 'raceEnd'; result: RaceResult }
  | { t: 'countdown'; n: number }
  | { t: 'crash'; x: number; z: number; v: number; driver: number }
  | { t: 'land'; driver: number; v: number }
  | { t: 'turbo'; driver: number; tier: number }
  | { t: 'itemHit'; kind: ItemId; x: number; z: number; driver: number }
  | { t: 'nearMiss' };

export interface SimConfig {
  seed: number; look: CarLook; stats: CarStats; spawn: { x: number; z: number; heading: number };
  gates: QuizGate[]; traffic: number; collected?: string[]; pois?: { id: string; kind: PoiKind; x: number; z: number; radius: number; label: string }[];
}

export class DriveSim {
  readonly city: SimCity;
  readonly rng: Rng;
  readonly rand: () => number;
  drivers: Driver[] = [];
  items: ItemEnt[] = [];
  events: SimEvent[] = [];
  race: RaceSession | null = null;
  time = 0;
  coins = 0;
  combo = 0;
  private comboT = 0;
  collected = new Set<string>();
  private boxCd = new Map<string, number>();
  private padCd = new Map<string, number>();
  gates: QuizGate[];
  trafficTarget: number;
  /** ghost: flat [x, z, y, h] every 0.1 s */
  ghostRec: number[] = [];
  ghostPlay: number[] | null = null;
  lastCountdown = 4;
  private prevReset = false;
  private stuckWarn = 0;
  private recT = 0;
  private trafficT = 0;
  /** last (finished) race result, kept until the next race */
  lastResult: RaceResult | null = null;

  constructor(city: SimCity, cfg: SimConfig) {
    this.city = city;
    this.rng = new Rng(cfg.seed * 31 + 7);
    this.rand = () => this.rng.next();
    this.gates = cfg.gates;
    this.trafficTarget = cfg.traffic;
    for (const id of cfg.collected ?? []) this.collected.add(id);
    resetItemIds();
    const p = createCar(0, cfg.look.car, cfg.stats, cfg.spawn.x, cfg.spawn.z, cfg.spawn.heading, city, cfg.look.wheels);
    this.drivers.push({ car: p, kind: 'player', name: 'player', look: cfg.look, items: [], racer: null, traffic: null, prevUse: false, near: false, nearT: 0 });
    this.fillTraffic(true);
  }

  get player(): CarState { return (this.drivers[0] as Driver).car; }
  get playerDriver(): Driver { return this.drivers[0] as Driver; }

  setLook(look: CarLook, stats?: CarStats): void {
    const d = this.playerDriver;
    const old = d.car;
    d.look = look;
    if (old.carId !== look.car || old.wheels !== look.wheels || stats) {
      const c = createCar(0, look.car, stats ?? old.stats, old.x, old.z, old.h, this.city, look.wheels);
      c.vx = old.vx; c.vz = old.vz; c.nitro = Math.min(c.stats.nitroCap, old.nitro);
      d.car = c;
    }
  }

  teleport(x: number, z: number, h: number): void {
    placeCar(this.player, x, z, h, this.city);
    this.fillTraffic(true);
  }

  /* --------------------------------------------------------------- traffic */
  private nextId = 1;
  private spawnTraffic(near: boolean): void {
    const p = this.player;
    const city = this.city;
    for (let tries = 0; tries < 40; tries++) {
      const eid = Math.floor(this.rand() * city.edges.length);
      const e = city.edges[eid];
      if (!e || e.ramp || e.tunnel) continue;
      const A = city.nodes[e.a], B = city.nodes[e.b];
      if (!A || !B) continue;
      const t = 0.2 + this.rand() * 0.6;
      const mx = A.x + (B.x - A.x) * t, mz = A.z + (B.z - A.z) * t;
      const d = Math.hypot(mx - p.x, mz - p.z);
      if (d > (near ? 360 : 400) || d < (near ? 40 : 170)) continue;
      const fwd = this.rand() < 0.5;
      const [F, T] = fwd ? [A, B] : [B, A];
      const len = Math.hypot(T.x - F.x, T.z - F.z);
      const ux = (T.x - F.x) / len, uz = (T.z - F.z) / len;
      const lane = e.avenue ? 4.4 : 2.5;
      const x = mx - uz * lane, z = mz + ux * lane;
      if (this.drivers.some((o) => Math.hypot(o.car.x - x, o.car.z - z) < 12)) continue;
      const carId = this.rng.pick(['van', 'hatch', 'hatch', 'jeep', 'van'] as const);
      const st = baseStats(carId);
      st.topSpeed *= 0.6;
      const c = createCar(this.nextId++, carId, st, x, z, headingOf(ux, uz), city);
      const v = (e.avenue ? 14 : 10.5) * (0.9 + this.rand() * 0.2);
      c.vx = ux * v * 0.8; c.vz = uz * v * 0.8;
      const look: CarLook = { car: carId, paint: this.rng.pick(TRAFFIC_PAINTS), vinyl: null, vinylColor: '#fff', wheels: 'std', rim: '#d8dde3', spoiler: false };
      const tr: TrafficAI = { pts: [], cur: 0, edge: eid, to: T.id, vBase: v, waitT: 0 };
      extendTraffic(tr, city, this.rand);
      this.drivers.push({ car: c, kind: 'traffic', name: 'traffic', look, items: [], racer: null, traffic: tr, prevUse: false, near: false, nearT: 0 });
      return;
    }
  }
  private fillTraffic(near: boolean): void {
    // drop far traffic, top up to the target
    const p = this.player;
    this.drivers = this.drivers.filter((d) => d.kind !== 'traffic' || Math.hypot(d.car.x - p.x, d.car.z - p.z) < 460);
    if (near) this.drivers = this.drivers.filter((d) => d.kind !== 'traffic' || Math.hypot(d.car.x - p.x, d.car.z - p.z) < 400);
    const target = this.race ? Math.round(this.trafficTarget * 0.5) : this.trafficTarget;
    let n = this.drivers.filter((d) => d.kind === 'traffic').length;
    let guard = 0;
    while (n < target && guard++ < target * 2) { const before = this.drivers.length; this.spawnTraffic(near); if (this.drivers.length > before) n++; }
  }

  /* --------------------------------------------------------------- races */
  startRace(def: RaceDef, ghost: number[] | null = null): void {
    this.endRace(false);
    const city = this.city;
    const halfW = (x: number, z: number): number => { const e = city.edges[city.edgeAt(x, z)]; return e ? e.width / 2 : 5.5; };
    const race = new RaceSession(def, halfW, this.gates, this.rand);
    this.race = race;
    this.lastResult = null;
    this.ghostRec = [];
    this.ghostPlay = def.kind === 'timetrial' ? ghost : null;
    this.lastCountdown = 4;
    // clear traffic near the grid
    const p0 = def.path[0];
    if (p0) this.drivers = this.drivers.filter((d) => d.kind !== 'traffic' || Math.hypot(d.car.x - p0.x, d.car.z - p0.z) > 120);
    const n = def.rivals + 1;
    const slots = race.gridSlots(n);
    const playerSlot = def.rivals === 0 ? 0 : Math.min(n - 1, def.rivals >= 5 ? n - 2 : n - 1);
    const ps = slots[playerSlot] as [number, number, number];
    const pl = this.playerDriver;
    placeCar(pl.car, ps[0], ps[1], ps[2], city);
    pl.car.ghostT = 0;
    pl.car.nitro = pl.car.stats.nitroCap;
    pl.items = [];
    race.cars.push({ driver: 0, s: race.track.project(ps[0], ps[1]).s - (race.closed ? race.lapLen : 0), prog: 0, lap: 1, finished: false, finishT: 0, lapStart: 0, bestLap: Infinity, wrongT: 0, place: 1 });
    // rivals: pick from the ladder by difficulty; the grand prix always includes the Noise
    const pool = RIVALS.filter((r) => r.id !== 'noise');
    const centerIdx = Math.round(def.difficulty * (pool.length - 1));
    const chosen: typeof RIVALS = [];
    if (def.id === 'grandprix') chosen.push(RIVALS[RIVALS.length - 1] as (typeof RIVALS)[number]);
    for (let k = 0; chosen.length < def.rivals && k < 20; k++) {
      const r = pool[clamp(centerIdx + (k % 2 ? 1 : -1) * Math.ceil(k / 2), 0, pool.length - 1)];
      if (r && !chosen.includes(r)) chosen.push(r);
      else if (k > 12) chosen.push(pool[k % pool.length] as (typeof RIVALS)[number]);
    }
    let slot = 0;
    for (const r of chosen.slice(0, def.rivals)) {
      if (slot === playerSlot) slot++;
      const sl = slots[slot++] ?? ps;
      const st = baseStats(r.car);
      const k = 0.88 + 0.16 * def.difficulty + 0.06 * r.skill;
      st.topSpeed *= k; st.accel *= k;
      const c = createCar(this.nextId++, r.car, st, sl[0], sl[1], sl[2], city, r.look.wheels);
      const s0 = race.line.project(sl[0], sl[1]).s - (race.closed ? race.lapLen : 0);
      const ai = createRacerAI(race.line, s0, clamp(r.skill * 0.6 + def.difficulty * 0.45, 0, 1), r.aggression, r.lane);
      // rivals live right after the player so traffic culling never shifts their indices
      const at = race.cars.length;
      this.drivers.splice(at, 0, { car: c, kind: 'rival', name: r.he, look: r.look, items: [], racer: ai, traffic: null, prevUse: false, rivalId: r.id, near: false, nearT: 0 });
      race.cars.push({ driver: at, s: race.track.project(sl[0], sl[1]).s - (race.closed ? race.lapLen : 0), prog: 0, lap: 1, finished: false, finishT: 0, lapStart: 0, bestLap: Infinity, wrongT: 0, place: 1 });
    }
    void CAR_IDS;
  }

  endRace(keepRivals = false): void {
    if (!this.race) return;
    if (!keepRivals) this.drivers = this.drivers.filter((d) => d.kind !== 'rival');
    this.race = null;
    this.ghostPlay = null;
  }

  /* --------------------------------------------------------------- step */
  step(input: DriveInput): void {
    const dt = DT;
    this.time += dt;
    const race = this.race;
    const frozen = !!race && race.state === 'countdown';
    const pl = this.playerDriver;
    const p = pl.car;

    // ---- player input + reset + items
    let pin = input;
    if (frozen) pin = { ...NO_INPUT, throttle: 0, brake: 1, steer: input.steer };
    if (input.reset && !this.prevReset) this.resetPlayer();
    this.prevReset = input.reset;
    if (input.useItem && !pl.prevUse && pl.items.length > 0 && !frozen) this.useItem(pl);
    pl.prevUse = input.useItem;

    // ---- step cars
    for (let i = 0; i < this.drivers.length; i++) {
      const d = this.drivers[i] as Driver;
      let inp: DriveInput;
      if (d.kind === 'player') inp = pin;
      else if (d.kind === 'rival' && d.racer) {
        if (frozen) inp = { ...NO_INPUT, brake: 1 };
        else {
          inp = racerInput(d.racer, d.car, this.carsNear(d.car, 40), this.rubber(i), this.rand);
          // items: drop when someone is right behind, or now and then
          if (d.items.length && d.racer.itemWait <= 0) {
            const behind = this.carsNear(d.car, 30).some((o) => o !== d.car && ((o.x - d.car.x) * Math.sin(d.car.h) - (o.z - d.car.z) * Math.cos(d.car.h)) < -4);
            if (behind || this.rand() < 0.002) { this.useItem(d); d.racer.itemWait = 2 + this.rand() * 3; }
          }
          d.racer.itemWait -= dt;
        }
      } else if (d.traffic) {
        if (Math.hypot(d.car.x - p.x, d.car.z - p.z) > 300 && (Math.floor(this.time * 120) + i) % 2 === 1) continue;   // far traffic: half rate
        inp = trafficInput(d.traffic, d.car, this.city, this.carsNear(d.car, 26), this.rand);
      } else inp = NO_INPUT;
      const c = d.car;
      const far = d.kind === 'traffic' && Math.hypot(c.x - p.x, c.z - p.z) > 300;
      stepCar(c, inp, this.city, far ? dt * 2 : dt, this.rand);
      const imp = collideStatic(c, this.city.statics);
      if (imp > 3 && d.kind !== 'traffic') this.events.push({ t: 'crash', x: c.impactX, z: c.impactZ, v: imp, driver: i });
      if (c.landImpact > 2 && d.kind === 'player') this.events.push({ t: 'land', driver: i, v: c.landImpact });
      if (c.turboOut > 0) this.events.push({ t: 'turbo', driver: i, tier: c.turboOut });
      // water / out of the world: reset
      if ((c.surface === SURF.water && c.y < -0.8) || !Number.isFinite(c.x) || Math.abs(c.x) > 1495 || Math.abs(c.z) > 1495) {
        if (d.kind === 'player') this.resetPlayer();
        else if (d.racer && race) this.resetRival(d);
        else c.ghostT = 99;   // traffic: drop at the next refill
      }
      if (d.racer && race && d.racer.stuckT > 3.5) this.resetRival(d);
    }
    this.drivers = this.drivers.filter((d) => d.car.ghostT < 50);

    // ---- car vs car
    const n = this.drivers.length;
    for (let i = 0; i < n; i++) {
      const a = (this.drivers[i] as Driver).car;
      for (let j = i + 1; j < n; j++) {
        const b = (this.drivers[j] as Driver).car;
        if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
        const v = collideCars(a, b);
        if (v > 3 && (i === 0 || (this.drivers[j] as Driver).kind === 'rival')) this.events.push({ t: 'crash', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, v, driver: i });
        if (v > 4 && i === 0 && race && race.def.kind === 'delivery') this.parcelHit(v);
      }
    }

    // ---- items
    if (this.items.length) {
      stepItems(this.items, this.drivers.map((d) => d.car), this.city, dt, this.rand, (it, c) => {
        const di = this.drivers.findIndex((d) => d.car === c);
        this.events.push({ t: 'itemHit', kind: it.kind, x: it.x, z: it.z, driver: di });
        if (di === 0 || it.owner === 0) this.events.push({ t: 'sfx', name: 'item_hit', x: it.x, z: it.z });
        if (it.owner === 0 && di > 0 && it.kind !== 'boostpad') this.events.push({ t: 'toast', text: 'פגיעה!', kind: 'good' });
      });
      for (const it of this.items) if (it.kind === 'smoke') for (const d of this.drivers) if (d.racer && Math.hypot(d.car.x - it.x, d.car.z - it.z) < it.r) d.racer.smokeT = 0.5;
    }

    // ---- delivery crash damage from walls
    if (race && race.def.kind === 'delivery' && p.lastImpact > 0.35 && race.state === 'running' && this.time - this.lastParcelHit > 0.6) this.parcelHit(p.lastImpact * 15);

    // ---- slipstream, near misses, drift combo, pickups
    this.slipstream();
    this.nearMisses();
    if (p.drifting) this.comboT = 1.8;
    else if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (pl.car.turboOut > 0) { this.combo++; this.events.push({ t: 'sfx', name: 'boost', vol: 0.5 + 0.2 * pl.car.turboOut }); }
    this.pickups();

    // ---- race
    if (race) this.stepRace(race);

    // ---- traffic upkeep
    this.trafficT -= dt;
    if (this.trafficT <= 0) { this.trafficT = 0.5; this.fillTraffic(false); }

    // ---- stuck hint
    if (p.speed < 1 && input.throttle > 0.5 && p.lastImpact > 0) this.stuckWarn += dt; else this.stuckWarn = Math.max(0, this.stuckWarn - dt);
    if (this.stuckWarn > 2.5) { this.stuckWarn = -8; this.events.push({ t: 'toast', text: 'תקוע? R לחזרה לכביש', kind: 'info' }); }
  }

  private lastParcelHit = -10;
  private parcelHit(v: number): void {
    const race = this.race;
    if (!race || race.state !== 'running' || this.time - this.lastParcelHit < 0.6) return;
    this.lastParcelHit = this.time;
    race.health = Math.max(0, race.health - clamp(v / 50, 0.05, 0.3));
    this.events.push({ t: 'toast', text: race.health > 0 ? `זהירות, החבילה! ${Math.round(race.health * 100)}%` : 'החבילה נשברה', kind: 'bad' });
  }

  private carsNear(c: CarState, r: number): CarState[] {
    const out: CarState[] = [];
    for (const d of this.drivers) if (Math.abs(d.car.x - c.x) < r && Math.abs(d.car.z - c.z) < r) out.push(d.car);
    return out;
  }

  /** Light rubber band: trailing rivals get a little faster, leading ones a little slower. */
  private rubber(driverIdx: number): number {
    const race = this.race;
    if (!race) return 1;
    const me = race.cars.find((rc) => rc.driver === driverIdx), pl = race.cars[0];
    if (!me || !pl) return 1;
    const gap = me.prog - pl.prog;   // + ahead of the player
    return 1 + clamp(-gap / 450, -0.06, 0.08) * (1 - 0.4 * race.def.difficulty) + (race.def.difficulty - 0.5) * 0.04;
  }

  useItem(d: Driver): void {
    const kind = d.items.shift();
    if (!kind) return;
    const ents = throwItem(kind, d.car, this.city, this.rand);
    this.items.push(...ents);
    if (this.items.length > 60) this.items.splice(0, this.items.length - 60);
    if (d.kind === 'player') this.events.push({ t: 'sfx', name: kind === 'boostpad' ? 'boost' : 'item_throw' });
  }

  givePlayerItem(kind: ItemId): boolean {
    const pl = this.playerDriver;
    if (pl.items.length >= Math.max(1, pl.car.stats.itemSlots)) return false;
    pl.items.push(kind);
    return true;
  }

  resetPlayer(): void {
    const p = this.player;
    const race = this.race;
    if (race && race.state !== 'done') {
      const rc = race.cars[0];
      if (rc) {
        const s = rc.s - 6;
        const q = race.track.sample(s);
        placeCar(p, q.x, q.z, Math.atan2(q.dx, -q.dz), this.city);
        this.events.push({ t: 'sfx', name: 'horn', vol: 0.3 });
        return;
      }
    }
    const r = this.city.nearestRoad(p.x, p.z, p.h);
    const e = this.city.edges[r.edge];
    const lane = e ? (e.avenue ? 4.4 : 2.5) : 0;
    placeCar(p, r.x + Math.cos(r.heading) * lane, r.z + Math.sin(r.heading) * lane, r.heading, this.city);
  }

  private resetRival(d: Driver): void {
    if (!d.racer) return;
    const q = d.racer.line.sample(d.racer.s - 4);
    placeCar(d.car, q.x, q.z, Math.atan2(q.dx, -q.dz), this.city);
    d.racer.stuckT = 0; d.racer.offT = 0; d.racer.checkT = 0; d.racer.checkS = d.racer.s;
  }

  private slipstream(): void {
    for (const d of this.drivers) {
      if (d.kind === 'traffic') continue;
      const c = d.car;
      let inDraft = false;
      if (c.speed > 18) {
        const fx = Math.sin(c.h), fz = -Math.cos(c.h);
        for (const o of this.drivers) {
          if (o === d || o.kind === 'traffic' && d.kind !== 'player') continue;
          const dx = o.car.x - c.x, dz = o.car.z - c.z;
          const fwd = dx * fx + dz * fz, lat = Math.abs(dx * Math.cos(c.h) + dz * Math.sin(c.h));
          if (fwd > 4 && fwd < 22 && lat < 2.2 && o.car.speed > 14) { inDraft = true; break; }
        }
      }
      c.draft = clamp(c.draft + (inDraft ? DT * 1.2 : -DT * 2), 0, 1);
    }
  }

  private nearMisses(): void {
    const p = this.player;
    if (p.speed < 17) return;
    for (const d of this.drivers) {
      if (d.kind !== 'traffic') continue;
      const dist = Math.hypot(d.car.x - p.x, d.car.z - p.z);
      if (dist < 4.2 && p.lastImpact <= 0.05) { d.near = true; d.nearT = this.time; }
      else if (d.near && dist > 9) {
        d.near = false;
        if (p.lastImpact <= 0.05 && this.time - d.nearT < 1.2) {
          p.nitro = Math.min(p.stats.nitroCap, p.nitro + 0.35);
          this.combo++; this.comboT = 2.5;
          this.events.push({ t: 'nearMiss' });
          this.events.push({ t: 'toast', text: 'כמעט! +נייטרוס', kind: 'good' });
        }
      }
    }
  }

  private pickups(): void {
    const p = this.player;
    for (const [k, v] of this.boxCd) { if (v - DT <= 0) this.boxCd.delete(k); else this.boxCd.set(k, v - DT); }
    for (const [k, v] of this.padCd) { if (v - DT <= 0) this.padCd.delete(k); else this.padCd.set(k, v - DT); }
    for (const pk of this.city.pickups) {
      const dx = pk.x - p.x, dz = pk.z - p.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const d = Math.hypot(dx, dz), dy = Math.abs(pk.y - (p.y + 0.8));
      if (pk.kind === 'coin') {
        if (d < 2.6 && dy < 3 && !this.collected.has(pk.id)) {
          this.collected.add(pk.id); this.coins++;
          if (this.race) this.race.coins++;
          this.events.push({ t: 'pickup', kind: 'coin', amount: 1, id: pk.id });
          this.events.push({ t: 'sfx', name: 'coin', vol: 0.6 });
        }
      } else if (pk.kind === 'parcel') {
        if (d < 3 && !this.collected.has(pk.id)) {
          this.collected.add(pk.id);
          this.events.push({ t: 'pickup', kind: 'parcel', amount: 1, id: pk.id });
          this.events.push({ t: 'toast', text: 'מצאת חבילה נסתרת!', kind: 'good' });
          this.events.push({ t: 'sfx', name: 'gate_right' });
        }
      } else if (pk.kind === 'nitro') {
        if (d < 3 && !this.padCd.has(pk.id) && !p.airborne) { applyBoost(p, 1.3); this.padCd.set(pk.id, 1.5); this.events.push({ t: 'sfx', name: 'boost' }); }
      } else if (pk.kind === 'item') {
        if (d < 2.4 && dy < 2.5 && !this.boxCd.has(pk.id)) {
          this.boxCd.set(pk.id, 12);
          const place = this.race?.cars[0]?.place ?? 2, total = this.race?.cars.length ?? 3;
          const it = rollItem(place, total, this.rand);
          if (this.givePlayerItem(it)) { this.events.push({ t: 'pickup', kind: 'item', amount: 1, item: it, id: pk.id }); this.events.push({ t: 'sfx', name: 'gate_right', vol: 0.5 }); }
        }
      }
    }
  }

  /** Free-roam pickups are hidden while collected; item boxes while cooling down. */
  pickupVisible(id: string, kind: string): boolean {
    if (kind === 'coin' || kind === 'parcel') return !this.collected.has(id);
    if (kind === 'item') return !this.boxCd.has(id);
    return true;
  }

  /* --------------------------------------------------------------- race step */
  private stepRace(race: RaceSession): void {
    race.clock += DT;
    if (race.state === 'countdown') {
      const n = Math.ceil(-race.clock);
      if (n < this.lastCountdown && n >= 0) {
        this.lastCountdown = n;
        this.events.push({ t: 'countdown', n });
        this.events.push({ t: 'sfx', name: 'countdown', vol: n === 0 ? 1 : 0.7 });
      }
      if (race.clock >= 0) { race.state = 'running'; race.clock = 0; }
      return;
    }
    const t = race.clock;
    // progress for every racer
    for (const rc of race.cars) {
      const d = this.drivers[rc.driver];
      if (!d) continue;
      const c = d.car;
      const prev = rc.s;
      const pr = race.track.project(c.x, c.z, rc.s, 30, 60);
      rc.s = pr.s;
      if (rc.finished) continue;
      rc.prog = race.closed ? rc.s : Math.max(rc.prog, rc.s);
      const lap = race.closed ? Math.floor(rc.s / race.lapLen) + 1 : 1;
      if (lap > rc.lap && race.state === 'running') {
        const lapT = t - rc.lapStart;
        rc.bestLap = Math.min(rc.bestLap, lapT);
        rc.lapStart = t;
        if (rc.driver === 0 && lap <= race.laps) {
          race.buildGroups(lap - 1);
          this.events.push({ t: 'toast', text: lap === race.laps ? 'הקפה אחרונה!' : `הקפה ${lap}`, kind: 'info' });
        }
      }
      rc.lap = Math.max(rc.lap, lap);
      // wrong way (player)
      if (rc.driver === 0) {
        const q = race.track.sample(rc.s);
        const dot = Math.sin(c.h) * q.dx + -Math.cos(c.h) * q.dz;
        rc.wrongT = c.speed > 4 && dot < -0.3 ? rc.wrongT + DT : 0;
        void prev;
      }
      const done = race.closed ? rc.s >= race.totalLen : rc.s >= race.lapLen - 3;
      if (done) {
        rc.finished = true; rc.finishT = t;
        if (rc.lapStart < t) rc.bestLap = Math.min(rc.bestLap, t - rc.lapStart);
      }
    }
    // places
    const order = race.cars.slice().sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog));
    order.forEach((rc, i) => (rc.place = i + 1));
    const me = race.cars[0];
    if (!me) return;
    // quiz boxes for the player (rivals roll for items when they pass a group)
    const myLap = Math.floor(me.s / race.lapLen) || 0;
    const lp = race.lapPos(me.s);
    for (const g of race.groups) {
      if (g.resolved || g.lap !== (race.closed ? Math.max(0, myLap) : 0)) continue;
      if (lp >= g.s && lp < g.s + 30) {
        g.resolved = true;
        const pr = race.track.project(this.player.x, this.player.z, me.s);
        const sp = race.boxSpacing(g);
        let best = -1, bd = Infinity;
        for (const b of g.boxes) { const want = (1 - b.opt) * sp; const dd = Math.abs(pr.lat - want); if (dd < bd) { bd = dd; best = b.opt; } }
        if (bd > sp * 0.75) { this.events.push({ t: 'toast', text: 'פספסת את התיבות', kind: 'info' }); continue; }
        const right = best === g.gate.correct;
        this.events.push({ t: 'gate', id: g.gate.id, right });
        if (right) {
          race.gatesRight++;
          const it = rollItem(me.place, race.cars.length, this.rand);
          const got = this.givePlayerItem(it);
          this.player.nitro = Math.min(this.player.stats.nitroCap, this.player.nitro + 0.6);
          this.events.push({ t: 'sfx', name: 'gate_right' });
          this.events.push({ t: 'toast', text: got ? 'נכון! קיבלת פריט' : 'נכון! +נייטרוס', kind: 'good' });
          if (got) this.events.push({ t: 'pickup', kind: 'item', amount: 1, item: it });
        } else {
          race.gatesWrong++;
          const c = this.player; c.vx *= 0.8; c.vz *= 0.8;
          this.events.push({ t: 'sfx', name: 'gate_wrong' });
          const ans = g.gate.options[g.gate.correct];
          this.events.push({ t: 'toast', text: `לא נכון. התשובה: ${ans}`, kind: 'bad' });
        }
      } else if (lp > g.s + 30 && lp < g.s + 200) g.resolved = true;
    }
    for (const rc of race.cars) {
      if (rc.driver === 0) continue;
      const d = this.drivers[rc.driver];
      if (!d) continue;
      const rlp = race.lapPos(rc.s);
      for (const g of race.groups) {
        if (g.rivalsDone.has(rc.driver)) continue;
        if (rlp >= g.s && rlp < g.s + 25) {
          g.rivalsDone.add(rc.driver);
          if (this.rand() < 0.45 + 0.4 * race.def.difficulty && d.items.length === 0) d.items.push(rollItem(rc.place, race.cars.length, this.rand));
        }
      }
    }
    // drift scoring
    const p = this.player;
    if (race.def.kind === 'drift') {
      if (p.drifting) race.driftScore += Math.abs(p.slip) * p.speed * DT * 2 * race.driftMult;
      race.driftMult = p.drifting ? Math.min(3, 1 + this.combo * 0.25) : race.driftMult;
      if (!p.drifting && this.combo === 0) race.driftMult = 1;
    }
    // ghost recording
    this.recT += DT;
    if (this.recT >= 0.1) { this.recT = 0; this.ghostRec.push(+p.x.toFixed(2), +p.z.toFixed(2), +p.y.toFixed(2), +p.h.toFixed(3)); }
    // end conditions
    const limit = race.def.timeLimit;
    const timeUp = !!limit && (race.def.kind === 'drift' || race.def.kind === 'delivery') && t >= limit;
    const broken = race.def.kind === 'delivery' && race.health <= 0;
    if (me.finished || timeUp || broken) {
      const total = race.cars.length;
      const place = me.finished ? me.place : total;
      const res = race.finish(place, me.finished ? me.finishT : t, total, Number.isFinite(me.bestLap) ? me.bestLap : t);
      if (race.def.kind === 'drift' && timeUp) { res.medal = race.medalFor(1, t); res.coins = (res.medal === 'none' ? 5 : race.def.reward[res.medal]) + race.coins; }
      this.lastResult = res;
      this.events.push({ t: 'raceEnd', result: res });
      this.events.push({ t: 'sfx', name: 'finish' });
    }
  }

  /** The ghost pose at the current race clock (or null). */
  ghostPose(): { x: number; z: number; y: number; h: number } | null {
    const g = this.ghostPlay, race = this.race;
    if (!g || !race || race.state !== 'running') return null;
    const f = race.clock / 0.1, i = Math.floor(f), t = f - i;
    if ((i + 1) * 4 + 3 >= g.length) return null;
    const a = i * 4, b = a + 4;
    const L = (k: number): number => (g[a + k] as number) + ((g[b + k] as number) - (g[a + k] as number)) * t;
    return { x: L(0), z: L(1), y: L(2), h: (g[a + 3] as number) + wrapAngle((g[b + 3] as number) - (g[a + 3] as number)) * t };
  }

  /* --------------------------------------------------------------- HUD */
  hud(nearPoi: HudState['nearPoi']): HudState {
    const p = this.player, race = this.race;
    let r: HudState['race'] = null;
    if (race) {
      const me = race.cars[0];
      const lp = me ? race.lapPos(me.s) : 0;
      const myLap = me ? Math.max(0, Math.floor(me.s / race.lapLen)) : 0;
      const next = race.groups.find((g) => !g.resolved && g.lap === (race.closed ? myLap : 0) && g.s > lp - 2 && g.s - lp < 170);
      r = {
        id: race.def.id, he: race.def.he, lap: Math.min(race.laps, me?.lap ?? 1), laps: race.laps, place: me?.place ?? 1, total: race.cars.length,
        time: Math.max(0, race.clock), checkpoint: Math.min(race.cpCount, Math.floor((lp / race.lapLen) * race.cpCount)), checkpoints: race.cpCount,
        gateQuestion: next?.gate.q,
        countdown: race.state === 'countdown' ? Math.ceil(-race.clock) : undefined,
        timeLeft: race.def.timeLimit && (race.def.kind === 'drift' || race.def.kind === 'delivery') ? Math.max(0, race.def.timeLimit - Math.max(0, race.clock)) : undefined,
        score: race.def.kind === 'drift' ? Math.round(race.driftScore) : undefined,
        health: race.def.kind === 'delivery' ? race.health : undefined,
        targets: race.def.kind === 'timetrial' || race.def.rivals === 0 ? race.targets() : undefined,
        gateOptions: next ? next.gate.options : undefined,
      };
    }
    return {
      speedKmh: Math.round(p.speed * 3.6), nitro: p.nitro, nitroCap: p.stats.nitroCap, items: this.playerDriver.items.slice(), coins: this.coins,
      race: r, heading: p.h, x: p.x, z: p.z, nearPoi, wrongWay: !!race && (race.cars[0]?.wrongT ?? 0) > 1,
      drift: p.drifting ? Math.min(3, p.driftT / 0.8 * 1) : 0, combo: this.combo, driftTier: p.driftTier, boosting: p.boosting, draft: p.draft,
    };
  }

  /** Stable hash of the simulation state (determinism tests). */
  hash(): string {
    let s = '';
    for (const d of this.drivers) s += `${d.car.x.toFixed(4)},${d.car.z.toFixed(4)},${d.car.h.toFixed(4)};`;
    return s + this.items.length + ':' + this.rng.state;
  }
}
