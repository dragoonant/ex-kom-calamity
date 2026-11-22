// Section 9 (FIRE) and 10 (DMG): who may fire at whom, with what chance.
import { WEAPONS, type WeaponDef } from '../data';
import type { Pos, ShotBreakdown, State, Unit } from './types';
import { chebyshev, distance } from './map';
import { unitSeesTile } from './sight';
import { coverAgainst } from './cover';

export function weaponOf(u: Unit): WeaponDef | null {
  if (!u.weapon) return null;
  return WEAPONS[u.weapon] ?? null;
}

export type CanFire = { ok: true; weapon: WeaponDef; distance: number } | { ok: false; reason: string };

/** FIRE-1 */
export function canFire(s: State, shooter: Unit, target: Unit): CanFire {
  const w = weaponOf(shooter);
  if (!w) return { ok: false, reason: 'no weapon' };
  if (target.side === shooter.side) return { ok: false, reason: 'same side' };
  if (shooter.down) return { ok: false, reason: 'shooter down' };
  if (target.down) return { ok: false, reason: 'target down' };
  if (target.level !== shooter.level) return { ok: false, reason: 'different level' };
  if (!unitSeesTile(s, shooter, target)) return { ok: false, reason: 'not seen' };
  const d = distance(shooter, target) ?? Infinity;
  if (w.kind === 'melee') {
    if ((chebyshev(shooter, target) ?? Infinity) > 1) return { ok: false, reason: 'not adjacent' };
    return { ok: true, weapon: w, distance: 0 };
  }
  if (d > w.range) return { ok: false, reason: 'out of range' };
  return { ok: true, weapon: w, distance: d };
}

/** FIRE-5 */
export function hitBreakdown(s: State, shooter: Unit, target: Unit, w: WeaponDef, dist: number, snap = false): ShotBreakdown {
  const f = s.tuning.fire;
  const falloff = w.falloffPerTile * Math.floor(dist);
  const movingPenalty = target.moving ? f.movingTargetPenalty : 0;
  // POSE-4: crouching makes a smaller target at range and a steadier shooter; running leaves a shooter winded.
  const ranged = w.kind === 'ranged';
  const crouchPenalty = ranged && target.posture === 'crouch' && dist >= 2 ? f.crouchTargetPenalty : 0;
  const crouchBonus = ranged && shooter.posture === 'crouch' ? f.crouchAimBonus : 0;
  const ran = shooter.lastRunTick ?? null;
  const runPenalty = ran !== null && s.tick - ran < f.runSettleTicks ? f.runningShooterPenalty : 0;
  // COVER-4: a ranged shot at a target with cover on the shooter's side.
  const cover = ranged ? coverAgainst(s, target, shooter) : { grade: 'none' as const, value: 0 };
  // SNAP-2: a ranged shot the unit chose itself is a snap shot.
  const snapPenalty = ranged && snap ? (s.tuning.snap?.penalty ?? 0) : 0;
  // SUP-2: a suppressed shooter's aim suffers.
  const suppressPenalty = Math.floor(((shooter.suppression ?? 0) * (s.tuning.suppress?.aimPercent ?? 0)) / 100);
  const raw = w.accuracy + shooter.aim - falloff - movingPenalty - crouchPenalty + crouchBonus - runPenalty - cover.value - snapPenalty - suppressPenalty;
  const chance = Math.min(f.maxHitChance, Math.max(f.minHitChance, raw));
  return { accuracy: w.accuracy, aim: shooter.aim, falloff, movingPenalty, crouchPenalty, crouchBonus, runPenalty, cover: cover.value, coverGrade: cover.grade, snapPenalty, suppressPenalty, raw, chance };
}

/** SNAP-1: the ticks a shot takes to aim; a ranged snap shot takes snap.aimPercent of them, at least one. */
export function aimTicksFor(s: State, w: WeaponDef, snap: boolean): number {
  if (!snap || w.kind !== 'ranged') return w.aimTicks;
  return Math.max(1, Math.ceil((w.aimTicks * (s.tuning.snap?.aimPercent ?? 100)) / 100));
}

/** SUP-3: whether a unit can lay suppressive fire on a tile now. */
export function canSuppress(s: State, u: Unit, at: Pos): { ok: true } | { ok: false; reason: string } {
  const w = weaponOf(u);
  if (!w || w.kind !== 'ranged') return { ok: false, reason: 'no ranged weapon' };
  if (u.down) return { ok: false, reason: 'shooter down' };
  if (at.level !== u.level) return { ok: false, reason: 'different level' };
  if ((distance(u, at) ?? Infinity) > w.range) return { ok: false, reason: 'out of range' };
  if (!unitSeesTile(s, u, at)) return { ok: false, reason: 'tile not seen' };
  return { ok: true };
}

/** SUP-4: pinned. */
export function isPinned(s: State, u: Unit): boolean {
  return (u.suppression ?? 0) >= (s.tuning.suppress?.pinnedAt ?? Infinity);
}

/** DMG-1, DMG-2 as a range (QRY-2). */
export function damageRange(w: WeaponDef, target: Unit): { min: number; max: number } {
  return { min: Math.max(0, w.damageMin - target.armour), max: Math.max(0, w.damageMax - target.armour) };
}
