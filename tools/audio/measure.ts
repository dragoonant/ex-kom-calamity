// Measures the generated audio (KB recipe step 8: "measure-audio trims"; gotchas: AI gunshots come back with a crest
// factor near 2, real ones 8 to 20, so measure and layer). ffmpeg decodes each file to mono float samples; this
// computes peak, RMS, crest, head and tail silence, and the gain that brings the peak to the manifest's level, and
// writes public/audio/index.json, the one file the client reads (src/client/audio/bank.ts).
//   npm run audio:measure            rewrite the index from the files on disk
// Files the manifest names but the disk lacks are left out of the index: the client falls back to the synth.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioIndex, MusicEntry, SfxEntry, TakeInfo } from '../../src/client/audio/bank';
import { CITY_MUSIC, CITY_SFX, MUSIC, SFX, musicFile, sfxFile, sfxPrompt, type CityMusicState, type CitySoundName, type MusicSpec, type SfxSpec, MUSIC_MODEL, SFX_MODEL } from './manifest';

export const AUDIO_DIR = join(process.cwd(), 'public', 'audio');
export const INDEX_PATH = join(AUDIO_DIR, 'index.json');

/** Silence threshold for the trims, in dBFS. */
const FLOOR_DB = -40;
/** Normalization never lifts a quiet take by more than this. */
const MAX_LIFT_DB = 12;

export interface Stats {
  seconds: number;
  peakDb: number;
  rmsDb: number;
  crestDb: number;
  /** First and last sample above the floor, in seconds. */
  head: number;
  tail: number;
}

const db = (x: number): number => (x <= 0 ? -120 : 20 * Math.log10(x));

export function statsOf(samples: Float32Array, rate: number): Stats {
  let peak = 0;
  let sum = 0;
  const floor = Math.pow(10, FLOOR_DB / 20);
  let head = -1;
  let tail = -1;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
    sum += a * a;
    if (a > floor) {
      if (head < 0) head = i;
      tail = i;
    }
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  const seconds = samples.length / rate;
  return {
    seconds,
    peakDb: db(peak),
    rmsDb: db(rms),
    crestDb: rms > 0 ? db(peak / rms) : 0,
    head: head < 0 ? 0 : head / rate,
    tail: tail < 0 ? seconds : tail / rate,
  };
}

export function decode(file: string): { samples: Float32Array; rate: number } {
  const rate = 44100;
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'], { maxBuffer: 1 << 30 });
  const samples = new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
  return { samples: Float32Array.from(samples), rate };
}

/** A short stable hash of the prompt and the parameters, so a changed prompt remakes the take. */
export function promptHash(parts: unknown[]): string {
  const text = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function sfxHash(spec: SfxSpec<string>, take: number): string {
  return promptHash([SFX_MODEL, sfxPrompt(spec, take), spec.seconds, spec.influence, !!spec.loop]);
}

export function musicHash(spec: MusicSpec<string>): string {
  return promptHash([MUSIC_MODEL, spec.prompt, spec.seconds]);
}

export function takeInfo(file: string, level: number, loop: boolean, hash: string): TakeInfo | null {
  const path = join(AUDIO_DIR, file);
  if (!existsSync(path)) return null;
  const { samples, rate } = decode(path);
  const s = statsOf(samples, rate);
  const offset = loop ? 0 : Math.max(0, s.head - 0.005);
  const end = loop ? s.seconds : Math.min(s.seconds, s.tail + 0.05);
  const gainDb = Math.min(MAX_LIFT_DB, level - s.peakDb);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { file, seconds: r(s.seconds), offset: r(offset), end: r(end), peakDb: r(s.peakDb), rmsDb: r(s.rmsDb), crestDb: r(s.crestDb), gainDb: r(gainDb), promptHash: hash };
}

/** The index with the city layer's section (docs/audio.md section 6). The client's parseIndex keeps only `sfx` and
 *  `music` today, so `city` waits there, measured, until a city screen reads it. */
export interface CityIndexSection {
  sfx: Partial<Record<CitySoundName, SfxEntry>>;
  music: Partial<Record<CityMusicState, MusicEntry>>;
}
export type FullIndex = AudioIndex & { city?: CityIndexSection };

/** How a loop's end meets its start: the sample jump at the seam and the RMS of the last and first 50 ms, in dB. */
export function seamOf(samples: Float32Array, rate: number): { jump: number; headRmsDb: number; tailRmsDb: number } {
  const n = Math.max(1, Math.min(samples.length, Math.round(rate * 0.05)));
  const rms = (from: number) => {
    let sum = 0;
    for (let i = from; i < from + n; i++) sum += samples[i]! * samples[i]!;
    return db(Math.sqrt(sum / n));
  };
  if (samples.length < 2) return { jump: 0, headRmsDb: -120, tailRmsDb: -120 };
  return { jump: Math.abs(samples[samples.length - 1]! - samples[0]!), headRmsDb: rms(0), tailRmsDb: rms(samples.length - n) };
}

export function readIndex(): FullIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as FullIndex;
  } catch {
    return null;
  }
}

