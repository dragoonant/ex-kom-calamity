// Headless policies for sim and fuzz. These are not the game's AI (M3): they exist to drive
// battles to completion and to cover the rules. Each takes its own RNG so the engine's stays
// untouched and a run is reproducible from its seed.
import { blastTargets, legalActions, query, view, type Action, type Side, type State } from '../engine';
import type { AiDriver } from '../ai/types';
import { nextInt, nextU32, seedRng, type RngState } from '../engine/rng';

/** One order, several (an AI's turn, applied in order) or none, per loop pass of runBattle. */
export type Policy = (state: State, side: Side, rng: RngState) => Action | Action[] | null;

export function makeRng(seed: number): RngState {
  return seedRng(seed);
}

export function chance(rng: RngState, p: number): boolean {
  return nextU32(rng) / 4294967296 < p;
}

export function pick<T>(rng: RngState, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[nextInt(rng, items.length)];
}

/** A random legal order (never tick, never withdraw) with probability `rate` per call. */
export function randomPolicy(rate: number): Policy {
  return (state, side, rng) => {
    if (!chance(rng, rate)) return null;
    const acts = legalActions(state, side).filter((a) => a.type !== 'tick' && a.type !== 'withdraw');
    return pick(rng, acts) ?? null;
  };
}

/** Sweep: every idle unit of the side walks to a random reachable tile; stances stay. */
export function sweepPolicy(): Policy {
  return (state, side, rng) => {
    for (const u of state.units) {
      if (u.down || u.side !== side || u.order || u.fireTarget) continue;
      const tiles = query.reachable(state, u.id);
      const to = pick(rng, tiles);
      if (to) return { type: 'move', side, unit: u.id, to: { x: to.x, y: to.y, level: to.level } };
    }
    return null;
  };
}

/** Sweep, and now and then an idle unit with a charge throws it at a random legal tile (STR, BLAST coverage). */
export function demolitionPolicy(blastRate: number): Policy {
  const sweep = sweepPolicy();
  return (state, side, rng) => {
    if (chance(rng, blastRate)) {
      for (const u of state.units) {
        if (u.down || u.side !== side || u.blast || u.charges <= 0) continue;
        const at = pick(rng, blastTargets(state, u));
        if (at) return { type: 'blast', side, unit: u.id, at };
      }
    }
    return sweep(state, side, rng);
  };
}

/** Hostiles hold their ground: no orders. */
export function standPolicy(): Policy {
  return () => null;
}

/** The game's AI as a sim policy (section 22): it is handed the side's view, never the state (AI-1). */
export function aiPolicy(driver: AiDriver): Policy {
  return (state, side) => driver(view(state, side), side);
}
