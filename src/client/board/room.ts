// The control room around the board (PLAN.md D28; docs/art/tile-set.md section 9): the raid site is shown inside our
// own console, a plotting desk of enamel panels, chrome bead, lamp rows, toggles and dials, standing in a light
// enamel operations hall where operators at other consoles sweep the city for aliens on round scopes. Pure geometry,
// no React, so vitest can measure it. Everything merges into a handful of meshes (one draw each):
//   shell   the hall and our console in vertex-coloured enamel (standard material);
//   chrome  bead, bezels, posts and toggles (a metallic standard material);
//   staff   every station's desk, chair and operator, with per-vertex animation codes so heads turn, arms work the
//           switches and the walking supervisor's legs swing, all in the vertex shader (ConsoleRoom.tsx);
//   glow    lamps, scopes, ceiling panels and the wall boards' lamps in one shader material.
// Stations carry an index so the ones between the camera and the board fade out (KB gotchas: dressing round an orbit
// camera blacks out low views). Nothing here has a handler or a raycast (KB rule 25).
// Scale: the board's tiles are 1 unit; the room is drawn at ROOM_SCALE units a metre, so an operator stands about
// ten city figures tall and the board reads as a lit model city inside the desk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Units per metre for the room (the board's own scale is a tile a unit). */
export const ROOM_SCALE = 6.1;
/** The hall's floor, below the board's street (y = 0): a desk top 0.95 m high. */
export const FLOOR_Y = -0.95 * ROOM_SCALE;
/** Our console's deck: how far it reaches beyond the board's edge, and its height. */
export const DECK = { gutter: 0.5, bead: 0.35, width: 7, top: 0.3 };
/** The hall's wall radius and height in units. */
export const HALL = { radius: 96, height: 8 * ROOM_SCALE, sides: 16 };
/** The most stations the fade uniform holds (ConsoleRoom.tsx). */
export const MAX_STATIONS = 48;

/** Animation codes in `aAnim.x` (ConsoleRoom.tsx's vertex shader). */
export const ANIM = { none: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5, headWall: 6 } as const;
/** Glow codes in `aGlow.x`. */
export const GLOW = { steady: 0, blink: 1, scope: 2, panel: 3, alert: 4 } as const;

const PAL = {
  enamel: '#efe6cf',
  enamelDeep: '#e3d7b8',
  enamelEdge: '#c9b98f',
  teal: '#3f7f82',
  tealDeep: '#2f5f62',
  coral: '#d9533f',
  mustard: '#d9a62e',
  graphite: '#2b2f33',
  graphiteSoft: '#5a6066',
  green: '#3fae63',
  red: '#c8322a',
  chrome: '#d9dde0',
  chromeDark: '#8d959b',
  paper: '#fbf7ea',
  wallUpper: '#e9e1cc',
  ceiling: '#e6e0d2',
  board: '#24474a',
};

type Vec3 = [number, number, number];

interface Part {
  shape: 'box' | 'cyl' | 'sphere' | 'disc' | 'plane' | 'hcyl' | 'limb';
  size: Vec3;
  at: Vec3;
  rot?: Vec3;
  colour: string;
  /** Animation code (ANIM) and the joint it turns about, in the same frame as `at`. */
  anim?: number;
  pivot?: Vec3;
  /** Glow code (GLOW) for the glow mesh. */
  glow?: number;
  seg?: number;
}

const COL = new THREE.Color();
const V = new THREE.Vector3();

function shapeGeometry(p: Part): THREE.BufferGeometry {
  const [sx, sy, sz] = p.size;
  switch (p.shape) {
    case 'box':
      return new THREE.BoxGeometry(sx, sy, sz);
    case 'cyl':
      return new THREE.CylinderGeometry(sx / 2, sx / 2, sy, p.seg ?? 12);
    case 'hcyl': {
      // A cylinder lying along x.
      const g = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, p.seg ?? 10);
      g.rotateZ(Math.PI / 2);
      return g;
    }
    case 'limb': {
      // A rounded limb or body: a capsule squashed to the box it stands in (y is its length).
      const r = 0.5;
      const g = new THREE.CapsuleGeometry(r, Math.max(0.01, 1 - 2 * r), 2, 8);
      g.scale(sx, sy, sz);
      return g;
    }
    case 'sphere': {
      const g = new THREE.SphereGeometry(0.5, p.seg ?? 10, Math.max(6, Math.round((p.seg ?? 10) * 0.7)));
      g.scale(sx, sy, sz);
      return g;
    }
    case 'disc':
      return new THREE.CircleGeometry(sx / 2, p.seg ?? 28);
    case 'plane':
      return new THREE.PlaneGeometry(sx, sy);
  }
}

/** Collects parts into one merged geometry with the room's attributes. */
export class RoomMerge {
  private geoms: THREE.BufferGeometry[] = [];
  readonly glow: boolean;
  constructor(glow: boolean) {
    this.glow = glow;
  }

  get size(): number {
    return this.geoms.length;
  }

