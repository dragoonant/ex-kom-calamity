// The units on the board, drawn from view(state, 'agency') only, so an unrevealed host is a citizen (HIDE-1).
// Bodies come from placeholders.tsx (stand-ins to docs/figures.md, or a rigged GLB once the manifest has one, KB rule
// 26). No pointer handlers and no raycast anywhere here (KB rule 25): a figure never blocks a tap on the tile
// behind it. Movement between tiles is smoothed for the eye only; every position is the engine's.
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Pos, State, Unit } from '../../engine';
import { useClient } from '../store';
import { WEAPONS } from '../../data';
import type { Fx } from '../fx';
import { useRiggedUrl, type FigureRole } from '../models';
import { REST_POSE, nextPose, type Pose, type Trigger } from './anim';
import { COLOURS, CoreGlow, FigureModel, NO_RAYCAST } from './placeholders';
import { RiggedModel } from './Rigged';
import { FIGURE_H, LEVEL_H, tileToWorld } from './world';

/** The figure role a unit in the agency's view is drawn with (docs/figures.md section 2). */
export function roleOf(u: Unit): FigureRole {
  if (u.side === 'agency') return u.template === 'agent-t2' ? 'agent-t2' : 'agent-t1';
  if (u.template === 'taker') return 'taker';
  if (u.template === 'fighter') return 'fighter';
  if (u.template === 'host') return 'host-revealed'; // the view already turned an unrevealed host into a citizen
  return 'citizen';
}

/** Smoothed positions of the drawn figures, read by the instanced hp bars each frame. */
const shownPositions = new Map<string, THREE.Vector3>();

/**
 * What the board has seen each figure do (D21): one-shot starts, the last shot and where it went, when it went down.
 * Fed from the fx queue (fx.ts), which already hides what the agency may not see (VIEW-2), so a hidden shooter never
 * recoils on screen. Board clock seconds.
 */
interface Motion {
  triggers: Partial<Record<Trigger, number>>;
  lastShot: number | null;
  shotAt: THREE.Vector3 | null;
  downSince: number | null;
}
const motions = new Map<string, Motion>();
function motionOf(id: string): Motion {
  let m = motions.get(id);
  if (!m) {
    m = { triggers: {}, lastShot: null, shotAt: null, downSince: null };
    motions.set(id, m);
  }
  return m;
}

/** Turns each new effect into the figure motions it starts. */
export function motionFromFx(f: Fx, now: number): void {
  const start = (id: string | undefined, t: Trigger) => {
    if (id) motionOf(id).triggers[t] = now;
  };
  switch (f.kind) {
    case 'muzzle': {
      if (!f.unit) break;
      const melee = f.weapon ? WEAPONS[f.weapon]?.kind === 'melee' : false;
      start(f.unit, melee ? 'lunge' : 'recoil');
      const m = motionOf(f.unit);
      m.lastShot = now;
      m.shotAt = f.to ? tileToWorld(f.to) : null;
      break;
    }
    case 'hit':
      start(f.unit, 'flinch');
      break;
    case 'blast':
      start(f.unit, 'throw');
      break;
    case 'revealed':
      start(f.unit, 'reveal');
      break;
    case 'taken':
      start(f.by, 'lunge');
      break;
    default:
      break;
  }
}

/** Reads the fx queue once a frame for every figure (mounted once per board). */
function MotionFeed() {
  const last = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const fx = useClient.getState().fx;
    const top = fx.length ? fx[fx.length - 1]!.id : 0;
    // Effects already queued when the board mounts (a Continue) are history: no figure replays them.
    if (last.current === null) last.current = top;
    for (const f of fx) if (f.id > last.current) motionFromFx(f, clock.elapsedTime);
    last.current = Math.max(last.current, top);
  });
  return null;
}

const UP = new THREE.Vector3();

