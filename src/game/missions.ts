/**
 * Main story missions and optional side missions. Pure data and logic (no DOM): the Flow drives them.
 * A mission is a list of steps; the player always has exactly one current step, shown in the HUD with a beam in the world.
 * Main missions are yellow and come one after another. Side missions are purple, start at their giver and never block the story.
 */
import type { SaveData } from '../core/save';

export type Step =
  /** short dialogue (line ids from content/he/lines.json) */
  | { t: 'say'; lines: string[] }
  /** drive into the ring of a POI. sec = time limit for this step; keep = the previous limit keeps running */
  | { t: 'goto'; poi: string; text: string; sec?: number; keep?: boolean; done?: string;
      /** speed test: the car must pass the ring at this speed (km/h) or faster */ kmh?: number }
  /** go into a garage or shop (drive into its ring and enter) */
  | { t: 'visit'; poi: string; text: string }
  /** finish the lesson of a learning garage */
  | { t: 'lesson'; lesson: string; text: string }
  /** finish a race (win = first place needed) */
  | { t: 'race'; race: string; text: string; win?: boolean };

export interface Mission { id: string; title: string; reward: number; steps: Step[] }

export const MISSIONS: Mission[] = [
  {
    id: 'm1', title: 'משלוח ראשון', reward: 40, steps: [
      { t: 'say', lines: ['m1.1', 'm1.2'] },
      { t: 'goto', poi: 'place_bakery', text: 'אספו חבילה במאפייה', done: 'החבילה אצלכם' },
      { t: 'goto', poi: 'shop_main', text: 'מסרו לחנות החלקים בזמן', sec: 120 },
    ],
  },
  {
    id: 'm1b', title: 'המוסך של דינה', reward: 60, steps: [
      { t: 'say', lines: ['mg.1', 'mg.2'] },
      { t: 'visit', poi: 'garage_main', text: 'היכנסו למוסך של דינה' },
      { t: 'say', lines: ['mg.3', 'mg.4'] },
    ],
  },
  {
    id: 'm2', title: 'חוקי הדרך', reward: 30, steps: [
      { t: 'say', lines: ['m2.1'] },
      { t: 'lesson', lesson: 'lesson06', text: 'למדו במוסך החוקים' },
    ],
  },
  {
    id: 'm3', title: 'למי ההודעה?', reward: 80, steps: [
      { t: 'say', lines: ['m3.1', 'm3.2'] },
      { t: 'goto', poi: 'place_police', text: 'Unicast: רק לתחנת המשטרה', done: 'נמען אחד קיבל' },
      { t: 'say', lines: ['m3.3'] },
      { t: 'goto', poi: 'garage_main', text: 'Broadcast: לכולם! המוסך של דינה', sec: 190 },
      { t: 'goto', poi: 'fuel1', text: 'Broadcast: תחנת הדלק', keep: true },
      { t: 'goto', poi: 'place_bakery', text: 'Broadcast: המאפייה', keep: true },
    ],
  },
  {
    id: 'm4', title: 'מרוץ ראשון', reward: 60, steps: [
      { t: 'say', lines: ['m4.1'] },
      { t: 'race', race: 'r_docks', text: 'סיימו את מעגל הרציפים' },
    ],
  },
  {
    id: 'm5', title: 'מגדל האקדמיה', reward: 30, steps: [
      { t: 'say', lines: ['m5.1'] },
      { t: 'lesson', lesson: 'lesson07', text: 'למדו במגדל האקדמיה' },
    ],
  },
  {
    id: 'm6', title: 'מסע שבע השכבות', reward: 140, steps: [
      { t: 'say', lines: ['m6.1', 'm6.2'] },
      { t: 'goto', poi: 'place_pizza', text: 'שכבה 7 · יישום: הפיצרייה', done: 'ההזמנה נכתבה' },
      { t: 'goto', poi: 'place_bookshop', text: 'שכבה 6 · ייצוג: חנות הספרים', done: 'תורגם והוצפן' },
      { t: 'goto', poi: 'place_cityhall', text: 'שכבה 5 · שיחה: העירייה', done: 'השיחה נפתחה' },
      { t: 'goto', poi: 'place_police', text: 'שכבה 4 · תעבורה: המשטרה', done: 'נוסף מספר פורט' },
      { t: 'goto', poi: 'place_tires', text: 'שכבה 3 · רשת: מוסך הצמיגים', done: 'נוספה כתובת IP' },
      { t: 'goto', poi: 'place_stadium', text: 'שכבה 2 · קו נתונים: האיצטדיון', done: 'נוספה כתובת MAC' },
      { t: 'goto', poi: 'fuel1', text: 'שכבה 1 · פיזית: תחנת הדלק ברציפים', done: 'הביטים יצאו לדרך' },
    ],
  },
  {
    id: 'm7', title: 'מחסן המכולות', reward: 30, steps: [
      { t: 'say', lines: ['m7.1'] },
      { t: 'lesson', lesson: 'lesson08', text: 'למדו במחסן המכולות' },
    ],
  },
  {
    id: 'm8', title: 'UDP או TCP', reward: 160, steps: [
      { t: 'say', lines: ['m8.1', 'm8.2'] },
      { t: 'goto', poi: 'place_taxi', text: 'אספו נוסע בתחנת המוניות', done: 'הנוסע עלה' },
      { t: 'goto', poi: 'place_cityhall', text: 'UDP: מהר לעירייה, בלי אישור', sec: 75 },
      { t: 'say', lines: ['m8.3'] },
      { t: 'goto', poi: 'place_bookshop', text: 'TCP: מסרו חבילה בחנות הספרים', done: 'נמסר. מחכים לאישור' },
      { t: 'goto', poi: 'place_cityhall', text: 'TCP: החזירו אישור (ACK) לעירייה', done: 'ACK התקבל' },
    ],
  },
  {
    id: 'm9', title: 'עקבות הרעש', reward: 120, steps: [
      { t: 'say', lines: ['m9.1', 'm9.2'] },
      { t: 'goto', poi: 'place_police', text: 'עקבות הרעש: המשטרה', sec: 110 },
      { t: 'goto', poi: 'shop_main', text: 'עקבות הרעש: חנות החלקים', sec: 60 },
      { t: 'goto', poi: 'garage_lesson07', text: 'עקבות הרעש: מגדל האקדמיה', sec: 60 },
      { t: 'say', lines: ['m9.3'] },
    ],
  },
  {
    id: 'm10', title: 'הגרנד פרי', reward: 300, steps: [
      { t: 'say', lines: ['m10.1'] },
      { t: 'race', race: 'grandprix', text: 'נצחו את הרעש בגרנד פרי', win: true },
    ],
  },
];

