// The tile set (docs/art/tile-set.md; PLAN.md D16, D11): pure geometry and colour for the block's buildings,
// streets and props. No React here, so vitest can measure it. Everything is instanced: the pick mesh per level
// (Tiles.tsx) stays the only thing with pointer handlers (KB rule 25); every layer here is dressing that reads the
// engine's tiles and the map's MAP-9 styles and props, and never carries a handler or a raycast.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, type BuildingDef, type BuildingStyle, type MapDef, type PropDef, type PropKind } from '../../data';
import type { State, Tile } from '../../engine';

export const LEVEL_H = 2.0;
/** Wall height on the active (cut-away) level: low enough to see into the rooms (M2). */
export const WALL_H_ACTIVE = 0.9;

// ---------------------------------------------------------------------------------------------------------
// Palette per building style, in the D11 register: enamel, teal, coral, mustard, graphite, with the block's
// own materials (brick, plaster, steel) carried through.

export interface StylePalette {
  /** Outer brick or steel walls. */
  wall: string;
  /** Interior plaster partitions. */
  partition: string;
  /** Cornice strip on top of a wall and the sill under a window. */
  trim: string;
  /** Plinth band at the foot of a wall. */
  plinth: string;
  floor: string;
  /** Second floor colour for a chequer or carpet runner. */
  floorAlt: string;
  roof: string;
  door: string;
  /** Lit window glow at evening. */
  glow: string;
  /** An unlit window. */
  glass: string;
  /** Furniture body and its lighter top. */
  wood: string;
  woodLight: string;
  /** Painted metal (lockers, machines, racks). */
  metal: string;
  accent: string;
}

export const STYLE_PALETTE: Record<BuildingStyle | 'street', StylePalette> = {
  residential: { wall: '#b86a4c', partition: '#e6dcc6', trim: '#efe6cf', plinth: '#6b4a3c', floor: '#d9c9a8', floorAlt: '#c9b48e', roof: '#7d7466', door: '#5f3e2c', glow: '#ffc478', glass: '#8fb2bd', wood: '#8a5a3c', woodLight: '#c9a070', metal: '#9aa3a8', accent: '#3f7f82' },
  office: { wall: '#c4b79b', partition: '#eee8d8', trim: '#f4efe2', plinth: '#5a6066', floor: '#cfd3cf', floorAlt: '#b9c1bd', roof: '#6e7378', door: '#3f7f82', glow: '#dfe9c8', glass: '#9cc2cc', wood: '#6f5a46', woodLight: '#b9a68a', metal: '#8d959b', accent: '#d9a62e' },
  bank: { wall: '#9c8d78', partition: '#ece4d2', trim: '#d9dde0', plinth: '#3b3f44', floor: '#b9a98f', floorAlt: '#8f7f66', roof: '#6b6a66', door: '#2f5f62', wood: '#5a3b2a', woodLight: '#a8805a', glow: '#ffd27a', glass: '#a9c3c9', metal: '#6f7a80', accent: '#a93a2b' },
  depot: { wall: '#7d8a94', partition: '#d9d2c0', trim: '#aab3b8', plinth: '#3b3f44', floor: '#9a9a94', floorAlt: '#8b8b85', roof: '#5f666c', door: '#d9a62e', glow: '#fff1c0', glass: '#8fa6ad', wood: '#8a6b4a', woodLight: '#c2a27a', metal: '#5f6a70', accent: '#d9533f' },
  automat: { wall: '#e0c9a6', partition: '#f4ece0', trim: '#fff5e0', plinth: '#a93a2b', floor: '#f0e6d2', floorAlt: '#3f7f82', roof: '#8a8072', door: '#d9533f', glow: '#ffe9a0', glass: '#b6d6dc', wood: '#a67c52', woodLight: '#e0bf8f', metal: '#d9dde0', accent: '#3fae63' },
  street: { wall: '#a8624a', partition: '#d9d2c0', trim: '#c9b98f', plinth: '#5a6066', floor: '#aab3a8', floorAlt: '#9aa39a', roof: '#8a7f73', door: '#b8743a', glow: '#ffd98a', glass: '#a9d6e2', wood: '#7a5a3c', woodLight: '#b08a5a', metal: '#6f7a80', accent: '#3f7f82' },
};

/** Overlays shared by every style. */
export const OVERLAY = {
  path: new THREE.Color('#e4b43a'),
  blast: new THREE.Color('#d9533f'),
  hover: new THREE.Color('#ffffff'),
  hidden: new THREE.Color('#3a4446'),
  lamplight: new THREE.Color('#ffd9a0'),
  scorch: new THREE.Color('#2b2f33'),
  crack: new THREE.Color('#1b1b1f'),
  rubble: new THREE.Color('#8a7f73'),
  stair: new THREE.Color('#d9a62e'),
  doorOpen: new THREE.Color('#d7b07a'),
  pavingLine: new THREE.Color('#98a198'),
};

// ---------------------------------------------------------------------------------------------------------
// Which building a tile belongs to, by footprint (MAP-8), cached per map.

export interface BuildingIndex {
  /** Building per (y * width + x) footprint cell, or -1 for the street. */
  cell: Int16Array;
  buildings: BuildingDef[];
}

const indexCache = new WeakMap<MapDef, BuildingIndex>();

