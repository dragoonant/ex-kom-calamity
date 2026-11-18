// ARCH-4, section 14: every number a client could show.
import type { Pos, ShotBreakdown, Side, State } from './types';
import { distance as tileDistance, hasLineOfSight, tileIndex } from './map';
import { pathField, pathTo, posOfIndex } from './path';
import { sideSeesUnit, unitById, visibleTileIndices } from './sight';
import { canFire, damageRange as weaponDamageRange, hitBreakdown } from './fire';

export type HitChance =
  | ({ ok: true; shooter: string; target: string; weapon: string; distance: number } & ShotBreakdown)
  | { ok: false; reason: string };

export const query = {
  /** QRY-1 */
  seconds(state: State): number {
    return state.tick / state.tuning.time.ticksPerSecond;
  },
  ticksFor(state: State, seconds: number): number {
    return Math.round(seconds * state.tuning.time.ticksPerSecond);
  },

  /** QRY-2 */
  hitChance(state: State, shooterId: string, targetId: string): HitChance {
    const shooter = unitById(state, shooterId);
    const target = unitById(state, targetId);
    if (!shooter) return { ok: false, reason: `no unit ${shooterId}` };
    if (!target) return { ok: false, reason: `no unit ${targetId}` };
    const cf = canFire(state, shooter, target);
    if (!cf.ok) return cf;
    return { ok: true, shooter: shooterId, target: targetId, weapon: shooter.weapon!, distance: cf.distance, ...hitBreakdown(state, shooter, target, cf.weapon, cf.distance) };
  },
  damageRange(state: State, shooterId: string, targetId: string): { min: number; max: number } | null {
    const shooter = unitById(state, shooterId);
    const target = unitById(state, targetId);
    if (!shooter || !target) return null;
    const cf = canFire(state, shooter, target);
    if (!cf.ok) return null;
    return weaponDamageRange(cf.weapon, target);
  },

  /** QRY-3 */
  reachable(state: State, unitId: string): (Pos & { ticks: number })[] {
    const u = unitById(state, unitId);
    if (!u || u.down) return [];
    const occupied = new Set<number>();
    for (const o of state.units) if (!o.down) occupied.add(tileIndex(state, o));
    const own = tileIndex(state, u);
    const field = pathField(state, u, null);
    return [...field.dist.entries()]
      .filter(([idx]) => idx !== own && !occupied.has(idx))
      .sort((a, b) => a[0] - b[0])
      .map(([idx, ticks]) => ({ ...posOfIndex(state, idx), ticks }));
  },
  path(state: State, unitId: string, to: Pos): { steps: Pos[]; ticks: number } | null {
    const u = unitById(state, unitId);
    if (!u || u.down) return null;
    const field = pathField(state, u, null);
    const steps = pathTo(state, field, to);
    if (!steps || steps.length === 0) return null;
    return { steps, ticks: field.dist.get(tileIndex(state, to)) ?? 0 };
  },

  /** QRY-4 */
  canSee(state: State, side: Side, unitId: string): boolean {
    const u = unitById(state, unitId);
    if (!u) return false;
    if (side === 'civilian') return u.side === 'civilian';
    return sideSeesUnit(state, side, u);
  },
  visibleTiles(state: State, side: Side): Pos[] {
    return visibleTileIndices(state, side).map((idx) => posOfIndex(state, idx));
  },
  los(state: State, a: Pos, b: Pos): boolean {
    return hasLineOfSight(state, a, b);
  },
  distance(a: Pos, b: Pos): number | null {
    return tileDistance(a, b);
  },

  /** QRY-5 */
  outcome(state: State) {
    const living = { agency: 0, hostile: 0, civilian: 0 };
    for (const u of state.units) if (!u.down) living[u.side] += 1;
    return { tick: state.tick, seconds: state.tick / state.tuning.time.ticksPerSecond, score: { ...state.score }, living, over: state.over ? { ...state.over } : null };
  },

  /** QRY-6 */
  unitsSeen(state: State, side: Side): string[] {
    const out: string[] = [];
    for (const u of state.units) {
      if (side === 'civilian' ? u.side === 'civilian' : sideSeesUnit(state, side, u)) out.push(u.id);
    }
    return out;
  },
};
