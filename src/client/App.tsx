import { useEffect } from 'react';
import type * as THREE from 'three';
import { Hud } from './Hud';
import { Report } from './Report';
import { Title } from './Title';
import { Scene } from './board/Scene';
import { unitHeadWorld } from './board/Figures';
import { clampRig, readMouseMode, rig, tileAtScreen, tileToWorld, worldToScreen } from './board/world';
import { installHook } from './hook';
import { preloadModels } from './models';
import { useClient } from './store';

function Battle() {
  return (
    <div className="battle" data-testid="battle">
      <Scene />
      <Hud />
    </div>
  );
}

export function App() {
  const screen = useClient((s) => s.screen);

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
      tapTile: (p) => s().tapTile(p),
      lastTap: () => s().lastTap,
      hash: () => s().hash(),
      screen: () => s().screen,
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
    });
    void preloadModels((loaded, total) => s().setModels(loaded, total));
  }, []);

  if (screen === 'battle') return <Battle />;
  if (screen === 'report') return <Report />;
  return <Title />;
}