export function buildingIndex(map: MapDef): BuildingIndex {
  const hit = indexCache.get(map);
  if (hit) return hit;
  const cell = new Int16Array(map.width * map.depth).fill(-1);
  const buildings = map.buildings ?? [];
  buildings.forEach((b, i) => {
    for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) cell[y * map.width + x] = i;
  });
  const out = { cell, buildings };
  indexCache.set(map, out);
  return out;
}

export function styleAt(idx: BuildingIndex, width: number, x: number, y: number): { style: BuildingStyle | 'street'; building: BuildingDef | null } {
  const i = idx.cell[y * width + x] ?? -1;
  const b = i >= 0 ? idx.buildings[i]! : null;
  return { style: b?.style ?? (b ? 'residential' : 'street'), building: b };
}

/** Stable pseudo-random in [0, 1) from a tile's index: lit windows, rubble chunks, roof gravel. */
export function hash01(n: number): number {
  let h = (n + 0x9e3779b9) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------------------
// Destructible state of a tile (STR-2..4): the three looks every tile and prop has.

export type Damage = 'intact' | 'damaged' | 'rubble';

export function damageOf(t: Tile): Damage {
  if (t.kind === 'rubble' || t.kind === 'void') return 'rubble';
  const max = MATERIALS[t.material]?.hp ?? 0;
  return max > 0 && t.hp < max ? 'damaged' : 'intact';
}

/** 0 when intact, towards 1 as hp falls (STR-3). */
export function damageFraction(t: Tile): number {
  const max = MATERIALS[t.material]?.hp ?? 0;
  return max > 0 && t.hp < max ? 1 - t.hp / max : 0;
}

/** A tile that continues a wall line: a window or door sits in the run of these. */
function wallish(t: Tile | undefined): boolean {
  return !!t && (t.kind === 'wall' || t.kind === 'window' || t.kind === 'door');
}

/**
 * Yaw of a window (or door) so its pane lies in the wall it sits in: 0 when the wall runs east-west (the pane
 * faces north and south), a quarter turn when it runs north-south. Decided by the wall-like neighbours on the same
 * level; a tile with as many on each axis, or none, keeps the east-west default.
 */
export function openingYaw(tiles: readonly Tile[], width: number, depth: number, t: Tile): number {
  const base = t.level * width * depth;
  const at = (x: number, y: number): Tile | undefined => (x < 0 || y < 0 || x >= width || y >= depth ? undefined : tiles[base + y * width + x]);
  const ew = (wallish(at(t.x - 1, t.y)) ? 1 : 0) + (wallish(at(t.x + 1, t.y)) ? 1 : 0);
  const ns = (wallish(at(t.x, t.y - 1)) ? 1 : 0) + (wallish(at(t.x, t.y + 1)) ? 1 : 0);
  return ns > ew ? Math.PI / 2 : 0;
}

// ---------------------------------------------------------------------------------------------------------
// Instance layers. One InstancedMesh per layer across every drawn level; `fill` writes matrices and colours.

export type LayerKind = 'trim' | 'plinth' | 'glass' | 'mullion' | 'leaf' | 'step' | 'chunk' | 'scorch' | 'crack' | 'kerb' | 'gravel';

export interface Layer {
  kind: LayerKind;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Instances written so far. */
  count: number;
  matrices: Float32Array;
  colours: Float32Array;
  capacity: number;
}

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const C = new THREE.Color();
const E = new THREE.Euler();

function push(layer: Layer, x: number, y: number, z: number, sx: number, sy: number, sz: number, colour: THREE.Color | string, yaw = 0, pitch = 0, roll = 0): void {
  if (layer.count >= layer.capacity) return;
  E.set(pitch, yaw, roll);
  Q.setFromEuler(E);
  M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
  M.toArray(layer.matrices, layer.count * 16);
  if (typeof colour === 'string') C.set(colour);
  else C.copy(colour);
  layer.colours[layer.count * 3] = C.r;
  layer.colours[layer.count * 3 + 1] = C.g;
  layer.colours[layer.count * 3 + 2] = C.b;
  layer.count += 1;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

/** The most crack segments one tile can carry (see pushCracks). */
export const CRACK_SEGMENTS_MAX = 12;

/**
 * D21: zigzag fissures on the faces of a damaged tile, by a stable draw per tile so they never flicker as the board
 * refills: 1 crack per face at a scratch, more as it weakens, each 2 or 3 thin dark segments at alternating angles, at
 * most CRACK_SEGMENTS_MAX over the tile.
 * `half` is the distance of the faces from the centre (a wall's four faces; a pane's two, `paneOnly`).
 */
export function pushCracks(layer: Layer, cx: number, y0: number, cz: number, h: number, dmg: number, seed: number, half: number, paneOnly = false, paneYaw = 0): void {
  const perFace = dmg < 0.34 ? 1 : dmg < 0.67 ? 2 : 3;
  // A pane cracks on its two faces only: north and south, or east and west when the window is turned (openingYaw).
  const faces = paneOnly ? (paneYaw ? [1, 3] : [0, 2]) : [0, 1, 2, 3];
  const perFaceMax = Math.floor(CRACK_SEGMENTS_MAX / faces.length);
  for (const f of faces) {
    let k = 0;
    for (let c = 0; c < perFace; c++) {
      const r = (n: number) => hash01(seed * 31 + f * 7 + c * 131 + n * 977);
      let u = (r(1) - 0.5) * 0.6; // along the face
      let v = h * (0.25 + r(2) * 0.5); // height up the face
      let ang = (r(3) - 0.5) * 1.6;
      const segs = 2 + (r(4) < 0.5 ? 1 : 0);
      for (let sgi = 0; sgi < segs && k < perFaceMax; sgi++, k++) {
        const len = 0.18 + r(5 + sgi) * (0.15 + 0.25 * dmg);
        const du = Math.sin(ang) * len;
        const dv = Math.cos(ang) * len;
        const mu = u + du / 2;
        const mv = v + dv / 2;
        // Face 0: +z, 1: +x, 2: -z, 3: -x; each crack lies flat on its face and turns in the face's plane.
        const [x, z, yaw] = f === 0 ? [cx + mu, cz + half, 0] : f === 1 ? [cx + half, cz - mu, Math.PI / 2] : f === 2 ? [cx - mu, cz - half, Math.PI] : [cx - half, cz + mu, -Math.PI / 2];
        push(layer, x, y0 + mv, z, 0.035, len, 0.012, OVERLAY.crack, yaw, 0, -ang);
        u += du;
        v += dv;
        ang = -ang * (0.6 + r(9 + sgi) * 0.6) + (r(12 + sgi) - 0.5) * 0.5;
      }
    }
  }
}

function std(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, ...opts });
}

