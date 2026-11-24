import { chromium } from 'playwright';
const [, , out = 'shots'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${process.env.PW_PORT ?? 5231}/`);
await p.click('[data-testid=new]'); await p.click('[data-testid=skip-brief]'); await p.click('[data-testid=deploy]');
await p.waitForSelector('[data-testid=battle]'); await p.waitForTimeout(2000);
let n = 0;
for (let i = 0; i < 200 && n < 2; i++) {
  const a = await p.evaluate(() => { const g = window.__ib.state(); if (!g.live || g.live.result) return 'over'; if (g.live.phase !== 'player' || g.queue || g.presenting) { window.__ib.autoplay(1, 0); return 'skip'; } return window.__ib.suggest(); });
  if (a === 'over') break;
  if (a === 'skip' || !a) continue;
  if (a.type === 'attack' && i > 8) {
    await p.evaluate((x) => window.__ib.dispatch(x), a);
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${out}/close-${++n}.png` });
    await p.evaluate(() => window.__ib.skip());
  } else await p.evaluate(() => window.__ib.autoplay(1, 0));
}
await p.evaluate(() => window.__ib.autoplay(60, 0)); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/close-later.png` });
console.log(await p.evaluate(() => { const s = window.__ib.state(); return JSON.stringify({ round: s.live.round, result: s.live.result?.winner, alive: s.live.units.filter((u) => u.alive).map((u) => u.id) }); }));
await b.close();
