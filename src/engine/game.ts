// ARCH-1: createGame(setup) from the battle file, the map and the templates.
import { BATTLES, MAPS, TUNING, UNITS, WEAPONS, type Tuning } from '../data';
import type { BattleDef, OtherEntry, SquadEntry } from '../data';
import type { Roster, Setup, State, Unit } from './types';
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
    posture: 'stand',
    lastRunTick: null,
    suppression: 0,
    suppressAt: null,
    ammo: weapon && WEAPONS[weapon]?.magazine ? WEAPONS[weapon]!.magazine! : null,
    reloadLeft: 0,
  };
}

/** ARCH-11: the battle's spawn lists with a city roster applied. Pure; throws on an unknown template or weapon. */
export function applyRoster(battle: BattleDef, roster: Roster | undefined): { squad: SquadEntry[]; others: OtherEntry[] } {
  if (!roster) return { squad: battle.squad, others: battle.others };
  let squad = battle.squad;
  if (roster.squad) {
    if (roster.squad.length < 1) throw new Error('a roster squad needs at least one agent');
    squad = roster.squad.slice(0, battle.squad.length).map((r, i) => {
      const template = r.template ?? battle.squad[i]!.template;
      if (UNITS[template]?.side !== 'agency') throw new Error(`roster template ${template} is not an agent`);
      if (r.weapon && !WEAPONS[r.weapon]) throw new Error(`unknown weapon ${r.weapon}`);
      return { name: r.name, template, weapon: r.weapon ?? battle.squad[i]!.weapon, at: battle.squad[i]!.at };
    });
  }
  let others = battle.others;
  if (roster.hostiles) {
    const h = roster.hostiles;
    for (const n of [h.host, h.taker, h.fighter, h.spitter ?? 0]) if (!Number.isInteger(n) || n < 0) throw new Error('roster hostiles must be non-negative integers');
    // Hostile spawn points first, in file order; then citizen spawn points for the overflow.
    const hostileSpots = battle.others.filter((o) => UNITS[o.template]?.side === 'hostile');
    const citizenSpots = battle.others.filter((o) => UNITS[o.template]?.side !== 'hostile');
    const wanted = [...Array(h.fighter).fill('fighter'), ...Array(h.spitter ?? 0).fill('spitter'), ...Array(h.taker).fill('taker'), ...Array(h.host).fill('host')] as string[];
    const out: OtherEntry[] = [];
    hostileSpots.forEach((o, i) => out.push({ template: wanted[i] ?? 'citizen', at: o.at }));
    const overflow = wanted.slice(hostileSpots.length);
    citizenSpots.forEach((o, i) => out.push({ template: i < overflow.length ? 'host' : o.template, at: o.at }));
    others = out;
  }
  return { squad, others };
}

export function createGame(setup: Setup): State {
  const base0 = BATTLES[setup.battleId];
  if (!base0) throw new Error(`unknown battle ${setup.battleId}`);
  const battle = { ...base0, ...applyRoster(base0, setup.roster) };
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
    score: { shotsFired: 0, hits: 0, civilianHits: 0, agentsDown: 0, hostilesDown: 0, civiliansDown: 0, taken: 0, captured: 0, saved: 0 },
    canCapture: setup.roster?.capture === true,
    core: base0.core ? { at: { ...base0.core }, progress: 0, secured: false, burnt: false } : null,
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
