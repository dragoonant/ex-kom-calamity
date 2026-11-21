// CARCH-2: the city's pure step (docs/spec/20-city.md). Never mutates its input, never throws on a bad action.
import { CITY, EVIDENCE } from '../data/city';
import { nextInt } from '../engine/rng';
import { newAgent } from './game';
import { appendCityLog } from './replay';
import { airHour, launch, launchBlock } from './air';
import {
  bandOf,
  buildingDef,
  compositionFor,
  hasDone,
  itemCost,
  projectDef,
  researchBlock,
  supplierOrg,
  working,
  downChance,
  grantOf,
  hostilesFor,
  livingAgents,
  orgOf,
  orgDef,
  orgOfBuilding,
  totalInfiltration,
  winChance,
} from './rules';
import { absoluteTicks, clockOf, ticksPerDay, ticksPerHour } from './time';
import { BANDS, type CityAction, type CityEvent, type CityState, type CityStepResult, type RaidResult, type Slip, type SlipKind } from './types';

function clone(s: CityState): CityState {
  // The log's entries are never mutated (appendCityLog returns a new array), so it is shared rather than copied.
  const { log, ...rest } = s;
  const c = JSON.parse(JSON.stringify(rest)) as CityState;
  c.log = log;
  return c;
}

function reject(state: CityState, reason: string): CityStepResult {
  return { ok: false, state, reason };
}

function accept(state: CityState, action: CityAction, events: CityEvent[]): CityStepResult {
  state.log = appendCityLog(state.log, action);
  return { ok: true, state, events };
}

function addConfidence(s: CityState, delta: number, why: string, events: CityEvent[]): void {
  if (delta === 0) return;
  const before = s.confidence;
  s.confidence = Math.max(0, Math.min(100, s.confidence + delta));
  if (s.confidence !== before) events.push({ type: 'confidence', delta: s.confidence - before, why });
}

function finish(s: CityState, winner: 'agency' | 'hostile', reason: NonNullable<CityState['over']>['reason'], events: CityEvent[]): void {
  if (s.over) return;
  s.over = { winner, reason, tick: s.tick };
  events.push({ type: 'cityOver', over: s.over });
}

/** SIGN-1..5: the slips one hour prints. */
function hourSigns(s: CityState, events: CityEvent[]): void {
  const sg = s.tuning.signs;
  const night = clockOf(s.tuning, s.tick).night;
  const print = (kind: SlipKind, buildingId: string | null, genuine: boolean) => {
    const def = buildingId ? buildingDef(buildingId) : undefined;
    // SIGN-2: what a kind names. A missing-persons slip names only the district; purchase and vote name the organisation.
    const slip: Slip = {
      id: s.nextSlip++,
      tick: s.tick,
      kind,
      building: kind === 'missing' || kind === 'purchase' || kind === 'vote' ? null : (buildingId ?? null),
      org: kind === 'missing' ? null : (def?.org ?? null),
      district: def?.district ?? null,
      genuine,
    };
    s.slips.push(slip);
    if (s.slips.length > sg.keep) s.slips.splice(0, s.slips.length - sg.keep);
    events.push({ type: 'slip', slip });
  };
  const eligible = (infiltration: number, genuine: boolean): SlipKind[] => {
    const k: SlipKind[] = [];
    if (infiltration >= sg.missingMin || !genuine) k.push('missing');
    if (infiltration >= sg.purchaseMin || !genuine) k.push('purchase');
    if (night && (infiltration >= sg.powerMin || !genuine)) k.push('power');
    if (!night && (infiltration >= sg.perfectMin || !genuine)) k.push('perfect');
    if (infiltration >= sg.voteMin || !genuine) k.push('vote');
    if (night && genuine && infiltration >= sg.humMin) k.push('hum'); // SIGN-4: never noise
    return k;
  };
  // SIGN-1: each building of an infiltrated organisation rolls in data order.
  for (const b of CITY.buildings) {
    const org = orgOf(s, b.org);
    if (!org || org.infiltration <= 0) continue;
    const chance = org.infiltration * sg.permillePerPoint;
    if (nextInt(s.rng, 1000) >= chance) continue;
    const kinds = eligible(org.infiltration, true);
    if (kinds.length === 0) continue;
    print(kinds[nextInt(s.rng, kinds.length)]!, b.id, true);
  }
  // SIGN-3: one noise roll per hour, on a clean building.
  if (nextInt(s.rng, 1000) < sg.noisePermille) {
    const clean = CITY.buildings.filter((b) => (orgOf(s, b.org)?.infiltration ?? 0) <= 0);
    if (clean.length > 0) {
      const b = clean[nextInt(s.rng, clean.length)]!;
      const kinds = eligible(0, false);
      print(kinds[nextInt(s.rng, kinds.length)]!, b.id, false);
    }
  }
}

