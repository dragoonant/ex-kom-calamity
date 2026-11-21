// View settings (PLAN.md D21 f): the camera shake switch lives in the browser under `ekc-view`, apart from the save
// and from the audio settings, because it belongs to the player's machine. Plain functions over a Storage-like object
// so tests drive them without a DOM.
import type { StorageLike } from './save';

export const VIEW_KEY = 'ekc-view';

export interface ViewSettings {
  /** Blasts and collapses jolt the camera. */
  shake: boolean;
  /** The board's sun throws shadows (one shadow map; off for a slow GPU). */
  shadows: boolean;
}

export const DEFAULT_VIEW: ViewSettings = { shake: true, shadows: true };

export function readViewSettings(storage: StorageLike | null): ViewSettings {
  if (!storage) return { ...DEFAULT_VIEW };
  try {
    const text = storage.getItem(VIEW_KEY);
    if (!text) return { ...DEFAULT_VIEW };
    const v = JSON.parse(text) as Partial<ViewSettings>;
    return { shake: typeof v.shake === 'boolean' ? v.shake : DEFAULT_VIEW.shake, shadows: typeof v.shadows === 'boolean' ? v.shadows : DEFAULT_VIEW.shadows };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function writeViewSettings(storage: StorageLike | null, s: ViewSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VIEW_KEY, JSON.stringify({ shake: !!s.shake, shadows: !!s.shadows }));
    return true;
  } catch {
    return false;
  }
}
