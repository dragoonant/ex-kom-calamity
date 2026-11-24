// query.* owns every number the client shows (ARCH-3).
import { arm, body, legs, pack, pilot, RULES, weapon, type WeaponDef } from './data';
import { dist, hasCover, hasLos, reachable, tileAt, type Pos, type Reach } from './grid';
import type { BattleState, PartSlot, Unit, WeaponSlot } from './types';

export const unitById = (s: BattleState, id: string): Unit | null => s.units.find((u) => u.id === id) ?? null;

export function maxHp(u: Unit, part: PartSlot): number {
  if (part === 'body') return body(u.build.body).hp;
  if (part === 'legs') return legs(u.build.legs).hp;
  return arm(part === 'armL' ? u.build.armL : u.build.armR).hp;
}

export interface Stats { move: number; evade: number; weight: number; power: number; overweight: boolean }

/** WLK-2, WLK-3, MAP-6, PIL-2. */
export function stats(s: BattleState | null, u: Unit): Stats {
  const b = body(u.build.body), l = legs(u.build.legs), p = pack(u.build.pack);
  const weight = b.weight + arm(u.build.armL).weight + arm(u.build.armR).weight + l.weight + p.weight + (weapon(u.build.wL)?.weight ?? 0) + (weapon(u.build.wR)?.weight ?? 0);
  const overweight = weight > b.power;
  let move = l.move - (overweight ? RULES.overweightMove : 0);
  let evade = l.evade + pilot(u.pilot).evade - (overweight ? RULES.overweightEvade : 0);
  if (u.hp.legs <= 0) { move = 1; evade = 0; }
  if (s) { const t = tileAt(s, u.x, u.y); if (t?.t === 'water' && u.hp.legs > 0) evade -= RULES.waterEvade; }
  return { move: Math.max(1, move), evade, weight, power: b.power, overweight };
}

export interface WeaponInfo { slot: WeaponSlot; id: string; def: WeaponDef; usable: boolean; ammo: number | null }

/** The walker's weapons by slot; `usable` folds in lost arms (WLK-3) and ammunition (ATK-6). Shields are listed but never usable. */
export function weapons(u: Unit): WeaponInfo[] {
  const out: WeaponInfo[] = [];
  const add = (slot: WeaponSlot, id: string | null, armUp: boolean, ammo: number | null) => {
    const def = weapon(id);
    if (!def || !id) return;
    out.push({ slot, id, def, usable: armUp && def.class !== 'shield' && (ammo === null || ammo > 0), ammo });
  };
  add('R', u.build.wR, u.hp.armR > 0, null);
  add('L', u.build.wL, u.hp.armL > 0, null);
  const p = pack(u.build.pack);
  if (p.kind === 'weapon' && p.weapon) add('P', p.weapon, true, u.ammo);
  return out;
}

export const weaponIn = (u: Unit, slot: WeaponSlot): WeaponInfo | null => weapons(u).find((w) => w.slot === slot) ?? null;

/** ATK-7: an ally with a sensor pack sees the target within its sensor range. */
export function spotted(s: BattleState, side: Unit['side'], target: Pos, exclude?: string): boolean {
  return s.units.some((a) => {
    if (!a.alive || a.side !== side || a.id === exclude) return false;
    const p = pack(a.build.pack);
    return p.kind === 'sensor' && dist(a, target) <= (p.sensorRange ?? 0) && hasLos(s, a, target);
  });
}

/** ATK-1, ATK-5: can `u` (standing at `at`) hit `target` with the weapon in `slot`? */
export function canTarget(s: BattleState, u: Unit, slot: WeaponSlot, target: Unit, at: Pos = u): boolean {
  const w = weaponIn(u, slot);
  if (!w || !w.usable || !target.alive || target.side === u.side) return false;
  const d = dist(at, target);
  if (d < w.def.min || d > w.def.max) return false;
  if (w.def.class === 'indirect') {
    if (hasLos(s, at, target)) return true;
    return s.units.some((a) => a.alive && a.side === u.side && a.id !== u.id && hasLos(s, a, target));
  }
  return hasLos(s, at, target);
}

