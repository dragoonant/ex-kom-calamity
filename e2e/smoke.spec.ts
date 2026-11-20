import { expect, test } from '@playwright/test';
import { noNativeTooltips, openTitle, startRaid, sweepText, watchErrors } from './helpers';

test('loads, starts a raid paused, takes an order through a tile tap, and time moves only through the hook while paused', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  // D10: the placeholder title only; the codename never appears in game text.
  await expect(page.locator('.title-name')).toHaveText('CITY OF TOMORROW');
  expect(await page.evaluate(() => document.body.innerText + document.title)).not.toMatch(/kom|calamity/i);
  await sweepText(page);
  await noNativeTooltips(page);

  await startRaid(page);
  // A new raid starts paused (RULING SAV-4) on one building in its street (MAP-10): Civic Savings, 3 floors and a roof.
  expect(await page.evaluate(() => window.__ekc!.isPaused())).toBe(true);
  await expect(page.getByTestId('pause')).toHaveText('PAUSED');
  const map = await page.evaluate(() => {
    const s = window.__ekc!.getState()!;
    return { w: s.width, d: s.depth, levels: s.levels, tick: s.tick, agents: s.units.filter((u) => u.side === 'agency').length };
  });
  expect(map).toEqual({ w: 26, d: 24, levels: 4, tick: 0, agents: 6 });
  await expect(page.getByTestId('level-3')).toBeVisible();
  await expect(page.getByTestId('level-4')).toHaveCount(0);

  // Paused: wall time passes, the tick does not (TIME-2).
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__ekc!.getState()!.tick)).toBe(0);

  // An order while paused: select Vance from the squad panel, tap a street tile with the real mouse.
  await page.getByTestId('agent-a1').click();
  const target = { x: 3, y: 8, level: 0 };
  const pt = await page.evaluate((t) => window.__ekc!.screenPointOfTile(t), target);
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  const ordered = await page.evaluate(() => {
    const h = window.__ekc!;
    return { tap: h.lastTap(), order: h.getState()!.units.find((u) => u.id === 'a1')!.order?.to, tick: h.getState()!.tick };
  });
  expect(ordered.tap).toMatchObject({ did: 'move', tile: target });
  expect(ordered.order).toEqual(target);
  expect(ordered.tick).toBe(0); // an order moves no time
  await expect(page.getByTestId('order-line')).toContainText('Moving to 3,8');

  // The deterministic hook advances time whatever the frame rate (TIME-6).
  const after = await page.evaluate(() => {
    const h = window.__ekc!;
    h.advance(3);
    const s = h.getState()!;
    const a1 = s.units.find((u) => u.id === 'a1')!;
    return { tick: s.tick, at: { x: a1.x, y: a1.y, level: a1.level }, order: a1.order };
  });
  expect(after.tick).toBe(30);
  expect(after.at).toEqual(target);
  expect(after.order).toBeNull();
  await expect(page.getByTestId('sim-seconds')).toHaveText('00:03.0');

  // Unpausing lets the frame loop issue ticks; pausing stops them.
  await page.getByTestId('pause').click();
  await page.waitForFunction(() => window.__ekc!.getState()!.tick > 32, undefined, { timeout: 20_000 });
  await page.keyboard.press('Space');
  const frozen = await page.evaluate(() => window.__ekc!.getState()!.tick);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__ekc!.getState()!.tick)).toBe(frozen);

  // Hovering a tile fills the file card from query.* (rule 8): kind, material and hp.
  const wall = await page.evaluate(() => window.__ekc!.screenPointOfTile({ x: 4, y: 7, level: 0 }));
  await page.mouse.move(wall!.x, wall!.y - 6, { steps: 5 });
  await expect(page.getByTestId('tile-line')).toContainText(/Civic Savings/);
  await sweepText(page);
  await noNativeTooltips(page);
  expect(errors).toEqual([]);
});

test('a charge thrown from the console breaks a wall, and the floor selector cuts the building away by level', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  await page.getByTestId('agent-a3').click();
  await expect(page.getByTestId('charge')).toContainText('CHARGE 2');
  await page.getByTestId('charge').click();
  await expect(page.getByTestId('mode-banner')).toBeVisible();
  // Lindqvist is at (2,12); the west wall of Civic Savings is the column x = 4.
  const at = { x: 4, y: 10, level: 0 };
  const pt = await page.evaluate((t) => window.__ekc!.screenPointOfTile(t), at);
  await page.mouse.move(pt!.x, pt!.y - 4, { steps: 4 });
  await expect(page.getByTestId('blast-preview')).toContainText('160 to this tile');
  await page.mouse.click(pt!.x, pt!.y - 4);
  const tap = await page.evaluate(() => window.__ekc!.lastTap());
  expect(tap).toMatchObject({ did: 'blast' });
  await expect(page.getByTestId('mode-banner')).toHaveCount(0);
  const result = await page.evaluate((t) => {
    const h = window.__ekc!;
    const before = h.getState()!.tiles.find((x) => x.x === t.x && x.y === t.y && x.level === 0)!;
    const events = h.advance(1);
    const s = h.getState()!;
    const tile = s.tiles.find((x) => x.x === t.x && x.y === t.y && x.level === 0)!;
    return { before: before.kind, kind: tile.kind, types: [...new Set(events.map((e) => e.type))], charges: s.units.find((u) => u.id === 'a3')!.charges };
  }, tap!.tile);
  expect(result.types).toContain('blast');
  expect(result.types).toContain('tileDestroyed');
  expect(result.charges).toBe(1);
  await expect(page.getByTestId('charge')).toContainText('CHARGE 1');
  await expect(page.getByTestId('tray')).toContainText('charge goes off');

  // Floor selector: level 3 (the roof) shows the whole building; ground shows only the ground floor (the cut-away).
  await page.getByTestId('level-3').click();
  expect(await page.evaluate(() => window.__ekc!.level())).toBe(3);
  const roof = await page.evaluate(() => {
    const h = window.__ekc!;
    h.setCamera({ distance: 40, target: { x: 12, z: 12 } });
    return null;
  });
  expect(roof).toBeNull();
  await page.waitForFunction(() => {
    const h = window.__ekc!;
    const p = h.screenPointOfTile({ x: 12, y: 12, level: 3 });
    if (!p) return false;
    const t = h.tileAtScreen(p.x, p.y);
    return !!t && t.level === 3; // the roof is what the pointer meets
  });
  await page.keyboard.press('PageDown');
  expect(await page.evaluate(() => window.__ekc!.level())).toBe(2);
  await page.getByTestId('level-0').click();
  await page.waitForFunction(() => {
    const h = window.__ekc!;
    const p = h.screenPointOfTile({ x: 12, y: 12, level: 0 });
    if (!p) return false;
    const t = h.tileAtScreen(p.x, p.y);
    return !!t && t.level === 0;
  });
  await sweepText(page);
  expect(errors).toEqual([]);
});
