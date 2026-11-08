import { GAMES } from '../content';
import { towerItems } from '../learn/rounds';
import { runBelt, runCrane } from './arcade';
import type { GameData, Level } from '../learn/types';
import { grantPrize, PRIZES, type Prize } from '../game/progress';
import { btn, clear, flash, h, overlay, wait } from './dom';
import type { Ctx } from './ctx';

export interface GameResult { passed: boolean; points: number; max: number; prize: Prize | null }

const LEVEL_HE: Record<Level, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };
export { LEVEL_HE };

export interface Shell {
  root: HTMLElement; stage: HTMLElement; close: () => void;
  setHearts: (n: number) => void; setProgress: (done: number, total: number, points: number) => void;
}

export function shell(title: string, level: Level, lives: number, ctx: Ctx, onQuit: () => void): Shell {
  const { root, close } = overlay('game-screen');
  ctx.audio.mood('game');
  const head = h('div', 'ghead');
  head.appendChild(h('div', 'ltitle', `${title} (${LEVEL_HE[level]})`));
  const hearts = h('div', 'hearts');
  const prog = h('div', 'gprog');
  head.append(prog, hearts, btn('יציאה', onQuit, 'btn small ghost'));
  const stage = h('div', 'gstage');
  root.append(head, stage);
  return {
    root, stage, close,
    setHearts: (n) => { hearts.textContent = ''; for (let i = 0; i < lives; i++) hearts.appendChild(h('span', i < n ? 'heart' : 'heart lost')); },
    setProgress: (d, t, p) => { prog.textContent = `${d}/${t}  נקודות ${p}`; },
  };
}

export async function finish(ctx: Ctx, sh: Shell, lessonId: string, data: GameData, level: Level, points: number, max: number): Promise<GameResult> {
  const cfg = data.levels[level];
  const passed = points >= cfg.pass;
  const lp = ctx.save.lesson(lessonId);
  const prev = lp.games[level];
  if (!prev || points > prev.points) lp.games[level] = { points, passed: passed || !!prev?.passed };
  else if (passed && !prev.passed) lp.games[level] = { points: prev.points, passed: true };
  let prize: Prize | null = null;
  if (passed) prize = grantPrize(ctx.save.data, lessonId, level);
  ctx.save.save();
  ctx.audio.sfx(passed ? 'win' : 'bad');
  clear(sh.stage);
  const card = h('div', 'lcard result');
  card.appendChild(h('h2', null, passed ? 'הצלחתם!' : 'כמעט'));
  card.appendChild(h('div', 'bignum', `${points} / ${max}`));
  const info = PRIZES[lessonId]?.[level];
  if (passed && prize) card.appendChild(h('div', 'prizebox', `פרס: ${prize.he}. ${prize.desc}`));
  else if (passed) card.appendChild(h('div', 'panel', 'כבר קיבלתם את הפרס של הרמה הזאת.'));
  else card.appendChild(h('div', 'panel', `צריך ${cfg.pass} כדי לעבור. אפשר לנסות שוב בלי עונש.`));
  if (!passed && info) card.appendChild(h('div', 'panel dim', `הפרס בהמתנה: ${info.he}`));
  const row = h('div', 'lfoot');
  const done = new Promise<GameResult>((resolve) => {
    row.appendChild(btn('להמשך', () => { sh.close(); resolve({ passed, points, max, prize }); }, 'btn primary'));
    if (!passed) row.appendChild(btn('שוב', () => { sh.close(); void runGame(ctx, lessonId, data.id, level).then(resolve); }, 'btn'));
  });
  card.appendChild(row);
  sh.stage.appendChild(card);
  return done;
}

export function runGame(ctx: Ctx, lessonId: string, gameId: string, level: Level): Promise<GameResult> {
  const data = GAMES[gameId];
  if (!data) return Promise.resolve({ passed: false, points: 0, max: 0, prize: null });
  if (data.kind === 'tower') return runTower(ctx, lessonId, data, level);
  if (data.kind === 'beam') return runBelt(ctx, lessonId, data, level);
  return runCrane(ctx, lessonId, data, level);
}

