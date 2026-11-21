// One Canvas for the session. The LoopDriver turns frame time into ticks through the store's advance()
// (TIME-6); drawing and the sim are separate concerns sharing nothing but the state.
// Lighting (docs/art/tile-set.md section 4): a fixed early-evening rig in the D11 register, warm low sun from the
// west, a cool sky fill, no shadow maps (an integrated GPU keeps 60 fps), window and lamp glow by emissive
// instances, the alien cores pulsing through one shared material.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { feed, makeAccumulator } from '../loop';
import { useClient } from '../store';
import { CameraRig } from './CameraRig';
import { CorePulse, Effects, FrameTimes } from './Effects';
import { Figures } from './Figures';
import { Marks } from './Marks';
import { Props } from './Props';
import { Signs } from './Signs';
import { Tiles, useBoardDerived } from './Tiles';
import { bounds, detectDetail, live, setShadows, shadowsActive, view } from './world';
import { ConsoleRoom } from './ConsoleRoom';
import { BOARD_LIGHT } from './light';

/** The evening palette the scene clears to and lights with; also read by the gallery. */
export const EVENING = {
  clear: '#c7bfb2',
  /** The control room's far wall colour, what the board canvas clears to behind the room. */
  room: '#b9c4bd',
  sky: '#9fb8c9',
  ground: '#6b5a4a',
  sun: '#ffb774',
  fill: '#7fa7b8',
  /** The board's own rig (BoardLights): a paler sun so stone and steel keep their colour, a lighter bounce. */
  boardSun: BOARD_LIGHT.sun,
  boardSky: BOARD_LIGHT.sky,
  boardGround: BOARD_LIGHT.ground,
};

function LoopDriver() {
  const acc = useRef(makeAccumulator());
  useFrame((_, dt) => {
    const s = useClient.getState();
    if (!s.game || s.screen !== 'battle') return;
    const tps = s.game.tuning.time.ticksPerSecond;
    const ticks = feed(acc.current, dt, tps, s.speed, s.paused);
    if (ticks > 0) s.advance(ticks / tps);
  });
  return null;
}

export function RendererHandle() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    live.renderer = gl;
    live.scene = scene;
    return () => {
      if (live.renderer === gl) live.renderer = null;
      if (live.scene === scene) live.scene = null;
    };
  }, [gl, scene]);
  return null;
}

export function EveningLights() {
  return (
    <>
      <hemisphereLight args={[EVENING.sky, EVENING.ground, 0.95]} />
      <directionalLight position={[-28, 16, 12]} intensity={1.5} color={EVENING.sun} />
      <directionalLight position={[18, 10, -22]} intensity={0.35} color={EVENING.fill} />
    </>
  );
}

/** Where the board's sun comes from: low in the west, high enough that a three-storey building's shadow stays near it. */
const SUN_DIR = BOARD_LIGHT.sunDir;

/**
 * The board's light (docs/art/tile-set.md section 4): the evening rig of EveningLights, with the sun throwing one
 * shadow map fitted to the raid site so buildings, props and figures sit on the street. The map is redrawn every
 * frame (figures move), at 2048 texels over the site; the shadows switch (viewSettings.ts) turns it off.
 */
function BoardLights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const gl = useThree((s) => s.gl);
  // The shadows switch may flip before the renderer exists; the frame keeps them in step.
  useFrame(() => {
    if (gl.shadowMap.enabled !== shadowsActive()) setShadows(view.shadows);
  });
  const mapId = useClient((s) => s.game?.mapId);
  useLayoutEffect(() => {
    const l = sun.current;
    if (!l) return;
    const cx = bounds.width / 2;
    const cz = bounds.depth / 2;
    const half = Math.max(bounds.width, bounds.depth) * 0.62 + 4;
    l.position.set(cx + SUN_DIR.x * 60, SUN_DIR.y * 60, cz + SUN_DIR.z * 60);
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 20;
    cam.far = 110;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [mapId]);
  return (
    <>
      <hemisphereLight args={[EVENING.boardSky, EVENING.boardGround, BOARD_LIGHT.hemiIntensity]} />
      <directionalLight ref={sun} intensity={BOARD_LIGHT.sunIntensity} color={EVENING.boardSun} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} />
      <directionalLight position={BOARD_LIGHT.fillDir.clone().multiplyScalar(30).toArray()} intensity={BOARD_LIGHT.fillIntensity} color={BOARD_LIGHT.fill} />
    </>
  );
}

function Board() {
  const agency = useClient((s) => s.agency);
  const selected = useClient((s) => s.selected);
  const hover = useClient((s) => s.hover);
  const mode = useClient((s) => s.mode);
  const derived = useBoardDerived(agency, selected, hover, mode);
  if (!agency) return null;
  return (
    <>
      <Tiles state={agency} derived={derived} />
      <Props state={agency} />
      <Signs state={agency} />
      <Figures state={agency} />
      <Marks state={agency} />
      <Effects />
    </>
  );
}

export function Scene() {
  const hoverClear = useClient((s) => s.setHover);
  useEffect(() => () => hoverClear(null), [hoverClear]);
  return (
    <Canvas
      className="board"
      frameloop="always"
      dpr={[1, 1.5]}
      shadows={{ type: THREE.PCFShadowMap, enabled: shadowsActive() }}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: 42, near: 0.1, far: 600, position: [20, 16, 20] }}
      onCreated={({ gl }) => {
        detectDetail(gl);
        gl.shadowMap.enabled = shadowsActive();
        gl.setClearColor(EVENING.room);
        gl.toneMapping = THREE.NeutralToneMapping;
      }}
    >
      <BoardLights />
      <ConsoleRoom />
      <RendererHandle />
      <CameraRig />
      <LoopDriver />
      <CorePulse />
      <FrameTimes />
      {/* KB rule 26: nothing stands in for a model while it loads. */}
      <Suspense fallback={null}>
        <Board />
      </Suspense>
    </Canvas>
  );
}
