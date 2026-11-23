// Windows drawn by the shader instead of by geometry: a standard material is patched so that every wall face
// carries a grid of panes from its world position (one floor per row), glass by day and a random share of lit
// rooms by night. One material serves a whole instanced street, so a city of hundreds of windows costs nothing
// in draws. Pure three.js: no React here.
//
// Modes:
// - 'grid': panes on any wall face where the geometry's `aWin` attribute is 1 (roofs and trims carry 0).
// - 'bands': for the procedural buildings' window strips (cityMeshes.ts), already a pane's height: only the
//   mullions are cut, and each pane is lit or dark by night.
// - 'round': as 'grid' but the pane column follows the arc of a round tower around its instance centre.
import * as THREE from 'three';

export interface WindowUniforms {
  /** 0 by day, 1 at full night: how much the lit panes glow. */
  uNight: { value: number };
  /** Share of panes lit at full night, 0 to 1. */
  uLit: { value: number };
  /** Pane pitch (x across, y floor height) in world units. */
  uPitch: { value: THREE.Vector2 };
  /** The colour of a lit room. */
  uWarm: { value: THREE.Color };
  /** The glass by day. */
  uGlass: { value: THREE.Color };
}

export function windowUniforms(pitchX = 0.55, floor = 0.75, lit = 0.55): WindowUniforms {
  return {
    uNight: { value: 0 },
    uLit: { value: lit },
    uPitch: { value: new THREE.Vector2(pitchX, floor) },
    uWarm: { value: new THREE.Color('#ffd79a') },
    uGlass: { value: new THREE.Color('#3d5866') },
  };
}

/** Adds a float attribute `aWin` (1 = this part has windows) to a geometry, for 'grid' and 'round'. */
export function markWindows(g: THREE.BufferGeometry, on: boolean): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('aWin', new THREE.BufferAttribute(new Float32Array(n).fill(on ? 1 : 0), 1));
  return g;
}

const HASH = /* glsl */ `
float ekcHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}`;