/** ACT-1 */
function beginAct(s: CityState, act: 2 | 3, day: number, events: CityEvent[]): void {
  s.act = act;
  s.actDay = day;
  events.push({ type: 'actBegan', act, day });
}

/** SPREAD-4..6, FUND-4, CEND-2, CEND-4: what the end of a day does. */
function dayEnd(s: CityState, day: number, events: CityEvent[]): void {
  const sp = s.tuning.spread;
  const total = totalInfiltration(s);
  // ACT-2: from act 2 the organism feeds faster.
  const bonus = s.act >= 2 ? 100 + s.tuning.act.biomassBonusPercent : 100;
  const biomass = Math.floor((total * sp.biomassPer100Points * bonus) / 10000);
  s.biomass += biomass;
  for (const o of s.orgs) {
    if (o.infiltration <= 0) continue;
    const growth = Math.max(1, Math.floor((o.infiltration * sp.dailyGrowthPercent) / 100));
    const next = Math.min(sp.cap, o.infiltration + growth);
    s.score.taken += next - o.infiltration;
    o.infiltration = next;
    if (!o.turned && o.infiltration >= sp.turnAt) {
      o.turned = true;
      o.standing = 0;
      events.push({ type: 'turned', org: o.id });
    }
  }
  const loss = Math.floor((total * s.tuning.fund.missingPer100Points) / 100);
  addConfidence(s, -loss, 'missing persons', events);
  events.push({ type: 'day', tick: s.tick, day, biomass, confidenceLoss: loss });
  const e = s.tuning.end;
  const turned = s.orgs.filter((o) => o.turned).length;
  if (turned * 100 >= e.turnedLosePercent * s.orgs.length) finish(s, 'hostile', 'turned', events);
  // CEND-4, ACT-2: act 1 ends after end.actDays; a contained city opens act 2, an uncontained one is lost.
  if (s.act === 1 && day >= e.actDays && !s.over) {
    const contained = totalInfiltration(s) <= e.containedTotal && !s.orgs.some((o) => o.turned);
    if (contained) beginAct(s, 2, day, events);
    else finish(s, 'hostile', 'spread', events);
  }
  // ACT-6: acts 2 and 3 have a time limit.
  if (!s.over && s.act === 2 && day - s.actDay >= s.tuning.act.act2Days) finish(s, 'hostile', 'time', events);
  if (!s.over && s.act === 3 && day - s.actDay >= s.tuning.act.act3Days) finish(s, 'hostile', 'time', events);
}

/** FUND-1..3, ROSTER-5, CEND-1 */
function monthEnd(s: CityState, month: number, events: CityEvent[]): void {
  const grant = grantOf(s);
  const salaries = s.tuning.roster.salaryPerMonth * livingAgents(s).length;
  s.money += grant - salaries;
  events.push({ type: 'month', tick: s.tick, month, grant, salaries });
  if (s.confidence < s.tuning.end.confidenceFloor) finish(s, 'hostile', 'confidence', events);
}

/** CEND-3 */
function squadCheck(s: CityState, events: CityEvent[]): void {
  if (livingAgents(s).length === 0 && s.money < s.tuning.roster.recruitCost) finish(s, 'hostile', 'squad', events);
}

/** LAB-2, SHOP-1, SHOP-2: an hour of work in the lab and the workshop, and the deliveries due. */
function labHour(s: CityState, events: CityEvent[]): void {
  if (s.lab.project) {
    s.lab.progress += 1;
    const p = projectDef(s.lab.project);
    if (p && s.lab.progress >= p.hours) {
      s.lab.done.push(p.id);
      events.push({ type: 'researchDone', project: p.id });
      // ACT-3: tracing the source in act 2 opens act 3.
      if (p.id === 'source-trace' && s.act === 2) beginAct(s, 3, clockOf(s.tuning, s.tick).day, events);
      s.lab.project = null;
      s.lab.progress = 0;
    }
  }
  if (s.shop.item) {
    s.shop.progress += 1;
    if (s.shop.progress >= itemCost(s, s.shop.item).hours) {
      s.shop.stock[s.shop.item] += 1;
      events.push({ type: 'built', item: s.shop.item });
      s.shop.item = null;
      s.shop.progress = 0;
    }
  }
  const due = s.shop.orders.filter((o) => o.arriveTick <= s.tick);
  if (due.length) {
    s.shop.orders = s.shop.orders.filter((o) => o.arriveTick > s.tick);
    for (const o of due) {
      s.shop.stock[o.item] += 1;
      if (o.sabotaged) s.shop.sabotaged[o.item] += 1;
      events.push({ type: 'delivered', item: o.item });
    }
  }
}

