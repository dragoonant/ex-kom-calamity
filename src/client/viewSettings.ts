// View settings (PLAN.md D21 f): the camera shake, shadows and scenery switches (docs/art/dressing.md) live in the browser
// under `ekc-view`, apart from the save and from the audio settings, because they belong to the player's machine. Plain functions over a Storage-like object
// so tests drive them without a DOM.
import type { StorageLike } from './save';

export const VIEW_KEY = 'ekc-view';

/** The world past the board (docs/art/dressing.md): `auto` is full on a GPU and plain on a software renderer. */
export type Scenery = 'auto' | 'full' | 'plain';
const SCENERY: Scenery[] = ['auto', 'full', 'plain'];

export interface ViewSettings {
  /** Blasts and collapses jolt the camera. */
  shake: boolean;
  /** The board's sun throws shadows (one shadow map; off for a slow GPU). */
  shadows: boolean;
  scenery: Scenery;
}

export const DEFAULT_VIEW: ViewSettings = { shake: true, shadows: true, scenery: 'auto' };

/** What `auto` means on this machine: a software rasterizer (no GPU) gets the plain board. */
export function resolveScenery(s: Scenery, rendererName: string): 'full' | 'plain' {
  if (s !== 'auto') return s;
  // Until a canvas has named its renderer, draw plain: a GPU machine flips to full on the next frame.
  if (!rendererName) return 'plain';
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererName) ? 'plain' : 'full';
}

export function readViewSettings(storage: StorageLike | null): ViewSettings {
  if (!storage) return { ...DEFAULT_VIEW };
  try {
    const text = storage.getItem(VIEW_KEY);
    if (!text) return { ...DEFAULT_VIEW };
    const v = JSON.parse(text) as Partial<ViewSettings>;
    return {
      shake: typeof v.shake === 'boolean' ? v.shake : DEFAULT_VIEW.shake,
      shadows: typeof v.shadows === 'boolean' ? v.shadows : DEFAULT_VIEW.shadows,
      scenery: SCENERY.includes(v.scenery as Scenery) ? (v.scenery as Scenery) : DEFAULT_VIEW.scenery,
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function writeViewSettings(storage: StorageLike | null, s: ViewSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VIEW_KEY, JSON.stringify({ shake: !!s.shake, shadows: s.shadows !== false, scenery: SCENERY.includes(s.scenery) ? s.scenery : DEFAULT_VIEW.scenery }));
    return true;
  } catch {
    return false;
  }
}
