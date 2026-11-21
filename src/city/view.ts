// CVIEW-1..3: what each side may know.
import type { CitySide, CityState } from './types';

export function cityView(state: CityState, side: CitySide): CityState {
  const v = JSON.parse(JSON.stringify(state)) as CityState;
  // CVIEW-3: neither side reads the dice.
  v.rng = [0, 0, 0, 0];
  if (side === 'agency') {
    // CVIEW-1: infiltration, the organism's biomass and timing, and which slips are genuine are hidden.
    for (const o of v.orgs) o.infiltration = -1;
    v.biomass = -1;
    v.hostileReadyTick = -1;
    for (const sl of v.slips) sl.genuine = false;
    v.score.taken = -1;
    v.score.seeds = -1;
    // CVIEW-1: until the squad arrives, nobody at the agency knows what is inside.
    if (v.raid && !v.raid.arrived) v.raid.hostiles = -1;
  }
  // CVIEW-2: the organism sees the whole city, the agency's orders included.
  return v;
}
