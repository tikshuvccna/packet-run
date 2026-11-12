import type { Look } from '../core/save';
import { btn, clear, h, overlay } from './dom';
import type { Ctx } from './ctx';

export const CREDITS_TEXT = {
  line1: 'משחק זה פותח ונבנה על ידי מיכאל תקשוב מאתר מגמת תקשוב.',
  site: 'https://tikshuv-ccna.com',
  line2: 'לפיתוח משחקים, סרטונים שיווקיים, תוכנות וייעוץ פנו.',
  mail: 'tikshuvccna@gmail.com',
  line3: 'לפניות בנושא בניית חדרי בריחה דיגיטליים ופיזיים בהתאמה אישית:',
  escape: 'https://escapebuilder.com',
  thanks: 'תודה לכל המסייעים, בטא טסטרים ומייעצים.',
};

export function link(href: string, text?: string): HTMLAnchorElement {
  const a = h('a', 'link', text ?? href, { href, target: '_blank', rel: 'noopener noreferrer' });
  a.setAttribute('dir', 'ltr');
  return a;
}

export function creditsBlock(): HTMLElement {
  const c = CREDITS_TEXT;
  const box = h('div', 'credits');
  box.appendChild(h('p', null, c.line1));
  const p1 = h('p');
  p1.appendChild(link(c.site));
  box.appendChild(p1);
  box.appendChild(h('p', null, c.line2));
  const p2 = h('p');
  p2.appendChild(link(`mailto:${c.mail}`, c.mail));
  box.appendChild(p2);
  box.appendChild(h('p', null, c.line3));
  const p3 = h('p');
  p3.appendChild(link(c.escape));
  box.appendChild(p3);
  box.appendChild(h('p', 'thanks', c.thanks));
  return box;
}

export function openCredits(ctx: Ctx): Promise<void> {
  const { root, close } = overlay('credits-screen');
  void ctx;
  return new Promise((resolve) => {
    const card = h('div', 'lcard');
    card.appendChild(h('h2', null, 'קרדיטים'));
    card.appendChild(creditsBlock());
    card.appendChild(btn('סגירה', () => { close(); resolve(); }, 'btn primary'));
    root.appendChild(card);
  });
}

export function openHelp(ctx: Ctx): Promise<void> {
  const { root, close } = overlay('help-screen');
  void ctx;
  return new Promise((resolve) => {
    const card = h('div', 'lcard help');
    card.appendChild(h('h2', null, 'איך משחקים'));
    const items: [string, string][] = [
      ['מטרה', 'לבצע משימות בעיר, ללמוד שלושה שיעורים במוסכים, ולנצח בגרנד פרי הרשת.'],
      ['נהיגה', 'מקלדת: חצים או WASD. חץ למטה גם נוסע לאחור.'],
      ['מגע', 'מסובבים את ההגה משמאל. ידית הכוח מימין: למעלה קדימה, N עצירה, R לאחור.'],
      ['משימות', 'המשימה כתובה למעלה. נוסעים אל קרן האור הצהובה, והיא מסומנת גם במפה.'],
      ['משימות צד', 'יהלום סגול עם סימן קריאה = משימת צד. היא רשות, ומשלמת מטבעות.'],
      ['נזק', 'מכות פוגעות ברכב (הפס הכחול). עוברים לאט במוסך או בתחנת דלק לתיקון.'],
      ['הולכי רגל', 'על המדרכות הולכים אנשים. נוסעים בכביש ושומרים עליהם.'],
      ['נייטרוס', 'רווח: האצה חזקה. הוא מתמלא כשנוסעים מהר ומחליקים.'],
      ['דריפט', 'Shift: בלם יד לפניות חלקות. דריפט ארוך ממלא נייטרוס.'],
      ['זריקה', 'F: זורקים לאחור פריט (שמן, חרוטים, דבק, בועה). אוספים בתיבות במרוץ.'],
      ['תיבות שאלה', 'במרוץ: שלוש תיבות עם תשובות. נכנסים בנכונה ומקבלים פריט.'],
      ['כניסה למוסך', 'עוצרים בעיגול ולוחצים E. שם לומדים ומשדרגים.'],
      ['דלק', 'אחרי כמה דקות נסיעה הדלק נגמר והגרר לוקח למוסך הבא. שום דבר לא אבד.'],
    ];
    const dl = h('div', 'helplist');
    for (const [k, v] of items) { const r = h('div', 'hrow'); r.append(h('b', null, k), h('span', null, v)); dl.appendChild(r); }
    card.appendChild(dl);
    card.appendChild(btn('הבנתי', () => { close(); resolve(); }, 'btn primary'));
    root.appendChild(card);
  });
}

