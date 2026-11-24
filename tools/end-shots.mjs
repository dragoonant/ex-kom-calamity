import { chromium } from 'playwright';
const [, , out = 'shots', w = '1440', h = '900'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${process.env.PW_PORT ?? 5231}/`);
for (let attempt = 0; attempt < 4; attempt++) {
  await p.click('[data-testid=new]'); await p.click('[data-testid=skip-brief]'); await p.click('[data-testid=deploy]');
  await p.waitForSelector('[data-testid=battle]');
  for (let i = 0; i < 40; i++) if (await p.evaluate(() => (window.__ib.autoplay(25, 0), !!window.__ib.state().live.result))) break;
  await p.evaluate(() => window.__ib.skip());
  await p.waitForTimeout(1200);
  if (await p.evaluate(() => window.__ib.state().live.result.winner === 'player')) break;
  await p.screenshot({ path: `${out}/e-lost-${attempt}.png` });
  await p.goto(`http://localhost:${process.env.PW_PORT ?? 5231}/`);
}
await p.screenshot({ path: `${out}/e1-result.png` });
await p.click('[data-testid=to-debrief]'); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/e2-debrief.png` });
await p.click('[data-testid=to-hangar]'); await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/e3-hangar.png` });
await p.click('text=Left arm'); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/e4-hangar-arm.png` });
await b.close();
