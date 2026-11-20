// Audio settings (PLAN.md Q19 default): volume and mute live in the browser under `ekc-audio`, apart from the save
// envelope, because they belong to the player's machine and not to a raid. Pass 2 adds the music volume and the
// source switch (`auto`: generated samples where a file exists, else the synth; `synth`: the pass 1 synth only, so
// the owner can A/B them on sounds.html). Plain functions over a Storage-like object so tests drive them without a DOM.
import type { StorageLike } from '../save';

export const AUDIO_KEY = 'ekc-audio';

export type AudioSource = 'auto' | 'synth';

export interface AudioSettings {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  /** Music level, 0 to 1, under the master volume. */
  music: number;
  source: AudioSource;
}

export const DEFAULT_AUDIO: AudioSettings = { volume: 0.7, muted: false, music: 0.6, source: 'auto' };

const unit = (v: unknown, fallback: number): number => (typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback);

export function readAudioSettings(storage: StorageLike | null): AudioSettings {
  if (!storage) return { ...DEFAULT_AUDIO };
  try {
    const text = storage.getItem(AUDIO_KEY);
    if (!text) return { ...DEFAULT_AUDIO };
    const v = JSON.parse(text) as Partial<AudioSettings>;
    return {
      volume: unit(v.volume, DEFAULT_AUDIO.volume),
      muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_AUDIO.muted,
      music: unit(v.music, DEFAULT_AUDIO.music),
      source: v.source === 'synth' ? 'synth' : 'auto',
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function writeAudioSettings(storage: StorageLike | null, s: AudioSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUDIO_KEY, JSON.stringify({ volume: Math.min(1, Math.max(0, s.volume)), muted: !!s.muted, music: Math.min(1, Math.max(0, s.music)), source: s.source === 'synth' ? 'synth' : 'auto' }));
    return true;
  } catch {
    return false;
  }
}
