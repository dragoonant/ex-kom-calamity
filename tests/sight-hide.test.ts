import { describe, expect, it } from 'vitest';
import { hasLineOfSight, legalActions, query, sideSeesTile, sideSeesUnit, unitSeesTile, view } from '../src/engine';
import { ALWAYS_HIT, NEVER_HIT, clone, game, only, order, place, pos, tick, unit } from './helpers';

describe('6. Sight (SEE)', () => {
  it('SEE-1 line of sight is blocked by walls and closed doors, not by units, void or ground, and never crosses levels', () => {
    let s = only(game(), ['a1', 'a2', 'u2']);
    expect(hasLineOfSight(s, pos(6, 3), pos(8, 3))).toBe(false); // wall (7,3)
    expect(hasLineOfSight(s, pos(6, 4), pos(8, 4))).toBe(false); // closed door (7,4)
    s = clone(s);
    const i = s.tiles.findIndex((t) => t.x === 7 && t.y === 4 && t.level === 0);
    s.tiles[i] = { ...s.tiles[i]!, open: true };
    expect(hasLineOfSight(s, pos(6, 4), pos(8, 4))).toBe(true);
    // Units never block: a2 between a1 and the target.
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 4, 3);
    s = place(s, 'u2', 5, 3);
    expect(hasLineOfSight(s, pos(3, 3), pos(5, 3))).toBe(true);
    expect(sideSeesUnit(s, 'agency', unit(s, 'u2'))).toBe(true);
    // Ground never blocks; void on level 1 does not block either.
    expect(hasLineOfSight(s, pos(0, 0), pos(15, 0))).toBe(true);
    expect(hasLineOfSight(s, pos(0, 0, 1), pos(1, 5, 1))).toBe(true);
    expect(hasLineOfSight(s, pos(3, 3, 0), pos(3, 3, 1))).toBe(false);
  });

  it('SEE-2 a unit sees a tile on its level within its sight with line of sight, and always its own tile', () => {
    let s = only(game(), ['a1']);
    s = place(s, 'a1', 0, 0);
    const a1 = unit(s, 'a1');
    expect(a1.sight).toBe(12);
    expect(unitSeesTile(s, a1, pos(12, 0))).toBe(true);
    expect(unitSeesTile(s, a1, pos(13, 0))).toBe(false);
    expect(unitSeesTile(s, a1, pos(0, 0))).toBe(true);
    expect(unitSeesTile(s, a1, pos(0, 0, 1))).toBe(false);
    expect(unitSeesTile(s, a1, pos(3, 3))).toBe(false); // behind the wall ring
  });

  it('SEE-3 a side sees the union of its units; civilians see nothing', () => {
    let s = only(game(), ['a1', 'a2', 'u1']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 10, 7); // in the hall, east of the closed door (9,7)
    expect(sideSeesTile(s, 'agency', pos(6, 5))).toBe(true); // a1's room
    expect(sideSeesTile(s, 'agency', pos(12, 3))).toBe(true); // a2's hall
    expect(sideSeesTile(s, 'agency', pos(5, 8))).toBe(false); // room B, behind the closed door
    expect(sideSeesTile(s, 'civilian', pos(11, 3))).toBe(false);
    expect(query.visibleTiles(s, 'civilian')).toEqual([]);
    expect(query.visibleTiles(s, 'agency').length).toBeGreaterThan(20);
  });

  it('SEE-4 a side always sees its own units and sees others on seen tiles', () => {
    let s = only(game(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'a2', 10, 8);
    s = place(s, 'u2', 11, 8);
    expect(sideSeesUnit(s, 'agency', unit(s, 'a2'))).toBe(true);
    expect(sideSeesUnit(s, 'agency', unit(s, 'u2'))).toBe(true);
    expect(sideSeesUnit(s, 'hostile', unit(s, 'a1'))).toBe(false);
    expect(sideSeesUnit(s, 'hostile', unit(s, 'a2'))).toBe(true);
    expect(query.unitsSeen(s, 'hostile')).toEqual(['a2', 'u2', 'u4', 'u5', 'u6', 'u9']); // a2 seen; own hostiles always, down or not
  });

  it('SEE-5 fire legality is judged on the true state: an unrevealed host in sight is a legal target', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    expect(unit(s, 'u2').revealed).toBe(false);
    expect(legalActions(s, 'agency').some((a) => a.type === 'fire' && a.target === 'u2')).toBe(true);
    expect(view(s, 'agency').units.find((u) => u.id === 'u2')?.side).toBe('civilian');
  });

  it('SEE-6 a diagonal line between two wall corners is not blocked', () => {
    // Build a tiny corner pair on the street: walls at (1,0) and (0,1); line (0,0)->(1,1) passes between them.
    const s = clone(game());
    for (const [x, y] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const i = s.tiles.findIndex((t) => t.x === x && t.y === y && t.level === 0);
      s.tiles[i] = { ...s.tiles[i]!, kind: 'wall' };
    }
    expect(hasLineOfSight(s, pos(0, 0), pos(1, 1))).toBe(true);
    expect(hasLineOfSight(s, pos(0, 0), pos(2, 0))).toBe(false);
  });
});

