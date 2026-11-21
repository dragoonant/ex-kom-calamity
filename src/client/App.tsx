import { useEffect } from 'react';
import type * as THREE from 'three';
import { Gallery } from './Gallery';
import { Moves } from './Moves';
import { Hud } from './Hud';
import { Report } from './Report';
import { Title } from './Title';
import { Director } from './audio/director';
import { Scene } from './board/Scene';
import { unitHeadWorld } from './board/Figures';
import { clampRig, perfReport, shake, readMouseMode, rig, tileAtScreen, tileToWorld, worldToScreen } from './board/world';
import { installHook } from './hook';
import { preloadModels } from './models';
import { browserStorage } from './save';
import { useClient } from './store';
import { CityHud } from './city/CityHud';
import { CityScene } from './city/CityScene';
import { useCity } from './city/store';
import { battleFor, resultFromBattle } from './city/join';
import { installCityHook } from './city/hook';
import type { RaidResult } from '../city';

/** The one audio director of the session (audio/director.ts); the HUD's volume control and the hook read it. */
export const director = new Director(browserStorage());

/** `?gallery` on the page opens the figure gallery instead of the console (KB recipe step 7). */
export function isGalleryPage(search: string | undefined): boolean {
  return !!search && new URLSearchParams(search).has('gallery');
}

/** ?moves: every animated figure doing every motion (PLAN D21). */
export function isMovesPage(search: string | undefined): boolean {
  return !!search && new URLSearchParams(search).has('moves');
}

function Battle() {
  return (
    <div className="battle" data-testid="battle">
      <div className="board-wrap">
        <Scene />
      </div>
      <Hud />
    </div>
  );
}

function City() {
  return (
    <div className="battle city" data-testid="city">
      <div className="board-wrap">
        <CityScene />
      </div>
      <CityHud />
    </div>
  );
}

/** M7: a fight chosen at a door opens the real battle; when its report closes, the result goes back to the city. */
function useJoin(): void {
  useEffect(() => {
    let pending: RaidResult | null = null;
    const offCity = useCity.subscribe((c, prev) => {
      if (c.fight && !prev.fight) {
        pending = null;
        useClient.getState().newBattle(battleFor(c.fight.building));
      }
    });
    const offBattle = useClient.subscribe((b, prev) => {
      const fight = useCity.getState().fight;
      if (!fight) return;
      if (b.screen === 'report' && prev.screen !== 'report' && b.report) pending = resultFromBattle(b.report, fight);
      if (b.screen === 'title' && prev.screen !== 'title') {
        useCity.getState().finishFight(pending);
        pending = null;
      }
    });
    return () => {
      offCity();
      offBattle();
    };
  }, []);
}

export function App() {
  const screen = useClient((s) => s.screen);
  const cityActive = useCity((s) => s.active);
  const fight = useCity((s) => s.fight);
  useJoin();

  useEffect(() => {
    const s = useClient.getState;
    // The deterministic hook for the e2e (TIME-6). Installed once; it reads the live store and camera.
    installHook({
      advance: (seconds) => s().advance(seconds),
      getState: () => s().game,
      getView: () => s().agency,
      order: (a) => s().order(a),
      pause: () => s().setPaused(true),
      resume: () => s().setPaused(false),
      isPaused: () => s().paused,
      select: (id) => s().select(id),
      setMode: (m) => s().setMode(m),
      setLevel: (l) => s().setLevel(l),
      level: () => s().level,
      tapTile: (p, opts) => s().tapTile(p, opts),
      lastTap: () => s().lastTap,
      hash: () => s().hash(),
      screen: () => s().screen,
      ai: () => s().ai,
      screenPointOfTile: (p) => worldToScreen(tileToWorld(p)),
      screenPointOfUnitHead: (id) => {
        const u = s().agency?.units.find((x) => x.id === id);
        return u ? worldToScreen(unitHeadWorld(u) as THREE.Vector3) : null;
      },
      tileAtScreen: (x, y) => tileAtScreen(x, y),
      camera: () => ({ yaw: rig.yaw, pitch: rig.pitch, distance: rig.distance, target: { ...rig.target } }),
      setCamera: (pose) => {
        if (pose.yaw !== undefined) rig.yaw = pose.yaw;
        if (pose.pitch !== undefined) rig.pitch = pose.pitch;
        if (pose.distance !== undefined) rig.distance = pose.distance;
        if (pose.target) rig.target = { ...pose.target };
        clampRig();
      },
      mouseMode: () => readMouseMode(),
      perf: () => perfReport(),
      fx: () => s().fx,
      audio: () => director.report(),
      shake: () => ({ amp: shake.amp, enabled: shake.enabled }),
      setAudio: (a) => {
        if (a.volume !== undefined) director.setVolume(a.volume);
        if (a.muted !== undefined) director.setMuted(a.muted);
        if (a.music !== undefined) director.setMusicVolume(a.music);
        if (a.source !== undefined) director.setSource(a.source);
      },
    });
    installCityHook();
    void preloadModels((loaded, total) => s().setModels(loaded, total));
    return director.attach();
  }, []);

  if (isGalleryPage((globalThis as { location?: { search?: string } }).location?.search)) return <Gallery />;
  if (isMovesPage((globalThis as { location?: { search?: string } }).location?.search)) return <Moves />;
  if (cityActive && !fight && screen === 'title') return <City />;
  if (screen === 'battle') return <Battle />;
  if (screen === 'report') return <Report />;
  return <Title />;
}
