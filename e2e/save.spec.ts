// KB rule 22 in its real-time form (PLAN.md Q5; spec SAV-3..SAV-6), verified in a real browser with a
// persistent profile: play, close the browser, reopen, Continue, compare.
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTitle, startRaid, sweepText, waitForBoard, watchErrors } from './helpers';

const port = Number(process.env.PW_PORT ?? 5181);
const baseURL = `http://localhost:${port}/`;

async function open(dir: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, viewport: { width: 1440, height: 900 }, ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

test('pause, order, advance, save; close the browser; Continue reopens the same state, paused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ekc-profile-'));
  try {
    let { ctx, page } = await open(dir);
    const errors = watchErrors(page);
    // The hostile AI is off (?ai=none, AI-2): this test is about the save, and on a one-building raid (MAP-10) a
    // hunting AI can down the whole squad inside the 12.5 s below on some seeds. Stances still fire back.
    await page.goto('./?ai=none');
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByTestId('continue')).toHaveCount(0);
    await startRaid(page);
    // The save is written when the raid starts, before any order (rule 22).
    expect(await page.evaluate(() => localStorage.getItem('ekc-save') !== null)).toBe(true);

    await page.getByTestId('pause').click(); // unpause
    await page.getByTestId('pause').click(); // pause: an autosave point
    await page.getByTestId('agent-a2').click();
    const target = { x: 3, y: 7, level: 0 };
    const pt = await page.evaluate((t) => window.__ekc!.screenPointOfTile(t), target);
    await page.mouse.click(pt!.x, pt!.y); // an accepted order: an autosave point
    const saved = await page.evaluate(() => {
      const h = window.__ekc!;
      h.pause();
      h.advance(12.5); // past the 10 s autosave interval
      // A living agent: a host firing back by stance may have downed one, and a down unit takes no order (UNIT-4).
      const who = h.getState()!.units.find((u) => u.side === 'agency' && !u.down && u.stance !== 'hold')!.id;
      const ok = h.order({ type: 'stance', side: 'agency', unit: who, stance: 'hold' }).ok;
      return { hash: h.hash(), tick: h.getState()!.tick, bytes: localStorage.getItem('ekc-save')!.length, who, ok };
    });
    expect(saved.ok).toBe(true);
    expect(saved.tick).toBeGreaterThanOrEqual(125);
    expect(saved.bytes).toBeLessThan(200_000); // a tile diff, not every tile (RULING SAV-3)
    await expect(page.getByTestId('save-lamp')).toContainText('SAVED AT');
    expect(errors).toEqual([]);
    await ctx.close();

    // A new browser process on the same profile.
    ({ ctx, page } = await open(dir));
    const errors2 = watchErrors(page);
    await openTitle(page);
    // Continue names what it reopens (SAV-4).
    const summary = page.getByTestId('continue-summary');
    await expect(summary).toContainText('Raid on Civic Savings');
    await expect(summary).toContainText('paused');
    await expect(summary).toContainText(/Agents standing \d\/6/);
    await sweepText(page);
    await page.getByTestId('continue').click();
    await waitForBoard(page);
    const back = await page.evaluate((who) => {
      const h = window.__ekc!;
      return { hash: h.hash(), tick: h.getState()!.tick, paused: h.isPaused(), stance: h.getState()!.units.find((u) => u.id === who)!.stance };
    }, saved.who);
    expect(back).toEqual({ hash: saved.hash, tick: saved.tick, paused: true, stance: 'hold' });
    await expect(page.getByTestId('pause')).toHaveText('PAUSED');
    // It plays on from there.
    expect(await page.evaluate(() => (window.__ekc!.advance(1), window.__ekc!.getState()!.tick))).toBe(saved.tick + 10);

    // Leaving the console keeps the save; Discard asks once more, then clears it.
    await page.getByTestId('leave').click();
    await expect(page.getByTestId('continue')).toBeVisible();
    await page.getByTestId('discard').click();
    await expect(page.getByTestId('continue')).toBeVisible(); // nothing discarded yet
    await page.getByTestId('discard-confirm').click();
    await expect(page.getByTestId('continue')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ekc-save'))).toBeNull();
    expect(errors2).toEqual([]);
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable save says why and offers Discard; a finished raid clears its save; refused storage is reported', async ({ page, context }) => {
  await openTitle(page);
  // Corrupt save: never silent (SAV-6).
  await page.evaluate(() => localStorage.setItem('ekc-save', '{"game":"ekc","version":1,'));
  await page.reload();
  await expect(page.getByTestId('load-error')).toContainText('not readable JSON');
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await page.getByTestId('discard-broken').click();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  // A save from a build with another map (hash mismatch).
  await startRaid(page);
  await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('ekc-save')!);
    env.hash = '00000000';
    localStorage.setItem('ekc-save', JSON.stringify(env));
  });
  await page.reload();
  await expect(page.getByTestId('load-error')).toContainText('map in this build differs');
  await page.getByTestId('discard-broken').click();

  // A finished raid (withdrawn) shows the report and leaves no Continue (SAV-5).
  await startRaid(page);
  await page.getByTestId('withdraw').click();
  await page.getByTestId('withdraw-confirm').click();
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveText('SQUAD WITHDRAWN');
  expect(await page.evaluate(() => localStorage.getItem('ekc-save'))).toBeNull();
  await sweepText(page);
  await page.getByTestId('close-report').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);

  // Refused storage: the raid plays on and the console says it is not saved.
  const p2 = await context.newPage();
  await p2.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await openTitle(p2);
  await startRaid(p2);
  await expect(p2.getByTestId('save-lamp')).toContainText('NOT SAVED');
  expect(await p2.evaluate(() => (window.__ekc!.advance(1), window.__ekc!.getState()!.tick))).toBe(10);
  await p2.close();
});
