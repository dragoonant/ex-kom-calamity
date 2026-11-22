// Shared board geometry and the live camera handle the hook reads (KB gotchas: read the live camera, never a
// hard-coded one). Tile (x, y, level) -> world (x + 0.5, level * LEVEL_H, y + 0.5): x east, z south, y up.
import * as THREE from 'three';
import { browserStorage } from '../save';
import { readViewSettings } from '../viewSettings';
import type { Pos } from '../../engine';
import type { CameraPose } from '../hook';

export const LEVEL_H = 2.0;
export const TILE = 1;
export const FIGURE_H = 1.2;
export const MOUSE_KEY = 'ekc-mouse';

export function tileToWorld(p: Pos, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p.x + 0.5, p.level * LEVEL_H, p.y + 0.5);
}

export const rig: CameraPose = {
  yaw: Math.PI * 0.22,
  pitch: 0.95,
  distance: 24,
  target: { x: 8, z: 6 },
};

/** The map's footprint, set when a battle opens, so the camera target stays over the block. */
export const bounds = { width: 16, depth: 12, maxDistance: 110 };

/** Centres the camera on a tile (a new raid, Continue, picking an agent from the squad panel). */
export function focusOn(p: { x: number; y: number }): void {
  rig.target.x = p.x + 0.5;
  rig.target.z = p.y + 0.5;
  clampRig();
}

export const PITCH_MIN = 0.35;
export const PITCH_MAX = 1.45;
export const DIST_MIN = 5;
export const DIST_MAX = 110;

export function clampRig(): void {
  rig.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, rig.pitch));
  rig.distance = Math.min(bounds.maxDistance ?? DIST_MAX, Math.max(DIST_MIN, rig.distance));
  rig.target.x = Math.min(bounds.width + 6, Math.max(-6, rig.target.x));
  rig.target.z = Math.min(bounds.depth + 6, Math.max(-6, rig.target.z));
}

/**
 * D21 f: the camera shake of a blast or a collapse. `amp` is world units of jolt, decayed by the effects each frame;
 * `enabled` is the player's switch (viewSettings.ts, `ekc-view`). The shake moves the eye only, never the rig, so
 * picking and the hook's camera() read the steady pose.
 */
export const shake = { amp: 0, enabled: true };

/**
 * The shadows switch (viewSettings.ts; setShadows flips it live) and the detail tier: 'low' on a software renderer
 * (SwiftShader, llvmpipe), where every shader instruction runs on the CPU, so facades and the hall floor draw flat
 * and no shadow map is made; `?detail=full` or `?detail=low` on the URL overrides the guess (D28).
 */
export const view: { shadows: boolean; detail: 'full' | 'low' } = { shadows: true, detail: 'full' };

let detailFor: THREE.WebGLRenderer | null = null;

/** Picks the detail tier from the renderer's own name, once per renderer, before the first shader compiles. */
export function detectDetail(gl: THREE.WebGLRenderer): 'full' | 'low' {
  if (detailFor === gl) return view.detail;
  detailFor = gl;
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(window.location.search).get('detail');
  } catch {
    forced = null;
  }
  if (forced === 'full' || forced === 'low') return (view.detail = forced);
  // The player's SCENERY / PLAIN switch (title, city console; RULING ART-11) comes next, then the renderer's name.
  const picked = readViewSettings(browserStorage()).scenery;
  if (picked === 'full' || picked === 'plain') return (view.detail = picked === 'full' ? 'full' : 'low');
  const ctx = gl.getContext();
  const ext = ctx.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
  return (view.detail = /swiftshader|llvmpipe|software|softpipe/i.test(name) ? 'low' : 'full');
}

/** Whether the board throws shadows now: the switch, on the full tier only. */
export function shadowsActive(): boolean {
  return view.shadows && view.detail === 'full';
}

/** Turns the board's shadow map on or off; every lit material recompiles once. */
export function setShadows(on: boolean): void {
  view.shadows = on;
  const r = live.renderer;
  const active = shadowsActive();
  if (!r || r.shadowMap.enabled === active) return;
  r.shadowMap.enabled = active;
  live.scene?.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
    else if (m) m.needsUpdate = true;
  });
}

/** Adds a jolt; nearby and big events call this with up to about 0.4. */
export function kickShake(amount: number): void {
  if (!shake.enabled) return;
  shake.amp = Math.min(0.6, Math.max(shake.amp, amount));
}

export function applyRig(camera: THREE.Camera, levelY: number): void {
  const cp = Math.cos(rig.pitch);
  const tx = rig.target.x;
  const ty = levelY;
  const tz = rig.target.z;
  camera.position.set(tx + rig.distance * Math.sin(rig.yaw) * cp, ty + rig.distance * Math.sin(rig.pitch), tz + rig.distance * Math.cos(rig.yaw) * cp);
  camera.lookAt(tx, ty, tz);
  if (shake.amp > 0.002 && shake.enabled) {
    const t = performance.now() / 1000;
    const a = shake.amp * Math.min(1, rig.distance / 18);
    camera.position.x += Math.sin(t * 47) * a;
    camera.position.y += Math.sin(t * 59 + 1) * a * 0.6;
    camera.position.z += Math.sin(t * 41 + 2) * a;
  }
}

