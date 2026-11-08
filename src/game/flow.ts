import type { Ctx } from '../ui/ctx';
import { openGarage } from '../ui/garage';
import { runLessonHub } from '../ui/lessonhub';
import { say } from '../ui/dialogue';
import { Hud, type MiniMapProvider } from '../ui/hud';
import { openCredits, openHelp, openSettings, pickHero, showTitle } from '../ui/menus';
import { btn, h, overlay, ui } from '../ui/dom';
import { LESSON_GARAGE, LESSON_IDS, gatesFor } from '../content';
import type { DriveConfig, RaceDef, RaceResult } from '../drive/contract';
import { cleanedDistricts, nextLesson, statsFor } from './progress';

/** The 10 minute rule: fuel runs out after CAP seconds of driving without finishing a lesson. */
export const FUEL_CAP_SEC = 10 * 60;
const WARN_AT = 0.8;          // 8 minutes: first warning (fuel gauge low, arrow to the next garage)
const TOW_AFTER = 1.2;        // 12 minutes: the tow truck takes the player to the next lesson garage

/** Where things are in the city (provided by the engine's city generator). */
export interface CityInfo {
  poiPos(id: string): { x: number; z: number; heading: number } | null;
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

  constructor(private ctx: Ctx) {}

  private get s() { return this.ctx.save.data; }
  setCity(c: CityInfo): void { this.city = c; }
  /** Where the minimap arrow points: the garage of the next lesson, or the grand prix when all lessons are done. */
  objective(): { x: number; z: number } | null {
    const lesson = nextLesson(this.s);
    const id = lesson ? this.city?.lessonPoi(lesson) : 'race_grandprix';
    const p = id ? this.city?.poiPos(id) : null;
    return p ? { x: p.x, z: p.z } : null;
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
      playerName: this.s.name, twoPlayers: this.s.twoPlayers,
    };
  }

  /** The open world: runs until the player leaves through the pause menu. */
  private drive(): Promise<void> {
    const bus = this.ctx.bus;
    let finish: () => void = () => undefined;
    const hud = new Hud(bus, () => { void this.pauseMenu().then((leave) => { if (leave) finish(); }); }, { autoGas: matchMedia('(pointer: coarse)').matches });
    this.hud = hud;
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
        bus.emit('drive:quit', undefined);
        resolve();
      };
      this.offs.push(
        bus.on('audio:sfx', (e) => this.ctx.audio.sfx(e.name)),
        bus.on('audio:engine', (e) => this.ctx.audio.engine(e.rpm, e.speed, e.boost, e.skid)),
        bus.on('drive:pickup', (p) => { if (p.kind === 'coin') { this.earn(p.amount); if (this.inRace) this.raceCoins += p.amount; } else if (p.kind === 'parcel' && p.id && !this.s.parcels[p.id]) { this.s.parcels[p.id] = true; this.earn(20); } }),
        bus.on('drive:position', (p) => { if (performance.now() - this.lastPosSave > 4000) { this.lastPosSave = performance.now(); this.s.pos = { ...p }; this.ctx.save.save(); } }),
        bus.on('drive:poi', (e) => { void this.onPoi(e); }),
        bus.on('drive:race-end', (r) => { void this.onRaceEnd(r); }),
      );
      bus.emit('drive:start', this.config(this.s.pos));
      const next = nextLesson(this.s);
      if (!this.s.flags['tip.drive']) {
        this.s.flags['tip.drive'] = true; this.ctx.save.save();
        hud.toast(next ? 'נסעו אל מוסך החוקים: עיגול כניסה, ואז E' : 'גרנד פרי הרשת מחכה', 'info', 4500);
      }
    });
  }

  private earn(n: number): void {
    this.s.coins += Math.round(n);
    this.ctx.save.save();
    this.hud?.setCoins(this.s.coins);
  }

  /** One second of driving: advances the fuel clock and its story beats. */
  private tick(): void {
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
    if (e.kind === 'lesson' && e.lesson) {
      const next = nextLesson(this.s);
      const done = !!this.s.lessons[e.lesson]?.done;
      if (!done && next !== e.lesson) { this.hud?.toast(`קודם ${LESSON_GARAGE[next ?? '']?.name ?? 'המוסך הקודם'}`, 'info'); return; }
      await this.visitLesson(e.lesson);
    } else if (e.kind === 'garage') {
      await this.modal(() => openGarage(this.ctx, 'cars'));
    } else if (e.kind === 'shop') {
      await this.modal(() => openGarage(this.ctx, 'upgrades'));
    } else if (e.kind === 'race' && e.race) {
      this.ctx.audio.mood('race');
      this.inRace = true; this.raceCoins = 0; this.lastResult = '';
      this.ctx.bus.emit('drive:start-race', e.race);
    }
  }

  private async visitLesson(lessonId: string): Promise<void> {
    const wasDone = !!this.s.lessons[lessonId]?.done;
    await this.modal(async () => { await runLessonHub(this.ctx, lessonId); });
    if (!wasDone && this.s.lessons[lessonId]?.done) { this.driveSec = 0; this.warned = false; this.ctx.bus.emit('ui:clock', { fuel: 1 }); }
    this.ctx.bus.emit('drive:set-look', { ...this.s.look });
    this.hud?.setCoins(this.s.coins);
    this.ctx.audio.mood('city');
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
    return leave;
  }
}