/* ------------------------------------------------------------------ tower (falling items) */

function runTower(ctx: Ctx, lessonId: string, data: GameData, level: Level): Promise<GameResult> {
  const cfg = data.levels[level];
  const items = towerItems(data, level, Math.floor(Math.random() * 1e6));
  const names = data['layerNames'] as Record<string, string>;
  const layers = cfg.layers as string[];
  const fall = (cfg.fallSec ?? 8) * 1000;
  return new Promise((resolve) => {
    let lives = cfg.lives;
    let points = 0;
    let handled = 0;
    let stopped = false;
    const sh = shell(data.title, level, cfg.lives, ctx, () => { stopped = true; sh.close(); resolve({ passed: false, points, max: items.length, prize: null }); });
    sh.setHearts(lives);
    sh.setProgress(0, items.length, 0);
    const field = h('div', 'tower');
    const sky = h('div', 'tsky');
    const tower = h('div', 'ttower');
    const floors = new Map<string, HTMLElement>();
    for (const l of [...layers].reverse()) {
      const f = btn('', () => answer(l), 'btn floor');
      f.appendChild(h('span', 'fnum', l));
      f.appendChild(h('span', 'fname', names[l] ?? ''));
      tower.appendChild(f);
      floors.set(l, f);
    }
    field.append(sky, tower);
    sh.stage.append(h('div', 'panel dim', data.story), field);

    interface Live { it: (typeof items)[number]; el: HTMLElement; born: number; done: boolean }
    const live: Live[] = [];
    let spawned = 0;
    const t0 = performance.now();

    const lose = (): void => { lives--; sh.setHearts(lives); ctx.audio.sfx('bad'); };
    const resolveItem = (l: Live, ok: boolean, layer?: string): void => {
      l.done = true;
      handled++;
      if (ok) { points++; ctx.audio.sfx('good'); l.el.classList.add('caught'); if (layer) flash(floors.get(layer) as HTMLElement, 'glow', 500); }
      else { lose(); l.el.classList.add('missed'); flash(floors.get(l.it.layer) as HTMLElement, 'hint', 900); }
      setTimeout(() => l.el.remove(), 600);
      sh.setProgress(handled, items.length, points);
    };
    function answer(layer: string): void {
      const l = live.find((x) => !x.done);
      if (!l || stopped) return;
      resolveItem(l, l.it.layer === layer, layer);
    }
    const onKey = (e: KeyboardEvent): void => { if (layers.includes(e.key)) answer(e.key); };
    window.addEventListener('keydown', onKey);

    let raf = 0;
    const tick = async (): Promise<void> => {
      if (stopped) return;
      const now = performance.now() - t0;
      while (spawned < items.length && (items[spawned] as (typeof items)[number]).at * 1000 <= now) {
        const it = items[spawned] as (typeof items)[number];
        const el = h('div', 'fall', it.label);
        el.style.left = `${12 + Math.random() * 56}%`;
        sky.appendChild(el);
        live.push({ it, el, born: now, done: false });
        spawned++;
      }
      for (const l of live) {
        if (l.done) continue;
        const p = (now - l.born) / fall;
        l.el.style.top = `${Math.min(p, 1) * 82}%`;
        l.el.classList.toggle('active', l === live.find((x) => !x.done));
        if (p >= 1) resolveItem(l, false);
      }
      if (lives <= 0 || handled >= items.length) {
        stopped = true;
        window.removeEventListener('keydown', onKey);
        await wait(500);
        resolve(await finish(ctx, sh, lessonId, data, level, points, items.length));
        return;
      }
      raf = requestAnimationFrame(() => { void tick(); });
    };
    raf = requestAnimationFrame(() => { void tick(); });
    void raf;
  });
}
