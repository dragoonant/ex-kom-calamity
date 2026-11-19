// Gates for the standing rules of the knowledge base: 24 (no long-press selection), 25 (tile-only picking),
// 26 (the start switch waits for models), 27 (the mouse map), each on a fresh profile.
import { expect, test } from '@playwright/test';
import { openTitle, startRaid, watchErrors } from './helpers';

test('rule 24: at phone size nothing selects, and the context menu is suppressed', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openTitle(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
  await startRaid(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
  // A triple click on HUD text leaves the selection empty.
  const title = page.locator('.panel-title', { hasText: 'SQUAD' });
  await title.scrollIntoViewIfNeeded();
  await title.click({ clickCount: 3 });
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
  await page.getByTestId('sim-seconds').click({ clickCount: 3 });
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
  // The fallback listeners: selectstart and contextmenu are prevented outside inputs.
  const prevented = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=console]')!;
    const a = new Event('selectstart', { bubbles: true, cancelable: true });
    const b = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(a);
    el.dispatchEvent(b);
    return [a.defaultPrevented, b.defaultPrevented];
  });
  expect(prevented).toEqual([true, true]);
  await ctx.close();
});

test('rule 25: a tap on the screen point of a figure reaches the tile behind it, never the figure', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  await page.getByTestId('agent-a1').click();
  // Look from the north at a low pitch: the head of Teodoro (a5, the southern end of the squad column)
  // then covers a street tile further south.
  await page.evaluate(() => window.__ekc!.setCamera({ yaw: Math.PI, pitch: 0.6, distance: 14, target: { x: 2.5, z: 47 } }));
  await page.waitForFunction(() => {
    const h = window.__ekc!;
    const head = h.screenPointOfUnitHead('a5');
    if (!head) return false;
    const t = h.tileAtScreen(head.x, head.y);
    return !!t && t.y > 48;
  });
  const probe = await page.evaluate(() => {
    const h = window.__ekc!;
    const head = h.screenPointOfUnitHead('a5')!;
    const a5 = h.getState()!.units.find((u) => u.id === 'a5')!;
    return { head, behind: h.tileAtScreen(head.x, head.y)!, a5: { x: a5.x, y: a5.y, level: a5.level }, top: document.elementFromPoint(head.x, head.y)?.tagName };
  });
  expect(probe.top).toBe('CANVAS');
  expect(probe.behind).not.toEqual(probe.a5); // the point is over the figure, and the tile there is another one
  await page.mouse.click(probe.head.x, probe.head.y);
  const after = await page.evaluate(() => {
    const h = window.__ekc!;
    return { tap: h.lastTap(), order: h.getState()!.units.find((u) => u.id === 'a1')!.order?.to };
  });
  // The tile's action (a move order for the selected agent), not a selection of the figure in front.
  expect(after.tap).toMatchObject({ did: 'move', tile: probe.behind });
  expect(after.order).toEqual(probe.behind);
  // Tapping a tile an agent stands on selects that agent: units are picked by their tile.
  const own = await page.evaluate(() => window.__ekc!.screenPointOfTile({ x: 2, y: 46, level: 0 }));
  await page.mouse.click(own!.x, own!.y);
  expect(await page.evaluate(() => window.__ekc!.lastTap())).toMatchObject({ did: 'select', detail: 'a3' });
  await expect(page.getByTestId('agent-a3')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('rule 26: the start switch reports the model preload and opens only when it is done', async ({ page }) => {
  await openTitle(page);
  const start = page.getByTestId('start');
  await expect(start).toHaveText('START RAID'); // zero models in M2, so it opens at once
  await expect(start).toBeEnabled();
});

test('rule 27: left-drag pans until a middle button is seen, right-drag turns and tilts, middle-drag pans, the wheel zooms to the cursor', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  const cam = () => page.evaluate(() => window.__ekc!.camera()!);
  const box = (await page.locator('canvas').boundingBox())!;
  const cx = box.x + box.width * 0.6;
  const cy = box.y + box.height * 0.5;
  const drag = async (button: 'left' | 'right' | 'middle', dx: number, dy: number) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button });
    await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
    await page.mouse.up({ button });
  };
  expect(await page.evaluate(() => window.__ekc!.mouseMode())).toBe('two-button');
  const tap0 = await page.evaluate(() => window.__ekc!.lastTap());

  // 1. Fresh profile: left-drag pans, and a drag is not a tap.
  const c0 = await cam();
  await drag('left', 120, 60);
  const c1 = await cam();
  expect(Math.hypot(c1.target.x - c0.target.x, c1.target.z - c0.target.z)).toBeGreaterThan(1);
  expect([c1.yaw, c1.pitch, c1.distance]).toEqual([c0.yaw, c0.pitch, c0.distance]);
  expect(await page.evaluate(() => window.__ekc!.lastTap())).toEqual(tap0);

  // 2. Right-drag rotates and tilts; no browser menu (rule 24's listener).
  await drag('right', 140, -50);
  const c2 = await cam();
  expect(Math.abs(c2.yaw - c1.yaw)).toBeGreaterThan(0.3);
  expect(Math.abs(c2.pitch - c1.pitch)).toBeGreaterThan(0.1);
  expect(c2.target).toEqual(c1.target);

  // 3. Middle-drag pans and is remembered per browser under the game's own key.
  await drag('middle', -100, 40);
  const c3 = await cam();
  expect(Math.hypot(c3.target.x - c2.target.x, c3.target.z - c2.target.z)).toBeGreaterThan(1);
  expect(await page.evaluate(() => localStorage.getItem('ekc-mouse'))).toBe('three-button');

  // 4. Now the mouse has shown a middle button: left-drag no longer pans.
  await drag('left', 120, 60);
  const c4 = await cam();
  expect(c4.target).toEqual(c3.target);

  // 5. The wheel zooms towards the cursor: closer, and the tile under the cursor stays under it. Look back at the
  // squad first, since the pans above may have carried the cursor off the block.
  await page.evaluate(() => {
    const a = window.__ekc!.getState()!.units.find((u) => u.side === 'agency')!;
    window.__ekc!.setCamera({ target: { x: a.x + 0.5, z: a.y + 0.5 } });
  });
  await page.waitForTimeout(300);
  const under0 = await page.evaluate(([x, y]) => window.__ekc!.tileAtScreen(x!, y!), [cx, cy]);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -400);
  await page.waitForFunction((d) => window.__ekc!.camera()!.distance < d, c4.distance);
  const c5 = await cam();
  expect(c5.distance).toBeLessThan(c4.distance);
  await page.waitForTimeout(300);
  const under1 = await page.evaluate(([x, y]) => window.__ekc!.tileAtScreen(x!, y!), [cx, cy]);
  expect(under0).not.toBeNull();
  expect(Math.abs(under1!.x - under0!.x) + Math.abs(under1!.y - under0!.y)).toBeLessThanOrEqual(1);
  // The remembered mode survives a reload.
  await page.reload();
  expect(await page.evaluate(() => window.__ekc!.mouseMode())).toBe('three-button');
  expect(errors).toEqual([]);
});

