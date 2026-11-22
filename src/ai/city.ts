// The city AI (docs/spec/20-city.md section 12). Pure functions of a side's view (CAI-1): the organism's planner and
// the agency drivers the sim and an autopilot use. No DOM, three.js or React here.
import { CITY } from '../data/city';
import { buildingUnder, cityLegalActions, clockOf, hasDone, itemCost, launchBlock, researchBlock, ticksPerDay, ticksPerHour, type CityAction, type CityState } from '../city';
import { nextInt, seedRng } from '../engine/rng';

export type CityDriver = (view: CityState) => CityAction[];

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** CAI-2: the AI's own dice, from the seed, the tick and the side; the engine's RNG is never read. */
function rngFor(view: CityState, side: string) {
  return seedRng((fnv(`${view.seed}|${view.tick}|${side}|city`) ^ Math.imul(view.seed, 0x9e3779b1)) >>> 0);
}

/** CAI-3: the organism's planner. Guards the source, keeps away from watched and raided buildings, and spreads thin
 * below the slip thresholds to grow biomass, concentrating only where an organisation is near turning. */
export const hostilePlanner: CityDriver = (view) => {
  const out = seedPlan(view);
  // CAI-8: once it has craft, a seeder at the chosen organisation's building when it can spare the biomass, or a
  // cheap scout as a decoy while a seeder flies.
  const a = view.tuning.air;
  const seededOrg = out[0]?.type === 'seed' ? out[0].org : null;
  const spare = view.biomass - (seededOrg ? view.tuning.spread.seedCost : 0);
  const rng = rngFor(view, 'hostile-air');
  const targetOrg = seededOrg ?? view.orgs.slice().sort((x, y) => x.infiltration - y.infiltration)[nextInt(rng, 3)]!.id;
  const targets = CITY.buildings.filter((b) => b.org === targetOrg);
  const target = targets[nextInt(rng, targets.length)]?.id;
  // CAI-10: once headquarters is found in act 3, assault it whenever it can.
  if (view.act === 3 && view.hqFound && !view.defence && view.tick >= view.assaultReadyTick && view.biomass >= view.tuning.act.assaultCost) {
    out.push({ type: 'assault', side: 'hostile' });
    return out;
  }
  if (target) {
    const after = { ...view, biomass: spare };
    const hunting = view.act >= 2 && !view.hqFound && !view.craft.some((c) => c.kind === 'scout');
    if (hunting && spare >= a.scoutCost && !launchBlock(after, 'scout', HQ_NEIGHBOUR)) out.push({ type: 'launch', side: 'hostile', kind: 'scout', target: HQ_NEIGHBOUR });
    else if (spare >= a.seederCost && !launchBlock(after, 'seeder', target)) out.push({ type: 'launch', side: 'hostile', kind: 'seeder', target });
    // CAI-10: in act 3 a carrier when it can afford one.
    else if (view.act === 3 && spare >= view.tuning.act.carrierCost && !launchBlock(after, 'carrier', target)) out.push({ type: 'launch', side: 'hostile', kind: 'carrier', target });
    // A scout as a decoy while a seeder is in the air, or, from act 2, to hunt for headquarters over its neighbour.
    else if (spare >= a.scoutCost && (view.craft.some((c) => c.kind !== 'scout') || (view.act >= 2 && !view.hqFound))) {
      const hunt = view.act >= 2 && !view.hqFound ? HQ_NEIGHBOUR : target;
      if (!launchBlock(after, 'scout', hunt)) out.push({ type: 'launch', side: 'hostile', kind: 'scout', target: hunt });
    }
  }
  return out;
};

/** The building nearest headquarters: where the organism's scouts look for it (CAI-10). */
const HQ_NEIGHBOUR = CITY.buildings.slice().sort((a, b) => Math.hypot(a.x - CITY.agency.hq.x, a.y - CITY.agency.hq.y) - Math.hypot(b.x - CITY.agency.hq.x, b.y - CITY.agency.hq.y))[0]!.id;

