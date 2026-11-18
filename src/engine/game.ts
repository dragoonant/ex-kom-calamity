// ARCH-1: createGame(setup) from the battle file, the map and the templates.
import { BATTLES, MAPS, TUNING, UNITS, WEAPONS, type Tuning } from '../data';
import type { Setup, State, Unit } from './types';
import { parseMap, tileAt, isPassable } from './map';
import { seedRng } from './rng';

export function mergeTuning(base: Tuning, over: Partial<Tuning> | undefined): Tuning {
  const out = { ...base } as Record<string, Record<string, number>>;
  if (over) {
    for (const [section, values] of Object.entries(over)) {
      if (!values) continue;
      out[section] = { ...(out[section] ?? {}), ...(values as Record<string, number>) };
    }
  }
  return out as unknown as Tuning;
}

function makeUnit(id: string, name: string, templateId: string, weapon: string | null, at: { x: number; y: number; level: number }): Unit {
  const t = UNITS[templateId];
  if (!t) throw new Error(`unknown unit template ${templateId}`);
  if (weapon && !WEAPONS[weapon]) throw new Error(`unknown weapon ${weapon}`);
  return {
    id,
    name,
    template: templateId,
    side: t.side,
    x: at.x,
    y: at.y,
    level: at.level,
    hp: t.hp,
    maxHp: t.hp,
    armour: t.armour,
    aim: t.aim,
    moveTicks: t.moveTicks,
    sight: t.sight,
    weapon,
    disguised: t.disguised,
    revealed: false,
    down: false,
    stance: t.defaultStance,
    order: null,
    fireTarget: null,
    aimProgress: 0,
    readyTick: 0,
    lastFiredTick: -1,
    moving: false,
    charges: t.charges ?? 0,
    blast: null,
  };
}

export function createGame(setup: Setup): State {
  const battle = BATTLES[setup.battleId];
  if (!battle) throw new Error(`unknown battle ${setup.battleId}`);
  const map = MAPS[battle.map];
  if (!map) throw new Error(`unknown map ${battle.map}`);
  const tiles = parseMap(map);
  const base: State = {
    version: 1,
    battleId: battle.id,
    mapId: map.id,
    seed: setup.seed,
    tick: 0,
    width: map.width,
    depth: map.depth,
    levels: map.levels.length,
    tiles,
    units: [],
    rng: seedRng(setup.seed),
    tuning: mergeTuning(TUNING, setup.tuning),
    score: { shotsFired: 0, hits: 0, civilianHits: 0, agentsDown: 0, hostilesDown: 0, civiliansDown: 0, taken: 0 },
    over: null,
    log: [],
  };
  const units: Unit[] = [];
  battle.squad.forEach((e, i) => {
    const tpl = UNITS[e.template];
    units.push(makeUnit(`a${i + 1}`, e.name, e.template, e.weapon ?? tpl?.weapon ?? null, e.at));
  });
  // UNIT-3: everyone else in (level, y, x) order so an id says nothing about the unit.
  const others = [...battle.others].sort(
    (a, b) => a.at.level - b.at.level || a.at.y - b.at.y || a.at.x - b.at.x,
  );
  others.forEach((e, i) => {
    const tpl = UNITS[e.template];
    units.push(makeUnit(`u${i + 1}`, tpl?.name ?? e.template, e.template, tpl?.weapon ?? null, e.at));
  });
  for (const u of units) {
    const t = tileAt(base, u);
    if (!t || !isPassable(t.kind)) throw new Error(`unit ${u.id} spawns on an impassable tile`);
  }
  return { ...base, units };
}