/** The materials each layer draws with. The glass glows (window light at evening, D11). */
export function makeLayers(capacity: Record<LayerKind, number>): Record<LayerKind, Layer> {
  const mk = (kind: LayerKind, material: THREE.Material, geometry: THREE.BufferGeometry = BOX): Layer => ({
    kind,
    geometry,
    material,
    count: 0,
    matrices: new Float32Array(Math.max(1, capacity[kind]) * 16),
    colours: new Float32Array(Math.max(1, capacity[kind]) * 3),
    capacity: Math.max(1, capacity[kind]),
  });
  return {
    trim: mk('trim', std({ roughness: 0.6 })),
    plinth: mk('plinth', std({ roughness: 0.9 })),
    glass: mk('glass', std({ roughness: 0.15, metalness: 0.2, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, transparent: true, opacity: 0.85 })),
    mullion: mk('mullion', std({ roughness: 0.5, metalness: 0.3 })),
    leaf: mk('leaf', std({ roughness: 0.7 })),
    step: mk('step', std({ roughness: 0.85 })),
    chunk: mk('chunk', std({ roughness: 0.95 })),
    scorch: mk('scorch', std({ roughness: 1, color: '#000000' })),
    // D21: fissures on a damaged wall or pane, unlit so they read dark in any light.
    crack: mk('crack', new THREE.MeshBasicMaterial({ color: '#ffffff' })),
    kerb: mk('kerb', std({ roughness: 0.9 })),
    gravel: mk('gravel', std({ roughness: 1 })),
  };
}

/** Counts the instances each layer needs for a map, so buffers are allocated once per battle. */
export function layerCapacity(state: Pick<State, 'tiles' | 'width' | 'depth'>): Record<LayerKind, number> {
  let walls = 0;
  let windows = 0;
  let doors = 0;
  let stairs = 0;
  let breakable = 0;
  let ground = 0;
  let roofish = 0;
  for (const t of state.tiles) {
    if (t.kind === 'wall') walls++;
    else if (t.kind === 'window') windows++;
    else if (t.kind === 'door') doors++;
    else if (t.kind === 'stair') stairs++;
    else if (t.kind === 'ground') ground++;
    else if (t.kind === 'floor' && t.level > 0) roofish++;
    if ((MATERIALS[t.material]?.hp ?? 0) > 0) breakable++;
  }
  // Every breakable tile may end as rubble (3 chunks) or damaged (1 scorch band); windows add two mullions.
  return {
    trim: walls + windows + doors,
    plinth: walls,
    glass: windows,
    mullion: windows * 2,
    leaf: doors,
    step: stairs * 4,
    chunk: breakable * 3,
    scorch: breakable,
    crack: breakable * CRACK_SEGMENTS_MAX,
    kerb: Math.ceil(ground / 6) + 64,
    gravel: Math.ceil(roofish / 8) + 64,
  };
}

export interface FillInput {
  state: State;
  map: MapDef;
  /** The cut-away level: levels above it are not drawn, this one has low walls. */
  active: number;
}

/**
 * Writes every layer's instances for the levels 0..active. Called when the tiles change (destruction, doors)
 * or the cut-away moves; never per frame.
 */
