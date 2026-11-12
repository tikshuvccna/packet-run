import type { Ctx } from '../ui/ctx';
import { openGarage } from '../ui/garage';
import { runLessonHub } from '../ui/lessonhub';
import { say } from '../ui/dialogue';
import { Hud, type MiniMapProvider } from '../ui/hud';
import { openCredits, openHelp, openSettings, pickHero, showTitle } from '../ui/menus';
import { btn, h, overlay, ui } from '../ui/dom';
import { LESSON_GARAGE, LESSON_IDS, gatesFor } from '../content';
import type { DriveConfig, HudState, RaceDef, RaceResult } from '../drive/contract';
import { cleanedDistricts, nextLesson, statsFor } from './progress';
import {
  CAREFUL_LIMIT, MISSIONS, SIDE_MISSIONS, type SideMission, type Step, advance, currentMission, currentStep, failStep, sideActive, sideAdvance,
  sideOfferAt, sideReward, sideUnlocked, stepPoi, stepSatisfied,
} from './missions';

/** The 10 minute rule: fuel runs out after CAP seconds of driving without finishing a lesson. */
export const FUEL_CAP_SEC = 10 * 60;
const WARN_AT = 0.8;          // 8 minutes: first warning (fuel gauge low, arrow to the next garage)
const TOW_AFTER = 1.2;        // 12 minutes: the tow truck takes the player to the next lesson garage

/** Places that fix the car when it rolls through them slowly. */
const SERVICE = ['garage_main', 'fuel1', 'fuel2', 'place_tires'];

/** Where things are in the city (provided by the engine's city generator). */
export interface CityInfo {
  poiPos(id: string): { x: number; z: number; heading: number } | null;
  /** the POI ring itself (mission beams) */
  poiRaw(id: string): { x: number; z: number; label: string; reach: number } | null;
  minimap?: MiniMapProvider;
  /** POI id of the garage of a lesson, of the main garage, of the shop. */
  lessonPoi(lessonId: string): string;
}

export class Flow {
  private hud: Hud | null = null;
  private driveSec = 0;           // driving seconds since the last finished lesson
  private paused = 0;
  private offs: (() => void)[] = [];
  private city: CityInfo | null = null;
  private warned = false;
  private lastPosSave = 0;
  private inModal = false;
  private inRace = false;
  private raceCoins = 0;
  private lastResult = '';
  private deadline: number | null = null;   // seconds left of a timed mission step
  private missionBusy = false;
  private cargoHits = 0;                    // damage taken since a fragile side mission started
  private slowWarned = false;
  private repairT = 0;
  private deadlineKey = '';
  private needEnter = false;

  constructor(private ctx: Ctx) {}

  private get s() { return this.ctx.save.data; }
  setCity(c: CityInfo): void { this.city = c; }

  /** The mission the player is on right now: the running side mission, else the main story. */
  private cur(): { title: string; steps: Step[]; step: number; side: SideMission | null } | null {
    const a = this.s.side.active, sm = sideActive(this.s);
    if (a && sm) return { title: sm.title, steps: sm.steps, step: a.step, side: sm };
    if (a) this.s.side.active = null;
    const m = currentMission(this.s);
    return m ? { title: m.title, steps: m.steps, step: this.s.mission.step, side: null } : null;
  }
  private curStep(): Step | null { const c = this.cur(); return c ? c.steps[c.step] ?? null : null; }

