// Typed registry over the plain-JSON battle data. The engine reads numbers only from here
// (docs/spec/10-rules.md intro). Keys starting with "_" are comments and are stripped.
import tuningJson from './tuning.json';
import weaponsJson from './weapons.json';
import unitsJson from './units.json';
import materialsJson from './materials.json';
import civicSavingsBranch from './maps/civic-savings-branch.json';
import halcyonBlock from './maps/halcyon-block.json';
import firstRaid from './battles/first-raid.json';
import blockRaid from './battles/block-raid.json';
import benchRaid from './battles/bench-raid.json';

export type Side = 'agency' | 'hostile' | 'civilian';
export type Stance = 'engage' | 'retaliate' | 'hold';
export type WeaponKind = 'ranged' | 'melee';
export type TileKindName = 'ground' | 'floor' | 'wall' | 'door' | 'stair' | 'window' | 'rubble' | 'void';

export interface Tuning {
  time: { ticksPerSecond: number; maxBattleSeconds: number };
  move: { diagonalCostPercent: number; stairCostPercent: number; blockedWaitTicks: number; rubbleCostPercent: number };
  sight: { revealRange: number };
  fire: { minHitChance: number; maxHitChance: number; movingTargetPenalty: number; retaliateMemoryTicks: number };
  save: { autosaveSeconds: number };
  structure: { fallDamage: number };
  /** Section 22 (AI): the hostile AI's windows and ranges. */
  ai: { decideTicks: number; hostAmbushRange: number; fleeHpPercent: number; takerChaseRange: number; coverSearchTicks: number; breachRange: number; breachDetourTicks: number; randomOrderPercent: number; isolationRange: number; huntAfterAgentsDown: number; huntAfterSeconds: number };
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

/** MAP-8 */
export interface BuildingDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floors: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  depth: number;
  levels: { level: number; rows: string[]; materials?: string[] }[];
  materialKey?: Record<string, string>;
  buildings?: BuildingDef[];
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
};
export const BATTLES: Record<string, BattleDef> = {
  [firstRaid.id]: stripComments<BattleDef>(firstRaid as Record<string, unknown>),
  [blockRaid.id]: stripComments<BattleDef>(blockRaid as Record<string, unknown>),
  [benchRaid.id]: stripComments<BattleDef>(benchRaid as Record<string, unknown>),
};

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
