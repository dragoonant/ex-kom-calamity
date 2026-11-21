// Shared rule helpers (docs/spec/20-city.md). Pure, read-only over the state.
import { CITY, RESEARCH, type BuildingDef, type Evidence, type OrgDef, type ProjectDef } from '../data/city';
import type { Band, CityState, ItemId, Org } from './types';

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

/** RES-1, SHOP-4: the auto-resolver's win chance in percent, with the squad's working kit. */
export function winChance(state: CityState, agents: number, hostiles: number): number {
  const r = state.tuning.res;
  if (hostiles <= 0) return 100;
  const kit = state.shop ? working(state, 'shell-plate', agents) * state.tuning.shop.plateWin + working(state, 'arc-carbine', agents) * state.tuning.shop.carbineWin : 0;
  const p = r.winBasePercent + r.winPerAgent * agents - r.winPerHostile * hostiles + kit;
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

const EVIDENCE_WORDS: Record<Evidence, string> = { host: 'host body', taker: 'taker body', fighter: 'fighter body', core: 'amber core', liveHost: 'live host', liveTaker: 'live taker' };

/** LAB-2 */
export function projectDef(id: string): ProjectDef | undefined {
  return RESEARCH.projects.find((p) => p.id === id);
}

export function hasDone(state: CityState, project: string): boolean {
  return state.lab.done.includes(project);
}

/** LAB-2: why a project cannot start now, or null when it can. */
export function researchBlock(state: CityState, id: string): string | null {
  const p = projectDef(id);
  if (!p) return `no project ${id}`;
  if (state.lab.project) return 'the lab is busy';
  if (hasDone(state, id)) return 'already done';
  for (const r of p.requires ?? []) if (!hasDone(state, r)) return `needs ${projectDef(r)?.name ?? r} first`;
  for (const [k, n] of Object.entries(p.needs ?? {})) if (state.shelf[k as Evidence] < (n ?? 0)) return `needs ${n} ${EVIDENCE_WORDS[k as Evidence]} on the shelf`;
  for (const [k, n] of Object.entries(p.consumes ?? {})) if (state.shelf[k as Evidence] < (n ?? 0)) return `uses up ${n} ${EVIDENCE_WORDS[k as Evidence]}`;
  return null;
}

/** RAID-7 */
export function compositionFor(state: CityState, org: Org, hostiles: number): { takers: number; fighters: number } {
  const r = state.tuning.raid;
  const quarter = Math.floor(hostiles / 4);
  const takers = org.infiltration >= r.takersAt && hostiles >= 2 ? Math.max(1, quarter) : 0;
  const fighters = org.infiltration >= r.fightersAt ? quarter : 0;
  return { takers, fighters: Math.min(fighters, Math.max(0, hostiles - takers)) };
}

/** SHOP-1 */
export function itemCost(state: CityState, item: ItemId): { cost: number; hours: number } {
  const s = state.tuning.shop;
  return item === 'shell-plate' ? { cost: s.plateCost, hours: s.plateHours } : { cost: s.carbineCost, hours: s.carbineHours };
}

/** SHOP-2: the supplier organisation (kind "arms"). */
export function supplierOrg(state: CityState): Org | undefined {
  const def = CITY.orgs.find((o) => o.kind === 'arms');
  return def ? orgOf(state, def.id) : undefined;
}

/** SHOP-4: working items carried by a squad of n. */
export function working(state: CityState, item: ItemId, n: number): number {
  const stock = state.shop.stock[item];
  const carried = Math.min(n, stock);
  if (carried <= 0) return 0;
  const good = stock - state.shop.sabotaged[item];
  return Math.floor((carried * good) / stock);
}
