// A generated model (round 10: props, buildings, vehicles, craft) turned into one geometry and one material that an
// InstancedMesh can draw, fitted into the box the procedural piece it replaces occupied: standing on y = 0, centred on
// x and z, front to +z. Fitting to the old piece's box keeps every placement, footprint and test unchanged, so a GLB
// replaces a merged geometry by name (docs/art/tile-set.md section 8). Pure three.js: no React here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Fitted {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

const cache = new WeakMap<THREE.Object3D, Map<string, Fitted>>();

export interface FitOptions {
  /** The box to fill (world units). */
  box: THREE.Box3;
  /**
   * 'stretch' fills the box on every axis; 'uniform' keeps the model's proportions inside it, standing on its floor;
   * 'footprint' fills the box's footprint with the model's own proportions and follows the box's height within 40%
   * either way (a city building keeps its look whatever its floor count).
   */
  mode?: 'stretch' | 'uniform' | 'footprint';
  /** Degrees about y applied before fitting, for a model whose front is not +z; given, it also turns off the automatic quarter turn. */
  yaw?: number;
  roughness?: number;
  metalness?: number;
}

/** Merges every mesh of a loaded scene (world transforms applied) into one geometry fitted to `box`. Cached per scene and box. */
export function fitScene(scene: THREE.Object3D, opts: FitOptions): Fitted {
  const key = `${opts.box.min.toArray().join(',')}|${opts.box.max.toArray().join(',')}|${opts.mode ?? 'stretch'}|${opts.yaw ?? 0}`;
  let perScene = cache.get(scene);
  if (!perScene) cache.set(scene, (perScene = new Map()));
  const hit = perScene.get(key);
  if (hit) return hit;

  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let source: THREE.MeshStandardMaterial | null = null;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // Keep only what the instanced material reads, so geometries with different extras still merge.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    parts.push(g.index ? g.toNonIndexed() : g);
    if (!source) source = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
  });
  const geometry = parts.length === 1 ? parts[0]! : (mergeGeometries(parts, false) ?? parts[0]!);
  if (opts.yaw) geometry.rotateY((opts.yaw * Math.PI) / 180);
  geometry.computeBoundingBox();
  const want = opts.box.getSize(new THREE.Vector3());
  let size = geometry.boundingBox!.getSize(new THREE.Vector3());
  // The pipeline lays every model's long side on x (finalize.py --align); turn it a quarter when the piece it replaces
  // runs along z, so a counter or a bed keeps its footprint instead of shrinking to fit across it.
  const long = (v: THREE.Vector3) => (v.x > v.z * 1.15 ? 'x' : v.z > v.x * 1.15 ? 'z' : null);
  if (opts.yaw === undefined && long(want) && long(size) && long(want) !== long(size)) {
    geometry.rotateY(Math.PI / 2);
    geometry.computeBoundingBox();
    size = geometry.boundingBox!.getSize(new THREE.Vector3());
  }
  const have = geometry.boundingBox!;
  const centre = opts.box.getCenter(new THREE.Vector3());
  let sx = want.x / Math.max(size.x, 1e-6);
  let sy = want.y / Math.max(size.y, 1e-6);
  let sz = want.z / Math.max(size.z, 1e-6);
  if (opts.mode === 'uniform') sx = sy = sz = Math.min(sx, sy, sz);
  if (opts.mode === 'footprint') {
    sx = sz = Math.min(sx, sz);
    sy = Math.min(Math.max(sy, sx * 0.7), sx * 1.4);
  }
  const haveCentre = have.getCenter(new THREE.Vector3());
  geometry.translate(-haveCentre.x, -have.min.y, -haveCentre.z);
  geometry.scale(sx, sy, sz);
  geometry.translate(centre.x, opts.box.min.y, centre.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const src = source as THREE.MeshStandardMaterial | null;
  const material = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    color: src?.map ? new THREE.Color('#ffffff') : (src?.color ?? new THREE.Color('#cccccc')),
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.05,
  });
  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  const out = { geometry, material };
  perScene.set(key, out);
  return out;
}

/** The box a geometry occupies, for fitting a model into the procedural piece it replaces. */
export function boxOf(g: THREE.BufferGeometry): THREE.Box3 {
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox!.clone();
}
