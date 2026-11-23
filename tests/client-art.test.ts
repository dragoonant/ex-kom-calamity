// M4 art and audio pass 1, the parts vitest can hold without a browser: the tile set's geometry and counts
// (docs/art/tile-set.md), prop placement by tile health (MAP-9), effects from events (fx.ts), the audio settings
// and the sound catalogue. The board, gallery and sound desk themselves are covered by the e2e.
import { describe, expect, it } from 'vitest';
import { BATTLES, MAPS, PROP_KINDS } from '../src/data';
import { createGame, step, tileIndex, type State } from '../src/engine';
import { PROP_PARTS, STYLE_PALETTE, baseColour, buildingIndex, damageOf, fillLayers, groupProps, layerCapacity, makeLayers, openingYaw, placeProp, propCatalogue, propGeometry, styleAt } from '../src/client/board/tileset';
import { fxFor } from '../src/client/fx';
import { readAudioSettings, writeAudioSettings, DEFAULT_AUDIO } from '../src/client/audio/settings';
import { SOUNDS, SOUND_NAMES } from '../src/client/audio/synth';
import { FIGURE_PARTS, figureGeometry, gateOf, humanoidRole, measureParts } from '../src/client/board/placeholders';
import { FIGURE_ROLES, FIGURE_SLOTS } from '../src/client/models';
import { citizenBody, roleOf } from '../src/client/board/Figures';
import type { Unit } from '../src/engine';
import * as THREE from 'three';

const block = (): State => createGame({ battleId: 'block-raid', seed: 5 });

