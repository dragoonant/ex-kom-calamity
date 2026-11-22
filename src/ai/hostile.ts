// The hostile side's `normal` AI (docs/spec/10-rules.md AI-4..AI-6): one behaviour per alien body (PLAN.md D14).
// Hosts pass as citizens, close in and ambush, and flee when exposed; takers charge agents, take citizens and
// otherwise guard the hosts; fighters fight at whip range from cover, breach walls with their charge and take the
// stairs after agents on other floors. Everything is a pure function of the view, the seed and the tick (AI-1).
import { query, type Action, type Pos, type State, type Unit, type Side, coverAgainst, isPinned } from '../engine';
import { WEAPONS } from '../data';
import { bestTile, blastTile, fireOrder, firingTile, freeNeighbour, hidingTile, know, moveOrder, stanceOrder, type Know, coverPosture } from './know';
import { boundedField, distanceAny, fieldTiles, lineTiles, samePos } from './nav';
import { unitRng, pickWith } from './rng';

function push(out: Action[], a: Action | null): void {
  if (a) out.push(a);
}

function weaponRange(u: Unit): number {
  return u.weapon ? (WEAPONS[u.weapon]?.range ?? 1) : 0;
}

function lowHp(k: Know, u: Unit): boolean {
  return u.hp * 100 < k.view.tuning.ai.fleeHpPercent * u.maxHp;
}

/** The quiet is over: enough agents are down, or the raid has run long without contact (AI-5, AI-6). */
function huntTime(k: Know): boolean {
  const t = k.view.tuning;
  return k.view.score.agentsDown >= t.ai.huntAfterAgentsDown || k.tick >= t.ai.huntAfterSeconds * t.time.ticksPerSecond;
}

/** Fleeing is worth it only while a healthier hostile is still in the fight; the last of them fight to the end (AI-4). */
function canFlee(k: Know, u: Unit): boolean {
  return k.own.some((o) => o.id !== u.id && !lowHp(k, o));
}



/** How many enemies stand within `ai.isolationRange` of this one, itself included: a straggler counts 1. */
function cluster(k: Know, e: Unit): number {
  const r = k.view.tuning.ai.isolationRange;
  let n = 0;
  for (const o of k.enemies) if (o.level === e.level && Math.hypot(o.x - e.x, o.y - e.y) <= r) n += 1;
  return n;
}

/** Own units (any body) within `r` tiles on the same level, the unit itself excluded. */
function alliesNear(k: Know, u: Unit, r: number): number {
  let n = 0;
  for (const o of k.own) if (o.id !== u.id && o.level === u.level && Math.hypot(o.x - u.x, o.y - u.y) <= r) n += 1;
  return n;
}

/** The enemy worth closing on: the most isolated, then the nearest (AI-4, AI-5). */
function straggler(k: Know, u: Unit, sameLevel: boolean): Unit | null {
  let best: Unit | null = null;
  let bestS = Infinity;
  for (const e of k.enemies) {
    if (sameLevel && e.level !== u.level) continue;
    const s = cluster(k, e) * 100 + distanceAny(u, e);
    if (s < bestS) {
      best = e;
      bestS = s;
    }
  }
  return best;
}

/** Among enemies this unit can fire at now, the one with the least hp, then the nearest (finish the hurt one). */
function shootable(k: Know, u: Unit): Unit | null {
  let best: Unit | null = null;
  let bestS = Infinity;
  for (const e of k.enemies) {
    if (e.level !== u.level || !k.canFire(u, e)) continue;
    const s = e.hp * 10 + distanceAny(u, e);
    if (s < bestS) {
      best = e;
      bestS = s;
    }
  }
  return best;
}

