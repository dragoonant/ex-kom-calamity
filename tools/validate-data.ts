// npm run validate:data
// Checks src/data/*.json against docs/spec/10-rules.md (sections 2, 3, 9, 10) and prints the
// unit and weapon tables from the data so prose never drifts from the numbers. Exit 1 on any error.
import { readFileSync } from 'node:fs';
import { BATTLES, DEFAULT_MATERIAL, LEGEND, MAPS, MATERIALS, TUNING, UNITS, WEAPONS } from '../src/data';
import { STANCES, SIDES } from '../src/engine';

const errors: string[] = [];
const err = (m: string) => errors.push(m);
const isInt = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
const spec = readFileSync(new URL('../docs/spec/10-rules.md', import.meta.url), 'utf8');

// --- tuning vs spec: every `section.key = N` in the spec is a key with that default.
const tuning = TUNING as unknown as Record<string, Record<string, number>>;
for (const [section, values] of Object.entries(tuning)) {
  for (const [k, v] of Object.entries(values)) if (!isInt(v) || v < 0) err(`tuning.${section}.${k} is not a non-negative integer`);
}
const cited = new Set<string>();
for (const m of spec.matchAll(/`([a-z]+)\.([A-Za-z]+) = (\d+)`/g)) {
  const [, section, key, val] = m;
  cited.add(`${section}.${key}`);
  const actual = tuning[section!]?.[key!];
  if (actual === undefined) err(`spec cites tuning.${section}.${key} which does not exist`);
  else if (actual !== Number(val)) err(`spec says ${section}.${key} = ${val} but tuning.json has ${actual}`);
}
for (const [section, values] of Object.entries(tuning)) {
  for (const k of Object.keys(values)) if (!cited.has(`${section}.${k}`)) err(`tuning.${section}.${k} is not cited in the spec`);
}

// --- weapons
for (const [id, w] of Object.entries(WEAPONS)) {
  if (!/^[a-z0-9-]+$/.test(id)) err(`weapon id ${id} is not kebab-case`);
  if (typeof w.name !== 'string' || !w.name) err(`weapon ${id} has no name`);
  if (w.kind !== 'ranged' && w.kind !== 'melee') err(`weapon ${id} kind ${String(w.kind)}`);
  for (const k of ['range', 'accuracy', 'falloffPerTile', 'damageMin', 'damageMax', 'aimTicks', 'cooldownTicks', 'structureDamage'] as const) {
    if (!isInt(w[k]) || w[k] < 0) err(`weapon ${id}.${k} is not a non-negative integer`);
  }
  if (w.damageMin > w.damageMax) err(`weapon ${id} damageMin > damageMax`);
  if (w.kind === 'melee' && w.range !== 1) err(`melee weapon ${id} must have range 1 (FIRE-1)`);
  if (w.kind === 'ranged' && w.range < 1) err(`ranged weapon ${id} needs range >= 1`);
  if (w.aimTicks < 1) err(`weapon ${id} aimTicks must be >= 1 (FIRE-3)`);
  if (w.kind === 'melee' && w.structureDamage !== 0) err(`melee weapon ${id} must have structureDamage 0 (STR-6)`);
  if (typeof w.source !== 'string') err(`weapon ${id} has no source`);
}

// --- units
for (const [id, u] of Object.entries(UNITS)) {
  if (!/^[a-z0-9-]+$/.test(id)) err(`unit id ${id} is not kebab-case`);
  if (!(SIDES as string[]).includes(u.side)) err(`unit ${id} side ${String(u.side)}`);
  for (const k of ['hp', 'armour', 'aim', 'moveTicks', 'sight', 'charges'] as const) if (!isInt(u[k]) || u[k] < 0) err(`unit ${id}.${k} is not a non-negative integer`);
  if (u.hp < 1) err(`unit ${id} hp must be >= 1`);
  if (u.moveTicks < 1) err(`unit ${id} moveTicks must be >= 1`);
  if (u.weapon !== null && !WEAPONS[u.weapon]) err(`unit ${id} weapon ${u.weapon} unknown`);
  if (!(STANCES as string[]).includes(u.defaultStance)) err(`unit ${id} defaultStance ${String(u.defaultStance)}`);
  if (typeof u.disguised !== 'boolean') err(`unit ${id} disguised must be boolean`);
  if (u.disguised && u.side !== 'hostile') err(`unit ${id} is disguised but not hostile (HIDE-1)`);
  if (typeof u.source !== 'string') err(`unit ${id} has no source`);
}
if (!UNITS.citizen) err('units.json needs a citizen template (HIDE-1)');
for (const [id, u] of Object.entries(UNITS)) {
  if (u.disguised && UNITS.citizen && u.hp !== UNITS.citizen.hp) err(`disguised ${id}.hp ${u.hp} != citizen.hp ${UNITS.citizen.hp} (RULING UNIT-5)`);
  if (u.side === 'civilian' && u.weapon) err(`civilian ${id} carries a weapon (CIV-1)`);
}

