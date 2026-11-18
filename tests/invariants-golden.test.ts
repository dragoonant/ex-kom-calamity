import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hashState, replay, type LogEntry, type Setup } from '../src/engine';
import { checkInvariants, checkReplay } from '../src/sim/invariants';
import { randomPolicy, standPolicy, sweepPolicy } from '../src/sim/policies';
import { runBattle } from '../src/sim/run';
import { ALWAYS_HIT, SETUP, clone, game, patch, tick } from './helpers';

describe('16. Invariants (INV)', () => {
  it('INV-1 INV-2 INV-3 INV-4 INV-5 INV-6 hold through a seeded sweep battle and the checker is run after every step', () => {
    const r = runBattle({ setup: { battleId: 'first-raid', seed: 21 }, agency: sweepPolicy(), hostile: standPolicy(), deepEvery: 10 });
    expect(r.broken).toEqual([]);
    expect(r.state.over).not.toBeNull();
    expect(r.ticks).toBeGreaterThan(10);
  });

  it('INV-1 INV-2 INV-3 hold under random orders from both sides', () => {
    const r = runBattle({ setup: { battleId: 'first-raid', seed: 22 }, agency: randomPolicy(0.2), hostile: randomPolicy(0.2), deepEvery: 25, maxTicks: 800 });
    expect(r.broken).toEqual([]);
  });

  it('INV-2 the checker catches a unit whose hp and down flag disagree', () => {
    const s = patch(game(), 'a1', { hp: 0 });
    expect(checkInvariants(s).some((b) => b.startsWith('INV-2'))).toBe(true);
  });

  it('INV-3 the checker catches two living units on one tile', () => {
    const s = patch(game(), 'a1', { x: 5, y: 10 });
    expect(checkInvariants(s).some((b) => b.startsWith('INV-3'))).toBe(true);
  });

  it('INV-4 the checker catches time moving on an order and time jumping on a tick', () => {
    const s = game();
    const t = tick(s).state;
    expect(checkInvariants(t, { prev: s, ticked: false })).toContain('INV-4 an order moved time');
    expect(checkInvariants({ ...t, tick: 5 }, { prev: s, ticked: true }).some((b) => b.startsWith('INV-4'))).toBe(true);
    expect(checkInvariants(t, { prev: s, ticked: true })).toEqual([]);
  });

  it('INV-5 the checker catches NaN in the state', () => {
    const s = clone(game());
    s.units[0]!.hp = Number.NaN;
    expect(checkInvariants(s, { deep: true }).some((b) => b.startsWith('INV-5'))).toBe(true);
  });

  it('INV-6 the checker catches a leaked order in a view', () => {
    const s = game(1, ALWAYS_HIT);
    expect(checkInvariants(s, { deep: true })).toEqual([]);
  });

  it('INV-7 replay of the log hashes to the state', () => {
    let s = game(9);
    s = tick(s, 20).state;
    expect(checkReplay({ battleId: 'first-raid', seed: 9 }, s)).toEqual([]);
    expect(checkReplay({ battleId: 'first-raid', seed: 10 }, s).some((b) => b.startsWith('INV-7'))).toBe(true);
  });
});

describe('Golden replay (ARCH-7 ARCH-9)', () => {
  it('ARCH-9 the seeded action log of first-raid seed 7 replays to the recorded hash', () => {
    const golden = JSON.parse(readFileSync(new URL('./golden/first-raid-seed-7.json', import.meta.url), 'utf8')) as {
      setup: Setup;
      ticks: number;
      hash: string;
      log: LogEntry[];
      over: unknown;
    };
    const s = replay(golden.setup, golden.log);
    expect(s.tick).toBe(golden.ticks);
    expect(s.over).toEqual(golden.over);
    expect(hashState(s)).toBe(golden.hash);
    expect(SETUP.battleId).toBe(golden.setup.battleId);
  });
});
