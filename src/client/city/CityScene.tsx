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
import { HorizonFog, SkyDome, skyAt, type SkyTone } from '../board/backdrop';
import { patchWindows, windowUniforms, type WindowUniforms } from '../board/windows';
import { CityDressing } from './CityDressing';
import { RendererName, useSceneryLevel } from '../scenery';
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

/** 0 at midnight, 1 at noon: drives the too-perfect gleam and the window strips. */
function daylight(hour: number, minute: number): number {
  const h = hour + minute / 60;
  const x = Math.cos(((h - 13) / 24) * Math.PI * 2);
  return Math.min(1, Math.max(0, (x + 0.35) / 1.1));
}

const CENTRE = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);
const MOON_DIR = new THREE.Vector3(0.35, 0.8, 0.5).normalize();

/**
 * The sky, the sun (or the moon) and the fog from the city clock. `tone` is one shared object the dome, the
 * water and the lamps read each frame; the clock moves in ten-minute ticks and the shown hour eases after it.
 */
function SkyAndLights({ tone, windows, shadows }: { tone: SkyTone; windows: WindowUniforms; shadows: boolean }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const shown = useRef<number | null>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(CENTRE);
    return o;
  }, []);
  useFrame((_, dt) => {
    const view = useCity.getState().view;
    if (!view) return;
    const c = cityQuery.clock(view);
    const want = c.hour + c.minute / 60;
    let h = shown.current ?? want;
    let delta = want - h;
    if (delta < -12) delta += 24;
    if (delta > 12) delta -= 24;
    // Ease toward the clock; jump when it moved by more than a few hours (a load, a long advance).
    h = Math.abs(delta) > 3 ? want : h + delta * Math.min(1, dt * 4);
    h = (h + 24) % 24;
    shown.current = h;
    skyAt(h, tone);
    windows.uNight.value = THREE.MathUtils.smoothstep(tone.night, 0.15, 0.8);
    const day = 1 - tone.night;
    if (hemi.current) {
      hemi.current.color.copy(tone.zenith).lerp(WHITE, 0.2 + day * 0.35);
      hemi.current.groundColor.copy(tone.ground);
      hemi.current.intensity = 0.42 + day * 1.05;
    }
    const s = sun.current;
    if (s) {
      const up = tone.sunDir.y > 0.02;
      const dir = up ? tone.sunDir : MOON_DIR;
      s.position.copy(CENTRE).addScaledVector(dir, 90);
      s.color.copy(up ? tone.sun : MOON);
      s.intensity = up ? 0.4 + Math.min(1, tone.sunDir.y * 3) * 1.7 : 0.45;
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe0ea', '#8a7a66', 0.9]} />
      <ambientLight intensity={0.06} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        position={[0, 40, 20]}
        intensity={1.2}
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={1}
        shadow-camera-far={220}
      />
    </>
  );
}

const WHITE = new THREE.Color('#ffffff');
const MOON = new THREE.Color('#9fb2dc');

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

function Buildings({ view, lots, hq, windows }: { view: CityState; lots: Lot[]; hq: Lot; windows: WindowUniforms }) {
  const c = cityQuery.clock(view);
  const d = daylight(c.hour, c.minute);
  const { hum, perfect, turned } = leads(view);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }), []);
  const gleamMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.25, emissive: new THREE.Color('#fff6e0'), emissiveIntensity: 0.18 }), []);
  // The strips are cut into panes by the shader; a lead building's panes are all lit and pulse together (the hum).
  const winMat = useMemo(() => patchWindows(new THREE.MeshStandardMaterial({ color: PAL.glass, emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0, roughness: 0.25, metalness: 0.2 }), windows, 'bands'), [windows]);
  const allLit = useMemo(() => ({ ...windows, uLit: { value: 1 } }), [windows]);
  const humMat = useMemo(() => patchWindows(new THREE.MeshStandardMaterial({ color: PAL.glass, emissive: new THREE.Color('#e0a030'), emissiveIntensity: 0, roughness: 0.3 }), allLit, 'bands'), [allLit]);
  const turnedMat = useMemo(() => patchWindows(new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: new THREE.Color('#e0a030'), emissiveIntensity: 0.9, roughness: 0.3 }), allLit, 'bands'), [allLit]);
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
            <mesh geometry={l.geo.body} material={perfect.has(l.id) && d > 0.3 ? gleamMat : bodyMat} raycast={() => null} castShadow receiveShadow />
            <mesh geometry={l.geo.windows} material={isTurned ? turnedMat : isHum ? humMat : winMat} raycast={() => null} />
          </group>
        );
      })}
      <group position={hq.pos}>
        <mesh geometry={hq.geo.body} material={bodyMat} raycast={() => null} castShadow receiveShadow />
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

/** The air war on the board (spec section 20): craft and cars glide toward their hourly positions, a dogfight
 * flashes tracers, a crash site smokes. Nothing here takes a pointer (KB rule 25); craft are picked on the console. */
