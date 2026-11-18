// Audio settings (PLAN.md Q19 default): volume and mute live in the browser under `ekc-audio`, apart from the save
// envelope, because they belong to the player's machine and not to a raid. Plain functions over a Storage-like
// object so tests drive them without a DOM.
import type { StorageLike } from '../save';

export const AUDIO_KEY = 'ekc-audio';

export interface AudioSettings {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { volume: 0.7, muted: false };

export function readAudioSettings(storage: StorageLike | null): AudioSettings {
  if (!storage) return { ...DEFAULT_AUDIO };
  try {
    const text = storage.getItem(AUDIO_KEY);
    if (!text) return { ...DEFAULT_AUDIO };
    const v = JSON.parse(text) as Partial<AudioSettings>;
    const volume = typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_AUDIO.volume;
    const muted = typeof v.muted === 'boolean' ? v.muted : DEFAULT_AUDIO.muted;
    return { volume, muted };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function writeAudioSettings(storage: StorageLike | null, s: AudioSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUDIO_KEY, JSON.stringify({ volume: Math.min(1, Math.max(0, s.volume)), muted: !!s.muted }));
    return true;
  } catch {
    return false;
  }
}
