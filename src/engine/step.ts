// ARCH-2: the pure step. Orders (section 4) and the tick (TIME-3, sections 5-12).
import { UNITS, type Side } from '../data';
import type { Action, GameEvent, Pos, State, StepResult, Unit } from './types';
import { SIDES, STANCES } from './types';
import { inBounds, isPassable, tileIndex } from './map';
import { pathField, pathTo, stepCost } from './path';
import { appearsCivilianTo, enemySide, sideSeesTile, sideSeesUnit, unitById } from './sight';
import { canFire, hitBreakdown, weaponOf } from './fire';
import { hasLineOfSight, distance as unitDistance } from './map';
import { nextInt } from './rng';
import { appendLog } from './replay';
import { canBlast, detonate, hurtUnit, strayRound, writableTiles } from './structure';
import { neighbours } from './path';

function cloneState(s: State): State {
  return {
    ...s,
    units: s.units.map((u) => ({
      ...u,
      order: u.order ? { ...u.order, to: { ...u.order.to }, path: u.order.path.map((p) => ({ ...p })) } : null,
      blast: u.blast ? { at: { ...u.blast.at }, progress: u.blast.progress } : null,
    })),
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    score: { ...s.score },
    over: s.over ? { ...s.over } : null,
    log: s.log,
  };
}

function reject(state: State, reason: string): StepResult {
  return { ok: false, state, reason };
}

function isSide(x: unknown): x is Side {
  return typeof x === 'string' && (SIDES as string[]).includes(x);
}

function isPos(x: unknown): x is Pos {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return typeof p.x === 'number' && typeof p.y === 'number' && typeof p.level === 'number';
}

export function step(state: State, action: Action): StepResult {
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return reject(state, 'malformed action');
  }
  if (action.type === 'tick') return runTick(state);
  return applyOrder(state, action);
}

// ---------------------------------------------------------------- orders

function applyOrder(state: State, action: Exclude<Action, { type: 'tick' }>): StepResult {
  if (state.over) return reject(state, 'battle over');
  if (!isSide(action.side)) return reject(state, 'unknown side');
  if (action.side === 'civilian') return reject(state, 'civilians take no orders');

  if (action.type === 'withdraw') {
    if (action.side !== 'agency') return reject(state, 'only the agency withdraws');
    const st = cloneState(state);
    st.over = { winner: 'none', reason: 'withdrawn', tick: st.tick };
    st.log = appendLog(st.log, action);
    const events: GameEvent[] = [
      { type: 'ordered', tick: st.tick, action },
      { type: 'over', tick: st.tick, winner: 'none', reason: 'withdrawn' },
    ];
    return { ok: true, state: st, events };
  }

  if (typeof action.unit !== 'string') return reject(state, 'missing unit');
  const target = unitById(state, action.unit);
  if (!target) return reject(state, `no unit ${action.unit}`);
  if (target.down) return reject(state, `${action.unit} is down`);
  if (target.side !== action.side) return reject(state, `${action.unit} is not a ${action.side} unit`);

  switch (action.type) {
    case 'move': {
      if (!isPos(action.to) || !inBounds(state, action.to)) return reject(state, 'destination off the map');
      const t = state.tiles[tileIndex(state, action.to)];
      if (!t || !isPassable(t.kind)) return reject(state, 'destination impassable');
      if (action.to.x === target.x && action.to.y === target.y && action.to.level === target.level) return reject(state, 'already there');
      const holder = state.units.find((u) => !u.down && u.x === action.to.x && u.y === action.to.y && u.level === action.to.level);
      if (holder) return reject(state, `destination held by ${holder.id}`);
      const path = pathTo(state, pathField(state, target, null), action.to);
      if (!path || path.length === 0) return reject(state, 'no path');
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.order = { to: { ...action.to }, path, progress: 0, blockedTicks: 0 };
      return accept(st, action);
    }
    case 'fire': {
      if (typeof action.target !== 'string') return reject(state, 'missing target');
      const tgt = unitById(state, action.target);
      if (!tgt) return reject(state, `no unit ${action.target}`);
      if (tgt.down) return reject(state, `${action.target} is down`);
      if (tgt.side === action.side) return reject(state, 'cannot fire on own side');
      if (!sideSeesUnit(state, action.side, tgt)) return reject(state, `${action.target} is not seen`);
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      if (u.fireTarget !== action.target) u.aimProgress = 0;
      u.fireTarget = action.target;
      return accept(st, action);
    }
    case 'stance': {
      if (!(STANCES as string[]).includes(action.stance)) return reject(state, 'unknown stance');
      if (action.stance === target.stance) return reject(state, 'already in that stance');
      const st = cloneState(state);
      unitById(st, action.unit)!.stance = action.stance;
      return accept(st, action);
    }
    case 'halt': {
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.order = null;
      u.fireTarget = null;
      u.aimProgress = 0;
      u.blast = null;
      return accept(st, action);
    }
    case 'blast': {
      // ORD-9
      if (!isPos(action.at)) return reject(state, 'missing blast tile');
      const cb = canBlast(state, target, action.at);
      if (!cb.ok) return reject(state, cb.reason);
      const st = cloneState(state);
      unitById(st, action.unit)!.blast = { at: { x: action.at.x, y: action.at.y, level: action.at.level }, progress: 0 };
      return accept(st, action);
    }
    default:
      return reject(state, 'unknown action');
  }
}

