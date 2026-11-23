// Props (MAP-9; docs/art/tile-set.md section 3): one instanced mesh per prop kind across every drawn level, each a
// merged vertex-coloured geometry, plus one emissive instanced mesh per glowing kind (lamp heads, vending
// displays, the kiosk sign, the mast beacon). A prop shows the state of the tile under it: intact, knocked askew
// and darkened when the floor is damaged, gone when the floor is rubble or has collapsed. No handlers, no
// raycast (KB rule 25). Refilled when the tiles or the cut-away change, never per frame.
// Round 10: a kind whose generated model loaded (models.ts ASSET_SLOTS, `prop:<kind>`) draws that model's geometry
// and texture in the same one instanced mesh, fitted into the procedural piece's box (glbFit.ts), so placements,
// footprints and the draw count are unchanged; the glow parts stay as they are.
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAssetUrl } from '../models';
import { boxOf, fitScene } from './glbFit';
import { ModelBoundary } from './placeholders';
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

interface KindProps {
  kind: PropKind;
  list: PropInstance[];
  state: State;
  active: number;
  glow: boolean;
}

/** The generated model of a kind, fitted into its procedural box. */
function GlbPropKindMesh({ url, ...p }: KindProps & { url: string }) {
  const gltf = useGLTF(url);
  const fitted = useMemo(() => fitScene(gltf.scene, { box: boxOf(propGeometry(p.kind)), mode: 'footprint' }), [gltf.scene, p.kind]);
  return <PropKindMesh {...p} geometry={fitted.geometry} material={fitted.material} name={`prop-glb-${p.kind}`} />;
}

function PropBody(p: KindProps) {
  const url = useAssetUrl(`prop:${p.kind}`);
  if (!url) return <PropKindMesh {...p} />;
  return (
    <ModelBoundary fallback={<PropKindMesh {...p} />}>
      <Suspense fallback={null}>
        <GlbPropKindMesh {...p} url={url} />
      </Suspense>
    </ModelBoundary>
  );
}

function PropKindMesh({ kind, list, state, active, glow, geometry: given, material, name }: KindProps & { geometry?: THREE.BufferGeometry; material?: THREE.Material; name?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => given ?? propGeometry(kind, glow), [given, kind, glow]);
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
  }, [list, state.tiles, active, glow, geometry]); // eslint-disable-line react-hooks/exhaustive-deps
  return <instancedMesh key={geometry.uuid} name={name} ref={ref} args={[geometry, material ?? (glow ? GLOWING : BODY), Math.max(1, list.length)]} raycast={NO_RAYCAST} frustumCulled={false} />;
}

export function Props({ state }: { state: State }) {
  const active = useClient((s) => s.level);
  const map = MAPS[state.mapId];
  const groups = useMemo(() => (map ? groupProps(map, state) : new Map<PropKind, PropInstance[]>()), [map, state.width, state.depth]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {[...groups.entries()].map(([kind, list]) => (
        <PropBody key={kind} kind={kind} list={list} state={state} active={active} glow={false} />
      ))}
      {[...groups.entries()]
        .filter(([kind]) => PROP_GLOW[kind])
        .map(([kind, list]) => (
          <PropKindMesh key={`${kind}-glow`} kind={kind} list={list} state={state} active={active} glow />
        ))}
    </group>
  );
}
