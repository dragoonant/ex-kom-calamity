import { describe, expect, it } from 'vitest';
import { createGame, legalActions, query, step, tileAt, tileIndex, view, type GameEvent, type Pos, type State, type Tile } from '../src/engine';
import { BATTLES, MAPS, MATERIALS, TUNING } from '../src/data';
import { checkInvariants } from '../src/sim/invariants';
import { NEVER_HIT, clone, expectReject, game, only, order, patch, place, pos, tick, unit } from './helpers';

/** Returns a copy with one tile patched (tests only; the engine never does this). */
function patchTile(s: State, p: Pos, t: Partial<Tile>): State {
  const c = clone(s);
  Object.assign(c.tiles[tileIndex(c, p)]!, t);
  return c;
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** a1 alone at `from`, ordered to blast `at`, ticked until the charge goes off. */
function blastFrom(s0: State, from: Pos, at: Pos): { state: State; events: GameEvent[] } {
  let s = place(s0, 'a1', from.x, from.y, from.level);
  s = order(s, { type: 'blast', side: 'agency', unit: 'a1', at }).state;
  return tick(s, TUNING.blast.armTicks);
}

describe('2. Map, the city block (MAP)', () => {
  it('MAP-7 the first block is 60 x 60 on 7 levels with five buildings of 1 to 6 floors, and the squad starts in the street', () => {
    const m = MAPS['halcyon-block']!;
    expect([m.width, m.depth, m.levels.length]).toEqual([60, 60, 7]);
    expect(m.buildings!.map((b) => b.floors).sort()).toEqual([1, 2, 3, 4, 6]);
    const s = createGame({ battleId: 'block-raid', seed: 1 });
    expect(s.tiles).toHaveLength(60 * 60 * 7);
    for (const u of s.units.filter((x) => x.side === 'agency')) expect(tileAt(s, u)?.kind).toBe('ground');
    expect(s.units.filter((x) => x.side === 'agency')).toHaveLength(6);
    // A battle can start outside and move in: the squad can path to every hostile, the tallest roof included.
    const hostiles = s.units.filter((x) => x.side === 'hostile');
    expect(hostiles.some((h) => h.level === 6)).toBe(true);
    for (const h of hostiles) {
      // A unit holds its own tile, so path to a free neighbour of it.
      const near = [1, -1].map((dx) => ({ x: h.x + dx, y: h.y, level: h.level })).find((p) => tileAt(s, p)?.kind === 'floor');
      expect(near, h.id).toBeDefined();
      expect(query.path(s, 'a1', near!), `path to ${h.id}`).not.toBeNull();
    }
    expect(JSON.stringify(BATTLES['block-raid'])).not.toMatch(/kom|calamity/i);
  });

  it('MAP-8 a block map file carries a material grid with its key and a building list; every stair joins a stair', () => {
    const m = MAPS['halcyon-block']!;
    expect(m.materialKey).toEqual({ b: 'brick', p: 'plaster', s: 'steel' });
    for (const l of m.levels) {
      expect(l.materials).toHaveLength(m.depth);
      for (const row of l.materials!) expect(row).toHaveLength(m.width);
    }
    for (const b of m.buildings!) {
      expect(b).toMatchObject({ id: expect.any(String), name: expect.any(String), x: expect.any(Number), y: expect.any(Number), w: expect.any(Number), d: expect.any(Number), floors: expect.any(Number) });
      expect(b.floors).toBeLessThanOrEqual(6);
      // The roof is the level `floors`: floor tiles there, open air above.
      expect(m.levels[b.floors]!.rows[b.y + 2]![b.x + 2]).toBe('.');
      if (b.floors + 1 < m.levels.length) expect(m.levels[b.floors + 1]!.rows[b.y + 2]![b.x + 2]).toBe(' ');
    }
    expect(JSON.stringify(m)).not.toMatch(/kom|calamity/i);
    // The M1 map has no grid and still parses (defaults).
    expect(MAPS['civic-savings-branch']!.levels[0]!.materials).toBeUndefined();
  });
});

describe('19. Structure (STR)', () => {
  it('STR-1 every tile carries a material and its hp: map grid first, else the default of the kind', () => {
    const s = game();
    expect(tileAt(s, pos(2, 2))).toMatchObject({ kind: 'wall', material: 'brick', hp: MATERIALS.brick!.hp });
    expect(tileAt(s, pos(7, 4))).toMatchObject({ kind: 'door', material: 'timber', hp: 30 });
    expect(tileAt(s, pos(3, 3))).toMatchObject({ kind: 'floor', material: 'concrete', hp: 150 });
    expect(tileAt(s, pos(0, 0))).toMatchObject({ kind: 'ground', material: 'paving', hp: 0 });
    expect(tileAt(s, pos(0, 0, 1))).toMatchObject({ kind: 'void', material: 'none', hp: 0 });
    const b = createGame({ battleId: 'block-raid', seed: 1 });
    expect(tileAt(b, pos(6, 10))).toMatchObject({ kind: 'wall', material: 'plaster', hp: 50 }); // a partition of Halcyon Arms
    expect(tileAt(b, pos(31, 40))).toMatchObject({ kind: 'wall', material: 'steel', hp: 200 }); // Depot 7
    expect(tileAt(b, pos(7, 5))).toMatchObject({ kind: 'window', material: 'glass', hp: 8 });
  });

  it('STR-2 walls, doors, windows and floors of a material with hp are breakable; ground, rubble, void and stairs are not', () => {
    const s = game();
    expect(query.tileInfo(s, pos(2, 2))?.breakable).toBe(true);
    expect(query.tileInfo(s, pos(7, 4))?.breakable).toBe(true);
    expect(query.tileInfo(s, pos(10, 5))?.breakable).toBe(false); // stair: never damaged (RULING STR-2)
    expect(query.tileInfo(s, pos(0, 0))?.breakable).toBe(false);
    expect(query.tileInfo(s, pos(0, 0, 1))?.breakable).toBe(false);
    // A blast centred on the street damages nothing there.
    const r = blastFrom(only(s, ['a1']), pos(1, 1), pos(1, 0));
    expect(ofType(r.events, 'tileDamaged')).toHaveLength(0);
    expect(ofType(r.events, 'blast')).toHaveLength(1);
  });

  it('STR-3 structure damage lowers hp, emits tileDamaged with the amount and the hp left, and never goes below 0', () => {
    const s = only(game(), ['a1']);
    const r = blastFrom(s, pos(4, 11), pos(4, 10)); // the street outside the south wall
    const hits = ofType(r.events, 'tileDamaged');
    expect(hits.map((e) => `${e.at.x},${e.at.y}`).sort()).toEqual(['3,9', '4,9', '5,9']);
    for (const e of hits) expect(e).toMatchObject({ amount: TUNING.blast.edgeStructureDamage, hp: 120 - 60 });
    expect(tileAt(r.state, pos(4, 9))).toMatchObject({ kind: 'wall', hp: 60 });
    expect(tileAt(s, pos(4, 9))?.hp).toBe(120); // the input state is untouched (ARCH-2)
    const low = patchTile(s, pos(4, 9), { hp: 5 });
    const r2 = blastFrom(low, pos(4, 11), pos(4, 10));
    expect(tileAt(r2.state, pos(4, 9))?.hp).toBe(0);
  });

  it('STR-4 a destroyed wall or door becomes rubble on any level, a ground floor becomes rubble, with a tileDestroyed event', () => {
    const s = only(game(), ['a1']);
    // Room B: the charge lands on the floor at (5,7); the door at (5,6) and the walls beside it are neighbours.
    const r = blastFrom(s, pos(3, 7), pos(5, 7));
    expect(tileAt(r.state, pos(5, 7))).toMatchObject({ kind: 'rubble', material: 'none', hp: 0, open: false }); // level 0 floor
    expect(tileAt(r.state, pos(5, 6))).toMatchObject({ kind: 'rubble', material: 'none', hp: 0 }); // timber door, 30 hp
    expect(tileAt(r.state, pos(4, 6))).toMatchObject({ kind: 'wall', hp: 60 }); // brick stands
    const gone = ofType(r.events, 'tileDestroyed');
    expect(gone).toContainEqual(expect.objectContaining({ at: pos(5, 7), was: 'floor', now: 'rubble' }));
    expect(gone).toContainEqual(expect.objectContaining({ at: pos(5, 6), was: 'door', now: 'rubble' }));
    // Rubble is passable and no longer blocks sight; nothing else changed (no chain collapse).
    expect(query.los(r.state, pos(5, 8), pos(5, 4))).toBe(true);
    expect(query.los(s, pos(5, 8), pos(5, 4))).toBe(false);
    expect(tileAt(r.state, pos(5, 6, 1))).toEqual(tileAt(s, pos(5, 6, 1)));
    // An upper wall becomes rubble too, not a hole.
    const up = blastFrom(patchTile(s, pos(8, 4, 1), { hp: 10 }), pos(4, 4, 1), pos(7, 4, 1));
    expect(tileAt(up.state, pos(8, 4, 1))?.kind).toBe('rubble');
  });

  it('STR-5 an upper floor collapses into a hole; a unit on it falls a level, takes fall damage and loses its orders', () => {
    let s = only(game(), ['a1', 'a2']);
    s = place(s, 'a2', 6, 4, 1);
    s = patchTile(s, pos(6, 4, 1), { hp: 40 });
    s = patch(s, 'a2', { stance: 'hold' });
    // a1 throws at (5,4,1): a2 on the east neighbour takes the edge blast, then its cracked floor gives way.
    s = place(s, 'a1', 3, 4, 1);
    s = order(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(5, 4, 1) }).state;
    s = tick(s, TUNING.blast.armTicks - 1).state;
    // a2 is given a move order in the last moment: the fall must clear it before a2's own step.
    s = order(s, { type: 'move', side: 'agency', unit: 'a2', to: pos(3, 6, 1) }).state;
    const r = tick(s, 1);
    const fell = ofType(r.events, 'fell');
    expect(fell).toHaveLength(1);
    const a2 = unit(r.state, 'a2');
    const afterBlast = 60 - (TUNING.blast.edgeUnitDamage - a2.armour);
    expect(fell[0]).toMatchObject({ unit: 'a2', from: pos(a2.x, a2.y, 1), to: pos(a2.x, a2.y, 0), dealt: TUNING.structure.fallDamage, hp: afterBlast - 15 });
    expect(a2).toMatchObject({ level: 0, hp: afterBlast - 15, order: null, blast: null, down: false });
    expect(tileAt(r.state, pos(a2.x, a2.y, 1))).toMatchObject({ kind: 'void', material: 'none', hp: 0 });
    expect(tileAt(r.state, pos(5, 4, 1))?.kind).toBe('void'); // the centre took 160
    expect(checkInvariants(r.state, { deep: true })).toEqual([]);
    // The damaged events of the blast come before the fall (BLAST-4 before BLAST-3).
    const iDamaged = r.events.findIndex((e) => e.type === 'damaged' && e.unit === 'a2');
    const iFell = r.events.findIndex((e) => e.type === 'fell');
    expect(iDamaged).toBeGreaterThan(-1);
    expect(iDamaged).toBeLessThan(iFell);
  });

  it('STR-5 a floor whose occupant cannot land holds at 1 hp, and a fall to 0 hp puts the unit down', () => {
    let s = only(game(), ['a1', 'a2', 'a3']);
    s = place(s, 'a2', 6, 4, 1);
    s = place(s, 'a3', 6, 4, 0); // someone stands where a2 would land
    s = patch(patch(s, 'a2', { stance: 'hold' }), 'a3', { stance: 'hold' });
    s = patchTile(s, pos(6, 4, 1), { hp: 40 });
    const held = blastFrom(s, pos(3, 4, 1), pos(5, 4, 1));
    expect(tileAt(held.state, pos(6, 4, 1))).toMatchObject({ kind: 'floor', hp: 1 });
    expect(unit(held.state, 'a2').level).toBe(1);
    expect(ofType(held.events, 'fell')).toHaveLength(0);
    // Without a3 below and with a2 nearly spent, the fall is the end of a2.
    let t = only(game(), ['a1', 'a2']);
    t = place(t, 'a2', 6, 4, 1);
    t = patch(t, 'a2', { stance: 'hold', hp: 20 });
    t = patchTile(t, pos(6, 4, 1), { hp: 40 });
    const fatal = blastFrom(t, pos(3, 4, 1), pos(5, 4, 1));
    expect(unit(fatal.state, 'a2')).toMatchObject({ level: 0, hp: 0, down: true });
    expect(fatal.state.score.agentsDown).toBe(1);
    expect(fatal.events.some((e) => e.type === 'down' && e.unit === 'a2')).toBe(true);
    expect(checkInvariants(fatal.state, { deep: true })).toEqual([]);
  });

  it('STR-6 a missed ranged shot strikes the first wall, closed door or window behind the target; pistols and hits do not', () => {
    // Room A: a1 (carbine, structureDamage 6) at (3,3) fires east at u2 on (5,3); the wall at (7,3) is behind.
    let s = only(game(1, NEVER_HIT), ['a1', 'u2']);
    s = place(place(s, 'a1', 3, 3), 'u2', 5, 3);
    s = patch(s, 'u2', { stance: 'hold' });
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    const r = tick(s, 10);
    const shot = ofType(r.events, 'shot')[0]!;
    expect(shot.hit).toBe(false);
    expect(ofType(r.events, 'tileDamaged')[0]).toMatchObject({ at: pos(7, 3), amount: 6, hp: 114 });
    expect(unit(r.state, 'u2').hp).toBe(unit(s, 'u2').hp); // FIRE-7 still holds for units
    // A pistol (structureDamage 0) chips nothing.
    let p = only(game(1, NEVER_HIT), ['a2', 'u2']);
    p = place(place(p, 'a2', 3, 3), 'u2', 5, 3);
    p = patch(p, 'u2', { stance: 'hold' });
    p = order(p, { type: 'fire', side: 'agency', unit: 'a2', target: 'u2' }).state;
    expect(ofType(tick(p, 10).events, 'tileDamaged')).toHaveLength(0);
    // A window in the way breaks: the scatter gun's 14 beats plate glass.
    let w = only(game(1, NEVER_HIT), ['a3', 'u2']);
    w = place(place(w, 'a3', 3, 3), 'u2', 5, 3);
    w = patch(w, 'u2', { stance: 'hold' });
    w = patchTile(w, pos(7, 3), { kind: 'window', material: 'glass', hp: 8 });
    w = order(w, { type: 'fire', side: 'agency', unit: 'a3', target: 'u2' }).state;
    const wr = tick(w, 10);
    expect(ofType(wr.events, 'tileDestroyed')[0]).toMatchObject({ at: pos(7, 3), was: 'window', now: 'rubble' });
    // The stray stops at the weapon's range from the shooter.
    let far = only(game(1, NEVER_HIT), ['a3', 'u2']);
    far = place(place(far, 'a3', 2, 1), 'u2', 7, 1); // open street, scatter range 6: nothing within reach behind
    far = patch(far, 'u2', { stance: 'hold' });
    far = order(far, { type: 'fire', side: 'agency', unit: 'a3', target: 'u2' }).state;
    expect(ofType(tick(far, 10).events, 'tileDamaged')).toHaveLength(0);
  });

  it('MOVE-2 a step onto rubble costs double, and MAP-2 a window passes sight but not movement', () => {
    const s = only(game(), ['a1']);
    const at = place(s, 'a1', 3, 3);
    const plain = query.path(at, 'a1', pos(5, 3))!.ticks;
    const rub = patchTile(at, pos(4, 3), { kind: 'rubble', material: 'none', hp: 0 });
    // Straight through the rubble costs 4 * 200% + 4; the detour round it by diagonals is cheaper.
    const cost = query.path(rub, 'a1', pos(4, 3))!.ticks;
    expect(cost).toBe(Math.round((unit(at, 'a1').moveTicks * TUNING.move.rubbleCostPercent) / 100));
    expect(plain).toBe(8);
    const win = patchTile(at, pos(7, 3), { kind: 'window', material: 'glass', hp: 8 });
    expect(query.los(win, pos(3, 3), pos(9, 3))).toBe(true);
    expect(query.los(at, pos(3, 3), pos(9, 3))).toBe(false);
    expectReject(win, { type: 'move', side: 'agency', unit: 'a1', to: pos(7, 3) });
  });

  it('MOVE-5 a unit whose next step was destroyed replans at once, and drops the order when no path is left', () => {
    let s = only(game(), ['a1']);
    s = place(s, 'a1', 3, 4, 1);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(7, 4, 1) }).state;
    // The floor ahead becomes a hole behind the engine's back; the path must go round it.
    s = patchTile(s, pos(4, 4, 1), { kind: 'void', material: 'none', hp: 0 });
    const r = tick(s, 60);
    expect(unit(r.state, 'a1')).toMatchObject({ x: 7, y: 4, level: 1, order: null });
    expect(r.events.filter((e) => e.type === 'moved').every((e) => e.type === 'moved' && !(e.to.x === 4 && e.to.y === 4))).toBe(true);
    // Cut off completely: the order clears with moveBlocked.
    let cut = only(game(), ['a1']);
    cut = place(cut, 'a1', 3, 4, 1);
    cut = order(cut, { type: 'move', side: 'agency', unit: 'a1', to: pos(7, 4, 1) }).state;
    for (const [x, y] of [[4, 3], [4, 4], [4, 5], [3, 5], [3, 3]] as const) cut = patchTile(cut, pos(x, y, 1), { kind: 'void', material: 'none', hp: 0 });
    const c = tick(cut, 10);
    expect(unit(c.state, 'a1').order).toBeNull();
    expect(c.events.some((e) => e.type === 'moveBlocked')).toBe(true);
  });
});