function accept(st: State, action: Exclude<Action, { type: 'tick' }>): StepResult {
  st.log = appendLog(st.log, action);
  return { ok: true, state: st, events: [{ type: 'ordered', tick: st.tick, action }] };
}

// ---------------------------------------------------------------- tick

function runTick(state: State): StepResult {
  // TIME-5: a tick after the end is accepted and changes nothing (not even the log).
  if (state.over) return { ok: true, state, events: [] };
  const st = cloneState(state);
  const events: GameEvent[] = [];
  const occ = new Map<number, Unit>();
  for (const u of st.units) if (!u.down) occ.set(tileIndex(st, u), u);

  // TIME-3a: every living unit in unit order.
  for (const u of st.units) {
    if (u.down) continue;
    if (u.blast) {
      // BLAST-2: arming a charge comes before everything else.
      if (u.blast.at.level !== u.level) u.blast = null;
      else {
        u.moving = false;
        u.aimProgress = 0;
        u.blast.progress += 1;
        if (u.blast.progress >= st.tuning.blast.armTicks) detonate(st, u, events, occ);
        continue;
      }
    }
    let current: Unit | null = null;
    if (u.fireTarget) {
      const t = unitById(st, u.fireTarget);
      if (!t || t.down || !sideSeesUnit(st, u.side, t)) u.fireTarget = null;
      else if (canFire(st, u, t).ok) current = t;
    }
    if (!current && u.weapon) current = stanceTarget(st, u);
    if (current) {
      u.moving = false;
      const w = weaponOf(u)!;
      if (st.tick >= u.readyTick) {
        u.aimProgress += 1;
        if (u.aimProgress >= w.aimTicks) resolveShot(st, u, current, events, occ);
      }
    } else {
      u.aimProgress = 0;
      advanceMove(st, u, events, occ);
    }
  }

  // TIME-3b: proximity reveals (HIDE-3).
  const reveal = st.tuning.sight.revealRange;
  for (const h of st.units) {
    if (h.down || h.side !== 'hostile' || !h.disguised || h.revealed) continue;
    for (const a of st.units) {
      if (a.down || a.side !== 'agency' || a.level !== h.level) continue;
      const d = unitDistance(a, h);
      if (d === null || d > reveal) continue;
      if (!hasLineOfSight(st, a, h)) continue;
      h.revealed = true;
      events.push({ type: 'revealed', tick: st.tick, unit: h.id, by: 'proximity' });
      break;
    }
  }

  // TIME-3c
  st.tick += 1;
  st.log = appendLog(st.log, { type: 'tick' });

  // TIME-3d: section 12.
  const liveAgency = st.units.filter((u) => !u.down && u.side === 'agency').length;
  const liveHostile = st.units.filter((u) => !u.down && u.side === 'hostile').length;
  const maxTicks = st.tuning.time.maxBattleSeconds * st.tuning.time.ticksPerSecond;
  if (liveAgency === 0 && liveHostile === 0) st.over = { winner: 'none', reason: 'mutual', tick: st.tick };
  else if (liveHostile === 0) st.over = { winner: 'agency', reason: 'cleared', tick: st.tick };
  else if (liveAgency === 0) st.over = { winner: 'hostile', reason: 'squad-lost', tick: st.tick };
  else if (st.tick >= maxTicks) st.over = { winner: 'none', reason: 'timeout', tick: st.tick };
  if (st.over) events.push({ type: 'over', tick: st.tick, winner: st.over.winner, reason: st.over.reason });

  return { ok: true, state: st, events };
}

