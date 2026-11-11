import type { CarId, CarLook, VinylId, WheelId } from '../drive/contract';

export const SAVE_KEY = 'packet-run.save.v1';
export const SAVE_VERSION = 1;

export type Look = 'girl' | 'boy';
export type UpgradeId = 'engine' | 'nitro' | 'tires' | 'brakes' | 'armor' | 'slots';
export const UPGRADE_IDS: readonly UpgradeId[] = ['engine', 'nitro', 'tires', 'brakes', 'armor', 'slots'];
export const UPGRADE_MAX: Record<UpgradeId, number> = { engine: 3, nitro: 3, tires: 3, brakes: 3, armor: 3, slots: 1 };

export interface LessonProgress {
  done: boolean;
  checks: Record<string, boolean>;
  quizBest: number;
  quizPassed: boolean;
  games: Record<string, { points: number; passed: boolean }>;
}

export interface SaveData {
  v: number;
  started: boolean;
  hero: Look;
  name: string;
  twoPlayers: boolean;
  coins: number;
  upgrades: Record<UpgradeId, number>;
  cars: CarId[];                                  // owned cars
  wheels: WheelId[];                              // owned wheel sets
  vinyls: VinylId[];                              // owned vinyls
  look: CarLook;                                  // current look
  lessons: Record<string, LessonProgress>;
  flags: Record<string, boolean>;
  parcels: Record<string, boolean>;               // collected hidden parcels
  races: Record<string, { medal: 'gold' | 'silver' | 'bronze' | 'none'; best: number }>;
  pos: { x: number; z: number; heading: number } | null;
  bossWon: boolean;
  /** main story: index of the current mission and of its current step */
  mission: { idx: number; step: number };
  playSeconds: number;
  settings: { quality: 'auto' | 'low' | 'medium' | 'high'; showFps: boolean; musicOn: boolean; sfxOn: boolean; musicVol: number; sfxVol: number };
}

export function emptyLesson(): LessonProgress {
  return { done: false, checks: {}, quizBest: 0, quizPassed: false, games: {} };
}

export function emptySave(): SaveData {
  return {
    v: SAVE_VERSION, started: false, hero: 'girl', name: '', twoPlayers: false, coins: 0,
    upgrades: { engine: 0, nitro: 0, tires: 0, brakes: 0, armor: 0, slots: 0 },
    cars: ['van'], wheels: ['std'], vinyls: [],
    look: { car: 'van', paint: '#f2b134', vinyl: null, vinylColor: '#ffffff', wheels: 'std', rim: '#d8dde3', spoiler: false },
    lessons: {}, flags: {}, parcels: {}, races: {}, pos: null, bossWon: false, mission: { idx: 0, step: 0 }, playSeconds: 0,
    settings: { quality: 'auto', showFps: false, musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.8 },
  };
}

export function normalize(raw: unknown): SaveData {
  const base = emptySave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const lessons: Record<string, LessonProgress> = {};
  for (const [k, v] of Object.entries(r.lessons ?? {})) lessons[k] = { ...emptyLesson(), ...(v as Partial<LessonProgress>) };
  return {
    ...base, ...r, v: SAVE_VERSION, lessons,
    upgrades: { ...base.upgrades, ...(r.upgrades ?? {}) },
    look: { ...base.look, ...(r.look ?? {}) },
    cars: Array.isArray(r.cars) && r.cars.length ? r.cars : base.cars,
    wheels: Array.isArray(r.wheels) && r.wheels.length ? r.wheels : base.wheels,
    vinyls: Array.isArray(r.vinyls) ? r.vinyls : base.vinyls,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    mission: { ...base.mission, ...(r.mission ?? {}) },
  };
}

interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class SaveStore {
  data: SaveData;
  private store: StoreLike | null;
  constructor(store?: StoreLike | null) {
    this.store = store === undefined ? safeStorage() : store;
    this.data = this.load();
  }
  private load(): SaveData {
    try {
      const s = this.store?.getItem(SAVE_KEY);
      return s ? normalize(JSON.parse(s)) : emptySave();
    } catch { return emptySave(); }
  }
  save(): void {
    try { this.store?.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* storage may be blocked */ }
  }
  reset(): void { this.data = emptySave(); this.save(); }
  lesson(id: string): LessonProgress {
    return (this.data.lessons[id] ??= emptyLesson());
  }
  addCoins(n: number): void { this.data.coins = Math.max(0, this.data.coins + Math.round(n)); this.save(); }
}

function safeStorage(): StoreLike | null {
  try { const s = globalThis.localStorage; s.getItem('x'); return s; } catch { return null; }
}
