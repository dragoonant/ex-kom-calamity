import { expect, test } from '@playwright/test';
import { toBattle } from './helpers';

test('orders and events reach the audio director; the sound desk lists every take', async ({ page }) => {
  await toBattle(page);
  await page.evaluate(() => { (window as any).__ib.tapTile(6, 16); (window as any).__ib.tapTile(6, 14); (window as any).__ib.advance(1.5); });
  const ev = await page.evaluate(() => (window as any).__ib.audioEvents() as string[]);
  expect(ev.some((e) => e.includes('step-heavy'))).toBe(true);
  expect(ev.some((e) => e.includes('battle'))).toBe(true);
  await page.goto('./sounds.html');
  await expect(page.locator('body')).toContainText('autocannon');
  await expect(page.locator('body')).toContainText('brief-1');
});
