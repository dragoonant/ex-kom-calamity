// Section 24 (POSE) in the playable: the CROUCH switch and the C key set the posture, the RUN switch and the R key
// make move orders run, and Shift on a tap inverts the RUN switch. The file card names the crouch in the hit chance.
import { expect, test } from '@playwright/test';
import { openTitle, startRaid, sweepText, watchErrors } from './helpers';

test('crouch and run from the console, the keys and Shift-tap', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  await page.getByTestId('agent-a1').click();
  const a1 = () => page.evaluate(() => window.__ekc!.getState()!.units.find((u) => u.id === 'a1')!);
  await page.getByTestId('posture').click();
  await expect(page.getByTestId('posture')).toHaveText('CROUCHED');
  expect((await a1()).posture).toBe('crouch');
  await page.keyboard.press('KeyC');
  await expect(page.getByTestId('posture')).toHaveText('CROUCH');
  expect((await a1()).posture).toBe('stand');
  // A plain tap walks; Shift on the tap runs.
  const tap = async (t: { x: number; y: number; level: number }, shift: boolean) => {
    const pt = await page.evaluate((p) => window.__ekc!.screenPointOfTile(p), t);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(pt!.x, pt!.y);
    if (shift) await page.keyboard.up('Shift');
  };
  await tap({ x: 3, y: 8, level: 0 }, false);
  expect((await a1()).order).toMatchObject({ run: false });
  await tap({ x: 3, y: 7, level: 0 }, true);
  expect((await a1()).order).toMatchObject({ run: true });
  // The RUN switch (and R) makes plain taps run; Shift then walks.
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('run')).toHaveText('RUN ON');
  await tap({ x: 3, y: 8, level: 0 }, false);
  expect((await a1()).order).toMatchObject({ run: true });
  await tap({ x: 3, y: 7, level: 0 }, true);
  expect((await a1()).order).toMatchObject({ run: false });
  await page.getByTestId('run').click();
  await expect(page.getByTestId('run')).toHaveText('RUN');
  // The order goes through the engine: a running agent's last run tick is set as it moves.
  await page.evaluate(() => {
    const h = window.__ekc!;
    h.order({ type: 'move', side: 'agency', unit: 'a1', to: { x: 2, y: 3, level: 0 }, run: true });
    h.advance(1);
  });
  expect((await a1()).lastRunTick).toBeGreaterThanOrEqual(0);
  await sweepText(page);
  expect(errors).toEqual([]);
});
