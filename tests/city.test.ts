// docs/spec/20-city.md: every rule id is named by a test here (tests/coverage.test.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  advanceCity,
  advanceCityTicks,
  bandOf,
  cityLegalActions,
  cityQuery,
  cityStep,
  cityView,
  clockOf,
  createCity,
  grantOf,
  hashCity,
  hostilesFor,
  replayCity,
  totalInfiltration,
  travelTicks,
  winChance,
  type CityAction,
  type CityEvent,
  type CityState,
  type CityTuning,
} from '../src/city';
import { CITY, CITY_TUNING } from '../src/data/city';
import { agencyCareful, agencyPassive, agencyRandom, hostilePlanner, hostileRandom, suspicion } from '../src/ai/city';
import { runCity } from '../src/sim/city';
import { cityInvariants } from '../src/sim/cityInvariants';

const T = CITY_TUNING;
const DAY = 144;
const HOUR = 6;

function city(seed = 1, tuning?: Partial<CityTuning>): CityState {
  return createCity({ seed, tuning });
}
function clone<S>(s: S): S {
  return JSON.parse(JSON.stringify(s)) as S;
}
function ok(s: CityState, a: CityAction): { state: CityState; events: CityEvent[] } {
  const r = cityStep(s, a);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(a)}: ${r.reason}`);
  return { state: r.state, events: r.events };
}
function rejected(s: CityState, a: CityAction): string {
  const r = cityStep(s, a);
  expect(r.ok).toBe(false);
  if (r.ok) return '';
  expect(r.state).toBe(s);
  return r.reason;
}
function ticks(s: CityState, n: number): { state: CityState; events: CityEvent[] } {
  return advanceCityTicks(s, n);
}
function withInf(s: CityState, org: string, inf: number, turned = false): CityState {
  const c = clone(s);
  const o = c.orgs.find((x) => x.id === org)!;
  o.infiltration = inf;
  o.turned = turned;
  return c;
}
function only(s: CityState, org: string, inf: number): CityState {
  const c = clone(s);
  for (const o of c.orgs) o.infiltration = o.id === org ? inf : 0;
  return c;
}
/** Ticks until the next midnight (a day's end) and stops there. */
function toMidnight(s: CityState) {
  const abs = s.tick + T.clock.startHour * HOUR;
  return ticks(s, DAY - (abs % DAY));
}
/** TRAVEL-2: ticks from a watch order until the report (the drive out plus the watch). */
function toReport(s: CityState, agent = 'ag1'): number {
  const a = s.agents.find((x) => x.id === agent)!;
  return a.until - s.tick + s.tuning.watch.hours * HOUR;
}
/** Sends a raid and ticks until the squad is at the door. */
function atDoor(s: CityState, building: string, agents = ['ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'ag6']) {
  let x = ok(s, { type: 'raid', side: 'agency', building, agents }).state;
  x = ticks(x, x.raid!.arriveTick - x.tick).state;
  expect(x.raid?.arrived).toBe(true);
  return x;
}
const CERTAIN: Partial<CityTuning> = { res: { ...T.res, winMinPercent: 100, winMaxPercent: 100, downPerHostilePercent: 0, downOnLossPercent: 0 } };
const HOPELESS: Partial<CityTuning> = { res: { ...T.res, winMinPercent: 0, winMaxPercent: 0, downPerHostilePercent: 100, downOnLossPercent: 100, downMaxPercent: 100 } };

describe('0. Engine contract (CARCH)', () => {
  it('CARCH-1 createCity builds the city and stores merged tuning', () => {
    const s = city(5, { watch: { ...T.watch, hours: 3 } });
    expect(s.seed).toBe(5);
    expect(s.tuning.watch.hours).toBe(3);
    expect(s.tuning.raid.maxAgents).toBe(T.raid.maxAgents);
    expect(s.orgs).toHaveLength(CITY.orgs.length);
    expect(s.buildings).toHaveLength(CITY.buildings.length);
  });
  it('CARCH-2 step is pure and rejections return the same object with a reason', () => {
    const s = city();
    const before = JSON.stringify(s);
    ok(s, { type: 'tick' });
    ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'city-hall' });
    expect(JSON.stringify(s)).toBe(before);
    expect(rejected(s, { type: 'watch', side: 'agency', agent: 'nobody', building: 'city-hall' })).toMatch(/no agent/);
    expect(() => cityStep(s, null as unknown as CityAction)).not.toThrow();
    expect(cityStep(s, { type: 'nonsense' } as unknown as CityAction).ok).toBe(false);
  });
  it('CARCH-3 legal actions always start with tick, for both sides, before and after the end', () => {
    const s = city();
    expect(cityLegalActions(s, 'agency')[0]).toEqual({ type: 'tick' });
    expect(cityLegalActions(s, 'hostile')[0]).toEqual({ type: 'tick' });
    const over = clone(s);
    over.over = { winner: 'hostile', reason: 'spread', tick: 0 };
    expect(cityLegalActions(over, 'agency')).toEqual([{ type: 'tick' }]);
    // every listed action is accepted
    for (const a of cityLegalActions(s, 'agency').slice(0, 40)) expect(cityStep(s, a).ok).toBe(true);
  });
  it('CARCH-4 the query gives the same win chance the resolver rolls against', () => {
    let s = atDoor(withInf(city(3), 'savings', 40), 'savings-main');
    const q = cityQuery.raidOdds(s);
    expect(q.ok).toBe(true);
    const r = ok(s, { type: 'resolve', side: 'agency' });
    const e = r.events.find((x) => x.type === 'raidResolved');
    expect(e && e.type === 'raidResolved' && q.ok && e.winChance).toBe(q.ok ? q.winChance : -1);
    s = r.state;
  });
  it('CARCH-5 state is plain JSON after a month of play', () => {
    const r = runCity({ seed: 2, agency: agencyCareful, hostile: hostilePlanner, maxTicks: 30 * DAY });
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });
  it('CARCH-6 every number in the state is an integer', () => {
    const r = runCity({ seed: 3, agency: agencyCareful, hostile: hostilePlanner, maxTicks: 20 * DAY });
    const walk = (x: unknown): void => {
      if (typeof x === 'number') expect(Number.isInteger(x)).toBe(true);
      else if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v);
    };
    walk(r.state);
  });
  it('CARCH-7 same seed and orders give the same hash; the log merges ticks and replays', () => {
    const play = (seed: number) => runCity({ seed, agency: agencyCareful, hostile: hostilePlanner, maxTicks: 10 * DAY }).state;
    expect(hashCity(play(4))).toBe(hashCity(play(4)));
    expect(hashCity(play(4))).not.toBe(hashCity(play(5)));
    let s = ticks(city(), 3).state;
    s = ok(s, { type: 'recruit', side: 'agency' }).state;
    s = ticks(s, 2).state;
    expect(s.log).toEqual([{ type: 'tick', count: 3 }, { type: 'recruit', side: 'agency' }, { type: 'tick', count: 2 }]);
    const p = play(6);
    expect(hashCity(replayCity({ seed: 6 }, p.log))).toBe(hashCity(p));
  });
  it('CARCH-8 nothing under src/city imports the DOM, three.js or React', () => {
    const dir = new URL('../src/city/', import.meta.url);
    for (const f of readdirSync(dir)) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      expect(text, f).not.toMatch(/from '(react|three|@react-three|zustand)/);
      expect(text, f).not.toMatch(/\b(document|window|globalThis)\s*[.[]|\b(requestAnimationFrame|performance\.now|Date\.now)\b/);
      for (const m of text.matchAll(/from '([^']+)'/g)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^(\.\/|\.\.\/data\/city|\.\.\/engine\/rng)/);
    }
  });
});

describe('1. The clock (CLOCK)', () => {
  it('CLOCK-1 a tick is ten minutes and tick 0 is 08:00 on day 0', () => {
    expect(clockOf(T, 0)).toMatchObject({ day: 0, hour: 8, minute: 0 });
    expect(clockOf(T, 1)).toMatchObject({ hour: 8, minute: 10 });
    expect(clockOf(T, HOUR)).toMatchObject({ hour: 9, minute: 0 });
    expect(clockOf(T, 16 * HOUR)).toMatchObject({ day: 1, hour: 0 });
  });
  it('CLOCK-2 a month is thirty days', () => {
    const t = 16 * HOUR + 30 * DAY;
    expect(clockOf(T, t)).toMatchObject({ day: 31, month: 1, dayOfMonth: 1 });
    expect(clockOf(T, 16 * HOUR + 29 * DAY)).toMatchObject({ day: 30, month: 1, dayOfMonth: 0 });
  });
  it('CLOCK-3 a tick resolves watches, arrivals, the hour and the day in order', () => {
    let s = city(1, { watch: { ...T.watch, hours: 1 } });
    s = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'city-hall' }).state;
    s = ok(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag2'] }).state;
    // Line the watch's end and the squad's arrival up on the tick before the hour (TRAVEL-2 drives come first).
    s = clone(s);
    const a1 = s.agents.find((a) => a.id === 'ag1')!;
    a1.status = 'watching';
    a1.leg = null;
    a1.until = HOUR;
    s.raid!.arriveTick = HOUR;
    s = ticks(s, HOUR - 1).state;
    const { events } = ok(s, { type: 'tick' });
    const order = events.map((e) => e.type).filter((t) => ['watched', 'raidArrived', 'hour'].includes(t));
    expect(order).toEqual(['watched', 'raidArrived', 'hour']);
    const mid = toMidnight(city());
    const types = mid.events.slice(-3).map((e) => e.type);
    expect(types).toContain('day');
    expect(mid.events.findIndex((e) => e.type === 'hour' && e.hour === 0)).toBeLessThan(mid.events.findIndex((e) => e.type === 'day'));
  });
  it('CLOCK-4 time moves only through tick; orders are accepted at any time', () => {
    const s = city();
    const r = ok(s, { type: 'recruit', side: 'agency' });
    expect(r.state.tick).toBe(0);
    expect(ok(r.state, { type: 'tick' }).state.tick).toBe(1);
  });
  it('CLOCK-5 night is 20:00 to 06:00', () => {
    expect(clockOf(T, 12 * HOUR).night).toBe(true); // 20:00
    expect(clockOf(T, 12 * HOUR - 1).night).toBe(false);
    expect(clockOf(T, 22 * HOUR - 1).night).toBe(true); // 05:50
    expect(clockOf(T, 22 * HOUR).night).toBe(false); // 06:00
  });
  it('CLOCK-6 advanceCity applies seconds times ticksPerSecond ticks and stops at a door', () => {
    const s = city();
    expect(advanceCity(s, 2).state.tick).toBe(2 * T.clock.ticksPerSecond);
    const door = atDoor(s, 'city-hall');
    expect(advanceCity(door, 5).state).toBe(door);
  });
});

describe('2. The city (CITY)', () => {
  it('CITY-1 six districts on a 24 x 24 grid', () => {
    expect(CITY.size).toBe(24);
    expect(CITY.districts).toHaveLength(6);
    for (const d of CITY.districts) expect(d.x + d.w <= 24 && d.y + d.d <= 24).toBe(true);
    expect(CITY.districts.reduce((n, d) => n + d.w * d.d, 0)).toBe(24 * 24);
  });
  it('CITY-2 ten organisations, exactly one the source', () => {
    expect(CITY.orgs).toHaveLength(10);
    expect(CITY.orgs.filter((o) => o.source)).toHaveLength(1);
  });
  it('CITY-3 48 buildings, each owned, in a district, on its own cell', () => {
    expect(CITY.buildings).toHaveLength(48);
    const cells = new Set(CITY.buildings.map((b) => `${b.x},${b.y}`));
    expect(cells.size).toBe(48);
    expect(cells.has(`${CITY.agency.hq.x},${CITY.agency.hq.y}`)).toBe(false);
    for (const b of CITY.buildings) {
      expect(CITY.orgs.some((o) => o.id === b.org)).toBe(true);
      expect(CITY.districts.some((d) => d.id === b.district)).toBe(true);
    }
  });
  it('CITY-4 every building names one of the three raid sites', () => {
    for (const b of CITY.buildings) expect(['automat', 'depot', 'savings']).toContain(b.site);
  });
  it('CITY-5 organisations start at standing 50 and buildings with no report', () => {
    const s = city();
    for (const o of s.orgs) expect(o.standing).toBe(50);
    for (const b of s.buildings) expect(b.watch).toBeNull();
  });
});

describe('3. The spread (SPREAD)', () => {
  it('SPREAD-1 only the source starts infiltrated', () => {
    const s = city();
    const src = CITY.orgs.find((o) => o.source)!.id;
    for (const o of s.orgs) expect(o.infiltration).toBe(o.id === src ? T.spread.sourceStart : 0);
  });
  it('SPREAD-2 biomass grows at midnight by total infiltration', () => {
    const s = only(city(), 'savings', 50);
    const r = toMidnight(s);
    expect(r.state.biomass).toBe(T.spread.startBiomass + Math.floor((50 * T.spread.biomassPer100Points) / 100));
  });
  it('SPREAD-3 seeding pays, adds and waits', () => {
    let s = clone(city());
    s.biomass = 30;
    s = ok(s, { type: 'seed', side: 'hostile', org: 'courier' }).state;
    expect(s.orgs.find((o) => o.id === 'courier')!.infiltration).toBe(T.spread.seedAmount);
    expect(s.biomass).toBe(30 - T.spread.seedCost);
    expect(rejected(s, { type: 'seed', side: 'hostile', org: 'vector' })).toMatch(/not ready/);
    s = ticks(s, T.spread.actEveryHours * HOUR).state;
    expect(cityStep(s, { type: 'seed', side: 'hostile', org: 'vector' }).ok).toBe(true);
    const poor = clone(city());
    poor.biomass = 1;
    expect(rejected(poor, { type: 'seed', side: 'hostile', org: 'vector' })).toMatch(/biomass/);
    expect(rejected(city(), { type: 'seed', side: 'agency', org: 'vector' } as unknown as CityAction)).toMatch(/hostile/);
  });
  it('SPREAD-4 infiltrated organisations grow at midnight, at least by one', () => {
    let s = only(city(), 'savings', 50);
    s = withInf(s, 'vector', 3);
    const r = toMidnight(s).state;
    expect(r.orgs.find((o) => o.id === 'savings')!.infiltration).toBe(50 + Math.floor((50 * T.spread.dailyGrowthPercent) / 100));
    expect(r.orgs.find((o) => o.id === 'vector')!.infiltration).toBe(4);
    expect(r.orgs.find((o) => o.id === 'council')!.infiltration).toBe(0);
    expect(r.score.taken).toBeGreaterThan(0);
  });
  it('SPREAD-5 a lobbying organisation cuts the grant', () => {
    const s = only(city(), 'savings', 0);
    const lob = withInf(s, 'savings', T.spread.lobbyAt);
    expect(grantOf(lob)).toBe(Math.floor((grantOf(s) * (100 - T.fund.lobbyCutPercent)) / 100));
  });
  it('SPREAD-6 an organisation turns at the threshold and turns back below the lobby line after a raid', () => {
    let s = only(city(1, CERTAIN), 'savings', T.spread.turnAt - 1);
    const r = toMidnight(s);
    expect(r.events.some((e) => e.type === 'turned' && e.org === 'savings')).toBe(true);
    s = r.state;
    const o = s.orgs.find((x) => x.id === 'savings')!;
    expect(o.turned && o.standing === 0).toBe(true);
    expect(cityView(s, 'agency').orgs.find((x) => x.id === 'savings')!.turned).toBe(true);
    s = atDoor(s, 'savings-main');
    expect(s.raid!.hostiles).toBe(hostilesFor(s, s.orgs.find((x) => x.id === 'savings')!));
    s = ok(s, { type: 'resolve', side: 'agency' }).state;
    const after = s.orgs.find((x) => x.id === 'savings')!;
    expect(after.infiltration).toBeLessThan(T.spread.lobbyAt);
    expect(after.turned).toBe(false);
  });
  it('SPREAD-7 a raid cannot push the source below its floor', () => {
    const src = CITY.orgs.find((o) => o.source)!.id;
    const b = CITY.buildings.find((x) => x.org === src)!.id;
    let s = only(city(1, CERTAIN), src, 20);
    s = ok(atDoor(s, b), { type: 'resolve', side: 'agency' }).state;
    expect(s.orgs.find((o) => o.id === src)!.infiltration).toBe(T.spread.sourceFloor);
  });
});

describe('4. Symptoms (SIGN)', () => {
  const day = (seed: number, s: CityState) => ticks(s, DAY).events.filter((e) => e.type === 'slip').map((e) => (e.type === 'slip' ? e.slip : null)!);
  it('SIGN-1 infiltrated buildings print genuine slips at about infiltration per mille an hour', () => {
    let n = 0;
    for (let seed = 1; seed <= 10; seed++) n += day(seed, only(city(seed), 'savings', 50)).filter((sl) => sl.genuine).length;
    // 6 buildings x 24 hours x 5% = 7.2 a day
    expect(CITY.buildings.filter((b) => b.org === 'savings')).toHaveLength(6);
    expect(n / 10).toBeGreaterThan(4.5);
    expect(n / 10).toBeLessThan(10);
    const clean = only(city(), 'savings', 0);
    expect(day(1, clean).filter((sl) => sl.genuine)).toHaveLength(0);
  });
  it('SIGN-2 a slip names the district, the organisation or the building by its kind', () => {
    const slips = [] as ReturnType<typeof day>;
    for (let seed = 1; seed <= 20; seed++) slips.push(...day(seed, only(city(seed), 'savings', 80)));
    for (const sl of slips) {
      if (sl.kind === 'missing') expect(sl.building === null && sl.org === null && sl.district !== null).toBe(true);
      else if (sl.kind === 'purchase' || sl.kind === 'vote') expect(sl.building === null && sl.org !== null).toBe(true);
      else expect(sl.building).not.toBeNull();
    }
  });
  it('SIGN-3 kinds unlock with infiltration and hour', () => {
    const low: ReturnType<typeof day> = [];
    for (let seed = 1; seed <= 30; seed++) low.push(...day(seed, only(city(seed), 'savings', 3)).filter((s) => s.genuine));
    expect(low.length).toBeGreaterThan(0);
    for (const sl of low) expect(sl.kind).toBe('missing');
    const high: ReturnType<typeof day> = [];
    for (let seed = 1; seed <= 30; seed++) high.push(...day(seed, only(city(seed), 'savings', 90)).filter((s) => s.genuine));
    for (const sl of high) {
      const c = clockOf(T, sl.tick);
      if (sl.kind === 'hum' || sl.kind === 'power') expect(c.night).toBe(true);
      if (sl.kind === 'perfect') expect(c.night).toBe(false);
    }
    expect(new Set(high.map((s) => s.kind)).size).toBeGreaterThanOrEqual(5);
  });
  it('SIGN-4 noise lands on clean buildings, is never the hum, and is hidden from the agency', () => {
    const noise: ReturnType<typeof day> = [];
    for (let seed = 1; seed <= 20; seed++) noise.push(...day(seed, only(city(seed), 'savings', 0)));
    expect(noise.length).toBeGreaterThan(5);
    for (const sl of noise) {
      expect(sl.genuine).toBe(false);
      expect(['hum', 'spotted']).not.toContain(sl.kind);
    }
    const s = ticks(only(city(), 'savings', 90), DAY).state;
    expect(cityView(s, 'agency').slips.every((sl) => !sl.genuine)).toBe(true);
    expect(s.slips.some((sl) => sl.genuine)).toBe(true);
  });
  it('SIGN-5 only the newest slips are kept, ids increasing', () => {
    const s = ticks(only(city(), 'savings', 100), 5 * DAY).state;
    expect(s.slips.length).toBeLessThanOrEqual(T.signs.keep);
    for (let i = 1; i < s.slips.length; i++) expect(s.slips[i]!.id).toBeGreaterThan(s.slips[i - 1]!.id);
  });
});

describe('5. Watching (WATCH)', () => {
  it('WATCH-1 a ready agent leaves to watch; recall brings it back with no report', () => {
    let s = ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
    const a = s.agents.find((x) => x.id === 'ag1')!;
    expect(a.status).toBe('travelling');
    expect(a.building).toBe('depot-7');
    expect(rejected(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'city-hall' })).toMatch(/not ready/);
    s = ticks(s, a.until - s.tick).state;
    expect(s.agents.find((x) => x.id === 'ag1')!.status).toBe('watching');
    expect(s.agents.find((x) => x.id === 'ag1')!.until).toBe(s.tick + T.watch.hours * HOUR);
    s = ok(s, { type: 'recall', side: 'agency', agent: 'ag1' }).state;
    expect(s.agents.find((x) => x.id === 'ag1')!.status).toBe('returning');
    s = ticks(s, s.agents.find((x) => x.id === 'ag1')!.until - s.tick).state;
    expect(s.agents.find((x) => x.id === 'ag1')!.status).toBe('ready');
    expect(s.buildings.find((b) => b.id === 'depot-7')!.watch).toBeNull();
    expect(rejected(s, { type: 'recall', side: 'agency', agent: 'ag1' })).toMatch(/watching/);
  });
  it('WATCH-2 when the time is up the agent reports and drives home', () => {
    let s = ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
    const r = ticks(s, toReport(s));
    s = r.state;
    expect(r.events.some((e) => e.type === 'watched' && e.building === 'depot-7')).toBe(true);
    expect(s.agents.find((x) => x.id === 'ag1')!.status).toBe('returning');
    expect(s.buildings.find((b) => b.id === 'depot-7')!.watch).not.toBeNull();
  });
  it('WATCH-3 the band is right about 80% of the time, otherwise one band off', () => {
    expect([0, 1, 19, 20, 49, 50, 100].map(bandOf)).toEqual(['clean', 'low', 'low', 'some', 'some', 'heavy', 'heavy']);
    let right = 0;
    const n = 100;
    for (let seed = 1; seed <= n; seed++) {
      let s = only(city(seed), 'freight', 30);
      s = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
      s = ticks(s, toReport(s)).state;
      const band = s.buildings.find((b) => b.id === 'depot-7')!.watch!.band;
      expect(['low', 'some', 'heavy']).toContain(band);
      if (band === 'some') right += 1;
    }
    expect(right).toBeGreaterThan(65);
    expect(right).toBeLessThan(95);
  });
  it('WATCH-4 a watcher spots a host only in an infiltrated building', () => {
    let spotted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = only(city(seed), 'freight', 30);
      s = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
      const r = ticks(s, toReport(s));
      if (r.events.some((e) => e.type === 'slip' && e.slip.kind === 'spotted' && e.slip.building === 'depot-7' && e.slip.genuine)) spotted += 1;
    }
    expect(spotted).toBeGreaterThan(5);
    let clean = only(city(), 'freight', 0);
    clean = ok(clean, { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
    expect(ticks(clean, toReport(clean)).events.some((e) => e.type === 'slip' && e.slip.kind === 'spotted')).toBe(false);
  });
});

describe('6. Raids (RAID)', () => {
  it('RAID-1 a raid takes 1 to 6 distinct ready agents, one raid at a time', () => {
    const s = city();
    expect(rejected(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: [] })).toMatch(/at least one/);
    expect(rejected(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'ag6', 'ag7'] })).toMatch(/at most/);
    expect(rejected(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1', 'ag1'] })).toMatch(/twice/);
    const r = ok(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1'] }).state;
    expect(r.agents.find((a) => a.id === 'ag1')!.status).toBe('raiding');
    expect(rejected(r, { type: 'raid', side: 'agency', building: 'city-hall', agents: ['ag2'] })).toMatch(/already/);
    expect(rejected(r, { type: 'watch', side: 'agency', agent: 'ag1', building: 'city-hall' })).toMatch(/not ready/);
  });
  it('RAID-2 the squad arrives after the travel time', () => {
    const s = ok(city(), { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1'] }).state;
    const depot7 = CITY.buildings.find((b) => b.id === 'depot-7')!;
    const travel = travelTicks(s, CITY.agency.hq.x * 10 + 5, CITY.agency.hq.y * 10 + 5, depot7.x * 10 + 5, depot7.y * 10 + 5);
    expect(s.raid!.arriveTick).toBe(s.tick + travel);
    expect(ticks(s, travel - 1).state.raid!.arrived).toBe(false);
    const r = ticks(s, travel);
    expect(r.state.raid!.arrived).toBe(true);
    expect(r.events.some((e) => e.type === 'raidArrived')).toBe(true);
  });
  it('RAID-3 the hostiles come from the infiltration on arrival', () => {
    const s = only(city(), 'freight', 35);
    expect(atDoor(s, 'depot-7').raid!.hostiles).toBe(1 + Math.floor((35 * T.raid.hostilesPer10Points) / 10));
    expect(atDoor(only(city(), 'freight', 0), 'depot-7').raid!.hostiles).toBe(0);
    expect(atDoor(only(city(), 'freight', 100), 'depot-7').raid!.hostiles).toBe(T.raid.maxHostiles);
    expect(atDoor(withInf(only(city(), 'freight', 0), 'freight', 35, true), 'depot-7').raid!.hostiles).toBe(4 + T.raid.turnedGuards);
  });
  it('RAID-4 while a squad stands at the door a tick changes nothing', () => {
    const s = atDoor(city(), 'depot-7');
    const r = cityStep(s, { type: 'tick' });
    expect(r.ok && r.state).toBe(s);
  });
  it('RAID-5 resolve ends the raid and records the tick', () => {
    const s = atDoor(only(city(), 'freight', 30), 'depot-7');
    expect(rejected(city(), { type: 'resolve', side: 'agency' })).toMatch(/door/);
    const r = ok(s, { type: 'resolve', side: 'agency' }).state;
    expect(r.raid).toBeNull();
    expect(r.buildings.find((b) => b.id === 'depot-7')!.raidedTick).toBe(s.tick);
  });
  it('RAID-6 a raid on a clean building is a scandal', () => {
    const s = atDoor(only(city(), 'freight', 0), 'depot-7');
    const r = ok(s, { type: 'resolve', side: 'agency' });
    expect(r.state.confidence).toBe(s.confidence - T.fund.scandalLoss);
    expect(r.state.orgs.find((o) => o.id === 'freight')!.standing).toBe(50 - 2 * T.fund.scandalLoss);
    expect(r.events.some((e) => e.type === 'raidResolved' && e.scandal)).toBe(true);
    expect(r.state.score.cleanRaids).toBe(1);
  });
});

describe('7. Resolution (RES)', () => {
  it('RES-1 the win chance and the auto-resolver follow the formula', () => {
    const s = city();
    expect(winChance(s, 6, 0)).toBe(100);
    expect(winChance(s, 6, 4)).toBe(T.res.winBasePercent + 6 * T.res.winPerAgent - 4 * T.res.winPerHostile);
    expect(winChance(s, 1, 10)).toBe(T.res.winMinPercent);
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = ok(atDoor(only(city(seed), 'freight', 30), 'depot-7', ['ag1', 'ag2', 'ag3']), { type: 'resolve', side: 'agency' });
      const e = r.events.find((x) => x.type === 'raidResolved');
      if (e && e.type === 'raidResolved') {
        expect(e.roll! < e.winChance!).toBe(e.result.won);
        if (e.result.won) {
          wins += 1;
          expect(e.result.hostilesDown).toBe(4);
        } else expect(e.result.hostilesDown).toBeLessThan(4);
        expect(e.result.civiliansDown).toBeLessThanOrEqual(2);
      }
    }
    // 50 + 36 - 36 = 50%
    expect(wins).toBeGreaterThan(70);
    expect(wins).toBeLessThan(130);
  });
  it('RES-2 downed agents die or are wounded; the rest are ready', () => {
    let dead = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = ok(atDoor(only(city(seed, HOPELESS), 'freight', 30), 'depot-7', ['ag1', 'ag2']), { type: 'resolve', side: 'agency' }).state;
      for (const id of ['ag1', 'ag2']) {
        const a = r.agents.find((x) => x.id === id)!;
        expect(['dead', 'wounded']).toContain(a.status);
        if (a.status === 'dead') dead += 1;
        else expect(a.until).toBe(r.tick + T.roster.woundDays * DAY);
      }
      expect(r.agents.find((x) => x.id === 'ag3')!.status).toBe('ready');
    }
    expect(dead).toBeGreaterThan(5);
    expect(dead).toBeLessThan(35);
  });
  it('RES-3 a raid cleanses by hostiles down and the win', () => {
    const s = atDoor(only(city(1, CERTAIN), 'freight', 40), 'depot-7');
    const r = ok(s, { type: 'resolve', side: 'agency' });
    const h = s.raid!.hostiles;
    expect(r.state.orgs.find((o) => o.id === 'freight')!.infiltration).toBe(Math.max(0, 40 - h * T.res.cleansePerHostile - T.res.cleanseOnWin));
  });
  it('RES-4 a won raid raises confidence and leaves the band known', () => {
    const s = atDoor(only(city(1, CERTAIN), 'freight', 40), 'depot-7');
    const res = ok(s, { type: 'resolve', side: 'agency' });
    const r = res.state;
    const e = res.events.find((x) => x.type === 'raidResolved');
    const civ = e && e.type === 'raidResolved' ? e.result.civiliansDown : 0;
    expect(r.confidence).toBe(Math.min(100, s.confidence + T.fund.winGain) - civ * T.fund.civilianLoss);
    expect(r.buildings.find((b) => b.id === 'depot-7')!.watch!.band).toBe(bandOf(r.orgs.find((o) => o.id === 'freight')!.infiltration));
  });
  it('RES-5 citizens and agents killed cost confidence', () => {
    const s = atDoor(only(city(1, CERTAIN), 'freight', 40), 'depot-7', ['ag1']);
    const r = ok(s, { type: 'resolve', side: 'agency', result: { won: true, agentsDown: [], hostilesDown: 5, civiliansDown: 3 } });
    expect(r.state.confidence).toBe(s.confidence + T.fund.winGain - 3 * T.fund.civilianLoss);
  });
  it('RES-6 a fought result is checked and clamped', () => {
    const s = atDoor(only(city(), 'freight', 40), 'depot-7', ['ag1', 'ag2']);
    expect(rejected(s, { type: 'resolve', side: 'agency', result: { won: true, agentsDown: ['ag9'], hostilesDown: 0, civiliansDown: 0 } })).toMatch(/agents on the raid/);
    expect(rejected(s, { type: 'resolve', side: 'agency', result: { won: true, agentsDown: [], hostilesDown: -1, civiliansDown: 0 } })).toMatch(/non-negative/);
    expect(rejected(s, { type: 'resolve', side: 'agency', result: { won: 'yes', agentsDown: [], hostilesDown: 0, civiliansDown: 0 } as never })).toMatch(/won/);
    const r = ok(s, { type: 'resolve', side: 'agency', result: { won: true, agentsDown: ['ag1'], hostilesDown: 99, civiliansDown: 0 } });
    const e = r.events.find((x) => x.type === 'raidResolved');
    expect(e && e.type === 'raidResolved' && e.result.hostilesDown).toBe(s.raid!.hostiles);
    expect(e && e.type === 'raidResolved' && e.auto).toBe(false);
    expect(['dead', 'wounded']).toContain(r.state.agents.find((a) => a.id === 'ag1')!.status);
  });
});

describe('8. The roster (ROSTER)', () => {
  it('ROSTER-1 an agent carries its status, until tick, watch building and raids', () => {
    const a = city().agents[0]!;
    expect(a).toEqual({ id: 'ag1', name: CITY.agency.names[0], status: 'ready', until: 0, building: null, leg: null, raids: 0 });
  });
  it('ROSTER-2 the agency starts with eight named agents', () => {
    const s = city();
    expect(s.agents).toHaveLength(T.roster.startAgents);
    expect(s.agents.map((a) => a.name)).toEqual(CITY.agency.names.slice(0, T.roster.startAgents));
  });
  it('ROSTER-3 recruiting costs money and stops at the cap', () => {
    let s = city();
    s = ok(s, { type: 'recruit', side: 'agency' }).state;
    expect(s.money).toBe(T.fund.startMoney - T.roster.recruitCost);
    expect(s.agents).toHaveLength(9);
    const rich = clone(s);
    rich.money = 10000;
    let r = rich;
    for (let i = 0; i < 3; i++) r = ok(r, { type: 'recruit', side: 'agency' }).state;
    expect(rejected(r, { type: 'recruit', side: 'agency' })).toMatch(/full/);
    const poor = clone(city());
    poor.money = 5;
    expect(rejected(poor, { type: 'recruit', side: 'agency' })).toMatch(/money/);
  });
  it('ROSTER-4 a wound heals at its tick', () => {
    const s = clone(city());
    s.agents[0]!.status = 'wounded';
    s.agents[0]!.until = 3;
    const r = ticks(s, 3);
    expect(r.state.agents[0]!.status).toBe('ready');
    expect(r.events.some((e) => e.type === 'healed')).toBe(true);
  });
  it('ROSTER-5 salaries are paid at the month end', () => {
    const s = only(city(), 'council', 0);
    const r = ticks(s, 16 * HOUR + 29 * DAY);
    const m = r.events.find((e) => e.type === 'month');
    expect(m && m.type === 'month' && m.salaries).toBe(T.roster.salaryPerMonth * 8);
  });
});

describe('9. Money and confidence (FUND)', () => {
  it('FUND-1 the month end pays the grant minus salaries', () => {
    const s = only(city(), 'council', 0);
    const r = ticks(s, 16 * HOUR + 29 * DAY);
    const m = r.events.find((e) => e.type === 'month');
    expect(m && m.type === 'month').toBe(true);
    if (m && m.type === 'month') expect(r.state.money).toBe(T.fund.startMoney + m.grant - m.salaries);
    expect(s.confidence).toBe(T.fund.startConfidence);
  });
  it('FUND-2 the grant follows confidence and the cuts', () => {
    const s = only(city(), 'council', 0);
    expect(grantOf(s)).toBe(Math.floor((T.fund.grantBase * T.fund.startConfidence) / 50));
    const t = withInf(s, 'vector', 70, true);
    expect(grantOf(t)).toBe(Math.floor((grantOf(s) * (100 - T.fund.turnedCutPercent)) / 100));
    const many = clone(s);
    for (const o of many.orgs) o.turned = true;
    expect(grantOf(many)).toBe(0);
  });
  it('FUND-3 every confidence change is an event with its reason', () => {
    const s = atDoor(only(city(), 'freight', 0), 'depot-7');
    const r = ok(s, { type: 'resolve', side: 'agency' });
    const c = r.events.find((e) => e.type === 'confidence');
    expect(c && c.type === 'confidence' && c.why).toMatch(/clean/);
  });
  it('FUND-4 missing persons cost confidence at midnight', () => {
    const s = only(city(), 'savings', 100);
    const r = toMidnight(s);
    const d = r.events.find((e) => e.type === 'day');
    expect(d && d.type === 'day' && d.confidenceLoss).toBe(Math.floor((100 * T.fund.missingPer100Points) / 100));
  });
});

describe('10. The end (CEND)', () => {
  it('CEND-1 low confidence at a month end loses', () => {
    const s = clone(only(city(), 'council', 0));
    s.confidence = T.end.confidenceFloor - 1;
    const r = ticks(s, 16 * HOUR + 29 * DAY);
    expect(r.state.over).toMatchObject({ winner: 'hostile', reason: 'confidence' });
  });
  it('CEND-2 half the organisations turned loses at a day end', () => {
    const s = clone(city());
    for (const o of s.orgs.slice(0, 5)) {
      o.infiltration = 70;
      o.turned = true;
    }
    expect(toMidnight(s).state.over).toMatchObject({ winner: 'hostile', reason: 'turned' });
  });
  it('CEND-3 no living agent and no money finishes the agency', () => {
    let s = clone(city(1, HOPELESS));
    s.money = 0;
    for (const a of s.agents) if (a.id !== 'ag1') a.status = 'dead';
    s = only(s, 'freight', 40);
    s.tuning.roster.deathPercent = 100;
    const r = ok(atDoor(s, 'depot-7', ['ag1']), { type: 'resolve', side: 'agency' }).state;
    expect(r.over).toMatchObject({ winner: 'hostile', reason: 'squad' });
  });
  it('CEND-4 act 1 ends on its last day: contained opens act 2, spread loses', () => {
    const short = { end: { ...T.end, actDays: 1 } };
    const contained = only(city(1, short), 'council', 0);
    const r = ticks(contained, 2 * DAY);
    expect(r.state.over).toBeNull();
    expect(r.state.act).toBe(2);
    const spread = only(city(1, short), 'savings', 90);
    expect(ticks(spread, 2 * DAY).state.over).toMatchObject({ winner: 'hostile' });
    expect(totalInfiltration(spread)).toBe(90);
  });
  it('CEND-5 the end is an event with the winner, reason and tick', () => {
    const s = only(city(1, { end: { ...T.end, actDays: 1 } }), 'savings', 90);
    const r = ticks(s, 2 * DAY);
    const e = r.events.find((x) => x.type === 'cityOver');
    expect(e && e.type === 'cityOver' && e.over.tick).toBe(r.state.over!.tick);
  });
  it('CEND-6 after the end tick changes nothing and orders are rejected', () => {
    const s = clone(city());
    s.over = { winner: 'agency', reason: 'source', tick: 0 };
    const r = cityStep(s, { type: 'tick' });
    expect(r.ok && r.state).toBe(s);
    expect(rejected(s, { type: 'recruit', side: 'agency' })).toMatch(/over/);
  });
});

describe('11. View and queries (CVIEW, CQRY)', () => {
  it('CVIEW-1 the agency view hides the infiltration, biomass, genuineness and the hostiles ahead', () => {
    let s = ticks(only(city(), 'savings', 80), DAY).state;
    s = ok(s, { type: 'raid', side: 'agency', building: 'savings-main', agents: ['ag1'] }).state;
    const v = cityView(s, 'agency');
    expect(v.orgs.every((o) => o.infiltration === -1)).toBe(true);
    expect(v.biomass).toBe(-1);
    expect(v.hostileReadyTick).toBe(-1);
    expect(v.slips.every((sl) => !sl.genuine)).toBe(true);
    expect(v.raid!.hostiles).toBe(-1);
    expect(v.score.taken).toBe(-1);
  });
  it('CVIEW-2 the organism sees everything but the dice', () => {
    const s = ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
    const v = cityView(s, 'hostile');
    expect(v.orgs).toEqual(s.orgs);
    expect(v.agents).toEqual(s.agents);
    expect(v.biomass).toBe(s.biomass);
  });
  it('CVIEW-3 neither view carries the dice', () => {
    const s = city(9);
    expect(cityView(s, 'agency').rng).toEqual([0, 0, 0, 0]);
    expect(cityView(s, 'hostile').rng).toEqual([0, 0, 0, 0]);
  });
  it('CQRY-1 the clock query', () => {
    expect(cityQuery.clock(city())).toMatchObject({ day: 0, hour: 8, night: false });
  });
  it('CQRY-2 the grant query', () => {
    const s = city();
    expect(cityQuery.grant(s)).toBe(grantOf(s));
  });
  it('CQRY-3 raid odds only once the squad is at the door', () => {
    const s = ok(city(), { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1', 'ag2'] }).state;
    expect(cityQuery.raidOdds(s).ok).toBe(false);
    const d = ticks(s, s.raid!.arriveTick - s.tick).state;
    expect(cityQuery.raidOdds(d)).toMatchObject({ ok: true, agents: 2 });
  });
  it('CQRY-4 the board counts slips and leaks nothing hidden', () => {
    const s = ticks(only(city(), 'savings', 90), 2 * DAY).state;
    const board = cityQuery.board(cityView(s, 'agency'));
    expect(board).toHaveLength(48);
    expect(board.filter((b) => b.org === 'savings').some((b) => b.slips > 0)).toBe(true);
    expect(JSON.stringify(board)).not.toMatch(/infiltration|genuine/);
  });
  it('CQRY-5 the roster query', () => {
    expect(cityQuery.roster(city())).toEqual({ living: 8, ready: 8, cap: T.roster.cap, recruitCost: T.roster.recruitCost });
  });
  it('CQRY-6 the outcome query', () => {
    expect(cityQuery.outcome(city())).toMatchObject({ over: null, money: T.fund.startMoney, confidence: T.fund.startConfidence });
  });
});

describe('12. The city AI (CAI)', () => {
  it('CAI-1 drivers are pure functions of a view', () => {
    const v = cityView(city(), 'agency');
    const before = JSON.stringify(v);
    expect(agencyCareful(v)).toEqual(agencyCareful(v));
    expect(JSON.stringify(v)).toBe(before);
  });
  it('CAI-2 the drivers never touch the engine dice', () => {
    const s = clone(city());
    s.biomass = 50;
    const v = cityView(s, 'hostile');
    expect(v.rng).toEqual([0, 0, 0, 0]);
    expect(hostilePlanner(v)).toEqual(hostilePlanner(cityView(s, 'hostile')));
  });
  it('CAI-3 the planner protects the source and avoids watched organisations', () => {
    const s = clone(city());
    s.biomass = 50;
    const src = CITY.orgs.find((o) => o.source)!.id;
    const out = hostilePlanner(cityView(s, 'hostile'));
    expect(out).toEqual([{ type: 'seed', side: 'hostile', org: src }]);
    let w = withInf(s, src, 60);
    for (const def of CITY.buildings.filter((b) => b.org === 'courier')) w = ok(w, { type: 'watch', side: 'agency', agent: w.agents.find((a) => a.status === 'ready')!.id, building: def.id }).state;
    const out2 = hostilePlanner(cityView(w, 'hostile'));
    expect(out2[0]!.type === 'seed' && out2[0]!.org).not.toBe('courier');
  });
  it('CAI-4 the random organism seeds a legal organisation', () => {
    const s = clone(city());
    s.biomass = 50;
    const out = hostileRandom(cityView(s, 'hostile'));
    expect(out).toHaveLength(1);
    expect(cityStep(s, out[0]!).ok).toBe(true);
  });
  it('CAI-5 the passive agency only resolves; the random agency acts rarely', () => {
    expect(agencyPassive(cityView(city(), 'agency'))).toEqual([]);
    expect(agencyPassive(cityView(atDoor(city(), 'depot-7'), 'agency'))).toEqual([{ type: 'resolve', side: 'agency' }]);
    let acts = 0;
    for (let seed = 1; seed <= 50; seed++) acts += agencyRandom(cityView(city(seed), 'agency')).length;
    expect(acts).toBeLessThan(15);
  });
  it('CAI-6 the careful agency watches suspicious buildings and raids a confirmed one', () => {
    const s = ticks(only(city(), 'savings', 45), 2 * DAY).state;
    const v = cityView(s, 'agency');
    const sus = suspicion(v);
    const top = [...sus.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    expect(CITY.buildings.find((b) => b.id === top)!.org).toBe('savings');
    const watches = agencyCareful(v).filter((a) => a.type === 'watch');
    expect(watches.length).toBeGreaterThan(0);
    const rep = clone(s);
    rep.tick = s.tick - (s.tick % HOUR) + HOUR * 2;
    rep.buildings.find((b) => b.id === 'savings-main')!.watch = { band: 'heavy', tick: rep.tick };
    const acts = agencyCareful(cityView(rep, 'agency'));
    expect(acts.some((a) => a.type === 'raid' && a.building === 'savings-main')).toBe(true);
  });
});

describe('13. Invariants (CINV)', () => {
  const broken = (mut: (s: CityState) => void) => {
    const s = clone(city());
    mut(s);
    return cityInvariants(s);
  };
  it('CINV-1 no NaN and only integers', () => {
    expect(cityInvariants(city())).toEqual([]);
    expect(broken((s) => (s.money = 1.5)).join()).toMatch(/integer/);
  });
  it('CINV-2 confidence in range', () => {
    expect(broken((s) => (s.confidence = 101)).join()).toMatch(/confidence/);
  });
  it('CINV-3 infiltration, standing and biomass in range', () => {
    expect(broken((s) => (s.orgs[0]!.infiltration = 101)).join()).toMatch(/infiltration/);
    expect(broken((s) => (s.biomass = -1)).join()).toMatch(/biomass/);
    expect(broken((s) => (s.orgs[0]!.turned = true)).join()).toMatch(/turned at 0/);
  });
  it('CINV-4 the raid and the roster agree', () => {
    expect(broken((s) => (s.agents[0]!.status = 'raiding')).join()).toMatch(/raiding/);
  });
  it('CINV-5 watchers and roster ids are consistent', () => {
    expect(broken((s) => (s.agents[0]!.status = 'watching')).join()).toMatch(/watch/);
    expect(broken((s) => (s.agents[1]!.id = 'ag1')).join()).toMatch(/repeat/);
  });
  it('CINV-6 slips kept and ordered', () => {
    expect(broken((s) => (s.slips = Array.from({ length: 41 }, (_, i) => ({ id: i + 1, tick: 0, kind: 'missing' as const, building: null, org: null, district: 'civic', genuine: false })))).join()).toMatch(/slips/);
  });
  it('CINV-7 the city keeps its shape', () => {
    expect(broken((s) => s.orgs.pop()).join()).toMatch(/shape/);
  });
  it('CINV-8 the end is never in the future', () => {
    expect(broken((s) => (s.over = { winner: 'agency', reason: 'source', tick: 5 })).join()).toMatch(/future/);
  });
});

describe('14. Sim (CSIM)', () => {
  it('CSIM-1 a campaign runs to its end with the invariants held', () => {
    const r = runCity({ seed: 1, agency: agencyCareful, hostile: hostilePlanner });
    expect(r.broken).toEqual([]);
    expect(r.state.over).not.toBeNull();
  }, 30_000);
  it('CSIM-2 the passive agency loses', () => {
    for (let seed = 1; seed <= 3; seed++) expect(runCity({ seed, agency: agencyPassive, hostile: hostilePlanner }).state.over?.winner).toBe('hostile');
  });
  it('CSIM-3 a campaign replays to the same hash', () => {
    const r = runCity({ seed: 1, agency: agencyCareful, hostile: hostilePlanner, maxTicks: 20 * DAY });
    expect(hashCity(replayCity({ seed: 1 }, r.state.log))).toBe(hashCity(r.state));
  });
});

describe('22. Travel (TRAVEL)', () => {
  const HQ = { x: CITY.agency.hq.x * 10 + 5, y: CITY.agency.hq.y * 10 + 5 };
  const at = (id: string) => {
    const b = CITY.buildings.find((x) => x.id === id)!;
    return { x: b.x * 10 + 5, y: b.y * 10 + 5 };
  };
  it('TRAVEL-1 a drive takes its distance at six cells an hour, at least one tick, leaving now', () => {
    const s = city();
    expect(travelTicks(s, 0, 0, 0, 0)).toBe(1);
    expect(travelTicks(s, 0, 0, 60, 0)).toBe(HOUR); // six cells, one hour
    expect(travelTicks(s, 0, 0, 30, 40)).toBe(Math.ceil((50 * HOUR) / T.travel.speedTenthsPerHour));
    const far = CITY.buildings.reduce((a, b) => (Math.hypot(b.x - CITY.agency.hq.x, b.y - CITY.agency.hq.y) > Math.hypot(a.x - CITY.agency.hq.x, a.y - CITY.agency.hq.y) ? b : a));
    const near = CITY.buildings.reduce((a, b) => (Math.hypot(b.x - CITY.agency.hq.x, b.y - CITY.agency.hq.y) < Math.hypot(a.x - CITY.agency.hq.x, a.y - CITY.agency.hq.y) ? b : a));
    const tFar = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: far.id }).state.agents[0]!;
    const tNear = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: near.id }).state.agents[0]!;
    expect(tFar.leg).toEqual({ fx: HQ.x, fy: HQ.y, tx: far.x * 10 + 5, ty: far.y * 10 + 5, depart: 0, arrive: tFar.until });
    expect(tFar.until).toBeGreaterThan(tNear.until);
    expect(tFar.until).toBeGreaterThan(2 * HOUR); // the far corner is more than two hours out
  });
  it('TRAVEL-2 a watcher drives out, watches, reports and drives home, with events', () => {
    let s = ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'ambrel-tower' }).state;
    const out = s.agents[0]!.until;
    let r = ticks(s, out);
    expect(r.events.some((e) => e.type === 'watchStarted' && e.building === 'ambrel-tower')).toBe(true);
    s = r.state;
    expect(s.agents[0]).toMatchObject({ status: 'watching', leg: null, until: out + T.watch.hours * HOUR });
    r = ticks(s, T.watch.hours * HOUR);
    s = r.state;
    expect(s.agents[0]!.status).toBe('returning');
    expect(s.agents[0]!.leg).toMatchObject({ fx: at('ambrel-tower').x, fy: at('ambrel-tower').y, tx: HQ.x, ty: HQ.y });
    r = ticks(s, s.agents[0]!.until - s.tick);
    expect(r.events.some((e) => e.type === 'home' && e.agent === 'ag1')).toBe(true);
    expect(r.state.agents[0]).toMatchObject({ status: 'ready', leg: null, until: 0, building: null });
  });
  it('TRAVEL-3 a recalled agent turns for home from where its drive has reached', () => {
    let s = ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'ambrel-tower' }).state;
    const leg = s.agents[0]!.leg!;
    const half = Math.floor((leg.arrive - leg.depart) / 2);
    s = ticks(s, half).state;
    s = ok(s, { type: 'recall', side: 'agency', agent: 'ag1' }).state;
    const back = s.agents[0]!.leg!;
    const span = leg.arrive - leg.depart;
    expect(back.fx).toBe(leg.fx + Math.trunc(((leg.tx - leg.fx) * half) / span));
    expect(back.fy).toBe(leg.fy + Math.trunc(((leg.ty - leg.fy) * half) / span));
    expect([back.tx, back.ty]).toEqual([HQ.x, HQ.y]);
    expect(back.arrive - back.depart).toBeLessThanOrEqual(span);
    expect(s.agents[0]!.status).toBe('returning');
  });
  it('TRAVEL-4 a squad drives out together and the standing agents drive home after the raid', () => {
    let s = ok(city(1, CERTAIN), { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1', 'ag2'] }).state;
    expect(s.agents[0]!.leg).toEqual(s.agents[1]!.leg);
    expect(s.agents[0]!.leg!.arrive).toBe(s.raid!.arriveTick);
    s = ticks(s, s.raid!.arriveTick - s.tick).state;
    expect(s.agents[0]!.leg).toBeNull();
    s = ok(s, { type: 'resolve', side: 'agency' }).state;
    expect(s.agents[0]).toMatchObject({ status: 'returning' });
    expect(s.agents[0]!.leg).toMatchObject({ fx: at('depot-7').x, fy: at('depot-7').y, tx: HQ.x, ty: HQ.y });
    expect(cityStep(s, { type: 'raid', side: 'agency', building: 'city-hall', agents: ['ag1'] }).ok).toBe(false);
    s = ticks(s, s.agents[0]!.until - s.tick).state;
    expect(s.agents[0]!.status).toBe('ready');
  });
  it('CINV-12 drives and statuses agree', () => {
    const s = clone(ok(city(), { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state);
    expect(cityInvariants(s)).toEqual([]);
    s.agents[0]!.leg = null;
    expect(cityInvariants(s).join()).toMatch(/leg mismatch/);
  });
});
