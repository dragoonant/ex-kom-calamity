import { describe, expect, it } from 'vitest';
import { legalActions, query } from '../src/engine';
import { UNITS, WEAPONS } from '../src/data';
import { expectReject, game, only, order, place, pos, tick, unit } from './helpers';

describe('3. Units (UNIT)', () => {
  it('UNIT-1 units belong to agency, hostile or civilian', () => {
    const s = game();
    const sides = new Set(s.units.map((u) => u.side));
    expect([...sides].sort()).toEqual(['agency', 'civilian', 'hostile']);
  });

  it('UNIT-2 a unit copies its template and may override the weapon per battle', () => {
    const s = game();
    const a1 = unit(s, 'a1');
    const t = UNITS['agent-t1']!;
    expect(a1).toMatchObject({ hp: t.hp, maxHp: t.hp, armour: t.armour, aim: t.aim, moveTicks: t.moveTicks, sight: t.sight, stance: t.defaultStance, disguised: false });
    expect(a1.weapon).toBe('patrol-carbine');
    expect(unit(s, 'a2').weapon).toBe('service-pistol');
    expect(unit(s, 'u9').weapon).toBe(UNITS.taker!.weapon);
  });

  it('UNIT-3 agents are a1..a6 in squad order; others are u1.. by (level, y, x)', () => {
    const s = game();
    expect(s.units.slice(0, 6).map((u) => u.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(unit(s, 'a1').name).toBe('Vance');
    const others = s.units.slice(6);
    expect(others.map((u) => u.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9']);
    for (let i = 1; i < others.length; i++) {
      const a = others[i - 1]!;
      const b = others[i]!;
      const key = (u: typeof a) => u.level * 10000 + u.y * 100 + u.x;
      expect(key(a)).toBeLessThan(key(b));
    }
    expect(unit(s, 'u1')).toMatchObject({ template: 'citizen', x: 11, y: 3, level: 0 });
    expect(unit(s, 'u2')).toMatchObject({ template: 'host', x: 4, y: 4, level: 0 });
    expect(unit(s, 'u9')).toMatchObject({ template: 'taker', level: 2 });
  });

  it('UNIT-4 a down unit takes no orders, does not block and is not a target', () => {
    let s = only(game(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 4, 3);
    s = place(s, 'u2', 5, 3);
    // a3 is down from only(); it stays in the state with hp 0.
    expect(unit(s, 'a3')).toMatchObject({ hp: 0, down: true });
    expect(expectReject(s, { type: 'halt', side: 'agency', unit: 'a3' })).toMatch(/down/);
    expect(expectReject(s, { type: 'fire', side: 'hostile', unit: 'u2', target: 'a3' })).toMatch(/down/);
    // A down unit on the path does not block: park a body on (5,3)'s neighbour and walk through it.
    s = place(s, 'a4', 3, 4);
    expect(unit(s, 'a4').down).toBe(true);
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state; // do not stop to fight u2
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 3, y: 5, level: 0 } }).state;
    s = tick(s, 8).state;
    expect(unit(s, 'a1')).toMatchObject({ x: 3, y: 5 });
    expect(legalActions(s, 'agency').some((a) => a.type === 'fire' && a.target === 'a3')).toBe(false);
  });

  it('UNIT-5 the four templates of the slice exist with their roles', () => {
    expect(UNITS['agent-t1']).toMatchObject({ side: 'agency', disguised: false });
    expect(UNITS.host).toMatchObject({ side: 'hostile', disguised: true });
    expect(WEAPONS[UNITS.host!.weapon!]!.kind).toBe('ranged');
    expect(UNITS.taker).toMatchObject({ side: 'hostile', disguised: false });
    expect(WEAPONS[UNITS.taker!.weapon!]!.kind).toBe('melee');
    expect(UNITS.citizen).toMatchObject({ side: 'civilian', weapon: null });
    expect(UNITS.host!.hp).toBe(UNITS.citizen!.hp);
  });
});

describe('4. Orders (ORD)', () => {
  it('ORD-1 every action shape is accepted in a valid case', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 3, y: 5, level: 0 } }).state;
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    s = order(s, { type: 'halt', side: 'agency', unit: 'a1' }).state;
    s = order(s, { type: 'tick' }).state;
    s = order(s, { type: 'withdraw', side: 'agency' }).state;
    expect(s.over?.reason).toBe('withdrawn');
  });

  it('ORD-2 orders are rejected after the end, for unknown, down or foreign units and for civilians', () => {
    const s = game();
    expect(expectReject(s, { type: 'halt', side: 'agency', unit: 'zz' })).toMatch(/no unit/);
    expect(expectReject(s, { type: 'halt', side: 'hostile', unit: 'a1' })).toMatch(/not a hostile/);
    expect(expectReject(s, { type: 'halt', side: 'civilian', unit: 'u1' })).toMatch(/civilians/);
    expect(expectReject(s, { type: 'halt', side: 'nobody' as never, unit: 'a1' })).toMatch(/side/);
    const down = only(s, ['a1']);
    expect(expectReject(down, { type: 'halt', side: 'agency', unit: 'a2' })).toMatch(/down/);
    const over = order(s, { type: 'withdraw', side: 'agency' }).state;
    expect(expectReject(over, { type: 'halt', side: 'agency', unit: 'a1' })).toMatch(/over/);
  });

  it('ORD-3 move needs a passable, free, reachable tile that is not the own one; it replaces the path and keeps the target', () => {
    let s = only(game(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 4, 3);
    s = place(s, 'u2', 6, 3);
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 3) })).toMatch(/already/);
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(2, 3) })).toMatch(/impassable/);
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(4, 3) })).toMatch(/held by a2/);
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(0, 0, 1) })).toMatch(/impassable/);
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(99, 0) })).toMatch(/off the map/);
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    expect(unit(s, 'a1').order?.to).toEqual(pos(3, 5));
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(5, 5) }).state;
    expect(unit(s, 'a1').order?.to).toEqual(pos(5, 5));
    expect(unit(s, 'a1').fireTarget).toBe('u2');
  });

  it('ORD-4 fire needs a seen living unit of another side, at any range, citizens included', () => {
    let s = only(game(), ['a1', 'a2', 'u1', 'u2', 'u4']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 4, 3);
    s = place(s, 'u2', 6, 3); // disguised host, seen
    s = place(s, 'u1', 6, 5); // citizen, seen
    s = place(s, 'u4', 10, 8); // hostile out of sight (hall, behind walls)
    expect(expectReject(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u4' })).toMatch(/not seen/);
    expect(expectReject(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'a2' })).toMatch(/own side/);
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u1' }).state;
    expect(unit(s, 'a1').fireTarget).toBe('u1');
    // Out of weapon range is still a legal order (RULING ORD-4): carbine range 14, put the host far.
    let far = only(game(), ['a1', 'u6']);
    far = place(far, 'a1', 3, 0);
    far = place(far, 'u6', 15, 0); // 12 tiles away on the street; sight 12 so seen, range 14 ok... use a pistol unit
    far = order(far, { type: 'fire', side: 'agency', unit: 'a1', target: 'u6' }).state;
    expect(unit(far, 'a1').fireTarget).toBe('u6');
    // A new target resets aim; the same target again does not.
    let aim = only(game(1), ['a1', 'u1', 'u2']);
    aim = place(aim, 'a1', 3, 3);
    aim = place(aim, 'u2', 5, 3);
    aim = place(aim, 'u1', 6, 5);
    aim = order(aim, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    aim = tick(aim, 2).state;
    expect(unit(aim, 'a1').aimProgress).toBe(2);
    const same = order(aim, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    expect(unit(same, 'a1').aimProgress).toBe(2);
    const other = order(aim, { type: 'fire', side: 'agency', unit: 'a1', target: 'u1' }).state;
    expect(unit(other, 'a1').aimProgress).toBe(0);
  });

  it('ORD-5 stance accepts a different stance and rejects the current one', () => {
    const s = game();
    expect(unit(s, 'a1').stance).toBe('engage');
    expect(expectReject(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'engage' })).toMatch(/already/);
    expect(expectReject(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'prone' as never })).toMatch(/unknown stance/);
    expect(unit(order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'retaliate' }).state, 'a1').stance).toBe('retaliate');
  });

  it('ORD-6 halt clears the move order, the explicit target and the aim', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 5, 3);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state;
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    s = tick(s, 2).state;
    expect(unit(s, 'a1').aimProgress).toBe(2);
    s = order(s, { type: 'halt', side: 'agency', unit: 'a1' }).state;
    expect(unit(s, 'a1')).toMatchObject({ order: null, fireTarget: null, aimProgress: 0 });
  });

  it('ORD-7 withdraw ends the battle at once for the agency only', () => {
    const s = game();
    expect(expectReject(s, { type: 'withdraw', side: 'hostile' })).toMatch(/agency/);
    const r = order(s, { type: 'withdraw', side: 'agency' });
    expect(r.state.over).toEqual({ winner: 'none', reason: 'withdrawn', tick: 0 });
    expect(r.events.map((e) => e.type)).toEqual(['ordered', 'over']);
    expect(expectReject(r.state, { type: 'withdraw', side: 'agency' })).toMatch(/over/);
  });

  it('ORD-8 legalActions lists tick, then per unit halt, stances, moves, fires, then withdraw; civilians get tick only', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3);
    const acts = legalActions(s, 'agency');
    expect(acts[0]).toEqual({ type: 'tick' });
    expect(acts[1]).toEqual({ type: 'halt', side: 'agency', unit: 'a1' });
    expect(acts[2]).toEqual({ type: 'stance', side: 'agency', unit: 'a1', stance: 'retaliate' });
    expect(acts[3]).toEqual({ type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' });
    const a1Acts = acts.filter((a) => 'unit' in a && a.unit === 'a1');
    const types = a1Acts.map((a) => a.type);
    expect(types.lastIndexOf('move')).toBeLessThan(types.indexOf('fire'));
    expect(acts[acts.length - 1]).toEqual({ type: 'withdraw', side: 'agency' });
    const moves = a1Acts.filter((a) => a.type === 'move');
    expect(moves).toHaveLength(query.reachable(s, 'a1').length);
    expect(moves.some((a) => a.type === 'move' && a.to.x === 6 && a.to.y === 3 && a.to.level === 0)).toBe(false); // held by u2
    expect(a1Acts.filter((a) => a.type === 'fire')).toEqual([{ type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }]);
    expect(legalActions(s, 'civilian')).toEqual([{ type: 'tick' }]);
    const hostile = legalActions(s, 'hostile');
    expect(hostile.some((a) => a.type === 'withdraw')).toBe(false);
    expect(hostile.some((a) => a.type === 'fire' && a.unit === 'u2' && a.target === 'a1')).toBe(true);
  });
});
