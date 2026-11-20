// PLAN.md D21, the animation pass: the pure rules of motion (src/client/board/anim.ts). The bone work itself is
// judged by eye on ?moves and counted by e2e/moves.spec.ts; here are the decisions: when a figure walks, runs, crouches,
// aims, recoils, flinches, throws, lunges, pops and falls, and that a hidden unit's redacted fields never drive them.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FALL_SECONDS, REST_POSE, TRIGGER_SECONDS, isAiming, isCrouching, isRunning, nextPose, phaseOf, throwArmAngle, type AnimInput, type Pose } from '../src/client/board/anim';
import { turnBone } from '../src/client/board/Rigged';
import { createGame, view } from '../src/engine';

const s0 = createGame({ battleId: 'savings-raid', seed: 3 });
const agent = s0.units.find((u) => u.side === 'agency')!;

function input(over: Partial<AnimInput> = {}): AnimInput {
  return { unit: agent, speed: 0, now: 10, triggers: {}, lastShot: null, downSince: null, armTicks: 6, ...over };
}
/** Runs nextPose for `seconds` at 60 fps from rest. */
function settle(inp: AnimInput, seconds = 2, from: Pose = REST_POSE): Pose {
  let p = from;
  for (let t = 0; t < seconds; t += 1 / 60) p = nextPose(p, { ...inp, now: inp.now + t }, 1 / 60);
  return p;
}

describe('D21 figure animation (anim.ts)', () => {
  it('stands idle when still, walks when moving, runs on a running order (POSE-3) or at speed; the walk clip keeps pace', () => {
    expect(settle(input())).toMatchObject({ idle: 1, walk: 0, run: 0 });
    const walk = settle(input({ speed: 1.2 }));
    expect(walk.walk).toBe(1);
    expect(walk.run).toBe(0);
    expect(walk.rate).toBeCloseTo(1.2 / 1.15, 2);
    expect(settle(input({ speed: 3 })).run).toBe(1);
    const running = { ...agent, order: { to: { x: 0, y: 0, level: 0 }, path: [], progress: 0, blockedTicks: 0, run: true } };
    expect(isRunning(running, 1.2)).toBe(true);
    expect(isRunning(running, 0)).toBe(false);
    expect(isRunning({ ...running, order: { ...running.order, run: false } }, 1.2)).toBe(false);
  });

  it('crouches by posture (POSE-1), on the move too, any side; a redacted HOLD stance never crouches a figure (VIEW-2)', () => {
    const low = { ...agent, posture: 'crouch' as const };
    expect(isCrouching(input({ unit: low }))).toBe(true);
    expect(isCrouching(input({ unit: low, speed: 1 }))).toBe(true);
    expect(isCrouching(input({ unit: { ...agent, stance: 'hold' } }))).toBe(false);
    expect(settle(input({ unit: low })).crouch).toBe(1);
    // A hostile in the agency's view always reads stance 'hold' (redacted): it must not crouch for that.
    const v = view(s0, 'agency');
    for (const u of v.units.filter((x) => x.side !== 'agency')) {
      expect(u.stance).toBe('hold');
      expect(isCrouching(input({ unit: u }))).toBe(false);
    }
  });

  it('aims with a fire target or for 2 s after a seen shot; recoil peaks early and is over in its time', () => {
    expect(isAiming(input({ unit: { ...agent, fireTarget: 'u1' } }))).toBe(true);
    expect(isAiming(input({ lastShot: 9 }))).toBe(true);
    expect(isAiming(input({ lastShot: 7.9 }))).toBe(false);
    expect(isAiming(input({ unit: { ...agent, weapon: null }, lastShot: 9.9 }))).toBe(false);
    const at = (dt: number) => nextPose(REST_POSE, input({ triggers: { recoil: 10 }, now: 10 + dt }), 1 / 60).recoil;
    expect(at(TRIGGER_SECONDS.recoil * 0.25)).toBeCloseTo(1, 5);
    expect(at(TRIGGER_SECONDS.recoil * 0.9)).toBeLessThan(0.2);
    expect(at(TRIGGER_SECONDS.recoil * 1.01)).toBe(0);
    expect(phaseOf(input({ triggers: { flinch: 10 }, now: 9 }), 'flinch')).toBeNull(); // not started yet
  });

  it('a charge winds up with the arming and releases on the blast; a host pops when revealed; the fall eases to lying', () => {
    const arming = { ...agent, blast: { at: { x: 1, y: 1, level: 0 }, progress: 3 } };
    expect(nextPose(REST_POSE, input({ unit: arming }), 0).throwPhase).toBeCloseTo(0.275, 5);
    expect(nextPose(REST_POSE, input({ triggers: { throw: 10 }, now: 10 + TRIGGER_SECONDS.throw / 2 }), 0).throwPhase).toBeCloseTo(0.775, 5);
    expect(throwArmAngle(0)).toBeCloseTo(0, 5);
    expect(throwArmAngle(0.55)).toBeCloseTo(-2.7, 5); // overhead at the release
    expect(throwArmAngle(1)).toBeCloseTo(0, 5);
    expect(nextPose(REST_POSE, input({ triggers: { reveal: 10 }, now: 10 + TRIGGER_SECONDS.reveal / 2 }), 0).pop).toBeCloseTo(1, 5);
    const down = { ...agent, down: true, hp: 0 };
    expect(nextPose(REST_POSE, input({ unit: down, downSince: 10, now: 10 }), 0).fall).toBe(0);
    expect(nextPose(REST_POSE, input({ unit: down, downSince: 10, now: 10 + FALL_SECONDS / 2 }), 0).fall).toBeCloseTo(0.5, 5);
    const lying = nextPose(REST_POSE, input({ unit: down, downSince: 10, now: 12, speed: 2 }), 0);
    expect(lying.fall).toBe(1);
    expect(lying.walk).toBe(0); // a body never walks
  });

  it('turnBone turns a bone about the figure frame, whatever its parents, and never piles up from the rest it starts at', () => {
    const root = new THREE.Group();
    root.rotation.y = 0.7; // the figure faces somewhere on the board
    const shoulder = new THREE.Object3D();
    shoulder.quaternion.set(-0.5, -0.5, -0.5, 0.5); // the agent rig's shoulder.L
    const arm = new THREE.Object3D();
    arm.position.set(0, 0.2, 0);
    root.add(shoulder);
    shoulder.add(arm);
    root.updateMatrixWorld(true);
    const dirInRoot = () => {
      const q = arm.getWorldQuaternion(new THREE.Quaternion()).premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert());
      return new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    };
    const before = dirInRoot();
    turnBone(root, arm, 'x', -Math.PI / 2);
    const after = dirInRoot();
    // A quarter turn about the figure's x axis: x is kept, (y, z) turns by -90 degrees.
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.z, 5);
    expect(after.z).toBeCloseTo(-before.y, 5);
  });
});
