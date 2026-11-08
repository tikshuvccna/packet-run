import type { Widget } from '../learn/types';
import { castReceivers, castTraffic, flowSim, msgOutcome, tcpUdpSim, wordBits } from '../learn/simLogic';
import { btn, flash, h } from './dom';

interface WidgetCtx { sfx: (name: string) => void; done: () => void }
type W<T extends Widget['type']> = Extract<Widget, { type: T }>;

function frame(title: string): { root: HTMLElement; body: HTMLElement } {
  const root = h('div', 'widget sim');
  root.appendChild(h('div', 'widget-title', title));
  const body = h('div', 'widget-body');
  root.appendChild(body);
  return { root, body };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ message lab: break a rule and watch the message fail */
export function msglab(w: W<'msglab'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const state = { address: true, sameCode: true, format: true, small: true, paced: true };
  const rules: { key: keyof typeof state; label: string; good: string; bad: string }[] = [
    { key: 'address', label: 'כתובת', good: 'יש יעד ושולח', bad: 'אין כתובת' },
    { key: 'sameCode', label: 'קידוד', good: 'אותה שפה', bad: 'שפות שונות' },
    { key: 'format', label: 'תבנית', good: 'מסגרת מסודרת', bad: 'בלי תבנית' },
    { key: 'small', label: 'גודל', good: 'נכנס במסגרת', bad: 'ענקי מדי' },
    { key: 'paced', label: 'תזמון', good: 'בקצב נכון', bad: 'מהר מדי' },
  ];
  const road = h('div', 'simroad');
  const a = h('div', 'simcar a', 'שולח');
  const b = h('div', 'simcar b', 'יעד');
  const env = h('div', 'envelope', w.message);
  road.append(a, h('div', 'roadline'), b, env);
  const out = h('div', 'panel', 'שנו חוק ולחצו שלחו');
  const grid = h('div', 'rulegrid');
  const seenBroken = new Set<string>();
  let sentOk = false;
  for (const r of rules) {
    const bt = btn('', () => {
      state[r.key] = !state[r.key];
      refresh(); ctx.sfx('click');
    }, 'btn rulebtn');
    const refresh = (): void => {
      bt.textContent = '';
      bt.append(h('b', null, r.label), h('small', null, state[r.key] ? r.good : r.bad));
      bt.classList.toggle('broken', !state[r.key]);
    };
    refresh();
    grid.appendChild(bt);
  }
  let busy = false;
  const send = btn('שלחו', async () => {
    if (busy) return;
    busy = true;
    const o = msgOutcome({ ...state });
    env.className = 'envelope go';
    env.textContent = state.sameCode ? w.message : '#@%&!';
    env.style.transition = 'none';
    env.style.left = '12%';
    await sleep(30);
    env.style.transition = 'left 1.2s ease-in-out';
    env.style.left = o.ok ? '78%' : state.address ? '55%' : '40%';
    await sleep(1250);
    env.classList.add(o.ok ? 'arrived' : 'lost');
    out.textContent = o.text;
    out.className = `panel ${o.ok ? 'okmsg' : 'badmsg'}`;
    ctx.sfx(o.ok ? 'good' : 'bad');
    if (o.ok) sentOk = true; else o.broken.forEach((x) => seenBroken.add(x));
    if (sentOk && seenBroken.size >= 3) ctx.done();
    await sleep(500);
    busy = false;
  }, 'btn primary');
  body.append(road, grid, send, out);
  return root;
}

/* ------------------------------------------------------------------ encode: letters become bits, bits travel on a medium */
export function encode(w: W<'encode'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  let word = w.words[0] ?? 'A';
  let medium: 'copper' | 'fiber' | 'air' = 'copper';
  const wordsRow = h('div', 'switches');
  const medRow = h('div', 'switches');
  const bits = h('div', 'bitsrow');
  const wire = h('div', 'bitwire');
  const info = h('div', 'panel', 'בחרו מילה ומדיה');
  const usedWords = new Set<string>(), usedMedia = new Set<string>();
  const MEDIA = { copper: { he: 'כבל נחושת', how: 'פולסים חשמליים: חשמל גבוה הוא 1 ונמוך הוא 0.', cls: 'copper' }, fiber: { he: 'סיב אופטי', how: 'פולסים של אור: אור דולק הוא 1 וכבוי הוא 0.', cls: 'fiber' }, air: { he: 'אוויר (Wi-Fi)', how: 'גלי רדיו: שינוי בגל מייצג 1 או 0.', cls: 'air' } } as const;
  const draw = (): void => {
    bits.textContent = '';
    const chars = [...word];
    wordBits(word).forEach((bb, i) => {
      const g = h('div', 'bitgroup');
      g.appendChild(h('div', 'bitchar', chars[i] ?? ''));
      g.appendChild(h('div', 'bitdigits', bb));
      bits.appendChild(g);
    });
    wire.textContent = '';
    wire.className = `bitwire ${MEDIA[medium].cls}`;
    for (const ch of wordBits(word).join('')) wire.appendChild(h('span', ch === '1' ? 'pulse hi' : 'pulse lo'));
    info.textContent = `${MEDIA[medium].he}: ${MEDIA[medium].how}`;
    usedWords.add(word); usedMedia.add(medium);
    if (usedWords.size >= 2 && usedMedia.size >= 2) ctx.done();
  };
  for (const wd of w.words) wordsRow.appendChild(btn(wd, () => { word = wd; draw(); ctx.sfx('click'); }, 'btn sw'));
  (Object.keys(MEDIA) as (keyof typeof MEDIA)[]).forEach((m) => medRow.appendChild(btn(MEDIA[m].he, () => { medium = m; draw(); ctx.sfx('click'); }, 'btn sw')));
  draw();
  usedWords.clear(); usedMedia.clear(); usedWords.add(word); usedMedia.add(medium);
  body.append(h('div', 'gsub', 'מילה'), wordsRow, h('div', 'gsub', 'מדיה'), medRow, bits, wire, info);
  return root;
}

/* ------------------------------------------------------------------ cast: who receives, and how much traffic */
export function cast(w: W<'cast'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  let mode: 'uni' | 'multi' | 'broad' = 'uni';
  let picked: number[] = [];
  const used = new Set<string>();
  const net = h('div', 'castnet');
  const info = h('div', 'panel', 'בחרו סוג, סמנו מי מקבל ולחצו שלחו');
  const hosts: HTMLElement[] = [];
  for (let i = 0; i < w.hosts; i++) {
    const hb = h('button', `host${i === 0 ? ' sender' : ''}`, i === 0 ? 'שולח' : String(i), { type: 'button' });
    hb.addEventListener('click', () => {
      if (i === 0 || mode === 'broad') return;
      if (mode === 'uni') picked = [i]; else picked = picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i];
      paint(); ctx.sfx('click');
    });
    hosts.push(hb); net.appendChild(hb);
  }
  const paint = (rec: number[] = []): void => {
    hosts.forEach((hb, i) => { hb.classList.toggle('picked', picked.includes(i)); hb.classList.toggle('got', rec.includes(i)); });
  };
  const modes = h('div', 'switches');
  const mk = (id: 'uni' | 'multi' | 'broad', label: string): void => {
    const b = btn(label, () => {
      mode = id; picked = []; modes.querySelectorAll('.btn').forEach((x) => x.classList.remove('on')); b.classList.add('on'); paint();
      info.textContent = id === 'uni' ? 'Unicast: בחרו מחשב אחד.' : id === 'multi' ? 'Multicast: בחרו כמה מחשבים בקבוצה.' : 'Broadcast: כולם יקבלו, אין צורך לבחור.';
    }, 'btn sw');
    modes.appendChild(b);
  };
  mk('uni', 'Unicast'); mk('multi', 'Multicast'); mk('broad', 'Broadcast');
  (modes.firstChild as HTMLElement).classList.add('on');
  const send = btn('שלחו', () => {
    const rec = castReceivers(mode, w.hosts, picked);
    if (mode !== 'broad' && rec.length === 0) { info.textContent = 'סמנו מי מקבל.'; return; }
    paint(rec);
    const n = castTraffic(mode, w.hosts, picked);
    info.textContent = `${rec.length} מחשבים קיבלו. מספר ההעתקים שעברו ברשת: ${n}. ${mode === 'broad' ? 'שידור לכולם מעמיס על כל הרשת.' : ''}`;
    used.add(mode); ctx.sfx('good');
    if (used.size === 3) ctx.done();
  }, 'btn primary');
  body.append(net, modes, send, info);
  return root;
}

