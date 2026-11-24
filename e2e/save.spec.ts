import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

test('rule 22: play, close, reopen, Continue to the same spot', async ({ baseURL }) => {
  const dir = mkdtempSync(join(tmpdir(), 'ib-profile-'));
  let ctx = await chromium.launchPersistentContext(dir, { executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let page = await ctx.newPage();
  await page.goto(baseURL!);
  await page.click('[data-testid=new]'); await page.click('[data-testid=skip-brief]'); await page.click('[data-testid=deploy]');
  await page.waitForSelector('[data-testid=hud]');
  await page.evaluate(() => (window as any).__ib.autoplay(14, 0));
  const before = await page.evaluate(() => { const s = (window as any).__ib.state().live; return JSON.stringify({ r: s.round, t: s.turnCount, u: s.units.map((u: any) => [u.id, u.x, u.y, u.hp]) }); });
  await ctx.close();
  ctx = await chromium.launchPersistentContext(dir, { executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await ctx.newPage();
  await page.goto(baseURL!);
  await expect(page.getByTestId('continue')).toContainText('Marrow Yard, round');
  await page.click('[data-testid=continue]');
  await page.waitForSelector('[data-testid=hud]');
  const after = await page.evaluate(() => { const s = (window as any).__ib.state().live; return JSON.stringify({ r: s.round, t: s.turnCount, u: s.units.map((u: any) => [u.id, u.x, u.y, u.hp]) }); });
  expect(after).toBe(before);
  await ctx.close();
});

test('rule 22: a damaged save says why and can be discarded', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('ib-save', '{oops'));
  await page.reload();
  await expect(page.getByText('The save is damaged')).toBeVisible();
  await page.getByText('Discard it').click();
  await expect(page.getByTestId('new')).toBeVisible();
});

test('rule 22: Discard asks once more', async ({ page }) => {
  await page.goto('./');
  await page.click('[data-testid=new]');
  await page.goto('./');
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.click('text=Discard save');
  await page.click('[data-testid=discard-confirm]');
  await expect(page.getByTestId('continue')).toHaveCount(0);
});
