// The world past the board (docs/art/dressing.md): the title poster and its lamp test, the switch that picks the
// raid's control room tier, and the dressed city, drawn with the scenery switch forced to full (headless Chromium draws in software, where
// `auto` is plain, RULING ART-11). Remakes the m8 shots.
import { expect, test, type Page } from '@playwright/test';
import { openTitle, startRaid, watchErrors } from './helpers';
import type { CityHook } from '../src/client/city/hook';

declare global {
  interface Window {
    __ekcCity?: CityHook;
  }
}

const BUDGET_DRAWS = 120;

async function forceScenery(page: Page, scenery: 'full' | 'plain'): Promise<void> {
  await page.evaluate((s) => localStorage.setItem('ekc-view', JSON.stringify({ shake: true, scenery: s })), scenery);
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
}

test('the title is a poster with moving traffic, and the console runs its lamp test', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  const art = page.locator('.poster-art');
  await expect(art).toBeVisible();
  expect(await page.locator('.poster-art animateMotion').count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator('.lamp-row .lamp-test').count()).toBe(12);
  const box = (await art.boundingBox())!;
  expect(box.height).toBeGreaterThan(300);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'docs/art/shots/m8-title-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(art).toBeVisible();
  await page.screenshot({ path: 'docs/art/shots/m8-title-phone.png' });
  expect(errors).toEqual([]);
});

test('the title switch picks the control room\'s detail tier: SCENERY draws it full, PLAIN draws the low tier', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openTitle(page);
  await forceScenery(page, 'full');
  await expect(page.getByTestId('title-scenery')).toHaveText('SCENERY');
  await startRaid(page, 'automat-raid');
  expect(await page.evaluate(() => window.__ekc!.detail().detail)).toBe('full');
  await page.evaluate(() => window.__ekc!.setCamera({ yaw: 0.7, pitch: 0.62, distance: 34 }));
  await page.waitForTimeout(800);
  const full = await page.evaluate(() => window.__ekc!.perf()!);
  expect(full.drawCalls).toBeLessThanOrEqual(BUDGET_DRAWS);
  // The switch is remembered under ekc-view; the raid board reads it when its canvas is made (world.ts detectDetail).
  await page.evaluate(() => localStorage.removeItem('ekc-save'));
  await page.reload();
  await page.getByTestId('title-scenery').click();
  await expect(page.getByTestId('title-scenery')).toHaveText('PLAIN');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ekc-view')!).scenery)).toBe('plain');
  await startRaid(page, 'automat-raid');
  expect(await page.evaluate(() => window.__ekc!.detail().detail)).toBe('low');
  expect(errors).toEqual([]);
});

test('the dressed city by day and by night, and a lot still opens its card through the one pick mesh', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openTitle(page);
  await forceScenery(page, 'full');
  await page.evaluate(() => localStorage.removeItem('ekc-campaign'));
  await page.getByTestId('campaign-new').click();
  await expect(page.getByTestId('city-console')).toBeVisible();
  await page.evaluate(() => window.__ekcCity!.start(7));
  await expect(page.getByTestId('city-scenery')).toHaveText('SCENERY');
  await page.evaluate(() => {
    window.__ekcCity!.advanceTicks(6 * 3);
    window.__ekcCity!.setCamera({ pitch: 0.45, distance: 140, yaw: Math.PI * 0.22, target: { x: 48, z: 50 } });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/art/shots/m8-city-day-desktop.png' });
  await page.evaluate(() => {
    window.__ekcCity!.advanceTicks(6 * 13);
    window.__ekcCity!.setCamera({ pitch: 0.92, distance: 135, target: { x: 48, z: 54 } });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/art/shots/m8-city-night-desktop.png' });
  // The dressing takes no pointer (KB rule 25): a tap on a lot still reaches its building.
  const pt = await page.evaluate(() => window.__ekcCity!.screenPointOfBuilding('city-hall'));
  await page.mouse.click(pt!.x, pt!.y);
  await expect(page.getByTestId('building-name')).toHaveText(/CITY HALL/);
  expect(errors).toEqual([]);
});
