import { UPGRADE_IDS, UPGRADE_MAX, type UpgradeId } from '../core/save';
import type { CarId, VinylId, WheelId } from '../drive/contract';
import {
  CARS, PAINTS, RIMS, UPGRADE_DESC, UPGRADE_HE, VINYLS, WHEELS, buyCar, buyUpgrade, buyVinyl, buyWheels, statsFor, upgradePrice,
} from '../game/progress';
import { btn, clear, h, overlay } from './dom';
import type { Ctx } from './ctx';

type Tab = 'cars' | 'paint' | 'vinyl' | 'wheels' | 'upgrades';
const TABS: [Tab, string][] = [['cars', 'רכבים'], ['paint', 'צבע'], ['vinyl', 'מדבקות'], ['wheels', 'גלגלים'], ['upgrades', 'שדרוגים']];

/** Dina's garage: customise and upgrade. The car is shown live in the 3D world behind the panel (bus drive:set-look). */
export function openGarage(ctx: Ctx, startTab: Tab = 'cars'): Promise<void> {
  const s = ctx.save.data;
  const { root, close } = overlay('garage-screen');
  ctx.audio.mood('garage');
  return new Promise((resolve) => {
    let tab: Tab = startTab;
    const apply = (): void => { ctx.save.save(); ctx.bus.emit('drive:set-look', { ...s.look }); };
    const draw = (): void => {
      clear(root);
      const panel = h('div', 'gpanel');
      const head = h('div', 'ghead2');
      head.appendChild(h('h2', null, 'המוסך של דינה'));
      const coin = h('div', 'coinpill');
      coin.append(h('span', 'coin'), h('b', null, String(s.coins)));
      head.append(coin, btn('יציאה', () => { close(); resolve(); }, 'btn small primary'));
      panel.appendChild(head);
      const tabs = h('div', 'gtabs');
      for (const [id, label] of TABS) tabs.appendChild(btn(label, () => { tab = id; draw(); }, `btn small${tab === id ? ' on' : ''}`));
      panel.appendChild(tabs);
      const body = h('div', 'gbody');
      panel.appendChild(body);
      if (tab === 'cars') carsTab(body);
      else if (tab === 'paint') paintTab(body);
      else if (tab === 'vinyl') vinylTab(body);
      else if (tab === 'wheels') wheelsTab(body);
      else upgradesTab(body);
      root.appendChild(panel);
    };

    const statBars = (el: HTMLElement): void => {
      const st = statsFor(s);
      const bars: [string, number][] = [['מהירות', st.topSpeed / 64], ['תאוצה', st.accel / 26], ['אחיזה', st.grip / 1.7], ['נייטרוס', st.nitroCap / 5.5]];
      const box = h('div', 'statbars');
      for (const [l, v] of bars) {
        const r = h('div', 'statrow');
        r.appendChild(h('span', null, l));
        const t = h('div', 'bar-track'); const f = h('div', 'bar-fill'); f.style.width = `${Math.min(1, v) * 100}%`; t.appendChild(f);
        r.appendChild(t);
        box.appendChild(r);
      }
      el.appendChild(box);
    };

    const carsTab = (el: HTMLElement): void => {
      statBars(el);
      for (const c of CARS) {
        const owned = s.cars.includes(c.id);
        const row = h('div', `grow${s.look.car === c.id ? ' sel' : ''}`);
        const t = h('div', 'gtext'); t.append(h('b', null, c.he), h('small', null, c.blurb));
        row.appendChild(t);
        const b = btn(owned ? (s.look.car === c.id ? 'נבחר' : 'בחירה') : String(c.price), () => {
          if (owned) { s.look.car = c.id as CarId; apply(); ctx.audio.sfx('click'); draw(); }
          else if (buyCar(s, c.id as CarId)) { s.look.car = c.id as CarId; apply(); ctx.audio.sfx('coin'); draw(); } else ctx.audio.sfx('bad');
        }, 'btn buy');
        b.disabled = (!owned && s.coins < c.price) || s.look.car === c.id;
        row.appendChild(b);
        el.appendChild(row);
      }
    };

    const swatches = (el: HTMLElement, colors: string[], cur: string, pick: (c: string) => void): void => {
      const grid = h('div', 'swatches');
      for (const c of colors) {
        const b = h('button', `swatch${c === cur ? ' on' : ''}`, null, { type: 'button' });
        b.style.background = c;
        b.addEventListener('click', () => { pick(c); apply(); ctx.audio.sfx('click'); draw(); });
        grid.appendChild(b);
      }
      el.appendChild(grid);
    };

    const paintTab = (el: HTMLElement): void => {
      el.appendChild(h('div', 'gsub', 'צבע הרכב'));
      swatches(el, PAINTS, s.look.paint, (c) => { s.look.paint = c; });
      el.appendChild(h('div', 'gsub', 'צבע החישוקים'));
      swatches(el, RIMS, s.look.rim, (c) => { s.look.rim = c; });
      const sp = btn(s.look.spoiler ? 'ספוילר: פועל' : 'ספוילר: כבוי', () => { s.look.spoiler = !s.look.spoiler; apply(); draw(); }, 'btn small');
      el.appendChild(sp);
    };

    const vinylTab = (el: HTMLElement): void => {
      const none = h('div', `grow${s.look.vinyl === null ? ' sel' : ''}`);
      none.appendChild(h('div', 'gtext', 'בלי מדבקה'));
      none.appendChild(btn('בחירה', () => { s.look.vinyl = null; apply(); draw(); }, 'btn buy'));
      el.appendChild(none);
      for (const v of VINYLS) {
        const owned = s.vinyls.includes(v.id);
        const row = h('div', `grow${s.look.vinyl === v.id ? ' sel' : ''}`);
        row.appendChild(h('div', 'gtext', v.he));
        const b = btn(owned ? 'בחירה' : String(v.price), () => {
          if (owned) { s.look.vinyl = v.id as VinylId; apply(); draw(); }
          else if (buyVinyl(s, v.id as VinylId)) { s.look.vinyl = v.id as VinylId; apply(); ctx.audio.sfx('coin'); draw(); } else ctx.audio.sfx('bad');
        }, 'btn buy');
        b.disabled = (!owned && s.coins < v.price) || s.look.vinyl === v.id;
        row.appendChild(b);
        el.appendChild(row);
      }
      if (s.look.vinyl) {
        el.appendChild(h('div', 'gsub', 'צבע המדבקה'));
        swatches(el, ['#ffffff', ...PAINTS.slice(0, 8)], s.look.vinylColor, (c) => { s.look.vinylColor = c; });
      }
    };

    const wheelsTab = (el: HTMLElement): void => {
      statBars(el);
      for (const w of WHEELS) {
        const owned = s.wheels.includes(w.id);
        const row = h('div', `grow${s.look.wheels === w.id ? ' sel' : ''}`);
        const t = h('div', 'gtext'); t.append(h('b', null, w.he), h('small', null, w.id === 'std' ? 'מאוזנים' : w.id === 'sport' ? 'פניות חדות, מהירים' : 'אחיזה חזקה, מעט איטיים'));
        row.appendChild(t);
        const b = btn(owned ? (s.look.wheels === w.id ? 'נבחר' : 'בחירה') : String(w.price), () => {
          if (owned) { s.look.wheels = w.id as WheelId; apply(); draw(); }
          else if (buyWheels(s, w.id as WheelId)) { s.look.wheels = w.id as WheelId; apply(); ctx.audio.sfx('coin'); draw(); } else ctx.audio.sfx('bad');
        }, 'btn buy');
        b.disabled = (!owned && s.coins < w.price) || s.look.wheels === w.id;
        row.appendChild(b);
        el.appendChild(row);
      }
    };

    const upgradesTab = (el: HTMLElement): void => {
      statBars(el);
      for (const id of UPGRADE_IDS) {
        const lv = s.upgrades[id as UpgradeId];
        const price = upgradePrice(s, id as UpgradeId);
        const row = h('div', 'grow');
        const t = h('div', 'gtext'); t.append(h('b', null, UPGRADE_HE[id as UpgradeId]), h('small', null, UPGRADE_DESC[id as UpgradeId]));
        row.appendChild(t);
        const pips = h('div', 'pips');
        for (let k = 0; k < UPGRADE_MAX[id as UpgradeId]; k++) pips.appendChild(h('span', k < lv ? 'pip on' : 'pip'));
        row.appendChild(pips);
        const b = btn(price === null ? 'מלא' : String(price), () => {
          if (buyUpgrade(s, id as UpgradeId)) { ctx.save.save(); ctx.audio.sfx('coin'); draw(); } else ctx.audio.sfx('bad');
        }, 'btn buy');
        b.disabled = price === null || s.coins < price;
        row.appendChild(b);
        el.appendChild(row);
      }
    };
    draw();
  });
}
