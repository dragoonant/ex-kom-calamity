// node tools/shot.mjs <url-path> <out.png> [w h] [waitMs] : screenshot through the pre-installed Chromium.
import { chromium } from 'playwright';
const [, , path = '/', out = 'shot.png', w = '1440', h = '900', wait = '2500'] = process.argv;
const port = process.env.PW_PORT ?? '5231';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto(`http://localhost:${port}${path}`);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
console.log('shot', out);
