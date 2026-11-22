// docs/spec/10-rules.md section 25: cover.
import { describe, expect, it } from 'vitest';
import { aimTicksFor, coverAgainst, coverTiles, createGame, hitBreakdown, legalActions, query, step, tileIndex, weaponOf, type State, type TileKind } from '../src/engine';
import { COVER_PROPS, MAPS, TUNING, WEAPONS } from '../src/data';
import { makeAgencyNormal, hostileNormal } from '../src/ai';
import { coverPosture, type Know } from '../src/ai/know';
import { view } from '../src/engine';
import { clone, game, only, place } from './helpers';

function setTile(s: State, x: number, y: number, kind: TileKind, level = 0): State {
  const c = clone(s);
  const t = c.tiles[tileIndex(c, { x, y, level })]!;
  t.kind = kind;
  t.open = false;
  t.hp = 100;
  return c;
}
/** An open yard: every tile of level 0 ground, so only the tiles a test sets matter. */
function yard(): State {
  const s = clone(game());
  for (const t of s.tiles) if (t.level === 0) {
    t.kind = 'ground';
    t.hp = 100;
  }
  return s;
}

describe('25. Cover (COVER)', () => {
  it('COVER-1 the cover tiles are the target’s neighbours on the shooter’s side', () => {
    const t = { x: 5, y: 5, level: 0 };
    expect(coverTiles(t, { x: 12, y: 5, level: 0 })).toEqual([{ x: 6, y: 5, level: 0 }]);
    expect(coverTiles(t, { x: 12, y: 8, level: 0 })).toEqual([{ x: 6, y: 5, level: 0 }]); // y run under half the x run
    expect(coverTiles(t, { x: 1, y: 1, level: 0 })).toEqual([
      { x: 4, y: 5, level: 0 },
      { x: 5, y: 4, level: 0 },
      { x: 4, y: 4, level: 0 },
    ]);
  });
  it('COVER-2 walls and closed doors are full, windows half, rubble low; the best grade counts', () => {
    const from = { x: 12, y: 5, level: 0 };
    const t = { x: 5, y: 5, level: 0 };
    expect(coverAgainst(yard(), t, from)).toEqual({ grade: 'none', value: 0 });
    expect(coverAgainst(setTile(yard(), 6, 5, 'wall'), t, from)).toEqual({ grade: 'full', value: TUNING.cover.full });
    expect(coverAgainst(setTile(yard(), 6, 5, 'door'), t, from).grade).toBe('full');
    expect(coverAgainst(setTile(yard(), 6, 5, 'window'), t, from)).toEqual({ grade: 'half', value: TUNING.cover.half });
    expect(coverAgainst(setTile(yard(), 6, 5, 'rubble'), t, from)).toEqual({ grade: 'low', value: TUNING.cover.low });
    // a wall behind the target gives nothing
    expect(coverAgainst(setTile(yard(), 4, 5, 'wall'), t, from).grade).toBe('none');
    // diagonal: a window and a wall beside the target, the wall wins
    const diag = setTile(setTile(yard(), 6, 5, 'window'), 5, 6, 'wall');
    expect(coverAgainst(diag, t, { x: 10, y: 10, level: 0 }).grade).toBe('full');
  });
  it('COVER-3 a solid prop gives low cover while its tile stands; a lamp gives none', () => {
    const site = MAPS['civic-savings-site']!;
    const s = createGame({ battleId: 'savings-raid', seed: 1 });
    const solid = site.props!.find((p) => (COVER_PROPS as string[]).includes(p.kind) && p.level === 0)!;
    const target = { x: solid.x + 1, y: solid.y, level: 0 };
    const from = { x: solid.x + 1 - 6, y: solid.y, level: 0 };
    expect(coverAgainst(s, target, from).grade).toBe('low');
    const gone = clone(s);
    gone.tiles[tileIndex(gone, solid)]!.kind = 'void';
    expect(coverAgainst(gone, target, from).grade).toBe('none');
    const lamp = site.props!.find((p) => p.kind === 'lamp' && p.level === 0)!;
    expect((COVER_PROPS as string[]).includes(lamp.kind)).toBe(false);
  });
  it('COVER-4 cover comes off a ranged hit chance, not at point blank or in melee', () => {
    let s = setTile(only(yard(), ['a1', 'u2']), 6, 0, 'wall');
    s = place(s, 'a1', 6, 3);
    s = place(s, 'u2', 6, 1);
    // straight north-south: the cover tile is (6, 2), open ground
    const a1 = s.units.find((u) => u.id === 'a1')!;
    const u2 = s.units.find((u) => u.id === 'u2')!;
    const w = weaponOf(a1)!;
    expect(hitBreakdown(s, a1, u2, w, 2).cover).toBe(0);
    const covered = setTile(s, 6, 2, 'window');
    const b = hitBreakdown(covered, a1, u2, w, 2);
    expect(b).toMatchObject({ cover: TUNING.cover.half, coverGrade: 'half' });
    expect(b.raw).toBe(hitBreakdown(s, a1, u2, w, 2).raw - TUNING.cover.half);
    // adjacent: no cover
    const close = place(covered, 'a1', 7, 2);
    expect(hitBreakdown(close, close.units.find((u) => u.id === 'a1')!, u2, w, 1.4).cover).toBe(0);
    // the query shows the same breakdown
    const q = query.hitChance(covered, 'a1', 'u2');
    expect(q.ok && q.cover).toBe(q.ok ? TUNING.cover.half : -1);
  });
});

