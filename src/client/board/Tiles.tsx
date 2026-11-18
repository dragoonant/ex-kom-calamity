// The battlefield tiles: one instanced mesh per level (KB recipe: instancing from the start; a city block is
// 3,600 tiles a level), and the ONLY objects with pointer handlers (KB rule 25). Every tile carries a level
// (MAP-1); levels above the active one are not drawn (the cut-away), levels below are dimmed.
// Colours: visibility from query.visibleTiles, the hover path from query.path, the charge footprint from
// query.blastPreview; damage darkens a tile by its hp against its material's.
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS } from '../../data';
import { query, tileIndex, type Pos, type State, type Tile } from '../../engine';
import { useClient } from '../store';
import { LEVEL_H, live } from './world';

const PALETTE = {
  ground: new THREE.Color('#aab3a8'),
  floor: new THREE.Color('#e6dcc6'),
  wall: new THREE.Color('#a8624a'),
  door: new THREE.Color('#b8743a'),
  doorOpen: new THREE.Color('#d7b07a'),
  stair: new THREE.Color('#d9a62e'),
  window: new THREE.Color('#a9d6e2'),
  rubble: new THREE.Color('#8a7f73'),
  void: new THREE.Color('#000000'),
  path: new THREE.Color('#e4b43a'),
  blast: new THREE.Color('#d9533f'),
  hover: new THREE.Color('#ffffff'),
  hidden: new THREE.Color('#3a4446'),
  scorch: new THREE.Color('#2b2f33'),
};
const WALL_BRICK = new THREE.Color('#a8624a');
const WALL_PLASTER = new THREE.Color('#d9d2c0');
const WALL_STEEL = new THREE.Color('#7d8a94');
const WALL_H_ACTIVE = 0.9;
const BOX = new THREE.BoxGeometry(1, 1, 1);

export interface Derived {
  visible: Set<number>;
  path: Set<number>;
  blast: Set<number>;
}

export function useBoardDerived(agency: State | null, selected: string | null, hover: Pos | null, mode: 'normal' | 'blast'): Derived {
  const visible = useMemo(() => {
    const s = new Set<number>();
    if (agency) for (const p of query.visibleTiles(agency, 'agency')) s.add(tileIndex(agency, p));
    return s;
  }, [agency]);
  const path = useMemo(() => {
    const s = new Set<number>();
    if (agency && selected && hover && mode === 'normal') {
      const r = query.path(agency, selected, hover);
      if (r) for (const p of r.steps) s.add(tileIndex(agency, p));
    }
    return s;
  }, [agency, selected, hover, mode]);
  const blast = useMemo(() => {
    const s = new Set<number>();
    if (agency && selected && hover && mode === 'blast') {
      const r = query.blastPreview(agency, selected, hover);
      if (r.ok) for (const p of r.tiles) s.add(tileIndex(agency, p));
    }
    return s;
  }, [agency, selected, hover, mode]);
  return { visible, path, blast };
}

const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

function LevelTiles({ state, level, active, derived, hover }: { state: State; level: number; active: number; derived: Derived; hover: Pos | null }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tapTile = useClient((s) => s.tapTile);
  const setHover = useClient((s) => s.setHover);
  const down = useRef<{ x: number; y: number } | null>(null);
  const count = state.width * state.depth;
  const base = level * count;
  const tiles = state.tiles;
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  const tileOf = (instanceId: number): Pos | null => {
    const t = tilesRef.current[base + instanceId];
    return t && t.kind !== 'void' ? { x: t.x, y: t.y, level: t.level } : null;
  };

  // Matrices change only when the map changes (doors, destruction) or the cut-away level moves.
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
          m.compose(V.set(cx, -1000, cz), Q, S.set(0.001, 0.001, 0.001));
          break;
        case 'ground':
          m.compose(V.set(cx, y0 - 0.06, cz), Q, S.set(0.98, 0.12, 0.98));
          break;
        case 'floor':
          m.compose(V.set(cx, y0 - 0.07, cz), Q, S.set(0.97, 0.14, 0.97));
          break;
        case 'wall':
          m.compose(V.set(cx, y0 + wallH / 2 - 0.07, cz), Q, S.set(1, wallH, 1));
          break;
        case 'window':
          m.compose(V.set(cx, y0 + wallH * 0.3 - 0.07, cz), Q, S.set(1, wallH * 0.6, 1));
          break;
        case 'door':
          if (t.open) m.compose(V.set(cx, y0 - 0.05, cz), Q, S.set(0.9, 0.1, 0.9));
          else m.compose(V.set(cx, y0 + wallH * 0.4 - 0.07, cz), Q, S.set(0.72, wallH * 0.8, 0.72));
          break;
        case 'stair':
          m.compose(V.set(cx, y0 + 0.12, cz), Q, S.set(0.9, 0.38, 0.9));
          break;
        case 'rubble':
          m.compose(V.set(cx, y0 + 0.02, cz), Q, S.set(0.86, 0.22, 0.86));
          break;
      }
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles, base, count, level, active]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    const dim = level < active ? 0.8 : 1;
    for (let i = 0; i < count; i++) {
      const t = tiles[base + i]!;
      const idx = base + i;
      if (t.kind === 'void') {
        mesh.setColorAt(i, PALETTE.void);
        continue;
      }
      if (t.kind === 'wall') c.copy(t.material === 'plaster' ? WALL_PLASTER : t.material === 'steel' ? WALL_STEEL : WALL_BRICK);
      else if (t.kind === 'door') c.copy(t.open ? PALETTE.doorOpen : PALETTE.door);
      else c.copy(PALETTE[t.kind]);
      // Damage shows: a tile darkens as its hp falls below its material's (STR-3).
      const max = MATERIALS[t.material]?.hp ?? 0;
      if (max > 0 && t.hp < max) c.lerp(PALETTE.scorch, 0.55 * (1 - t.hp / max));
      if (!derived.visible.has(idx)) c.lerp(PALETTE.hidden, 0.42);
      if (derived.path.has(idx)) c.lerp(PALETTE.path, 0.7);
      if (derived.blast.has(idx)) c.lerp(PALETTE.blast, 0.65);
      if (hover && hover.level === t.level && hover.x === t.x && hover.y === t.y) c.lerp(PALETTE.hover, 0.55);
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
  }, [base]);

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
