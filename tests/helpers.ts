// Test helpers. Every test drives the real step(); these only build plain-JSON states.
import { createGame, step, type Action, type GameEvent, type Pos, type Setup, type State, type Unit } from '../src/engine';
import type { Tuning } from '../src/data';

export const SETUP: Setup = { battleId: 'first-raid', seed: 1 };

export function game(seed = 1, tuning?: Partial<Tuning>): State {
  return createGame({ battleId: 'first-raid', seed, tuning });
}

/** Forced outcomes through tuning (FIRE-5 clamps to the range). */
export const ALWAYS_HIT: Partial<Tuning> = { fire: { minHitChance: 100, maxHitChance: 100, movingTargetPenalty: 15, retaliateMemoryTicks: 50 } };
export const NEVER_HIT: Partial<Tuning> = { fire: { minHitChance: 0, maxHitChance: 0, movingTargetPenalty: 15, retaliateMemoryTicks: 50 } };

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export function unit(s: State, id: string): Unit {
  const u = s.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id} in test state`);
  return u;
}

/** Returns a copy with the unit moved to a tile. */
export function place(s: State, id: string, x: number, y: number, level = 0): State {
  const c = clone(s);
  const u = unit(c, id);
  u.x = x;
  u.y = y;
  u.level = level;
  return c;
}

export function patch(s: State, id: string, p: Partial<Unit>): State {
  const c = clone(s);
  Object.assign(unit(c, id), p);
  return c;
}

/**
 * Keeps only the named units alive; everyone else is down at hp 0 and parked outside the building.
 * So that END-1/END-2 do not end the battle at the first tick, one hostile (the roof taker u9, out
 * of everyone's sight on level 2) and one agent (a6, far down the street) stay alive unless the
 * list already has one of their side. Pass `keepEnds: false` to drop that safety (END tests).
 */
export function only(s: State, ids: string[], keepEnds = true): State {
  const c = clone(s);
  const keep = new Set(ids);
  if (keepEnds) {
    // Sentinels: the roof taker (level 2, nobody's level) and a blind, unarmed a6 in the far corner.
    keep.add('u9');
    if (!ids.includes('a6')) {
      keep.add('a6');
      Object.assign(unit(c, 'a6'), { x: 15, y: 11, level: 0, sight: 0, weapon: null, stance: 'hold' });
    }
  }
  let park = 0;
  for (const u of c.units) {
    if (keep.has(u.id)) continue;
    u.hp = 0;
    u.down = true;
    u.order = null;
    u.fireTarget = null;
    // Street tiles along y = 0, each body on its own tile (INV-3 only cares about living units).
    u.x = park % c.width;
    u.y = 0;
    u.level = 0;
    park += 1;
  }
  return c;
}

export function order(s: State, a: Action): { state: State; events: GameEvent[] } {
  const r = step(s, a);
  if (!r.ok) throw new Error(`order rejected: ${r.reason} (${JSON.stringify(a)})`);
  return { state: r.state, events: r.events };
}

export function expectReject(s: State, a: Action): string {
  const r = step(s, a);
  if (r.ok) throw new Error(`expected rejection of ${JSON.stringify(a)}`);
  if (r.state !== s) throw new Error('rejection returned a different state object');
  return r.reason;
}

export function tick(s: State, n = 1): { state: State; events: GameEvent[] } {
  let st = s;
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = step(st, { type: 'tick' });
    if (!r.ok) throw new Error('tick rejected');
    st = r.state;
    events.push(...r.events);
  }
  return { state: st, events };
}

export const pos = (x: number, y: number, level = 0): Pos => ({ x, y, level });

export function at(u: Pos): Pos {
  return { x: u.x, y: u.y, level: u.level };
}

/** Room A of level 0 is x 3..6, y 3..5; the hall is x 8..12, y 3..8 (door at (7,4)); room B is x 3..8, y 7..8. */
export const ROOM_A = { x: 3, y: 3 };
