// The battlefield tiles: one instanced pick mesh per level (KB recipe: instancing from the start; a city block is
// 3,600 tiles a level), and the ONLY objects with pointer handlers (KB rule 25). Every tile carries a level
// (MAP-1); levels above the active one are not drawn (the cut-away), levels below are dimmed.
// The pick mesh is also the structural body of every tile (wall, slab, sill, frame, tread, rubble bed) coloured by
// the building's style; the dressing on top (cornices, panes, leaves, steps, chunks, scorch) is the tile set's
// instanced layers (tileset.ts), which carry no handlers and no raycast.
// Overlays: visibility from query.visibleTiles, the hover path from query.path, the charge footprint from
// query.blastPreview; damage darkens a tile by its hp against its material's (STR-3).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { MAPS, MATERIALS } from '../../data';
import { query, tileIndex, type Pos, type State, type Tile } from '../../engine';
import { useClient } from '../store';
import { LEVEL_H, live } from './world';
import { OVERLAY, WALL_H_ACTIVE, baseColour, buildingIndex, fillLayers, layerCapacity, makeLayers, styleAt, type Layer, type LayerKind } from './tileset';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const NO_RAYCAST = () => undefined;

export interface Derived {
  visible: Set<number>;
  path: Set<number>;
  blast: Set<number>;
}

export function useBoardDerived(agency: State | null, selected: string | null, hover: Pos | null, mode: 'normal' | 'blast' | 'suppress' | 'capture' | 'evacuate'): Derived {
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
  const map = MAPS[state.mapId];
  const bIndex = useMemo(() => (map ? buildingIndex(map) : null), [map]);

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
          m.compose(V.set(cx, y0 - 0.06, cz), Q, S.set(1, 0.12, 1));
          break;
        case 'floor':
          m.compose(V.set(cx, y0 - 0.07, cz), Q, S.set(1, 0.14, 1));
          break;
        case 'wall':
          m.compose(V.set(cx, y0 + wallH / 2 - 0.07, cz), Q, S.set(1, wallH, 1));
          break;
        case 'window':
          // The sill and spandrel under the pane; the pane itself is the glass layer.
          m.compose(V.set(cx, y0 + wallH * 0.17 - 0.07, cz), Q, S.set(1, wallH * 0.34, 1));
          break;
        case 'door':
          // The frame: a full-height jamb pair drawn as one thinner box; the leaf is a layer.
          if (t.open) m.compose(V.set(cx, y0 - 0.05, cz), Q, S.set(0.9, 0.1, 0.9));
          else m.compose(V.set(cx, y0 + wallH * 0.44 - 0.07, cz), Q, S.set(0.92, wallH * 0.88, 0.3));
          break;
        case 'stair':
          m.compose(V.set(cx, y0 + 0.01, cz), Q, S.set(0.96, 0.16, 0.96));
          break;
        case 'rubble':
          m.compose(V.set(cx, y0 - 0.02, cz), Q, S.set(0.96, 0.1, 0.96));
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
    const dim = level < active ? 0.82 : 1;
    for (let i = 0; i < count; i++) {
      const t = tiles[base + i]!;
      const idx = base + i;
      if (t.kind === 'void') {
        mesh.setColorAt(i, c.set('#000000'));
        continue;
      }
      const where = bIndex ? styleAt(bIndex, state.width, t.x, t.y) : { style: 'street' as const, building: null };
      baseColour(t, where.style, !!where.building && level === where.building.floors, c);
      // Damage shows: a tile darkens as its hp falls below its material's (STR-3).
      const max = MATERIALS[t.material]?.hp ?? 0;
      if (max > 0 && t.hp < max) c.lerp(OVERLAY.scorch, 0.55 * (1 - t.hp / max));
      if (!derived.visible.has(idx)) c.lerp(OVERLAY.hidden, 0.42);
      if (derived.path.has(idx)) c.lerp(OVERLAY.path, 0.7);
      if (derived.blast.has(idx)) c.lerp(OVERLAY.blast, 0.65);
      if (hover && hover.level === t.level && hover.x === t.x && hover.y === t.y) c.lerp(OVERLAY.hover, 0.55);
      c.multiplyScalar(dim);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tiles, base, count, level, active, derived, hover, bIndex, state.width]);

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
    if (p) tapTile(p, { shift: e.shiftKey });
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

/** One instanced mesh per tile-set layer, refilled when the tiles or the cut-away change (never per frame). */
function DressingLayer({ layer }: { layer: Layer }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = layer.count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  // The buffers are the layer's own arrays: filling them in place and flagging needsUpdate is the whole upload.
  const matrixAttr = useMemo(() => new THREE.InstancedBufferAttribute(layer.matrices, 16), [layer]);
  const colourAttr = useMemo(() => new THREE.InstancedBufferAttribute(layer.colours, 3), [layer]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix = matrixAttr;
    mesh.instanceColor = colourAttr;
  }, [matrixAttr, colourAttr]);
  return <instancedMesh ref={ref} args={[layer.geometry, layer.material, layer.capacity]} raycast={NO_RAYCAST} frustumCulled={false} />;
}

function Dressing({ state, active }: { state: State; active: number }) {
  const map = MAPS[state.mapId];
  // Capacity is a property of the map, so the buffers live for the whole battle.
  const layers = useMemo(() => makeLayers(layerCapacity(state)), [state.mapId, state.width, state.depth, state.levels]); // eslint-disable-line react-hooks/exhaustive-deps
  // Filled during render, before the layer meshes commit, so each mesh reads its final count; the fill is a pure
  // function of (tiles, active) into the layer's own buffers, so repeating it is harmless.
  useMemo(() => {
    if (!map) return;
    fillLayers(layers, { state, map, active });
    live.dressing = { layers: Object.values(layers), active };
  }, [layers, map, state.tiles, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      live.dressing = null;
    },
    [],
  );
  return (
    <group>
      {(Object.keys(layers) as LayerKind[]).map((k) => (
        <DressingLayer key={k} layer={layers[k]} />
      ))}
    </group>
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
      <Dressing state={state} active={active} />
    </group>
  );
}
