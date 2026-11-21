// Shared rule helpers (docs/spec/20-city.md). Pure, read-only over the state.
import { CITY, type BuildingDef, type OrgDef } from '../data/city';
import type { Band, CityState, Org } from './types';

export function buildingDef(id: string): BuildingDef | undefined {
  return CITY.buildings.find((b) => b.id === id);
}

export function orgDef(id: string): OrgDef | undefined {
  return CITY.orgs.find((o) => o.id === id);
}

export function orgOf(state: CityState, id: string): Org | undefined {
  return state.orgs.find((o) => o.id === id);
}

export function orgOfBuilding(state: CityState, buildingId: string): Org | undefined {
  const def = buildingDef(buildingId);
  return def ? orgOf(state, def.org) : undefined;
}

export function sourceOrg(state: CityState): Org | undefined {
  const def = CITY.orgs.find((o) => o.source);
  return def ? orgOf(state, def.id) : undefined;
}

/** WATCH-3: the band of an infiltration level. */
export function bandOf(infiltration: number): Band {
  if (infiltration <= 0) return 'clean';
  if (infiltration < 20) return 'low';
  if (infiltration < 50) return 'some';
  return 'heavy';
}

/** RAID-3: the hostiles a raid meets at this infiltration. */
export function hostilesFor(state: CityState, org: Org): number {
  const r = state.tuning.raid;
  if (org.infiltration <= 0) return 0;
  const base = Math.min(r.maxHostiles, 1 + Math.floor((org.infiltration * r.hostilesPer10Points) / 10));
  return base + (org.turned ? r.turnedGuards : 0);
}

/** RES-1: the auto-resolver's win chance in percent. */
export function winChance(state: CityState, agents: number, hostiles: number): number {
  const r = state.tuning.res;
  if (hostiles <= 0) return 100;
  const p = r.winBasePercent + r.winPerAgent * agents - r.winPerHostile * hostiles;
  return Math.max(r.winMinPercent, Math.min(r.winMaxPercent, p));
}

/** RES-1: each agent's chance to go down, in percent. */
export function downChance(state: CityState, hostiles: number, won: boolean): number {
  const r = state.tuning.res;
  if (hostiles <= 0) return 0;
  return Math.max(0, Math.min(r.downMaxPercent, r.downPerHostilePercent * hostiles + (won ? 0 : r.downOnLossPercent)));
}

export function livingAgents(state: CityState) {
  return state.agents.filter((a) => a.status !== 'dead');
}

export function readyAgents(state: CityState) {
  return state.agents.filter((a) => a.status === 'ready');
}

/** FUND-2: the grant at month end, before salaries. */
export function grantOf(state: CityState): number {
  const f = state.tuning.fund;
  let cut = 0;
  for (const o of state.orgs) {
    if (o.turned) cut += f.turnedCutPercent;
    else if (o.infiltration >= state.tuning.spread.lobbyAt) cut += f.lobbyCutPercent;
  }
  const gross = Math.floor((f.grantBase * state.confidence) / 50);
  return Math.floor((gross * Math.max(0, 100 - cut)) / 100);
}

export function totalInfiltration(state: CityState): number {
  return state.orgs.reduce((s, o) => s + o.infiltration, 0);
}
