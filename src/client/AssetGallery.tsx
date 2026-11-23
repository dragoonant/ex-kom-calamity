// ?gallery, second part: every round 10 asset slot (docs/art/round-10.md) on a grid, each model fitted into a one-unit
// box with its own proportions, and a table of what each slot draws. A slot with no file, or whose file fails, keeps
// the procedural piece in the game (rule 26); here it is an empty cell and the table says "procedural".
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { EveningLights, EVENING } from './board/Scene';
import { fitScene } from './board/glbFit';
import { ModelBoundary, NO_RAYCAST } from './board/placeholders';
import { ASSET_SLOTS, assetStateOf, useAssetUrl, type AssetSlot } from './models';

const COLS = 8;
const STEP = 1.5;
const UNIT = new THREE.Box3(new THREE.Vector3(-0.55, 0, -0.55), new THREE.Vector3(0.55, 1.1, 0.55));

function GlbAsset({ slot, url, onDrawn }: { slot: AssetSlot; url: string; onDrawn: (id: string) => void }) {
  const gltf = useGLTF(url);
  const fitted = useMemo(() => fitScene(gltf.scene, { box: UNIT, mode: 'uniform', yaw: 0 }), [gltf.scene]);
  useEffect(() => onDrawn(slot.id), [slot.id, onDrawn]);
  return <mesh name={`asset-glb-${slot.id}`} geometry={fitted.geometry} material={fitted.material} raycast={NO_RAYCAST} />;
}

function AssetCell({ slot, index, onDrawn }: { slot: AssetSlot; index: number; onDrawn: (id: string) => void }) {
  const url = useAssetUrl(slot.id);
  const rows = Math.ceil(ASSET_SLOTS.length / COLS);
  const x = ((index % COLS) - (COLS - 1) / 2) * STEP;
  const z = (Math.floor(index / COLS) - (rows - 1) / 2) * STEP;
  return (
    <group position={[x, 0, z]}>
      <mesh raycast={NO_RAYCAST} position={[0, -0.02, 0]}>
        <boxGeometry args={[1.3, 0.04, 1.3]} />
        <meshStandardMaterial color="#efe6cf" />
      </mesh>
      {url && (
        <ModelBoundary fallback={null}>
          <Suspense fallback={null}>
            <GlbAsset slot={slot} url={url} onDrawn={onDrawn} />
          </Suspense>
        </ModelBoundary>
      )}
    </group>
  );
}

export function AssetGallery() {
  const [drawn, setDrawn] = useState<ReadonlySet<string>>(new Set());
  const onDrawn = useMemo(() => (id: string) => setDrawn((d) => (d.has(id) ? d : new Set(d).add(id))), []);
  const withFile = ASSET_SLOTS.filter((a) => a.url).length;
  return (
    <>
      <div className="gallery-canvas gallery-assets-canvas">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ fov: 30, near: 0.1, far: 100, position: [0, 9, 13] }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor(EVENING.clear);
            camera.lookAt(0, 0.3, 0);
          }}
        >
          <EveningLights />
          {ASSET_SLOTS.map((slot, i) => (
            <AssetCell key={slot.id} slot={slot} index={i} onDrawn={onDrawn} />
          ))}
        </Canvas>
      </div>
      <div className="panel-title" data-testid="gallery-assets-title">
        ROUND 10 ASSETS: {ASSET_SLOTS.length} slots, {withFile} with a generated model, drawn {drawn.size}
      </div>
      <table className="report-table num gallery-table" data-testid="gallery-assets-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Group</th>
            <th>Model</th>
          </tr>
        </thead>
        <tbody>
          {ASSET_SLOTS.map((slot) => (
            <tr key={slot.id} data-testid={`gallery-asset-${slot.id}`}>
              <th>{slot.label}</th>
              <td>{slot.group}</td>
              <td data-testid={`gallery-asset-model-${slot.id}`}>
                {slot.url ? `${assetStateOf(slot.id)}, drawn: ${drawn.has(slot.id) ? 'GLB' : 'not yet'} (${slot.url})` : 'procedural (no generated model)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
