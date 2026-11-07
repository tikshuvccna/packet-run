/**
 * All the sound of the game, made in the browser (no files to download): a generative sea score that changes with
 * the place (calm sea, battle, storm, lighthouse, lesson, boss), and small synthesized effects. Music and effects have their own volume and their own off switch.
 */
export type Mood = 'menu' | 'garage' | 'lesson' | 'game' | 'city' | 'race' | 'boss' | 'ending';

export interface SoundSettings { musicOn: boolean; sfxOn: boolean; musicVol: number; sfxVol: number }

interface MoodDef {
  /** Semitone steps above the root that the tune walks on. */
  scale: number[];
  root: number;
  bpm: number;
  /** Chord roots (semitones) the pad cycles through, each as a triad of the scale. */
  chords: number[][];
  /** Chance that a beat plays a note. */
  density: number;
  voice: 'pluck' | 'bell' | 'soft' | 'box';
  /** Octave shift of the tune. */
  octave: number;
  pad: number;
  /** 0 none; low rumble/pulse for tension. */
  pulse?: number;
  noise?: { kind: 'wind' | 'waves'; level: number };
  /** Music that must not pull attention (lessons, tasks) is played at this share of the music volume. */
  share: number;
}

const MAJ_PENT = [0, 2, 4, 7, 9];
const MIN_PENT = [0, 3, 5, 7, 10];

export const MOODS: Record<Mood, MoodDef> = {
  menu: { scale: MAJ_PENT, root: 220, bpm: 96, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]], density: 0.5, voice: 'pluck', octave: 1, pad: 0.4, share: 1 },
  garage: { scale: [0, 2, 4, 5, 7, 9, 10], root: 261.6, bpm: 88, chords: [[0, 4, 7], [5, 9, 12], [10, 14, 17], [0, 4, 7]], density: 0.5, voice: 'box', octave: 0, pad: 0.3, share: 0.85 },
  lesson: { scale: MAJ_PENT, root: 220, bpm: 56, chords: [[0, 7, 12], [-3, 4, 9], [-5, 2, 7], [0, 7, 12]], density: 0.07, voice: 'soft', octave: 1, pad: 0.45, share: 0.4 },
  game: { scale: MAJ_PENT, root: 261.6, bpm: 108, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]], density: 0.55, voice: 'pluck', octave: 1, pad: 0.25, share: 0.6 },
  city: { scale: MAJ_PENT, root: 246.9, bpm: 104, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]], density: 0.5, voice: 'pluck', octave: 1, pad: 0.35, pulse: 0.18, share: 0.7 },
  race: { scale: MIN_PENT, root: 164.8, bpm: 132, chords: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [-2, 5, 10]], density: 0.62, voice: 'pluck', octave: 1, pad: 0.4, pulse: 0.5, share: 0.8 },
  boss: { scale: MIN_PENT, root: 130.8, bpm: 140, chords: [[0, 7, 12], [-2, 5, 10], [-4, 3, 8], [-2, 5, 10]], density: 0.65, voice: 'pluck', octave: 1, pad: 0.55, pulse: 0.6, share: 0.85 },
  ending: { scale: MAJ_PENT, root: 261.6, bpm: 84, chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [0, 4, 7]], density: 0.45, voice: 'bell', octave: 0, pad: 0.65, share: 1 },
};

export type Sfx =
  | 'click' | 'good' | 'bad' | 'win' | 'talk' | 'coin' | 'prize'
  | 'horn' | 'boost' | 'skid' | 'crash' | 'gate_right' | 'gate_wrong' | 'item_throw' | 'item_hit' | 'jump_land' | 'finish' | 'countdown' | 'go' | 'fanfare';

const DEFAULTS: SoundSettings = { musicOn: true, sfxOn: true, musicVol: 0.5, sfxVol: 0.8 };

const mtof = (root: number, semis: number): number => root * Math.pow(2, semis / 12);

export class AudioHub {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private delay!: DelayNode;
  private noiseBuf: AudioBuffer | null = null;
  settings: SoundSettings = { ...DEFAULTS };
  private moodNow: Mood | null = null;
  private layer: { stop(): void; gain: GainNode } | null = null;
  // what decides the mood, strongest first
  private base: Mood = 'menu';
  private overlays: Mood[] = [];
  private boss = false;
  private held = false;
  private ducked = false;
  /** Moods that have a recorded track in assets/music (listed in index.json); the rest use the generated score. */
  private recorded = new Set<string>();

