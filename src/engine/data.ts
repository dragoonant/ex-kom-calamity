import partsJson from '../data/parts.json';
import pilotsJson from '../data/pilots.json';
import rulesJson from '../data/rules.json';
import missionJson from '../data/mission-01.json';
import type { Build, ObjKind, Side, Terrain, WeaponClass } from './types';

export interface BodyDef { name: string; hp: number; power: number; weight: number; kit: string; size: string }
export interface ArmDef { name: string; hp: number; acc: number; weight: number; kit: string; size: string }
export interface LegsDef { name: string; hp: number; move: number; evade: number; weight: number; kit: string; size: string }
export interface PackDef { name: string; weight: number; kind: 'none' | 'weapon' | 'sensor' | 'repair'; weapon?: string; sensorRange?: number; charges?: number; heal?: number }
export interface WeaponDef { name: string; class: WeaponClass; min: number; max: number; shots: number; dmg: number; acc: number; weight: number; ammo?: number; splash?: number; guard?: number; sfx?: string }
export interface PilotDef { name: string; call: string; skill: number; evade: number; side: Side }
export interface ObjDef { hp: number; blocksSight: boolean; cover: boolean; breakable: boolean }
export interface MissionUnit { id: string; pilot: string; side: Side; x: number; y: number; role?: string; build: Build }
export interface MissionDef {
  id: string;
  name: string;
  brief: string;
  roundLimit: number;
  bonusRound: number;
  fee: number;
  bonus: number;
  bounty: number;
  legend: Record<string, [Terrain, number] | [Terrain, number, ObjKind]>;
  map: string[];
  units: MissionUnit[];
}
export interface RulesDef {
  terrainCost: Record<Terrain, number>;
  climbCost: number;
  waterEvade: number;
  coverPenalty: number;
  heightBonus: number;
  hitMin: number;
  hitMax: number;
  overweightMove: number;
  overweightEvade: number;
  spotterBonus: number;
  counterPenalty: number;
  dmgSpread: [number, number];
  hitWeights: Record<'direct' | 'melee' | 'indirect', Record<'body' | 'armL' | 'armR' | 'legs', number>>;
  objects: Record<ObjKind, ObjDef>;
  repairCost: number;
  repaintCost: number;
}

export const PARTS = partsJson as unknown as {
  bodies: Record<string, BodyDef>;
  arms: Record<string, ArmDef>;
  legs: Record<string, LegsDef>;
  packs: Record<string, PackDef>;
  weapons: Record<string, WeaponDef>;
};
export const PILOTS = pilotsJson as Record<string, PilotDef>;
export const RULES = rulesJson as unknown as RulesDef;
export const MISSIONS: Record<string, MissionDef> = { [missionJson.id]: missionJson as unknown as MissionDef };

export const body = (id: string): BodyDef => PARTS.bodies[id] ?? PARTS.bodies['body-lantern-m']!;
export const arm = (id: string): ArmDef => PARTS.arms[id] ?? PARTS.arms['arm-lantern-m']!;
export const legs = (id: string): LegsDef => PARTS.legs[id] ?? PARTS.legs['legs-lantern-m']!;
export const pack = (id: string): PackDef => PARTS.packs[id] ?? PARTS.packs['pack-none']!;
export const weapon = (id: string | null): WeaponDef | null => (id ? PARTS.weapons[id] ?? null : null);
export const pilot = (id: string): PilotDef => PILOTS[id] ?? { name: id, call: id, skill: 0, evade: 0, side: 'hostile' };