export function fillLayers(layers: Record<LayerKind, Layer>, input: FillInput): void {
  const { state, map, active } = input;
  for (const l of Object.values(layers)) l.count = 0;
  const idx = buildingIndex(map);
  const w = state.width;
  const perLevel = w * state.depth;
  const topLevel = Math.min(active, state.levels - 1);
  for (let level = 0; level <= topLevel; level++) {
    const y0 = level * LEVEL_H;
    const wallH = level === active ? WALL_H_ACTIVE : LEVEL_H;
    const base = level * perLevel;
    for (let i = 0; i < perLevel; i++) {
      const t = state.tiles[base + i]!;
      if (t.kind === 'void') continue;
      const cx = t.x + 0.5;
      const cz = t.y + 0.5;
      const { style, building } = styleAt(idx, w, t.x, t.y);
      const pal = STYLE_PALETTE[style];
      const isRoof = !!building && level === building.floors;
      const dmg = damageFraction(t);
      switch (t.kind) {
        case 'wall': {
          // Cornice on top, plinth at the foot; partitions get a lighter, thinner cornice.
          const partition = t.material === 'plaster';
          push(layers.trim, cx, y0 + wallH - 0.1, cz, partition ? 1.0 : 1.08, 0.08, partition ? 1.0 : 1.08, partition ? pal.partition : pal.trim);
          if (!partition) push(layers.plinth, cx, y0 + 0.03, cz, 1.06, 0.14, 1.06, pal.plinth);
          // D21: a weakened wall cracks first (more fissures as it weakens) and chars only when nearly gone.
          if (dmg > 0) pushCracks(layers.crack, cx, y0, cz, wallH, dmg, base + i, 0.505);
          if (dmg > 0.5) push(layers.scorch, cx, y0 + wallH * 0.3, cz, 1.03, wallH * 0.4 * (dmg - 0.3), 1.03, OVERLAY.scorch);
          break;
        }
        case 'window': {
          // Pane in the upper part of the opening, a cross mullion, a sill; lit at evening by a stable draw.
          // The pane lies in the wall's own line: turned a quarter when the wall runs north-south.
          const lit = hash01(base + i) < 0.62;
          const h = wallH * 0.55;
          const yaw = openingYaw(state.tiles, w, state.depth, t);
          push(layers.glass, cx, y0 + wallH * 0.62, cz, 0.86, h, 0.14, lit ? pal.glow : pal.glass, yaw);
          push(layers.mullion, cx, y0 + wallH * 0.62, cz, 0.08, h + 0.02, 0.18, pal.trim, yaw);
          push(layers.mullion, cx, y0 + wallH * 0.62, cz, 0.9, 0.06, 0.18, pal.trim, yaw);
          push(layers.trim, cx, y0 + wallH * 0.33, cz, 1.08, 0.08, 1.08, pal.trim);
          if (dmg > 0) pushCracks(layers.crack, cx, y0 + wallH * 0.38, cz, h, dmg * 0.6, base + i, 0.08, true, yaw);
          break;
        }
        case 'door': {
          // Lintel over the frame; the leaf swings open on its hinge when used (MAP-3).
          push(layers.trim, cx, y0 + wallH * 0.86, cz, 1.0, 0.1, 1.0, pal.trim);
          const leafH = wallH * 0.78;
          if (t.open) {
            // Hinged at the west jamb, swung into the tile's south half.
            push(layers.leaf, cx - 0.36, y0 + leafH / 2, cz + 0.3, 0.1, leafH, 0.68, pal.door);
          } else {
            push(layers.leaf, cx, y0 + leafH / 2, cz, 0.76, leafH, 0.12, pal.door);
            push(layers.mullion, cx + 0.22, y0 + leafH * 0.5, cz + 0.08, 0.08, 0.08, 0.06, pal.metal);
          }
          if (dmg > 0) push(layers.scorch, cx, y0 + leafH * 0.4, cz, 0.5, leafH * 0.5 * dmg + 0.1, 0.16, OVERLAY.scorch);
          break;
        }
        case 'stair': {
          // Four steps rising along x; the pick box beneath is the tread's base.
          for (let k = 0; k < 4; k++) {
            const sh = 0.12 + k * 0.1;
            push(layers.step, cx - 0.33 + k * 0.22, y0 + sh / 2 + 0.02, cz, 0.22, sh, 0.9, k % 2 ? pal.floorAlt : pal.floor);
          }
          push(layers.mullion, cx, y0 + 0.5, cz - 0.44, 0.9, 0.05, 0.05, pal.metal);
          break;
        }
        case 'rubble': {
          // Three chunks in the colour of what fell, laid at stable angles.
          const r0 = hash01(base + i);
          const r1 = hash01(base + i + 7919);
          const r2 = hash01(base + i + 104729);
          const col = style === 'street' ? OVERLAY.rubble : pal.wall;
          push(layers.chunk, cx - 0.25 + r0 * 0.5, y0 + 0.1, cz - 0.2 + r1 * 0.4, 0.42, 0.2, 0.3, col, r0 * 3.1, 0, r2 * 0.3);
          push(layers.chunk, cx + 0.15 - r1 * 0.3, y0 + 0.08, cz + 0.2 - r2 * 0.4, 0.3, 0.16, 0.26, pal.partition, r1 * 3.1, 0.2 * r0, 0);
          push(layers.chunk, cx - 0.1 + r2 * 0.2, y0 + 0.18, cz + 0.1 - r0 * 0.2, 0.22, 0.14, 0.2, OVERLAY.scorch, r2 * 3.1, 0, 0.4 * r1);
          break;
        }
        case 'floor': {
          if (dmg > 0) push(layers.scorch, cx, y0 + 0.005, cz, 0.6 + 0.3 * dmg, 0.02, 0.6 + 0.3 * dmg, OVERLAY.scorch, hash01(base + i) * 3);
          // Roof gravel: a few low pale pebbles on roofs, spaced by a stable draw.
          if (isRoof && hash01(base + i) < 0.12) push(layers.gravel, cx + hash01(base + i + 1) * 0.5 - 0.25, y0 + 0.02, cz + hash01(base + i + 2) * 0.5 - 0.25, 0.14, 0.05, 0.1, pal.trim, hash01(base + i + 3) * 3);
          break;
        }
        case 'ground': {
          // Kerb lines: a pale paving seam every sixth tile, running north-south and east-west.
          if (t.x % 6 === 0 && t.y % 6 !== 0) push(layers.kerb, cx - 0.49, y0 + 0.001, cz, 0.04, 0.012, 1, OVERLAY.pavingLine);
          if (t.y % 6 === 0) push(layers.kerb, cx, y0 + 0.001, cz - 0.49, 1, 0.012, 0.04, OVERLAY.pavingLine);
          break;
        }
        default:
          break;
      }
    }
  }
}

