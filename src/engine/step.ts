import { body, MISSIONS, pack, RULES, weapon, type MissionDef } from './data';
import { dist, inBounds, tileAt, unitAt, type Pos } from './grid';
import { next, seedRng, hashText } from './rng';
import {
  canTarget, counterSlot, guard, hitChance, living, maxHp, moveRange, unitById, weaponIn, weapons,
} from './query';
import type {
  Action, BattleState, Build, GameEvent, PaintSlot, PartSlot, Paint, Result, ShotEvent, Side, StepResult, Tile, Unit, WeaponSlot,
} from './types';

export interface Deploy { id: string; pilot: string; side: Side; x: number; y: number; role?: string; build: Build; hp?: Partial<Record<PartSlot, number>>; paint?: Partial<Record<PaintSlot, Paint>> }

export function parseMap(m: MissionDef): Tile[] {
  const tiles: Tile[] = [];
  for (const row of m.map) for (const ch of row) {
    const l = m.legend[ch] ?? m.legend['.']!;
    const obj = l[2] ?? null;
    tiles.push({ t: l[0], h: l[1], obj, objHp: obj ? RULES.objects[obj].hp : 0 });
  }
  return tiles;
}

function makeUnit(d: Deploy): Unit {
  const base: Paint = d.side === 'player' ? 'slate' : 'camo';
  const u: Unit = {
    id: d.id, pilot: d.pilot, side: d.side, role: d.role ?? 'line', x: d.x, y: d.y, build: { ...d.build },
    paint: { body: base, armL: base, armR: base, legs: base, pack: base, ...(d.paint ?? {}) },
    hp: { body: 0, armL: 0, armR: 0, legs: 0 }, ammo: null, charges: 0, moved: false, acted: false, from: null, alive: true,
  };
  for (const p of ['body', 'armL', 'armR', 'legs'] as const) u.hp[p] = Math.min(maxHp(u, p), d.hp?.[p] ?? maxHp(u, p));
  const pk = pack(u.build.pack);
  if (pk.kind === 'weapon') u.ammo = weapon(pk.weapon ?? null)?.ammo ?? null;
  if (pk.kind === 'repair') u.charges = pk.charges ?? 0;
  if (u.hp.body <= 0) u.alive = false;
  return u;
}

/** A battle from a mission; `deploy` replaces the mission's player walkers (from the campaign roster). */
export function newBattle(missionId: string, seed: number, deploy?: Deploy[]): BattleState {
  const m = MISSIONS[missionId]!;
  const tiles = parseMap(m);
  const players: Deploy[] = deploy ?? m.units.filter((u) => u.side === 'player');
  const hostiles: Deploy[] = m.units.filter((u) => u.side === 'hostile');
  const s: BattleState = {
    v: 1, mission: m.id, seed, w: m.map[0]!.length, h: m.map.length, tiles,
    units: [...players, ...hostiles].map(makeUnit).filter((u) => u.alive),
    round: 1, phase: 'player', rng: seedRng(seed), salvage: [], result: null, turnCount: 0,
  };
  return s;
}

export const hash = (s: BattleState): string => hashText(JSON.stringify(s));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const reject = (state: BattleState, reason: string): StepResult => ({ state, events: [{ type: 'rejected', reason }] });

function drawPart(s: BattleState, cls: 'direct' | 'melee' | 'indirect'): PartSlot {
  const w = RULES.hitWeights[cls];
  const total = w.body + w.armL + w.armR + w.legs;
  let r = next(s.rng) * total;
  for (const p of ['body', 'armL', 'armR', 'legs'] as const) { r -= w[p]; if (r < 0) return p; }
  return 'body';
}

function applyDamage(t: Unit, part: PartSlot, raw: number): { part: PartSlot; dmg: number; partLost: boolean } {
  let p = part;
  if (p !== 'body' && t.hp[p] <= 0) p = 'body'; // WLK-4
  const dmg = Math.max(1, Math.round(raw * (1 - guard(t, p)))); // WLK-5
  const before = t.hp[p];
  t.hp[p] = Math.max(0, before - dmg);
  return { part: p, dmg, partLost: before > 0 && t.hp[p] === 0 && p !== 'body' };
}