  /** Adds a part in a frame `m` (a station's or the hall's), tagged with the station (-1: never fades) and a phase. */
  add(p: Part, m: THREE.Matrix4, station: number, phase: number): void {
    const g = shapeGeometry(p);
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const uv = g.getAttribute('uv');
    g.applyMatrix4(local);
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    COL.set(p.colour);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = COL.r;
      col[i * 3 + 1] = COL.g;
      col[i * 3 + 2] = COL.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aStation', new THREE.BufferAttribute(new Float32Array(n).fill(station), 1));
    if (this.glow) {
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        a[i * 4] = p.glow ?? GLOW.steady;
        a[i * 4 + 1] = phase;
        a[i * 4 + 2] = uv ? uv.getX(i) * 2 - 1 : 0;
        a[i * 4 + 3] = uv ? uv.getY(i) * 2 - 1 : 0;
      }
      g.setAttribute('aGlow', new THREE.BufferAttribute(a, 4));
      g.deleteAttribute('normal');
    } else {
      const anim = new Float32Array(n * 2);
      const pivot = new Float32Array(n * 3);
      const axis = new Float32Array(n * 3);
      V.set(...(p.pivot ?? p.at)).applyMatrix4(m);
      // The joint's sideways axis (the frame's own x), for nods and arm and leg swings.
      const ax = new THREE.Vector3(1, 0, 0).transformDirection(m);
      for (let i = 0; i < n; i++) {
        anim[i * 2] = p.anim ?? ANIM.none;
        anim[i * 2 + 1] = phase;
        pivot.set([V.x, V.y, V.z], i * 3);
        axis.set([ax.x, ax.y, ax.z], i * 3);
      }
      g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 2));
      g.setAttribute('aPivot', new THREE.BufferAttribute(pivot, 3));
      g.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3));
    }
    g.deleteAttribute('uv');
    // Every three.js shape is indexed, so the merge keeps the indices (about a quarter of the vertices).
    if (!g.index) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    this.geoms.push(g);
  }

  build(): THREE.BufferGeometry {
    if (!this.geoms.length) this.add({ shape: 'box', size: [0.001, 0.001, 0.001], at: [0, -1000, 0], colour: '#000000' }, new THREE.Matrix4(), -1, 0);
    const out = mergeGeometries(this.geoms, false);
    for (const g of this.geoms) g.dispose();
    this.geoms = [];
    if (!out) throw new Error('room merge failed');
    out.computeBoundingSphere();
    return out;
  }
}

/** A stable draw in [0, 1). */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pick<T>(list: readonly T[], n: number): T {
  return list[Math.floor(rnd(n) * list.length) % list.length]!;
}

const SHIRTS = ['#e8e2d0', '#a9c3c9', '#d9a62e', '#3f7f82', '#efe6cf', '#c9b48e', '#b9c8b4', '#d9533f'] as const;
const LEGS = ['#2b2f33', '#5a6066', '#3b3f44', '#4a3f38', '#2f3d4a'] as const;
const SKIN = ['#e0b899', '#c68e6a', '#8d5a3b', '#f0cfb4', '#a8714d', '#6b4430'] as const;
const HAIR = ['#2b2016', '#5a3b22', '#b88a4a', '#1b1b1f', '#8a8a86', '#7a3b22'] as const;

/** The metres-to-units frame of a station: origin on the floor at the operator's hip line, facing +z. */
function stationFrame(x: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, FLOOR_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(ROOM_SCALE, ROOM_SCALE, ROOM_SCALE));
}

interface Look {
  shirt: string;
  legs: string;
  skin: string;
  hair: string;
  long: boolean;
}

function lookOf(n: number): Look {
  return { shirt: pick(SHIRTS, n + 1), legs: pick(LEGS, n + 2), skin: pick(SKIN, n + 3), hair: pick(HAIR, n + 4), long: rnd(n + 5) < 0.45 };
}

/** The head, hair and headset of an operator whose neck joint is at (0, neckY, z0) in the station frame. */
function headParts(neckY: number, z0: number, l: Look, headset: boolean, anim: number): Part[] {
  const pv: Vec3 = [0, neckY, z0];
  const hy = neckY + 0.13;
  const parts: Part[] = [
    { shape: 'cyl', size: [0.1, 0.12, 0.1], at: [0, neckY + 0.02, z0], colour: l.skin, anim, pivot: pv },
    { shape: 'sphere', size: [0.2, 0.24, 0.22], at: [0, hy, z0 + 0.01], colour: l.skin, anim, pivot: pv },
    { shape: 'sphere', size: [0.215, 0.2, 0.225], at: [0, hy + 0.045, z0 - 0.012], colour: l.hair, anim, pivot: pv },
    { shape: 'box', size: [0.04, 0.035, 0.03], at: [0, hy + 0.0, z0 + 0.115], colour: l.skin, anim, pivot: pv }, // nose
  ];
  if (l.long) parts.push({ shape: 'box', size: [0.2, 0.18, 0.08], at: [0, hy - 0.07, z0 - 0.08], colour: l.hair, anim, pivot: pv });
  if (headset) {
    parts.push(
      { shape: 'box', size: [0.24, 0.025, 0.035], at: [0, hy + 0.135, z0], colour: PAL.graphite, anim, pivot: pv },
      { shape: 'hcyl', size: [0.04, 0.085, 0.085], at: [0.115, hy, z0], colour: PAL.graphite, anim, pivot: pv },
      { shape: 'hcyl', size: [0.04, 0.085, 0.085], at: [-0.115, hy, z0], colour: PAL.graphite, anim, pivot: pv },
      { shape: 'box', size: [0.015, 0.015, 0.11], at: [0.11, hy - 0.04, z0 + 0.06], rot: [0.4, 0, 0], colour: PAL.graphite, anim, pivot: pv }, // the mouthpiece arm
    );
  }
  return parts;
}