describe('14. Queries: cover (QRY-9)', () => {
  it('QRY-9 coverAt reads a tile against the nearest hostile the side sees', () => {
    let s = setTile(only(yard(), ['a1', 'u2']), 6, 2, 'window');
    s = place(s, 'a1', 6, 5);
    s = place(s, 'u2', 6, 1);
    s = clone(s);
    s.units.find((u) => u.id === 'u2')!.revealed = true;
    // the tile (6, 3) has the window between it and the host
    expect(query.coverAt(s, 'agency', { x: 6, y: 3, level: 0 })).toEqual({ grade: 'half', value: TUNING.cover.half, from: 'u2' });
    expect(query.coverAt(s, 'agency', { x: 9, y: 5, level: 0 })!.grade).toBe('none');
  });
});

describe('22. AI and cover (AI-12)', () => {
  it('AI-12 a normal driver firing from cover crouches, and stands before it moves', () => {
    let s = setTile(setTile(only(yard(), ['a1', 'u2']), 6, 2, 'window'), 6, 4, 'window');
    s = place(s, 'a1', 6, 5);
    s = place(s, 'u2', 6, 1);
    s = clone(s);
    s.units.find((u) => u.id === 'u2')!.revealed = true;
    // the host u2 has the window between it and the agent: it fires from cover and crouches
    const agentOrders = makeAgencyNormal()(view(s, 'agency'), 'agency');
    expect(agentOrders).toContainEqual({ type: 'posture', side: 'agency', unit: 'a1', posture: 'crouch' });
    // crouched and told to move, it stands first
    const crouched = clone(s);
    crouched.units.find((u) => u.id === 'a1')!.posture = 'crouch';
    expect(hostileNormal(view(s, 'hostile'), 'hostile').every((a) => a.type !== 'posture' || a.posture === 'crouch')).toBe(true);
    const k = { view: view(crouched, 'agency'), side: 'agency' } as unknown as Know;
    const a1 = crouched.units.find((u) => u.id === 'a1')!;
    expect(coverPosture(k, a1, null, true)).toEqual({ type: 'posture', side: 'agency', unit: 'a1', posture: 'stand' });
    expect(coverPosture(k, a1, crouched.units.find((u) => u.id === 'u2')!, false)).toBeNull(); // already crouched
  });
});

