// The world past the board, shared by the city and the raid: a painted sky dome (a gradient from zenith to
// horizon, a sun disc with a halo, stars by night), and a ring of distant towers in the City of Tomorrow's
// register (cream shafts with mustard and teal bands, after mood-dusk-s62, docs/art/city-art.md) that fade into
// the fog and light their windows after dark. Nothing here takes a pointer (KB rule 25): every mesh has a no-op
// raycast, and none of it is drawn by the rules.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markWindows, patchWindows, windowUniforms, type WindowUniforms } from './windows';

const noRay = () => null;

export interface SkyTone {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  /** Unit vector toward the sun. */
  sunDir: THREE.Vector3;
  /** 0 by day, 1 at full night. */
  night: number;
}

const C = (h: string) => new THREE.Color(h);
const DAY = { zenith: C('#5d9fae'), horizon: C('#e9e2c9'), ground: C('#9c9686') };
const DUSK = { zenith: C('#3f6f86'), horizon: C('#f2a16a'), ground: C('#6d5a50') };
const NIGHT = { zenith: C('#0c1424'), horizon: C('#2a3550'), ground: C('#1a1c24') };

/**
 * The sky for an hour of the day (0 to 24). Dusk and dawn are the warm band when the sun is within a few hours of
 * the horizon; the night is the clock's own dark.
 */
export function skyAt(hour: number, out?: SkyTone): SkyTone {
  const t = out ?? { zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(), sunDir: new THREE.Vector3(), night: 0 };
  // The sun rises at 6 in the east (+x) and sets at 19 in the west (-x), tilted to the south (+z).
  const a = ((hour - 6) / 13) * Math.PI;
  const elev = Math.sin(a);
  t.sunDir.set(Math.cos(a), Math.max(-0.3, elev) * 0.9 + 0.02, 0.45).normalize();
  const day = THREE.MathUtils.smoothstep(elev, -0.05, 0.45);
  const dusk = Math.max(0, 1 - Math.abs(elev - 0.05) / 0.32) * (hour > 3 && hour < 22 ? 1 : 0);
  const night = 1 - THREE.MathUtils.smoothstep(elev, -0.25, 0.08);
  for (const k of ['zenith', 'horizon', 'ground'] as const) {
    t[k].copy(NIGHT[k]).lerp(DAY[k], day).lerp(DUSK[k], dusk * 0.85);
  }
  t.sun.set('#fff1d6').lerp(C('#ff9a55'), Math.min(1, dusk * 1.2));
  t.night = night;
  return t;
}

