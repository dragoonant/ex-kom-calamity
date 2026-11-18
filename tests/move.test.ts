import { describe, expect, it } from 'vitest';
import { neighbours, pathField, pathTo, query, stepCost } from '../src/engine';
import { ALWAYS_HIT, NEVER_HIT, game, only, order, place, pos, tick, unit } from './helpers';

describe('5. Movement (MOVE)', () => {
  it('MOVE-1 eight directions on a level, no corner cutting, level steps only on stairs', () => {
    const s = game();
    // (4,4,0) in room A: all eight neighbours are floor.
    expect(neighbours(s, pos(4, 4), null)).toHaveLength(8);
    // (6,3,0): east (7,3) is wall, so NE (7,2) and SE (7,4) cuts are refused; (7,4) is a door but the corner (7,3) is a wall.
    const n = neighbours(s, pos(6, 3), null);
    expect(n).not.toContainEqual(pos(7, 4));
    expect(n).toContainEqual(pos(6, 4));
    // From the door (7,4) you can step E/W only (walls N and S), no diagonals.
    const d = neighbours(s, pos(7, 4), null);
    expect(d).toEqual([pos(8, 4), pos(6, 4)]);
    // A stair's neighbours include the level step; a path through the building climbs it.
    const p = query.path(s, 'a1', pos(5, 5, 2));
    expect(p).not.toBeNull();
    expect(p!.steps.some((q) => q.level === 1)).toBe(true);
    expect(p!.steps[p!.steps.length - 1]).toEqual(pos(5, 5, 2));
  });

  it('MOVE-2 step costs are moveTicks, round(x1.41) and round(x1.5); paths are cheapest with E,S,W,N tie-break', () => {
    const s = game();
    const u = { moveTicks: 4 };
    expect(stepCost(s, u, pos(0, 0), pos(1, 0))).toBe(4);
    expect(stepCost(s, u, pos(0, 0), pos(1, 1))).toBe(6);
    expect(stepCost(s, u, pos(10, 5, 0), pos(10, 5, 1))).toBe(6);
    expect(stepCost(s, { moveTicks: 2 }, pos(0, 0), pos(1, 1))).toBe(3);
    // a1 at (4,10): to (6,10) the cheapest is two orthogonal steps (8), not a dog-leg.
    const f = pathField(s, unit(s, 'a1'), null);
    expect(pathTo(s, f, pos(6, 10))).toEqual([pos(5, 10), pos(6, 10)]);
    expect(query.path(s, 'a1', pos(6, 10))?.ticks).toBe(8);
    // Tie-break: from (0,0) to (1,1) via E then S or the diagonal (6 < 8): diagonal wins on cost.
    const g = pathField(s, { moveTicks: 4, x: 0, y: 0, level: 0 }, null);
    expect(pathTo(s, g, pos(1, 1))).toEqual([pos(1, 1)]);
    // Equal-cost alternatives (two orthogonal steps to (2,0)): E first.
    expect(pathTo(s, g, pos(2, 0))).toEqual([pos(1, 0), pos(2, 0)]);
  });

  it('MOVE-3 progress rises each tick; the unit steps at the cost, emits moved, then arrived and the order clears', () => {
    let s = only(game(), ['a1']);
    s = place(s, 'a1', 3, 3);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    let r = tick(s, 3);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 3 });
    expect(unit(r.state, 'a1').order?.progress).toBe(3);
    expect(r.events).toEqual([]);
    r = tick(r.state, 1);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 4 });
    expect(r.events).toEqual([{ type: 'moved', tick: 3, unit: 'a1', from: pos(3, 3), to: pos(3, 4) }]);
    expect(unit(r.state, 'a1').order?.progress).toBe(0);
    r = tick(r.state, 4);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 5, order: null });
    expect(r.events.map((e) => e.type)).toEqual(['moved', 'arrived']);
  });

  it('MOVE-4 a unit with a current target stands still and resumes when the target is gone', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 5, 3);
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    // u2 is a host with hold? No: engage, it fires back and may down a1 with ALWAYS_HIT; give a1 armour.
    s = { ...s, units: s.units.map((u) => (u.id === 'a1' ? { ...u, armour: 100 } : u)) };
    let r = tick(s, 4);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 3 });
    expect(unit(r.state, 'a1').order?.progress).toBe(0);
    // Keep ticking until u2 is down; then a1 walks.
    r = tick(r.state, 40);
    expect(unit(r.state, 'u2').down).toBe(true);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 5, order: null });
  });

  it('MOVE-5 one living unit per tile: a blocked mover waits, replans after 5 ticks, or gives up when the destination is held', () => {
    // Corridor: level 1 room x 3..7, y 3..6. Put a citizen on the path and a wall-tight route.
    let s = only(game(), ['a1', 'u7']);
    s = place(s, 'a1', 3, 3, 1);
    s = place(s, 'u7', 4, 3, 1); // citizen stands east of a1
    // Destination (5,3,1): straight line goes through u7; the planner ignores units, so a1 waits then replans around.
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(5, 3, 1) }).state;
    expect(unit(s, 'a1').order?.path[0]).toEqual(pos(4, 3, 1));
    let r = tick(s, 4); // progress reaches 4: step blocked, blockedTicks 1
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 3 });
    expect(unit(r.state, 'a1').order?.blockedTicks).toBe(1);
    r = tick(r.state, 4); // blockedTicks 5 -> replan
    const o = unit(r.state, 'a1').order;
    expect(o?.blockedTicks).toBe(0);
    expect(o?.path[0]).not.toEqual(pos(4, 3, 1));
    r = tick(r.state, 30);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 5, y: 3, level: 1, order: null });
    // Destination held: give up with moveBlocked.
    let t = only(game(), ['a1', 'u7']);
    t = place(t, 'a1', 3, 3, 1);
    t = place(t, 'u7', 5, 3, 1);
    t = order(t, { type: 'move', side: 'agency', unit: 'a1', to: pos(4, 3, 1) }).state;
    t = { ...t, units: t.units.map((u) => (u.id === 'u7' ? { ...u, x: 4 } : u)) }; // citizen steps onto the destination
    const q = tick(t, 9);
    expect(unit(q.state, 'a1').order).toBeNull();
    expect(q.events.some((e) => e.type === 'moveBlocked' && e.unit === 'a1')).toBe(true);
    expect(unit(q.state, 'a1')).toMatchObject({ x: 3, y: 3 });
  });

  it('MOVE-6 a unit is on exactly one integer tile at every tick', () => {
    let s = only(game(), ['a1']);
    s = place(s, 'a1', 3, 3);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(5, 5) }).state;
    for (let i = 0; i < 14; i++) {
      s = tick(s).state;
      const u = unit(s, 'a1');
      expect(Number.isInteger(u.x) && Number.isInteger(u.y) && Number.isInteger(u.level)).toBe(true);
    }
    expect(unit(s, 'a1')).toMatchObject({ x: 5, y: 5 });
  });

  it('MOVE-7 stepping onto a closed door opens it at no extra cost', () => {
    let s = only(game(), ['a3']);
    s = place(s, 'a3', 6, 10);
    s = order(s, { type: 'move', side: 'agency', unit: 'a3', to: pos(6, 8) }).state;
    const r = tick(s, 4);
    expect(r.events.map((e) => e.type)).toEqual(['doorOpened', 'moved']);
    expect(r.events[0]).toMatchObject({ at: pos(6, 9) });
    expect(unit(r.state, 'a3')).toMatchObject({ x: 6, y: 9 });
    expect(tick(r.state, 4).state.units.find((u) => u.id === 'a3')).toMatchObject({ x: 6, y: 8 });
  });

  it('MOVE-8 the moving flag is set while walking and cleared while standing or fighting; shots carry it', () => {
    let s = only(game(1, NEVER_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3);
    expect(unit(s, 'a1').moving).toBe(false);
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    let r = tick(s);
    expect(unit(r.state, 'a1').moving).toBe(true);
    r = tick(r.state, 7);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 3, y: 5, moving: true });
    r = tick(r.state, 1);
    expect(unit(r.state, 'a1').moving).toBe(false);
    // u2 (engage, sees a1 at distance ~3.6) shoots at a moving a1 while a1 walks: the shot says moving.
    let w = only(game(1, NEVER_HIT), ['a1', 'u2']);
    w = place(w, 'a1', 3, 3);
    w = place(w, 'u2', 6, 5);
    w = order(w, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    w = order(w, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    const shots = tick(w, 7).events.filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0]).toMatchObject({ shooter: 'u2', target: 'a1', moving: true });
  });
});
