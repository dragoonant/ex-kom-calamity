// docs/spec/20-city.md section 16: the client's save and the join.
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, readCampaign, useCity } from '../src/client/city/store';
import { battleFor, battleOf, resultFromBattle, rosterOf } from '../src/client/city/join';
import { buildingsOf, wireParts } from '../src/client/city/text';
import { CITY } from '../src/data/city';
import { createGame, step } from '../src/engine';
import { hashCity } from '../src/city';
import type { StorageLike } from '../src/client/save';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

let store: ReturnType<typeof memory>;
beforeEach(() => {
  store = memory();
  (globalThis as { localStorage?: StorageLike }).localStorage = store;
  useCity.setState({ active: false, game: null, view: null, paused: true, fight: null, tray: [], wire: [] });
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
  it("CJOIN-3 a fought battle fields the raid's agents with their working kit and the raid's own hostiles", () => {
    useCity.getState().start(9);
    const g = JSON.parse(JSON.stringify(useCity.getState().game!));
    g.shop.stock['shell-plate'] = 2;
    g.shop.stock['arc-carbine'] = 1;
    const roster = rosterOf(g, ['ag3', 'ag1', 'ag5'], { hostiles: 7, takers: 1, fighters: 2 });
    expect(roster.squad).toEqual([
      { name: g.agents[2].name, template: 'agent-t2', weapon: 'arc-carbine' },
      { name: g.agents[0].name, template: 'agent-t2' },
      { name: g.agents[4].name },
    ]);
    expect(roster.hostiles).toEqual({ host: 4, taker: 1, fighter: 2, spitter: 0 });
    g.shop.sabotaged['shell-plate'] = 2;
    expect(rosterOf(g, ['ag1'], { hostiles: 1, takers: 0, fighters: 0 }).squad![0]).toEqual({ name: g.agents[0].name, weapon: 'arc-carbine' }); // the plates are sabotaged, the carbine works
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

describe('16. The city wire (CWIRE)', () => {
  it("CWIRE-1 the organism's slips run on the wire, not the tray, and the wire saves and survives an old save", () => {
    useCity.getState().start(7);
    useCity.getState().advanceTicks(6 * 24 * 3);
    const { tray, wire } = useCity.getState();
    expect(wire.length).toBeGreaterThan(0);
    expect(wire.every((t) => t.kind.startsWith('slip-'))).toBe(true);
    expect(tray.some((t) => t.kind.startsWith('slip-'))).toBe(false);
    useCity.getState().saveNow();
    const env = JSON.parse(store.data.get(CAMPAIGN_KEY)!);
    expect(env.wire.length).toBe(wire.length);
    // A save from before the wire kept the slips in the tray: Continue moves them across.
    env.tray = [...env.tray, ...env.wire];
    delete env.wire;
    store.data.set(CAMPAIGN_KEY, JSON.stringify(env));
    useCity.setState({ active: false, game: null, tray: [], wire: [] });
    expect(useCity.getState().resume()).toBe(true);
    expect(useCity.getState().wire.map((t) => t.id).sort()).toEqual(wire.map((t) => t.id).sort());
    expect(useCity.getState().tray.some((t) => t.kind.startsWith('slip-'))).toBe(false);
  });
  it('CWIRE-2 a building name on the wire links the building; an organisation or district name links its list', () => {
    const b = CITY.buildings[0]!;
    const o = CITY.orgs.find((x) => x.id === b.org)!;
    const d = CITY.districts.find((x) => x.id === b.district)!;
    const power = wireParts({ text: `${b.name}: the power draw spiked after dark.`, building: b.id, org: o.id, district: d.id });
    expect(power[0]).toEqual({ text: b.name, link: 'building', id: b.id });
    expect(power.map((p) => p.text).join('')).toBe(`${b.name}: the power draw spiked after dark.`);
    const purchase = wireParts({ text: `${o.name} placed an odd order.`, building: null, org: o.id, district: null });
    expect(purchase[0]).toEqual({ text: o.name, link: 'org', id: o.id });
    const missing = wireParts({ text: `Missing persons: another report from ${d.name}.`, building: null, org: null, district: d.id });
    expect(missing.find((p) => 'link' in p)).toEqual({ text: d.name, link: 'district', id: d.id });
    expect(buildingsOf('org', o.id).map((x) => x.id)).toContain(b.id);
    expect(buildingsOf('district', d.id).every((x) => CITY.buildings.find((y) => y.id === x.id)!.district === d.id)).toBe(true);
  });
  it('CWIRE-3 a name picked on the wire selects the building for its file card and asks the board to bring the camera round', () => {
    useCity.getState().start(8);
    const seq = useCity.getState().focusSeq;
    useCity.getState().focusBuilding('depot-7');
    expect(useCity.getState().selected).toBe('depot-7');
    expect(useCity.getState().focusSeq).toBe(seq + 1);
  });
});
