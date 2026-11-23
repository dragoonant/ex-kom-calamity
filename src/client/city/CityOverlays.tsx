// What the agency knows, drawn on the city (all from the agency's own view, CVIEW-1; nothing here takes a
// pointer, KB rule 25: hover and taps come through the one pick mesh in CityScene.tsx):
// - the agency's cars: every agent on a drive (TRAVEL-1) is a car flying its leg between headquarters and the
//   building, a squad shares one larger van, and a watcher's car stands parked at the lot it watches;
// - report rings: the last watch or raid report on each building, coloured by band, fading with age;
// - slip pins: a card over each building a recent slip names, coloured by the slip's tone;
// The labels (the hovered and selected building's name card, the district names) are DOM, in labels.tsx.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFittedAsset } from '../board/assetScene';
import type { Fitted } from '../board/glbFit';
import { CITY } from '../../data/city';
import { type Band, type CityState, type Leg } from '../../city';
import { rig } from '../board/world';
import { CELL, PAL } from './cityMeshes';
import { useCity } from './store';

const noRay = () => null;
const DAY_TICKS = 144;
const ROUTE_MAX = 600;

/** What the overlays drew last frame, for the hook (window.__ekcCity.overlays()). */
export const overlayCounts = { driving: 0, parked: 0, door: 0, dashes: 0, rings: 0, pins: 0 };

/** City tenths of a cell to world units. */
export function tenthsToWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((x / 10) * CELL, 0, (y / 10) * CELL);
}

const BAND_COLOUR: Record<Band, string> = { clean: '#3fae63', low: '#d9a62e', some: '#d9533f', heavy: '#c8322a' };

// ---- Cars -----------------------------------------------------------------------------------------------------

interface Drive {
  key: string;
  leg: Leg;
  squad: boolean;
  names: string[];
}

function drivesOf(view: CityState): Drive[] {
  const byKey = new Map<string, Drive>();
  for (const a of view.agents) {
    if (!a.leg) continue;
    const squad = a.status === 'raiding';
    const key = squad ? 'squad' : `${a.id}`;
    const d = byKey.get(key);
    if (d) d.names.push(a.name);
    else byKey.set(key, { key, leg: a.leg, squad, names: [a.name] });
  }
  return [...byKey.values()];
}

/** Height over a leg: lift off, cruise, set down. */
function altitude(t: number, cruise: number): number {
  const up = Math.min(1, t * 5, (1 - t) * 5);
  return 0.5 + up * cruise;
}

/** The box the procedural car fills at scale 1 (front to +z): what a generated car or van is fitted into. */
const CAR_BOX = new THREE.Box3(new THREE.Vector3(-0.62, -0.32, -0.8), new THREE.Vector3(0.62, 0.46, 0.8));

function makeCar(scale: number, body: THREE.Material, belly: THREE.Material, glass: THREE.Material, pods: THREE.Material, model: Fitted | null = null): THREE.Group {
  const g = new THREE.Group();
  if (model) {
    // Round 10: the generated patrol car or van, fitted into the stand-in's box.
    const m = new THREE.Mesh(model.geometry, model.material);
    m.name = 'car-glb';
    m.scale.setScalar(scale);
    m.raycast = noRay;
    m.castShadow = true;
    g.add(m);
    g.userData.model = model;
    return g;
  }
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * scale, 0.9 * scale, 6, 12).rotateX(Math.PI / 2), body);
  const under = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * scale, 0.8 * scale, 6, 12).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(0, -0.12 * scale, 0), belly);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.18 * scale, -0.1 * scale), glass);
  g.add(hull, under, dome);
  for (const x of [-0.5, 0.5]) {
    const pod = new THREE.Mesh(new THREE.TorusGeometry(0.2 * scale, 0.07 * scale, 6, 14).rotateY(Math.PI / 2).translate(x * scale, 0, 0.1 * scale), pods);
    g.add(pod);
  }
  g.traverse((o) => {
    (o as THREE.Mesh).raycast = noRay;
    o.castShadow = true;
  });
  return g;
}

