// The battlefield tiles: one instanced mesh per level, and the ONLY objects with pointer handlers (KB rule 25).
// Every tile carries a level (MAP-1); levels above the active one are not drawn, levels below are dimmed.
// Colours: visibility from query.visibleTiles, reach from query.reachable, path from query.path.
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { query, tileIndex, type Pos, type State, type Tile } from '../../engine';
import { useClient } from '../store';
import { LEVEL_H, live } from './world';

const PALETTE = {
  ground: new THREE.Color('#9aa39b'),
  floor: new THREE.Color('#e3d9c3'),
  wall: new THREE.Color('#5f8a8b'),
  door: new THREE.Color('#b8743a'),
  doorOpen: new THREE.Color('#d7b07a'),
  stair: new THREE.Color('#c9a54a'),
  reach: new THREE.Color('#79c3c0'),
  path: new THREE.Color('#e4b43a'),
  hover: new THREE.Color('#f5f1e6'),
  hidden: new THREE.Color('#2e3436'),
};

const WALL_H_ACTIVE = 0.9;
const BOX = new THREE.BoxGeometry(1, 1, 1);

interface Derived {
  visible: Set<number>;
  reach: Set<number>;
  path: Set<number>;
}

export function useBoardDerived(agency: State | null, selected: string | null, hover: Pos | null): Derived {
  const visible = useMemo(() => {
    const s = new Set<number>();
    if (agency) for (const p of query.visibleTiles(agency, 'agency')) s.add(tileIndex(agency, p));
    return s;
  }, [agency]);
  const reach = useMemo(() => {
    const s = new Set<number>();
    if (agency && selected) for (const p of query.reachable(agency, selected)) s.add(tileIndex(agency, p));
    return s;
  }, [agency, selected]);
  const path = useMemo(() => {
    const s = new Set<number>();
    if (agency && selected && hover) {
      const r = query.path(agency, selected, hover);
      if (r) for (const p of r.steps) s.add(tileIndex(agency, p));
    }
    return s;
  }, [agency, selected, hover]);
  return { visible, reach, path };
}

function LevelTiles({ state, level, active, derived, hover }: { state: State; level: number; active: number; derived: Derived; hover: Pos | null }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tapTile = useClient((s) => s.tapTile);
  const setHover = useClient((s) => s.setHover);
  const down = useRef<{ x: number; y: number } | null>(null);
  const count = state.width * state.depth;
  const base = level * count;
  const tiles = state.tiles;

  const tileOf = (instanceId: number): Pos | null => {
    const t = tiles[base + instanceId];
    return t ? { x: t.x, y: t.y, level: t.level } : null;
  };

  // Matrices change only with the map (doors opening), colours with every state.
  const doorKey = useMemo(() => {
    let k = '';
    for (let i = 0; i < count; i++) {
      const t = tiles[base + i]!;
      if (t.kind === 'door') k += t.open ? '1' : '0';
    }
    return k;
  }, [tiles, base, count]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const y0 = level * LEVEL_H;
    const wallH = level === active ? WALL_H_ACTIVE : LEVEL_H;
    for (let i = 0; i < count; i++) {
      const t: Tile = tiles[base + i]!;
      const cx = t.x + 0.5;
      const cz = t.y + 0.5;
      switch (t.kind) {
        case 'void':
          m.compose(new THREE.Vector3(cx, -1000, cz), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001));
          break;
        case 'ground':
          m.compose(new THREE.Vector3(cx, y0 - 0.06, cz), new THREE.Quaternion(), new THREE.Vector3(0.98, 0.12, 0.98));
          break;
        case 'floor':
          m.compose(new THREE.Vector3(cx, y0 - 0.07, cz), new THREE.Quaternion(), new THREE.Vector3(0.96, 0.14, 0.96));
          break;
        case 'wall':
          m.compose(new THREE.Vector3(cx, y0 + wallH / 2 - 0.07, cz), new THREE.Quaternion(), new THREE.Vector3(1, wallH, 1));
          break;
        case 'door':
          if (t.open) m.compose(new THREE.Vector3(cx, y0 - 0.05, cz), new THREE.Quaternion(), new THREE.Vector3(0.9, 0.1, 0.9));
          else m.compose(new THREE.Vector3(cx, y0 + wallH * 0.4 - 0.07, cz), new THREE.Quaternion(), new THREE.Vector3(0.7, wallH * 0.8, 0.7));
          break;
        case 'stair':
          m.compose(new THREE.Vector3(cx, y0 + 0.12, cz), new THREE.Quaternion(), new THREE.Vector3(0.9, 0.38, 0.9));
          break;
      }
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, base, count, level, active, doorKey]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    const dim = level < active ? 0.62 : 1;
    for (let i = 0; i < count; i++) {
      const t = tiles[base + i]!;
      const idx = base + i;
      if (t.kind === 'void') {
        mesh.setColorAt(i, c.set('#000000'));
        continue;
      }
      const src = t.kind === 'door' ? (t.open ? PALETTE.doorOpen : PALETTE.door) : PALETTE[t.kind];
      c.copy(src);
      if (!derived.visible.has(idx)) c.lerp(PALETTE.hidden, 0.55);
      if (derived.reach.has(idx)) c.lerp(PALETTE.reach, 0.5);
      if (derived.path.has(idx)) c.lerp(PALETTE.path, 0.7);
      if (hover && hover.level === t.level && hover.x === t.x && hover.y === t.y) c.lerp(PALETTE.hover, 0.6);
      c.multiplyScalar(dim);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tiles, base, count, level, active, derived, hover]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    live.tileMeshes.push(mesh);
    live.tileOfInstance.set(mesh, tileOf);
    return () => {
      live.tileMeshes = live.tileMeshes.filter((m) => m !== mesh);
      live.tileOfInstance.delete(mesh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, base]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0 || e.instanceId === undefined) return;
    const d = down.current;
    down.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // a drag, not a tap
    const p = tileOf(e.instanceId);
    if (p) tapTile(p);
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    setHover(tileOf(e.instanceId));
  };
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(null);
  };

  return (
    <instancedMesh
      ref={ref}
      args={[BOX, undefined, count]}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      frustumCulled={false}
    >
      <meshStandardMaterial roughness={0.85} metalness={0.05} />
    </instancedMesh>
  );
}

export function Tiles({ state, derived }: { state: State; derived: Derived }) {
  const active = useClient((s) => s.level);
  const hover = useClient((s) => s.hover);
  const levels: number[] = [];
  for (let l = 0; l <= Math.min(active, state.levels - 1); l++) levels.push(l);
  return (
    <group>
      {levels.map((l) => (
        <LevelTiles key={l} state={state} level={l} active={active} derived={derived} hover={hover} />
      ))}
    </group>
  );
}
