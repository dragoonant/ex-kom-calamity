// Typed registry over the plain-JSON battle data. The engine reads numbers only from here
// (docs/spec/10-rules.md intro). Keys starting with "_" are comments and are stripped.
import tuningJson from './tuning.json';
import weaponsJson from './weapons.json';
import unitsJson from './units.json';
import civicSavingsBranch from './maps/civic-savings-branch.json';
import firstRaid from './battles/first-raid.json';

export type Side = 'agency' | 'hostile' | 'civilian';
export type Stance = 'engage' | 'retaliate' | 'hold';
export type WeaponKind = 'ranged' | 'melee';

export interface Tuning {
  time: { ticksPerSecond: number; maxBattleSeconds: number };
  move: { diagonalCostPercent: number; stairCostPercent: number; blockedWaitTicks: number };
  sight: { revealRange: number };
  fire: { minHitChance: number; maxHitChance: number; movingTargetPenalty: number; retaliateMemoryTicks: number };
  save: { autosaveSeconds: number };
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
  source: string;
}

export interface Pos {
  x: number;
  y: number;
  level: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  depth: number;
  levels: { level: number; rows: string[] }[];
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
export const MAPS: Record<string, MapDef> = {
  [civicSavingsBranch.id]: stripComments<MapDef>(civicSavingsBranch as Record<string, unknown>),
};
export const BATTLES: Record<string, BattleDef> = {
  [firstRaid.id]: stripComments<BattleDef>(firstRaid as Record<string, unknown>),
};

/** MAP-2 legend. */
export const LEGEND: Record<string, 'ground' | 'floor' | 'wall' | 'door' | 'stair' | 'void'> = {
  ',': 'ground',
  '.': 'floor',
  '#': 'wall',
  '+': 'door',
  '>': 'stair',
  ' ': 'void',
};
