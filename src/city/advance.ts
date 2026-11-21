// CLOCK-6: the deterministic hook the client's loop and the tests drive.
import { cityStep } from './step';
import type { CityEvent, CityState } from './types';

export function advanceCity(state: CityState, seconds: number): { state: CityState; events: CityEvent[] } {
  return advanceCityTicks(state, Math.round(seconds * state.tuning.clock.ticksPerSecond));
}

export function advanceCityTicks(state: CityState, ticks: number): { state: CityState; events: CityEvent[] } {
  let s = state;
  const events: CityEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = cityStep(s, { type: 'tick' });
    if (!r.ok || r.state === s) break; // over, or a squad at the door: time stands still (RAID-4)
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { state: s, events };
}
