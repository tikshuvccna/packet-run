/**
 * Drive engine entry: createDrive(container, bus). Listens to drive:start / quit / teleport / start-race / set-look,
 * ui:pause, ui:input (touch), ui:clock; reads keyboard and gamepads; runs the fixed-step sim and the Three scene;
 * emits drive:hud (10 Hz), drive:prompt, drive:toast, drive:poi, drive:race-end, drive:pickup, drive:gate,
 * drive:position (1 Hz), drive:ready, audio:engine (30 Hz) and audio:sfx.
 */
import type { Bus } from '../core/bus';
import { buildCity, type City } from '../world3d/city';
import { Scene3D, QUALITY } from '../world3d/scene';
import type { DriveConfig, DriveInput, HudState, Poi, RaceDef } from './contract';
import { NO_INPUT } from './contract';
import { DriveSim, DT } from './sim/world';

export interface DriveHandle {
  readonly sim: DriveSim | null;
  readonly scene: Scene3D | null;
  readonly city: City | null;
  /** frames per second (smoothed) */
  fps(): number;
  restartRace(): void;
  setCameraMode(m: 'chase' | 'garage'): void;
  /** bot driver for the dev harness: drives the race line (or just cruises) */
  setAuto(on: boolean): void;
  dispose(): void;
}

const KEYS = new Set<string>();
/** keys pressed since the last frame (a tap shorter than a frame still counts) */
const TAPPED = new Set<string>();

