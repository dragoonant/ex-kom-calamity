// Shared rule helpers (docs/spec/20-city.md). Pure, read-only over the state.
import { CITY, ITEMS, RESEARCH, type BuildingDef, type Evidence, type ItemDef, type OrgDef, type ProjectDef } from '../data/city';
import { ticksPerHour } from './time';
import type { Agent, Band, CityState, EquipSlot, ItemId, Kit, KitRef, Leg, Org, Piece } from './types';

export function buildingDef(id: string): BuildingDef | undefined {
  return CITY.buildings.find((b) => b.id === id);
}

export function orgDef(id: string): OrgDef | undefined {
  return CITY.orgs.find((o) => o.id === id);
}

export function orgOf(state: CityState, id: string): Org | undefined {
  return state.orgs.find((o) => o.id === id);
}

export function orgOfBuilding(state: CityState, buildingId: string): Org | undefined {
  const def = buildingDef(buildingId);
  return def ? orgOf(state, def.org) : undefined;
}

export function sourceOrg(state: CityState): Org | undefined {
  const def = CITY.orgs.find((o) => o.source);
  return def ? orgOf(state, def.id) : undefined;
}

/** WATCH-3: the band of an infiltration level. */
export function bandOf(infiltration: number): Band {
  if (infiltration <= 0) return 'clean';
  if (infiltration < 20) return 'low';
  if (infiltration < 50) return 'some';
  return 'heavy';
}

/** RAID-3: the hostiles a raid meets at this infiltration. */
export function hostilesFor(state: CityState, org: Org): number {
  const r = state.tuning.raid;
  if (org.infiltration <= 0) return 0;
  const base = Math.min(r.maxHostiles, 1 + Math.floor((org.infiltration * r.hostilesPer10Points) / 10));
  return base + (org.turned ? r.turnedGuards : 0);
}

/** RES-1, KIT-7: the auto-resolver's win chance in percent, with the working kit the squad carries. */
export function winChance(state: CityState, agents: string[], hostiles: number): number {
  const r = state.tuning.res;
  if (hostiles <= 0) return 100;
  let kit = 0;
  for (const id of agents) {
    const a = state.agents.find((x) => x.id === id);
    if (a) kit += kitWin(a.kit);
  }
  const p = r.winBasePercent + r.winPerAgent * agents.length - r.winPerHostile * hostiles + kit;
  return Math.max(r.winMinPercent, Math.min(r.winMaxPercent, p));
}

/** RES-1: each agent's chance to go down, in percent. */
export function downChance(state: CityState, hostiles: number, won: boolean): number {
  const r = state.tuning.res;
  if (hostiles <= 0) return 0;
  return Math.max(0, Math.min(r.downMaxPercent, r.downPerHostilePercent * hostiles + (won ? 0 : r.downOnLossPercent)));
}

export function livingAgents(state: CityState) {
  return state.agents.filter((a) => a.status !== 'dead');
}

export function readyAgents(state: CityState) {
  return state.agents.filter((a) => a.status === 'ready');
}

/** FUND-2: the grant at month end, before salaries. */
export function grantOf(state: CityState): number {
  const f = state.tuning.fund;
  let cut = 0;
  for (const o of state.orgs) {
    if (o.turned) cut += f.turnedCutPercent;
    else if (o.infiltration >= state.tuning.spread.lobbyAt) cut += f.lobbyCutPercent;
  }
  const gross = Math.floor((f.grantBase * state.confidence) / 50);
  return Math.floor((gross * Math.max(0, 100 - cut)) / 100);
}

export function totalInfiltration(state: CityState): number {
  return state.orgs.reduce((s, o) => s + o.infiltration, 0);
}

const EVIDENCE_WORDS: Record<Evidence, string> = { host: 'host body', taker: 'taker body', fighter: 'fighter body', core: 'amber core', liveHost: 'live host', liveTaker: 'live taker' };

/** LAB-2 */
export function projectDef(id: string): ProjectDef | undefined {
  return RESEARCH.projects.find((p) => p.id === id);
}

export function hasDone(state: CityState, project: string): boolean {
  return state.lab.done.includes(project);
}

/** LAB-2: why a project cannot start now, or null when it can. */
export function researchBlock(state: CityState, id: string): string | null {
  const p = projectDef(id);
  if (!p) return `no project ${id}`;
  if (state.lab.project) return 'the lab is busy';
  if (hasDone(state, id)) return 'already done';
  for (const r of p.requires ?? []) if (!hasDone(state, r)) return `needs ${projectDef(r)?.name ?? r} first`;
  for (const [k, n] of Object.entries(p.needs ?? {})) if (state.shelf[k as Evidence] < (n ?? 0)) return `needs ${n} ${EVIDENCE_WORDS[k as Evidence]} on the shelf`;
  for (const [k, n] of Object.entries(p.consumes ?? {})) if (state.shelf[k as Evidence] < (n ?? 0)) return `uses up ${n} ${EVIDENCE_WORDS[k as Evidence]}`;
  return null;
}

