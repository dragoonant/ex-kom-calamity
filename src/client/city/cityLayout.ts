// The city's set dressing as plain data (pure, no React, no three): the street grid, the pavement blocks, what
// stands on every lot the rules leave empty, the outer city past the play area, the bay to the north, trees,
// street lamps and the monorail's route. The rules never read any of it (as RULING MAP-9 for the raid props):
// the 25 lots in src/data/city/city.json stay the only things the board can pick. Deterministic from the city
// data alone, so every campaign draws the same city.
import { CITY } from '../../data/city';
import { CELL } from './cityMeshes';

export const SIZE = CITY.size * CELL; // 48
/** A street on every second cell line: blocks of 2 x 2 lots. District edges all fall on these lines. */
export const BLOCK = CELL * 2;
export const STREET = 1.1;
/** How far the outer city runs past the play area on the south, east and west. */
export const OUTER = BLOCK * 4;
/** The waterfront: the bay starts this far north of the play area. */
export const SHORE_Z = -BLOCK * 2 - STREET / 2;

export type DistrictId = 'civic' | 'heights' | 'sunbeam' | 'works' | 'parkside' | 'hill' | 'outer';

export const DISTRICT_PAVE: Record<DistrictId, string> = {
  civic: '#dcd5c2',
  heights: '#d6cfbd',
  sunbeam: '#ddd3b8',
  works: '#c7c2b5',
  parkside: '#d3d0bb',
  hill: '#d8d0bc',
  outer: '#c9c4b6',
};

export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  district: DistrictId;
}

export type FillKind = 'row' | 'shop' | 'shed' | 'tank' | 'plaza' | 'park' | 'pond' | 'house';

export interface Fill {
  kind: FillKind;
  /** Cell centre in world units. */
  x: number;
  z: number;
  /** Footprint and height for buildings. */
  w: number;
  d: number;
  h: number;
  colour: string;
  seed: number;
}

export interface OuterBuilding {
  x: number;
  z: number;
  w: number;
  h: number;
  round: boolean;
  accent: 0 | 1;
  /** Multiplies the tower's enamel: pale teal, peach, rose or plain. */
  tint: string;
}

/** Wall tints for the outer city, all within a step of the enamel cream. */
const TINTS = ['#ffffff', '#ffffff', '#e2efe9', '#fff0dc', '#f6e6e0', '#e6edf2', '#f9f3dd'];

export interface Lamp {
  x: number;
  z: number;
}

export interface Tree {
  x: number;
  z: number;
  s: number;
  tone: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function districtAt(cx: number, cy: number): DistrictId {
  for (const d of CITY.districts) if (cx >= d.x && cx < d.x + d.w && cy >= d.y && cy < d.y + d.d) return d.id as DistrictId;
  return 'outer';
}

export function occupied(): Set<string> {
  const s = new Set(CITY.buildings.map((b) => `${b.x},${b.y}`));
  s.add(`${CITY.agency.hq.x},${CITY.agency.hq.y}`);
  return s;
}

const PASTEL = ['#efe6cf', '#e9dcc0', '#dfe3d6', '#efdcc0', '#e6d8bf', '#d8e2dc'];
const WORKS = ['#b9b6ad', '#a9aba6', '#c4bba8'];

export interface CityLayout {
  blocks: Block[];
  fills: Fill[];
  outer: OuterBuilding[];
  trees: Tree[];
  lamps: Lamp[];
  /** Street centre lines: x positions of north-south streets, z positions of east-west streets, and their span. */
  streetsX: number[];
  streetsZ: number[];
  span: { x0: number; x1: number; z0: number; z1: number };
}

export function cityLayout(): CityLayout {
  const r = rng(1957);
  const taken = occupied();
  const span = { x0: -OUTER, x1: SIZE + OUTER, z0: SHORE_Z + STREET / 2, z1: SIZE + OUTER };
  const streetsX: number[] = [];
  const streetsZ: number[] = [];
  for (let x = span.x0; x <= span.x1 + 0.01; x += BLOCK) streetsX.push(x);
  for (let z = -BLOCK * 2; z <= span.z1 + 0.01; z += BLOCK) streetsZ.push(z);

  const blocks: Block[] = [];
  const fills: Fill[] = [];
  const outer: OuterBuilding[] = [];
  const trees: Tree[] = [];
  const lamps: Lamp[] = [];
  const inset = STREET / 2;

  for (let bx = span.x0; bx < span.x1 - 0.01; bx += BLOCK) {
    for (let bz = -BLOCK * 2; bz < span.z1 - 0.01; bz += BLOCK) {
      const inside = bx >= 0 && bx < SIZE && bz >= 0 && bz < SIZE;
      const district = inside ? districtAt(Math.floor(bx / CELL), Math.floor(bz / CELL)) : 'outer';
      blocks.push({ x: bx + BLOCK / 2, z: bz + BLOCK / 2, w: BLOCK - STREET, d: BLOCK - STREET, district });
      // A lamp on one corner of every block, two on the waterfront.
      lamps.push({ x: bx + inset + 0.35, z: bz + inset + 0.35 });
      if (bz === -BLOCK * 2) lamps.push({ x: bx + BLOCK / 2, z: bz + inset + 0.35 });
      // Now and then a whole outer block is a park, to break the roofs up.
      const parkBlock = !inside && bz >= 0 && r() < 0.13;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const x = bx + CELL * i + CELL / 2;
          const z = bz + CELL * j + CELL / 2;
          if (inside) {
            const cx = Math.floor(x / CELL);
            const cy = Math.floor(z / CELL);
            if (taken.has(`${cx},${cy}`)) continue;
            fills.push(...fillFor(district, x, z, r, trees));
          } else {
            const edge = Math.max(-x, x - SIZE, -z, z - SIZE, 0);
            if (parkBlock) {
              fills.push({ kind: 'park', x, z, w: 0, d: 0, h: 0, colour: '', seed: Math.floor(r() * 1e6) });
              for (let k = 0; k < 3; k++) trees.push({ x: x + (r() - 0.5) * 2.8, z: z + (r() - 0.5) * 2.8, s: 0.9 + r() * 0.5, tone: r() });
              continue;
            }
            // The waterfront row stays low and open, a promenade with trees.
            if (z < -BLOCK) {
              if (r() < 0.6) trees.push({ x: x + (r() - 0.5) * 2, z: z + (r() - 0.5) * 2, s: 0.9 + r() * 0.4, tone: r() });
              continue;
            }
            if (z < 0) {
              if (r() < 0.25) continue;
              outer.push({ x, z, w: 2.6 + r() * 0.4, h: 1.2 + r() * 2.2, round: false, accent: r() < 0.5 ? 0 : 1, tint: TINTS[Math.floor(r() * TINTS.length)]! });
              continue;
            }
            if (r() < 0.12) {
              for (let k = 0; k < 3; k++) trees.push({ x: x + (r() - 0.5) * 2.6, z: z + (r() - 0.5) * 2.6, s: 0.8 + r() * 0.5, tone: r() });
              continue;
            }
            // The camera looks from the south-east, so the south and east stay low in front of the play area and
            // the city climbs to the north-west behind it; the first ring past the edge is low on every side.
            const behind = x < 0 || z < 0;
            const round = r() < (behind ? 0.45 : 0.25);
            const h = edge < 5 ? 1.2 + r() * 1.6 : behind ? 2.2 + r() * 3 + edge * (0.16 + r() * 0.1) : 1.2 + r() * 1.8 + edge * 0.06;
            outer.push({ x, z, w: round ? 1.3 + r() * 0.2 : 2.6 + r() * 0.4, h, round: round && h > 3, accent: r() < 0.5 ? 0 : 1, tint: TINTS[Math.floor(r() * TINTS.length)]! });
          }
        }
      }
    }
  }
  return { blocks, fills, outer, trees, lamps, streetsX, streetsZ, span };
}

