// ARCH-3, ORD-8: every legal action for a side, tick first, never empty.
import type { Action, Side, State } from './types';
import { POSTURES, SIDES, STANCES } from './types';
import { tileIndex } from './map';
import { pathField, posOfIndex } from './path';
import { sideSeesUnit } from './sight';
import { blastTargets } from './structure';
import { canSuppress } from './fire';
import { captureBlock } from './step';

export function legalActions(state: State, side: Side): Action[] {
  const acts: Action[] = [{ type: 'tick' }];
  if (state.over || side === 'civilian' || !(SIDES as string[]).includes(side)) return acts;
  const occupied = new Set<number>();
  for (const u of state.units) if (!u.down) occupied.add(tileIndex(state, u));
  for (const u of state.units) {
    if (u.down || u.side !== side) continue;
    acts.push({ type: 'halt', side, unit: u.id });
    for (const st of STANCES) if (st !== u.stance) acts.push({ type: 'stance', side, unit: u.id, stance: st });
    // POSE-2; a run (POSE-3) is the same move with run: true and is not listed again (RULING POSE-3).
    for (const p of POSTURES) if (p !== (u.posture ?? 'stand')) acts.push({ type: 'posture', side, unit: u.id, posture: p });
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
    // OBJ-1, OBJ-2: captures and evacuations of the units beside it.
    for (const t of state.units) {
      if (t.down || t.level !== u.level || Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) > 1 || t === u) continue;
      if (t.side === 'civilian' && !t.evacuating && side === 'agency') acts.push({ type: 'evacuate', side, unit: u.id, target: t.id });
      if (side === 'agency' && !captureBlock(state, u, t.id)) acts.push({ type: 'capture', side, unit: u.id, target: t.id });
    }
    // SUP-5: one suppress order per unit, at the nearest seen enemy it can suppress.
    let near: { x: number; y: number; level: number } | null = null;
    let nd = Infinity;
    for (const t of state.units) {
      if (t.down || t.side === side || t.side === 'civilian' || !sideSeesUnit(state, side, t) || !canSuppress(state, u, t).ok) continue;
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d < nd) {
        nd = d;
        near = { x: t.x, y: t.y, level: t.level };
      }
    }
    if (near) acts.push({ type: 'suppress', side, unit: u.id, at: near });
    for (const at of blastTargets(state, u)) acts.push({ type: 'blast', side, unit: u.id, at });
  }
  if (side === 'agency') acts.push({ type: 'withdraw', side });
  return acts;
}
