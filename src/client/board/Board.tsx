import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { update } from '../presenter';
import { useGame } from '../store';
import { CameraRig } from './CameraRig';
import { Field } from './Field';
import { FxLayer } from './Fx';
import { Picks } from './Picks';
import { tex } from './textures';
import { Walkers } from './Walkers';
import { live } from './world';

function Atmosphere() {
  const { scene, gl } = useThree();
  useEffect(() => {
    const sky = tex('sky');
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    scene.fog = new THREE.Fog('#8b949a', 16, 46);
    gl.toneMappingExposure = 1.05;
  }, [scene, gl]);
  return (
    <>
      <hemisphereLight args={['#b9c6d2', '#3b342c', 0.95]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[-9, 11, 6]} intensity={2.1} color="#ffe2c2" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={50}
      />
      <directionalLight position={[8, 6, -10]} intensity={0.45} color="#9fb4c8" />
    </>
  );
}

/** Light rain: streaks recycled around the camera target. */
function Rain() {
  const { mesh, count } = useMemo(() => {
    const count = 900;
    const g = new THREE.BoxGeometry(0.006, 0.28, 0.006);
    const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#c9d4de', transparent: true, opacity: 0.32, depthWrite: false }), count);
    m.raycast = () => {};
    m.frustumCulled = false;
    return { mesh: m, count };
  }, []);
  const drops = useMemo(() => Array.from({ length: count }, (_, i) => new THREE.Vector3((Math.sin(i * 12.9) * 0.5 + 0.5) * 30 - 15, (i * 0.37) % 9, (Math.cos(i * 7.3) * 0.5 + 0.5) * 30 - 15)), [count]);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const tilt = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.08)), []);
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05) * 9;
    for (let i = 0; i < count; i++) {
      const d = drops[i]!;
      d.y -= step; d.z += step * 0.1; d.x += step * 0.07;
      if (d.y < -0.3) d.y += 9;
      mat.compose(d, tilt, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

function Clock() {
  useFrame((_, dt) => { if (!(window as unknown as { __ibManual?: boolean }).__ibManual) update(Math.min(dt, 0.1)); });
  return null;
}

export function Board() {
  const shown = useGame((s) => s.shown);
  if (!shown) return null;
  live.w = shown.w; live.h = shown.h;
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 200 }} gl={{ antialias: true }} className="board-canvas">
      <Atmosphere />
      <CameraRig />
      <Clock />
      <Field s={shown} />
      <Picks s={shown} />
      <Walkers />
      <FxLayer />
      <Rain />
    </Canvas>
  );
}
