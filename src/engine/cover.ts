// Section 25 (COVER): what stands between a target and a shooter, on the target's own doorstep.
import { COVER_PROPS, MAPS } from '../data';
import type { Pos, State } from './types';
import { chebyshev, tileAt } from './map';

export type CoverGrade = 'none' | 'low' | 'half' | 'full';

const propIndex = new Map<string, Set<string>>();
function solidProps(mapId: string): Set<string> {
  let set = propIndex.get(mapId);
  if (!set) {
    set = new Set((MAPS[mapId]?.props ?? []).filter((p) => (COVER_PROPS as string[]).includes(p.kind)).map((p) => `${p.x},${p.y},${p.level}`));
    propIndex.set(mapId, set);
  }
  return set;
}

/** COVER-1: the neighbours of `target` on the side facing `from`: the axis tiles whose axis carries at least half the
 * line's run, and the diagonal tile when both do. */
export function coverTiles(target: Pos, from: Pos): Pos[] {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const out: Pos[] = [];
  const useX = sx !== 0 && ax * 2 >= ay;
  const useY = sy !== 0 && ay * 2 >= ax;
  if (useX) out.push({ x: target.x + sx, y: target.y, level: target.level });
  if (useY) out.push({ x: target.x, y: target.y + sy, level: target.level });
  if (useX && useY) out.push({ x: target.x + sx, y: target.y + sy, level: target.level });
  return out;
}

/** COVER-2, COVER-3: the best cover one tile gives. */
function gradeOf(s: State, p: Pos): CoverGrade {
  const t = tileAt(s, p);
  if (!t) return 'none';
  if (t.kind === 'wall' || (t.kind === 'door' && !t.open)) return 'full';
  if (t.kind === 'window') return 'half';
  if (t.kind === 'rubble') return 'low';
  if ((t.kind === 'floor' || t.kind === 'ground') && solidProps(s.mapId).has(`${p.x},${p.y},${p.level}`)) return 'low';
  return 'none';
}

const RANK: Record<CoverGrade, number> = { none: 0, low: 1, half: 2, full: 3 };

/** COVER-1..4: the target's cover against a shooter at `from`, and what it takes off the hit chance. */
export function coverAgainst(s: State, target: Pos, from: Pos): { grade: CoverGrade; value: number } {
  if (target.level !== from.level || (chebyshev(target, from) ?? 0) <= 1) return { grade: 'none', value: 0 };
  let best: CoverGrade = 'none';
  for (const p of coverTiles(target, from)) {
    const g = gradeOf(s, p);
    if (RANK[g] > RANK[best]) best = g;
  }
  const c = s.tuning.cover ?? { full: 0, half: 0, low: 0 };
  return { grade: best, value: best === 'none' ? 0 : c[best] };
}
