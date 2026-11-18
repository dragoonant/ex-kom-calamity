import { describe, expect, it } from 'vitest';
import { advance, chebyshev, distance, hasLineOfSight, neighbours, step, tileAt } from '../src/engine';
import { MAPS, TUNING } from '../src/data';
import { ALWAYS_HIT, game, only, order, place, pos, tick, unit } from './helpers';

describe('1. Time (TIME)', () => {
  it('TIME-1 ticks start at 0 and the rate comes from data', () => {
    const s = game();
    expect(s.tick).toBe(0);
    expect(s.tuning.time.ticksPerSecond).toBe(TUNING.time.ticksPerSecond);
    expect(tick(s).state.tick).toBe(1);
  });

  it('TIME-2 orders are accepted while paused and nothing but a tick moves time', () => {
    let s = game();
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 11, level: 0 } }).state;
    s = order(s, { type: 'stance', side: 'agency', unit: 'a2', stance: 'hold' }).state;
    s = order(s, { type: 'halt', side: 'agency', unit: 'a2' }).state;
    expect(s.tick).toBe(0);
    expect(unit(s, 'a1')).toMatchObject({ x: 4, y: 10 });
    s = tick(s, 4).state;
    expect(unit(s, 'a1')).toMatchObject({ x: 4, y: 11 });
  });

  it('TIME-3 a tick resolves units in order, then proximity reveals, then the counter, then the end check', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 5, 3);
    const { state, events } = tick(s);
    expect(state.tick).toBe(1);
    // The host is revealed by proximity (b) in the same tick the agent stands near it; the agent
    // does not fire at it yet (a) because at its step the host still looked like a citizen.
    expect(events.map((e) => e.type)).toEqual(['revealed']);
    expect(events[0]).toMatchObject({ unit: 'u2', by: 'proximity', tick: 0 });
    // A unit downed earlier in the tick does not act (RULING TIME-3): u2 fires at a1 first in later
    // ticks only if it is still alive at its step.
    const later = tick(state, 8).events;
    const shots = later.filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    const downAt = later.find((e) => e.type === 'down' && e.unit === 'u2');
    if (downAt) {
      expect(later.some((e) => e.type === 'shot' && e.shooter === 'u2' && e.tick > downAt.tick)).toBe(false);
    }
  });

  it('TIME-4 advance(seconds) applies round(seconds * rate) ticks and concatenates events', () => {
    const s = game();
    const r = advance(s, 1);
    expect(r.state.tick).toBe(10);
    expect(advance(s, 0.04).state.tick).toBe(0);
    expect(advance(s, 0.25).state.tick).toBe(3);
    let moving = order(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 11, level: 0 } }).state;
    const a = advance(moving, 1);
    expect(a.events.filter((e) => e.type === 'moved')).toHaveLength(1);
    expect(a.events.some((e) => e.type === 'arrived')).toBe(true);
    moving = a.state;
    expect(moving.tick).toBe(10);
  });

  it('TIME-5 a tick after the end is accepted, returns the same state and no event', () => {
    let s = game();
    s = order(s, { type: 'withdraw', side: 'agency' }).state;
    const r = step(s, { type: 'tick' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toBe(s);
      expect(r.events).toEqual([]);
    }
    expect(s.log.filter((e) => e.type === 'tick')).toHaveLength(0);
  });
});

describe('2. Map (MAP)', () => {
  it('MAP-1 every tile exists with x, y, level and kind', () => {
    const s = game();
    expect(s.tiles).toHaveLength(16 * 12 * 3);
    for (const t of s.tiles) {
      expect(Number.isInteger(t.level)).toBe(true);
      expect(t.level).toBeGreaterThanOrEqual(0);
      expect(t.level).toBeLessThan(3);
      expect(typeof t.kind).toBe('string');
      expect(typeof t.open).toBe('boolean');
    }
    expect(tileAt(s, pos(5, 5, 2))).toMatchObject({ x: 5, y: 5, level: 2, kind: 'floor' });
  });

  it('MAP-2 the legend parses every tile kind', () => {
    const s = game();
    expect(tileAt(s, pos(0, 0, 0))?.kind).toBe('ground');
    expect(tileAt(s, pos(3, 3, 0))?.kind).toBe('floor');
    expect(tileAt(s, pos(2, 2, 0))?.kind).toBe('wall');
    expect(tileAt(s, pos(7, 4, 0))?.kind).toBe('door');
    expect(tileAt(s, pos(10, 5, 0))?.kind).toBe('stair');
    expect(tileAt(s, pos(0, 0, 1))?.kind).toBe('void');
    expect(tileAt(s, pos(16, 0, 0))).toBeNull();
  });

  it('MAP-3 only a used door is open, and it stays open', () => {
    let s = only(game(), ['a3']);
    expect(s.tiles.every((t) => !t.open)).toBe(true);
    s = place(s, 'a3', 6, 10);
    s = order(s, { type: 'move', side: 'agency', unit: 'a3', to: { x: 6, y: 8, level: 0 } }).state;
    s = tick(s, 4).state;
    expect(tileAt(s, pos(6, 9, 0))?.open).toBe(true);
    s = tick(s, 20).state;
    expect(tileAt(s, pos(6, 9, 0))?.open).toBe(true);
    expect(s.tiles.filter((t) => t.open)).toHaveLength(1);
  });

  it('MAP-4 stairs connect to the stair directly above or below and nothing else does', () => {
    const s = game();
    const up = neighbours(s, pos(10, 5, 0), null);
    expect(up).toContainEqual(pos(10, 5, 1));
    const mid = neighbours(s, pos(10, 5, 1), null);
    expect(mid).toContainEqual(pos(10, 5, 0));
    expect(mid).not.toContainEqual(pos(10, 5, 2));
    const roofStair = neighbours(s, pos(11, 7, 2), null);
    expect(roofStair).toContainEqual(pos(11, 7, 1));
    expect(neighbours(s, pos(4, 4, 0), null).every((p) => p.level === 0)).toBe(true);
  });

  it('MAP-5 distance is Euclidean on a level, null across levels; melee adjacency is Chebyshev', () => {
    expect(distance(pos(0, 0), pos(3, 4))).toBe(5);
    expect(distance(pos(0, 0, 0), pos(0, 0, 1))).toBeNull();
    expect(chebyshev(pos(2, 2), pos(3, 3))).toBe(1);
    expect(chebyshev(pos(2, 2), pos(4, 3))).toBe(2);
  });

  it('MAP-6 the first map is the 16 x 12 branch on three levels and carries no codename', () => {
    const m = MAPS['civic-savings-branch']!;
    expect(m.width).toBe(16);
    expect(m.depth).toBe(12);
    expect(m.levels).toHaveLength(3);
    expect(JSON.stringify(m).toLowerCase()).not.toMatch(/ex-kom|x-com|xcom/);
    const s = game();
    expect(s.mapId).toBe('civic-savings-branch');
    expect(hasLineOfSight(s, pos(3, 3, 0), pos(6, 3, 0))).toBe(true);
  });
});