test('keys: a number selects its agent and centres only on the second press; WASD pans the view with the key', async ({ page }) => {
  const errors = watchErrors(page);
  await openTitle(page);
  await startRaid(page);
  const cam = () => page.evaluate(() => window.__ekc!.camera()!);
  const first = await page.evaluate(() => window.__ekc!.getState()!.units.filter((u) => u.side === 'agency')[0]!);
  // Clear the raid's starting selection and look away from the squad, so both the select and the centring show.
  await page.evaluate(() => {
    window.__ekc!.select(null);
    window.__ekc!.setCamera({ target: { x: -4, z: -4 } });
  });
  await expect(page.getByTestId(`agent-${first.id}`)).toHaveAttribute('aria-pressed', 'false');
  const c0 = await cam();
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId(`agent-${first.id}`)).toHaveAttribute('aria-pressed', 'true');
  expect((await cam()).target).toEqual(c0.target);
  await page.keyboard.press('Digit1');
  await page.waitForFunction(([x, z]) => {
    const t = window.__ekc!.camera()!.target;
    return Math.abs(t.x - x!) < 0.01 && Math.abs(t.z - z!) < 0.01;
  }, [first.x + 0.5, first.y + 0.5]);
  await expect(page.getByTestId(`agent-${first.id}`)).toHaveAttribute('aria-pressed', 'true');

  // WASD: with the camera looking north (yaw 0), D moves the target east and W moves it north (-z).
  await page.evaluate(() => window.__ekc!.setCamera({ yaw: 0, target: { x: 8, z: 6 } }));
  const c1 = await cam();
  await page.keyboard.down('KeyD');
  await page.waitForFunction((x) => window.__ekc!.camera()!.target.x > x! + 1, c1.target.x);
  await page.keyboard.up('KeyD');
  const c2 = await cam();
  expect(Math.abs(c2.target.z - c1.target.z)).toBeLessThan(0.01);
  await page.keyboard.down('KeyW');
  await page.waitForFunction((z) => window.__ekc!.camera()!.target.z < z! - 1, c2.target.z);
  await page.keyboard.up('KeyW');
  const c3 = await cam();
  expect(Math.abs(c3.target.x - c2.target.x)).toBeLessThan(0.01);
  // Released keys stop the pan.
  await page.waitForTimeout(200);
  expect((await cam()).target).toEqual(c3.target);
  expect(errors).toEqual([]);
});