/* ------------------------------------------------------------------ flow: sender speed against receiver speed */
export function flowsim(w: W<'flowsim'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  let rate = 8;
  const rateLbl = h('div', 'gsub', '');
  const slider = h('input', 'range', null, { type: 'range', min: '1', max: '12', value: String(rate) }) as HTMLInputElement;
  const queue = h('div', 'queuebar');
  const info = h('div', 'panel', `המקבל קולט ${w.cap} הודעות בשנייה ויכול להחזיק ${w.buf} בהמתנה.`);
  const stat = h('div', 'flowstat', '');
  const upd = (): void => { rate = Number(slider.value); rateLbl.textContent = `קצב השולח: ${rate} בשנייה`; };
  slider.addEventListener('input', upd); upd();
  let ok = false, bad = false, busy = false;
  const run = btn('שלחו 8 שניות', async () => {
    if (busy) return;
    busy = true;
    const r = flowSim(rate, w.cap, w.buf, w.secs);
    queue.textContent = '';
    for (let i = 0; i < w.buf; i++) queue.appendChild(h('span', i < Math.min(r.peakBuffer, w.buf) ? 'slotfull' : 'slotempty'));
    stat.textContent = `נשלחו ${r.sent}, התקבלו ${r.received}, אבדו ${r.lost}. שיא בהמתנה: ${r.peakBuffer}.`;
    if (r.lost > 0) { info.textContent = 'המקבל לא מספיק. חלק מההודעות אבדו. האטו את השולח.'; info.className = 'panel badmsg'; bad = true; ctx.sfx('bad'); }
    else { info.textContent = 'כל ההודעות הגיעו. התזמון נכון.'; info.className = 'panel okmsg'; ok = true; ctx.sfx('good'); }
    if (ok && bad) ctx.done();
    busy = false;
  }, 'btn primary');
  body.append(rateLbl, slider, run, queue, stat, info);
  return root;
}

