// npm run map:make
// Writes the first city block (MAP-7, MAP-8; PLAN.md D16) and its battle from a building list:
//   src/data/maps/halcyon-block.json     60 x 60 tiles, 7 levels, five buildings of 1, 2, 3, 4 and 6 floors
//   src/data/battles/block-raid.json     the squad in the street, hosts, takers, fighters and citizens indoors
// M4 (MAP-9): every building carries a style and the map carries props (furniture, street dressing, roof
// plant) placed from the plans here; the client's tile set draws them and the rules never read them.
// Deterministic (no randomness): the JSON it writes is the data, and validate:data checks it. Every name
// is a placeholder (PLAN.md D10) and none is taken from the inspiration (docs/GAME-DESIGN.md section 5).
import { writeFileSync } from 'node:fs';
import type { BuildingStyle, PropDef, PropKind } from '../src/data';

// The canvas the helpers below draw on; begin() resets it for each map this tool writes.
let W = 60;
let D = 60;
let LEVELS = 7;

type Plan = 'corridor' | 'hall';
interface Building {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floors: number;
  plan: Plan;
  /** MAP-9: the tile set's style for this building (docs/art/tile-set.md). */
  style: BuildingStyle;
  /** Material key of the outer walls and pillars. */
  wall: 'b' | 's';
  /** Hall plan only: ground-floor doors as local (i, j) on the perimeter. */
  doors?: [number, number][];
}

const BUILDINGS: Building[] = [
  { id: 'halcyon-arms', name: 'Halcyon Arms', x: 5, y: 5, w: 20, d: 14, floors: 6, plan: 'corridor', style: 'residential', wall: 'b' },
  { id: 'meridian-wireless', name: 'Meridian Wireless', x: 33, y: 5, w: 22, d: 14, floors: 4, plan: 'corridor', style: 'office', wall: 'b' },
  { id: 'sunbeam-automat', name: 'Sunbeam Automat', x: 41, y: 24, w: 14, d: 10, floors: 1, plan: 'hall', style: 'automat', wall: 'b', doors: [[0, 5], [6, 9]] },
  { id: 'depot-7', name: 'Depot 7', x: 31, y: 40, w: 24, d: 15, floors: 2, plan: 'hall', style: 'depot', wall: 's', doors: [[5, 0], [14, 0], [0, 7]] },
  { id: 'civic-savings', name: 'Civic Savings, branch 12', x: 5, y: 38, w: 18, d: 16, floors: 3, plan: 'corridor', style: 'bank', wall: 'b' },
];

let kinds: string[][][] = [];
let mats: string[][][] = [];
let props: PropDef[] = [];
function begin(w: number, d: number, levels: number): void {
  W = w;
  D = d;
  LEVELS = levels;
  kinds = [];
  mats = [];
  props = [];
  for (let l = 0; l < LEVELS; l++) {
    kinds.push(Array.from({ length: D }, () => Array.from({ length: W }, () => (l === 0 ? ',' : ' '))));
    mats.push(Array.from({ length: D }, () => Array.from({ length: W }, () => ' ')));
  }
}
begin(60, 60, 7);
function put(l: number, x: number, y: number, kind: string, mat = ' '): void {
  if (l < 0 || l >= LEVELS || x < 0 || x >= W || y < 0 || y >= D) throw new Error(`put off the map ${x},${y},${l}`);
  kinds[l]![y]![x] = kind;
  mats[l]![y]![x] = mat;
}

interface Frame {
  len: number;
  wid: number;
  at(i: number, j: number): [number, number];
}
/** Local frame: i runs along the long side, j across. */
function frame(b: Building): Frame {
  const alongX = b.w >= b.d;
  return {
    len: alongX ? b.w : b.d,
    wid: alongX ? b.d : b.w,
    at: (i, j) => (alongX ? [b.x + i, b.y + j] : [b.x + j, b.y + i]),
  };
}

function shell(b: Building, l: number, f: Frame, windows: boolean): void {
  for (let i = 0; i < f.len; i++) {
    for (let j = 0; j < f.wid; j++) {
      const [x, y] = f.at(i, j);
      const edgeI = i === 0 || i === f.len - 1;
      const edgeJ = j === 0 || j === f.wid - 1;
      if (edgeI || edgeJ) {
        const corner = edgeI && edgeJ;
        const along = edgeJ ? i : j;
        if (windows && !corner && along % 3 === 2) put(l, x, y, '=');
        else put(l, x, y, '#', b.wall);
      } else put(l, x, y, '.');
    }
  }
}

