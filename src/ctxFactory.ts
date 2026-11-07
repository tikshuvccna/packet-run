import { Bus } from './core/bus';
import { SaveStore } from './core/save';
import { audio } from './audio/audio';
import type { Ctx } from './ui/ctx';

export function makeCtx(): Ctx {
  const save = new SaveStore();
  const bus = new Bus();
  const apply = (): void => {
    const s = save.data.settings;
    audio.configure({ musicOn: s.musicOn, sfxOn: s.sfxOn, musicVol: s.musicVol, sfxVol: s.sfxVol });
  };
  apply();
  const unlock = (): void => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return {
    save, bus,
    audio: { sfx: (n) => audio.sfx(n), mood: (m) => audio.mood(m), unlock: () => audio.unlock(), setVolumes: apply, engine: (r, sp, b, sk) => audio.engine(r, sp, b, sk), engineOff: () => audio.engineOff() },
  };
}