/* ------------------------------------------------------------------ journey: down the layers, across the wire, up the layers */
export function journey(w: W<'journey'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  const n = w.layers.length;
  let phase = 0;           // 0..n-1 going down, n = on the wire, n+1.. = going up
  const total = n * 2 + 1;
  const stack = h('div', 'jstack');
  const pkt = h('div', 'jpacket');
  const info = h('div', 'panel', 'לחצו הבא כדי לשלוח את ההודעה');
  const rows = w.layers.map((l) => { const r = h('div', 'jrow'); r.append(h('b', null, l.label), h('span', null, l.adds)); stack.appendChild(r); return r; });
  const wireRow = h('div', 'jrow jwire', 'כבל / אוויר: אותות בלבד');
  stack.appendChild(wireRow);
  const drawPacket = (depth: number): void => {
    pkt.textContent = '';
    let parent: HTMLElement = pkt;
    for (let k = depth; k >= 1; k--) {
      const box = h('div', 'nestbox');
      box.appendChild(h('div', 'nestlabel', w.layers[k - 1]?.adds ?? ''));
      parent.appendChild(box);
      parent = box;
    }
    parent.appendChild(h('div', 'nestcore', w.core));
  };
  const show = (): void => {
    rows.forEach((r) => r.classList.remove('now'));
    wireRow.classList.remove('now');
    if (phase < n) {
      rows[phase]?.classList.add('now');
      drawPacket(phase + 1);
      info.textContent = `${w.layers[phase]?.label}: ${w.layers[phase]?.detail}`;
    } else if (phase === n) {
      wireRow.classList.add('now');
      drawPacket(n);
      info.textContent = 'ההודעה עוברת כאותות: כבל, סיב או אוויר.';
    } else {
      const up = phase - n - 1;                       // 0 = lowest layer
      const layerIdx = n - 1 - up;
      rows[layerIdx]?.classList.add('now');
      drawPacket(layerIdx);
      info.textContent = `אצל היעד, ${w.layers[layerIdx]?.label}: מקלפים את "${w.layers[layerIdx]?.adds}" ומעבירים הלאה.`;
    }
  };
  const next = btn('הבא', () => {
    if (phase >= total - 1) { ctx.done(); info.textContent = 'ההודעה הגיעה למקבל כמו שנשלחה.'; return; }
    phase++; show(); ctx.sfx('click');
    if (phase === total - 1) { next.textContent = 'סיום'; ctx.done(); }
  }, 'btn primary');
  show();
  const cols = h('div', 'jcols');
  cols.append(stack, pkt);
  body.append(cols, next, info);
  return root;
}

/* ------------------------------------------------------------------ tcp vs udp over a lossy road */
export function tcpudp(w: W<'tcpudp'>, ctx: WidgetCtx): HTMLElement {
  const { root, body } = frame(w.title);
  let loss = 30;
  const lbl = h('div', 'gsub', '');
  const slider = h('input', 'range', null, { type: 'range', min: '0', max: '60', value: String(loss), step: '5' }) as HTMLInputElement;
  const upd = (): void => { loss = Number(slider.value); lbl.textContent = `אובדן בדרך: ${loss}% מהחבילות`; };
  slider.addEventListener('input', upd); upd();
  const out = h('div', 'tcpout');
  const log = h('div', 'tcplog');
  const used = new Set<string>();
  const run = (proto: 'tcp' | 'udp'): void => {
    const r = tcpUdpSim(proto, w.total, loss, loss * 13 + (proto === 'tcp' ? 1 : 2));
    out.textContent = '';
    out.append(
      h('div', `tcpcard ${proto}`, `${proto.toUpperCase()}: התקבלו ${r.delivered} מתוך ${r.total}`),
      h('div', 'tcpcard', `שידורים בפועל: ${r.transmissions}`),
      h('div', 'tcpcard', `זמן: ${r.seconds} שניות`),
    );
    log.textContent = '';
    for (const l of r.log.slice(0, 8)) log.appendChild(h('div', 'logline', l));
    if (r.log.length > 8) log.appendChild(h('div', 'logline dim', `ועוד ${r.log.length - 8} שורות...`));
    if (loss >= 20) used.add(proto);
    ctx.sfx(r.delivered === r.total ? 'good' : 'bad');
    if (used.size === 2) ctx.done();
  };
  const row = h('div', 'switches');
  row.append(btn('שלחו ב-TCP (אמין)', () => run('tcp'), 'btn sw'), btn('שלחו ב-UDP (מהיר)', () => run('udp'), 'btn sw'));
  body.append(lbl, slider, row, out, log, h('div', 'panel dim', 'נסו כל אחד עם אובדן של 20% ומעלה.'));
  void flash;
  return root;
}
