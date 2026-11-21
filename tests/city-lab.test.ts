// docs/spec/20-city.md sections 17 to 19 (M5b): the lab, the workshop and raid composition.
import { describe, expect, it } from 'vitest';
import { advanceCityTicks, cityLegalActions, cityStep, cityView, compositionFor, createCity, researchBlock, winChance, working, type CityAction, type CityEvent, type CityState, type CityTuning } from '../src/city';
import { CITY_TUNING, RESEARCH } from '../src/data/city';
import { agencyCareful, RESEARCH_ORDER } from '../src/ai/city';
import { cityInvariants } from '../src/sim/cityInvariants';

const T = CITY_TUNING;
const HOUR = 6;
const clone = <S,>(s: S): S => JSON.parse(JSON.stringify(s)) as S;
function ok(s: CityState, a: CityAction): { state: CityState; events: CityEvent[] } {
  const r = cityStep(s, a);
  if (!r.ok) throw new Error(`rejected ${JSON.stringify(a)}: ${r.reason}`);
  return { state: r.state, events: r.events };
}
function city(seed = 1, tuning?: Partial<CityTuning>): CityState {
  return createCity({ seed, tuning });
}
function only(s: CityState, org: string, inf: number): CityState {
  const c = clone(s);
  for (const o of c.orgs) o.infiltration = o.id === org ? inf : 0;
  return c;
}
const CERTAIN: Partial<CityTuning> = { res: { ...T.res, winMinPercent: 100, winMaxPercent: 100, downPerHostilePercent: 0, downOnLossPercent: 0 } };
function done(s: CityState, ...ids: string[]): CityState {
  const c = clone(s);
  c.lab.done.push(...ids);
  return c;
}
function raidWon(s: CityState, building: string, agents = ['ag1', 'ag2', 'ag3', 'ag4', 'ag5', 'ag6']) {
  let x = ok(s, { type: 'raid', side: 'agency', building, agents }).state;
  x = advanceCityTicks(x, HOUR).state;
  return ok(x, { type: 'resolve', side: 'agency' });
}

