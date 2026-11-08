import type { Terrain } from './car';

/** What the sim needs from the city (the procedural City satisfies it structurally). */
export interface SimNode { id: number; x: number; z: number; round: number; edges: number[] }
export interface SimEdge { a: number; b: number; width: number; avenue: boolean; len: number; ramp: boolean; tunnel: boolean }
export interface SimPickup { id: string; kind: 'coin' | 'parcel' | 'nitro' | 'item'; x: number; z: number; y: number }
export interface SimCity extends Terrain {
  nodes: SimNode[];
  edges: SimEdge[];
  pickups: SimPickup[];
  nearestRoad(x: number, z: number, heading?: number): { x: number; z: number; heading: number; edge: number; t: number; d: number };
  edgeAt(x: number, z: number): number;
  /** traffic-light phase offset of a signalised node (undefined = no lights) */
  signalOffset?(node: number): number | undefined;
}
