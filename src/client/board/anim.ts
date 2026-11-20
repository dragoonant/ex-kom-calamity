// Figure animation, the pure half (PLAN.md D21, docs/art/animation.md): what each figure is doing this frame, from the
// unit as the agency's view shows it (VIEW-2), its drawn speed, and the recent effects that name it (fx.ts). The
// output is a Pose of weights and phases; Rigged.tsx plays the GLB's `idle` and `walk` clips by those weights and
// lays the rest (crouch, aim, recoil, flinch, throw, lunge, fall, reveal pop) onto the bones. No three.js here, so the
// rules of motion are unit-tested (tests/client-anim.test.ts). Nothing here reads the true state: a hidden unit's
// order is redacted, so only the agency's own units aim by their fire target or run by their order; a crouch is seen.
import type { Unit } from '../../engine';

/** One-shot motions started by an event; each runs for its own duration from the start time. */
export type Trigger = 'recoil' | 'flinch' | 'throw' | 'lunge' | 'reveal';

/** Seconds each one-shot lasts. */
export const TRIGGER_SECONDS: Record<Trigger, number> = { recoil: 0.16, flinch: 0.35, throw: 0.55, lunge: 0.45, reveal: 0.7 };

/** Seconds a death fall takes, from standing to lying. */
export const FALL_SECONDS = 0.55;

/** Tiles per second above which a moving figure the view shows no order for runs instead of walking. */
export const RUN_SPEED = 2.4;

/** The walk clip's stride: tiles covered in one cycle at timeScale 1 (the clip is 1 s long). */
export const WALK_STRIDE = 1.15;

export interface Pose {
  /** Clip weights; they sum to 1. Run is the walk clip played faster with a forward lean. */
  idle: number;
  walk: number;
  /** The walk clip's timeScale (cycles per second). */
  rate: number;
  /** 0..1: how far into the run lean. */
  run: number;
  /** 0..1 crouch depth (hips down, knees bent, chest forward). */
  crouch: number;
  /** 0..1 weapon raised towards the target. */
  aim: number;
  /** 0..1 shot kick, peaks at the shot and decays. */
  recoil: number;
  /** -1..1 stagger: sign alternates so the wobble reads. */
  flinch: number;
  /** null or 0..1 through the throw: wind-up to 0.55, release, follow-through. */
  throwPhase: number | null;
  /** 0..1 forward lunge of a bite or a melee blow. */
  lunge: number;
  /** 0..1 from standing to lying. */
  fall: number;
  /** 0..1 burst of a host dropping its disguise. */
  pop: number;
}

export const REST_POSE: Pose = { idle: 1, walk: 0, rate: 1, run: 0, crouch: 0, aim: 0, recoil: 0, flinch: 0, throwPhase: null, lunge: 0, fall: 0, pop: 0 };

export interface AnimInput {
  unit: Unit;
  /** Drawn speed in tiles per second (the figure's glide, not the engine's step). */
  speed: number;
  /** Seconds on the board's clock. */
  now: number;
  /** When each one-shot last started (board clock); absent when never. */
  triggers: Partial<Record<Trigger, number>>;
  /** When this figure was last seen firing (any side), for aiming without a visible fire target. */
  lastShot: number | null;
  /** When the figure was first drawn down; null while standing. */
  downSince: number | null;
  /** Arming progress of the unit's own charge (BLAST-2): from unit.blast, so only the agency's own units have it. */
  armTicks: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Moves a value toward a target at `rate` per second (no overshoot). */
export function approach(from: number, to: number, rate: number, dt: number): number {
  const d = to - from;
  const step = rate * dt;
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}

/** 0..1 through a one-shot, or null when it is not running. */
export function phaseOf(input: AnimInput, t: Trigger): number | null {
  const at = input.triggers[t];
  if (at === undefined) return null;
  const p = (input.now - at) / TRIGGER_SECONDS[t];
  return p >= 0 && p < 1 ? p : null;
}

/**
 * Whether the figure runs: a running move order (POSE-3; the order is the agency's own, VIEW-2), or, for a unit
 * whose order the view hides, a drawn speed only a run reaches.
 */
export function isRunning(unit: Unit, speed: number): boolean {
  if (speed < 0.2) return false;
  return unit.order?.run === true || speed >= RUN_SPEED;
}

/** Whether the unit holds its weapon up: an own unit with a fire target, or anyone seen firing in the last 2 s. */
export function isAiming(input: AnimInput): boolean {
  const u = input.unit;
  if (u.down || !u.weapon) return false;
  if (u.fireTarget) return true;
  return input.lastShot !== null && input.now - input.lastShot < 2;
}

/** Whether the figure crouches: its posture (POSE-1), which every side sees (VIEW-2). It moves crouched too. */
export function isCrouching(input: AnimInput): boolean {
  return !input.unit.down && input.unit.posture === 'crouch';
}

/** The next pose from the last one: continuous parts ease, one-shots follow their phase. */
export function nextPose(prev: Pose, input: AnimInput, dt: number): Pose {
  const u = input.unit;
  const moving = !u.down && input.speed > 0.15;
  const running = moving && isRunning(u, input.speed);
  const walkTarget = moving ? 1 : 0;
  const walk = approach(prev.walk, walkTarget, 6, dt);
  const run = approach(prev.run, running ? 1 : 0, 4, dt);
  const rate = moving ? Math.min(2.6, Math.max(0.7, input.speed / WALK_STRIDE)) : prev.rate;
  const crouch = approach(prev.crouch, isCrouching(input) ? 1 : 0, 4, dt);
  const aim = approach(prev.aim, isAiming(input) && !running ? 1 : 0, 5, dt);

  const rp = phaseOf(input, 'recoil');
  const recoil = rp === null ? 0 : rp < 0.25 ? rp / 0.25 : 1 - (rp - 0.25) / 0.75;
  const fp = phaseOf(input, 'flinch');
  const flinch = fp === null ? 0 : Math.sin(fp * Math.PI * 3) * (1 - fp);
  const lp = phaseOf(input, 'lunge');
  const lunge = lp === null ? 0 : Math.sin(lp * Math.PI);
  const pp = phaseOf(input, 'reveal');
  const pop = pp === null ? 0 : Math.sin(pp * Math.PI);

  // A throw: an own unit's arming drives the wind-up continuously (BLAST-2); the blast event plays the release for
  // anyone (a fighter's throw is only seen when it lands).
  let throwPhase: number | null = null;
  if (u.blast && input.armTicks > 0) throwPhase = 0.55 * clamp01(u.blast.progress / input.armTicks);
  const tp = phaseOf(input, 'throw');
  if (tp !== null) throwPhase = 0.55 + 0.45 * tp;

  const fall = input.downSince === null ? 0 : smooth((input.now - input.downSince) / FALL_SECONDS);
  return { idle: 1 - walk, walk, rate, run, crouch, aim, recoil, flinch, throwPhase, lunge, fall, pop };
}

/** The throw arm's angle (radians about the figure's x axis; negative raises it forward then overhead). */
export function throwArmAngle(phase: number): number {
  if (phase < 0.55) return -2.7 * smooth(phase / 0.55);
  const t = (phase - 0.55) / 0.45;
  return t < 0.4 ? -2.7 + 1.9 * smooth(t / 0.4) : -0.8 * (1 - smooth((t - 0.4) / 0.6));
}
