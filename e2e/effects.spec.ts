// D21 e-f in the playable: a charge on the bank's wall makes the stylised explosion (glow, smoke, chunks, a scorch,
// a light pulse and lingering fire and smoke), jolts the camera, and the SHAKE switch turns the jolt off and is kept
// per browser under ekc-view. Shots are remade for docs/art/shots/.
import { expect, test } from '@playwright/test';
import { openTitle, startRaid, sweepText, watchErrors } from './helpers';

test('a charge makes the stylised explosion and jolts the camera; the shake switch turns the jolt off', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  await expect(page.getByTestId('shake')).toHaveText('SHAKE');
  await page.evaluate(() => {
    const h = window.__ekc!;
    h.setCamera({ yaw: 1.1, pitch: 0.55, distance: 11, target: { x: 4, z: 10 } });
    h.order({ type: 'blast', side: 'agency', unit: 'a3', at: { x: 4, y: 10, level: 0 } });
    h.advance(1);
  });
  // Effects run on frame time while the world runs; unpause for a moment so they play.
  await page.getByTestId('pause').click();
  await page.waitForFunction(() => (window.__ekc!.perf()?.fx.glow ?? 0) > 0, undefined, { timeout: 10_000 });
  const during = await page.evaluate(() => ({ fx: window.__ekc!.perf()!.fx, shake: window.__ekc!.shake() }));
  await page.keyboard.press('Space');
  expect(during.fx.scorches).toBe(1);
  expect(during.fx.chunks).toBeGreaterThan(10);
  expect(during.fx.emitters).toBeGreaterThanOrEqual(2); // the fire and the smoke column, plus the breach's dust
  expect(during.shake.enabled).toBe(true);
  expect(during.shake.amp).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/art/shots/m4c-blast.png' });
  const perf = await page.evaluate(() => window.__ekc!.perf()!);
  expect(perf.drawCalls).toBeLessThanOrEqual(120); // the laptop budget (D21 f)
  // The switch: off, kept, and a second blast gives no jolt.
  await page.getByTestId('shake').click();
  await expect(page.getByTestId('shake')).toHaveText('NO SHAKE');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ekc-view')!))).toEqual({ shake: false, shadows: true, scenery: 'auto' });
  await page.evaluate(() => {
    const h = window.__ekc!;
    h.order({ type: 'blast', side: 'agency', unit: 'a1', at: { x: 4, y: 13, level: 0 } });
    h.advance(1);
  });
  await page.getByTestId('pause').click();
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.__ekc!.shake())).amp).toBe(0);
  await page.keyboard.press('Space');
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ekc-view')!))).toEqual({ shake: false, shadows: true, scenery: 'auto' });
  await sweepText(page);
  expect(errors).toEqual([]);
});