/** A seated operator at a desk 0.45 m ahead, reaching for the panel; metres, station frame. */
function seatedOperator(l: Look): Part[] {
  const sh: Vec3 = [0.23, 1.1, 0.02];
  const shL: Vec3 = [-0.23, 1.1, 0.02];
  return [
    // Legs under the desk.
    { shape: 'limb', size: [0.15, 0.15, 0.46], at: [0.1, 0.54, 0.2], colour: l.legs },
    { shape: 'limb', size: [0.15, 0.15, 0.46], at: [-0.1, 0.54, 0.2], colour: l.legs },
    { shape: 'limb', size: [0.12, 0.48, 0.13], at: [0.1, 0.27, 0.44], colour: l.legs },
    { shape: 'limb', size: [0.12, 0.48, 0.13], at: [-0.1, 0.27, 0.44], colour: l.legs },
    { shape: 'box', size: [0.11, 0.08, 0.27], at: [0.1, 0.04, 0.5], colour: PAL.graphite },
    { shape: 'box', size: [0.11, 0.08, 0.27], at: [-0.1, 0.04, 0.5], colour: PAL.graphite },
    // Body, leaning in to the scope.
    { shape: 'limb', size: [0.36, 0.18, 0.26], at: [0, 0.56, 0.0], colour: l.legs },
    { shape: 'limb', size: [0.38, 0.5, 0.22], at: [0, 0.88, 0.03], rot: [0.14, 0, 0], colour: l.shirt },
    { shape: 'limb', size: [0.46, 0.13, 0.22], at: [0, 1.08, 0.06], rot: [0.14, 0, 0], colour: l.shirt },
    { shape: 'box', size: [0.14, 0.06, 0.05], at: [0, 1.11, 0.17], colour: PAL.paper }, // collar
    // Arms from the shoulder to the hands on the worktop and the switches.
    { shape: 'limb', size: [0.1, 0.3, 0.1], at: [0.25, 0.97, 0.12], rot: [-0.55, 0, 0], colour: l.shirt, anim: ANIM.armR, pivot: sh },
    { shape: 'limb', size: [0.085, 0.085, 0.3], at: [0.24, 0.82, 0.36], colour: l.shirt, anim: ANIM.armR, pivot: sh },
    { shape: 'limb', size: [0.08, 0.05, 0.11], at: [0.23, 0.82, 0.55], colour: l.skin, anim: ANIM.armR, pivot: sh },
    { shape: 'limb', size: [0.1, 0.3, 0.1], at: [-0.25, 0.97, 0.12], rot: [-0.55, 0, 0], colour: l.shirt, anim: ANIM.armL, pivot: shL },
    { shape: 'limb', size: [0.085, 0.085, 0.3], at: [-0.24, 0.8, 0.36], colour: l.shirt, anim: ANIM.armL, pivot: shL },
    { shape: 'limb', size: [0.08, 0.05, 0.11], at: [-0.22, 0.79, 0.54], colour: l.skin, anim: ANIM.armL, pivot: shL },
    ...headParts(1.17, 0.08, l, true, ANIM.head),
  ];
}

/** A standing figure facing +z: a plotter at a wall board or the walking supervisor (legs swing when `walk`). */
export function standingFigure(l: Look, walk: boolean, clipboard: boolean): Part[] {
  const hipL: Vec3 = [-0.1, 0.92, 0];
  const hipR: Vec3 = [0.1, 0.92, 0];
  const legA = walk ? ANIM.legL : ANIM.none;
  const legB = walk ? ANIM.legR : ANIM.none;
  const parts: Part[] = [
    { shape: 'limb', size: [0.15, 0.88, 0.16], at: [-0.1, 0.48, 0], colour: l.legs, anim: legA, pivot: hipL },
    { shape: 'limb', size: [0.15, 0.88, 0.16], at: [0.1, 0.48, 0], colour: l.legs, anim: legB, pivot: hipR },
    { shape: 'limb', size: [0.12, 0.08, 0.28], at: [-0.1, 0.04, 0.05], colour: PAL.graphite, anim: legA, pivot: hipL },
    { shape: 'limb', size: [0.12, 0.08, 0.28], at: [0.1, 0.04, 0.05], colour: PAL.graphite, anim: legB, pivot: hipR },
    { shape: 'limb', size: [0.36, 0.2, 0.24], at: [0, 0.94, 0], colour: l.legs },
    { shape: 'limb', size: [0.4, 0.52, 0.23], at: [0, 1.28, 0], colour: l.shirt },
    { shape: 'limb', size: [0.48, 0.13, 0.23], at: [0, 1.5, 0], colour: l.shirt },
    { shape: 'box', size: [0.14, 0.06, 0.05], at: [0, 1.54, 0.11], colour: PAL.paper },
    // Arms: swinging opposite to the legs when walking; the right holds a clipboard or reaches for the board.
    { shape: 'limb', size: [0.1, 0.62, 0.11], at: [-0.27, 1.22, 0], colour: l.shirt, anim: walk ? ANIM.legR : ANIM.armL, pivot: [-0.27, 1.5, 0] },
    { shape: 'limb', size: [0.08, 0.1, 0.09], at: [-0.27, 0.86, 0], colour: l.skin, anim: walk ? ANIM.legR : ANIM.armL, pivot: [-0.27, 1.5, 0] },
  ];
  if (clipboard) {
    parts.push(
      { shape: 'limb', size: [0.1, 0.34, 0.11], at: [0.27, 1.34, 0.08], rot: [-0.5, 0, 0], colour: l.shirt },
      { shape: 'limb', size: [0.09, 0.09, 0.28], at: [0.26, 1.2, 0.28], colour: l.shirt },
      { shape: 'box', size: [0.26, 0.015, 0.34], at: [0.18, 1.2, 0.36], rot: [0.5, 0, 0], colour: PAL.graphiteSoft },
      { shape: 'box', size: [0.22, 0.005, 0.28], at: [0.18, 1.21, 0.36], rot: [0.5, 0, 0], colour: PAL.paper },
    );
  } else {
    // Reaching up to the board with a grease pencil.
    const sh: Vec3 = [0.27, 1.5, 0];
    parts.push(
      { shape: 'limb', size: [0.1, 0.62, 0.11], at: [0.3, 1.78, 0.12], rot: [-0.45, 0, 0.15], colour: l.shirt, anim: ANIM.armR, pivot: sh },
      { shape: 'limb', size: [0.08, 0.1, 0.09], at: [0.34, 2.06, 0.25], colour: l.skin, anim: ANIM.armR, pivot: sh },
    );
  }
  parts.push(...headParts(1.58, 0.0, l, false, walk ? ANIM.head : ANIM.headWall));
  return parts;
}

