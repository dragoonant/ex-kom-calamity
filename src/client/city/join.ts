// M7, the join (docs/spec/20-city.md CJOIN; PLAN M7): a squad at a door, or headquarters under assault, may be
// fought as the real battle. The building's raid site (CITY-4), the headquarters map or the open-ground wreck map
// names the battle (CJOIN-1); the city's agents with their working kit and the raid's own hostiles fill it through
// the battle's roster (ARCH-11, CJOIN-3); its result flows back as a fought result (CJOIN-2).
import { CITY, RAID_SITE_BATTLES } from '../../data/city';
import { query, type Roster, type State } from '../../engine';
import { battleItem, clockOf, hasDone, orgOfBuilding, type CityState, type RaidResult } from '../../city';

/** CJOIN-4 */
export const SPITTER_AT = 30;
import type { PendingFight } from './store';

/** CJOIN-1: the battle a raid, a wreck or a defence is fought on. */
export function battleOf(state: CityState, kind: 'raid' | 'defence', target: string): string {
  if (kind === 'defence') return 'hq-defence';
  const crash = state.crashes.find((c) => c.id === target);
  if (crash) return crash.building ? battleFor(crash.building) : 'wreck-raid';
  return battleFor(target);
}

/** CJOIN-3, KIT-8: the squad, each agent in its own suit with its own long arm, and the hostiles by kind. */
export function rosterOf(state: CityState, agents: string[], hostiles: { hostiles: number; takers: number; fighters: number }, building?: string): Roster {
  return {
    // OBJ-1: restraints let the squad take hosts and takers alive (CJOIN-5).
    capture: hasDone(state, 'restraints'),
    // NIGHT-1, NIGHT-3 (CJOIN-6): the hour of the raid, and whether the lab has the hand scanner.
    night: clockOf(state.tuning, state.tick).night,
    scanner: hasDone(state, 'hand-scanner'),
    squad: agents.map((id) => {
      const a = state.agents.find((x) => x.id === id);
      if (!a) return { name: id };
      return { name: a.name, template: battleItem(a.kit.suit, 'suit'), weapon: battleItem(a.kit.long, 'long') };
    }),
    hostiles: (() => {
      // CJOIN-4: once the owner is at spitterAt infiltration, a fifth of the hostiles are spitters, taken from the hosts.
      const hosts = Math.max(0, hostiles.hostiles - hostiles.takers - hostiles.fighters);
      const org = building ? orgOfBuilding(state, building) : undefined;
      const spitters = org && org.infiltration >= SPITTER_AT ? Math.min(hosts, Math.floor(hostiles.hostiles / 5)) : 0;
      return { host: hosts - spitters, taker: hostiles.takers, fighter: hostiles.fighters, spitter: spitters };
    })(),
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
  // CJOIN-5: captives by kind, citizens evacuated, and the wreck's core.
  const captured = { host: 0, taker: 0 };
  for (const u of state.units) if (u.captured) captured[u.template === 'taker' ? 'taker' : 'host'] += 1;
  return {
    won: o.over?.winner === 'agency',
    agentsDown,
    hostilesDown: o.score.hostilesDown,
    civiliansDown: o.score.civiliansDown,
    captured,
    saved: state.score.saved ?? 0,
    ...(state.core ? { core: state.core.secured } : {}),
  };
}
