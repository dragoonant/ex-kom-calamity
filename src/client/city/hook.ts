// window.__ekcCity: the deterministic hook the city e2e drives (CLOCK-6; KB recipe section 11), beside the battle's
// window.__ekc. Time moves through advance(seconds) whether the loop runs or not.
import * as THREE from 'three';
import { CITY } from '../../data/city';
import { cityView, type CityAction, type CityEvent, type CityState } from '../../city';
import { clampRig, rig, worldToScreen } from '../board/world';
import type { CameraPose } from '../hook';
import { cellCentre } from './cityMeshes';
import { lotHeights } from './CityScene';
import { overlayCounts } from './CityOverlays';
import { useCity, type CitySpeed } from './store';

export interface CityHook {
  start(seed?: number): void;
  active(): boolean;
  advance(seconds: number): CityEvent[];
  advanceTicks(ticks: number): CityEvent[];
  state(): CityState | null;
  view(): CityState | null;
  order(a: Exclude<CityAction, { type: 'tick' }>): { ok: true } | { ok: false; reason: string };
  select(id: string | null): void;
  selected(): string | null;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  setSpeed(s: CitySpeed): void;
  hash(): string | null;
  tray(): { text: string; kind: string }[];
  /** CWIRE-1: the city wire's slips, newest last. */
  wire(): { text: string; kind: string; building: string | null; org: string | null; district: string | null }[];
  fight(): unknown;
  /** Test seam: replaces the campaign state (a prepared scene for the e2e); the view and the board follow. */
  load(state: CityState): void;
  /** Screen point just under the top of a building's lot (its visible face), for a real tap through the pick mesh. */
  screenPointOfBuilding(id: string): { x: number; y: number } | null;
  /** Moves the city camera (shots and checks of the dressing); unspecified fields keep their value. */
  setCamera(pose: Partial<CameraPose>): void;
  /** What the board's overlays drew last frame: cars on a drive, parked watchers, a squad at a door, route dashes, report rings, slip pins. */
  overlays(): typeof overlayCounts;
}

declare global {
  interface Window {
    __ekcCity?: CityHook;
  }
}

export function installCityHook(): void {
  const s = useCity.getState;
  window.__ekcCity = {
    start: (seed) => s().start(seed),
    active: () => s().active,
    advance: (sec) => s().advance(sec),
    advanceTicks: (n) => s().advanceTicks(n),
    state: () => s().game,
    view: () => s().view,
    order: (a) => s().order(a),
    select: (id) => s().select(id),
    selected: () => s().selected,
    pause: () => s().setPaused(true),
    resume: () => s().setPaused(false),
    isPaused: () => s().paused,
    setSpeed: (sp) => s().setSpeed(sp),
    hash: () => s().hash(),
    tray: () => s().tray.map((t) => ({ text: t.text, kind: t.kind })),
    wire: () => s().wire.map((t) => ({ text: t.text, kind: t.kind, building: t.building, org: t.org ?? null, district: t.district ?? null })),
    fight: () => s().fight,
    load: (state) => useCity.setState({ game: state, view: cityView(state, 'agency') }),
    screenPointOfBuilding: (id) => {
      const b = CITY.buildings.find((x) => x.id === id);
      if (!b) return null;
      const c = cellCentre(b.x, b.y);
      return worldToScreen(new THREE.Vector3(c.x, (lotHeights.get(id) ?? 2) * 0.92, c.z));
    },
    setCamera: (pose) => {
      Object.assign(rig, { ...pose, target: pose.target ? { ...pose.target } : rig.target });
      clampRig();
    },
    overlays: () => ({ ...overlayCounts }),
  };
}
