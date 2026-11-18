// The AI's contract (docs/spec/10-rules.md section 22). A driver is handed a side's view and returns orders;
// it never sees the full state, never ticks and never withdraws. No DOM, three.js or React anywhere under src/ai/.
import type { Action, Side, State } from '../engine';

export type Difficulty = 'random' | 'normal';

/** Orders for `side` for this tick, chosen from `view(state, side)` alone (AI-1). Empty off the decision window (AI-3). */
export type AiDriver = (viewState: State, side: Side) => Action[];

export const DIFFICULTIES: Difficulty[] = ['random', 'normal'];

export function isDifficulty(x: unknown): x is Difficulty {
  return typeof x === 'string' && (DIFFICULTIES as string[]).includes(x);
}
