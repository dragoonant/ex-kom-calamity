// Typed registry over the plain-JSON battle data. The engine reads numbers only from here
// (docs/spec/10-rules.md intro). Keys starting with "_" are comments and are stripped.
import tuningJson from './tuning.json';
import weaponsJson from './weapons.json';
import unitsJson from './units.json';
import materialsJson from './materials.json';
import civicSavingsBranch from './maps/civic-savings-branch.json';
import halcyonBlock from './maps/halcyon-block.json';
import automatSite from './maps/sunbeam-automat-site.json';
import depotSite from './maps/depot-7-site.json';
import savingsSite from './maps/civic-savings-site.json';
import firstRaid from './battles/first-raid.json';
import blockRaid from './battles/block-raid.json';
import benchRaid from './battles/bench-raid.json';
import automatRaid from './battles/automat-raid.json';
import depotRaid from './battles/depot-raid.json';
import savingsRaid from './battles/savings-raid.json';
import hqSite from './maps/agency-hq-site.json';
import wreckSite from './maps/wreck-site.json';
import hqDefence from './battles/hq-defence.json';
import wreckRaid from './battles/wreck-raid.json';

export type Side = 'agency' | 'hostile' | 'civilian';
export type Stance = 'engage' | 'retaliate' | 'hold';
export type WeaponKind = 'ranged' | 'melee';
export type TileKindName = 'ground' | 'floor' | 'wall' | 'door' | 'stair' | 'window' | 'rubble' | 'void';

export interface Tuning {
  time: { ticksPerSecond: number; maxBattleSeconds: number };
  move: { diagonalCostPercent: number; stairCostPercent: number; blockedWaitTicks: number; rubbleCostPercent: number; runCostPercent: number; crouchCostPercent: number };
  sight: { revealRange: number; markLastHostiles: number };
  fire: { minHitChance: number; maxHitChance: number; movingTargetPenalty: number; retaliateMemoryTicks: number; crouchTargetPenalty: number; crouchAimBonus: number; runningShooterPenalty: number; runSettleTicks: number };
  save: { autosaveSeconds: number };
  structure: { fallDamage: number };
  /** Section 22 (AI): the hostile AI's windows and ranges. */
  ai: { decideTicks: number; hostAmbushRange: number; fleeHpPercent: number; takerChaseRange: number; coverSearchTicks: number; breachRange: number; breachDetourTicks: number; randomOrderPercent: number; isolationRange: number; huntAfterAgentsDown: number; huntAfterSeconds: number };
  /** Section 25 (COVER): what each grade of cover takes off a ranged hit chance. */
  cover: { full: number; half: number; low: number };
  /** Section 26 (SNAP): a shot at a stance target is quick and loose. */
  snap: { penalty: number; aimPercent: number };
  /** Section 28 (STRAY, PANIC): the price of standing together. */
  stray: { percent: number };
  /** Section 30 (AMMO). */
  ammo: { suppressRounds: number };
  /** Section 29 (OBJ): capture, evacuation and the wreck's core. */
  objective: { captureTicks: number; captureHpPercent: number; coreTicks: number; burnSeconds: number };
  panic: { range: number; amount: number };
  /** Section 27 (SUP): being shot at, and pinning a tile. */
  suppress: { perShot: number; perHit: number; decayPerTick: number; aimPercent: number; pinnedAt: number; fire: number; cap: number; aiBelow: number };
  blast: { throwRange: number; armTicks: number; structureDamage: number; edgeStructureDamage: number; unitDamage: number; edgeUnitDamage: number };
}

export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  range: number;
  accuracy: number;
  falloffPerTile: number;
  damageMin: number;
  damageMax: number;
  aimTicks: number;
  cooldownTicks: number;
  /** STR-6: what a stray round does to the wall behind the target. */
  structureDamage: number;
  /** AMMO-1: rounds per load and reload time; absent, the weapon never runs dry. */
  magazine?: number;
  reloadTicks?: number;
  /** TAKE-1: the template a living citizen becomes when this weapon hits it (melee only). */
  takes?: string;
  source: string;
}

export interface UnitTemplate {
  name: string;
  side: Side;
  hp: number;
  armour: number;
  aim: number;
  moveTicks: number;
  sight: number;
  weapon: string | null;
  disguised: boolean;
  defaultStance: Stance;
  /** BLAST-1 */
  charges: number;
  source: string;
}

/** STR-1 */
export interface MaterialDef {
  name: string;
  hp: number;
  source: string;
}

export interface Pos {
  x: number;
  y: number;
  level: number;
}

/** MAP-9: the building styles the tile set draws (docs/art/tile-set.md). */
export type BuildingStyle = 'residential' | 'office' | 'bank' | 'depot' | 'automat';
export const BUILDING_STYLES: BuildingStyle[] = ['residential', 'office', 'bank', 'depot', 'automat'];

/** MAP-8; `style` is MAP-9 (the client's tile set reads it; the rules do not). */
export interface BuildingDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floors: number;
  style?: BuildingStyle;
}

