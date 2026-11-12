import '../hud.css';
import type { Bus } from '../core/bus';
import type { DriveInput, HudState, ItemId } from '../drive/contract';
import { NO_INPUT } from '../drive/contract';
import { btn, h } from './dom';

const ITEM_HE: Record<ItemId, string> = { oil: 'שמן', cones: 'חרוטים', glue: 'דבק', boostpad: 'רמפת טורבו', mine: 'בועה מגנטית', smoke: 'עשן' };
const ITEM_COLOR: Record<ItemId, string> = { oil: '#2b2f3a', cones: '#ff9a3c', glue: '#7fd957', boostpad: '#35d3b0', mine: '#9b59d0', smoke: '#c0c8d0' };

/** The mission box: side missions are purple and say so in the title. */
export interface MissionView { title: string; text: string; sec: number | null; side?: boolean; note?: string }

export interface MiniMapProvider { draw(ctx2d: CanvasRenderingContext2D, w: number, h: number, s: HudState): void }

/** Driving overlay: speed, nitro, items, race info, quiz-box banner, fuel (the 10 minute clock), touch controls (physical left/right: RTL must never swap them). */
export class Hud {
  readonly root: HTMLElement;
  private speedEl: HTMLElement;
  private nitroFill: HTMLElement;
  private itemsEl: HTMLElement;
  private coinText: HTMLElement;
  private raceBox: HTMLElement;
  private missionBox: HTMLElement;
  private mission: MissionView | null = null;
  /** set by the flow: the title of the side mission offered at a place, or null */
  sideOffer: ((poi: string) => string | null) | null = null;
  private carFill: HTMLElement;
  private hitEl: HTMLElement;
  private banner: HTMLElement;
  private promptEl: HTMLElement;
  private toasts: HTMLElement;
  private fuelFill: HTMLElement;
  private wrongWay: HTMLElement;
  private comboEl: HTMLElement;
  private map: HTMLCanvasElement;
  private mapProvider: MiniMapProvider | null = null;
  private input: DriveInput = { ...NO_INPUT };
  private offs: (() => void)[] = [];
  private lastSend = 0;
  private touchMode = false;
  private wheelEl!: HTMLElement;
  private wheelAngle = 0;
  private leverKnob!: HTMLElement;
  private leverEl!: HTMLElement;
  private lever = 0;
  private last: HudState | null = null;
  private actBtn!: HTMLButtonElement;

