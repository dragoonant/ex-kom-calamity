// Effects from engine events (PLAN.md D21 e-f, bold stylised; docs/art/effects.md): muzzle flashes with a light
// pulse and glowing tracers, sparks and puffs where rounds strike, explosions with a fireball, a shockwave ring, a
// smoke column that lingers, a flash that lights the walls, a scorch mark and a camera jolt, breaking walls that
// throw chunks of their own material which tumble and settle, dust plumes, and small fires that burn on for a few
// seconds. Everything comes from the store's fx queue (fx.ts), so a hidden shooter makes no flash (VIEW-2). Six
// draws carry every effect (chunks, tracers, scorches, glow billboards, smoke billboards, rings live in the glow
// batch), plus four pooled point lights that always exist so no shader recompiles mid-battle. Nothing has a handler
// or a raycast (KB rule 25). Pause freezes the effects with the world.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WEAPONS } from '../../data';
import { useClient } from '../store';
import type { Fx } from '../fx';
import { Billboards, FLAME, PUFF, RING, SPARK, fireColour, rng, type Shape } from './fxkit';
import { FIGURE_H, LEVEL_H, kickShake, live, rig, shake, tileToWorld } from './world';
import { STYLE_PALETTE } from './tileset';

const NO_RAYCAST = () => undefined;
const MAX_CHUNKS = 520;
const MAX_GLOW = 420;
const MAX_SMOKE = 380;
const MAX_TRACERS = 48;
const MAX_SCORCH = 48;
const MAX_EMITTERS = 24;
const LIGHTS = 4;
const GRAVITY = 9.5;

/** A billboard particle: fire, a flash, a spark, a ring (glow batch) or smoke and dust (smoke batch). */
interface Mote {
  alive: boolean;
  glow: boolean;
  shape: Shape;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Size at birth and its growth per second of life (a ring grows fast, smoke slowly). */
  size: number;
  grow: number;
  spin: number;
  spinV: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  /** Fire: colour follows the fire ramp over life instead of r, g, b. */
  fire: boolean;
  gravity: number;
  drag: number;
}

/** A chunk of a wall, a floor or a charge's casing: a box that tumbles, bounces once, settles, then sinks away. */
interface Chunk {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  floorY: number;
  age: number;
  life: number;
  bounced: boolean;
  r: number;
  g: number;
  b: number;
}

interface Tracer {
  alive: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  width: number;
}

interface Flash {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  peak: number;
  dist: number;
  age: number;
  life: number;
  colour: THREE.Color;
}

/** Keeps spawning fire, smoke or dust at a place for a while: the lingering part of a blast or a breach. */
interface Emitter {
  alive: boolean;
  kind: 'fire' | 'smoke' | 'dust';
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  every: number;
  next: number;
  r: number;
  g: number;
  b: number;
  seed: number;
}

interface Scorch {
  x: number;
  y: number;
  z: number;
  size: number;
  yaw: number;
}

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const C = new THREE.Color();
const C2 = new THREE.Color();
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const UP = new THREE.Vector3(0, 0, 1);

function materialColour(material: string | undefined, out: THREE.Color): THREE.Color {
  switch (material) {
    case 'brick':
      return out.set(STYLE_PALETTE.residential.wall);
    case 'plaster':
      return out.set('#e6dcc6');
    case 'steel':
      return out.set('#7d8a94');
    case 'glass':
      return out.set('#cfe8ee');
    case 'timber':
      return out.set('#7a5232');
    case 'concrete':
      return out.set('#9a9a94');
    default:
      return out.set('#8a7f73');
  }
}

function pool<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}

/** The free slot of a pool, or the one furthest through its life. */
function slot<T extends { alive: boolean; age: number; life: number }>(list: T[]): T {
  let best = list[0]!;
  for (const p of list) {
    if (!p.alive) return p;
    if (p.age / p.life > best.age / best.life) best = p;
  }
  return best;
}