describe('20. Charges (BLAST)', () => {
  it('BLAST-1 agents start with two charges and nobody else has any; a blast order sets the pending charge', () => {
    const s = game();
    for (const u of s.units) expect(u.charges, u.id).toBe(u.side === 'agency' ? 2 : 0);
    for (const u of s.units) expect(u.blast).toBeNull();
    const r = order(place(only(s, ['a1']), 'a1', 4, 11), { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 9) });
    expect(unit(r.state, 'a1').blast).toEqual({ at: pos(4, 9), progress: 0 });
    expect(r.events[0]).toMatchObject({ type: 'ordered' });
    expect(r.state.tick).toBe(0); // an order moves no time (TIME-2)
  });

  it('ORD-9 blast needs a charge, a seen tile on the same level within range and not its own; halt (ORD-6) cancels it', () => {
    const s = place(only(game(), ['a1', 'u2']), 'a1', 4, 11);
    expect(expectReject(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 11) })).toMatch(/own tile/);
    expect(expectReject(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 3) })).toMatch(/out of range/);
    expect(expectReject(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 10, 1) })).toMatch(/another level/);
    expect(expectReject(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 8) })).toMatch(/not seen/); // behind the south wall
    expect(expectReject(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(99, 0) })).toMatch(/off the map/);
    expect(expectReject(s, { type: 'blast', side: 'hostile', unit: 'u2', at: pos(unit(s, 'u2').x + 1, unit(s, 'u2').y, unit(s, 'u2').level) })).toMatch(/no charges/);
    expect(expectReject(patch(s, 'a1', { charges: 0 }), { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 9) })).toMatch(/no charges/);
    // ORD-8: legalActions lists every legal blast tile in tile-index order, and each is accepted.
    const blasts = legalActions(s, 'agency').filter((a) => a.type === 'blast' && a.unit === 'a1');
    expect(blasts.length).toBeGreaterThan(20);
    const idx = blasts.map((a) => (a.type === 'blast' ? tileIndex(s, a.at) : -1));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    for (const a of blasts.slice(0, 10)) expect(step(s, a).ok).toBe(true);
    expect(legalActions(s, 'hostile').some((a) => a.type === 'blast')).toBe(false);
    // A second order replaces the first; halt clears it.
    let t = order(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 9) }).state;
    t = order(t, { type: 'blast', side: 'agency', unit: 'a1', at: pos(5, 9) }).state;
    expect(unit(t, 'a1').blast?.at).toEqual(pos(5, 9));
    t = order(t, { type: 'halt', side: 'agency', unit: 'a1' }).state;
    expect(unit(t, 'a1').blast).toBeNull();
    expect(ofType(tick(t, 10).events, 'blast')).toHaveLength(0);
  });

  it('BLAST-2 arming takes armTicks standing still, then the charge goes off, one charge is spent and the move order resumes', () => {
    let s = place(only(game(), ['a1']), 'a1', 4, 11);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(8, 11) }).state;
    s = order(s, { type: 'blast', side: 'agency', unit: 'a1', at: pos(4, 9) }).state;
    const before = tick(s, TUNING.blast.armTicks - 1);
    expect(ofType(before.events, 'blast')).toHaveLength(0);
    expect(unit(before.state, 'a1')).toMatchObject({ x: 4, y: 11, moving: false, charges: 2 });
    expect(unit(before.state, 'a1').blast?.progress).toBe(TUNING.blast.armTicks - 1);
    const boom = tick(before.state, 1);
    expect(ofType(boom.events, 'blast')[0]).toMatchObject({ unit: 'a1', at: pos(4, 9), tick: TUNING.blast.armTicks - 1 });
    expect(unit(boom.state, 'a1')).toMatchObject({ charges: 1, blast: null, lastFiredTick: TUNING.blast.armTicks - 1 });
    expect(unit(boom.state, 'a1').order).not.toBeNull(); // kept through the arming
    const after = tick(boom.state, 30);
    expect(unit(after.state, 'a1')).toMatchObject({ x: 8, y: 11, order: null });
  });

  it('BLAST-3 the centre takes structureDamage and the eight neighbours edgeStructureDamage, centre first then E, S, W, N, NE, SE, SW, NW', () => {
    // Level 1, room A: everything around (5,4,1) is concrete floor, so all nine tiles report.
    const s = only(game(), ['a1']);
    const r = blastFrom(s, pos(3, 6, 1), pos(5, 4, 1));
    const first = r.events.findIndex((e) => e.type === 'blast');
    expect(r.events.slice(0, first).every((e) => e.type !== 'tileDamaged')).toBe(true);
    const hits = ofType(r.events, 'tileDamaged');
    expect(hits.map((e) => [e.at.x - 5, e.at.y - 4])).toEqual([[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]);
    expect(hits[0]).toMatchObject({ amount: TUNING.blast.structureDamage, hp: 0 });
    for (const e of hits.slice(1)) expect(e).toMatchObject({ amount: TUNING.blast.edgeStructureDamage, hp: 150 - 60 });
    expect(ofType(r.events, 'tileDestroyed')).toEqual([expect.objectContaining({ at: pos(5, 4, 1), was: 'floor', now: 'void' })]);
  });

  it('BLAST-4 units on the centre and the neighbours are hurt before the structure, any side, with no roll and no change to hits or shots', () => {
    let s = only(game(), ['a1', 'a2', 'u7']); // u7 is a real citizen
    expect(unit(s, 'u7').side).toBe('civilian');
    s = place(place(s, 'a2', 5, 4, 1), 'u7', 6, 5, 1);
    s = patch(s, 'a2', { stance: 'hold' });
    const rng = [...place(s, 'a1', 3, 6, 1).rng];
    const r = blastFrom(s, pos(3, 6, 1), pos(5, 4, 1));
    const dmg = ofType(r.events, 'damaged');
    // Unit order: a2 (centre, 40 less armour 4) then u7 (edge, 20 less armour 0).
    expect(dmg.map((e) => [e.unit, e.raw, e.dealt])).toEqual([['a2', 40, 36], ['u7', 20, 20]]);
    expect(r.events.findIndex((e) => e.type === 'damaged')).toBeLessThan(r.events.findIndex((e) => e.type === 'tileDamaged'));
    expect(r.state.score).toMatchObject({ hits: 0, shotsFired: 0, civilianHits: 1 });
    expect(r.state.rng).toEqual(rng); // no roll
    // a2 was on the centre, which collapsed under it: hurt, then fallen.
    expect(unit(r.state, 'a2')).toMatchObject({ level: 0, hp: 60 - 36 - 15 });
  });

  it('BLAST-5 a host caught in a blast stays disguised: the agency still sees a citizen', () => {
    let s = only(game(), ['a1', 'u2']);
    expect(unit(s, 'u2')).toMatchObject({ template: 'host', revealed: false });
    s = place(s, 'u2', 12, 4);
    s = patch(s, 'u2', { stance: 'hold' });
    const r = blastFrom(s, pos(10, 8), pos(11, 4));
    expect(unit(r.state, 'u2')).toMatchObject({ hp: 20, revealed: false });
    expect(r.events.some((e) => e.type === 'revealed')).toBe(false);
    expect(r.state.score.civilianHits).toBe(1); // CIV-3: it looked like a citizen
    const seen = view(r.state, 'agency').units.find((u) => u.id === 'u2');
    expect(seen).toMatchObject({ template: 'citizen', side: 'civilian', charges: 0, blast: null });
  });
});