/** The fixed early evening of a raid (RULING ART-1): a low warm sun in the west, as EveningLights. */
export function eveningSky(): SkyTone {
  const t = skyAt(17.6);
  t.sunDir.set(-28, 16, 12).normalize();
  return t;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999; // on the far plane, behind everything
}`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uNight;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = up > 0.0
    ? mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.62, up), 0.7))
    : mix(uHorizon, uGround, smoothstep(0.0, 0.08, -up));
  // Flat poster bands near the horizon: three soft steps of the horizon colour.
  float band = smoothstep(0.0, 0.02, up) * (1.0 - smoothstep(0.1, 0.2, up));
  col = mix(col, uHorizon * 1.04, band * 0.25);
  float s = max(0.0, dot(d, normalize(uSunDir)));
  float vis = smoothstep(-0.12, 0.02, uSunDir.y);
  col += uSun * (pow(s, 12.0) * 0.35 + pow(s, 120.0) * 0.6) * vis;
  col = mix(col, uSun * 1.15, smoothstep(0.9975, 0.9985, s) * vis);
  // Stars at night, above the haze.
  if (uNight > 0.01 && up > 0.05) {
    vec2 g = vec2(atan(d.z, d.x) * 120.0, up * 160.0);
    vec2 cell = floor(g);
    float h = hash(cell);
    vec2 f = fract(g) - 0.5;
    float star = step(0.985, h) * smoothstep(0.18, 0.0, length(f)) * smoothstep(0.05, 0.3, up);
    col += vec3(1.0, 0.95, 0.85) * star * uNight * (0.5 + 0.5 * hash(cell + 7.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

export function applySky(mat: THREE.ShaderMaterial, t: SkyTone): void {
  mat.uniforms.uZenith!.value.copy(t.zenith);
  mat.uniforms.uHorizon!.value.copy(t.horizon);
  mat.uniforms.uGround!.value.copy(t.ground);
  mat.uniforms.uSun!.value.copy(t.sun);
  mat.uniforms.uSunDir!.value.copy(t.sunDir);
  mat.uniforms.uNight!.value = t.night;
}

/** A sky sphere that rides with the camera, drawn after everything opaque so it shades only the open sky. `tone` is read every frame, so the caller may mutate it in place. */
export function SkyDome({ tone }: { tone: SkyTone }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(makeSkyMaterial, []);
  useFrame(({ camera }) => {
    applySky(mat, tone);
    mesh.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={mesh} material={mat} raycast={noRay} frustumCulled={false} renderOrder={20}>
      <sphereGeometry args={[450, 32, 16]} />
    </mesh>
  );
}

/** Keeps the scene fog on the horizon colour so the far city melts into the sky. */
export function HorizonFog({ tone, near, far }: { tone: SkyTone; near: number; far: number }) {
  const fog = useMemo(() => new THREE.Fog('#ffffff', near, far), [near, far]);
  useFrame(({ scene }) => {
    if (scene.fog !== fog) scene.fog = fog;
    fog.color.copy(tone.horizon);
  });
  useEffect(
    () => () => {
      fog.color.set('#ffffff');
    },
    [fog],
  );
  return null;
}

// ---- Distant towers -------------------------------------------------------------------------------------------

function vc(g: THREE.BufferGeometry, colour: string, win: boolean): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(colour);
  const n = ng.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  ng.deleteAttribute('uv');
  return markWindows(ng, win);
}

/** A unit-high rocket tower (radius 1): a shaft with a coloured collar, a stepped crown and a needle. */
export function rocketTowerGeometry(accent: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.82, 1, 0.78, 14, 1);
  shaft.translate(0, 0.39, 0);
  parts.push(vc(shaft, '#efe6cf', true));
  const collar = new THREE.CylinderGeometry(0.9, 0.9, 0.04, 14, 1);
  collar.translate(0, 0.2, 0);
  parts.push(vc(collar, accent, false));
  const crown = new THREE.CylinderGeometry(0.55, 0.84, 0.1, 14, 1);
  crown.translate(0, 0.83, 0);
  parts.push(vc(crown, accent, false));
  const cap = new THREE.CylinderGeometry(0.18, 0.5, 0.1, 12, 1);
  cap.translate(0, 0.93, 0);
  parts.push(vc(cap, '#e7dcc1', false));
  const needle = new THREE.CylinderGeometry(0.02, 0.06, 0.12, 6, 1);
  needle.translate(0, 1.04, 0);
  parts.push(vc(needle, '#c9cdd1', false));
  return mergeGeometries(parts, false)!;
}

/** A unit-high slab tower (1 x 1 footprint): a block with a coloured base and a roof cap. */
export function slabTowerGeometry(accent: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(1, 0.94, 1);
  body.translate(0, 0.47, 0);
  parts.push(vc(body, '#ece3cc', true));
  const base = new THREE.BoxGeometry(1.04, 0.06, 1.04);
  base.translate(0, 0.03, 0);
  parts.push(vc(base, accent, false));
  const cap = new THREE.BoxGeometry(1.06, 0.06, 1.06);
  cap.translate(0, 0.97, 0);
  parts.push(vc(cap, '#b8b09c', false));
  return mergeGeometries(parts, false)!;
}

export interface Tower {
  x: number;
  z: number;
  r: number;
  h: number;
  round: boolean;
  accent: 0 | 1;
  /** Optional per-tower tint multiplied into its colours. */
  tint?: string;
}

const TINTS = ['#ffffff', '#e2efe9', '#fff0dc', '#f6e6e0', '#e6edf2'];

/** A deterministic ring of towers between two radii around a centre, sparing an optional arc (a bay). */
export function towerRing(cx: number, cz: number, r0: number, r1: number, n: number, seed: number, spare?: (x: number, z: number) => boolean): Tower[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Tower[] = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = r0 + (r1 - r0) * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    if (spare && spare(x, z)) continue;
    const far = (rr - r0) / Math.max(1, r1 - r0);
    const round = rnd() < 0.55;
    out.push({ x, z, r: round ? 1.4 + rnd() * 1.4 : 2.4 + rnd() * 2.6, h: 8 + rnd() * 11 + far * 9, round, accent: rnd() < 0.5 ? 0 : 1, tint: TINTS[Math.floor(rnd() * TINTS.length)] });
  }
  return out;
}

/** The instanced ring: four meshes (round and slab, two accents) sharing one window material. */
export function Skyline({ towers, windows, castShadow = false }: { towers: Tower[]; windows: WindowUniforms; castShadow?: boolean }) {
  const geos = useMemo(
    () => ({
      round0: rocketTowerGeometry('#d2a23a'),
      round1: rocketTowerGeometry('#2f7f7a'),
      slab0: slabTowerGeometry('#d2a23a'),
      slab1: slabTowerGeometry('#2f7f7a'),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      round: patchWindows(new THREE.MeshLambertMaterial({ vertexColors: true }), windows, 'round'),
      slab: patchWindows(new THREE.MeshLambertMaterial({ vertexColors: true }), windows, 'grid'),
    }),
    [windows],
  );
  const groups = useMemo(() => {
    const g: Record<'round0' | 'round1' | 'slab0' | 'slab1', Tower[]> = { round0: [], round1: [], slab0: [], slab1: [] };
    for (const t of towers) g[`${t.round ? 'round' : 'slab'}${t.accent}` as const].push(t);
    return g;
  }, [towers]);
  return (
    <group>
      {(Object.keys(groups) as (keyof typeof groups)[]).map((k) => (
        <TowerInstances key={k} list={groups[k]} geo={geos[k]} mat={k.startsWith('round') ? mats.round : mats.slab} castShadow={castShadow} />
      ))}
    </group>
  );
}

function TowerInstances({ list, geo, mat, castShadow }: { list: Tower[]; geo: THREE.BufferGeometry; mat: THREE.Material; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach((tw, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 0.7) % (Math.PI / 2));
      t.compose(new THREE.Vector3(tw.x, 0, tw.z), q, new THREE.Vector3(tw.r, tw.h, tw.r));
      m.setMatrixAt(i, t);
      m.setColorAt(i, c.set(tw.tint ?? '#ffffff'));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} raycast={noRay} castShadow={castShadow} receiveShadow={false} />;
}

export { windowUniforms };
