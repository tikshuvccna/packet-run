import type { GameData, Level } from '../learn/types';
import { PDU_HINT, beltItems, cranePhases, phasePoints, type BeltKind } from '../learn/arcadeLogic';
import { rng, shuffle } from '../learn/rng';
import { finish, shell, type GameResult } from './games';
import { btn, clear, flash, h, wait } from './dom';
import type { Ctx } from './ctx';

const SYMPTOM: Record<string, string> = { addr: 'אין כתובת', code: '#@%&!', fmt: 'מבולגן, בלי התחלה', size: 'גדולה מדי', time: 'זזה מהר' };

/* ------------------------------------------------------------------ lesson 06: the sorting belt */
export function runBelt(ctx: Ctx, lessonId: string, data: GameData, level: Level): Promise<GameResult> {
  const cfg = data.levels[level];
  const items = beltItems(data, level, Math.floor(Math.random() * 1e6));
  const fall = (cfg.fallSec ?? 9) * 1000;
  const ruleOpts = data['ruleOptions'] as { id: string; label: string }[];
  const castOpts = data['castOptions'] as { id: string; label: string }[];
  return new Promise((resolve) => {
    let lives = cfg.lives, points = 0, handled = 0, combo = 0, stopped = false;
    const sh = shell(data.title, level, cfg.lives, ctx, () => { stopped = true; sh.close(); resolve({ passed: false, points, max: items.length, prize: null }); });
    sh.setHearts(lives);
    sh.setProgress(0, items.length, 0);
    const belt = h('div', 'belt');
    belt.appendChild(h('div', 'beltstation', 'תחנת תיקון'));
    belt.appendChild(h('div', 'beltfloor'));
    const comboEl = h('div', 'beltcombo hidden');
    const hint = h('div', 'panel dim', 'כל חבילה מראה מה השתבש. בחרו את הכלי הנכון לפני שהיא יוצאת מהמסך.');
    const tools = h('div', 'belttools');
    const toolBtns: HTMLButtonElement[] = [];
    const mk = (id: string, label: string, grp: string, key: string): void => {
      const b = btn(label, () => act(id), `btn tool ${grp}`);
      b.dataset['key'] = key; b.dataset['tool'] = id;
      toolBtns.push(b); tools.appendChild(b);
    };
    ruleOpts.forEach((o, i) => mk(o.id, o.label, 'rule', String(i + 1)));
    castOpts.forEach((o, i) => mk(o.id === 'uni' ? 'uni' : o.id === 'multi' ? 'multi' : 'broad', o.label, 'castt', String(i + 6)));
    sh.stage.append(belt, comboEl, tools, hint);
    if (level === 'easy') toolBtns.filter((b) => b.classList.contains('castt')).forEach((b) => b.classList.add('hidden'));

    interface P { it: (typeof items)[number]; el: HTMLElement; born: number; done: boolean; speed: number }
    const live: P[] = [];
    let spawned = 0;
    const t0 = performance.now();

    const oldest = (): P | undefined => live.find((p) => !p.done && p.el.offsetLeft + p.el.offsetWidth > 0);
    const act = (tool: string): void => {
      const p = oldest();
      if (!p || stopped) return;
      p.done = true; handled++;
      const ok = p.it.kind === tool;
      if (ok) { points++; combo++; ctx.audio.sfx('good'); p.el.classList.add('fixed'); }
      else { lives--; combo = 0; sh.setHearts(lives); ctx.audio.sfx('bad'); p.el.classList.add('broken'); hint.textContent = `זו הייתה: ${labelOf(p.it.kind)}.`; flash(belt, 'shake', 400); }
      comboEl.textContent = combo >= 3 ? `קומבו ${combo}` : '';
      comboEl.classList.toggle('hidden', combo < 3);
      sh.setProgress(handled, items.length, points);
      setTimeout(() => p.el.remove(), 700);
    };
    const labelOf = (k: BeltKind): string => [...ruleOpts, ...castOpts].find((o) => o.id === k)?.label ?? k;

    const onKey = (e: KeyboardEvent): void => { const b = toolBtns.find((x) => x.dataset['key'] === e.key && !x.classList.contains('hidden')); if (b) act(b.dataset['tool'] as string); };
    window.addEventListener('keydown', onKey);

    const tick = async (): Promise<void> => {
      if (stopped) { window.removeEventListener('keydown', onKey); return; }
      const now = performance.now() - t0;
      while (spawned < items.length && (items[spawned] as (typeof items)[number]).at * 1000 <= now) {
        const it = items[spawned] as (typeof items)[number];
        const isCast = it.kind === 'uni' || it.kind === 'multi' || it.kind === 'broad';
        const el = h('div', `parcel ${isCast ? 'radio' : it.kind}`);
        el.appendChild(h('div', 'plabel', isCast ? it.text : SYMPTOM[it.kind] ?? ''));
        belt.appendChild(el);
        live.push({ it, el, born: now, done: false, speed: it.kind === 'time' ? 1.7 : 1 });
        spawned++;
      }
      for (const p of live) {
        const age = (now - p.born) * p.speed;
        const x = 105 - (age / fall) * 125;
        p.el.style.left = `${x}%`;
        if (!p.done && x < -22) { p.done = true; handled++; lives--; combo = 0; sh.setHearts(lives); ctx.audio.sfx('bad'); sh.setProgress(handled, items.length, points); hint.textContent = `החבילה יצאה. זו הייתה: ${labelOf(p.it.kind)}.`; p.el.remove(); }
      }
      const cur = oldest();
      live.forEach((p) => p.el.classList.toggle('active', p === cur));
      if (lives <= 0 || handled >= items.length) {
        stopped = true;
        window.removeEventListener('keydown', onKey);
        await wait(500);
        resolve(await finish(ctx, sh, lessonId, data, level, points, items.length));
        return;
      }
      requestAnimationFrame(() => { void tick(); });
    };
    requestAnimationFrame(() => { void tick(); });
  });
}

