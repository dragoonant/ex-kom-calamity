// node tools/combat-shots.mjs <outdir> : deploy, fast-forward, then capture an attack mid-presentation and a later round.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [, , out = 'shots', w = '1440', h = '900'] = process.argv;
mkdirSync(out, { recursive: true });
const port = process.env.PW_PORT ?? '5231';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${port}/`);
await p.click('[data-testid=new]');
await p.click('[data-testid=skip-brief]');
await p.click('[data-testid=deploy]');
await p.waitForSelector('[data-testid=battle]');
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/c0-start.png` });
// Fast-forward until a player attack is the next AI order.
let shots = 0;
for (let i = 0; i < 120 && shots < 2; i++) {
  const next = await p.evaluate(() => {
    const g = window.__ib.state();
    if (!g.live || g.live.result) return 'over';
    if (g.live.phase !== 'player') { window.__ib.skip(); window.__ib.advance(0.5); return 'wait'; }
    return 'player';
  });
  if (next === 'over') break;
  if (next !== 'player') continue;
  const kind = await p.evaluate(() => { window.__ib.autoplay(1, 0.0001); const s = window.__ib.state(); return s.queue; });
  const isAttack = await p.evaluate(() => { const s = window.__ib.state(); return s.presenting; });
  // Re-run the last order with presentation if it was an attack: easiest is to watch the next attack live.
  const att = await p.evaluate(() => {
    const g = window.__ib.state();
    return g.live && g.live.phase === 'player';
  });
  if (att && i > 6) {
    await p.evaluate(() => { window.__ibManual = true; });
    const fired = await p.evaluate(() => {
      const before = window.__ib.state().live.turnCount;
      window.__ib.autoplay(1, 0.0001);
      return before;
    });
    await p.evaluate(() => window.__ib.advance(0.75));
    await p.screenshot({ path: `${out}/c${++shots}-a.png` });
    await p.evaluate(() => window.__ib.advance(0.5));
    await p.screenshot({ path: `${out}/c${shots}-b.png` });
    await p.evaluate(() => window.__ib.skip());
    await p.evaluate(() => { window.__ibManual = false; });
  }
}
await p.evaluate(() => window.__ib.autoplay(30, 0));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/c9-later.png` });
console.log(await p.evaluate(() => JSON.stringify(window.__ib.state().live.units.map((u) => [u.id, u.alive, u.hp]))));
await b.close();