describe('M4 tile set (docs/art/tile-set.md; MAP-9)', () => {
  it('MAP-9 every building style has a palette and every footprint tile resolves to its building, the street to none', () => {
    const map = MAPS['halcyon-block']!;
    const idx = buildingIndex(map);
    for (const b of map.buildings!) {
      expect(styleAt(idx, map.width, b.x + 1, b.y + 1).building?.id).toBe(b.id);
      expect(STYLE_PALETTE[b.style!]).toBeDefined();
    }
    expect(styleAt(idx, map.width, 0, 0)).toEqual({ style: 'street', building: null });
    expect(styleAt(idx, map.width, 30, 30).style).toBe('street');
  });

  it('MAP-9 the pick mesh colours a tile by kind, style and roof, and reads the three destructible states', () => {
    const s = block();
    const c = new THREE.Color();
    const map = MAPS['halcyon-block']!;
    const idx = buildingIndex(map);
    const floor = s.tiles.find((t) => t.kind === 'floor' && t.level === 0 && styleAt(idx, s.width, t.x, t.y).style === 'bank')!;
    const roof = s.tiles.find((t) => t.kind === 'floor' && t.level === 3 && styleAt(idx, s.width, t.x, t.y).building?.id === 'civic-savings')!;
    expect(baseColour(floor, 'bank', false, c).getHexString()).not.toBe(baseColour(roof, 'bank', true, c.clone()).getHexString());
    const wall = s.tiles.find((t) => t.kind === 'wall' && t.material === 'brick')!;
    expect(damageOf(wall)).toBe('intact');
    expect(damageOf({ ...wall, hp: 40 })).toBe('damaged');
    expect(damageOf({ ...wall, kind: 'rubble', material: 'none', hp: 0 })).toBe('rubble');
    expect(damageOf(s.tiles.find((t) => t.kind === 'ground')!)).toBe('intact'); // paving never damages (STR-2)
  });

  it('MAP-9 the dressing layers hold every window, door and stair of the block and grow rubble where a wall falls', () => {
    const s = block();
    const map = MAPS['halcyon-block']!;
    const layers = makeLayers(layerCapacity(s));
    fillLayers(layers, { state: s, map, active: 6 });
    expect(layers.glass.count).toBe(323);
    expect(layers.mullion.count).toBe(323 * 2);
    expect(layers.leaf.count).toBe(113);
    expect(layers.step.count).toBe(42 * 4);
    expect(layers.chunk.count).toBe(0);
    expect(layers.scorch.count).toBe(0);
    for (const l of Object.values(layers)) expect(l.count).toBeLessThanOrEqual(l.capacity);
    // The cut-away draws only the levels up to the active one.
    fillLayers(layers, { state: s, map, active: 0 });
    expect(layers.glass.count).toBeLessThan(323);
    expect(layers.glass.count).toBeGreaterThan(0);
    // Break a wall: three chunks appear; damage a wall: a scorch band appears.
    const wallIdx = s.tiles.findIndex((t) => t.kind === 'wall' && t.level === 0);
    const broken: State = { ...s, tiles: s.tiles.map((t, i) => (i === wallIdx ? { ...t, kind: 'rubble' as const, material: 'none', hp: 0 } : t)) };
    fillLayers(layers, { state: broken, map, active: 0 });
    expect(layers.chunk.count).toBe(3);
    const damaged: State = { ...s, tiles: s.tiles.map((t, i) => (i === wallIdx ? { ...t, hp: 10 } : t)) };
    fillLayers(layers, { state: damaged, map, active: 0 });
    expect(layers.scorch.count).toBe(1);
  });

  it('MAP-9 a window turns to lie in its wall: flat in an east-west run, a quarter turn in a north-south run, the default when alone', () => {
    const map = MAPS['halcyon-block']!;
    const s = createGame({ battleId: 'block-raid', seed: 1 }) as State;
    const w = s.width;
    const d = s.depth;
    let ew = 0;
    let ns = 0;
    for (const t of s.tiles) {
      if (t.kind !== 'window') continue;
      const yaw = openingYaw(s.tiles, w, d, t);
      const base = t.level * w * d;
      const side = (x: number, y: number) => s.tiles[base + y * w + x];
      const wallish = (q?: { kind: string }) => !!q && (q.kind === 'wall' || q.kind === 'window' || q.kind === 'door');
      const alongX = wallish(side(t.x - 1, t.y)) || wallish(side(t.x + 1, t.y));
      const alongZ = wallish(side(t.x, t.y - 1)) || wallish(side(t.x, t.y + 1));
      if (alongZ && !alongX) {
        expect(yaw).toBe(Math.PI / 2);
        ns++;
      } else if (alongX && !alongZ) {
        expect(yaw).toBe(0);
        ew++;
      }
    }
    // The block has windows on both faces of its buildings.
    expect(ew).toBeGreaterThan(0);
    expect(ns).toBeGreaterThan(0);
    expect(map).toBeTruthy();
    // A lone window (no wall beside it) keeps the east-west default.
    const lone = { ...s.tiles.find((t) => t.kind === 'window')!, x: 0, y: 0, level: 0 };
    const empty = s.tiles.map((t) => (t.level === 0 && t.x <= 1 && t.y <= 1 ? { ...t, kind: 'ground' as const } : t));
    expect(openingYaw(empty, w, d, lone)).toBe(0);
  });

  it('MAP-9 every prop kind has a merged vertex-coloured geometry under 5 tiles tall, and the block uses every kind', () => {
    const cat = propCatalogue();
    expect(cat.map((c) => c.kind).sort()).toEqual([...PROP_KINDS].sort());
    for (const c of cat) {
      expect(c.parts).toBeGreaterThan(0);
      expect(c.height).toBeGreaterThan(0.3);
      expect(c.height).toBeLessThan(5);
      expect(c.vertices).toBeGreaterThan(0);
      expect(c.vertices).toBeLessThan(2000); // one instance is cheap; 400 props stay under a million vertices
      expect(propGeometry(c.kind).getAttribute('color')).toBeDefined();
    }
    expect(Object.keys(PROP_PARTS).length).toBe(PROP_KINDS.length);
    const groups = groupProps(MAPS['halcyon-block']!, block());
    expect([...groups.keys()].sort()).toEqual([...PROP_KINDS].sort());
  });

  it('MAP-9 a prop follows the tile under it: upright on an intact floor, askew and darker on a damaged one, gone when it collapses or the cut-away hides its level', () => {
    const s = block();
    const groups = groupProps(MAPS['halcyon-block']!, s);
    const desk = groups.get('desk')!.find((p) => p.def.level === 1)!;
    const out = { x: 0, y: 0, z: 0, yaw: 0, tilt: 0, scale: 1, tint: 1, shown: false };
    placeProp(desk, s, 6, out);
    expect(out).toMatchObject({ shown: true, tilt: 0, tint: 1, scale: 1, y: 2 });
    expect(out.x).toBe(desk.def.x + 0.5);
    placeProp(desk, s, 0, out);
    expect(out.shown).toBe(false); // level 1 is above the cut-away
    const t = s.tiles[desk.index]!;
    const damaged: State = { ...s, tiles: s.tiles.map((x, i) => (i === desk.index ? { ...x, hp: 75 } : x)) };
    placeProp(desk, damaged, 6, out);
    expect(out.shown).toBe(true);
    expect(out.tilt).toBeGreaterThan(0.1);
    expect(out.tint).toBeLessThan(1);
    const gone: State = { ...s, tiles: s.tiles.map((x, i) => (i === desk.index ? { ...x, kind: 'void' as const, material: 'none', hp: 0 } : x)) };
    placeProp(desk, gone, 6, out);
    expect(out.shown).toBe(false);
    expect(t.kind).toBe('floor');
  });
});

