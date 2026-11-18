// Sections 19 (STR) and 20 (BLAST): tile health, destruction, collapse, stray rounds and charges.
// Everything here mutates the step's own clone of the state; the tile array is copied once per step.
import { MATERIALS, type WeaponDef } from '../data';
import type { GameEvent, Pos, State, Tile, Unit } from './types';
import { chebyshev, distance, inBounds, isPassable, tileIndex } from './map';
import { appearsCivilianTo, unitSeesTile } from './sight';

const ownsTiles = new WeakSet<State>();

/** The step's private copy of the tile array (the input state's array is never written). */
export function writableTiles(st: State): Tile[] {
  if (!ownsTiles.has(st)) {
    st.tiles = st.tiles.slice();
    ownsTiles.add(st);
  }
  return st.tiles;
}

/** STR-2 (stairs are never damaged since M3, RULING STR-2) */
export function isBreakable(t: Tile): boolean {
  if (t.kind !== 'wall' && t.kind !== 'door' && t.kind !== 'window' && t.kind !== 'floor') return false;
  return (MATERIALS[t.material]?.hp ?? 0) > 0;
}

function putDown(st: State, t: Unit, events: GameEvent[], occ: Map<number, Unit>): void {
  t.down = true;
  t.order = null;
  t.fireTarget = null;
  t.blast = null;
  t.aimProgress = 0;
  t.moving = false;
  const idx = tileIndex(st, t);
  if (occ.get(idx) === t) occ.delete(idx);
  if (t.side === 'agency') st.score.agentsDown += 1;
  else if (t.side === 'hostile') st.score.hostilesDown += 1;
  else st.score.civiliansDown += 1;
  events.push({ type: 'down', tick: st.tick, unit: t.id });
}

/** DMG-2..DMG-4 without the roll: `raw` less `armour`, the damaged event, and down at 0 hp. */
export function hurtUnit(st: State, t: Unit, raw: number, armour: number, events: GameEvent[], occ: Map<number, Unit>): void {
  const dealt = Math.max(0, raw - armour);
  t.hp = Math.max(0, t.hp - dealt);
  events.push({ type: 'damaged', tick: st.tick, unit: t.id, raw, armour, dealt, hp: t.hp });
  if (t.hp === 0) putDown(st, t, events, occ);
}

/** STR-3, STR-4, STR-5 */
export function damageTile(st: State, at: Pos, amount: number, events: GameEvent[], occ: Map<number, Unit>): void {
  if (!(amount > 0) || !inBounds(st, at)) return;
  const idx = tileIndex(st, at);
  const t = st.tiles[idx];
  if (!t || !isBreakable(t)) return;
  const pos = { x: t.x, y: t.y, level: t.level };
  const hp = Math.max(0, t.hp - amount);
  if (hp > 0) {
    writableTiles(st)[idx] = { ...t, hp };
    events.push({ type: 'tileDamaged', tick: st.tick, at: pos, amount, hp });
    return;
  }
  const collapses = (t.kind === 'floor' || t.kind === 'stair') && t.level > 0;
  if (!collapses) {
    writableTiles(st)[idx] = { ...t, kind: 'rubble', material: 'none', hp: 0, open: false };
    events.push({ type: 'tileDamaged', tick: st.tick, at: pos, amount, hp: 0 });
    events.push({ type: 'tileDestroyed', tick: st.tick, at: pos, was: t.kind, now: 'rubble' });
    return;
  }
  // STR-5: everyone on the floor drops one level, or the floor holds at 1 hp.
  const below = { x: t.x, y: t.y, level: t.level - 1 };
  const bIdx = tileIndex(st, below);
  const bt = st.tiles[bIdx];
  const riders = st.units.filter((u) => u.x === t.x && u.y === t.y && u.level === t.level);
  if (riders.length > 0) {
    const living = riders.some((u) => !u.down);
    const canLand = !!bt && isPassable(bt.kind) && !(living && occ.has(bIdx));
    if (!canLand) {
      writableTiles(st)[idx] = { ...t, hp: 1 };
      events.push({ type: 'tileDamaged', tick: st.tick, at: pos, amount, hp: 1 });
      return;
    }
  }
  writableTiles(st)[idx] = { ...t, kind: 'void', material: 'none', hp: 0, open: false };
  events.push({ type: 'tileDamaged', tick: st.tick, at: pos, amount, hp: 0 });
  events.push({ type: 'tileDestroyed', tick: st.tick, at: pos, was: t.kind, now: 'void' });
  const fall = st.tuning.structure.fallDamage;
  for (const u of riders) {
    if (u.down) {
      u.level = below.level;
      continue;
    }
    if (occ.get(idx) === u) occ.delete(idx);
    u.level = below.level;
    occ.set(bIdx, u);
    u.order = null;
    u.blast = null;
    u.aimProgress = 0;
    u.moving = false;
    const dealt = Math.min(u.hp, fall);
    u.hp -= dealt;
    events.push({ type: 'fell', tick: st.tick, unit: u.id, from: pos, to: { ...below }, dealt, hp: u.hp });
    if (u.hp === 0) putDown(st, u, events, occ);
  }
}

