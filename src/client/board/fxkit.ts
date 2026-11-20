// The effects' building blocks (PLAN.md D21 e, bold stylised): a camera-facing billboard batch with per-instance
// colour, alpha, size and spin in one draw, and the shapes the board draws with it. Flat, toon-edged puffs and hot
// cores in the D11 palette, not soft photographic smoke. No handlers, no raycast (KB rule 25).
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aColour; // rgb, alpha
  attribute vec2 aSize;   // size, spin
  attribute float aShape; // 0 puff, 1 flame, 2 spark, 3 ring
  varying vec2 vUv;
  varying vec4 vColour;
  varying float vShape;
  void main() {
    vUv = position.xy * 2.0;
    vColour = aColour;
    vShape = aShape;
    float c = cos(aSize.y);
    float s = sin(aSize.y);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize.x;
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    mv.xy += p;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColour;
  varying float vShape;
  void main() {
    float r = length(vUv);
    float a;
    vec3 col = vColour.rgb;
    if (vShape < 0.5) {
      // Puff: a flat disc with a toon edge and a lighter cap, lumpy at the rim.
      float ang = atan(vUv.y, vUv.x);
      float rim = 0.86 + 0.08 * sin(ang * 5.0) + 0.05 * sin(ang * 9.0 + 1.3);
      a = 1.0 - smoothstep(rim - 0.06, rim, r);
      col *= 0.82 + 0.28 * smoothstep(0.2, -0.6, vUv.y - vUv.x * 0.3);
    } else if (vShape < 1.5) {
      // Flame: a hot core fading to the rim, a teardrop pinched upward.
      vec2 q = vec2(vUv.x * (1.0 + 0.6 * max(vUv.y, 0.0)), vUv.y);
      float d = length(q);
      a = 1.0 - smoothstep(0.35, 1.0, d);
      col = mix(col, vec3(1.0, 0.97, 0.8), 1.0 - smoothstep(0.0, 0.45, d));
    } else if (vShape < 2.5) {
      // Spark: a bright point with a short glow.
      a = 1.0 - smoothstep(0.0, 1.0, r);
      a = a * a;
      col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, 0.3, r));
    } else {
      // Ring: a thin bright band (a shockwave seen from any side).
      a = smoothstep(0.72, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r));
    }
    a *= vColour.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export type Shape = 0 | 1 | 2 | 3;
export const PUFF: Shape = 0;
export const FLAME: Shape = 1;
export const SPARK: Shape = 2;
export const RING: Shape = 3;

/** One batch of camera-facing quads; `additive` for light (fire, flashes, sparks), else alpha (smoke, dust). */
export class Billboards {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly center: Float32Array;
  private readonly colour: Float32Array;
  private readonly size: Float32Array;
  private readonly shape: Float32Array;
  readonly capacity: number;
  count = 0;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.center = new Float32Array(capacity * 3);
    this.colour = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity * 2);
    this.shape = new Float32Array(capacity);
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(this.center, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColour', new THREE.InstancedBufferAttribute(this.colour, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => undefined;
    this.mesh.renderOrder = additive ? 4 : 3;
    this.mesh.name = additive ? 'fx-glow' : 'fx-smoke';
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, size: number, spin: number, r: number, g: number, b: number, a: number, shape: Shape): void {
    if (this.count >= this.capacity || a <= 0.005 || size <= 0) return;
    const i = this.count++;
    this.center[i * 3] = x;
    this.center[i * 3 + 1] = y;
    this.center[i * 3 + 2] = z;
    this.colour[i * 4] = r;
    this.colour[i * 4 + 1] = g;
    this.colour[i * 4 + 2] = b;
    this.colour[i * 4 + 3] = a;
    this.size[i * 2] = size;
    this.size[i * 2 + 1] = spin;
    this.shape[i] = shape;
  }

  end(): void {
    this.geo.instanceCount = this.count;
    for (const name of ['aCenter', 'aColour', 'aSize', 'aShape']) {
      const attr = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
    }
  }
}

/** A small deterministic generator so an effect looks the same for the same fx id (no Math.random in the board). */
export function rng(seed: number): () => number {
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

/** The D11 fire ramp: white-hot to mustard to coral to soot as t goes 0..1. */
export function fireColour(t: number, out: THREE.Color): THREE.Color {
  if (t < 0.25) return out.setRGB(1, 0.95 - t * 0.6, 0.7 - t * 1.6);
  if (t < 0.6) return out.setRGB(1, 0.8 - (t - 0.25) * 1.3, 0.3 - (t - 0.25) * 0.5);
  return out.setRGB(0.85 - (t - 0.6) * 1.4, 0.34 - (t - 0.6) * 0.6, 0.12 - (t - 0.6) * 0.2);
}
