import { newBattle } from '../src/engine/step';
import type { BattleState, Unit } from '../src/engine/types';
export const fresh = (seed = 1): BattleState => newBattle('marrow-yard', seed);
export const u = (s: BattleState, id: string): Unit => s.units.find((x) => x.id === id)!;
/** Clear every object and move every walker off the field except the named ones, for focused rule tests. */
export function arena(keep: string[], seed = 1): BattleState {
  const s = fresh(seed);
  for (const t of s.tiles) { t.obj = null; t.t = 'concrete'; t.h = 0; }
  s.units = s.units.filter((x) => keep.includes(x.id));
  return s;
}
export const place = (s: BattleState, id: string, x: number, y: number): void => { const w = u(s, id); w.x = x; w.y = y; };
