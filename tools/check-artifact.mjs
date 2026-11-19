// node tools/check-artifact.mjs [out.png]   (after npm run build && npm run artifact)
// Opens dist-artifact/preview.html as a local file (what the private Artifact serves, PLAN.md D12), starts a raid,
// shows the whole block, advances two seconds through the hook and prints the perf report, the fx and sound counts
// and any console error. KB gotchas: the built-in browser pane is not used; Playwright does the looking.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const out = process.argv[2] ?? 'e2e/out/artifact-preview.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL('dist-artifact/preview.html').href);
await page.waitForSelector('[data-testid=start]');
await page.click('[data-testid=start]');
await page.waitForSelector('[data-testid=console]');
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const h = window.__ekc;
  h.setLevel(6);
  h.setCamera({ yaw: 0.6, pitch: 0.8, distance: 78, target: { x: 30, z: 30 } });
  h.advance(2);
  return { tick: h.getState().tick, fx: h.fx().length, audio: h.audio().played };
});
await page.waitForTimeout(800);
console.log(JSON.stringify({ ...r, perf: await page.evaluate(() => window.__ekc.perf()) }));
await page.screenshot({ path: out });
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
