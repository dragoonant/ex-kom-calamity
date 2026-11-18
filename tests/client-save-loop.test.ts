import { describe, expect, it } from 'vitest';
import { advance, hashState, query, replay } from '../src/engine';
import { SAVE_KEY, SAVE_VERSION, clearSave, makeEnvelope, readSave, summarise, validateEnvelope, writeSave, type StorageLike } from '../src/client/save';
import { feed, makeAccumulator } from '../src/client/loop';
import { SETUP, game, order, tick } from './helpers';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('15. Save, client side (SAV)', () => {
  it('SAV-3 the envelope under ekc-save holds the state as snapshot and its log, and reads back equal', () => {
    let s = game(3);
    s = order(s, { type: 'move', side: 'agency', unit: 'a1', to: { x: 4, y: 11, level: 0 } }).state;
    s = tick(s, 25).state;
    const env = makeEnvelope({ battleId: 'first-raid', seed: 3 }, s, 'pause', { selected: 'a1', level: 0 }, new Date('2026-11-17T10:00:00Z'));
    const st = memoryStorage();
    const w = writeSave(st, env);
    expect(w.ok).toBe(true);
    expect(st.map.has(SAVE_KEY)).toBe(true);
    expect(SAVE_KEY).toBe('ekc-save');
    const r = readSave(st);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.save.version).toBe(SAVE_VERSION);
      expect(r.save.paused).toBe(true);
      expect(r.save.log).toEqual(s.log);
      expect(hashState(r.save.snapshot)).toBe(hashState(s));
      // SAV-1: the log that rides along replays to the snapshot.
      expect(hashState(replay(r.save.setup, r.save.log))).toBe(hashState(s));
      expect(r.save.selected).toBe('a1');
    }
  });

  it('SAV-4 the summary names the battle, sim seconds, agents standing and hostiles down from query.*', () => {
    let s = game(1);
    s = advance(s, 4).state;
    const env = makeEnvelope(SETUP, s, 'interval', { selected: null, level: 1 }, new Date('2026-11-17T10:00:00Z'));
    const sum = summarise(env);
    expect(sum.battleName).toBe('Raid on Civic Savings');
    expect(sum.seconds).toBe(query.seconds(s));
    expect(sum.agentsStanding).toBe(query.outcome(s).living.agency);
    expect(sum.agentsTotal).toBe(6);
    expect(sum.hostilesDown).toBe(s.score.hostilesDown);
    expect(sum.savedAt).toBe('2026-11-17T10:00:00.000Z');
  });

  it('SAV-5 clearSave removes the key and a later read says there is none', () => {
    const st = memoryStorage();
    writeSave(st, makeEnvelope(SETUP, game(), 'start', { selected: null, level: 0 }));
    clearSave(st);
    expect(readSave(st)).toEqual({ kind: 'none' });
    expect(() => clearSave(null)).not.toThrow();
  });

  it('SAV-6 an unreadable save, a foreign save, an unknown battle and a refused write each give a reason', () => {
    const st = memoryStorage();
    st.setItem(SAVE_KEY, '{not json');
    expect(readSave(st)).toMatchObject({ kind: 'unreadable', reason: expect.stringMatching(/JSON/) });
    st.setItem(SAVE_KEY, JSON.stringify({ game: 'px', version: 1 }));
    expect(readSave(st)).toMatchObject({ kind: 'unreadable', reason: expect.stringMatching(/another game/) });
    const env = makeEnvelope({ battleId: 'first-raid', seed: 1 }, game(), 'start', { selected: null, level: 0 });
    expect(validateEnvelope({ ...env, version: 99 })).toMatch(/version 99/);
    expect(validateEnvelope({ ...env, setup: { battleId: 'nope', seed: 1 } })).toMatch(/not in this build/);
    expect(validateEnvelope({ ...env, snapshot: { ...env.snapshot, tiles: [] } })).toMatch(/does not match/);
    expect(validateEnvelope(env)).toBeNull();
    const refusing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const w = writeSave(refusing, env);
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toMatch(/refused/);
    expect(writeSave(null, env)).toMatchObject({ ok: false });
    expect(readSave(null)).toEqual({ kind: 'none' });
  });
});

describe('1. Time, client loop (TIME)', () => {
  it('TIME-6 the accumulator issues whole ticks from wall time, clamps long frames, keeps the remainder and feeds nothing when paused', () => {
    const a = makeAccumulator();
    const tps = 10;
    expect(feed(a, 1 / 60, tps, 1, false)).toBe(0);
    let ticks = 0;
    for (let i = 0; i < 59; i++) ticks += feed(a, 1 / 60, tps, 1, false);
    expect(ticks).toBe(10); // one second of 60 Hz frames is ten ticks
    expect(a.acc).toBeGreaterThanOrEqual(0);
    expect(a.acc).toBeLessThan(1 / tps);
    // A 2 s hitch is clamped to 0.25 s: at most 2 or 3 ticks, never 20.
    const b = makeAccumulator();
    expect(feed(b, 2, tps, 1, false)).toBeLessThanOrEqual(3);
    // Speed 4 doubles twice.
    const c = makeAccumulator();
    expect(feed(c, 0.1, tps, 4, false)).toBe(4);
    // Paused feeds nothing and leaves the remainder alone.
    const d = makeAccumulator();
    feed(d, 0.05, tps, 1, false);
    const before = d.acc;
    expect(feed(d, 1, tps, 1, true)).toBe(0);
    expect(d.acc).toBe(before);
    // TIME-4 agrees: the ticks issued through advance land on the tick counter.
    const s = advance(game(), 10 / tps).state;
    expect(s.tick).toBe(10);
  });
});
