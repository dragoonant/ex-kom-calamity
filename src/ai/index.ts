// The AI (docs/spec/10-rules.md section 22). Pure functions over a side's view; no DOM, three.js or React here.
import type { Side } from '../engine';
import { makeAgencyNormal } from './agency';
import { hostileNormal } from './hostile';
import { randomAi } from './random';
import type { AiDriver, Difficulty } from './types';

export type { AiDriver, Difficulty } from './types';
export { DIFFICULTIES, isDifficulty } from './types';
export { advanceWithAi, aiOrders, type AiSides } from './drive';
export { hostileNormal } from './hostile';
export { randomAi } from './random';
export { makeAgencyNormal } from './agency';

/** A driver for a side at a difficulty (AI-2). `random` and the hostile `normal` are stateless; the agency `normal` keeps a memory. */
export function makeAi(side: Side, difficulty: Difficulty): AiDriver {
  if (difficulty === 'random') return randomAi;
  if (side === 'hostile') return hostileNormal;
  return makeAgencyNormal();
}