/** The pick mesh's colour for a tile before overlays: the body of a wall, the slab of a floor, the roof, the street. */
export function baseColour(t: Tile, style: BuildingStyle | 'street', isRoof: boolean, out: THREE.Color): THREE.Color {
  const pal = STYLE_PALETTE[style];
  switch (t.kind) {
    case 'ground':
      return out.set(pal.floor);
    case 'floor':
      if (isRoof) return out.set(pal.roof);
      // Chequer for the automat, a carpet runner stripe for the bank, plain elsewhere.
      if (style === 'automat') return out.set((t.x + t.y) % 2 ? pal.floorAlt : pal.floor);
      if (style === 'bank' && t.level === 0 && (t.x + t.y) % 5 === 0) return out.set(pal.floorAlt);
      return out.set(pal.floor);
    case 'wall':
      return out.set(t.material === 'plaster' ? pal.partition : t.material === 'steel' ? STYLE_PALETTE.depot.wall : pal.wall);
    case 'window':
      return out.set(t.material === 'plaster' ? pal.partition : pal.wall);
    case 'door':
      return out.copy(t.open ? OVERLAY.doorOpen : out.set(pal.trim));
    case 'stair':
      return out.copy(OVERLAY.stair);
    case 'rubble':
      return out.copy(OVERLAY.rubble);
    default:
      return out.set('#000000');
  }
}

// ---------------------------------------------------------------------------------------------------------
// Props: one merged, vertex-coloured geometry per kind, so a many-part desk is one instance in one draw.

interface Part {
  /** Centre and size in tile units; the prop stands on y = 0 and faces +z (south) at yaw 0. */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  colour: string;
  /** 'box' (default) or 'cyl' (a vertical cylinder of radius sx/2 and height sy). */
  shape?: 'box' | 'cyl';
  /** Tilt about x in radians (sign boards). */
  tilt?: number;
}