describe('7. Disguise (HIDE)', () => {
  it('HIDE-1 an unrevealed host looks like a citizen in the agency view', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    const v = view(s, 'agency').units.find((u) => u.id === 'u2')!;
    expect(v).toMatchObject({ template: 'citizen', side: 'civilian', weapon: null, disguised: false, order: null, fireTarget: null, stance: 'hold', name: 'Citizen' });
    expect(v.hp).toBe(unit(s, 'u2').hp);
    // The hostile side sees its own host in full.
    expect(view(s, 'hostile').units.find((u) => u.id === 'u2')).toMatchObject({ template: 'host', side: 'hostile', weapon: 'pocket-pistol' });
  });

  it('HIDE-2 a host is revealed the moment it fires, hit or miss', () => {
    let s = only(game(1, NEVER_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 8, 3); // wait: (7,3) is a wall. Use the street instead.
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 8, 0); // 6 tiles: beyond revealRange 3, within pocket-pistol range 7 and sight 10
    const r = tick(s, 7);
    const shot = r.events.find((e) => e.type === 'shot' && e.shooter === 'u2');
    expect(shot).toMatchObject({ hit: false });
    const rev = r.events.find((e) => e.type === 'revealed');
    expect(rev).toMatchObject({ unit: 'u2', by: 'fire', tick: shot!.tick });
    expect(unit(r.state, 'u2').revealed).toBe(true);
  });

  it('HIDE-3 proximity reveals within revealRange with line of sight, not beyond and not through a wall', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3); // distance 3
    expect(tick(s).events).toContainEqual({ type: 'revealed', tick: 0, unit: 'u2', by: 'proximity' });
    let far = place(s, 'a1', 2, 0);
    far = place(far, 'u2', 6, 0); // distance 4
    expect(tick(far).events).toEqual([]);
    // Through a wall: a1 (6,3) and u2 (8,3) with the wall at (7,3) between, distance 2.
    let wall = place(s, 'a1', 6, 3);
    wall = place(wall, 'u2', 8, 3);
    expect(tick(wall).events.filter((e) => e.type === 'revealed')).toEqual([]);
    expect(s.tuning.sight.revealRange).toBe(3);
  });

  it('HIDE-4 revealing is permanent and emits one event', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3);
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    let r = tick(s, 3);
    expect(r.events.filter((e) => e.type === 'revealed')).toHaveLength(1);
    r = tick(place(r.state, 'a1', 0, 0), 3); // agent walks away: still revealed
    expect(unit(r.state, 'u2').revealed).toBe(true);
    expect(view(r.state, 'agency').units.find((u) => u.id === 'u2')).toBeUndefined(); // out of sight now
    r = tick(place(r.state, 'a1', 3, 3), 1);
    expect(view(r.state, 'agency').units.find((u) => u.id === 'u2')).toMatchObject({ template: 'host', side: 'hostile', revealed: true });
    expect(r.events.filter((e) => e.type === 'revealed')).toHaveLength(0);
  });

  it('HIDE-5 stance fire never targets an apparent citizen: an agent waits until the host is revealed', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u1', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u1', 5, 0); // real citizen in range
    s = place(s, 'u2', 7, 0); // host, 5 tiles: not revealed by proximity; it will shoot and reveal itself
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    let r = tick(s, 20);
    expect(r.events.filter((e) => e.type === 'shot')).toEqual([]);
    expect(unit(r.state, 'u1').hp).toBe(40);
    // Now the host engages: it fires, is revealed, and the agent fires back at it, never at u1.
    r = tick(order(r.state, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'engage' }).state, 30);
    const agentShots = r.events.filter((e) => e.type === 'shot' && e.shooter === 'a1');
    expect(agentShots.length).toBeGreaterThan(0);
    expect(agentShots.every((e) => e.type === 'shot' && e.target === 'u2')).toBe(true);
    expect(unit(r.state, 'u1').hp).toBe(40);
  });
});
