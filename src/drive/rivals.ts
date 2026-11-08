/** Named rival drivers (no humans shown: each is a car with a personality). The UI may import this list. */
import type { CarId, CarLook } from './contract';

export interface RivalDef {
  id: string; he: string; car: CarId; look: CarLook;
  /** 0..1: corner speed and line accuracy */ skill: number;
  /** 0..1: overtakes, nitro and item use */ aggression: number;
  /** wider or tighter lines (m of lateral preference) */ lane: number;
  blurb: string;
}

const look = (car: CarId, paint: string, vinyl: CarLook['vinyl'], vinylColor: string, rim: string, spoiler = false): CarLook =>
  ({ car, paint, vinyl, vinylColor, wheels: car === 'jeep' ? 'offroad' : car === 'sport' || car === 'super' ? 'sport' : 'std', rim, spoiler });

/** Ladder order: beating a rival in a race unlocks the next (the UI keeps the ladder). The last one is the Noise. */
export const RIVALS: RivalDef[] = [
  { id: 'bit', he: 'ביט', car: 'hatch', look: look('hatch', '#7fd957', 'stripes', '#ffffff', '#ffd877'), skill: 0.35, aggression: 0.3, lane: -1, blurb: 'קטן ושמח. נוהג בזהירות.' },
  { id: 'frame', he: 'פריים', car: 'van', look: look('van', '#ff9a3c', 'checker', '#3b3f4a', '#d8dde3'), skill: 0.45, aggression: 0.5, lane: 1, blurb: 'אוהב לחסום באמצע הכביש.' },
  { id: 'hop', he: 'הופ', car: 'jeep', look: look('jeep', '#4a90e2', 'stars', '#ffffff', '#2b2f3a'), skill: 0.55, aggression: 0.6, lane: 0, blurb: 'קופץ מכל רמפה.' },
  { id: 'port', he: 'פורט', car: 'sport', look: look('sport', '#e55a4e', 'flames', '#ffd23f', '#d8dde3', true), skill: 0.68, aggression: 0.7, lane: -0.5, blurb: 'מהיר בישורות, נלחץ בפניות.' },
  { id: 'session', he: 'סשן', car: 'sport', look: look('sport', '#9b59d0', 'net', '#35d3b0', '#ffd877', true), skill: 0.78, aggression: 0.55, lane: 0.6, blurb: 'קו נקי ומדויק.' },
  { id: 'cipher', he: 'צופן', car: 'super', look: look('super', '#2dc4e8', 'stripes', '#10141c', '#ff7f6e', true), skill: 0.86, aggression: 0.8, lane: 0, blurb: 'לא אומר מילה. נוהג מושלם.' },
  { id: 'noise', he: 'הרעש', car: 'super', look: look('super', '#16141c', 'net', '#e55a4e', '#2b2f3a', true), skill: 0.95, aggression: 1, lane: 0, blurb: 'הרכב השחור המעוות. שובר את כל החוקים.' },
];

/** Traffic paints (civilian cars). */
export const TRAFFIC_PAINTS = ['#f3e4c4', '#9ecbd9', '#c9a66b', '#d98c5f', '#b79ae0', '#7fae6a', '#e8cf3a', '#c0c8d0', '#ff7fb0', '#5b6b7a'];
