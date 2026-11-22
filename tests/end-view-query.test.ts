import { describe, expect, it } from 'vitest';
import { hashState, legalActions, query, replay, view } from '../src/engine';
import { TUNING } from '../src/data';
import { ALWAYS_HIT, SETUP, clone, expectReject, game, only, order, patch, place, pos, tick, unit } from './helpers';

describe('12. End of battle (END)', () => {
  it('END-1 the agency wins when the last hostile goes down', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2'], false);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 5, 0);
    s = patch(s, 'u2', { revealed: true, stance: 'hold', hp: 1 });
    const r = tick(s, 8);
    expect(r.state.over).toEqual({ winner: 'agency', reason: 'cleared', tick: 8 });
    expect(r.events[r.events.length - 1]).toEqual({ type: 'over', tick: 8, winner: 'agency', reason: 'cleared' });
  });

  it('END-2 the hostiles win when the squad is lost; both wiped in one tick is mutual', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2'], false);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 5, 0);
    s = patch(s, 'u2', { revealed: true });
    s = patch(s, 'a1', { hp: 1, stance: 'hold' });
    const r = tick(s, 10);
    expect(r.state.over).toMatchObject({ winner: 'hostile', reason: 'squad-lost' });
    // Mutual: a1 (aim 8 ticks) and u2 (aim 6)... make both fire in the same tick: equal aimTicks via patch of weapons is data;
    // instead down both by hand in one tick: a1 kills u2 (hp 1) at tick 7 while u2 killed a1 earlier? Use two hostiles:
    let m = only(game(1, ALWAYS_HIT), ['a1', 'u2'], false);
    m = patch(m, 'u2', { hp: 0, down: true });
    m = patch(m, 'a1', { hp: 0, down: true });
    // Both sides already have no living unit: the next tick says mutual.
    expect(tick(m).state.over).toMatchObject({ winner: 'none', reason: 'mutual' });
  });

  it('END-3 the battle times out at maxBattleSeconds * ticksPerSecond', () => {
    let s = only(game(1, { time: { ticksPerSecond: 10, maxBattleSeconds: 2 } }), ['a1', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 11, 8); // far apart, nobody fires
    const r = tick(s, 25);
    expect(r.state.over).toEqual({ winner: 'none', reason: 'timeout', tick: 20 });
    expect(r.state.tick).toBe(20);
    expect(TUNING.time.maxBattleSeconds).toBe(600);
  });

  it('END-4 withdraw ends the battle with no winner', () => {
    const r = order(game(), { type: 'withdraw', side: 'agency' });
    expect(r.state.over).toEqual({ winner: 'none', reason: 'withdrawn', tick: 0 });
  });

  it('END-5 over never changes; orders are rejected; tick is a no-op; one over event', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2'], false);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 5, 0);
    s = patch(s, 'u2', { revealed: true, stance: 'hold', hp: 1 });
    const r = tick(s, 8);
    const over = r.state.over;
    const again = tick(r.state, 5);
    expect(again.state.over).toEqual(over);
    expect(again.events).toEqual([]);
    expect(r.events.filter((e) => e.type === 'over')).toHaveLength(1);
    expectReject(r.state, { type: 'withdraw', side: 'agency' });
    expectReject(r.state, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 0) });
    expect(legalActions(r.state, 'agency')).toEqual([{ type: 'tick' }]);
  });
});