function seedPlan(view: CityState): CityAction[] {
  const legal = cityLegalActions(view, 'hostile').filter((a) => a.type === 'seed');
  if (legal.length === 0) return [];
  const t = view.tuning;
  const day = ticksPerDay(t);
  const heat = new Map<string, number>();
  for (const def of CITY.buildings) {
    const b = view.buildings.find((x) => x.id === def.id)!;
    let h = heat.get(def.org) ?? 0;
    if (view.agents.some((a) => a.status === 'watching' && a.building === def.id)) h += 3;
    if (b.raidedTick !== null && view.tick - b.raidedTick < 3 * day) h += 2;
    if (view.raid && view.raid.building === def.id) h += 5;
    heat.set(def.org, h);
  }
  const source = CITY.orgs.find((o) => o.source)?.id;
  const rng = rngFor(view, 'hostile');
  let best: { org: string; score: number } | null = null;
  for (const a of legal) {
    if (a.type !== 'seed') continue;
    const o = view.orgs.find((x) => x.id === a.org)!;
    let score = 10 - 4 * (heat.get(o.id) ?? 0);
    if (o.id === source && o.infiltration < 30) score += 12; // protect the root
    if (o.infiltration === 0) score += 4; // a new foothold
    else if (o.infiltration < t.signs.perfectMin) score += 3; // still quiet
    if (o.infiltration >= t.spread.turnAt - t.spread.seedAmount * 2 && !o.turned) score += 5; // push it over
    if (o.turned) score -= 6;
    score += nextInt(rng, 4);
    if (!best || score > best.score) best = { org: o.id, score };
  }
  return best ? [{ type: 'seed', side: 'hostile', org: best.org }] : [];
}

/** CAI-4: a random legal hostile order now and then. */
export const hostileRandom: CityDriver = (view) => {
  const legal = cityLegalActions(view, 'hostile').filter((a) => a.type === 'seed');
  if (legal.length === 0) return [];
  const rng = rngFor(view, 'hostile-random');
  return [legal[nextInt(rng, legal.length)]!];
};

/** CAI-5: the passive agency never acts (the floor the sim measures against). */
export const agencyPassive: CityDriver = (view) => (view.defence ? [{ type: 'defend', side: 'agency' }] : view.raid?.arrived ? [{ type: 'resolve', side: 'agency' }] : []);

/** CAI-5: the random agency: on the hour, sometimes a random legal order. */
export const agencyRandom: CityDriver = (view) => {
  if (view.defence) return [{ type: 'defend', side: 'agency' }];
  if (view.raid?.arrived) return [{ type: 'resolve', side: 'agency' }];
  if (view.tick % ticksPerHour(view.tuning) !== 0) return [];
  const rng = rngFor(view, 'agency-random');
  if (nextInt(rng, 100) >= 8) return [];
  const legal = cityLegalActions(view, 'agency').filter((a) => a.type !== 'tick' && a.type !== 'recall');
  return legal.length ? [legal[nextInt(rng, legal.length)]!] : [];
};

/** CAI-7 */
export const RESEARCH_ORDER = ['restraints', 'host-tells', 'antiserum', 'interrogation', 'shell-plate', 'arc-carbine', 'hand-scanner', 'evacuation', 'taker-cage', 'core-study', 'source-trace'];

const SLIP_WEIGHT: Record<string, number> = { missing: 1, purchase: 2, power: 3, perfect: 3, vote: 2, hum: 6, spotted: 8, confession: 10 };

/** CAI-6: how suspicious each building looks to the agency, from its slips of the last week and its reports. */
export function suspicion(view: CityState): Map<string, number> {
  const week = 7 * ticksPerDay(view.tuning);
  const score = new Map<string, number>(CITY.buildings.map((b) => [b.id, 0]));
  for (const sl of view.slips) {
    if (view.tick - sl.tick > week) continue;
    const w = SLIP_WEIGHT[sl.kind] ?? 1;
    for (const b of CITY.buildings) {
      if (sl.building === b.id) score.set(b.id, score.get(b.id)! + w);
      else if (sl.building === null && sl.org !== null && sl.org === b.org) score.set(b.id, score.get(b.id)! + w / 2);
      else if (sl.kind === 'missing' && sl.district === b.district) score.set(b.id, score.get(b.id)! + w / 3);
    }
  }
  // A report newer than the slips outweighs them.
  for (const b of view.buildings) {
    if (!b.watch) continue;
    const fresh = view.tick - b.watch.tick < 4 * ticksPerDay(view.tuning);
    if (!fresh) continue;
    const add = { clean: -20, low: 4, some: 10, heavy: 20 }[b.watch.band];
    score.set(b.id, score.get(b.id)! + add);
  }
  return score;
}

