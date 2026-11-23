// window.__ekc: the deterministic hook the e2e drives (TIME-6; KB recipe.md section 11). A hidden browser pane
// throttles requestAnimationFrame to about 1 fps, so tests advance time here instead of waiting on the clock.
import type { Action, GameEvent, Pos, State } from '../engine';
import type { TapResult } from './store';
import type { PerfReport } from './board/world';
import type { Fx } from './fx';
import type { AudioReport } from './audio/director';

export interface CameraPose {
  yaw: number;
  pitch: number;
  distance: number;
  target: { x: number; z: number };
}

export interface EkcHook {
  /** Steps the sim by `seconds` through advance() and returns the events. Works paused or not. */
  advance(seconds: number): GameEvent[];
  getState(): State | null;
  getView(): State | null;
  order(action: Exclude<Action, { type: 'tick' }>): { ok: true } | { ok: false; reason: string };
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  select(id: string | null): void;
  setMode(mode: 'normal' | 'blast' | 'suppress' | 'capture' | 'evacuate'): void;
  setLevel(level: number): void;
  level(): number;
  tapTile(p: Pos, opts?: { shift?: boolean }): TapResult;
  lastTap(): TapResult | null;
  hash(): string | null;
  screen(): string;
  /** The hostile AI level the page runs (AI-2). */
  ai(): string;
  /** Screen point (CSS px in the page) of a tile's centre, or null when off screen or no board. */
  screenPointOfTile(p: Pos): { x: number; y: number } | null;
  /** Screen point of a figure's head top, so a test can tap "through" it (KB rule 25). */
  screenPointOfUnitHead(id: string): { x: number; y: number } | null;
  /** The tile the board's own raycast finds under a screen point, ignoring figures. */
  tileAtScreen(x: number, y: number): Pos | null;
  camera(): CameraPose | null;
  setCamera(pose: Partial<CameraPose>): void;
  mouseMode(): 'two-button' | 'three-button';
  /** M4: draw calls, triangles, instance counts and frame times of the board (the e2e frame budget). */
  perf(): PerfReport | null;
  /** M4: the effects queued from engine events (fx.ts). */
  fx(): Fx[];
  /** M4: what the audio director has played, its settings and whether the context is unlocked. */
  audio(): AudioReport | null;
  /** D21 f: the camera shake now and whether the player's switch allows it. */
  shake(): { amp: number; enabled: boolean };
  /** The raid board's detail tier and shadows switch (world.ts `view`; RULING ART-11). */
  detail(): { detail: 'full' | 'low'; shadows: boolean };
  setAudio(s: { volume?: number; muted?: boolean; music?: number; source?: 'auto' | 'synth' }): void;
}

declare global {
  interface Window {
    __ekc?: EkcHook;
  }
}

export function installHook(h: EkcHook): void {
  window.__ekc = h;
}