/** MAP-9: a prop on a passable, unfurnished floor or ground tile; silently skipped anywhere else. */
function prop(kind: PropKind, l: number, x: number, y: number, yaw: 0 | 1 | 2 | 3 = 0): void {
  const k = kinds[l]?.[y]?.[x];
  if (k !== '.' && k !== ',') return;
  if (props.some((p) => p.x === x && p.y === y && p.level === l)) return;
  props.push(yaw ? { kind, x, y, level: l, yaw } : { kind, x, y, level: l });
}
/** The yaw that turns a prop standing against the low-j or high-j wall of a frame to face into the room. */
function yawInto(f: Frame, side: 'low' | 'high'): 0 | 1 | 2 | 3 {
  // Yaw 0 faces south (+y), 1 west, 2 north, 3 east. +j is +y when the building runs along x, else +x.
  const alongX = f.at(1, 0)[0] !== f.at(0, 0)[0];
  if (alongX) return side === 'low' ? 0 : 2;
  return side === 'low' ? 3 : 1;
}

/** The rooms of a corridor floor: interior tile ranges on each side of the corridor, in frame coordinates. */
function rooms(f: Frame): { i0: number; i1: number; j0: number; j1: number; side: 'low' | 'high' }[] {
  const c0 = Math.floor(f.wid / 2) - 1;
  const c1 = c0 + 1;
  const cuts: number[] = [];
  for (let i = 5; i < f.len - 3; i += 5) cuts.push(i);
  const edges = [0, ...cuts, f.len - 1];
  const out: { i0: number; i1: number; j0: number; j1: number; side: 'low' | 'high' }[] = [];
  for (let r = 0; r + 1 < edges.length; r++) {
    const i0 = edges[r]! + 1;
    const i1 = edges[r + 1]! - 1;
    out.push({ i0, i1, j0: 1, j1: c0 - 2, side: 'low' });
    out.push({ i0, i1, j0: c1 + 2, j1: f.wid - 2, side: 'high' });
  }
  return out;
}

/** Furniture by style for a corridor-plan floor (docs/art/tile-set.md section 3). */
function furnishCorridor(b: Building, l: number): void {
  const f = frame(b);
  for (const r of rooms(f)) {
    if (r.i1 < r.i0 || r.j1 < r.j0) continue;
    const wallJ = r.side === 'low' ? r.j0 : r.j1; // the row along the outer wall; the door is on the corridor side
    const face = yawInto(f, r.side);
    const away = ((face + 2) % 4) as 0 | 1 | 2 | 3;
    if (b.style === 'residential') {
      if (l === 0) {
        // Lobby and ground-floor flats: a concierge counter in the first room, beds and planters elsewhere.
        if (r.i0 === 1 && r.side === 'low') prop('counter', l, ...f.at(r.i0 + 1, wallJ), face);
        else prop('bed', l, ...f.at(r.i0, wallJ), face);
        prop('planter', l, ...f.at(r.i1, wallJ));
      } else {
        prop('bed', l, ...f.at(r.i0, wallJ), face);
        prop('locker', l, ...f.at(r.i1, wallJ), face);
        if (r.i1 - r.i0 >= 3) prop('desk', l, ...f.at(r.i0 + 2, wallJ), face);
      }
    } else if (b.style === 'office') {
      prop('desk', l, ...f.at(r.i0, wallJ), face);
      if (r.i1 - r.i0 >= 2) prop('desk', l, ...f.at(r.i0 + 2, wallJ), face);
      prop('shelf', l, ...f.at(r.i1, wallJ), face);
      if (l === 0 && r.i0 === 1) prop('machine', l, ...f.at(r.i0 + 1, wallJ), face);
    } else if (b.style === 'bank') {
      if (l === 0) {
        // The banking hall: counters along the outer wall, a bench for customers.
        prop('counter', l, ...f.at(r.i0, wallJ), face);
        if (r.i1 - r.i0 >= 2) prop('counter', l, ...f.at(r.i0 + 1, wallJ), face);
        prop('bench', l, ...f.at(r.i1, wallJ), away);
      } else {
        prop('desk', l, ...f.at(r.i0, wallJ), face);
        prop('locker', l, ...f.at(r.i1, wallJ), face);
        if (r.i1 - r.i0 >= 3) prop('shelf', l, ...f.at(r.i0 + 2, wallJ), face);
      }
    }
  }
}

