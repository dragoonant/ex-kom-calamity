// Facade and floor surfaces drawn in the shader (docs/art/tile-set.md section 1b), so the tile set gains brick
// courses, ashlar, plaster, ribbed steel, glazed tile, floor boards, terrazzo, roofing, asphalt and paving slabs
// without a texture file (RULING ART-5 still holds: no GPU assets) and without one more draw call. The pattern runs
// in world space, so courses line up across neighbouring tiles; it fades to the flat colour where it would shimmer
// (cells under a few pixels). Each instance carries `aSurf` (side pattern, top pattern, interior-face mask,
// edge-shade mask) and `aAlt` (the interior face's colour as a ratio of the instance colour, so the visibility,
// path and hover tints of Tiles.tsx still carry through). Pure three.js: no React here.
import * as THREE from 'three';
import { view } from './world';

/** Patterns for a vertical face. */
export const SIDE = {
  plain: 0,
  brick: 1,
  ashlar: 2,
  plaster: 3,
  steel: 4,
  render: 5,
  glazed: 6,
  boards: 7,
} as const;

/** Patterns for an upward face. */
export const TOP = {
  plain: 0,
  planks: 1,
  terrazzo: 2,
  tiles: 3,
  concrete: 4,
  roofing: 5,
  asphalt: 6,
  paving: 7,
} as const;

/** Edge and face bits: -x, +x, -z, +z (west, east, north, south). */
export const EDGE = { W: 1, E: 2, N: 4, S: 8 } as const;

const COMMON = /* glsl */ `
varying vec3 vEkcW;
varying vec3 vEkcN;
varying vec4 vEkcSurf;
varying vec3 vEkcAlt;
varying vec3 vEkcLocal;
`;

const VERTEX_HEAD = /* glsl */ `
attribute vec4 aSurf;
attribute vec3 aAlt;
${COMMON}
`;

const VERTEX_BODY = /* glsl */ `
{
  vec4 ekcW = vec4(transformed, 1.0);
  vec3 ekcN = objectNormal;
  #ifdef USE_INSTANCING
    ekcW = instanceMatrix * ekcW;
    ekcN = mat3(instanceMatrix) * ekcN;
  #endif
  ekcW = modelMatrix * ekcW;
  vEkcW = ekcW.xyz;
  vEkcN = mat3(modelMatrix) * ekcN;
  vEkcSurf = aSurf;
  vEkcAlt = aAlt;
  vEkcLocal = transformed;
}
`;

const FRAGMENT_HEAD = /* glsl */ `
${COMMON}
float ekcHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ekcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ekcHash(i), ekcHash(i + vec2(1.0, 0.0)), f.x), mix(ekcHash(i + vec2(0.0, 1.0)), ekcHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 1 when a cell is several pixels across, falling to 0 where the pattern would shimmer.
float ekcDetail(vec2 p) {
  vec2 fw = fwidth(p);
  return 1.0 - smoothstep(0.12, 0.35, max(fw.x, fw.y));
}
// 1 on a joint line of a unit grid (half widths w in cell units), anti-aliased.
float ekcGrid(vec2 p, vec2 w) {
  vec2 fw = max(fwidth(p), vec2(1e-4));
  vec2 f = fract(p);
  vec2 d = min(f, 1.0 - f);
  vec2 j = 1.0 - smoothstep(w - fw * 0.7, w + fw * 0.7, d);
  return max(j.x, j.y);
}
// A running bond (bricks, ashlar, tiles, boards): base tinted per cell, joints in the mortar colour.
vec3 ekcBond(vec2 uv, vec2 size, vec2 joint, float bond, vec3 base, vec3 mortar, float vary) {
  vec2 p = uv / size;
  float row = floor(p.y);
  p.x += bond * mod(row, 2.0) + bond * 0.37 * step(0.75, bond) * ekcHash(vec2(row, 7.0));
  vec2 cell = floor(p);
  float det = ekcDetail(p);
  float j = ekcGrid(p, joint) * det;
  float t = 1.0 + (ekcHash(cell) - 0.5) * vary * det;
  return mix(base * t, mortar, j);
}
`;

