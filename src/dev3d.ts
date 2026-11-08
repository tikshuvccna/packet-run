/** Dev harness for the drive engine without the game UI.
 * Query: seed, quality=low|medium|high, car, auto=1 (bot), race=<id|kind>, rivals=N, x, z, h, cleaned=1,2,.. */
import { Bus } from './core/bus';
import { createDrive } from './drive';
import type { CarId, DriveConfig, ItemId, QuizGate } from './drive/contract';
import { baseStats } from './drive/sim/cars';
import { buildCity } from './world3d/city';
import { drawMinimap } from './world3d/minimap';

const q = new URLSearchParams(location.search);
const seed = Number(q.get('seed') ?? 1);
const car = (q.get('car') ?? 'van') as CarId;
const quality = (q.get('quality') ?? 'medium') as DriveConfig['quality'];
const GATES: QuizGate[] = [
  { id: 'd1', q: 'כמה שכבות יש במודל OSI?', options: ['7', '4', '5'], correct: 0, lesson: 'lesson07' },
  { id: 'd2', q: 'איזו שכבה אחראית על ניתוב?', options: ['תעבורה', 'רשת', 'פיזית'], correct: 1, lesson: 'lesson07' },
  { id: 'd3', q: 'מה מוסיפה כל שכבה בכימוס?', options: ['כותרת', 'וירוס', 'סיסמה'], correct: 0, lesson: 'lesson08' },
  { id: 'd4', q: 'פרוטוקול הוא...', options: ['כבל', 'מסך', 'אוסף חוקים'], correct: 2, lesson: 'lesson06' },
];
const bus = new Bus();
const container = document.getElementById('game') as HTMLElement;
const drive = createDrive(container, bus);
const city = buildCity(seed);
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const ITEM_HE: Record<ItemId, string> = { oil: 'שמן', cones: 'חרוטים', glue: 'דבק', boostpad: 'רמפת נייטרוס', mine: 'בועה מגנטית', smoke: 'עשן' };
$('keys').innerHTML = 'חצים/WASD נהיגה · רווח נייטרוס<br>Shift בלם יד (דריפט) · F זריקה<br>C מבט אחורה · R חזרה לכביש<br>E כניסה למרוץ · T התחלה מחדש';

let toastT = 0;
bus.on('drive:toast', (t) => {
  const el = $('toast'); el.textContent = t.text; el.style.opacity = '1';
  el.style.color = t.kind === 'bad' ? '#ff9a8a' : t.kind === 'good' ? '#a6ffb0' : '#fff'; toastT = performance.now();
});
bus.on('drive:prompt', (p) => { const el = $('prompt'); el.style.display = p ? 'block' : 'none'; el.textContent = p?.text ?? ''; });
bus.on('drive:poi', (p) => { if (p.race) bus.emit('drive:start-race', p.race); else bus.emit('drive:toast', { text: `נכנסת: ${p.id}`, kind: 'info' }); });
bus.on('drive:race-end', (r) => {
  const medal = r.medal === 'gold' ? 'זהב' : r.medal === 'silver' ? 'כסף' : r.medal === 'bronze' ? 'ארד' : 'בלי מדליה';
  bus.emit('drive:toast', { text: `סיום! מקום ${r.place}/${r.total} · ${medal}`, kind: 'good' });
  console.log('race-end', JSON.stringify(r));
});
bus.on('drive:hud', (h) => {
  $('speed').innerHTML = `${h.speedKmh} <small>km/h</small>`;
  ($('nitro').firstChild as HTMLElement).style.width = `${(h.nitro / h.nitroCap) * 100}%`;
  $('drift').textContent = h.driftTier ? ['', 'טורבו ●', 'טורבו ●●', 'טורבו ●●●'][h.driftTier] ?? '' : h.combo > 1 ? `קומבו x${h.combo}` : '';
  $('drift').style.color = h.driftTier === 3 ? '#ff7fff' : h.driftTier === 2 ? '#ffb15a' : '#8fd8ff';
  $('items').textContent = h.items.length ? h.items.map((i) => ITEM_HE[i]).join(' · ') + ' (F)' : 'אין פריט';
  const r = h.race;
  $('race').style.display = r ? 'block' : 'none';
  if (r) $('race').textContent = r.countdown ? `${r.he} · ${r.countdown}` : `${r.he} · מקום ${r.place}/${r.total} · הקפה ${r.lap}/${r.laps} · ${r.time.toFixed(1)}${h.wrongWay ? ' · כיוון הפוך!' : ''}`;
  $('q').style.display = r?.gateQuestion ? 'block' : 'none';
  if (r?.gateQuestion) $('q').textContent = r.gateQuestion;
  const s = drive.sim;
  const mini = $('mini') as HTMLCanvasElement;
  drawMinimap(mini.getContext('2d') as CanvasRenderingContext2D, city, {
    x: h.x, z: h.z, heading: h.heading, span: 700, racePath: s?.race?.def.path ?? null,
    rivals: s?.drivers.filter((d) => d.kind === 'rival').map((d) => ({ x: d.car.x, z: d.car.z })),
  });
  $('dbg').textContent = `fps ${drive.fps().toFixed(0)} · ${h.x.toFixed(0)},${h.z.toFixed(0)} · cars ${s?.drivers.length ?? 0} · chunks pending ${drive.scene?.cityMesh.pending ?? 0}`;
  if (performance.now() - toastT > 1400) $('toast').style.opacity = '0';
});

let spawn: { x: number; z: number; heading: number } | null = null;
if (q.get('x')) { const r = city.nearestRoad(Number(q.get('x')), Number(q.get('z')), Number(q.get('h') ?? 0)); spawn = { x: r.x, z: r.z, heading: r.heading }; }
if (q.get('ramp')) { const rp = city.ramps[Number(q.get('ramp'))]; if (rp) spawn = { x: rp.x - Math.sin(rp.h) * 90, z: rp.z + Math.cos(rp.h) * 90, heading: rp.h }; }
bus.emit('drive:start', {
  seed, quality, playerName: 'dev', spawn, gates: GATES,
  cleaned: (q.get('cleaned') ?? '1,2,3,4,5,6,7').split(',').filter(Boolean).map(Number), unlocked: [1, 2, 3, 4, 5, 6, 7],
  look: { car, paint: q.get('paint') ?? '#f2b134', vinyl: (q.get('vinyl') as never) ?? 'stripes', vinylColor: '#ffffff', wheels: car === 'jeep' ? 'offroad' : 'std', rim: '#d8dde3', spoiler: q.get('spoiler') === '1' },
  stats: baseStats(car),
});
const raceQ = q.get('race');
if (raceQ) {
  const def = city.races.find((r) => r.id === raceQ) ?? city.races.find((r) => r.kind === raceQ) ?? city.races.find((r) => r.rivals > 0);
  if (def) bus.emit('drive:start-race', q.get('rivals') ? { ...def, rivals: Number(q.get('rivals')) } : def);
}
if (q.get('auto') === '1') drive.setAuto(true);

let frames = 0, t0 = performance.now();
const tick = (): void => { frames++; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
(window as unknown as { __dev: unknown }).__dev = {
  drive, bus, city,
  ready: () => !!drive.sim,
  resetFps: () => { frames = 0; t0 = performance.now(); },
  fps: () => frames / ((performance.now() - t0) / 1000),
  give: (k: ItemId) => drive.sim?.givePlayerItem(k),
};