/** RAID-7 */
export function compositionFor(state: CityState, org: Org, hostiles: number): { takers: number; fighters: number } {
  const r = state.tuning.raid;
  const quarter = Math.floor(hostiles / 4);
  const takers = org.infiltration >= r.takersAt && hostiles >= 2 ? Math.max(1, quarter) : 0;
  const fighters = org.infiltration >= r.fightersAt ? quarter : 0;
  return { takers, fighters: Math.min(fighters, Math.max(0, hostiles - takers)) };
}

/** KIT-1 */
export function itemDef(id: ItemId): ItemDef | undefined {
  return ITEMS.items.find((i) => i.id === id);
}

/** SHOP-1: what one piece costs to build, and how long. Zero for an item that is never built. */
export function itemCost(item: ItemId): { cost: number; hours: number } {
  return itemDef(item)?.build ?? { cost: 0, hours: 0 };
}

/** SHOP-1: the items the workshop can make or buy: limited kit whose design is done. */
export function buildableItems(state: CityState): ItemDef[] {
  return ITEMS.items.filter((i) => i.kind === 'limited' && i.build && i.design && hasDone(state, i.design));
}

/** KIT-2: a recruit's issue, all free kit. The belt has its suit's slots, filled in order. */
export function issueKit(): Kit {
  const iss = ITEMS.issue;
  const belt: (KitRef | null)[] = [];
  const slots = itemDef(iss.suit)?.frame?.belt ?? 0;
  for (let i = 0; i < slots; i++) belt.push(iss.belt[i] ? { item: iss.belt[i]!, piece: null } : null);
  return { suit: { item: iss.suit, piece: null }, long: { item: iss.long, piece: null }, side: { item: iss.side, piece: null }, belt };
}

/** KIT-5: every piece a kit carries. */
export function kitPieces(kit: Kit): Piece[] {
  const out: Piece[] = [];
  for (const r of [kit.suit, kit.long, kit.side, ...kit.belt]) if (r?.piece) out.push(r.piece);
  return out;
}

/** KIT-3: a kit's suit frame. */
export function frameOf(kit: Kit): { belt: number; carry: number } {
  return itemDef(kit.suit.item)?.frame ?? { belt: 0, carry: 0 };
}

/** KIT-4: a kit's weight: the long arm, the sidearm and every belt item. */
export function kitWeight(kit: Kit): number {
  let w = 0;
  for (const r of [kit.long, kit.side, ...kit.belt]) if (r) w += itemDef(r.item)?.weight ?? 0;
  return w;
}

/** KIT-6: a slot works unless its piece is sabotaged. */
export function works(ref: KitRef | null): boolean {
  return !!ref && !(ref.piece && ref.piece.sabotaged);
}

/** KIT-7: the win points a kit adds to the auto-resolver. */
export function kitWin(kit: Kit): number {
  let w = 0;
  for (const r of [kit.suit, kit.long, kit.side]) if (r.piece && works(r)) w += itemDef(r.item)?.resolve?.win ?? 0;
  return w;
}

/** KIT-7: the percent cut off an agent's down chance by a working suit. */
export function kitDownCut(kit: Kit): number {
  return kit.suit.piece && works(kit.suit) ? (itemDef(kit.suit.item)?.resolve?.downCutPercent ?? 0) : 0;
}

/** KIT-8: what a slot fields in battle: a sabotaged piece fields the issued item of its slot instead. */
export function battleItem(ref: KitRef, slot: EquipSlot): string {
  const id = works(ref) ? ref.item : ITEMS.issue[slot];
  return itemDef(id)?.battle ?? id;
}

/** KIT-3: a kit with a new suit keeps its belt in order, cut or padded to the new frame. */
export function withSuit(kit: Kit, suit: KitRef): Kit {
  const slots = itemDef(suit.item)?.frame?.belt ?? 0;
  const belt = kit.belt.slice(0, slots);
  while (belt.length < slots) belt.push(null);
  return { ...kit, suit, belt };
}

