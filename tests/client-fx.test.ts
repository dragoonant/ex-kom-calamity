// PLAN.md D21 e-f, the effects pass: what the fx queue carries for the figures and the new effects (unit ids, chips
// where a round strikes a wall), the crack dressing on damaged tiles, the fire ramp, and the shake switch's storage.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGame, step, tileIndex, type GameEvent } from '../src/engine';
import { fxFor } from '../src/client/fx';
import { CRACK_SEGMENTS_MAX, fillLayers, layerCapacity, makeLayers, pushCracks } from '../src/client/board/tileset';
import { fireColour, rng } from '../src/client/board/fxkit';
import { DEFAULT_VIEW, readViewSettings, writeViewSettings } from '../src/client/viewSettings';
import { MAPS } from '../src/data';

const shot = (shooter: string, target: string, hit: boolean): GameEvent => ({ type: 'shot', tick: 1, shooter, target, weapon: 'patrol-carbine', distance: 2, moving: false, breakdown: { accuracy: 0, aim: 0, falloff: 0, movingPenalty: 0, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, raw: 0, chance: 50 }, roll: 1, hit });

describe('D21 effects queue (fx.ts)', () => {
  it('names the unit each effect belongs to, so the right figure recoils, flinches, throws or lunges', () => {
    const s = createGame({ battleId: 'savings-raid', seed: 2 });
    const fx = fxFor([shot('a1', 'a2', true), { type: 'damaged', tick: 1, unit: 'a2', raw: 5, armour: 0, dealt: 5, hp: 55 }, { type: 'blast', tick: 1, unit: 'a3', at: { x: 4, y: 10, level: 0 } }, { type: 'taken', tick: 1, unit: 'a4', by: 'a5', seen: true }], s, s);
    expect(fx.find((f) => f.kind === 'muzzle')).toMatchObject({ unit: 'a1' });
    expect(fx.find((f) => f.kind === 'hit')).toMatchObject({ unit: 'a2' });
    expect(fx.find((f) => f.kind === 'blast')).toMatchObject({ unit: 'a3' });
    expect(fx.find((f) => f.kind === 'taken')).toMatchObject({ unit: 'a4', by: 'a5' });
  });

  it('a round striking a wall chips it with its material; a blast tick does not chip every tile it hurt', () => {
    const s = createGame({ battleId: 'savings-raid', seed: 2 });
    const wall = { x: 4, y: 7, level: 0 };
    expect(s.tiles[tileIndex(s, wall)]!.kind).toBe('wall');
    const chip = fxFor([{ type: 'tileDamaged', tick: 3, at: wall, amount: 4, hp: 116 }], s, s);
    expect(chip).toHaveLength(1);
    expect(chip[0]).toMatchObject({ kind: 'chip', material: 'brick', at: wall });
    const blasted = fxFor([{ type: 'blast', tick: 3, unit: 'a3', at: wall }, { type: 'tileDamaged', tick: 3, at: wall, amount: 60, hp: 60 }], s, s);
    expect(blasted.map((f) => f.kind)).toEqual(['blast']);
  });
});

describe('D21 cracks on damaged tiles (tileset.ts)', () => {
  it('a damaged wall cracks on every face, more as it weakens, never past its budget, and the same way every refill', () => {
    const s = createGame({ battleId: 'savings-raid', seed: 2 });
    const cap = layerCapacity(s);
    const count = (dmg: number) => {
      const layers = makeLayers(cap);
      pushCracks(layers.crack, 4.5, 0, 7.5, 2, dmg, 1234, 0.505);
      return { n: layers.crack.count, m: Array.from(layers.crack.matrices.slice(0, layers.crack.count * 16)) };
    };
    const light = count(0.1);
    const heavy = count(0.9);
    expect(light.n).toBeGreaterThanOrEqual(8); // 4 faces, a crack of 2 or 3 segments on each
    expect(heavy.n).toBeGreaterThan(light.n);
    expect(heavy.n).toBeLessThanOrEqual(CRACK_SEGMENTS_MAX);
    expect(count(0.9).m).toEqual(heavy.m);
    // On the board: an intact building has no cracks; a damaged wall gets them.
    const layers = makeLayers(cap);
    fillLayers(layers, { state: s, map: MAPS['civic-savings-site']!, active: 0 });
    expect(layers.crack.count).toBe(0);
    const hurt = step(s, { type: 'blast', side: 'agency', unit: 'a3', at: { x: 4, y: 11, level: 0 } });
    let g = hurt.ok ? hurt.state : s;
    for (let i = 0; i < s.tuning.blast.armTicks; i++) {
      const r = step(g, { type: 'tick' });
      if (r.ok) g = r.state;
    }
    fillLayers(layers, { state: g, map: MAPS['civic-savings-site']!, active: 0 });
    expect(layers.crack.count).toBeGreaterThan(0);
  });

  it('the fire ramp runs from white-hot through mustard and coral to soot; the effect draw is stable per id', () => {
    const c = new THREE.Color();
    fireColour(0, c);
    expect(c.r).toBe(1);
    expect(c.g).toBeGreaterThan(0.9);
    fireColour(0.5, c);
    expect(c.r).toBe(1);
    expect(c.g).toBeLessThan(0.7);
    fireColour(0.99, c);
    expect(c.r).toBeLessThan(0.4);
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('D21 shake switch and the D24 shadows switch (viewSettings.ts)', () => {
  it('reads the default from nothing, round-trips, and rejects nonsense', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(readViewSettings(null)).toEqual(DEFAULT_VIEW);
    expect(readViewSettings(storage)).toEqual({ shake: true, shadows: true });
    expect(writeViewSettings(storage, { shake: false, shadows: true })).toBe(true);
    expect(readViewSettings(storage)).toEqual({ shake: false, shadows: true });
    expect(writeViewSettings(storage, { shake: true, shadows: false })).toBe(true);
    expect(readViewSettings(storage)).toEqual({ shake: true, shadows: false });
    // A save from before the shadows switch keeps its shake and takes the shadows default.
    mem.set('ekc-view', '{"shake": false}');
    expect(readViewSettings(storage)).toEqual({ shake: false, shadows: true });
    mem.set('ekc-view', '{"shake": "loud"}');
    expect(readViewSettings(storage)).toEqual(DEFAULT_VIEW);
    mem.set('ekc-view', 'nope');
    expect(readViewSettings(storage)).toEqual(DEFAULT_VIEW);
  });
});
