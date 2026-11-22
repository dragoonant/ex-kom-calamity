import { describe, expect, it } from 'vitest';
import { canFire, hitBreakdown, query, weaponOf } from '../src/engine';
import { WEAPONS } from '../src/data';
import { ALWAYS_HIT, NEVER_HIT, game, only, order, patch, place, pos, tick, unit } from './helpers';

/** a1 (carbine) at (2,0) facing a revealed host u2 on the street. */
function duel(tuning = ALWAYS_HIT, hostX = 5) {
  let s = only(game(1, tuning), ['a1', 'u2']);
  s = place(s, 'a1', 2, 0);
  s = place(s, 'u2', hostX, 0);
  s = patch(s, 'u2', { revealed: true });
  return s;
}

describe('8. Stances (STANCE)', () => {
  it('STANCE-1 engage fires at any eligible target, hold never fires on its own, retaliate only after being fired upon', () => {
    // hold: a1 never fires at the revealed host; the host (hold too) stays quiet.
    let s = duel();
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    expect(tick(s, 20).events.filter((e) => e.type === 'shot')).toEqual([]);
    // retaliate: a1 waits until u2 fires, then answers within memory.
    let r = order(duel(NEVER_HIT), { type: 'stance', side: 'agency', unit: 'a1', stance: 'retaliate' }).state;
    r = order(r, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    expect(tick(r, 15).events.filter((e) => e.type === 'shot')).toEqual([]);
    r = order(r, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'engage' }).state;
    const ev = tick(r, 30).events.filter((e) => e.type === 'shot');
    const first = ev[0]!;
    expect(first).toMatchObject({ shooter: 'u2' });
    expect(ev.some((e) => e.type === 'shot' && e.shooter === 'a1' && e.tick > first.tick)).toBe(true);
    // engage: a1 fires first at the revealed host without being shot at.
    const e = tick(order(duel(NEVER_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 10).events;
    expect(e.some((x) => x.type === 'shot' && x.shooter === 'a1')).toBe(true);
    // retaliate memory: after the host's last shot ages past retaliateMemoryTicks, a1 stops.
    let m = duel(NEVER_HIT);
    m = order(m, { type: 'stance', side: 'agency', unit: 'a1', stance: 'retaliate' }).state;
    m = patch(m, 'u2', { lastFiredTick: 10, stance: 'hold' });
    m = { ...m, tick: 61 }; // 51 ticks ago: outside memory
    expect(tick(m, 10).events.filter((x) => x.type === 'shot')).toEqual([]);
    m = { ...m, tick: 50 }; // 40 ticks ago: inside memory for the 8 aim ticks
    expect(tick(m, 10).events.some((x) => x.type === 'shot' && x.shooter === 'a1')).toBe(true);
  });

  it('STANCE-2 default stances come from the templates', () => {
    const s = game();
    expect(unit(s, 'a1').stance).toBe('engage');
    expect(unit(s, 'u2').stance).toBe('engage'); // host
    expect(unit(s, 'u9').stance).toBe('engage'); // taker
    expect(unit(s, 'u1').stance).toBe('hold'); // citizen
  });

  it('STANCE-3 eligible targets are seen, in range, on the level and enemies; citizens never', () => {
    // Out of range: pistol a2 (range 8) vs host 10 tiles away on the street, both see each other? sight 12 vs host sight 10.
    let s = only(game(1, ALWAYS_HIT), ['a2', 'u2']);
    s = place(s, 'a2', 2, 0);
    s = place(s, 'u2', 11, 0); // 9 tiles: in a2's sight 12, out of pistol range 8; out of host sight 10? 9 < 10 so host sees, host range 7: no
    s = patch(s, 'u2', { revealed: true });
    expect(tick(s, 12).events.filter((e) => e.type === 'shot')).toEqual([]);
    // In range: move the host to 8 tiles.
    s = place(s, 'u2', 10, 0);
    expect(tick(s, 12).events.some((e) => e.type === 'shot' && e.shooter === 'a2')).toBe(true);
    // Different level: never.
    let l = only(game(1, ALWAYS_HIT), ['a1', 'u5']);
    l = place(l, 'a1', 5, 4, 0);
    l = patch(l, 'u5', { revealed: true }); // u5 is at (5,4,1)
    expect(tick(l, 12).events.filter((e) => e.type === 'shot')).toEqual([]);
    // Citizens are never stance targets even for hostiles.
    let c = only(game(1, ALWAYS_HIT), ['u1', 'u2']);
    c = place(c, 'u2', 2, 0);
    c = place(c, 'u1', 4, 0);
    expect(tick(c, 12).events.filter((e) => e.type === 'shot')).toEqual([]);
  });

  it('STANCE-4 the nearest eligible target is chosen; ties go to the earliest in unit order', () => {
    let s = only(game(1, NEVER_HIT), ['a1', 'u2', 'u4', 'u6']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 6, 0);
    s = place(s, 'u4', 5, 0);
    s = place(s, 'u6', 7, 0);
    for (const id of ['u2', 'u4', 'u6']) s = patch(s, id, { revealed: true, stance: 'hold' });
    const shots = tick(s, 9).events.filter((e) => e.type === 'shot' && e.shooter === 'a1');
    expect(shots[0]).toMatchObject({ target: 'u4' });
    // Tie: u2 and u4 both at distance 3 (one north-east diagonal... keep it on a row: (5,0) and (5,1)? distance differs).
    let t = only(game(1, NEVER_HIT), ['a1', 'u2', 'u4']);
    t = place(t, 'a1', 5, 0);
    t = place(t, 'u4', 2, 0);
    t = place(t, 'u2', 8, 0);
    for (const id of ['u2', 'u4']) t = patch(t, id, { revealed: true, stance: 'hold' });
    const tie = tick(t, 9).events.filter((e) => e.type === 'shot' && e.shooter === 'a1');
    expect(tie[0]).toMatchObject({ target: 'u2' });
  });
});

describe('9. Fire (FIRE)', () => {
  it('FIRE-1 canFire needs a weapon, living units of different sides on one level, sight of the tile and range; melee needs adjacency', () => {
    let s = only(game(), ['a1', 'a2', 'u1', 'u2', 'u5', 'u9']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 5, 0);
    const a1 = unit(s, 'a1');
    expect(canFire(s, a1, unit(s, 'u2')).ok).toBe(true);
    expect(canFire(s, unit(s, 'u1'), a1)).toMatchObject({ ok: false, reason: 'no weapon' });
    expect(canFire(s, a1, unit(s, 'a2'))).toMatchObject({ ok: false, reason: 'same side' });
    expect(canFire(s, a1, unit(s, 'u5'))).toMatchObject({ ok: false, reason: 'different level' });
    s = place(s, 'u2', 15, 0); // 13 tiles: beyond sight 12
    expect(canFire(s, unit(s, 'a1'), unit(s, 'u2'))).toMatchObject({ ok: false, reason: 'not seen' });
    s = place(s, 'a2', 0, 0);
    s = place(s, 'u2', 10, 0); // 10 tiles from a2 (pistol range 8), seen
    expect(canFire(s, unit(s, 'a2'), unit(s, 'u2'))).toMatchObject({ ok: false, reason: 'out of range' });
    // Melee: taker u9 on the roof, agent adjacent diagonally vs two away.
    s = place(s, 'a1', 6, 6, 2);
    expect(canFire(s, unit(s, 'u9'), unit(s, 'a1'))).toMatchObject({ ok: true, distance: 0 });
    s = place(s, 'a1', 7, 5, 2);
    expect(canFire(s, unit(s, 'u9'), unit(s, 'a1'))).toMatchObject({ ok: false, reason: 'not adjacent' });
    const downed = patch(s, 'u2', { hp: 0, down: true });
    expect(canFire(downed, unit(downed, 'a1'), unit(downed, 'u2'))).toMatchObject({ ok: false, reason: 'target down' });
  });

  it('FIRE-2 the explicit target comes first while it can be fired at; it is dropped when the side loses sight and kept when only out of range', () => {
    // a1 (carbine, range 14) explicit target u6 far on the street while a nearer revealed host u2 is in range.
    let s = only(game(1, NEVER_HIT), ['a1', 'u2', 'u6']);
    s = place(s, 'a1', 1, 0);
    s = place(s, 'u2', 4, 0);
    s = place(s, 'u6', 12, 0);
    s = patch(s, 'u2', { revealed: true, stance: 'hold' });
    s = patch(s, 'u6', { revealed: true, stance: 'hold' });
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u6' }).state;
    expect(tick(s, 9).events.filter((e) => e.type === 'shot' && e.shooter === 'a1')[0]).toMatchObject({ target: 'u6' });
    // Out of range but seen by the side: kept, and the stance target u2 is fired at meanwhile, and the unit keeps moving.
    let p = only(game(1, NEVER_HIT), ['a2', 'u2', 'u6']);
    p = place(p, 'a2', 1, 0);
    p = place(p, 'u6', 12, 0); // 11 tiles: pistol range 8, agent sight 12
    p = patch(p, 'u6', { revealed: true, stance: 'hold' });
    p = patch(p, 'u2', { hp: 0, down: true, x: 0, y: 11 });
    p = order(p, { type: 'fire', side: 'agency', unit: 'a2', target: 'u6' }).state;
    p = order(p, { type: 'move', side: 'agency', unit: 'a2', to: pos(1, 1) }).state;
    const r = tick(p, 4);
    expect(unit(r.state, 'a2')).toMatchObject({ x: 1, y: 1, fireTarget: 'u6' });
    // Lost by the side: dropped.
    let d = only(game(1, NEVER_HIT), ['a1', 'u2']);
    d = place(d, 'a1', 3, 3);
    d = place(d, 'u2', 6, 3);
    d = patch(d, 'u2', { revealed: true, stance: 'hold' });
    d = order(d, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    d = place(d, 'u2', 10, 8); // behind walls in the hall
    expect(unit(tick(d).state, 'a1').fireTarget).toBeNull();
  });

  it('FIRE-3 aim rises per tick while ready, the shot lands at aimTicks, aim resets without a target, cooldown waits', () => {
    const s = duel(NEVER_HIT);
    const w = WEAPONS['patrol-carbine']!;
    let r = tick(order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, w.aimTicks - 1);
    expect(unit(r.state, 'a1').aimProgress).toBe(w.aimTicks - 1);
    expect(r.events.filter((e) => e.type === 'shot')).toEqual([]);
    r = tick(r.state, 1);
    expect(r.events.filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ tick: w.aimTicks - 1 });
    expect(unit(r.state, 'a1')).toMatchObject({ aimProgress: 0, readyTick: w.aimTicks - 1 + w.cooldownTicks });
    // During cooldown no aim; then the second shot lands cooldown + aimTicks later.
    const r2 = tick(r.state, w.cooldownTicks - 1);
    expect(unit(r2.state, 'a1').aimProgress).toBe(0);
    const r3 = tick(r2.state, w.aimTicks + 1);
    expect(r3.events.filter((e) => e.type === 'shot')).toHaveLength(1);
    // Reset: aim 3 ticks, then the target walks out of sight -> 0.
    let a = tick(order(duel(NEVER_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 3);
    expect(unit(a.state, 'a1').aimProgress).toBe(3);
    a = tick(place(a.state, 'u2', 10, 8), 1);
    expect(unit(a.state, 'a1').aimProgress).toBe(0);
  });

  it('FIRE-4 a resolved shot sets readyTick, lastFiredTick, resets aim, counts shotsFired and reveals a disguised shooter', () => {
    let s = only(game(1, NEVER_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 7, 0); // host fires first (aim 6) at 5 tiles; a1 holds
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    const r = tick(s, 6);
    const w = WEAPONS['pocket-pistol']!;
    expect(r.events.filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(unit(r.state, 'u2')).toMatchObject({ readyTick: 5 + w.cooldownTicks, lastFiredTick: 5, aimProgress: 0, revealed: true });
    expect(r.state.score.shotsFired).toBe(1);
    expect(r.events.some((e) => e.type === 'revealed' && e.by === 'fire')).toBe(true);
  });

  it('FIRE-5 chance = accuracy + aim - falloff * floor(distance) - moving penalty, clamped to 5..95', () => {
    const s = duel({}, 5); // distance 3, data tuning
    const a1 = unit(s, 'a1');
    const u2 = unit(s, 'u2');
    const w = weaponOf(a1)!;
    expect(hitBreakdown(game(), a1, u2, w, 3)).toEqual({ accuracy: 70, aim: 10, falloff: 6, movingPenalty: 0, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, cover: 0, coverGrade: 'none', raw: 74, chance: 74 });
    expect(hitBreakdown(game(), a1, { ...u2, moving: true }, w, 3.6)).toEqual({ accuracy: 70, aim: 10, falloff: 6, movingPenalty: 15, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, cover: 0, coverGrade: 'none', raw: 59, chance: 59 });
    expect(hitBreakdown(game(), { ...a1, aim: 100 }, u2, w, 0).chance).toBe(95);
    expect(hitBreakdown(game(), { ...a1, aim: -100 }, u2, w, 0).chance).toBe(5);
    const q = query.hitChance(s, 'a1', 'u2');
    expect(q).toMatchObject({ ok: true, chance: 74, distance: 3 });
    // Melee uses distance 0 whatever the diagonal.
    let m = only(game(), ['a1', 'u9']);
    m = place(m, 'a1', 6, 6, 2);
    expect(query.hitChance(m, 'u9', 'a1')).toMatchObject({ ok: true, distance: 0, falloff: 0, chance: 95 });
  });

  it('FIRE-6 the roll is 0..99 and hits when below the chance', () => {
    const hits = tick(order(duel(ALWAYS_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8).events.filter((e) => e.type === 'shot');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ hit: true });
    const misses = tick(order(duel(NEVER_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8).events.filter((e) => e.type === 'shot');
    expect(misses[0]).toMatchObject({ hit: false });
    for (const e of [...hits, ...misses]) {
      if (e.type !== 'shot') continue;
      expect(e.roll).toBeGreaterThanOrEqual(0);
      expect(e.roll).toBeLessThan(100);
      expect(e.hit).toBe(e.roll < e.breakdown.chance);
    }
  });

  it('FIRE-7 a miss changes no hit points', () => {
    const r = tick(order(duel(NEVER_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8);
    expect(r.events.some((e) => e.type === 'shot' && !e.hit)).toBe(true);
    expect(r.events.some((e) => e.type === 'damaged')).toBe(false);
    expect(unit(r.state, 'u2').hp).toBe(40);
  });

  it('FIRE-8 a hit applies damage', () => {
    const r = tick(order(duel(ALWAYS_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8);
    expect(r.events.some((e) => e.type === 'damaged' && e.unit === 'u2')).toBe(true);
    expect(unit(r.state, 'u2').hp).toBeLessThan(40);
  });

  it('FIRE-9 the shot event carries shooter, target, weapon, distance, moving, breakdown, roll and hit', () => {
    const r = tick(order(duel(ALWAYS_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8);
    const e = r.events.find((x) => x.type === 'shot');
    expect(e).toMatchObject({ type: 'shot', shooter: 'a1', target: 'u2', weapon: 'patrol-carbine', distance: 3, moving: false, hit: true });
    if (e && e.type === 'shot') {
      expect(Object.keys(e.breakdown).sort()).toEqual(['accuracy', 'aim', 'chance', 'cover', 'coverGrade', 'crouchBonus', 'crouchPenalty', 'falloff', 'movingPenalty', 'raw', 'runPenalty']);
      expect(typeof e.roll).toBe('number');
    }
  });
});

describe('10. Damage (DMG)', () => {
  it('DMG-1 raw damage lies in the weapon range', () => {
    let s = duel(ALWAYS_HIT);
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    s = patch(s, 'u2', { hp: 1000, maxHp: 1000 });
    const w = WEAPONS['patrol-carbine']!;
    const dmg = tick(s, 120).events.filter((e) => e.type === 'damaged');
    expect(dmg.length).toBeGreaterThan(3);
    for (const d of dmg) {
      if (d.type !== 'damaged') continue;
      expect(d.raw).toBeGreaterThanOrEqual(w.damageMin);
      expect(d.raw).toBeLessThanOrEqual(w.damageMax);
    }
  });

  it('DMG-2 damage dealt is raw minus armour, never below 0', () => {
    let s = duel(ALWAYS_HIT);
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    s = patch(s, 'u2', { armour: 7 });
    const d = tick(s, 8).events.find((e) => e.type === 'damaged');
    expect(d).toBeDefined();
    if (d && d.type === 'damaged') expect(d.dealt).toBe(d.raw - 7);
    const tank = patch(s, 'u2', { armour: 100 });
    const t = tick(tank, 8).events.find((e) => e.type === 'damaged');
    if (t && t.type === 'damaged') {
      expect(t.dealt).toBe(0);
      expect(t.hp).toBe(40);
    }
    expect(query.damageRange(s, 'a1', 'u2')).toEqual({ min: 18, max: 33 });
  });

  it('DMG-3 hp stops at 0, the unit goes down with an event and the side counter rises', () => {
    let s = duel(ALWAYS_HIT);
    s = order(s, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    s = patch(s, 'u2', { hp: 5 });
    const r = tick(s, 8);
    expect(unit(r.state, 'u2')).toMatchObject({ hp: 0, down: true });
    const types = r.events.map((e) => e.type);
    expect(types.indexOf('damaged')).toBeLessThan(types.indexOf('down'));
    expect(r.state.score.hostilesDown).toBe(1);
    expect(r.state.score.agentsDown).toBe(0);
    // Agents and citizens count in their own columns.
    let c = only(game(1, ALWAYS_HIT), ['a1', 'u1']);
    c = place(c, 'a1', 2, 0);
    c = place(c, 'u1', 4, 0);
    c = patch(c, 'u1', { hp: 1 });
    c = order(c, { type: 'fire', side: 'agency', unit: 'a1', target: 'u1' }).state;
    expect(tick(c, 8).state.score.civiliansDown).toBe(1);
  });

  it('DMG-4 every hit emits damaged and counts hits', () => {
    const r = tick(order(duel(ALWAYS_HIT), { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state, 8);
    const d = r.events.find((e) => e.type === 'damaged');
    expect(d).toMatchObject({ type: 'damaged', unit: 'u2', armour: 0 });
    if (d && d.type === 'damaged') expect(d.hp).toBe(40 - d.dealt);
    expect(r.state.score.hits).toBe(1);
    expect(r.state.score.shotsFired).toBe(1);
  });
});

describe('11. Citizens (CIV)', () => {
  it('CIV-1 citizens never move, fire or take orders', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u1']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u1', 4, 0);
    const r = tick(s, 30);
    expect(unit(r.state, 'u1')).toMatchObject({ x: 4, y: 0, weapon: null });
    expect(r.events.filter((e) => e.type === 'shot' || e.type === 'moved')).toEqual([]);
  });

  it('CIV-2 a citizen blocks movement and does not block sight', () => {
    let s = only(game(), ['a1', 'u1', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u1', 3, 0);
    s = place(s, 'u2', 4, 0);
    expect(query.hitChance(s, 'a1', 'u2').ok).toBe(true);
    expect(query.reachable(s, 'a1').some((p) => p.x === 3 && p.y === 0 && p.level === 0)).toBe(false);
  });

  it('CIV-3 civilianHits counts hits on apparent citizens (real ones and unrevealed hosts); civiliansDown counts real citizens only', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u1', 'u2']);
    s = place(s, 'a1', 2, 0);
    s = place(s, 'u2', 7, 0); // unrevealed host, 5 tiles
    s = place(s, 'u1', 6, 0); // citizen
    s = patch(s, 'u2', { stance: 'hold' });
    s = patch(s, 'u1', { hp: 1 });
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    let r = tick(s, 8);
    expect(r.state.score).toMatchObject({ civilianHits: 1, civiliansDown: 0, hits: 1 });
    expect(unit(r.state, 'u2').revealed).toBe(false);
    r = tick(order(r.state, { type: 'fire', side: 'agency', unit: 'a1', target: 'u1' }).state, 20);
    expect(r.state.score.civiliansDown).toBe(1);
    expect(r.state.score.civilianHits).toBe(2);
    // A revealed host hit is not a civilian hit.
    let v = duel(ALWAYS_HIT);
    v = order(v, { type: 'stance', side: 'hostile', unit: 'u2', stance: 'hold' }).state;
    expect(tick(v, 8).state.score.civilianHits).toBe(0);
  });
});
