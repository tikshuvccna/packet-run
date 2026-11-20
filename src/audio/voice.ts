/**
 * Silly recorded voices for dialogue lines (public/assets/voice/<lineId>.mp3, made by tools/make_voices.py).
 * A line without a file stays silent, so the game works with no voices at all. The music is lowered while a voice plays.
 * Voices follow the sound-effects switch and volume.
 */
import { audio } from './audio';

const base = (): string => `${import.meta.env.BASE_URL}assets/voice/`;
let known: Set<string> | null = null;
let loading: Promise<void> | null = null;
let current: HTMLAudioElement | null = null;
let request = 0;

function load(): Promise<void> {
  loading ??= fetch(`${base()}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ ids?: string[] }>) : { ids: [] }))
    .then((j) => { known = new Set(j.ids ?? []); })
    .catch(() => { known = new Set(); });
  return loading;
}

export function stopVoice(): void {
  request++;
  if (!current) return;
  current.pause();
  current = null;
  audio.duck(false);
}

/** Plays the voice of a line, replacing the one still playing. Never throws. */
export function playVoice(id: string): void {
  stopVoice();
  const mine = request;
  void load().then(() => {
    // a newer line, or the end of the dialogue, may have come while the index was loading
    if (mine !== request || !known?.has(id) || !audio.settings.sfxOn) return;
    const a = new Audio(`${base()}${id}.mp3`);
    a.volume = Math.max(0, Math.min(1, audio.settings.sfxVol));
    const done = (): void => { if (current === a) { current = null; audio.duck(false); } };
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    current = a;
    audio.duck(true);
    void a.play().catch(done);
  });
}
