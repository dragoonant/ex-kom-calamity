// ?moves (PLAN.md D21): every animated figure doing every motion on a loop. The poses are judged by eye on the shots
// this test remakes (docs/art/shots/m4c-moves*.png); here it checks that all forty cells, and the ten of one row, draw
// the rigged GLB with no page error. The rules of motion are unit-tested in tests/client-anim.test.ts.
import { expect, test } from '@playwright/test';
import { sweepText, watchErrors } from './helpers';

test('the moves strip draws every figure in every motion as its rigged GLB', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?moves');
  await expect(page.getByTestId('moves-title')).toContainText('4 figures, 10 motions, models ready', { timeout: 60_000 });
  await page.waitForFunction(() => window.__ekc !== undefined);
  const count = async () => page.evaluate(() => window.__ekc!.perf()?.figures.rigged ?? 0);
  await expect.poll(count, { timeout: 30_000 }).toBe(40);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/art/shots/m4c-moves.png' });
  await page.goto('./?moves&row=agent-t1');
  await expect(page.getByTestId('moves-title')).toContainText('models ready', { timeout: 60_000 });
  await expect.poll(count, { timeout: 30_000 }).toBe(10);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'docs/art/shots/m4c-moves-agent.png' });
  await sweepText(page);
  expect(errors).toEqual([]);
});