const AIR_SCALE = CELL / 10;
function Sky({ view }: { view: CityState }) {
  const group = useRef<THREE.Group>(null);
  const seq = useCity((s) => s.eventSeq);
  const flash = useRef<{ until: number; craft: Set<string> }>({ until: 0, craft: new Set() });
  const scoutGeo = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.45, 2.2, 6, 14);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const seederGeo = useMemo(() => new THREE.SphereGeometry(1.3, 18, 12), []);
  const podGeo = useMemo(() => new THREE.SphereGeometry(0.35, 10, 8), []);
  const pearl = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d4dadb', roughness: 0.25, metalness: 0.1 }), []);
  const chitin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 }), []);
  const amber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e0a030', emissive: new THREE.Color('#e0a030'), emissiveIntensity: 1.2 }), []);
  const carMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PAL.red, roughness: 0.35, metalness: 0.2 }), []);
  const smoke = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a5650', transparent: true, opacity: 0.55, depthWrite: false }), []);
  const tracer = useMemo(() => new THREE.LineBasicMaterial({ color: '#ffd27a' }), []);
  useEffect(() => {
    const ev = useCity.getState().lastEvents.filter((e) => e.type === 'dogfight');
    if (ev.length) flash.current = { until: performance.now() + 600, craft: new Set(ev.map((e) => (e.type === 'dogfight' ? e.craft : ''))) };
  }, [seq]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    // Ease every object toward its engine position: the engine moves on the hour, the eye sees a glide.
    for (const child of g.children) {
      const want = child.userData.want as THREE.Vector3 | undefined;
      if (want) child.position.lerp(want, 0.06);
      if (child.userData.bob) child.position.y = want!.y + Math.sin(clock.elapsedTime * 1.3 + child.userData.bob) * 0.3;
    }
    amber.emissiveIntensity = 0.8 + 0.6 * Math.sin(clock.elapsedTime * 2.4);
  });
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  return (
    <group ref={group}>
      {view.craft.map((c, i) => {
        const want = new THREE.Vector3(c.x * AIR_SCALE, c.kind === 'seeder' ? 13 : 16, c.y * AIR_SCALE);
        return (
          <group key={c.id} position={want.clone()} userData={{ want, bob: i + 1 }}>
            {c.kind === 'scout' ? (
              <>
                <mesh geometry={scoutGeo} material={pearl} raycast={() => null} />
                <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.5, 0.08, 6, 18]} />
                  <primitive object={amber} attach="material" />
                </mesh>
              </>
            ) : (
              <>
                <mesh geometry={seederGeo} material={chitin} scale={[1.3, 0.8, 1]} raycast={() => null} />
                <mesh geometry={seederGeo} material={pearl} scale={[0.9, 0.5, 0.7]} position={[0, 0.5, 0]} raycast={() => null} />
                {[-0.6, 0, 0.6].map((dx) => (
                  <mesh key={dx} geometry={podGeo} material={amber} position={[dx, -0.9, dx === 0 ? 0.4 : -0.2]} raycast={() => null} />
                ))}
              </>
            )}
          </group>
        );
      })}
      {view.cars
        .filter((car) => car.status === 'flying')
        .map((car) => {
          const want = new THREE.Vector3(car.x * AIR_SCALE, 11, car.y * AIR_SCALE);
          return (
            <group key={car.id} position={want.clone()} userData={{ want }}>
              <mesh raycast={() => null} rotation={[Math.PI / 2, 0, 0]} material={carMat}>
                <capsuleGeometry args={[0.35, 1.0, 6, 12]} />
              </mesh>
            </group>
          );
        })}
      {view.crashes.map((cr) => (
        <group key={cr.id} position={[cr.x * AIR_SCALE, 0, cr.y * AIR_SCALE]}>
          <mesh raycast={() => null} position={[0, 0.4, 0]} geometry={seederGeo} material={chitin} scale={[0.8, 0.3, 0.6]} />
          <mesh raycast={() => null} position={[0, 4, 0]} material={smoke}>
            <cylinderGeometry args={[1.4, 0.5, 8, 10, 1, true]} />
          </mesh>
          <mesh raycast={() => null} position={[0, 0.8, 0]} geometry={podGeo} material={amber} />
        </group>
      ))}
      {flash.current.until > now &&
        view.craft
          .filter((c) => flash.current.craft.has(c.id))
          .flatMap((c) =>
            view.cars
              .filter((car) => car.craft === c.id)
              .map((car) => {
                const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(car.x * AIR_SCALE, 11, car.y * AIR_SCALE), new THREE.Vector3(c.x * AIR_SCALE, c.kind === 'seeder' ? 13 : 16, c.y * AIR_SCALE)]);
                return <primitive key={`${c.id}-${car.id}`} object={new THREE.Line(g, tracer)} />;
              }),
          )}
    </group>
  );
}

function CityBoard() {
  const view = useCity((s) => s.view);
  const { lots, hq } = useLots();
  const tone = useMemo(() => skyAt(8), []);
  const windows = useMemo(() => windowUniforms(0.8, 1.0, 0.4), []);
  const full = useSceneryLevel() === 'full';
  if (!view) return null;
  return (
    <>
      <SkyAndLights tone={tone} windows={windows} shadows={full} />
      <SkyDome tone={tone} />
      <HorizonFog tone={tone} near={80} far={320} />
      <CityDressing tone={tone} windows={windows} full={full} />
      <Buildings view={view} lots={lots} hq={hq} windows={windows} />
      <PickLots lots={lots} />
      <Markers view={view} lots={lots} hq={hq} />
      <Sky view={view} />
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
    <Canvas className="board" shadows frameloop="always" dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 42, near: 0.3, far: 600, position: [SIZE, 50, SIZE] }}>
      <RendererHandle />
      <RendererName />
      <CameraRig />
      <CityLoop />
      <CityBoard />
    </Canvas>
  );
}
