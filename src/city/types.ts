// City state and action shapes (docs/spec/20-city.md section 0). Plain JSON (CARCH-5); integers only (CARCH-6).
import type { CityTuning, Evidence } from '../data/city';
import type { RngState } from '../engine/rng';

export type { CityTuning };

export type CitySide = 'agency' | 'hostile';
export const CITY_SIDES: CitySide[] = ['agency', 'hostile'];

/** WATCH-3: what a watch reports. */
export type Band = 'clean' | 'low' | 'some' | 'heavy';
export const BANDS: Band[] = ['clean', 'low', 'some', 'heavy'];

/** SIGN-2 */
export type SlipKind = 'missing' | 'purchase' | 'power' | 'perfect' | 'vote' | 'hum' | 'spotted' | 'confession' | 'landing' | 'found';
export const SLIP_KINDS: SlipKind[] = ['missing', 'purchase', 'power', 'perfect', 'vote', 'hum', 'spotted', 'confession', 'landing', 'found'];
export type ItemId = 'shell-plate' | 'arc-carbine';

/** AIR-1: positions are in tenths of a city cell (integers, CARCH-6). */
export type CraftKind = 'scout' | 'seeder' | 'carrier';
export interface Craft {
  id: string;
  kind: CraftKind;
  x: number;
  y: number;
  /** AIR-2: where it is going; hidden from the agency (CVIEW-1). */
  tx: number;
  ty: number;
  target: string;
  hp: number;
  maxHp: number;
  /** AIR-4: press fires on contact; shadow follows without firing. */
  posture: 'press' | 'shadow';
}
export interface Car {
  id: string;
  status: 'ready' | 'flying' | 'repair' | 'lost';
  hp: number;
  x: number;
  y: number;
  craft: string | null;
  until: number;
}
/** AIR-6 */
export interface Crash {
  id: string;
  kind: CraftKind;
  x: number;
  y: number;
  building: string | null;
  survivors: number;
  until: number;
}

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

/** ROSTER-1, TRAVEL-2: an agent drives out (`travelling`), watches, and drives home (`returning`). */
export type AgentStatus = 'ready' | 'travelling' | 'watching' | 'raiding' | 'returning' | 'wounded' | 'dead';

/** TRAVEL-1: a drive between two points in tenths of a cell, leaving and arriving on these ticks. */
export interface Leg {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  depart: number;
  arrive: number;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  /** Tick at which a wound heals, a drive arrives or a watch ends; 0 otherwise. */
  until: number;
  /** The building being driven to or watched (TRAVEL-2). */
  building: string | null;
  /** TRAVEL-1: the drive under way, or null (ready, watching, wounded, dead, or a squad at the door). */
  leg: Leg | null;
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
  /** RES-7 (a fought battle only): captives taken alive, citizens evacuated, and a wreck's core secured. */
  captured?: { host: number; taker: number };
  saved?: number;
  core?: boolean;
}

/** RAID-1..4 */
export interface Raid {
  building: string;
  agents: string[];
  orderedTick: number;
  arriveTick: number;
  /** RAID-3: fixed when the squad arrives, from the infiltration then. */
  hostiles: number;
  /** RAID-7: how many of them are takers and fighters (the rest are hosts). */
  takers: number;
  fighters: number;
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
  reason: 'source' | 'spread' | 'confidence' | 'turned' | 'squad' | 'hq' | 'time';
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
  /** LAB-1: the evidence shelf. */
  shelf: Record<Evidence, number>;
  /** LAB-2 */
  lab: { project: string | null; progress: number; done: string[] };
  /** SHOP-1..4: the workshop's job, the stock, and the supplier's deliveries; `sabotaged` is hidden from the agency (CVIEW-1). */
  shop: { item: ItemId | null; progress: number; stock: Record<ItemId, number>; sabotaged: Record<ItemId, number>; orders: { item: ItemId; arriveTick: number; sabotaged: boolean }[] };
  /** AIR-1..7 */
  /** ACT-1: the act, the day it began, and whether the organism has found headquarters (ACT-4). */
  act: 1 | 2 | 3;
  actDay: number;
  hqFound: boolean;
  /** ACT-5: an assault on headquarters waiting to be met, and when the next may come. */
  defence: { hostiles: number; takers: number; fighters: number } | null;
  assaultReadyTick: number;
  craft: Craft[];
  cars: Car[];
  crashes: Crash[];
  nextCraft: number;
  hostileLaunchTick: number;
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
  | { type: 'research'; side: 'agency'; project: string }
  | { type: 'build'; side: 'agency'; item: ItemId }
  | { type: 'order'; side: 'agency'; item: ItemId }
  | { type: 'question'; side: 'agency' }
  | { type: 'intercept'; side: 'agency'; craft: string; cars: string[] }
  | { type: 'posture'; side: 'agency'; craft: string; posture: 'press' | 'shadow' }
  | { type: 'buyCar'; side: 'agency' }
  | { type: 'launch'; side: 'hostile'; kind: CraftKind; target: string }
  | { type: 'assault'; side: 'hostile' }
  | { type: 'defend'; side: 'agency'; result?: RaidResult }
  | { type: 'seed'; side: 'hostile'; org: string };

export type CityLogEntry = Exclude<CityAction, { type: 'tick' }> | { type: 'tick'; count: number };

export type CityEvent =
  | { type: 'hour'; tick: number; hour: number }
  | { type: 'day'; tick: number; day: number; biomass: number; confidenceLoss: number }
  | { type: 'month'; tick: number; month: number; grant: number; salaries: number }
  | { type: 'slip'; slip: Slip }
  | { type: 'watchSent'; agent: string; building: string; arriveTick: number }
  | { type: 'watchStarted'; agent: string; building: string }
  | { type: 'home'; agent: string }
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
  | { type: 'researchStarted'; project: string }
  | { type: 'researchDone'; project: string }
  | { type: 'shelved'; host: number; taker: number; fighter: number; core: number; liveHost: number; liveTaker: number }
  | { type: 'buildStarted'; item: ItemId; cost: number }
  | { type: 'built'; item: ItemId }
  | { type: 'ordered'; item: ItemId; cost: number; arriveTick: number }
  | { type: 'delivered'; item: ItemId }
  | { type: 'launched'; craft: string; kind: CraftKind; x: number; y: number }
  | { type: 'intercepting'; craft: string; cars: string[] }
  | { type: 'dogfight'; craft: string; craftHp: number; hits: number; carsHit: string[]; rolls: number[] }
  | { type: 'carLost'; car: string }
  | { type: 'carBack'; car: string }
  | { type: 'downed'; craft: string; kind: CraftKind; x: number; y: number; building: string | null; crash: string }
  | { type: 'landed'; craft: string; kind: CraftKind; building: string; amount: number }
  | { type: 'scattered'; crash: string; org: string | null; amount: number }
  | { type: 'carBought'; car: string; cost: number }
  | { type: 'actBegan'; act: 2 | 3; day: number }
  | { type: 'hqFound'; craft: string }
  | { type: 'assault'; hostiles: number }
  | { type: 'defended'; result: RaidResult; auto: boolean; roll: number | null; winChance: number | null }
  | { type: 'cityOver'; over: CityOver };

export type CityStepResult =
  | { ok: true; state: CityState; events: CityEvent[] }
  | { ok: false; state: CityState; reason: string };

export interface CitySetup {
  seed: number;
  tuning?: Partial<CityTuning>;
}
