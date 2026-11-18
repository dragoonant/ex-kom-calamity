// Driving a battle with AI sides (AI-8, AI-9): before each tick a side's driver is handed view(state, side) and its
// orders go through step like the player's; a rejected order is dropped. Time still moves only through tick, so
// a paused client gives the AI no turn. Shared by the client's advance and the bench.
import { step, view, type Action, type GameEvent, type Side, type State } from '../engine';
import type { AiDriver } from './types';

export type AiSides = Partial<Record<Side, AiDriver>>;

/** The AI's turn for one tick: its orders applied in order, rejections dropped and counted. */
export function aiOrders(state: State, ai: AiSides): { state: State; events: GameEvent[]; applied: Action[]; rejected: number } {
  let s = state;
  const events: GameEvent[] = [];
  const applied: Action[] = [];
  let rejected = 0;
  if (s.over) return { state: s, events, applied, rejected };
  for (const side of ['agency', 'hostile'] as Side[]) {
    const driver = ai[side];
    if (!driver) continue;
    if (s.tick % s.tuning.ai.decideTicks !== 0) continue;
    for (const a of driver(view(s, side), side)) {
      if (a.type === 'tick' || a.type === 'withdraw') continue;
      const r = step(s, a);
      if (!r.ok) {
        rejected += 1;
        continue;
      }
      s = r.state;
      applied.push(a);
      for (const e of r.events) events.push(e);
    }
  }
  return { state: s, events, applied, rejected };
}

/** TIME-4's advance with AI turns between the ticks (AI-8). */
export function advanceWithAi(state: State, seconds: number, ai: AiSides): { state: State; events: GameEvent[] } {
  const n = Math.round(seconds * state.tuning.time.ticksPerSecond);
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    if (s.over) break;
    const o = aiOrders(s, ai);
    s = o.state;
    for (const e of o.events) events.push(e);
    const r = step(s, { type: 'tick' });
    if (!r.ok) break; // cannot happen: tick is always legal (ARCH-3)
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { state: s, events };
}