export function Effects() {
  const chunkRef = useRef<THREE.InstancedMesh>(null);
  const tracerRef = useRef<THREE.InstancedMesh>(null);
  const scorchRef = useRef<THREE.InstancedMesh>(null);
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const lastFx = useRef<number | null>(null);

  const glow = useMemo(() => new Billboards(MAX_GLOW, true), []);
  const smoke = useMemo(() => new Billboards(MAX_SMOKE, false), []);
  const motes = useMemo(() => pool<Mote>(MAX_GLOW + MAX_SMOKE, () => ({ alive: false, glow: true, shape: PUFF, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, spin: 0, spinV: 0, age: 0, life: 1, r: 1, g: 1, b: 1, alpha: 1, fire: false, gravity: 0, drag: 0 })), []);
  const chunks = useMemo(() => pool<Chunk>(MAX_CHUNKS, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0.1, sy: 0.1, sz: 0.1, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, floorY: 0, age: 0, life: 1, bounced: false, r: 1, g: 1, b: 1 })), []);
  const tracers = useMemo(() => pool<Tracer>(MAX_TRACERS, () => ({ alive: false, from: new THREE.Vector3(), to: new THREE.Vector3(), age: 0, life: 0.1, r: 1, g: 1, b: 1, width: 0.05 })), []);
  const flashes = useMemo(() => pool<Flash>(LIGHTS, () => ({ alive: false, x: 0, y: 0, z: 0, peak: 0, dist: 4, age: 0, life: 0.1, colour: new THREE.Color() })), []);
  const emitters = useMemo(() => pool<Emitter>(MAX_EMITTERS, () => ({ alive: false, kind: 'smoke' as const, x: 0, y: 0, z: 0, age: 0, life: 1, every: 0.1, next: 0, r: 1, g: 1, b: 1, seed: 1 })), []);
  const scorches = useRef<Scorch[]>([]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const chunkMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 }), []);
  const tracerMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const scorchGeo = useMemo(() => new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), []);
  const scorchMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1b1b1f', transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), []);

  useEffect(() => {
    smoke.mesh.raycast = NO_RAYCAST;
    glow.mesh.raycast = NO_RAYCAST;
  }, [glow, smoke]);

  const mote = (init: Partial<Mote> & { glow: boolean }): void => {
    const list = motes;
    let m: Mote | null = null;
    // Glow and smoke share one pool; prefer a free slot, else recycle the oldest of the same batch.
    let oldest: Mote | null = null;
    for (const p of list) {
      if (!p.alive) {
        m = p;
        break;
      }
      if (p.glow === init.glow && (!oldest || p.age / p.life > oldest.age / oldest.life)) oldest = p;
    }
    m ??= oldest ?? list[0]!;
    Object.assign(m, { alive: true, age: 0, vx: 0, vy: 0, vz: 0, grow: 0, spin: 0, spinV: 0, alpha: 1, fire: false, gravity: 0, drag: 0, shape: PUFF, r: 1, g: 1, b: 1 }, init);
  };

  const chunk = (init: Partial<Chunk>): void => {
    const c = slot(chunks);
    Object.assign(c, { alive: true, age: 0, bounced: false, wx: 0, wy: 0, wz: 0, rx: 0, ry: 0, rz: 0 }, init);
  };

  const flash = (x: number, y: number, z: number, peak: number, dist: number, life: number, colour: string): void => {
    const f = slot(flashes);
    Object.assign(f, { alive: true, x, y, z, peak, dist, age: 0, life });
    f.colour.set(colour);
  };

  const emit = (init: Partial<Emitter> & { kind: Emitter['kind'] }): void => {
    const e = slot(emitters);
    Object.assign(e, { alive: true, age: 0, next: 0, r: 0.5, g: 0.5, b: 0.5 }, init);
  };

  /** Shakes harder for an event near the middle of the view. */
  const jolt = (at: THREE.Vector3, amount: number): void => {
    const d = Math.hypot(at.x - rig.target.x, at.z - rig.target.z);
    kickShake(amount * Math.max(0.25, 1 - d / 20));
  };

  /** Bright sparks flying off a point. */
  const sparks = (r: () => number, x: number, y: number, z: number, n: number, speed: number, hot: [number, number, number]): void => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const up = r();
      const v = speed * (0.4 + r() * 0.8);
      mote({ glow: true, shape: SPARK, x, y, z, vx: Math.cos(a) * v * (1 - up * 0.5), vy: up * v + 0.5, vz: Math.sin(a) * v * (1 - up * 0.5), size: 0.07 + r() * 0.06, life: 0.25 + r() * 0.35, gravity: 1, drag: 1.5, r: hot[0], g: hot[1], b: hot[2] });
    }
  };

  /** Smoke or dust puffs that rise, spread and fade. */
  const puffs = (r: () => number, x: number, y: number, z: number, n: number, spread: number, size: number, life: number, col: THREE.Color, alpha: number, rise: number): void => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * spread;
      mote({ glow: false, shape: PUFF, x: x + Math.cos(a) * d, y: y + r() * 0.3, z: z + Math.sin(a) * d, vx: Math.cos(a) * (0.3 + r() * 0.6), vy: rise * (0.5 + r()), vz: Math.sin(a) * (0.3 + r() * 0.6), size: size * (0.7 + r() * 0.6), grow: size * (0.5 + r() * 0.8), spin: r() * 6, spinV: (r() - 0.5) * 1.2, life: life * (0.7 + r() * 0.6), drag: 1.2, alpha, r: col.r, g: col.g, b: col.b });
    }
  };

  /** Chunks of a material thrown from a point. */
  const debris = (r: () => number, x: number, y: number, z: number, n: number, speed: number, up: number, size: number, col: THREE.Color, floorY: number, life: number): void => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const v = speed * (0.3 + r() * 0.9);
      const k = 0.75 + r() * 0.45;
      const s = size * (0.5 + r());
      chunk({ x: x + (r() - 0.5) * 0.6, y: y + r() * 0.8, z: z + (r() - 0.5) * 0.6, vx: Math.cos(a) * v, vy: up * (0.4 + r()), vz: Math.sin(a) * v, sx: s, sy: s * (0.5 + r() * 0.6), sz: s * (0.6 + r() * 0.6), rx: r() * 6, ry: r() * 6, rz: r() * 6, wx: (r() - 0.5) * 16, wy: (r() - 0.5) * 10, wz: (r() - 0.5) * 16, floorY, life: life * (0.8 + r() * 0.4), r: col.r * k, g: col.g * k, b: col.b * k });
    }
  };

  const take = (f: Fx): void => {
    const r = rng(f.id);
    const at = tileToWorld(f.at, A);
    const floorY = f.at.level * LEVEL_H;
    switch (f.kind) {
      case 'muzzle': {
        const w = f.weapon ? WEAPONS[f.weapon] : undefined;
        const melee = w?.kind === 'melee';
        const from = B.set(at.x, at.y + FIGURE_H * 0.62, at.z);
        if (melee) {
          // A slash: a pale green-white arc of glow at the striker's reach.
          mote({ glow: true, shape: RING, x: from.x, y: from.y, z: from.z, size: 0.5, grow: 2.2, life: 0.18, r: 0.7, g: 1, b: 0.8, alpha: 0.9 });
          break;
        }
        const warm = f.side === 'agency';
        const [cr, cg, cb] = warm ? [1, 0.85, 0.45] : [1, 0.55, 0.25];
        let to: THREE.Vector3 | null = null;
        if (f.to) {
          to = tileToWorld(f.to, new THREE.Vector3());
          to.y += FIGURE_H * 0.55;
          if (!f.hit) {
            // A miss flies on past the target and strikes behind it.
            const dx = to.x - from.x;
            const dz = to.z - from.z;
            const len = Math.hypot(dx, dz) || 1;
            const over = 0.8 + r() * 1.6;
            to.x += (dx / len) * over + (r() - 0.5) * 0.6;
            to.z += (dz / len) * over + (r() - 0.5) * 0.6;
            to.y += (r() - 0.5) * 0.5;
          }
          // Start the flash and the tracer a little in front of the shooter, towards the target.
          const dx = to.x - from.x;
          const dz = to.z - from.z;
          const len = Math.hypot(dx, dz) || 1;
          from.x += (dx / len) * 0.38;
          from.z += (dz / len) * 0.38;
        }
        mote({ glow: true, shape: FLAME, x: from.x, y: from.y, z: from.z, size: 0.55, grow: 1.5, life: 0.07, r: cr, g: cg, b: cb, spin: r() * 6 });
        mote({ glow: true, shape: SPARK, x: from.x, y: from.y, z: from.z, size: 0.3, life: 0.05, r: 1, g: 1, b: 0.9 });
        flash(from.x, from.y, from.z, 5, 4.5, 0.09, warm ? '#ffd27a' : '#ff9a4a');
        if (to) {
          const t = slot(tracers);
          Object.assign(t, { alive: true, age: 0, life: 0.12, r: cr, g: cg * 0.95, b: cb * 0.7, width: 0.045 });
          t.from.copy(from);
          t.to.copy(to);
          if (!f.hit) {
            // Where the stray round lands: sparks and a pale puff.
            sparks(r, to.x, to.y, to.z, 4, 3, [1, 0.8, 0.4]);
            puffs(r, to.x, to.y, to.z, 2, 0.1, 0.16, 0.5, C.set('#c9bfae'), 0.7, 0.4);
          }
        }
        // A shell case or a wisp: a tiny puff of smoke at the muzzle.
        puffs(r, from.x, from.y, from.z, 1, 0.05, 0.14, 0.6, C.set('#bdb5a8'), 0.45, 0.5);
        break;
      }
      case 'hit': {
        const hostile = f.side === 'hostile';
        const y = at.y + FIGURE_H * 0.55;
        // No blood (D21): a white impact flash, sparks off armour or amber spatter off the organism.
        mote({ glow: true, shape: SPARK, x: at.x, y, z: at.z, size: 0.5, life: 0.09, r: 1, g: 1, b: 0.9 });
        sparks(r, at.x, y, at.z, 7, 3.5, hostile ? [0.95, 0.62, 0.15] : [1, 0.85, 0.5]);
        if (hostile) puffs(r, at.x, y, at.z, 2, 0.1, 0.12, 0.5, C.set('#e0a030'), 0.6, 0.2);
        break;
      }
      case 'chip': {
        // A round strikes a wall: sparks (more off steel), a puff and a few flakes of the wall's own material.
        const col = materialColour(f.material, C2);
        const y = at.y + 0.9 + r() * 0.6;
        sparks(r, at.x, y, at.z, f.material === 'steel' ? 8 : 4, 3, [1, 0.82, 0.45]);
        puffs(r, at.x, y, at.z, 3, 0.25, 0.2, 0.9, C.copy(col).lerp(C2.set('#efe6cf'), 0.4), 0.8, 0.3);
        debris(r, at.x, y - 0.4, at.z, 3, 1.5, 2, 0.06, col, floorY, 3);
        break;
      }
      case 'down':
      case 'fell':
        puffs(r, at.x, at.y + 0.1, at.z, 6, 0.45, 0.22, 1, C.set('#c9bfae'), 0.75, 0.4);
        break;
      case 'blast': {
        const y = at.y + 0.6;
        // The flash, the fireball, the ring, the sparks, the smoke, the chunks of casing and floor, the scorch.
        mote({ glow: true, shape: SPARK, x: at.x, y, z: at.z, size: 3.4, grow: 3, life: 0.16, r: 1, g: 0.95, b: 0.8 });
        for (let i = 0; i < 12; i++) {
          const a = r() * Math.PI * 2;
          const d = r() * 0.6;
          mote({ glow: true, shape: FLAME, fire: true, x: at.x + Math.cos(a) * d, y: y + r() * 0.5, z: at.z + Math.sin(a) * d, vx: Math.cos(a) * (1 + r() * 2), vy: 1.5 + r() * 2.5, vz: Math.sin(a) * (1 + r() * 2), size: 0.8 + r() * 0.7, grow: 1.6, spin: r() * 6, spinV: (r() - 0.5) * 2, life: 0.45 + r() * 0.35, drag: 2.5, alpha: 1 });
        }
        mote({ glow: true, shape: RING, x: at.x, y: at.y + 0.15, z: at.z, size: 0.6, grow: 16, life: 0.32, r: 1, g: 0.8, b: 0.5, alpha: 0.9 });
        sparks(r, at.x, y, at.z, 22, 7, [1, 0.75, 0.3]);
        puffs(r, at.x, y + 0.4, at.z, 14, 1.2, 0.7, 3.2, C.set('#4a4642'), 0.9, 0.9);
        debris(r, at.x, at.y + 0.2, at.z, 18, 5, 5, 0.11, C.set('#3b3735'), floorY, 7);
        flash(at.x, y + 0.5, at.z, 40, 10, 0.4, '#ffb060');
        scorches.current.push({ x: at.x, y: floorY + 0.012, z: at.z, size: 1.6 + r() * 0.6, yaw: r() * 6 });
        if (scorches.current.length > MAX_SCORCH) scorches.current.shift();
        emit({ kind: 'fire', x: at.x, y: at.y + 0.1, z: at.z, life: 3.5 + r() * 2, every: 0.07, seed: f.id });
        emit({ kind: 'smoke', x: at.x, y: at.y + 0.6, z: at.z, life: 7 + r() * 3, every: 0.22, seed: f.id + 1, r: 0.3, g: 0.29, b: 0.28 });
        jolt(at, 0.4);
        break;
      }
      case 'breach':
      case 'collapse': {
        const col = materialColour(f.material, C2);
        const collapse = f.kind === 'collapse';
        const glass = f.material === 'glass';
        const cy = collapse ? floorY : floorY + 0.2;
        // The wall gives: chunks of its material tumble out and settle; a floor drops its slab to the level below.
        debris(r, at.x, cy, at.z, glass ? 14 : collapse ? 26 : 20, collapse ? 1.2 : 3, collapse ? -1 : 3.5, glass ? 0.07 : 0.16, col, collapse ? Math.max(0, floorY - LEVEL_H) : floorY, glass ? 4 : 9);
        if (glass) sparks(r, at.x, at.y + 1, at.z, 10, 3, [0.85, 0.95, 1]);
        if (f.material === 'steel') sparks(r, at.x, at.y + 0.8, at.z, 12, 4, [1, 0.8, 0.4]);
        const dust = C.copy(col).lerp(C.clone().set('#d9d2c0'), 0.45);
        puffs(r, at.x, floorY + 0.4, at.z, glass ? 3 : collapse ? 14 : 10, 0.7, 0.45, 2.2, dust, 0.9, 0.5);
        emit({ kind: 'dust', x: at.x, y: floorY + 0.3, z: at.z, life: collapse ? 2.5 : 1.4, every: 0.18, seed: f.id, r: dust.r, g: dust.g, b: dust.b });
        // Timber and plaster can catch: a small fire that burns a few seconds where it fell (a stable draw).
        if ((f.material === 'timber' || f.material === 'plaster') && r() < 0.35) emit({ kind: 'fire', x: at.x, y: floorY + 0.05, z: at.z, life: 3 + r() * 3, every: 0.12, seed: f.id + 7 });
        if (collapse) jolt(at, 0.25);
        break;
      }
      case 'revealed':
      case 'taken': {
        // An amber bloom at the throat and a ring: the core shows (docs/figures.md section 2).
        const y = at.y + FIGURE_H * 0.7;
        mote({ glow: true, shape: SPARK, x: at.x, y, z: at.z, size: 1.1, grow: 1, life: 0.45, r: 0.95, g: 0.66, b: 0.2 });
        mote({ glow: true, shape: RING, x: at.x, y, z: at.z, size: 0.4, grow: 4, life: 0.4, r: 0.95, g: 0.7, b: 0.25 });
        sparks(r, at.x, y, at.z, 9, 2.5, [0.95, 0.66, 0.2]);
        break;
      }
      default:
        break;
    }
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const st = useClient.getState();
    const fx = st.fx;
    const top = fx.length ? fx[fx.length - 1]!.id : 0;
    // Effects queued before the board mounted (a Continue) are history.
    if (lastFx.current === null) lastFx.current = top;
    for (const f of fx) if (f.id > lastFx.current) take(f);
    lastFx.current = Math.max(lastFx.current, top);
    // Pause freezes the world, and the effects with it; the shake still settles so the view is steady.
    const step = st.paused ? 0 : dt;
    shake.amp *= Math.exp(-dt * 7);

    // Emitters: lingering fire, smoke columns, dust.
    for (const e of emitters) {
      if (!e.alive) continue;
      e.age += step;
      if (e.age >= e.life) {
        e.alive = false;
        continue;
      }
      e.next -= step;
      const fade = 1 - e.age / e.life;
      while (e.next <= 0 && step > 0) {
        e.next += e.every;
        const r = rng(e.seed + Math.floor(e.age * 1000));
        if (e.kind === 'fire') {
          mote({ glow: true, shape: FLAME, fire: true, x: e.x + (r() - 0.5) * 0.5, y: e.y + r() * 0.1, z: e.z + (r() - 0.5) * 0.5, vy: 0.9 + r() * 0.8, vx: (r() - 0.5) * 0.3, vz: (r() - 0.5) * 0.3, size: (0.35 + r() * 0.3) * (0.4 + 0.6 * fade), grow: -0.2, life: 0.5 + r() * 0.3, drag: 0.5, spin: (r() - 0.5) * 0.6 });
          if (r() < 0.25) mote({ glow: false, shape: PUFF, x: e.x + (r() - 0.5) * 0.3, y: e.y + 0.8, z: e.z + (r() - 0.5) * 0.3, vy: 0.8, size: 0.3, grow: 0.6, life: 1.6, alpha: 0.6, r: 0.27, g: 0.26, b: 0.25, spin: r() * 6 });
          if (r() < 0.2) mote({ glow: true, shape: SPARK, x: e.x, y: e.y + 0.4, z: e.z, vx: (r() - 0.5) * 1.2, vy: 1.5 + r(), vz: (r() - 0.5) * 1.2, size: 0.06, life: 0.8, drag: 0.4, r: 1, g: 0.7, b: 0.3 });
        } else {
          const smokeCol = e.kind === 'smoke';
          mote({ glow: false, shape: PUFF, x: e.x + (r() - 0.5) * 0.5, y: e.y + r() * 0.3, z: e.z + (r() - 0.5) * 0.5, vx: (r() - 0.5) * 0.3 + 0.15, vy: smokeCol ? 1.0 + r() * 0.5 : 0.35, vz: (r() - 0.5) * 0.3 + 0.08, size: smokeCol ? 0.55 : 0.4, grow: smokeCol ? 0.9 : 0.5, life: smokeCol ? 3.5 : 1.6, alpha: (smokeCol ? 0.72 : 0.6) * (0.5 + 0.5 * fade), r: e.r, g: e.g, b: e.b, spin: r() * 6, spinV: (r() - 0.5) * 0.5, drag: 0.6 });
        }
      }
    }

    // Billboards.
    glow.begin();
    smoke.begin();
    for (const m of motes) {
      if (!m.alive) continue;
      m.age += step;
      if (m.age >= m.life) {
        m.alive = false;
        continue;
      }
      const t = m.age / m.life;
      const k = Math.exp(-m.drag * step);
      m.vx *= k;
      m.vz *= k;
      m.vy = m.vy * k - GRAVITY * m.gravity * step;
      m.x += m.vx * step;
      m.y += m.vy * step;
      m.z += m.vz * step;
      m.spin += m.spinV * step;
      const size = Math.max(0.01, m.size + m.grow * m.age);
      if (m.glow) {
        let r = m.r;
        let g = m.g;
        let b = m.b;
        if (m.fire) {
          fireColour(t, C);
          r = C.r;
          g = C.g;
          b = C.b;
        }
        // Additive: fading is darkening; flames dim late, sparks and flashes dim early.
        const a = m.alpha * (m.shape === FLAME ? 1 - t * t : 1 - t);
        glow.add(m.x, m.y, m.z, size, m.spin, r, g, b, a, m.shape);
      } else {
        // Smoke: in fast, out slow.
        const a = m.alpha * Math.min(1, t * 8) * (1 - t) ** 1.4;
        smoke.add(m.x, m.y, m.z, size, m.spin, m.r, m.g, m.b, a, m.shape);
      }
    }
    glow.end();
    smoke.end();

    // Chunks: tumble, one bounce, settle on the floor they fell to, then sink away in the last fifth of life.
    const cm = chunkRef.current;
    if (cm) {
      let n = 0;
      for (const c of chunks) {
        if (!c.alive) continue;
        c.age += step;
        if (c.age >= c.life) {
          c.alive = false;
          continue;
        }
        const resting = c.vy === 0 && c.y <= c.floorY + c.sy / 2 + 0.001;
        if (!resting) {
          c.vy -= GRAVITY * step;
          c.x += c.vx * step;
          c.y += c.vy * step;
          c.z += c.vz * step;
          c.rx += c.wx * step;
          c.ry += c.wy * step;
          c.rz += c.wz * step;
          const ground = c.floorY + c.sy / 2;
          if (c.y < ground && c.vy < 0) {
            c.y = ground;
            if (!c.bounced && c.vy < -2) {
              c.vy *= -0.3;
              c.vx *= 0.5;
              c.vz *= 0.5;
              c.wx *= 0.4;
              c.wz *= 0.4;
              c.bounced = true;
            } else {
              // Settle flat-ish: keep the yaw, lay the tumble down.
              c.vy = 0;
              c.vx = c.vz = 0;
              c.wx = c.wy = c.wz = 0;
              c.rx = Math.round(c.rx / (Math.PI / 2)) * (Math.PI / 2);
              c.rz = Math.round(c.rz / (Math.PI / 2)) * (Math.PI / 2);
            }
          }
        }
        const t = c.age / c.life;
        const sink = t > 0.8 ? (t - 0.8) / 0.2 : 0;
        E.set(c.rx, c.ry, c.rz);
        Q.setFromEuler(E);
        M.compose(P.set(c.x, c.y - sink * c.sy, c.z), Q, S.set(c.sx, c.sy * (1 - sink * 0.9), c.sz));
        cm.setMatrixAt(n, M);
        cm.setColorAt(n, C.setRGB(c.r, c.g, c.b));
        n += 1;
      }
      cm.count = n;
      cm.instanceMatrix.needsUpdate = true;
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    }

    // Tracers: a bright streak that runs from the muzzle to the impact over its short life.
    const tm = tracerRef.current;
    if (tm) {
      let n = 0;
      for (const t of tracers) {
        if (!t.alive) continue;
        t.age += step;
        if (t.age >= t.life) {
          t.alive = false;
          continue;
        }
        const k = t.age / t.life;
        const head = Math.min(1, k * 1.8);
        const tail = Math.max(0, k * 1.8 - 0.6);
        A.copy(t.from).lerp(t.to, tail);
        B.copy(t.from).lerp(t.to, head);
        const len = A.distanceTo(B);
        if (len > 0.01) {
          P.copy(A).add(B).multiplyScalar(0.5);
          Q.setFromUnitVectors(UP, B.sub(A).normalize());
          M.compose(P, Q, S.set(t.width, t.width, len));
          tm.setMatrixAt(n, M);
          tm.setColorAt(n, C.setRGB(t.r, t.g, t.b));
          n += 1;
        }
      }
      tm.count = n;
      tm.instanceMatrix.needsUpdate = true;
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    }

    // Scorch marks: they stay for the battle.
    const sm = scorchRef.current;
    if (sm) {
      const list = scorches.current;
      for (let i = 0; i < list.length; i++) {
        const s = list[i]!;
        E.set(0, s.yaw, 0);
        Q.setFromEuler(E);
        M.compose(P.set(s.x, s.y, s.z), Q, S.set(s.size, 1, s.size));
        sm.setMatrixAt(i, M);
      }
      sm.count = list.length;
      sm.instanceMatrix.needsUpdate = true;
    }

    // Light pulses: quick rise, slower fall; idle lights sit at zero so the shaders never change.
    for (let i = 0; i < LIGHTS; i++) {
      const l = lightRefs.current[i];
      const f = flashes[i]!;
      if (!l) continue;
      if (f.alive) {
        f.age += step;
        if (f.age >= f.life) f.alive = false;
      }
      if (!f.alive) {
        l.intensity = 0;
        continue;
      }
      const t = f.age / f.life;
      l.position.set(f.x, f.y, f.z);
      l.color.copy(f.colour);
      l.distance = f.dist;
      l.intensity = f.peak * (t < 0.15 ? t / 0.15 : (1 - t) / 0.85);
    }
    live.fx = {
      glow: glow.count,
      smoke: smoke.count,
      chunks: chunkRef.current?.count ?? 0,
      tracers: tracerRef.current?.count ?? 0,
      scorches: scorches.current.length,
      lights: flashes.filter((f) => f.alive).length,
      emitters: emitters.filter((e) => e.alive).length,
    };
  });

  return (
    <group name="effects">
      <instancedMesh ref={chunkRef} args={[box, chunkMat, MAX_CHUNKS]} raycast={NO_RAYCAST} frustumCulled={false} count={0} />
      <instancedMesh ref={tracerRef} args={[box, tracerMat, MAX_TRACERS]} raycast={NO_RAYCAST} frustumCulled={false} count={0} renderOrder={4} />
      <instancedMesh ref={scorchRef} args={[scorchGeo, scorchMat, MAX_SCORCH]} raycast={NO_RAYCAST} frustumCulled={false} count={0} />
      <primitive object={smoke.mesh} />
      <primitive object={glow.mesh} />
      {Array.from({ length: LIGHTS }, (_, i) => (
        <pointLight key={i} ref={(l) => void (lightRefs.current[i] = l)} intensity={0} distance={6} decay={1.6} />
      ))}
    </group>
  );
}

