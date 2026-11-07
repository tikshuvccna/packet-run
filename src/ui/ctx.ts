import type { Bus } from '../core/bus';
import type { SaveStore } from '../core/save';

export interface AudioApi {
  sfx(name: string): void;
  mood(name: string): void;
  unlock(): void;
  setVolumes(): void;
  engine(rpm: number, speed: number, boost: boolean, skid: number): void;
  engineOff(): void;
}

/** What every screen needs. */
export interface Ctx {
  save: SaveStore;
  bus: Bus;
  audio: AudioApi;
}

export function portraitUrl(who: string, mood = 'neutral'): string {
  return `assets/portraits/${who}_${mood}.png`;
}

/** A portrait image that quietly disappears when the file is missing. */
export function portraitImg(who: string, mood = 'neutral', cls = 'portrait'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.src = portraitUrl(who, mood);
  img.addEventListener('error', () => img.classList.add('missing'));
  return img;
}
