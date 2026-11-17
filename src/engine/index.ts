// Engine seam, M0 stub. The contract (CLAUDE.md, KB recipe.md step 3): pure step, plain-JSON
// state, seeded RNG in the state, and time that advances only through a `tick` action.
// M1 replaces the body from docs/spec/10-rules.md; the shapes below are the starting point.

export interface GameState {
  /** Sim ticks elapsed. Pause is the absence of tick actions. */
  tick: number;
  seed: number;
}

export type Action = { type: 'tick' };

export type StepResult =
  | { ok: true; state: GameState; events: never[] }
  | { ok: false; state: GameState; reason: string };

export function initialState(seed: number): GameState {
  return { tick: 0, seed };
}

export function step(state: GameState, action: Action): StepResult {
  if (action.type === 'tick') return { ok: true, state: { ...state, tick: state.tick + 1 }, events: [] };
  return { ok: false, state, reason: 'unknown action' };
}

export function legalActions(_state: GameState): Action[] {
  return [{ type: 'tick' }];
}
