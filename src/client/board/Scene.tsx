// One Canvas for the session. The LoopDriver turns frame time into ticks through the store's advance()
// (TIME-6); drawing and the sim are separate concerns sharing nothing but the state.
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { feed, makeAccumulator } from '../loop';
import { useClient } from '../store';
import { CameraRig } from './CameraRig';
import { Figures } from './Figures';
import { Tiles, useBoardDerived } from './Tiles';

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

function Board() {
  const agency = useClient((s) => s.agency);
  const selected = useClient((s) => s.selected);
  const hover = useClient((s) => s.hover);
  const derived = useBoardDerived(agency, selected, hover);
  if (!agency) return null;
  return (
    <>
      <Tiles state={agency} derived={derived} />
      <Figures state={agency} />
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
      camera={{ fov: 42, near: 0.1, far: 200, position: [20, 16, 20] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#cfd8d3');
      }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[12, 20, 6]} intensity={1.6} />
      <directionalLight position={[-10, 8, -14]} intensity={0.4} />
      <CameraRig />
      <LoopDriver />
      {/* KB rule 26: nothing stands in for a model while it loads. */}
      <Suspense fallback={null}>
        <Board />
      </Suspense>
    </Canvas>
  );
}
