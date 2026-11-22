// docs/spec/20-city.md section 21: the three acts.
import { describe, expect, it } from 'vitest';
import { advanceCityTicks, cityStep, cityView, createCity, type CityAction, type CityEvent, type CityState, type CityTuning } from '../src/city';
import { CITY, CITY_TUNING } from '../src/data/city';
import { agencyCareful, hostilePlanner } from '../src/ai/city';
import { cityInvariants } from '../src/sim/cityInvariants';

const T = CITY_TUNING;
const HOUR = 6;
const DAY = 144;
const clone = <S,>(s: S): S => JSON.parse(JSON.stringify(s)) as S;
function ok(s: CityState, a: CityAction): { state: CityState; events: CityEvent[] } {
  const r = cityStep(s, a);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(a)}: ${r.reason}`);
  return { state: r.state, events: r.events };
}
/** A clean city in a given act, at midnight of `day`. */
function inAct(act: 1 | 2 | 3, day = 100, tuning?: Partial<CityTuning>): CityState {
  const s = clone(createCity({ seed: 3, tuning }));
  s.act = act;
  s.actDay = day - 5;
  s.tick = 16 * HOUR + (day - 1) * DAY;
  for (const o of s.orgs) o.infiltration = 0;
  if (act === 3) s.lab.done.push('source-trace');
  return s;
}
const WIN = { res: { ...T.res, winMinPercent: 100, winMaxPercent: 100, downPerHostilePercent: 0, downOnLossPercent: 0 } };
const LOSE = { res: { ...T.res, winMinPercent: 0, winMaxPercent: 0 } };

describe('21. The three acts (ACT)', () => {
  it('ACT-1 a campaign starts in act 1 and an act change is an event', () => {
    expect(createCity({ seed: 1 }).act).toBe(1);
    const s = clone(createCity({ seed: 1, tuning: { end: { ...T.end, actDays: 1 } } }));
    for (const o of s.orgs) o.infiltration = 0;
    const r = advanceCityTicks(s, 2 * DAY);
    expect(r.events.find((e) => e.type === 'actBegan')).toMatchObject({ act: 2 });
  });
  it('ACT-2 act 2 feeds the organism faster and launches twice as often', () => {
    const one = inAct(1, 40);
    const two = inAct(2, 100);
    for (const s of [one, two]) s.orgs.find((o) => o.id === 'savings')!.infiltration = 50;
    const b1 = advanceCityTicks(one, DAY).state.biomass - one.biomass;
    const b2 = advanceCityTicks(two, DAY).state.biomass - two.biomass;
    expect(b2).toBeGreaterThan(b1);
    two.biomass = 100;
    const l = ok(two, { type: 'launch', side: 'hostile', kind: 'scout', target: 'city-hall' }).state;
    expect(l.hostileLaunchTick - l.tick).toBe(T.act.launchEveryHours * HOUR);
  });
  it('ACT-3 tracing the source in act 2 opens act 3', () => {
    const s = inAct(2);
    s.lab.done.push('core-study');
    s.shelf.core = 5;
    s.shelf.liveTaker = 1;
    const r = advanceCityTicks(ok(s, { type: 'research', side: 'agency', project: 'source-trace' }).state, 97 * HOUR);
    expect(r.state.act).toBe(3);
  });
  it('ACT-4 a scout near headquarters in act 2 finds it', () => {
    const s = inAct(2);
    s.biomass = 100;
    let l = ok(s, { type: 'launch', side: 'hostile', kind: 'scout', target: 'records-office' }).state;
    // Heading west across headquarters: after one hour's move it is inside act.hqScoutRange of it.
    const hqx = CITY.agency.hq.x * 10 + 5;
    l.craft[0]!.x = hqx + T.air.scoutSpeed - T.act.hqScoutRange / 2;
    l.craft[0]!.y = CITY.agency.hq.y * 10 + 5;
    l.craft[0]!.tx = Math.max(0, hqx - 100);
    l.craft[0]!.ty = CITY.agency.hq.y * 10 + 5;
    const r = advanceCityTicks(l, HOUR * 2);
    expect(r.state.hqFound).toBe(true);
    expect(r.events.some((e) => e.type === 'slip' && e.slip.kind === 'found')).toBe(true);
    l = clone(l);
    l.act = 1;
    expect(advanceCityTicks(l, HOUR * 2).state.hqFound).toBe(false);
  });
  it('ACT-5 carriers and assaults come in act 3; a lost defence loses the campaign', () => {
    const two = inAct(2);
    two.biomass = 200;
    expect(cityStep(two, { type: 'launch', side: 'hostile', kind: 'carrier', target: 'city-hall' }).ok).toBe(false);
    expect(cityStep({ ...two, hqFound: true }, { type: 'assault', side: 'hostile' }).ok).toBe(false);
    const three = inAct(3);
    three.biomass = 200;
    const c = ok(three, { type: 'launch', side: 'hostile', kind: 'carrier', target: 'city-hall' }).state;
    expect(c.craft[0]).toMatchObject({ kind: 'carrier', hp: T.act.carrierHp });
    expect(cityStep(three, { type: 'assault', side: 'hostile' }).ok).toBe(false); // not found yet
    const found = { ...clone(three), hqFound: true };
    const a = ok(found, { type: 'assault', side: 'hostile' }).state;
    expect(a.defence).toMatchObject({ hostiles: T.act.assaultHostiles });
    expect(cityStep(a, { type: 'tick' }).state).toBe(a); // the city waits
    const won = ok({ ...clone(a), tuning: { ...a.tuning, ...WIN } } as CityState, { type: 'defend', side: 'agency' }).state;
    expect(won.over).toBeNull();
    expect(won.defence).toBeNull();
    expect(won.shelf.fighter).toBe(2);
    const lost = ok({ ...clone(a), tuning: { ...a.tuning, ...LOSE } } as CityState, { type: 'defend', side: 'agency' }).state;
    expect(lost.over).toMatchObject({ winner: 'hostile', reason: 'hq' });
  });
  it('ACT-6 acts 2 and 3 run out of time', () => {
    const s = inAct(2, 100);
    s.actDay = 100 - T.act.act2Days;
    s.tick = 16 * HOUR + 98 * DAY;
    expect(advanceCityTicks(s, 2 * DAY).state.over).toMatchObject({ reason: 'time' });
  });
  it('ACT-7 the final raid meets the source tower in act 3 and winning it wins the campaign', () => {
    let s = inAct(3, 200, WIN);
    s = ok(s, { type: 'raid', side: 'agency', building: CITY.agency.final, agents: ['ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'ag6'] }).state;
    s = advanceCityTicks(s, s.raid!.arriveTick - s.tick).state;
    expect(s.raid).toMatchObject({ hostiles: T.act.finalHostiles, takers: 4, fighters: 4 });
    const r = ok(s, { type: 'resolve', side: 'agency' }).state;
    expect(r.over).toMatchObject({ winner: 'agency', reason: 'source' });
  });
});

describe('Acts: AI and invariants (CAI-10, CAI-11, CINV-11)', () => {
  it('CAI-10 the planner hunts headquarters in act 2 and assaults it in act 3', () => {
    const two = inAct(2);
    two.biomass = 100;
    const acts = hostilePlanner(cityView(two, 'hostile'));
    expect(acts.some((a) => a.type === 'launch' && a.kind === 'scout')).toBe(true);
    const three = { ...inAct(3), hqFound: true, biomass: 100 };
    expect(hostilePlanner(cityView(three, 'hostile'))).toContainEqual({ type: 'assault', side: 'hostile' });
  });
  it('CAI-11 the careful agency meets an assault and makes the final raid', () => {
    const a = ok({ ...inAct(3), hqFound: true, biomass: 100 }, { type: 'assault', side: 'hostile' }).state;
    expect(agencyCareful(cityView(a, 'agency'))).toEqual([{ type: 'defend', side: 'agency' }]);
    const three = inAct(3);
    three.tick += 2; // off the hour: no action
    three.tick -= 2;
    const acts = agencyCareful(cityView(three, 'agency'));
    expect(acts.some((x) => x.type === 'raid' && x.building === CITY.agency.final)).toBe(true);
  });
  it('CINV-11 acts, assaults and the found headquarters are consistent', () => {
    const s = inAct(1);
    expect(cityInvariants(s)).toEqual([]);
    s.hqFound = true;
    expect(cityInvariants(s).join()).toMatch(/headquarters/);
  });
});