/** ACT-7: the final raid is a raid on the source's tower in act 3. */
function isFinal(s: CityState, building: string): boolean {
  return s.act === 3 && building === CITY.agency.final;
}

function tick(state: CityState, action: CityAction): CityStepResult {
  // CEND-6, RAID-4: after the end, or while a squad stands at the door, a tick changes nothing.
  if (state.over || (state.raid && state.raid.arrived) || state.defence) return { ok: true, state, events: [] };
  const s = clone(state);
  const events: CityEvent[] = [];
  s.tick += 1;
  const tph = ticksPerHour(s.tuning);
  // ROSTER-4, WATCH-2: watches end and wounds heal, in roster order.
  for (const a of s.agents) {
    if (a.status === 'wounded' && s.tick >= a.until) {
      a.status = 'ready';
      a.until = 0;
      events.push({ type: 'healed', agent: a.id });
    } else if (a.status === 'watching' && s.tick >= a.until && a.building) {
      const org = orgOfBuilding(s, a.building);
      const truth = bandOf(org?.infiltration ?? 0);
      let band = truth;
      // WATCH-3: right with watch.accuracyPercent, otherwise one band off.
      const lab = s.tuning.lab;
      const accuracy = s.tuning.watch.accuracyPercent + (hasDone(s, 'host-tells') ? lab.tellsAccuracy : 0) + (hasDone(s, 'hand-scanner') ? lab.scannerAccuracy : 0);
      if (nextInt(s.rng, 100) >= accuracy) {
        const i = BANDS.indexOf(truth);
        const up = i === 0 ? true : i === BANDS.length - 1 ? false : nextInt(s.rng, 2) === 0;
        band = BANDS[i + (up ? 1 : -1)]!;
      }
      const b = s.buildings.find((x) => x.id === a.building);
      if (b) b.watch = { band, tick: s.tick };
      events.push({ type: 'watched', agent: a.id, building: a.building, band });
      // WATCH-4: a spotted host.
      const spot = s.tuning.watch.spotPercent + (hasDone(s, 'hand-scanner') ? s.tuning.lab.scannerSpot : 0);
      if ((org?.infiltration ?? 0) > 0 && nextInt(s.rng, 100) < spot) {
        const def = buildingDef(a.building);
        const slip: Slip = { id: s.nextSlip++, tick: s.tick, kind: 'spotted', building: a.building, org: def?.org ?? null, district: def?.district ?? null, genuine: true };
        s.slips.push(slip);
        if (s.slips.length > s.tuning.signs.keep) s.slips.splice(0, s.slips.length - s.tuning.signs.keep);
        events.push({ type: 'slip', slip });
      }
      a.status = 'ready';
      a.until = 0;
      a.building = null;
    }
  }
  // RAID-2, RAID-3: the squad arrives; the hostiles are fixed now.
  if (s.raid && !s.raid.arrived && s.tick >= s.raid.arriveTick) {
    const org = orgOfBuilding(s, s.raid.building);
    const crash = s.crashes.find((c) => c.id === s.raid!.building);
    s.raid.arrived = true;
    // AIR-8: a crash site holds the craft's survivors; a seeder's are takers.
    const final = isFinal(s, s.raid.building);
    s.raid.hostiles = final ? s.tuning.act.finalHostiles : crash ? crash.survivors : org ? hostilesFor(s, org) : 0;
    const third = Math.floor(s.raid.hostiles / 3);
    const comp = final ? { takers: third, fighters: third } : crash ? { takers: crash.kind === 'seeder' ? crash.survivors : 0, fighters: crash.kind === 'carrier' ? crash.survivors : 0 } : org ? compositionFor(s, org, s.raid.hostiles) : { takers: 0, fighters: 0 };
    s.raid.takers = comp.takers;
    s.raid.fighters = comp.fighters;
    events.push({ type: 'raidArrived', building: s.raid.building, hostiles: s.raid.hostiles });
  }
  const abs = absoluteTicks(s.tuning, s.tick);
  if (abs % tph === 0) {
    const c = clockOf(s.tuning, s.tick);
    labHour(s, events);
    airHour(s, events);
    hourSigns(s, events);
    events.push({ type: 'hour', tick: s.tick, hour: c.hour });
  }
  if (abs % ticksPerDay(s.tuning) === 0) {
    const c = clockOf(s.tuning, s.tick);
    dayEnd(s, c.day, events);
    if (c.dayOfMonth === 0) monthEnd(s, c.month, events);
  }
  return accept(s, action, events);
}