/** Furniture by style for a hall-plan floor. */
function furnishHall(b: Building, l: number): void {
  const f = frame(b);
  const cut = f.len - 5;
  if (b.style === 'depot') {
    // Racks between the pillar rows, crates beside them, lockers and a machine in the back office.
    for (let i = 2; i < cut - 1; i += 4) {
      for (let j = 2; j < f.wid - 2; j += 4) {
        prop('shelf', l, ...f.at(i, j), 1);
        if (j + 1 < f.wid - 2) prop('crate', l, ...f.at(i + 1, j + 1));
      }
    }
    prop('machine', l, ...f.at(cut + 1, 1), 1);
    prop('locker', l, ...f.at(cut + 1, f.wid - 2), 1);
    prop('desk', l, ...f.at(cut + 2, Math.floor(f.wid / 2) - 1), 1);
    prop('crate', l, ...f.at(cut + 3, 2));
  } else if (b.style === 'automat') {
    // Vending machines along the long wall, a counter opposite, benches in rows.
    for (let i = 2; i < cut - 1; i += 2) prop('machine', l, ...f.at(i, 1), yawInto(f, 'low'));
    prop('counter', l, ...f.at(2, f.wid - 2), yawInto(f, 'high'));
    prop('counter', l, ...f.at(3, f.wid - 2), yawInto(f, 'high'));
    for (let i = 3; i < cut - 1; i += 3) prop('bench', l, ...f.at(i, 4), 1);
    prop('machine', l, ...f.at(cut + 1, 1), 1);
    prop('shelf', l, ...f.at(cut + 2, f.wid - 2), 1);
  }
}

/** Roof plant by style: a tank and vents on every roof, a wireless mast on the office. */
function dressRoof(b: Building): void {
  const f = frame(b);
  const l = b.floors;
  const mi = Math.floor(f.len / 2);
  const mj = Math.floor(f.wid / 2);
  prop('tank', l, ...f.at(3, 2));
  prop('vent', l, ...f.at(mi, mj));
  prop('vent', l, ...f.at(f.len - 4, f.wid - 3));
  if (b.style === 'office') prop('mast', l, ...f.at(mi + 3, 2));
  if (b.style === 'depot') prop('vent', l, ...f.at(mi - 4, 3));
  if (b.style === 'residential') prop('tank', l, ...f.at(f.len - 4, 2));
}

function corridorFloor(b: Building, l: number, roof: boolean): void {
  const f = frame(b);
  shell(b, l, f, !roof);
  const c0 = Math.floor(f.wid / 2) - 1;
  const c1 = c0 + 1;
  const stairs: [number, number][] = [
    [1, c0],
    [f.len - 2, c1],
  ];
  if (!roof) {
    // Partition walls either side of the two-wide corridor, cross walls every five tiles, a door per room.
    for (let i = 1; i <= f.len - 2; i++) {
      for (const j of [c0 - 1, c1 + 1]) put(l, ...f.at(i, j), '#', 'p');
    }
    const cuts: number[] = [];
    for (let i = 5; i < f.len - 3; i += 5) cuts.push(i);
    for (const i of cuts) {
      for (let j = 1; j <= c0 - 2; j++) put(l, ...f.at(i, j), '#', 'p');
      for (let j = c1 + 2; j <= f.wid - 2; j++) put(l, ...f.at(i, j), '#', 'p');
    }
    const edges = [0, ...cuts, f.len - 1];
    for (let r = 0; r + 1 < edges.length; r++) {
      const mid = Math.floor((edges[r]! + edges[r + 1]!) / 2);
      put(l, ...f.at(mid, c0 - 1), '+');
      put(l, ...f.at(mid, c1 + 1), '+');
    }
    if (l === 0) {
      // Street doors at the corridor ends, beside the stair columns.
      put(l, ...f.at(0, c1), '+');
      put(l, ...f.at(f.len - 1, c0), '+');
    }
  }
  for (const [i, j] of stairs) put(l, ...f.at(i, j), '>');
}

