// VIEW-5: a coral beacon on the tile of each last hostile the agency cannot see. A mark is a place, not a
// figure, so it is a light column and a ring, not a unit. It never takes the pointer (KB rule 25: tile-only
// picking), so clicks pass through it to the tile.
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { State } from '../../engine';
import { LEVEL_H } from './world';

const BEAM_H = 9;
const noPick = () => null;
const beamMat = new THREE.MeshBasicMaterial({ color: '#d9533f', transparent: true, opacity: 0.35, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: '#d9533f', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const beamGeo = new THREE.CylinderGeometry(0.12, 0.32, BEAM_H, 12, 1, true);
const ringGeo = new THREE.RingGeometry(0.34, 0.48, 24);

export function Marks({ state }: { state: State }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    beamMat.opacity = 0.25 + 0.15 * Math.sin(t * 3);
    if (group.current) for (const c of group.current.children) c.children[1]?.scale.setScalar(1 + 0.25 * Math.sin(t * 3));
  });
  const marks = state.marks ?? [];
  if (!marks.length) return null;
  return (
    <group ref={group} name="marks">
      {marks.map((m) => (
        <group key={`${m.x},${m.y},${m.level}`} position={[m.x + 0.5, m.level * LEVEL_H, m.y + 0.5]}>
          <mesh geometry={beamGeo} material={beamMat} position={[0, BEAM_H / 2 + 0.05, 0]} raycast={noPick} renderOrder={5} />
          <mesh geometry={ringGeo} material={ringMat} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noPick} renderOrder={5} />
        </group>
      ))}
    </group>
  );
}

/** OBJ-4: the wreck's drive core, an amber disc that dims once secured or burnt. */
export function CoreMark({ state }: { state: State }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.12 * Math.sin(clock.getElapsedTime() * 4));
  });
  const c = state.core;
  if (!c) return null;
  const live = !c.secured && !c.burnt;
  return (
    <mesh ref={ref} position={[c.at.x + 0.5, c.at.level * LEVEL_H + 0.06, c.at.y + 0.5]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} name="core-mark">
      <ringGeometry args={[0.18, 0.42, 24]} />
      <meshBasicMaterial color={live ? '#e0a030' : c.secured ? '#3fae63' : '#5a5650'} transparent opacity={0.85} />
    </mesh>
  );
}
