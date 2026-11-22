// The city's set dressing (cityLayout.ts drawn): streets with painted lines and crossings, pavement blocks tinted
// by district, the lots the rules leave empty filled with row houses, shops, sheds, tanks, plazas and parks, an
// outer city that climbs toward the horizon, the bay to the north, trees, street lamps that glow by night, the
// monorail around the Civic Centre ring and civilian air traffic. Everything is instanced (about thirty draws in
// all) and nothing takes a pointer (KB rule 25): the one pick mesh in CityScene.tsx stays the only target.
// Moving things run on the ambient clock, which stops when the city is paused (pause is the absence of ticks).
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Skyline, towerRing, type SkyTone, type Tower } from '../board/backdrop';
import { markWindows, patchWindows, type WindowUniforms } from '../board/windows';
import { BLOCK, DISTRICT_PAVE, RAIL_Y, SHORE_Z, SIZE, STREET, cityLayout, railLoop, railStraights, type CityLayout, type Fill } from './cityLayout';
import { PAL } from './cityMeshes';
import { glowTexture, Inst, unitBox, type Item } from '../board/instanced';
import { useCity } from './store';

const noRay = () => null;

/** The ambient clock: seconds of city life drawn, frozen while paused or away from the board. */
export const ambient = { t: 0 };

export function AmbientClock() {
  useFrame((_, dt) => {
    const s = useCity.getState();
    if (!s.active || s.fight || s.paused) return;
    const rate = s.speed === 1 ? 1 : s.speed === 4 ? 1.7 : 2.4;
    ambient.t += Math.min(dt, 0.1) * rate;
  });
  return null;
}

// ---- Streets and blocks ---------------------------------------------------------------------------------------