function hallFloor(b: Building, l: number, roof: boolean): void {
  const f = frame(b);
  shell(b, l, f, !roof);
  if (!roof) {
    // A back office behind a partition with one door; pillars only in the hall in front of it.
    const cut = f.len - 5;
    for (let i = 4; i < cut - 1; i += 4) {
      for (let j = 4; j < f.wid - 2; j += 4) put(l, ...f.at(i, j), '#', b.wall);
    }
    for (let j = 1; j <= f.wid - 2; j++) put(l, ...f.at(cut, j), '#', 'p');
    put(l, ...f.at(cut, Math.floor(f.wid / 2) + 1), '+');
    if (l === 0) for (const [i, j] of b.doors ?? []) put(l, ...f.at(i, j), '+');
  }
  put(l, ...f.at(1, 1), '>');
  put(l, ...f.at(f.len - 2, f.wid - 2), '>');
}

for (const b of BUILDINGS) {
  for (let l = 0; l <= b.floors; l++) {
    if (b.plan === 'corridor') corridorFloor(b, l, l === b.floors);
    else hallFloor(b, l, l === b.floors);
  }
}

// The courtyard: brick planters for cover and a kiosk shell.
for (const [x, y] of [[14, 24], [15, 24], [14, 31], [15, 31], [26, 27], [26, 28], [33, 24], [33, 25], [33, 31], [33, 32], [9, 27], [9, 28]] as [number, number][]) put(0, x, y, '#', 'b');
for (let x = 19; x <= 23; x++) for (let y = 26; y <= 29; y++) put(0, x, y, x === 19 || x === 23 || y === 26 || y === 29 ? '#' : '.', x === 19 || x === 23 || y === 26 || y === 29 ? 'p' : ' ');
put(0, 21, 29, '+');
put(0, 21, 26, '=');

// Street dressing (MAP-9): lamps along the streets, benches and planters in the courtyard, parked vehicles,
// a sign on the kiosk. Props stand on passable tiles and block nothing; the rules do not read them.
for (const y of [2, 10, 18, 26, 34, 42, 50, 58]) {
  prop('lamp', 0, 2, y);
  prop('lamp', 0, 57, y);
}
for (const x of [10, 20, 30, 40, 50]) {
  prop('lamp', 0, x, 1);
  prop('lamp', 0, x, 58);
}
for (const x of [28, 36]) prop('lamp', 0, x, 22);
for (const x of [12, 36]) prop('lamp', 0, x, 36);
prop('kiosk-sign', 0, 21, 27);
for (const [x, y, yaw] of [[11, 27, 1], [11, 28, 1], [17, 24, 0], [17, 31, 2], [30, 24, 0], [30, 31, 2]] as [number, number, 0 | 1 | 2 | 3][]) prop('bench', 0, x, y, yaw);
for (const [x, y] of [[13, 24], [16, 24], [13, 31], [16, 31], [27, 27], [27, 28], [8, 27], [8, 28], [34, 24], [34, 32]] as [number, number][]) prop('planter', 0, x, y);
for (const [x, y, yaw] of [[1, 20, 1], [1, 30, 1], [58, 14, 1], [58, 36, 1], [27, 1, 0], [45, 58, 0], [29, 47, 1]] as [number, number, 0 | 1 | 2 | 3][]) prop('vehicle', 0, x, y, yaw);
for (const [x, y] of [[36, 38], [38, 38]] as [number, number][]) prop('crate', 0, x, y);

for (const b of BUILDINGS) {
  for (let l = 0; l < b.floors; l++) {
    if (b.plan === 'corridor') furnishCorridor(b, l);
    else furnishHall(b, l);
  }
  dressRoof(b);
}

const passable = new Set([',', '.', '+', '>', '%']);
function local(b: Building, i: number, j: number, level: number): { x: number; y: number; level: number } {
  const [x, y] = frame(b).at(i, j);
  return { x, y, level };
}
const byId = (id: string): Building => {
  const b = BUILDINGS.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
};
const arms = byId('halcyon-arms');
const wireless = byId('meridian-wireless');
const automat = byId('sunbeam-automat');
const depot = byId('depot-7');
const civic = byId('civic-savings');