function destroy(s: BattleState, t: Unit, by: string, ev: GameEvent[]): void {
  t.alive = false;
  t.moved = t.acted = true;
  ev.push({ type: 'destroyed', unit: t.id, by });
  if (t.side !== 'hostile') return;
  // SAL-1: what still had HP when it fell.
  const paint = t.paint;
  if (t.hp.armL > 0) { s.salvage.push({ kind: 'arm', id: t.build.armL, hp: t.hp.armL, paint: paint.armL, from: t.id }); if (t.build.wL) s.salvage.push({ kind: 'weapon', id: t.build.wL, hp: 0, paint: paint.armL, from: t.id }); }
  if (t.hp.armR > 0) { s.salvage.push({ kind: 'arm', id: t.build.armR, hp: t.hp.armR, paint: paint.armR, from: t.id }); if (t.build.wR) s.salvage.push({ kind: 'weapon', id: t.build.wR, hp: 0, paint: paint.armR, from: t.id }); }
  if (t.hp.legs > 0) s.salvage.push({ kind: 'legs', id: t.build.legs, hp: t.hp.legs, paint: paint.legs, from: t.id });
  if (pack(t.build.pack).kind !== 'none') s.salvage.push({ kind: 'pack', id: t.build.pack, hp: 0, paint: paint.pack, from: t.id });
}

function resolveAttack(s: BattleState, a: Unit, slot: WeaponSlot, t: Unit, isCounter: boolean, ev: GameEvent[]): void {
  const w = weaponIn(a, slot)!;
  const cls = w.def.class === 'melee' ? 'melee' : w.def.class === 'indirect' ? 'indirect' : 'direct';
  const chance = hitChance(s, a, slot, t, a, isCounter);
  const shots: ShotEvent[] = [];
  const splashes: GameEvent[] = [];
  for (let i = 0; i < w.def.shots; i++) {
    if (!t.alive) break;
    const hit = next(s.rng) * 100 < chance;
    if (!hit) { shots.push({ hit: false, part: null, dmg: 0, partLost: false }); continue; }
    const part = drawPart(s, cls);
    const raw = w.def.dmg * (RULES.dmgSpread[0] + next(s.rng) * (RULES.dmgSpread[1] - RULES.dmgSpread[0]));
    const r = applyDamage(t, part, raw);
    shots.push({ hit: true, part: r.part, dmg: r.dmg, partLost: r.partLost });
    if (cls === 'indirect' && w.def.splash) {
      for (const o of s.units) {
        if (!o.alive || o.id === t.id || dist(o, t) !== 1) continue;
        const sr = applyDamage(o, 'body', w.def.splash);
        splashes.push({ type: 'splash', unit: a.id, target: o.id, dmg: sr.dmg, partLost: false });
      }
    }
    if (t.hp.body <= 0) break;
  }
  if (slot === 'P' && a.ammo !== null) a.ammo -= 1; // ATK-6
  ev.push({ type: 'attack', unit: a.id, slot, weapon: w.id, target: t.id, counter: isCounter, chance, shots });
  ev.push(...splashes);
  if (t.hp.body <= 0 && t.alive) destroy(s, t, a.id, ev);
  for (const o of s.units) if (o.alive && o.hp.body <= 0) destroy(s, o, a.id, ev);
  // ATK-8 counter-fire.
  if (!isCounter && cls !== 'indirect' && t.alive && a.alive) {
    const cs = counterSlot(s, t, a);
    if (cs && (weaponIn(t, cs)!.def.class !== 'melee' || dist(t, a) === 1)) resolveAttack(s, t, cs, a, true, ev);
  }
}

