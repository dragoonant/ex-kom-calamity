// Walker part kits built in code (PLAN D3, D4). "lantern" follows the locked 02-line-walker concept: a sloped armoured
// hull holding the cockpit, no head or face, one off-centre camera turret, two whip antennas, big shoulder blocks with
// a safety-orange band, arms with three-fingered hands, thick legs with knee skirts and exposed rams at the back.
// "wedge" follows 06-enemy-walker: a forward-raked wedge hull with a red sensor slit and angular plates.
// Every part is its own group so a lost part can be hidden and thrown off as debris.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { arm as armDef, body as bodyDef, legs as legsDef, pack as packDef } from '../../engine/data';
import type { Build, Paint, PaintSlot, PartSlot, Side, WeaponSlot } from '../../engine/types';
import { tex } from './textures';

const geoCache = new Map<string, THREE.BufferGeometry>();
function rbox(w: number, h: number, d: number, r = 0.012): THREE.BufferGeometry {
  const k = `rb${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${r}`;
  let g = geoCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)); geoCache.set(k, g); }
  return g;
}
function cyl(rt: number, rb: number, h: number, seg = 12): THREE.BufferGeometry {
  const k = `cy${rt},${rb},${h},${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); geoCache.set(k, g); }
  return g;
}
/** A hull from a side profile (z forward, y up) extruded across the width. */
function hull(profile: [number, number][], width: number, key: string): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (g) return g;
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const ex = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  ex.rotateY(-Math.PI / 2);
  ex.translate(width / 2, 0, 0);
  ex.computeVertexNormals();
  // Planar UVs from the side so the paint texture reads at a sensible scale.
  const pos = ex.attributes.position!, uv = ex.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 1.6 + pos.getZ(i) * 1.6, pos.getY(i) * 1.6);
  geoCache.set(key, ex);
  return ex;
}

export interface PartMats { body: THREE.MeshStandardMaterial; armL: THREE.MeshStandardMaterial; armR: THREE.MeshStandardMaterial; legs: THREE.MeshStandardMaterial; pack: THREE.MeshStandardMaterial }
const shared = {
  steel: new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.55, metalness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.7, metalness: 0.5 }),
  orange: new THREE.MeshStandardMaterial({ color: '#e0661c', roughness: 0.65, metalness: 0.15 }),
  lens: new THREE.MeshStandardMaterial({ color: '#0d1418', roughness: 0.12, metalness: 0.4, emissive: new THREE.Color('#3a6f70'), emissiveIntensity: 0.25 }),
  slit: new THREE.MeshStandardMaterial({ color: '#300', emissive: new THREE.Color('#ff2a12'), emissiveIntensity: 2.2, roughness: 0.4 }),
  hose: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 }),
  brass: new THREE.MeshStandardMaterial({ color: '#8a6a32', roughness: 0.4, metalness: 0.8 }),
};
export const sharedMats = shared;

export function paintMaterial(p: Paint): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: tex(p === 'slate' ? 'paint-slate' : 'paint-camo'), roughness: 0.78, metalness: 0.32, color: '#ffffff' });
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = true; o.receiveShadow = true;
  o.raycast = () => {}; // rule 25: models never take a pick
  return o;
}

export interface WalkerModel {
  root: THREE.Group;
  /** The part that leans and turns (everything above the hips). */
  upper: THREE.Group;
  parts: Record<PartSlot | 'pack', THREE.Group>;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  muzzles: Partial<Record<WeaponSlot, THREE.Object3D>>;
  mats: PartMats;
  hipY: number;
}

/** A hand weapon pointing along +z from the hand; returns the group and its muzzle. */
function buildWeapon(id: string | null, m: THREE.Material, s: number): { g: THREE.Group; muzzle: THREE.Object3D | null } {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  if (!id) return { g, muzzle: null };
  if (id === 'w-autocannon') {
    g.add(mesh(rbox(0.07 * s, 0.08 * s, 0.24 * s), shared.steel, 0, 0, 0.06 * s));
    g.add(mesh(cyl(0.065 * s, 0.065 * s, 0.05 * s, 16), shared.dark, -0.075 * s, -0.005, 0.02 * s, 0, 0, Math.PI / 2)); // drum
    for (const dx of [-0.018, 0.018]) g.add(mesh(cyl(0.012 * s, 0.012 * s, 0.34 * s, 8), shared.steel, dx * s, 0.01 * s, 0.32 * s, Math.PI / 2));
    g.add(mesh(rbox(0.06 * s, 0.05 * s, 0.06 * s), shared.dark, 0, 0.01 * s, 0.5 * s));
    muzzle.position.set(0, 0.01 * s, 0.54 * s);
  } else if (id === 'w-carbine') {
    g.add(mesh(rbox(0.06 * s, 0.07 * s, 0.2 * s), shared.steel, 0, 0, 0.05 * s));
    g.add(mesh(rbox(0.04 * s, 0.09 * s, 0.05 * s), shared.dark, 0, -0.07 * s, 0.07 * s));
    g.add(mesh(cyl(0.016 * s, 0.016 * s, 0.22 * s, 8), shared.steel, 0, 0.01 * s, 0.26 * s, Math.PI / 2));
    muzzle.position.set(0, 0.01 * s, 0.38 * s);
  } else if (id === 'w-rifle') {
    g.add(mesh(rbox(0.06 * s, 0.07 * s, 0.26 * s), m, 0, 0, 0.05 * s));
    g.add(mesh(cyl(0.014 * s, 0.014 * s, 0.5 * s, 8), shared.steel, 0, 0.01 * s, 0.42 * s, Math.PI / 2));
    g.add(mesh(cyl(0.018 * s, 0.018 * s, 0.12 * s, 10), shared.dark, 0, 0.065 * s, 0.06 * s, Math.PI / 2)); // scope
    g.add(mesh(rbox(0.035 * s, 0.035 * s, 0.05 * s), shared.dark, 0, 0.01 * s, 0.68 * s));
    muzzle.position.set(0, 0.01 * s, 0.71 * s);
  } else if (id === 'w-ramfist') {
    g.add(mesh(rbox(0.12 * s, 0.12 * s, 0.14 * s, 0.02), m, 0, 0, 0.06 * s));
    g.add(mesh(cyl(0.03 * s, 0.03 * s, 0.12 * s, 10), shared.steel, 0, 0, 0.16 * s, Math.PI / 2));
    g.add(mesh(rbox(0.15 * s, 0.15 * s, 0.06 * s, 0.015), shared.steel, 0, 0, 0.24 * s));
    muzzle.position.set(0, 0, 0.28 * s);
  } else if (id === 'w-shield') {
    const plate = mesh(rbox(0.04 * s, 0.42 * s, 0.3 * s, 0.01), m, -0.06 * s, -0.04 * s, 0.02 * s);
    g.add(plate);
    for (const [yy, zz] of [[0.15, 0.1], [0.15, -0.1], [-0.2, 0.1], [-0.2, -0.1], [0, 0.12], [0, -0.12]] as const) g.add(mesh(cyl(0.012 * s, 0.012 * s, 0.012 * s, 6), shared.steel, -0.085 * s, yy * s, zz * s, 0, 0, Math.PI / 2));
    return { g, muzzle: null };
  }
  g.add(muzzle);
  return { g, muzzle };
}

function buildArm(armId: string, weaponId: string | null, m: THREE.MeshStandardMaterial, side: 'L' | 'R', kit: string, team: Side, s: number): { g: THREE.Group; muzzle: THREE.Object3D | null } {
  const g = new THREE.Group();
  const sign = side === 'L' ? 1 : -1; // +x is the walker's left
  const a = armDef(armId);
  const thick = a.size === 'h' ? 1.18 : a.size === 'l' ? 0.82 : 1;
  // Shoulder block.
  if (kit === 'wedge') {
    g.add(mesh(rbox(0.16 * s * thick, 0.13 * s, 0.22 * s, 0.01), m, 0.06 * sign * s, 0.02 * s, 0, 0, 0, -0.18 * sign));
  } else {
    g.add(mesh(rbox(0.17 * s * thick, 0.17 * s, 0.21 * s, 0.02), m, 0.06 * sign * s, 0.02 * s, 0));
    if (team === 'player' && side === 'L') g.add(mesh(rbox(0.176 * s * thick, 0.05 * s, 0.216 * s, 0.01), shared.orange, 0.06 * sign * s, 0.05 * s, 0));
  }
  // Upper arm, elbow, forearm bent forward, hand.
  const upper = new THREE.Group();
  upper.position.set(0.07 * sign * s, -0.06 * s, 0);
  upper.rotation.x = -0.25;
  upper.add(mesh(rbox(0.085 * s * thick, 0.2 * s, 0.095 * s), shared.steel, 0, -0.1 * s, 0));
  upper.add(mesh(cyl(0.012 * s, 0.012 * s, 0.18 * s, 6), shared.hose, 0.045 * sign * s, -0.1 * s, -0.03 * s));
  upper.add(mesh(cyl(0.05 * s, 0.05 * s, 0.1 * s, 12), shared.dark, 0, -0.21 * s, 0, 0, 0, Math.PI / 2));
  const fore = new THREE.Group();
  fore.position.set(0, -0.21 * s, 0);
  fore.rotation.x = -1.3;
  fore.add(mesh(rbox(0.11 * s * thick, 0.22 * s, 0.12 * s, 0.015), m, 0, -0.11 * s, 0));
  const hand = new THREE.Group();
  hand.position.set(0, -0.24 * s, 0);
  hand.rotation.x = Math.PI / 2 + 0.15; // weapon points forward along the forearm
  hand.add(mesh(rbox(0.08 * s, 0.06 * s, 0.07 * s), shared.steel, 0, 0, 0));
  for (const fx of [-0.025, 0, 0.025]) hand.add(mesh(rbox(0.018 * s, 0.06 * s, 0.02 * s), shared.dark, fx * s, -0.04 * s, 0.03 * s));
  const w = buildWeapon(weaponId, m, s);
  w.g.position.set(0, -0.02 * s, 0.02 * s);
  hand.add(w.g);
  fore.add(hand);
  upper.add(fore);
  g.add(upper);
  return { g, muzzle: w.muzzle };
}

function buildLeg(m: THREE.MeshStandardMaterial, kit: string, s: number, thick: number): { leg: THREE.Group; knee: THREE.Group } {
  const leg = new THREE.Group();
  leg.add(mesh(cyl(0.055 * s, 0.055 * s, 0.11 * s, 12), shared.dark, 0, 0, 0, 0, 0, Math.PI / 2));
  leg.add(mesh(rbox(0.13 * s * thick, 0.24 * s, 0.15 * s, 0.015), m, 0, -0.13 * s, 0.01 * s));
  const knee = new THREE.Group();
  knee.position.set(0, -0.26 * s, 0.02 * s);
  knee.add(mesh(cyl(0.06 * s, 0.06 * s, 0.13 * s * thick, 12), shared.dark, 0, 0, 0, 0, 0, Math.PI / 2));
  // Knee skirt plate.
  knee.add(mesh(rbox(0.17 * s * thick, 0.13 * s, 0.04 * s, 0.01), m, 0, -0.02 * s, 0.085 * s, kit === 'wedge' ? -0.35 : -0.15));
  knee.add(mesh(rbox(0.15 * s * thick, 0.27 * s, 0.17 * s, 0.015), m, 0, -0.16 * s, -0.01 * s));
  // Exposed hydraulic ram behind the shin.
  knee.add(mesh(cyl(0.022 * s, 0.022 * s, 0.24 * s, 8), shared.steel, 0, -0.12 * s, -0.115 * s, 0.12));
  knee.add(mesh(cyl(0.03 * s, 0.03 * s, 0.1 * s, 8), shared.dark, 0, -0.04 * s, -0.12 * s, 0.12));
  // Broad flat foot.
  knee.add(mesh(rbox(0.2 * s * thick, 0.07 * s, 0.3 * s, 0.02), shared.steel, 0, -0.32 * s, 0.03 * s));
  knee.add(mesh(rbox(0.18 * s * thick, 0.03 * s, 0.08 * s, 0.01), m, 0, -0.28 * s, 0.14 * s, -0.4));
  leg.add(knee);
  return { leg, knee };
}

function buildPack(id: string, m: THREE.MeshStandardMaterial, s: number): { g: THREE.Group; muzzle: THREE.Object3D | null } {
  const g = new THREE.Group();
  const kind = packDef(id).kind;
  let muzzle: THREE.Object3D | null = null;
  if (kind === 'none') return { g, muzzle };
  if (id === 'pack-mortar') {
    g.add(mesh(rbox(0.2 * s, 0.16 * s, 0.14 * s), m, 0, 0, 0));
    const tube = new THREE.Group();
    tube.position.set(-0.08 * s, 0.1 * s, 0);
    tube.rotation.x = -0.5;
    tube.add(mesh(cyl(0.05 * s, 0.055 * s, 0.38 * s, 14), shared.steel, 0, 0.17 * s, 0));
    tube.add(mesh(cyl(0.062 * s, 0.062 * s, 0.05 * s, 14), shared.dark, 0, 0.35 * s, 0));
    muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.38 * s, 0); tube.add(muzzle);
    g.add(tube);
  } else if (id === 'pack-missile') {
    const box = new THREE.Group();
    box.position.set(0, 0.12 * s, -0.02 * s); box.rotation.x = -1.05;
    box.add(mesh(rbox(0.24 * s, 0.14 * s, 0.18 * s), m, 0, 0, 0));
    for (const [xx, yy] of [[-0.06, 0.03], [0.06, 0.03], [-0.06, -0.035], [0.06, -0.035]] as const) box.add(mesh(cyl(0.026 * s, 0.026 * s, 0.02 * s, 10), shared.dark, xx * s, yy * s, 0.092 * s, Math.PI / 2));
    muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.1 * s); box.add(muzzle);
    g.add(box);
  } else if (id === 'pack-sensor') {
    g.add(mesh(rbox(0.16 * s, 0.14 * s, 0.1 * s), m, 0, 0, 0));
    g.add(mesh(cyl(0.012 * s, 0.012 * s, 0.42 * s, 6), shared.steel, 0.05 * s, 0.26 * s, 0));
    const dish = mesh(new THREE.SphereGeometry(0.1 * s, 16, 6, 0, Math.PI * 2, 0, Math.PI / 3.5), shared.steel, 0.05 * s, 0.47 * s, 0, Math.PI);
    g.add(dish);
    g.add(mesh(cyl(0.006 * s, 0.006 * s, 0.3 * s, 4), shared.steel, -0.06 * s, 0.22 * s, 0));
  } else if (id === 'pack-repair') {
    g.add(mesh(rbox(0.22 * s, 0.17 * s, 0.13 * s), m, 0, 0, 0));
    const boom = new THREE.Group();
    boom.position.set(0.06 * s, 0.1 * s, 0); boom.rotation.set(-0.2, 0, 0.35);
    boom.add(mesh(rbox(0.04 * s, 0.32 * s, 0.04 * s), shared.orange, 0, 0.16 * s, 0));
    boom.add(mesh(rbox(0.035 * s, 0.035 * s, 0.18 * s), shared.orange, 0, 0.31 * s, 0.08 * s));
    boom.add(mesh(cyl(0.004 * s, 0.004 * s, 0.14 * s, 4), shared.hose, 0, 0.24 * s, 0.17 * s));
    boom.add(mesh(rbox(0.04 * s, 0.03 * s, 0.03 * s), shared.steel, 0, 0.17 * s, 0.17 * s));
    g.add(boom);
  }
  return { g, muzzle };
}

/** A complete walker facing +z, standing on y=0. */
export function buildWalker(build: Build, paint: Record<PaintSlot, Paint>, team: Side): WalkerModel {
  const b = bodyDef(build.body);
  const kit = b.kit;
  const sz = b.size === 'h' ? 1.1 : b.size === 'l' ? 0.9 : 1;
  const s = 1.15;
  const mats: PartMats = { body: paintMaterial(paint.body), armL: paintMaterial(paint.armL), armR: paintMaterial(paint.armR), legs: paintMaterial(paint.legs), pack: paintMaterial(paint.pack) };
  const root = new THREE.Group();
  const lg = legsDef(build.legs);
  const legThick = lg.size === 'h' ? 1.15 : lg.size === 'l' ? 0.85 : 1;
  const legScale = lg.size === 'l' ? 1.08 : 1;
  const hipY = 0.64 * s * legScale;

  const legs = new THREE.Group();
  legs.position.y = hipY;
  legs.add(mesh(rbox(0.32 * s * sz, 0.12 * s, 0.2 * s), shared.steel, 0, 0.02, 0)); // pelvis
  const L = buildLeg(mats.legs, kit, s * legScale, legThick), R = buildLeg(mats.legs, kit, s * legScale, legThick);
  L.leg.position.x = 0.15 * s * sz; R.leg.position.x = -0.15 * s * sz;
  legs.add(L.leg, R.leg);
  root.add(legs);

  const upper = new THREE.Group();
  upper.position.y = hipY + 0.06 * s;
  root.add(upper);

  const bodyG = new THREE.Group();
  const w = 0.46 * s * sz;
  if (kit === 'wedge') {
    const prof: [number, number][] = [[-0.2, 0.02], [0.12, 0], [0.32, 0.15], [0.14, 0.33], [-0.2, 0.31], [-0.25, 0.18]];
    bodyG.add(mesh(hull(prof.map(([z, y]) => [z * s * sz, y * s]), w, `wedge${sz}`), mats.body));
    bodyG.add(mesh(rbox(w * 0.7, 0.025 * s, 0.03 * s, 0.005), shared.slit, 0, 0.235 * s, 0.24 * s * sz, -0.65));
    bodyG.add(mesh(rbox(w * 0.92, 0.04 * s, 0.24 * s, 0.01), shared.dark, 0, 0.34 * s, -0.04 * s));
  } else {
    const prof: [number, number][] = [[-0.21, 0], [0.15, 0], [0.24, 0.1], [0.21, 0.24], [0.1, 0.33], [-0.18, 0.33], [-0.23, 0.2]];
    bodyG.add(mesh(hull(prof.map(([z, y]) => [z * s * sz, y * s]), w, `lantern${sz}`), mats.body));
    // Armoured hatch, rivets, smoke dischargers, the off-centre camera turret, two whip antennas.
    bodyG.add(mesh(rbox(w * 0.62, 0.1 * s, 0.025 * s, 0.01), mats.body, w * 0.08, 0.06 * s, 0.205 * s * sz, 0.45));
    bodyG.add(mesh(rbox(w * 0.9, 0.02 * s, 0.03 * s, 0.005), shared.steel, 0, 0.245 * s, 0.215 * s * sz, -0.35));
    for (const xx of [-0.2, 0.2]) for (const yy of [0.12, 0.22]) bodyG.add(mesh(cyl(0.008 * s, 0.008 * s, 0.01 * s, 6), shared.steel, xx * w, yy * s, 0.245 * s * sz - yy * 0.09, Math.PI / 2 - 0.2));
    for (const sx of [1, -1]) for (const k of [0, 1]) bodyG.add(mesh(cyl(0.018 * s, 0.018 * s, 0.07 * s, 8), shared.dark, sx * (w / 2 + 0.02), (0.22 + k * 0.045) * s, 0.06 * s, 1.2));
    for (const sx of [1, -1]) bodyG.add(mesh(rbox(0.025 * s, 0.14 * s, 0.3 * s * sz, 0.008), mats.body, sx * (w / 2 + 0.012), 0.09 * s, -0.01 * s));
    const cam = new THREE.Group();
    cam.position.set(-w * 0.32, 0.35 * s, -0.02 * s);
    cam.add(mesh(rbox(0.11 * s, 0.075 * s, 0.11 * s, 0.01), shared.steel, 0, 0.035 * s, 0));
    cam.add(mesh(cyl(0.018 * s, 0.018 * s, 0.03 * s, 14), shared.lens, 0.02 * s, 0.035 * s, 0.065 * s, Math.PI / 2));
    bodyG.add(cam);
    for (const xx of [0.28, 0.4]) bodyG.add(mesh(cyl(0.004 * s, 0.006 * s, 0.38 * s, 4), shared.dark, -w * xx + 0.12, 0.52 * s, -0.12 * s));
  }
  upper.add(bodyG);

  const armL = buildArm(build.armL, build.wL, mats.armL, 'L', kit, team, s * (b.size === 'h' ? 1.05 : 1));
  armL.g.position.set(w / 2 + 0.02, 0.24 * s, 0);
  const armR = buildArm(build.armR, build.wR, mats.armR, 'R', kit, team, s * (b.size === 'h' ? 1.05 : 1));
  armR.g.position.set(-w / 2 - 0.02, 0.24 * s, 0);
  upper.add(armL.g, armR.g);

  const pk = buildPack(build.pack, mats.pack, s);
  pk.g.position.set(0, 0.22 * s, -0.27 * s * sz);
  upper.add(pk.g);

  const muzzles: Partial<Record<WeaponSlot, THREE.Object3D>> = {};
  if (armL.muzzle) muzzles.L = armL.muzzle;
  if (armR.muzzle) muzzles.R = armR.muzzle;
  if (pk.muzzle) muzzles.P = pk.muzzle;

  return { root, upper, parts: { body: bodyG, armL: armL.g, armR: armR.g, legs, pack: pk.g }, legL: L.leg, legR: R.leg, kneeL: L.knee, kneeR: R.knee, muzzles, mats, hipY };
}

/** Darken a part's paint as it loses HP (a scorch read at a glance). */
export function setWear(m: THREE.MeshStandardMaterial, ratio: number): void {
  const k = ratio <= 0 ? 0.25 : ratio < 0.34 ? 0.5 : ratio < 0.67 ? 0.75 : 1;
  m.color.setScalar(k);
}

export function disposeWalker(w: WalkerModel): void {
  for (const m of Object.values(w.mats)) m.dispose();
}
