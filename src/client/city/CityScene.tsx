// The city board: one Canvas, a loop driver feeding the city clock (CLOCK-6), procedural buildings (cityMeshes.ts),
// day and night from the clock, and the two faces of the spread drawn only from what the agency has read on its
// slips (PLAN D25; CVIEW-1): buildings named in "too perfect" slips gleam by day, buildings named in power or hum
// slips pulse amber in unison by night. Picking is one invisible instanced mesh of lots (KB rule 25): nothing
// else on the board takes a pointer.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CITY } from '../../data/city';
import { cityQuery, type CityState } from '../../city';
import { feed, makeAccumulator } from '../loop';
import { CameraRig } from '../board/CameraRig';
import { RendererHandle } from '../board/Scene';
import { bounds, clampRig, rig } from '../board/world';
import { buildingGeometry, cellCentre, CELL, PAL } from './cityMeshes';
import { useCity } from './store';

const SIZE = CITY.size * CELL;
const RECENT_TICKS = 3 * 144;

function CityLoop() {
  const acc = useRef(makeAccumulator());
  useFrame((_, dt) => {
    const s = useCity.getState();
    if (!s.game || !s.active || s.fight) return;
    const tps = s.game.tuning.clock.ticksPerSecond;
    const n = feed(acc.current, dt, tps, s.speed, s.paused);
    if (n > 0) s.advanceTicks(n);
  });
  return null;
}

/** 0 at midnight, 1 at noon: drives the sky, the sun and the windows. */
function daylight(hour: number, minute: number): number {
  const h = hour + minute / 60;
  const x = Math.cos(((h - 13) / 24) * Math.PI * 2);
  return Math.min(1, Math.max(0, (x + 0.35) / 1.1));
}

function SkyAndLights({ view }: { view: CityState }) {
  const { gl } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const c = cityQuery.clock(view);
  const d = daylight(c.hour, c.minute);
  useEffect(() => {
    const day = new THREE.Color('#c9d6dc');
    const night = new THREE.Color('#1f2a3a');
    gl.setClearColor(night.clone().lerp(day, d));
    if (hemi.current) hemi.current.intensity = 0.45 + d * 1.1;
    if (sun.current) {
      sun.current.intensity = 0.15 + d * 1.6;
      const a = ((c.hour + c.minute / 60 - 6) / 12) * Math.PI;
      sun.current.position.set(Math.cos(a) * -60 + SIZE / 2, 10 + Math.max(0, Math.sin(a)) * 40, SIZE / 2 + 20);
      sun.current.color.set(d < 0.5 ? '#ffb774' : '#fff1d6');
    }
  }, [gl, d, c.hour, c.minute]);
  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe0ea', '#8a7a66', 0.9]} />
      <ambientLight intensity={0.18} />
      <directionalLight ref={sun} position={[0, 40, 20]} intensity={1.2} />
    </>
  );
}

function Ground() {
  const plates = useMemo(
    () =>
      CITY.districts.map((dist, i) => ({
        id: dist.id,
        x: dist.x * CELL + (dist.w * CELL) / 2,
        z: dist.y * CELL + (dist.d * CELL) / 2,
        w: dist.w * CELL - 0.6,
        d: dist.d * CELL - 0.6,
        colour: dist.id === 'parkside' ? '#8fb07a' : ['#d6cdb8', '#cfc6ae', '#dcd3bd', '#c9c0a8', '#d2c9b2', '#d9d0b9'][i % 6]!,
      })),
    [],
  );
  return (
    <group>
      <mesh position={[SIZE / 2, -0.05, SIZE / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SIZE + 24, SIZE + 24]} />
        <meshStandardMaterial color="#8a867c" />
      </mesh>
      {plates.map((p) => (
        <mesh key={p.id} position={[p.x, 0.0, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[p.w, p.d]} />
          <meshStandardMaterial color={p.colour} />
        </mesh>
      ))}
    </group>
  );
}

interface Lot {
  id: string;
  pos: THREE.Vector3;
  geo: ReturnType<typeof buildingGeometry>;
}

/** Each lot's pick height, for the hook to aim a tap at a building's visible top (window.__ekcCity). */
export const lotHeights = new Map<string, number>();

function useLots(): { lots: Lot[]; hq: Lot } {
  return useMemo(() => {
    const lots = CITY.buildings.map((b, i) => ({ id: b.id, pos: cellCentre(b.x, b.y), geo: buildingGeometry(b.kind, b.floors, i) }));
    for (const l of lots) lotHeights.set(l.id, Math.max(2, l.geo.height));
    const hq = { id: 'hq', pos: cellCentre(CITY.agency.hq.x, CITY.agency.hq.y), geo: buildingGeometry('hq', 3, 0) };
    return { lots, hq };
  }, []);
}

/** Which buildings the agency's own slips point at (never the hidden truth). */
function leads(view: CityState): { hum: Set<string>; perfect: Set<string>; turned: Set<string> } {
  const hum = new Set<string>();
  const perfect = new Set<string>();
  for (const sl of view.slips) {
    if (view.tick - sl.tick > RECENT_TICKS || !sl.building) continue;
    if (sl.kind === 'hum' || sl.kind === 'power') hum.add(sl.building);
    if (sl.kind === 'perfect') perfect.add(sl.building);
  }
  const turnedOrgs = new Set(view.orgs.filter((o) => o.turned).map((o) => o.id));
  const turned = new Set(CITY.buildings.filter((b) => turnedOrgs.has(b.org)).map((b) => b.id));
  return { hum, perfect, turned };
}

function Buildings({ view, lots, hq }: { view: CityState; lots: Lot[]; hq: Lot }) {
  const c = cityQuery.clock(view);
  const d = daylight(c.hour, c.minute);
  const { hum, perfect, turned } = leads(view);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }), []);
  const gleamMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.25, emissive: new THREE.Color('#fff6e0'), emissiveIntensity: 0.18 }), []);
  const winMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PAL.glass, emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0, roughness: 0.3 }), []);
  const humMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PAL.glass, emissive: new THREE.Color('#e0a030'), emissiveIntensity: 0, roughness: 0.3 }), []);
  const turnedMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: new THREE.Color('#e0a030'), emissiveIntensity: 0.9, roughness: 0.3 }), []);
  useFrame(({ clock }) => {
    winMat.emissiveIntensity = (1 - d) * 1.1;
    // The hum: every lead building pulses in unison, at night only.
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4);
    humMat.emissiveIntensity = (1 - d) * (0.4 + 1.6 * pulse) + d * 0.05;
    turnedMat.emissiveIntensity = 0.5 + 0.6 * pulse;
  });
  return (
    <group>
      {lots.map((l) => {
        const isHum = hum.has(l.id);
        const isTurned = turned.has(l.id);
        return (
          <group key={l.id} position={l.pos}>
            <mesh geometry={l.geo.body} material={perfect.has(l.id) && d > 0.3 ? gleamMat : bodyMat} raycast={() => null} />
            <mesh geometry={l.geo.windows} material={isTurned ? turnedMat : isHum ? humMat : winMat} raycast={() => null} />
          </group>
        );
      })}
      <group position={hq.pos}>
        <mesh geometry={hq.geo.body} material={bodyMat} raycast={() => null} />
        <mesh geometry={hq.geo.windows} material={winMat} raycast={() => null} />
      </group>
    </group>
  );
}