/* ------------------------------------------------------------------ lesson 08: stack the containers */
export function runCrane(ctx: Ctx, lessonId: string, data: GameData, level: Level): Promise<GameResult> {
  const cfg = data.levels[level];
  const phases = cranePhases(level);
  const total = phasePoints(level);
  const fall = (cfg.fallSec ?? 9) * 1000;
  const r = rng(Math.floor(Math.random() * 1e6));
  const allNames = data['pdus'] as string[];
  return new Promise((resolve) => {
    let lives = cfg.lives, points = 0, stopped = false, phaseIdx = 0, pos = 0, handledTaps = 0;
    const sh = shell(data.title, level, cfg.lives, ctx, () => { stopped = true; sh.close(); resolve({ passed: false, points, max: total, prize: null }); });
    sh.setHearts(lives);
    sh.setProgress(0, total, 0);
    const title = h('div', 'cranetitle');
    const belt = h('div', 'belt crane');
    belt.appendChild(h('div', 'beltfloor'));
    const stackBox = h('div', 'cranestack');
    const hint = h('div', 'panel dim', '');
    sh.stage.append(title, belt, stackBox, hint);

    const need = (): string => (phases[phaseIdx] as { order: string[] }).order[pos] as string;
    const drawStack = (): void => {
      stackBox.textContent = '';
      const ph = phases[phaseIdx] as { kind: 'wrap' | 'peel'; order: string[] };
      // wrap: layers present = order[0..pos-1] (outer = last); peel: present = reverse(order)[pos..]
      const present = ph.kind === 'wrap' ? ph.order.slice(0, pos) : [...ph.order].reverse().slice(0, ph.order.length - pos);
      let parent: HTMLElement = stackBox;
      for (let k = present.length - 1; k >= 1; k--) {
        const box = h('div', 'nestbox'); box.appendChild(h('div', 'nestlabel', present[k] as string));
        parent.appendChild(box); parent = box;
      }
      if (present.length) parent.appendChild(h('div', 'nestcore', present[0] as string));
      else parent.appendChild(h('div', 'nestcore dim', 'ריק'));
      const ph2 = ph.kind === 'wrap' ? 'אורזים: קודם הפנימית, כל עטיפה מבחוץ' : 'מפרקים ביעד: קודם החיצונית';
      title.textContent = `${ph2}. הבא בתור: ${level === 'hard' ? 'לפי התוכן' : need()}`;
    };
    drawStack();

    const label = (name: string): string => (level === 'easy' ? `${name}\n${PDU_HINT[name]}` : level === 'medium' ? name : (PDU_HINT[name] as string));

    interface C { name: string; el: HTMLElement; born: number; done: boolean }
    const live: C[] = [];
    const t0 = performance.now();
    let nextSpawn = 0.6, sinceNeeded = 0;
    const gap = Math.max(1.2, (cfg.fallSec ?? 9) * 0.22);

    const lose = (msg: string): void => { lives--; sh.setHearts(lives); ctx.audio.sfx('bad'); hint.textContent = msg; flash(belt, 'shake', 400); };
    const tapContainer = async (c: C): Promise<void> => {
      if (c.done || stopped) return;
      const ph = phases[phaseIdx] as { kind: 'wrap' | 'peel'; order: string[] };
      c.done = true;
      if (c.name === need()) {
        points++; handledTaps++; pos++;
        ctx.audio.sfx('good');
        c.el.classList.add('fixed');
        setTimeout(() => c.el.remove(), 500);
        sh.setProgress(handledTaps, total, points);
        hint.textContent = ph.kind === 'wrap' ? `${c.name} נוספה.` : `${c.name} הוסרה.`;
        if (pos >= ph.order.length) {
          phaseIdx++; pos = 0;
          if (phaseIdx < phases.length) {
            const nk = (phases[phaseIdx] as { kind: string }).kind;
            hint.textContent = nk === 'wrap' ? 'מצוין! עכשיו אורזים חדש.' : 'מצוין! ההודעה הגיעה. עכשיו מפרקים.';
            ctx.audio.sfx('win');
          }
        }
        if (phaseIdx < phases.length) drawStack();
      } else {
        lose(`זו לא הבאה בתור. נדרשת: ${need()}.`);
        c.el.classList.add('broken');
        setTimeout(() => c.el.remove(), 500);
      }
    };

    const tick = async (): Promise<void> => {
      if (stopped) return;
      const now = (performance.now() - t0) / 1000;
      if (phaseIdx < phases.length && now >= nextSpawn) {
        nextSpawn = now + gap;
        const needed = need();
        const pickNeeded = sinceNeeded >= 2 || r() < 0.45;
        const pool = allNames.slice(0, (phases[phaseIdx] as { order: string[] }).order.length);
        const others = shuffle(pool.filter((n) => n !== needed), r);
        const name = pickNeeded || others.length === 0 ? needed : (others[0] as string);
        sinceNeeded = name === needed ? 0 : sinceNeeded + 1;
        const el = h('button', 'container', label(name), { type: 'button' });
        el.style.top = `${8 + Math.floor(r() * 3) * 30}%`;
        const c: C = { name, el, born: now * 1000, done: false };
        el.addEventListener('pointerdown', () => { void tapContainer(c); });
        belt.appendChild(el); live.push(c);
      }
      for (const c of live) {
        if (c.done) continue;
        const x = 100 - ((performance.now() - t0 - c.born) / fall) * 125;
        c.el.style.left = `${x}%`;
        if (x < -26) {
          c.done = true; c.el.remove();
          if (c.name === need() && phaseIdx < phases.length) lose(`${c.name} יצאה מהמסך. היא הייתה הבאה.`);
        }
      }
      if (lives <= 0 || phaseIdx >= phases.length) {
        stopped = true;
        await wait(600);
        clear(belt);
        resolve(await finish(ctx, sh, lessonId, data, level, points, total));
        return;
      }
      requestAnimationFrame(() => { void tick(); });
    };
    requestAnimationFrame(() => { void tick(); });
  });
}
