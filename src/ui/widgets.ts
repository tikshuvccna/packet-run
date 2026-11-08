import type { Widget } from '../learn/types';
import { rng, shuffle } from '../learn/rng';
import { btn, flash, h } from './dom';
import * as sim from './widgetsSim';

export interface WidgetCtx { sfx: (name: string) => void; done: () => void }

/** Renders one interactive widget of a lesson step. Calls ctx.done() when the player has used it enough. */
export function renderWidget(w: Widget, ctx: WidgetCtx, seed = 1): HTMLElement {
  switch (w.type) {
    case 'explore': return explore(w, ctx);
    case 'match': return match(w, ctx, seed);
    case 'toggle': return toggle(w, ctx);
    case 'order': return order(w, ctx, seed);
    case 'split': return split(w, ctx);
    case 'beam': return beam(w, ctx);
    case 'sort': return sort(w, ctx, seed);
    case 'wrap': return wrap(w, ctx);
    case 'msglab': return sim.msglab(w, ctx);
    case 'encode': return sim.encode(w, ctx);
    case 'cast': return sim.cast(w, ctx);
    case 'flowsim': return sim.flowsim(w, ctx);
    case 'journey': return sim.journey(w, ctx);
    case 'tcpudp': return sim.tcpudp(w, ctx);
  }
}

type W<T extends Widget['type']> = Extract<Widget, { type: T }>;

export function frame(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = h('div', 'widget');
  root.appendChild(h('div', 'widget-title', title));
  const body = h('div', 'widget-body');
  root.appendChild(body);
  return { root, body };
}

