// The agency's `normal` driver (AI-8): the squad's self-defence behaviour and the bench's other seat. It fights
// what its view marks hostile, walks up to every apparent citizen to reveal hosts (HIDE-3) and sweeps unseen
// tiles. Unlike the hostile AI it keeps a memory (checked citizens, seen tiles), so it is a closure: the player
// never runs it, the bench does. It still reads only view(state, 'agency').
import { query, tileIndex, type Action, type Pos, type Side, type State, type Unit, canSuppress, coverAgainst, isPinned } from '../engine';
import { WEAPONS } from '../data';
import { bestTile, coverPosture, reloadOrder, fireOrder, firingTile, freeNeighbour, know, moveOrder, stanceOrder, type Know } from './know';
import { distanceAny } from './nav';
import type { AiDriver } from './types';

export function makeAgencyNormal(): AiDriver {
  const checked = new Set<string>();
  const seen = new Set<number>();
  let lastBattle = '';
  return (view: State, side: Side): Action[] => {
    const key = `${view.battleId}|${view.seed}`;
    if (key !== lastBattle) {
      checked.clear();
      seen.clear();
      lastBattle = key;
    }
    const k = know(view, side);
    const reveal = view.tuning.sight.revealRange;
    for (const idx of visibleIndices(view, side)) seen.add(idx);
    for (const c of k.citizens) {
      if (checked.has(c.id)) continue;
      for (const a of k.own) {
        if (a.level === c.level && Math.hypot(a.x - c.x, a.y - c.y) <= reveal && query.los(view, a, c)) {
          checked.add(c.id);
          break;
        }
      }
    }
    const out: Action[] = [];
    const claimed = new Map<string, number>();
    for (const a of k.own) agent(k, a, out, checked, claimed, seen);
    // Everything seen once and nothing to do: the hostiles moved behind the sweep, so sweep again.
    if (out.length === 0 && k.enemies.length === 0 && k.own.every((a) => !a.order && !a.fireTarget)) seen.clear();
    return out;
  };
}

function visibleIndices(view: State, side: Side): number[] {
  return query.visibleTiles(view, side).map((p) => tileIndex(view, p));
}

function agent(k: Know, a: Unit, out: Action[], checked: Set<string>, claimed: Map<string, number>, seen: Set<number>): void {
  const push = (x: Action | null) => x && out.push(x);
  push(stanceOrder(k, a, 'engage'));
  const range = a.weapon ? (WEAPONS[a.weapon]?.range ?? 1) : 0;
  const e = k.nearestEnemy(a, true);
  const buddy = k.own.some((o) => o.id !== a.id && o.level === a.level && Math.hypot(o.x - a.x, o.y - a.y) <= 4);
  const regroup = () => {
    let near: Unit | null = null;
    let nd = Infinity;
    for (const o of k.own) {
      if (o.id === a.id) continue;
      const d = distanceAny(a, o);
      if (d < nd) {
        near = o;
        nd = d;
      }
    }
    const n = near ? freeNeighbour(k, near, a) : null;
    if (n) push(moveOrder(k, a, n));
  };
  if (e) {
    // AI-15: stagger reloads: on its last round, an agent reloads early while two or more squadmates still fire.
    const wpn = a.weapon ? WEAPONS[a.weapon] : undefined;
    if (wpn?.magazine && a.ammo !== null && a.ammo !== undefined && a.ammo <= 1 && !(a.reloadLeft ?? 0)) {
      const firing = k.own.filter((o) => o.id !== a.id && !o.down && !(o.reloadLeft ?? 0) && (o.ammo ?? 1) > 1).length;
      if (firing >= 2) {
        push({ type: 'reload', side: k.side, unit: a.id });
        return;
      }
    }
    // AI-13: pinned in the open, the agent first moves to the nearest firing tile with cover against its target.
    if (isPinned(k.view, a) && coverAgainst(k.view, a, e).grade === 'none') {
      const spot = bestTile(k, a, 20, (p, ticks) => (coverAgainst(k.view, p, e).value > 0 && query.los(k.view, p, e) ? 100 - ticks : null));
      if (spot && spot.ticks > 0) {
        push(coverPosture(k, a, null, true));
        push(moveOrder(k, a, spot));
        return;
      }
    }
    if (k.canFire(a, e)) {
      // AI-13: a target in heavy cover is pinned with suppressive fire rather than shot at long odds.
      const q = query.hitChance(k.view, a.id, e.id);
      const sup = k.view.tuning.suppress;
      if (sup && q.ok && q.chance < sup.aiBelow && canSuppress(k.view, a, e).ok) {
        // Keep pinning while the target stays on or beside the pinned tile (SUP-3 reaches the neighbours).
        const same = a.suppressAt && a.suppressAt.level === e.level && Math.max(Math.abs(a.suppressAt.x - e.x), Math.abs(a.suppressAt.y - e.y)) <= 1;
        if (!same) push({ type: 'suppress', side: k.side, unit: a.id, at: { x: e.x, y: e.y, level: e.level } });
      } else push(fireOrder(k, a, e));
      push(coverPosture(k, a, e, false)); // AI-12
      return;
    }
    push(fireOrder(k, a, e));
    // Never advance on a hostile alone: a fighter beats one agent and loses to two.
    if (!buddy) {
      regroup();
      return;
    }
    // Fight from the far end of the weapon's range: out of a whip's or a bite's reach where possible.
    const to = firingTile(k, a, e, range, k.view.tuning.ai.coverSearchTicks, Math.max(2, range - 2));
    push(coverPosture(k, a, e, true));
    if (to && to.ticks > 0) push(moveOrder(k, a, to));
    else {
      const n = freeNeighbour(k, e, a);
      if (n) push(moveOrder(k, a, n));
    }
    return;
  }
  // AI-15: no enemy in sight: top up a half-empty weapon first.
  const reload = reloadOrder(k, a);
  if (reload) {
    push(reload);
    return;
  }
  const far = k.nearestEnemy(a);
  if (far) {
    if (!buddy) {
      regroup();
      return;
    }
    const n = freeNeighbour(k, far, a);
    if (n) push(moveOrder(k, a, n));
    return;
  }
  // Check the citizens: walk up to the nearest unchecked one nobody else is heading for.
  let c: Unit | null = null;
  let cd = Infinity;
  for (const z of k.citizens) {
    if (checked.has(z.id) || (claimed.get(z.id) ?? 0) >= 1) continue;
    const d = distanceAny(a, z);
    if (d < cd) {
      c = z;
      cd = d;
    }
  }
  if (c) {
    claimed.set(c.id, 1);
    const n = freeNeighbour(k, c, a);
    if (n) push(moveOrder(k, a, n));
    return;
  }
  // Sweep: the nearest passable tile the side has never seen and this agent can still reach (a blasted stair cuts floors off).
  let best: Pos | null = null;
  let bd = Infinity;
  const v = k.view;
  const reach = new Set(query.reachable(v, a.id).map((p) => tileIndex(v, p)));
  for (let i = 0; i < v.tiles.length; i++) {
    if (seen.has(i) || !reach.has(i)) continue;
    const t = v.tiles[i]!;
    if (t.kind !== 'floor' && t.kind !== 'ground' && t.kind !== 'stair' && t.kind !== 'rubble' && t.kind !== 'door') continue;
    if (k.occupied.has(i)) continue;
    const d = distanceAny(a, t) + (a.order && a.order.to.x === t.x && a.order.to.y === t.y && a.order.to.level === t.level ? -5 : 0);
    if (d < bd) {
      best = t;
      bd = d;
    }
  }
  if (best) push(moveOrder(k, a, best));
}
