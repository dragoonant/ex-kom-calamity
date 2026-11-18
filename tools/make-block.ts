// npm run map:make
// Writes the first city block (MAP-7, MAP-8; PLAN.md D16) and its battle from a building list:
//   src/data/maps/halcyon-block.json     60 x 60 tiles, 7 levels, five buildings of 1, 2, 3, 4 and 6 floors
//   src/data/battles/block-raid.json     the squad in the street, hosts, takers, fighters and citizens indoors
// Deterministic (no randomness): the JSON it writes is the data, and validate:data checks it. Every name
// is a placeholder (PLAN.md D10) and none is taken from the inspiration (docs/GAME-DESIGN.md section 5).
import { writeFileSync } from 'node:fs';

const W = 60;
const D = 60;
const LEVELS = 7;

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
  /** Material key of the outer walls and pillars. */
  wall: 'b' | 's';
  /** Hall plan only: ground-floor doors as local (i, j) on the perimeter. */
  doors?: [number, number][];
}

const BUILDINGS: Building[] = [
  { id: 'halcyon-arms', name: 'Halcyon Arms', x: 5, y: 5, w: 20, d: 14, floors: 6, plan: 'corridor', wall: 'b' },
  { id: 'meridian-wireless', name: 'Meridian Wireless', x: 33, y: 5, w: 22, d: 14, floors: 4, plan: 'corridor', wall: 'b' },
  { id: 'sunbeam-automat', name: 'Sunbeam Automat', x: 41, y: 24, w: 14, d: 10, floors: 1, plan: 'hall', wall: 'b', doors: [[0, 5], [6, 9]] },
  { id: 'depot-7', name: 'Depot 7', x: 31, y: 40, w: 24, d: 15, floors: 2, plan: 'hall', wall: 's', doors: [[5, 0], [14, 0], [0, 7]] },
  { id: 'civic-savings', name: 'Civic Savings, branch 12', x: 5, y: 38, w: 18, d: 16, floors: 3, plan: 'corridor', wall: 'b' },
];

const kinds: string[][][] = [];
const mats: string[][][] = [];
for (let l = 0; l < LEVELS; l++) {
  kinds.push(Array.from({ length: D }, () => Array.from({ length: W }, () => (l === 0 ? ',' : ' '))));
  mats.push(Array.from({ length: D }, () => Array.from({ length: W }, () => ' ')));
}
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
const used = new Set<string>();
for (const e of [...squad, ...others]) {
  const k = kinds[e.at.level]?.[e.at.y]?.[e.at.x];
  const key = `${e.at.x},${e.at.y},${e.at.level}`;
  if (!k || !passable.has(k)) throw new Error(`spawn ${key} (${e.template}) is on "${k}"`);
  if (used.has(key)) throw new Error(`spawn ${key} used twice`);
  used.add(key);
}

const map = {
  id: 'halcyon-block',
  name: 'Halcyon Row, block 4',
  _: 'Written by tools/make-block.ts (npm run map:make); edit the tool, not this file. MAP-2 legend: , ground  . floor  # wall  + door  > stair  = window  % rubble  (space) void. materials: one character per tile through materialKey, space = the default of the kind (STR-1). Placeholder names (PLAN.md D10).',
  width: W,
  depth: D,
  materialKey: { b: 'brick', p: 'plaster', s: 'steel' },
  buildings: BUILDINGS.map((b) => ({ id: b.id, name: b.name, x: b.x, y: b.y, w: b.w, d: b.d, floors: b.floors })),
  levels: kinds.map((rows, level) => ({ level, rows: rows.map((r) => r.join('')), materials: mats[level]!.map((r) => r.join('')) })),
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
  const text = JSON.stringify(value, null, 2).replace(/\{\n\s+"x": (\d+),\n\s+"y": (\d+),\n\s+"level": (\d+)\n\s+\}/g, '{ "x": $1, "y": $2, "level": $3 }');
  writeFileSync(new URL(`../${rel}`, import.meta.url), text + '\n');
}
writeJson('src/data/maps/halcyon-block.json', map);
writeJson('src/data/battles/block-raid.json', battle);
const count = (ch: string) => kinds.flat(2).filter((k) => k === ch).length;
console.log(`halcyon-block: ${W} x ${D} x ${LEVELS}; walls ${count('#')}, floors ${count('.')}, doors ${count('+')}, windows ${count('=')}, stairs ${count('>')}; ${BUILDINGS.length} buildings; block-raid: ${squad.length} agents, ${others.length} others`);