// --- materials (STR-1, STR-2)
for (const [id, m] of Object.entries(MATERIALS)) {
  if (!/^[a-z0-9-]+$/.test(id)) err(`material id ${id} is not kebab-case`);
  if (typeof m.name !== 'string' || !m.name) err(`material ${id} has no name`);
  if (!isInt(m.hp) || m.hp < 0) err(`material ${id}.hp is not a non-negative integer`);
  if (typeof m.source !== 'string') err(`material ${id} has no source`);
}
for (const kind of new Set(Object.values(LEGEND))) {
  const d = DEFAULT_MATERIAL[kind];
  if (!d || !MATERIALS[d]) err(`materials.json _defaults has no known material for ${kind}`);
}
for (const kind of ['ground', 'rubble', 'void'] as const) if (MATERIALS[DEFAULT_MATERIAL[kind]]?.hp !== 0) err(`default material of ${kind} must have hp 0 (STR-2)`);
if (DEFAULT_MATERIAL.rubble !== 'none' || DEFAULT_MATERIAL.void !== 'none') err('rubble and void must default to material none (INV-8)');
for (const kind of ['wall', 'door', 'window', 'floor', 'stair'] as const) if (!((MATERIALS[DEFAULT_MATERIAL[kind]]?.hp ?? 0) > 0)) err(`default material of ${kind} must be breakable (STR-2)`);

// --- maps
const passable = new Set(['ground', 'floor', 'door', 'stair', 'rubble']);
for (const [id, m] of Object.entries(MAPS)) {
  if (m.id !== id) err(`map ${id} has id ${m.id}`);
  if (!isInt(m.width) || !isInt(m.depth) || m.width < 1 || m.depth < 1) err(`map ${id} size`);
  const levels = [...m.levels].sort((a, b) => a.level - b.level);
  levels.forEach((l, i) => {
    if (l.level !== i) err(`map ${id} levels must be 0..n-1 without gaps (got ${l.level} at ${i})`);
    if (l.rows.length !== m.depth) err(`map ${id} level ${l.level} has ${l.rows.length} rows, depth is ${m.depth}`);
    l.rows.forEach((row, y) => {
      if (row.length !== m.width) err(`map ${id} level ${l.level} row ${y} has ${row.length} chars, width is ${m.width}`);
      for (const ch of row) if (!(ch in LEGEND)) err(`map ${id} level ${l.level} row ${y} has unknown legend char "${ch}"`);
    });
  });
  const kindAt = (x: number, y: number, level: number) => LEGEND[levels[level]?.rows[y]?.[x] ?? ' '] ?? 'void';
  let anyPassable = false;
  for (const l of levels) {
    for (let y = 0; y < m.depth; y++) {
      for (let x = 0; x < m.width; x++) {
        const k = kindAt(x, y, l.level);
        if (passable.has(k)) anyPassable = true;
        if (k === 'stair') {
          const up = kindAt(x, y, l.level + 1) === 'stair';
          const down = l.level > 0 && kindAt(x, y, l.level - 1) === 'stair';
          if (!up && !down) err(`map ${id} stair at (${x},${y},${l.level}) has no stair above or below (MAP-4)`);
        }
      }
    }
  }
  if (!anyPassable) err(`map ${id} has no passable tile`);
  // MAP-7: at most six floors plus a roof. STR-1: material grids and their key. MAP-8: buildings.
  if (levels.length > 7) err(`map ${id} has ${levels.length} levels; the limit is 6 floors plus a roof (MAP-7)`);
  for (const [ch, mat] of Object.entries(m.materialKey ?? {})) {
    if (ch.length !== 1 || ch === ' ') err(`map ${id} materialKey "${ch}" must be one non-space character`);
    if (!MATERIALS[mat]) err(`map ${id} materialKey ${ch} names unknown material ${mat}`);
  }
  for (const l of levels) {
    if (!l.materials) continue;
    if (l.materials.length !== m.depth) err(`map ${id} level ${l.level} materials has ${l.materials.length} rows, depth is ${m.depth}`);
    l.materials.forEach((row, y) => {
      if (row.length !== m.width) err(`map ${id} level ${l.level} materials row ${y} has ${row.length} chars, width is ${m.width}`);
      for (const ch of row) if (ch !== ' ' && !(m.materialKey && ch in m.materialKey)) err(`map ${id} level ${l.level} materials row ${y} has unknown key "${ch}"`);
    });
  }
  const seenB = new Set<string>();
  for (const b of m.buildings ?? []) {
    if (!/^[a-z0-9-]+$/.test(b.id) || seenB.has(b.id)) err(`map ${id} building id ${b.id} is not unique kebab-case`);
    seenB.add(b.id);
    if (typeof b.name !== 'string' || !b.name) err(`map ${id} building ${b.id} has no name`);
    for (const k of ['x', 'y', 'w', 'd', 'floors'] as const) if (!isInt(b[k]) || b[k] < 0) err(`map ${id} building ${b.id}.${k} is not a non-negative integer`);
    if (b.x + b.w > m.width || b.y + b.d > m.depth) err(`map ${id} building ${b.id} leaves the map`);
    if (b.floors < 1 || b.floors > 6) err(`map ${id} building ${b.id} has ${b.floors} floors (MAP-7 allows 1 to 6)`);
    if (b.floors >= levels.length) err(`map ${id} building ${b.id} needs a roof level ${b.floors} the map lacks`);
  }
}