function Figure({ unit, selected, tps, armTicks }: { unit: Unit; selected: boolean; tps: number; armTicks: number }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const target = tileToWorld(unit);
  const shown = useRef(target.clone());
  const facing = useRef(0);
  const speed = useRef(0);
  const pose = useRef<Pose>({ ...REST_POSE, fall: unit.down ? 1 : 0 });
  const frozen = useRef(false);
  const bob = useRef(0);
  const role = roleOf(unit);
  const rigged = useRiggedUrl(role);
  const unitRef = useRef(unit);
  unitRef.current = unit;
  shownPositions.set(unit.id, shown.current);
  const motion = motionOf(unit.id);
  // A unit already down when the board mounts (a Continue, or a figure that scrolled in) lies there at once.
  if (unit.down && motion.downSince === null) motion.downSince = -1e9;
  if (!unit.down) motion.downSince = null;

  useFrame(({ clock }, dtRaw) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.1);
    const now = clock.elapsedTime;
    const u = unitRef.current;
    if (u.down && motion.downSince === null) motion.downSince = now;
    // Glide at the unit's own pace (tiles per second from its move ticks, a little faster so it never lags a step
    // behind), so a figure walks instead of hopping; a jump of more than 3 tiles (a fall, a load) snaps.
    const s = shown.current;
    const tgt = tileToWorld(u, UP);
    const dist = s.distanceTo(tgt);
    let moved = 0;
    if (dist > 3) {
      s.copy(tgt);
    } else if (dist > 0.001) {
      const pace = (1.15 * tps) / Math.max(1, u.moveTicks);
      const step = Math.min(dist, Math.max(pace, dist * 2) * dt);
      const dx = tgt.x - s.x;
      const dz = tgt.z - s.z;
      if (Math.hypot(dx, dz) > 0.05) facing.current = Math.atan2(dx, dz);
      s.lerp(tgt, step / dist);
      moved = step;
    }
    speed.current += ((dt > 0 ? moved / dt : 0) - speed.current) * Math.min(1, dt * 8);
    // Facing a target while aiming and standing: the own unit's fire target, or where its last seen shot went.
    if (speed.current < 0.2 && !u.down) {
      const aimAt = motion.shotAt && motion.lastShot !== null && now - motion.lastShot < 2 ? motion.shotAt : null;
      const tgtUnit = u.fireTarget ? useClient.getState().agency?.units.find((x) => x.id === u.fireTarget) : null;
      const at = tgtUnit ? tileToWorld(tgtUnit) : aimAt;
      if (at && Math.hypot(at.x - s.x, at.z - s.z) > 0.3) {
        const want = Math.atan2(at.x - s.x, at.z - s.z);
        let d = want - facing.current;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        facing.current += d * Math.min(1, dt * 10);
      }
    }
    const p = nextPose(pose.current, { unit: u, speed: speed.current, now, triggers: motion.triggers, lastShot: motion.lastShot, downSince: motion.downSince, armTicks }, dt);
    pose.current = p;
    frozen.current = u.down && p.fall >= 1;
    g.position.copy(s);
    g.rotation.y = facing.current;
    const b = body.current;
    if (b) {
      // Whole-body motion: the death fall (backwards over half a second), the lunge, the reveal burst; and for a
      // stand-in with no skeleton, a walking bob, a run lean and a crouch.
      b.rotation.x = -(Math.PI / 2) * p.fall;
      b.position.y = 0.12 * p.fall;
      b.position.z = 0.32 * p.lunge;
      const pop = 1 + 0.22 * p.pop;
      if (!rigged) {
        bob.current += dt * p.rate * Math.PI * 2 * p.walk;
        b.position.y += p.walk * 0.05 * Math.abs(Math.sin(bob.current));
        b.rotation.x += p.walk * (0.08 + 0.12 * p.run) + 0.18 * p.lunge - 0.08 * p.recoil;
        b.rotation.z = 0.12 * p.flinch + p.walk * 0.04 * Math.sin(bob.current);
        b.scale.set(pop, pop * (1 - 0.22 * p.crouch), pop);
      } else {
        b.rotation.z = 0;
        b.scale.setScalar(pop);
      }
    }
  });

  return (
    <group ref={group} position={target}>
      {selected && (
        <mesh raycast={NO_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.36, 0.46, 32]} />
          <meshBasicMaterial color={COLOURS.agencyPlate} />
        </mesh>
      )}
      <group ref={body}>
        {rigged ? (
          <Suspense fallback={null}>
            <RiggedModel url={rigged} pose={pose} frozen={frozen} />
            {!unit.down && <CoreGlow role={role} />}
          </Suspense>
        ) : (
          <FigureModel role={role} down={unit.down} />
        )}
      </group>
    </group>
  );
}