/** KB rule 25: one pick object for the whole city, an instanced box per lot. */
function PickLots({ lots }: { lots: Lot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const select = useCity((s) => s.select);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new THREE.Matrix4();
    lots.forEach((l, i) => {
      const h = Math.max(2, l.geo.height);
      t.compose(new THREE.Vector3(l.pos.x, h / 2, l.pos.z), new THREE.Quaternion(), new THREE.Vector3(CELL * 0.86, h, CELL * 0.86));
      m.setMatrixAt(i, t);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [lots]);
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.instanceId === undefined) return;
    e.stopPropagation();
    select(lots[e.instanceId]!.id);
  };
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, lots.length]} onPointerDown={onDown} data-pick="lots">
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </instancedMesh>
  );
}

function Markers({ view, lots, hq }: { view: CityState; lots: Lot[]; hq: Lot }) {
  const selected = useCity((s) => s.selected);
  const car = useRef<THREE.Group>(null);
  const sel = lots.find((l) => l.id === selected);
  const watched = new Set(view.agents.filter((a) => a.status === 'watching' && a.building).map((a) => a.building!));
  useFrame(() => {
    const g = car.current;
    if (!g) return;
    const r = view.raid;
    if (!r) {
      g.visible = false;
      return;
    }
    const to = lots.find((l) => l.id === r.building);
    if (!to) return;
    const span = Math.max(1, r.arriveTick - r.orderedTick);
    const t = r.arrived ? 1 : Math.min(1, (view.tick - r.orderedTick) / span);
    g.visible = true;
    const x = THREE.MathUtils.lerp(hq.pos.x, to.pos.x, t);
    const z = THREE.MathUtils.lerp(hq.pos.z, to.pos.z, t);
    g.position.set(x, 4 + Math.sin(t * Math.PI) * 8 + (r.arrived ? -2 : 0), z);
    g.rotation.y = Math.atan2(to.pos.x - hq.pos.x, to.pos.z - hq.pos.z);
  });
  return (
    <group>
      {sel && (
        <mesh position={[sel.pos.x, 0.08, sel.pos.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[CELL * 0.46, CELL * 0.52, 40]} />
          <meshBasicMaterial color={PAL.red} />
        </mesh>
      )}
      {lots
        .filter((l) => watched.has(l.id))
        .map((l) => (
          <mesh key={l.id} position={[l.pos.x, l.geo.height + 0.9, l.pos.z]} raycast={() => null}>
            <sphereGeometry args={[0.32, 12, 8]} />
            <meshBasicMaterial color={PAL.red} />
          </mesh>
        ))}
      <group ref={car} visible={false}>
        <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.45, 1.3, 6, 12]} />
          <meshStandardMaterial color={PAL.red} roughness={0.35} metalness={0.2} />
        </mesh>
        <mesh raycast={() => null} position={[0, 0.35, -0.1]}>
          <sphereGeometry args={[0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={PAL.glass} roughness={0.1} />
        </mesh>
        {[-0.75, 0.75].map((x) => (
          <mesh key={x} raycast={() => null} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.32, 0.1, 8, 16]} />
            <meshStandardMaterial color={PAL.chrome} metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function CityBoard() {
  const view = useCity((s) => s.view);
  const { lots, hq } = useLots();
  if (!view) return null;
  return (
    <>
      <SkyAndLights view={view} />
      <Ground />
      <Buildings view={view} lots={lots} hq={hq} />
      <PickLots lots={lots} />
      <Markers view={view} lots={lots} hq={hq} />
    </>
  );
}

export function CityScene() {
  useEffect(() => {
    bounds.width = SIZE;
    bounds.depth = SIZE;
    rig.target = { x: SIZE / 2, z: SIZE / 2 };
    rig.distance = 62;
    rig.pitch = 0.9;
    clampRig();
  }, []);
  return (
    <Canvas className="board" frameloop="always" dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 42, near: 0.1, far: 600, position: [SIZE, 50, SIZE] }}>
      <RendererHandle />
      <CameraRig />
      <CityLoop />
      <CityBoard />
    </Canvas>
  );
}
