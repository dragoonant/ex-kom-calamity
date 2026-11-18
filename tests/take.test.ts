import { describe, expect, it } from 'vitest';
import { createGame, legalActions, view } from '../src/engine';
import { UNITS, WEAPONS } from '../src/data';
import { ALWAYS_HIT, game, only, order, place, tick, unit } from './helpers';

// Ids are by spawn position (UNIT-3), so the taker and a citizen are found by template at test time.
function ids(s: ReturnType<typeof game>) {
  const taker = s.units.find((u) => u.template === 'taker')!;
  const citizen = s.units.find((u) => u.template === 'citizen')!;
  return { taker: taker.id, citizen: citizen.id };
}

/** Taker beside a citizen in room A, one agent far away, hits forced. */
function setup(agentSees: boolean) {
  let s = game(3, ALWAYS_HIT);
  const { taker, citizen } = ids(s);
  s = only(s, [taker, citizen, 'a1']);
  s = place(s, citizen, 4, 4, 0);
  s = place(s, taker, 5, 4, 0);
  // a1 either watches from inside room A (sees the tile) or stands in the street out of sight.
  s = agentSees ? place(s, 'a1', 4, 5, 0) : place(s, 'a1', 0, 0, 0);
  return { s, taker, citizen };
}

describe('21. Taking (TAKE)', () => {
  it('TAKE-1 the taker bite names host as what it takes, is melee, and converts a citizen in place without a damage roll', () => {
    expect(WEAPONS['taker-bite']!.takes).toBe('host');
    expect(WEAPONS['taker-bite']!.kind).toBe('melee');
    const { s, taker, citizen } = setup(false);
    const before = unit(s, citizen);
    let st = order(s, { type: 'fire', side: 'hostile', unit: taker, target: citizen }).state;
    const r = tick(st, 6);
    st = r.state;
    const taken = r.events.find((e) => e.type === 'taken');
    expect(taken).toBeDefined();
    const after = unit(st, citizen);
    expect(after.template).toBe('host');
    expect(after.side).toBe('hostile');
    expect(after.weapon).toBe(UNITS.host!.weapon);
    expect(after.disguised).toBe(true);
    expect(after.hp).toBe(before.hp);
    expect(after.maxHp).toBe(before.maxHp);
    expect([after.x, after.y, after.level]).toEqual([before.x, before.y, before.level]);
    expect(after.stance).toBe(UNITS.host!.defaultStance);
    expect(after.order).toBeNull();
    expect(after.fireTarget).toBeNull();
    expect(r.events.filter((e) => e.type === 'damaged')).toEqual([]);
    expect(r.events.filter((e) => e.type === 'shot')).toHaveLength(1);
  });

  it('TAKE-2 a taking the squad watches yields a revealed host; one in the dark stays hidden; the event says which', () => {
    const seen = setup(true);
    let st = order(seen.s, { type: 'fire', side: 'hostile', unit: seen.taker, target: seen.citizen }).state;
    let r = tick(st, 6);
    let ev = r.events.find((e) => e.type === 'taken');
    expect(ev && ev.type === 'taken' && ev.seen).toBe(true);
    expect(unit(r.state, seen.citizen).revealed).toBe(true);
    expect(view(r.state, 'agency').units.find((u) => u.id === seen.citizen)?.side).toBe('hostile');

    const dark = setup(false);
    st = order(dark.s, { type: 'fire', side: 'hostile', unit: dark.taker, target: dark.citizen }).state;
    r = tick(st, 6);
    ev = r.events.find((e) => e.type === 'taken');
    expect(ev && ev.type === 'taken' && ev.seen).toBe(false);
    expect(unit(r.state, dark.citizen).revealed).toBe(false);
    // Put an agent beside it later: the agency's view still shows a citizen (HIDE-1).
    const peek = place(r.state, 'a1', 4, 5, 0);
    expect(view(peek, 'agency').units.find((u) => u.id === dark.citizen)?.template).toBe('citizen');
  });

  it('TAKE-3 the counters: taken, hits and civilianHits rise, civiliansDown does not, and the battle goes on with the new hostile', () => {
    const { s, taker, citizen } = setup(false);
    // Only the taker and a1 are alive besides the citizen and sentinels; kill the sentinel taker role by making this the only hostile.
    let st = order(s, { type: 'fire', side: 'hostile', unit: taker, target: citizen }).state;
    const r = tick(st, 6);
    st = r.state;
    expect(st.score.taken).toBe(1);
    expect(st.score.hits).toBe(1);
    expect(st.score.civilianHits).toBe(1);
    expect(st.score.civiliansDown).toBe(0);
    expect(st.over).toBeNull();
    expect(st.units.filter((u) => !u.down && u.side === 'hostile').map((u) => u.id)).toContain(citizen);
  });

  it('TAKE-4 a bite on an agent is an ordinary hit, and a bite is never a stance target on a citizen (an explicit order is needed)', () => {
    let s = game(3, ALWAYS_HIT);
    const { taker, citizen } = ids(s);
    s = only(s, [taker, citizen, 'a1']);
    s = place(s, citizen, 4, 4, 0);
    s = place(s, taker, 5, 4, 0);
    s = place(s, 'a1', 5, 5, 0);
    // Stance engage: the taker bites the adjacent agent on its own, never the adjacent citizen.
    const r = tick(s, 6);
    const shots = r.events.filter((e) => e.type === 'shot' && e.shooter === taker);
    expect(shots.length).toBeGreaterThan(0);
    for (const sh of shots) expect(sh.type === 'shot' && sh.target).toBe('a1');
    expect(r.events.some((e) => e.type === 'damaged' && e.unit === 'a1')).toBe(true);
    expect(r.events.some((e) => e.type === 'taken')).toBe(false);
    expect(unit(r.state, citizen).template).toBe('citizen');
    // A fire order at the citizen is legal for the hostile side (ORD-4): that is the taking order.
    const legal = legalActions(s, 'hostile').some((a) => a.type === 'fire' && a.unit === taker && a.target === citizen);
    expect(legal).toBe(true);
  });

  it('TAKE-1 a taken host in bench-raid and block-raid data: fighters exist and carry a charge (BLAST-1)', () => {
    const b = createGame({ battleId: 'bench-raid', seed: 1 });
    expect(b.units.filter((u) => u.template === 'fighter').length).toBeGreaterThan(0);
    for (const f of b.units.filter((u) => u.template === 'fighter')) expect(f.charges).toBe(1);
    const k = createGame({ battleId: 'block-raid', seed: 1 });
    expect(k.units.filter((u) => u.template === 'fighter')).toHaveLength(2);
  });
});
