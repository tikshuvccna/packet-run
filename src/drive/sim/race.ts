/** Race session bookkeeping: grid, progress, laps, checkpoints, places, quiz-box groups, scoring and results. Pure. */
import type { QuizGate, RaceDef, RaceResult, Vec2 } from '../contract';
import { clamp } from './math';
import { racingLine, Track } from './track';

export interface RaceCar {
  driver: number; s: number; prog: number; lap: number; finished: boolean; finishT: number;
  lapStart: number; bestLap: number; wrongT: number; place: number;
}
export interface GateGroup { key: string; s: number; lap: number; gate: QuizGate; resolved: boolean; boxes: { x: number; z: number; opt: number }[]; rivalsDone: Set<number> }

export const COUNTDOWN = 3;

export class RaceSession {
  readonly def: RaceDef;
  readonly track: Track;
  readonly line: Track;
  readonly closed: boolean;
  readonly laps: number;
  readonly lapLen: number;
  readonly totalLen: number;
  readonly cpCount: number;
  state: 'countdown' | 'running' | 'done' = 'countdown';
  clock = -COUNTDOWN;     // < 0 during the countdown
  cars: RaceCar[] = [];
  groups: GateGroup[] = [];
  gatesRight = 0;
  gatesWrong = 0;
  coins = 0;
  health = 1;            // delivery parcel
  driftScore = 0;
  driftMult = 1;
  result: RaceResult | null = null;
  private gatePool: QuizGate[];
  private gateCursor = 0;

  constructor(def: RaceDef, halfWidth: (x: number, z: number) => number, gates: QuizGate[], rng: () => number) {
    this.def = def;
    this.closed = def.kind === 'circuit' || def.kind === 'timetrial' || def.kind === 'drift';
    this.track = new Track(def.path, this.closed, halfWidth, 3);
    this.line = racingLine(this.track);
    this.laps = this.closed ? Math.max(1, def.laps) : 1;
    this.lapLen = this.track.length;
    this.totalLen = this.lapLen * this.laps;
    this.cpCount = Math.max(3, Math.round(this.lapLen / 160));
    this.gatePool = gates.slice();
    // deterministic shuffle of the question pool
    for (let i = this.gatePool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = this.gatePool[i] as QuizGate; this.gatePool[i] = this.gatePool[j] as QuizGate; this.gatePool[j] = t; }
    this.buildGroups(0);
  }

  /** Grid slots behind the start line: [x, z, heading]. */
  gridSlots(n: number): [number, number, number][] {
    const out: [number, number, number][] = [];
    const p0 = this.track.sample(0);
    const h = Math.atan2(p0.dx, -p0.dz);
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / 2), side = k % 2 === 0 ? -1 : 1;
      const back = 8 + row * 8 + (side > 0 ? 3 : 0);
      const p = this.track.sample(this.closed ? this.lapLen - back : 0);
      const px = this.closed ? p.x : p0.x - p0.dx * back, pz = this.closed ? p.z : p0.z - p0.dz * back;
      const dx = this.closed ? p.dx : p0.dx, dz = this.closed ? p.dz : p0.dz;
      const hw = Math.min(3, this.track.pt(0).hw - 2);
      out.push([px + -dz * side * hw, pz + dx * side * hw, this.closed ? Math.atan2(dx, -dz) : h]);
    }
    return out;
  }

  /** Quiz-box groups for one lap (new questions each lap). */
  buildGroups(lap: number): void {
    this.groups = this.groups.filter((g) => !g.resolved && g.lap >= lap);
    const every = this.def.gatesEvery ?? 0;
    if (!every || this.gatePool.length === 0) return;
    for (let s = Math.min(160, every * 0.5); s < this.lapLen - 70; s += every) {
      const gate = this.gatePool[this.gateCursor++ % this.gatePool.length] as QuizGate;
      const p = this.track.sample(s);
      const hw = this.track.pt(p.i).hw;
      const sp = clamp(hw * 0.55, 2.6, 4.2);
      const rx = -p.dz, rz = p.dx;
      const boxes = [0, 1, 2].map((opt) => ({ x: p.x + rx * (1 - opt) * sp, z: p.z + rz * (1 - opt) * sp, opt }));
      this.groups.push({ key: `${lap}_${Math.round(s)}`, s, lap, gate, resolved: false, boxes, rivalsDone: new Set() });
    }
  }

  /** Box lateral spacing at a group (same as built). */
  boxSpacing(g: GateGroup): number { const a = g.boxes[0], b = g.boxes[1]; return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 3; }

  lapPos(prog: number): number { return this.closed ? ((prog % this.lapLen) + this.lapLen) % this.lapLen : prog; }

  medalFor(place: number, time: number): RaceResult['medal'] {
    const d = this.def;
    switch (d.kind) {
      case 'circuit': case 'sprint':
        if (d.rivals > 0) return place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'none';
        return this.timeMedal(time);
      case 'timetrial': return this.timeMedal(time);
      case 'drift': {
        const gold = (500 + 700 * d.difficulty) * this.laps / 2;
        return this.driftScore >= gold ? 'gold' : this.driftScore >= gold * 0.65 ? 'silver' : this.driftScore >= gold * 0.35 ? 'bronze' : 'none';
      }
      case 'delivery': {
        const lim = d.timeLimit ?? this.par() * 1.3;
        if (this.health <= 0 || time > lim) return 'none';
        if (time <= lim * 0.8 && this.health >= 0.7) return 'gold';
        if (time <= lim * 0.92 && this.health >= 0.4) return 'silver';
        return 'bronze';
      }
      default: return 'none';
    }
  }
  /** Par time: track length at a reference speed set by difficulty. */
  par(): number { return this.totalLen / (21 + 7 * this.def.difficulty); }
  /** Time targets for the HUD (gold, silver, bronze). */
  targets(): [number, number, number] {
    const p = this.par();
    const lim = this.def.timeLimit;
    return [p, p * 1.12, lim && this.def.kind !== 'drift' ? Math.max(lim, p * 1.2) : p * 1.25];
  }
  private timeMedal(time: number): RaceResult['medal'] {
    const [g, s, b] = this.targets();
    return time <= g ? 'gold' : time <= s ? 'silver' : time <= b ? 'bronze' : 'none';
  }

  finish(playerPlace: number, time: number, total: number, bestLap: number): RaceResult {
    const medal = this.medalFor(playerPlace, time);
    const reward = medal === 'none' ? 5 : this.def.reward[medal];
    this.result = {
      raceId: this.def.id, place: playerPlace, total, time, coins: reward + this.gatesRight * 5 + this.coins, medal,
      gatesRight: this.gatesRight, gatesWrong: this.gatesWrong, bestLap,
    };
    this.state = 'done';
    return this.result;
  }
}

/** Center line of a race (for rendering the route and minimap). */
export function racePathPoints(def: RaceDef): Vec2[] { return def.path; }
