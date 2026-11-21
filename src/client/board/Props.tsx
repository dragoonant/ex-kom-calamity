// Props (MAP-9; docs/art/tile-set.md section 3): one instanced mesh per prop kind across every drawn level, each a
// merged vertex-coloured geometry, plus one emissive instanced mesh per glowing kind (lamp heads, vending
// displays, the kiosk sign, the mast beacon). A prop shows the state of the tile under it: intact, knocked askew
// and darkened when the floor is damaged, gone when the floor is rubble or has collapsed. No handlers, no
// raycast (KB rule 25). Refilled when the tiles or the cut-away change, never per frame.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAPS, type PropKind } from '../../data';
import type { State } from '../../engine';
import { useClient } from '../store';
import { PROP_GLOW, groupProps, placeProp, propGeometry, type PropInstance, type PropPlacement } from './tileset';

const NO_RAYCAST = () => undefined;
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.08 });
const GLOWING = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9 });

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const C = new THREE.Color();
const PLACE: PropPlacement = { x: 0, y: 0, z: 0, yaw: 0, tilt: 0, scale: 1, tint: 1, shown: false };

function PropKindMesh({ kind, list, state, active, glow }: { kind: PropKind; list: PropInstance[]; state: State; active: number; glow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => propGeometry(kind, glow), [kind, glow]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < list.length; i++) {
      const p = placeProp(list[i]!, state, active, PLACE);
      E.set(0, p.yaw, 0);
      Q.setFromEuler(E);
      if (p.tilt) {
        // Lean away from the yaw, as if knocked from the doorway side.
        E.set(p.tilt, p.yaw, p.tilt * 0.5);
        Q.setFromEuler(E);
      }
      M.compose(P.set(p.x, p.y, p.z), Q, S.set(p.scale, p.scale, p.scale));
      mesh.setMatrixAt(i, M);
      // A glow part goes dark on a damaged floor; the body is tinted by the damage.
      const tint = glow ? (p.tint < 1 ? 0.15 : 1) : p.tint;
      mesh.setColorAt(i, C.setRGB(tint, tint, tint));
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, state.tiles, active, glow]); // eslint-disable-line react-hooks/exhaustive-deps
  return <instancedMesh ref={ref} args={[geometry, glow ? GLOWING : BODY, Math.max(1, list.length)]} raycast={NO_RAYCAST} frustumCulled={false} castShadow={!glow} receiveShadow={!glow} />;
}

export function Props({ state }: { state: State }) {
  const active = useClient((s) => s.level);
  const map = MAPS[state.mapId];
  const groups = useMemo(() => (map ? groupProps(map, state) : new Map<PropKind, PropInstance[]>()), [map, state.width, state.depth]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {[...groups.entries()].map(([kind, list]) => (
        <PropKindMesh key={kind} kind={kind} list={list} state={state} active={active} glow={false} />
      ))}
      {[...groups.entries()]
        .filter(([kind]) => PROP_GLOW[kind])
        .map(([kind, list]) => (
          <PropKindMesh key={`${kind}-glow`} kind={kind} list={list} state={state} active={active} glow />
        ))}
    </group>
  );
}