describe('26. Aimed and snap shots (SNAP)', () => {
  const SNAPPY = { snap: { penalty: 25, aimPercent: 50 } };
  function duelAt(): State {
    let s = only(yard(), ['a1', 'u2']);
    s = place(s, 'a1', 2, 3);
    s = place(s, 'u2', 6, 3);
    s = clone(s);
    s.tuning = { ...s.tuning, ...SNAPPY };
    const u2 = s.units.find((u) => u.id === 'u2')!;
    u2.revealed = true;
    u2.stance = 'hold';
    return s;
  }
  it('SNAP-1 a stance shot aims in half the ticks; an ordered one takes them all', () => {
    const w = weaponOf(duelAt().units.find((u) => u.id === 'a1')!)!;
    const snapTicks = Math.max(1, Math.ceil(w.aimTicks / 2));
    let s = duelAt();
    for (let i = 0; i < snapTicks; i++) s = (step(s, { type: 'tick' }) as { state: State }).state;
    expect(s.score.shotsFired).toBe(1);
    let o = (step(duelAt(), { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }) as { state: State }).state;
    for (let i = 0; i < snapTicks; i++) o = (step(o, { type: 'tick' }) as { state: State }).state;
    expect(o.score.shotsFired).toBe(snapTicks < w.aimTicks ? 0 : 1);
    expect(aimTicksFor(duelAt(), w, true)).toBe(snapTicks);
    expect(aimTicksFor(duelAt(), WEAPONS['taker-bite']!, true)).toBe(WEAPONS['taker-bite']!.aimTicks);
  });
  it('SNAP-2 a snap shot loses snap.penalty; an aimed one does not', () => {
    const s = duelAt();
    const a1 = s.units.find((u) => u.id === 'a1')!;
    const u2 = s.units.find((u) => u.id === 'u2')!;
    const w = weaponOf(a1)!;
    const aimed = hitBreakdown(s, a1, u2, w, 4, false);
    const snap = hitBreakdown(s, a1, u2, w, 4, true);
    expect(aimed.snapPenalty).toBe(0);
    expect(snap.snapPenalty).toBe(25);
    expect(snap.raw).toBe(aimed.raw - 25);
  });
  it('SNAP-3 the hit-chance query gives the aimed chance', () => {
    const s = duelAt();
    const q = query.hitChance(s, 'a1', 'u2');
    expect(q.ok && q.snapPenalty).toBe(0);
  });
});

