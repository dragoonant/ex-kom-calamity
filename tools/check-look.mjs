// npm run check:look  (KB rule 21 as a failing check; docs/presentation-concept.md section 5)
// The look is "Civil Defence switchboard": enamel panels, lamps, printed slips, light background. This fails
// when the stylesheet or the client's markup picks up a sibling's look: video-feed effects (project-x
// "Bodycam feed"), parchment and wood (Three Kingdoms Tactics), neon holograms (Virtually Off), or the
// codename in game text (PLAN.md D10).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['src/styles.css', 'index.html', 'sounds.html', 'src/sounds.tsx'];
const walk = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) walk(join(dir, f.name));
    else if (/\.(tsx|css)$/.test(f.name)) files.push(join(dir, f.name).split('\\').join('/'));
  }
};
walk('src/client');

const banned = [
  [/scan-?lines?/i, 'scanlines (project-x)'],
  [/\bREC\b/, 'REC marker (project-x)'],
  [/target-?bracket|signal-?loss|telemetry|bodycam/i, 'video-feed HUD (project-x)'],
  [/monospace|Courier|Consolas/i, 'monospace type (project-x)'],
  [/backdrop-filter|filter:\s*blur/i, 'full-screen filters (KB recipe step 9)'],
  [/parchment|papyrus|wood-?grain|sand-?table/i, 'parchment or wood (Three Kingdoms Tactics)'],
  [/neon|hologram|#0ff\b|#00ffff|#39ff14|#ff00ff/i, 'neon (Virtually Off)'],
  [/clip-path:\s*polygon/i, 'cut-corner frames (the concept asks for rounded rectangles)'],
  [/ex-?kom|calamity/i, 'the codename in game text (D10)'],
  [/\btitle=/, 'a native tooltip attribute (KB rule 8)'],
];
let hits = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // The stylesheet's own header comment names what it avoids; code comments are not game text.
    if (/^\s*(\/\/|\/\*|\*)/.test(line) || (file.endsWith('.css') && i < 5)) return;
    for (const [re, why] of banned) {
      if (re.test(line)) {
        hits += 1;
        console.error(`${file}:${i + 1}: ${why}: ${line.trim().slice(0, 100)}`);
      }
    }
  });
}
const css = readFileSync('src/styles.css', 'utf8');
for (const token of ['--enamel', '--teal', '--coral', '--mustard', '--graphite', '--lamp-green', '--agency-red']) {
  if (!css.includes(token)) {
    hits += 1;
    console.error(`src/styles.css: missing palette role ${token} (presentation-concept.md section 3)`);
  }
}
console.log(hits ? `check:look FAILED with ${hits} hit(s)` : `check:look OK (${files.length} files, 0 hits)`);
process.exit(hits ? 1 : 0);
