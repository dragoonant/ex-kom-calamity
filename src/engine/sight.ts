// Section 6 (SEE) and 7 (HIDE): who sees what.
import type { Pos, Side, State, Unit } from './types';
import { distance, hasLineOfSight, tileIndex } from './map';

export function unitById(s: State, id: string): Unit | undefined {
  return s.units.find((u) => u.id === id);
}

export function livingUnits(s: State, side?: Side): Unit[] {
  return s.units.filter((u) => !u.down && (side === undefined || u.side === side));
}

/** SEE-2 */
export function unitSeesTile(s: State, viewer: Unit, p: Pos): boolean {
  if (viewer.down) return false;
  if (viewer.level !== p.level) return false;
  if (viewer.x === p.x && viewer.y === p.y) return true;
  const d = distance(viewer, p);
  if (d === null || d > viewer.sight) return false;
  return hasLineOfSight(s, viewer, p);
}

/** SEE-3. Civilians see nothing for rules purposes. */
export function sideSeesTile(s: State, side: Side, p: Pos): boolean {
  if (side === 'civilian') return false;
  for (const u of s.units) {
    if (u.side !== side || u.down) continue;
    if (unitSeesTile(s, u, p)) return true;
  }
  return false;
}

/** SEE-4 */
export function sideSeesUnit(s: State, side: Side, target: Unit): boolean {
  if (target.side === side) return true;
  return sideSeesTile(s, side, target);
}

/** Every tile index a side sees (SEE-3). */
export function visibleTileIndices(s: State, side: Side): number[] {
  const out = new Set<number>();
  if (side === 'civilian') return [];
  for (const u of s.units) {
    if (u.side !== side || u.down) continue;
    const r = Math.ceil(u.sight);
    for (let y = Math.max(0, u.y - r); y <= Math.min(s.depth - 1, u.y + r); y++) {
      for (let x = Math.max(0, u.x - r); x <= Math.min(s.width - 1, u.x + r); x++) {
        const p = { x, y, level: u.level };
        const idx = tileIndex(s, p);
        if (out.has(idx)) continue;
        if (unitSeesTile(s, u, p)) out.add(idx);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** HIDE-1 / CIV-3: what the agency takes for a citizen right now. */
export function appearsCivilianTo(side: Side, target: Unit): boolean {
  if (target.side === 'civilian') return true;
  if (side === 'agency' && target.side === 'hostile' && target.disguised && !target.revealed) return true;
  return false;
}

export function enemySide(side: Side): Side | null {
  if (side === 'agency') return 'hostile';
  if (side === 'hostile') return 'agency';
  return null;
}