function checkEnd(s: BattleState, ev: GameEvent[], timeout = false): void {
  if (s.result) return;
  const m = MISSIONS[s.mission]!;
  const hostile = living(s, 'hostile').length, player = living(s, 'player').length;
  let winner: Side | null = null, reason: Result['reason'] = 'annihilated';
  if (hostile === 0) { winner = 'player'; reason = 'annihilated'; }
  else if (player === 0) { winner = 'hostile'; reason = 'wiped'; }
  else if (timeout) { winner = 'hostile'; reason = 'timeout'; }
  if (!winner) return;
  const lost = { player: s.units.filter((u) => u.side === 'player' && !u.alive).length, hostile: s.units.filter((u) => u.side === 'hostile' && !u.alive).length };
  const win = winner === 'player';
  s.result = {
    winner, reason, rounds: s.round, lost,
    salvage: win ? s.salvage : [],
    credits: { fee: win ? m.fee : 0, bonus: win && s.round <= m.bonusRound ? m.bonus : 0, bounty: win ? lost.hostile * m.bounty : 0 },
  };
  ev.push({ type: 'end', result: s.result });
}

function refresh(s: BattleState, side: Side): void {
  for (const u of s.units) if (u.side === side) { u.moved = false; u.acted = false; u.from = null; }
}

/** ARCH-1: pure, never throws. */
export function step(state: BattleState, action: Action): StepResult {
  try {
    return stepInner(state, action);
  } catch (e) {
    return reject(state, `internal: ${(e as Error).message}`);
  }
}

function own(s: BattleState, id: string): Unit | null {
  const u = unitById(s, id);
  return u && u.alive && u.side === s.phase ? u : null;
}

function stepInner(state: BattleState, action: Action): StepResult {
  if (state.result) return reject(state, 'battle is over');
  const s = clone(state);
  const ev: GameEvent[] = [];
  switch (action.type) {
    case 'move': {
      const u = own(s, action.unit);
      if (!u || u.moved || u.acted) return reject(state, 'cannot move');
      const r = moveRange(s, u).find((t) => t.x === action.x && t.y === action.y);
      if (!r) return reject(state, 'tile not reachable');
      u.from = { x: u.x, y: u.y };
      u.x = r.x; u.y = r.y; u.moved = true;
      ev.push({ type: 'moved', unit: u.id, path: r.path });
      break;
    }
    case 'undoMove': {
      const u = own(s, action.unit);
      if (!u || !u.moved || u.acted || !u.from) return reject(state, 'nothing to undo');
      if (unitAt(s, u.from.x, u.from.y)) return reject(state, 'start tile taken');
      u.x = u.from.x; u.y = u.from.y; u.from = null; u.moved = false;
      ev.push({ type: 'undo', unit: u.id, x: u.x, y: u.y });
      break;
    }
    case 'attack': {
      const u = own(s, action.unit);
      const t = unitById(s, action.target);
      if (!u || u.acted || !t || !canTarget(s, u, action.slot, t)) return reject(state, 'cannot attack');
      u.moved = u.acted = true;
      resolveAttack(s, u, action.slot, t, false, ev);
      break;
    }
    case 'attackObject': {
      const u = own(s, action.unit);
      const w = u ? weaponIn(u, action.slot) : null;
      const tile = tileAt(s, action.x, action.y);
      if (!u || u.acted || !w || !w.usable || w.def.class === 'indirect' || !tile?.obj || !RULES.objects[tile.obj].breakable) return reject(state, 'cannot attack object');
      const d = dist(u, action);
      if (d < w.def.min || d > w.def.max) return reject(state, 'out of range');
      u.moved = u.acted = true;
      const dmg = Math.round(w.def.dmg * w.def.shots); // ATK-9: every shot hits
      tile.objHp = Math.max(0, tile.objHp - dmg);
      const broken = tile.objHp === 0;
      if (broken) { tile.obj = null; tile.t = 'rubble'; }
      if (action.slot === 'P' && u.ammo !== null) u.ammo -= 1;
      ev.push({ type: 'objectHit', unit: u.id, slot: action.slot, weapon: w.id, x: action.x, y: action.y, dmg, broken });
      break;
    }
    case 'repair': {
      const u = own(s, action.unit);
      const t = unitById(s, action.target);
      const pk = u ? pack(u.build.pack) : null;
      if (!u || u.acted || !t || !t.alive || t.side !== u.side || !pk || pk.kind !== 'repair' || u.charges <= 0) return reject(state, 'cannot repair');
      if (dist(u, t) > 1) return reject(state, 'not adjacent');
      const max = maxHp(t, action.part);
      if (t.hp[action.part] <= 0 || t.hp[action.part] >= max) return reject(state, 'part not repairable'); // SUP-1
      const amount = Math.min(pk.heal ?? 0, max - t.hp[action.part]);
      t.hp[action.part] += amount;
      u.charges -= 1; u.moved = u.acted = true;
      ev.push({ type: 'repaired', unit: u.id, target: t.id, part: action.part, amount });
      break;
    }
    case 'wait': {
      const u = own(s, action.unit);
      if (!u || u.acted) return reject(state, 'cannot wait');
      u.moved = u.acted = true;
      ev.push({ type: 'wait', unit: u.id });
      break;
    }
    case 'endPhase': {
      const m = MISSIONS[s.mission]!;
      if (s.phase === 'player') { s.phase = 'hostile'; refresh(s, 'hostile'); }
      else {
        if (s.round >= m.roundLimit) { checkEnd(s, ev, true); s.turnCount += 1; return { state: s, events: ev }; }
        s.round += 1; s.phase = 'player'; refresh(s, 'player');
      }
      ev.push({ type: 'phase', side: s.phase, round: s.round });
      break;
    }
    default:
      return reject(state, 'unknown action');
  }
  s.turnCount += 1;
  checkEnd(s, ev);
  return { state: s, events: ev };
}