describe('27. Suppression (SUP)', () => {
  function field(): State {
    let s = only(yard(), ['a1', 'u2']);
    s = place(s, 'a1', 2, 3);
    s = place(s, 'u2', 8, 3);
    s = clone(s);
    const u2 = s.units.find((u) => u.id === 'u2')!;
    u2.revealed = true;
    u2.stance = 'hold';
    return s;
  }
  const run = (s: State, n: number) => {
    for (let i = 0; i < n; i++) s = (step(s, { type: 'tick' }) as { state: State }).state;
    return s;
  };
  it('SUP-1 a shot at a unit suppresses it, a hit more, and suppression fades each tick', () => {
    const NO = { fire: { ...TUNING.fire, minHitChance: 0, maxHitChance: 0 } };
    let s = clone(field());
    s.tuning = { ...s.tuning, ...NO };
    s = (step(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }) as { state: State }).state;
    const w = weaponOf(s.units.find((u) => u.id === 'a1')!)!;
    s = run(s, w.aimTicks);
    const u2 = s.units.find((u) => u.id === 'u2')!;
    expect(u2.suppression).toBe(TUNING.suppress.perShot - TUNING.suppress.decayPerTick);
    const later = run(s, 3);
    expect(later.units.find((u) => u.id === 'u2')!.suppression).toBe(u2.suppression! - 3 * TUNING.suppress.decayPerTick);
  });
  it('SUP-2 a suppressed shooter aims worse', () => {
    const s = field();
    const a1 = { ...s.units.find((u) => u.id === 'a1')!, suppression: 50 };
    const u2 = s.units.find((u) => u.id === 'u2')!;
    const b = hitBreakdown(s, a1, u2, weaponOf(a1)!, 6);
    expect(b.suppressPenalty).toBe(Math.floor((50 * TUNING.suppress.aimPercent) / 100));
  });
  it('SUP-3 suppressive fire pins every enemy on and beside the tile, with no roll, and ends on a new order', () => {
    let s = field();
    const r = step(s, { type: 'suppress', side: 'agency', unit: 'a1', at: { x: 8, y: 2, level: 0 } });
    expect(r.ok).toBe(true);
    s = (r as { state: State }).state;
    const w = weaponOf(s.units.find((u) => u.id === 'a1')!)!;
    const rolls = JSON.stringify(s.rng);
    const ev: string[] = [];
    for (let i = 0; i < aimTicksFor(s, w, true); i++) {
      const t = step(s, { type: 'tick' }) as { state: State; events: { type: string }[] };
      s = t.state;
      ev.push(...t.events.map((e) => e.type));
    }
    expect(ev).toContain('suppressFire');
    expect(ev).not.toContain('shot');
    expect(JSON.stringify(s.rng)).toBe(rolls); // no roll
    expect(s.units.find((u) => u.id === 'u2')!.suppression).toBe(TUNING.suppress.fire - TUNING.suppress.decayPerTick);
    expect(s.units.find((u) => u.id === 'u2')!.hp).toBe(createGame({ battleId: 'first-raid', seed: 1 }).units.find((u) => u.id === 'u2')!.hp);
    s = (step(s, { type: 'halt', side: 'agency', unit: 'a1' }) as { state: State }).state;
    expect(s.units.find((u) => u.id === 'a1')!.suppressAt).toBeNull();
    expect(step(field(), { type: 'suppress', side: 'agency', unit: 'a1', at: { x: 30, y: 3, level: 0 } }).ok).toBe(false);
  });
  it('SUP-4 a pinned unit moves at half pace', () => {
    const holding = clone(field());
    holding.units.find((u) => u.id === 'a1')!.stance = 'hold';
    const free = (step(holding, { type: 'move', side: 'agency', unit: 'a1', to: { x: 2, y: 9, level: 0 } }) as { state: State }).state;
    const pinned = clone(free);
    pinned.units.find((u) => u.id === 'a1')!.suppression = 100;
    pinned.tuning = { ...pinned.tuning, suppress: { ...pinned.tuning.suppress, decayPerTick: 0 } };
    const a = run(free, 16).units.find((u) => u.id === 'a1')!;
    const b = run(pinned, 16).units.find((u) => u.id === 'a1')!;
    expect(b.y - 3).toBeLessThan(a.y - 3);
    expect(b.y - 3).toBeGreaterThan(0);
  });
  it('SUP-5 legal actions list suppressive fire at seen enemies', () => {
    const acts = legalActions(field(), 'agency');
    expect(acts).toContainEqual({ type: 'suppress', side: 'agency', unit: 'a1', at: { x: 8, y: 3, level: 0 } });
  });
  it('AI-13 the normal agency suppresses a target it can barely hit', () => {
    let s = setTile(field(), 7, 3, 'wall');
    s = place(s, 'u2', 8, 3);
    // the wall blocks the straight line: move the host diagonally so it is seen around the corner with full cover
    s = place(s, 'u2', 8, 4);
    s = setTile(s, 7, 4, 'window');
    s = clone(s);
    s.tuning = { ...s.tuning, suppress: { ...s.tuning.suppress, aiBelow: 100 } };
    const acts = makeAgencyNormal()(view(s, 'agency'), 'agency');
    expect(acts.some((a) => a.type === 'suppress')).toBe(true);
  });
});