export function openSettings(ctx: Ctx, onReset?: () => void): Promise<void> {
  const st = ctx.save.data.settings;
  const { root, close } = overlay('settings-screen');
  return new Promise((resolve) => {
    const card = h('div', 'lcard settings');
    card.appendChild(h('h2', null, 'הגדרות'));
    const row = (label: string, control: HTMLElement): HTMLElement => { const r = h('div', 'srow'); r.append(h('span', null, label), control); card.appendChild(r); return r; };
    const toggle = (get: () => boolean, set: (v: boolean) => void): HTMLElement => {
      const b = h('button', 'btn switch', get() ? 'פועל' : 'כבוי', { type: 'button' });
      b.addEventListener('click', () => { set(!get()); b.textContent = get() ? 'פועל' : 'כבוי'; b.classList.toggle('on', get()); ctx.save.save(); ctx.audio.setVolumes(); });
      b.classList.toggle('on', get());
      return b;
    };
    const slider = (get: () => number, set: (v: number) => void): HTMLElement => {
      const i = h('input', 'range', null, { type: 'range', min: '0', max: '100' }) as HTMLInputElement;
      i.value = String(Math.round(get() * 100));
      i.addEventListener('input', () => { set(Number(i.value) / 100); ctx.save.save(); ctx.audio.setVolumes(); });
      return i;
    };
    row('מוזיקה', toggle(() => st.musicOn, (v) => { st.musicOn = v; }));
    row('עוצמת מוזיקה', slider(() => st.musicVol, (v) => { st.musicVol = v; }));
    row('אפקטים', toggle(() => st.sfxOn, (v) => { st.sfxOn = v; }));
    row('עוצמת אפקטים', slider(() => st.sfxVol, (v) => { st.sfxVol = v; }));
    const q = h('select', 'select') as HTMLSelectElement;
    for (const [v, t] of [['auto', 'אוטומטי'], ['low', 'נמוכה'], ['medium', 'בינונית'], ['high', 'גבוהה']] as const) {
      const o = h('option', null, t, { value: v });
      if (st.quality === v) o.setAttribute('selected', '');
      q.appendChild(o);
    }
    q.addEventListener('change', () => { st.quality = q.value as typeof st.quality; ctx.save.save(); });
    row('איכות גרפית', q);
    row('מונה FPS', toggle(() => st.showFps, (v) => { st.showFps = v; }));
    row('שני שחקנים על מכשיר אחד', toggle(() => ctx.save.data.twoPlayers, (v) => { ctx.save.data.twoPlayers = v; }));
    if (onReset) {
      const r = btn('מחיקת ההתקדמות', () => {
        if (r.dataset['sure'] === '1') { onReset(); close(); resolve(); } else { r.dataset['sure'] = '1'; r.textContent = 'ללחוץ שוב לאישור'; }
      }, 'btn danger');
      row('איפוס', r);
    }
    card.appendChild(btn('סגירה', () => { close(); resolve(); }, 'btn primary'));
    root.appendChild(card);
  });
}

export type TitleChoice = 'continue' | 'new';
export interface TitleExtras { settings: () => Promise<void>; help: () => Promise<void>; credits: () => Promise<void>; codex: () => Promise<void> }

export function showTitle(ctx: Ctx, extras: TitleExtras): Promise<TitleChoice> {
  const { root, close } = overlay('title-screen');
  ctx.audio.mood('menu');
  return new Promise((resolve) => {
    const logo = h('div', 'logo');
    logo.appendChild(h('div', 'logo-small', 'מגמת תקשוב מציגה'));
    logo.appendChild(h('h1', null, 'מרוץ החבילות'));
    logo.appendChild(h('div', 'logo-sub', 'העיר מבולבלת. תנסעו, תלמדו, תנצחו.'));
    const menu = h('div', 'menu');
    const go = (c: TitleChoice): void => { close(); resolve(c); };
    if (ctx.save.data.started) menu.appendChild(btn('המשך נסיעה', () => go('continue'), 'btn primary big'));
    menu.appendChild(btn(ctx.save.data.started ? 'נסיעה חדשה' : 'התחלה', () => go('new'), ctx.save.data.started ? 'btn' : 'btn primary big'));
    const small = h('div', 'menu-row');
    small.append(
      btn('הגדרות', () => { void extras.settings(); }, 'btn small'),
      btn('עזרה', () => { void extras.help(); }, 'btn small'),
      btn('אוסף', () => { void extras.codex(); }, 'btn small'),
      btn('קרדיטים', () => { void extras.credits(); }, 'btn small'),
    );
    menu.appendChild(small);
    const foot = h('div', 'title-foot');
    foot.appendChild(h('span', null, 'פותח על ידי מיכאל תקשוב · '));
    foot.appendChild(link('https://tikshuv-ccna.com', 'tikshuv-ccna.com'));
    root.append(logo, menu, foot);
  });
}

/** Look and name picker for a new voyage. */
export function pickHero(ctx: Ctx): Promise<{ look: Look; name: string } | null> {
  const { root, close } = overlay('hero-screen');
  return new Promise((resolve) => {
    let look: Look = ctx.save.data.hero;
    const card = h('div', 'lcard hero');
    card.appendChild(h('h2', null, 'מי נוהג?'));
    const choices = h('div', 'looks');
    const draw = (): void => {
      clear(choices);
      for (const [l, t] of [['girl', 'בת'], ['boy', 'בן']] as const) {
        const b = btn(t, () => { look = l; draw(); }, `btn look${look === l ? ' on' : ''}`);
        const img = h('img', 'lookimg', null, { alt: '' });
        img.src = `assets/portraits/hero_${l}_neutral.png`;
        img.addEventListener('error', () => img.remove());
        b.prepend(img);
        choices.appendChild(b);
      }
    };
    draw();
    const name = h('input', 'nameinput', null, { type: 'text', maxlength: '12', placeholder: 'שם', value: ctx.save.data.name }) as HTMLInputElement;
    card.append(choices, name);
    const row = h('div', 'lfoot');
    row.append(btn('יאללה', () => { close(); resolve({ look, name: name.value.trim() || 'שליח' }); }, 'btn primary'), btn('חזרה', () => { close(); resolve(null); }, 'btn ghost'));
    card.appendChild(row);
    root.appendChild(card);
  });
}
