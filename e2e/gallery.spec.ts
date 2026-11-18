// ?gallery (PLAN.md M4; docs/figures.md): every figure role with its measurements against the section 1 table, the
// humanoid gates passing on the placeholders, and a GLB slot per role that reads "placeholder" until the GPU pass.
import { expect, test } from '@playwright/test';
import { noNativeTooltips, sweepText, watchErrors } from './helpers';

const ROLES = ['agent-t1', 'agent-t2', 'citizen', 'host-hidden', 'host-revealed', 'taker', 'fighter'];

test('the gallery lists every figure role, measures the placeholders within the gates, and shows the GLB slots', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?gallery');
  await expect(page.getByTestId('gallery')).toBeVisible();
  for (const role of ROLES) await expect(page.getByTestId(`gallery-row-${role}`)).toBeVisible();
  // The humanoids pass the measured gates (head 30-40%, shoulders 1.6-2.0 heads, legs at most 1.2 heads).
  for (const role of ['agent-t1', 'agent-t2', 'citizen', 'host-hidden', 'host-revealed']) {
    await expect(page.getByTestId(`gallery-gate-${role}`)).toHaveText('PASS');
  }
  for (const role of ['taker', 'fighter']) await expect(page.getByTestId(`gallery-gate-${role}`)).toHaveText('by eye');
  // No GLB yet: every slot is the placeholder with its path named.
  for (const role of ROLES) await expect(page.getByTestId(`gallery-model-${role}`)).toContainText(`placeholder (slot: public/models/${role}.glb)`);
  const table = await page.getByTestId('gallery-table').innerText();
  expect(table).toMatch(/Head share/);
  expect(table).not.toMatch(/FAIL/);
  await sweepText(page);
  await noNativeTooltips(page);
  // D10 and KB rule 29: no codename, no inspiration names in the gallery's text.
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/kom|calamity|x-com|xcom/i);
  await page.screenshot({ path: 'docs/art/shots/m4-gallery.png' });
  expect(errors).toEqual([]);
});
