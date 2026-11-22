// The scenery switch as a small store the boards read (docs/art/dressing.md, RULING ART-11): the player's setting
// from `ekc-view`, the renderer's name once a canvas exists, and what they resolve to. Plain drops the raid's
// surroundings and the city's shadows and far towers, for machines that draw without a GPU.
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { create } from 'zustand';
import { browserStorage } from './save';
import { readViewSettings, resolveScenery, writeViewSettings, type Scenery } from './viewSettings';

interface SceneryState {
  setting: Scenery;
  renderer: string;
  set(s: Scenery): void;
}

export const useScenery = create<SceneryState>((set) => ({
  setting: readViewSettings(browserStorage()).scenery,
  renderer: '',
  set(setting) {
    const storage = browserStorage();
    writeViewSettings(storage, { ...readViewSettings(storage), scenery: setting });
    set({ setting });
  },
}));

/** 'full' or 'plain' for the current machine. */
export function useSceneryLevel(): 'full' | 'plain' {
  const setting = useScenery((s) => s.setting);
  const renderer = useScenery((s) => s.renderer);
  return resolveScenery(setting, renderer);
}

/** Inside a Canvas: reads the WebGL renderer's name once, for `auto`. */
export function RendererName() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    if (useScenery.getState().renderer !== name) useScenery.setState({ renderer: name });
  }, [gl]);
  return null;
}

/** The console switch: shows what is drawn, and a press picks the other one for good (no longer `auto`). */
export function SceneryToggle({ testId }: { testId: string }) {
  const level = useSceneryLevel();
  const set = useScenery((s) => s.set);
  const full = level === 'full';
  return (
    <button type="button" className={`toggle ${full ? '' : 'toggle-alert'}`} data-testid={testId} aria-pressed={full} onClick={() => set(full ? 'plain' : 'full')}>
      {full ? 'SCENERY' : 'PLAIN'}
    </button>
  );
}
