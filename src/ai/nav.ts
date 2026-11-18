// Destination finding for the AI: a cost-capped Dijkstra over the view's tiles (the view carries every tile,
// RULING VIEW-1) with the engine's own neighbour and cost rules, so what the AI thinks is reachable, the
// engine's move order (ORD-3) agrees with. The engine computes the real path when the order is accepted;
// the AI only picks where to go. A full field on the block costs about 11 ms, this one a fraction of that.
import { neighbours, stepCost, tileIndex, posOfIndex, type Pos, type State, type Unit } from '../engine';

export interface Bounded {
  /** cost in ticks per tile index, own tile included at 0 */
  dist: Map<number, number>;
  origin: Pos;
}

type Mover = Pick<Unit, 'moveTicks' | 'x' | 'y' | 'level'>;

/** Every tile within `maxCost` ticks of the unit, by the MOVE-1/MOVE-2 rules. */
export function boundedField(s: State, unit: Mover, maxCost: number): Bounded {
  const origin = { x: unit.x, y: unit.y, level: unit.level };
  const dist = new Map<number, number>();
  const heap: { cost: number; seq: number; pos: Pos }[] = [];
  let seq = 0;
  const push = (item: { cost: number; seq: number; pos: Pos }) => {
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
  const better = (x: number, y: number) => {
    const a = heap[x]!;
    const b = heap[y]!;
    return a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
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
  dist.set(tileIndex(s, origin), 0);
  push({ cost: 0, seq: seq++, pos: origin });
  const done = new Set<number>();
  while (heap.length > 0) {
    const cur = pop();
    const cIdx = tileIndex(s, cur.pos);
    if (done.has(cIdx)) continue;
    done.add(cIdx);
    for (const n of neighbours(s, cur.pos, null)) {
      const c = cur.cost + stepCost(s, unit, cur.pos, n);
      if (c > maxCost) continue;
      const nIdx = tileIndex(s, n);
      const old = dist.get(nIdx);
      if (old === undefined || c < old) {
        dist.set(nIdx, c);
        push({ cost: c, seq: seq++, pos: n });
      }
    }
  }
  return { dist, origin };
}

/** The field's tiles as positions with their cost, own tile first, then by index (deterministic). */
export function fieldTiles(s: State, f: Bounded): (Pos & { ticks: number })[] {
  return [...f.dist.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([idx, ticks]) => ({ ...posOfIndex(s, idx), ticks }));
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y && a.level === b.level;
}

/** Planar distance when on one level; otherwise a large cross-level estimate (for ranking only, never a rule). */
export function distanceAny(a: Pos, b: Pos): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return a.level === b.level ? d : d + 20 * Math.abs(a.level - b.level);
}

/** The eight neighbours of a tile on its level, in the engine's E, S, W, N, NE, SE, SW, NW order. */
export function ring(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const) out.push({ x: p.x + dx, y: p.y + dy, level: p.level });
  return out;
}

/** Tiles along the Bresenham line from `a` to `b`, excluding `a`, including `b`. */
export function lineTiles(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const dx = Math.abs(b.x - x0);
  const dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1;
  const sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 500; guard++) {
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    out.push({ x: x0, y: y0, level: a.level });
  }
  return out;
}
