// docs/spec/20-city.md section 20 (M5c): the air war.
import { describe, expect, it } from 'vitest';
import { advanceCityTicks, buildingUnder, cityStep, cityView, createCity, launchBlock, type CityAction, type CityEvent, type CityState, type CityTuning } from '../src/city';
import { CITY, CITY_TUNING } from '../src/data/city';
import { agencyCareful, hostilePlanner } from '../src/ai/city';
import { cityInvariants } from '../src/sim/cityInvariants';

const T = CITY_TUNING;
const A = T.air;
const HOUR = 6;
const DAY = 144;
const clone = <S,>(s: S): S => JSON.parse(JSON.stringify(s)) as S;
function ok(s: CityState, a: CityAction): { state: CityState; events: CityEvent[] } {
  const r = cityStep(s, a);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(a)}: ${r.reason}`);
  return { state: r.state, events: r.events };
}
/** A city on day 30 with biomass to spend. */
function skies(seed = 1, tuning?: Partial<CityTuning>): CityState {
  const s = clone(createCity({ seed, tuning }));
  s.tick = 16 * HOUR + 29 * DAY; // midnight starting day 30
  s.biomass = 100;
  for (const o of s.orgs) o.infiltration = 0;
  return s;
}
function hours(s: CityState, n: number) {
  return advanceCityTicks(s, n * HOUR);
}
/** Puts a craft at a point (by editing a launched one). */
function craftAt(s: CityState, kind: 'scout' | 'seeder', x: number, y: number, target = 'city-hall'): CityState {
  const l = ok(s, { type: 'launch', side: 'hostile', kind, target }).state;
  const c = l.craft[0]!;
  c.x = x;
  c.y = y;
  return l;
}
const HQX = CITY.agency.hq.x * 10 + 5;
const HQY = CITY.agency.hq.y * 10 + 5;
const ALWAYS: Partial<CityTuning> = { air: { ...A, carHitPercent: 100, craftHitPercent: 0 } };

describe('20. The air war (AIR)', () => {
  it('AIR-1 positions are integer tenths and move on the hour', () => {
    let s = craftAt(skies(), 'seeder', 0, 0);
    const p0 = { ...s.craft[0]! };
    s = advanceCityTicks(s, HOUR - 1).state;
    // the hour boundary is not yet reached unless the launch was on it
    s = hours(s, 1).state;
    const c = s.craft[0]!;
    expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
    expect(Math.hypot(c.x - p0.x, c.y - p0.y)).toBeLessThanOrEqual(A.seederSpeed * 2 + 1);
  });
  it('AIR-2 craft launch from day 30 for biomass, enter on an edge and a seeder lands and seeds', () => {
    const early = clone(createCity({ seed: 1 }));
    early.biomass = 100;
    expect(launchBlock(early, 'seeder', 'city-hall')).toMatch(/no craft/);
    let s = ok(skies(), { type: 'launch', side: 'hostile', kind: 'seeder', target: 'city-hall' }).state;
    const c = s.craft[0]!;
    expect([c.x, c.y].some((v) => v === 0 || v === CITY.size * 10)).toBe(true);
    expect(s.biomass).toBe(100 - A.seederCost);
    expect(cityStep(s, { type: 'launch', side: 'hostile', kind: 'scout', target: 'city-hall' }).ok).toBe(false);
    expect(cityView(s, 'agency').craft[0]!.target).toBe('');
    const r = hours(s, 20);
    const land = r.events.find((e) => e.type === 'landed');
    expect(land && land.type === 'landed' && land.amount).toBe(A.seederAmount);
    expect(r.state.orgs.find((o) => o.id === 'council')!.infiltration).toBeGreaterThanOrEqual(A.seederAmount);
    expect(r.events.some((e) => e.type === 'slip' && e.slip.kind === 'landing' && e.slip.genuine)).toBe(true);
  });
  it('AIR-3 cars intercept and a car can be bought', () => {
    let s = ok(skies(), { type: 'launch', side: 'hostile', kind: 'seeder', target: 'city-hall' }).state;
    expect(s.cars).toHaveLength(A.startCars);
    s = ok(s, { type: 'intercept', side: 'agency', craft: s.craft[0]!.id, cars: ['car1'] }).state;
    expect(s.cars[0]!.status).toBe('flying');
    expect(cityStep(s, { type: 'intercept', side: 'agency', craft: s.craft[0]!.id, cars: ['car1'] }).ok).toBe(false);
    const rich = clone(s);
    rich.money = 1000;
    const b = ok(rich, { type: 'buyCar', side: 'agency' }).state;
    expect(b.cars).toHaveLength(3);
    expect(b.money).toBe(1000 - A.carCost);
  });
  it('AIR-4 pressed craft are fought on contact; shadowed ones are followed without a shot', () => {
    let s = craftAt(skies(1, ALWAYS), 'seeder', HQX, HQY, 'freight-yard'); // over headquarters
    s = ok(s, { type: 'intercept', side: 'agency', craft: s.craft[0]!.id, cars: ['car1', 'car2'] }).state;
    const shadow = ok(s, { type: 'posture', side: 'agency', craft: s.craft[0]!.id, posture: 'shadow' }).state;
    expect(hours(shadow, 1).events.some((e) => e.type === 'dogfight')).toBe(false);
    const r = hours(s, 1);
    const f = r.events.find((e) => e.type === 'dogfight');
    expect(f && f.type === 'dogfight' && f.hits).toBe(2);
    expect(r.state.craft[0]!.hp).toBe(A.seederHp - 2 * A.carDamage);
  });
  it('AIR-5 a car at 0 is lost; a damaged car goes to the hangar and comes back whole', () => {
    const hurt = { air: { ...A, carHitPercent: 100, craftHitPercent: 100, craftDamage: 60 } };
    let s = craftAt(skies(1, hurt), 'seeder', HQX, HQY);
    s = ok(s, { type: 'intercept', side: 'agency', craft: s.craft[0]!.id, cars: ['car1'] }).state;
    const r = hours(s, 1);
    expect(r.events.some((e) => e.type === 'carLost')).toBe(true);
    expect(r.state.cars[0]!.status).toBe('lost');
    const scratch = { air: { ...A, carHitPercent: 100, carDamage: 100, craftHitPercent: 100, craftDamage: 10 } };
    let t = craftAt(skies(1, scratch), 'seeder', HQX, HQY);
    t = ok(t, { type: 'intercept', side: 'agency', craft: t.craft[0]!.id, cars: ['car1'] }).state;
    t = hours(t, 1).state;
    expect(t.cars[0]!.status).toBe('repair');
    t = hours(t, A.repairHours + 1).state;
    expect(t.cars[0]).toMatchObject({ status: 'ready', hp: A.carHp });
  });
  it('AIR-6 a craft falls where it is: billed over a building, free over open ground', () => {
    const kill = { air: { ...A, carHitPercent: 100, carDamage: 200, craftHitPercent: 0 } };
    const hall = CITY.buildings.find((b) => b.id === 'city-hall')!;
    let s = craftAt(skies(1, kill), 'seeder', hall.x * 10 + 5, hall.y * 10 + 5, 'freight-yard');
    for (const c of s.cars) {
      c.x = hall.x * 10 + 5;
      c.y = hall.y * 10 + 5;
    }
    s = ok(s, { type: 'intercept', side: 'agency', craft: s.craft[0]!.id, cars: ['car1'] }).state;
    const conf = s.confidence;
    const r = hours(s, 1);
    const d = r.events.find((e) => e.type === 'downed');
    expect(d && d.type === 'downed' && d.building).toBe('city-hall');
    expect(r.state.confidence).toBe(conf - A.crashConfidence);
    expect(r.state.crashes[0]).toMatchObject({ survivors: A.seederSurvivors, building: 'city-hall' });
    expect(buildingUnder(5, 35)).toBeNull(); // an empty cell
  });
  it('AIR-7 an unraided crash scatters into the nearest organisation', () => {
    const s = clone(skies());
    const depot = CITY.buildings.find((b) => b.id === 'depot-7')!;
    s.crashes.push({ id: 'crash9', kind: 'seeder', x: depot.x * 10 + 5, y: depot.y * 10 + 5, building: 'depot-7', survivors: 3, until: s.tick + HOUR });
    const r = hours(s, 2);
    const e = r.events.find((x) => x.type === 'scattered');
    expect(e && e.type === 'scattered' && e.org).toBe('freight');
    expect(r.state.orgs.find((o) => o.id === 'freight')!.infiltration).toBe(3 * A.scatterPerSurvivor);
  });
  it('AIR-8 a crash site is raided like a building, never a scandal, and its drive gives cores', () => {
    const win = { res: { ...T.res, winMinPercent: 100, winMaxPercent: 100, downPerHostilePercent: 0, downOnLossPercent: 0 } };
    let s = clone(skies(1, win));
    s.crashes.push({ id: 'crash9', kind: 'seeder', x: 55, y: 35, building: null, survivors: 3, until: s.tick + 24 * HOUR });
    s = ok(s, { type: 'raid', side: 'agency', building: 'crash9', agents: ['ag1', 'ag2', 'ag3'] }).state;
    s = advanceCityTicks(s, s.raid!.arriveTick - s.tick).state;
    expect(s.raid).toMatchObject({ hostiles: 3, takers: 3 });
    const r = ok(s, { type: 'resolve', side: 'agency' });
    expect(r.state.crashes).toHaveLength(0);
    expect(r.events.find((e) => e.type === 'raidResolved' && !e.scandal)).toBeDefined();
    expect(r.state.shelf.core).toBe(3 + A.crashCores); // three taker bodies, three cores, plus the drive
  });
});

describe('Air war AI and invariants (CAI-8, CAI-9, CINV-10)', () => {
  it('CAI-8 the planner launches a seeder once it has craft and biomass', () => {
    const out = hostilePlanner(cityView(skies(), 'hostile'));
    expect(out.some((a) => a.type === 'launch' && a.kind === 'seeder')).toBe(true);
  });
  it('CAI-9 the careful agency intercepts a seeder and shadows it over a building', () => {
    const hall = CITY.buildings.find((b) => b.id === 'city-hall')!;
    const s = craftAt(skies(), 'seeder', hall.x * 10 + 5, hall.y * 10 + 5, 'freight-yard');
    const acts = agencyCareful(cityView(s, 'agency'));
    expect(acts.some((a) => a.type === 'intercept')).toBe(true);
    expect(acts).toContainEqual({ type: 'posture', side: 'agency', craft: s.craft[0]!.id, posture: 'shadow' });
  });
  it('CINV-10 cars, craft and crash sites agree', () => {
    const s = clone(skies());
    expect(cityInvariants(s)).toEqual([]);
    s.cars[0]!.status = 'flying';
    expect(cityInvariants(s).join()).toMatch(/flying/);
  });
});
