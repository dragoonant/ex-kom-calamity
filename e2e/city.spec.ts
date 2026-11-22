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

test('the city opens paused, its clock runs through the hook, and slips reach the city wire', async ({ page }) => {
  const errors = watchErrors(page);
  await startCampaign(page);
  expect(await page.evaluate(() => window.__ekcCity!.isPaused())).toBe(true);
  await expect(page.getByTestId('city-clock')).toContainText('08:00');
  await page.evaluate(() => window.__ekcCity!.advanceTicks(6 * 24 * 3));
  await expect(page.getByTestId('city-clock')).toContainText('DAY 4');
  // CWIRE-1: the organism's slips run on the wire across the top, not in the tray.
  const wire = await page.evaluate(() => window.__ekcCity!.wire());
  expect(wire.some((t) => t.kind.startsWith('slip-'))).toBe(true);
  const tray = await page.evaluate(() => window.__ekcCity!.tray());
  expect(tray.some((t) => t.kind.startsWith('slip-'))).toBe(false);
  await expect(page.getByTestId('city-wire')).toBeVisible();
  await expect(page.getByTestId('wire-item').first()).toBeVisible();
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
  // TRAVEL-2: the watcher drives out first, and the board draws its car and route.
  const out = await page.evaluate(() => window.__ekcCity!.state()!.agents.filter((a) => a.building).map((a) => [a.status, a.building]));
  expect(out).toEqual([['travelling', 'city-hall']]);
  await page.waitForTimeout(400);
  const drawn = await page.evaluate(() => window.__ekcCity!.overlays());
  expect(drawn.driving).toBe(1);
  expect(drawn.dashes).toBeGreaterThan(0);
  await page.evaluate(() => {
    const c = window.__ekcCity!;
    const a = c.state()!.agents.find((x) => x.building === 'city-hall')!;
    c.advanceTicks(a.until - c.state()!.tick + 6 * 12);
  });
  await expect(page.getByTestId('building-report')).toContainText('Last report');
  // The report draws a ring on the lot, and the watcher is on the drive home.
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__ekcCity!.overlays());
  expect(after.rings).toBe(1);
  expect(after.driving).toBe(1);
  // Hover names a building on the board (the label layer takes no pointer).
  const p2 = await page.evaluate(() => window.__ekcCity!.screenPointOfBuilding('records-office'));
  await page.mouse.move(p2!.x, p2!.y);
  await expect(page.getByTestId('city-tag-hover')).toContainText(/RECORDS OFFICE/i);
});

test('a building name on the city wire opens its file card, and WATCH and RAID work from it (CWIRE-2, CWIRE-3)', async ({ page }) => {
  const errors = watchErrors(page);
  await startCampaign(page);
  // Run until the wire names a building outright.
  const id = await page.evaluate(() => {
    const c = window.__ekcCity!;
    for (let i = 0; i < 40; i++) {
      const named = c.wire().slice(-12).reverse().find((t) => t.building); // the crawl shows the newest 12
      if (named) return named.building!;
      c.advanceTicks(6 * 12);
    }
    return null;
  });
  expect(id).not.toBeNull();
  // HOLD stops the crawl, so the name stands still under the pointer (the mouse over it holds it too).
  await page.getByTestId('wire-hold').click();
  await expect(page.getByTestId('wire-track')).toHaveClass(/wire-track-held/);
  // Where the held crawl stopped is chance; under reduced motion it stands at the front and scrolls by hand (CWIRE-3).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const link = page.getByTestId(`wire-building-${id}`).first();
  await link.click();
  expect(await page.evaluate(() => window.__ekcCity!.selected())).toBe(id);
  await expect(page.getByTestId('building-card')).toBeVisible();
  await page.getByTestId('watch').click();
  const out = await page.evaluate((b) => window.__ekcCity!.state()!.agents.filter((a) => a.building === b).length, id);
  expect(out).toBe(1);
  await expect(page.getByTestId('raid')).toBeEnabled();
  // An organisation's or a district's name opens the list of its buildings; a pick there selects one.
  const listed = await page.evaluate(() => window.__ekcCity!.wire().slice(-12).find((t) => t.org || t.district));
  if (listed) {
    const tid = listed.org ? `wire-org-${listed.org}` : `wire-district-${listed.district}`;
    const btn = page.getByTestId(tid).first();
    if (await btn.count()) {
      await btn.click();
      await expect(page.getByTestId('wire-list')).toBeVisible();
      const pick = page.locator('[data-testid^="wire-pick-"]').first();
      const pid = (await pick.getAttribute('data-testid'))!.replace('wire-pick-', '');
      await pick.click();
      await expect(page.getByTestId('wire-list')).toBeHidden();
      expect(await page.evaluate(() => window.__ekcCity!.selected())).toBe(pid);
    }
  }
  expect(errors).toEqual([]);
});

test('a raid flies to the door, pauses there, and the squad can handle it', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => window.__ekcCity!.select('ambrel-works'));
  await page.getByTestId('raid').click();
  await page.evaluate(() => window.__ekcCity!.advanceTicks(window.__ekcCity!.state()!.raid!.arriveTick - window.__ekcCity!.state()!.tick));
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
  await page.evaluate(() => window.__ekcCity!.advanceTicks(window.__ekcCity!.state()!.raid!.arriveTick - window.__ekcCity!.state()!.tick));
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
  await page.evaluate(() => window.__ekcCity!.advanceTicks(window.__ekcCity!.state()!.raid!.arriveTick - window.__ekcCity!.state()!.tick));
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

test('a fought wreck on open ground shows the drive core with its burn clock (OBJ-4)', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => {
    const h = window.__ekcCity!;
    const s = JSON.parse(JSON.stringify(h.state()!));
    s.act = 3;
    s.actDay = 150;
    s.tick = 16 * 6 + 150 * 144;
    s.biomass = 0;
    s.lab.done.push('source-trace', 'restraints');
    s.crashes.push({ id: 'crash7', kind: 'seeder', x: 55, y: 35, building: null, survivors: 3, until: s.tick + 144 });
    h.load(s);
    h.order({ type: 'raid', side: 'agency', building: 'crash7', agents: ['ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'ag6'] });
    for (let i = 0; i < 20 && !h.state()!.raid!.arrived; i++) h.advanceTicks(6);
  });
  await page.getByTestId('act-continue').click();
  await page.getByTestId('fight').click();
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__ekc!.getState()!.battleId)).toBe('wreck-raid');
  await expect(page.getByTestId('core-line')).toContainText('DRIVE CORE');
  await page.evaluate(() => window.__ekc!.select('a1'));
  await expect(page.getByTestId('capture')).toBeVisible();
  await expect(page.getByTestId('evacuate')).toBeVisible();
});