// --- battles
for (const [id, b] of Object.entries(BATTLES)) {
  if (b.id !== id) err(`battle ${id} has id ${b.id}`);
  const m = MAPS[b.map];
  if (!m) {
    err(`battle ${id} map ${b.map} unknown`);
    continue;
  }
  const levels = [...m.levels].sort((a, c) => a.level - c.level);
  const kindAt = (x: number, y: number, level: number) => LEGEND[levels[level]?.rows[y]?.[x] ?? ' '] ?? 'void';
  const used = new Set<string>();
  const check = (who: string, tpl: string, at: { x: number; y: number; level: number }, weapon?: string) => {
    const t = UNITS[tpl];
    if (!t) err(`battle ${id} ${who}: template ${tpl} unknown`);
    if (weapon !== undefined && !WEAPONS[weapon]) err(`battle ${id} ${who}: weapon ${weapon} unknown`);
    if (!isInt(at.x) || !isInt(at.y) || !isInt(at.level)) err(`battle ${id} ${who}: spawn not integer`);
    else if (at.x < 0 || at.x >= m.width || at.y < 0 || at.y >= m.depth || at.level < 0 || at.level >= levels.length) err(`battle ${id} ${who}: spawn off the map`);
    else if (!passable.has(kindAt(at.x, at.y, at.level))) err(`battle ${id} ${who}: spawn on ${kindAt(at.x, at.y, at.level)}`);
    const key = `${at.x},${at.y},${at.level}`;
    if (used.has(key)) err(`battle ${id} ${who}: spawn ${key} used twice (INV-3)`);
    used.add(key);
  };
  if (b.squad.length < 1) err(`battle ${id} has an empty squad`);
  b.squad.forEach((e, i) => {
    check(`squad[${i}]`, e.template, e.at, e.weapon);
    if (UNITS[e.template] && UNITS[e.template]!.side !== 'agency') err(`battle ${id} squad[${i}] is not an agency template`);
    if (typeof e.name !== 'string' || !e.name) err(`battle ${id} squad[${i}] has no name`);
  });
  b.others.forEach((e, i) => {
    check(`others[${i}]`, e.template, e.at);
    if (UNITS[e.template] && UNITS[e.template]!.side === 'agency') err(`battle ${id} others[${i}] is an agency template`);
  });
  if (!b.others.some((e) => UNITS[e.template]?.side === 'hostile')) err(`battle ${id} has no hostile unit (END-1 would hold at tick 1)`);
}

// --- spec hygiene: unique ids, rulings reference known ids.
const ids = [...spec.matchAll(/\*\*([A-Z]+-\d+)\*\*/g)].map((m) => m[1]!);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) err(`spec has duplicate rule ids: ${[...new Set(dup)].join(', ')}`);
const idSet = new Set(ids);
for (const m of spec.matchAll(/^- RULING: ([A-Z]+-\d+) \| /gm)) if (!idSet.has(m[1]!)) err(`ruling references unknown id ${m[1]}`);
for (const m of spec.matchAll(/^- RULING: .+\. (\w+)$/gm)) {
  if (!['open', 'provisional', 'owner-confirmed'].includes(m[1]!)) err(`ruling status word "${m[1]}" is not open/provisional/owner-confirmed`);
}

// --- report
console.log('Units (src/data/units.json)');
console.table(Object.fromEntries(Object.entries(UNITS).map(([id, u]) => [id, { side: u.side, hp: u.hp, armour: u.armour, aim: u.aim, moveTicks: u.moveTicks, sight: u.sight, weapon: u.weapon ?? '-', disguised: u.disguised, stance: u.defaultStance }])));
console.log('Weapons (src/data/weapons.json)');
console.table(Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { kind: w.kind, range: w.range, accuracy: w.accuracy, falloff: w.falloffPerTile, damage: `${w.damageMin}-${w.damageMax}`, aimTicks: w.aimTicks, cooldownTicks: w.cooldownTicks }])));
console.log('Materials (src/data/materials.json)');
console.table(Object.fromEntries(Object.entries(MATERIALS).map(([id, m]) => [id, { name: m.name, hp: m.hp }])));
console.log(`Spec: ${idSet.size} rule ids, ${[...spec.matchAll(/^- RULING: /gm)].length} rulings. Maps: ${Object.keys(MAPS).join(', ')}. Battles: ${Object.keys(BATTLES).join(', ')}.`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('validate:data OK');