describe('M4 figure placeholders (docs/figures.md sections 1 to 3)', () => {
  it('MAP-9 every humanoid placeholder measures inside the section 4 gates, and every role merges into one body geometry with a core where D14 asks for one', () => {
    for (const role of FIGURE_ROLES) {
      const m = measureParts(role);
      const g = gateOf(m, role);
      if (humanoidRole(role)) {
        expect(m.found).toEqual(['head', 'torso', 'legs']);
        expect(g.pass, `${role}: ${JSON.stringify(m)}`).toBe(true);
        expect(m.height).toBeGreaterThan(1.15); // 1.2 plus a brim, a fin or coral on the crown
        expect(m.height).toBeLessThan(1.32);
      } else {
        expect(g.pass).toBe(true);
      }
      expect(figureGeometry(role).getAttribute('color')).toBeDefined();
      expect(figureGeometry(role).getAttribute('position').count).toBeLessThan(6000);
    }
    const cores = (role: string) => FIGURE_PARTS[role as keyof typeof FIGURE_PARTS].filter((p) => p.core).length;
    expect(cores('host-revealed')).toBe(1);
    expect(cores('taker')).toBe(1);
    expect(cores('fighter')).toBe(1);
    expect(cores('agent-t1')).toBe(0);
    expect(cores('citizen')).toBe(0);
    // A hidden host is the citizen, part for part (HIDE-1); the second body's stand-in is the same citizen.
    expect(FIGURE_PARTS['host-hidden']).toEqual(FIGURE_PARTS.citizen);
    expect(FIGURE_PARTS['citizen-2']).toEqual(FIGURE_PARTS.citizen);
  });

  it('RULING CITIZEN-2: the two citizen bodies are dealt by the unit id, odd last digit body 2, and a hidden host gets its body the same way', () => {
    expect(citizenBody('u1')).toBe('citizen-2');
    expect(citizenBody('u2')).toBe('citizen');
    expect(citizenBody('u13')).toBe('citizen-2');
    expect(citizenBody('u20')).toBe('citizen');
    expect(citizenBody('x')).toBe('citizen');
    const unit = (id: string, template: string, side: string) => ({ id, template, side }) as unknown as Unit;
    expect(roleOf(unit('u3', 'citizen', 'civilian'))).toBe('citizen-2');
    expect(roleOf(unit('u4', 'citizen', 'civilian'))).toBe('citizen');
    expect(roleOf(unit('u3', 'host', 'hostile'))).toBe('host-revealed'); // the view only shows template host once revealed
    expect(roleOf(unit('a1', 'agent-t1', 'agency'))).toBe('agent-t1');
    // Every model slot the roles need is filled: no humanoid is a stand-in any more (AGENT-1 closed, D22 citizens).
    for (const role of FIGURE_ROLES) expect(FIGURE_SLOTS[role].url, role).not.toBeNull();
    expect(FIGURE_SLOTS['host-hidden'].url).toBe(FIGURE_SLOTS.citizen.url); // HIDE-1
    expect(FIGURE_SLOTS['agent-t1'].url).not.toBe(FIGURE_SLOTS['agent-t2'].url);
  });
});

describe('M4 effects from events (fx.ts; VIEW-2, VIEW-1)', () => {
  it('MAP-9 a charge that breaks a wall queues a blast and a breach with the material that fell; a hidden shooter makes no flash', () => {
    let s = block();
    s = step(s, { type: 'blast', side: 'agency', unit: 'a3', at: { x: 5, y: 44, level: 0 } }).state;
    const events = [];
    let prev = s;
    for (let i = 0; i < s.tuning.blast.armTicks; i++) {
      const r = step(s, { type: 'tick' });
      if (!r.ok) throw new Error(r.reason);
      events.push(...r.events);
      prev = s;
      s = r.state;
    }
    const fx = fxFor(events, prev, s);
    expect(fx.some((f) => f.kind === 'blast' && f.at.x === 5 && f.at.y === 44)).toBe(true);
    const breach = fx.find((f) => f.kind === 'breach');
    expect(breach).toMatchObject({ material: 'brick' });
    expect(s.tiles[tileIndex(s, { x: 5, y: 44, level: 0 })]!.kind).toBe('rubble');
    // A shot between two units the agency cannot see yields nothing; the agency's own shot always does.
    const hidden = fxFor([{ type: 'shot', tick: 1, shooter: 'u9', target: 'u10', weapon: 'pocket-pistol', distance: 2, moving: false, breakdown: { accuracy: 0, aim: 0, falloff: 0, movingPenalty: 0, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, cover: 0, coverGrade: 'none', snapPenalty: 0, suppressPenalty: 0, raw: 0, chance: 50 }, roll: 1, hit: true }], s, s);
    expect(hidden.filter((f) => f.kind === 'muzzle')).toEqual([]);
    const own = fxFor([{ type: 'shot', tick: 1, shooter: 'a1', target: 'u9', weapon: 'patrol-carbine', distance: 2, moving: false, breakdown: { accuracy: 0, aim: 0, falloff: 0, movingPenalty: 0, crouchPenalty: 0, crouchBonus: 0, runPenalty: 0, cover: 0, coverGrade: 'none', snapPenalty: 0, suppressPenalty: 0, raw: 0, chance: 50 }, roll: 1, hit: true }], s, s);
    expect(own.filter((f) => f.kind === 'muzzle')).toHaveLength(1);
    expect(own[0]).toMatchObject({ weapon: 'patrol-carbine', side: 'agency', hit: true });
    expect(BATTLES['block-raid']!.squad[0]!.name).toBe('Vance');
  });
});

