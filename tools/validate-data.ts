// npm run validate:data: every id the data names exists; the map is rectangular; units start on open tiles.
import { MISSIONS, PARTS, PILOTS, RULES } from '../src/engine/data';
const errs: string[] = [];
for (const m of Object.values(MISSIONS)) {
  const w = m.map[0]!.length;
  m.map.forEach((row, y) => { if (row.length !== w) errs.push(`${m.id} row ${y} width ${row.length}`); for (const ch of row) if (!m.legend[ch]) errs.push(`${m.id} unknown map char ${ch}`); });
  for (const u of m.units) {
    const ch = m.map[u.y]?.[u.x];
    if (!ch || m.legend[ch]?.[2]) errs.push(`${u.id} starts on a blocked tile`);
    if (!PILOTS[u.pilot]) errs.push(`${u.id} pilot ${u.pilot}`);
    const b = u.build;
    if (!PARTS.bodies[b.body]) errs.push(`${u.id} body ${b.body}`);
    if (!PARTS.arms[b.armL] || !PARTS.arms[b.armR]) errs.push(`${u.id} arms`);
    if (!PARTS.legs[b.legs]) errs.push(`${u.id} legs`);
    if (!PARTS.packs[b.pack]) errs.push(`${u.id} pack`);
    for (const wid of [b.wL, b.wR]) if (wid && !PARTS.weapons[wid]) errs.push(`${u.id} weapon ${wid}`);
  }
}
for (const p of Object.values(PARTS.packs)) if (p.weapon && !PARTS.weapons[p.weapon]) errs.push(`pack weapon ${p.weapon}`);
for (const k of ['direct', 'melee', 'indirect'] as const) if (!RULES.hitWeights[k]) errs.push(`hit weights ${k}`);
console.log(errs.length ? errs.join('\n') : 'validate:data ok');
if (errs.length) process.exit(1);