function Streets({ layout }: { layout: CityLayout }) {
  const box = useMemo(unitBox, []);
  const plane = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const asphalt = useMemo(() => new THREE.MeshLambertMaterial({ color: '#56595c' }), []);
  const pave = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), []);
  const paint = useMemo(() => new THREE.MeshLambertMaterial({ color: '#e8d9a8' }), []);
  const kerb = useMemo(() => new THREE.MeshLambertMaterial({ color: '#a59f92' }), []);
  const { blocks, kerbs, dashes, zebra } = useMemo(() => {
    const blocks: Item[] = layout.blocks.map((b) => ({ x: b.x, z: b.z, sx: b.w - 0.12, sy: 0.1, sz: b.d - 0.12, colour: DISTRICT_PAVE[b.district] }));
    const kerbs: Item[] = layout.blocks.map((b) => ({ x: b.x, z: b.z, sx: b.w, sy: 0.08, sz: b.d }));
    const dashes: Item[] = [];
    const zebra: Item[] = [];
    const { x0, x1, z0, z1 } = layout.span;
    for (const x of layout.streetsX)
      for (let z = z0; z < z1; z += BLOCK) for (let k = 0; k < 3; k++) dashes.push({ x, y: 0.012, z: z + BLOCK * (0.25 + k * 0.25), sx: 0.07, sz: 0.9 });
    for (const z of layout.streetsZ) {
      if (z < z0 - 0.1) continue;
      for (let x = x0; x < x1; x += BLOCK) for (let k = 0; k < 3; k++) dashes.push({ x: x + BLOCK * (0.25 + k * 0.25), y: 0.012, z, sx: 0.9, sz: 0.07 });
    }
    // Zebra crossings on every side of the play area's crossroads.
    for (let x = 0; x <= SIZE; x += BLOCK) {
      for (let z = 0; z <= SIZE; z += BLOCK) {
        for (let s = -2; s <= 2; s++) {
          const o = s * 0.2;
          zebra.push({ x: x + o, y: 0.014, z: z - STREET / 2 - 0.35, sx: 0.11, sz: 0.5 });
          zebra.push({ x: x + o, y: 0.014, z: z + STREET / 2 + 0.35, sx: 0.11, sz: 0.5 });
          zebra.push({ x: x - STREET / 2 - 0.35, y: 0.014, z: z + o, sx: 0.5, sz: 0.11 });
          zebra.push({ x: x + STREET / 2 + 0.35, y: 0.014, z: z + o, sx: 0.5, sz: 0.11 });
        }
      }
    }
    return { blocks, kerbs, dashes, zebra };
  }, [layout]);
  const { x0, x1, z1 } = layout.span;
  return (
    <group>
      {/* Asphalt under the street grid; past it the dome's ground band is the land, fading into the haze. */}
      <mesh position={[(x0 + x1) / 2, -0.02, (SHORE_Z + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={asphalt} raycast={noRay} receiveShadow renderOrder={9}>
        <planeGeometry args={[x1 - x0 + 1, z1 - SHORE_Z + 1]} />
      </mesh>
      <Inst geo={box} mat={kerb} items={kerbs} receive />
      <Inst geo={box} mat={pave} items={blocks} receive />
      <Inst geo={plane} mat={paint} items={dashes} />
      <Inst geo={plane} mat={paint} items={zebra} />
    </group>
  );
}

// ---- Filled lots ----------------------------------------------------------------------------------------------

function Fills({ fills, windows }: { fills: Fill[]; windows: WindowUniforms }) {
  const box = useMemo(() => markWindows(unitBox(), true), []);
  const plain = useMemo(() => markWindows(unitBox(), false), []);
  const plane = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const disc = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 20).translate(0, 0.5, 0), []);
  const tankGeo = useMemo(() => {
    const body = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
    const top = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, 1, 0);
    return mergeGeometries([body.toNonIndexed(), top.toNonIndexed()], false)!;
  }, []);
  const wallMat = useMemo(() => patchWindows(new THREE.MeshLambertMaterial({ color: '#ffffff' }), windows, 'grid'), [windows]);
  const solid = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), []);
  const grass = useMemo(() => new THREE.MeshLambertMaterial({ color: '#8eaa72' }), []);
  const water = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f8e93', roughness: 0.15, metalness: 0.2 }), []);
  const parts = useMemo(() => {
    const walls: Item[] = [];
    const roofs: Item[] = [];
    const awnings: Item[] = [];
    const tanks: Item[] = [];
    const lawns: Item[] = [];
    const pools: Item[] = [];
    const basins: Item[] = [];
    const paving: Item[] = [];
    for (const f of fills) {
      const ry = (f.seed % 4) * (Math.PI / 2);
      switch (f.kind) {
        case 'row':
        case 'shop':
        case 'shed':
        case 'house': {
          const w = f.kind === 'house' ? f.w : f.w;
          walls.push({ x: f.x, z: f.z, sx: w, sy: f.h, sz: f.d, colour: f.colour, ry: f.kind === 'house' ? ry : 0 });
          const roofCol = f.kind === 'shed' ? '#6f8f8c' : f.kind === 'house' ? '#c27a5c' : '#b3aa96';
          roofs.push({ x: f.x, y: f.h, z: f.z, sx: w + 0.12, sy: f.kind === 'shed' ? 0.28 : 0.12, sz: f.d + 0.12, colour: roofCol, ry: f.kind === 'house' ? ry : 0 });
          if (f.kind === 'shop') {
            const col = f.seed % 3 === 0 ? PAL.teal : f.seed % 3 === 1 ? PAL.mustard : '#c86b4a';
            awnings.push({ x: f.x, y: 0.62, z: f.z + f.d / 2 + 0.22, sx: f.w * 0.9, sy: 0.08, sz: 0.5, colour: col });
            awnings.push({ x: f.x, y: 0.62, z: f.z - f.d / 2 - 0.22, sx: f.w * 0.9, sy: 0.08, sz: 0.5, colour: col });
          }
          break;
        }
        case 'tank':
          tanks.push({ x: f.x - 0.7, z: f.z - 0.5, sx: f.w, sy: f.h, sz: f.w, colour: f.colour });
          tanks.push({ x: f.x + 0.9, z: f.z + 0.8, sx: f.w * 0.7, sy: f.h * 0.7, sz: f.w * 0.7, colour: '#d9cfb8' });
          break;
        case 'park':
          lawns.push({ x: f.x, y: 0.13, z: f.z, sx: 3.6, sz: 3.6 });
          paving.push({ x: f.x, y: 0.14, z: f.z, sx: 0.5, sz: 3.6, colour: '#e2d8c2', ry: f.seed % 2 ? Math.PI / 4 : 0 });
          break;
        case 'pond':
          lawns.push({ x: f.x, y: 0.13, z: f.z, sx: 3.6, sz: 3.6 });
          pools.push({ x: f.x + 0.2, y: 0.02, z: f.z - 0.1, sx: 1.25, sy: 0.13, sz: 1.0 });
          break;
        case 'plaza':
          paving.push({ x: f.x, y: 0.13, z: f.z, sx: 3.5, sz: 3.5, colour: '#e9e1cd' });
          if (f.seed % 3 !== 0) break; // a fountain on one plaza in three
          basins.push({ x: f.x, y: 0.1, z: f.z, sx: 0.9, sy: 0.22, sz: 0.9, colour: '#d6ccb4' });
          pools.push({ x: f.x, y: 0.1, z: f.z, sx: 0.75, sy: 0.24, sz: 0.75 });
          basins.push({ x: f.x, y: 0.1, z: f.z, sx: 0.12, sy: 0.75, sz: 0.12, colour: '#c9cdd1' });
          break;
      }
    }
    return { walls, roofs, awnings, tanks, lawns, pools, basins, paving };
  }, [fills]);
  return (
    <group>
      <Inst geo={box} mat={wallMat} items={parts.walls} cast receive />
      <Inst geo={plain} mat={solid} items={parts.roofs} cast receive />
      <Inst geo={plain} mat={solid} items={parts.awnings} cast />
      <Inst geo={tankGeo} mat={solid} items={parts.tanks} cast receive />
      <Inst geo={plane} mat={grass} items={parts.lawns} receive />
      <Inst geo={plane} mat={solid} items={parts.paving} receive />
      <Inst geo={disc} mat={solid} items={parts.basins} cast receive />
      <Inst geo={disc} mat={water} items={parts.pools} />
    </group>
  );
}

