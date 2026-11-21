// CARCH-1: createCity builds the opening state from the city data and merged tuning.
import { CITY, CITY_TUNING } from '../data/city';
import { seedRng } from '../engine/rng';
import type { Agent, CitySetup, CityState, CityTuning } from './types';

export function mergeCityTuning(over?: Partial<CityTuning>): CityTuning {
  const base = JSON.parse(JSON.stringify(CITY_TUNING)) as CityTuning;
  if (!over) return base;
  const out = base as unknown as Record<string, Record<string, number>>;
  for (const [section, values] of Object.entries(over)) {
    if (!values || !out[section]) continue;
    out[section] = { ...out[section], ...(values as Record<string, number>) };
  }
  return out as unknown as CityTuning;
}

export function agentName(index: number): string {
  const names = CITY.agency.names;
  const base = names[index % names.length]!;
  const round = Math.floor(index / names.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function newAgent(index: number): Agent {
  return { id: `ag${index + 1}`, name: agentName(index), status: 'ready', until: 0, building: null, raids: 0 };
}

export function createCity(setup: CitySetup): CityState {
  const tuning = mergeCityTuning(setup.tuning);
  const agents: Agent[] = [];
  for (let i = 0; i < tuning.roster.startAgents; i++) agents.push(newAgent(i));
  return {
    seed: setup.seed,
    tuning,
    rng: seedRng(setup.seed),
    tick: 0,
    money: tuning.fund.startMoney,
    confidence: tuning.fund.startConfidence,
    // SPREAD-1: the source organisation starts infiltrated, every other one clean.
    orgs: CITY.orgs.map((o) => ({ id: o.id, infiltration: o.source ? tuning.spread.sourceStart : 0, turned: false, standing: 50 })),
    buildings: CITY.buildings.map((b) => ({ id: b.id, watch: null, raidedTick: null })),
    agents,
    nextAgent: agents.length,
    slips: [],
    nextSlip: 1,
    raid: null,
    biomass: tuning.spread.startBiomass,
    hostileReadyTick: 0,
    score: { raids: 0, raidsWon: 0, cleanRaids: 0, hostilesDown: 0, agentsDead: 0, civiliansDown: 0, taken: 0, seeds: 0 },
    shelf: { host: 0, taker: 0, fighter: 0, core: 0, liveHost: 0, liveTaker: 0 },
    lab: { project: null, progress: 0, done: [] },
    shop: { item: null, progress: 0, stock: { 'shell-plate': 0, 'arc-carbine': 0 }, sabotaged: { 'shell-plate': 0, 'arc-carbine': 0 }, orders: [] },
    act: 1,
    actDay: 0,
    hqFound: false,
    defence: null,
    assaultReadyTick: 0,
    craft: [],
    cars: Array.from({ length: tuning.air.startCars }, (_, i) => ({ id: `car${i + 1}`, status: 'ready' as const, hp: tuning.air.carHp, x: CITY.agency.hq.x * 10 + 5, y: CITY.agency.hq.y * 10 + 5, craft: null, until: 0 })),
    crashes: [],
    nextCraft: 1,
    hostileLaunchTick: 0,
    over: null,
    log: [],
  };
}