export function createDrive(container: HTMLElement, bus: Bus): DriveHandle {
  let sim: DriveSim | null = null;
  let scene: Scene3D | null = null;
  let city: City | null = null;
  let cfg: DriveConfig | null = null;
  let paused = false;
  let raf = 0;
  let acc = 0;
  let last = 0;
  let fpsS = 60;
  let touch: DriveInput = { ...NO_INPUT };
  let touchT = -1;
  let hudT = 0, audioT = 0, posT = 0;
  let nearPoi: Poi | null = null;
  let prevAction = false, prevRestart = false;
  let lastRace: RaceDef | null = null;
  let raceEndT = -1;
  let auto = false;
  let prevSkid = 0;
  let speedLines: HTMLDivElement | null = null;
  const offs: (() => void)[] = [];

  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.type === 'keydown') { KEYS.add(e.code); TAPPED.add(e.code); } else KEYS.delete(e.code);
    if (sim && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onBlur = (): void => KEYS.clear();
  window.addEventListener('blur', onBlur);
  const onResize = (): void => scene?.resize();
  window.addEventListener('resize', onResize);

  function readInput(): DriveInput {
    const k = (c: string): boolean => KEYS.has(c) || TAPPED.has(c);
    const inp: DriveInput = {
      p: 0,
      throttle: k('ArrowUp') || k('KeyW') ? 1 : 0,
      brake: k('ArrowDown') || k('KeyS') ? 1 : 0,
      steer: (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0),
      nitro: k('Space'), handbrake: k('ShiftLeft') || k('ShiftRight'),
      useItem: k('KeyF'), look: k('KeyC'), reset: k('KeyR'), action: k('KeyE') || k('Enter'), restart: k('KeyT'),
    };
    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) inp.steer = Math.max(-1, Math.min(1, ax));
      const b = (i: number): number => gp.buttons[i]?.value ?? 0;
      inp.throttle = Math.max(inp.throttle, b(7), b(0));
      inp.brake = Math.max(inp.brake, b(6));
      inp.nitro = inp.nitro || b(1) > 0.5 || b(5) > 0.5;
      inp.handbrake = inp.handbrake || b(2) > 0.5 || b(4) > 0.5;
      inp.useItem = inp.useItem || b(3) > 0.5;
      inp.reset = inp.reset || b(8) > 0.5;
      inp.action = inp.action || b(9) > 0.5;
      break;
    }
    // touch (ui:input) wins while fresh
    if (touchT >= 0 && performance.now() - touchT < 400) {
      inp.throttle = Math.max(inp.throttle, touch.throttle);
      inp.brake = Math.max(inp.brake, touch.brake);
      if (Math.abs(touch.steer) > Math.abs(inp.steer)) inp.steer = touch.steer;
      inp.nitro ||= touch.nitro; inp.handbrake ||= touch.handbrake; inp.useItem ||= touch.useItem;
      inp.look ||= touch.look; inp.reset ||= touch.reset; inp.action ||= !!touch.action; inp.restart ||= !!touch.restart;
    }
    if (auto && sim) return botInput(sim);
    return inp;
  }

  function start(c: DriveConfig): void {
    stop();
    cfg = c;
    city = buildCity(c.seed);
    scene = new Scene3D(container, city, c);
    scene.setCleaned(c.cleaned);
    const spawn = c.spawn ?? city.spawn;
    sim = new DriveSim(city, { seed: c.seed, look: c.look, stats: c.stats, spawn, gates: c.gates, traffic: QUALITY[c.quality].traffic, collected: c.collected });
    // prebuild the chunks around the start so the first frame is not empty
    for (let i = 0; i < 12 && scene.cityMesh.pending + 1 > 0; i++) scene.cityMesh.update(spawn.x, spawn.z, QUALITY[c.quality].draw, 3);
    scene.chase.snap(sim.player);
    speedLines = document.createElement('div');
    speedLines.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s;background:repeating-conic-gradient(from 0deg at 50% 50%, #fff0 0deg 5deg, #ffffff38 5deg 5.6deg);-webkit-mask:radial-gradient(circle at 50% 50%, transparent 38%, #000 75%);mask:radial-gradient(circle at 50% 50%, transparent 38%, #000 75%)';
    container.appendChild(speedLines);
    last = performance.now();
    raf = requestAnimationFrame(frame);
    bus.emit('drive:ready', undefined);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
    scene?.dispose();
    speedLines?.remove();
    speedLines = null;
    scene = null; sim = null;
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const s = sim, sc = scene;
    if (!s || !sc) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    fpsS += (1 / Math.max(dt, 1e-3) - fpsS) * 0.05;
    const inp = readInput();
    TAPPED.clear();
    if (!paused) {
      // POI entry (rising edge)
      if (inp.action && !prevAction && nearPoi && !s.race) bus.emit('drive:poi', { id: nearPoi.id, kind: nearPoi.kind, lesson: nearPoi.lesson, race: nearPoi.race });
      if (inp.restart && !prevRestart && lastRace) startRace(lastRace);
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 30) { s.step(inp); acc -= DT; steps++; }
      if (steps === 30) acc = 0;
      drainEvents(s, sc);
      // after the finish: orbit for a moment, then back to free roam
      if (raceEndT >= 0 && now - raceEndT > 4500) { s.endRace(); raceEndT = -1; }
    }
    prevAction = !!inp.action; prevRestart = !!inp.restart;
    sc.render(s, paused ? 0 : dt, inp.look);
    if (speedLines) speedLines.style.opacity = s.player.boosting ? '1' : s.player.speed > 38 ? '0.35' : '0';
    // POI proximity
    const p = s.player;
    let np: Poi | null = null;
    if (!s.race && city) for (const poi of city.pois) if (Math.hypot(poi.x - p.x, poi.z - p.z) < poi.radius) { np = poi; break; }
    if (np !== nearPoi) {
      nearPoi = np;
      bus.emit('drive:prompt', np ? { text: `E / Enter: ${np.label}`, id: np.id } : null);
    }
    hudT += dt; audioT += dt; posT += dt;
    if (hudT >= 0.1) { hudT = 0; bus.emit('drive:hud', s.hud(nearPoi ? { id: nearPoi.id, label: nearPoi.label, kind: nearPoi.kind } : null)); }
    if (audioT >= 1 / 30) {
      audioT = 0;
      bus.emit('audio:engine', { rpm: p.rpm, speed: p.speed, boost: p.boosting, skid: p.skid });
      if (p.skid > 0.5 && prevSkid <= 0.5) bus.emit('audio:sfx', { name: 'skid', vol: p.skid });
      prevSkid = p.skid;
    }
    if (posT >= 1) { posT = 0; bus.emit('drive:position', { x: p.x, z: p.z, heading: p.h }); }
  }

  function drainEvents(s: DriveSim, sc: Scene3D): void {
    sc.handleEvents(s.events, s);
    for (const e of s.events) {
      switch (e.t) {
        case 'sfx': bus.emit('audio:sfx', { name: e.name, vol: e.vol }); break;
        case 'toast': bus.emit('drive:toast', { text: e.text, kind: e.kind }); break;
        case 'pickup': bus.emit('drive:pickup', { kind: e.kind, amount: e.amount, item: e.item, id: e.id }); break;
        case 'gate': bus.emit('drive:gate', { id: e.id, right: e.right }); break;
        case 'crash': if (e.driver === 0) bus.emit('audio:sfx', { name: 'crash', vol: Math.min(1, e.v / 20) }); break;
        case 'land': bus.emit('audio:sfx', { name: 'jump_land', vol: Math.min(1, e.v / 10) }); break;
        case 'turbo': if (e.driver === 0) { bus.emit('audio:sfx', { name: 'boost', vol: 0.4 + e.tier * 0.2 }); bus.emit('drive:toast', { text: ['', 'טורבו!', 'סופר טורבו!', 'אולטרה טורבו!'][e.tier] ?? 'טורבו!', kind: 'good' }); } break;
        case 'countdown': bus.emit('drive:toast', { text: e.n > 0 ? String(e.n) : 'סעו!', kind: 'info' }); break;
        case 'raceEnd': {
          bus.emit('drive:race-end', e.result);
          raceEndT = performance.now();
          // time trial ghost: keep the best run
          const race = s.race;
          if (race && race.def.kind === 'timetrial' && e.result.medal !== 'none') {
            try {
              const key = `pr.ghost.${race.def.id}`;
              const old = JSON.parse(localStorage.getItem(key) ?? 'null') as { time: number } | null;
              if (!old || e.result.time < old.time) localStorage.setItem(key, JSON.stringify({ time: e.result.time, data: s.ghostRec }));
            } catch { /* storage may be blocked */ }
          }
          break;
        }
        default: break;
      }
    }
    s.events.length = 0;
  }

  function startRace(def: RaceDef): void {
    if (!sim) return;
    lastRace = def;
    raceEndT = -1;
    let ghost: number[] | null = null;
    try { ghost = (JSON.parse(localStorage.getItem(`pr.ghost.${def.id}`) ?? 'null') as { data: number[] } | null)?.data ?? null; } catch { ghost = null; }
    sim.startRace(def, ghost);
    scene?.chase.snap(sim.player);
  }

  offs.push(
    bus.on('drive:start', (c) => start(c)),
    bus.on('drive:quit', () => stop()),
    bus.on('drive:teleport', (t) => { sim?.endRace(); sim?.teleport(t.x, t.z, t.heading); if (sim) scene?.chase.snap(sim.player); }),
    bus.on('drive:start-race', (def) => startRace(def)),
    bus.on('drive:set-look', (look) => { if (!sim || !scene) return; sim.setLook(look); scene.setPlayerLook(sim); }),
    bus.on('ui:pause', (p) => { paused = p.paused; KEYS.clear(); }),
    bus.on('ui:input', (i) => { touch = i; touchT = performance.now(); }),
    bus.on('ui:clock', () => { /* fuel is shown by the UI; the engine does not need it yet */ }),
  );

  return {
    get sim() { return sim; },
    get scene() { return scene; },
    get city() { return city; },
    fps: () => fpsS,
    restartRace: () => { if (lastRace) startRace(lastRace); },
    setCameraMode: (m) => { if (scene) scene.chase.mode = m; },
    setAuto: (on) => { auto = on; },
    dispose: () => { stop(); offs.forEach((f) => f()); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onResize); void cfg; },
  };
}