describe('17. The lab (LAB)', () => {
  it('LAB-1 a raid shelves its bodies, hosts first, and cores from takers and fighters', () => {
    const r = raidWon(only(city(1, CERTAIN), 'savings', 60), 'savings-main');
    const e = r.events.find((x) => x.type === 'shelved');
    expect(e).toBeDefined();
    // 60 -> 7 hostiles: 1 taker, 1 fighter, 5 hosts
    expect(r.state.shelf).toMatchObject({ host: 5, taker: 1, fighter: 1, core: 2, liveHost: 0 });
  });
  it('LAB-2 research needs its evidence and prerequisites, runs one at a time and finishes on its hours', () => {
    let s = city();
    expect(researchBlock(s, 'restraints')).toMatch(/host/);
    s = clone(s);
    s.shelf.host = 2;
    expect(researchBlock(s, 'interrogation')).toMatch(/first/);
    s = ok(s, { type: 'research', side: 'agency', project: 'restraints' }).state;
    expect(cityStep(s, { type: 'research', side: 'agency', project: 'host-tells' }).ok).toBe(false);
    const p = RESEARCH.projects.find((x) => x.id === 'restraints')!;
    const r = advanceCityTicks(s, p.hours * HOUR);
    expect(r.events.some((e) => e.type === 'researchDone' && e.project === 'restraints')).toBe(true);
    expect(r.state.lab.done).toContain('restraints');
    expect(r.state.shelf.host).toBe(2); // needs are not used up
    const c = done(clone(s), 'host-tells');
    c.lab.project = null;
    c.shelf.liveHost = 1;
    const started = ok(c, { type: 'research', side: 'agency', project: 'hand-scanner' }).state;
    expect(started.shelf.liveHost).toBe(0); // consumes are
  });
  it('LAB-3 restraints take a host alive from a won raid', () => {
    const r = raidWon(done(only(city(1, CERTAIN), 'freight', 30), 'restraints', 'taker-cage'), 'depot-7');
    expect(r.state.shelf.liveHost).toBe(1);
    expect(r.state.shelf.liveTaker).toBe(1);
  });
  it('LAB-4 the tells and the scanner sharpen watching', () => {
    let right = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let s = done(only(city(seed), 'freight', 30), 'host-tells', 'hand-scanner');
      s = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
      s = advanceCityTicks(s, T.watch.hours * HOUR).state;
      if (s.buildings.find((b) => b.id === 'depot-7')!.watch!.band === 'some') right += 1;
    }
    expect(right).toBeGreaterThan(88);
  });
  it('LAB-5 questioning a captive names the most infiltrated organisation', () => {
    let s = done(only(city(), 'courier', 45), 'interrogation');
    s.shelf.liveHost = 1;
    expect(cityStep(done(city(), 'interrogation'), { type: 'question', side: 'agency' }).ok).toBe(false);
    const r = ok(s, { type: 'question', side: 'agency' });
    const slip = r.events.find((e) => e.type === 'slip');
    expect(slip && slip.type === 'slip' && slip.slip.kind === 'confession' && slip.slip.org).toBe('courier');
    expect(r.state.buildings.find((b) => b.id === 'courier-press')!.watch!.band).toBe('some');
    expect(r.state.shelf.liveHost).toBe(0);
  });
  it('LAB-6 antiserum halves deaths and evacuation halves citizens killed', () => {
    const HOPE = { res: { ...T.res, winMinPercent: 0, winMaxPercent: 0, downPerHostilePercent: 100, downOnLossPercent: 100, downMaxPercent: 100 } };
    let dead = 0;
    for (let seed = 1; seed <= 60; seed++) {
      let s = done(only(city(seed, HOPE), 'freight', 30), 'antiserum');
      s = ok(s, { type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1'] }).state;
      s = advanceCityTicks(s, HOUR).state;
      s = ok(s, { type: 'resolve', side: 'agency' }).state;
      if (s.agents[0]!.status === 'dead') dead += 1;
    }
    expect(dead).toBeLessThan(18); // 15% expected against 30% without
    let civ = 0;
    for (let seed = 1; seed <= 40; seed++) civ += raidWon(done(only(city(seed, CERTAIN), 'savings', 100), 'evacuation'), 'savings-main').state.score.civiliansDown;
    expect(civ / 40).toBeLessThanOrEqual(1.6); // half of the 0..5 uniform's 2.5
  });
  it('LAB-7 tracing the source lets a raid cleanse it to 0', () => {
    const r = raidWon(done(only(city(1, CERTAIN), 'ambrel', 20), 'source-trace'), 'ambrel-works');
    expect(r.state.orgs.find((o) => o.id === 'ambrel')!.infiltration).toBe(0);
  });
});

describe('18. The workshop (SHOP)', () => {
  it('SHOP-1 a researched design can be built for its cost and hours', () => {
    expect(cityStep(city(), { type: 'build', side: 'agency', item: 'shell-plate' }).ok).toBe(false);
    let s = done(city(), 'shell-plate');
    s = ok(s, { type: 'build', side: 'agency', item: 'shell-plate' }).state;
    expect(s.money).toBe(T.fund.startMoney - T.shop.plateCost);
    expect(cityStep(s, { type: 'build', side: 'agency', item: 'shell-plate' }).ok).toBe(false);
    const r = advanceCityTicks(s, T.shop.plateHours * HOUR);
    expect(r.state.shop.stock['shell-plate']).toBe(1);
    expect(r.events.some((e) => e.type === 'built')).toBe(true);
  });
  it('SHOP-2 the supplier sells cheaper and delivers sooner', () => {
    let s = done(only(city(), 'vector', 0), 'arc-carbine');
    s = ok(s, { type: 'order', side: 'agency', item: 'arc-carbine' }).state;
    expect(s.money).toBe(T.fund.startMoney - Math.floor((T.shop.carbineCost * T.shop.supplierPricePercent) / 100));
    const r = advanceCityTicks(s, T.shop.supplierHours * HOUR);
    expect(r.state.shop.stock['arc-carbine']).toBe(1);
    const turned = clone(s);
    turned.orgs.find((o) => o.id === 'vector')!.turned = true;
    turned.orgs.find((o) => o.id === 'vector')!.infiltration = 70;
    expect(cityStep(turned, { type: 'order', side: 'agency', item: 'arc-carbine' }).ok).toBe(false);
  });
  it('SHOP-3 an infiltrated supplier sabotages in secret and feeds the organism', () => {
    let s = done(only(city(), 'vector', 30), 'arc-carbine');
    const bio = s.biomass;
    s = ok(s, { type: 'order', side: 'agency', item: 'arc-carbine' }).state;
    expect(s.biomass).toBeGreaterThan(bio);
    s = advanceCityTicks(s, T.shop.supplierHours * HOUR).state;
    expect(s.shop.sabotaged['arc-carbine']).toBe(1);
    const v = cityView(s, 'agency');
    expect(v.shop.sabotaged['arc-carbine']).toBe(0);
    expect(v.shop.stock['arc-carbine']).toBe(1);
    expect(working(s, 'arc-carbine', 6)).toBe(0);
  });
  it('SHOP-4 working kit raises the win chance', () => {
    const s = clone(city());
    const base = winChance(s, 6, 5);
    s.shop.stock['shell-plate'] = 6;
    s.shop.stock['arc-carbine'] = 3;
    expect(winChance(s, 6, 5)).toBe(base + 6 * T.shop.plateWin + 3 * T.shop.carbineWin);
    s.shop.sabotaged['arc-carbine'] = 3;
    expect(winChance(s, 6, 5)).toBe(base + 6 * T.shop.plateWin);
  });
});

describe('19. Raid composition (RAID-7)', () => {
  it('RAID-7 takers and fighters join by infiltration', () => {
    const s = city();
    const org = (inf: number) => ({ id: 'x', infiltration: inf, turned: false, standing: 50 });
    expect(compositionFor(s, org(10), 2)).toEqual({ takers: 0, fighters: 0 });
    expect(compositionFor(s, org(25), 3)).toEqual({ takers: 1, fighters: 0 });
    expect(compositionFor(s, org(60), 8)).toEqual({ takers: 2, fighters: 2 });
    let x = ok(only(city(), 'savings', 60), { type: 'raid', side: 'agency', building: 'savings-main', agents: ['ag1'] }).state;
    x = advanceCityTicks(x, HOUR).state;
    expect(x.raid).toMatchObject({ hostiles: 7, takers: 1, fighters: 1 });
  });
});

describe('13 and 12. Invariants and the careful lab (CINV-9, CAI-7)', () => {
  it('CINV-9 the shelf, lab and workshop stay sane', () => {
    const s = clone(city());
    expect(cityInvariants(s)).toEqual([]);
    s.shelf.core = -1;
    s.shop.sabotaged['shell-plate'] = 2;
    expect(cityInvariants(s).join()).toMatch(/shelf core.*|stock/);
  });
  it('CAI-7 the careful agency starts the first project it can, and legal actions list research', () => {
    const s = clone(city());
    s.shelf.host = 1;
    expect(cityLegalActions(s, 'agency').some((a) => a.type === 'research' && a.project === 'restraints')).toBe(true);
    const acts = agencyCareful(cityView(s, 'agency'));
    expect(acts).toContainEqual({ type: 'research', side: 'agency', project: RESEARCH_ORDER[0] });
  });
});