/** The amber core pulse shared by every alien figure: one material, one uniform change per frame. */
export const CORE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e0a030', emissive: new THREE.Color('#e0a030'), emissiveIntensity: 1, roughness: 0.3 });

/**
 * The glow sprite over a generated figure's painted core (docs/art/figure-models.md section 5: the GLB materials carry
 * no emissive, so the stand-ins' pulse is kept as one additive sprite per alien). The texture is a canvas radial
 * gradient made on first use, so this module still loads under vitest without a DOM.
 */
let glowMaterial: THREE.SpriteMaterial | null = null;
export function coreGlowMaterial(): THREE.SpriteMaterial {
  if (glowMaterial) return glowMaterial;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,220,140,1)');
  g.addColorStop(0.35, 'rgba(224,160,48,0.55)');
  g.addColorStop(1, 'rgba(224,160,48,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  glowMaterial = new THREE.SpriteMaterial({ map, color: '#e0a030', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
  return glowMaterial;
}

export function CorePulse() {
  useFrame(({ clock }) => {
    const k = 0.75 + 0.45 * Math.sin(clock.elapsedTime * 3.1);
    CORE_MATERIAL.emissiveIntensity = k;
    if (glowMaterial) glowMaterial.opacity = 0.45 + 0.35 * k;
  });
  return null;
}

/** Keeps the perf hook's frame-time window (window.__ekc.perf()). */
export function FrameTimes() {
  useFrame((_, dt) => {
    const arr = live.frameMs;
    arr.push(dt * 1000);
    if (arr.length > 120) arr.shift();
  });
  return null;
}