describe('14. Queries and 16. Invariants for structure (QRY, INV)', () => {
  it('QRY-7 tileInfo names the kind, the material, hp of its maximum and whether it breaks', () => {
    const s = game();
    expect(query.tileInfo(s, pos(2, 2))).toEqual({ kind: 'wall', open: false, material: 'brick', materialName: 'Brick', hp: 120, maxHp: 120, breakable: true });
    expect(query.tileInfo(s, pos(0, 0))).toMatchObject({ kind: 'ground', breakable: false, maxHp: 0 });
    expect(query.tileInfo(s, pos(-1, 0))).toBeNull();
  });

  it('QRY-8 blastPreview lists the nine tiles with what each takes, or says why the order would be refused', () => {
    const s = place(only(game(), ['a1']), 'a1', 3, 6, 1);
    const p = query.blastPreview(s, 'a1', pos(5, 4, 1));
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.armTicks).toBe(TUNING.blast.armTicks);
      expect(p.tiles).toHaveLength(9);
      expect(p.tiles[0]).toEqual({ x: 5, y: 4, level: 1, structureDamage: 160, unitDamage: 40 });
      expect(p.tiles[1]).toEqual({ x: 6, y: 4, level: 1, structureDamage: 60, unitDamage: 20 });
    }
    expect(query.blastPreview(s, 'a1', pos(3, 6, 1))).toMatchObject({ ok: false, reason: expect.stringMatching(/own tile/) });
    expect(query.blastPreview(s, 'zz', pos(3, 6, 1))).toMatchObject({ ok: false });
  });

  it('INV-8 tile hp stays within its material, a breakable tile never rests at 0, and a pending charge is on the unit level', () => {
    const s = game();
    expect(checkInvariants(s, { deep: true })).toEqual([]);
    expect(checkInvariants(patchTile(s, pos(2, 2), { hp: 999 }), { deep: true }).join()).toMatch(/INV-8/);
    expect(checkInvariants(patchTile(s, pos(2, 2), { hp: 0 }), { deep: true }).join()).toMatch(/INV-8 breakable/);
    expect(checkInvariants(patchTile(s, pos(2, 2), { material: 'cheese' }), { deep: true }).join()).toMatch(/unknown material/);
    expect(checkInvariants(patch(s, 'a1', { charges: -1 })).join()).toMatch(/INV-8/);
    expect(checkInvariants(patch(s, 'a1', { blast: { at: pos(4, 10, 2), progress: 0 } })).join()).toMatch(/INV-8/);
    // After real destruction the invariants still hold.
    const r = blastFrom(only(s, ['a1']), pos(3, 7), pos(5, 7));
    expect(checkInvariants(r.state, { deep: true })).toEqual([]);
  });
});
