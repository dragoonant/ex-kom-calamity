// Plain-JSON state (ARCH-6): only objects, arrays, strings, numbers, booleans and null.
export type Side = 'player' | 'hostile';
export type Terrain = 'concrete' | 'ballast' | 'mud' | 'water' | 'rubble';
export type ObjKind = 'wagon' | 'container' | 'shed' | 'barrier' | 'silo' | 'crane';
export type PartSlot = 'body' | 'armL' | 'armR' | 'legs';
export type PaintSlot = PartSlot | 'pack';
export type WeaponSlot = 'L' | 'R' | 'P';
export type Paint = 'slate' | 'camo';
export type WeaponClass = 'direct' | 'melee' | 'indirect' | 'shield';

export interface Build {
  body: string;
  armL: string;
  armR: string;
  legs: string;
  pack: string;
  wL: string | null;
  wR: string | null;
}

export interface Tile {
  t: Terrain;
  h: number;
  obj: ObjKind | null;
  objHp: number;
}

export interface Unit {
  id: string;
  pilot: string;
  side: Side;
  role: string;
  x: number;
  y: number;
  build: Build;
  paint: Record<PaintSlot, Paint>;
  hp: Record<PartSlot, number>;
  /** Ammunition left for the backpack weapon (ATK-6); null when it has none. */
  ammo: number | null;
  /** Repair charges left (SUP-1). */
  charges: number;
  moved: boolean;
  acted: boolean;
  from: { x: number; y: number } | null;
  alive: boolean;
}

export interface SalvageItem {
  kind: 'arm' | 'legs' | 'pack' | 'weapon';
  id: string;
  hp: number;
  paint: Paint;
  from: string;
}

export interface Result {
  winner: Side;
  reason: 'annihilated' | 'wiped' | 'timeout';
  rounds: number;
  lost: Record<Side, number>;
  salvage: SalvageItem[];
  credits: { fee: number; bonus: number; bounty: number };
}

export interface BattleState {
  v: 1;
  mission: string;
  seed: number;
  w: number;
  h: number;
  tiles: Tile[];
  units: Unit[];
  round: number;
  phase: Side;
  rng: [number, number, number, number];
  salvage: SalvageItem[];
  result: Result | null;
  turnCount: number;
}

export type Action =
  | { type: 'move'; unit: string; x: number; y: number }
  | { type: 'undoMove'; unit: string }
  | { type: 'attack'; unit: string; slot: WeaponSlot; target: string }
  | { type: 'attackObject'; unit: string; slot: WeaponSlot; x: number; y: number }
  | { type: 'repair'; unit: string; target: string; part: PartSlot }
  | { type: 'wait'; unit: string }
  | { type: 'endPhase' };

export interface ShotEvent {
  hit: boolean;
  part: PartSlot | null;
  dmg: number;
  partLost: boolean;
}

export type GameEvent =
  | { type: 'rejected'; reason: string }
  | { type: 'moved'; unit: string; path: { x: number; y: number }[] }
  | { type: 'undo'; unit: string; x: number; y: number }
  | { type: 'attack'; unit: string; slot: WeaponSlot; weapon: string; target: string; counter: boolean; chance: number; shots: ShotEvent[] }
  | { type: 'splash'; unit: string; target: string; dmg: number; partLost: boolean }
  | { type: 'objectHit'; unit: string; slot: WeaponSlot; weapon: string; x: number; y: number; dmg: number; broken: boolean }
  | { type: 'destroyed'; unit: string; by: string }
  | { type: 'repaired'; unit: string; target: string; part: PartSlot; amount: number }
  | { type: 'wait'; unit: string }
  | { type: 'phase'; side: Side; round: number }
  | { type: 'end'; result: Result };

export interface StepResult {
  state: BattleState;
  events: GameEvent[];
}