/** One operator's desk, with its scope, lamp row, dials and toggles on a sloping panel; metres, station frame. */
function deskParts(n: number): { body: Part[]; chrome: Part[]; glow: Part[] } {
  const body: Part[] = [
    { shape: 'box', size: [1.5, 0.66, 0.66], at: [0, 0.4, 0.9], colour: PAL.enamel },
    { shape: 'box', size: [1.52, 0.1, 0.62], at: [0, 0.05, 0.9], colour: PAL.graphite },
    { shape: 'box', size: [1.5, 0.08, 0.02], at: [0, 0.56, 0.565], colour: PAL.teal },
    { shape: 'box', size: [1.62, 0.04, 0.82], at: [0, 0.75, 0.85], colour: PAL.tealDeep },
    // Telephone, slips and a mug on the worktop.
    { shape: 'box', size: [0.2, 0.07, 0.16], at: [-0.6, 0.8, 0.72], colour: PAL.graphite },
    { shape: 'box', size: [0.22, 0.04, 0.05], at: [-0.6, 0.86, 0.72], colour: PAL.graphite },
    { shape: 'box', size: [0.16, 0.006, 0.21], at: [0.55, 0.774, 0.66], rot: [0, 0.2 * (rnd(n) - 0.5), 0], colour: PAL.paper },
    { shape: 'box', size: [0.16, 0.006, 0.21], at: [0.6, 0.78, 0.7], rot: [0, 0.5 * (rnd(n + 1) - 0.5), 0], colour: '#f4e9c8' },
    { shape: 'cyl', size: [0.08, 0.1, 0.08], at: [-0.35, 0.82, 0.62], colour: rnd(n + 2) < 0.5 ? PAL.coral : PAL.enamel },
    // Chair: seat and back in teal vinyl.
    { shape: 'box', size: [0.46, 0.08, 0.44], at: [0, 0.43, -0.02], colour: PAL.teal },
    { shape: 'box', size: [0.42, 0.42, 0.07], at: [0, 0.78, -0.27], rot: [-0.12, 0, 0], colour: PAL.teal },
  ];
  const chrome: Part[] = [
    { shape: 'cyl', size: [0.06, 0.36, 0.06], at: [0, 0.22, -0.02], colour: PAL.chrome },
    { shape: 'cyl', size: [0.52, 0.04, 0.52], at: [0, 0.03, -0.02], colour: PAL.chromeDark, seg: 5 },
    { shape: 'box', size: [0.04, 0.36, 0.03], at: [0, 0.6, -0.26], colour: PAL.chrome },
  ];
  const glow: Part[] = [];
  // The sloping panel: a frame tipped back from the desk's rear edge.
  const tilt = -0.42;
  const pm = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.1, 1.17), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  const on = (x: number, y: number, z: number): Vec3 => {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(pm);
    return [v.x, v.y, v.z];
  };
  body.push({ shape: 'box', size: [1.5, 0.72, 0.08], at: on(0, 0, 0), rot: [tilt, 0, 0], colour: PAL.enamel });
  body.push({ shape: 'box', size: [1.5, 0.3, 0.7], at: [0, 0.92, 1.25], colour: PAL.enamelDeep });
  chrome.push({ shape: 'box', size: [1.56, 0.04, 0.1], at: on(0, 0.37, 0), rot: [tilt, 0, 0], colour: PAL.chrome });
  // The scope: a dark bezel and its phosphor face.
  chrome.push({ shape: 'cyl', size: [0.52, 0.06, 0.52], at: on(-0.36, 0.02, 0.05), rot: [tilt + Math.PI / 2, 0, 0], colour: PAL.graphite, seg: 24 });
  glow.push({ shape: 'disc', size: [0.44, 0.44, 0], at: on(-0.36, 0.02, 0.081), rot: [tilt, 0, 0], colour: '#3fae63', glow: GLOW.scope, seg: 32 });
  // A lamp row, two dials and six toggles.
  const lampCols = ['#3fae63', '#3fae63', '#d9a62e', '#3fae63', '#c8322a', '#3fae63', '#d9a62e', '#3fae63'];
  for (let k = 0; k < 8; k++) glow.push({ shape: 'box', size: [0.045, 0.045, 0.02], at: on(0.02 + k * 0.08, 0.24, 0.05), rot: [tilt, 0, 0], colour: lampCols[(k + n) % lampCols.length]!, glow: GLOW.blink });
  for (const dx of [0.12, 0.45]) {
    chrome.push({ shape: 'cyl', size: [0.2, 0.03, 0.2], at: on(dx, 0.0, 0.05), rot: [tilt + Math.PI / 2, 0, 0], colour: PAL.chromeDark, seg: 16 });
    body.push({ shape: 'disc', size: [0.17, 0.17, 0], at: on(dx, 0.0, 0.067), rot: [tilt, 0, 0], colour: PAL.paper, seg: 16 });
    body.push({ shape: 'box', size: [0.008, 0.07, 0.004], at: on(dx + 0.01, 0.02, 0.07), rot: [tilt, 0, -0.6 + rnd(n + dx) * 1.2], colour: PAL.coral });
  }
  for (let k = 0; k < 6; k++) chrome.push({ shape: 'cyl', size: [0.025, 0.07, 0.025], at: on(0.02 + k * 0.1, -0.22, 0.07), rot: [tilt + Math.PI / 2 + (rnd(n + k) < 0.5 ? 0.5 : -0.5), 0, 0], colour: PAL.chrome, seg: 6 });
  body.push({ shape: 'box', size: [0.5, 0.08, 0.01], at: on(-0.36, -0.29, 0.045), rot: [tilt, 0, 0], colour: PAL.tealDeep }); // label plate
  return { body, chrome, glow };
}

