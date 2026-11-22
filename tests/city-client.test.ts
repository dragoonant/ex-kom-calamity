// docs/spec/20-city.md section 16: the client's save and the join.
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, readCampaign, useCity } from '../src/client/city/store';
import { battleFor, battleOf, resultFromBattle, rosterOf } from '../src/client/city/join';
import { createGame, step } from '../src/engine';
import { hashCity, migrateCityV4, withSuit, type CityState } from '../src/city';
import type { StorageLike } from '../src/client/save';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

let store: ReturnType<typeof memory>;
beforeEach(() => {
  store = memory();
  (globalThis as { localStorage?: StorageLike }).localStorage = store;
  useCity.setState({ active: false, game: null, view: null, paused: true, fight: null, tray: [] });
});

describe('16. The client (CSAV, CJOIN)', () => {
  it('CSAV-1 start and every order save the campaign with its hash', () => {
    useCity.getState().start(3);
    const env = JSON.parse(store.data.get(CAMPAIGN_KEY)!);
    expect(env.hash).toBe(hashCity(useCity.getState().game!));
    useCity.getState().order({ type: 'recruit', side: 'agency' });
    expect(JSON.parse(store.data.get(CAMPAIGN_KEY)!).hash).toBe(useCity.getState().hash());
  });
  it('CSAV-2 Continue reopens a good save paused and refuses a tampered one', () => {
    useCity.getState().start(4);
    useCity.getState().advanceTicks(30);
    useCity.getState().setPaused(true); // a pause saves (CSAV-1)
    const hash = useCity.getState().hash();
    useCity.setState({ active: false, game: null });
    expect(useCity.getState().resume()).toBe(true);
    expect(useCity.getState().hash()).toBe(hash);
    expect(useCity.getState().paused).toBe(true);
    const env = JSON.parse(store.data.get(CAMPAIGN_KEY)!);
    env.state.money += 1000;
    store.data.set(CAMPAIGN_KEY, JSON.stringify(env));
    const r = readCampaign(store);
    expect(r && !r.ok && r.reason).toMatch(/checksum/);
  });
  it('KIT-10 Continue carries a version 4 save forward through the armoury', () => {
    useCity.getState().start(4);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!)) as Record<string, unknown> & { agents: Record<string, unknown>[] };
    g.shop = { item: null, progress: 0, stock: { 'shell-plate': 1, 'arc-carbine': 0 }, sabotaged: { 'shell-plate': 0, 'arc-carbine': 0 }, orders: [] };
    for (const a of g.agents) delete a.kit;
    const old = g as unknown as CityState;
    store.data.set(CAMPAIGN_KEY, JSON.stringify({ key: CAMPAIGN_KEY, version: 4, savedAt: '', hash: hashCity(old), state: old, tray: [] }));
    const r = readCampaign(store);
    expect(r && r.ok).toBe(true);
    if (r && r.ok) {
      expect(r.env.version).toBe(5);
      expect(r.env.state).toEqual(migrateCityV4(old));
      expect(r.env.hash).toBe(hashCity(r.env.state));
    }
    useCity.setState({ active: false, game: null });
    expect(useCity.getState().resume()).toBe(true);
    expect(useCity.getState().game!.shop.armoury).toHaveLength(1);
  });
  it('CSAV-3 the city pauses itself when a squad reaches a door', () => {
    useCity.getState().start(5);
    useCity.getState().setPaused(false);
    useCity.getState().order({ type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1', 'ag2'] });
    const arrive = useCity.getState().game!.raid!.arriveTick;
    useCity.getState().advanceTicks(arrive + 20);
    expect(useCity.getState().game!.raid!.arrived).toBe(true);
    expect(useCity.getState().paused).toBe(true);
    expect(useCity.getState().game!.tick).toBe(arrive);
  });
  it('CJOIN-1 a fight opens the battle of the building site', () => {
    expect(battleFor('automat-row')).toBe('automat-raid');
    expect(battleFor('depot-7')).toBe('depot-raid');
    expect(battleFor('city-hall')).toBe('savings-raid');
    useCity.getState().start(6);
    useCity.getState().order({ type: 'raid', side: 'agency', building: 'depot-7', agents: ['ag1'] });
    useCity.getState().advanceTicks(useCity.getState().game!.raid!.arriveTick);
    expect(useCity.getState().beginFight()).toMatchObject({ building: 'depot-7', agents: ['ag1'] });
  });
  it('CJOIN-2 the battle result maps back onto the raid and resolves it', () => {
    let b = createGame({ battleId: 'automat-raid', seed: 1 });
    b = JSON.parse(JSON.stringify(b));
    const agents = b.units.filter((u) => u.side === 'agency');
    agents[0]!.down = true;
    agents[2]!.down = true;
    const r = step(b, { type: 'withdraw', side: 'agency' });
    expect(r.ok).toBe(true);
    const res = resultFromBattle(r.state, { kind: 'raid', building: 'automat-row', site: 'automat-row', battle: 'automat-raid', roster: {}, agents: ['ag3', 'ag4'], hostiles: 2 });
    expect(res.won).toBe(false);
    expect(res.agentsDown).toEqual(['ag3']);
    useCity.getState().start(8);
    useCity.getState().order({ type: 'raid', side: 'agency', building: 'automat-row', agents: ['ag3', 'ag4'] });
    useCity.getState().advanceTicks(useCity.getState().game!.raid!.arriveTick);
    useCity.getState().beginFight();
    useCity.getState().finishFight(res);
    expect(useCity.getState().game!.raid).toBeNull();
    expect(useCity.getState().fight).toBeNull();
  });
  it("CJOIN-3 a fought battle fields the raid's agents each in their own kit and the raid's own hostiles", () => {
    useCity.getState().start(9);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!)) as CityState;
    g.agents[2]!.kit = withSuit({ ...g.agents[2]!.kit, long: { item: 'arc-carbine', piece: { id: 'pc1', item: 'arc-carbine', source: 'built', sabotaged: false } } }, { item: 'shell-plate', piece: { id: 'pc2', item: 'shell-plate', source: 'built', sabotaged: false } });
    g.agents[0]!.kit = withSuit({ ...g.agents[0]!.kit, long: { item: 'scatter-gun', piece: null } }, { item: 'shell-plate', piece: { id: 'pc3', item: 'shell-plate', source: 'ordered', sabotaged: false } });
    g.shop.nextPiece = 4;
    const roster = rosterOf(g, ['ag3', 'ag1', 'ag5'], { hostiles: 7, takers: 1, fighters: 2 });
    expect(roster.squad).toEqual([
      { name: g.agents[2]!.name, template: 'agent-t2', weapon: 'arc-carbine' },
      { name: g.agents[0]!.name, template: 'agent-t2', weapon: 'scatter-gun' },
      { name: g.agents[4]!.name, template: 'agent-t1', weapon: 'patrol-carbine' },
    ]);
    expect(roster.hostiles).toEqual({ host: 4, taker: 1, fighter: 2, spitter: 0 });
    g.agents[0]!.kit.suit.piece!.sabotaged = true;
    expect(rosterOf(g, ['ag1'], { hostiles: 1, takers: 0, fighters: 0 }).squad![0]).toEqual({ name: g.agents[0]!.name, template: 'agent-t1', weapon: 'scatter-gun' }); // KIT-8: the sabotaged plate fields security gear
    // the maps: a defence, an open-ground wreck, a wreck on a building
    expect(battleOf(g, 'defence', 'hq')).toBe('hq-defence');
    g.crashes.push({ id: 'crash1', kind: 'seeder', x: 5, y: 35, building: null, survivors: 3, until: 999 }, { id: 'crash2', kind: 'seeder', x: 55, y: 55, building: 'city-hall', survivors: 3, until: 999 });
    expect(battleOf(g, 'raid', 'crash1')).toBe('wreck-raid');
    expect(battleOf(g, 'raid', 'crash2')).toBe('savings-raid');
    // and the battle engine takes it
    const battle = createGame({ battleId: 'hq-defence', seed: 1, roster });
    expect(battle.units.filter((u) => u.side === 'agency').map((u) => u.template)).toEqual(['agent-t2', 'agent-t2', 'agent-t1']);
    expect(battle.units.filter((u) => u.side === 'hostile')).toHaveLength(7);
  });
  it('CJOIN-4 a fifth of a fought raid\'s hostiles are spitters once the owner is at 30 infiltration', () => {
    useCity.getState().start(10);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!));
    for (const o of g.orgs) o.infiltration = o.id === 'freight' ? 40 : 0;
    expect(rosterOf(g, ['ag1'], { hostiles: 10, takers: 2, fighters: 2 }, 'depot-7').hostiles).toEqual({ host: 4, taker: 2, fighter: 2, spitter: 2 });
    for (const o of g.orgs) o.infiltration = o.id === 'freight' ? 20 : 0;
    expect(rosterOf(g, ['ag1'], { hostiles: 10, takers: 2, fighters: 2 }, 'depot-7').hostiles!.spitter).toBe(0);
  });
  it('CJOIN-5 a fought battle carries its captives, evacuees and core back, and the city shelves them live (RES-7)', () => {
    useCity.getState().start(11);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!));
    g.lab.done.push('restraints');
    expect(rosterOf(g, ['ag1'], { hostiles: 2, takers: 0, fighters: 0 }).capture).toBe(true);
    let b = createGame({ battleId: 'automat-raid', seed: 1, roster: { capture: true } });
    b = JSON.parse(JSON.stringify(b));
    const h = b.units.find((u) => u.template === 'host')!;
    h.down = true;
    h.captured = true;
    b.score.saved = 2;
    const res = resultFromBattle(b, { kind: 'raid', building: 'automat-row', site: 'automat-row', battle: 'automat-raid', roster: {}, agents: ['ag1'], hostiles: 2 });
    expect(res.captured).toEqual({ host: 1, taker: 0 });
    expect(res.saved).toBe(2);
  });
  it('CJOIN-6 a fought battle is at night by the city clock and has the marks only with the hand scanner', () => {
    useCity.getState().start(12);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!));
    expect(rosterOf(g, ['ag1'], { hostiles: 1, takers: 0, fighters: 0 })).toMatchObject({ night: false, scanner: false });
    g.tick = 12 * 6; // 20:00
    g.lab.done.push('hand-scanner');
    expect(rosterOf(g, ['ag1'], { hostiles: 1, takers: 0, fighters: 0 })).toMatchObject({ night: true, scanner: true });
  });
});
