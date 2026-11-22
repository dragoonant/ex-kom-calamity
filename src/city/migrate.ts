// KIT-10: a campaign saved before the armoury (version 4: the workshop's stock as counts) becomes today's state.
// Pure; the client checks the old save's own hash before it calls this, and hashes the result afresh (CSAV-2).
import { CITY_TUNING } from '../data/city';
import { issueKit } from './rules';
import type { CityState, Piece } from './types';

interface V4Shop {
  item: string | null;
  progress: number;
  stock: Record<string, number>;
  sabotaged: Record<string, number>;
  orders: { item: string; arriveTick: number; sabotaged: boolean }[];
}

export function migrateCityV4(old: unknown): CityState {
  const s = JSON.parse(JSON.stringify(old)) as CityState & { shop: V4Shop | CityState['shop'] };
  const shop = s.shop as V4Shop;
  // The stock's counts become pieces on the armoury shelf, the sabotaged ones first. Every one is marked ordered,
  // so the mark never tells a sabotaged piece from a sound one (CVIEW-1).
  const armoury: Piece[] = [];
  let next = 1;
  for (const [item, n] of Object.entries(shop.stock ?? {})) {
    const bad = shop.sabotaged?.[item] ?? 0;
    for (let i = 0; i < n; i++) armoury.push({ id: `pc${next++}`, item, source: 'ordered', sabotaged: i < bad });
  }
  s.shop = { item: shop.item, progress: shop.progress, armoury, nextPiece: next, orders: shop.orders ?? [] };
  // Every agent starts with the issue; the shelf holds the pieces.
  for (const a of s.agents) a.kit = issueKit();
  // The tuning keys the items took over leave the state; the kit section joins it.
  const t = s.tuning as unknown as Record<string, Record<string, number>>;
  const keep = CITY_TUNING.shop as unknown as Record<string, number>;
  t.shop = Object.fromEntries(Object.keys(keep).map((k) => [k, t.shop?.[k] ?? keep[k]!]));
  t.kit = { ...(CITY_TUNING.kit as unknown as Record<string, number>) };
  return s;
}
