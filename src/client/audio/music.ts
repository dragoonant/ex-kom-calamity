// The music director (KB recipe step 8: calm / battle / tense / victory / defeat). `musicStateFor` is the pure rule
// from what the console shows; `MusicPlayer` crossfades between the generated tracks the bank decoded, loops a track
// by overlapping its own end with a fresh start (ElevenLabs tracks are not sample-accurate loops, so a 2 s crossfade
// hides the seam), plays the stingers once, and ducks while the sim is paused. No file, no music: the player stays
// silent and the report says so (KB recipe: adaptive layers stay silent until files exist).
import type { Screen } from '../store';
import type { Winner } from '../../engine';
import { dbToGain, type SampleBank, type TakeInfo } from './bank';

export type MusicState = 'calm' | 'battle' | 'tense' | 'victory' | 'defeat' | 'silent';

export const MUSIC_STATES: MusicState[] = ['calm', 'battle', 'tense', 'victory', 'defeat'];

/**
 * Title: calm (period optimism). Battle: battle, or tense once the switchboard marks the last hostiles (VIEW-5: the view carries `marks`, even empty, only then).
 * Report: a victory or defeat stinger, once. The gallery and the sound desk choose their own.
 */
export function musicStateFor(screen: Screen, marked: boolean, winner: Winner | null | undefined): MusicState {
  if (screen === 'title') return 'calm';
  if (screen === 'battle') return marked ? 'tense' : 'battle';
  if (screen === 'report') return winner === 'agency' ? 'victory' : 'defeat';
  return 'silent';
}

export interface MusicReport {
  state: MusicState;
  /** The take playing or scheduled, if any. */
  track: string | null;
  playing: boolean;
  ducked: boolean;
  volume: number;
}

export const CROSSFADE = 1.5;
export const LOOP_OVERLAP = 2.0;
export const DUCK = 0.35;

interface Voice {
  state: MusicState;
  take: TakeInfo;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

export class MusicPlayer {
  state: MusicState = 'silent';
  private bank: SampleBank;
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private voice: Voice | null = null;
  private volume: number;
  private ducked = false;
  private wanted: MusicState = 'silent';

  constructor(bank: SampleBank, volume = 0.6) {
    this.bank = bank;
    this.volume = volume;
  }

  /** Binds the player to a context and destination once (the director's master gain). */
  bind(ctx: BaseAudioContext, dest: AudioNode): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume * (this.ducked ? DUCK : 1);
    this.out.connect(dest);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyGain();
  }

  /** Paused: the console is quiet when time stands still, the music drops to a third. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.out || !this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0.0001, this.volume * (this.ducked ? DUCK : 1));
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(v, t, 0.15);
  }

  /** Asks for a state; starts it when the track is decoded and the context runs, crossfading from the one playing. */
  set(state: MusicState): void {
    this.wanted = state;
    this.tryStart();
  }

  /** Called by the director when the context unlocks or a decode lands: whatever is wanted but not playing starts. */
  tryStart(): void {
    const state = this.wanted;
    if (state === this.state && (this.voice || state === 'silent')) return;
    if (state === 'silent') {
      this.fadeOut();
      this.state = 'silent';
      return;
    }
    const ctx = this.ctx;
    if (!ctx || !this.out || ctx.state !== 'running') return;
    const entry = this.bank.index?.music[state];
    if (!entry) {
      // No file for this state: silence, not the old state.
      this.fadeOut();
      this.state = state;
      return;
    }
    const buf = this.bank.decoded(entry.take);
    if (!buf) return; // decode pending: the director calls again when it lands
    const t = ctx.currentTime;
    this.fadeOut(t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, dbToGain(entry.take.gainDb)), t + CROSSFADE);
    gain.connect(this.out);
    const voice: Voice = { state, take: entry.take, gain, sources: [], timer: null, stopped: false };
    this.voice = voice;
    this.state = state;
    this.schedule(voice, buf, t, entry.loop);
  }

  /** One pass of the track from `at`; a loop schedules the next pass to overlap its last LOOP_OVERLAP seconds. */
  private schedule(voice: Voice, buf: AudioBuffer, at: number, loop: boolean): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const length = Math.max(1, voice.take.end - voice.take.offset);
    if (loop && length > LOOP_OVERLAP * 2) {
      // Each pass has its own envelope: in over the overlap, out over the overlap at the end.
      const env = ctx.createGain();
      env.gain.setValueAtTime(voice.sources.length ? 0.0001 : 1, at);
      if (voice.sources.length) env.gain.exponentialRampToValueAtTime(1, at + LOOP_OVERLAP);
      env.gain.setValueAtTime(1, at + length - LOOP_OVERLAP);
      env.gain.exponentialRampToValueAtTime(0.0001, at + length);
      src.connect(env);
      env.connect(voice.gain);
      src.start(at, voice.take.offset, length);
      voice.sources.push(src);
      const nextAt = at + length - LOOP_OVERLAP;
      voice.timer = setTimeout(() => {
        if (voice.stopped) return;
        voice.sources = voice.sources.filter((s) => s !== src);
        this.schedule(voice, buf, nextAt, true);
      }, Math.max(0, (nextAt - ctx.currentTime - 0.5) * 1000));
    } else {
      src.connect(voice.gain);
      src.start(at, voice.take.offset, length);
      voice.sources.push(src);
      if (loop) {
        voice.timer = setTimeout(() => {
          if (voice.stopped) return;
          this.schedule(voice, buf, at + length, true);
        }, Math.max(0, (at + length - ctx.currentTime - 0.5) * 1000));
      } else {
        // A stinger ends on its own; the report says so.
        voice.timer = setTimeout(() => {
          if (voice.stopped) return;
          if (this.voice === voice) this.voice = null;
        }, Math.max(0, (at + length - ctx.currentTime) * 1000 + 100));
      }
    }
  }

  private fadeOut(at = this.ctx?.currentTime ?? 0): void {
    const v = this.voice;
    if (!v) return;
    v.stopped = true;
    if (v.timer) clearTimeout(v.timer);
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), at);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, at + CROSSFADE);
    for (const s of v.sources) {
      try {
        s.stop(at + CROSSFADE + 0.1);
      } catch {
        // already ended
      }
    }
    this.voice = null;
  }

  stop(): void {
    this.wanted = 'silent';
    this.fadeOut();
    this.state = 'silent';
  }

  report(): MusicReport {
    return { state: this.wanted, track: this.voice?.take.file ?? null, playing: !!this.voice, ducked: this.ducked, volume: this.volume };
  }
}