function fillFor(district: DistrictId, x: number, z: number, r: () => number, trees: Tree[]): Fill[] {
  const seed = Math.floor(r() * 1e6);
  const pastel = PASTEL[Math.floor(r() * PASTEL.length)]!;
  const tree = (dx: number, dz: number, s = 1) => trees.push({ x: x + dx, z: z + dz, s: s * (0.85 + r() * 0.3), tone: r() });
  const base = { x, z, w: 0, d: 0, h: 0, colour: pastel, seed };
  switch (district) {
    case 'parkside': {
      if (r() < 0.22) {
        tree(-1.3, 1.3);
        tree(1.4, -1.2, 0.8);
        return [{ ...base, kind: 'pond' }];
      }
      for (let k = 0; k < 4; k++) tree((r() - 0.5) * 2.8, (r() - 0.5) * 2.8, 0.9 + r() * 0.4);
      return [{ ...base, kind: 'park' }];
    }
    case 'civic': {
      for (const [dx, dz] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]] as const) tree(dx, dz, 0.75);
      return [{ ...base, kind: 'plaza' }];
    }
    case 'works': {
      if (r() < 0.4) return [{ ...base, kind: 'tank', w: 1.1, d: 1.1, h: 1.6 + r() * 0.8, colour: WORKS[Math.floor(r() * WORKS.length)]! }];
      return [{ ...base, kind: 'shed', w: 2.9, d: 2.2 + r() * 0.5, h: 1.25 + r() * 0.5, colour: WORKS[Math.floor(r() * WORKS.length)]! }];
    }
    case 'sunbeam':
      if (r() < 0.25) {
        tree(-0.9, 0.9);
        tree(0.9, -0.9);
        return [{ ...base, kind: 'park' }];
      }
      return [{ ...base, kind: 'shop', w: 2.8, d: 2.4, h: 1.0, colour: pastel }];
    case 'hill':
      tree(-1.2, 1.2, 0.9);
      if (r() < 0.5) tree(1.2, 1.25, 0.8);
      return [{ ...base, kind: 'house', w: 2.0, d: 1.8, h: 1.25, colour: pastel }];
    default:
      if (r() < 0.2) {
        tree(0, 0, 1.1);
        return [{ ...base, kind: 'park' }];
      }
      return [{ ...base, kind: 'row', w: 2.8, d: 2.2, h: r() < 0.5 ? 1.0 : 1.75, colour: pastel }];
  }
}

/** The monorail: a rounded loop on the streets around the Civic Centre's ring, at this height. */
export const RAIL_Y = 7.2;
export function railLoop(): { x: number; z: number }[] {
  const x0 = BLOCK;
  const x1 = SIZE - BLOCK;
  const z0 = BLOCK;
  const z1 = SIZE - BLOCK;
  const rad = 5;
  const pts: { x: number; z: number }[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad });
    }
  };
  corner(x1 - rad, z0 + rad, -Math.PI / 2);
  corner(x1 - rad, z1 - rad, 0);
  corner(x0 + rad, z1 - rad, Math.PI / 2);
  corner(x0 + rad, z0 + rad, Math.PI);
  return pts;
}