const squad = [
  { name: 'Vance', template: 'agent-t1', weapon: 'patrol-carbine', at: { x: 2, y: 44, level: 0 } },
  { name: 'Okoro', template: 'agent-t1', weapon: 'service-pistol', at: { x: 2, y: 45, level: 0 } },
  { name: 'Lindqvist', template: 'agent-t1', weapon: 'scatter-gun', at: { x: 2, y: 46, level: 0 } },
  { name: 'Marsh', template: 'agent-t1', weapon: 'service-pistol', at: { x: 2, y: 47, level: 0 } },
  { name: 'Teodoro', template: 'agent-t1', weapon: 'patrol-carbine', at: { x: 2, y: 48, level: 0 } },
  { name: 'Quill', template: 'agent-t1', weapon: 'service-pistol', at: { x: 1, y: 46, level: 0 } },
];
const others = [
  // Hosts: taken-over citizens, indoors on several floors.
  { template: 'host', at: local(civic, 3, 3, 0) },
  { template: 'host', at: local(civic, 12, 12, 2) },
  { template: 'host', at: local(arms, 7, 2, 1) },
  { template: 'host', at: local(arms, 13, 11, 4) },
  { template: 'host', at: local(wireless, 8, 2, 2) },
  { template: 'host', at: local(depot, 6, 6, 1) },
  // Takers: one on the tallest roof, one in the depot's back office.
  { template: 'taker', at: local(arms, 10, 3, 6) },
  { template: 'taker', at: local(depot, 21, 3, 0) },
  // Fighters (M3, PLAN.md D14): one in the depot hall, one on Halcyon Arms' third floor.
  { template: 'fighter', at: local(depot, 10, 7, 0) },
  { template: 'fighter', at: local(arms, 16, 11, 3) },
  // Citizens.
  { template: 'citizen', at: { x: 12, y: 27, level: 0 } },
  { template: 'citizen', at: { x: 29, y: 30, level: 0 } },
  { template: 'citizen', at: local(automat, 2, 2, 0) },
  { template: 'citizen', at: local(automat, 6, 5, 0) },
  { template: 'citizen', at: local(automat, 3, 7, 0) },
  { template: 'citizen', at: local(civic, 8, 3, 0) },
  { template: 'citizen', at: local(civic, 13, 12, 0) },
  { template: 'citizen', at: local(arms, 3, 11, 0) },
  { template: 'citizen', at: local(arms, 12, 2, 3) },
  { template: 'citizen', at: local(wireless, 13, 11, 0) },
  { template: 'citizen', at: local(wireless, 3, 2, 1) },
];
interface Spawn {
  at: { x: number; y: number; level: number };
  template: string;
}
/** Every spawn on a passable tile, no two on one tile; a prop under a spawning unit would be drawn through the figure, so it is dropped. */
function checkSpawns(all: Spawn[]): void {
  const used = new Set<string>();
  for (const e of all) {
    const k = kinds[e.at.level]?.[e.at.y]?.[e.at.x];
    const key = `${e.at.x},${e.at.y},${e.at.level}`;
    if (!k || !passable.has(k)) throw new Error(`spawn ${key} (${e.template}) is on "${k}"`);
    if (used.has(key)) throw new Error(`spawn ${key} used twice`);
    used.add(key);
  }
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i]!;
    if (used.has(`${p.x},${p.y},${p.level}`)) props.splice(i, 1);
  }
}
checkSpawns([...squad, ...others]);

