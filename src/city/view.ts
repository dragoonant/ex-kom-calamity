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
    if (v.raid && !v.raid.arrived) {
      v.raid.hostiles = -1;
      v.raid.takers = -1;
      v.raid.fighters = -1;
    }
    // AIR-2: where a craft is going is hidden.
    for (const c of v.craft) {
      c.tx = c.x;
      c.ty = c.y;
      c.target = '';
    }
    // SHOP-3, KIT-6: sabotage is hidden, on the shelf, on order and in every agent's kit.
    for (const p of v.shop.armoury) p.sabotaged = false;
    for (const a of v.agents) for (const r of [a.kit.suit, a.kit.long, a.kit.side, ...a.kit.belt]) if (r?.piece) r.piece.sabotaged = false;
    for (const o of v.shop.orders) o.sabotaged = false;
  }
  // CVIEW-2: the organism sees the whole city, the agency's orders included.
  return v;
}
