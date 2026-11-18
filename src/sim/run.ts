// One headless battle to completion with invariants checked after every step.
import { createGame, step, type Action, type GameEvent, type Setup, type State } from '../engine';
import { checkInvariants, checkReplay } from './invariants';
import { makeRng, type Policy } from './policies';

export interface RunOptions {
  setup: Setup;
  agency: Policy;
  hostile: Policy;
  /** Stop after this many ticks even if the battle runs on (the battle's own cap is END-3). */
  maxTicks?: number;
  /** Run the deep invariants (INV-5, INV-6) every N accepted actions; 0 = never. */
  deepEvery?: number;
  policySeed?: number;
  onEvent?: (e: GameEvent) => void;
}

export interface RunResult {
  state: State;
  ticks: number;
  orders: number;
  rejected: number;
  broken: string[];
}

export function runBattle(opts: RunOptions): RunResult {
  let state = createGame(opts.setup);
  const rng = makeRng(opts.policySeed ?? opts.setup.seed ^ 0x5bd1e995);
  const deepEvery = opts.deepEvery ?? 0;
  const maxTicks = opts.maxTicks ?? Number.POSITIVE_INFINITY;
  let orders = 0;
  let rejected = 0;
  let steps = 0;
  const broken: string[] = [];

  const apply = (action: Action): void => {
    const prev = state;
    const r = step(state, action);
    if (!r.ok) {
      rejected += 1;
      return;
    }
    if (action.type !== 'tick') orders += 1;
    state = r.state;
    steps += 1;
    if (opts.onEvent) for (const e of r.events) opts.onEvent(e);
    const deep = deepEvery > 0 && steps % deepEvery === 0;
    for (const b of checkInvariants(state, { prev, ticked: action.type === 'tick', deep })) broken.push(`tick ${state.tick}: ${b}`);
  };

  while (!state.over && state.tick < maxTicks && broken.length === 0) {
    const a = opts.agency(state, 'agency', rng);
    if (a) apply(a);
    const h = opts.hostile(state, 'hostile', rng);
    if (h) apply(h);
    apply({ type: 'tick' });
  }
  if (broken.length === 0) for (const b of checkReplay(opts.setup, state)) broken.push(b);
  return { state, ticks: state.tick, orders, rejected, broken };
}
