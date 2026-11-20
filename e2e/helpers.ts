import { expect, type Page } from '@playwright/test';
import type { EkcHook } from '../src/client/hook';

declare global {
  interface Window {
    __ekc?: EkcHook;
  }
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // A failed resource names its url, so a failing GLB or sound can be told from a page error.
    if (m.type() === 'error') errors.push(m.location().url ? `${m.text()} (${m.location().url})` : m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function openTitle(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.getByTestId('title')).toBeVisible();
}

/** Starts a raid on one of the sites (MAP-10; Civic Savings by default) and waits for the board to have a live camera and its tiles. */
export async function startRaid(page: Page, battleId = 'savings-raid'): Promise<void> {
  const button = page.getByTestId(`start-${battleId}`);
  await expect(button).toBeVisible({ timeout: 30_000 }); // the switches show once the models have preloaded (KB rule 26)
  await button.click();
  await waitForBoard(page);
}

export async function waitForBoard(page: Page): Promise<void> {
  await expect(page.getByTestId('console')).toBeVisible();
  await page.waitForFunction(() => {
    const h = window.__ekc;
    const s = h?.getState();
    if (!h || !s) return false;
    const a = s.units.find((u) => u.side === 'agency');
    return !!a && h.screenPointOfTile({ x: a.x, y: a.y, level: a.level }) !== null && h.tileAtScreen(0, 0) !== undefined && h.camera() !== null;
  });
  // The first frames place the camera; wait until a tile really is under the squad's screen point.
  await page.waitForFunction(() => {
    const h = window.__ekc!;
    const a = h.getState()!.units.find((u) => u.side === 'agency')!;
    const free = { x: a.x + 1, y: a.y, level: a.level };
    const p = h.screenPointOfTile(free);
    if (!p) return false;
    const t = h.tileAtScreen(p.x, p.y);
    return !!t && t.x === free.x && t.y === free.y;
  });
}

/** The page text must never show a raw undefined, NaN or null (KB recipe step 6). */
export async function sweepText(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/);
}

/** KB rule 8: no native tooltips, as attributes or as SVG children. */
export async function noNativeTooltips(page: Page): Promise<void> {
  const n = await page.evaluate(() => document.querySelectorAll('[title], svg title').length);
  expect(n).toBe(0);
}
