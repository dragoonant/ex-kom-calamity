// npm run artifact  (after npm run build)
// Packs dist/ into one self-contained page for a private claude.ai Artifact (PLAN.md D12; KB rule 28):
// the stylesheet and the bundle are inlined, because an Artifact page loads nothing from other hosts.
// Writes dist-artifact/city-of-tomorrow.html (the page body the Artifact tool wraps in its own skeleton)
// and dist-artifact/preview.html (the same inside a plain skeleton, for a local look through npm run shot).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('dist/index.html does not reference one script and one stylesheet; run npm run build first');
const script = readFileSync(`dist/${js}`, 'utf8').split('</script').join('<\\/script'); // an inline script must not contain its own closing tag
const style = readFileSync(`dist/${css}`, 'utf8');
const page = `<title>City of Tomorrow</title>
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/city-of-tomorrow.html', page);
writeFileSync('dist-artifact/preview.html', `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /></head><body>${page}</body></html>\n`);
console.log(`artifact: dist-artifact/city-of-tomorrow.html, ${(page.length / 1024).toFixed(0)} KB (script ${(script.length / 1024).toFixed(0)} KB, style ${(style.length / 1024).toFixed(0)} KB)`);
