import { RULES } from './data';
import type { BattleState, Tile, Unit } from './types';

export interface Pos { x: number; y: number }
export const key = (x: number, y: number): string => `${x},${y}`;
export const inBounds = (s: BattleState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const tileAt = (s: BattleState, x: number, y: number): Tile | null => (inBounds(s, x, y) ? s.tiles[y * s.w + x] ?? null : null);
export const dist = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const unitAt = (s: BattleState, x: number, y: number): Unit | null => s.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;

/** Bresenham line from a to b, both ends included (MAP-4). */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/** MAP-4: containers, sheds and silos on an intermediate tile block sight. */
export function hasLos(s: BattleState, a: Pos, b: Pos): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const t = tileAt(s, p.x, p.y);
    if (t?.obj && RULES.objects[t.obj].blocksSight) return false;
  }
  return true;
}

/** MAP-5: the last tile before the target on the line holds a cover object. */
export function hasCover(s: BattleState, attacker: Pos, target: Pos): boolean {
  const pts = line(attacker, target);
  if (pts.length < 3) return false;
  const p = pts[pts.length - 2]!;
  const t = tileAt(s, p.x, p.y);
  return !!(t?.obj && RULES.objects[t.obj].cover);
}

/** Cost to step onto a tile from a neighbour (MAP-2); Infinity if blocked. */
export function stepCost(s: BattleState, from: Pos, to: Pos): number {
  const a = tileAt(s, from.x, from.y), b = tileAt(s, to.x, to.y);
  if (!a || !b || b.obj) return Infinity;
  const climb = b.h - a.h;
  if (climb > 1 || climb < -1) return Infinity;
  return RULES.terrainCost[b.t] + (climb > 0 ? RULES.climbCost : 0);
}

export interface Reach { x: number; y: number; cost: number; path: Pos[] }

/** TRN-3: tiles a walker can end on within `budget`, with paths. Enemies block; allies can be passed but not ended on. */
export function reachable(s: BattleState, u: Unit, budget: number, from: Pos = u): Reach[] {
  const best = new Map<string, { cost: number; prev: string | null; x: number; y: number }>();
  const start = key(from.x, from.y);
  best.set(start, { cost: 0, prev: null, x: from.x, y: from.y });
  const open: string[] = [start];
  while (open.length) {
    open.sort((p, q) => best.get(p)!.cost - best.get(q)!.cost);
    const k = open.shift()!;
    const cur = best.get(k)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const c = stepCost(s, cur, { x: nx, y: ny });
      if (!isFinite(c)) continue;
      const other = unitAt(s, nx, ny);
      if (other && other.id !== u.id && other.side !== u.side) continue;
      const nc = cur.cost + c;
      if (nc > budget) continue;
      const nk = key(nx, ny);
      const old = best.get(nk);
      if (!old || nc < old.cost) {
        best.set(nk, { cost: nc, prev: k, x: nx, y: ny });
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  const out: Reach[] = [];
  for (const [k, v] of best) {
    const occupant = unitAt(s, v.x, v.y);
    if (occupant && occupant.id !== u.id) continue;
    const path: Pos[] = [];
    let c: string | null = k;
    while (c) { const n: { cost: number; prev: string | null; x: number; y: number } = best.get(c)!; path.unshift({ x: n.x, y: n.y }); c = n.prev; }
    out.push({ x: v.x, y: v.y, cost: v.cost, path });
  }
  return out;
}