describe('13. View (VIEW)', () => {
  it('VIEW-1 the view keeps own units in full plus tiles, tick, tuning, score and over', () => {
    let s = game();
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(4, 11) }).state;
    s = tick(s, 2).state;
    const v = view(s, 'agency');
    expect(v.units.find((u) => u.id === 'a1')).toEqual(unit(s, 'a1'));
    expect(v.tiles).toEqual(s.tiles);
    expect(v.tick).toBe(2);
    expect(v.tuning).toEqual(s.tuning);
    expect(v.score).toEqual(s.score);
    expect(v.over).toBeNull();
  });

  it('VIEW-2 seen foreign units are redacted; unrevealed hosts look like citizens', () => {
    let s = only(game(), ['a1', 'u2', 'u4']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    s = place(s, 'u4', 10, 8);
    s = order(s, { type: 'move', side: 'hostile', unit: 'u2', to: pos(6, 3) }).state;
    s = order(s, { type: 'fire', side: 'hostile', unit: 'u2', target: 'a1' }).state;
    const v = view(s, 'agency');
    expect(v.units.filter((u) => !u.down).map((u) => u.id)).toEqual(['a1', 'a6', 'u2']);
    expect(v.units.filter((u) => u.side === 'agency')).toHaveLength(6); // own units, down ones included
    const u2 = v.units.find((u) => u.id === 'u2')!;
    expect(u2).toMatchObject({ order: null, fireTarget: null, aimProgress: 0, readyTick: 0, lastFiredTick: -1, stance: 'hold', template: 'citizen', side: 'civilian', weapon: null, disguised: false });
    expect(u2).toMatchObject({ x: 6, y: 5, level: 0, hp: 40, maxHp: 40, armour: 0, down: false });
    // Once revealed, the truth shows, still redacted.
    const rv = view(patch(s, 'u2', { revealed: true }), 'agency').units.find((u) => u.id === 'u2')!;
    expect(rv).toMatchObject({ template: 'host', side: 'hostile', weapon: 'pocket-pistol', disguised: true, revealed: true, order: null, stance: 'hold' });
    // The hostile view redacts agents the same way.
    const hv = view(order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 5) }).state, 'hostile').units.find((u) => u.id === 'a1')!;
    expect(hv).toMatchObject({ order: null, stance: 'hold', template: 'agent-t1', weapon: 'patrol-carbine' });
  });

  it('VIEW-3 down foreign units show while their tile is seen', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    s = patch(s, 'u2', { hp: 0, down: true });
    expect(view(s, 'agency').units.find((u) => u.id === 'u2')).toMatchObject({ down: true, hp: 0, stance: 'hold' });
    expect(view(place(s, 'u2', 10, 8), 'agency').units.find((u) => u.id === 'u2')).toBeUndefined();
  });

  it('VIEW-5 with at most sight.markLastHostiles hostiles alive the agency view marks the unseen ones; never before, never for other sides', () => {
    const s0 = game();
    expect(view(s0, 'agency').marks).toBeUndefined();
    expect(s0.marks).toBeUndefined();
    // Two hostiles live (u2 and the roof sentinel u9): a1 sees u2, so only u9 is marked.
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    const u9 = unit(s, 'u9');
    const v = view(s, 'agency');
    expect(v.marks).toEqual([{ x: u9.x, y: u9.y, level: u9.level }]);
    expect(v.units.some((u) => u.id === 'u9')).toBe(false); // a mark is a place, not a unit
    // Out of sight, a disguised host is marked too: the hunt for the last ones ends.
    expect(view(place(s, 'u2', 10, 8), 'agency').marks).toHaveLength(2);
    expect(view(s, 'hostile').marks).toBeUndefined();
    // Three alive is one too many.
    expect(view(only(game(), ['a1', 'u2', 'u4']), 'agency').marks).toBeUndefined();
  });

  it('VIEW-4 the view zeroes the rng and empties the log; civilians see only themselves', () => {
    let s = game();
    s = tick(s, 3).state;
    const v = view(s, 'agency');
    expect(v.rng).toEqual([0, 0, 0, 0]);
    expect(v.log).toEqual([]);
    expect(s.rng.some((x) => x !== 0)).toBe(true);
    const c = view(s, 'civilian');
    expect(c.units.every((u) => u.side === 'civilian')).toBe(true);
    expect(c.units).toHaveLength(4);
  });
});

