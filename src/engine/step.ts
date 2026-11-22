// ARCH-2: the pure step. Orders (section 4) and the tick (TIME-3, sections 5-12).
import { UNITS, type Side } from '../data';
import type { Action, GameEvent, Pos, State, StepResult, Unit } from './types';
import { POSTURES, SIDES, STANCES } from './types';
import { inBounds, isPassable, tileIndex } from './map';
import { pathField, pathTo, stepCost } from './path';
import { appearsCivilianTo, enemySide, sideSeesTile, sideSeesUnit, unitById, unitSeesTile } from './sight';
import { canFire, hitBreakdown, weaponOf, aimTicksFor, canSuppress, isPinned } from './fire';
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
      if (action.run !== undefined && typeof action.run !== 'boolean') return reject(state, 'run must be true or false');
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.order = { to: { ...action.to }, path, progress: 0, blockedTicks: 0, run: action.run === true };
      u.suppressAt = null; // SUP-3: a move ends suppressive fire
      u.capture = null;
      // POSE-2: a run stands a crouched unit up.
      if (action.run === true) u.posture = 'stand';
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
      u.suppressAt = null;
      u.capture = null;
      return accept(st, action);
    }
    case 'stance': {
      if (!(STANCES as string[]).includes(action.stance)) return reject(state, 'unknown stance');
      if (action.stance === target.stance) return reject(state, 'already in that stance');
      const st = cloneState(state);
      unitById(st, action.unit)!.stance = action.stance;
      return accept(st, action);
    }
    case 'posture': {
      // POSE-2
      if (!(POSTURES as string[]).includes(action.posture)) return reject(state, 'unknown posture');
      if (action.posture === (target.posture ?? 'stand')) return reject(state, 'already in that posture');
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.posture = action.posture;
      // A unit that crouches stops running: the rest of its move order is a walk.
      if (action.posture === 'crouch' && u.order) u.order.run = false;
      return accept(st, action);
    }
    case 'halt': {
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.order = null;
      u.fireTarget = null;
      u.aimProgress = 0;
      u.blast = null;
      u.suppressAt = null;
      u.capture = null;
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
    case 'capture': {
      // OBJ-1
      const why = captureBlock(state, target, action.target);
      if (why) return reject(state, why);
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      u.capture = { target: action.target, progress: 0 };
      u.order = null;
      u.fireTarget = null;
      u.suppressAt = null;
      u.aimProgress = 0;
      return accept(st, action);
    }
    case 'evacuate': {
      // OBJ-2
      if (typeof action.target !== 'string') return reject(state, 'missing citizen');
      const c = unitById(state, action.target);
      if (!c || c.down || c.side !== 'civilian') return reject(state, 'not a citizen');
      if (c.evacuating) return reject(state, 'already evacuating');
      if (c.level !== target.level || Math.max(Math.abs(c.x - target.x), Math.abs(c.y - target.y)) > 1) return reject(state, 'the citizen must be beside the agent');
      const exit = nearestExit(state, c);
      if (!exit) return reject(state, 'no way out from there');
      const st = cloneState(state);
      const cc = unitById(st, action.target)!;
      cc.evacuating = true;
      cc.order = { to: exit.to, path: exit.path, progress: 0, blockedTicks: 0, run: true };
      const ev = accept(st, action);
      if (ev.ok) ev.events.push({ type: 'evacuating', tick: st.tick, unit: cc.id, to: exit.to });
      return ev;
    }
    case 'suppress': {
      // SUP-3
      if (!isPos(action.at)) return reject(state, 'missing tile');
      const cs = canSuppress(state, target, action.at);
      if (!cs.ok) return reject(state, cs.reason);
      const st = cloneState(state);
      const u = unitById(st, action.unit)!;
      // SUP-3: shifting an existing suppression keeps the aim; starting one aims afresh.
      if (!u.suppressAt) u.aimProgress = 0;
      u.suppressAt = { x: action.at.x, y: action.at.y, level: action.at.level };
      u.fireTarget = null;
      u.order = null;
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
    // OBJ-1: a capture under way holds the agent beside its target.
    if (u.capture) {
      const t = unitById(st, u.capture.target);
      if (!t || t.down || t.level !== u.level || Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) > 1) u.capture = null;
      else {
        u.moving = false;
        u.capture.progress += 1;
        if (u.capture.progress >= st.tuning.objective.captureTicks) {
          t.down = true;
          t.captured = true;
          t.order = null;
          t.fireTarget = null;
          t.blast = null;
          t.moving = false;
          occ.delete(tileIndex(st, t));
          st.score.hostilesDown += 1;
          st.score.captured = (st.score.captured ?? 0) + 1;
          events.push({ type: 'captured', tick: st.tick, unit: t.id, by: u.id });
          u.capture = null;
        }
        continue;
      }
    }
    // SUP-3: suppressive fire on a tile, while the tile stays seen and in range.
    if (u.suppressAt) {
      if (!canSuppress(st, u, u.suppressAt).ok) u.suppressAt = null;
      else {
        u.moving = false;
        const w = weaponOf(u)!;
        if (st.tick >= u.readyTick) {
          u.aimProgress += 1;
          if (u.aimProgress >= aimTicksFor(st, w, true)) suppressFire(st, u, w.cooldownTicks, events);
        }
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
      // SNAP-1: a target the unit chose by its stance, not an ordered one, is a snap shot.
      const snap = u.fireTarget !== current.id;
      if (st.tick >= u.readyTick) {
        u.aimProgress += 1;
        if (u.aimProgress >= aimTicksFor(st, w, snap)) resolveShot(st, u, current, events, occ, snap);
      }
    } else {
      u.aimProgress = 0;
      // SUP-4: a pinned unit moves at half pace: it makes no progress on odd ticks.
      if (isPinned(st, u) && st.tick % 2 === 1) u.moving = false;
      else advanceMove(st, u, events, occ);
    }
  }

  // SUP-1: suppression fades.
  for (const u of st.units) if (u.suppression) u.suppression = Math.max(0, u.suppression - st.tuning.suppress.decayPerTick);

  // OBJ-3: an evacuating citizen who reaches the map's edge is safe and leaves the field.
  for (const c of st.units) {
    if (c.down || !c.evacuating || !isEdge(st, c)) continue;
    c.down = true;
    c.saved = true;
    c.order = null;
    c.moving = false;
    occ.delete(tileIndex(st, c));
    st.score.saved = (st.score.saved ?? 0) + 1;
    events.push({ type: 'saved', tick: st.tick, unit: c.id });
  }
  // OBJ-4: the wreck's core, secured by an agent standing on it, or burnt.
  if (st.core && !st.core.secured && !st.core.burnt) {
    const on = st.units.find((v) => !v.down && v.side === 'agency' && v.x === st.core!.at.x && v.y === st.core!.at.y && v.level === st.core!.at.level);
    if (on) {
      st.core.progress += 1;
      if (st.core.progress >= st.tuning.objective.coreTicks) {
        st.core.secured = true;
        events.push({ type: 'coreSecured', tick: st.tick, by: on.id });
      }
    } else if (st.tick >= st.tuning.objective.burnSeconds * st.tuning.time.ticksPerSecond) {
      st.core.burnt = true;
      events.push({ type: 'coreBurnt', tick: st.tick });
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

function addSuppression(st: State, u: Unit, amount: number): void {
  if (u.down || u.side === 'civilian') return;
  u.suppression = Math.min(st.tuning.suppress.cap, (u.suppression ?? 0) + amount);
}

/** SUP-3: one burst of suppressive fire: no roll, every enemy on or beside the tile is suppressed. */
function suppressFire(st: State, u: Unit, cooldown: number, events: GameEvent[]): void {
  const at = u.suppressAt!;
  u.readyTick = st.tick + cooldown;
  u.lastFiredTick = st.tick;
  u.aimProgress = 0;
  st.score.shotsFired += 1;
  if (u.disguised && !u.revealed) {
    u.revealed = true;
    events.push({ type: 'revealed', tick: st.tick, unit: u.id, by: 'fire' });
  }
  const pinned: string[] = [];
  for (const t of st.units) {
    if (t.down || t.side === u.side || t.side === 'civilian' || t.level !== at.level) continue;
    if (Math.max(Math.abs(t.x - at.x), Math.abs(t.y - at.y)) > 1) continue;
    addSuppression(st, t, st.tuning.suppress.fire);
    pinned.push(t.id);
  }
  events.push({ type: 'suppressFire', tick: st.tick, unit: u.id, at: { ...at }, weapon: u.weapon!, pinned });
}

/** OBJ-1: why a capture cannot start, or null. */
export function captureBlock(st: State, u: Unit, targetId: unknown): string | null {
  if (!st.canCapture) return 'the agency has no restraints';
  if (typeof targetId !== 'string') return 'missing target';
  const t = unitById(st, targetId);
  if (!t || t.down) return 'no such target';
  if (t.side !== 'hostile' || (t.template !== 'host' && t.template !== 'taker')) return 'only hosts and takers can be taken alive';
  if (t.disguised && !t.revealed) return 'that looks like a citizen';
  if (t.hp * 100 > t.maxHp * st.tuning.objective.captureHpPercent) return 'it is not weak enough to restrain';
  if (t.level !== u.level || Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) > 1) return 'the target must be beside the agent';
  return null;
}

/** OBJ-3: a tile on the map's outer ring at ground level. */
function isEdge(st: State, p: { x: number; y: number; level: number }): boolean {
  return p.level === 0 && (p.x === 0 || p.y === 0 || p.x === st.width - 1 || p.y === st.depth - 1);
}

/** OBJ-2: the nearest reachable edge tile from a citizen, by path cost. */
function nearestExit(st: State, c: Unit): { to: Pos; path: Pos[] } | null {
  const field = pathField(st, c, null);
  let best: { to: Pos; path: Pos[] } | null = null;
  let bestLen = Infinity;
  for (let x = 0; x < st.width; x++) for (const y of [0, st.depth - 1]) consider({ x, y, level: 0 });
  for (let y = 1; y < st.depth - 1; y++) for (const x of [0, st.width - 1]) consider({ x, y, level: 0 });
  function consider(p: Pos): void {
    const t = st.tiles[tileIndex(st, p)];
    if (!t || !isPassable(t.kind)) return;
    if (st.units.some((v) => !v.down && v.x === p.x && v.y === p.y && v.level === p.level)) return;
    const path = pathTo(st, field, p);
    if (!path || path.length === 0 || path.length >= bestLen) return;
    best = { to: p, path };
    bestLen = path.length;
  }
  return best;
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

function resolveShot(st: State, u: Unit, t: Unit, events: GameEvent[], occ: Map<number, Unit>, snap = false): void {
  const cf = canFire(st, u, t);
  if (!cf.ok) return;
  const w = cf.weapon;
  const breakdown = hitBreakdown(st, u, t, w, cf.distance, snap);
  const roll = nextInt(st.rng, 100);
  const hit = roll < breakdown.chance;
  // FIRE-4
  u.readyTick = st.tick + w.cooldownTicks;
  u.lastFiredTick = st.tick;
  u.aimProgress = 0;
  st.score.shotsFired += 1;
  // SUP-1: being shot at, hit or miss, suppresses the target (ranged fire only).
  if (w.kind === 'ranged') addSuppression(st, t, st.tuning.suppress.perShot + (hit ? st.tuning.suppress.perHit : 0));
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
    // STRAY-1: a ranged miss may hit a unit beside the target that the shooter can see, own side included.
    if (w.kind === 'ranged' && strayHit(st, u, t, w, events, occ)) return;
    // FIRE-7, STR-6: otherwise it may chew the wall behind the target.
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

/** STRAY-1, STRAY-2 */
function strayHit(st: State, u: Unit, t: Unit, w: NonNullable<ReturnType<typeof weaponOf>>, events: GameEvent[], occ: Map<number, Unit>): boolean {
  const pct = st.tuning.stray?.percent ?? 0;
  if (pct <= 0) return false;
  const near = st.units.filter((v) => !v.down && v !== u && v !== t && v.level === t.level && Math.max(Math.abs(v.x - t.x), Math.abs(v.y - t.y)) <= 1 && unitSeesTile(st, u, v));
  if (near.length === 0) return false;
  const roll = nextInt(st.rng, 100);
  if (roll >= pct) return false;
  const victim = near[nextInt(st.rng, near.length)]!;
  events.push({ type: 'strayHit', tick: st.tick, shooter: u.id, target: t.id, victim: victim.id, roll });
  const raw = w.damageMin + nextInt(st.rng, w.damageMax - w.damageMin + 1);
  if (appearsCivilianTo('agency', victim)) st.score.civilianHits += 1;
  hurtUnit(st, victim, raw, victim.armour, events, occ);
  return true;
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
    if (o.run) u.lastRunTick = st.tick; // POSE-4
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
  // POSE-4: a running step leaves the unit winded for fire.runSettleTicks.
  if (o.run) u.lastRunTick = st.tick;
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


