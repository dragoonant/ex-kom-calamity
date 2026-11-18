// Cheap effects from engine events (docs/art/tile-set.md section 5): muzzle flashes and tracers, hit sparks, breach
// debris and collapse dust, the amber pulse of alien cores. Two instanced meshes carry every particle; nothing here
// allocates per frame beyond a few scratch vectors, nothing has a handler or a raycast (KB rule 25), and every
// effect comes from the store's fx queue (fx.ts), so a hidden shooter makes no flash (VIEW-2).
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WEAPONS } from '../../data';
import { useClient } from '../store';
import type { Fx } from '../fx';
import { FIGURE_H, live, tileToWorld } from './world';
import { STYLE_PALETTE } from './tileset';

const NO_RAYCAST = () => undefined;
const MAX_DEBRIS = 320;
const MAX_FLASH = 64;
const GRAVITY = 9.5;

interface Particle {
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
  yaw: number;
  spin: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  /** Flashes shrink with age; debris falls and settles. */
  kind: 'debris' | 'flash' | 'tracer' | 'dust';
}

function makePool(n: number): Particle[] {
  return Array.from({ length: n }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 1, sy: 1, sz: 1, yaw: 0, spin: 0, age: 0, life: 1, r: 1, g: 1, b: 1, kind: 'debris' as const }));
}

/** A small deterministic generator so debris looks the same for the same fx id (no Math.random in the board). */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const C = new THREE.Color();
const FROM = new THREE.Vector3();
const TO = new THREE.Vector3();

function materialColour(material: string | undefined): THREE.Color {
  switch (material) {
    case 'brick':
      return C.set(STYLE_PALETTE.residential.wall);
    case 'plaster':
      return C.set('#e6dcc6');
    case 'steel':
      return C.set('#7d8a94');
    case 'glass':
      return C.set('#cfe8ee');
    case 'timber':
      return C.set('#5f3e2c');
    case 'concrete':
      return C.set('#9a9a94');
    default:
      return C.set('#8a7f73');
  }
}

