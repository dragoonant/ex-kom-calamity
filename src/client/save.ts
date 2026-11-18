// Save/Continue, client side (docs/spec/10-rules.md section 15, SAV-3..SAV-6; KB rule 22; PLAN.md D13, Q5).
// The snapshot is the engine state (SAV-1) with one packing step: a city block has 25,200 tiles (2 MB as
// JSON), so the envelope keeps only the tiles that differ from the map file and the hash of the full state;
// loading rebuilds the tiles from the map, applies the diff and checks the hash. The log rides along for
// replay. No DOM here beyond the Storage interface, so tests drive it with a plain object.
import { BATTLES, MAPS } from '../data';
import { hashState, parseMap, query, type LogEntry, type Setup, type State, type Tile, type TileKind } from '../engine';

export const SAVE_KEY = 'ekc-save';
export const SAVE_VERSION = 1;

export type SaveReason = 'start' | 'pause' | 'order' | 'interval' | 'leave';

/** [tile index, kind, open (0|1), material, hp] for a tile that differs from the map file. */
export type TileDiff = [number, TileKind, 0 | 1, string, number];

export interface SaveEnvelope {
  game: 'ekc';
  version: typeof SAVE_VERSION;
  savedAt: string;
  reason: SaveReason;
  setup: Setup;
  /** The state with `tiles` emptied; `tileDiff` and the map file restore them. */
  snapshot: State;
  tileDiff: TileDiff[];
  /** hashState of the full state, checked after unpacking (SAV-6). */
  hash: string;
  /** Equals snapshot.log; kept at the top level so a bug report can replay from the seed by hand. */
  log: LogEntry[];
  /** A real-time battle always reopens paused (SAV-4). */
  paused: true;
  selected: string | null;
  level: number;
}

/** What the title screen says Continue reopens (SAV-4). Every number is from query.* or the state. */
export interface SaveSummary {
  battleName: string;
  seconds: number;
  agentsStanding: number;
  agentsTotal: number;
  hostilesDown: number;
  savedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; save: SaveEnvelope; state: State }
  | { kind: 'unreadable'; reason: string };

export type WriteResult = { ok: true; bytes: number } | { ok: false; reason: string };

const baseTiles = new Map<string, Tile[]>();
function mapTiles(mapId: string): Tile[] | null {
  const hit = baseTiles.get(mapId);
  if (hit) return hit;
  const def = MAPS[mapId];
  if (!def) return null;
  const tiles = parseMap(def);
  baseTiles.set(mapId, tiles);
  return tiles;
}

export function packTiles(state: State): TileDiff[] {
  const base = mapTiles(state.mapId);
  const out: TileDiff[] = [];
  if (!base || base.length !== state.tiles.length) {
    state.tiles.forEach((t, i) => out.push([i, t.kind, t.open ? 1 : 0, t.material, t.hp]));
    return out;
  }
  for (let i = 0; i < base.length; i++) {
    const a = base[i]!;
    const b = state.tiles[i]!;
    if (a.kind !== b.kind || a.open !== b.open || a.material !== b.material || a.hp !== b.hp) out.push([i, b.kind, b.open ? 1 : 0, b.material, b.hp]);
  }
  return out;
}

export function unpackState(env: SaveEnvelope): { ok: true; state: State } | { ok: false; reason: string } {
  const base = mapTiles(env.snapshot.mapId);
  if (!base) return { ok: false, reason: `the map "${env.snapshot.mapId}" is not in this build` };
  const tiles = base.slice();
  for (const d of env.tileDiff) {
    const [i, kind, open, material, hp] = d;
    const t = tiles[i];
    if (!t) return { ok: false, reason: 'the save names a tile the map does not have' };
    tiles[i] = { ...t, kind, open: open === 1, material, hp };
  }
  const state: State = { ...env.snapshot, tiles };
  if (hashState(state) !== env.hash) return { ok: false, reason: 'the map in this build differs from the one the raid was saved on' };
  return { ok: true, state };
}

