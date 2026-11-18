// ARCH-3, ORD-8: every legal action for a side, tick first, never empty.
import type { Action, Side, State } from './types';
import { SIDES, STANCES } from './types';
import { tileIndex } from './map';
import { pathField, posOfIndex } from './path';
import { sideSeesUnit } from './sight';
import { blastTargets } from './structure';

export function legalActions(state: State, side: Side): Action[] {
  const acts: Action[] = [{ type: 'tick' }];
  if (state.over || side === 'civilian' || !(SIDES as string[]).includes(side)) return acts;
  const occupied = new Set<number>();
  for (const u of state.units) if (!u.down) occupied.add(tileIndex(state, u));
  for (const u of state.units) {
    if (u.down || u.side !== side) continue;
    acts.push({ type: 'halt', side, unit: u.id });
    for (const st of STANCES) if (st !== u.stance) acts.push({ type: 'stance', side, unit: u.id, stance: st });
    const own = tileIndex(state, u);
    const field = pathField(state, u, null);
    const idxs = [...field.dist.keys()].sort((a, b) => a - b);
    for (const idx of idxs) {
      if (idx === own || occupied.has(idx)) continue;
      acts.push({ type: 'move', side, unit: u.id, to: posOfIndex(state, idx) });
    }
    for (const t of state.units) {
      if (t.down || t.side === side) continue;
      if (sideSeesUnit(state, side, t)) acts.push({ type: 'fire', side, unit: u.id, target: t.id });
    }
    // ORD-9
    for (const at of blastTargets(state, u)) acts.push({ type: 'blast', side, unit: u.id, at });
  }
  if (side === 'agency') acts.push({ type: 'withdraw', side });
  return acts;
}
