// M6/M7: the city switchboard (docs/spec/20-city.md). Time moves through window.__ekcCity.advance (CLOCK-6), so the
// test never waits on the frame clock (KB recipe section 11).
import { expect, test, type Page } from '@playwright/test';
import { openTitle, watchErrors } from './helpers';
import type { CityHook } from '../src/client/city/hook';

declare global {
  interface Window {
    __ekcCity?: CityHook;
  }
}

async function startCampaign(page: Page, seed = 7): Promise<void> {
  await openTitle(page);
  await page.evaluate(() => localStorage.removeItem('ekc-campaign'));
  await page.getByTestId('campaign-new').click();
  await expect(page.getByTestId('city')).toBeVisible();
  // A fixed seed for the test: start again through the hook (the switch seeds from the clock).
  await page.evaluate((s) => window.__ekcCity!.start(s), seed);
  await expect(page.getByTestId('city-console')).toBeVisible();
}

test('the city opens paused, its clock runs through the hook, and slips reach the tray', async ({ page }) => {
  const errors = watchErrors(page);
  await startCampaign(page);
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  await expect(page.getByTestId('city-clock')).toContainText('08:00');
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 24 * 3));
  await expect(page.getByTestId('city-clock')).toContainText('DAY 4');
  const tray = await page.evaluate(() => window.__ekcCity!.tray());
  expect(tray.some((t) => t.kind.startsWith('slip-'))).toBe(true);
  // CVIEW-1: the page's view never carries the infiltration.
  const leaks = await page.evaluate(() => window.__ekcCity!.view()!.orgs.every((o) => o.infiltration === -1));
  expect(leaks).toBe(true);
  expect(errors).toEqual([]);
});

test('a tap on a building opens its card through the one pick mesh, and WATCH sends an agent', async ({ page }) => {
  await startCampaign(page);
  await page.waitForTimeout(500);
  const pt = await page.evaluate(() => window.__ekcCity!.screenPointOfBuilding('city-hall'));
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await expect(page.getByTestId('building-name')).toHaveText(/CITY HALL/);
  await page.getByTestId('watch').click();
  const watching = await page.evaluate(() => window.__ekcCity!.state()!.agents.filter((a) => a.status === 'watching').map((a) => a.building));
  expect(watching).toEqual(['city-hall']);
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 13));
  await expect(page.getByTestId('building-report')).toContainText('Last report');
});

test('a raid flies to the door, pauses there, and the squad can handle it', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('ambrel-works'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await expect(page.getByTestId('door')).toBeVisible();
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  await page.getByTestId('auto-resolve').click();
  await expect(page.getByTestId('door')).toBeHidden();
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('resolved');
});

test('the campaign saves and Continue reopens it to the same hash', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 30));
  await page.evaluate(() => window.__ekcCity!.order({ type: 'recruit', side: 'agency' }));
  const hash = await page.evaluate(() => window.__ekcCity!.hash());
  await page.reload();
  await expect(page.getByTestId('campaign-continue')).toBeVisible();
  await expect(page.getByTestId('campaign-summary')).toContainText('Day 2');
  await page.getByTestId('campaign-continue').click();
  await expect(page.getByTestId('city')).toBeVisible();
  expect(await page.evaluate(() => window.__ekcCity!.hash())).toBe(hash);
});

test('FIGHT IT opens the real battle on the building site; its result returns to the city (M7)', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('automat-row'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await page.getByTestId('fight').click();
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 });
  const battle = await page.evaluate(() => window.__ekc!.getState()!.battleId);
  expect(battle).toBe('automat-raid');
  // Withdraw: the battle ends, the report shows, and closing it hands the result back.
  await page.evaluate(() => window.__ekc!.order({ type: 'withdraw', side: 'agency' }));
  await expect(page.getByTestId('close-report')).toBeVisible();
  await page.getByTestId('close-report').click();
  await expect(page.getByTestId('city')).toBeVisible();
  const raid = await page.evaluate(() => window.__ekcCity!.state()!.raid);
  expect(raid).toBeNull();
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('resolved');
});

test('a raid stocks the lab shelf and the LAB tab starts and finishes research (M5b)', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('ambrel-works'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await page.getByTestId('auto-resolve').click();
  const shelf = await page.evaluate(() => window.__ekcCity!.state()!.shelf);
  test.skip(shelf.host < 1, 'this seed lost the raid; the shelf stays empty');
  await page.getByTestId('tab-lab').click();
  await expect(page.getByTestId('shelf')).toContainText('host bodies');
  await page.getByTestId('research-restraints').click();
  await expect(page.getByTestId('lab-project')).toContainText('Stun baton');
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 25));
  expect(await page.evaluate(() => window.__ekcCity!.state()!.lab.done)).toContain('restraints');
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds).toContain('research-done');
});

