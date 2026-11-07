import '../hud.css';
import type { Bus } from '../core/bus';
import type { DriveInput, HudState, ItemId } from '../drive/contract';
import { NO_INPUT } from '../drive/contract';
import { btn, h } from './dom';

const ITEM_HE: Record<ItemId, string> = { oil: 'שמן', cones: 'חרוטים', glue: 'דבק', boostpad: 'רמפת טורבו', mine: 'בועה מגנטית', smoke: 'עשן' };
const ITEM_COLOR: Record<ItemId, string> = { oil: '#2b2f3a', cones: '#ff9a3c', glue: '#7fd957', boostpad: '#35d3b0', mine: '#9b59d0', smoke: '#c0c8d0' };

export interface MiniMapProvider { draw(ctx2d: CanvasRenderingContext2D, w: number, h: number, s: HudState): void }

/** Driving overlay: speed, nitro, items, race info, quiz-box banner, fuel (the 10 minute clock), touch controls (physical left/right: RTL must never swap them). */
export class Hud {
  readonly root: HTMLElement;
  private speedEl: HTMLElement;
  private nitroFill: HTMLElement;
  private itemsEl: HTMLElement;
  private coinText: HTMLElement;
  private raceBox: HTMLElement;
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
  private autoGas = true;
  private last: HudState | null = null;

  constructor(private bus: Bus, onPause: () => void, opts: { autoGas?: boolean } = {}) {
    this.autoGas = opts.autoGas ?? true;
    const r = (this.root = h('div', 'hud'));
    const top = h('div', 'hud-top');
    const left = h('div', 'hud-left');
    this.raceBox = h('div', 'racebox hidden');
    left.appendChild(this.raceBox);
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
    const rcol = h('div', 'hud-rcol'); rcol.append(right, this.map, fuel);
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

    // touch controls: steering pad bottom-left, pedals bottom-right
    const steer = h('div', 'steerpad');
    const sl = this.holdBtn('abtn arrow left', '', () => { this.input.steer = -1; }, () => { if (this.input.steer < 0) this.input.steer = 0; });
    const sr = this.holdBtn('abtn arrow right', '', () => { this.input.steer = 1; }, () => { if (this.input.steer > 0) this.input.steer = 0; });
    steer.append(sl, sr);
    const pedals = h('div', 'pedals');
    const gas = this.holdBtn('abtn gas', 'גז', () => { this.input.throttle = 1; }, () => { this.input.throttle = this.autoGas ? 1 : 0; });
    const brake = this.holdBtn('abtn brake', 'בלם', () => { this.input.brake = 1; this.input.throttle = 0; }, () => { this.input.brake = 0; this.input.throttle = this.autoGas ? 1 : 0; });
    const nit = this.holdBtn('abtn nitro', 'נייטרוס', () => { this.input.nitro = true; }, () => { this.input.nitro = false; });
    const item = this.holdBtn('abtn throwit', 'זריקה', () => { this.input.useItem = true; }, () => { this.input.useItem = false; });
    const drift = this.holdBtn('abtn drift', 'דריפט', () => { this.input.handbrake = true; }, () => { this.input.handbrake = false; });
    pedals.append(nit, item, drift, brake, gas);
    if (this.autoGas) this.input.throttle = 1;

    r.append(top, this.banner, this.wrongWay, this.comboEl, this.promptEl, this.toasts, dash, steer, pedals);

    this.offs.push(
      bus.on('drive:hud', (s) => this.update(s)),
      bus.on('drive:prompt', (p) => { this.promptEl.textContent = p?.text ?? ''; this.promptEl.classList.toggle('hidden', !p); }),
      bus.on('drive:toast', (t) => this.toast(t.text, t.kind)),
      bus.on('ui:clock', (c) => { this.fuelFill.style.width = `${Math.max(0, Math.min(1, c.fuel)) * 100}%`; this.fuelFill.classList.toggle('low', c.fuel < 0.25); }),
    );
    this.send(true);
  }

  mount(parent: HTMLElement): void { parent.appendChild(this.root); }
  destroy(): void { this.offs.forEach((o) => o()); this.root.remove(); this.bus.emit('ui:input', { ...NO_INPUT }); }
  setMiniMap(p: MiniMapProvider | null): void { this.mapProvider = p; this.map.classList.toggle('hidden', !p); }
  setCoins(n: number): void { this.coinText.textContent = String(Math.round(n)); }
  setAutoGas(on: boolean): void { this.autoGas = on; this.input.throttle = on ? 1 : 0; this.send(true); }

  update(s: HudState): void {
    this.last = s;
    this.speedEl.textContent = String(Math.round(s.speedKmh));
    this.nitroFill.style.width = `${Math.max(0, Math.min(1, s.nitro / Math.max(0.01, s.nitroCap))) * 100}%`;
    this.itemsEl.textContent = '';
    for (const it of s.items) {
      const i = h('span', 'itemchip', ITEM_HE[it]);
      i.style.borderColor = ITEM_COLOR[it];
      this.itemsEl.appendChild(i);
    }
    this.wrongWay.classList.toggle('hidden', !s.wrongWay);
    this.comboEl.textContent = s.combo > 1 ? `קומבו ${s.combo}` : '';
    this.comboEl.classList.toggle('hidden', s.combo <= 1);
    if (s.race) {
      const rc = s.race;
      this.raceBox.classList.remove('hidden');
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