/** ARCH-2: never empty while the battle runs. */
export function legalActions(s: BattleState): Action[] {
  if (s.result) return [];
  const out: Action[] = [];
  for (const u of living(s, s.phase)) {
    if (u.acted) continue;
    if (!u.moved) for (const r of moveRange(s, u)) if (r.x !== u.x || r.y !== u.y) out.push({ type: 'move', unit: u.id, x: r.x, y: r.y });
    if (u.moved && u.from && !unitAt(s, u.from.x, u.from.y)) out.push({ type: 'undoMove', unit: u.id });
    for (const w of weapons(u)) {
      if (!w.usable) continue;
      for (const t of s.units) if (canTarget(s, u, w.slot, t)) out.push({ type: 'attack', unit: u.id, slot: w.slot, target: t.id });
      if (w.def.class === 'direct' || w.def.class === 'melee') {
        for (let y = Math.max(0, u.y - w.def.max); y <= Math.min(s.h - 1, u.y + w.def.max); y++)
          for (let x = Math.max(0, u.x - w.def.max); x <= Math.min(s.w - 1, u.x + w.def.max); x++) {
            const d = dist(u, { x, y });
            const t = tileAt(s, x, y);
            if (d >= w.def.min && d <= w.def.max && t?.obj && RULES.objects[t.obj].breakable) out.push({ type: 'attackObject', unit: u.id, slot: w.slot, x, y });
          }
      }
    }
    if (pack(u.build.pack).kind === 'repair' && u.charges > 0) {
      for (const t of living(s, u.side)) if (dist(u, t) <= 1) for (const p of ['body', 'armL', 'armR', 'legs'] as const)
        if (t.hp[p] > 0 && t.hp[p] < maxHp(t, p)) out.push({ type: 'repair', unit: u.id, target: t.id, part: p });
    }
    out.push({ type: 'wait', unit: u.id });
  }
  out.push({ type: 'endPhase' });
  return out;
}

/** ARCH-4: what a side may see. No fog in mission 1 (PLAN Q3); the generator is hidden so no seat can read future rolls. */
export function view(s: BattleState, _side: Side): BattleState {
  return { ...s, rng: [0, 0, 0, 0] };
}

export const isInside = (s: BattleState, p: Pos): boolean => inBounds(s, p.x, p.y);
export const bodyName = (id: string): string => body(id).name;
