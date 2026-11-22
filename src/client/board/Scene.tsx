// One Canvas for the session. The LoopDriver turns frame time into ticks through the store's advance()
// (TIME-6); drawing and the sim are separate concerns sharing nothing but the state.
// Lighting (docs/art/tile-set.md section 4): a fixed early-evening rig in the D11 register, warm low sun from the
// west, a cool sky fill, no shadow maps (an integrated GPU keeps 60 fps), window and lamp glow by emissive
// instances, the alien cores pulsing through one shared material.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { feed, makeAccumulator } from '../loop';
import { useClient } from '../store';
import { CameraRig } from './CameraRig';
import { CorePulse, Effects, FrameTimes } from './Effects';
import { Figures } from './Figures';
import { CoreMark, Marks } from './Marks';
import { Props } from './Props';
import { Tiles, useBoardDerived } from './Tiles';
import { live } from './world';

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
  if (!agency) return null;
  return (
    <>
      <Tiles state={agency} derived={derived} />
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
  useEffect(() => () => hoverClear(null), [hoverClear]);
  return (
    <Canvas
      className="board"
      frameloop="always"
      dpr={[1, 1.5]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 400, position: [20, 16, 20] }}
      onCreated={({ gl }) => {
        gl.setClearColor(EVENING.clear);
      }}
    >
      <EveningLights />
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
