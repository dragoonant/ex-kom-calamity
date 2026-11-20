// ?moves (PLAN.md D21): every animated figure doing every motion, side by side, on a loop, so the owner can judge the
// animation pass by eye and the e2e can count what is drawn. Each cell is the same RiggedModel the board uses, driven
// by a synthetic unit through the same nextPose (anim.ts), so what looks right here is what the board plays.
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import type { Unit } from '../engine';
import { EveningLights, EVENING, RendererHandle } from './board/Scene';
import { CorePulse } from './board/Effects';
import { CoreGlow, NO_RAYCAST } from './board/placeholders';
import { RiggedModel } from './board/Rigged';
import { REST_POSE, TRIGGER_SECONDS, nextPose, type Pose, type Trigger } from './board/anim';
import { FIGURE_SLOTS, useRiggedUrl, type FigureRole } from './models';
import { useClient } from './store';

export const MOVE_ROLES: FigureRole[] = ['agent-t1', 'host-revealed', 'taker', 'fighter'];

interface Move {
  id: string;
  label: string;
  /** Tiles per second the figure is drawn moving at. */
  speed?: number;
  crouch?: boolean;
  aim?: boolean;
  /** A one-shot replayed every `every` seconds. */
  trigger?: Trigger;
  every?: number;
  /** Arm a charge over 0.6 s, then throw, on a loop. */
  arm?: boolean;
  /** Fall down, lie, stand up again, on a loop. */
  fall?: boolean;
}

export const MOVES: Move[] = [
  { id: 'idle', label: 'IDLE' },
  { id: 'walk', label: 'WALK', speed: 1.4 },
  { id: 'run', label: 'RUN', speed: 3.2 },
  { id: 'crouch', label: 'CROUCH', crouch: true },
  { id: 'aim', label: 'AIM + FIRE', aim: true, trigger: 'recoil', every: 0.6 },
  { id: 'flinch', label: 'HIT', trigger: 'flinch', every: 1.2 },
  { id: 'throw', label: 'THROW', arm: true },
  { id: 'lunge', label: 'LUNGE', trigger: 'lunge', every: 1.3 },
  { id: 'reveal', label: 'REVEAL', trigger: 'reveal', every: 1.6 },
  { id: 'fall', label: 'FALL', fall: true },
];

const SPACING_X = 1.5;
const SPACING_Z = 2.2;
const ARM_TICKS = 6;

function fakeUnit(role: FigureRole): Unit {
  return {
    id: 'm',
    name: role,
    template: role,
    side: role.startsWith('agent') ? 'agency' : 'hostile',
    x: 0,
    y: 0,
    level: 0,
    hp: 10,
    maxHp: 10,
    armour: 0,
    aim: 50,
    moveTicks: 4,
    sight: 8,
    weapon: 'w',
    disguised: false,
    revealed: true,
    stance: 'engage',
    order: null,
    fireTarget: null,
    aimProgress: 0,
    readyTick: 0,
    lastFiredTick: -1,
    moving: false,
    down: false,
    blast: null,
    charges: 0,
  } as unknown as Unit;
}