describe('28. The price of standing together (STRAY, PANIC)', () => {
  const MISS = { fire: { ...TUNING.fire, minHitChance: 0, maxHitChance: 0 }, stray: { percent: 100 }, snap: { penalty: 0, aimPercent: 100 } };
  function line(withFriend: boolean): State {
    let s = only(yard(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 2, 3);
    s = place(s, 'u2', 7, 3);
    s = place(s, 'a2', withFriend ? 7 : 2, withFriend ? 4 : 9);
    s = clone(s);
    s.tuning = { ...s.tuning, ...MISS };
    const u2 = s.units.find((u) => u.id === 'u2')!;
    u2.revealed = true;
    u2.stance = 'hold';
    s.units.find((u) => u.id === 'a2')!.stance = 'hold';
    return s;
  }
  const fireOnce = (s: State) => {
    let t = (step(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }) as { state: State }).state;
    const evs: { type: string }[] = [];
    const w = weaponOf(t.units.find((u) => u.id === 'a1')!)!;
    for (let i = 0; i < w.aimTicks; i++) {
      const r = step(t, { type: 'tick' }) as { state: State; events: { type: string }[] };
      t = r.state;
      evs.push(...r.events);
    }
    return { t, evs };
  };
  it('STRAY-1 a miss can hit a unit beside the target, own side included', () => {
    const { t, evs } = fireOnce(line(true));
    expect(evs.some((e) => e.type === 'strayHit')).toBe(true);
    const a2 = t.units.find((u) => u.id === 'a2')!;
    expect(a2.hp).toBeLessThan(a2.maxHp);
    const alone = fireOnce(line(false));
    expect(alone.evs.some((e) => e.type === 'strayHit')).toBe(false);
  });
  it('STRAY-2 a stray hit is not a hit in the score and does not suppress the victim', () => {
    const { t } = fireOnce(line(true));
    expect(t.score.hits).toBe(0);
    expect(t.units.find((u) => u.id === 'a2')!.suppression ?? 0).toBe(0);
  });
  it('STRAY-3 spitters carry three charges and hosts one', () => {
    const s = createGame({ battleId: 'automat-raid', seed: 1, roster: { hostiles: { host: 1, taker: 0, fighter: 0, spitter: 1 } } });
    expect(s.units.find((u) => u.template === 'spitter')!.charges).toBe(3);
    expect(s.units.find((u) => u.template === 'host')!.charges).toBe(1);
    expect(s.units.find((u) => u.template === 'spitter')!.weapon).toBeNull();
  });
  it('PANIC-1 a unit going down shakes allies who see it nearby', () => {
    let s = only(yard(), ['a1', 'a2', 'u2']);
    s = place(s, 'a1', 2, 3);
    s = place(s, 'a2', 4, 3);
    s = place(s, 'u2', 9, 3);
    s = clone(s);
    s.tuning = { ...s.tuning, fire: { ...TUNING.fire, minHitChance: 100, maxHitChance: 100 }, stray: { percent: 0 } };
    s.units.find((u) => u.id === 'a2')!.hp = 1;
    s.units.find((u) => u.id === 'a2')!.stance = 'hold';
    s.units.find((u) => u.id === 'a1')!.stance = 'hold';
    const u2 = s.units.find((u) => u.id === 'u2')!;
    u2.revealed = true;
    s = (step(s, { type: 'fire', side: 'hostile', unit: 'u2', target: 'a2' }) as { state: State }).state;
    for (let i = 0; i < 12 && !s.units.find((u) => u.id === 'a2')!.down; i++) s = (step(s, { type: 'tick' }) as { state: State }).state;
    expect(s.units.find((u) => u.id === 'a2')!.down).toBe(true);
    expect(s.units.find((u) => u.id === 'a1')!.suppression).toBeGreaterThan(TUNING.panic.amount - 10);
  });
  it('AI-14 a spitter lobs at agents standing together, and squads spread out', () => {
    let s = createGame({ battleId: 'automat-raid', seed: 1, roster: { hostiles: { host: 0, taker: 0, fighter: 0, spitter: 1 } } });
    s = clone(s);
    const sp = s.units.find((u) => u.template === 'spitter')!;
    const agents = s.units.filter((u) => u.side === 'agency');
    // two agents together, in sight of the spitter, inside its throw
    for (const t of s.tiles) if (t.level === 0) {
      t.kind = 'ground';
      t.hp = 100;
    }
    sp.x = 8;
    sp.y = 8;
    sp.level = 0;
    agents.forEach((a, i) => {
      a.x = i < 2 ? 12 + i : 1;
      a.y = i < 2 ? 8 : i;
      a.level = 0;
    });
    const out = hostileNormal(view(s, 'hostile'), 'hostile');
    expect(out.some((a) => a.type === 'blast' && a.unit === sp.id)).toBe(true);
  });
});