/** MAP-9: prop kinds (docs/art/tile-set.md section 3). Props are set dressing: the rules never read them. */
export type PropKind =
  | 'desk'
  | 'counter'
  | 'shelf'
  | 'bed'
  | 'locker'
  | 'machine'
  | 'lamp'
  | 'kiosk-sign'
  | 'bench'
  | 'vehicle'
  | 'planter'
  | 'tank'
  | 'vent'
  | 'mast'
  | 'crate';
export const PROP_KINDS: PropKind[] = ['desk', 'counter', 'shelf', 'bed', 'locker', 'machine', 'lamp', 'kiosk-sign', 'bench', 'vehicle', 'planter', 'tank', 'vent', 'mast', 'crate'];

/** COVER-3: the props solid enough to give low cover (the rest are lamps, signs, masts and vents). */
export const COVER_PROPS: PropKind[] = ['desk', 'counter', 'shelf', 'bed', 'locker', 'machine', 'bench', 'vehicle', 'planter', 'tank', 'crate'];

/** MAP-9: one prop on one passable tile; `yaw` turns it in quarter turns (0 faces south). */
export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  level: number;
  yaw?: 0 | 1 | 2 | 3;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  depth: number;
  levels: { level: number; rows: string[]; materials?: string[] }[];
  materialKey?: Record<string, string>;
  buildings?: BuildingDef[];
  /** MAP-9: set dressing placed from map data; never read by the rules. */
  props?: PropDef[];
}

export interface SquadEntry {
  name: string;
  template: string;
  weapon?: string;
  at: Pos;
}

export interface OtherEntry {
  template: string;
  at: Pos;
}

export interface BattleDef {
  id: string;
  name: string;
  map: string;
  squad: SquadEntry[];
  others: OtherEntry[];
  /** OBJ-4: a craft's drive to secure before the wreck burns (wreck maps only). */
  core?: Pos;
}

function records<T>(obj: Record<string, unknown>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith('_')) out[k] = v as T;
  return out;
}

function stripComments<T>(obj: Record<string, unknown>): T {
  return records<unknown>(obj) as unknown as T;
}

export const TUNING: Tuning = stripComments<Tuning>(tuningJson as Record<string, unknown>);
export const WEAPONS: Record<string, WeaponDef> = records<WeaponDef>(weaponsJson as Record<string, unknown>);
export const UNITS: Record<string, UnitTemplate> = records<UnitTemplate>(unitsJson as Record<string, unknown>);
export const MATERIALS: Record<string, MaterialDef> = records<MaterialDef>(materialsJson as Record<string, unknown>);
/** STR-1: the material a tile takes when its map names none. */
export const DEFAULT_MATERIAL: Record<TileKindName, string> = (materialsJson as unknown as { _defaults: Record<TileKindName, string> })._defaults;
export const MAPS: Record<string, MapDef> = {
  [civicSavingsBranch.id]: stripComments<MapDef>(civicSavingsBranch as Record<string, unknown>),
  [halcyonBlock.id]: stripComments<MapDef>(halcyonBlock as Record<string, unknown>),
  [automatSite.id]: stripComments<MapDef>(automatSite as Record<string, unknown>),
  [depotSite.id]: stripComments<MapDef>(depotSite as Record<string, unknown>),
  [savingsSite.id]: stripComments<MapDef>(savingsSite as Record<string, unknown>),
  [hqSite.id]: stripComments<MapDef>(hqSite as Record<string, unknown>),
  [wreckSite.id]: stripComments<MapDef>(wreckSite as Record<string, unknown>),
};
export const BATTLES: Record<string, BattleDef> = {
  [firstRaid.id]: stripComments<BattleDef>(firstRaid as Record<string, unknown>),
  [blockRaid.id]: stripComments<BattleDef>(blockRaid as Record<string, unknown>),
  [benchRaid.id]: stripComments<BattleDef>(benchRaid as Record<string, unknown>),
  [automatRaid.id]: stripComments<BattleDef>(automatRaid as Record<string, unknown>),
  [depotRaid.id]: stripComments<BattleDef>(depotRaid as Record<string, unknown>),
  [savingsRaid.id]: stripComments<BattleDef>(savingsRaid as Record<string, unknown>),
  [hqDefence.id]: stripComments<BattleDef>(hqDefence as Record<string, unknown>),
  [wreckRaid.id]: stripComments<BattleDef>(wreckRaid as Record<string, unknown>),
};

/** MAP-10 (PLAN.md D20): the playable raids, one building each, in the order the title offers them. */
export const RAID_SITES: string[] = [automatRaid.id, depotRaid.id, savingsRaid.id];

/** MAP-2 legend. */
export const LEGEND: Record<string, TileKindName> = {
  ',': 'ground',
  '.': 'floor',
  '#': 'wall',
  '+': 'door',
  '>': 'stair',
  '=': 'window',
  '%': 'rubble',
  ' ': 'void',
};
