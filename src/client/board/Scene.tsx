// One Canvas for the session. The LoopDriver turns frame time into ticks through the store's advance()
// (TIME-6); drawing and the sim are separate concerns sharing nothing but the state.
// Lighting (docs/art/tile-set.md section 4): a fixed early-evening rig in the D11 register, warm low sun from the
// west, a cool sky fill, no shadow maps (an integrated GPU keeps 60 fps), window and lamp glow by emissive
// instances, the alien cores pulsing through one shared material.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAPS } from '../../data';
import type { State } from '../../engine';
import { feed, makeAccumulator } from '../loop';
import { useClient } from '../store';
import { CameraRig } from './CameraRig';
import { CorePulse, Effects, FrameTimes } from './Effects';
import { Figures } from './Figures';
import { CoreMark, Marks } from './Marks';
import { Props } from './Props';
import { Signs } from './Signs';
import { Tiles, useBoardDerived } from './Tiles';
import { bounds, detectDetail, LEVEL_H, live, setShadows, shadowsActive, view } from './world';
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

/** NIGHT-1: a raid at night. The rules cut sight on dark streets (NIGHT-2), but the board must still show the
 * player the building and every figure in it: a bright cool moonlit fill and key keep the whole site readable in a
 * blue night register, and the street lamps cast warm pools of their own (`NightLamps`). */
export function NightLights() {
  return (
    <>
      <hemisphereLight args={['#8fa3c8', '#4a4038', 1.35]} />
      <directionalLight position={[-20, 24, 10]} intensity={1.05} color="#c2d2f0" />
      <directionalLight position={[18, 10, -22]} intensity={0.4} color={EVENING.fill} />
    </>
  );
}

/** At most this many lamp lights, so a lamp-lined block does not multiply the cost of every lit material. */
const MAX_LAMP_LIGHTS = 8;

/** NIGHT-2 drawn: a warm point light under each street lamp's head, reaching about the rules' lamp range. */
export function NightLamps({ state }: { state: State }) {
  const active = useClient((s) => s.level);
  const lamps = useMemo(() => (MAPS[state.mapId]?.props ?? []).filter((p) => p.kind === 'lamp').slice(0, MAX_LAMP_LIGHTS), [state.mapId]);
  const reach = (state.tuning.night?.lampRange ?? 3) + 2.5;
  return (
    <>
      {lamps
        .filter((p) => p.level <= active)
        .map((p, i) => (
          <pointLight key={i} position={[p.x + 0.5, p.level * LEVEL_H + 2.9, p.y + 0.5]} color="#ffc27a" intensity={9} distance={reach} decay={1.4} />
        ))}
    </>
  );
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
/** NIGHT-1 inside the room: the board's moonlit night, bright and cool so the site and every figure read (RULING ART-12, the values of `NightLights`), with the street lamps' warm pools (`NightLamps`). */
const NIGHT_BOARD = { sky: '#8fa3c8', ground: '#4a4038', hemi: 1.35, sun: '#c2d2f0', sunIntensity: 1.05, fillIntensity: 0.4 };

function BoardLights({ night = false }: { night?: boolean }) {
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
      <hemisphereLight key={night ? 'n' : 'd'} args={night ? [NIGHT_BOARD.sky, NIGHT_BOARD.ground, NIGHT_BOARD.hemi] : [EVENING.boardSky, EVENING.boardGround, BOARD_LIGHT.hemiIntensity]} />
      <directionalLight ref={sun} intensity={night ? NIGHT_BOARD.sunIntensity : BOARD_LIGHT.sunIntensity} color={night ? NIGHT_BOARD.sun : EVENING.boardSun} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} />
      <directionalLight position={BOARD_LIGHT.fillDir.clone().multiplyScalar(30).toArray()} intensity={night ? NIGHT_BOARD.fillIntensity : BOARD_LIGHT.fillIntensity} color={BOARD_LIGHT.fill} />
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
      {agency.night === true && <NightLamps state={agency} />}
      <Props state={agency} />
      <Signs state={agency} />
      <Figures state={agency} />
      <Marks state={agency} />
      <CoreMark state={agency} />
      <Effects />
    </>
  );
}

export function Scene() {
  const hoverClear = useClient((s) => s.setHover);
  const night = useClient((s) => s.agency?.night === true);
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
      <BoardLights night={night} />
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