export function Effects() {
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.InstancedMesh>(null);
  const debris = useMemo(() => makePool(MAX_DEBRIS), []);
  const flashes = useMemo(() => makePool(MAX_FLASH), []);
  const lastFx = useRef(0);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const debrisMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), []);
  // Additive-looking flashes: unlit, no fog (KB gotchas), no depth write so they never cut into figures.
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false }), []);

  const spawn = (pool: Particle[], init: (p: Particle) => void): void => {
    let slot = pool.find((p) => !p.alive);
    if (!slot) {
      // Recycle the oldest.
      slot = pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    }
    slot.alive = true;
    slot.age = 0;
    slot.vx = slot.vy = slot.vz = 0;
    slot.spin = 0;
    slot.yaw = 0;
    init(slot);
  };

  const take = (f: Fx): void => {
    const r = rng(f.id);
    const at = tileToWorld(f.at, FROM);
    switch (f.kind) {
      case 'muzzle': {
        const w = f.weapon ? WEAPONS[f.weapon] : undefined;
        const melee = w?.kind === 'melee';
        const warm = f.side === 'agency';
        spawn(flashes, (p) => {
          p.kind = 'flash';
          p.x = at.x;
          p.y = at.y + FIGURE_H * 0.62;
          p.z = at.z;
          p.sx = p.sy = p.sz = melee ? 0.22 : 0.34;
          p.life = melee ? 0.16 : 0.1;
          p.yaw = r() * 3;
          [p.r, p.g, p.b] = melee ? [0.6, 0.95, 0.75] : warm ? [1, 0.92, 0.6] : [1, 0.75, 0.35];
        });
        if (f.to && !melee) {
          const to = tileToWorld(f.to, TO);
          to.y += FIGURE_H * 0.55;
          const from = P.set(at.x, at.y + FIGURE_H * 0.62, at.z);
          const len = from.distanceTo(to);
          spawn(flashes, (p) => {
            p.kind = 'tracer';
            p.x = (from.x + to.x) / 2;
            p.y = (from.y + to.y) / 2;
            p.z = (from.z + to.z) / 2;
            p.sx = 0.04;
            p.sy = 0.04;
            p.sz = Math.max(0.2, len);
            p.yaw = Math.atan2(to.x - from.x, to.z - from.z);
            p.spin = Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)); // pitch, stored in spin
            p.life = 0.09;
            [p.r, p.g, p.b] = [1, 0.9, 0.55];
          });
        }
        break;
      }
      case 'hit': {
        const hostile = f.side === 'hostile';
        for (let i = 0; i < 5; i++) {
          spawn(debris, (p) => {
            p.kind = 'debris';
            p.x = at.x + (r() - 0.5) * 0.3;
            p.y = at.y + FIGURE_H * 0.55;
            p.z = at.z + (r() - 0.5) * 0.3;
            p.vx = (r() - 0.5) * 3;
            p.vy = 1 + r() * 2.5;
            p.vz = (r() - 0.5) * 3;
            p.sx = p.sy = p.sz = 0.06;
            p.life = 0.45;
            p.spin = r() * 8;
            [p.r, p.g, p.b] = hostile ? [0.88, 0.63, 0.19] : [0.85, 0.15, 0.12];
          });
        }
        spawn(flashes, (p) => {
          p.kind = 'flash';
          p.x = at.x;
          p.y = at.y + FIGURE_H * 0.55;
          p.z = at.z;
          p.sx = p.sy = p.sz = 0.18;
          p.life = 0.08;
          [p.r, p.g, p.b] = [1, 1, 0.9];
        });
        break;
      }
      case 'down':
      case 'fell':
        for (let i = 0; i < 6; i++) {
          spawn(debris, (p) => {
            p.kind = 'dust';
            p.x = at.x + (r() - 0.5) * 0.6;
            p.y = at.y + 0.1;
            p.z = at.z + (r() - 0.5) * 0.6;
            p.vx = (r() - 0.5) * 1.2;
            p.vy = 0.6 + r() * 0.8;
            p.vz = (r() - 0.5) * 1.2;
            p.sx = p.sy = p.sz = 0.14;
            p.life = 0.7;
            [p.r, p.g, p.b] = [0.72, 0.68, 0.6];
          });
        }
        break;
      case 'blast': {
        spawn(flashes, (p) => {
          p.kind = 'flash';
          p.x = at.x;
          p.y = at.y + 0.6;
          p.z = at.z;
          p.sx = p.sy = p.sz = 1.6;
          p.life = 0.22;
          [p.r, p.g, p.b] = [1, 0.8, 0.4];
        });
        for (let i = 0; i < 28; i++) {
          spawn(debris, (p) => {
            p.kind = i < 10 ? 'dust' : 'debris';
            p.x = at.x + (r() - 0.5) * 0.8;
            p.y = at.y + 0.3 + r() * 0.5;
            p.z = at.z + (r() - 0.5) * 0.8;
            const a = r() * Math.PI * 2;
            const v = 2 + r() * 4;
            p.vx = Math.cos(a) * v;
            p.vy = 2 + r() * 4;
            p.vz = Math.sin(a) * v;
            p.sx = p.sy = p.sz = p.kind === 'dust' ? 0.3 : 0.08 + r() * 0.14;
            p.life = p.kind === 'dust' ? 1.1 : 1.3;
            p.spin = r() * 10;
            [p.r, p.g, p.b] = p.kind === 'dust' ? [0.55, 0.5, 0.45] : [0.2, 0.18, 0.17];
          });
        }
        break;
      }
      case 'breach':
      case 'collapse': {
        const col = materialColour(f.material);
        const n = f.kind === 'collapse' ? 30 : 18;
        for (let i = 0; i < n; i++) {
          spawn(debris, (p) => {
            p.kind = i % 3 === 0 ? 'dust' : 'debris';
            p.x = at.x + (r() - 0.5) * 0.9;
            p.y = at.y + (f.kind === 'collapse' ? 0.05 : 0.3 + r() * 1.2);
            p.z = at.z + (r() - 0.5) * 0.9;
            p.vx = (r() - 0.5) * 3.5;
            p.vy = f.kind === 'collapse' ? -0.5 - r() : 1.5 + r() * 3;
            p.vz = (r() - 0.5) * 3.5;
            p.sx = p.sy = p.sz = p.kind === 'dust' ? 0.26 : 0.1 + r() * 0.16;
            p.life = p.kind === 'dust' ? 1.0 : 1.2;
            p.spin = r() * 8;
            if (p.kind === 'dust') [p.r, p.g, p.b] = [col.r * 0.7 + 0.2, col.g * 0.7 + 0.2, col.b * 0.7 + 0.2];
            else [p.r, p.g, p.b] = [col.r, col.g, col.b];
          });
        }
        break;
      }
      case 'revealed':
      case 'taken':
        // An amber bloom at the throat: the core shows (docs/figures.md section 2).
        spawn(flashes, (p) => {
          p.kind = 'flash';
          p.x = at.x;
          p.y = at.y + FIGURE_H * 0.7;
          p.z = at.z;
          p.sx = p.sy = p.sz = 0.7;
          p.life = 0.5;
          [p.r, p.g, p.b] = [0.88, 0.63, 0.19];
        });
        break;
      default:
        break;
    }
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const fx = useClient.getState().fx;
    for (const f of fx) if (f.id > lastFx.current) take(f);
    if (fx.length) lastFx.current = Math.max(lastFx.current, fx[fx.length - 1]!.id);
    const paused = useClient.getState().paused;
    // Particles keep falling while paused only for a moment: pause freezes the world, so they freeze too.
    const step = paused ? 0 : dt;
    const write = (mesh: THREE.InstancedMesh | null, pool: Particle[]) => {
      if (!mesh) return;
      let n = 0;
      for (const p of pool) {
        if (!p.alive) continue;
        p.age += step;
        if (p.age >= p.life) {
          p.alive = false;
          continue;
        }
        const t = p.age / p.life;
        if (p.kind === 'debris' || p.kind === 'dust') {
          p.vy -= GRAVITY * step * (p.kind === 'dust' ? 0.15 : 1);
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.z += p.vz * step;
          p.yaw += p.spin * step;
          if (p.kind === 'debris' && p.vy < 0) {
            // Settle on the level's floor: the tile's y is where the piece was spawned, less the figure height.
            const floorY = Math.floor((p.y + 0.5) / 2) * 2;
            if (p.y < floorY + 0.04) {
              p.y = floorY + 0.04;
              p.vy = 0;
              p.vx *= 0.6;
              p.vz *= 0.6;
              p.spin = 0;
            }
          }
          const fade = p.kind === 'dust' ? 1 + t * 1.6 : 1;
          E.set(p.kind === 'dust' ? 0 : p.yaw * 0.7, p.yaw, p.kind === 'dust' ? 0 : p.yaw * 0.3);
          Q.setFromEuler(E);
          M.compose(P.set(p.x, p.y, p.z), Q, S.set(p.sx * fade, p.sy * fade, p.sz * fade));
          mesh.setMatrixAt(n, M);
          const k = p.kind === 'dust' ? 1 - t : 1;
          mesh.setColorAt(n, C.setRGB(p.r * k + (1 - k) * 0.8, p.g * k + (1 - k) * 0.78, p.b * k + (1 - k) * 0.74));
        } else {
          const shrink = p.kind === 'tracer' ? 1 : 1 - t * 0.6;
          E.set(p.kind === 'tracer' ? -p.spin : 0, p.yaw, 0);
          Q.setFromEuler(E);
          M.compose(P.set(p.x, p.y, p.z), Q, S.set(p.sx * shrink, p.sy * shrink, p.sz * (p.kind === 'tracer' ? 1 : shrink)));
          mesh.setMatrixAt(n, M);
          mesh.setColorAt(n, C.setRGB(p.r, p.g, p.b));
        }
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    write(debrisRef.current, debris);
    write(flashRef.current, flashes);
  });

  return (
    <group>
      <instancedMesh ref={debrisRef} args={[box, debrisMat, MAX_DEBRIS]} raycast={NO_RAYCAST} frustumCulled={false} count={0} />
      <instancedMesh ref={flashRef} args={[box, flashMat, MAX_FLASH]} raycast={NO_RAYCAST} frustumCulled={false} count={0} />
    </group>
  );
}

/** The amber core pulse shared by every alien figure: one material, one uniform change per frame. */
export const CORE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e0a030', emissive: new THREE.Color('#e0a030'), emissiveIntensity: 1, roughness: 0.3 });

export function CorePulse() {
  useFrame(({ clock }) => {
    CORE_MATERIAL.emissiveIntensity = 0.75 + 0.45 * Math.sin(clock.elapsedTime * 3.1);
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
