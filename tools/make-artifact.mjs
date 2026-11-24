// npm run artifact: build the single-entry bundle and write dist-artifact/iron-basin.html (the page body the Artifact
// tool wraps in its skeleton) plus dist-artifact/files.json (published path -> source) for the art and audio (KB rule 28).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
execSync('npx vite build --config vite.artifact.config.ts', { stdio: 'inherit' });
const html = readFileSync('dist-single/index.html', 'utf8');
const js = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('dist-single/index.html must reference one script and one stylesheet');
const script = readFileSync(`dist-single/${js}`, 'utf8').split('</script').join('<\\/script');
const style = readFileSync(`dist-single/${css}`, 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Text:wght@500;700;900&family=IBM+Plex+Mono:wght@400;600&family=Kalam:wght@400;700&display=swap';
const page = `<title>Iron Basin</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${fonts}">
<style>${style}
:root { color-scheme: dark; }
body { background: #14181a; }
.strip, .menu-btn { top: calc(10px + env(safe-area-inset-top, 0px)); }
.strip { left: max(12px, env(safe-area-inset-left, 0px)); }
.menu-btn, .feed, .right-col { right: max(12px, env(safe-area-inset-right, 0px)); }
.left-col { left: max(12px, env(safe-area-inset-left, 0px)); }
.orders { bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/iron-basin.html', page);
const files = {};
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (!n.endsWith('measurements.json') && !n.endsWith('contact-sheet.jpg')) files[p.slice('public/'.length)] = p; } };
walk('public/art'); walk('public/audio');
writeFileSync('dist-artifact/files.json', JSON.stringify(files, null, 1));
const bytes = Object.values(files).reduce((a, p) => a + statSync(p).size, 0);
console.log(`artifact: page ${(page.length / 1024).toFixed(0)} KB, ${Object.keys(files).length} files, ${(bytes / 1048576).toFixed(1)} MB`);
