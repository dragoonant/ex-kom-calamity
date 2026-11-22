// ARCH-4, section 14: every number a client could show.
import type { Pos, ShotBreakdown, Side, State, Unit } from './types';
import { coverAgainst, type CoverGrade } from './cover';
import { distance as tileDistance, hasLineOfSight, tileIndex } from './map';
import { pathField, pathTo, posOfIndex } from './path';
import { isLit, sideSeesUnit, unitById, visibleTileIndices } from './sight';
import { canFire, damageRange as weaponDamageRange, hitBreakdown } from './fire';
import { MATERIALS } from '../data';
import { blastFootprint, canBlast, isBreakable } from './structure';
import { inBounds } from './map';

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
  /** QRY-9 (COVER-1..2): the cover a tile would give against the nearest hostile the side sees on its level, for the file card. */
  coverAt(state: State, side: Side, at: Pos): { grade: CoverGrade; value: number; from: string } | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of state.units) {
      if (u.down || u.side === side || u.side === 'civilian' || u.level !== at.level || !sideSeesUnit(state, side, u)) continue;
      const d = Math.hypot(u.x - at.x, u.y - at.y);
      if (d < bd) {
        best = u;
        bd = d;
      }
    }
    if (!best) return null;
    return { ...coverAgainst(state, at, best), from: best.id };
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
  /** NIGHT-2: whether a tile is lit (an indoor floor or stair, or ground near a street lamp); the board warms it. */
  lit(state: State, p: Pos): boolean {
    return isLit(state, p);
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

  /** QRY-7 */
  tileInfo(state: State, p: Pos): { kind: string; open: boolean; material: string; materialName: string; hp: number; maxHp: number; breakable: boolean } | null {
    if (!inBounds(state, p)) return null;
    const t = state.tiles[tileIndex(state, p)];
    if (!t) return null;
    const m = MATERIALS[t.material];
    return { kind: t.kind, open: t.open, material: t.material, materialName: m?.name ?? t.material, hp: t.hp, maxHp: m?.hp ?? 0, breakable: isBreakable(t) };
  },
  /** QRY-8 */
  blastPreview(state: State, unitId: string, at: Pos): { ok: true; armTicks: number; tiles: (Pos & { structureDamage: number; unitDamage: number })[] } | { ok: false; reason: string } {
    const u = unitById(state, unitId);
    if (!u) return { ok: false, reason: `no unit ${unitId}` };
    const cb = canBlast(state, u, at);
    if (!cb.ok) return cb;
    return { ok: true, armTicks: state.tuning.blast.armTicks, tiles: blastFootprint(state, at) };
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
