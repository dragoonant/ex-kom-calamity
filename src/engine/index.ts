// The battle engine (docs/spec/10-rules.md). Pure functions over plain-JSON state; no DOM,
// three.js or React anywhere under src/engine/ (ARCH-10). Contract frozen: a change here needs
// a matching edit to the spec.
export type * from './types';
export { STANCES, SIDES } from './types';
export { createGame, mergeTuning } from './game';
export { step } from './step';
export { legalActions } from './legal';
export { view } from './view';
export { query } from './query';
export type { HitChance } from './query';
export { advance } from './advance';
export { replay, hashState, appendLog, expandLog } from './replay';
export { seedRng, nextInt, nextU32 } from './rng';
export { parseMap, tileIndex, tileAt, inBounds, isPassable, distance, chebyshev, hasLineOfSight } from './map';
export { pathField, pathTo, posOfIndex, stepCost, neighbours } from './path';
export { unitById, livingUnits, sideSeesUnit, sideSeesTile, unitSeesTile, appearsCivilianTo } from './sight';
export { canFire, hitBreakdown, weaponOf } from './fire';
export { canBlast, blastFootprint, blastTargets, isBreakable } from './structure';