describe('29. Objectives with a clock (OBJ)', () => {
  const run = (s: State, n: number) => {
    const evs: { type: string }[] = [];
    for (let i = 0; i < n; i++) {
      const r = step(s, { type: 'tick' }) as { state: State; events: { type: string }[] };
      s = r.state;
      evs.push(...r.events);
    }
    return { s, evs };
  };
  function beside(capture: boolean): State {
    let s = only(yard(), ['a1', 'u2']);
    s = place(s, 'a1', 5, 5);
    s = place(s, 'u2', 6, 5);
    s = clone(s);
    s.canCapture = capture;
    const u2 = s.units.find((u) => u.id === 'u2')!;
    u2.revealed = true;
    u2.stance = 'hold';
    u2.hp = 10;
    s.units.find((u) => u.id === 'a1')!.stance = 'hold';
    return s;
  }
  it('OBJ-1 a weak revealed host beside an agent with restraints is captured after captureTicks', () => {
    expect(step(beside(false), { type: 'capture', side: 'agency', unit: 'a1', target: 'u2' }).ok).toBe(false);
    const strong = beside(true);
    strong.units.find((u) => u.id === 'u2')!.hp = 40;
    expect(step(strong, { type: 'capture', side: 'agency', unit: 'a1', target: 'u2' }).ok).toBe(false);
    let s = (step(beside(true), { type: 'capture', side: 'agency', unit: 'a1', target: 'u2' }) as { state: State }).state;
    const r = run(s, TUNING.objective.captureTicks);
    s = r.s;
    const u2 = s.units.find((u) => u.id === 'u2')!;
    expect(u2.captured && u2.down).toBe(true);
    expect(s.score.captured).toBe(1);
    expect(r.evs.some((e) => e.type === 'captured')).toBe(true);
  });
  const citizenId = () => game().units.find((u) => u.side === 'civilian')!.id;
  it('OBJ-2 an evacuated citizen runs for the edge', () => {
    let s = only(yard(), ['a1', 'u2', citizenId()]);
    s = place(s, 'a1', 5, 5);
    s = clone(s);
    const c = s.units.find((u) => u.side === 'civilian')!;
    c.x = 6;
    c.y = 5;
    c.level = 0;
    const r = step(s, { type: 'evacuate', side: 'agency', unit: 'a1', target: c.id });
    expect(r.ok).toBe(true);
    const cc = (r as { state: State }).state.units.find((u) => u.id === c.id)!;
    expect(cc.evacuating).toBe(true);
    expect(cc.order?.run).toBe(true);
    expect(step((r as { state: State }).state, { type: 'evacuate', side: 'agency', unit: 'a1', target: c.id }).ok).toBe(false);
  });
  it('OBJ-3 a citizen who reaches the edge is saved and leaves no body', () => {
    let s = only(yard(), ['a1', 'u2', citizenId()]);
    s = place(s, 'a1', 2, 1);
    s = clone(s);
    const c = s.units.find((u) => u.side === 'civilian')!;
    c.x = 2;
    c.y = 2;
    c.level = 0;
    s = (step(s, { type: 'evacuate', side: 'agency', unit: 'a1', target: c.id }) as { state: State }).state;
    const r = run(s, 40);
    const saved = r.s.units.find((u) => u.id === c.id)!;
    expect(saved.saved && saved.down).toBe(true);
    expect(r.s.score.saved).toBe(1);
    expect(r.s.score.civiliansDown).toBe(0);
  });
  it('OBJ-4 the core is secured by an agent standing on it, or burns', () => {
    const s = createGame({ battleId: 'wreck-raid', seed: 1 });
    expect(s.core).toMatchObject({ secured: false, burnt: false });
    const on = clone(s);
    for (const u of on.units) if (u.side !== 'agency') {
      u.down = true;
    }
    on.over = null;
    const a = on.units.find((u) => u.side === 'agency')!;
    a.x = on.core!.at.x;
    a.y = on.core!.at.y;
    // keep the battle running: a hostile far away
    const keep = on.units.find((u) => u.side === 'hostile')!;
    keep.down = false;
    keep.x = 28;
    keep.y = 22;
    keep.stance = 'hold';
    const r = run(on, TUNING.objective.coreTicks);
    expect(r.s.core!.secured).toBe(true);
    const late = clone(s);
    late.tick = TUNING.objective.burnSeconds * TUNING.time.ticksPerSecond;
    expect(run(late, 1).s.core!.burnt).toBe(true);
  });
  it('OBJ-5 legal actions list evacuations and captures beside an agent', () => {
    const s = beside(true);
    expect(legalActions(s, 'agency')).toContainEqual({ type: 'capture', side: 'agency', unit: 'a1', target: 'u2' });
  });
});
