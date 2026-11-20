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
    blast: null,
    charges: 0,
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
    if (u.side === side) units.push({ ...u, order: u.order ? { ...u.order, path: u.order.path.map((p) => ({ ...p })) } : null, blast: u.blast ? { at: { ...u.blast.at }, progress: u.blast.progress } : null });
    else if (side !== 'civilian' && sideSeesTile(state, side, u)) units.push(redactUnit(side, u));
  }
  const out: State = { ...state, units, rng: [0, 0, 0, 0], log: [] };
  // VIEW-5: once only a few hostiles live, the agency is shown where the unseen ones stand.
  if (side === 'agency') {
    const living = state.units.filter((u) => u.side === 'hostile' && !u.down);
    if (living.length > 0 && living.length <= state.tuning.sight.markLastHostiles) {
      out.marks = living.filter((u) => !sideSeesTile(state, side, u)).map((u) => ({ x: u.x, y: u.y, level: u.level }));
    }
  }
  return out;
}
