// Section 2 (MAP) and 6 (SEE): tiles, distance and line of sight.
import { LEGEND, type MapDef } from '../data';
import type { Pos, State, Tile, TileKind } from './types';

export function parseMap(def: MapDef): Tile[] {
  const tiles: Tile[] = [];
  const byLevel = [...def.levels].sort((a, b) => a.level - b.level);
  for (const lvl of byLevel) {
    for (let y = 0; y < def.depth; y++) {
      const row = lvl.rows[y] ?? '';
      for (let x = 0; x < def.width; x++) {
        const ch = row[x] ?? ' ';
        const kind: TileKind = LEGEND[ch] ?? 'void';
        tiles.push({ x, y, level: lvl.level, kind, open: false });
      }
    }
  }
  return tiles;
}

export function tileIndex(s: Pick<State, 'width' | 'depth'>, p: Pos): number {
  return p.level * s.width * s.depth + p.y * s.width + p.x;
}

export function inBounds(s: Pick<State, 'width' | 'depth' | 'levels'>, p: Pos): boolean {
  return (
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    Number.isInteger(p.level) &&
    p.x >= 0 &&
    p.x < s.width &&
    p.y >= 0 &&
    p.y < s.depth &&
    p.level >= 0 &&
    p.level < s.levels
  );
}

export function tileAt(s: State, p: Pos): Tile | null {
  if (!inBounds(s, p)) return null;
  return s.tiles[tileIndex(s, p)] ?? null;
}

export function isPassable(kind: TileKind): boolean {
  return kind === 'ground' || kind === 'floor' || kind === 'door' || kind === 'stair';
}

/** SEE-1: what blocks a line of sight. */
export function blocksSight(t: Tile): boolean {
  return t.kind === 'wall' || (t.kind === 'door' && !t.open);
}

/** MAP-5. Returns null for tiles on different levels. */
export function distance(a: Pos, b: Pos): number | null {
  if (a.level !== b.level) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function chebyshev(a: Pos, b: Pos): number | null {
  if (a.level !== b.level) return null;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y && a.level === b.level;
}

/** SEE-1: Bresenham between tile centres; blocked by a wall or closed door strictly between. */
export function hasLineOfSight(s: State, a: Pos, b: Pos): boolean {
  if (a.level !== b.level) return false;
  if (!inBounds(s, a) || !inBounds(s, b)) return false;
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) return true;
    const t = s.tiles[tileIndex(s, { x: x0, y: y0, level: a.level })];
    if (t && blocksSight(t)) return false;
  }
}
