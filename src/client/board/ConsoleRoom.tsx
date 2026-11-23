// The control room round the board (PLAN.md D28; room.ts builds the geometry). Six draws: the hall and our console
// (shell), the chrome, the staff (desks and operators, animated in the vertex shader), the lamps and scopes (glow),
// the terrazzo floor and the walking supervisor. Stations between the camera and the board dissolve by an ordered
// dither (no transparency sorting), so a low or far camera always sees the board (KB gotchas). Ambient motion runs
// on the wall clock, not the sim: the room is not the battle, and it keeps working while the battle is paused.
// No handlers and no raycast anywhere (KB rule 25).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useClient } from '../store';
import { MAX_STATIONS, buildRoom, stationFade, type RoomGeometry } from './room';
import { bakeLight } from './light';
import { detectDetail, live, rig, view } from './world';

const NO_RAYCAST = () => undefined;

/** Shared by every room material, so one write a frame moves the whole room. */
const uniforms = {
  uTime: { value: 0 },
  uFade: { value: new Float32Array(MAX_STATIONS).fill(1) },
  uStride: { value: 5.6 },
};

const BAYER = /* glsl */ `
varying float vFade;
float ekcBayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int k = i.x + i.y * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[k] + 0.5) / 16.0;
}
`;

const ANIM_HEAD = /* glsl */ `
uniform float uTime;
uniform float uStride;
uniform float uFade[${MAX_STATIONS}];
attribute vec2 aAnim;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute float aStation;
varying float vFade;
mat3 ekcRot(vec3 a, float t) {
  float c = cos(t);
  float s = sin(t);
  float k = 1.0 - c;
  return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
              a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
              a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
}
`;

// Heads look across the scope and nod to it; a right hand works the switches; the walker's legs and arms swing.
const ANIM_NORMAL = /* glsl */ `
mat3 ekcR = mat3(1.0);
{
  int ty = int(aAnim.x + 0.5);
  float ph = aAnim.y;
  float t = uTime;
  vec3 up = vec3(0.0, 1.0, 0.0);
  if (ty == 1) ekcR = ekcRot(up, sin(t * 0.37 + ph) * 0.35 + sin(t * 0.93 + ph * 1.7) * 0.1) * ekcRot(aAxis, 0.12 + sin(t * 0.51 + ph * 1.3) * 0.1);
  else if (ty == 6) ekcR = ekcRot(up, sin(t * 0.21 + ph) * 0.25) * ekcRot(aAxis, -0.12 + sin(t * 0.4 + ph) * 0.08);
  else if (ty == 2) ekcR = ekcRot(aAxis, sin(t * 1.3 + ph) * 0.06);
  else if (ty == 3) ekcR = ekcRot(up, sin(t * 0.6 + ph) * 0.2) * ekcRot(aAxis, -(0.5 + 0.5 * sin(t * 2.3 + ph)) * 0.2);
  else if (ty == 4) ekcR = ekcRot(aAxis, sin(t * uStride) * 0.42);
  else if (ty == 5) ekcR = ekcRot(aAxis, -sin(t * uStride) * 0.42);
}
objectNormal = ekcR * objectNormal;
vFade = aStation < -0.5 ? 1.0 : uFade[int(aStation + 0.5)];
`;

/** The hall's own light: every surface is lifted by a share of its colour, so side walls never sink to the ground bounce. */
const AMBIENT = 0.22;

const DITHER = /* glsl */ `
if (vFade < 0.999 && vFade < ekcBayer(gl_FragCoord.xy)) discard;
`;

