import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame, hashState, legalActions, query, replay, step, view, SIDES } from '../src/engine';
import { TUNING } from '../src/data';
import { ALWAYS_HIT, SETUP, clone, expectReject, game, only, order, place, tick, unit } from './helpers';

describe('0. Engine contract (ARCH)', () => {
  it('ARCH-1 createGame builds the battle from its file and stores merged tuning', () => {
    const s = createGame({ battleId: 'first-raid', seed: 5, tuning: { sight: { revealRange: 9 } } });
    expect(s.units.filter((u) => u.side === 'agency')).toHaveLength(6);
    expect(s.units).toHaveLength(15);
    expect(s.tuning.sight.revealRange).toBe(9);
    expect(s.tuning.time.ticksPerSecond).toBe(TUNING.time.ticksPerSecond);
    expect(s.seed).toBe(5);
    expect(() => createGame({ battleId: 'nope', seed: 1 })).toThrow();
  });

  it('ARCH-2 step is pure: input untouched, rejections return the same object with a reason, bad input never throws', () => {
    const s = game();
    const before = JSON.stringify(s);
    const r = step(s, { type: 'tick' });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
    const bad = step(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 2, y: 2, level: 0 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.state).toBe(s);
      expect(bad.reason).toMatch(/impassable/);
    }
    expect(() => step(s, null as unknown as never)).not.toThrow();
    expect(() => step(s, { type: 'nonsense' } as unknown as never)).not.toThrow();
    expect(step(s, { type: 'nonsense' } as unknown as never).ok).toBe(false);
  });

  it('ARCH-3 legalActions always contains tick for every side, before and after the end', () => {
    let s = game();
    for (const side of SIDES) expect(legalActions(s, side)[0]).toEqual({ type: 'tick' });
    s = order(s, { type: 'withdraw', side: 'agency' }).state;
    for (const side of SIDES) expect(legalActions(s, side)).toEqual([{ type: 'tick' }]);
  });

  it('ARCH-4 query gives the same hit chance the shot event uses', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 6, 3);
    const q = query.hitChance(s, 'a1', 'u2');
    expect(q.ok).toBe(true);
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    const { events } = tick(s, 10);
    const shot = events.find((e) => e.type === 'shot' && e.shooter === 'a1');
    expect(shot && shot.type === 'shot' && q.ok && shot.breakdown.chance).toBe(q.ok ? q.chance : -1);
  });

  it('ARCH-5 view hides an enemy the side cannot see', () => {
    const s = game();
    const ids = view(s, 'agency').units.map((u) => u.id);
    expect(ids).toContain('a1');
    expect(ids).not.toContain('u9'); // the roof
  });

  it('ARCH-6 state is plain JSON after play', () => {
    let s = game();
    s = order(s, { type: 'move', side: 'agency', unit: 'a3', to: { x: 6, y: 8, level: 0 } }).state;
    s = tick(s, 40).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('ARCH-7 same seed and actions give the same hash; a different seed differs', () => {
    const play = (seed: number) => {
      let s = only(game(seed, { fire: { minHitChance: 50, maxHitChance: 50, movingTargetPenalty: 15, retaliateMemoryTicks: 50 } }), ['a1', 'u2']);
      s = place(s, 'a1', 3, 3);
      s = place(s, 'u2', 6, 3);
      s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
      return tick(s, 60).state;
    };
    expect(hashState(play(3))).toBe(hashState(play(3)));
    expect(hashState(play(3))).not.toBe(hashState(play(4)));
    expect(game(3).rng).toHaveLength(4);
  });

  it('ARCH-8 every roll emits an event with its breakdown and the roll', () => {
    let s = only(game(1, ALWAYS_HIT), ['a1', 'u2']);
    s = place(s, 'a1', 3, 3);
    s = place(s, 'u2', 5, 3);
    s = order(s, { type: 'fire', side: 'agency', unit: 'a1', target: 'u2' }).state;
    const { events } = tick(s, 8);
    const shot = events.find((e) => e.type === 'shot' && e.shooter === 'a1');
    expect(shot).toBeDefined();
    if (shot && shot.type === 'shot') {
      expect(shot.breakdown).toMatchObject({ accuracy: 70, aim: 10 });
      expect(shot.roll).toBeGreaterThanOrEqual(0);
      expect(shot.roll).toBeLessThan(100);
      expect(events.some((e) => e.type === 'damaged')).toBe(true);
    }
  });

  it('ARCH-9 the log merges ticks and replays to the same hash', () => {
    let s = game();
    s = tick(s, 3).state;
    s = order(s, { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' }).state;
    s = tick(s, 2).state;
    expect(s.log).toEqual([
      { type: 'tick', count: 3 },
      { type: 'stance', side: 'agency', unit: 'a1', stance: 'hold' },
      { type: 'tick', count: 2 },
    ]);
    expect(hashState(replay(SETUP, s.log))).toBe(hashState(s));
    expect(hashState(s)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('ARCH-10 nothing under src/engine imports the DOM, three.js or React', () => {
    const dir = new URL('../src/engine/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      expect(text, f).not.toMatch(/from '(react|three|@react-three|zustand)/);
      expect(text, f).not.toMatch(/\b(document|window|requestAnimationFrame|performance\.now|Date\.now)\b/);
      for (const m of text.matchAll(/from '([^']+)'/g)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^\.\.?\//);
    }
  });

  it('ARCH-2 a clone of the input is not shared with the output', () => {
    const s = game();
    const r = step(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 11, level: 0 } });
    expect(r.ok).toBe(true);
    const c = clone(s);
    expect(unit(s, 'a1').order).toBeNull();
    expect(unit(r.state, 'a1').order).not.toBeNull();
    expect(c).toEqual(s);
    expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 10, level: 0 } });
  });
});