  constructor(private bus: Bus, onPause: () => void) {
    const r = (this.root = h('div', 'hud'));
    const top = h('div', 'hud-top');
    const left = h('div', 'hud-left');
    this.raceBox = h('div', 'racebox hidden');
    this.missionBox = h('div', 'missionbox hidden');
    left.append(this.raceBox, this.missionBox);
    const right = h('div', 'hud-right');
    const coin = h('div', 'coinpill');
    this.coinText = h('b', null, '0');
    coin.append(h('span', 'coin'), this.coinText);
    right.append(coin, btn('הפסקה', onPause, 'btn small ghost'));
    this.map = h('canvas', 'minimap') as HTMLCanvasElement;
    this.map.width = 160; this.map.height = 160;
    const fuel = h('div', 'fuelgauge');
    fuel.appendChild(h('span', 'fuel-label', 'דלק'));
    const ft = h('div', 'bar-track'); this.fuelFill = h('div', 'bar-fill fuel'); ft.appendChild(this.fuelFill); fuel.appendChild(ft);
    const car = h('div', 'fuelgauge cargauge');
    car.appendChild(h('span', 'fuel-label', 'רכב'));
    const ct = h('div', 'bar-track'); this.carFill = h('div', 'bar-fill car'); ct.appendChild(this.carFill); car.appendChild(ct);
    const rcol = h('div', 'hud-rcol'); rcol.append(right, this.map, fuel, car);
    this.hitEl = h('div', 'hitflash');
    top.append(left, rcol);

    this.banner = h('div', 'qbanner hidden');
    this.wrongWay = h('div', 'wrongway hidden', 'כיוון הפוך');
    this.comboEl = h('div', 'combo hidden');
    this.promptEl = h('div', 'prompt hidden');
    this.toasts = h('div', 'toasts');

    const dash = h('div', 'dash');
    this.speedEl = h('div', 'speed', '0');
    dash.append(this.speedEl, h('div', 'speed-unit', 'קמ״ש'));
    const nitro = h('div', 'nitrobar');
    this.nitroFill = h('div', 'nitro-fill');
    nitro.append(h('span', 'nitro-label', 'נייטרוס'), (() => { const t = h('div', 'bar-track'); t.appendChild(this.nitroFill); return t; })());
    this.itemsEl = h('div', 'itemsrow');
    dash.append(nitro, this.itemsEl);

    // touch controls: a steering wheel you turn (bottom-left); a power lever like an airplane throttle (forward / N / R),
    // a brake pedal and the action buttons (bottom-right)
    const steer = h('div', 'steerpad');
    steer.appendChild(this.buildWheel());
    const pedals = h('div', 'pedals');
    const brake = this.holdBtn('abtn brake', 'בלם', () => { this.input.brake = 1; }, () => { this.input.brake = 0; });
    const nit = this.holdBtn('abtn nitro', 'נייטרוס', () => { this.input.nitro = true; }, () => { this.input.nitro = false; });
    const item = this.holdBtn('abtn throwit', 'זריקה', () => { this.input.useItem = true; }, () => { this.input.useItem = false; });
    const drift = this.holdBtn('abtn drift', 'דריפט', () => { this.input.handbrake = true; }, () => { this.input.handbrake = false; });
    this.touchMode = matchMedia('(pointer: coarse), (hover: none)').matches;
    if (this.touchMode) this.input.reverse = 0;
    pedals.append(drift, nit, item, brake, this.buildLever());
    this.actBtn = this.holdBtn('abtn act hidden', 'כניסה', () => { this.input.action = true; }, () => { this.input.action = false; });
    const back = this.holdBtn('abtn resetbtn', 'חזרה לכביש', () => { this.input.reset = true; }, () => { this.input.reset = false; });
    const look = this.holdBtn('abtn lookbtn', 'מאחור', () => { this.input.look = true; }, () => { this.input.look = false; });

    r.append(this.hitEl, top, this.banner, this.wrongWay, this.comboEl, this.promptEl, this.toasts, dash, steer, pedals, this.actBtn, back, look);

    this.offs.push(
      bus.on('drive:hud', (s) => this.update(s)),
      bus.on('drive:prompt', (p) => {
        const side = p ? this.sideOffer?.(p.id) ?? null : null;
        this.promptEl.textContent = side ? (this.touchMode ? `משימת צד: ${side}` : `E / Enter: משימת צד · ${side}`) : p?.text ?? '';
        this.promptEl.classList.toggle('side', !!side);
        this.promptEl.classList.toggle('hidden', !p);
      }),
      bus.on('drive:damage', (d) => { if (d.amount > 0.02 || d.wreck) { this.hitEl.classList.remove('on'); void this.hitEl.offsetWidth; this.hitEl.classList.add('on'); } }),
      bus.on('drive:toast', (t) => this.toast(t.text, t.kind)),
      bus.on('ui:pause', (p) => { if (p.paused) this.setLever(0); }),
      bus.on('ui:clock', (c) => { this.fuelFill.style.width = `${Math.max(0, Math.min(1, c.fuel)) * 100}%`; this.fuelFill.classList.toggle('low', c.fuel < 0.25); }),
    );
    this.send(true);
  }

