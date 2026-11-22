// docs/spec/20-city.md section 23 (M10a): the armoury and each agent's kit.
import { describe, expect, it } from 'vitest';
import {
  advanceCityTicks,
  bestFitOrders,
  cityLegalActions,
  cityQuery,
  cityStep,
  cityView,
  createCity,
  issueKit,
  itemCost,
  kitWeight,
  migrateCityV4,
  winChance,
  type CityAction,
  type CityEvent,
  type CityState,
  type CityTuning,
} from '../src/city';
import { CITY_TUNING, ITEMS } from '../src/data/city';
import { agencyCareful } from '../src/ai/city';
import { cityInvariants } from '../src/sim/cityInvariants';
import { rosterOf } from '../src/client/city/join';

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
/** A city with these pieces on the armoury shelf. */
function stocked(s: CityState, ...pieces: [string, 'built' | 'ordered', boolean?][]): CityState {
  const c = clone(s);
  for (const [item, source, bad] of pieces) c.shop.armoury.push({ id: `pc${c.shop.nextPiece++}`, item, source, sabotaged: !!bad });
  return c;
}
function infiltrate(s: CityState, org: string, inf: number): CityState {
  const c = clone(s);
  for (const o of c.orgs) o.infiltration = o.id === org ? inf : 0;
  return c;
}
function raid(s: CityState, building: string, agents: string[]): CityState {
  let x = ok(s, { type: 'raid', side: 'agency', building, agents }).state;
  x = advanceCityTicks(x, x.raid!.arriveTick - x.tick).state;
  return x;
}
const stepper = (st: CityState, a: CityAction) => {
  const r = cityStep(st, a);
  return r.ok ? r.state : null;
};

