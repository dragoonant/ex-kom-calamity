// docs/spec/10-rules.md section 25: cover.
import { describe, expect, it } from 'vitest';
import { coverAgainst, coverTiles, createGame, hitBreakdown, query, tileIndex, weaponOf, type State, type TileKind } from '../src/engine';
import { COVER_PROPS, MAPS, TUNING } from '../src/data';
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