/** ATK-2 (+ATK-5 no cover for indirect, ATK-7 spotter). */
export function hitChance(s: BattleState, u: Unit, slot: WeaponSlot, target: Unit, at: Pos = u, counter = false): number {
  const w = weaponIn(u, slot);
  if (!w) return 0;
  const a = arm(slot === 'L' ? u.build.armL : u.build.armR);
  let c = w.def.acc + (slot === 'P' ? 0 : a.acc) + pilot(u.pilot).skill;
  const ht = tileAt(s, at.x, at.y)?.h ?? 0, tt = tileAt(s, target.x, target.y)?.h ?? 0;
  if (ht > tt) c += RULES.heightBonus;
  c -= stats(s, target).evade;
  if (w.def.class === 'indirect') { if (spotted(s, u.side, target, u.id)) c += RULES.spotterBonus; }
  else if (hasCover(s, at, target)) c -= RULES.coverPenalty;
  if (counter) c -= RULES.counterPenalty; // ATK-8
  return Math.max(RULES.hitMin, Math.min(RULES.hitMax, Math.round(c)));
}

/** Damage range of one hit on a given part, with the shield (WLK-5). */
export function damageRange(w: WeaponDef, target: Unit | null, part: PartSlot = 'body'): [number, number] {
  let lo = Math.round(w.dmg * RULES.dmgSpread[0]), hi = Math.round(w.dmg * RULES.dmgSpread[1]);
  if (target) { const g = guard(target, part); lo = Math.round(lo * (1 - g)); hi = Math.round(hi * (1 - g)); }
  return [lo, hi];
}

export function guard(u: Unit, part: PartSlot): number {
  if (part !== 'body' && part !== 'armL') return 0;
  const sh = weapon(u.build.wL);
  if (!sh || sh.class !== 'shield' || u.hp.armL <= 0) return 0;
  return (sh.guard ?? 0) / 100;
}

export function expectedDamage(s: BattleState, u: Unit, slot: WeaponSlot, target: Unit, at: Pos = u, counter = false): number {
  const w = weaponIn(u, slot);
  if (!w) return 0;
  const p = hitChance(s, u, slot, target, at, counter) / 100;
  const g = guard(target, 'body') * 0.6;
  return w.def.shots * p * w.def.dmg * (1 - g);
}

/** ATK-8: the counter the target would fire back, if any. */
export function counterSlot(s: BattleState, target: Unit, attacker: Unit, attackerAt: Pos = attacker): WeaponSlot | null {
  const d = dist(target, attackerAt);
  let best: WeaponSlot | null = null, bestDmg = 0;
  for (const w of weapons(target)) {
    if (!w.usable || w.slot === 'P' || w.def.class === 'indirect') continue;
    if (d < w.def.min || d > w.def.max) continue;
    if (!hasLos(s, target, attackerAt)) continue;
    const ghost = { ...attacker, x: attackerAt.x, y: attackerAt.y };
    const e = expectedDamage(s, target, w.slot, ghost, target, true);
    if (e > bestDmg) { bestDmg = e; best = w.slot; }
  }
  return best;
}

export interface Preview {
  chance: number;
  shots: number;
  dmg: [number, number];
  cover: boolean;
  spotted: boolean;
  counter: { slot: WeaponSlot; weapon: string; chance: number; shots: number; dmg: [number, number] } | null;
}

export function preview(s: BattleState, u: Unit, slot: WeaponSlot, target: Unit): Preview | null {
  const w = weaponIn(u, slot);
  if (!w || !canTarget(s, u, slot, target)) return null;
  const indirect = w.def.class === 'indirect';
  let counter: Preview['counter'] = null;
  if (!indirect) {
    const cs = counterSlot(s, target, u);
    const cw = cs ? weaponIn(target, cs) : null;
    if (cs && cw) counter = { slot: cs, weapon: cw.def.name, chance: hitChance(s, target, cs, u, target, true), shots: cw.def.shots, dmg: damageRange(cw.def, u) };
  }
  return {
    chance: hitChance(s, u, slot, target),
    shots: w.def.shots,
    dmg: damageRange(w.def, target),
    cover: !indirect && hasCover(s, u, target),
    spotted: indirect && spotted(s, u.side, target, u.id),
    counter,
  };
}

export function moveRange(s: BattleState, u: Unit): Reach[] {
  if (!u.alive || u.moved || u.acted) return [];
  return reachable(s, u, stats(s, u).move);
}

export function targetsFor(s: BattleState, u: Unit, at: Pos = u): { slot: WeaponSlot; target: Unit }[] {
  const out: { slot: WeaponSlot; target: Unit }[] = [];
  for (const w of weapons(u)) for (const t of s.units) if (canTarget(s, u, w.slot, t, at)) out.push({ slot: w.slot, target: t });
  return out;
}

export const living = (s: BattleState, side: Unit['side']): Unit[] => s.units.filter((u) => u.alive && u.side === side);
export const hpTotal = (u: Unit): number => u.hp.body + u.hp.armL + u.hp.armR + u.hp.legs;