// ---- Trees ----------------------------------------------------------------------------------------------------

const LEAF = ['#6f9361', '#7fa06a', '#5f8a66', '#8aa36a', '#6d8f74'];

function Trees({ layout }: { layout: CityLayout }) {
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5).translate(0, 0.3, 0), []);
  const crown = useMemo(() => new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.85, 0), []);
  const bark = useMemo(() => new THREE.MeshLambertMaterial({ color: '#6d5a48' }), []);
  const leaf = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), []);
  const { trunks, crowns } = useMemo(() => {
    const trunks: Item[] = [];
    const crowns: Item[] = [];
    layout.trees.forEach((t, i) => {
      trunks.push({ x: t.x, y: 0.1, z: t.z, sx: t.s, sy: t.s, sz: t.s });
      crowns.push({ x: t.x, y: 0.1, z: t.z, sx: t.s, sy: t.s * (0.9 + (i % 3) * 0.15), sz: t.s, ry: i, colour: LEAF[Math.floor(t.tone * LEAF.length)] });
    });
    return { trunks, crowns };
  }, [layout]);
  return (
    <group>
      <Inst geo={trunk} mat={bark} items={trunks} cast />
      <Inst geo={crown} mat={leaf} items={crowns} cast receive />
    </group>
  );
}

// ---- Street lamps ---------------------------------------------------------------------------------------------