function AgencyCars({ view }: { view: CityState }) {
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: PAL.red, roughness: 0.35, metalness: 0.2 }),
      belly: new THREE.MeshStandardMaterial({ color: PAL.black, roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: '#2f4552', roughness: 0.1, metalness: 0.3 }),
      pods: new THREE.MeshStandardMaterial({ color: PAL.chrome, roughness: 0.3, metalness: 0.6 }),
    }),
    [],
  );
  const root = useRef<THREE.Group>(null);
  const cars = useRef(new Map<string, THREE.Group>());
  const carFit = useFittedAsset('vehicle:patrol-car', CAR_BOX, { mode: 'uniform' });
  const vanFit = useFittedAsset('vehicle:van', CAR_BOX, { mode: 'uniform' });
  // A dashed route on the ground from each car to where it is going (flat strips), and a ring at the far end.
  const dashRef = useRef<THREE.InstancedMesh>(null);
  const dashGeo = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const dashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0.85, depthWrite: false }), []);
  const goalRef = useRef<THREE.InstancedMesh>(null);
  const goalGeo = useMemo(() => new THREE.RingGeometry(1.0, 1.35, 32).rotateX(-Math.PI / 2), []);
  const goalMat = useMemo(() => new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0.8, depthWrite: false }), []);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), p: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  const drives = drivesOf(view);
  const parked = view.agents.filter((a) => a.status === 'watching' && a.building);
  const door = view.raid?.arrived ? view.raid : null;
  // The drawn tick runs smoothly between the engine's ten-minute ticks.
  const shownTick = useRef(view.tick);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    const want = new Set<string>([...drives.map((d) => d.key), ...parked.map((a) => `park-${a.id}`), ...(door ? ['door'] : [])]);
    for (const [k, car] of cars.current) {
      const big = k === 'squad' || k === 'door';
      const model = big ? vanFit : carFit;
      if (!want.has(k) || (car.userData.model ?? null) !== model) {
        g.remove(car);
        cars.current.delete(k);
      }
    }
    for (const k of want) {
      if (cars.current.has(k)) continue;
      const big = k === 'squad' || k === 'door';
      const car = makeCar(big ? 2.6 : 1.7, mats.body, mats.belly, mats.glass, mats.pods, big ? vanFit : carFit);
      car.userData.fresh = true;
      g.add(car);
      cars.current.set(k, car);
    }
  });
  useFrame((_, dt) => {
    const s = useCity.getState();
    const target = view.tick;
    if (Math.abs(target - shownTick.current) > 30) shownTick.current = target;
    else shownTick.current += (target - shownTick.current) * Math.min(1, dt * (s.paused ? 20 : 8));
    const tickNow = shownTick.current;
    const dashes = dashRef.current;
    let seg = 0;
    const dm = new THREE.Matrix4();
    const dq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const w = Math.max(0.35, rig.distance / 260);
    const goals = goalRef.current;
    let goalCount = 0;
    const gm = new THREE.Matrix4();
    for (const d of drives) {
      const car = cars.current.get(d.key);
      if (!car) continue;
      const span = Math.max(1, d.leg.arrive - d.leg.depart);
      const t = Math.min(1, Math.max(0, (tickNow - d.leg.depart) / span));
      tenthsToWorld(d.leg.fx, d.leg.fy, tmp.a);
      tenthsToWorld(d.leg.tx, d.leg.ty, tmp.b);
      tmp.p.lerpVectors(tmp.a, tmp.b, t);
      tmp.p.y = altitude(t, d.squad ? 6 : 4.5);
      car.position.copy(tmp.p);
      tmp.look.copy(tmp.b).setY(tmp.p.y);
      if (tmp.look.distanceToSquared(tmp.p) > 0.01) car.lookAt(tmp.look);
      // Dashes of one world unit with gaps of one, from under the car to the goal.
      const dx = tmp.b.x - tmp.p.x;
      const dz = tmp.b.z - tmp.p.z;
      const len = Math.hypot(dx, dz);
      const n = Math.min(Math.floor(len / 2), ROUTE_MAX - seg);
      dq.setFromAxisAngle(up, Math.atan2(dx, dz));
      for (let k = 0; k < n && dashes; k++) {
        const u = (k * 2 + 0.5) / len;
        dm.compose(new THREE.Vector3(tmp.p.x + dx * u, 0.3, tmp.p.z + dz * u), dq, new THREE.Vector3(w, 1, 1));
        dashes.setMatrixAt(seg++, dm);
      }
      if (goals && goalCount < 16) {
        const pulse = 1 + 0.12 * Math.sin(performance.now() / 240);
        gm.compose(new THREE.Vector3(tmp.b.x, 0.32, tmp.b.z), new THREE.Quaternion(), new THREE.Vector3(pulse, 1, pulse));
        goals.setMatrixAt(goalCount++, gm);
      }
    }
    overlayCounts.driving = drives.length;
    overlayCounts.parked = parked.length;
    overlayCounts.door = door ? 1 : 0;
    overlayCounts.dashes = seg;
    if (dashes) {
      dashes.count = seg;
      dashes.instanceMatrix.needsUpdate = true;
    }
    if (goals) {
      goals.count = goalCount;
      goals.instanceMatrix.needsUpdate = true;
    }
    for (const a of parked) {
      const car = cars.current.get(`park-${a.id}`);
      const def = CITY.buildings.find((b) => b.id === a.building);
      if (!car || !def) continue;
      // Parked on the pavement by the lot, one place per watcher.
      const slot = view.agents.filter((x) => x.status === 'watching' && x.building === a.building).indexOf(a);
      car.position.set(def.x * CELL + CELL * 0.86, 0.45, def.y * CELL + CELL * (0.2 + slot * 0.3));
      car.rotation.set(0, 0, 0);
    }
    if (door) {
      const car = cars.current.get('door');
      const p = placeOf(view, door.building);
      if (car && p) {
        car.position.set(p.x + CELL * 0.62, 0.7, p.z + CELL * 0.62);
        car.rotation.set(0, Math.PI * 0.75, 0);
      }
    }
  });
  return (
    <group>
      <group ref={root} />
      <instancedMesh ref={dashRef} args={[dashGeo, dashMat, ROUTE_MAX]} raycast={noRay} frustumCulled={false} renderOrder={3} />
      <instancedMesh ref={goalRef} args={[goalGeo, goalMat, 16]} raycast={noRay} frustumCulled={false} renderOrder={3} />
    </group>
  );
}