export interface MissionPos { idx: number; step: number }

export function currentMission(s: SaveData): Mission | null { return MISSIONS[s.mission.idx] ?? null; }
export function currentStep(s: SaveData): Step | null { return currentMission(s)?.steps[s.mission.step] ?? null; }

/** Advance one step. Returns the mission that was just completed (reward due), or null. */
export function advance(s: SaveData): Mission | null {
  const m = currentMission(s);
  if (!m) return null;
  s.mission.step++;
  if (s.mission.step < m.steps.length) return null;
  s.mission = { idx: s.mission.idx + 1, step: 0 };
  return m;
}

/** A time limit ran out: go back to the pick-up before the timed run (or to the start of the timed run). */
export function failStep(s: SaveData): void {
  const m = currentMission(s);
  if (!m) return;
  let j = s.mission.step;
  while (j > 0) { const st = m.steps[j]; if (st && st.t === 'goto' && st.keep) j--; else break; }
  const prev = m.steps[j - 1];
  if (prev && prev.t === 'goto' && prev.sec === undefined && !prev.keep) j--;
  s.mission.step = j;
}

/* ------------------------------------------------------------------ side missions */

/**
 * Optional jobs. The giver is a place in the city (a purple gem floats over it). Failing one (time is up, fragile cargo
 * was hit) only cancels it: the player can take it again at the giver. The first success pays the full reward, repeats pay less.
 */
export interface SideMission {
  id: string; title: string; giver: string; pitch: string; reward: number;
  /** fragile cargo: a real hit on the car cancels the job */ careful?: boolean;
  steps: Step[];
}