function boxPart(p: Part): THREE.BufferGeometry {
  const g = p.shape === 'cyl' ? new THREE.CylinderGeometry(p.sx / 2, p.sx / 2, p.sy, 10) : new THREE.BoxGeometry(p.sx, p.sy, p.sz);
  if (p.tilt) g.rotateX(p.tilt);
  g.translate(p.x, p.y, p.z);
  const n = g.getAttribute('position').count;
  const col = new THREE.Color(p.colour);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merged(parts: Part[]): THREE.BufferGeometry {
  const gs = parts.map(boxPart);
  // Merged geometry must share attributes; drop uv so cylinders and boxes merge cleanly.
  for (const g of gs) g.deleteAttribute('uv');
  const out = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  if (!out) throw new Error('prop merge failed');
  return out;
}

const WOOD = STYLE_PALETTE.street.wood;
const WOOD_LIGHT = STYLE_PALETTE.street.woodLight;
const METAL = '#8d959b';
const DARK = '#2b2f33';
const CREAM = '#efe6cf';
const TEAL = '#3f7f82';
const CORAL = '#d9533f';
const MUSTARD = '#d9a62e';
const GREEN = '#4f8a5a';
const GLOW = '#ffd98a';

/** The prop catalogue (docs/art/tile-set.md section 3). Sizes in tiles; a figure is 1.2 tall. */
export const PROP_PARTS: Record<PropKind, Part[]> = {
  desk: [
    { x: 0, y: 0.46, z: 0, sx: 0.9, sy: 0.06, sz: 0.5, colour: WOOD_LIGHT },
    { x: -0.38, y: 0.22, z: 0, sx: 0.08, sy: 0.44, sz: 0.44, colour: WOOD },
    { x: 0.38, y: 0.22, z: 0, sx: 0.08, sy: 0.44, sz: 0.44, colour: WOOD },
    { x: 0.2, y: 0.56, z: -0.1, sx: 0.3, sy: 0.14, sz: 0.2, colour: CREAM }, // a desk set: tray and lamp base
    { x: -0.25, y: 0.62, z: -0.12, sx: 0.08, sy: 0.26, sz: 0.08, colour: METAL },
    { x: -0.25, y: 0.76, z: -0.08, sx: 0.22, sy: 0.07, sz: 0.18, colour: TEAL },
  ],
  counter: [
    { x: 0, y: 0.5, z: 0, sx: 0.96, sy: 0.08, sz: 0.56, colour: WOOD_LIGHT },
    { x: 0, y: 0.23, z: 0.05, sx: 0.92, sy: 0.46, sz: 0.44, colour: WOOD },
    { x: 0, y: 0.26, z: 0.28, sx: 0.8, sy: 0.2, sz: 0.02, colour: CREAM }, // enamel front panel
    { x: 0, y: 0.6, z: -0.14, sx: 0.3, sy: 0.12, sz: 0.2, colour: METAL }, // till
  ],
  shelf: [
    { x: -0.42, y: 0.6, z: 0, sx: 0.06, sy: 1.2, sz: 0.4, colour: METAL },
    { x: 0.42, y: 0.6, z: 0, sx: 0.06, sy: 1.2, sz: 0.4, colour: METAL },
    { x: 0, y: 0.3, z: 0, sx: 0.9, sy: 0.04, sz: 0.4, colour: METAL },
    { x: 0, y: 0.7, z: 0, sx: 0.9, sy: 0.04, sz: 0.4, colour: METAL },
    { x: 0, y: 1.1, z: 0, sx: 0.9, sy: 0.04, sz: 0.4, colour: METAL },
    { x: -0.2, y: 0.42, z: 0, sx: 0.3, sy: 0.2, sz: 0.3, colour: CREAM },
    { x: 0.22, y: 0.4, z: 0, sx: 0.26, sy: 0.16, sz: 0.3, colour: MUSTARD },
    { x: 0.1, y: 0.84, z: 0, sx: 0.5, sy: 0.24, sz: 0.3, colour: TEAL },
  ],
  bed: [
    { x: 0, y: 0.18, z: 0, sx: 0.8, sy: 0.12, sz: 0.96, colour: WOOD },
    { x: 0, y: 0.3, z: 0.05, sx: 0.74, sy: 0.12, sz: 0.8, colour: CREAM },
    { x: 0, y: 0.38, z: -0.3, sx: 0.5, sy: 0.08, sz: 0.24, colour: '#ffffff' }, // pillow
    { x: 0, y: 0.34, z: 0.2, sx: 0.74, sy: 0.06, sz: 0.5, colour: TEAL }, // blanket
    { x: 0, y: 0.45, z: -0.46, sx: 0.8, sy: 0.5, sz: 0.06, colour: WOOD }, // headboard
  ],
  locker: [
    { x: 0, y: 0.75, z: 0, sx: 0.8, sy: 1.5, sz: 0.44, colour: METAL },
    { x: -0.2, y: 0.75, z: 0.23, sx: 0.36, sy: 1.42, sz: 0.02, colour: TEAL },
    { x: 0.2, y: 0.75, z: 0.23, sx: 0.36, sy: 1.42, sz: 0.02, colour: TEAL },
    { x: -0.06, y: 0.9, z: 0.25, sx: 0.04, sy: 0.12, sz: 0.02, colour: CREAM },
    { x: 0.34, y: 0.9, z: 0.25, sx: 0.04, sy: 0.12, sz: 0.02, colour: CREAM },
  ],
  machine: [
    { x: 0, y: 0.8, z: 0, sx: 0.84, sy: 1.6, sz: 0.6, colour: CORAL },
    { x: 0, y: 1.0, z: 0.31, sx: 0.6, sy: 0.7, sz: 0.02, colour: GLOW }, // lit display
    { x: 0, y: 0.45, z: 0.31, sx: 0.5, sy: 0.16, sz: 0.02, colour: DARK }, // tray
    { x: 0.3, y: 0.6, z: 0.31, sx: 0.1, sy: 0.1, sz: 0.02, colour: MUSTARD },
    { x: 0, y: 1.56, z: 0, sx: 0.9, sy: 0.08, sz: 0.66, colour: METAL },
  ],
  lamp: [
    { x: 0, y: 1.6, z: 0, sx: 0.1, sy: 3.2, sz: 0.1, colour: TEAL, shape: 'cyl' },
    { x: 0, y: 0.08, z: 0, sx: 0.36, sy: 0.16, sz: 0.36, colour: DARK, shape: 'cyl' },
    { x: 0.25, y: 3.2, z: 0, sx: 0.5, sy: 0.08, sz: 0.08, colour: TEAL }, // arm
    { x: 0.45, y: 3.08, z: 0, sx: 0.3, sy: 0.22, sz: 0.3, colour: GLOW }, // the lamp head glows
    { x: 0.45, y: 3.24, z: 0, sx: 0.4, sy: 0.08, sz: 0.4, colour: CREAM }, // enamel shade
  ],
  'kiosk-sign': [
    { x: 0, y: 1.55, z: 0, sx: 0.06, sy: 1.3, sz: 0.06, colour: METAL },
    { x: 0, y: 2.0, z: 0, sx: 1.4, sy: 0.5, sz: 0.1, colour: CREAM },
    { x: 0, y: 2.0, z: 0.06, sx: 1.1, sy: 0.28, sz: 0.02, colour: CORAL }, // the lettering band
    { x: 0, y: 2.3, z: 0, sx: 1.5, sy: 0.08, sz: 0.16, colour: TEAL },
  ],
  bench: [
    { x: 0, y: 0.4, z: 0, sx: 0.96, sy: 0.06, sz: 0.4, colour: WOOD_LIGHT },
    { x: -0.4, y: 0.2, z: 0, sx: 0.06, sy: 0.4, sz: 0.36, colour: METAL },
    { x: 0.4, y: 0.2, z: 0, sx: 0.06, sy: 0.4, sz: 0.36, colour: METAL },
    { x: 0, y: 0.68, z: -0.18, sx: 0.96, sy: 0.3, sz: 0.05, colour: WOOD_LIGHT },
  ],
  vehicle: [
    // A parked saloon of the City of Tomorrow: a long rounded-off body with a bubble cabin, enamel two-tone, fins.
    { x: 0, y: 0.36, z: 0, sx: 0.9, sy: 0.4, sz: 1.9, colour: TEAL },
    { x: 0, y: 0.56, z: 0, sx: 0.92, sy: 0.06, sz: 1.92, colour: CREAM }, // trim line
    { x: 0, y: 0.78, z: -0.1, sx: 0.74, sy: 0.4, sz: 1.0, colour: '#a9d6e2' }, // cabin glass
    { x: 0, y: 0.99, z: -0.1, sx: 0.7, sy: 0.06, sz: 0.9, colour: CREAM }, // roof
    { x: -0.42, y: 0.5, z: 0.85, sx: 0.08, sy: 0.3, sz: 0.3, colour: CORAL }, // tail fins
    { x: 0.42, y: 0.5, z: 0.85, sx: 0.08, sy: 0.3, sz: 0.3, colour: CORAL },
    { x: -0.42, y: 0.16, z: -0.6, sx: 0.12, sy: 0.32, sz: 0.32, colour: DARK },
    { x: 0.42, y: 0.16, z: -0.6, sx: 0.12, sy: 0.32, sz: 0.32, colour: DARK },
    { x: -0.42, y: 0.16, z: 0.6, sx: 0.12, sy: 0.32, sz: 0.32, colour: DARK },
    { x: 0.42, y: 0.16, z: 0.6, sx: 0.12, sy: 0.32, sz: 0.32, colour: DARK },
    { x: 0, y: 0.4, z: -0.96, sx: 0.5, sy: 0.1, sz: 0.04, colour: GLOW }, // headlamp strip
  ],
  planter: [
    { x: 0, y: 0.22, z: 0, sx: 0.84, sy: 0.44, sz: 0.84, colour: '#b86a4c' },
    { x: 0, y: 0.46, z: 0, sx: 0.9, sy: 0.06, sz: 0.9, colour: CREAM },
    { x: 0, y: 0.6, z: 0, sx: 0.7, sy: 0.3, sz: 0.7, colour: GREEN },
    { x: 0.1, y: 0.82, z: -0.1, sx: 0.4, sy: 0.3, sz: 0.4, colour: '#3f7a4a' },
  ],
  tank: [
    { x: 0, y: 0.25, z: 0, sx: 0.1, sy: 0.5, sz: 0.1, colour: METAL, shape: 'cyl' },
    { x: 0, y: 1.0, z: 0, sx: 0.84, sy: 1.0, sz: 0.84, colour: '#9aa3a8', shape: 'cyl' },
    { x: 0, y: 1.54, z: 0, sx: 0.7, sy: 0.1, sz: 0.7, colour: CORAL, shape: 'cyl' },
    { x: -0.3, y: 0.25, z: -0.3, sx: 0.08, sy: 0.5, sz: 0.08, colour: METAL },
    { x: 0.3, y: 0.25, z: 0.3, sx: 0.08, sy: 0.5, sz: 0.08, colour: METAL },
    { x: -0.3, y: 0.25, z: 0.3, sx: 0.08, sy: 0.5, sz: 0.08, colour: METAL },
    { x: 0.3, y: 0.25, z: -0.3, sx: 0.08, sy: 0.5, sz: 0.08, colour: METAL },
  ],
  vent: [
    { x: 0, y: 0.3, z: 0, sx: 0.6, sy: 0.6, sz: 0.6, colour: METAL },
    { x: 0, y: 0.72, z: 0, sx: 0.44, sy: 0.3, sz: 0.44, colour: '#6f7a80', shape: 'cyl' },
    { x: 0, y: 0.9, z: 0, sx: 0.6, sy: 0.06, sz: 0.6, colour: CREAM, shape: 'cyl' },
    { x: 0, y: 0.31, z: 0.31, sx: 0.4, sy: 0.3, sz: 0.02, colour: DARK },
  ],
  mast: [
    { x: 0, y: 2.2, z: 0, sx: 0.12, sy: 4.4, sz: 0.12, colour: METAL, shape: 'cyl' },
    { x: 0, y: 0.2, z: 0, sx: 0.5, sy: 0.4, sz: 0.5, colour: DARK },
    { x: 0, y: 3.2, z: 0, sx: 1.4, sy: 0.05, sz: 0.05, colour: METAL },
    { x: 0, y: 3.9, z: 0, sx: 0.9, sy: 0.05, sz: 0.05, colour: METAL },
    { x: 0, y: 3.2, z: 0, sx: 0.05, sy: 0.05, sz: 1.4, colour: METAL },
    { x: 0, y: 4.5, z: 0, sx: 0.22, sy: 0.22, sz: 0.22, colour: CORAL }, // the beacon
    { x: 0.3, y: 2.6, z: 0, sx: 0.5, sy: 0.3, sz: 0.1, colour: CREAM, tilt: 0.3 }, // a dish
  ],
  crate: [
    { x: 0, y: 0.3, z: 0, sx: 0.7, sy: 0.6, sz: 0.7, colour: WOOD_LIGHT },
    { x: 0, y: 0.3, z: 0, sx: 0.74, sy: 0.08, sz: 0.74, colour: WOOD },
    { x: 0, y: 0.56, z: 0, sx: 0.74, sy: 0.08, sz: 0.74, colour: WOOD },
    { x: 0, y: 0.04, z: 0, sx: 0.74, sy: 0.08, sz: 0.74, colour: WOOD },
    { x: 0.1, y: 0.35, z: 0.36, sx: 0.3, sy: 0.2, sz: 0.02, colour: MUSTARD }, // stencil plate
  ],
};

/** Prop parts that glow (lamp heads, vending displays, headlamps): drawn again as emissive by Props.tsx. */
export const PROP_GLOW: Partial<Record<PropKind, Part[]>> = {
  lamp: [{ x: 0.45, y: 3.08, z: 0, sx: 0.3, sy: 0.22, sz: 0.3, colour: GLOW }],
  machine: [{ x: 0, y: 1.0, z: 0.31, sx: 0.6, sy: 0.7, sz: 0.03, colour: GLOW }],
  'kiosk-sign': [{ x: 0, y: 2.0, z: 0.06, sx: 1.1, sy: 0.28, sz: 0.03, colour: CORAL }],
  mast: [{ x: 0, y: 4.5, z: 0, sx: 0.24, sy: 0.24, sz: 0.24, colour: CORAL }],
};

const propGeometryCache = new Map<string, THREE.BufferGeometry>();

export function propGeometry(kind: PropKind, glow = false): THREE.BufferGeometry {
  const key = `${kind}:${glow ? 'glow' : 'body'}`;
  const hit = propGeometryCache.get(key);
  if (hit) return hit;
  const parts = glow ? PROP_GLOW[kind] ?? [] : PROP_PARTS[kind];
  const g = merged(parts.length ? parts : [{ x: 0, y: 0, z: 0, sx: 0.001, sy: 0.001, sz: 0.001, colour: '#000000' }]);
  propGeometryCache.set(key, g);
  return g;
}

/** Height of a prop kind in tiles, for the gallery and tests. */
export function propHeight(kind: PropKind): number {
  return Math.max(...PROP_PARTS[kind].map((p) => p.y + p.sy / 2));
}

export interface PropInstance {
  def: PropDef;
  /** Tile index in the state. */
  index: number;
  style: BuildingStyle | 'street';
}

/** The props of a map grouped by kind, with their tile index resolved once per battle. */
export function groupProps(map: MapDef, state: Pick<State, 'width' | 'depth'>): Map<PropKind, PropInstance[]> {
  const out = new Map<PropKind, PropInstance[]>();
  const idx = buildingIndex(map);
  for (const def of map.props ?? []) {
    const list = out.get(def.kind) ?? [];
    list.push({ def, index: def.level * state.width * state.depth + def.y * state.width + def.x, style: styleAt(idx, state.width, def.x, def.y).style });
    out.set(def.kind, list);
  }
  return out;
}

export interface PropPlacement {
  /** World transform. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  tilt: number;
  scale: number;
  /** Tint: white intact, darker when the tile under it is damaged. */
  tint: number;
  shown: boolean;
}

/** Where a prop stands given the tile under it (MAP-9: the tile's state is the prop's state) and the cut-away. */
export function placeProp(p: PropInstance, state: State, active: number, out: PropPlacement): PropPlacement {
  const t = state.tiles[p.index];
  out.shown = !!t && p.def.level <= active && (t.kind === 'floor' || t.kind === 'ground');
  if (!t || !out.shown) {
    out.x = p.def.x + 0.5;
    out.y = -1000;
    out.z = p.def.y + 0.5;
    out.yaw = 0;
    out.tilt = 0;
    out.scale = 0.001;
    out.tint = 1;
    return out;
  }
  const dmg = damageFraction(t);
  out.x = p.def.x + 0.5;
  out.y = p.def.level * LEVEL_H + 0.0;
  out.z = p.def.y + 0.5;
  out.yaw = ((p.def.yaw ?? 0) * Math.PI) / 2;
  // Damaged: knocked askew and darkened, by how far the floor has gone (STR-3).
  out.tilt = dmg > 0 ? 0.12 + 0.25 * dmg : 0;
  out.scale = 1;
  out.tint = 1 - 0.55 * dmg;
  return out;
}

/** A unit test hook: every prop kind has a geometry with vertex colours and stands under 4.6 tiles. */
export function propCatalogue(): { kind: PropKind; parts: number; height: number; vertices: number }[] {
  return (Object.keys(PROP_PARTS) as PropKind[]).map((kind) => ({ kind, parts: PROP_PARTS[kind].length, height: propHeight(kind), vertices: propGeometry(kind).getAttribute('position').count }));
}