/** Nearest living own unit of one of the templates, for guarding. */
function nearestOwn(k: Know, from: Unit, templates: string[]): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const o of k.own) {
    if (o.id === from.id || !templates.includes(o.template)) continue;
    const d = distanceAny(from, o);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** A deterministic wander to any reachable tile when nothing is known (AI-5, AI-6: "roam"); only an idle unit picks one. */
function roam(k: Know, u: Unit, out: Action[]): void {
  if (u.order) return;
  const rng = unitRng(k.view.seed, k.tick, k.side, u.id);
  const tiles = query.reachable(k.view, u.id);
  const to = pickWith(rng, tiles);
  if (to) push(out, moveOrder(k, u, to));
}

/** Walk to within `near` tiles of another own unit (takers and fighters guard the hosts). */
function guard(k: Know, u: Unit, who: Unit, near: number, out: Action[]): void {
  if (distanceAny(u, who) <= near) return;
  const to = bestTile(k, u, 40, (p) => (p.level === who.level ? -Math.abs(Math.hypot(p.x - who.x, p.y - who.y) - near * 0.6) : null));
  if (to && to.ticks > 0) push(out, moveOrder(k, u, to));
  else {
    const n = freeNeighbour(k, who, u);
    if (n) push(out, moveOrder(k, u, n));
  }
}

/** AI-4: a host that still passes as a citizen. */
function hiddenHost(k: Know, u: Unit, out: Action[]): void {
  const t = k.view.tuning.ai;
  if (u.fireTarget) {
    // Committed to the ambush: keep engaging whatever this decision would otherwise say.
    push(out, stanceOrder(k, u, 'engage'));
    return;
  }
  const target = shootable(k, u);
  if (target && (distanceAny(u, target) <= t.hostAmbushRange || huntTime(k))) {
    // The ambush: open fire at point blank (HIDE-2 reveals it), then keep engaging.
    push(out, fireOrder(k, u, target));
    push(out, stanceOrder(k, u, 'engage'));
    return;
  }
  push(out, stanceOrder(k, u, 'hold'));
  if (k.enemies.some((e) => e.level === u.level)) {
    // Agents on this floor but none close enough: stand and pass as a citizen; walking at them would unmask it.
    if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
    return;
  }
  if (k.enemies.length > 0) {
    if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
    return;
  }
  // Nothing in sight. Late in a raid that has cost the agency dearly, the hosts stop passing and hunt.
  if (k.view.score.agentsDown >= t.huntAfterAgentsDown) roam(k, u, out);
  else if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
}

/** AI-4: a revealed host fights from range or runs when hurt or alone against several agents. */
function revealedHost(k: Know, u: Unit, out: Action[]): void {
  const e = k.nearestEnemy(u, true);
  const watchers = k.seenBy(u);
  const allies = k.own.filter((o) => o.id !== u.id && o.level === u.level && distanceAny(o, u) <= 8).length;
  const flee = canFlee(k, u) && (lowHp(k, u) || (watchers >= 3 && allies === 0));
  if (flee && e) {
    const to = hidingTile(k, u, 40);
    if (u.fireTarget) push(out, { type: 'halt', side: k.side, unit: u.id });
    push(out, stanceOrder(k, u, 'hold'));
    if (to && to.ticks > 0) push(out, moveOrder(k, u, to));
    return;
  }
  push(out, stanceOrder(k, u, 'engage'));
  if (!e) {
    const big = k.nearestEnemy(u);
    if (big) {
      const n = freeNeighbour(k, big, u);
      if (n) push(out, moveOrder(k, u, n));
    } else roam(k, u, out);
    return;
  }
  const target = shootable(k, u);
  if (target) {
    push(out, fireOrder(k, u, target));
    return;
  }
  const to = firingTile(k, u, e, weaponRange(u), k.view.tuning.ai.coverSearchTicks, k.view.tuning.ai.hostAmbushRange);
  if (to && to.ticks > 0) push(out, moveOrder(k, u, to));
  else {
    const n = freeNeighbour(k, e, u);
    if (n) push(out, moveOrder(k, u, n));
  }
}

/** AI-5: the taker. */
function taker(k: Know, u: Unit, out: Action[]): void {
  const t = k.view.tuning.ai;
  push(out, stanceOrder(k, u, 'engage'));
  const e = straggler(k, u, false);
  if (e && distanceAny(u, e) <= t.takerChaseRange && (cluster(k, e) <= 2 || alliesNear(k, u, 8) >= 2 || distanceAny(u, e) <= 3)) {
    push(out, fireOrder(k, u, e));
    if (!k.canFire(u, e)) {
      const n = freeNeighbour(k, e, u);
      if (n) push(out, moveOrder(k, u, n));
    }
    return;
  }
  // Seek a new host: the nearest citizen it knows of.
  let c: Unit | null = null;
  let cd = Infinity;
  for (const z of k.citizens) {
    const d = distanceAny(u, z);
    if (d < cd) {
      c = z;
      cd = d;
    }
  }
  if (c) {
    push(out, fireOrder(k, u, c));
    if (!k.canFire(u, c)) {
      const n = freeNeighbour(k, c, u);
      if (n) push(out, moveOrder(k, u, n));
    }
    return;
  }
  if (e) {
    push(out, fireOrder(k, u, e));
    const n = freeNeighbour(k, e, u);
    if (n) push(out, moveOrder(k, u, n));
    return;
  }
  const h = nearestOwn(k, u, ['host']);
  if (h && !huntTime(k)) guard(k, u, h, 3, out);
  else roam(k, u, out);
}

/** The first wall or window on the line to the target that a charge can be thrown at (AI-6 breach). */
function breachTile(k: Know, u: Unit, e: Unit): Pos | null {
  for (const p of lineTiles(u, e)) {
    const t = query.tileInfo(k.view, p);
    if (!t) return null;
    if (t.kind === 'wall' || t.kind === 'window' || (t.kind === 'door' && !t.open)) {
      return query.blastPreview(k.view, u.id, p).ok ? p : null;
    }
  }
  return null;
}

/** AI-6: the fighter. */
function fighter(k: Know, u: Unit, out: Action[]): void {
  const t = k.view.tuning.ai;
  push(out, stanceOrder(k, u, 'engage'));
  if (u.blast) return; // arming: stands still anyway (BLAST-2)
  const range = weaponRange(u);
  // The charge: thrown at two or more agents standing together, with no hostile beside them (BLAST-4 spares nobody).
  const grenade = blastTile(k, u, 2);
  if (grenade) {
    if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
    push(out, { type: 'blast', side: k.side, unit: u.id, at: grenade });
    return;
  }
  const target = shootable(k, u);
  // AI-13: pinned in the open, break line of sight before anything else.
  if (isPinned(k.view, u) && (!target || coverAgainst(k.view, u, target).grade === 'none')) {
    const to = hidingTile(k, u, 20);
    if (to && to.ticks > 0) {
      push(out, coverPosture(k, u, null, true));
      push(out, moveOrder(k, u, to));
      return;
    }
  }
  const outgunned = k.seenBy(u) >= 2 && alliesNear(k, u, 8) < 1;
  if (target && !outgunned) {
    push(out, fireOrder(k, u, target));
    // Firing: shift to cover only when exposed to several agents and a better tile is close.
    let moving = false;
    if (k.seenBy(u) >= 2 || lowHp(k, u)) {
      const to = firingTile(k, u, target, range, 15, range - 1);
      if (to && to.ticks > 0 && k.seenBy(to) < k.seenBy(u)) {
        push(out, moveOrder(k, u, to));
        moving = true;
      }
    }
    push(out, coverPosture(k, u, target, moving)); // AI-12
    return;
  }
  if (outgunned) {
    // Alone under two or more guns a fighter loses: break line of sight and wait for a straggler.
    const to = hidingTile(k, u, 30);
    if (to && to.ticks > 0) {
      if (u.fireTarget) push(out, { type: 'halt', side: k.side, unit: u.id });
      push(out, moveOrder(k, u, to));
      return;
    }
    if (target) {
      push(out, fireOrder(k, u, target));
      return;
    }
  }
  const e = straggler(k, u, true);
  if (e) {
    const bunched = cluster(k, e) >= 3 && alliesNear(k, u, 8) < 2;
    if (bunched && k.seenBy(u) > 0) {
      // A squad together outguns one fighter: slip out of sight and wait for them to spread.
      const to = hidingTile(k, u, 30);
      if (to && to.ticks > 0) push(out, moveOrder(k, u, to));
      return;
    }
    if (bunched) {
      if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
      return;
    }
    const to = firingTile(k, u, e, range, t.coverSearchTicks, range - 1);
    if (to && to.ticks > 0) {
      push(out, fireOrder(k, u, e));
      push(out, coverPosture(k, u, e, true));
      push(out, moveOrder(k, u, to));
      return;
    }
    // No firing position within reach: a wall is in the way. Breach it if the agent is near as the crow flies.
    const straight = Math.hypot(u.x - e.x, u.y - e.y);
    if (u.charges > 0 && straight <= t.breachRange) {
      const path = query.path(k.view, u.id, freeNeighbour(k, e, u) ?? e);
      if (!path || path.ticks > t.breachDetourTicks) {
        const at = breachTile(k, u, e);
        if (at) {
          if (u.order) push(out, { type: 'halt', side: k.side, unit: u.id });
          push(out, { type: 'blast', side: k.side, unit: u.id, at });
          return;
        }
      }
    }
    push(out, fireOrder(k, u, e));
    const n = freeNeighbour(k, e, u);
    if (n) push(out, moveOrder(k, u, n));
    return;
  }
  const far = straggler(k, u, false);
  if (far) {
    // Another floor: take the stairs towards a straggler (the engine paths through them, MAP-4).
    if (cluster(k, far) <= 2) {
      const n = freeNeighbour(k, far, u);
      if (n) push(out, moveOrder(k, u, n));
    }
    return;
  }
  const h = nearestOwn(k, u, ['host']);
  if (h && !huntTime(k)) guard(k, u, h, 5, out);
  else roam(k, u, out);
}

export function hostileNormal(view: State, side: Side): Action[] {
  const k = know(view, side);
  const out: Action[] = [];
  for (const u of k.own) {
    if (u.template === 'taker') taker(k, u, out);
    else if (u.template === 'fighter') fighter(k, u, out);
    else if (u.disguised && !u.revealed) hiddenHost(k, u, out);
    else revealedHost(k, u, out);
  }
  return out;
}

export { samePos };
