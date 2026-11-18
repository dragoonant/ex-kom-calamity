// npm run shot [-- url]  Screenshots of the title, a raid in progress and the whole block through Playwright
// (KB gotchas: the built-in browser pane can lose WebGL and throttles frames; use this instead).
// Writes docs/screenshots/m3-*.png (the M2 set stays as the M2 record). Time moves through the deterministic hook;
// the hostile AI (normal) runs inside it, so the shots show opponents acting.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? `http://localhost:${process.env.PW_PORT ?? 5181}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForSelector('[data-testid=title]');
await page.evaluate(() => localStorage.removeItem('ekc-save'));
await page.reload();
await page.waitForSelector('[data-testid=start]');
await page.screenshot({ path: 'docs/screenshots/m3-title.png' });
await page.click('[data-testid=start]');
await page.waitForSelector('[data-testid=console]');
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const h = window.__ekc;
  // Seed-independent orders: breach the west wall of Civic Savings, then send the squad in.
  h.order({ type: 'blast', side: 'agency', unit: 'a3', at: { x: 5, y: 44, level: 0 } });
  h.advance(1);
  const go = [['a1', 8, 46], ['a2', 7, 47], ['a3', 6, 44], ['a4', 4, 47], ['a5', 4, 43], ['a6', 3, 46]];
  for (const [unit, x, y] of go) h.order({ type: 'move', side: 'agency', unit, to: { x, y, level: 0 } });
  h.advance(7);
  h.select('a1');
  h.setCamera({ yaw: 0.9, pitch: 0.9, distance: 19, target: { x: 8, z: 45 } });
  const s = h.getState();
  return { seed: s.seed, tick: s.tick, score: s.score, seen: h.getView().units.length };
});
await page.waitForTimeout(900);
const wall = await page.evaluate(() => window.__ekc.screenPointOfTile({ x: 10, y: 44, level: 0 }));
if (wall) await page.mouse.move(wall.x, wall.y - 5, { steps: 4 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'docs/screenshots/m3-battle.png' });
await page.evaluate(() => {
  const h = window.__ekc;
  h.setLevel(6);
  h.setCamera({ distance: 78, pitch: 0.8, yaw: 0.6, target: { x: 30, z: 30 } });
});
await page.mouse.move(700, 20);
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/screenshots/m3-block.png' });
console.log(JSON.stringify(info), errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno console errors');
await browser.close();