/** Measures every file the manifest names that exists and writes the index. Returns it. */
export function writeIndex(log: (line: string) => void = () => undefined): FullIndex {
  const index: FullIndex = { version: 1, madeAt: new Date().toISOString().slice(0, 10), sfx: {}, music: {} };
  for (const spec of SFX) {
    const takes: TakeInfo[] = [];
    for (let i = 0; i < spec.takes; i++) {
      const t = takeInfo(sfxFile(spec.name, i), spec.level, !!spec.loop, sfxHash(spec, i));
      if (t) takes.push(t);
    }
    if (takes.length) {
      const e: SfxEntry = { level: spec.level, loop: !!spec.loop, takes };
      index.sfx[spec.name] = e;
      for (const t of takes) log(`${t.file.padEnd(28)} ${t.seconds.toFixed(2)} s  peak ${t.peakDb.toFixed(1)} dB  crest ${t.crestDb.toFixed(1)} dB  trim ${t.offset.toFixed(3)}..${t.end.toFixed(3)}  gain ${t.gainDb >= 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB${spec.name.startsWith('fire-') && t.crestDb < 18 ? '  (crest below 18 dB: the director layers the synth transient)' : ''}`);
    }
  }
  for (const spec of MUSIC) {
    const t = takeInfo(musicFile(spec.state), spec.level, spec.loop, musicHash(spec));
    if (t) {
      const e: MusicEntry = { level: spec.level, loop: spec.loop, take: t };
      index.music[spec.state] = e;
      log(`${t.file.padEnd(28)} ${t.seconds.toFixed(1)} s  peak ${t.peakDb.toFixed(1)} dB  rms ${t.rmsDb.toFixed(1)} dB  gain ${t.gainDb >= 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB`);
    }
  }
  const city: CityIndexSection = { sfx: {}, music: {} };
  const seamLog = (file: string) => {
    const { samples, rate } = decode(join(AUDIO_DIR, file));
    const m = seamOf(samples, rate);
    log(`  seam ${file}: jump ${m.jump.toFixed(4)}, last 50 ms ${m.tailRmsDb.toFixed(1)} dB, first 50 ms ${m.headRmsDb.toFixed(1)} dB`);
  };
  for (const spec of CITY_SFX) {
    const takes: TakeInfo[] = [];
    for (let i = 0; i < spec.takes; i++) {
      const t = takeInfo(sfxFile(spec.name, i), spec.level, !!spec.loop, sfxHash(spec, i));
      if (t) takes.push(t);
    }
    if (takes.length) {
      city.sfx[spec.name] = { level: spec.level, loop: !!spec.loop, takes };
      for (const t of takes) {
        log(`${t.file.padEnd(32)} ${t.seconds.toFixed(2)} s  peak ${t.peakDb.toFixed(1)} dB  rms ${t.rmsDb.toFixed(1)} dB  crest ${t.crestDb.toFixed(1)} dB  trim ${t.offset.toFixed(3)}..${t.end.toFixed(3)}  gain ${t.gainDb >= 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB`);
        if (spec.loop) seamLog(t.file);
      }
    }
  }
  for (const spec of CITY_MUSIC) {
    const t = takeInfo(musicFile(spec.state), spec.level, spec.loop, musicHash(spec));
    if (t) {
      city.music[spec.state] = { level: spec.level, loop: spec.loop, take: t };
      log(`${t.file.padEnd(32)} ${t.seconds.toFixed(1)} s  peak ${t.peakDb.toFixed(1)} dB  rms ${t.rmsDb.toFixed(1)} dB  crest ${t.crestDb.toFixed(1)} dB  gain ${t.gainDb >= 0 ? '+' : ''}${t.gainDb.toFixed(1)} dB`);
      if (spec.loop) seamLog(t.file);
    }
  }
  if (Object.keys(city.sfx).length || Object.keys(city.music).length) index.city = city;
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
  return index;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/audio/measure.ts');
if (isMain) {
  const idx = writeIndex((l) => console.log(l));
  const n = Object.values(idx.sfx).reduce((a, e) => a + (e?.takes.length ?? 0), 0);
  const cn = Object.values(idx.city?.sfx ?? {}).reduce((a, e) => a + (e?.takes.length ?? 0), 0);
  console.log(`index: ${n} sfx takes under ${Object.keys(idx.sfx).length} names, ${Object.keys(idx.music).length} music states; city: ${cn} sfx takes under ${Object.keys(idx.city?.sfx ?? {}).length} names, ${Object.keys(idx.city?.music ?? {}).length} music states -> public/audio/index.json`);
}
