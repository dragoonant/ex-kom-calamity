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
}

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

export interface Setup {
  battleId: string;
  seed: number;
  tuning?: Partial<Tuning>;
}

export type Action =
  | { type: 'tick' }
  | { type: 'move'; side: Side; unit: string; to: Pos }
  | { type: 'fire'; side: Side; unit: string; target: string }
  | { type: 'stance'; side: Side; unit: string; stance: Stance }
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
