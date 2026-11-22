// Engine state and action shapes (docs/spec/10-rules.md section 0). Frozen once tests exist:
// a change here needs a matching edit to the spec. Everything is plain JSON (ARCH-6).
import type { Pos, Side, Stance, Tuning } from '../data';

export type { Pos, Side, Stance, Tuning };

export type TileKind = 'ground' | 'floor' | 'wall' | 'door' | 'stair' | 'window' | 'rubble' | 'void';

/** MAP-1. Every tile carries a level, a material and health (STR-1). `open` is only ever true on a used door (MAP-3). */
export interface Tile {
  x: number;
  y: number;
  level: number;
  kind: TileKind;
  open: boolean;
  material: string;
  hp: number;
}

/** MOVE-3 */
export interface MoveOrder {
  to: Pos;
  /** Remaining steps, first step first. */
  path: Pos[];
  progress: number;
  blockedTicks: number;
  /** POSE-3: a running move (absent in saves from before M4c: a walk). */
  run?: boolean;
}

/** POSE-1 */
export type Posture = 'stand' | 'crouch';
export const POSTURES: Posture[] = ['stand', 'crouch'];

export interface Unit {
  id: string;
  name: string;
  template: string;
  side: Side;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  armour: number;
  aim: number;
  moveTicks: number;
  sight: number;
  weapon: string | null;
  disguised: boolean;
  revealed: boolean;
  down: boolean;
  stance: Stance;
  order: MoveOrder | null;
  /** Explicit fire target (ORD-4). */
  fireTarget: string | null;
  aimProgress: number;
  readyTick: number;
  lastFiredTick: number;
  /** MOVE-8: advanced its move progress at its most recent step. */
  moving: boolean;
  /** BLAST-1: charges left, and the pending one. */
  charges: number;
  blast: { at: Pos; progress: number } | null;
  /** POSE-1 (absent in saves from before M4c: standing). */
  posture?: Posture;
  /** POSE-4: the last tick the unit advanced a running step, or null (absent in old saves: never). */
  lastRunTick?: number | null;
}

export interface Score {
  shotsFired: number;
  hits: number;
  civilianHits: number;
  agentsDown: number;
  hostilesDown: number;
  civiliansDown: number;
  /** TAKE-3: citizens taken over during the battle. */
  taken: number;
}

export type Winner = 'agency' | 'hostile' | 'none';
export type OverReason = 'cleared' | 'squad-lost' | 'mutual' | 'timeout' | 'withdrawn';

export interface Over {
  winner: Winner;
  reason: OverReason;
  tick: number;
}

/** ARCH-11: who fights, from the city (M7). Absent: the battle file's own squad and spawns. */
export interface Roster {
  /** Fills the battle's squad spawn points in order; spare spawn points stay empty. */
  squad?: { name: string; template?: string; weapon?: string }[];
  /** Fills the battle's hostile spawn points (fighters, then takers, then hosts); spare ones hold citizens, and
   * citizen spawn points take the overflow as hosts. */
  hostiles?: { host: number; taker: number; fighter: number };
}

export interface Setup {
  battleId: string;
  seed: number;
  tuning?: Partial<Tuning>;
  roster?: Roster;
}

export type Action =
  | { type: 'tick' }
  | { type: 'move'; side: Side; unit: string; to: Pos; run?: boolean }
  | { type: 'fire'; side: Side; unit: string; target: string }
  | { type: 'stance'; side: Side; unit: string; stance: Stance }
  | { type: 'posture'; side: Side; unit: string; posture: Posture }
  | { type: 'halt'; side: Side; unit: string }
  | { type: 'blast'; side: Side; unit: string; at: Pos }
  | { type: 'withdraw'; side: Side };

/** ARCH-9: consecutive ticks are stored as one entry. */
export type LogEntry = { type: 'tick'; count: number } | Exclude<Action, { type: 'tick' }>;

export interface State {
  version: 1;
  battleId: string;
  mapId: string;
  seed: number;
  tick: number;
  width: number;
  depth: number;
  levels: number;
  tiles: Tile[];
  units: Unit[];
  rng: [number, number, number, number];
  tuning: Tuning;
  score: Score;
  over: Over | null;
  log: LogEntry[];
  /** VIEW-5: only on `view(state, 'agency')`, never on the true state: where the last few hostiles are. */
  marks?: Pos[];
}

export interface ShotBreakdown {
  accuracy: number;
  aim: number;
  falloff: number;
  movingPenalty: number;
  /** POSE-4: a ranged shot at a crouched target 2 or more tiles away. */
  crouchPenalty: number;
  /** POSE-4: a crouched shooter's steadier aim. */
  crouchBonus: number;
  /** POSE-4: the shooter ran within the last fire.runSettleTicks. */
  runPenalty: number;
  /** COVER-4: what the target's cover took off, and its grade. */
  cover: number;
  coverGrade: 'none' | 'low' | 'half' | 'full';
  raw: number;
  chance: number;
}

export type GameEvent =
  | { type: 'ordered'; tick: number; action: Exclude<Action, { type: 'tick' }> }
  | { type: 'moved'; tick: number; unit: string; from: Pos; to: Pos }
  | { type: 'arrived'; tick: number; unit: string }
  | { type: 'moveBlocked'; tick: number; unit: string }
  | { type: 'doorOpened'; tick: number; at: Pos }
  | {
      type: 'shot';
      tick: number;
      shooter: string;
      target: string;
      weapon: string;
      distance: number;
      moving: boolean;
      breakdown: ShotBreakdown;
      roll: number;
      hit: boolean;
    }
  | { type: 'damaged'; tick: number; unit: string; raw: number; armour: number; dealt: number; hp: number }
  | { type: 'down'; tick: number; unit: string }
  | { type: 'revealed'; tick: number; unit: string; by: 'fire' | 'proximity' }
  | { type: 'tileDamaged'; tick: number; at: Pos; amount: number; hp: number }
  | { type: 'tileDestroyed'; tick: number; at: Pos; was: TileKind; now: TileKind }
  | { type: 'fell'; tick: number; unit: string; from: Pos; to: Pos; dealt: number; hp: number }
  | { type: 'blast'; tick: number; unit: string; at: Pos }
  | { type: 'taken'; tick: number; unit: string; by: string; seen: boolean }
  | { type: 'over'; tick: number; winner: Winner; reason: OverReason };

export type StepResult =
  | { ok: true; state: State; events: GameEvent[] }
  | { ok: false; state: State; reason: string };

export const STANCES: Stance[] = ['engage', 'retaliate', 'hold'];
export const SIDES: Side[] = ['agency', 'hostile', 'civilian'];