const BAR_BOX = new THREE.BoxGeometry(1, 1, 1);
const BAR_BACK = new THREE.MeshBasicMaterial({ color: '#1b1b1f' });
const BAR_FILL = new THREE.MeshBasicMaterial();
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const COL = new THREE.Color();

/** Every standing unit's hp bar in two instanced draws (KB recipe step 9: count draws). hp and maxHp are engine fields (VIEW-2). */
function HpBars({ units }: { units: Unit[] }) {
  const back = useRef<THREE.InstancedMesh>(null);
  const fill = useRef<THREE.InstancedMesh>(null);
  const capacity = useMemo(() => Math.max(1, units.length), [units.length]);
  useFrame(() => {
    const b = back.current;
    const f = fill.current;
    if (!b || !f) return;
    let n = 0;
    for (const u of units) {
      if (u.down) continue;
      const p = shownPositions.get(u.id);
      if (!p) continue;
      const frac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
      M.compose(V.set(p.x, p.y + FIGURE_H + 0.18, p.z), Q, S.set(0.6, 0.06, 0.02));
      b.setMatrixAt(n, M);
      M.compose(V.set(p.x - (0.6 * (1 - frac)) / 2, p.y + FIGURE_H + 0.18, p.z + 0.011), Q, S.set(Math.max(0.01, 0.6 * frac), 0.045, 0.01));
      f.setMatrixAt(n, M);
      f.setColorAt(n, COL.set(frac > 0.6 ? '#4caf6a' : frac > 0.3 ? '#e0a030' : '#d9342b'));
      n += 1;
    }
    b.count = n;
    f.count = n;
    b.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh key={`b${capacity}`} ref={back} args={[BAR_BOX, BAR_BACK, capacity]} raycast={NO_RAYCAST} frustumCulled={false} />
      <instancedMesh key={`f${capacity}`} ref={fill} args={[BAR_BOX, BAR_FILL, capacity]} raycast={NO_RAYCAST} frustumCulled={false} />
    </group>
  );
}

function OrderMarks({ unit }: { unit: Unit }) {
  if (!unit.order) return null;
  const pts: [number, number, number][] = [];
  const here = tileToWorld(unit);
  pts.push([here.x, here.y + 0.1, here.z]);
  for (const p of unit.order.path) {
    const w = tileToWorld(p);
    pts.push([w.x, w.y + 0.1, w.z]);
  }
  const dest = tileToWorld(unit.order.to);
  return (
    <group>
      <Line points={pts} color="#e4b43a" lineWidth={2} raycast={NO_RAYCAST} />
      <mesh raycast={NO_RAYCAST} position={[dest.x, dest.y + 0.3, dest.z]}>
        <coneGeometry args={[0.14, 0.4, 4]} />
        <meshBasicMaterial color="#e4b43a" />
      </mesh>
    </group>
  );
}

export function Figures({ state }: { state: State }) {
  const selected = useClient((s) => s.selected);
  const level = useClient((s) => s.level);
  const drawn = state.units.filter((u) => u.level <= level);
  const tps = state.tuning.time.ticksPerSecond;
  const armTicks = state.tuning.blast.armTicks;
  return (
    <group>
      <MotionFeed />
      {drawn.map((u) => (
        <Figure key={u.id} unit={u} selected={u.id === selected} tps={tps} armTicks={armTicks} />
      ))}
      <HpBars units={drawn} />
      {state.units
        .filter((u) => u.side === 'agency' && !u.down && u.order && u.level <= level)
        .map((u) => (
          <OrderMarks key={`o-${u.id}`} unit={u} />
        ))}
    </group>
  );
}

export function unitHeadWorld(u: Pos): THREE.Vector3 {
  const v = tileToWorld(u);
  v.y += FIGURE_H;
  return v;
}

export { LEVEL_H };
