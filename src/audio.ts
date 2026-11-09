/**
 * Minimal synthesized sound effects (Web Audio). No audio files, so nothing to
 * download. Browsers only allow audio after a user gesture, so `unlock()` is
 * called from the first tap.
 */

const MUTE_KEY = 'sandfall.muted';
/** C major pentatonic, for the rising "emptied" chimes. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
/** Collectors emptied within this many seconds of each other count as a streak. */
const STREAK_WINDOW = 3;
/** Minimum gap between sand-trickle sounds, so eating doesn't become a hiss. */
const EAT_GAP = 0.05;

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastEat = 0;
  private streak = 0;
  private lastEmptied = -Infinity;
  muted = localStorage.getItem(MUTE_KEY) === '1';

  /** Creates or resumes the audio context; call from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    return this.muted;
  }

  /** New level: the emptied-chime streak starts over. */
  reset(): void {
    this.streak = 0;
    this.lastEmptied = -Infinity;
  }

  deploy(): void {
    this.tone(520, 0.08, { slideTo: 780, gain: 0.25 });
    this.vibrate(8);
  }

  /** Grains eaten this frame; turned into a faint, rate-limited trickle. */
  eat(count: number): void {
    const ctx = this.ready();
    if (!ctx || count === 0 || ctx.currentTime - this.lastEat < EAT_GAP) return;
    this.lastEat = ctx.currentTime;
    this.hiss(0.035, Math.min(0.12, 0.03 + count * 0.008), 2500 + Math.random() * 2500);
  }

  emptied(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.streak = ctx.currentTime - this.lastEmptied < STREAK_WINDOW ? this.streak + 1 : 0;
    this.lastEmptied = ctx.currentTime;
    const freq = SCALE[Math.min(this.streak, SCALE.length - 1)]!;
    this.tone(freq, 0.25, { type: 'triangle', gain: 0.3 });
    this.tone(freq * 2, 0.15, { gain: 0.08, delay: 0.02 });
  }

  parked(): void {
    this.tone(220, 0.12, { slideTo: 160, gain: 0.3 });
  }

  refused(): void {
    this.tone(130, 0.08, { type: 'square', gain: 0.08 });
  }

  win(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.25, delay: i * 0.09 }));
    this.vibrate([15, 40, 15]);
  }

  lose(): void {
    this.tone(392, 0.25, { type: 'triangle', gain: 0.22 });
    this.tone(311, 0.45, { type: 'triangle', gain: 0.22, delay: 0.22, slideTo: 260 });
  }

  /** One ding per star as it appears on the results card; higher for each star. */
  star(index: number): void {
    this.tone([783.99, 987.77, 1174.66][index] ?? 1174.66, 0.35, { type: 'triangle', gain: 0.25 });
  }

  /** Haptics on phones that support it (Android); off when muted. */
  private vibrate(pattern: number | number[]): void {
    if (!this.muted) navigator.vibrate?.(pattern);
  }

  private ready(): AudioContext | null {
    return this.muted || !this.ctx || this.ctx.state !== 'running' ? null : this.ctx;
  }

  private tone(freq: number, duration: number, { type = 'sine', gain = 0.2, slideTo, delay = 0 }: ToneOptions = {}): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    // Fast attack, exponential decay: a soft pluck rather than a beep.
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private hiss(duration: number, gain: number, freq: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(t, Math.random() * 0.9, duration);
  }
}
