import { SPEAKERS, line } from '../content';
import { clear, h, overlay } from './dom';
import { type Ctx, portraitImg } from './ctx';

/** Plays a list of line ids as a short dialogue; click or tap to advance. Resolves when the last line is dismissed. */
export function say(ctx: Ctx, ids: string[], opts: { mood?: Record<string, string> } = {}): Promise<void> {
  const name = ctx.save.data.name || 'צופה';
  const { root, close } = overlay('dialogue-screen');
  return new Promise((resolve) => {
    let i = 0;
    let typing = 0;
    let full = '';
    const box = h('div', 'dlg');
    const por = h('div', 'dlg-por');
    const who = h('div', 'dlg-who');
    const txt = h('div', 'dlg-text');
    const hint = h('div', 'dlg-hint', 'לחצו להמשך');
    box.append(por, h('div', 'dlg-main'));
    (box.lastChild as HTMLElement).append(who, txt, hint);
    root.appendChild(box);

    const show = (): void => {
      const id = ids[i];
      if (!id) { close(); resolve(); return; }
      const l = line(id);
      full = l.text.replace(/\{name\}/g, name);
      clear(por);
      if (l.who !== 'narrator') por.appendChild(portraitImg(l.who, opts.mood?.[l.who] ?? 'neutral'));
      who.textContent = SPEAKERS[l.who] ?? '';
      root.classList.toggle('narration', l.who === 'narrator');
      txt.textContent = '';
      let n = 0;
      clearInterval(typing);
      typing = window.setInterval(() => {
        n += 2;
        txt.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = 0; }
      }, 22);
      ctx.audio.sfx('talk');
    };
    const advance = (): void => {
      if (typing) { clearInterval(typing); typing = 0; txt.textContent = full; return; }
      i++;
      show();
    };
    root.addEventListener('pointerdown', advance);
    window.addEventListener('keydown', function onKey(e) {
      if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
    });
    show();
  });
}
