// Section 9 (FIRE) and 10 (DMG): who may fire at whom, with what chance.
import { WEAPONS, type WeaponDef } from '../data';
import type { ShotBreakdown, State, Unit } from './types';
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
export function hitBreakdown(s: State, shooter: Unit, target: Unit, w: WeaponDef, dist: number): ShotBreakdown {
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
  const raw = w.accuracy + shooter.aim - falloff - movingPenalty - crouchPenalty + crouchBonus - runPenalty - cover.value;
  const chance = Math.min(f.maxHitChance, Math.max(f.minHitChance, raw));
  return { accuracy: w.accuracy, aim: shooter.aim, falloff, movingPenalty, crouchPenalty, crouchBonus, runPenalty, cover: cover.value, coverGrade: cover.grade, raw, chance };
}

/** DMG-1, DMG-2 as a range (QRY-2). */
export function damageRange(w: WeaponDef, target: Unit): { min: number; max: number } {
  return { min: Math.max(0, w.damageMin - target.armour), max: Math.max(0, w.damageMax - target.armour) };
}