/** Fragment code after the instance colour is applied: picks the pattern by face and writes the colour back. */
const FRAGMENT_SURFACE = /* glsl */ `
float ekcRough = 1.0;
{
  vec3 n = normalize(vEkcN);
  vec3 wp = vEkcW;
  int sideP = int(vEkcSurf.x + 0.5);
  int topP = int(vEkcSurf.y + 0.5);
  int inner = int(vEkcSurf.z + 0.5);
  int edges = int(vEkcSurf.w + 0.5);
  vec3 base = diffuseColor.rgb;
  vec3 col = base;
  float ao = 1.0;
  // A slow grime variation so large walls and streets are not one flat colour.
  #ifdef EKC_LOW
  float grime = 0.7;
  #else
  float grime = ekcNoise(wp.xz * 0.35 + vec2(wp.y * 0.6, 0.0));
  #endif
  if (n.y > 0.5) {
    #ifndef EKC_LOW
    vec2 uv = wp.xz;
    if (topP == 1) {
      // Floor boards along x, staggered ends.
      col = ekcBond(vec2(uv.x, uv.y), vec2(1.1, 0.17), vec2(0.012, 0.05), 0.83, base, base * 0.58, 0.22);
    } else if (topP == 2) {
      // Terrazzo slabs: fine chips on a 1-tile grid with brass-pale joints.
      float det = ekcDetail(uv * 22.0);
      float chip = ekcHash(floor(uv * 22.0));
      col = base * (1.0 + (chip > 0.82 ? 0.14 : chip < 0.12 ? -0.16 : 0.0) * det);
      col = mix(col, base * 1.18 + 0.04, ekcGrid(uv, vec2(0.012)) * ekcDetail(uv * 4.0));
      ekcRough = 0.55;
    } else if (topP == 3) {
      // Glazed floor tiles: grout on a half-tile grid.
      col = mix(base, vec3(0.86, 0.84, 0.78), ekcGrid(uv * 2.0, vec2(0.025)) * ekcDetail(uv * 6.0));
      col *= 1.0 + (ekcHash(floor(uv * 2.0)) - 0.5) * 0.06;
      ekcRough = 0.45;
    } else if (topP == 4) {
      // Concrete: mottled, with saw-cut joints every two tiles.
      col = base * (0.92 + 0.14 * ekcNoise(uv * 3.0));
      col = mix(col, base * 0.7, ekcGrid(uv * 0.5, vec2(0.006)) * ekcDetail(uv * 2.0));
    } else if (topP == 5) {
      // Roofing: rolled strips with lapped seams and a gravel speckle.
      float det = ekcDetail(uv * 30.0);
      float g = ekcHash(floor(uv * 30.0));
      col = base * (0.9 + 0.16 * ekcNoise(uv * 1.3)) * (1.0 + (g - 0.5) * 0.22 * det);
      float s = fract(uv.y / 0.8);
      col *= 1.0 - 0.18 * smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.06, 0.14, s)) * ekcDetail(uv * 4.0);
    } else if (topP == 6) {
      // Asphalt: dark, fine aggregate, worn patches.
      float det = ekcDetail(uv * 26.0);
      col = base * (0.85 + 0.25 * ekcNoise(uv * 0.6)) * (1.0 + (ekcHash(floor(uv * 26.0)) - 0.5) * 0.2 * det);
    } else if (topP == 7) {
      // Paving slabs half a tile square, each its own shade, dark joints.
      col = ekcBond(uv, vec2(0.5, 0.5), vec2(0.03, 0.03), 0.0, base, base * 0.62, 0.12);
    }
    #endif
    // Shade the floor where it meets a wall (bits: west, east, north, south).
    vec2 f = fract(wp.xz);
    if ((edges & 1) != 0) ao *= mix(0.6, 1.0, smoothstep(0.0, 0.42, f.x));
    if ((edges & 2) != 0) ao *= mix(0.6, 1.0, smoothstep(0.0, 0.42, 1.0 - f.x));
    if ((edges & 4) != 0) ao *= mix(0.6, 1.0, smoothstep(0.0, 0.42, f.y));
    if ((edges & 8) != 0) ao *= mix(0.6, 1.0, smoothstep(0.0, 0.42, 1.0 - f.y));
  } else if (n.y > -0.5) {
    bool alongZ = abs(n.x) > 0.5;
    vec2 uv = vec2(alongZ ? wp.z : wp.x, wp.y);
    int bit = alongZ ? (n.x < 0.0 ? 1 : 2) : (n.z < 0.0 ? 4 : 8);
    bool isInner = (inner & bit) != 0;
    if (isInner) {
      base = base * vEkcAlt;
      sideP = 3;
    }
    float hl = mod(wp.y, 2.0);
    #ifdef EKC_LOW
    sideP = 0;
    #endif
    if (sideP == 1) {
      // Brick, running bond: 16 courses a storey, pale lime mortar.
      col = ekcBond(uv, vec2(0.33, 0.125), vec2(0.045, 0.1), 0.5, base, mix(base, vec3(0.8, 0.76, 0.68), 0.72), 0.26);
    } else if (sideP == 2) {
      // Ashlar: big dressed blocks, fine dark joints, a rusticated band at the foot of the building.
      col = ekcBond(uv, vec2(0.66, 0.4), vec2(0.014, 0.024), 0.5, base, base * 0.68, 0.09);
      col *= 0.95 + 0.08 * ekcNoise(uv * 5.0);
      if (wp.y < 0.8) col = mix(col, base * 0.62, ekcGrid(uv / vec2(0.66, 0.2), vec2(0.03, 0.06)) * ekcDetail(uv * 5.0));
    } else if (sideP == 3) {
      // Plaster, a dark skirting and a picture rail.
      col = base * (0.97 + 0.05 * ekcNoise(uv * 6.0));
      if (hl < 0.1) col = base * 0.55;
      if (abs(hl - 1.55) < 0.025) col = base * 0.82;
    } else if (sideP == 4) {
      // Ribbed sheet steel with panel seams.
      float rib = sin(uv.x * 6.2832 / 0.14);
      col = base * (0.9 + 0.12 * rib * ekcDetail(uv * 14.0));
      col = mix(col, base * 0.6, ekcGrid(uv / vec2(1.0, 1.0), vec2(0.008)) * ekcDetail(uv * 2.0));
      ekcRough = 0.55;
    } else if (sideP == 5) {
      // Rendered panels scored on a grid.
      col = base * (0.95 + 0.08 * ekcNoise(uv * 4.0));
      col = mix(col, base * 0.78, ekcGrid(uv / vec2(1.0, 0.5), vec2(0.008, 0.016)) * ekcDetail(uv * 3.0));
    } else if (sideP == 6) {
      // Glazed enamel tiles, white grout.
      col = mix(base * (1.0 + (ekcHash(floor(uv / 0.2)) - 0.5) * 0.08), vec3(0.95, 0.93, 0.88), ekcGrid(uv / 0.2, vec2(0.05)) * ekcDetail(uv * 7.0));
      ekcRough = 0.35;
    } else if (sideP == 7) {
      col = ekcBond(vec2(uv.y, uv.x), vec2(4.0, 0.12), vec2(0.0, 0.08), 0.0, base, base * 0.6, 0.1);
    }
    // Contact shade at the foot of a wall: every storey inside, the street storey outside.
    if (isInner || sideP == 3) ao *= mix(0.62, 1.0, smoothstep(0.0, 0.55, hl));
    else if (wp.y < 1.0) ao *= mix(0.72, 1.0, smoothstep(0.0, 0.4, wp.y));
  }
  col *= 0.93 + 0.1 * grime;
  diffuseColor.rgb = col * ao;
}
`;