const map = {
  id: 'halcyon-block',
  name: 'Halcyon Row, block 4',
  _: 'Written by tools/make-block.ts (npm run map:make); edit the tool, not this file. MAP-2 legend: , ground  . floor  # wall  + door  > stair  = window  % rubble  (space) void. materials: one character per tile through materialKey, space = the default of the kind (STR-1). buildings[].style and props are MAP-9 set dressing for the client (docs/art/tile-set.md); the rules never read them. Placeholder names (PLAN.md D10).',
  width: W,
  depth: D,
  materialKey: { b: 'brick', p: 'plaster', s: 'steel' },
  buildings: BUILDINGS.map((b) => ({ id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, d: b.d, floors: b.floors, style: b.style })),
  levels: kinds.map((rows, level) => ({ level, rows: rows.map((r) => r.join('')), materials: mats[level]!.map((r) => r.join('')) })),
  props,
};
const battle = {
  id: 'block-raid',
  name: 'Raid on Halcyon Row',
  _: 'Written by tools/make-block.ts. The first playable raid on a city block (MAP-7): the squad starts in the west street. Agent names are placeholders. Non-agent units get ids by spawn position (UNIT-3).',
  map: map.id,
  squad,
  others,
};

function writeJson(rel: string, value: unknown): void {
  // One row per line keeps the map readable and the diff small.
  const text = JSON.stringify(value, null, 2)
    .replace(/\{\n\s+"x": (\d+),\n\s+"y": (\d+),\n\s+"level": (\d+)\n\s+\}/g, '{ "x": $1, "y": $2, "level": $3 }')
    .replace(/\{\n\s+"kind": "([a-z-]+)",\n\s+"x": (\d+),\n\s+"y": (\d+),\n\s+"level": (\d+)(?:,\n\s+"yaw": (\d))?\n\s+\}/g, (_m, k, x, y, l, yaw) => `{ "kind": "${k}", "x": ${x}, "y": ${y}, "level": ${l}${yaw ? `, "yaw": ${yaw}` : ''} }`);
  writeFileSync(new URL(`../${rel}`, import.meta.url), text + '\n');
}
writeJson('src/data/maps/halcyon-block.json', map);
writeJson('src/data/battles/block-raid.json', battle);
const count = (ch: string) => kinds.flat(2).filter((k) => k === ch).length;
const byKind: Record<string, number> = {};
for (const p of props) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
console.log(`halcyon-block: ${W} x ${D} x ${LEVELS}; walls ${count('#')}, floors ${count('.')}, doors ${count('+')}, windows ${count('=')}, stairs ${count('>')}; ${BUILDINGS.length} buildings; ${props.length} props (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}); block-raid: ${squad.length} agents, ${others.length} others`);

// ---------------------------------------------------------------------------------------------------------
// Single-building raid sites (PLAN.md D20, spec MAP-10): one building of 1 to 3 floors in a ring of street,
// the squad in the west street. The buildings are the block's own plans, moved to the origin of their site.
// ---------------------------------------------------------------------------------------------------------
const RING = 4;
type Local = [number, number, number]; // i, j, level in the building's frame
interface Site {
  building: string;
  battle: string;
  battleName: string;
  hosts: Local[];
  takers: Local[];
  fighters: Local[];
  citizens: Local[];
  /** Citizens in the street, absolute tiles on level 0. */
  streetCitizens: [number, number][];
}
const SITES: Site[] = [
  {
    building: 'sunbeam-automat',
    battle: 'automat-raid',
    battleName: 'Raid on the Sunbeam Automat',
    hosts: [[3, 6, 0], [7, 2, 0], [6, 7, 0]],
    takers: [[11, 3, 0]],
    fighters: [[7, 5, 1]],
    citizens: [[2, 2, 0], [6, 5, 0], [3, 8, 0], [8, 8, 0]],
    streetCitizens: [[10, 16]],
  },
  {
    building: 'depot-7',
    battle: 'depot-raid',
    battleName: 'Raid on Depot 7',
    hosts: [[6, 6, 0], [14, 10, 0], [6, 6, 1], [17, 3, 1]],
    takers: [[21, 3, 0]],
    fighters: [[10, 7, 0], [14, 11, 1]],
    citizens: [[3, 10, 0], [11, 2, 0], [9, 9, 1], [21, 10, 1]],
    streetCitizens: [[16, 1]],
  },
  {
    building: 'civic-savings',
    battle: 'savings-raid',
    battleName: 'Raid on Civic Savings',
    hosts: [[3, 3, 0], [12, 12, 1], [7, 2, 1], [3, 12, 2]],
    takers: [[13, 3, 2], [9, 4, 3]],
    fighters: [[8, 12, 0], [14, 3, 1]],
    citizens: [[8, 3, 0], [13, 12, 0], [3, 7, 0], [2, 11, 1], [7, 12, 2]],
    streetCitizens: [[14, 22]],
  },
];