export interface Station {
  /** Floor position of the operator (or the plotter), for the camera-side fade. */
  x: number;
  z: number;
  /** How far above the board's street the station's top stands, in units. */
  top: number;
}

export interface RoomGeometry {
  shell: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  staff: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  floor: THREE.BufferGeometry;
  /** The walking supervisor, drawn apart so its frame can move round the ring. */
  walker: THREE.BufferGeometry;
  stations: Station[];
  /** The walker's ring radius round the board's centre. */
  walkRadius: number;
  centre: { x: number; z: number };
  /** Our console's outer half extents round the centre. */
  deck: { hx: number; hz: number };
}

/**
 * Builds the room for a board `width` x `depth` tiles (the map's footprint, x east and z south from the origin).
 * The hall is centred on the board; the stations ring it at a radius that clears our console's corners.
 */
export function buildRoom(width: number, depth: number): RoomGeometry {
  const cx = width / 2;
  const cz = depth / 2;
  const shell = new RoomMerge(false);
  const chrome = new RoomMerge(false);
  const staff = new RoomMerge(false);
  const glow = new RoomMerge(true);
  const I = new THREE.Matrix4();
  const outer = DECK.gutter + DECK.bead + DECK.width;
  const hx = width / 2 + outer;
  const hz = depth / 2 + outer;
  const stations: Station[] = [];

  // ---- Our console: the body under the board, the gutter, the chrome bead, the deck and its instruments.
  const bodyTop = -0.25;
  const bodyH = bodyTop - FLOOR_Y;
  shell.add({ shape: 'box', size: [2 * hx - 0.6, bodyH, 2 * hz - 0.6], at: [cx, FLOOR_Y + bodyH / 2, cz], colour: '#1f3436' }, I, -1, 0);
  // The deck strips (north, south, west, east), enamel tops on the console's frame.
  const dIn = DECK.gutter + DECK.bead;
  const deckH = DECK.top - bodyTop;
  const strips: [number, number, number, number][] = [
    [cx, -dIn - DECK.width / 2, 2 * hx, DECK.width],
    [cx, depth + dIn + DECK.width / 2, 2 * hx, DECK.width],
    [-dIn - DECK.width / 2, cz, DECK.width, depth + 2 * dIn],
    [width + dIn + DECK.width / 2, cz, DECK.width, depth + 2 * dIn],
  ];
  for (const [x, z, sx, sz] of strips) shell.add({ shape: 'box', size: [sx, deckH, sz], at: [x, bodyTop + deckH / 2, z], colour: PAL.enamel }, I, -1, 0);
  // The console's sides down to the floor: enamel panels with a teal band, a graphite kick plate, screw heads.
  const sideH = DECK.top - FLOOR_Y;
  const faces: { x: number; z: number; len: number; yaw: number }[] = [
    { x: cx, z: cz - hz, len: 2 * hx, yaw: Math.PI },
    { x: cx, z: cz + hz, len: 2 * hx, yaw: 0 },
    { x: cx - hx, z: cz, len: 2 * hz, yaw: -Math.PI / 2 },
    { x: cx + hx, z: cz, len: 2 * hz, yaw: Math.PI / 2 },
  ];
  for (const f of faces) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(f.x, 0, f.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.yaw, 0)), new THREE.Vector3(1, 1, 1));
    // The face's own frame: x along the face, +z out of the console.
    shell.add({ shape: 'box', size: [f.len, sideH, 0.3], at: [0, FLOOR_Y + sideH / 2, -0.15], colour: PAL.enamelDeep }, m, -1, 0);
    shell.add({ shape: 'box', size: [f.len + 0.02, 0.6, 0.1], at: [0, FLOOR_Y + 0.3, 0.02], colour: PAL.graphite }, m, -1, 0);
    shell.add({ shape: 'box', size: [f.len + 0.02, 0.45, 0.08], at: [0, -1.05, 0.02], colour: PAL.teal }, m, -1, 0);
    chrome.add({ shape: 'hcyl', size: [f.len + 0.4, 0.4, 0.4], at: [0, DECK.top, 0.0], colour: PAL.chrome, seg: 10 }, m, -1, 0);
    const panels = Math.max(2, Math.round(f.len / 6.5));
    const pw = f.len / panels;
    for (let k = 0; k < panels; k++) {
      const u = -f.len / 2 + pw * (k + 0.5);
      shell.add({ shape: 'box', size: [pw - 0.5, 3.6, 0.08], at: [u, FLOOR_Y + 2.7, 0.03], colour: PAL.enamel }, m, -1, 0);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        chrome.add({ shape: 'cyl', size: [0.16, 0.05, 0.16], at: [u + sx * (pw / 2 - 0.5), FLOOR_Y + 2.7 + sy * 1.55, 0.08], rot: [Math.PI / 2, 0, 0], colour: PAL.chromeDark, seg: 8 }, m, -1, 0);
      chrome.add({ shape: 'box', size: [0.12, sideH - 1.0, 0.06], at: [u + pw / 2, FLOOR_Y + sideH / 2 - 0.2, 0.04], colour: PAL.chromeDark }, m, -1, 0);
    }
  }
  // The chrome bead round the board's edge and the dark gutter between it and the street.
  const bead = (x: number, z: number, sx: number, sz: number) => chrome.add({ shape: 'box', size: [sx, 0.75, sz], at: [x, -0.05, z], colour: PAL.chrome }, I, -1, 0);
  const bIn = DECK.gutter + DECK.bead / 2;
  bead(cx, -bIn, width + 2 * dIn, DECK.bead);
  bead(cx, depth + bIn, width + 2 * dIn, DECK.bead);
  bead(-bIn, cz, DECK.bead, depth + 2 * dIn);
  bead(width + bIn, cz, DECK.bead, depth + 2 * dIn);
  // Instruments along each deck strip: a lamp row, a toggle row, dials and label plates.
  const lampCols = [PAL.green, PAL.green, PAL.mustard, PAL.green, PAL.red, PAL.green];
  let seed = 0;
  const along = (x0: number, z0: number, dx: number, dz: number, len: number, nx: number, nz: number) => {
    // (x0, z0) is the strip's inner edge start, (dx, dz) its direction, (nx, nz) the outward normal.
    const at = (u: number, d: number, y: number): Vec3 => [x0 + dx * u + nx * d, y, z0 + dz * u + nz * d];
    const yaw = Math.atan2(nx, nz);
    for (let u = 1.2; u < len - 1.0; u += 1.15) {
      seed++;
      glow.add({ shape: 'sphere', size: [0.42, 0.24, 0.42], at: at(u, 1.3, DECK.top + 0.02), colour: lampCols[seed % lampCols.length]!, glow: GLOW.blink }, I, -1, rnd(seed) * 40);
      chrome.add({ shape: 'cyl', size: [0.4, 0.08, 0.4], at: at(u, 2.5, DECK.top + 0.04), colour: PAL.chromeDark, seg: 8 }, I, -1, 0);
      chrome.add({ shape: 'cyl', size: [0.09, 0.5, 0.09], at: at(u, 2.5, DECK.top + 0.25), rot: [rnd(seed + 9) < 0.5 ? 0.45 : -0.45, yaw, 0], colour: PAL.chrome, seg: 6 }, I, -1, 0);
    }
    for (let u = 3.2; u < len - 2.5; u += 6.4) {
      seed++;
      chrome.add({ shape: 'cyl', size: [1.6, 0.18, 1.6], at: at(u, 4.4, DECK.top + 0.09), colour: PAL.chrome, seg: 20 }, I, -1, 0);
      shell.add({ shape: 'cyl', size: [1.36, 0.2, 1.36], at: at(u, 4.4, DECK.top + 0.1), colour: PAL.paper, seg: 20 }, I, -1, 0);
      shell.add({ shape: 'box', size: [0.08, 0.06, 0.6], at: at(u, 4.4, DECK.top + 0.22), rot: [0, rnd(seed) * 6.28, 0], colour: PAL.coral }, I, -1, 0);
      shell.add({ shape: 'box', size: [2.2, 0.06, 0.6], at: at(u + 3.2, 5.9, DECK.top + 0.03), rot: [0, yaw, 0], colour: PAL.tealDeep }, I, -1, 0);
      shell.add({ shape: 'box', size: [1.7, 0.07, 0.14], at: at(u + 3.2, 5.9, DECK.top + 0.04), rot: [0, yaw, 0], colour: PAL.enamelEdge }, I, -1, 0);
    }
  };
  const sIn = dIn + DECK.bead / 2;
  along(-sIn, -sIn, 1, 0, width + 2 * sIn, 0, -1);
  along(-sIn, depth + sIn, 1, 0, width + 2 * sIn, 0, 1);
  along(-sIn, -sIn, 0, 1, depth + 2 * sIn, -1, 0);
  along(width + sIn, -sIn, 0, 1, depth + 2 * sIn, 1, 0);

  // ---- The operators' consoles: two rings of desk pairs facing out to the walls.
  const corner = Math.hypot(hx, hz);
  const rings = [
    { r: corner + 13, banks: 6, offset: 0.25 },
    { r: corner + 36, banks: 9, offset: 0 },
  ];
  let opn = 0;
  for (const ring of rings) {
    for (let b = 0; b < ring.banks; b++) {
      const a = ((b + ring.offset) / ring.banks) * Math.PI * 2;
      const dirx = Math.sin(a);
      const dirz = Math.cos(a);
      for (const side of [-1, 1]) {
        opn++;
        // Two desks side by side, 1.7 m apart, both facing out.
        const off = side * 0.85 * ROOM_SCALE;
        const x = cx + dirx * ring.r + dirz * off;
        const z = cz + dirz * ring.r - dirx * off;
        const m = stationFrame(x, z, a);
        const st = stations.length;
        if (st >= MAX_STATIONS) break;
        stations.push({ x, z, top: FLOOR_Y + 1.45 * ROOM_SCALE });
        const d = deskParts(opn);
        const phase = rnd(opn * 3.1) * 50;
        for (const p of d.body) staff.add(p, m, st, phase);
        for (const p of d.chrome) chrome.add(p, m, st, phase);
        for (const p of d.glow) glow.add(p, m, st, phase);
        for (const p of seatedOperator(lookOf(opn * 7))) staff.add(p, m, st, phase);
      }
    }
  }

  // ---- The hall: a sixteen-sided room of teal dado and cream enamel, wall boards with lamps, ceiling lights.
  const R = HALL.radius;
  const sides = HALL.sides;
  const segLen = 2 * R * Math.sin(Math.PI / sides) + 0.2;
  const apothem = R * Math.cos(Math.PI / sides);
  for (let k = 0; k < sides; k++) {
    const a = ((k + 0.5) / sides) * Math.PI * 2;
    // The wall's frame: origin on the floor at the middle of the segment, +z facing into the room.
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.sin(a) * apothem, FLOOR_Y, cz + Math.cos(a) * apothem), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI, 0)), new THREE.Vector3(1, 1, 1));
    const H = HALL.height;
    shell.add({ shape: 'plane', size: [segLen, 7.5, 0], at: [0, 3.75, 0], colour: PAL.teal }, m, -1, 0);
    shell.add({ shape: 'plane', size: [segLen, H - 9.5, 0], at: [0, 7.5 + (H - 9.5) / 2, 0], colour: PAL.wallUpper }, m, -1, 0);
    shell.add({ shape: 'plane', size: [segLen, 2, 0], at: [0, H - 1, 0], colour: PAL.tealDeep }, m, -1, 0);
    shell.add({ shape: 'plane', size: [segLen, 0.7, 0], at: [0, 0.35, 0.05], colour: PAL.graphite }, m, -1, 0);
    chrome.add({ shape: 'plane', size: [segLen, 0.35, 0], at: [0, 7.6, 0.06], colour: PAL.chrome }, m, -1, 0);
    // Dado panels with a darker frame line.
    for (let p = -1; p <= 1; p++) shell.add({ shape: 'plane', size: [segLen / 3 - 1.4, 5, 0], at: [(p * segLen) / 3, 3.9, 0.04], colour: PAL.tealDeep }, m, -1, 0);
    // Pilaster between segments.
    shell.add({ shape: 'plane', size: [1.6, H, 0], at: [segLen / 2 - 0.8, H / 2, 0.1], colour: PAL.enamelEdge }, m, -1, 0);
    // Wall boards: a city map of streets and alert lamps, tote boards of lamp columns, or a clock.
    const kind = k % 4;
    const by = 18;
    if (kind === 0 || kind === 2) {
      const bw = segLen - 8;
      const bh = 16;
      chrome.add({ shape: 'plane', size: [bw + 1.2, bh + 1.2, 0], at: [0, by, 0.12], colour: PAL.chromeDark }, m, -1, 0);
      shell.add({ shape: 'plane', size: [bw, bh, 0], at: [0, by, 0.18], colour: PAL.board }, m, -1, 0);
      if (kind === 0) {
        // The city map: a street grid in cream lines, district lamps, a few alerts.
        for (let gx = -3; gx <= 3; gx++) shell.add({ shape: 'plane', size: [0.18, bh - 1.5, 0], at: [(gx * bw) / 7.5 + Math.sin(gx * 1.7) * 0.6, by, 0.22], colour: '#8fb2a8' }, m, -1, 0);
        for (let gy = -2; gy <= 2; gy++) shell.add({ shape: 'plane', size: [bw - 1.5, 0.18, 0], at: [0, by + (gy * bh) / 5.2, 0.22], colour: '#8fb2a8' }, m, -1, 0);
        shell.add({ shape: 'plane', size: [bw * 0.7, 0.35, 0], at: [-1, by - 2.5, 0.24], rot: [0, 0, 0.35], colour: '#b8a77a' }, m, -1, 0); // the river road
        for (let q = 0; q < 26; q++) {
          const u = (rnd(k * 50 + q) - 0.5) * (bw - 2);
          const v = (rnd(k * 50 + q + 0.5) - 0.5) * (bh - 2);
          const alert = rnd(k * 50 + q + 0.25) < 0.2;
          glow.add({ shape: 'plane', size: [0.7, 0.7, 0], at: [u, by + v, 0.28], colour: alert ? PAL.coral : PAL.mustard, glow: alert ? GLOW.alert : GLOW.blink }, m, -1, rnd(q + k) * 30);
        }
      } else {
        // Tote board: columns of lamps under enamel headers.
        const cols = 8;
        for (let c = 0; c < cols; c++) {
          const u = -bw / 2 + (bw / cols) * (c + 0.5);
          shell.add({ shape: 'plane', size: [bw / cols - 0.8, 1.6, 0], at: [u, by + bh / 2 - 1.4, 0.22], colour: PAL.enamel }, m, -1, 0);
          for (let r = 0; r < 6; r++) {
            const on = rnd(k * 100 + c * 7 + r) < 0.55;
            glow.add({ shape: 'plane', size: [1.0, 1.0, 0], at: [u, by + bh / 2 - 3.6 - r * 1.9, 0.26], colour: on ? (r === 0 && c % 3 === 0 ? PAL.coral : PAL.green) : '#3b4a46', glow: on ? GLOW.blink : GLOW.steady }, m, -1, rnd(c * 13 + r + k) * 60);
          }
        }
      }
      // A plotter or two at the board with a grease pencil, facing it (their backs to the room).
      for (const u of kind === 0 ? [-bw / 4, bw / 5] : [bw / 6]) {
        opn++;
        const pm = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().compose(new THREE.Vector3(u, 0, 4.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(ROOM_SCALE, ROOM_SCALE, ROOM_SCALE)));
        const st = stations.length;
        if (st >= MAX_STATIONS) continue;
        const wp = new THREE.Vector3(0, 0, 0).applyMatrix4(pm);
        stations.push({ x: wp.x, z: wp.z, top: FLOOR_Y + 2.1 * ROOM_SCALE });
        for (const p of standingFigure(lookOf(opn * 11), false, false)) staff.add(p, pm, st, rnd(opn) * 40);
      }
    } else if (kind === 1) {
      // A clock: enamel face, chrome rim, two hands.
      chrome.add({ shape: 'disc', size: [9.2, 9.2, 0], at: [0, by, 0.12], colour: PAL.chrome, seg: 40 }, m, -1, 0);
      shell.add({ shape: 'disc', size: [8.4, 8.4, 0], at: [0, by, 0.18], colour: PAL.paper, seg: 40 }, m, -1, 0);
      for (let h = 0; h < 12; h++) {
        const t = (h / 12) * Math.PI * 2;
        shell.add({ shape: 'plane', size: [0.3, h % 3 ? 0.6 : 1.1, 0], at: [Math.sin(t) * 3.6, by + Math.cos(t) * 3.6, 0.22], rot: [0, 0, -t], colour: PAL.graphite }, m, -1, 0);
      }
      const hr = 0.8 + k * 0.7;
      shell.add({ shape: 'plane', size: [0.35, 2.4, 0], at: [Math.sin(hr) * 1.1, by + Math.cos(hr) * 1.1, 0.25], rot: [0, 0, -hr], colour: PAL.graphite }, m, -1, 0);
      shell.add({ shape: 'plane', size: [0.22, 3.4, 0], at: [Math.sin(hr * 5) * 1.6, by + Math.cos(hr * 5) * 1.6, 0.26], rot: [0, 0, -hr * 5], colour: PAL.graphite }, m, -1, 0);
      shell.add({ shape: 'plane', size: [0.09, 3.4, 0], at: [0, by - 1.6, 0.27], colour: PAL.coral }, m, -1, 0);
    }
  }
  // Ceiling and its light panels.
  const ceilY = FLOOR_Y + HALL.height;
  shell.add({ shape: 'disc', size: [2 * R + 8, 2 * R + 8, 0], at: [cx, ceilY, cz], rot: [Math.PI / 2, 0, 0], colour: PAL.ceiling, seg: sides }, I, -1, 0);
  for (const [radius, count, len] of [
    [corner + 3, 12, 9],
    [corner + 25, 16, 14],
    [corner + 50, 20, 14],
  ] as const) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      glow.add({ shape: 'plane', size: [len, 2.2, 0], at: [cx + Math.sin(a) * radius, ceilY - 0.1, cz + Math.cos(a) * radius], rot: [Math.PI / 2, 0, -a], colour: '#fff4d8', glow: GLOW.panel }, I, -1, 0);
    }
  }

  // ---- The floor: one disc under the whole hall (its terrazzo and inlay rings are drawn in ConsoleRoom.tsx).
  const floor = new THREE.CircleGeometry(R + 4, sides * 2);
  floor.rotateX(-Math.PI / 2);
  floor.translate(cx, FLOOR_Y, cz);
  floor.deleteAttribute('uv');

  // ---- The walking supervisor with a clipboard, drawn in its own frame (metres, facing +z).
  const walkerMerge = new RoomMerge(false);
  const wm = new THREE.Matrix4().makeScale(ROOM_SCALE, ROOM_SCALE, ROOM_SCALE);
  wm.premultiply(new THREE.Matrix4().makeTranslation(0, FLOOR_Y, 0));
  for (const p of standingFigure(lookOf(991), true, true)) walkerMerge.add(p, wm, MAX_STATIONS - 1, 0);

  return {
    shell: shell.build(),
    chrome: chrome.build(),
    staff: staff.build(),
    glow: glow.build(),
    floor,
    walker: walkerMerge.build(),
    stations,
    walkRadius: corner + 25,
    centre: { x: cx, z: cz },
    deck: { hx, hz },
  };
}