function autoResult(s: CityState, hostiles: number, agents: string[]): { result: RaidResult; roll: number | null; chance: number | null } {
  if (hostiles <= 0) return { result: { won: true, agentsDown: [], hostilesDown: 0, civiliansDown: 0 }, roll: null, chance: null };
  const chance = winChance(s, agents.length, hostiles);
  const roll = nextInt(s.rng, 100);
  const won = roll < chance;
  const down = downChance(s, hostiles, won);
  // SHOP-4: the first agents carry the working plates.
  const plated = working(s, 'shell-plate', agents.length);
  const plateDown = Math.floor((down * (100 - s.tuning.shop.plateDownCutPercent)) / 100);
  const agentsDown = agents.filter((_, i) => nextInt(s.rng, 100) < (i < plated ? plateDown : down));
  const hostilesDown = won ? hostiles : nextInt(s.rng, hostiles);
  let civiliansDown = nextInt(s.rng, Math.floor(hostiles / 2) + 1);
  if (hasDone(s, 'evacuation')) civiliansDown = Math.floor((civiliansDown * s.tuning.lab.evacuationCivilianPercent) / 100); // LAB-6
  return { result: { won, agentsDown, hostilesDown, civiliansDown }, roll, chance };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function resolve(state: CityState, action: Extract<CityAction, { type: 'resolve' }>): CityStepResult {
  if (!state.raid || !state.raid.arrived) return reject(state, 'no squad is waiting at a door');
  const raid = state.raid;
  let given = action.result;
  if (given !== undefined) {
    // RES-6: a fought battle's result, checked and clamped to the raid.
    if (typeof given !== 'object' || given === null || typeof given.won !== 'boolean') return reject(state, 'result needs won');
    if (!Array.isArray(given.agentsDown) || given.agentsDown.some((id) => !raid.agents.includes(id))) return reject(state, 'agentsDown must be agents on the raid');
    if (new Set(given.agentsDown).size !== given.agentsDown.length) return reject(state, 'agentsDown repeats an agent');
    if (!isInt(given.hostilesDown) || given.hostilesDown < 0 || !isInt(given.civiliansDown) || given.civiliansDown < 0) return reject(state, 'counts must be non-negative integers');
    given = { ...given, agentsDown: [...given.agentsDown], hostilesDown: Math.min(given.hostilesDown, raid.hostiles) };
  }
  const s = clone(state);
  const events: CityEvent[] = [];
  const r = s.raid!;
  const auto = given === undefined;
  const { result, roll, chance } = auto ? autoResult(s, r.hostiles, r.agents) : { result: given!, roll: null, chance: null };
  const org = orgOfBuilding(s, r.building);
  // RES-2: agents down die or are wounded.
  for (const a of s.agents) {
    if (!r.agents.includes(a.id)) continue;
    a.raids += 1;
    if (result.agentsDown.includes(a.id)) {
      const d = nextInt(s.rng, 100);
      const deathPercent = hasDone(s, 'antiserum') ? Math.floor((s.tuning.roster.deathPercent * s.tuning.lab.antiserumDeathPercent) / 100) : s.tuning.roster.deathPercent;
      const dead = d < deathPercent;
      a.status = dead ? 'dead' : 'wounded';
      a.until = dead ? 0 : s.tick + s.tuning.roster.woundDays * ticksPerDay(s.tuning);
      events.push({ type: 'agentDown', agent: a.id, dead, roll: d });
      if (dead) {
        s.score.agentsDead += 1;
        addConfidence(s, -s.tuning.fund.agentLoss, 'agent killed', events);
      }
    } else {
      a.status = 'ready';
      a.until = 0;
    }
  }
  // RES-3: the raid cleanses the organisation.
  let cleansed = 0;
  if (org && r.hostiles > 0) {
    cleansed = result.hostilesDown * s.tuning.res.cleansePerHostile + (result.won ? s.tuning.res.cleanseOnWin : 0);
    const before = org.infiltration;
    // SPREAD-7: until the spine research (M5b), raids cannot push the source below spread.sourceFloor.
    const floor = orgDef(org.id)?.source && !hasDone(s, 'source-trace') ? Math.min(before, s.tuning.spread.sourceFloor) : 0; // LAB-7
    org.infiltration = Math.max(floor, org.infiltration - cleansed);
    cleansed = before - org.infiltration;
    // SPREAD-6: a raid that pushes a turned organisation below spread.lobbyAt turns it back.
    if (org.infiltration < s.tuning.spread.lobbyAt) org.turned = false;
  }
  // LAB-1, LAB-3: the bodies and captives of the hostiles down go on the shelf.
  if (result.hostilesDown > 0) {
    let left = result.hostilesDown;
    const hosts = Math.min(left, r.hostiles - r.takers - r.fighters);
    left -= hosts;
    const takers = Math.min(left, r.takers);
    left -= takers;
    const fighters = Math.min(left, r.fighters);
    const add = { host: hosts, taker: takers, fighter: fighters, core: takers + fighters, liveHost: 0, liveTaker: 0 };
    if (result.won && hasDone(s, 'restraints') && add.host > 0) {
      const n = Math.min(add.host, s.tuning.lab.capturePerRaid);
      add.host -= n;
      add.liveHost += n;
    }
    if (result.won && hasDone(s, 'taker-cage') && add.taker > 0) {
      const n = Math.min(add.taker, s.tuning.lab.capturePerRaid);
      add.taker -= n;
      add.core -= n;
      add.liveTaker += n;
    }
    for (const k of EVIDENCE) s.shelf[k] += add[k];
    events.push({ type: 'shelved', ...add });
  }
  // RAID-6: a raid on a clean building is a scandal.
  const crash = s.crashes.find((c) => c.id === r.building);
  if (crash) {
    // AIR-8: the site is cleared either way; a win recovers the craft's amber drive.
    s.crashes = s.crashes.filter((c) => c.id !== crash.id);
    if (result.won) s.shelf.core += s.tuning.air.crashCores;
  }
  const scandal = r.hostiles === 0 && !crash;
  if (scandal) {
    s.score.cleanRaids += 1;
    addConfidence(s, -s.tuning.fund.scandalLoss, 'raid on a clean building', events);
    if (org) org.standing = Math.max(0, org.standing - 2 * s.tuning.fund.scandalLoss);
  } else if (result.won) {
    s.score.raidsWon += 1;
    addConfidence(s, s.tuning.fund.winGain, 'raid won', events);
    if (org) org.standing = Math.min(100, org.standing + s.tuning.fund.winGain);
  }
  addConfidence(s, -result.civiliansDown * s.tuning.fund.civilianLoss, 'citizens killed', events);
  s.score.raids += 1;
  s.score.hostilesDown += result.hostilesDown;
  s.score.civiliansDown += result.civiliansDown;
  // RES-4: a won raid leaves the agency knowing the building's band.
  const b = s.buildings.find((x) => x.id === r.building);
  if (b) {
    b.raidedTick = s.tick;
    if (result.won && org) b.watch = { band: bandOf(org.infiltration), tick: s.tick };
  }
  events.push({ type: 'raidResolved', building: r.building, result, auto, roll, winChance: chance, cleansed, scandal });
  const wasFinal = isFinal(s, r.building);
  s.raid = null;
  if (wasFinal && result.won) finish(s, 'agency', 'source', events); // ACT-7
  squadCheck(s, events);
  return accept(s, action, events);
}

/** ACT-5: headquarters is defended by every agent at home (ready). A loss there ends the campaign. */
function defend(state: CityState, action: Extract<CityAction, { type: 'defend' }>): CityStepResult {
  if (!state.defence) return reject(state, 'nobody is at the door of headquarters');
  const s = clone(state);
  const events: CityEvent[] = [];
  const d = s.defence!;
  const home = s.agents.filter((a) => a.status === 'ready').map((a) => a.id);
  let result: RaidResult;
  let roll: number | null = null;
  let chance: number | null = null;
  if (action.result !== undefined) {
    const g = action.result;
    if (typeof g !== 'object' || g === null || typeof g.won !== 'boolean' || !Array.isArray(g.agentsDown) || g.agentsDown.some((id) => !home.includes(id))) return reject(state, 'a defence result names only agents at home');
    if (!isInt(g.hostilesDown) || g.hostilesDown < 0 || !isInt(g.civiliansDown) || g.civiliansDown < 0) return reject(state, 'counts must be non-negative integers');
    result = { ...g, agentsDown: [...new Set(g.agentsDown)], hostilesDown: Math.min(g.hostilesDown, d.hostiles) };
  } else if (home.length === 0) {
    result = { won: false, agentsDown: [], hostilesDown: 0, civiliansDown: 0 };
  } else {
    const auto = autoResult(s, d.hostiles, home.slice(0, s.tuning.raid.maxAgents));
    result = auto.result;
    roll = auto.roll;
    chance = auto.chance;
  }
  for (const a of s.agents) {
    if (!result.agentsDown.includes(a.id)) continue;
    const r = nextInt(s.rng, 100);
    const dead = r < s.tuning.roster.deathPercent;
    a.status = dead ? 'dead' : 'wounded';
    a.until = dead ? 0 : s.tick + s.tuning.roster.woundDays * ticksPerDay(s.tuning);
    events.push({ type: 'agentDown', agent: a.id, dead, roll: r });
    if (dead) s.score.agentsDead += 1;
  }
  s.score.hostilesDown += result.hostilesDown;
  if (result.won) {
    // The attackers' bodies go to the lab, hosts first (LAB-1).
    const hosts = Math.max(0, d.hostiles - d.takers - d.fighters);
    s.shelf.host += hosts;
    s.shelf.taker += d.takers;
    s.shelf.fighter += d.fighters;
    s.shelf.core += d.takers + d.fighters;
  }
  events.push({ type: 'defended', result, auto: action.result === undefined, roll, winChance: chance });
  s.defence = null;
  if (!result.won) finish(s, 'hostile', 'hq', events);
  else squadCheck(s, events);
  return accept(s, action, events);
}

export function cityStep(state: CityState, action: CityAction): CityStepResult {
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') return reject(state, 'not an action');
  if (action.type === 'tick') return tick(state, action);
  if (state.over) return reject(state, 'the campaign is over');
  const side = (action as { side?: unknown }).side;
  switch (action.type) {
    case 'watch': {
      if (side !== 'agency') return reject(state, 'watch is an agency order');
      const a = state.agents.find((x) => x.id === action.agent);
      if (!a) return reject(state, `no agent ${String(action.agent)}`);
      if (a.status !== 'ready') return reject(state, `${a.name} is not ready`);
      if (!buildingDef(action.building)) return reject(state, `no building ${String(action.building)}`);
      const s = clone(state);
      const ag = s.agents.find((x) => x.id === action.agent)!;
      ag.status = 'watching';
      ag.building = action.building;
      ag.until = s.tick + s.tuning.watch.hours * ticksPerHour(s.tuning);
      return accept(s, action, [{ type: 'watchSent', agent: ag.id, building: action.building }]);
    }
    case 'recall': {
      if (side !== 'agency') return reject(state, 'recall is an agency order');
      const a = state.agents.find((x) => x.id === action.agent);
      if (!a || a.status !== 'watching') return reject(state, 'only a watching agent can be recalled');
      const s = clone(state);
      const ag = s.agents.find((x) => x.id === action.agent)!;
      ag.status = 'ready';
      ag.until = 0;
      ag.building = null;
      return accept(s, action, [{ type: 'recalled', agent: ag.id }]);
    }
    case 'raid': {
      if (side !== 'agency') return reject(state, 'raid is an agency order');
      if (state.raid) return reject(state, 'a raid is already under way');
      if (!buildingDef(action.building) && !state.crashes.some((c) => c.id === action.building)) return reject(state, `no building or crash site ${String(action.building)}`);
      if (!Array.isArray(action.agents) || action.agents.length === 0) return reject(state, 'a raid needs at least one agent');
      if (action.agents.length > state.tuning.raid.maxAgents) return reject(state, `at most ${state.tuning.raid.maxAgents} agents on a raid`);
      if (new Set(action.agents).size !== action.agents.length) return reject(state, 'an agent is listed twice');
      for (const id of action.agents) {
        const a = state.agents.find((x) => x.id === id);
        if (!a || a.status !== 'ready') return reject(state, `agent ${String(id)} is not ready`);
      }
      const s = clone(state);
      for (const a of s.agents) if (action.agents.includes(a.id)) a.status = 'raiding';
      const arriveTick = s.tick + s.tuning.raid.travelHours * ticksPerHour(s.tuning);
      s.raid = { building: action.building, agents: [...action.agents], orderedTick: s.tick, arriveTick, hostiles: 0, takers: 0, fighters: 0, arrived: false };
      return accept(s, action, [{ type: 'raidOrdered', building: action.building, agents: [...action.agents], arriveTick }]);
    }
    case 'resolve':
      if (side !== 'agency') return reject(state, 'resolve is an agency order');
      return resolve(state, action);
    case 'recruit': {
      if (side !== 'agency') return reject(state, 'recruit is an agency order');
      const cost = state.tuning.roster.recruitCost;
      if (state.money < cost) return reject(state, 'not enough money');
      if (livingAgents(state).length >= state.tuning.roster.cap) return reject(state, 'the roster is full');
      const s = clone(state);
      const a = newAgent(s.nextAgent);
      s.nextAgent += 1;
      s.agents.push(a);
      s.money -= cost;
      return accept(s, action, [{ type: 'recruited', agent: a.id, cost }]);
    }
    case 'research': {
      if (side !== 'agency') return reject(state, 'research is an agency order');
      const why = researchBlock(state, action.project);
      if (why) return reject(state, why);
      const s = clone(state);
      const p = projectDef(action.project)!;
      for (const [k, n] of Object.entries(p.consumes ?? {})) s.shelf[k as keyof typeof s.shelf] -= n ?? 0;
      s.lab.project = p.id;
      s.lab.progress = 0;
      return accept(s, action, [{ type: 'researchStarted', project: p.id }]);
    }
    case 'build':
    case 'order': {
      if (side !== 'agency') return reject(state, `${action.type} is an agency order`);
      if (action.item !== 'shell-plate' && action.item !== 'arc-carbine') return reject(state, `no item ${String(action.item)}`);
      if (!hasDone(state, action.item)) return reject(state, 'the design is not researched');
      const { cost, hours } = itemCost(state, action.item);
      if (action.type === 'build') {
        if (state.shop.item) return reject(state, 'the workshop is busy');
        if (state.money < cost) return reject(state, 'not enough money');
        const s = clone(state);
        s.money -= cost;
        s.shop.item = action.item;
        s.shop.progress = 0;
        void hours;
        return accept(s, action, [{ type: 'buildStarted', item: action.item, cost }]);
      }
      const sup = supplierOrg(state);
      if (!sup || sup.turned) return reject(state, 'the supplier will not sell to the agency');
      const price = Math.floor((cost * state.tuning.shop.supplierPricePercent) / 100);
      if (state.money < price) return reject(state, 'not enough money');
      const s = clone(state);
      s.money -= price;
      const sabotaged = sup.infiltration >= s.tuning.shop.sabotageAt; // SHOP-3
      if (sabotaged) s.biomass += Math.floor((price * s.tuning.shop.sabotageBiomassPercent) / 100);
      const arriveTick = s.tick + s.tuning.shop.supplierHours * ticksPerHour(s.tuning);
      s.shop.orders.push({ item: action.item, arriveTick, sabotaged });
      return accept(s, action, [{ type: 'ordered', item: action.item, cost: price, arriveTick }]);
    }
    case 'question': {
      if (side !== 'agency') return reject(state, 'question is an agency order');
      if (!hasDone(state, 'interrogation')) return reject(state, 'the lab has not learned to question a captive');
      if (state.shelf.liveHost < 1) return reject(state, 'no live host to question');
      const s = clone(state);
      s.shelf.liveHost -= 1;
      // LAB-5: the most infiltrated organisation, ties in data order.
      let best = s.orgs[0]!;
      for (const o of s.orgs) if (o.infiltration > best.infiltration) best = o;
      const events: CityEvent[] = [];
      const first = CITY.buildings.find((b) => b.org === best.id);
      const slip: Slip = { id: s.nextSlip++, tick: s.tick, kind: 'confession', building: null, org: best.id, district: first?.district ?? null, genuine: true };
      s.slips.push(slip);
      if (s.slips.length > s.tuning.signs.keep) s.slips.splice(0, s.slips.length - s.tuning.signs.keep);
      events.push({ type: 'slip', slip });
      for (const def of CITY.buildings.filter((b) => b.org === best.id)) {
        const b = s.buildings.find((x) => x.id === def.id)!;
        b.watch = { band: bandOf(best.infiltration), tick: s.tick };
      }
      return accept(s, action, events);
    }
    case 'launch': {
      if (side !== 'hostile') return reject(state, 'launch is a hostile order');
      if (action.kind !== 'scout' && action.kind !== 'seeder' && action.kind !== 'carrier') return reject(state, 'no such craft');
      const why = launchBlock(state, action.kind, action.target);
      if (why) return reject(state, why);
      const s = clone(state);
      const events: CityEvent[] = [];
      launch(s, action.kind, action.target, events);
      return accept(s, action, events);
    }
    case 'assault': {
      if (side !== 'hostile') return reject(state, 'assault is a hostile order');
      const a = state.tuning.act;
      if (state.act !== 3) return reject(state, 'the organism assaults only in act 3');
      if (!state.hqFound) return reject(state, 'the organism has not found headquarters');
      if (state.defence) return reject(state, 'an assault is already under way');
      if (state.tick < state.assaultReadyTick) return reject(state, 'the organism is not ready to assault');
      if (state.biomass < a.assaultCost) return reject(state, 'not enough biomass');
      const s = clone(state);
      s.biomass -= a.assaultCost;
      const third = Math.floor(a.assaultHostiles / 3);
      s.defence = { hostiles: a.assaultHostiles, takers: third, fighters: third };
      s.assaultReadyTick = s.tick + a.assaultEveryDays * ticksPerDay(s.tuning);
      return accept(s, action, [{ type: 'assault', hostiles: a.assaultHostiles }]);
    }
    case 'defend':
      if (side !== 'agency') return reject(state, 'defend is an agency order');
      return defend(state, action);
    case 'intercept': {
      if (side !== 'agency') return reject(state, 'intercept is an agency order');
      const c = state.craft.find((x) => x.id === action.craft);
      if (!c) return reject(state, `no craft ${String(action.craft)}`);
      if (!Array.isArray(action.cars) || action.cars.length === 0) return reject(state, 'an intercept needs a car');
      if (new Set(action.cars).size !== action.cars.length) return reject(state, 'a car is listed twice');
      for (const id of action.cars) if (state.cars.find((x) => x.id === id)?.status !== 'ready') return reject(state, `car ${String(id)} is not ready`);
      const s = clone(state);
      for (const car of s.cars) if (action.cars.includes(car.id)) {
        car.status = 'flying';
        car.craft = c.id;
      }
      return accept(s, action, [{ type: 'intercepting', craft: c.id, cars: [...action.cars] }]);
    }
    case 'posture': {
      if (side !== 'agency') return reject(state, 'posture is an agency order');
      if (action.posture !== 'press' && action.posture !== 'shadow') return reject(state, 'press or shadow');
      if (!state.craft.some((x) => x.id === action.craft)) return reject(state, `no craft ${String(action.craft)}`);
      const s = clone(state);
      s.craft.find((x) => x.id === action.craft)!.posture = action.posture;
      return accept(s, action, []);
    }
    case 'buyCar': {
      if (side !== 'agency') return reject(state, 'buyCar is an agency order');
      const a = state.tuning.air;
      if (state.money < a.carCost) return reject(state, 'not enough money');
      if (state.cars.filter((c) => c.status !== 'lost').length >= a.carCap) return reject(state, 'the hangar is full');
      const s = clone(state);
      const id = `car${s.cars.length + 1}`;
      s.cars.push({ id, status: 'ready', hp: a.carHp, x: CITY.agency.hq.x * 10 + 5, y: CITY.agency.hq.y * 10 + 5, craft: null, until: 0 });
      s.money -= a.carCost;
      return accept(s, action, [{ type: 'carBought', car: id, cost: a.carCost }]);
    }
    case 'seed': {
      if (side !== 'hostile') return reject(state, 'seed is a hostile order');
      const org = orgOf(state, action.org);
      if (!org) return reject(state, `no organisation ${String(action.org)}`);
      const sp = state.tuning.spread;
      if (state.tick < state.hostileReadyTick) return reject(state, 'the organism is not ready to act');
      if (state.biomass < sp.seedCost) return reject(state, 'not enough biomass');
      if (org.infiltration >= sp.cap) return reject(state, 'that organisation is already full');
      const s = clone(state);
      const o = orgOf(s, action.org)!;
      const amount = Math.min(sp.seedAmount, sp.cap - o.infiltration);
      o.infiltration += amount;
      s.biomass -= sp.seedCost;
      s.hostileReadyTick = s.tick + sp.actEveryHours * ticksPerHour(s.tuning);
      s.score.seeds += 1;
      return accept(s, action, [{ type: 'seeded', org: o.id, amount, cost: sp.seedCost }]);
    }
    default:
      return reject(state, `unknown action ${String((action as { type: unknown }).type)}`);
  }
}
