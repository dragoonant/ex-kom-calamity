// The AI's own randomness (AI-7): an sfc32 stream seeded from the battle seed, the tick, the side and the unit, so a
// decision is a pure function of the view and the engine's RNG (ARCH-7) is never touched or read.
import { nextInt, seedRng, type Side } from '../engine';
import type { RngState } from '../engine/rng';

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function unitRng(seed: number, tick: number, side: Side, unitId: string): RngState {
  return seedRng((fnv(`${seed}|${tick}|${side}|${unitId}`) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
}

export function pickWith<T>(rng: RngState, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[nextInt(rng, items.length)];
}

export function percent(rng: RngState, p: number): boolean {
  return nextInt(rng, 100) < p;
}
