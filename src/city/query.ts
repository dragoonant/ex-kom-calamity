// CQRY-1..6: every number a client shows.
import { CITY } from '../data/city';
import { bandOf, buildingDef, grantOf, livingAgents, readyAgents, winChance } from './rules';
import { clockOf, ticksPerHour } from './time';
import type { Band, CityState } from './types';

export const cityQuery = {
  /** CQRY-1 */
  clock: (s: CityState) => clockOf(s.tuning, s.tick),
  /** CQRY-2: the grant if the month ended now (the agency's view gives the same number: CVIEW-1 hides only its inputs). */
  grant: (s: CityState) => grantOf(s),
  /** CQRY-3: the raid's odds once the squad is at the door. */
  raidOdds: (s: CityState) => {
    if (!s.raid || !s.raid.arrived) return { ok: false as const };
    return { ok: true as const, hostiles: s.raid.hostiles, agents: s.raid.agents.length, winChance: winChance(s, s.raid.agents, s.raid.hostiles) };
  },
  /** CQRY-4: what the agency knows of each building. */
  board: (s: CityState) =>
    CITY.buildings.map((def) => {
      const b = s.buildings.find((x) => x.id === def.id)!;
      const slips = s.slips.filter((sl) => sl.building === def.id || (sl.building === null && sl.org === def.org)).length;
      const districtSlips = s.slips.filter((sl) => sl.kind === 'missing' && sl.district === def.district).length;
      const watching = s.agents.filter((a) => (a.status === 'watching' || a.status === 'travelling') && a.building === def.id).map((a) => a.id);
      return { id: def.id, name: def.name, org: def.org, district: def.district, band: (b.watch?.band ?? null) as Band | null, bandTick: b.watch?.tick ?? null, slips, districtSlips, watching, raidedTick: b.raidedTick, turned: s.orgs.find((o) => o.id === def.org)?.turned ?? false };
    }),
  /** CQRY-5 */
  roster: (s: CityState) => ({ living: livingAgents(s).length, ready: readyAgents(s).length, cap: s.tuning.roster.cap, recruitCost: s.tuning.roster.recruitCost }),
  /** CQRY-6 */
  outcome: (s: CityState) => ({ over: s.over, score: s.score, money: s.money, confidence: s.confidence }),
  band: bandOf,
  building: buildingDef,
  ticksPerHour: (s: CityState) => ticksPerHour(s.tuning),
};
