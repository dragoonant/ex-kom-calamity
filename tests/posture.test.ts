// Section 24 (POSE), M4c: crouching and running as rules (PLAN.md D21 c).
import { describe, expect, it } from 'vitest';
import { hitBreakdown, legalActions, stepCost, view, weaponOf, type State } from '../src/engine';
import { TUNING, WEAPONS } from '../src/data';
import { expectReject, game, only, order, patch, place, pos, tick, unit } from './helpers';

/** a1 (carbine, aim 10) at (2,0) and a revealed host u2 at (5,0), on the street. */
function duel(): State {
  let s = only(game(1), ['a1', 'u2']);
  s = place(s, 'a1', 2, 0);
  s = place(s, 'u2', 5, 0);
  return patch(s, 'u2', { revealed: true });
}

describe('24. Posture and pace (POSE)', () => {
  it('POSE-1 every unit starts standing and never having run; a pre-M4c unit with neither field reads the same', () => {
    const s = game();
    for (const u of s.units) expect([u.posture, u.lastRunTick]).toEqual(['stand', null]);
    const old = patch(s, 'a1', { posture: undefined, lastRunTick: undefined });
    const a1 = unit(old, 'a1');
    expect(hitBreakdown(old, a1, unit(old, 'u2'), weaponOf(a1)!, 3)).toMatchObject({ crouchBonus: 0, runPenalty: 0 });
    expect(stepCost(old, a1, a1, { ...a1, x: a1.x + 1 })).toBe(a1.moveTicks);
  });

  it('POSE-2 posture is an order for a living own unit, to a posture it is not in; it is listed; crouching ends a run', () => {
    let s = game();
    expect(expectReject(s, { type: 'posture', side: 'agency', unit: 'a1', posture: 'stand' })).toMatch(/already/);
    expect(expectReject(s, { type: 'posture', side: 'agency', unit: 'a1', posture: 'prone' as never })).toMatch(/unknown posture/);
    expect(expectReject(s, { type: 'posture', side: 'hostile', unit: 'a1', posture: 'crouch' })).toMatch(/not a hostile unit/);
    expect(legalActions(s, 'agency')).toContainEqual({ type: 'posture', side: 'agency', unit: 'a1', posture: 'crouch' });
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(4, 11), run: true }).state;
    expect(unit(s, 'a1').order!.run).toBe(true);
    s = order(s, { type: 'posture', side: 'agency', unit: 'a1', posture: 'crouch' }).state;
    expect(unit(s, 'a1')).toMatchObject({ posture: 'crouch', order: { run: false } });
    expect(legalActions(s, 'agency')).toContainEqual({ type: 'posture', side: 'agency', unit: 'a1', posture: 'stand' });
    // A run stands the unit back up.
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(3, 11), run: true }).state;
    expect(unit(s, 'a1').posture).toBe('stand');
    expect(expectReject(s, { type: 'move', side: 'agency', unit: 'a1', to: pos(4, 11), run: 'yes' as never })).toMatch(/run must be/);
  });

  it('POSE-3 a running step costs 60%, a crouched step 150%, never less than 1 tick; a run arrives sooner', () => {
    const s = game();
    const a1 = unit(s, 'a1');
    const east = { ...a1, x: a1.x + 1 };
    expect(stepCost(s, a1, a1, east)).toBe(a1.moveTicks);
    expect(stepCost(s, { ...a1, order: { to: east, path: [east], progress: 0, blockedTicks: 0, run: true } }, a1, east)).toBe(Math.round((a1.moveTicks * TUNING.move.runCostPercent) / 100));
    expect(stepCost(s, { ...a1, posture: 'crouch' }, a1, east)).toBe(Math.round((a1.moveTicks * TUNING.move.crouchCostPercent) / 100));
    expect(stepCost(s, { ...a1, moveTicks: 1, order: { to: east, path: [east], progress: 0, blockedTicks: 0, run: true } }, a1, east)).toBe(1);
    const to = pos(12, 11); // along the street
    const arrive = (run: boolean) => {
      let g = order(only(s, ['a1']), { type: 'move', side: 'agency', unit: 'a1', to, run }).state;
      let n = 0;
      while (unit(g, 'a1').order && n < 200) {
        g = tick(g).state;
        n += 1;
      }
      return n;
    };
    expect(arrive(true)).toBeLessThan(arrive(false));
  });

  it('POSE-4 a crouched target at range is harder to hit, a crouched shooter steadier, a winded runner worse; melee ignores crouching', () => {
    const s = duel();
    const a1 = unit(s, 'a1');
    const u2 = unit(s, 'u2');
    const w = weaponOf(a1)!;
    const base = hitBreakdown(s, a1, u2, w, 3).raw;
    expect(hitBreakdown(s, a1, { ...u2, posture: 'crouch' }, w, 3)).toMatchObject({ crouchPenalty: 15, raw: base - 15 });
    expect(hitBreakdown(s, a1, { ...u2, posture: 'crouch' }, w, 1.5).crouchPenalty).toBe(0); // inside 2 tiles
    expect(hitBreakdown(s, { ...a1, posture: 'crouch' }, u2, w, 3)).toMatchObject({ crouchBonus: 5, raw: base + 5 });
    const t = s.tick;
    expect(hitBreakdown(s, { ...a1, lastRunTick: t }, u2, w, 3)).toMatchObject({ runPenalty: 20, raw: base - 20 });
    expect(hitBreakdown(s, { ...a1, lastRunTick: t - TUNING.fire.runSettleTicks }, u2, w, 3).runPenalty).toBe(0);
    const bite = WEAPONS['taker-bite']!;
    expect(bite.kind).toBe('melee');
    expect(hitBreakdown(s, a1, { ...u2, posture: 'crouch' }, bite, 0).crouchPenalty).toBe(0);
    // The view shows a crouch: it is seen, like the suit (VIEW-2).
    const crouched = order(s, { type: 'posture', side: 'hostile', unit: 'u2', posture: 'crouch' }).state;
    expect(view(crouched, 'agency').units.find((u) => u.id === 'u2')!.posture).toBe('crouch');
  });

  it('POSE-5 a unit marks every tick it advances a running order, and only those', () => {
    let s = order(only(game(), ['a1']), { type: 'move', side: 'agency', unit: 'a1', to: pos(unit(game(), 'a1').x, unit(game(), 'a1').y - 3), run: true }).state;
    s = tick(s).state;
    expect(unit(s, 'a1').lastRunTick).toBe(0);
    s = tick(s, 2).state;
    expect(unit(s, 'a1').lastRunTick).toBe(2);
    const walked = tick(order(only(game(), ['a1']), { type: 'move', side: 'agency', unit: 'a1', to: pos(unit(game(), 'a1').x, unit(game(), 'a1').y - 3) }).state, 3).state;
    expect(unit(walked, 'a1').lastRunTick).toBeNull();
  });
});