/** STANCE-3, STANCE-4 */
export function stanceTarget(st: State, u: Unit): Unit | null {
  if (u.stance === 'hold') return null;
  const enemy = enemySide(u.side);
  if (!enemy) return null;
  const memory = st.tuning.fire.retaliateMemoryTicks;
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const t of st.units) {
    if (t.down || t.side !== enemy) continue;
    if (appearsCivilianTo(u.side, t)) continue;
    if (u.stance === 'retaliate' && !(t.lastFiredTick >= 0 && st.tick - t.lastFiredTick <= memory)) continue;
    if (!canFire(st, u, t).ok) continue;
    const d = unitDistance(u, t) ?? Infinity;
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function resolveShot(st: State, u: Unit, t: Unit, events: GameEvent[], occ: Map<number, Unit>): void {
  const cf = canFire(st, u, t);
  if (!cf.ok) return;
  const w = cf.weapon;
  const breakdown = hitBreakdown(st, u, t, w, cf.distance);
  const roll = nextInt(st.rng, 100);
  const hit = roll < breakdown.chance;
  // FIRE-4
  u.readyTick = st.tick + w.cooldownTicks;
  u.lastFiredTick = st.tick;
  u.aimProgress = 0;
  st.score.shotsFired += 1;
  events.push({
    type: 'shot',
    tick: st.tick,
    shooter: u.id,
    target: t.id,
    weapon: u.weapon!,
    distance: cf.distance,
    moving: t.moving,
    breakdown,
    roll,
    hit,
  });
  if (u.disguised && !u.revealed) {
    u.revealed = true;
    events.push({ type: 'revealed', tick: st.tick, unit: u.id, by: 'fire' });
  }
  if (!hit) {
    // FIRE-7, STR-6: a miss never hits a unit, but it may chew the wall behind the target.
    strayRound(st, u, t, w, events, occ);
    return;
  }
  // Section 10
  const appearsCivilian = appearsCivilianTo('agency', t); // CIV-3, judged before anything changes
  if (w.takes && t.side === 'civilian' && UNITS[w.takes]) {
    // Section 21: a taking hit converts the citizen instead of hurting it (no damage roll, so the RNG stream is untouched).
    st.score.hits += 1;
    st.score.civilianHits += 1;
    take(st, t, u, w.takes, events);
    return;
  }
  const raw = w.damageMin + nextInt(st.rng, w.damageMax - w.damageMin + 1);
  st.score.hits += 1;
  if (appearsCivilian) st.score.civilianHits += 1;
  hurtUnit(st, t, raw, t.armour, events, occ);
}

/** TAKE-1..TAKE-3: the citizen becomes the taking weapon's template, on its tile, with its hp. */
function take(st: State, t: Unit, by: Unit, templateId: string, events: GameEvent[]): void {
  const tpl = UNITS[templateId]!;
  const seen = sideSeesTile(st, 'agency', t);
  t.template = templateId;
  t.name = tpl.name;
  t.side = tpl.side;
  t.armour = tpl.armour;
  t.aim = tpl.aim;
  t.moveTicks = tpl.moveTicks;
  t.sight = tpl.sight;
  t.weapon = tpl.weapon;
  t.disguised = tpl.disguised;
  t.revealed = seen;
  t.stance = tpl.defaultStance;
  t.order = null;
  t.fireTarget = null;
  t.aimProgress = 0;
  t.readyTick = st.tick;
  t.moving = false;
  t.charges = tpl.charges ?? 0;
  t.blast = null;
  st.score.taken += 1;
  events.push({ type: 'taken', tick: st.tick, unit: t.id, by: by.id, seen });
}

/** MOVE-3, MOVE-5, MOVE-7 */
function advanceMove(st: State, u: Unit, events: GameEvent[], occ: Map<number, Unit>): void {
  const o = u.order;
  if (!o) {
    u.moving = false;
    return;
  }
  const next = o.path[0];
  if (!next) {
    u.order = null;
    u.moving = false;
    return;
  }
  // MOVE-5: the next step may have been destroyed under the order (STR-4); replan at once.
  if (!neighbours(st, u, null).some((n) => n.x === next.x && n.y === next.y && n.level === next.level)) {
    const path = pathTo(st, pathField(st, u, null), o.to);
    u.moving = false;
    if (!path || path.length === 0) {
      u.order = null;
      events.push({ type: 'moveBlocked', tick: st.tick, unit: u.id });
    } else {
      o.path = path;
      o.progress = 0;
      o.blockedTicks = 0;
    }
    return;
  }
  const cost = stepCost(st, u, u, next);
  if (o.progress < cost) o.progress += 1;
  if (o.progress < cost) {
    u.moving = true;
    return;
  }
  const nIdx = tileIndex(st, next);
  const holder = occ.get(nIdx);
  if (holder && holder !== u) {
    u.moving = false;
    o.blockedTicks += 1;
    if (o.blockedTicks >= st.tuning.move.blockedWaitTicks) {
      const blocked = new Set(occ.keys());
      blocked.delete(tileIndex(st, u));
      const path = pathTo(st, pathField(st, u, blocked), o.to);
      if (!path || path.length === 0) {
        u.order = null;
        events.push({ type: 'moveBlocked', tick: st.tick, unit: u.id });
      } else {
        o.path = path;
        o.progress = 0;
        o.blockedTicks = 0;
      }
    }
    return;
  }
  const from = { x: u.x, y: u.y, level: u.level };
  occ.delete(tileIndex(st, u));
  u.x = next.x;
  u.y = next.y;
  u.level = next.level;
  occ.set(nIdx, u);
  o.path.shift();
  o.progress = 0;
  o.blockedTicks = 0;
  u.moving = true;
  const tile = st.tiles[nIdx];
  if (tile && tile.kind === 'door' && !tile.open) {
    writableTiles(st)[nIdx] = { ...tile, open: true };
    events.push({ type: 'doorOpened', tick: st.tick, at: { ...next } });
  }
  events.push({ type: 'moved', tick: st.tick, unit: u.id, from, to: { ...next } });
  if (o.path.length === 0) {
    u.order = null;
    events.push({ type: 'arrived', tick: st.tick, unit: u.id });
  }
}


