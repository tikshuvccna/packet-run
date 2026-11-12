import type { SaveData, UpgradeId } from '../core/save';
import { UPGRADE_IDS, UPGRADE_MAX } from '../core/save';
import { LESSON_IDS } from '../content';
import type { Level } from '../learn/types';
import type { CarId, CarStats, VinylId, WheelId } from '../drive/contract';

export function lessonDone(s: SaveData, id: string): boolean { return !!s.lessons[id]?.done; }

/** The next lesson the clock sends the player to (null when all are done). */
export function nextLesson(s: SaveData): string | null {
  for (const id of LESSON_IDS) if (!lessonDone(s, id)) return id;
  return null;
}
export function allLessonsDone(s: SaveData): boolean { return nextLesson(s) === null; }

/** Districts opened/cleaned by finished lessons (leg 1 -> districts 1-3, 2 -> 4-5, 3 -> 6-7): visuals only. */
export function cleanedDistricts(s: SaveData): number[] {
  const out: number[] = [];
  if (lessonDone(s, 'lesson06')) out.push(1, 2, 3);
  if (lessonDone(s, 'lesson07')) out.push(4, 5);
  if (lessonDone(s, 'lesson08')) out.push(6, 7);
  return out;
}

/* ---------- cars, wheels, vinyls */
export interface CarDef { id: CarId; he: string; price: number; base: Omit<CarStats, 'nitroCap' | 'nitroRegen' | 'nitroPower' | 'armor' | 'itemSlots' | 'brake'>; blurb: string }
export const CARS: CarDef[] = [
  { id: 'van', he: 'טנדר דינה', price: 0, base: { topSpeed: 40, accel: 13, grip: 1.0, handling: 1.0, mass: 1800 }, blurb: 'ישן וידידותי. מתחילים כאן.' },
  { id: 'hatch', he: 'חרק', price: 180, base: { topSpeed: 42, accel: 15, grip: 1.1, handling: 1.12, mass: 1100 }, blurb: 'קטן, זריז, מסתובב בכל פינה.' },
  { id: 'sport', he: 'סופר-גל', price: 450, base: { topSpeed: 48, accel: 17, grip: 1.15, handling: 1.15, mass: 1300 }, blurb: 'נמוך ומהיר. אוהב עקומות.' },
  { id: 'jeep', he: 'שועל', price: 650, base: { topSpeed: 43, accel: 14, grip: 1.25, handling: 0.95, mass: 2000 }, blurb: 'גבוה וחזק. לא מפחד מכלום.' },
  { id: 'super', he: 'ברק', price: 1300, base: { topSpeed: 54, accel: 19, grip: 1.2, handling: 1.2, mass: 1400 }, blurb: 'הכי מהיר בעיר.' },
];
export const WHEELS: { id: WheelId; he: string; price: number; grip: number; handling: number; top: number }[] = [
  { id: 'std', he: 'רגילים', price: 0, grip: 0, handling: 0, top: 0 },
  { id: 'sport', he: 'ספורט', price: 120, grip: 0.04, handling: 0.1, top: 1 },
  { id: 'offroad', he: 'שטח', price: 120, grip: 0.12, handling: -0.04, top: -1 },
];
export const VINYLS: { id: VinylId; he: string; price: number }[] = [
  { id: 'stripes', he: 'פסים', price: 60 },
  { id: 'checker', he: 'משבצות', price: 80 },
  { id: 'stars', he: 'כוכבים', price: 90 },
  { id: 'flames', he: 'להבות', price: 110 },
  { id: 'net', he: 'רשת', price: 100 },
];
export const PAINTS = ['#f2b134', '#e55a4e', '#35d3b0', '#4a90e2', '#9b59d0', '#ff7fb0', '#ffffff', '#3b3f4a', '#7fd957', '#ff9a3c', '#2dc4e8', '#c0c8d0'];
export const RIMS = ['#d8dde3', '#ffd877', '#ff7f6e', '#35d3b0', '#2b2f3a'];

