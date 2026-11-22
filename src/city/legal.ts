// CARCH-3: every legal action for a side, tick first, never empty.
import { CITY } from '../data/city';
import { RESEARCH } from '../data/city';
import { launchBlock } from './air';
import { hasDone, itemCost, livingAgents, readyAgents, researchBlock, supplierOrg } from './rules';
import type { CityAction, CitySide, CityState } from './types';

export function cityLegalActions(state: CityState, side: CitySide): CityAction[] {
  const acts: CityAction[] = [{ type: 'tick' }];
  if (state.over) return acts;
  if (side === 'agency') {
    const ready = readyAgents(state);
    // CARCH-3: one watch per ready agent and building.
    for (const a of ready) for (const b of CITY.buildings) acts.push({ type: 'watch', side, agent: a.id, building: b.id });
    for (const a of state.agents) if (a.status === 'watching' || a.status === 'travelling') acts.push({ type: 'recall', side, agent: a.id });
    // RULING CARCH-3: one raid per building, with the first ready agents up to raid.maxAgents (every subset is too many to list).
    if (!state.raid && ready.length > 0) {
      const squad = ready.slice(0, state.tuning.raid.maxAgents).map((a) => a.id);
      for (const b of CITY.buildings) acts.push({ type: 'raid', side, building: b.id, agents: squad });
    }
    if (state.raid?.arrived) acts.push({ type: 'resolve', side });
    if (state.money >= state.tuning.roster.recruitCost && livingAgents(state).length < state.tuning.roster.cap) acts.push({ type: 'recruit', side });
    for (const p of RESEARCH.projects) if (!researchBlock(state, p.id)) acts.push({ type: 'research', side, project: p.id });
    for (const item of ['shell-plate', 'arc-carbine'] as const) {
      if (!hasDone(state, item)) continue;
      const { cost } = itemCost(state, item);
      if (!state.shop.item && state.money >= cost) acts.push({ type: 'build', side, item });
      const sup = supplierOrg(state);
      if (sup && !sup.turned && state.money >= Math.floor((cost * state.tuning.shop.supplierPricePercent) / 100)) acts.push({ type: 'order', side, item });
    }
    if (hasDone(state, 'interrogation') && state.shelf.liveHost > 0) acts.push({ type: 'question', side });
    // AIR: intercepts with every ready car, posture switches, a new car, raids on crash sites.
    const readyCars = state.cars.filter((c) => c.status === 'ready').map((c) => c.id);
    for (const c of state.craft) {
      if (readyCars.length) acts.push({ type: 'intercept', side, craft: c.id, cars: readyCars });
      acts.push({ type: 'posture', side, craft: c.id, posture: c.posture === 'press' ? 'shadow' : 'press' });
    }
    if (state.money >= state.tuning.air.carCost && state.cars.filter((c) => c.status !== 'lost').length < state.tuning.air.carCap) acts.push({ type: 'buyCar', side });
    if (!state.raid && ready.length > 0) for (const cr of state.crashes) acts.push({ type: 'raid', side, building: cr.id, agents: ready.slice(0, state.tuning.raid.maxAgents).map((a) => a.id) });
  } else if (side === 'hostile') {
    const sp = state.tuning.spread;
    if (state.tick >= state.hostileReadyTick && state.biomass >= sp.seedCost) {
      for (const o of state.orgs) if (o.infiltration < sp.cap) acts.push({ type: 'seed', side, org: o.id });
    }
    for (const kind of ['scout', 'seeder'] as const) for (const b of CITY.buildings) if (!launchBlock(state, kind, b.id)) acts.push({ type: 'launch', side, kind, target: b.id });
  }
  return acts;
}
