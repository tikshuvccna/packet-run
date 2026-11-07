/** Tiny DOM helpers. All text is set with textContent unless html is explicitly passed (content we wrote). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string | null, text?: string | null, attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function btn(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', cls, label, { type: 'button' });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }

export function html(el: HTMLElement, s: string): HTMLElement { el.innerHTML = s; return el; }

export function wait(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

export function flash(el: HTMLElement, cls: string, ms = 450): void {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export const ui = (): HTMLElement => document.getElementById('ui') as HTMLElement;

/** Opens an overlay layer in #ui and returns it with a close function. */
export function overlay(cls = ''): { root: HTMLElement; close: () => void } {
  const root = h('div', `screen ${cls}`.trim());
  ui().appendChild(root);
  document.body.classList.add('modal');
  return {
    root,
    close: () => {
      root.remove();
      if (!ui().querySelector('.screen')) document.body.classList.remove('modal');
    },
  };
}