function MoveCell({ role, move, x, z }: { role: FigureRole; move: Move; x: number; z: number }) {
  const url = useRiggedUrl(role);
  const pose = useRef<Pose>({ ...REST_POSE });
  const frozen = useRef(false);
  const body = useRef<THREE.Group>(null);
  const unit = useRef(fakeUnit(role));
  const triggers = useRef<Partial<Record<Trigger, number>>>({});
  const downSince = useRef<number | null>(null);
  const lastShot = useRef<number | null>(null);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const now = clock.elapsedTime;
    const u = unit.current;
    u.posture = move.crouch ? 'crouch' : 'stand';
    if (move.speed && move.speed > 2) u.order = { to: { x: 0, y: 0, level: 0 }, path: [], progress: 0, blockedTicks: 0, run: true };
    if (move.trigger && move.every) {
      const last = triggers.current[move.trigger];
      if (last === undefined || now - last >= Math.max(move.every, TRIGGER_SECONDS[move.trigger])) {
        triggers.current[move.trigger] = now;
        if (move.trigger === 'recoil') lastShot.current = now;
      }
    }
    if (move.aim && lastShot.current === null) lastShot.current = now;
    if (move.arm) {
      // 0.6 s arming, 0.55 s throw, 0.6 s rest.
      const t = now % 1.75;
      u.blast = t < 0.6 ? { at: { x: 0, y: 2, level: 0 }, progress: (t / 0.6) * ARM_TICKS } : null;
      if (t >= 0.6 && (triggers.current.throw === undefined || now - triggers.current.throw > 1)) triggers.current.throw = now;
    }
    if (move.fall) {
      const t = now % 3;
      u.down = t >= 0.5 && t < 2.5;
      if (u.down && downSince.current === null) downSince.current = now;
      if (!u.down) downSince.current = null;
    }
    const p = nextPose(pose.current, { unit: u, speed: move.speed ?? 0, now, triggers: triggers.current, lastShot: lastShot.current, downSince: downSince.current, armTicks: ARM_TICKS }, dt);
    pose.current = p;
    frozen.current = u.down && p.fall >= 1;
    const b = body.current;
    if (b) {
      b.rotation.x = -(Math.PI / 2) * p.fall;
      b.position.y = 0.12 * p.fall;
      b.position.z = 0.32 * p.lunge;
      b.scale.setScalar(1 + 0.22 * p.pop);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh raycast={NO_RAYCAST} position={[0, -0.03, 0]}>
        <boxGeometry args={[1.3, 0.06, 1.3]} />
        <meshStandardMaterial color="#efe6cf" />
      </mesh>
      <group ref={body} rotation={[0, 1.15, 0]}>
        {url && (
          <>
            <RiggedModel url={url} pose={pose} frozen={frozen} />
            <CoreGlow role={role} />
          </>
        )}
      </group>
    </group>
  );
}

/** `?moves&row=<role>` draws one figure's row up close. */
function rowParam(): FigureRole | null {
  const search = (globalThis as { location?: { search?: string } }).location?.search;
  const r = search ? new URLSearchParams(search).get('row') : null;
  return r && (MOVE_ROLES as string[]).includes(r) ? (r as FigureRole) : null;
}

export function Moves() {
  const ready = useClient((s) => s.modelsReady);
  const only = rowParam();
  const roles = only ? [only] : MOVE_ROLES;
  return (
    <div className="gallery" data-testid="moves">
      <div className="gallery-canvas moves-canvas">
        <Canvas dpr={[1, 1.5]} camera={{ fov: 30, near: 0.1, far: 100, position: only ? [0, 3.2, 9] : [0, 9, 15] }} onCreated={({ gl, camera }) => {
          gl.setClearColor(EVENING.clear);
          camera.lookAt(0, only ? 0.55 : 0.2, only ? 0 : 0.5);
        }}>
          <EveningLights />
          <RendererHandle />
          <CorePulse />
          <Suspense fallback={null}>
            {roles.map((role, r) =>
              MOVES.map((m, c) => <MoveCell key={`${role}-${m.id}`} role={role} move={m} x={(c - (MOVES.length - 1) / 2) * SPACING_X} z={(r - (roles.length - 1) / 2) * SPACING_Z} />),
            )}
          </Suspense>
        </Canvas>
      </div>
      <div className="console gallery-console">
        <div className="console-bead" />
        <div className="panel-title" data-testid="moves-title">
          FIGURE MOVES: {MOVE_ROLES.length} figures, {MOVES.length} motions, {ready ? 'models ready' : 'loading models'}
        </div>
        <div className="moves-legend num" data-testid="moves-legend">
          Columns, left to right: {MOVES.map((m) => m.label).join(' · ')}. Rows, back to front: {MOVE_ROLES.map((r) => FIGURE_SLOTS[r].label).join(' · ')}. Idle and walk are the generated clips; the rest are built in code on the rig (PLAN D21). Crouch and run are rules too (spec section 24): a crouched unit is harder to hit at range, a runner is quicker and shoots worse for a second.
        </div>
      </div>
    </div>
  );
}
