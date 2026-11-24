// ?gallery: every walker build in the mission beside a human-height ruler, for checking the kits against the locked concepts.
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { MISSIONS } from '../engine/data';
import { buildWalker } from './board/kit';
import { preloadTextures, tex } from './board/textures';
import * as THREE from 'three';

function Walkers() {
  const m = MISSIONS['marrow-yard']!;
  const group = useMemo(() => {
    const g = new THREE.Group();
    m.units.forEach((u, i) => {
      const base = u.side === 'player' ? 'slate' : 'camo';
      const w = buildWalker(u.build, { body: base, armL: base, armR: base, legs: base, pack: base }, u.side);
      w.root.position.set((i % 5) * 1.3 - 2.6, 0, i < 5 ? 0.8 : -0.8);
      w.root.rotation.y = 0.6 + (i % 2) * 0.4;
      g.add(w.root);
    });
    return g;
  }, [m]);
  return <primitive object={group} />;
}

export function Gallery() {
  const [ready, setReady] = useState(false);
  useEffect(() => { void preloadTextures().then(() => setReady(true)); }, []);
  if (!ready) return null;
  return (
    <Canvas shadows camera={{ position: [0.5, 1.6, 5.4], fov: 40 }} style={{ position: 'fixed', inset: 0, background: '#9aa3a8' }}>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#c8d2da', '#3a3530', 0.9]} />
      <directionalLight position={[3, 6, 4]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
      <Walkers />
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[14, 8]} /><meshStandardMaterial map={tex('wet-concrete', [4, 3])} /></mesh>
      <OrbitControls target={[0, 0.6, 0]} />
    </Canvas>
  );
}
