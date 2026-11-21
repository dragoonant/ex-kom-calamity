// CSIM-1: plays a seeded campaign with two city drivers, checking the invariants (CINV) as it goes.
import { cityStep, cityView, createCity, ticksPerHour, type CityAction, type CityState, type CityTuning } from '../city';
import type { CityDriver } from '../ai/city';
import { cityInvariants } from './cityInvariants';

export interface CityRun {
  state: CityState;
  ticks: number;
  orders: number;
  rejected: number;
  broken: string[];
}

export function runCity(opts: { seed: number; agency: CityDriver; hostile: CityDriver; maxTicks?: number; checkEvery?: number; tuning?: Partial<CityTuning> }): CityRun {
  let s = createCity({ seed: opts.seed, tuning: opts.tuning });
  const maxTicks = opts.maxTicks ?? (s.tuning.end.actDays + 1) * 144;
  const checkEvery = opts.checkEvery ?? 144;
  let orders = 0;
  let rejected = 0;
  const broken: string[] = [];
  let guard = 0;
  const tph = ticksPerHour(s.tuning);
  while (!s.over && s.tick < maxTicks && guard < maxTicks * 4) {
    guard += 1;
    // CSIM-1: drivers decide on the hour (the careful and random drivers act only then) and whenever a squad is at the door.
    const decide = s.tick % tph === 0 || (s.raid?.arrived ?? false);
    const acts: CityAction[] = decide ? [...opts.hostile(cityView(s, 'hostile')), ...opts.agency(cityView(s, 'agency'))] : [];
    for (const a of acts) {
      const r = cityStep(s, a);
      orders += 1;
      if (r.ok) s = r.state;
      else rejected += 1;
    }
    const before = s;
    const r = cityStep(s, { type: 'tick' });
    if (r.ok) s = r.state;
    if (s === before && !s.over) {
      // RAID-4: a squad stands at the door and the driver did not resolve; resolve it so the run moves on.
      const rr = cityStep(s, { type: 'resolve', side: 'agency' });
      if (rr.ok) s = rr.state;
      else break;
    }
    if (s.tick % checkEvery === 0) for (const b of cityInvariants(s)) broken.push(`tick ${s.tick}: ${b}`);
  }
  for (const b of cityInvariants(s)) broken.push(`end: ${b}`);
  return { state: s, ticks: s.tick, orders, rejected, broken };
}
