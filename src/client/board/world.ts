// Shared board geometry and the live camera handle the hook reads (KB gotchas: read the live camera, never a
// hard-coded one). Tile (x, y, level) -> world (x + 0.5, level * LEVEL_H, y + 0.5): x east, z south, y up.
import * as THREE from 'three';
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
  distance: 17,
  target: { x: 8, z: 6 },
};

export const PITCH_MIN = 0.35;
export const PITCH_MAX = 1.45;
export const DIST_MIN = 5;
export const DIST_MAX = 40;

export function clampRig(): void {
  rig.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, rig.pitch));
  rig.distance = Math.min(DIST_MAX, Math.max(DIST_MIN, rig.distance));
  rig.target.x = Math.min(24, Math.max(-8, rig.target.x));
  rig.target.z = Math.min(20, Math.max(-8, rig.target.z));
}

export function applyRig(camera: THREE.Camera, levelY: number): void {
  const cp = Math.cos(rig.pitch);
  const tx = rig.target.x;
  const ty = levelY;
  const tz = rig.target.z;
  camera.position.set(tx + rig.distance * Math.sin(rig.yaw) * cp, ty + rig.distance * Math.sin(rig.pitch), tz + rig.distance * Math.cos(rig.yaw) * cp);
  camera.lookAt(tx, ty, tz);
}

/** Live handles set by the scene; null before the board mounts. */
export const live: {
  camera: THREE.Camera | null;
  canvas: HTMLCanvasElement | null;
  tileMeshes: THREE.InstancedMesh[];
  tileOfInstance: Map<THREE.InstancedMesh, (instanceId: number) => Pos | null>;
  levelY: number;
} = { camera: null, canvas: null, tileMeshes: [], tileOfInstance: new Map(), levelY: 0 };

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