test('a seeder pauses the city and opens the SKY tab; INTERCEPT sends the cars into a dogfight (M5c)', async ({ page }) => {
  await startCampaign(page);
  // A prepared sky: day 30 at midnight with biomass to spend (AIR-2), through the hook's test seam.
  await page.evaluate(() => {
    const h = window.__ekcCity!;
    const s = JSON.parse(JSON.stringify(h.state()!));
    s.tick = 16 * 6 + 29 * 144;
    s.biomass = 100;
    h.load(s);
    h.order({ type: 'launch', side: 'hostile', kind: 'seeder', target: 'city-hall' } as never);
  });
  await expect(page.getByTestId('sky-card')).toBeVisible();
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  const craftId = await page.evaluate(() => window.__ekcCity!.state()!.craft[0]!.id);
  await page.getByTestId(`intercept-${craftId}`).click();
  const flying = await page.evaluate(() => window.__ekcCity!.state()!.cars.filter((c) => c.status === 'flying').length);
  expect(flying).toBe(2);
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 10));
  const kinds = await page.evaluate(() => window.__ekcCity!.tray().map((t) => t.kind));
  expect(kinds.some((k) => k === 'dogfight' || k === 'downed')).toBe(true);
});

test('act 3: the act card, an assault on headquarters held, and the final raid wins the campaign', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => {
    const h = window.__ekcCity!;
    const s = JSON.parse(JSON.stringify(h.state()!));
    s.act = 3;
    s.actDay = 150;
    s.tick = 16 * 6 + 150 * 144;
    s.hqFound = true;
    s.biomass = 200;
    s.lab.done.push('source-trace');
    for (const o of s.orgs) o.infiltration = 0;
    s.tuning.res.winMinPercent = 100;
    s.tuning.res.winMaxPercent = 100;
    s.tuning.res.downPerHostilePercent = 0;
    s.tuning.res.downOnLossPercent = 0;
    h.load(s);
  });
  await expect(page.getByTestId('act-cover')).toContainText('PERFECT DAY');
  await page.getByTestId('act-continue').click();
  await page.evaluate(() => window.__ekcCity!.order({ type: 'assault', side: 'hostile' } as never));
  await expect(page.getByTestId('defence')).toBeVisible();
  await page.getByTestId('defence-auto').click();
  await expect(page.getByTestId('defence')).toBeHidden();
  await page.evaluate(() => window.__ekcCity!.select('ambrel-tower'));
  await expect(page.getByTestId('building-card')).toContainText('THE SOURCE');
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(12));
  await expect(page.getByTestId('door')).toContainText('THE SOURCE');
  await page.getByTestId('auto-resolve').click();
  await expect(page.getByTestId('city-over')).toContainText('THE CITY IS SAVED');
});

test("FIGHT IT at an assault opens the headquarters map with the city's own agents; a withdrawal loses headquarters (CJOIN-3)", async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => {
    const h = window.__ekcCity!;
    const s = JSON.parse(JSON.stringify(h.state()!));
    s.act = 3;
    s.actDay = 150;
    s.tick = 16 * 6 + 150 * 144;
    s.hqFound = true;
    s.biomass = 200;
    s.lab.done.push('source-trace', 'shell-plate');
    s.shop.stock['shell-plate'] = 2;
    h.load(s);
    h.order({ type: 'assault', side: 'hostile' } as never);
  });
  await page.getByTestId('act-continue').click();
  await page.getByTestId('defence-fight').click();
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 });
  const units = await page.evaluate(() => window.__ekc!.getState()!.units.map((u) => ({ side: u.side, name: u.name, template: u.template })));
  const city = await page.evaluate(() => window.__ekcCity!.state()!.agents.filter((a) => a.status === 'ready').slice(0, 6).map((a) => a.name));
  expect(await page.evaluate(() => window.__ekc!.getState()!.battleId)).toBe('hq-defence');
  expect(units.filter((u) => u.side === 'agency').map((u) => u.name)).toEqual(city);
  expect(units.filter((u) => u.template === 'agent-t2')).toHaveLength(2);
  expect(units.filter((u) => u.side === 'hostile')).toHaveLength(6);
  await page.evaluate(() => window.__ekc!.order({ type: 'withdraw', side: 'agency' }));
  await page.getByTestId('close-report').click();
  await expect(page.getByTestId('city-over')).toContainText('LOST');
});