function Lamps({ layout, tone }: { layout: CityLayout; tone: SkyTone }) {
  const pole = useMemo(() => {
    const p = new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5).translate(0, 0.75, 0);
    const arm = new THREE.BoxGeometry(0.4, 0.04, 0.04).translate(0.18, 1.5, 0);
    return mergeGeometries([p.toNonIndexed(), arm.toNonIndexed()], false)!;
  }, []);
  const head = useMemo(() => new THREE.SphereGeometry(0.09, 8, 6), []);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f3a3c', roughness: 0.6, metalness: 0.3 }), []);
  const bulb = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f3ead2', emissive: new THREE.Color('#ffd58a'), emissiveIntensity: 0 }), []);
  const glowMat = useMemo(
    () => new THREE.PointsMaterial({ map: glowTexture(), color: '#ffcf7a', size: 2.4, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
    [],
  );
  const { poles, heads, glow } = useMemo(() => {
    const poles: Item[] = layout.lamps.map((l) => ({ x: l.x, y: 0.1, z: l.z }));
    const heads: Item[] = layout.lamps.map((l) => ({ x: l.x + 0.36, y: 1.56, z: l.z }));
    const pos = new Float32Array(layout.lamps.length * 3);
    layout.lamps.forEach((l, i) => pos.set([l.x + 0.36, 1.5, l.z], i * 3));
    const glow = new THREE.BufferGeometry();
    glow.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { poles, heads, glow };
  }, [layout]);
  useFrame(() => {
    const n = THREE.MathUtils.smoothstep(tone.night, 0.25, 0.75);
    bulb.emissiveIntensity = n * 2.2;
    glowMat.opacity = n * 0.75;
  });
  return (
    <group>
      <Inst geo={pole} mat={metal} items={poles} cast />
      <Inst geo={head} mat={bulb} items={heads} />
      <points geometry={glow} material={glowMat} raycast={noRay} />
    </group>
  );
}

// ---- The bay --------------------------------------------------------------------------------------------------

const waterVert = /* glsl */ `
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uNight;
varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz;
  float r1 = sin(p.x * 0.9 + uTime * 0.8) * sin(p.y * 1.3 - uTime * 0.6);
  float r2 = sin(p.x * 2.7 - p.y * 1.9 + uTime * 1.4);
  vec3 n = normalize(vec3(r1 * 0.05 + r2 * 0.025, 1.0, r2 * 0.04));
  vec3 v = normalize(vW - cameraPosition);
  vec3 r = reflect(v, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.6));
  float fres = 0.25 + 0.75 * pow(1.0 - max(0.0, -v.y), 3.0);
  vec3 deep = mix(vec3(0.16, 0.33, 0.36), vec3(0.03, 0.06, 0.1), uNight);
  vec3 col = mix(deep, sky, fres);
  float glint = pow(max(0.0, dot(r, normalize(uSunDir))), 180.0) * smoothstep(-0.1, 0.05, uSunDir.y);
  col += uSun * glint * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function Bay({ tone }: { tone: SkyTone }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uZenith: { value: new THREE.Color() },
            uHorizon: { value: new THREE.Color() },
            uSun: { value: new THREE.Color() },
            uSunDir: { value: new THREE.Vector3() },
            uTime: { value: 0 },
            uNight: { value: 0 },
          },
        ]),
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        fog: true,
      }),
    [],
  );
  const wall = useMemo(() => new THREE.MeshLambertMaterial({ color: '#b9b2a2' }), []);
  useFrame(({ clock }) => {
    const u = mat.uniforms;
    u.uZenith!.value.copy(tone.zenith);
    u.uHorizon!.value.copy(tone.horizon);
    u.uSun!.value.copy(tone.sun);
    u.uSunDir!.value.copy(tone.sunDir);
    u.uNight!.value = tone.night;
    u.uTime!.value = clock.elapsedTime;
  });
  const depth = 420;
  return (
    <group>
      <mesh position={[SIZE / 2, -0.35, SHORE_Z - depth / 2]} rotation={[-Math.PI / 2, 0, 0]} material={mat} raycast={noRay}>
        <planeGeometry args={[900, depth, 1, 1]} />
      </mesh>
      {/* The far shore, where the distant towers stand. */}
      <mesh position={[SIZE / 2, -0.12, SHORE_Z - 62 - 200]} rotation={[-Math.PI / 2, 0, 0]} material={wall} raycast={noRay}>
        <planeGeometry args={[900, 400]} />
      </mesh>
      {/* The sea wall along the promenade. */}
      <mesh position={[SIZE / 2, -0.25, SHORE_Z - 0.15]} material={wall} raycast={noRay} receiveShadow>
        <boxGeometry args={[900, 0.5, 0.3]} />
      </mesh>
    </group>
  );
}

// ---- The monorail ---------------------------------------------------------------------------------------------

const CARS = 3;
const CAR_LEN = 2.2;

function Monorail({ tone }: { tone: SkyTone }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(railLoop().map((p) => new THREE.Vector3(p.x, RAIL_Y, p.z)), true, 'centripetal'), []);
  const beam = useMemo(() => new THREE.TubeGeometry(curve, 240, 0.22, 6, true), [curve]);
  const length = useMemo(() => curve.getLength(), [curve]);
  const pylons = useMemo(() => {
    const out: Item[] = [];
    const n = Math.floor(length / 7);
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt(i / n);
      // Pylons stand only on the straights, on the street's centre line.
      const onX = railStraights().xs.some((v) => Math.abs(p.x - v) < 0.2);
      const onZ = railStraights().zs.some((v) => Math.abs(p.z - v) < 0.2);
      if (onX || onZ) out.push({ x: p.x, z: p.z, ry: onX ? 0 : Math.PI / 2 });
    }
    return out;
  }, [curve, length]);
  const pylonGeo = useMemo(() => {
    const col = new THREE.CylinderGeometry(0.16, 0.24, RAIL_Y - 0.3, 8).translate(0, (RAIL_Y - 0.3) / 2, 0);
    const cap = new THREE.BoxGeometry(0.5, 0.28, 0.9).translate(0, RAIL_Y - 0.36, 0);
    const foot = new THREE.CylinderGeometry(0.4, 0.45, 0.2, 8).translate(0, 0.1, 0);
    return mergeGeometries([col.toNonIndexed(), cap.toNonIndexed(), foot.toNonIndexed()], false)!;
  }, []);
  const concrete = useMemo(() => new THREE.MeshLambertMaterial({ color: '#e3dccb' }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.35, metalness: 0.55 }), []);
  const carBody = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1e8d2', roughness: 0.35, metalness: 0.1 }), []);
  const stripe = useMemo(() => new THREE.MeshLambertMaterial({ color: PAL.mustard }), []);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f4552', roughness: 0.15, emissive: new THREE.Color('#ffd79a'), emissiveIntensity: 0 }), []);
  const carGeo = useMemo(() => new THREE.CapsuleGeometry(0.42, CAR_LEN - 0.84, 6, 14).rotateX(Math.PI / 2), []);
  const stripeGeo = useMemo(() => new THREE.CylinderGeometry(0.43, 0.43, CAR_LEN * 0.82, 14, 1, true).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, -0.12, 0), []);
  const winGeo = useMemo(() => new THREE.CylinderGeometry(0.435, 0.435, CAR_LEN * 0.7, 14, 1, true).rotateX(Math.PI / 2).scale(1, 0.22, 1).translate(0, 0.14, 0), []);
  const cars = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3() }), []);
  useFrame(() => {
    const g = cars.current;
    if (!g) return;
    const head = ((ambient.t * 4.2) / length) % 1;
    g.children.forEach((car, i) => {
      const u = (head - (i * (CAR_LEN + 0.15)) / length + 1) % 1;
      curve.getPointAt(u, tmp.p);
      curve.getPointAt((u + 0.002) % 1, tmp.q);
      car.position.set(tmp.p.x, tmp.p.y + 0.62, tmp.p.z);
      car.lookAt(tmp.q.x, tmp.q.y + 0.62, tmp.q.z);
    });
    glass.emissiveIntensity = THREE.MathUtils.smoothstep(tone.night, 0.2, 0.7) * 1.6;
  });
  return (
    <group>
      <mesh geometry={beam} material={rail} raycast={noRay} castShadow />
      <Inst geo={pylonGeo} mat={concrete} items={pylons} cast receive />
      <group ref={cars}>
        {Array.from({ length: CARS }, (_, i) => (
          <group key={i}>
            <mesh geometry={carGeo} material={carBody} raycast={noRay} castShadow />
            <mesh geometry={stripeGeo} material={stripe} raycast={noRay} />
            <mesh geometry={winGeo} material={glass} raycast={noRay} />
          </group>
        ))}
      </group>
    </group>
  );
}

// ---- Civilian air traffic -------------------------------------------------------------------------------------

interface Lane {
  axis: 'x' | 'z';
  at: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  colour: string;
}

const TRAFFIC_COLOURS = ['#f1e8d2', '#5fa8a0', '#d2a23a', '#c9cdd1', '#e7dcc1', '#2f7f7a'];

function Traffic({ tone }: { tone: SkyTone }) {
  const lanes = useMemo(() => {
    const out: Lane[] = [];
    let k = 0;
    const lines: number[] = [];
    for (let at = -BLOCK * 2; at <= SIZE + BLOCK * 2; at += BLOCK * 2) lines.push(at);
    for (const at of lines) {
      for (const axis of ['x', 'z'] as const) {
        for (let c = 0; c < 2; c++) {
          k++;
          out.push({ axis, at: at + (c ? 0.6 : -0.6), y: 9.5 + (k % 3) * 1.1, dir: c ? 1 : -1, speed: 5 + (k % 4) * 0.9, phase: (k * 37) % 140, colour: TRAFFIC_COLOURS[k % TRAFFIC_COLOURS.length]! });
        }
      }
    }
    return out;
  }, []);
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.24, 0.55, 4, 10).rotateX(Math.PI / 2), []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.1, -0.05), []);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.25 }), []);
  const dome = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f4552', roughness: 0.1, metalness: 0.2 }), []);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const domes = useRef<THREE.InstancedMesh>(null);
  const lights = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lanes.length * 6), 3));
    const col = new Float32Array(lanes.length * 6);
    for (let i = 0; i < lanes.length; i++) {
      col.set([1, 0.85, 0.6], i * 6);
      col.set([1, 0.3, 0.2], i * 6 + 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [lanes]);
  const lightMat = useMemo(
    () => new THREE.PointsMaterial({ map: glowTexture(), size: 0.9, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );
  useEffect(() => {
    const c = new THREE.Color();
    lanes.forEach((l, i) => bodies.current?.setColorAt(i, c.set(l.colour)));
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
  }, [lanes]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const b = bodies.current;
    const d = domes.current;
    if (!b || !d) return;
    const pos = lights.getAttribute('position') as THREE.BufferAttribute;
    const lo = -BLOCK * 5;
    const span = SIZE + BLOCK * 10;
    lanes.forEach((l, i) => {
      const s = (((l.phase + ambient.t * l.speed) % span) + span) % span;
      const along = l.dir > 0 ? lo + s : lo + span - s;
      const x = l.axis === 'x' ? along : l.at;
      const z = l.axis === 'z' ? along : l.at;
      const yaw = l.axis === 'x' ? (l.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : l.dir > 0 ? 0 : Math.PI;
      tmp.p.set(x, l.y + Math.sin(ambient.t * 1.7 + i) * 0.08, z);
      tmp.q.setFromAxisAngle(tmp.up, yaw);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      b.setMatrixAt(i, tmp.m);
      d.setMatrixAt(i, tmp.m);
      const fx = Math.sin(yaw) * 0.55;
      const fz = Math.cos(yaw) * 0.55;
      pos.setXYZ(i * 2, tmp.p.x + fx, tmp.p.y, tmp.p.z + fz);
      pos.setXYZ(i * 2 + 1, tmp.p.x - fx, tmp.p.y, tmp.p.z - fz);
    });
    b.instanceMatrix.needsUpdate = true;
    d.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
    lightMat.opacity = THREE.MathUtils.smoothstep(tone.night, 0.2, 0.7) * 0.95;
  });
  return (
    <group>
      <instancedMesh ref={bodies} args={[bodyGeo, body, lanes.length]} raycast={noRay} frustumCulled={false} castShadow />
      <instancedMesh ref={domes} args={[domeGeo, dome, lanes.length]} raycast={noRay} frustumCulled={false} />
      <points geometry={lights} material={lightMat} raycast={noRay} frustumCulled={false} />
    </group>
  );
}

// ---- The whole dressing ---------------------------------------------------------------------------------------

export function CityDressing({ tone, windows, full }: { tone: SkyTone; windows: WindowUniforms; full: boolean }) {
  const layout = useMemo(cityLayout, []);
  const outer = useMemo<Tower[]>(() => layout.outer.map((o) => ({ x: o.x, z: o.z, r: o.w, h: o.h, round: o.round, accent: o.accent, tint: o.tint })), [layout]);
  const far = useMemo(
    () =>
      towerRing(SIZE / 2, SIZE / 2, SIZE + 70, SIZE + 250, 260, 77, (x, z) => {
        // Keep the near bay open: the far shore starts well north of the promenade.
        if (z < SHORE_Z && z > SHORE_Z - 60) return true;
        return x > -45 && x < SIZE + 45 && z > SHORE_Z && z < SIZE + 45;
      }),
    [],
  );
  return (
    <group>
      <AmbientClock />
      <Streets layout={layout} />
      <Fills fills={layout.fills} windows={windows} />
      <Trees layout={layout} />
      <Lamps layout={layout} tone={tone} />
      <Skyline towers={outer} windows={windows} castShadow />
      {full && <Skyline towers={far} windows={windows} />}
      <Bay tone={tone} />
      <Monorail tone={tone} />
      <Traffic tone={tone} />
    </group>
  );
}
