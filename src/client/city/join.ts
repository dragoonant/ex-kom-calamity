// M7, the join (docs/spec/20-city.md CJOIN; PLAN M7): a squad at a door, or headquarters under assault, may be
// fought as the real battle. The building's raid site (CITY-4), the headquarters map or the open-ground wreck map
// names the battle (CJOIN-1); the city's agents with their working kit and the raid's own hostiles fill it through
// the battle's roster (ARCH-11, CJOIN-3); its result flows back as a fought result (CJOIN-2).
import { CITY, RAID_SITE_BATTLES } from '../../data/city';
import { query, type Roster, type State } from '../../engine';
import { working, type CityState, type RaidResult } from '../../city';
import type { PendingFight } from './store';

/** CJOIN-1: the battle a raid, a wreck or a defence is fought on. */
export function battleOf(state: CityState, kind: 'raid' | 'defence', target: string): string {
  if (kind === 'defence') return 'hq-defence';
  const crash = state.crashes.find((c) => c.id === target);
  if (crash) return crash.building ? battleFor(crash.building) : 'wreck-raid';
  return battleFor(target);
}

/** CJOIN-3: the squad with its working kit (plates first, then carbines, as SHOP-4) and the hostiles by kind. */
export function rosterOf(state: CityState, agents: string[], hostiles: { hostiles: number; takers: number; fighters: number }): Roster {
  const plates = working(state, 'shell-plate', agents.length);
  const carbines = working(state, 'arc-carbine', agents.length);
  return {
    squad: agents.map((id, i) => ({
      name: state.agents.find((a) => a.id === id)?.name ?? id,
      ...(i < plates ? { template: 'agent-t2' } : {}),
      ...(i < carbines ? { weapon: 'arc-carbine' } : {}),
    })),
    hostiles: { host: Math.max(0, hostiles.hostiles - hostiles.takers - hostiles.fighters), taker: hostiles.takers, fighter: hostiles.fighters },
  };
}

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
