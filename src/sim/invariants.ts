// Section 16 (INV): checked by sim and action-fuzz after every step, and by tests.
import { SIDES, hashState, isPassable, legalActions, replay, tileAt, tileIndex, view, type Setup, type State } from '../engine';
import { sideSeesTile } from '../engine/sight';
import { isBreakable } from '../engine/structure';
import { MATERIALS } from '../data';

export interface InvariantOptions {
  /** Run the JSON round trip (INV-5) and the view check (INV-6); both are costly. */
  deep?: boolean;
  prev?: State | null;
  /** Whether the previous step was an accepted tick on a running battle (INV-4). */
  ticked?: boolean;
  /** Skip INV-1 (legalActions for every side is the costly check on a city block). */
  skipLegal?: boolean;
}

/** Returns the list of broken invariants, empty when all hold. */
export function checkInvariants(state: State, opts: InvariantOptions = {}): string[] {
  const broken: string[] = [];
  // INV-1
  if (!opts.skipLegal) for (const side of SIDES) if (legalActions(state, side).length === 0) broken.push(`INV-1 legalActions empty for ${side}`);
  // INV-2
  for (const u of state.units) {
    if (!(u.hp >= 0 && u.hp <= u.maxHp)) broken.push(`INV-2 ${u.id} hp ${u.hp}/${u.maxHp}`);
    if (u.down !== (u.hp === 0 || !!u.captured || !!u.saved)) broken.push(`INV-2 ${u.id} down=${u.down} hp=${u.hp}`);
  }
  // INV-3
  const seen = new Map<number, string>();
  for (const u of state.units) {
    const t = tileAt(state, u);
    if (!t) broken.push(`INV-3 ${u.id} off the map`);
    else if (!isPassable(t.kind)) broken.push(`INV-3 ${u.id} on ${t.kind}`);
    if (u.down) continue;
    const idx = tileIndex(state, u);
    const other = seen.get(idx);
    if (other) broken.push(`INV-3 ${u.id} shares a tile with ${other}`);
    seen.set(idx, u.id);
  }
  if (state.tiles.length !== state.width * state.depth * state.levels) broken.push('INV-3 tile count');
  for (const t of state.tiles) {
    if (!Number.isInteger(t.level) || t.level < 0 || t.level >= state.levels) {
      broken.push(`INV-3 tile ${t.x},${t.y} level ${t.level}`);
      break;
    }
  }
  // INV-8 (tiles are checked when they changed, and on every deep pass)
  if (opts.deep || !opts.prev || opts.prev.tiles !== state.tiles) {
    for (const t of state.tiles) {
      const max = MATERIALS[t.material]?.hp;
      if (max === undefined) broken.push(`INV-8 tile ${t.x},${t.y},${t.level} has unknown material ${t.material}`);
      else if (!(t.hp >= 0 && t.hp <= max)) broken.push(`INV-8 tile ${t.x},${t.y},${t.level} hp ${t.hp}/${max}`);
      else if (isBreakable(t) && t.hp === 0) broken.push(`INV-8 breakable tile ${t.x},${t.y},${t.level} rests at 0 hp`);
      else if ((t.kind === 'rubble' || t.kind === 'void') && t.material !== 'none') broken.push(`INV-8 ${t.kind} tile ${t.x},${t.y},${t.level} has material ${t.material}`);
      if (broken.length > 20) break;
    }
  }
  for (const u of state.units) {
    if (!(u.charges >= 0)) broken.push(`INV-8 ${u.id} charges ${u.charges}`);
    if (u.blast && u.blast.at.level !== u.level && !u.down) broken.push(`INV-8 ${u.id} pending charge on another level`);
  }
  // INV-4
  if (opts.prev) {
    if (state.tick < opts.prev.tick) broken.push(`INV-4 tick went back ${opts.prev.tick} -> ${state.tick}`);
    if (opts.ticked && !opts.prev.over && state.tick !== opts.prev.tick + 1) broken.push(`INV-4 tick ${opts.prev.tick} -> ${state.tick}`);
    if (!opts.ticked && state.tick !== opts.prev.tick) broken.push('INV-4 an order moved time');
  }
  if (opts.deep) {
    // INV-5
    const text = JSON.stringify(state);
    if (/\bNaN\b|Infinity|undefined/.test(text)) broken.push('INV-5 JSON text has NaN/Infinity/undefined');
    if (!deepEqual(JSON.parse(text), state)) broken.push('INV-5 JSON round trip differs');
    // INV-6
    for (const side of SIDES) {
      const v = view(state, side);
      for (const u of v.units) {
        if (u.side === side) continue;
        const real = state.units.find((r) => r.id === u.id);
        if (!real) {
          broken.push(`INV-6 view(${side}) has a unit that does not exist`);
          continue;
        }
        if (side === 'civilian' || !sideSeesTile(state, side, real)) broken.push(`INV-6 view(${side}) shows unseen ${u.id}`);
        if (u.order !== null || u.fireTarget !== null || u.aimProgress !== 0 || u.stance !== 'hold' || u.blast !== null || u.charges !== 0) broken.push(`INV-6 view(${side}) leaks orders of ${u.id}`);
        if (side === 'agency' && real.side === 'hostile' && real.disguised && !real.revealed && (u.side !== 'civilian' || u.weapon !== null)) {
          broken.push(`INV-6 view(agency) unmasks ${u.id}`);
        }
      }
      if (v.rng.some((x) => x !== 0) || v.log.length !== 0) broken.push(`INV-6 view(${side}) carries rng or log`);
    }
  }
  return broken;
}

/** INV-7 */
export function checkReplay(setup: Setup, state: State): string[] {
  const again = replay(setup, state.log);
  const a = hashState(again);
  const b = hashState(state);
  return a === b ? [] : [`INV-7 replay hash ${a} != ${b}`];
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
