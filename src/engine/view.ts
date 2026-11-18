// ARCH-5, section 13: what a side may know.
import { UNITS } from '../data';
import type { Side, State, Unit } from './types';
import { sideSeesTile } from './sight';

export function redactUnit(viewer: Side, u: Unit): Unit {
  const r: Unit = {
    ...u,
    order: null,
    fireTarget: null,
    aimProgress: 0,
    readyTick: 0,
    lastFiredTick: -1,
    stance: 'hold',
  };
  if (viewer === 'agency' && u.side === 'hostile' && u.disguised && !u.revealed) {
    const citizen = UNITS.citizen;
    r.template = 'citizen';
    r.side = 'civilian';
    r.weapon = null;
    r.disguised = false;
    r.name = citizen?.name ?? 'Citizen';
  }
  return r;
}

export function view(state: State, side: Side): State {
  const units: Unit[] = [];
  for (const u of state.units) {
    if (u.side === side) units.push({ ...u, order: u.order ? { ...u.order, path: u.order.path.map((p) => ({ ...p })) } : null });
    else if (side !== 'civilian' && sideSeesTile(state, side, u)) units.push(redactUnit(side, u));
  }
  return { ...state, units, rng: [0, 0, 0, 0], log: [] };
}