describe('14. Queries (QRY)', () => {
  it('QRY-1 seconds and ticksFor convert through the data rate', () => {
    const s = tick(game(), 25).state;
    expect(query.seconds(s)).toBe(2.5);
    expect(query.ticksFor(s, 1.26)).toBe(13);
  });

  it('QRY-2 hitChance gives the breakdown or a reason; damageRange is after armour', () => {
    let s = only(game(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'a2', 2, 1);
    s = place(s, 'u2', 5, 0);
    expect(query.hitChance(s, 'a1', 'u2')).toEqual({ ok: true, shooter: 'a1', target: 'u2', weapon: 'patrol-carbine', distance: 3, accuracy: 70, aim: 10, falloff: 6, movingPenalty: 0, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, cover: 0, coverGrade: 'none', snapPenalty: 0, suppressPenalty: 0, raw: 74, chance: 74 });
    expect(query.hitChance(s, 'a1', 'a2')).toMatchObject({ ok: false, reason: 'same side' });
    expect(query.hitChance(s, 'zz', 'u2')).toMatchObject({ ok: false });
    expect(query.damageRange(s, 'a1', 'u2')).toEqual({ min: 25, max: 40 });
    expect(query.damageRange(patch(s, 'u2', { armour: 5 }), 'a1', 'u2')).toEqual({ min: 20, max: 35 });
    expect(query.damageRange(s, 'a1', 'a2')).toBeNull();
  });

  it('QRY-3 reachable lists every pathable free tile with its cost; path gives steps and ticks', () => {
    let s = only(game(), ['a1', 'u1']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u1', 4, 3);
    const r = query.reachable(s, 'a1');
    expect(r.some((p) => p.x === 3 && p.y === 3 && p.level === 0)).toBe(false);
    expect(r.some((p) => p.x === 4 && p.y === 3 && p.level === 0)).toBe(false);
    expect(r.find((p) => p.x === 5 && p.y === 3 && p.level === 0)?.ticks).toBe(8);
    expect(r.find((p) => p.x === 4 && p.y === 4 && p.level === 0)?.ticks).toBe(6);
    expect(r.some((p) => p.level === 2)).toBe(true);
    expect(query.path(s, 'a1', pos(5, 3))).toEqual({ steps: [pos(4, 3), pos(5, 3)], ticks: 8 });
    expect(query.path(s, 'a1', pos(0, 0, 1))).toBeNull();
    expect(query.path(s, 'a1', pos(3, 3))).toBeNull();
    expect(query.reachable(s, 'u3')).toEqual([]); // down
  });

  it('QRY-4 canSee, visibleTiles, los and distance expose section 6', () => {
    let s = only(game(), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    expect(query.canSee(s, 'agency', 'u2')).toBe(true);
    expect(query.canSee(s, 'hostile', 'a1')).toBe(true);
    expect(query.canSee(s, 'civilian', 'a1')).toBe(false);
    expect(query.canSee(s, 'agency', 'zz')).toBe(false);
    const tiles = query.visibleTiles(s, 'agency');
    expect(tiles).toContainEqual(pos(6, 5));
    expect(tiles).not.toContainEqual(pos(9, 3));
    expect(query.los(s, pos(3, 3), pos(6, 5))).toBe(true);
    expect(query.los(s, pos(6, 3), pos(8, 3))).toBe(false);
    expect(query.distance(pos(0, 0), pos(6, 8))).toBe(10);
  });

  it('QRY-5 outcome reports counters, living per side and over', () => {
    const s = game();
    expect(query.outcome(s)).toEqual({ tick: 0, seconds: 0, score: { shotsFired: 0, hits: 0, civilianHits: 0, agentsDown: 0, hostilesDown: 0, civiliansDown: 0, taken: 0 }, living: { agency: 6, hostile: 5, civilian: 4 }, over: null });
    const o = query.outcome(order(s, { type: 'withdraw', side: 'agency' }).state);
    expect(o.over).toEqual({ winner: 'none', reason: 'withdrawn', tick: 0 });
  });

  it('QRY-6 unitsSeen lists own units plus seen others', () => {
    let s = only(game(), ['a1', 'u2', 'u4']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 5);
    s = place(s, 'u4', 10, 8);
    expect(query.unitsSeen(s, 'agency')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'u2']); // own units always, u4 unseen, u9 on the roof
    expect(query.unitsSeen(s, 'civilian')).toEqual(['u1', 'u3', 'u7', 'u8']);
  });
});

describe('15. Save (SAV)', () => {
  it('SAV-1 the snapshot is the state and the log replays to it', () => {
    let s = game();
    s = order(s, { type: 'move', side: 'agency', unit: 'a3', to: pos(6, 8) }).state;
    s = tick(s, 30).state;
    const snapshot = JSON.parse(JSON.stringify(s));
    expect(snapshot).toEqual(s);
    const again = replay(SETUP, snapshot.log);
    expect(again).toEqual(s);
    expect(hashState(again)).toBe(hashState(s));
    // Loading the snapshot and continuing gives the same future as continuing the original.
    expect(tick(clone(s), 10).state).toEqual(tick(s, 10).state);
  });

  it('SAV-2 the autosave interval is a data number', () => {
    expect(TUNING.save.autosaveSeconds).toBe(10);
    expect(game().tuning.save.autosaveSeconds).toBe(10);
  });
});
