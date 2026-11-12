/** Tiny typed event bus between the 3D drive scene and the DOM UI. */
import type { CarLook, CarStats, DriveConfig, DriveInput, HudState, ItemId, RaceDef, RaceResult } from '../drive/contract';

export interface GameEvents {
  /** Drive -> UI */
  'drive:hud': HudState;
  'drive:marker': { x: number; z: number; label: string; side?: boolean; /** ring radius (m) */ r?: number } | null;
  /** side-mission givers shown in the world (purple gems) */
  'drive:side-spots': { x: number; z: number; label: string; done: boolean }[];
  /** the player's car took a hit (wreck = it broke down) */
  'drive:damage': { health: number; amount: number; wreck: boolean };
  /** UI -> Drive: fix the car */
  'drive:repair': undefined;
  'drive:prompt': { text: string; id: string } | null;
  'drive:toast': { text: string; kind?: 'info' | 'good' | 'bad' };
  'drive:poi': { id: string; kind: string; lesson?: string; race?: RaceDef };   // the player pressed enter inside a POI circle
  'drive:race-end': RaceResult;
  'drive:pickup': { kind: 'coin' | 'parcel' | 'item'; amount: number; item?: ItemId; id?: string };
  'drive:gate': { id: string; right: boolean };
  'drive:position': { x: number; z: number; heading: number };     // ~1 Hz, for saving
  'drive:ready': undefined;
  /** UI -> Drive */
  'drive:start': DriveConfig;
  'drive:quit': undefined;
  'drive:teleport': { x: number; z: number; heading: number };
  'drive:start-race': RaceDef;
  'drive:set-look': CarLook;
  /** the player's car stats changed (another car, an upgrade, new wheels) */
  'drive:set-stats': CarStats;
  'ui:pause': { paused: boolean };
  'ui:input': DriveInput;
  'ui:clock': { fuel: number };
  /** both */
  'audio:sfx': { name: string; pan?: number; vol?: number };
  'audio:engine': { rpm: number; speed: number; boost: boolean; skid: number };
  /** UI internal */
  'ui:nothing': ItemId;
}

type Handler<T> = (payload: T) => void;

export class Bus {
  private map = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(k: K, h: Handler<GameEvents[K]>): () => void {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(h as Handler<never>);
    return () => s?.delete(h as Handler<never>);
  }

  emit<K extends keyof GameEvents>(k: K, payload: GameEvents[K]): void {
    this.map.get(k)?.forEach((h) => (h as Handler<GameEvents[K]>)(payload));
  }
}