  /** Where the minimap arrow points: the current mission, else the garage of the next lesson, else the grand prix. */
  objective(): { x: number; z: number; side?: boolean } | null {
    const mp = stepPoi(this.curStep());
    const mq = mp ? this.city?.poiRaw(mp) : null;
    if (mq) return { x: mq.x, z: mq.z, side: !!this.s.side.active };
    const lesson = nextLesson(this.s);
    const id = lesson ? this.city?.lessonPoi(lesson) : 'race_grandprix';
    const p = id ? this.city?.poiPos(id) : null;
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Side-mission givers to show (world gems, minimap). Empty before they unlock and while one is running. */
  sideSpots(): { x: number; z: number; label: string; done: boolean }[] {
    if (this.s.side.active || !sideUnlocked(this.s)) return [];
    const out: { x: number; z: number; label: string; done: boolean }[] = [];
    for (const m of SIDE_MISSIONS) { const p = this.city?.poiRaw(m.giver); if (p) out.push({ x: p.x, z: p.z, label: m.title, done: !!this.s.side.done[m.id] }); }
    return out;
  }

  async boot(): Promise<void> {
    for (;;) {
      const choice = await showTitle(this.ctx, {
        settings: () => openSettings(this.ctx, () => { this.ctx.save.reset(); }),
        help: () => openHelp(this.ctx),
        credits: () => openCredits(this.ctx),
        codex: () => openGarage(this.ctx),
      });
      if (choice === 'new') {
        const hero = await pickHero(this.ctx);
        if (!hero) continue;
        this.ctx.save.reset();
        Object.assign(this.s, { started: true, hero: hero.look, name: hero.name });
        this.ctx.save.save();
        await say(this.ctx, ['p.01', 'p.02', 'p.03', 'p.04', 'p.05', 'p.06', 'p.07']);
        await openHelp(this.ctx);
      } else if (!this.s.started) continue;
      await this.drive();
    }
  }

  private config(spawn: DriveConfig['spawn']): DriveConfig {
    const learned = LESSON_IDS.filter((id) => this.s.lessons[id]?.done);
    const q = this.s.settings.quality;
    return {
      seed: 11, look: { ...this.s.look }, stats: statsFor(this.s), spawn, cleaned: cleanedDistricts(this.s),
      unlocked: [1, 2, 3, 4, 5, 6, 7], gates: gatesFor(learned), quality: q === 'auto' ? 'high' : q,
      playerName: this.s.name, twoPlayers: this.s.twoPlayers, health: this.s.health,
    };
  }

  /** The open world: runs until the player leaves through the pause menu. */
  private drive(): Promise<void> {
    const bus = this.ctx.bus;
    let finish: () => void = () => undefined;
    const hud = new Hud(bus, () => { void this.pauseMenu().then((leave) => { if (leave) finish(); }); });
    this.hud = hud;
    hud.sideOffer = (poi) => sideOfferAt(this.s, poi)?.title ?? null;
    hud.mount(ui());
    hud.setCoins(this.s.coins);
    if (this.city?.minimap) hud.setMiniMap(this.city.minimap);
    this.ctx.audio.mood('city');
    this.warned = false;
    return new Promise<void>((resolve) => {
      const clock = window.setInterval(() => { if (!this.inModal && !this.paused) this.tick(); }, 1000);
      finish = (): void => {
        window.clearInterval(clock);
        this.offs.forEach((f) => f());
        this.offs = [];
        hud.destroy();
        this.hud = null;
        this.ctx.audio.engineOff();
        bus.emit('drive:marker', null);
        bus.emit('drive:side-spots', []);
        bus.emit('drive:quit', undefined);
        resolve();
      };
      this.offs.push(
        bus.on('audio:sfx', (e) => this.ctx.audio.sfx(e.name)),
        bus.on('audio:engine', (e) => this.ctx.audio.engine(e.rpm, e.speed, e.boost, e.skid)),
        bus.on('drive:pickup', (p) => { if (p.kind === 'coin') { this.earn(p.amount); if (this.inRace) this.raceCoins += p.amount; } else if (p.kind === 'parcel' && p.id && !this.s.parcels[p.id]) { this.s.parcels[p.id] = true; this.earn(20); } }),
        bus.on('drive:position', (p) => { if (performance.now() - this.lastPosSave > 4000) { this.lastPosSave = performance.now(); this.s.pos = { ...p }; this.ctx.save.save(); } }),
        bus.on('drive:poi', (e) => { void this.onPoi(e); }),
        bus.on('drive:hud', (s) => this.onHud(s)),
        bus.on('drive:race-end', (r) => { void this.onRaceEnd(r); }),
        bus.on('drive:damage', (d) => this.onDamage(d)),
      );
      bus.emit('drive:start', this.config(this.s.pos));
      this.deadline = null;
      this.cargoHits = 0;
      void this.enterStep();
    });
  }

  /* ------------------------------------------------------------ missions (main and side) */
  private showMission(): void {
    const c = this.cur(), st = c ? c.steps[c.step] ?? null : null;
    this.ctx.bus.emit('drive:side-spots', this.sideSpots());
    if (!c || !st || st.t === 'say') { this.hud?.setMission(null); this.ctx.bus.emit('drive:marker', null); return; }
    const side = !!c.side;
    this.hud?.setMission({ title: side ? `משימת צד: ${c.title}` : `משימה: ${c.title}`, text: st.text, sec: this.deadline, side, note: c.side?.careful ? 'מטען שביר: בלי מכות' : undefined });
    const id = stepPoi(st);
    const p = id ? this.city?.poiRaw(id) : null;
    this.ctx.bus.emit('drive:marker', p ? { x: p.x, z: p.z, label: p.label, side, r: p.reach } : null);
  }

  /** Enter the current step: play its talk, skip what is already done, start its clock, show it. */
  private async enterStep(): Promise<void> {
    if (this.missionBusy) return;
    this.missionBusy = true;
    try {
      for (;;) {
        const c = this.cur(), st = c ? c.steps[c.step] : null;
        if (!c || !st) break;
        if (st.t === 'say') { this.hud?.setMission(null); await this.modal(() => say(this.ctx, st.lines)); this.stepDone(); continue; }
        if (!c.side && stepSatisfied(this.s, st)) { this.stepDone(); continue; }
        // a clock that is already running for this step keeps running (coming back from a garage does not refill it)
        const key = `${c.side ? c.side.id : this.s.mission.idx}:${c.step}`;
        if (st.t === 'goto') { if (st.sec !== undefined) { if (this.deadlineKey !== key || this.deadline === null) this.deadline = st.sec; } else if (!st.keep) this.deadline = null; } else this.deadline = null;
        this.deadlineKey = key;
        break;
      }
    } finally { this.missionBusy = false; }
    this.ctx.save.save();
    this.showMission();
  }

  /** The current step is finished. main = advance the story even while a side mission is running. */
  private stepDone(main = false): void {
    if (!main && this.s.side.active) {
      const st = this.curStep();
      const fin = sideAdvance(this.s);
      if (fin) {
        this.deadline = null;
        this.earn(fin.reward);
        this.hud?.toast(`משימת צד הושלמה: ${fin.m.title} · +${fin.reward} מטבעות`, 'good', 4200);
        this.ctx.audio.sfx('win');
      } else if (st && st.t === 'goto') {
        if (st.done) this.hud?.toast(st.done, 'good');
        this.ctx.audio.sfx('good');
      }
      return;
    }
    const st = currentStep(this.s);
    const fin = advance(this.s);
    if (fin) {
      if (!this.s.side.active) this.deadline = null;
      this.earn(fin.reward);
      this.hud?.toast(`משימה הושלמה: ${fin.title} · +${fin.reward} מטבעות`, 'good', 4200);
      this.ctx.audio.sfx('win');
    } else if (st && st.t === 'goto') {
      if (st.done) this.hud?.toast(st.done, 'good');
      this.ctx.audio.sfx('good');
    }
  }

  /** A side mission failed or was dropped: nothing is lost, the giver offers it again. */
  private cancelSide(why: string): void {
    const m = sideActive(this.s);
    this.s.side.active = null;
    this.deadline = null; this.deadlineKey = '';
    if (m) { this.hud?.toast(why, 'bad', 4200); this.ctx.audio.sfx('bad'); }
    if (this.paused) { this.needEnter = true; this.showMission(); } else void this.enterStep();
  }

  /** 10 times a second while driving: repairs at service places, and did the car reach the mission ring? */
  private onHud(hs: HudState): void {
    if (this.inModal || this.inRace || this.missionBusy || this.paused) return;
    // slow pass through a garage, a fuel station or the tyre garage fixes the car
    if ((hs.health ?? 1) < 0.995 && hs.speedKmh < 60 && performance.now() - this.repairT > 3000 && SERVICE.some((id) => { const q = this.city?.poiRaw(id); return !!q && Math.hypot(q.x - hs.x, q.z - hs.z) < q.reach; })) {
      this.repairT = performance.now();
      this.ctx.bus.emit('drive:repair', undefined);
      this.hud?.toast('הרכב תוקן', 'good');
      this.ctx.audio.sfx('good');
    }
    const st = this.curStep();
    if (!st || st.t !== 'goto') return;
    const p = this.city?.poiRaw(st.poi);
    if (!p) return;
    const d = Math.hypot(p.x - hs.x, p.z - hs.z);
    if (d > p.reach + 25) this.slowWarned = false;
    if (d > p.reach) return;
    if (st.kmh !== undefined && hs.speedKmh < st.kmh) {
      if (!this.slowWarned) { this.slowWarned = true; this.hud?.toast(`${Math.round(hs.speedKmh)} קמ״ש. צריך ${st.kmh} לפחות. קחו תנופה ונסו שוב`, 'info', 4000); }
      return;
    }
    this.stepDone();
    void this.enterStep();
  }

  private onDamage(d: { health: number; amount: number; wreck: boolean }): void {
    if (d.wreck) {
      this.s.health = 0.5;
      this.hud?.toast('הרכב התקלקל! תיקון חירום...', 'bad', 3200);
      this.ctx.audio.sfx('bad');
    } else this.s.health = d.health;
    const m = sideActive(this.s);
    if (!m?.careful || this.missionBusy) return;
    this.cargoHits += d.amount;
    if (d.wreck || this.cargoHits >= CAREFUL_LIMIT) this.cancelSide(`המטען נפגע. אפשר לנסות שוב: ${this.city?.poiRaw(m.giver)?.label ?? ''}`);
  }

  private missionClock(): void {
    if (this.deadline === null || this.inRace || this.missionBusy) return;
    const st = this.curStep();
    if (!st || st.t !== 'goto') { this.deadline = null; return; }
    this.deadline--;
    if (this.deadline > 0) { this.showMission(); return; }
    this.deadline = null; this.deadlineKey = '';
    const side = sideActive(this.s);
    if (side) { this.cancelSide(`נגמר הזמן. אפשר לנסות שוב: ${this.city?.poiRaw(side.giver)?.label ?? ''}`); return; }
    failStep(this.s);
    this.hud?.toast('נגמר הזמן. מנסים שוב', 'bad', 3500);
    this.ctx.audio.sfx('bad');
    void this.enterStep();
  }

  /** A side-mission giver: a clear card that says it is optional, what it pays, and that the story waits. */
  private async offerSide(m: SideMission): Promise<void> {
    if (this.deadline !== null) { this.hud?.toast('קודם סיימו את המשימה עם השעון', 'info'); return; }
    let take = false;
    await this.modal(() => new Promise<void>((resolve) => {
      const { root, close } = overlay('side-screen');
      const card = h('div', 'lcard sidecard');
      card.appendChild(h('div', 'sidetag', 'משימת צד · רשות'));
      card.appendChild(h('h2', null, m.title));
      card.appendChild(h('p', 'sidepitch', m.pitch));
      const facts = h('div', 'sidefacts');
      const first = !this.s.side.done[m.id];
      facts.appendChild(h('span', 'sidefact', `פרס: ${sideReward(this.s, m)} מטבעות${first ? '' : ' (סיבוב חוזר)'}`));
      const timed = m.steps.find((st) => st.t === 'goto' && st.sec !== undefined);
      if (timed && timed.t === 'goto' && timed.sec !== undefined) facts.appendChild(h('span', 'sidefact', `שעון: ${Math.floor(timed.sec / 60)}:${String(timed.sec % 60).padStart(2, '0')}`));
      if (m.careful) facts.appendChild(h('span', 'sidefact', 'מטען שביר'));
      card.appendChild(facts);
      card.appendChild(h('p', 'sidenote', 'המשימה הראשית מחכה לכם. אפשר לבטל בתפריט ההפסקה.'));
      const row = h('div', 'siderow');
      row.append(
        btn('יוצאים לדרך', () => { take = true; close(); resolve(); }, 'btn primary big'),
        btn('לא עכשיו', () => { close(); resolve(); }, 'btn ghost'),
      );
      card.appendChild(row);
      root.appendChild(card);
    }));
    if (!take) return;
    this.s.side.active = { id: m.id, step: 0 };
    this.cargoHits = 0;
    this.ctx.audio.sfx('good');
    void this.enterStep();
  }

  /** Send the car as it is in the save (model, paint, and the stats of the car, wheels and upgrades) to the engine. */
  syncCar(): void {
    this.ctx.bus.emit('drive:set-look', { ...this.s.look });
    this.ctx.bus.emit('drive:set-stats', statsFor(this.s));
  }

  private earn(n: number): void {
    this.s.coins += Math.round(n);
    this.ctx.save.save();
    this.hud?.setCoins(this.s.coins);
  }

  /** One second of driving: advances the fuel clock and its story beats. */
  private tick(): void {
    this.missionClock();
    if (nextLesson(this.s) === null) { this.ctx.bus.emit('ui:clock', { fuel: 1 }); return; }
    this.driveSec++;
    const f = this.driveSec / FUEL_CAP_SEC;
    this.ctx.bus.emit('ui:clock', { fuel: Math.max(0, 1 - f) });
    if (f >= WARN_AT && !this.warned) {
      this.warned = true;
      this.hud?.toast('הדלק עומד להיגמר. נסעו למוסך הבא', 'bad', 5000);
    }
    if (f >= 1 && this.driveSec % 30 === 0 && f < TOW_AFTER) this.hud?.toast('הדלק נגמר! הגרר בדרך', 'bad', 3500);
    if (f >= TOW_AFTER) void this.tow();
  }

  /** The tow truck: nothing is lost; the player is brought to the next lesson garage. */
  private async tow(): Promise<void> {
    const lesson = nextLesson(this.s);
    this.driveSec = 0;
    this.warned = false;
    this.ctx.bus.emit('ui:clock', { fuel: 1 });
    if (!lesson) return;
    const poi = this.city?.poiPos(this.city.lessonPoi(lesson));
    if (poi) this.ctx.bus.emit('drive:teleport', poi);
    this.inModal = true;
    await say(this.ctx, ['g.02', 'g.03']);
    this.inModal = false;
    await this.visitLesson(lesson);
  }

  private async onPoi(e: { id: string; kind: string; lesson?: string; race?: RaceDef }): Promise<void> {
    if (this.inModal) return;
    const offer = sideOfferAt(this.s, e.id);
    if (e.kind === 'lesson' && e.lesson) {
      const next = nextLesson(this.s);
      const done = !!this.s.lessons[e.lesson]?.done;
      if (!done && next !== e.lesson) { this.hud?.toast(`קודם ${LESSON_GARAGE[next ?? '']?.name ?? 'המוסך הקודם'}`, 'info'); return; }
      await this.visitLesson(e.lesson);
    } else if (e.kind === 'garage' || e.kind === 'shop') {
      this.ctx.bus.emit('drive:repair', undefined);
      await this.modal(() => openGarage(this.ctx, e.kind === 'garage' ? 'cars' : 'upgrades'));
      this.syncCar();
      const st = currentStep(this.s);
      if (st && st.t === 'visit' && st.poi === e.id) { this.stepDone(true); void this.enterStep(); }
    } else if (e.kind === 'race' && e.race) {
      this.ctx.audio.mood('race');
      this.inRace = true; this.raceCoins = 0; this.lastResult = '';
      this.ctx.bus.emit('drive:start-race', e.race);
    } else if (offer) {
      await this.offerSide(offer);
    }
  }

  private async visitLesson(lessonId: string): Promise<void> {
    const wasDone = !!this.s.lessons[lessonId]?.done;
    await this.modal(async () => { await runLessonHub(this.ctx, lessonId); });
    if (!wasDone && this.s.lessons[lessonId]?.done) { this.driveSec = 0; this.warned = false; this.ctx.bus.emit('ui:clock', { fuel: 1 }); }
    this.syncCar();
    this.hud?.setCoins(this.s.coins);
    this.ctx.audio.mood('city');
    void this.enterStep();
  }

  private async modal(fn: () => Promise<void>): Promise<void> {
    this.inModal = true;
    this.ctx.bus.emit('ui:pause', { paused: true });
    try { await fn(); } finally {
      this.inModal = false;
      this.ctx.bus.emit('ui:pause', { paused: false });
      this.ctx.save.save();
      this.hud?.setCoins(this.s.coins);
      this.ctx.audio.mood('city');
    }
  }

  private async onRaceEnd(r: RaceResult): Promise<void> {
    this.ctx.audio.mood('city');
    const key = `${r.raceId}:${r.time}`;
    if (key === this.lastResult) return;          // the engine reports a finish once, but never double count
    this.lastResult = key;
    this.inRace = false;
    const prev = this.s.races[r.raceId];
    const order = { none: 0, bronze: 1, silver: 2, gold: 3 } as const;
    if (!prev || order[r.medal] > order[prev.medal] || (r.time < prev.best && r.medal === prev.medal)) this.s.races[r.raceId] = { medal: r.medal, best: r.time };
    this.earn(Math.max(0, r.coins - this.raceCoins));   // coins picked up during the race were already counted one by one
    this.raceCoins = 0;
    if (r.raceId === 'grandprix' && r.place === 1 && !this.s.bossWon) {
      this.s.bossWon = true; this.ctx.save.save();
      this.inModal = true;
      await say(this.ctx, ['w.01', 'w.02', 'w.03', 'w.04']);
      await openCredits(this.ctx);
      this.inModal = false;
    }
    const st = currentStep(this.s);
    if (st && st.t === 'race' && st.race === r.raceId && (!st.win || r.place === 1)) { this.stepDone(true); void this.enterStep(); }
    else if (st && st.t === 'race' && st.race === r.raceId) this.hud?.toast('צריך מקום ראשון. נסו שוב', 'info', 3500);
  }

  /** The mission list: the story so far in yellow, the optional side missions in purple. */
  private openMissions(): Promise<void> {
    const { root, close } = overlay('missions-screen');
    return new Promise<void>((resolve) => {
      const draw = (): void => {
        root.textContent = '';
        const card = h('div', 'lcard mlist');
        card.appendChild(h('h2', null, 'משימות'));
        const main = currentMission(this.s);
        const mrow = h('div', 'mrow main');
        mrow.append(h('b', null, 'משימה ראשית'), h('span', null, main ? `${this.s.mission.idx + 1} מתוך ${MISSIONS.length}: ${main.title}` : 'כל המשימות הראשיות הושלמו'));
        card.appendChild(mrow);
        card.appendChild(h('h3', 'mside-h', 'משימות צד · רשות'));
        if (!sideUnlocked(this.s)) card.appendChild(h('p', 'sidenote', 'נפתחות אחרי הביקור במוסך של דינה.'));
        else {
          card.appendChild(h('p', 'sidenote', 'חפשו יהלום סגול עם סימן קריאה בעיר ובמפה.'));
          for (const m of SIDE_MISSIONS) {
            const n = this.s.side.done[m.id] ?? 0, on = this.s.side.active?.id === m.id;
            const row = h('div', `mrow side${n ? ' done' : ''}${on ? ' on' : ''}`);
            row.append(h('b', null, `${n ? '✓' : '◆'} ${m.title}`), h('span', null, `${on ? 'פעילה עכשיו · ' : ''}${this.city?.poiRaw(m.giver)?.label ?? ''} · ${sideReward(this.s, m)} מטבעות`));
            card.appendChild(row);
          }
        }
        const row = h('div', 'siderow');
        if (this.s.side.active) row.appendChild(btn('ביטול משימת הצד', () => { this.cancelSide('משימת הצד בוטלה'); draw(); }, 'btn ghost'));
        row.appendChild(btn('סגירה', () => { close(); resolve(); }, 'btn primary'));
        card.appendChild(row);
        root.appendChild(card);
      };
      draw();
    });
  }

  /** Pause overlay. Resolves true when the player asked to leave to the title. */
  private async pauseMenu(): Promise<boolean> {
    this.paused++;
    this.ctx.bus.emit('ui:pause', { paused: true });
    const { root, close } = overlay('pause-screen');
    const leave = await new Promise<boolean>((resolve) => {
      const card = h('div', 'lcard');
      card.appendChild(h('h2', null, 'הפסקה'));
      const col = h('div', 'menu');
      col.append(
        btn('המשך', () => { close(); resolve(false); }, 'btn primary big'),
        btn('משימות', () => { void this.openMissions(); }, 'btn'),
        btn('הגדרות', () => { void openSettings(this.ctx); }, 'btn'),
        btn('עזרה', () => { void openHelp(this.ctx); }, 'btn'),
        btn('קרדיטים', () => { void openCredits(this.ctx); }, 'btn'),
        btn('לתפריט הראשי', () => { close(); resolve(true); }, 'btn ghost'),
      );
      card.appendChild(col);
      root.appendChild(card);
    });
    this.paused--;
    this.ctx.bus.emit('ui:pause', { paused: false });
    if (this.needEnter && !leave) { this.needEnter = false; void this.enterStep(); }
    return leave;
  }
}
