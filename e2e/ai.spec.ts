// The hostile AI in the playable (docs/spec/10-rules.md AI-2, AI-9): opponents act on the block, their orders ride in
// the log, pause gives them no turn, the tray never prints their orders, and ?ai=none switches them off.
import { expect, test } from '@playwright/test';
import { openTitle, startRaid, sweepText, watchErrors } from './helpers';

test('hostiles act on their own through advance, never while paused, and their orders stay out of the tray', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  expect(await page.evaluate(() => window.__ekc!.ai())).toBe('normal');
  // Paused: wall time passes, nothing moves, no hostile order (TIME-2, AI-9).
  await page.waitForTimeout(600);
  const paused = await page.evaluate(() => {
    const s = window.__ekc!.getState()!;
    return { tick: s.tick, hostileOrders: s.log.filter((e) => e.type !== 'tick' && 'side' in e && e.side === 'hostile').length };
  });
  expect(paused).toEqual({ tick: 0, hostileOrders: 0 });
  // Thirty seconds of sim time through the hook: the hostiles have given orders and some have moved.
  const after = await page.evaluate(() => {
    const h = window.__ekc!;
    const before = h.getState()!.units.filter((u) => u.side === 'hostile').map((u) => `${u.id}:${u.x},${u.y},${u.level}`);
    h.advance(30);
    const s = h.getState()!;
    const now = s.units.filter((u) => u.side === 'hostile').map((u) => `${u.id}:${u.x},${u.y},${u.level}`);
    const hostileOrders = s.log.filter((e) => e.type !== 'tick' && 'side' in e && e.side === 'hostile');
    return { tick: s.tick, hostileOrders: hostileOrders.length, moved: now.filter((p, i) => p !== before[i]).length, kinds: [...new Set(hostileOrders.map((e) => e.type))] };
  });
  expect(after.tick).toBe(300);
  expect(after.hostileOrders).toBeGreaterThan(0);
  expect(after.moved).toBeGreaterThan(0);
  // The message tray reports only what the agency may know: no hostile order lines (AI-9, VIEW-2).
  const tray = await page.getByTestId('tray').innerText();
  expect(tray).not.toMatch(/\b(Host|Taker|Fighter|Citizen): (move|fire|stance|halt|arming)/);
  await sweepText(page);
  // Continue reproduces the AI's orders from the log: the save's log holds hostile entries too (SAV-3, AI-9).
  const saved = await page.evaluate(() => {
    window.__ekc!.pause();
    const env = JSON.parse(localStorage.getItem('ekc-save')!);
    return (env.log as { type: string; side?: string }[]).filter((e) => e.side === 'hostile').length;
  });
  expect(saved).toBe(after.hostileOrders);
  expect(errors).toEqual([]);
});

test('?ai=none leaves the hostiles to their stances, as in M2', async ({ page }) => {
  await page.goto('./?ai=none');
  await expect(page.getByTestId('title')).toBeVisible();
  await startRaid(page);
  expect(await page.evaluate(() => window.__ekc!.ai())).toBe('none');
  const r = await page.evaluate(() => {
    const h = window.__ekc!;
    h.advance(10);
    const s = h.getState()!;
    return { tick: s.tick, hostileOrders: s.log.filter((e) => e.type !== 'tick' && 'side' in e && e.side === 'hostile').length };
  });
  expect(r).toEqual({ tick: 100, hostileOrders: 0 });
});