export const SIDE_MISSIONS: SideMission[] = [
  {
    id: 's_pizza', title: 'פיצה חמה', giver: 'place_pizza', reward: 70, pitch: 'שתי פיצות, שתי כתובות. כל חבילה מגיעה רק לכתובת שלה.', steps: [
      { t: 'goto', poi: 'garage_lesson08', text: 'פיצה למחסן המכולות', sec: 190, done: 'פיצה אחת נמסרה' },
      { t: 'goto', poi: 'garage_lesson07', text: 'פיצה למגדל האקדמיה', keep: true },
    ],
  },
  {
    id: 's_taxi', title: 'נהג מונית', giver: 'place_taxi', reward: 60, pitch: 'נוסע מחכה בעירייה וממהר למשטרה.', steps: [
      { t: 'goto', poi: 'place_cityhall', text: 'אספו נוסע בעירייה', done: 'הנוסע עלה' },
      { t: 'goto', poi: 'place_police', text: 'מהר לתחנת המשטרה', sec: 115 },
    ],
  },
  {
    id: 's_books', title: 'ספר עתיק', giver: 'place_bookshop', reward: 80, careful: true, pitch: 'ספר עתיק ושביר לעירייה. בלי שעון, אבל בלי אף מכה.', steps: [
      { t: 'goto', poi: 'place_cityhall', text: 'לעירייה, בזהירות' },
    ],
  },
  {
    id: 's_bakery', title: 'לחם חם', giver: 'place_bakery', reward: 60, pitch: 'שלוש חלות לשלושה לקוחות, לפני שיתקררו.', steps: [
      { t: 'goto', poi: 'garage_lesson06', text: 'חלה למוסך החוקים', sec: 120, done: 'אחת נמסרה' },
      { t: 'goto', poi: 'garage_main', text: 'חלה למוסך של דינה', keep: true, done: 'שתיים נמסרו' },
      { t: 'goto', poi: 'fuel1', text: 'חלה לתחנת הדלק', keep: true },
    ],
  },
  {
    id: 's_tires', title: 'מבחן מהירות', giver: 'place_tires', reward: 70, pitch: 'צמיגים חדשים! עברו בתחנת הדלק במהירות 100 קמ״ש לפחות.', steps: [
      { t: 'goto', poi: 'fuel2', text: 'עברו בתחנת הדלק ב-100 קמ״ש', kmh: 100 },
    ],
  },
  {
    id: 's_police', title: 'סיור זהיר', giver: 'place_police', reward: 70, careful: true, pitch: 'סיור שקט בעיר. שוטר טוב לא פוגע בכלום.', steps: [
      { t: 'goto', poi: 'shop_main', text: 'סיור: חנות החלקים', done: 'הכול שקט' },
      { t: 'goto', poi: 'garage_lesson07', text: 'סיור: מגדל האקדמיה', done: 'הכול שקט' },
      { t: 'goto', poi: 'place_police', text: 'חזרה לתחנה' },
    ],
  },
  {
    id: 's_stadium', title: 'כרטיסים למשחק', giver: 'place_stadium', reward: 90, pitch: 'כרטיסים לשני אוהדים, והמשחק מתחיל עוד מעט.', steps: [
      { t: 'goto', poi: 'fuel2', text: 'כרטיס לתחנת הדלק', sec: 240, done: 'כרטיס אחד נמסר' },
      { t: 'goto', poi: 'place_tires', text: 'כרטיס למוסך הצמיגים', keep: true },
    ],
  },
  {
    id: 's_cityhall', title: 'דואר העירייה', giver: 'place_cityhall', reward: 110, pitch: 'שלושה מכתבים רשומים. מסלול ארוך לשליחים רציניים.', steps: [
      { t: 'goto', poi: 'place_taxi', text: 'מכתב לתחנת המוניות', sec: 300, done: 'מכתב אחד נמסר' },
      { t: 'goto', poi: 'place_police', text: 'מכתב לתחנת המשטרה', keep: true, done: 'שניים נמסרו' },
      { t: 'goto', poi: 'place_bookshop', text: 'מכתב לחנות הספרים', keep: true },
    ],
  },
];

/** Side missions open after the first two story missions (the second one explains them). */
export const SIDE_UNLOCK_IDX = 2;
/** a repeat of a finished side mission pays this share of its reward */
export const SIDE_REPEAT = 0.3;
/** fragile cargo breaks when the hits since the pick-up add up to this much car health */
export const CAREFUL_LIMIT = 0.05;

export function sideById(id: string): SideMission | null { return SIDE_MISSIONS.find((m) => m.id === id) ?? null; }
export function sideActive(s: SaveData): SideMission | null { return s.side.active ? sideById(s.side.active.id) : null; }
export function sideUnlocked(s: SaveData): boolean { return s.mission.idx >= SIDE_UNLOCK_IDX; }
/** The side mission offered at a place (none while another one is running or before they unlock). */
export function sideOfferAt(s: SaveData, poi: string): SideMission | null {
  if (s.side.active || !sideUnlocked(s)) return null;
  return SIDE_MISSIONS.find((m) => m.giver === poi) ?? null;
}
export function sideReward(s: SaveData, m: SideMission): number { return s.side.done[m.id] ? Math.round(m.reward * SIDE_REPEAT) : m.reward; }
/** Advance the running side mission. Returns it with the coins earned when it was just completed, else null. */
export function sideAdvance(s: SaveData): { m: SideMission; reward: number } | null {
  const a = s.side.active, m = sideActive(s);
  if (!a || !m) { s.side.active = null; return null; }
  a.step++;
  if (a.step < m.steps.length) return null;
  const reward = sideReward(s, m);
  s.side.done[m.id] = (s.side.done[m.id] ?? 0) + 1;
  s.side.active = null;
  return { m, reward };
}

/** Steps that are already satisfied (a lesson finished earlier) are skipped. */
export function stepSatisfied(s: SaveData, st: Step): boolean {
  return st.t === 'lesson' && !!s.lessons[st.lesson]?.done;
}

/** The POI the current step points at (for the beam and the minimap). */
export function stepPoi(st: Step | null): string | null {
  if (!st) return null;
  if (st.t === 'goto' || st.t === 'visit') return st.poi;
  if (st.t === 'lesson') return `garage_${st.lesson}`;
  if (st.t === 'race') return `race_${st.race}`;
  return null;
}
