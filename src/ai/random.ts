// The `random` difficulty (AI-7), for either side: in each decision window every living unit, with
// `ai.randomOrderPercent` chance, takes one random order among move (within 30 ticks), fire at a unit of another
// side it sees, a stance change, or a charge at a tile it can see. Never withdraw, never tick. It is the floor the
// bench measures `normal` against, and a rules fuzzer in its own right (KB gotchas: benches are rules fuzzers).
import { query, STANCES, tileIndex, type Action, type Side, type State } from '../engine';
import { boundedField, fieldTiles } from './nav';
import { percent, pickWith, unitRng } from './rng';

export function randomAi(view: State, side: Side): Action[] {
  const out: Action[] = [];
  const t = view.tuning.ai;
  const occupied = new Set<number>();
  for (const u of view.units) if (!u.down) occupied.add(tileIndex(view, u));
  for (const u of view.units) {
    if (u.down || u.side !== side) continue;
    const rng = unitRng(view.seed, view.tick, side, u.id);
    if (!percent(rng, t.randomOrderPercent)) continue;
    const kind = pickWith(rng, ['move', 'move', 'fire', 'stance', 'blast'] as const)!;
    if (kind === 'move') {
      const tiles = fieldTiles(view, boundedField(view, u, 30)).filter((p) => p.ticks > 0 && !occupied.has(tileIndex(view, p)));
      const to = pickWith(rng, tiles);
      if (to) out.push({ type: 'move', side, unit: u.id, to: { x: to.x, y: to.y, level: to.level } });
    } else if (kind === 'fire') {
      const targets = view.units.filter((o) => !o.down && o.side !== side);
      const tg = pickWith(rng, targets);
      if (tg) out.push({ type: 'fire', side, unit: u.id, target: tg.id });
    } else if (kind === 'stance') {
      const st = pickWith(rng, STANCES.filter((s) => s !== u.stance))!;
      out.push({ type: 'stance', side, unit: u.id, stance: st });
    } else if (u.charges > 0 && !u.blast) {
      const r = view.tuning.blast.throwRange;
      for (let tries = 0; tries < 8; tries++) {
        const at = { x: u.x + Math.floor((pickWith(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])! - 6) * (r / 6)), y: u.y + Math.floor((pickWith(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])! - 6) * (r / 6)), level: u.level };
        if (query.blastPreview(view, u.id, at).ok) {
          out.push({ type: 'blast', side, unit: u.id, at });
          break;
        }
      }
    }
  }
  return out;
}
