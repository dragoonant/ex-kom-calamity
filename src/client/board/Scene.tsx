// One Canvas for the session. The LoopDriver turns frame time into ticks through the store's advance()
// (TIME-6); drawing and the sim are separate concerns sharing nothing but the state.
// Lighting (docs/art/tile-set.md section 4): a fixed early-evening rig in the D11 register, warm low sun from the
// west, a cool sky fill, no shadow maps (an integrated GPU keeps 60 fps), window and lamp glow by emissive
// instances, the alien cores pulsing through one shared material.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { MAPS } from '../../data';
import type { State } from '../../engine';
import { feed, makeAccumulator } from '../loop';
import { useClient } from '../store';
import { CameraRig } from './CameraRig';
import { CorePulse, Effects, FrameTimes } from './Effects';
import { Figures } from './Figures';
import { CoreMark, Marks } from './Marks';
import { Props } from './Props';
import { Surroundings } from './Surroundings';
import { RendererName, useSceneryLevel } from '../scenery';
import { Tiles, useBoardDerived } from './Tiles';
import { LEVEL_H, live } from './world';

/** The evening palette the scene clears to and lights with; also read by the gallery. */
export const EVENING = {
  clear: '#c7bfb2',
  sky: '#9fb8c9',
  ground: '#6b5a4a',
  sun: '#ffb774',
  fill: '#7fa7b8',
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

function Board() {
  const agency = useClient((s) => s.agency);
  const selected = useClient((s) => s.selected);
  const hover = useClient((s) => s.hover);
  const mode = useClient((s) => s.mode);
  const derived = useBoardDerived(agency, selected, hover, mode);
  const scenery = useSceneryLevel();
  if (!agency) return null;
  return (
    <>
      {scenery === 'full' && <Surroundings width={agency.width} depth={agency.depth} night={agency.night === true} />}
      <Tiles state={agency} derived={derived} />
      {agency.night === true && <NightLamps state={agency} />}
      <Props state={agency} />
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
  const gl = useRef<{ setClearColor: (c: string) => void } | null>(null);
  useEffect(() => {
    gl.current?.setClearColor(night ? '#141a26' : EVENING.clear);
  }, [night]);
  useEffect(() => () => hoverClear(null), [hoverClear]);
  return (
    <Canvas
      className="board"
      frameloop="always"
      dpr={[1, 1.5]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 520, position: [20, 16, 20] }}
      onCreated={({ gl: renderer }) => {
        gl.current = renderer;
        renderer.setClearColor(useClient.getState().agency?.night ? '#141a26' : EVENING.clear);
      }}
    >
      {night ? <NightLights /> : <EveningLights />}
      <RendererHandle />
      <RendererName />
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