function roomMaterial(params: THREE.MeshStandardMaterialParameters, key: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ANIM_HEAD}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${ANIM_NORMAL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aPivot + ekcR * (transformed - aPivot);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${BAYER}`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Lamps blink at their own rates, scopes sweep with blips (one in a few is an alien contact, in coral), panels glow. */
function glowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    vertexShader: /* glsl */ `
      uniform float uFade[${MAX_STATIONS}];
      attribute vec4 aGlow;
      attribute float aStation;
      varying vec3 vCol;
      varying vec4 vGlow;
      varying float vFade;
      void main() {
        vCol = color;
        vGlow = aGlow;
        vFade = aStation < -0.5 ? 1.0 : uFade[int(aStation + 0.5)];
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vCol;
      varying vec4 vGlow;
      ${BAYER}
      float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      void main() {
        ${DITHER}
        int k = int(vGlow.x + 0.5);
        float ph = vGlow.y;
        vec3 c = vCol;
        if (k == 1) {
          float period = 1.4 + h1(ph) * 6.0;
          float on = h1(ph * 1.37 + 0.2) < 0.3 ? step(0.35, fract(uTime / period + ph)) : 1.0;
          c *= mix(0.22, 1.3, on);
        } else if (k == 2) {
          vec2 q = vGlow.zw;
          float r = length(q);
          float a = atan(q.y, q.x);
          float sw = mod(uTime * 1.3 + ph, 6.2832);
          float trail = exp(-mod(sw - a, 6.2832) * 2.2);
          float rings = (1.0 - smoothstep(0.0, 0.035, abs(r - 0.33))) + (1.0 - smoothstep(0.0, 0.035, abs(r - 0.66)));
          float cross = (1.0 - smoothstep(0.0, 0.025, abs(q.x))) + (1.0 - smoothstep(0.0, 0.025, abs(q.y)));
          vec3 phos = vec3(0.22, 0.8, 0.42);
          vec3 col = vec3(0.015, 0.06, 0.04) + phos * (trail * 0.8 + (rings + cross) * 0.12);
          for (int i = 0; i < 4; i++) {
            float fi = float(i);
            vec2 b = vec2(h1(ph + fi * 3.1) * 2.0 - 1.0, h1(ph + fi * 7.7) * 2.0 - 1.0) * 0.7 + vec2(sin(uTime * 0.05 + fi), cos(uTime * 0.04 + fi)) * 0.08;
            float since = mod(sw - atan(b.y, b.x), 6.2832);
            float g = exp(-since * 1.1) * (1.0 - smoothstep(0.035, 0.08, length(q - b)));
            vec3 bc = (i == 0 && h1(ph * 2.3) < 0.4) ? vec3(1.0, 0.42, 0.28) : phos * 1.5;
            col += bc * g * 1.8;
          }
          c = col * (1.0 - smoothstep(0.9, 1.0, r) * 0.6);
        } else if (k == 3) {
          c *= 1.2;
        } else if (k == 4) {
          c *= 0.45 + 1.1 * pow(0.5 + 0.5 * sin(uTime * 4.0 + ph), 3.0);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** The hall's terrazzo, its inlay rings round our console and the darker rubber floor under each ring of desks. */
function floorMaterial(room: RoomGeometry): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.0 });
  const floorUniforms = {
    uC: { value: new THREE.Vector2(room.centre.x, room.centre.z) },
    uRing: { value: room.walkRadius },
    uDeck: { value: new THREE.Vector2(room.deck.hx, room.deck.hz) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    if (view.detail === 'low') shader.fragmentShader = `#define EKC_LOW\n${shader.fragmentShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFloorW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFloorW;
        uniform vec2 uC;
        uniform float uRing;
        uniform vec2 uDeck;
        float fh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float band(float r, float a, float b) { float w = fwidth(r); return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r)); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vFloorW.xz - uC;
          float r = length(p);
          vec3 col = vec3(0.84, 0.81, 0.74);
          #ifndef EKC_LOW
          vec2 cell = floor(vFloorW.xz * 3.0);
          float chip = fh(cell);
          float det = 1.0 - smoothstep(0.15, 0.4, max(fwidth(vFloorW.x * 3.0), fwidth(vFloorW.z * 3.0)));
          col *= 1.0 + det * (chip > 0.85 ? 0.08 : chip < 0.1 ? -0.12 : 0.0);
          // Brass joints on a 12-unit grid.
          vec2 g = abs(fract(vFloorW.xz / 12.0) - 0.5);
          float jw = fwidth(vFloorW.x / 12.0) * 1.2;
          col = mix(col, vec3(0.78, 0.66, 0.4), smoothstep(0.5 - jw * 1.5, 0.5, max(g.x, g.y)) * 0.7);
          #endif
          // A graphite apron round our console's foot.
          vec2 dq = abs(p) - uDeck;
          float dd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0);
          col = mix(col, vec3(0.2, 0.24, 0.25), 1.0 - smoothstep(1.4, 1.6, dd));
          // Teal and mustard inlay rings the supervisor walks on.
          col = mix(col, vec3(0.25, 0.5, 0.51), band(r, uRing - 1.4, uRing + 1.4));
          col = mix(col, vec3(0.85, 0.65, 0.18), band(r, uRing + 2.2, uRing + 2.7));
          col = mix(col, vec3(0.85, 0.65, 0.18), band(r, uRing - 2.7, uRing - 2.2));
          // Rubber flooring under each ring of desks.
          col = mix(col, vec3(0.5, 0.56, 0.53), band(r, uRing + 4.0, uRing + 16.0) * 0.8);
          col = mix(col, vec3(0.5, 0.56, 0.53), band(r, uRing + 27.0, uRing + 39.0) * 0.8);
          diffuseColor.rgb *= col;
        }`,
      )
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${AMBIENT.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => `ekc-room-floor-${view.detail}`;
  return m;
}

/**
 * The low detail tier (software renderers): the same shader motion and fade on an unlit material, the light baked
 * into the vertex colours once (light.ts), so no per-pixel lighting runs on the CPU.
 */
function roomMaterialLow(key: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ANIM_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvec3 objectNormal = vec3(0.0, 1.0, 0.0);\n${ANIM_NORMAL}\ntransformed = aPivot + ekcR * (transformed - aPivot);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${BAYER}`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

const SHELL_LOW = roomMaterialLow('ekc-room-shell-low');
const FLOOR_LOW = new THREE.MeshBasicMaterial({ color: '#c9c1b0' });

const SHELL = roomMaterial({ roughness: 0.55, metalness: 0.0 }, 'ekc-room-shell');
// No environment map in the scene, so the chrome is a bright, low-metal enamel with a tight highlight.
const CHROME = roomMaterial({ roughness: 0.25, metalness: 0.3 }, 'ekc-room-chrome');
const STAFF = roomMaterial({ roughness: 0.75, metalness: 0.0 }, 'ekc-room-staff');
const GLOWING = glowMaterial();

const CAM = new THREE.Vector3();

export function ConsoleRoom() {
  const width = useClient((s) => s.game?.width ?? 0);
  const depth = useClient((s) => s.game?.depth ?? 0);
  const gl = useThree((s) => s.gl);
  const low = detectDetail(gl) === 'low';
  const room = useMemo(() => {
    if (width <= 0 || depth <= 0) return null;
    const r = buildRoom(width, depth);
    if (low) for (const g of [r.shell, r.chrome, r.staff, r.walker]) bakeLight(g, AMBIENT);
    return r;
  }, [width, depth, low]);
  const floorMat = useMemo(() => (room && !low ? floorMaterial(room) : null), [room, low]);
  const walker = useRef<THREE.Mesh>(null);
  useEffect(
    () => () => {
      if (!room) return;
      for (const g of [room.shell, room.chrome, room.staff, room.glow, room.floor, room.walker]) g.dispose();
      floorMat?.dispose();
    },
    [room, floorMat],
  );

  useFrame((state) => {
    if (!room) return;
    const t = state.clock.elapsedTime;
    uniforms.uTime.value = t;
    // The supervisor's round: about 0.9 m a second on the inlay ring.
    const speed = 5.5;
    const th = (t * speed) / room.walkRadius;
    const wx = room.centre.x + Math.sin(th) * room.walkRadius;
    const wz = room.centre.z + Math.cos(th) * room.walkRadius;
    const w = walker.current;
    if (w) {
      w.position.set(wx, 0, wz);
      w.rotation.y = Math.atan2(Math.cos(th), -Math.sin(th));
    }
    uniforms.uStride.value = (speed / 6.1) * 3.4;
    const cam = live.camera ?? state.camera;
    cam.getWorldPosition(CAM);
    const deck = { cx: room.centre.x, cz: room.centre.z, hx: room.deck.hx, hz: room.deck.hz };
    const fade = uniforms.uFade.value;
    const camY = CAM.y;
    room.stations.forEach((st, i) => {
      fade[i] = stationFade(st, CAM.x, camY, CAM.z, rig.target.x, rig.target.z, deck);
    });
    fade[MAX_STATIONS - 1] = stationFade({ x: wx, z: wz, top: -0.95 * 6.1 + 1.8 * 6.1 }, CAM.x, camY, CAM.z, rig.target.x, rig.target.z, deck);
  });

  if (!room) return null;
  return (
    <group name="console-room">
      <mesh name="room-floor" geometry={room.floor} material={floorMat ?? FLOOR_LOW} raycast={NO_RAYCAST} />
      <mesh name="room-shell" geometry={room.shell} material={low ? SHELL_LOW : SHELL} raycast={NO_RAYCAST} receiveShadow={!low} />
      <mesh name="room-chrome" geometry={room.chrome} material={low ? SHELL_LOW : CHROME} raycast={NO_RAYCAST} />
      <mesh name="room-staff" geometry={room.staff} material={low ? SHELL_LOW : STAFF} raycast={NO_RAYCAST} frustumCulled={false} />
      <mesh name="room-glow" geometry={room.glow} material={GLOWING} raycast={NO_RAYCAST} frustumCulled={false} />
      <mesh name="room-walker" ref={walker} geometry={room.walker} material={low ? SHELL_LOW : STAFF} raycast={NO_RAYCAST} frustumCulled={false} />
    </group>
  );
}
