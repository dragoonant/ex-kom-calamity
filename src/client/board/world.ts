// World scale, the camera rig and screen<->tile helpers. One tile is 1 world unit (about 8 m); a walker stands about 1.1.
import * as THREE from 'three';

export const LEVEL_H = 0.38;
export const MOUSE_KEY = 'ib-mouse';

export interface Rig { target: THREE.Vector3; yaw: number; pitch: number; distance: number }
export const rig: Rig = { target: new THREE.Vector3(0, 0, 1.2), yaw: Math.PI * 0.06, pitch: 1.0, distance: 21 };
export function frameField(): void { rig.target.set(0, 0, 1.2); rig.yaw = Math.PI * 0.06; rig.pitch = 1.0; rig.distance = 21; }
/** Cinematic override for close-ups (PLAN Q5); null when the player drives the camera. */
export const shot: { active: boolean; from: Rig | null; to: Rig | null; t: number; dur: number } = { active: false, from: null, to: null, t: 0, dur: 0.5 };

export const live: { camera: THREE.Camera | null; canvas: HTMLCanvasElement | null; w: number; h: number } = { camera: null, canvas: null, w: 14, h: 18 };

export function tileToWorld(x: number, y: number, level = 0): THREE.Vector3 {
  return new THREE.Vector3(x - live.w / 2 + 0.5, level * LEVEL_H, y - live.h / 2 + 0.5);
}
export function worldToTile(p: THREE.Vector3): { x: number; y: number } {
  return { x: Math.floor(p.x + live.w / 2), y: Math.floor(p.z + live.h / 2) };
}

export function clampRig(r: Rig = rig): void {
  r.pitch = Math.min(1.35, Math.max(0.35, r.pitch));
  r.distance = Math.min(30, Math.max(3.2, r.distance));
  r.target.x = Math.min(live.w / 2 + 2, Math.max(-live.w / 2 - 2, r.target.x));
  r.target.z = Math.min(live.h / 2 + 2, Math.max(-live.h / 2 - 2, r.target.z));
}

export function applyRig(camera: THREE.Camera, r: Rig = rig): void {
  const cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
  camera.position.set(r.target.x + Math.sin(r.yaw) * cp * r.distance, r.target.y + sp * r.distance, r.target.z + Math.cos(r.yaw) * cp * r.distance);
  camera.lookAt(r.target);
}

export function lerpRig(a: Rig, b: Rig, t: number): Rig {
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return { target: a.target.clone().lerp(b.target, t), yaw: a.yaw + dy * t, pitch: a.pitch + (b.pitch - a.pitch) * t, distance: a.distance + (b.distance - a.distance) * t };
}

const ray = new THREE.Raycaster();
export function groundAtScreen(cx: number, cy: number, y = 0): THREE.Vector3 | null {
  if (!live.camera || !live.canvas) return null;
  const r = live.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), live.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const out = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, out) ? out : null;
}

export function screenOf(p: THREE.Vector3): { x: number; y: number } | null {
  if (!live.camera || !live.canvas) return null;
  const r = live.canvas.getBoundingClientRect();
  const v = p.clone().project(live.camera);
  if (v.z > 1) return null;
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}

export type MouseMode = 'two-button' | 'three-button';
export function readMouseMode(): MouseMode {
  try { return localStorage.getItem(MOUSE_KEY) === 'three-button' ? 'three-button' : 'two-button'; } catch { return 'two-button'; }
}
export function rememberThreeButton(): void { try { localStorage.setItem(MOUSE_KEY, 'three-button'); } catch { /* refused storage */ } }
