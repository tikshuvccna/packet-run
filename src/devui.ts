import type { Ctx } from './ui/ctx';
import { runLesson, runQuiz } from './ui/lesson';
import { runGame } from './ui/games';
import { runLessonHub } from './ui/lessonhub';
import { openGarage } from './ui/garage';
import { openCredits, openHelp, openSettings, pickHero, showTitle } from './ui/menus';
import { say } from './ui/dialogue';
import { Hud } from './ui/hud';
import type { Level } from './learn/types';

/** Direct entry to single screens for visual checks: ?dev=lesson06 | quiz06 | game06:hard | hub06 | garage | hud | credits | help | settings | title | hero | say */
export async function devRoute(ctx: Ctx, what: string): Promise<boolean> {
  const [name, arg] = what.split(':');
  const n = (name ?? '').replace(/\D/g, '');
  switch ((name ?? '').replace(/\d+$/, '')) {
    case 'lesson': await runLesson(ctx, `lesson${n}`); return true;
    case 'quiz': await runQuiz(ctx, `lesson${n}`, `quiz${n}`); return true;
    case 'game': await runGame(ctx, `lesson${n}`, `game${n}`, (arg as Level) || 'easy'); return true;
    case 'hub': await runLessonHub(ctx, `lesson${n}`); return true;
    case 'garage': ctx.save.data.coins = 500; await openGarage(ctx, (arg as 'cars') || 'cars'); return true;
    case 'hud': {
      const hud = new Hud(ctx.bus, () => undefined);
      hud.mount(document.getElementById('ui') as HTMLElement);
      hud.update({ speedKmh: 142, nitro: 1.8, nitroCap: 2.5, items: ['oil', 'mine'], coins: 120, race: { id: 'r1', he: 'מרוץ הרציפים', lap: 2, laps: 3, place: 2, total: 6, time: 74.3, checkpoint: 3, checkpoints: 8, gateQuestion: 'באיזו שכבה נמצאת כתובת IP?' }, heading: 0, x: 0, z: 0, nearPoi: null, wrongWay: false, drift: 0, combo: 3 });
      hud.setCoins(120);
      ctx.bus.emit('ui:clock', { fuel: 0.4 });
      hud.toast('הדלק עומד להיגמר', 'bad', 60000);
      return true;
    }
    case 'credits': await openCredits(ctx); return true;
    case 'help': await openHelp(ctx); return true;
    case 'settings': await openSettings(ctx, () => undefined); return true;
    case 'title': await showTitle(ctx, { settings: () => Promise.resolve(), help: () => Promise.resolve(), credits: () => Promise.resolve(), codex: () => Promise.resolve() }); return true;
    case 'hero': await pickHero(ctx); return true;
    case 'say': await say(ctx, ['p.03', 'p.04', 'p.05']); return true;
    default: return false;
  }
}
