// node tools/perf.mjs [url]   Real frame times of the whole block through Chromium with the machine's GPU
// (headless SwiftShader in the e2e counts draws and triangles but cannot time a frame; KB gotchas). Opens the raid,
// shows every level, lets the frame loop run for a few seconds with time moving, then prints window.__ekc.perf():
// mean and worst frame in ms, draw calls, triangles, layer counts. Run on the owner's machine; the number goes into
// docs/art/tile-set.md section 6 and STATUS.md. Falls back to the headless shell if the GPU channel is missing.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? `http://localhost:${process.env.PW_PORT ?? 5187}/`;
const args = ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization', '--enable-zero-copy'];
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true, args });
} catch {
  browser = await chromium.launch({ headless: true, args });
}
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForSelector('[data-testid=start]');
await page.evaluate(() => localStorage.removeItem('ekc-save'));
await page.reload();
await page.waitForSelector('[data-testid=start]');
await page.click('[data-testid=start]');
await page.waitForSelector('[data-testid=console]');
await page.waitForTimeout(800);
const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
const run = async (label, setup) => {
  await page.evaluate(setup);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__ekc.perf(); // warm
    window.__ekc.resume();
  });
  await page.waitForTimeout(4000);
  const p = await page.evaluate(() => {
    window.__ekc.pause();
    return window.__ekc.perf();
  });
  console.log(`${label}: frame mean ${p.frameMsMean.toFixed(1)} ms (worst ${p.frameMsMax.toFixed(1)}), about ${(1000 / Math.max(0.1, p.frameMsMean)).toFixed(0)} fps; ${p.drawCalls} draws, ${p.triangles} triangles, ${p.tileInstances} tile instances; layers ${JSON.stringify(p.layers)}`);
  return p;
};
console.log(`renderer: ${gpu}`);
await run('street (level 0, close)', () => {
  const h = window.__ekc;
  h.select('a1');
  h.setCamera({ yaw: 0.9, pitch: 0.75, distance: 17, target: { x: 8, z: 45 } });
});
await run('whole block (level 6, far)', () => {
  const h = window.__ekc;
  h.setLevel(6);
  h.setCamera({ yaw: 0.6, pitch: 0.8, distance: 78, target: { x: 30, z: 30 } });
});
await run('cut-away (level 3, Halcyon Arms)', () => {
  const h = window.__ekc;
  h.setLevel(3);
  h.setCamera({ yaw: 0.4, pitch: 0.95, distance: 20, target: { x: 15, z: 12 } });
});
if (errors.length) console.log(`ERRORS:\n${errors.join('\n')}`);
await browser.close();
