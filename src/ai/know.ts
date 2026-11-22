// What a side knows: everything here is read from its view (ARCH-5, VIEW-1..4) and query.* on that view.
// For the hostile side the enemies are the agency units it currently sees; for the agency they are the
// units its view marks hostile (revealed hosts, takers, fighters). An unrevealed host is a citizen to the
// agency here too, by construction: the view already redacted it (HIDE-1).
import { coverAgainst, query, tileIndex, unitSeesTile, type Action, type Pos, type Side, type State, type Unit } from '../engine';
import { boundedField, distanceAny, fieldTiles, ring, samePos } from './nav';

export interface Know {
  view: State;
  side: Side;
  enemy: Side;
  tick: number;
  own: Unit[];
  enemies: Unit[];
  citizens: Unit[];
  /** Tile indices held by living units the side knows of. */
  occupied: Set<number>;
  /** How many known enemies see this tile (SEE-2 from their positions and sight). */
  seenBy(p: Pos): number;
  passable(p: Pos): boolean;
  free(p: Pos): boolean;
  nearestEnemy(from: Pos, sameLevel?: boolean): Unit | null;
  canFire(u: Unit, t: Unit): boolean;
}

export function know(view: State, side: Side): Know {
  const enemy: Side = side === 'agency' ? 'hostile' : 'agency';
  const own = view.units.filter((u) => !u.down && u.side === side);
  const enemies = view.units.filter((u) => !u.down && u.side === enemy);
  const citizens = view.units.filter((u) => !u.down && u.side === 'civilian');
  const occupied = new Set<number>();
  for (const u of view.units) if (!u.down) occupied.add(tileIndex(view, u));
  const passable = (p: Pos) => {
    const t = query.tileInfo(view, p);
    return !!t && (t.kind === 'ground' || t.kind === 'floor' || t.kind === 'door' || t.kind === 'stair' || t.kind === 'rubble');
  };
  return {
    view,
    side,
    enemy,
    tick: view.tick,
    own,
    enemies,
    citizens,
    occupied,
    seenBy(p) {
      let n = 0;
      for (const e of enemies) if (unitSeesTile(view, e, p)) n += 1;
      return n;
    },
    passable,
    free(p) {
      return passable(p) && !occupied.has(tileIndex(view, p));
    },
    nearestEnemy(from, sameLevel = false) {
      let best: Unit | null = null;
      let bestD = Infinity;
      for (const e of enemies) {
        if (sameLevel && e.level !== from.level) continue;
        const d = distanceAny(from, e);
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
      return best;
    },
    canFire(u, t) {
      return query.hitChance(view, u.id, t.id).ok;
    },
  };
}

/** A free tile next to `target`, the one nearest to `from`; null when the target is boxed in. */
export function freeNeighbour(k: Know, target: Pos, from: Pos): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const p of ring(target)) {
    if (!k.free(p) && !samePos(p, from)) continue;
    const d = distanceAny(from, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** True when the unit already walks to within two tiles of `goal`, or stands on it, so no new order is needed (AI-3). */
export function headingTo(u: Unit, goal: Pos, tolerance = 2): boolean {
  if (!u.order) return samePos(u, goal);
  const at = u.order.to;
  return at.level === goal.level && Math.abs(at.x - goal.x) <= tolerance && Math.abs(at.y - goal.y) <= tolerance;
}

export function moveOrder(k: Know, u: Unit, to: Pos): Action | null {
  if (samePos(u, to)) return null;
  if (headingTo(u, to)) return null;
  return { type: 'move', side: k.side, unit: u.id, to: { x: to.x, y: to.y, level: to.level } };
}

export function stanceOrder(k: Know, u: Unit, stance: Unit['stance']): Action | null {
  return u.stance === stance ? null : { type: 'stance', side: k.side, unit: u.id, stance };
}

/** AI-12: crouch to fire from cover, stand to move. */
export function coverPosture(k: Know, u: Unit, target: Unit | null, moving: boolean): Action | null {
  const posture = u.posture ?? 'stand';
  if (moving) return posture === 'crouch' ? { type: 'posture', side: k.side, unit: u.id, posture: 'stand' } : null;
  if (target && posture === 'stand' && coverAgainst(k.view, u, target).grade !== 'none') return { type: 'posture', side: k.side, unit: u.id, posture: 'crouch' };
  return null;
}

export function fireOrder(k: Know, u: Unit, t: Unit): Action | null {
  return u.fireTarget === t.id ? null : { type: 'fire', side: k.side, unit: u.id, target: t.id };
}

/**
 * The best tile within `maxTicks` of the unit by `score` (higher is better; null rejects the tile). The own tile
 * takes part at cost 0, so a unit that is already well placed stays. Deterministic: ties go to the cheaper, then
 * the lower tile index.
 */
export function bestTile(k: Know, u: Unit, maxTicks: number, score: (p: Pos, ticks: number) => number | null): (Pos & { ticks: number }) | null {
  const f = boundedField(k.view, u, maxTicks);
  let best: (Pos & { ticks: number }) | null = null;
  let bestS = -Infinity;
  for (const p of fieldTiles(k.view, f)) {
    if (p.ticks > 0 && !k.free(p)) continue;
    const s = score(p, p.ticks);
    if (s === null) continue;
    if (s > bestS) {
      best = p;
      bestS = s;
    }
  }
  return best;
}

/**
 * A charge target (ORD-9) that catches at least `minEnemies` enemies in its nine tiles and no own unit: the tile with
 * the most enemies, then the most on its centre, then the lowest index. Null when nothing qualifies.
 */
export function blastTile(k: Know, u: Unit, minEnemies: number): Pos | null {
  if (u.charges <= 0 || u.blast) return null;
  const r = Math.ceil(k.view.tuning.blast.throwRange);
  let best: Pos | null = null;
  let bestS = 0;
  for (let y = u.y - r; y <= u.y + r; y++) {
    for (let x = u.x - r; x <= u.x + r; x++) {
      const at = { x, y, level: u.level };
      let enemies = 0;
      let centre = 0;
      let own = 0;
      for (const e of k.enemies) {
        if (e.level !== at.level || Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) > 1) continue;
        enemies += 1;
        if (e.x === x && e.y === y) centre += 1;
      }
      if (enemies < minEnemies) continue;
      for (const o of k.own) if (o.level === at.level && Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 1) own += 1;
      if (own > 0) continue;
      const s = enemies * 10 + centre;
      if (s <= bestS) continue;
      if (!query.blastPreview(k.view, u.id, at).ok) continue;
      best = at;
      bestS = s;
    }
  }
  return best;
}

/** A tile out of every known enemy's sight, as far from them as the budget allows (hosts flee, AI-4). */
export function hidingTile(k: Know, u: Unit, maxTicks: number): (Pos & { ticks: number }) | null {
  return bestTile(k, u, maxTicks, (p, ticks) => {
    const seen = k.seenBy(p);
    let nearest = Infinity;
    for (const e of k.enemies) nearest = Math.min(nearest, distanceAny(p, e));
    return (seen === 0 ? 1000 : 0) - seen * 50 + Math.min(nearest, 30) * 4 - ticks * 0.5;
  });
}

/**
 * A firing position against `target`: sees it, within `range` and not adjacent to it, seen by as few enemies as
 * possible (cover), near the `prefer` distance (where the weapon still bites but the target's does not, or less).
 * Used by fighters, revealed hosts and agents (AI-4, AI-6, AI-8).
 */
export function firingTile(k: Know, u: Unit, target: Unit, range: number, maxTicks: number, prefer = range): (Pos & { ticks: number }) | null {
  return bestTile(k, u, maxTicks, (p, ticks) => {
    if (p.level !== target.level) return null;
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d > range || d < 1.5) return null;
    if (!query.los(k.view, p, target)) return null;
    const seen = k.seenBy(p);
    // AI-12: a tile with cover against the target scores half its cover's value.
    return 100 - seen * 25 - Math.abs(d - prefer) * 4 - ticks * 0.6 + coverAgainst(k.view, p, target).value * 0.5;
  });
}