describe('23. The armoury and each agent’s kit (KIT)', () => {
  it('KIT-1 every item has a slot, a kind and a battle field; free kit is never built', () => {
    for (const it of ITEMS.items) {
      expect(['suit', 'long', 'side', 'belt']).toContain(it.slot);
      if (it.kind === 'free') expect(itemCost(it.id)).toEqual({ cost: 0, hours: 0 });
      else expect(itemCost(it.id).hours).toBeGreaterThan(0);
    }
    expect(ITEMS.items.filter((i) => i.slot === 'suit').every((i) => i.frame)).toBe(true);
  });

  it('KIT-2 every agent starts with the issue, and a recruit gets it too', () => {
    let s = city();
    for (const a of s.agents) expect(a.kit).toEqual(issueKit());
    expect(issueKit()).toEqual({
      suit: { item: 'security-gear', piece: null },
      long: { item: 'patrol-carbine', piece: null },
      side: { item: 'service-pistol', piece: null },
      belt: [{ item: 'breaching-charge', piece: null }, null],
    });
    s = ok(s, { type: 'recruit', side: 'agency' }).state;
    expect(s.agents[s.agents.length - 1]!.kit).toEqual(issueKit());
  });

  it('KIT-3 a new suit keeps the belt in order and resizes it to its frame', () => {
    let s = stocked(city(), ['shell-plate', 'built']);
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate' }).state;
    expect(s.agents[0]!.kit.belt).toEqual([{ item: 'breaching-charge', piece: null }, null, null]);
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'security-gear' }).state;
    expect(s.agents[0]!.kit.belt).toEqual([{ item: 'breaching-charge', piece: null }, null]);
  });

  it('KIT-4 equip works only for a ready agent, in the right slot, within the weight limit', () => {
    const s = stocked(city(), ['arc-carbine', 'built']);
    expect(ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'scatter-gun' }).state.agents[0]!.kit.long).toEqual({ item: 'scatter-gun', piece: null });
    const no = (a: CityAction, why: RegExp) => {
      const r = cityStep(s, a);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
    };
    no({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'scatter-gun' }, /slot/);
    no({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'patrol-carbine' }, /already/);
    no({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate' }, /no Shell plate/);
    no({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine', piece: 'pc9' }, /not on the armoury shelf/);
    no({ type: 'equip', side: 'agency', agent: 'ag9', slot: 'long', item: 'scatter-gun' }, /no agent/);
    // away from headquarters
    const away = ok(s, { type: 'watch', side: 'agency', agent: 'ag1', building: 'depot-7' }).state;
    expect(cityStep(away, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'scatter-gun' }).ok).toBe(false);
    // the weight limit: with no room over the carry, a kit already at the limit takes a same-weight arm but not more
    const heavy = clone(s);
    heavy.tuning.kit.overCarry = 0;
    expect(kitWeight(heavy.agents[0]!.kit)).toBe(4);
    heavy.agents[0]!.kit.belt[1] = { item: 'breaching-charge', piece: null }; // 5, the suit's carry
    expect(cityStep(heavy, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'scatter-gun' }).ok).toBe(true);
    heavy.agents[0]!.kit.belt.push({ item: 'breaching-charge', piece: null }); // 6: over by one
    const r = cityStep(heavy, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'scatter-gun' });
    expect(r.ok === false && r.reason).toMatch(/too heavy/);
    // legal actions list each fitting a ready agent can make
    const legal = cityLegalActions(s, 'agency');
    expect(legal).toContainEqual({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine' });
    expect(legal).toContainEqual({ type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'scatter-gun' });
    expect(legal.some((a) => a.type === 'equip' && a.item === 'shell-plate')).toBe(false);
  });

  it('KIT-5 built and delivered pieces go on the shelf; fitting and STRIP move them between shelf and agent', () => {
    let s = clone(city());
    s.lab.done.push('shell-plate', 'arc-carbine');
    for (const o of s.orgs) if (o.id === 'vector') o.infiltration = 0;
    s = ok(s, { type: 'build', side: 'agency', item: 'shell-plate' }).state;
    s = ok(s, { type: 'order', side: 'agency', item: 'arc-carbine' }).state;
    const r = advanceCityTicks(s, itemCost('shell-plate').hours * HOUR);
    s = r.state;
    expect(r.events.filter((e) => e.type === 'built' || e.type === 'delivered').map((e) => (e as { piece: string }).piece).sort()).toEqual(['pc1', 'pc2']);
    expect(s.shop.armoury.map((p) => [p.item, p.source])).toEqual([
      ['arc-carbine', 'ordered'],
      ['shell-plate', 'built'],
    ]);
    const fit = ok(s, { type: 'equip', side: 'agency', agent: 'ag2', slot: 'suit', item: 'shell-plate', piece: 'pc2' });
    expect(fit.events).toContainEqual({ type: 'equipped', agent: 'ag2', slot: 'suit', item: 'shell-plate', piece: 'pc2', returned: null });
    s = ok(fit.state, { type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'arc-carbine' }).state;
    expect(s.shop.armoury).toEqual([]);
    expect(cityInvariants(s)).toEqual([]);
    // a fitting swaps a piece back on the shelf
    const swap = ok(s, { type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'patrol-carbine' });
    expect(swap.events).toContainEqual({ type: 'equipped', agent: 'ag2', slot: 'long', item: 'patrol-carbine', piece: null, returned: 'pc1' });
    expect(swap.state.shop.armoury.map((p) => p.id)).toEqual(['pc1']);
    const strip = ok(s, { type: 'strip', side: 'agency', agent: 'ag2' });
    expect(strip.events).toContainEqual({ type: 'stripped', agent: 'ag2', returned: ['pc2', 'pc1'] });
    expect(strip.state.agents[1]!.kit).toEqual(issueKit());
    expect(cityStep(strip.state, { type: 'strip', side: 'agency', agent: 'ag2' }).ok).toBe(false);
    expect(cityInvariants(strip.state)).toEqual([]);
  });

  it('KIT-6 a sabotaged piece looks whole to the agency; a dead agent’s kit is recovered on a win and lost on a loss', () => {
    const s = ok(stocked(city(), ['arc-carbine', 'ordered', true]), { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine' }).state;
    expect(cityView(s, 'agency').agents[0]!.kit.long.piece).toEqual({ id: 'pc1', item: 'arc-carbine', source: 'ordered', sabotaged: false });
    // every agent down and dead, the raid won or lost
    const fate = (won: boolean) => {
      const t: Partial<CityTuning> = { res: { ...T.res, winMinPercent: won ? 100 : 0, winMaxPercent: won ? 100 : 0, downPerHostilePercent: 100, downMaxPercent: 100 }, roster: { ...T.roster, deathPercent: 100 } };
      let x = stocked(infiltrate(city(1, t), 'freight', 30), ['arc-carbine', 'built']);
      x = ok(x, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine' }).state;
      x = raid(x, 'depot-7', ['ag1']);
      return ok(x, { type: 'resolve', side: 'agency' });
    };
    const w = fate(true);
    expect(w.events).toContainEqual({ type: 'kitRecovered', agent: 'ag1', pieces: ['pc1'] });
    expect(w.state.shop.armoury.map((p) => p.id)).toEqual(['pc1']);
    expect(w.state.agents[0]!.kit).toEqual(issueKit());
    const l = fate(false);
    expect(l.events).toContainEqual({ type: 'kitLost', agent: 'ag1', pieces: ['pc1'] });
    expect(l.state.shop.armoury).toEqual([]);
    expect(cityInvariants(w.state)).toEqual([]);
    expect(cityInvariants(l.state)).toEqual([]);
  });

  it('KIT-7 the auto-resolver adds each carried working piece and cuts each plated agent’s down chance', () => {
    let s = stocked(city(), ['shell-plate', 'built'], ['arc-carbine', 'built'], ['arc-carbine', 'ordered', true]);
    const squad = ['ag1', 'ag2', 'ag3'];
    const base = winChance(s, squad, 5);
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate' }).state;
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine', piece: 'pc2' }).state;
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'arc-carbine', piece: 'pc3' }).state;
    const plate = ITEMS.items.find((i) => i.id === 'shell-plate')!.resolve!;
    const carbine = ITEMS.items.find((i) => i.id === 'arc-carbine')!.resolve!;
    expect(winChance(s, squad, 5)).toBe(base + plate.win + carbine.win); // ag2's sabotaged carbine adds nothing
    expect(winChance(s, ['ag2', 'ag3'], 5)).toBe(winChance(city(), ['ag2', 'ag3'], 5)); // kit on an agent off the squad counts for nothing
    // the down cut: over many seeds, the plated agent goes down less often
    let plated = 0;
    let plain = 0;
    const t: Partial<CityTuning> = { res: { ...T.res, downPerHostilePercent: 10, downMaxPercent: 100 } };
    for (let seed = 1; seed <= 200; seed++) {
      let x = stocked(infiltrate(city(seed, t), 'freight', 40), ['shell-plate', 'built']);
      x = ok(x, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate' }).state;
      x = raid(x, 'depot-7', ['ag1', 'ag2']);
      const e = ok(x, { type: 'resolve', side: 'agency' }).events.find((y) => y.type === 'raidResolved');
      if (e?.type !== 'raidResolved') continue;
      if (e.result.agentsDown.includes('ag1')) plated += 1;
      if (e.result.agentsDown.includes('ag2')) plain += 1;
    }
    expect(plated).toBeLessThan(plain * 0.8);
  });

  it('KIT-8 a fought battle fields each agent’s suit and long arm; a sabotaged piece fields the issue', () => {
    let s = stocked(city(), ['shell-plate', 'ordered', true], ['arc-carbine', 'built']);
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate' }).state;
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine' }).state;
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'scatter-gun' }).state;
    expect(rosterOf(s, ['ag1', 'ag2'], { hostiles: 2, takers: 0, fighters: 0 }).squad).toEqual([
      { name: s.agents[0]!.name, template: 'agent-t1', weapon: 'arc-carbine' },
      { name: s.agents[1]!.name, template: 'agent-t1', weapon: 'scatter-gun' },
    ]);
    // the agency's view does not know: its card says the plate is worn and working
    const k = cityQuery.kit(cityView(s, 'agency'), 'ag1')!;
    expect(k.armour).toBe(8);
    expect(cityQuery.kit(s, 'ag1')!.armour).toBe(4);
  });

  it('KIT-9 best fit gives the strongest pieces to the first agents at home, built before ordered', () => {
    const s = stocked(city(), ['arc-carbine', 'ordered'], ['shell-plate', 'built'], ['arc-carbine', 'built']);
    const orders = bestFitOrders(cityView(s, 'agency'), ['ag1', 'ag2', 'ag3'], stepper);
    expect(orders).toEqual([
      { type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate', piece: 'pc2' },
      { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine', piece: 'pc3' },
      { type: 'equip', side: 'agency', agent: 'ag2', slot: 'long', item: 'arc-carbine', piece: 'pc1' },
    ]);
    let x = s;
    for (const o of orders) x = ok(x, o).state;
    expect(bestFitOrders(cityView(x, 'agency'), ['ag1', 'ag2', 'ag3'], stepper)).toEqual([]);
  });

  it('KIT-10 a version 4 save is carried forward: the stock becomes pieces and every agent is reissued', () => {
    const now = city(3);
    const v4 = clone(now) as unknown as Record<string, unknown> & { agents: Record<string, unknown>[]; tuning: Record<string, Record<string, number>> };
    v4.shop = { item: 'arc-carbine', progress: 5, stock: { 'shell-plate': 2, 'arc-carbine': 1 }, sabotaged: { 'shell-plate': 1, 'arc-carbine': 0 }, orders: [] };
    for (const a of v4.agents) delete a.kit;
    v4.tuning.shop = { ...v4.tuning.shop, plateCost: 30, plateHours: 24, carbineCost: 25, carbineHours: 18, plateWin: 2, plateDownCutPercent: 40, carbineWin: 3 };
    delete (v4.tuning as Record<string, unknown>).kit;
    const s = migrateCityV4(v4);
    expect(s.shop).toEqual({
      item: 'arc-carbine',
      progress: 5,
      armoury: [
        { id: 'pc1', item: 'shell-plate', source: 'ordered', sabotaged: true },
        { id: 'pc2', item: 'shell-plate', source: 'ordered', sabotaged: false },
        { id: 'pc3', item: 'arc-carbine', source: 'ordered', sabotaged: false },
      ],
      nextPiece: 4,
      orders: [],
    });
    expect(s.tuning).toEqual(now.tuning);
    for (const a of s.agents) expect(a.kit).toEqual(issueKit());
    expect(cityInvariants(s)).toEqual([]);
    expect(cityView(s, 'agency').shop.armoury.every((p) => !p.sabotaged)).toBe(true);
  });
});

describe('11. Queries (CQRY-7, CQRY-8)', () => {
  it('CQRY-7 an agent’s kit card: slots, weight, carry and what it fields', () => {
    const k = cityQuery.kit(city(), 'ag1')!;
    expect(k.slots.map((r) => r.item)).toEqual(['security-gear', 'patrol-carbine', 'service-pistol']);
    expect(k.belt.map((r) => r.item)).toEqual(['breaching-charge', null]);
    expect(k).toMatchObject({ weight: 4, carry: 5, over: 0, maxWeight: 5 + T.kit.overCarry, hp: 60, armour: 4, longName: 'Patrol carbine', range: 14 });
    // FIRE-5 in the open: patrol carbine 70 + aim 10 - 2 a tile
    expect(k.hitNear).toBe(70);
    expect(k.hitFar).toBe(0); // 15 tiles is past its range
    expect(cityQuery.kit(city(), 'nobody')).toBeNull();
  });
  it('CQRY-8 the armoury lists free kit and the pieces on the shelf by source', () => {
    let s = stocked(city(), ['shell-plate', 'built'], ['shell-plate', 'ordered']);
    s = ok(s, { type: 'equip', side: 'agency', agent: 'ag4', slot: 'suit', item: 'shell-plate', piece: 'pc1' }).state;
    const rows = cityQuery.armoury(s);
    expect(rows.find((r) => r.item === 'shell-plate')).toMatchObject({ free: false, built: 0, ordered: 1, carried: 1, pieces: [{ id: 'pc2', source: 'ordered' }] });
    expect(rows.find((r) => r.item === 'scatter-gun')).toMatchObject({ free: true, built: 0, ordered: 0 });
    expect(rows.some((r) => r.slot === 'belt')).toBe(false);
  });
});

describe('13 and 12. Invariants and the careful armoury (CINV-13, CAI-12)', () => {
  it('CINV-13 a piece in two places, limited kit without a piece, or a dead agent with kit breaks the invariants', () => {
    const s = ok(stocked(city(), ['arc-carbine', 'built']), { type: 'equip', side: 'agency', agent: 'ag1', slot: 'long', item: 'arc-carbine' }).state;
    expect(cityInvariants(s)).toEqual([]);
    const twice = clone(s);
    twice.shop.armoury.push(twice.agents[0]!.kit.long.piece!);
    expect(cityInvariants(twice).join()).toMatch(/two places/);
    const bare = clone(s);
    bare.agents[0]!.kit.long.piece = null;
    expect(cityInvariants(bare).join()).toMatch(/without a piece/);
    const dead = clone(s);
    dead.agents[0]!.status = 'dead';
    expect(cityInvariants(dead).join()).toMatch(/dead and still carries/);
    const belt = clone(s);
    belt.agents[0]!.kit.belt.push(null);
    expect(cityInvariants(belt).join()).toMatch(/belt has 3 slots/);
  });
  it('CAI-12 the careful agency fits its agents at home and strips a watcher', () => {
    const s = stocked(city(), ['shell-plate', 'built']);
    const acts = agencyCareful(cityView(s, 'agency'));
    expect(acts).toContainEqual({ type: 'equip', side: 'agency', agent: 'ag1', slot: 'suit', item: 'shell-plate', piece: 'pc1' });
    // an agent with kit about to be sent to watch is stripped first
    const w = clone(s);
    w.agents = w.agents.slice(0, 5);
    w.shop.armoury = [];
    w.agents[4]!.kit = { ...w.agents[4]!.kit, long: { item: 'arc-carbine', piece: { id: 'pc1', item: 'arc-carbine', source: 'built', sabotaged: false } } };
    w.slips.push({ id: 1, tick: 0, kind: 'hum', building: 'depot-7', org: 'freight', district: null, genuine: true });
    w.nextSlip = 2;
    const wa = agencyCareful(cityView(w, 'agency'));
    const iStrip = wa.findIndex((a) => a.type === 'strip' && a.agent === 'ag5');
    const iWatch = wa.findIndex((a) => a.type === 'watch' && a.agent === 'ag5');
    expect(iStrip).toBeGreaterThanOrEqual(0);
    expect(iWatch).toBeGreaterThan(iStrip);
  });
});