/** Simple bot for the harness: follows the race line, or cruises the nearest road. */
function botInput(s: DriveSim): DriveInput {
  const p = s.player;
  const race = s.race;
  if (race && race.state !== 'done') {
    const pr = race.line.project(p.x, p.z, (s as unknown as { _botS?: number })._botS);
    (s as unknown as { _botS?: number })._botS = pr.s;
    const tp = race.line.sample(pr.s + 8 + p.speed * 0.42);
    let err = Math.atan2(tp.x - p.x, -(tp.z - p.z)) - p.h;
    while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    const vt = race.line.pt(race.line.sample(pr.s + 4 + p.speed * 0.3).i).v;
    return { ...NO_INPUT, throttle: p.speed < vt ? 1 : 0.2, brake: p.speed > vt + 2 ? 0.7 : 0, steer: Math.max(-1, Math.min(1, err * 2.4)), nitro: p.speed < vt - 8 && p.speed > 15, useItem: Math.random() < 0.01 };
  }
  const r = s.city.nearestRoad(p.x + Math.sin(p.h) * 25, p.z - Math.cos(p.h) * 25, p.h);
  const tx = r.x + Math.sin(r.heading) * 10, tz = r.z - Math.cos(r.heading) * 10;
  let err = Math.atan2(tx - p.x, -(tz - p.z)) - p.h;
  while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
  return { ...NO_INPUT, throttle: p.speed < 22 ? 1 : 0, brake: Math.abs(err) > 0.8 && p.speed > 10 ? 1 : 0, steer: Math.max(-1, Math.min(1, err * 2)) };
}

export type { HudState };