export function makeEnvelope(
  setup: Setup,
  state: State,
  reason: SaveReason,
  ui: { selected: string | null; level: number },
  now: Date = new Date(),
): SaveEnvelope {
  return {
    game: 'ekc',
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    reason,
    setup,
    snapshot: { ...state, tiles: [] },
    tileDiff: packTiles(state),
    hash: hashState(state),
    log: state.log,
    paused: true,
    selected: ui.selected,
    level: ui.level,
  };
}

export function writeSave(storage: StorageLike | null, env: SaveEnvelope): WriteResult {
  if (!storage) return { ok: false, reason: 'this browser offers no storage, so the raid cannot be saved' };
  let text: string;
  try {
    text = JSON.stringify(env);
  } catch (e) {
    return { ok: false, reason: `the save could not be written as text (${String(e)})` };
  }
  try {
    storage.setItem(SAVE_KEY, text);
  } catch (e) {
    return { ok: false, reason: `the browser refused to store the save (${(e as Error)?.name ?? String(e)})` };
  }
  return { ok: true, bytes: text.length };
}

export function clearSave(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: a storage that refuses removal has nothing readable in it either.
  }
}

/** SAV-6: never silent. Anything that is not a well-formed envelope for a known battle is reported by reason. */
export function readSave(storage: StorageLike | null): LoadResult {
  if (!storage) return { kind: 'none' };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch (e) {
    return { kind: 'unreadable', reason: `the browser refused to read storage (${(e as Error)?.name ?? String(e)})` };
  }
  if (text === null || text === '') return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'unreadable', reason: 'the saved raid is not readable JSON' };
  }
  const why = validateEnvelope(parsed);
  if (why) return { kind: 'unreadable', reason: why };
  const save = parsed as SaveEnvelope;
  const un = unpackState(save);
  if (!un.ok) return { kind: 'unreadable', reason: un.reason };
  return { kind: 'ok', save, state: un.state };
}

/** Returns a reason when the value is not a usable envelope, else null. */
export function validateEnvelope(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'the saved raid is not an object';
  const e = x as Partial<SaveEnvelope>;
  if (e.game !== 'ekc') return 'the save belongs to another game';
  if (e.version !== SAVE_VERSION) return `the save is version ${String(e.version)}; this build reads version ${SAVE_VERSION}`;
  if (!e.setup || typeof e.setup.battleId !== 'string' || typeof e.setup.seed !== 'number') return 'the save names no battle';
  if (!BATTLES[e.setup.battleId]) return `the battle "${e.setup.battleId}" is not in this build`;
  const s = e.snapshot as Partial<State> | undefined;
  if (!s || s.version !== 1) return 'the snapshot is missing or of another engine version';
  if (!Array.isArray(s.units) || !Array.isArray(s.tiles) || !Array.isArray(s.log)) return 'the snapshot is incomplete';
  if (typeof s.width !== 'number' || typeof s.depth !== 'number' || typeof s.levels !== 'number') return 'the snapshot has no map size';
  if (!Array.isArray(e.tileDiff) || typeof e.hash !== 'string') return 'the save has no tile record';
  if (s.battleId !== e.setup.battleId) return 'the snapshot and the setup name different battles';
  if (typeof s.mapId !== 'string' || !MAPS[s.mapId]) return `the map "${String(s.mapId)}" is not in this build`;
  return null;
}

export function summarise(env: SaveEnvelope): SaveSummary {
  const s = env.snapshot;
  const o = query.outcome(s);
  const agentsTotal = s.units.filter((u) => u.side === 'agency').length;
  return {
    battleName: BATTLES[s.battleId]?.name ?? s.battleId,
    seconds: o.seconds,
    agentsStanding: o.living.agency,
    agentsTotal,
    hostilesDown: o.score.hostilesDown,
    savedAt: env.savedAt,
  };
}

/** The browser's localStorage, or null when it is unavailable or throws on touch (private windows, blocked data). */
export function browserStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    if (!g.localStorage) return null;
    g.localStorage.getItem(SAVE_KEY);
    return g.localStorage;
  } catch {
    return null;
  }
}
