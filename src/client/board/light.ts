// The board's light rig in numbers (D24; docs/art/tile-set.md section 4), shared by Scene.tsx, which lights the board
// with it, and ConsoleRoom.tsx, which bakes the same light into the room's vertex colours on the low detail tier.
import * as THREE from 'three';

export const BOARD_LIGHT = {
  sun: '#ffe2bf',
  sunIntensity: 2.1,
  /** Towards the sun, from the board: low in the west, high enough for a three-storey shadow to stay near. */
  sunDir: new THREE.Vector3(-24, 22, 14).normalize(),
  sky: '#d3e0e8',
  ground: '#9c9384',
  hemiIntensity: 1.25,
  fill: '#7fa7b8',
  fillIntensity: 0.45,
  fillDir: new THREE.Vector3(18, 10, -22).normalize(),
};

const SUN = new THREE.Color();
const SKY = new THREE.Color();
const GROUND = new THREE.Color();
const FILL = new THREE.Color();
const N = new THREE.Vector3();
const L = new THREE.Color();

/**
 * Multiplies a geometry's vertex colours by the light a standard material would give each vertex under BOARD_LIGHT
 * (Lambert: the sun and the fill by the facing, the hemisphere by the normal's height, all over pi, as three.js does),
 * plus `ambient` of its own colour; the result draws unlit with MeshBasicMaterial.
 */
export function bakeLight(g: THREE.BufferGeometry, ambient: number): void {
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!col) return;
  SUN.set(BOARD_LIGHT.sun).multiplyScalar(BOARD_LIGHT.sunIntensity);
  SKY.set(BOARD_LIGHT.sky).multiplyScalar(BOARD_LIGHT.hemiIntensity);
  GROUND.set(BOARD_LIGHT.ground).multiplyScalar(BOARD_LIGHT.hemiIntensity);
  FILL.set(BOARD_LIGHT.fill).multiplyScalar(BOARD_LIGHT.fillIntensity);
  for (let i = 0; i < col.count; i++) {
    if (nor) N.set(nor.getX(i), nor.getY(i), nor.getZ(i)).normalize();
    else N.set(0, 1, 0);
    const sun = Math.max(0, N.dot(BOARD_LIGHT.sunDir));
    const fill = Math.max(0, N.dot(BOARD_LIGHT.fillDir));
    const w = N.y * 0.5 + 0.5;
    L.copy(GROUND).lerp(SKY, w);
    L.r += SUN.r * sun + FILL.r * fill;
    L.g += SUN.g * sun + FILL.g * fill;
    L.b += SUN.b * sun + FILL.b * fill;
    L.multiplyScalar(1 / Math.PI);
    col.setXYZ(i, col.getX(i) * (L.r + ambient), col.getY(i) * (L.g + ambient), col.getZ(i) * (L.b + ambient));
  }
  col.needsUpdate = true;
}
