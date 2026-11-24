import { expect, test } from '@playwright/test';
import { ib, toBattle } from './helpers';

test('rule 24: no text selection on a long press', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await toBattle(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
  await page.locator('.orders .hint').first().click({ clickCount: 3 });
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
});

test('rule 25: a tap on the tile behind a walker picks that tile', async ({ page }) => {
  await toBattle(page);
  // Marlow stands on (6,16); the tile north of it, (6,15), is drawn behind the walker from the start camera.
  await ib(page, 'window.__ib.tapTile(6, 16)');
  await expect(page.getByTestId('card-marlow')).toBeVisible();
  const p = await ib(page, 'window.__ib.screenPointOfTile(6, 15)') as { x: number; y: number };
  await page.mouse.click(p.x, p.y);
  await ib(page, 'window.__ib.skip()');
  const m = await ib(page, 'window.__ib.state().live.units.find((u) => u.id === "marlow")') as { x: number; y: number };
  expect([m.x, m.y]).toEqual([6, 15]);
});

test('rule 27: wheel zooms, right-drag turns, middle-drag pans, left-drag pans until a middle press', async ({ page }) => {
  await toBattle(page);
  const cam = () => page.evaluate(() => { const c = (document.querySelector('canvas') as any); return c ? JSON.stringify((window as any).__ib.state().screen) : ''; });
  const shotAt = async () => (await ib(page, 'JSON.stringify(window.__ib.screenPointOfTile(7, 9))')) as string;
  const c0 = await shotAt();
  await page.mouse.move(720, 450); await page.mouse.wheel(0, -400); await page.waitForTimeout(300);
  const c1 = await shotAt(); expect(c1).not.toBe(c0);
  await page.mouse.move(700, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(800, 470, { steps: 5 }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(300);
  const c2 = await shotAt(); expect(c2).not.toBe(c1);
  await page.mouse.move(700, 450); await page.mouse.down({ button: 'left' }); await page.mouse.move(780, 520, { steps: 5 }); await page.mouse.up({ button: 'left' }); await page.waitForTimeout(300);
  const c3 = await shotAt(); expect(c3).not.toBe(c2);
  await page.mouse.move(700, 450); await page.mouse.down({ button: 'middle' }); await page.mouse.move(640, 400, { steps: 5 }); await page.mouse.up({ button: 'middle' }); await page.waitForTimeout(300);
  const c4 = await shotAt(); expect(c4).not.toBe(c3);
  expect(await page.evaluate(() => localStorage.getItem('ib-mouse'))).toBe('three-button');
  void cam;
});
