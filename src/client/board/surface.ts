// Surface textures for the battle's tiles (round 10, docs/art/round-10.md): one texture array of generated,
// seamless material swatches (public/textures/tiles.webp, a vertical strip of square layers, and tiles.json with each
// layer's name and mean colour), sampled by the shader from world position (triplanar), so a wall of separate tile
// boxes reads as one brick wall and nothing needs UVs. The texture adds detail only: the colour each tile already
// gets (style palette, damage, visibility, path, hover) is multiplied by the swatch divided by its own mean, so every
// overlay keeps its meaning (VIEW-1, STR-3) and the palette keys of docs/art/tile-set.md section 2 stay the colours.
// Presentation only, like the props (RULING MAP-9); PLAIN scenery and a missing file both draw the plain colours.
// Pure three.js: no React here.
import * as THREE from 'three';
import type { BuildingStyle } from '../../data';
import type { Tile } from '../../engine';

/** The layers of the strip, in order (tools/concept/pack_textures.py writes the same list into tiles.json). */
export const SURFACES = [
  'brick',
  'render',
  'ashlar',
  'steel',
  'enamel',
  'plaster',
  'parquet',
  'linoleum',
  'marble',
  'concrete',
  'chequer',
  'paving',
  'tar',
  'gravel',
  'lead',
  'asphalt',
] as const;
export type Surface = (typeof SURFACES)[number];
const LAYER: Record<Surface, number> = Object.fromEntries(SURFACES.map((s, i) => [s, i])) as Record<Surface, number>;

const OUTER: Record<BuildingStyle | 'street', Surface> = { residential: 'brick', office: 'render', bank: 'ashlar', depot: 'steel', automat: 'enamel', street: 'brick' };
const FLOOR: Record<BuildingStyle | 'street', Surface> = { residential: 'parquet', office: 'linoleum', bank: 'marble', depot: 'concrete', automat: 'linoleum', street: 'paving' };
const ROOF: Record<BuildingStyle | 'street', Surface> = { residential: 'tar', office: 'gravel', bank: 'lead', depot: 'tar', automat: 'tar', street: 'paving' };

/** The swatch a tile's body wears, or null for none (doors, voids). Mirrors baseColour in tileset.ts. */
export function surfaceOf(t: Pick<Tile, 'kind' | 'material'>, style: BuildingStyle | 'street', isRoof: boolean): Surface | null {
  switch (t.kind) {
    case 'ground':
      return 'paving';
    case 'floor':
      return isRoof ? ROOF[style] : FLOOR[style];
    case 'wall':
    case 'window':
      return t.material === 'plaster' ? 'plaster' : t.material === 'steel' ? 'steel' : OUTER[style];
    case 'stair':
    case 'rubble':
      return 'concrete';
    default:
      return null;
  }
}

/** The per-instance attribute value for a surface (-1: untextured). */
export function surfaceLayer(s: Surface | null): number {
  return s === null ? -1 : LAYER[s];
}

export interface SurfaceUniforms {
  uSurfTex: { value: THREE.DataArrayTexture | null };
  /** Each layer's mean colour, so the swatch only adds detail. */
  uSurfMean: { value: THREE.Vector3[] };
  /** 0 draws plain colours (PLAIN scenery, or before the strip loads), 1 the full swatch detail. */
  uSurfOn: { value: number };
  /** World units per repeat of a swatch. */
  uSurfScale: { value: number };
}

export const SURFACE_UNIFORMS: SurfaceUniforms = {
  uSurfTex: { value: null },
  uSurfMean: { value: SURFACES.map(() => new THREE.Vector3(0.5, 0.5, 0.5)) },
  uSurfOn: { value: 0 },
  uSurfScale: { value: 2 },
};

export type SurfaceState = 'loading' | 'ready' | 'failed';
let state: SurfaceState = 'loading';
let started: Promise<SurfaceState> | null = null;
export const surfaceState = (): SurfaceState => state;

/** Loads the strip once; resolves 'failed' (and the tiles stay plain) if either file is missing. */
export function loadSurfaces(base = 'textures/'): Promise<SurfaceState> {
  if (started) return started;
  started = (async () => {
    try {
      const meta = (await (await fetch(`${base}tiles.json`)).json()) as { size: number; layers: string[]; mean: number[][] };
      const r = await fetch(`${base}tiles.webp`);
      if (!r.ok) throw new Error(`tiles.webp: ${r.status}`);
      const bmp = await createImageBitmap(await r.blob());
      const size = meta.size;
      const n = meta.layers.length;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size * n;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bmp, 0, 0);
      const data = new Uint8Array(ctx.getImageData(0, 0, size, size * n).data.buffer);
      const tex = new THREE.DataArrayTexture(data, size, size, n);
      tex.format = THREE.RGBAFormat;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      SURFACE_UNIFORMS.uSurfTex.value = tex;
      // Means are in sRGB 0-255 in the file; the shader compares in linear light like the sampled texels.
      const lin = (v: number) => Math.pow(v / 255, 2.2);
      SURFACE_UNIFORMS.uSurfMean.value = SURFACES.map((name) => {
        const i = meta.layers.indexOf(name);
        const m = i >= 0 ? meta.mean[i]! : [128, 128, 128];
        return new THREE.Vector3(lin(m[0]!), lin(m[1]!), lin(m[2]!));
      });
      state = 'ready';
    } catch {
      state = 'failed';
    }
    return state;
  })();
  return started;
}

/** Adds the per-instance `aSurf` attribute (one float per instance) to a geometry and returns it. */
export function withSurfaceAttribute(g: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(-1), 1);
  g.setAttribute('aSurf', attr);
  return attr;
}

/** Patches an instanced standard material in place to wear the swatches; returns it. */
export function patchSurface<T extends THREE.MeshStandardMaterial>(mat: T, u: SurfaceUniforms = SURFACE_UNIFORMS): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aSurf;
varying float vSurf;
varying vec3 vSurfW;
varying vec3 vSurfN;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 sP = vec4(transformed, 1.0);
  mat3 sM = mat3(modelMatrix);
#ifdef USE_INSTANCING
  sP = instanceMatrix * sP;
  sM = sM * mat3(instanceMatrix);
#endif
  vSurfW = (modelMatrix * sP).xyz;
  vSurfN = normalize(sM * objectNormal);
  vSurf = aSurf;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uSurfTex;
uniform vec3 uSurfMean[${SURFACES.length}];
uniform float uSurfOn;
uniform float uSurfScale;
varying float vSurf;
varying vec3 vSurfW;
varying vec3 vSurfN;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uSurfOn > 0.0 && vSurf > -0.5) {
  int li = int(vSurf + 0.5);
  float layer = float(li);
  vec3 n = abs(normalize(vSurfN));
  vec3 w = pow(n, vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 p = vSurfW / uSurfScale;
  vec3 tx = texture(uSurfTex, vec3(p.zy * vec2(1.0, -1.0), layer)).rgb;
  vec3 ty = texture(uSurfTex, vec3(p.xz, layer)).rgb;
  vec3 tz = texture(uSurfTex, vec3(p.xy * vec2(1.0, -1.0), layer)).rgb;
  vec3 t = tx * w.x + ty * w.y + tz * w.z;
  vec3 detail = clamp(t / max(uSurfMean[li], vec3(0.02)), 0.35, 1.8);
  diffuseColor.rgb *= mix(vec3(1.0), detail, uSurfOn);
}`,
      );
  };
  mat.customProgramCacheKey = () => 'ekc-surface';
  return mat;
}
