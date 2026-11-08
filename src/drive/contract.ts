/**
 * Shared contract between the driving engine (src/drive, src/world3d: Opus engine agent), the DOM UI (src/ui, src/game:
 * main session) and the data in content/he. Keep small and stable; add optional fields, do not break existing ones.
 * Units: meters, seconds, radians. Three.js axes: x east, y up, z south. Heading 0 = facing -z (north), positive = clockwise from above.
 */
export type CarId = 'van' | 'hatch' | 'sport' | 'jeep' | 'super';
export type WheelId = 'std' | 'sport' | 'offroad';
export type VinylId = 'stripes' | 'flames' | 'stars' | 'checker' | 'net';
export type ItemId = 'oil' | 'cones' | 'glue' | 'boostpad' | 'mine' | 'smoke';
export type PoiKind = 'lesson' | 'garage' | 'shop' | 'race' | 'fuel' | 'secret';

export interface DistrictDef { id: number; he: string; layer: string; palette: { ground: string; wall: string; roof: string; accent: string; sky: string } }
export const DISTRICTS: DistrictDef[] = [
  { id: 1, he: 'רציפי הכבלים', layer: 'פיזית', palette: { ground: '#8c8f98', wall: '#c9a66b', roof: '#5b6b7a', accent: '#e55a4e', sky: '#9fc4e6' } },
  { id: 2, he: 'רובע המסגרות', layer: 'קו נתונים', palette: { ground: '#9aa38f', wall: '#e8b64a', roof: '#b4553a', accent: '#35d3b0', sky: '#a9d2ec' } },
  { id: 3, he: 'גבעות הניתוב', layer: 'רשת', palette: { ground: '#7fae6a', wall: '#f0d189', roof: '#3f8f93', accent: '#ff7f6e', sky: '#b4dcf2' } },
  { id: 4, he: 'כיכר הפורטים', layer: 'תעבורה', palette: { ground: '#a39a8a', wall: '#d98c5f', roof: '#6a3f73', accent: '#58c46a', sky: '#b6d6ec' } },
  { id: 5, he: 'כיכר השיחות', layer: 'שיחה', palette: { ground: '#8fa6a0', wall: '#9ecbd9', roof: '#3e4486', accent: '#e8cf3a', sky: '#bfe0f0' } },
  { id: 6, he: 'גני הצופן', layer: 'ייצוג', palette: { ground: '#78a889', wall: '#b79ae0', roof: '#2f7d6f', accent: '#ffb84a', sky: '#c5def4' } },
  { id: 7, he: 'שדרת היישומים', layer: 'יישום', palette: { ground: '#9a9aa6', wall: '#f3e4c4', roof: '#a94a62', accent: '#4ad6c8', sky: '#a4cdee' } },
];

export interface CarStats {
  topSpeed: number;      // m/s without nitro (base 42 = 150 km/h)
  accel: number;         // m/s^2 (base 14)
  brake: number;         // m/s^2 (base 30)
  grip: number;          // 0.6..1.6 lateral grip multiplier (base 1)
  handling: number;      // steering response multiplier (base 1)
  mass: number;          // kg (collisions)
  nitroCap: number;      // seconds of nitro (base 2.5)
  nitroRegen: number;    // seconds of nitro regained per second of fast driving (base 0.12)
  nitroPower: number;    // speed multiplier while boosting (base 1.35)
  armor: number;         // 0..1 collision speed-loss reduction (base 0)
  itemSlots: number;     // 1 or 2
}

export interface CarLook { car: CarId; paint: string; vinyl: VinylId | null; vinylColor: string; wheels: WheelId; rim: string; spoiler: boolean }

export interface QuizGate { id: string; q: string; options: [string, string, string]; correct: 0 | 1 | 2; lesson: string }

export interface Vec2 { x: number; z: number }

export interface RaceDef {
  id: string; he: string; kind: 'circuit' | 'sprint' | 'timetrial' | 'drift' | 'delivery';
  laps: number; rivals: number; difficulty: number;   // 0..1
  path: Vec2[];                                       // closed for circuit, open otherwise
  reward: { gold: number; silver: number; bronze: number };
  district: number; timeLimit?: number; gatesEvery?: number; // quiz boxes appear every N meters (0 = none)
}

export interface Poi {
  id: string; kind: PoiKind; district: number; x: number; z: number; radius: number; label: string;
  lesson?: string;            // 'lesson06' ...
  race?: RaceDef;
}

export interface DriveConfig {
  seed: number;
  look: CarLook;
  stats: CarStats;
  spawn: { x: number; z: number; heading: number } | null;   // null = the city's start garage
  cleaned: number[];                                         // districts already cleaned of noise (visuals)
  unlocked: number[];                                        // districts open for races
  gates: QuizGate[];                                         // questions for quiz boxes (all learned lessons)
  quality: 'low' | 'medium' | 'high';
  playerName: string;
  twoPlayers?: boolean;
  /** pickup ids already collected (coins, hidden parcels) so they stay gone */
  collected?: string[];
}

export interface HudState {
  speedKmh: number; nitro: number; nitroCap: number;
  items: ItemId[]; coins: number;
  race: null | {
    id: string; he: string; lap: number; laps: number; place: number; total: number; time: number; checkpoint: number; checkpoints: number; gateQuestion?: string;
    /** optional extras (engine): 3..1 during the countdown, 0 = go */
    countdown?: number;
    /** drift/delivery: seconds left */ timeLeft?: number;
    /** drift: score */ score?: number;
    /** delivery: parcel health 0..1 */ health?: number;
    /** time medals [gold, silver, bronze] in seconds (time trial / solo) */ targets?: [number, number, number];
    /** the three answers of the upcoming quiz boxes (box 0 is on the right) */ gateOptions?: [string, string, string];
  };
  heading: number; x: number; z: number;
  nearPoi: { id: string; label: string; kind: PoiKind } | null;
  wrongWay: boolean; drift: number; combo: number;
  /** optional extras (engine): drift mini-turbo tier 0..3, nitro active, slipstream 0..1 */
  driftTier?: number; boosting?: boolean; draft?: number;
}

export interface RaceResult { raceId: string; place: number; total: number; time: number; coins: number; medal: 'gold' | 'silver' | 'bronze' | 'none'; gatesRight: number; gatesWrong: number; bestLap: number }

export interface DriveInput {
  p: 0 | 1;
  throttle: number;   // 0..1
  brake: number;      // 0..1 (also reverse when stopped)
  steer: number;      // -1 (left) .. 1 (right)
  nitro: boolean;     // held
  handbrake: boolean; // held
  useItem: boolean;   // held state (rising edge counts)
  look: boolean;      // look back
  reset: boolean;
  /** optional: enter the POI you stand in (touch button; keyboard E/Enter) */
  action?: boolean;
  /** optional: restart the current race (keyboard T) */
  restart?: boolean;
}

export const NO_INPUT: DriveInput = { p: 0, throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false, useItem: false, look: false, reset: false };
