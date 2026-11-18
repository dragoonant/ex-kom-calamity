// The fixed-step accumulator behind the real-time loop (docs/spec/10-rules.md TIME-6; KB recipe.md section 11).
// Wall time goes in, whole ticks come out; the engine's advance(seconds) turns ticks into state. Nothing here
// reads a clock, so a test and the e2e hook drive it the same way the browser does.

export interface Accumulator {
  /** Unspent sim seconds, always in [0, 1/tps). */
  acc: number;
}

export const MAX_FRAME_SECONDS = 0.25;

export function makeAccumulator(): Accumulator {
  return { acc: 0 };
}

/**
 * Feeds one frame of wall time at a speed multiplier and returns the number of whole ticks to issue.
 * A frame longer than MAX_FRAME_SECONDS (a background tab, a debugger) is clamped so time never jumps.
 * Paused frames feed nothing and return 0: pause is the absence of ticks (TIME-2).
 */
export function feed(a: Accumulator, dtSeconds: number, ticksPerSecond: number, speed: number, paused: boolean): number {
  if (paused || !(dtSeconds > 0) || !(ticksPerSecond > 0) || !(speed > 0)) return 0;
  const dt = Math.min(dtSeconds, MAX_FRAME_SECONDS) * speed;
  const tickSeconds = 1 / ticksPerSecond;
  a.acc += dt;
  const ticks = Math.floor(a.acc / tickSeconds + 1e-9);
  a.acc -= ticks * tickSeconds;
  if (a.acc < 0) a.acc = 0;
  return ticks;
}

/** Seconds that issue exactly `ticks` ticks through advance(state, seconds) (TIME-4 rounds). */
export function secondsForTicks(ticks: number, ticksPerSecond: number): number {
  return ticks / ticksPerSecond;
}
