// M7, the join (docs/spec/20-city.md RES-6; PLAN M7): a squad at a door may fight the real battle. The building's
// raid site (CITY-4) names the battle (CJOIN-1); its result flows back as a fought result (CJOIN-2). Until ARCH-1
// takes a roster (RULING CJOIN-2), the battle fields its site's own squad and hostiles; downed battle agents map to
// the raid's agents in order.
import { CITY, RAID_SITE_BATTLES } from '../../data/city';
import { query, type State } from '../../engine';
import type { RaidResult } from '../../city';
import type { PendingFight } from './store';

export function battleFor(building: string): string {
  const def = CITY.buildings.find((b) => b.id === building);
  return RAID_SITE_BATTLES[def?.site ?? 'automat'];
}

/** The fought result of a finished battle, in the city's terms. */
export function resultFromBattle(state: State, fight: PendingFight): RaidResult {
  const o = query.outcome(state);
  const squad = state.units.filter((u) => u.side === 'agency');
  const agentsDown: string[] = [];
  squad.forEach((u, i) => {
    const cityId = fight.agents[i];
    if (u.down && cityId) agentsDown.push(cityId);
  });
  return {
    won: o.over?.winner === 'agency',
    agentsDown,
    hostilesDown: o.score.hostilesDown,
    civiliansDown: o.score.civiliansDown,
  };
}
