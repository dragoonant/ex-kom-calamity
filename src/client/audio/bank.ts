// The sample bank (PLAN.md Q21: generated audio drops in behind the synth's names). It reads public/audio/index.json,
// written by tools/audio/measure.ts from the files tools/audio/generate.ts fetched from ElevenLabs, decodes each take
// once and plays it trimmed and normalized. Missing index, missing file or a failed decode means "no sample": the
// director then plays synth.ts, so a build without the files (the Artifact, which carries no media beside the page)
// still sounds. Nothing here touches the engine; pure functions where there is no AudioContext.
import type { SoundName } from './synth';
import type { MusicState } from './music';

export interface TakeInfo {
  /** Path under public/audio/. */
  file: string;
  seconds: number;
  /** Where to start (head silence trimmed) and stop (tail silence trimmed), in seconds; 0 and `seconds` for a loop. */
  offset: number;
  end: number;
  peakDb: number;
  rmsDb: number;
  /** Peak over RMS in dB; a real gunshot is 18 dB or more (crest factor 8), AI shots often come back near 6 (KB gotchas). */
  crestDb: number;
  /** Gain that brings the take's peak to the manifest's level, in dB (capped). */
  gainDb: number;
  /** Hash of the prompt and parameters the take was made from; generate.ts remakes a take whose hash changed. */
  promptHash: string;
}

export interface SfxEntry {
  level: number;
  loop: boolean;
  takes: TakeInfo[];
}

export interface MusicEntry {
  level: number;
  loop: boolean;
  take: TakeInfo;
}

export interface AudioIndex {
  version: 1;
  madeAt: string;
  sfx: Partial<Record<SoundName, SfxEntry>>;
  music: Partial<Record<MusicState, MusicEntry>>;
}

export type SampleStatus = 'idle' | 'loading' | 'ready' | 'missing';

export interface BankReport {
  status: SampleStatus;
  /** Takes decoded so far and takes listed (sfx and music together). */
  loaded: number;
  total: number;
  sfx: number;
  music: number;
}

/** Which take a variant picks: the director's running counter cycles them; a negative variant means the last take (raid-over: the lost building). */
export function takeFor(takes: number, variant: number): number {
  if (takes <= 0) return 0;
  if (variant < 0) return takes - 1;
  return variant % takes;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Where the index and the files live: next to the page (base './'), so Pages and the dev server both resolve it. */
export function audioUrl(file: string, baseURI: string): string {
  return new URL(`audio/${file}`, baseURI).toString();
}

export function parseIndex(text: string): AudioIndex | null {
  try {
    const v = JSON.parse(text) as Partial<AudioIndex>;
    if (v.version !== 1 || typeof v.sfx !== 'object' || typeof v.music !== 'object') return null;
    // The city set (docs/audio.md 6) sits under `city` so the battle's lists stay exact; the player reads one map.
    const city = (v as { city?: { sfx?: Record<string, unknown>; music?: Record<string, unknown> } }).city;
    const sfx = { ...(v.sfx ?? {}), ...((city?.sfx ?? {}) as AudioIndex['sfx']) };
    const music = { ...(v.music ?? {}), ...((city?.music ?? {}) as AudioIndex['music']) };
    return { version: 1, madeAt: String(v.madeAt ?? ''), sfx, music };
  } catch {
    return null;
  }
}

export interface SampleHandle {
  stop: (at: number) => void;
  take: TakeInfo;
}

export class SampleBank {
  index: AudioIndex | null = null;
  status: SampleStatus = 'idle';
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private baseURI: string;
  private fetcher: typeof fetch;

  constructor(baseURI: string, fetcher: typeof fetch = (...a) => fetch(...a)) {
    this.baseURI = baseURI;
    this.fetcher = fetcher;
  }

  /** Fetches the index once; a 404 or a bad file leaves the bank `missing` and every play on the synth. */
  async load(): Promise<AudioIndex | null> {
    if (this.index) return this.index;
    if (this.status === 'loading' || this.status === 'missing') return null;
    this.status = 'loading';
    try {
      const r = await this.fetcher(audioUrl('index.json', this.baseURI));
      if (!r.ok) throw new Error(String(r.status));
      const idx = parseIndex(await r.text());
      if (!idx) throw new Error('bad index');
      this.index = idx;
      this.status = 'ready';
      return idx;
    } catch {
      this.status = 'missing';
      return null;
    }
  }

  get sfxTakes(): TakeInfo[] {
    return Object.values(this.index?.sfx ?? {}).flatMap((e) => e?.takes ?? []);
  }

  get musicTakes(): TakeInfo[] {
    return Object.values(this.index?.music ?? {}).flatMap((e) => (e ? [e.take] : []));
  }

  /** Decodes one take; cached by file. Decoding needs no running context. */
  async buffer(ctx: BaseAudioContext, take: TakeInfo): Promise<AudioBuffer | null> {
    const have = this.buffers.get(take.file);
    if (have) return have;
    const inFlight = this.pending.get(take.file);
    if (inFlight) return inFlight;
    const p = (async () => {
      try {
        const r = await this.fetcher(audioUrl(take.file, this.baseURI));
        if (!r.ok) throw new Error(String(r.status));
        const bytes = await r.arrayBuffer();
        const buf = await ctx.decodeAudioData(bytes.slice(0));
        this.buffers.set(take.file, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.pending.delete(take.file);
      }
    })();
    this.pending.set(take.file, p);
    return p;
  }

  /** Decodes every sfx take (small) and, when asked, the music too. */
  async preload(ctx: BaseAudioContext, music = true): Promise<void> {
    if (!(await this.load())) return;
    const takes = music ? [...this.sfxTakes, ...this.musicTakes] : this.sfxTakes;
    await Promise.all(takes.map((t) => this.buffer(ctx, t)));
  }

  /** True when the name has takes and they are all decoded. */
  has(name: SoundName): boolean {
    const e = this.index?.sfx[name];
    return !!e && e.takes.length > 0 && e.takes.every((t) => this.buffers.has(t.file));
  }

  hasMusic(state: MusicState): boolean {
    const e = this.index?.music[state];
    return !!e && this.buffers.has(e.take.file);
  }

  decoded(take: TakeInfo): AudioBuffer | undefined {
    return this.buffers.get(take.file);
  }

  /** Plays one take of `name` into `out` at `t0`, trimmed and normalized; a loop (ambient) returns a handle that fades it out. */
  play(ctx: BaseAudioContext, out: AudioNode, name: SoundName, t0: number, variant = 0): SampleHandle | null {
    const e = this.index?.sfx[name];
    if (!e || !e.takes.length) return null;
    const take = e.takes[takeFor(e.takes.length, variant)]!;
    const buf = this.buffers.get(take.file);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const peak = dbToGain(take.gainDb);
    g.connect(out);
    src.connect(g);
    if (e.loop) {
      src.loop = true;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 1.5);
      src.start(t0);
      return {
        take,
        stop: (at: number) => {
          g.gain.cancelScheduledValues(at);
          g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), at);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
          src.stop(at + 0.7);
        },
      };
    }
    g.gain.value = peak;
    const length = Math.max(0.01, take.end - take.offset);
    src.start(t0, take.offset, length);
    return { take, stop: (at: number) => src.stop(at) };
  }

  report(): BankReport {
    const sfx = this.sfxTakes;
    const music = this.musicTakes;
    const all = [...sfx, ...music];
    return { status: this.status, loaded: all.filter((t) => this.buffers.has(t.file)).length, total: all.length, sfx: sfx.length, music: music.length };
  }
}