function explore(w: W<'explore'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const grid = h('div', 'cards');
  const panel = h('div', 'panel', 'לחצו על כרטיס');
  const seen = new Set<number>();
  w.cards.forEach((c, i) => {
    const b = btn(c.label, () => {
      seen.add(i);
      panel.textContent = c.text;
      b.classList.add('seen');
      grid.querySelectorAll('.card-btn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      ctx.sfx('click');
      if (seen.size === w.cards.length) ctx.done();
    }, 'btn card-btn');
    grid.appendChild(b);
  });
  body.append(grid, panel);
  return root;
}

function match(w: W<'match'>, ctx: WidgetCtx, seed: number): HTMLElement {
  const { root, body } = frame(w.title);
  const cols = h('div', 'match');
  const left = h('div', 'col');
  const right = h('div', 'col');
  const hint = h('div', 'panel', 'בחרו פריט מימין ואז את התואם משמאל');
  let sel: HTMLButtonElement | null = null;
  let selIdx = -1;
  let matched = 0;
  const order = shuffle(w.pairs.map((_, i) => i), rng(seed));
  w.pairs.forEach((p, i) => {
    const b = btn(p.a, () => {
      if (b.classList.contains('ok')) return;
      sel?.classList.remove('on');
      sel = b; selIdx = i; b.classList.add('on');
      ctx.sfx('click');
    }, 'btn item');
    left.appendChild(b);
  });
  order.forEach((i) => {
    const p = w.pairs[i]!;
    const b = btn(p.b, () => {
      if (b.classList.contains('ok') || !sel) return;
      if (selIdx === i) {
        sel.classList.remove('on'); sel.classList.add('ok'); b.classList.add('ok');
        sel = null; selIdx = -1; matched++;
        ctx.sfx('good');
        if (matched === w.pairs.length) { hint.textContent = 'הכול מחובר!'; ctx.done(); }
      } else {
        flash(b, 'bad'); ctx.sfx('bad');
      }
    }, 'btn item');
    right.appendChild(b);
  });
  cols.append(left, right);
  body.append(cols, hint);
  return root;
}

function toggle(w: W<'toggle'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const msg = h('div', 'msgbox', w.base);
  const out = h('div', 'panel', 'לחצו על מתג כדי לשבור חוק');
  const row = h('div', 'switches');
  const on = new Set<string>();
  const tried = new Set<string>();
  const refresh = (): void => {
    msg.classList.toggle('broken', on.size > 0);
    out.textContent = on.size === 0 ? w.okText : [...on].map((id) => w.switches.find((s) => s.id === id)!.effect).join(' ');
  };
  for (const s of w.switches) {
    const b = btn(s.label, () => {
      if (on.has(s.id)) on.delete(s.id); else on.add(s.id);
      b.classList.toggle('on', on.has(s.id));
      tried.add(s.id);
      ctx.sfx(on.has(s.id) ? 'bad' : 'click');
      refresh();
      if (tried.size === w.switches.length) ctx.done();
    }, 'btn sw');
    row.appendChild(b);
  }
  body.append(msg, row, out);
  return root;
}

function order(w: W<'order'>, ctx: WidgetCtx, seed: number): HTMLElement {
  const { root, body } = frame(w.title);
  const prompt = h('div', 'panel', w.prompt);
  const slots = h('div', 'slots');
  const pool = h('div', 'pool');
  let next = 0;
  w.items.forEach((_, i) => slots.appendChild(h('div', 'slot', String(i + 1))));
  const idx = shuffle(w.items.map((_, i) => i), rng(seed));
  for (const i of idx) {
    const b = btn(w.items[i]!, () => {
      if (b.classList.contains('used')) return;
      if (i === next) {
        const slot = slots.children[next] as HTMLElement;
        slot.textContent = w.items[i]!;
        slot.classList.add('filled');
        b.classList.add('used');
        next++;
        ctx.sfx('good');
        if (next === w.items.length) { prompt.textContent = 'מסודר!'; ctx.done(); }
      } else {
        flash(b, 'bad'); ctx.sfx('bad');
      }
    }, 'btn item');
    pool.appendChild(b);
  }
  body.append(prompt, slots, pool);
  return root;
}

function split(w: W<'split'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const info = h('div', 'panel', 'בחרו כמה נכנס במסגרת אחת');
  const row = h('div', 'switches');
  const view = h('div', 'frames');
  const tried = new Set<number>();
  const draw = (cap: number): void => {
    view.textContent = '';
    const n = Math.ceil(w.total / cap);
    for (let f = 0; f < n; f++) {
      const fr = h('div', 'frame');
      for (let k = 0; k < cap; k++) fr.appendChild(h('span', 'cube'));
      view.appendChild(fr);
    }
    info.textContent = `${w.total} ${w.unit}, ${cap} במסגרת: ${n} מסגרות.`;
  };
  for (const cap of w.capacities) {
    const b = btn(String(cap), () => {
      row.querySelectorAll('.btn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      draw(cap);
      tried.add(cap);
      ctx.sfx('click');
      if (tried.size >= 2) ctx.done();
    }, 'btn sw');
    row.appendChild(b);
  }
  body.append(row, view, info);
  return root;
}

function beam(w: W<'beam'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const sea = h('div', 'fleet');
  const ships: HTMLElement[] = [];
  for (let i = 0; i < w.ships; i++) { const s = h('div', 'shipicon'); ships.push(s); sea.appendChild(s); }
  const info = h('div', 'panel', 'בחרו סוג שידור');
  const row = h('div', 'switches');
  const tried = new Set<string>();
  for (const m of w.modes) {
    const b = btn(m.label, () => {
      row.querySelectorAll('.btn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      ships.forEach((s, i) => s.classList.toggle('lit', i < m.count));
      info.textContent = m.text;
      tried.add(m.id);
      ctx.sfx('click');
      if (tried.size === w.modes.length) ctx.done();
    }, 'btn sw');
    row.appendChild(b);
  }
  body.append(sea, row, info);
  return root;
}

function sort(w: W<'sort'>, ctx: WidgetCtx, seed: number): HTMLElement {
  const { root, body } = frame(w.title);
  const items = shuffle(w.items, rng(seed));
  let i = 0;
  const card = h('div', 'sortcard');
  const info = h('div', 'panel', 'לאן שייך הפריט?');
  const row = h('div', 'buckets');
  const show = (): void => { card.textContent = items[i]?.label ?? ''; };
  show();
  for (const b of w.buckets) {
    const x = btn(b.label, () => {
      const it = items[i];
      if (!it) return;
      if (it.bucket === b.id) {
        info.textContent = it.why;
        ctx.sfx('good');
        i++;
        if (i >= items.length) { card.textContent = 'סיימתם!'; ctx.done(); } else show();
      } else {
        flash(card, 'bad'); ctx.sfx('bad');
        info.textContent = 'לא כאן. נסו שוב.';
      }
    }, 'btn bucket');
    row.appendChild(x);
  }
  body.append(card, row, info);
  return root;
}

function wrap(w: W<'wrap'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const stage = h('div', 'nest');
  const info = h('div', 'panel', 'לחצו "עטפו" כדי להוסיף מכולה');
  const row = h('div', 'switches');
  let depth = 0;
  let wrapped = false, peeled = false;
  const draw = (): void => {
    stage.textContent = '';
    let parent: HTMLElement = stage;
    for (let k = depth; k >= 1; k--) {
      const layer = w.layers[k - 1]!;
      const box = h('div', 'nestbox');
      box.appendChild(h('div', 'nestlabel', `${layer.label}: ${layer.adds}`));
      parent.appendChild(box);
      parent = box;
    }
    parent.appendChild(h('div', 'nestcore', w.core));
  };
  const add = btn('עטפו', () => {
    if (depth < w.layers.length) { depth++; ctx.sfx('click'); draw(); if (depth === w.layers.length) wrapped = true; }
    info.textContent = depth === w.layers.length ? 'עטוף עד הסוף. עכשיו קלפו אצל היעד.' : `נוספה עטיפה ${depth} מתוך ${w.layers.length}`;
    if (wrapped && peeled) ctx.done();
  }, 'btn sw');
  const peel = btn('קלפו', () => {
    if (depth > 0) { depth--; ctx.sfx('click'); draw(); if (depth === 0 && wrapped) peeled = true; }
    info.textContent = depth === 0 ? 'חזרנו למידע המקורי.' : `נשארו ${depth} עטיפות`;
    if (wrapped && peeled) ctx.done();
  }, 'btn sw');
  row.append(add, peel);
  draw();
  body.append(stage, row, info);
  return root;
}