function placeOf(view: CityState, id: string): THREE.Vector3 | null {
  const b = CITY.buildings.find((x) => x.id === id);
  if (b) return new THREE.Vector3(b.x * CELL + CELL / 2, 0, b.y * CELL + CELL / 2);
  const c = view.crashes.find((x) => x.id === id);
  return c ? tenthsToWorld(c.x, c.y) : null;
}

// ---- Report rings and slip pins -------------------------------------------------------------------------------

function ReportRings({ view }: { view: CityState }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.RingGeometry(CELL * 0.4, CELL * 0.47, 40).rotateX(-Math.PI / 2), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false }), []);
  const rows = view.buildings.filter((b) => b.watch);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new THREE.Matrix4();
    const c = new THREE.Color();
    const bg = new THREE.Color('#d6cfbd');
    rows.forEach((b, i) => {
      const def = CITY.buildings.find((x) => x.id === b.id)!;
      t.makeTranslation(def.x * CELL + CELL / 2, 0.16, def.y * CELL + CELL / 2);
      m.setMatrixAt(i, t);
      // A report fades toward the pavement over four days.
      const age = Math.min(1, (view.tick - b.watch!.tick) / (4 * DAY_TICKS));
      m.setColorAt(i, c.set(BAND_COLOUR[b.watch!.band]).lerp(bg, age * 0.7));
    });
    m.count = rows.length;
    overlayCounts.rings = rows.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, CITY.buildings.length]} raycast={noRay} frustumCulled={false} renderOrder={2} />;
}

const PIN_TONE: Record<string, string> = { alert: '#d9533f', caution: '#d9a62e', note: '#3f7f82' };

function slipTone(kind: string): string {
  if (kind === 'hum' || kind === 'spotted' || kind === 'confession' || kind === 'landing') return 'alert';
  if (kind === 'power' || kind === 'perfect' || kind === 'vote') return 'caution';
  return 'note';
}

/** Slips of the last day that name a building, newest first, one pin per building. */
function pinsOf(view: CityState): { building: string; tone: string }[] {
  const seen = new Map<string, string>();
  for (const sl of [...view.slips].reverse()) {
    if (!sl.building || view.tick - sl.tick > DAY_TICKS || seen.has(sl.building)) continue;
    seen.set(sl.building, slipTone(sl.kind));
  }
  return [...seen].map(([building, tone]) => ({ building, tone }));
}

function SlipPins({ view, heights }: { view: CityState; heights: Map<string, number> }) {
  const card = useRef<THREE.InstancedMesh>(null);
  const stalk = useRef<THREE.InstancedMesh>(null);
  const cardGeo = useMemo(() => new THREE.BoxGeometry(0.9, 0.62, 0.06), []);
  const stalkGeo = useMemo(() => new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, 0.5, 0), []);
  const cardMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  const stalkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8d959b' }), []);
  const pins = pinsOf(view);
  useFrame(({ clock, camera }) => {
    const c = card.current;
    const st = stalk.current;
    if (!c || !st) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const yaw = Math.atan2(camera.position.x - rig.target.x, camera.position.z - rig.target.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    pins.forEach((p, i) => {
      const def = CITY.buildings.find((b) => b.id === p.building);
      if (!def) return;
      const top = (heights.get(p.building) ?? 2) + 0.6;
      const bob = Math.sin(clock.elapsedTime * 2 + i) * 0.12;
      const x = def.x * CELL + CELL / 2;
      const z = def.y * CELL + CELL / 2;
      const scale = Math.max(1, rig.distance / 70);
      m.compose(new THREE.Vector3(x, top + 1.1 * scale + bob, z), q, new THREE.Vector3(scale, scale, scale));
      c.setMatrixAt(i, m);
      c.setColorAt(i, col.set(PIN_TONE[p.tone] ?? '#3f7f82'));
      m.compose(new THREE.Vector3(x, top, z), new THREE.Quaternion(), new THREE.Vector3(1, 1.1 * scale + bob, 1));
      st.setMatrixAt(i, m);
    });
    c.count = st.count = pins.length;
    overlayCounts.pins = pins.length;
    c.instanceMatrix.needsUpdate = true;
    st.instanceMatrix.needsUpdate = true;
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={card} args={[cardGeo, cardMat, CITY.buildings.length]} raycast={noRay} frustumCulled={false} />
      <instancedMesh ref={stalk} args={[stalkGeo, stalkMat, CITY.buildings.length]} raycast={noRay} frustumCulled={false} />
    </group>
  );
}

export function CityOverlays({ view, heights }: { view: CityState; heights: Map<string, number> }) {
  return (
    <group>
      <AgencyCars view={view} />
      <ReportRings view={view} />
      <SlipPins view={view} heights={heights} />
    </group>
  );
}