/**
 * How much of a station to draw (1 whole, 0 gone) for a camera at (camX, camY, camZ) looking at (tx, tz): a station
 * fades when it stands between the camera and the board and rises above the line of sight to the board's near edge.
 */
export function stationFade(st: Station, camX: number, camY: number, camZ: number, tx: number, tz: number, deck: { cx: number; cz: number; hx: number; hz: number }): number {
  const vx = camX - tx;
  const vz = camZ - tz;
  const camD = Math.hypot(vx, vz);
  if (camD < 1) return 1;
  const sx = st.x - tx;
  const sz = st.z - tz;
  const sD = Math.hypot(sx, sz);
  if (sD < 1e-3 || sD > camD + 2) return 1; // beside or behind the camera
  const cosA = (sx * vx + sz * vz) / (sD * camD);
  const ang = smooth(0.35, 0.8, cosA);
  if (ang <= 0) return 1;
  // Distance from the target to our console's outer edge, along the way to the station.
  const ux = sx / sD;
  const uz = sz / sD;
  const ex = ux > 0 ? (deck.cx + deck.hx - tx) / ux : ux < 0 ? (deck.cx - deck.hx - tx) / ux : Infinity;
  const ez = uz > 0 ? (deck.cz + deck.hz - tz) / uz : uz < 0 ? (deck.cz - deck.hz - tz) / uz : Infinity;
  const e = Math.max(0, Math.min(ex, ez));
  if (sD <= e) return 1;
  // Height of the sight line from the camera to the console's edge, where it passes over the station.
  const lineY = ((sD - e) / Math.max(0.5, camD - e)) * camY;
  const occ = smooth(st.top + 4, st.top + 0.5, lineY);
  return 1 - ang * occ;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
