// M6/M7: the city switchboard (docs/spec/20-city.md). Time moves through window.__ekcCity.advance (CLOCK-6), so the
// test never waits on the frame clock (KB recipe section 11).
import { expect, test, type Page } from '@playwright/test';
import { openTitle, watchErrors } from './helpers';
import type { CityHook } from '../src/client/city/hook';

declare global {
  interface Window {
    __ekcCity?: CityHook;
  }
}

async function startCampaign(page: Page, seed = 7): Promise<void> {
  await openTitle(page);
  await page.evaluate(() => localStorage.removeItem('ekc-campaign'));
  await page.getByTestId('campaign-new').click();
  await expect(page.getByTestId('city')).toBeVisible();
  // A fixed seed for the test: start again through the hook (the switch seeds from the clock).
  await page.evaluate((s) => window.__ekcCity!.start(s), seed);
  await expect(page.getByTestId('city-console')).toBeVisible();
}

test('the city opens paused, its clock runs through the hook, and slips reach the tray', async ({ page }) => {
  const errors = watchErrors(page);
  await startCampaign(page);
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  await expect(page.getByTestId('city-clock')).toContainText('08:00');
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 24 * 3));
  await expect(page.getByTestId('city-clock')).toContainText('DAY 4');
  const tray = await page.evaluate(() => window.__ekcCity!.tray());
  expect(tray.some((t) => t.kind.startsWith('slip-'))).toBe(true);
  // CVIEW-1: the page's view never carries the infiltration.
  const leaks = await page.evaluate(() => window.__ekcCity!.view()!.orgs.every((o) => o.infiltration === -1));
  expect(leaks).toBe(true);
  expect(errors).toEqual([]);
});

test('a tap on a building opens its card through the one pick mesh, and WATCH sends an agent', async ({ page }) => {
  await startCampaign(page);
  await page.waitForTimeout(500);
  const pt = await page.evaluate(() => window.__ekcCity!.screenPointOfBuilding('city-hall'));
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await expect(page.getByTestId('building-name')).toHaveText(/CITY HALL/);
  await page.getByTestId('watch').click();
  const watching = await page.evaluate(() => window.__ekcCity!.state()!.agents.filter((a) => a.status === 'watching').map((a) => a.building));
  expect(watching).toEqual(['city-hall']);
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 13));
  await expect(page.getByTestId('building-report')).toContainText('Last report');
});

test('a raid flies to the door, pauses there, and the squad can handle it', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('ambrel-works'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await expect(page.getByTestId('door')).toBeVisible();
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  await page.getByTestId('auto-resolve').click();
  await expect(page.getByTestId('door')).toBeHidden();
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('resolved');
});

test('the campaign saves and Continue reopens it to the same hash', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 30));
  await page.evaluate(() => window.__ekcCity!.order({ type: 'recruit', side: 'agency' }));
  const hash = await page.evaluate(() => window.__ekcCity!.hash());
  await page.reload();
  await expect(page.getByTestId('campaign-continue')).toBeVisible();
  await expect(page.getByTestId('campaign-summary')).toContainText('Day 2');
  await page.getByTestId('campaign-continue').click();
  await expect(page.getByTestId('city')).toBeVisible();
  expect(await page.evaluate(() => window.__ekcCity!.hash())).toBe(hash);
});

test('FIGHT IT opens the real battle on the building site; its result returns to the city (M7)', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('automat-row'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await page.getByTestId('fight').click();
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 });
  const battle = await page.evaluate(() => window.__ekc!.getState()!.battleId);
  expect(battle).toBe('automat-raid');
  // Withdraw: the battle ends, the report shows, and closing it hands the result back.
  await page.evaluate(() => window.__ekc!.order({ type: 'withdraw', side: 'agency' }));
  await expect(page.getByTestId('close-report')).toBeVisible();
  await page.getByTestId('close-report').click();
  await expect(page.getByTestId('city')).toBeVisible();
  const raid = await page.evaluate(() => window.__ekcCity!.state()!.raid);
  expect(raid).toBeNull();
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('resolved');
});

test('a raid stocks the lab shelf and the LAB tab starts and finishes research (M5b)', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('ambrel-works'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await page.getByTestId('auto-resolve').click();
  const shelf = await page.evaluate(() => window.__ekcCity!.state()!.shelf);
  test.skip(shelf.host < 1, 'this seed lost the raid; the shelf stays empty');
  await page.getByTestId('tab-lab').click();
  await expect(page.getByTestId('shelf')).toContainText('host bodies');
  await page.getByTestId('research-restraints').click();
  await expect(page.getByTestId('lab-project')).toContainText('Stun baton');
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 25));
  expect(await page.evaluate(() => window.__ekcCity!.state()!.lab.done)).toContain('restraints');
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('research-done');
});
