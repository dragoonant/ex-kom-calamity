// Section 5 (MOVE): step costs and cheapest-first paths (MOVE-1, MOVE-2).
import type { Pos, State, Unit } from './types';
import { inBounds, isPassable, tileIndex } from './map';

/** MOVE-2 neighbour order: E, S, W, N, NE, SE, SW, NW, then up, then down. */
const PLANAR: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

export function stepCost(s: State, unit: Pick<Unit, 'moveTicks'>, from: Pos, to: Pos): number {
  const t = s.tuning.move;
  if (from.level !== to.level) return Math.round((unit.moveTicks * t.stairCostPercent) / 100);
  if (from.x !== to.x && from.y !== to.y) return Math.round((unit.moveTicks * t.diagonalCostPercent) / 100);
  return unit.moveTicks;
}

function passableAt(s: State, p: Pos, blocked: Set<number> | null): boolean {
  if (!inBounds(s, p)) return false;
  const idx = tileIndex(s, p);
  const t = s.tiles[idx];
  if (!t || !isPassable(t.kind)) return false;
  if (blocked && blocked.has(idx)) return false;
  return true;
}

/** Legal steps out of `from` (MOVE-1, MAP-4), in MOVE-2 order. */
export function neighbours(s: State, from: Pos, blocked: Set<number> | null): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of PLANAR) {
    const p = { x: from.x + dx, y: from.y + dy, level: from.level };
    if (!passableAt(s, p, blocked)) continue;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: both orthogonal tiles passed must be passable (units ignored).
      const a = { x: from.x + dx, y: from.y, level: from.level };
      const b = { x: from.x, y: from.y + dy, level: from.level };
      if (!passableAt(s, a, null) || !passableAt(s, b, null)) continue;
    }
    out.push(p);
  }
  const here = s.tiles[tileIndex(s, from)];
  if (here && here.kind === 'stair') {
    for (const dl of [1, -1]) {
      const p = { x: from.x, y: from.y, level: from.level + dl };
      if (!inBounds(s, p)) continue;
      const t = s.tiles[tileIndex(s, p)];
      if (t && t.kind === 'stair' && !(blocked && blocked.has(tileIndex(s, p)))) out.push(p);
    }
  }
  return out;
}

export interface PathField {
  /** cost in ticks per tile index; missing = unreachable */
  dist: Map<number, number>;
  prev: Map<number, number>;
  origin: Pos;
}

/** Dijkstra from the unit's tile over passable tiles. `blocked` tiles are impassable (MOVE-5 replan). */
export function pathField(s: State, unit: Pick<Unit, 'moveTicks' | 'x' | 'y' | 'level'>, blocked: Set<number> | null): PathField {
  const origin = { x: unit.x, y: unit.y, level: unit.level };
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  // Binary heap on (cost, seq) so ties resolve in insertion (neighbour) order.
  const heap: { cost: number; seq: number; idx: number; pos: Pos }[] = [];
  let seq = 0;
  const push = (item: { cost: number; seq: number; idx: number; pos: Pos }) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const a = heap[i]!;
      const b = heap[p]!;
      if (a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq)) {
        heap[i] = b;
        heap[p] = a;
        i = p;
      } else break;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        const better = (x: number, y: number) => {
          const a = heap[x]!;
          const b = heap[y]!;
          return a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
        };
        if (l < heap.length && better(l, m)) m = l;
        if (r < heap.length && better(r, m)) m = r;
        if (m === i) break;
        const t = heap[i]!;
        heap[i] = heap[m]!;
        heap[m] = t;
        i = m;
      }
    }
    return top;
  };
  const oIdx = tileIndex(s, origin);
  dist.set(oIdx, 0);
  push({ cost: 0, seq: seq++, idx: oIdx, pos: origin });
  const done = new Set<number>();
  while (heap.length > 0) {
    const cur = pop();
    if (done.has(cur.idx)) continue;
    done.add(cur.idx);
    for (const n of neighbours(s, cur.pos, blocked)) {
      const nIdx = tileIndex(s, n);
      const c = cur.cost + stepCost(s, unit, cur.pos, n);
      const old = dist.get(nIdx);
      if (old === undefined || c < old) {
        dist.set(nIdx, c);
        prev.set(nIdx, cur.idx);
        push({ cost: c, seq: seq++, idx: nIdx, pos: n });
      }
    }
  }
  return { dist, prev, origin };
}

export function posOfIndex(s: Pick<State, 'width' | 'depth'>, idx: number): Pos {
  const perLevel = s.width * s.depth;
  const level = Math.floor(idx / perLevel);
  const rem = idx - level * perLevel;
  return { x: rem % s.width, y: Math.floor(rem / s.width), level };
}

/** Steps from the field's origin to `to`, excluding the origin; null when unreachable. */
export function pathTo(s: State, field: PathField, to: Pos): Pos[] | null {
  if (!inBounds(s, to)) return null;
  const target = tileIndex(s, to);
  if (!field.dist.has(target)) return null;
  const steps: Pos[] = [];
  let cur = target;
  const oIdx = tileIndex(s, field.origin);
  while (cur !== oIdx) {
    steps.push(posOfIndex(s, cur));
    const p = field.prev.get(cur);
    if (p === undefined) return null;
    cur = p;
  }
  steps.reverse();
  return steps;
}