/* ---------- upgrades */
export const UPGRADE_HE: Record<UpgradeId, string> = {
  engine: 'מנוע', nitro: 'נייטרוס', tires: 'צמיגים', brakes: 'בלמים', armor: 'שריון', slots: 'כיס פריטים',
};
export const UPGRADE_DESC: Record<UpgradeId, string> = {
  engine: 'מהירות מירבית ותאוצה', nitro: 'יותר נייטרוס ומילוי מהיר', tires: 'אחיזה ופניות חדות', brakes: 'בלימה קצרה', armor: 'פחות נזק ופחות איבוד מהירות בהתנגשות', slots: 'שני פריטים ביד',
};
export const UPGRADE_PRICE: Record<UpgradeId, number[]> = {
  engine: [80, 160, 300], nitro: [70, 140, 260], tires: [60, 120, 220], brakes: [40, 90, 170], armor: [50, 110, 200], slots: [150],
};
export function upgradePrice(s: SaveData, id: UpgradeId): number | null {
  return UPGRADE_PRICE[id][s.upgrades[id]] ?? null;
}
export function buyUpgrade(s: SaveData, id: UpgradeId): boolean {
  const price = upgradePrice(s, id);
  if (price === null || s.upgrades[id] >= UPGRADE_MAX[id] || s.coins < price) return false;
  s.coins -= price;
  s.upgrades[id] += 1;
  return true;
}
export function buyCar(s: SaveData, id: CarId): boolean {
  const c = CARS.find((x) => x.id === id);
  if (!c || s.cars.includes(id) || s.coins < c.price) return false;
  s.coins -= c.price; s.cars.push(id); return true;
}
export function buyWheels(s: SaveData, id: WheelId): boolean {
  const w = WHEELS.find((x) => x.id === id);
  if (!w || s.wheels.includes(id) || s.coins < w.price) return false;
  s.coins -= w.price; s.wheels.push(id); return true;
}
export function buyVinyl(s: SaveData, id: VinylId): boolean {
  const v = VINYLS.find((x) => x.id === id);
  if (!v || s.vinyls.includes(id) || s.coins < v.price) return false;
  s.coins -= v.price; s.vinyls.push(id); return true;
}

/** Final car stats from the car, the wheels and the upgrades. */
export function statsFor(s: SaveData): CarStats {
  const car = CARS.find((c) => c.id === s.look.car) ?? (CARS[0] as CarDef);
  const w = WHEELS.find((x) => x.id === s.look.wheels) ?? (WHEELS[0] as (typeof WHEELS)[number]);
  const u = s.upgrades;
  return {
    topSpeed: car.base.topSpeed + 3 * u.engine + w.top,
    accel: car.base.accel + 1.2 * u.engine,
    brake: 30 + 4 * u.brakes,
    grip: car.base.grip + 0.08 * u.tires + w.grip,
    handling: car.base.handling + 0.05 * u.tires + w.handling,
    mass: car.base.mass,
    nitroCap: 2.5 + 0.8 * u.nitro,
    nitroRegen: 0.12 + 0.04 * u.nitro,
    nitroPower: 1.35 + 0.03 * u.nitro,
    armor: 0.2 * u.armor,
    itemSlots: 1 + u.slots,
  };
}

/* ---------- prizes: lesson + level -> a fixed reward (no randomness) */
export interface Prize { id: string; he: string; desc: string; upgrade?: UpgradeId; car?: CarId; wheels?: WheelId; vinyl?: VinylId; coins?: number }
export const PRIZES: Record<string, Record<Level, Prize>> = {
  lesson06: {
    easy: { id: 'p06e', he: 'מנוע משודרג', desc: 'מהירות ותאוצה', upgrade: 'engine' },
    medium: { id: 'p06m', he: 'מדבקת להבות', desc: 'וינייל חדש לרכב, ו-40 מטבעות', vinyl: 'flames', coins: 40 },
    hard: { id: 'p06h', he: 'חרק (רכב חדש)', desc: 'הרכב הקטן והזריז, בחינם', car: 'hatch' },
  },
  lesson07: {
    easy: { id: 'p07e', he: 'נייטרוס גדול', desc: 'יותר נייטרוס', upgrade: 'nitro' },
    medium: { id: 'p07m', he: 'גלגלי ספורט', desc: 'פניות חדות יותר', wheels: 'sport', coins: 40 },
    hard: { id: 'p07h', he: 'סופר-גל (רכב חדש)', desc: 'רכב ספורט מהיר, בחינם', car: 'sport' },
  },
  lesson08: {
    easy: { id: 'p08e', he: 'צמיגים טובים', desc: 'אחיזה חזקה', upgrade: 'tires' },
    medium: { id: 'p08m', he: 'מדבקת רשת', desc: 'וינייל חדש, ו-60 מטבעות', vinyl: 'net', coins: 60 },
    hard: { id: 'p08h', he: 'ברק (רכב חדש)', desc: 'הרכב הכי מהיר, בחינם', car: 'super' },
  },
};

/** Applies a prize once; null when it was already granted. */
export function grantPrize(s: SaveData, lessonId: string, level: Level): Prize | null {
  const p = PRIZES[lessonId]?.[level];
  if (!p) return null;
  const key = `prize.${p.id}`;
  if (s.flags[key]) return null;
  s.flags[key] = true;
  if (p.upgrade && s.upgrades[p.upgrade] < UPGRADE_MAX[p.upgrade]) s.upgrades[p.upgrade] += 1;
  if (p.car && !s.cars.includes(p.car)) s.cars.push(p.car);
  if (p.wheels && !s.wheels.includes(p.wheels)) s.wheels.push(p.wheels);
  if (p.vinyl && !s.vinyls.includes(p.vinyl)) s.vinyls.push(p.vinyl);
  if (p.coins) s.coins += p.coins;
  return p;
}

export function totalUpgrades(s: SaveData): number { return UPGRADE_IDS.reduce((a, id) => a + s.upgrades[id], 0); }
