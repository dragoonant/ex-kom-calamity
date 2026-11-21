// CARCH-3: every legal action for a side, tick first, never empty.
import { CITY } from '../data/city';
import { RESEARCH } from '../data/city';
import { hasDone, itemCost, livingAgents, readyAgents, researchBlock, supplierOrg } from './rules';
import type { CityAction, CitySide, CityState } from './types';

export function cityLegalActions(state: CityState, side: CitySide): CityAction[] {
  const acts: CityAction[] = [{ type: 'tick' }];
  if (state.over) return acts;
  if (side === 'agency') {
    const ready = readyAgents(state);
    // CARCH-3: one watch per ready agent and building.
    for (const a of ready) for (const b of CITY.buildings) acts.push({ type: 'watch', side, agent: a.id, building: b.id });
    for (const a of state.agents) if (a.status === 'watching') acts.push({ type: 'recall', side, agent: a.id });
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
  } else if (side === 'hostile') {
    const sp = state.tuning.spread;
    if (state.tick >= state.hostileReadyTick && state.biomass >= sp.seedCost) {
      for (const o of state.orgs) if (o.infiltration < sp.cap) acts.push({ type: 'seed', side, org: o.id });
    }
  }
  return acts;
}
