// npm run check:look (KB rule 21): the stylesheet keeps this game's own tokens and none of the siblings' signature colours.
import { readFileSync, existsSync } from 'node:fs';
const css = readFileSync('src/styles.css', 'utf8').toLowerCase();
const must = ['--ib-sheet', '--ib-orange: #ff7a1a', '--ib-chalk: #e9e4d6', 'big shoulders stencil', 'kalam', 'ibm plex mono'];
const errs = must.filter((m) => !css.includes(m)).map((m) => `missing own token: ${m}`);
// Signature colours of the siblings it must not look like (read from their stylesheets when the clones are present).
const siblings = [['ex-kom-calamity', '../ex-kom-calamity/src/styles.css']];
for (const [name, path] of siblings) {
  if (!existsSync(path)) continue;
  const theirs = readFileSync(path, 'utf8').toLowerCase();
  const vars = [...theirs.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);
  const shared = [...new Set(vars)].filter((c) => css.includes(c));
  if (shared.length > 2) errs.push(`${name}: shares ${shared.length} palette colours (${shared.join(', ')})`);
}
const fontsOk = !/font-family:[^;]*(cinzel|palatino)/.test(css);
if (!fontsOk) errs.push('uses a sibling display serif');
console.log(errs.length ? errs.join('\n') : 'check:look ok');
if (errs.length) process.exit(1);
