// TIME-4: the deterministic hook a fixed-step client loop and the tests drive.
import type { GameEvent, State } from './types';
import { step } from './step';

export function advance(state: State, seconds: number): { state: State; events: GameEvent[] } {
  const n = Math.round(seconds * state.tuning.time.ticksPerSecond);
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = step(s, { type: 'tick' });
    if (!r.ok) break; // cannot happen: tick is always legal (ARCH-3)
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { state: s, events };
}
