import { expect, test } from '@playwright/test';
import { ib, toBattle } from './helpers';

test('title, briefing with voiced lines, battle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.click('[data-testid=new]');
  await expect(page.getByTestId('speaker')).toContainText('Marrow Yard');
  await page.click('text=Next'); await page.click('text=Next');
  await expect(page.getByTestId('yard-plan')).toBeVisible();
  await page.click('[data-testid=skip-brief]');
  await page.click('[data-testid=deploy]');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('phase')).toHaveText('YOUR PHASE');
  await page.screenshot({ path: 'e2e/out/battle.png' });
  expect(errors).toEqual([]);
});

test('a whole contract: battle to debrief to hangar to the next contract', async ({ page }) => {
  await toBattle(page);
  for (let i = 0; i < 40; i++) {
    const done = await ib(page, 'window.__ib.autoplay(25, 0), !!window.__ib.state().live.result');
    if (done) break;
  }
  await ib(page, 'window.__ib.skip()');
  await expect(page.getByTestId('result')).toBeVisible();
  const win = await ib(page, 'window.__ib.state().live.result.winner === "player"');
  await page.click('[data-testid=to-debrief]');
  await expect(page.getByTestId('debrief')).toBeVisible();
  if (win) {
    await page.click('[data-testid=to-hangar]');
    await expect(page.getByTestId('hangar')).toBeVisible();
    await expect(page.getByTestId('credits')).not.toHaveText('1,500 cr');
    await page.click('[data-testid=next-contract]');
    await expect(page.getByTestId('next')).toBeVisible();
  } else {
    await page.click('[data-testid=retry]');
    await expect(page.getByTestId('hud')).toBeVisible();
  }
});

test('the attack preview shows engine numbers and firing resolves', async ({ page }) => {
  await toBattle(page);
  // Walk the AI forward until a Lantern can fire, then open the preview through the tile taps.
  let opened = false;
  for (let i = 0; i < 80 && !opened; i++) {
    const t = await ib(page, `(() => { const s = window.__ib.state(); if (s.live.phase !== 'player') { window.__ib.autoplay(1, 0); return null; } const a = window.__ib.suggest(); if (a && a.type === 'attack') return a; window.__ib.autoplay(1, 0); return null; })()`) as { unit: string; target: string } | null;
    if (!t) continue;
    const pos = await ib(page, `(() => { const s = window.__ib.state().live; const u = s.units.find((x) => x.id === '${t.unit}'), v = s.units.find((x) => x.id === '${t.target}'); return [u.x, u.y, v.x, v.y]; })()`) as number[];
    await ib(page, `window.__ib.tapTile(${pos[0]}, ${pos[1]})`);
    await ib(page, `window.__ib.tapTile(${pos[2]}, ${pos[3]})`);
    opened = true;
  }
  await expect(page.getByTestId('attack-panel')).toBeVisible();
  await expect(page.getByTestId('attack-panel')).toContainText('%');
  const before = await ib(page, 'window.__ib.state().live.turnCount');
  await page.locator('[data-testid^=fire-]').first().click();
  await ib(page, 'window.__ib.skip()');
  expect(await ib(page, 'window.__ib.state().live.turnCount')).toBe((before as number) + 1);
});
