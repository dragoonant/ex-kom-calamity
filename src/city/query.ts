// CQRY-1..6: every number a client shows.
import { CITY, ITEMS } from '../data/city';
import { TUNING, UNITS, WEAPONS } from '../data';
import { bandOf, battleItem, buildingDef, frameOf, grantOf, itemDef, kitWeight, kitWin, livingAgents, readyAgents, winChance, works } from './rules';
import { clockOf, ticksPerHour } from './time';
import type { Band, CityState, EquipSlot, KitRef } from './types';

/** CQRY-7: FIRE-5's hit chance for a weapon and shooter at a distance, standing still in the open. */
function plainHit(weapon: string, aim: number, dist: number): number {
  const w = WEAPONS[weapon];
  if (!w || dist > w.range) return 0;
  const raw = w.accuracy + aim - w.falloffPerTile * Math.floor(dist);
  return Math.max(TUNING.fire.minHitChance, Math.min(TUNING.fire.maxHitChance, raw));
}

function refRow(slot: EquipSlot | 'belt', ref: KitRef | null) {
  if (!ref) return { slot, item: null, name: 'empty', piece: null, source: null, free: true };
  const def = itemDef(ref.item);
  return { slot, item: ref.item, name: def?.name ?? ref.item, piece: ref.piece?.id ?? null, source: ref.piece?.source ?? null, free: !ref.piece };
}

export const cityQuery = {
  /** CQRY-1 */
  clock: (s: CityState) => clockOf(s.tuning, s.tick),
  /** CQRY-2: the grant if the month ended now (the agency's view gives the same number: CVIEW-1 hides only its inputs). */
  grant: (s: CityState) => grantOf(s),
  /** CQRY-3: the raid's odds once the squad is at the door. */
  raidOdds: (s: CityState) => {
    if (!s.raid || !s.raid.arrived) return { ok: false as const };
    return { ok: true as const, hostiles: s.raid.hostiles, agents: s.raid.agents.length, winChance: winChance(s, s.raid.agents, s.raid.hostiles) };
  },
  /** CQRY-4: what the agency knows of each building. */
  board: (s: CityState) =>
    CITY.buildings.map((def) => {
      const b = s.buildings.find((x) => x.id === def.id)!;
      const slips = s.slips.filter((sl) => sl.building === def.id || (sl.building === null && sl.org === def.org)).length;
      const districtSlips = s.slips.filter((sl) => sl.kind === 'missing' && sl.district === def.district).length;
      const watching = s.agents.filter((a) => (a.status === 'watching' || a.status === 'travelling') && a.building === def.id).map((a) => a.id);
      return { id: def.id, name: def.name, org: def.org, district: def.district, band: (b.watch?.band ?? null) as Band | null, bandTick: b.watch?.tick ?? null, slips, districtSlips, watching, raidedTick: b.raidedTick, turned: s.orgs.find((o) => o.id === def.org)?.turned ?? false };
    }),
  /** CQRY-5 */
  roster: (s: CityState) => ({ living: livingAgents(s).length, ready: readyAgents(s).length, cap: s.tuning.roster.cap, recruitCost: s.tuning.roster.recruitCost }),
  /** CQRY-6 */
  outcome: (s: CityState) => ({ over: s.over, score: s.score, money: s.money, confidence: s.confidence }),
  /** CQRY-7: an agent's kit as the armoury card shows it, with what it fields in battle (KIT-8) and its numbers. */
  kit: (s: CityState, agentId: string) => {
    const a = s.agents.find((x) => x.id === agentId);
    if (!a) return null;
    const k = a.kit;
    const template = UNITS[battleItem(k.suit, 'suit')]!;
    const long = battleItem(k.long, 'long');
    const side = battleItem(k.side, 'side');
    const frame = frameOf(k);
    const weight = kitWeight(k);
    const w = WEAPONS[long];
    return {
      agent: a.id,
      name: a.name,
      status: a.status,
      slots: [refRow('suit', k.suit), refRow('long', k.long), refRow('side', k.side)],
      belt: k.belt.map((b) => refRow('belt', b)),
      weight,
      carry: frame.carry,
      over: Math.max(0, weight - frame.carry),
      maxWeight: frame.carry + s.tuning.kit.overCarry,
      hp: template.hp,
      armour: template.armour,
      moveTicks: template.moveTicks,
      longName: w?.name ?? long,
      range: w?.range ?? 0,
      damage: w ? { min: w.damageMin, max: w.damageMax } : { min: 0, max: 0 },
      hitNear: plainHit(long, template.aim, 5),
      hitFar: plainHit(long, template.aim, 15),
      sideName: WEAPONS[side]?.name ?? side,
      resolveWin: kitWin(k),
      working: [k.suit, k.long, k.side].every((r) => works(r)),
    };
  },
  /** CQRY-8: the armoury shelf by item: pieces nobody carries, built and ordered, and the free kit of each slot. */
  armoury: (s: CityState) =>
    ITEMS.items
      .filter((i) => i.slot !== 'belt')
      .map((i) => {
        const pieces = s.shop.armoury.filter((p) => p.item === i.id);
        const carried = s.agents.filter((a) => a.status !== 'dead' && [a.kit.suit, a.kit.long, a.kit.side].some((r) => r.item === i.id && r.piece)).length;
        return { item: i.id, name: i.name, slot: i.slot, free: i.kind === 'free', weight: i.weight, built: pieces.filter((p) => p.source === 'built').length, ordered: pieces.filter((p) => p.source === 'ordered').length, carried, pieces: pieces.map((p) => ({ id: p.id, source: p.source })) };
      }),
  band: bandOf,
  building: buildingDef,
  ticksPerHour: (s: CityState) => ticksPerHour(s.tuning),
};
