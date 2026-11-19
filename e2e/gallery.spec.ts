// ?gallery (PLAN.md M4; docs/figures.md; docs/art/figure-models.md): every figure role with its measurements against
// the section 1 table, the humanoid gates passing, and the four generated GLBs (agent tier 2, revealed host, taker,
// fighter) really drawn in their cells with no stand-in shown (KB rule 26), the tier 1 agent wearing the tier 2 model
// (RULING AGENT-1), the two roles without a locked reference still on their stand-ins.
import { expect, test } from '@playwright/test';
import { noNativeTooltips, sweepText, watchErrors } from './helpers';

const ROLES = ['agent-t1', 'agent-t2', 'citizen', 'host-hidden', 'host-revealed', 'taker', 'fighter'];
const GENERATED: Record<string, string> = { 'agent-t1': 'agent', 'agent-t2': 'agent', 'host-revealed': 'host', taker: 'taker', fighter: 'fighter' };

test('the gallery lists every figure role, measures it within the gates, and draws the generated GLBs in five cells', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?gallery');
  await expect(page.getByTestId('gallery')).toBeVisible();
  for (const role of ROLES) await expect(page.getByTestId(`gallery-row-${role}`)).toBeVisible();
  // The four GLBs load and are drawn (not their stand-ins): the slot reads ready and the cell reports the GLB mounted.
  for (const [role, folder] of Object.entries(GENERATED)) {
    await expect(page.getByTestId(`gallery-model-${role}`)).toContainText(`ready, drawn: GLB (models/figures/${folder}/textured.glb, LOD textured-lod.glb)`, { timeout: 30_000 });
  }
  for (const role of ['citizen', 'host-hidden']) {
    await expect(page.getByTestId(`gallery-model-${role}`)).toContainText(`placeholder, drawn: stand-in (no locked reference; slot: public/models/figures/${role}/textured.glb)`);
  }
  // The glow sprites over the painted cores stand on the three aliens, none on the agent (its core is not painted).
  await expect(page.getByTestId('gallery-title')).toContainText('generated models drawn 5 with 3 core glows');
  // The stand-ins pass the measured gates (head 30-40%, shoulders 1.6-2.0 heads, legs at most 1.2 heads).
  for (const role of ['citizen', 'host-hidden']) await expect(page.getByTestId(`gallery-gate-${role}`)).toHaveText('PASS');
  await expect(page.getByTestId('gallery-gate-agent-t1')).toHaveText('PASS (render, GATE-1, AGENT-1)'); // RULING AGENT-1: the tier 2 suit until tier 1 has a reference
  // The generated figures carry the pipeline's verdict and ruling (docs/art/figure-models.md section 4).
  await expect(page.getByTestId('gallery-gate-agent-t2')).toHaveText('PASS (render, GATE-1)');
  await expect(page.getByTestId('gallery-gate-host-revealed')).toHaveText('PASS vs reference (HOST-1)');
  await expect(page.getByTestId('gallery-gate-taker')).toHaveText('recorded, by eye (CREATURE-1, TAKER-1)');
  await expect(page.getByTestId('gallery-gate-fighter')).toHaveText('recorded, by eye (CREATURE-1, FIGHTER-1)');
  // Heights come from the meshes themselves: agent and host 1.2 units, taker 0.95, fighter 1.5 (figure-models.md 1).
  const rowText = async (role: string) => page.getByTestId(`gallery-row-${role}`).innerText();
  expect(await rowText('agent-t2')).toMatch(/1\.00 figure units/);
  expect(await rowText('host-revealed')).toMatch(/1\.00 figure units/);
  expect(await rowText('taker')).toMatch(/0\.79 figure units/);
  expect(await rowText('fighter')).toMatch(/1\.25 figure units/);
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