/** Patches `mat` in place; returns it. The uniforms object is shared, so one update drives every patched material. */
export function patchWindows<T extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(mat: T, u: WindowUniforms, mode: 'grid' | 'bands' | 'round'): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const useAttr = mode !== 'bands';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEkcW;
varying vec3 vEkcN;
varying vec3 vEkcC;
${useAttr ? 'attribute float aWin;\nvarying float vEkcWin;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 ekcP = vec4(transformed, 1.0);
  mat3 ekcM = mat3(modelMatrix);
  vec4 ekcC = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
  ekcP = instanceMatrix * ekcP;
  ekcM = ekcM * mat3(instanceMatrix);
  ekcC = instanceMatrix * ekcC;
#endif
  vEkcW = (modelMatrix * ekcP).xyz;
  vEkcC = (modelMatrix * ekcC).xyz;
  vEkcN = normalize(ekcM * objectNormal);
  ${useAttr ? 'vEkcWin = aWin;' : ''}
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
uniform float uLit;
uniform vec2 uPitch;
uniform vec3 uWarm;
uniform vec3 uGlass;
varying vec3 vEkcW;
varying vec3 vEkcN;
varying vec3 vEkcC;
${useAttr ? 'varying float vEkcWin;' : ''}
${HASH}
float ekcPane = 0.0;
float ekcOn = 0.0;
float ekcH = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 n = normalize(vEkcN);
  float wall = 1.0 - step(0.55, abs(n.y));
  vec3 rel = vEkcW - vEkcC;
  float u;
  float face;
${
  mode === 'round'
    ? `  u = atan(rel.z, rel.x) * length(rel.xz);
  face = 0.0;`
    : `  bool alongZ = abs(n.x) > abs(n.z);
  u = alongZ ? vEkcW.z : vEkcW.x;
  face = alongZ ? sign(n.x) * 3.0 : sign(n.z) * 7.0;`
}
  vec2 cell = vec2(u / uPitch.x, vEkcW.y / uPitch.y);
  vec2 f = fract(cell);
${
  mode === 'bands'
    ? `  ekcPane = wall * step(0.12, f.x) * step(f.x, 0.88);`
    : `  ekcPane = wall * vEkcWin * step(0.2, f.x) * step(f.x, 0.8) * step(0.32, f.y) * step(f.y, 0.8) * step(0.45, vEkcW.y);`
}
  float h = ekcHash(vec3(floor(cell), face) + floor(vEkcC * 7.13));
  ekcOn = step(h, uLit);
  ekcH = h;
  vec3 glass = uGlass * (0.85 + 0.3 * fract(h * 13.7));
${mode === 'bands' ? '  diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, diffuseColor.rgb, ekcPane);' : '  diffuseColor.rgb = mix(diffuseColor.rgb, glass, ekcPane * (0.5 + 0.5 * uNight));'}
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${
  mode === 'bands'
    ? '  totalEmissiveRadiance *= ekcPane * mix(0.12, 1.0, ekcOn);'
    : '  totalEmissiveRadiance += mix(uWarm, vec3(0.75, 0.85, 1.0), step(0.82, fract(ekcH * 7.31))) * ekcPane * ekcOn * uNight * (0.6 + 0.6 * fract(ekcH * 3.7));'
}`,
      );
  };
  mat.customProgramCacheKey = () => `ekc-windows-${mode}`;
  return mat;
}

/**
 * Round 10, mode 'mask': windows on a generated building model (docs/art/round-10.md). The model's own texture already
 * paints its windows, so the shader picks out the glass (texels clearly darker than their neighbourhood) instead of
 * cutting panes, then lights a stable hashed share of the panes by night from world position, exactly like 'grid'. With
 * `allLit` the uniforms' uLit is 1 and every pane glows the material's emissive colour (the hum and turned buildings),
 * pulsed from outside through emissiveIntensity as the procedural bands are.
 */
export function patchGlass<T extends THREE.MeshStandardMaterial>(mat: T, u: WindowUniforms, tint: 'warm' | 'emissive'): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEkcW;\nvarying vec3 vEkcN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 gP = vec4(transformed, 1.0);
  mat3 gM = mat3(modelMatrix);
#ifdef USE_INSTANCING
  gP = instanceMatrix * gP;
  gM = gM * mat3(instanceMatrix);
#endif
  vEkcW = (modelMatrix * gP).xyz;
  vEkcN = normalize(gM * objectNormal);
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
uniform float uLit;
uniform vec2 uPitch;
uniform vec3 uWarm;
uniform vec3 uGlass;
varying vec3 vEkcW;
varying vec3 vEkcN;
${HASH}
float ekcMask = 0.0;
float ekcOn = 0.0;
float ekcH = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float wall = 1.0 - step(0.6, abs(normalize(vEkcN).y));
  // Glass is what is clearly darker than its own neighbourhood (mip 4: the 16 x 16 texel average). A colour rule
  // missed grey panes and lit a blue roof; this one marks 18-27% of nine of the ten building textures (the bank 6%,
  // mostly columns), measured on the files (docs/art/round-10.md).
#ifdef USE_MAP
  float local = dot(textureLod(map, vMapUv, 4.0).rgb, vec3(0.299, 0.587, 0.114));
  ekcMask = wall * smoothstep(0.25, 0.45, 1.0 - lum / max(local, 0.001)) * (1.0 - smoothstep(0.4, 0.6, lum));
#endif
  vec3 n = normalize(vEkcN);
  bool alongZ = abs(n.x) > abs(n.z);
  float u = alongZ ? vEkcW.z : vEkcW.x;
  float face = alongZ ? sign(n.x) * 3.0 : sign(n.z) * 7.0;
  vec2 cell = floor(vec2(u / uPitch.x, vEkcW.y / uPitch.y));
  ekcH = ekcHash(vec3(cell, face));
  ekcOn = step(ekcH, uLit);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
${
  tint === 'warm'
    ? '  totalEmissiveRadiance = mix(uWarm, vec3(0.75, 0.85, 1.0), step(0.82, fract(ekcH * 7.31))) * ekcMask * ekcOn * uNight * (0.6 + 0.6 * fract(ekcH * 3.7)) * 1.4;'
    : '  totalEmissiveRadiance *= ekcMask * ekcOn;'
}`,
      );
  };
  mat.customProgramCacheKey = () => `ekc-glass-${tint}`;
  return mat;
}