  configure(s: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.applyVolumes();
  }

  /** Browsers only allow sound after a tap: call this from the first click. */
  unlock(): void {
    if (!this.ctx) this.build();
    void this.ctx?.resume();
    this.resolve();
  }

  private build(): void {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    // a gentle limiter, so layered notes and effects can never clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    this.master.connect(limiter).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // a soft echo for the music, so a few notes feel like a place
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.musicBus);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.loadRecorded();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.musicOn && !this.held ? this.settings.musicVol * (this.ducked ? 0.3 : 1) : 0, t, 0.15);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxOn ? this.settings.sfxVol : 0, t, 0.05);
  }

  // ----- mood: who decides -----
  setBase(m: Mood): void { this.base = m; this.resolve(); }
  pushOverlay(m: Mood): () => void {
    this.overlays.push(m);
    this.resolve();
    return () => { const i = this.overlays.lastIndexOf(m); if (i >= 0) this.overlays.splice(i, 1); this.resolve(); };
  }
  setBoss(on: boolean): void { this.boss = on; this.resolve(); }
  /** Lower the music while a recorded voice line is playing. */
  duck(on: boolean): void { this.ducked = on; this.applyVolumes(); }
  /** Silence the music while a video plays. */
  hold(on: boolean): void { this.held = on; this.applyVolumes(); }

  private resolve(): void {
    const top = this.overlays[this.overlays.length - 1];
    this.playMood(this.boss ? 'boss' : top ?? this.base);
  }

  /** Simple API for the UI: the base mood of the current screen. */
  mood(m: Mood | string): void { if (m in MOODS) this.setBase(m as Mood); }
  setVolumes(): void { this.applyVolumes(); }

  get currentMood(): Mood | null { return this.moodNow; }

  // ----- the score -----
  private wanted: Mood = 'menu';

  private playMood(m: Mood): void {
    this.wanted = m;
    const ctx = this.ctx;
    if (!ctx || m === this.moodNow) return;
    const old = this.layer;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      window.setTimeout(() => old.stop(), 3500);
    }
    this.moodNow = m;
    this.layer = this.recorded.has(m) ? this.startRecorded(m, MOODS[m].share) : this.startLayer(MOODS[m]);
  }

  /** A recorded track for the mood, looped and streamed (not decoded), through the same music bus. */
  private startRecorded(m: Mood, share: number): { stop(): void; gain: GainNode } {
    const ctx = this.ctx as AudioContext;
    const a = new Audio(`${import.meta.env.BASE_URL}assets/music/${m}.mp3`);
    a.loop = true;
    const src = ctx.createMediaElementSource(a);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(share * 0.7, ctx.currentTime, 1.2);
    src.connect(gain).connect(this.musicBus);
    void a.play().catch(() => { /* the generated score is not restarted: the next mood change tries again */ });
    return {
      gain,
      stop: () => { a.pause(); src.disconnect(); gain.disconnect(); },
    };
  }

  /** A short recorded jingle (assets/music/win.mp3) for a finished lesson or game; false when there is none. */
  private jingle(name: string): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.recorded.has(name)) return false;
    const a = new Audio(`${import.meta.env.BASE_URL}assets/music/${name}.mp3`);
    const src = ctx.createMediaElementSource(a);
    src.connect(this.sfxBus);
    void a.play().catch(() => undefined);
    a.addEventListener('ended', () => src.disconnect());
    return true;
  }

  private loadRecorded(): void {
    void fetch(`${import.meta.env.BASE_URL}assets/music/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ ids?: string[] }>) : { ids: [] }))
      .then((j) => {
        this.recorded = new Set(j.ids ?? []);
        // a track that arrived late replaces the generated score that already started
        if (this.moodNow && this.recorded.has(this.moodNow)) { this.moodNow = null; this.resolve(); }
      })
      .catch(() => undefined);
  }

  private startLayer(def: MoodDef): { stop(): void; gain: GainNode } {
    const ctx = this.ctx as AudioContext;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(def.share, ctx.currentTime, 1.2);
    gain.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.55;
    gain.connect(send).connect(this.delay);
    const nodes: AudioNode[] = [gain, send];
    const stops: Array<() => void> = [];
    const beat = 60 / def.bpm;
    let step = 0;
    let chordIdx = 0;
    let next = ctx.currentTime + 0.2;
    let pos = Math.floor(Math.random() * def.scale.length);

    const padChord = (when: number, chord: number[]): void => {
      const len = beat * 8;
      for (const semi of chord) {
        for (const detune of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = def.voice === 'bell' ? 'sine' : 'triangle';
          o.frequency.value = mtof(def.root / 2, semi);
          o.detune.value = detune;
          const g = ctx.createGain();
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(0.05 * def.pad, when + len * 0.35);
          g.gain.linearRampToValueAtTime(0, when + len + 1.5);
          o.connect(lp).connect(g).connect(gain);
          o.start(when);
          o.stop(when + len + 1.8);
        }
      }
    };

    const note = (when: number, freq: number, vel: number): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const dur = def.voice === 'soft' ? beat * 2.2 : def.voice === 'bell' ? beat * 3 : def.voice === 'box' ? beat * 1.4 : beat * 1.1;
      o.type = def.voice === 'bell' || def.voice === 'box' ? 'sine' : def.voice === 'soft' ? 'triangle' : 'triangle';
      o.frequency.value = freq;
      const peak = 0.11 * vel;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + (def.voice === 'soft' ? 0.18 : 0.012));
      g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
      o.connect(g).connect(gain);
      o.start(when);
      o.stop(when + dur + 0.1);
      if (def.voice === 'bell' || def.voice === 'box') {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'sine';
        o2.frequency.value = freq * 2.01;
        g2.gain.setValueAtTime(0, when);
        g2.gain.linearRampToValueAtTime(peak * 0.35, when + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0005, when + dur * 0.5);
        o2.connect(g2).connect(gain);
        o2.start(when);
        o2.stop(when + dur);
      }
    };

    const pulse = (when: number): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, when);
      o.frequency.exponentialRampToValueAtTime(48, when + 0.18);
      g.gain.setValueAtTime(0.16 * (def.pulse ?? 0), when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
      o.connect(g).connect(gain);
      o.start(when);
      o.stop(when + 0.3);
    };

    if (def.noise && this.noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.value = def.noise.kind === 'wind' ? 520 : 900;
      const ng = ctx.createGain();
      ng.gain.value = def.noise.level;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = def.noise.kind === 'wind' ? 0.11 : 0.09;
      const lg = ctx.createGain();
      lg.gain.value = def.noise.level * 0.7;
      lfo.connect(lg).connect(ng.gain);
      src.connect(bp).connect(ng).connect(gain);
      src.start();
      lfo.start();
      stops.push(() => { try { src.stop(); lfo.stop(); } catch { /* already stopped */ } });
    }

    const tick = (): void => {
      // schedule everything that falls in the next second
      while (next < ctx.currentTime + 1.0) {
        if (step % 8 === 0) {
          padChord(next, (def.chords[chordIdx % def.chords.length] as number[]).map((s) => s));
          chordIdx++;
        }
        if (def.pulse && step % 2 === 0) pulse(next);
        if (Math.random() < def.density) {
          // walk gently on the scale: mostly small steps, sometimes a leap
          pos = Math.max(0, Math.min(def.scale.length * 2 - 1, pos + (Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() < 0.5 ? -3 : 3))));
          const semis = (def.scale[pos % def.scale.length] as number) + 12 * Math.floor(pos / def.scale.length) + 12 * def.octave;
          note(next, mtof(def.root, semis), 0.55 + Math.random() * 0.45);
        }
        next += beat;
        step++;
      }
    };
    tick();
    const timer = window.setInterval(tick, 400);
    return {
      gain,
      stop: () => {
        window.clearInterval(timer);
        stops.forEach((s) => s());
        for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } }
      },
    };
  }

  // ----- effects -----
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfxOn) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, from: number, to: number, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.settings.sfxOn) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ----- engine (continuous) -----
  private eng: { o1: OscillatorNode; o2: OscillatorNode; lp: BiquadFilterNode; g: GainNode; skid: GainNode; skidSrc: AudioBufferSourceNode; boost: GainNode } | null = null;

  /** Updates the engine voice from the physics (rpm 0..1, speed m/s). Call at ~30 Hz while driving. */
  engine(rpm: number, speed: number, boost: boolean, skid: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    if (!this.eng) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0;
      const mix = ctx.createGain(); mix.gain.value = 0.5;
      o1.connect(lp); o2.connect(mix).connect(lp); lp.connect(g).connect(this.sfxBus);
      const skidSrc = ctx.createBufferSource(); skidSrc.buffer = this.noiseBuf; skidSrc.loop = true;
      const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1800; sf.Q.value = 1.2;
      const skidG = ctx.createGain(); skidG.gain.value = 0;
      skidSrc.connect(sf).connect(skidG).connect(this.sfxBus);
      const boostG = ctx.createGain(); boostG.gain.value = 0;
      skidSrc.connect(boostG).connect(this.sfxBus);
      o1.start(); o2.start(); skidSrc.start();
      this.eng = { o1, o2, lp, g, skid: skidG, skidSrc, boost: boostG };
    }
    const e = this.eng; const t = ctx.currentTime;
    const f = 42 + rpm * 150;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(350 + rpm * 1400, t, 0.08);
    e.g.gain.setTargetAtTime(this.settings.sfxOn ? 0.05 + Math.min(1, speed / 50) * 0.05 + rpm * 0.03 : 0, t, 0.08);
    e.skid.gain.setTargetAtTime(this.settings.sfxOn ? Math.min(1, skid) * 0.08 : 0, t, 0.05);
    e.boost.gain.setTargetAtTime(this.settings.sfxOn && boost ? 0.05 : 0, t, 0.05);
  }

  engineOff(): void {
    const ctx = this.ctx;
    if (!ctx || !this.eng) return;
    const t = ctx.currentTime;
    this.eng.g.gain.setTargetAtTime(0, t, 0.1);
    this.eng.skid.gain.setTargetAtTime(0, t, 0.1);
    this.eng.boost.gain.setTargetAtTime(0, t, 0.1);
  }

  sfx(name: Sfx | string): void {
    if (!this.ctx || !this.settings.sfxOn) return;
    if (name === 'fanfare' && this.jingle('win')) return;
    switch (name) {
      case 'click': this.tone(660, 0.07, 'triangle', 0.12); break;
      case 'good': [523, 784].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.15, i * 0.08)); break;
      case 'bad': this.tone(220, 0.25, 'triangle', 0.16, 0, 150); break;
      case 'win': case 'fanfare': case 'finish': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.16, i * 0.12)); this.tone(1319, 0.8, 'sine', 0.13, 0.6); break;
      case 'prize': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.17, i * 0.1)); break;
      case 'talk': this.tone(420 + Math.random() * 120, 0.05, 'square', 0.04); break;
      case 'coin': this.tone(1318, 0.09, 'square', 0.07); this.tone(1760, 0.18, 'square', 0.06, 0.07); break;
      case 'horn': this.tone(360, 0.35, 'sawtooth', 0.08); this.tone(450, 0.35, 'sawtooth', 0.07); break;
      case 'boost': this.burst(0.5, 0.18, 400, 3000); this.tone(200, 0.5, 'sawtooth', 0.08, 0, 700); break;
      case 'skid': this.burst(0.3, 0.1, 2200, 1400); break;
      case 'crash': this.burst(0.4, 0.3, 900, 120); this.tone(90, 0.3, 'triangle', 0.25, 0, 50); break;
      case 'gate_right': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.16, i * 0.06)); break;
      case 'gate_wrong': this.tone(200, 0.3, 'sawtooth', 0.1, 0, 110); break;
      case 'item_throw': this.burst(0.15, 0.12, 700, 300); this.tone(500, 0.12, 'sine', 0.1, 0, 250); break;
      case 'item_hit': this.tone(700, 0.15, 'square', 0.1, 0, 200); this.burst(0.2, 0.1, 1500, 400); break;
      case 'jump_land': this.burst(0.25, 0.22, 600, 150); this.tone(80, 0.2, 'sine', 0.2, 0, 50); break;
      case 'countdown': this.tone(600, 0.18, 'square', 0.1); break;
      case 'go': this.tone(900, 0.5, 'square', 0.12); break;
    }
  }
}

export const audio = new AudioHub();

