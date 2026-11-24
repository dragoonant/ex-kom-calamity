// The AI reads view(state, side) only and is a pure function of it (ARCH-4). No DOM, no three.js.
import { pack } from '../engine/data';
import { dist, hasCover, tileAt, type Pos } from '../engine/grid';
import {
  canTarget, counterSlot, expectedDamage, living, maxHp, moveRange, stats, weaponIn, weapons,
} from '../engine/query';
import { hashText } from '../engine/rng';
import { legalActions } from '../engine/step';
import type { Action, BattleState, Side, Unit, WeaponSlot } from '../engine/types';

export type Difficulty = 'normal' | 'random';

interface Plan { at: Pos; slot: WeaponSlot | null; target: Unit | null; score: number }

/** Distance field over passable tiles from every enemy (ignores walkers), for approach moves. */
function distanceField(s: BattleState, side: Side): number[] {
  const d = new Array<number>(s.w * s.h).fill(Infinity);
  const q: number[] = [];
  for (const e of s.units) if (e.alive && e.side !== side) { const i = e.y * s.w + e.x; d[i] = 0; q.push(i); }
  while (q.length) {
    const i = q.shift()!;
    const x = i % s.w, y = (i - x) / s.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      const t = tileAt(s, nx, ny);
      if (!t || t.obj) continue;
      const j = ny * s.w + nx;
      if (d[j]! > d[i]! + 1) { d[j] = d[i]! + 1; q.push(j); }
    }
  }
  return d;
}

function attackScore(s: BattleState, u: Unit, at: Pos, slot: WeaponSlot, t: Unit): number {
  const ghost = { ...u, x: at.x, y: at.y };
  const e = expectedDamage(s, ghost, slot, t, at);
  let score = e;
  if (e >= t.hp.body * 0.9) score += 40; // likely kill
  const w = weaponIn(u, slot)!;
  if (w.def.class !== 'indirect') {
    const cs = counterSlot(s, t, ghost, at);
    if (cs) score -= 0.6 * expectedDamage(s, t, cs, ghost, t, true);
  }
  if (slot === 'P' && w.ammo !== null) score -= 4; // keep a round back for a better shot
  score += (1 - t.hp.body / maxHp(t, 'body')) * 10; // finish the wounded
  return score;
}

function threatAt(s: BattleState, u: Unit, at: Pos): number {
  const ghost = { ...u, x: at.x, y: at.y };
  let threat = 0;
  for (const e of s.units) {
    if (!e.alive || e.side === u.side) continue;
    const reach = stats(s, e).move;
    for (const w of weapons(e)) {
      if (!w.usable || w.def.class === 'indirect') continue;
      if (dist(e, at) <= w.def.max + reach) threat += expectedDamage(s, e, w.slot, ghost, { x: e.x, y: e.y }) * 0.5;
    }
  }
  return threat;
}

function bestPlan(s: BattleState, u: Unit, field: number[]): Plan {
  const tiles: Pos[] = u.moved ? [{ x: u.x, y: u.y }] : [{ x: u.x, y: u.y }, ...moveRange(s, u)];
  const holding = u.role === 'commander' && s.round < 4 && !s.units.some((e) => e.alive && e.side !== u.side && dist(e, u) <= 7);
  let best: Plan = { at: { x: u.x, y: u.y }, slot: null, target: null, score: -Infinity };
  for (const at of tiles) {
    if (holding && dist(at, u) > 1) continue;
    const enemies = s.units.filter((e) => e.alive && e.side !== u.side);
    const coverBonus = enemies.reduce((a, e) => a + (hasCover(s, e, at) ? 3 : 0), 0);
    const threat = threatAt(s, u, at) * (u.role === 'rifle' || u.role === 'mortar' ? 0.35 : 0.2);
    const high = (tileAt(s, at.x, at.y)?.h ?? 0) * 3;
    for (const w of weapons(u)) {
      if (!w.usable) continue;
      for (const t of enemies) {
        if (!canTarget(s, { ...u, x: at.x, y: at.y }, w.slot, t, at)) continue;
        const sc = attackScore(s, u, at, w.slot, t) + coverBonus + high - threat;
        if (sc > best.score) best = { at, slot: w.slot, target: t, score: sc };
      }
    }
    if (!best.target || best.score === -Infinity) {
      // No attack from anywhere yet: approach, preferring cover and lower threat.
      const d = field[at.y * s.w + at.x] ?? Infinity;
      const keepOff = u.role === 'rifle' || u.role === 'mortar' ? Math.abs(d - 4) * 3 : d * 3;
      const sc = -1000 - keepOff + coverBonus - threat * 0.3 + high;
      if (!best.target && sc > best.score) best = { at, slot: null, target: null, score: sc };
    }
  }
  if (holding && !best.target) return { at: { x: u.x, y: u.y }, slot: null, target: null, score: 0 };
  return best;
}

function repairPlan(s: BattleState, u: Unit): Action | null {
  if (pack(u.build.pack).kind !== 'repair' || u.charges <= 0) return null;
  let bestA: Action | null = null, bestMissing = 25;
  for (const t of living(s, u.side)) {
    if (dist(u, t) > 1) continue;
    for (const p of ['body', 'legs', 'armR', 'armL'] as const) {
      const miss = maxHp(t, p) - t.hp[p];
      const w = p === 'body' ? miss * 1.5 : miss;
      if (t.hp[p] > 0 && w > bestMissing) { bestMissing = w; bestA = { type: 'repair', unit: u.id, target: t.id, part: p }; }
    }
  }
  return bestA;
}

function normal(v: BattleState): Action {
  const side = v.phase;
  const field = distanceField(v, side);
  const ready = living(v, side).filter((u) => !u.acted);
  if (!ready.length) return { type: 'endPhase' };
  ready.sort((a, b) => (field[a.y * v.w + a.x]! - field[b.y * v.w + b.x]!) || a.id.localeCompare(b.id));
  const u = ready[0]!;
  const heal = u.moved ? repairPlan(v, u) : null;
  if (heal) return heal;
  const plan = bestPlan(v, u, field);
  if (!u.moved && (plan.at.x !== u.x || plan.at.y !== u.y)) return { type: 'move', unit: u.id, x: plan.at.x, y: plan.at.y };
  if (plan.target && plan.slot) return { type: 'attack', unit: u.id, slot: plan.slot, target: plan.target.id };
  return repairPlan(v, u) ?? { type: 'wait', unit: u.id };
}

function random(v: BattleState): Action {
  const acts = legalActions(v);
  const nonEnd = acts.filter((a) => a.type !== 'endPhase' && a.type !== 'undoMove' && a.type !== 'attackObject');
  const r = parseInt(hashText(JSON.stringify(v.units) + v.turnCount), 16) / 4294967296;
  if (!nonEnd.length) return { type: 'endPhase' };
  return nonEnd[Math.floor(r * nonEnd.length)]!;
}

/** One action for the side to act, from its view. */
export function chooseAction(v: BattleState, difficulty: Difficulty = 'normal'): Action {
  return difficulty === 'random' ? random(v) : normal(v);
}
