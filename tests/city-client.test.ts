// docs/spec/20-city.md section 16: the client's save and the join.
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, readCampaign, useCity } from '../src/client/city/store';
import { battleFor, resultFromBattle } from '../src/client/city/join';
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
    const res = resultFromBattle(r.state, { building: 'automat-row', site: 'automat-row', agents: ['ag3', 'ag4'], hostiles: 2 });
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
});
