import { GAMES } from '../content';
import { beamRounds, craneTasks, towerItems, type CraneTask } from '../learn/rounds';
import { rng, shuffle } from '../learn/rng';
import type { GameData, Level } from '../learn/types';
import { grantPrize, PRIZES, type Prize } from '../game/progress';
import { btn, clear, flash, h, overlay, wait } from './dom';
import type { Ctx } from './ctx';

export interface GameResult { passed: boolean; points: number; max: number; prize: Prize | null }

const LEVEL_HE: Record<Level, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };
export { LEVEL_HE };

interface Shell {
  root: HTMLElement; stage: HTMLElement; close: () => void;
  setHearts: (n: number) => void; setProgress: (done: number, total: number, points: number) => void;
}

function shell(title: string, level: Level, lives: number, ctx: Ctx, onQuit: () => void): Shell {
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

async function finish(ctx: Ctx, sh: Shell, lessonId: string, data: GameData, level: Level, points: number, max: number): Promise<GameResult> {
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
  return runRounds(ctx, lessonId, data, level);
}

/* ------------------------------------------------------------------ choice / sequence rounds (beam, crane) */

interface RoundChoice { type: 'choice'; title: string; text: string; options: { id: string; label: string }[]; answer: string; decorate?: (stage: HTMLElement, chosen: string) => void }
interface RoundSeq { type: 'seq'; title: string; items: string[]; order: string[]; hint: string }
type Round = RoundChoice | RoundSeq;

function buildRounds(data: GameData, level: Level, seed: number): Round[] {
  if (data.kind === 'beam') {
    const castOpts = data['castOptions'] as { id: string; label: string }[];
    const ruleOpts = data['ruleOptions'] as { id: string; label: string }[];
    return beamRounds(data, level, seed).map((r): Round => r.kind === 'cast'
      ? { type: 'choice', title: 'באיזה רוחב קרן שולחים?', text: r.text, options: castOpts, answer: r.answer }
      : { type: 'choice', title: 'איזה חוק נשבר?', text: r.text, options: ruleOpts, answer: r.answer });
  }
  const layerOpts = data['layerOptions'] as { id: string; label: string }[];
  const portOpts = (data['portOptions'] as string[]).map((p) => ({ id: p, label: p }));
  const pduOpts = (data['pdus'] as string[]).map((p) => ({ id: p, label: p }));
  return craneTasks(data, level, seed).map((t: CraneTask): Round => {
    switch (t.kind) {
      case 'wrap': return { type: 'seq', title: 'מעמיסים: מהפנימית אל החיצונית', items: t.pdus, order: t.pdus, hint: 'קודם המידע, כל עטיפה נוספת מבחוץ' };
      case 'peel': return { type: 'seq', title: 'מפרקים ביעד: מהחיצונית אל הפנימית', items: t.pdus, order: [...t.pdus].reverse(), hint: 'מקלפים קודם את החיצונית' };
      case 'layer': return { type: 'choice', title: 'לאיזו שכבה ב-TCP/IP שייך?', text: t.text, options: layerOpts, answer: t.answer };
      case 'port': return { type: 'choice', title: 'איזה שירות משתמש בפורט?', text: t.text, options: portOpts, answer: t.answer };
      case 'has': return { type: 'choice', title: 'איזו יחידה?', text: t.text, options: pduOpts, answer: t.answer };
    }
  });
}

function runRounds(ctx: Ctx, lessonId: string, data: GameData, level: Level): Promise<GameResult> {
  const cfg = data.levels[level];
  const seed = Math.floor(Math.random() * 1e6);
  const rounds = buildRounds(data, level, seed);
  let lives = cfg.lives;
  let points = 0;
  let idx = 0;
  let quit = false;
  return new Promise((resolve) => {
    const sh = shell(data.title, level, cfg.lives, ctx, () => { quit = true; sh.close(); resolve({ passed: false, points, max: rounds.length, prize: null }); });
    sh.setHearts(lives);
    const story = h('div', 'panel dim', data.story);

    const next = async (): Promise<void> => {
      if (quit) return;
      if (idx >= rounds.length || lives <= 0) { resolve(await finish(ctx, sh, lessonId, data, level, points, rounds.length)); return; }
      sh.setProgress(idx, rounds.length, points);
      const r = rounds[idx] as Round;
      clear(sh.stage);
      const card = h('div', 'lcard game');
      card.appendChild(h('div', 'qlabel', r.title));
      let timerFill: HTMLElement | null = null;
      let timeLeft = cfg.timer ?? 0;
      let timerId = 0;
      let settled = false;
      const settle = async (ok: boolean, shown: string): Promise<void> => {
        if (settled) return;
        settled = true;
        clearInterval(timerId);
        if (ok) { points++; ctx.audio.sfx('good'); } else { lives--; ctx.audio.sfx('bad'); sh.setHearts(lives); }
        sh.setProgress(idx + 1, rounds.length, points);
        const fb = h('div', ok ? 'feedback good' : 'feedback bad', ok ? 'נכון!' : `התשובה: ${shown}`);
        card.appendChild(fb);
        await wait(ok ? 650 : 1500);
        idx++;
        void next();
      };
      if ((cfg.timer ?? 0) > 0) {
        const tb = h('div', 'timerbar');
        timerFill = h('div', 'timerfill');
        tb.appendChild(timerFill);
        card.appendChild(tb);
        const t0 = performance.now();
        timerId = window.setInterval(() => {
          const left = (cfg.timer as number) - (performance.now() - t0) / 1000;
          timeLeft = left;
          (timerFill as HTMLElement).style.width = `${Math.max(0, (left / (cfg.timer as number)) * 100)}%`;
          if (left <= 0) {
            const shown = r.type === 'choice' ? (r.options.find((o) => o.id === r.answer)?.label ?? '') : r.order.join(' ← ');
            void settle(false, shown);
          }
        }, 80);
      }
      void timeLeft;
      if (r.type === 'choice') {
        const scene = h('div', 'gscene');
        scene.appendChild(h('div', 'gtext', r.text));
        card.appendChild(scene);
        const opts = h('div', 'options row');
        for (const o of r.options) {
          const b = btn(o.label, () => {
            if (settled) return;
            const ok = o.id === r.answer;
            b.classList.add(ok ? 'ok' : 'bad');
            opts.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true));
            if (data.kind === 'beam') showBeam(scene, r.answer === o.id ? r.answer : r.answer, ok);
            void settle(ok, r.options.find((x) => x.id === r.answer)?.label ?? '');
          }, 'btn option');
          opts.appendChild(b);
        }
        card.appendChild(opts);
      } else {
        const slots = h('div', 'slots');
        const pool = h('div', 'pool');
        r.order.forEach((_, k) => slots.appendChild(h('div', 'slot', String(k + 1))));
        let n = 0;
        let bad = false;
        const mixed = shuffle(r.items, rng(seed + idx * 13));
        if (mixed.every((v, k) => v === r.items[k]) && mixed.length > 1) mixed.reverse();
        for (const it of mixed) {
          const b = btn(it, () => {
            if (b.disabled || settled) return;
            const want = r.order[n];
            const slot = slots.children[n] as HTMLElement;
            slot.textContent = it;
            slot.classList.add('filled');
            b.disabled = true;
            if (it !== want) { bad = true; slot.classList.add('bad'); }
            n++;
            ctx.audio.sfx('click');
            if (n === r.order.length) void settle(!bad, r.order.join(' ← '));
          }, 'btn item crate');
          pool.appendChild(b);
        }
        card.append(slots, pool, h('div', 'panel dim', r.hint));
      }
      sh.stage.appendChild(card);
      sh.stage.appendChild(story);
    };
    void next();
  });
}

function showBeam(scene: HTMLElement, answer: string, ok: boolean): void {
  const count = answer === 'uni' ? 1 : answer === 'multi' ? 3 : 7;
  const fleet = h('div', 'fleet');
  for (let i = 0; i < 7; i++) fleet.appendChild(h('div', i < count ? 'shipicon lit' : 'shipicon'));
  scene.appendChild(fleet);
  flash(scene, ok ? 'glow' : 'shake', 900);
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