/** STR-6: where a missed ranged shot lands, if anywhere. */
export function strayRound(st: State, shooter: Unit, target: Unit, w: WeaponDef, events: GameEvent[], occ: Map<number, Unit>): void {
  if (w.kind !== 'ranged' || !(w.structureDamage > 0)) return;
  const dx0 = target.x - shooter.x;
  const dy0 = target.y - shooter.y;
  if (dx0 === 0 && dy0 === 0) return;
  const k = Math.ceil(w.range) + 1;
  let x0 = target.x;
  let y0 = target.y;
  const x1 = target.x + dx0 * k;
  const y1 = target.y + dy0 * k;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    const p = { x: x0, y: y0, level: shooter.level };
    if (!inBounds(st, p)) return;
    if ((distance(shooter, p) ?? Infinity) > w.range) return;
    const t = st.tiles[tileIndex(st, p)];
    if (!t) return;
    if (t.kind === 'wall' || t.kind === 'window' || (t.kind === 'door' && !t.open)) {
      damageTile(st, p, w.structureDamage, events, occ);
      return;
    }
  }
}

/** ORD-9 */
export function canBlast(s: State, u: Unit, at: Pos): { ok: true } | { ok: false; reason: string } {
  if (u.down) return { ok: false, reason: `${u.id} is down` };
  if (!(u.charges > 0)) return { ok: false, reason: 'no charges left' };
  if (!inBounds(s, at)) return { ok: false, reason: 'blast tile off the map' };
  if (at.level !== u.level) return { ok: false, reason: 'blast tile on another level' };
  if (at.x === u.x && at.y === u.y) return { ok: false, reason: 'cannot blast its own tile' };
  if ((distance(u, at) ?? Infinity) > s.tuning.blast.throwRange) return { ok: false, reason: 'blast tile out of range' };
  if (!unitSeesTile(s, u, at)) return { ok: false, reason: 'blast tile not seen' };
  return { ok: true };
}

/** ORD-8: every legal blast tile for a unit, in tile-index order. */
export function blastTargets(s: State, u: Unit): Pos[] {
  if (u.down || !(u.charges > 0)) return [];
  const r = Math.ceil(s.tuning.blast.throwRange);
  const out: Pos[] = [];
  for (let y = Math.max(0, u.y - r); y <= Math.min(s.depth - 1, u.y + r); y++) {
    for (let x = Math.max(0, u.x - r); x <= Math.min(s.width - 1, u.x + r); x++) {
      const at = { x, y, level: u.level };
      if (canBlast(s, u, at).ok) out.push(at);
    }
  }
  return out;
}

/** BLAST-3 order: centre, then E, S, W, N, NE, SE, SW, NW. */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/** QRY-8: the tiles a blast at `at` touches with what each takes, before armour. */
export function blastFootprint(s: State, at: Pos): (Pos & { structureDamage: number; unitDamage: number })[] {
  const b = s.tuning.blast;
  const out: (Pos & { structureDamage: number; unitDamage: number })[] = [];
  RING.forEach(([dx, dy], i) => {
    const p = { x: at.x + dx, y: at.y + dy, level: at.level };
    if (!inBounds(s, p)) return;
    out.push({ ...p, structureDamage: i === 0 ? b.structureDamage : b.edgeStructureDamage, unitDamage: i === 0 ? b.unitDamage : b.edgeUnitDamage });
  });
  return out;
}

/** BLAST-2..BLAST-5 */
export function detonate(st: State, u: Unit, events: GameEvent[], occ: Map<number, Unit>): void {
  if (!u.blast) return;
  const at = { ...u.blast.at };
  u.charges = Math.max(0, u.charges - 1);
  u.blast = null;
  u.lastFiredTick = st.tick;
  events.push({ type: 'blast', tick: st.tick, unit: u.id, at });
  const b = st.tuning.blast;
  // BLAST-4: units first, in unit order.
  for (const t of st.units) {
    if (t.down || t.level !== at.level) continue;
    const c = chebyshev(t, at);
    if (c === null || c > 1) continue;
    if (appearsCivilianTo('agency', t)) st.score.civilianHits += 1;
    hurtUnit(st, t, c === 0 ? b.unitDamage : b.edgeUnitDamage, t.armour, events, occ);
  }
  // BLAST-3: then the structure.
  for (const f of blastFootprint(st, at)) damageTile(st, f, f.structureDamage, events, occ);
}