/** CAI-6: the careful agency: reads slips, watches the most suspicious buildings, raids what a report confirms. */
export const agencyCareful: CityDriver = (view) => {
  if (view.defence) return [{ type: 'defend', side: 'agency' }];
  if (view.raid?.arrived) return [{ type: 'resolve', side: 'agency' }];
  if (view.tick % ticksPerHour(view.tuning) !== 0) return [];
  const t = view.tuning;
  const out: CityAction[] = [];
  const day = ticksPerDay(t);
  const ready = view.agents.filter((a) => a.status === 'ready').map((a) => a.id);
  const living = view.agents.filter((a) => a.status !== 'dead').length;
  if (living < 8 && view.money >= t.roster.recruitCost + 20) out.push({ type: 'recruit', side: 'agency' });
  // CAI-7: research in a fixed order of use, question every captive, and build kit with money to spare.
  if (!view.lab.project) {
    const next = RESEARCH_ORDER.find((id) => !researchBlock(view, id));
    if (next) out.push({ type: 'research', side: 'agency', project: next });
  }
  if (hasDone(view, 'interrogation') && view.shelf.liveHost > 0 && !hasDone(view, 'hand-scanner')) out.push({ type: 'question', side: 'agency' });
  else if (hasDone(view, 'interrogation') && view.shelf.liveHost > 1) out.push({ type: 'question', side: 'agency' });
  if (!view.shop.item) {
    for (const item of ['shell-plate', 'arc-carbine'] as const) {
      if (hasDone(view, item) && view.shop.stock[item] < t.raid.maxAgents && view.money >= itemCost(view, item).cost + t.roster.recruitCost + 20) {
        out.push({ type: 'build', side: 'agency', item });
        break;
      }
    }
  }
  // CAI-9: the air war: every ready car after a seeder (a scout only when no seeder flies), pressing over open
  // ground and shadowing over buildings; crash sites are raided first; a third car when money allows.
  const readyCars = view.cars.filter((c) => c.status === 'ready').map((c) => c.id);
  const seeders = view.craft.filter((c) => c.kind === 'carrier').concat(view.craft.filter((c) => c.kind === 'seeder'));
  const quarry = seeders[0] ?? (view.craft.length && readyCars.length > 1 ? view.craft[0] : undefined);
  if (quarry && readyCars.length) out.push({ type: 'intercept', side: 'agency', craft: quarry.id, cars: readyCars });
  for (const c of view.craft) {
    const want = buildingUnder(c.x, c.y) ? 'shadow' : 'press';
    if (c.posture !== want) out.push({ type: 'posture', side: 'agency', craft: c.id, posture: want });
  }
  if (view.cars.filter((c) => c.status !== 'lost').length < 3 && view.money >= t.air.carCost + t.roster.recruitCost + 40) out.push({ type: 'buyCar', side: 'agency' });
  // CAI-11: in act 3, the final raid with a full squad, once the plates and carbines it can afford are built.
  if (!view.raid && view.act === 3 && ready.length >= t.raid.maxAgents) {
    out.push({ type: 'raid', side: 'agency', building: CITY.agency.final, agents: ready.slice(0, t.raid.maxAgents) });
    return out;
  }
  if (!view.raid && view.crashes.length && ready.length >= 3) {
    out.push({ type: 'raid', side: 'agency', building: view.crashes[0]!.id, agents: ready.slice(0, t.raid.maxAgents) });
    return out;
  }
  const sus = suspicion(view);
  const ranked = [...sus.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  // Raid a building a fresh report calls some or heavy (or low with slips behind it), with a full squad.
  if (!view.raid && ready.length >= 4 && clockOf(t, view.tick).hour >= 6) {
    // A turned organisation is public: hit its buildings first.
    const turned = new Set(view.orgs.filter((o) => o.turned).map((o) => o.id));
    const hot = CITY.buildings.find((def) => {
      const b = view.buildings.find((x) => x.id === def.id)!;
      return turned.has(def.org) && (b.raidedTick === null || view.tick - b.raidedTick > ticksPerDay(t));
    });
    if (hot) {
      out.push({ type: 'raid', side: 'agency', building: hot.id, agents: ready.slice(0, t.raid.maxAgents) });
      return out;
    }
    const target = view.buildings.find((b) => {
      if (!b.watch || view.tick - b.watch.tick >= 4 * day) return false;
      if (b.raidedTick !== null && b.raidedTick >= b.watch.tick) return false;
      return b.watch.band === 'heavy' || b.watch.band === 'some' || (b.watch.band === 'low' && (sus.get(b.id) ?? 0) >= 8);
    });
    if (target) {
      out.push({ type: 'raid', side: 'agency', building: target.id, agents: ready.slice(0, t.raid.maxAgents) });
      return out;
    }
  }
  // Keep four agents home for a raid; send the rest to watch the most suspicious unwatched buildings.
  const spare = ready.slice(4);
  let i = 0;
  for (const [id, sc] of ranked) {
    if (i >= spare.length || sc < 2) break;
    const b = view.buildings.find((x) => x.id === id)!;
    if (view.agents.some((a) => a.status === 'watching' && a.building === id)) continue;
    if (b.watch && view.tick - b.watch.tick < 2 * day) continue;
    out.push({ type: 'watch', side: 'agency', agent: spare[i]!, building: id });
    i += 1;
  }
  return out;
};

export const CITY_AGENCY_DRIVERS = { passive: agencyPassive, random: agencyRandom, careful: agencyCareful };
export const CITY_HOSTILE_DRIVERS = { planner: hostilePlanner, random: hostileRandom };
