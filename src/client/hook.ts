// window.__ekc: the deterministic hook the e2e drives (TIME-6; KB recipe.md section 11). A hidden browser pane
// throttles requestAnimationFrame to about 1 fps, so tests advance time here instead of waiting on the clock.
import type { Action, GameEvent, Pos, State } from '../engine';
import type { TapResult } from './store';

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
  setMode(mode: 'normal' | 'blast'): void;
  setLevel(level: number): void;
  level(): number;
  tapTile(p: Pos): TapResult;
  lastTap(): TapResult | null;
  hash(): string | null;
  screen(): string;
  /** Screen point (CSS px in the page) of a tile's centre, or null when off screen or no board. */
  screenPointOfTile(p: Pos): { x: number; y: number } | null;
  /** Screen point of a figure's head top, so a test can tap "through" it (KB rule 25). */
  screenPointOfUnitHead(id: string): { x: number; y: number } | null;
  /** The tile the board's own raycast finds under a screen point, ignoring figures. */
  tileAtScreen(x: number, y: number): Pos | null;
  camera(): CameraPose | null;
  setCamera(pose: Partial<CameraPose>): void;
  mouseMode(): 'two-button' | 'three-button';
}

declare global {
  interface Window {
    __ekc?: EkcHook;
  }
}

export function installHook(h: EkcHook): void {
  window.__ekc = h;
}