/** KIT-4: why an agent cannot be fitted with this, or null when it can. */
export function equipBlock(state: CityState, agentId: string, slot: EquipSlot, item: ItemId, pieceId?: string): string | null {
  const a = state.agents.find((x) => x.id === agentId);
  if (!a) return `no agent ${agentId}`;
  if (a.status !== 'ready') return 'kit changes only at headquarters, for an agent who is ready';
  const def = itemDef(item);
  if (!def) return `no item ${item}`;
  if (def.slot !== slot) return `${def.name} does not go in the ${slot} slot`;
  if (def.kind === 'usedUp') return `${def.name} goes on the belt`;
  if (def.kind === 'free') {
    if (pieceId !== undefined) return 'free kit has no pieces';
    if (a.kit[slot].item === item && !a.kit[slot].piece) return 'already carried';
  } else {
    const p = pieceId !== undefined ? state.shop.armoury.find((x) => x.id === pieceId) : state.shop.armoury.find((x) => x.item === item);
    if (!p) return pieceId !== undefined ? `piece ${pieceId} is not on the armoury shelf` : `no ${def.name} on the armoury shelf`;
    if (p.item !== item) return `piece ${pieceId} is not a ${def.name}`;
  }
  const ref: KitRef = { item, piece: null };
  const next = slot === 'suit' ? withSuit(a.kit, ref) : { ...a.kit, [slot]: ref };
  if (kitWeight(next) > frameOf(next).carry + state.tuning.kit.overCarry) return 'too heavy for the suit';
  return null;
}

/** KIT-7, KIT-9: best fit for these agents, in order: each slot gets the strongest working piece on the shelf whose
 * win points beat what the agent carries (built before ordered). Returns the equip orders, checked one by one. */
export function bestFitOrders(state: CityState, agentIds: string[], step: (s: CityState, a: { type: 'equip'; side: 'agency'; agent: string; slot: EquipSlot; item: ItemId; piece?: string }) => CityState | null): { type: 'equip'; side: 'agency'; agent: string; slot: EquipSlot; item: ItemId; piece: string }[] {
  const out: { type: 'equip'; side: 'agency'; agent: string; slot: EquipSlot; item: ItemId; piece: string }[] = [];
  let s = state;
  const value = (item: ItemId) => itemDef(item)?.resolve?.win ?? 0;
  for (const slot of ['suit', 'long', 'side'] as const) {
    for (const id of agentIds) {
      const a = s.agents.find((x) => x.id === id);
      if (!a || a.status !== 'ready') continue;
      const have = a.kit[slot].piece && works(a.kit[slot]) ? value(a.kit[slot].item) : 0;
      const best = s.shop.armoury
        .filter((p) => itemDef(p.item)?.slot === slot && value(p.item) > have)
        .sort((x, y) => value(y.item) - value(x.item) || (x.source === y.source ? 0 : x.source === 'built' ? -1 : 1))[0];
      if (!best) continue;
      const action = { type: 'equip' as const, side: 'agency' as const, agent: id, slot, item: best.item, piece: best.id };
      const next = step(s, action);
      if (!next) continue;
      out.push(action);
      s = next;
    }
  }
  return out;
}

/** KIT-1: an agent's kit names only items of the right slots. */
export function agentKitItems(a: Agent): ItemId[] {
  return [a.kit.suit.item, a.kit.long.item, a.kit.side.item, ...a.kit.belt.filter((b): b is KitRef => !!b).map((b) => b.item)];
}

/** SHOP-2: the supplier organisation (kind "arms"). */
export function supplierOrg(state: CityState): Org | undefined {
  const def = CITY.orgs.find((o) => o.kind === 'arms');
  return def ? orgOf(state, def.id) : undefined;
}

/** TRAVEL-1: headquarters, and a building's cell centre, in tenths of a cell. */
export function hqPoint(): { x: number; y: number } {
  return { x: CITY.agency.hq.x * 10 + 5, y: CITY.agency.hq.y * 10 + 5 };
}

export function placePoint(state: CityState, id: string): { x: number; y: number } | null {
  const b = buildingDef(id);
  if (b) return { x: b.x * 10 + 5, y: b.y * 10 + 5 };
  const c = state.crashes.find((x) => x.id === id);
  return c ? { x: c.x, y: c.y } : null;
}

/** TRAVEL-1: the ticks a drive of this many tenths takes, at least 1. */
export function travelTicks(state: CityState, fx: number, fy: number, tx: number, ty: number): number {
  const d = Math.round(Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2));
  const tph = ticksPerHour(state.tuning);
  return Math.max(1, Math.ceil((d * tph) / state.tuning.travel.speedTenthsPerHour));
}

/** TRAVEL-1: a leg from one point to another leaving now. */
export function legFrom(state: CityState, from: { x: number; y: number }, to: { x: number; y: number }): Leg {
  return { fx: from.x, fy: from.y, tx: to.x, ty: to.y, depart: state.tick, arrive: state.tick + travelTicks(state, from.x, from.y, to.x, to.y) };
}

/** TRAVEL-3: where a drive is at a tick, in integer tenths. */
export function legAt(leg: Leg, tick: number): { x: number; y: number } {
  const span = Math.max(1, leg.arrive - leg.depart);
  const t = Math.min(span, Math.max(0, tick - leg.depart));
  return { x: leg.fx + Math.trunc(((leg.tx - leg.fx) * t) / span), y: leg.fy + Math.trunc(((leg.ty - leg.fy) * t) / span) };
}