/**
 * Teaches a standard material the surfaces above. The mesh's geometry (or its instanced attributes) must carry
 * `aSurf` (vec4) and `aAlt` (vec3); `surfaceAttributes` makes both for an instanced mesh.
 */
export function patchSurface<T extends THREE.MeshStandardMaterial>(mat: T, key = 'ekc-surface'): T {
  mat.onBeforeCompile = (shader) => {
    // The low tier (world.ts view.detail) keeps the colours, edge shading and panes, and skips the patterns.
    if (view.detail === 'low') shader.fragmentShader = `#define EKC_LOW\n${shader.fragmentShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= ekcRough;');
  };
  mat.customProgramCacheKey = () => `${key}-${view.detail}`;
  return mat;
}

/**
 * Window panes: a lit pane (aSurf.x = 1) glows in its instance colour with a blind drawn to a stable height
 * (aSurf.y is the window's draw) and a darker band of furniture below; a dark pane is deep sky-blue glass with one
 * diagonal reflection. The pane box's local x runs along the wall, y up.
 */
const FRAGMENT_PANE = /* glsl */ `
float ekcRough = 1.0;
{
  float lit = vEkcSurf.x;
  float seed = vEkcSurf.y;
  vec2 q = vEkcLocal.xy; // -0.5..0.5 across and up the pane
  vec3 g = diffuseColor.rgb;
  if (lit > 0.5) {
    float blind = 0.5 - (0.12 + 0.42 * seed);
    float glow = 1.0 - 0.35 * length(q * vec2(1.2, 1.0));
    vec3 e = g * glow;
    if (q.y > blind) e *= 0.62 + 0.1 * step(0.5, fract(q.y * 18.0));
    if (q.y < -0.28 && abs(q.x - (seed - 0.5) * 0.5) < 0.22) e *= 0.45;
    totalEmissiveRadiance = e * 1.25;
    diffuseColor.rgb = e * 0.3;
  } else {
    vec3 deep = g * 0.32;
    vec3 sky = mix(deep, g * 0.95, smoothstep(-0.6, 0.6, q.y + q.x * 0.3));
    float streak = 1.0 - smoothstep(0.03, 0.07, abs(fract(q.x * 0.9 + q.y * 0.9 + seed) - 0.5));
    diffuseColor.rgb = sky + vec3(0.22) * streak;
    totalEmissiveRadiance = sky * 0.12;
    ekcRough = 0.25;
  }
}
`;

export function patchPane<T extends THREE.MeshStandardMaterial>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_PANE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= ekcRough;');
  };
  mat.customProgramCacheKey = () => 'ekc-pane';
  return mat;
}

/** Instanced `aSurf` and `aAlt` buffers for `count` instances, defaulting to plain surfaces with no interior faces. */
export function surfaceAttributes(count: number): { surf: THREE.InstancedBufferAttribute; alt: THREE.InstancedBufferAttribute } {
  const n = Math.max(1, count);
  const alt = new Float32Array(n * 3).fill(1);
  return { surf: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), alt: new THREE.InstancedBufferAttribute(alt, 3) };
}