/** Live handles set by the scene; null before the board mounts. */
export const live: {
  camera: THREE.Camera | null;
  canvas: HTMLCanvasElement | null;
  renderer: THREE.WebGLRenderer | null;
  tileMeshes: THREE.InstancedMesh[];
  tileOfInstance: Map<THREE.InstancedMesh, (instanceId: number) => Pos | null>;
  levelY: number;
  /** The tile set's dressing layers as last filled (counts per layer), for the perf hook and tests. */
  dressing: { layers: { kind: string; count: number; capacity: number }[]; active: number } | null;
  /** The last 120 frame times in ms, newest last (useFrame dt), for the perf hook. */
  frameMs: number[];
  /** The board's scene, for the perf hook's figure count. */
  scene: THREE.Scene | null;
  /** D21: live effect counts as last drawn (Effects.tsx), for the perf hook and the e2e. */
  fx: { glow: number; smoke: number; chunks: number; tracers: number; scorches: number; lights: number; emitters: number };
} = { camera: null, canvas: null, renderer: null, tileMeshes: [], tileOfInstance: new Map(), levelY: 0, dressing: null, frameMs: [], scene: null, fx: { glow: 0, smoke: 0, chunks: 0, tracers: 0, scorches: 0, lights: 0, emitters: 0 } };

/** What window.__ekc.perf() reports: draw calls and triangles of the last frame, instance counts, frame times. */
export interface PerfReport {
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  /** Instances per dressing layer as last filled. */
  layers: Record<string, number>;
  tileInstances: number;
  /** Figures as drawn this frame (M4b): generated GLBs at full detail, at the LOD level, their core glow sprites, and stand-ins. */
  figures: { glb: number; lod: number; rigged: number; glow: number; standIn: number };
  /** D21: effects alive in the last frame. */
  fx: { glow: number; smoke: number; chunks: number; tracers: number; scorches: number; lights: number; emitters: number };
  /** Mean and worst of the last frames, ms; 0 when no frame has run. */
  frameMsMean: number;
  frameMsMax: number;
  frames: number;
}

export function perfReport(): PerfReport | null {
  const r = live.renderer;
  if (!r) return null;
  const layers: Record<string, number> = {};
  for (const l of live.dressing?.layers ?? []) layers[l.kind] = l.count;
  const f = live.frameMs;
  const mean = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  const figures = { glb: 0, lod: 0, rigged: 0, glow: 0, standIn: 0 };
  live.scene?.traverse((o) => {
    if (!o.visible) return;
    if (o.name === 'glb') figures.glb += 1;
    else if (o.name === 'glb-lod') figures.lod += 1;
    else if (o.name === 'glb-rigged') figures.rigged += 1;
    else if (o.name === 'glow') figures.glow += 1;
    else if (o.name === 'body') figures.standIn += 1;
  });
  return {
    drawCalls: r.info.render.calls,
    triangles: r.info.render.triangles,
    programs: r.info.programs?.length ?? 0,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    layers,
    tileInstances: live.tileMeshes.reduce((a, m) => a + m.count, 0),
    figures,
    fx: { ...live.fx },
    frameMsMean: mean,
    frameMsMax: f.length ? Math.max(...f) : 0,
    frames: f.length,
  };
}

export function worldToScreen(v: THREE.Vector3): { x: number; y: number } | null {
  if (!live.camera || !live.canvas) return null;
  const p = v.clone().project(live.camera);
  if (p.z > 1 || p.z < -1) return null;
  const r = live.canvas.getBoundingClientRect();
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
}

const raycaster = new THREE.Raycaster();

/** The tile under a page point by the same raycast the tiles' own handlers use; figures never count. */
export function tileAtScreen(x: number, y: number): Pos | null {
  if (!live.camera || !live.canvas) return null;
  const r = live.canvas.getBoundingClientRect();
  const nx = ((x - r.left) / r.width) * 2 - 1;
  const ny = -(((y - r.top) / r.height) * 2 - 1);
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), live.camera);
  const hits = raycaster.intersectObjects(live.tileMeshes, false);
  for (const h of hits) {
    const mesh = h.object as THREE.InstancedMesh;
    const f = live.tileOfInstance.get(mesh);
    if (f && h.instanceId !== undefined) {
      const p = f(h.instanceId);
      if (p) return p;
    }
  }
  return null;
}

/** Ground-plane point under a page point at the active level's height, for zoom-to-cursor and panning. */
export function groundAtScreen(x: number, y: number, planeY: number): THREE.Vector3 | null {
  if (!live.camera || !live.canvas) return null;
  const r = live.canvas.getBoundingClientRect();
  const nx = ((x - r.left) / r.width) * 2 - 1;
  const ny = -(((y - r.top) / r.height) * 2 - 1);
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), live.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, out) ? out : null;
}

export function readMouseMode(): 'two-button' | 'three-button' {
  try {
    return localStorage.getItem(MOUSE_KEY) === 'three-button' ? 'three-button' : 'two-button';
  } catch {
    return 'two-button';
  }
}

export function rememberThreeButton(): void {
  try {
    localStorage.setItem(MOUSE_KEY, 'three-button');
  } catch {
    // A browser that refuses storage simply asks again next session.
  }
}
