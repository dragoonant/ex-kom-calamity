// D28 (PLAN.md; docs/art/tile-set.md sections 1b and 9): the board's surfaces, the street, the name boards and the
// control room round the board, the parts vitest can hold without a browser. The look itself is in the e2e shots.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAPS } from '../src/data';
import { createGame, type State } from '../src/engine';
import { AWNING, PAVEMENT, buildingIndex, fillLayers, isRoad, layerCapacity, makeLayers, outsideOf, streetDistance, tileSurface } from '../src/client/board/tileset';
import { EDGE, SIDE, TOP } from '../src/client/board/surface';
import { DECK, FLOOR_Y, HALL, MAX_STATIONS, ROOM_SCALE, buildRoom, stationFade } from '../src/client/board/room';
import { signsFor } from '../src/client/board/Signs';
import { BOARD_LIGHT, bakeLight } from '../src/client/board/light';

const savings = (): State => createGame({ battleId: 'savings-raid', seed: 3 });

describe('D28 board surfaces and street (tileset.ts, surface.ts)', () => {
  it('MAP-9 the street splits into pavement within two tiles of the building and road beyond, kerbed and dashed', () => {
    const map = MAPS['civic-savings-site']!;
    const d = streetDistance(map);
    const b = map.buildings![0]!;
    expect(d[b.y * map.width + b.x]).toBe(0);
    expect(isRoad(map, b.x - 1, b.y)).toBe(false);
    expect(isRoad(map, b.x - PAVEMENT, b.y)).toBe(false);
    expect(isRoad(map, b.x - PAVEMENT - 1, b.y)).toBe(true);
    const s = savings();
    const layers = makeLayers(layerCapacity(s));
    fillLayers(layers, { state: s, map, active: 9 });
    expect(layers.kerb.count).toBeGreaterThan(60);
    for (const l of Object.values(layers)) expect(l.count).toBeLessThanOrEqual(l.capacity);
  });

  it('MAP-9 an outer wall shows its style outside and plaster inside; a floor beside a wall is shaded on that edge', () => {
    const s = savings();
    const map = MAPS['civic-savings-site']!;
    const surf = new Float32Array(4);
    const alt = new Float32Array(3);
    const b = map.buildings![0]!;
    // The west outer wall at the middle of the building, level 1: the street to the west, a room to the east.
    const wall = s.tiles.find((t) => t.level === 1 && t.x === b.x && t.kind === 'wall' && t.y > b.y + 1 && t.y < b.y + b.d - 2)!;
    tileSurface(s, map, wall, surf, alt, 0);
    expect(surf[0]).toBe(SIDE.ashlar);
    expect(surf[2]! & EDGE.E).toBe(EDGE.E);
    expect(surf[2]! & EDGE.W).toBe(0);
    expect(alt[0]).toBeGreaterThan(1); // the partition's cream is lighter than the stone
    const inside = s.tiles.find((t) => t.level === 1 && t.y === wall.y && t.x === wall.x + 1)!;
    expect(inside.kind).toBe('floor');
    tileSurface(s, map, inside, surf, alt, 0);
    expect(surf[1]).toBe(TOP.terrazzo);
    expect(surf[3]! & EDGE.W).toBe(EDGE.W);
    const road = s.tiles.find((t) => t.kind === 'ground' && isRoad(map, t.x, t.y))!;
    tileSurface(s, map, road, surf, alt, 0);
    expect(surf[1]).toBe(TOP.asphalt);
    const roof = s.tiles.find((t) => t.level === b.floors && t.kind === 'floor')!;
    tileSurface(s, map, roof, surf, alt, 0);
    expect(surf[1]).toBe(TOP.roofing);
  });

  it('MAP-9 street-storey openings face out to the street; awnings and canopies only where the style has them', () => {
    const map = MAPS['sunbeam-automat-site']!;
    const s = createGame({ battleId: 'automat-raid', seed: 1 });
    const idx = buildingIndex(map);
    const door = s.tiles.find((t) => t.level === 0 && t.kind === 'door' && outsideOf(s, idx, t))!;
    const out = outsideOf(s, idx, door)!;
    const beyond = s.tiles[(door.y + out[1]) * s.width + door.x + out[0]]!;
    expect(beyond.kind).toBe('ground');
    expect(AWNING.automat).toBeDefined();
    expect(AWNING.bank).toBeUndefined();
    const layers = makeLayers(layerCapacity(s));
    fillLayers(layers, { state: s, map, active: 1 });
    expect(layers.awning.count).toBeGreaterThan(0);
    const bank = savings();
    const bl = makeLayers(layerCapacity(bank));
    fillLayers(bl, { state: bank, map: MAPS['civic-savings-site']!, active: 9 });
    expect(bl.awning.count).toBe(0);
  });

  it('MAP-8 each building gets one name board over a street door, from its own name', () => {
    for (const [battle, mapId] of [
      ['savings-raid', 'civic-savings-site'],
      ['automat-raid', 'sunbeam-automat-site'],
      ['depot-raid', 'depot-7-site'],
    ] as const) {
      const s = createGame({ battleId: battle, seed: 1 });
      const map = MAPS[mapId]!;
      const signs = signsFor(s, map.buildings!, buildingIndex(map));
      expect(signs.length).toBe(map.buildings!.length);
      expect(signs[0]!.text).toBe(map.buildings![0]!.name.split(',')[0]!.trim().toUpperCase());
      expect(signs[0]!.width).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('D28 the control room round the board (room.ts)', () => {
  it('builds our console round the board, two rings of staffed desks inside a hall, in a handful of merged meshes', () => {
    const room = buildRoom(26, 24);
    expect(room.stations.length).toBeGreaterThan(30);
    expect(room.stations.length).toBeLessThan(MAX_STATIONS);
    for (const g of [room.shell, room.chrome, room.staff, room.glow, room.walker]) {
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      expect(g.getAttribute('aStation')).toBeDefined();
    }
    expect(room.staff.getAttribute('aAnim')).toBeDefined();
    expect(room.glow.getAttribute('aGlow')).toBeDefined();
    // Every station clears our console and stays inside the hall.
    for (const st of room.stations) {
      const dx = Math.abs(st.x - room.centre.x) - room.deck.hx;
      const dz = Math.abs(st.z - room.centre.z) - room.deck.hz;
      expect(Math.max(dx, dz)).toBeGreaterThan(5);
      expect(Math.hypot(st.x - room.centre.x, st.z - room.centre.z)).toBeLessThan(HALL.radius);
    }
    expect(room.deck.hx).toBeCloseTo(13 + DECK.gutter + DECK.bead + DECK.width);
    // The hall's floor is a desk top's height below the street; an operator stands about ten city figures tall.
    expect(FLOOR_Y).toBeLessThan(-5);
    expect((1.75 * ROOM_SCALE) / 1.2).toBeGreaterThan(8);
    // The whole room stays cheap: under 200k vertices.
    const verts = [room.shell, room.chrome, room.staff, room.glow, room.walker, room.floor].reduce((a, g) => a + g.getAttribute('position').count, 0);
    expect(verts).toBeLessThan(200_000);
    const box = new THREE.Box3().setFromBufferAttribute(room.shell.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeGreaterThanOrEqual(FLOOR_Y - 0.01);
  });

  it('a station between a low camera and the board fades; one behind the board, or under a high camera, stays', () => {
    const room = buildRoom(26, 24);
    const deck = { cx: room.centre.x, cz: room.centre.z, hx: room.deck.hx, hz: room.deck.hz };
    const tx = room.centre.x;
    const tz = room.centre.z;
    const near = { x: tx, z: tz + 45, top: FLOOR_Y + 1.45 * ROOM_SCALE };
    const far = { x: tx, z: tz - 45, top: near.top };
    // Low and far out on the south side, looking north at the board.
    expect(stationFade(near, tx, 12, tz + 100, tx, tz, deck)).toBeLessThan(0.2);
    expect(stationFade(far, tx, 12, tz + 100, tx, tz, deck)).toBe(1);
    // Straight above: nothing is in the way.
    expect(stationFade(near, tx, 100, tz + 0.5, tx, tz, deck)).toBe(1);
    // High and close: the sight line passes well above the desks.
    expect(stationFade(near, tx, 60, tz + 30, tx, tz, deck)).toBeGreaterThan(0.9);
  });

  it('the low tier bakes the board light into the room: a face to the sun outshines one turned away, the ambient floor holds', () => {
    const g = new THREE.BufferGeometry();
    const d = BOARD_LIGHT.sunDir;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([d.x, d.y, d.z, -d.x, -d.y, -d.z, 0, 1, 0]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.5), 3));
    bakeLight(g, 0.22);
    const c = g.getAttribute('color');
    expect(c.getX(0)).toBeGreaterThan(c.getX(1) * 2);
    expect(c.getX(1)).toBeGreaterThanOrEqual(0.5 * 0.22);
    expect(c.getY(2)).toBeGreaterThan(c.getY(1));
  });
});