describe('M4 audio settings and catalogue (PLAN.md Q19)', () => {
  it('MAP-9 settings read defaults from nothing, round-trip through storage, and reject nonsense', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(readAudioSettings(null)).toEqual(DEFAULT_AUDIO);
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO);
    expect(writeAudioSettings(storage, { volume: 0.25, muted: true, music: 0.4, source: 'synth' })).toBe(true);
    expect(readAudioSettings(storage)).toEqual({ volume: 0.25, muted: true, music: 0.4, source: 'synth' });
    // A pass 1 record (volume and mute only) still reads, with pass 2 defaults for the rest.
    mem.set('ekc-audio', '{"volume": 0.5, "muted": false}');
    expect(readAudioSettings(storage)).toEqual({ volume: 0.5, muted: false, music: DEFAULT_AUDIO.music, source: 'auto' });
    mem.set('ekc-audio', '{"volume": 7, "muted": "yes"}');
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO);
    mem.set('ekc-audio', 'not json');
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO);
  });

  it('MAP-9 the catalogue names every sound the brief asked for, each with a cue and a mechanism', () => {
    for (const must of ['fire-pistol', 'fire-carbine', 'fire-scatter', 'fire-whip', 'bite', 'hit-armour', 'breach', 'collapse', 'taking', 'alert', 'pause', 'resume', 'click', 'ambient']) expect(SOUND_NAMES).toContain(must);
    for (const s of SOUNDS) {
      expect(s.cue.length).toBeGreaterThan(5);
      expect(s.mechanism.length).toBeGreaterThan(10);
      expect(s.seconds).toBeGreaterThan(0);
    }
    expect(new Set(SOUND_NAMES).size).toBe(SOUND_NAMES.length);
  });
});

describe('Round 10 assets and surfaces (docs/art/round-10.md)', () => {
  it('every asset slot names a GLB that exists, a prop or vehicle under 400 KB and a building or craft under 2.2 MB, and the preload takes them all', async () => {
    const { existsSync, statSync } = await import('node:fs');
    const { ASSET_SLOTS, modelUrls } = await import('../src/client/models');
    expect(ASSET_SLOTS).toHaveLength(31);
    const boot = modelUrls(false);
    for (const a of ASSET_SLOTS) {
      expect(a.url, a.id).not.toBeNull();
      const path = `public/${a.url}`;
      expect(existsSync(path), path).toBe(true);
      const cap = a.group === 'prop' || a.group === 'vehicle' ? 400_000 : 2_200_000;
      expect(statSync(path).size, path).toBeLessThan(cap);
      expect(boot).toContain(a.url);
    }
    // The 30k figure models load only on ?gallery; the board's rigged files load at boot (round 10).
    for (const r of FIGURE_ROLES) {
      if (FIGURE_SLOTS[r].rigged) expect(boot).toContain(FIGURE_SLOTS[r].rigged);
      if (FIGURE_SLOTS[r].url) expect(boot).not.toContain(FIGURE_SLOTS[r].url);
    }
  });

  it('the surface strip has the shader layers in order, and every tile kind of every style maps to a layer or to none', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { SURFACES, surfaceOf, surfaceLayer } = await import('../src/client/board/surface');
    const meta = JSON.parse(readFileSync('public/textures/tiles.json', 'utf8')) as { size: number; layers: string[]; mean: number[][] };
    expect(meta.layers).toEqual([...SURFACES]);
    expect(meta.mean).toHaveLength(SURFACES.length);
    expect(existsSync('public/textures/tiles.webp')).toBe(true);
    for (const style of ['residential', 'office', 'bank', 'depot', 'automat', 'street'] as const) {
      for (const kind of ['ground', 'floor', 'wall', 'window', 'stair', 'rubble'] as const) {
        const s = surfaceOf({ kind, material: 'brick' } as never, style, false);
        expect(surfaceLayer(s), `${style} ${kind}`).toBeGreaterThanOrEqual(0);
      }
      expect(surfaceLayer(surfaceOf({ kind: 'void', material: 'brick' } as never, style, false))).toBe(-1);
    }
  });
});