const siteSummaries: string[] = [];
for (const site of SITES) {
  const home = byId(site.building);
  const b: Building = { ...home, x: RING, y: RING };
  begin(b.w + 2 * RING, b.d + 2 * RING, b.floors + 1);
  for (let l = 0; l <= b.floors; l++) {
    if (b.plan === 'corridor') corridorFloor(b, l, l === b.floors);
    else hallFloor(b, l, l === b.floors);
  }
  // Street dressing (MAP-9): a lamp at each corner and midway along each side, parked vehicles east, north and
  // south (the west street is the squad's), a crate or two by the kerb.
  const cx = Math.floor(W / 2);
  const cy = Math.floor(D / 2);
  for (const [x, y] of [[1, 1], [W - 2, 1], [1, D - 2], [W - 2, D - 2], [cx, 1], [cx, D - 2], [W - 2, cy]] as [number, number][]) prop('lamp', 0, x, y);
  for (const [x, y, yaw] of [[W - 2, cy - 4, 1], [W - 2, cy + 4, 1], [cx - 5, 1, 0], [cx + 5, D - 2, 0]] as [number, number, 0 | 1 | 2 | 3][]) prop('vehicle', 0, x, y, yaw);
  for (const [x, y] of [[W - 3, 2], [2, D - 3]] as [number, number][]) prop('crate', 0, x, y);
  for (let l = 0; l < b.floors; l++) {
    if (b.plan === 'corridor') furnishCorridor(b, l);
    else furnishHall(b, l);
  }
  dressRoof(b);

  const at = ([i, j, level]: Local) => local(b, i, j, level);
  const siteSquad = squad.map((s, n) => ({ ...s, at: n < 5 ? { x: 2, y: cy - 2 + n, level: 0 } : { x: 1, y: cy, level: 0 } }));
  const siteOthers = [
    ...site.hosts.map((p) => ({ template: 'host', at: at(p) })),
    ...site.takers.map((p) => ({ template: 'taker', at: at(p) })),
    ...site.fighters.map((p) => ({ template: 'fighter', at: at(p) })),
    ...site.citizens.map((p) => ({ template: 'citizen', at: at(p) })),
    ...site.streetCitizens.map(([x, y]) => ({ template: 'citizen', at: { x, y, level: 0 } })),
  ];
  checkSpawns([...siteSquad, ...siteOthers]);
  const siteMap = {
    id: `${b.id}-site`,
    name: b.name,
    _: `Written by tools/make-block.ts (npm run map:make); edit the tool, not this file. A single-building raid site (MAP-10): ${b.name}, ${b.floors} floor${b.floors === 1 ? '' : 's'} and a roof, in a ${RING}-tile street ring. Legend and materials as halcyon-block. Placeholder names (PLAN.md D10).`,
    width: W,
    depth: D,
    materialKey: { b: 'brick', p: 'plaster', s: 'steel' },
    buildings: [{ id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, d: b.d, floors: b.floors, style: b.style }],
    levels: kinds.map((rows, level) => ({ level, rows: rows.map((r) => r.join('')), materials: mats[level]!.map((r) => r.join('')) })),
    props,
  };
  const siteBattle = {
    id: site.battle,
    name: site.battleName,
    _: 'Written by tools/make-block.ts. A raid on one building (MAP-10): the squad starts in the west street. Agent names are placeholders. Non-agent units get ids by spawn position (UNIT-3).',
    map: siteMap.id,
    squad: siteSquad,
    others: siteOthers,
  };
  writeJson(`src/data/maps/${siteMap.id}.json`, siteMap);
  writeJson(`src/data/battles/${site.battle}.json`, siteBattle);
  siteSummaries.push(`${siteMap.id}: ${W} x ${D} x ${LEVELS}; windows ${count('=')}, stairs ${count('>')}; ${props.length} props; ${site.battle}: ${siteSquad.length} agents, ${siteOthers.length} others (${site.hosts.length} hosts, ${site.takers.length} takers, ${site.fighters.length} fighters)`);
}
for (const line of siteSummaries) console.log(line);
