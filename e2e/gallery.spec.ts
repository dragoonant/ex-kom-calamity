// ?gallery (PLAN.md M4; docs/figures.md; docs/art/figure-models.md): every figure role with its measurements against
// the section 1 table, the humanoid gates passing, and the seven generated GLBs (tier 1 and tier 2 agent, the two
// citizen bodies, revealed host, taker, fighter) really drawn in all eight cells with no stand-in shown (KB rule 26);
// the hidden host draws the citizen model (HIDE-1). The M4d pass (2026-11-20) filled the last three slots and closed
// RULING AGENT-1.
import { expect, test } from '@playwright/test';
import { noNativeTooltips, sweepText, watchErrors } from './helpers';

const ROLES = ['agent-t1', 'agent-t2', 'citizen', 'citizen-2', 'host-hidden', 'host-revealed', 'taker', 'fighter'];
const GENERATED: Record<string, string> = { 'agent-t1': 'agent-t1', 'agent-t2': 'agent', citizen: 'citizen', 'citizen-2': 'citizen-2', 'host-hidden': 'citizen', 'host-revealed': 'host', taker: 'taker', fighter: 'fighter' };

test('the gallery lists every figure role, measures it within the gates, and draws the generated GLBs in all eight cells', async ({ page }) => {
  const errors = watchErrors(page);
  // A slow connection: every GLB arrives a second late, so the cells mount before the preload ends, as on the
  // owner's desktop (2026-11-19), and must still pick the model up when it lands (useModelState).
  await page.route('**/*.glb', async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.goto('./?gallery');
  await expect(page.getByTestId('gallery')).toBeVisible();
  // Before the files land the cells say so and draw the stand-ins, never a broken GLB.
  await expect(page.getByTestId('gallery-model-agent-t1')).toContainText('loading, drawn: stand-in');
  for (const role of ROLES) await expect(page.getByTestId(`gallery-row-${role}`)).toBeVisible();
  // The GLBs load and are drawn (not their stand-ins): the slot reads ready and the cell reports the GLB mounted.
  for (const [role, folder] of Object.entries(GENERATED)) {
    await expect(page.getByTestId(`gallery-model-${role}`)).toContainText(`ready, drawn: GLB (models/figures/${folder}/textured.glb, LOD textured-lod.glb)`, { timeout: 30_000 });
  }
  // The glow sprites over the painted cores stand on the three aliens, none on the humans (no painted core).
  await expect(page.getByTestId('gallery-title')).toContainText('generated models drawn 8 with 3 core glows');
  await expect(page.getByTestId('gallery-title')).toContainText('humanoid gates passed 6/6');
  // The tier 1 agent has its own model under the house bands (RULING AGENT-1 closed by the M4d pass).
  await expect(page.getByTestId('gallery-gate-agent-t1')).toHaveText('PASS (render, GATE-1)');
  // The citizens are gated against their own locked references, which have the passing host's build (RULING CITIZEN-1).
  for (const role of ['citizen', 'citizen-2']) await expect(page.getByTestId(`gallery-gate-${role}`)).toHaveText('PASS vs reference (CITIZEN-1)');
  await expect(page.getByTestId('gallery-gate-host-hidden')).toHaveText('PASS vs reference (CITIZEN-1, HIDE-1)');
  // The generated figures carry the pipeline's verdict and ruling (docs/art/figure-models.md section 4).
  await expect(page.getByTestId('gallery-gate-agent-t2')).toHaveText('PASS (render, GATE-1)');
  await expect(page.getByTestId('gallery-gate-host-revealed')).toHaveText('PASS vs reference (HOST-1)');
  await expect(page.getByTestId('gallery-gate-taker')).toHaveText('recorded, by eye (CREATURE-1, TAKER-1)');
  await expect(page.getByTestId('gallery-gate-fighter')).toHaveText('recorded, by eye (CREATURE-1, FIGHTER-1)');
  // Heights come from the meshes themselves: agent and host 1.2 units, taker 0.95, fighter 1.5 (figure-models.md 1).
  const rowText = async (role: string) => page.getByTestId(`gallery-row-${role}`).innerText();
  expect(await rowText('agent-t1')).toMatch(/1\.00 figure units/);
  expect(await rowText('agent-t2')).toMatch(/1\.00 figure units/);
  expect(await rowText('citizen')).toMatch(/1\.00 figure units/);
  expect(await rowText('citizen-2')).toMatch(/1\.00 figure units/);
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