  mount(parent: HTMLElement): void { parent.appendChild(this.root); }
  destroy(): void { this.offs.forEach((o) => o()); this.root.remove(); this.bus.emit('ui:input', { ...NO_INPUT }); }
  setMiniMap(p: MiniMapProvider | null): void { this.mapProvider = p; this.map.classList.toggle('hidden', !p); }
  /** Current mission step (null hides the box). sec = seconds left of a time limit. */
  setMission(m: MissionView | null): void {
    this.mission = m;
    this.missionBox.textContent = '';
    this.missionBox.classList.toggle('side', !!m?.side);
    this.missionBox.classList.toggle('hidden', !m || !!this.last?.race);
    if (!m) return;
    this.missionBox.append(h('b', null, m.title), h('span', null, m.text));
    if (m.note) this.missionBox.appendChild(h('span', 'mnote', m.note));
    if (m.sec !== null) { const t = h('span', 'mtimer', fmtTime(Math.max(0, m.sec)).replace(/\.\d$/, '')); if (m.sec <= 15) t.classList.add('low'); this.missionBox.appendChild(t); }
  }
  setCoins(n: number): void { this.coinText.textContent = String(Math.round(n)); }

  update(s: HudState): void {
    this.last = s;
    this.send();   // keep the touch input fresh (the engine drops it after 400 ms of silence)
    this.speedEl.textContent = String(Math.round(s.speedKmh));
    this.nitroFill.style.width = `${Math.max(0, Math.min(1, s.nitro / Math.max(0.01, s.nitroCap))) * 100}%`;
    this.itemsEl.textContent = '';
    for (const it of s.items) {
      const i = h('span', 'itemchip', ITEM_HE[it]);
      i.style.borderColor = ITEM_COLOR[it];
      this.itemsEl.appendChild(i);
    }
    this.actBtn.classList.toggle('hidden', !s.nearPoi || (s.nearPoi.kind === 'place' && !this.sideOffer?.(s.nearPoi.id)) || !!s.race);
    const hp = Math.max(0, Math.min(1, s.health ?? 1));
    this.carFill.style.width = `${hp * 100}%`;
    this.carFill.classList.toggle('low', hp < 0.35);
    this.wrongWay.classList.toggle('hidden', !s.wrongWay);
    this.comboEl.textContent = s.combo > 1 ? `קומבו ${s.combo}` : '';
    this.comboEl.classList.toggle('hidden', s.combo <= 1);
    if (s.race) {
      const rc = s.race;
      this.raceBox.classList.remove('hidden');
      this.missionBox.classList.add('hidden');
      this.raceBox.textContent = '';
      this.raceBox.append(
        h('b', null, rc.he),
        h('span', null, `מקום ${rc.place} מתוך ${rc.total}`),
        h('span', null, rc.laps > 1 ? `סיבוב ${rc.lap}/${rc.laps}` : `נקודה ${rc.checkpoint}/${rc.checkpoints}`),
        h('span', null, fmtTime(rc.time)),
      );
      if (rc.gateQuestion) { this.banner.textContent = rc.gateQuestion; this.banner.classList.remove('hidden'); } else this.banner.classList.add('hidden');
    } else {
      this.raceBox.classList.add('hidden');
      this.missionBox.classList.toggle('hidden', !this.mission);
      this.banner.classList.add('hidden');
    }
    if (this.mapProvider) {
      const c = this.map.getContext('2d');
      if (c) this.mapProvider.draw(c, this.map.width, this.map.height, s);
    }
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 2600): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), ms);
  }

  get state(): HudState | null { return this.last; }

  private send(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastSend < 33) return;
    this.lastSend = now;
    this.bus.emit('ui:input', { ...this.input });
  }

  /** Steering wheel: drag around its centre to turn it (up to 110 degrees each way); it springs back when released. */
  private buildWheel(): HTMLElement {
    const MAX = 110;
    const w = (this.wheelEl = h('div', 'wheel'));
    w.append(h('span', 'wheel-spoke s1'), h('span', 'wheel-spoke s2'), h('span', 'wheel-spoke s3'), h('span', 'wheel-hub'), h('span', 'wheel-mark'));
    let id = -1, prev = 0, raf = 0;
    const angleOf = (e: PointerEvent): number => { const r = w.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    const apply = (): void => {
      w.style.transform = `rotate(${this.wheelAngle}deg)`;
      const k = this.wheelAngle / MAX;
      this.input.steer = Math.sign(k) * Math.pow(Math.abs(k), 0.8);
      this.send(true);
    };
    const spring = (): void => {
      if (id >= 0) return;
      this.wheelAngle *= 0.72;
      if (Math.abs(this.wheelAngle) < 1) this.wheelAngle = 0;
      apply();
      if (this.wheelAngle !== 0) raf = requestAnimationFrame(spring);
    };
    w.addEventListener('pointerdown', (e) => { e.preventDefault(); cancelAnimationFrame(raf); id = e.pointerId; prev = angleOf(e); try { w.setPointerCapture(id); } catch { /* old browsers */ } });
    w.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const a = angleOf(e);
      let d = a - prev; prev = a;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      this.wheelAngle = Math.max(-MAX, Math.min(MAX, this.wheelAngle + d));
      apply();
    });
    const up = (e: PointerEvent): void => { if (e.pointerId !== id) return; id = -1; raf = requestAnimationFrame(spring); };
    w.addEventListener('pointerup', up);
    w.addEventListener('pointercancel', up);
    return w;
  }

  /** Power lever (like an airplane throttle): push up for forward power (it stays where you leave it), middle = N, bottom = R. */
  private buildLever(): HTMLElement {
    const box = (this.leverEl = h('div', 'gearbox'));
    const track = h('div', 'gear-track');
    this.leverKnob = h('div', 'gear-knob');
    track.append(h('span', 'gear-lab d', 'D'), h('span', 'gear-lab n', 'N'), h('span', 'gear-lab r', 'R'), this.leverKnob);
    box.appendChild(track);
    let id = -1;
    const read = (e: PointerEvent): number => { const r = track.getBoundingClientRect(); return Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2)); };
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { box.setPointerCapture(id); } catch { /* old browsers */ } this.setLever(read(e), false); });
    box.addEventListener('pointermove', (e) => { if (e.pointerId === id) this.setLever(read(e), false); });
    const up = (e: PointerEvent): void => { if (e.pointerId !== id) return; id = -1; this.setLever(this.lever, true); };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    this.setLever(0);
    return box;
  }

  /** v: -1 (R) .. 0 (N) .. 1 (full power). snap = settle into the nearest notch. */
  private setLever(v: number, snap = true): void {
    if (!this.leverKnob) return;
    if (snap) v = v < -0.4 ? -1 : v < 0.2 ? 0 : v > 0.88 ? 1 : v;
    this.lever = v;
    const gear = v < -0.4 ? 'r' : v < 0.2 ? 'n' : 'd';
    this.leverKnob.style.top = `${(1 - v) * 50}%`;
    this.leverEl.dataset['gear'] = gear;
    this.leverKnob.textContent = gear === 'd' ? `${Math.round(((v - 0.2) / 0.8) * 100)}%` : gear.toUpperCase();
    if (this.touchMode) {
      this.input.throttle = gear === 'd' ? Math.max(0.05, (v - 0.2) / 0.8) : 0;
      this.input.reverse = gear === 'r' ? 1 : 0;
    }
    this.send(true);
  }

  private holdBtn(cls: string, label: string, down: () => void, up: () => void): HTMLButtonElement {
    const b = h('button', cls, label, { type: 'button' });
    const press = (e: Event): void => { e.preventDefault(); down(); b.classList.add('down'); this.send(true); };
    const release = (e: Event): void => { e.preventDefault(); up(); b.classList.remove('down'); this.send(true); };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('pointerleave', release);
    return b;
  }
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
