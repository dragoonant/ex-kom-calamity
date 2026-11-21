// City state and action shapes (docs/spec/20-city.md section 0). Plain JSON (CARCH-5); integers only (CARCH-6).
import type { CityTuning } from '../data/city';
import type { RngState } from '../engine/rng';

export type { CityTuning };

export type CitySide = 'agency' | 'hostile';
export const CITY_SIDES: CitySide[] = ['agency', 'hostile'];

/** WATCH-3: what a watch reports. */
export type Band = 'clean' | 'low' | 'some' | 'heavy';
export const BANDS: Band[] = ['clean', 'low', 'some', 'heavy'];

/** SIGN-2 */
export type SlipKind = 'missing' | 'purchase' | 'power' | 'perfect' | 'vote' | 'hum' | 'spotted';
export const SLIP_KINDS: SlipKind[] = ['missing', 'purchase', 'power', 'perfect', 'vote', 'hum', 'spotted'];

export interface Org {
  id: string;
  /** SPREAD-1: hidden from the agency (CVIEW-1). 0..spread.cap */
  infiltration: number;
  /** SPREAD-6 */
  turned: boolean;
  /** RAID-6: the agency's standing with the organisation, 0..100. */
  standing: number;
}

export interface Building {
  id: string;
  /** WATCH-3: the agency's last report on the building's organisation, or null. */
  watch: { band: Band; tick: number } | null;
  /** RAID-5: the tick of the last raid here, or null. */
  raidedTick: number | null;
}

/** ROSTER-1 */
export type AgentStatus = 'ready' | 'watching' | 'raiding' | 'wounded' | 'dead';
export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  /** Tick at which a wound heals or a watch ends; 0 otherwise. */
  until: number;
  /** The building being watched. */
  building: string | null;
  raids: number;
}

export interface Slip {
  id: number;
  tick: number;
  kind: SlipKind;
  building: string | null;
  org: string | null;
  district: string | null;
  /** SIGN-4: true when the slip comes from real infiltration; hidden from the agency (CVIEW-1). */
  genuine: boolean;
}

/** RES-1: a raid's result, from the auto-resolver or a fought battle (RES-6). */
export interface RaidResult {
  won: boolean;
  agentsDown: string[];
  hostilesDown: number;
  civiliansDown: number;
}

/** RAID-1..4 */
export interface Raid {
  building: string;
  agents: string[];
  orderedTick: number;
  arriveTick: number;
  /** RAID-3: fixed when the squad arrives, from the infiltration then. */
  hostiles: number;
  arrived: boolean;
}

export interface CityScore {
  raids: number;
  raidsWon: number;
  cleanRaids: number;
  hostilesDown: number;
  agentsDead: number;
  civiliansDown: number;
  taken: number;
  seeds: number;
}

export interface CityOver {
  winner: CitySide;
  reason: 'contained' | 'spread' | 'confidence' | 'turned' | 'squad';
  tick: number;
}

export interface CityState {
  seed: number;
  tuning: CityTuning;
  rng: RngState;
  tick: number;
  money: number;
  confidence: number;
  orgs: Org[];
  buildings: Building[];
  agents: Agent[];
  nextAgent: number;
  slips: Slip[];
  nextSlip: number;
  raid: Raid | null;
  /** SPREAD-2: the enemy's resource, hidden from the agency. */
  biomass: number;
  /** SPREAD-3: the first tick the enemy may act again. */
  hostileReadyTick: number;
  score: CityScore;
  over: CityOver | null;
  log: CityLogEntry[];
}

export type CityAction =
  | { type: 'tick' }
  | { type: 'watch'; side: 'agency'; agent: string; building: string }
  | { type: 'recall'; side: 'agency'; agent: string }
  | { type: 'raid'; side: 'agency'; building: string; agents: string[] }
  | { type: 'resolve'; side: 'agency'; result?: RaidResult }
  | { type: 'recruit'; side: 'agency' }
  | { type: 'seed'; side: 'hostile'; org: string };

export type CityLogEntry = Exclude<CityAction, { type: 'tick' }> | { type: 'tick'; count: number };

export type CityEvent =
  | { type: 'hour'; tick: number; hour: number }
  | { type: 'day'; tick: number; day: number; biomass: number; confidenceLoss: number }
  | { type: 'month'; tick: number; month: number; grant: number; salaries: number }
  | { type: 'slip'; slip: Slip }
  | { type: 'watchSent'; agent: string; building: string }
  | { type: 'watched'; agent: string; building: string; band: Band }
  | { type: 'recalled'; agent: string }
  | { type: 'raidOrdered'; building: string; agents: string[]; arriveTick: number }
  | { type: 'raidArrived'; building: string; hostiles: number }
  | { type: 'raidResolved'; building: string; result: RaidResult; auto: boolean; roll: number | null; winChance: number | null; cleansed: number; scandal: boolean }
  | { type: 'agentDown'; agent: string; dead: boolean; roll: number }
  | { type: 'healed'; agent: string }
  | { type: 'recruited'; agent: string; cost: number }
  | { type: 'seeded'; org: string; amount: number; cost: number }
  | { type: 'turned'; org: string }
  | { type: 'confidence'; delta: number; why: string }
  | { type: 'cityOver'; over: CityOver };

export type CityStepResult =
  | { ok: true; state: CityState; events: CityEvent[] }
  | { ok: false; state: CityState; reason: string };

export interface CitySetup {
  seed: number;
  tuning?: Partial<CityTuning>;
}
