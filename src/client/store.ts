// The one store that calls the engine (KB recipe.md step 6). Everything drawn comes from view(state, 'agency')
// and query.*; the client never does rules maths (ARCH-4). Time moves only through tick actions issued by
// advance(); pause is the absence of them (TIME-2, TIME-6).
import { create } from 'zustand';
import { BATTLES, WEAPONS } from '../data';
import { createGame, hashState, query, sideSeesTile, step, view, type Action, type GameEvent, type Pos, type Setup, type State, type Unit } from '../engine';
import { advanceWithAi, isDifficulty, makeAi, type AiDriver, type Difficulty } from '../ai';
import { bounds, focusOn } from './board/world';
import { browserStorage, clearSave, makeEnvelope, readSave, summarise, writeSave, type LoadResult, type SaveEnvelope, type SaveReason, type SaveSummary } from './save';

export type Screen = 'title' | 'battle' | 'report';
/** AI-2: the hostile AI level the page runs; `none` leaves the hostiles to their stances (flow tests, KB gotchas). */
export type AiLevel = Difficulty | 'none';
export type Speed = 1 | 2 | 4;
export type Tone = 'note' | 'ok' | 'caution' | 'alert';

export interface Slip {
  id: number;
  tick: number;
  seconds: number;
  text: string;
  tone: Tone;
}

export interface SaveStatus {
  ok: boolean;
  reason: string | null;
  tick: number | null;
  savedAt: string | null;
}

export interface TapResult {
  tile: Pos;
  did: 'fire' | 'move' | 'blast' | 'select' | 'clear' | 'rejected';
  detail: string;
}

export interface ClientState {
  screen: Screen;
  setup: Setup | null;
  game: State | null;
  /** view(game, 'agency'): the only state the board and HUD read. */
  agency: State | null;
  paused: boolean;
  speed: Speed;
  selected: string | null;
  level: number;
  hover: Pos | null;
  /** 'blast': the next tap on a tile throws the selected agent's charge there (ORD-9). */
  mode: 'normal' | 'blast';
  slips: Slip[];
  saveStatus: SaveStatus;
  continueSummary: SaveSummary | null;
  loadError: string | null;
  lastTap: TapResult | null;
  modelsReady: boolean;
  modelsLoaded: number;
  modelsTotal: number;
  /** The report screen keeps the final state after the save is cleared (SAV-5). */
  report: State | null;
  /** The hostile AI level (AI-2), from `?ai=` on the page; `normal` by default. */
  ai: AiLevel;

  refreshTitle(): void;
  newBattle(seed?: number): void;
  continueBattle(): boolean;
  discardSave(): void;
  leaveBattle(): void;
  closeReport(): void;
  setModels(loaded: number, total: number): void;

  order(action: Exclude<Action, { type: 'tick' }>): { ok: true } | { ok: false; reason: string };
  advance(seconds: number): GameEvent[];
  setPaused(paused: boolean): void;
  togglePause(): void;
  setSpeed(speed: Speed): void;
  select(id: string | null): void;
  setLevel(level: number): void;
  setHover(p: Pos | null): void;
  setMode(mode: 'normal' | 'blast'): void;
  focusUnit(id: string): void;
  tapTile(p: Pos): TapResult;
  saveNow(reason: SaveReason): void;
  hash(): string | null;
}

const MAX_SLIPS = 40;
let slipSeq = 0;

export function unitLabel(u: Unit): string {
  if (u.side === 'agency') return u.name;
  if (u.template === 'host') return 'Host';
  if (u.template === 'taker') return 'Taker';
  if (u.template === 'fighter') return 'Fighter';
  return u.name;
}

/** `?ai=none|random|normal` on the page (AI-2); anything else, or no page, is `normal`. */
export function aiLevelFromSearch(search: string | undefined): AiLevel {
  const v = search ? new URLSearchParams(search).get('ai') : null;
  if (v === 'none') return 'none';
  return isDifficulty(v) ? v : 'normal';
}

function fmtPos(p: Pos): string {
  return `${p.x},${p.y} L${p.level}`;
}

/** Turns engine events into message slips, hiding what the agency cannot see (VIEW-2). */
export function slipsFor(events: GameEvent[], before: State, after: State): Slip[] {
  const out: Slip[] = [];
  const seen = new Set(view(after, 'agency').units.map((u) => u.id));
  const seenBefore = new Set(view(before, 'agency').units.map((u) => u.id));
  const unitIn = (s: State, id: string) => s.units.find((u) => u.id === id);
  const label = (id: string, s: State = after) => {
    const u = unitIn(view(s, 'agency'), id) ?? unitIn(s, id);
    return u ? unitLabel(u) : id;
  };
  const tps = after.tuning.time.ticksPerSecond;
  const push = (tick: number, text: string, tone: Tone) => out.push({ id: ++slipSeq, tick, seconds: tick / tps, text, tone });
  for (const e of events) {
    switch (e.type) {
      case 'ordered': {
        const a = e.action;
        if (a.side !== 'agency') break; // AI-9: the tray never prints a hostile order
        if (a.type === 'withdraw') push(e.tick, 'Squad withdrawn.', 'caution');
        else if (a.type === 'move') push(e.tick, `${label(a.unit)}: move to ${fmtPos(a.to)}.`, 'note');
        else if (a.type === 'fire') push(e.tick, `${label(a.unit)}: fire at ${label(a.target)}.`, 'note');
        else if (a.type === 'stance') push(e.tick, `${label(a.unit)}: stance ${a.stance}.`, 'note');
        else if (a.type === 'halt') push(e.tick, `${label(a.unit)}: halt.`, 'note');
        else if (a.type === 'blast') push(e.tick, `${label(a.unit)}: arming a charge for ${fmtPos(a.at)}.`, 'caution');
        break;
      }
      case 'arrived':
        if (unitIn(after, e.unit)?.side === 'agency') push(e.tick, `${label(e.unit)} in position.`, 'ok');
        break;
      case 'moveBlocked':
        if (unitIn(after, e.unit)?.side === 'agency') push(e.tick, `${label(e.unit)}: path blocked, order dropped.`, 'caution');
        break;
      case 'doorOpened':
        // AI-9: a door opened out of the squad's sight would give away a hostile's movements.
        if (sideSeesTile(after, 'agency', e.at)) push(e.tick, `Door opened at ${fmtPos(e.at)}.`, 'note');
        break;
      case 'shot': {
        const shooter = unitIn(after, e.shooter);
        const target = unitIn(after, e.target);
        const involvesAgency = shooter?.side === 'agency' || target?.side === 'agency';
        if (!involvesAgency && !seen.has(e.shooter) && !seen.has(e.target)) break;
        const w = WEAPONS[e.weapon]?.name ?? e.weapon;
        push(
          e.tick,
          `${label(e.shooter)} fires ${w} at ${label(e.target)}: ${e.breakdown.chance}% to hit, rolled ${e.roll}, ${e.hit ? 'HIT' : 'miss'}.`,
          shooter?.side === 'agency' ? (e.hit ? 'ok' : 'note') : 'alert',
        );
        break;
      }
      case 'damaged': {
        const u = unitIn(after, e.unit);
        if (!u) break;
        if (u.side !== 'agency' && !seen.has(e.unit)) break;
        push(e.tick, `${label(e.unit)} takes ${e.dealt} (${e.raw} less armour ${e.armour}); ${e.hp} hp left.`, u.side === 'agency' ? 'alert' : 'note');
        break;
      }
      case 'down': {
        const u = unitIn(after, e.unit);
        if (!u) break;
        if (u.side !== 'agency' && !seen.has(e.unit) && !seenBefore.has(e.unit)) break;
        const who = label(e.unit);
        push(e.tick, u.side === 'agency' ? `${who} is DOWN.` : u.side === 'hostile' ? `${who} is down.` : `A citizen is down.`, u.side === 'agency' ? 'alert' : u.side === 'hostile' ? 'ok' : 'caution');
        break;
      }
      case 'blast':
        push(e.tick, `${label(e.unit)}'s charge goes off at ${fmtPos(e.at)}.`, 'caution');
        break;
      case 'tileDestroyed':
        push(e.tick, e.now === 'void' ? `The floor at ${fmtPos(e.at)} collapses.` : `The ${e.was} at ${fmtPos(e.at)} is destroyed.`, 'caution');
        break;
      case 'fell': {
        const u = unitIn(after, e.unit);
        if (u && u.side !== 'agency' && !seen.has(e.unit) && !seenBefore.has(e.unit)) break;
        push(e.tick, `${label(e.unit)} falls to level ${e.to.level}: ${e.dealt} damage, ${e.hp} hp left.`, u?.side === 'agency' ? 'alert' : 'note');
        break;
      }
      case 'revealed': {
        const u = unitIn(after, e.unit);
        push(e.tick, `The citizen at ${u ? fmtPos(u) : '?'} is a HOST (${e.by === 'fire' ? 'opened fire' : 'seen up close'}).`, 'alert');
        break;
      }
      case 'taken': {
        // TAKE-2: the squad learns of a taking only when it watched it happen.
        if (!e.seen) break;
        const u = unitIn(after, e.unit);
        push(e.tick, `The citizen at ${u ? fmtPos(u) : '?'} has been TAKEN by a ${label(e.by)}.`, 'alert');
        break;
      }
      case 'over': {
        const text =
          e.winner === 'agency'
            ? 'Building cleared. Raid over.'
            : e.winner === 'hostile'
              ? 'Squad lost. Raid over.'
              : e.reason === 'withdrawn'
                ? 'Squad withdrawn. Raid over.'
                : e.reason === 'timeout'
                  ? 'Time limit reached. Raid over.'
                  : 'Both sides lost. Raid over.';
        push(e.tick, text, e.winner === 'agency' ? 'ok' : 'alert');
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function appendSlips(old: Slip[], add: Slip[]): Slip[] {
  if (add.length === 0) return old;
  const all = [...old, ...add];
  return all.length > MAX_SLIPS ? all.slice(all.length - MAX_SLIPS) : all;
}

export const useClient = create<ClientState>((set, get) => {
  const storage = browserStorage();
  let lastSaveTick = 0;
  const aiLevel = aiLevelFromSearch((globalThis as { location?: { search?: string } }).location?.search);
  const hostileAi: AiDriver | null = aiLevel === 'none' ? null : makeAi('hostile', aiLevel);

  const persist = (reason: SaveReason): void => {
    const { setup, game, selected, level } = get();
    if (!setup || !game || game.over) return;
    const env = makeEnvelope(setup, game, reason, { selected, level });
    const w = writeSave(storage, env);
    lastSaveTick = game.tick;
    set({ saveStatus: w.ok ? { ok: true, reason: null, tick: game.tick, savedAt: env.savedAt } : { ok: false, reason: w.reason, tick: game.tick, savedAt: null } });
  };

  const commit = (next: State, events: GameEvent[], prev: State): void => {
    const slips = slipsFor(events, prev, next);
    const patch: Partial<ClientState> = { game: next, agency: view(next, 'agency') };
    // The cut-away follows the selected agent up and down the stairs (and through a collapsed floor).
    const selId = get().selected;
    if (selId) {
      const was = prev.units.find((u) => u.id === selId);
      const now = next.units.find((u) => u.id === selId);
      if (was && now && was.level !== now.level && get().level === was.level) patch.level = now.level;
      if (now?.down) patch.mode = 'normal';
    }
    if (slips.length) patch.slips = appendSlips(get().slips, slips);
    if (next.over && !prev.over) {
      // SAV-5: a finished battle clears its save.
      clearSave(storage);
      patch.paused = true;
      patch.screen = 'report';
      patch.report = next;
      patch.saveStatus = { ok: true, reason: null, tick: null, savedAt: null };
    }
    set(patch);
  };

  const titleState = (): Pick<ClientState, 'continueSummary' | 'loadError'> => {
    const r: LoadResult = readSave(storage);
    if (r.kind === 'ok') return { continueSummary: summarise(r.save), loadError: null };
    if (r.kind === 'unreadable') return { continueSummary: null, loadError: r.reason };
    return { continueSummary: null, loadError: null };
  };

  const enter = (setup: Setup, game: State, ui: { selected: string | null; level: number }, reason: SaveReason): void => {
    const battle = BATTLES[setup.battleId];
    bounds.width = game.width;
    bounds.depth = game.depth;
    const focus = game.units.find((u) => u.id === ui.selected) ?? game.units.find((u) => u.side === 'agency');
    if (focus) focusOn(focus);
    set({
      screen: 'battle',
      setup,
      game,
      agency: view(game, 'agency'),
      paused: true,
      selected: ui.selected,
      level: ui.level,
      hover: null,
      mode: 'normal',
      lastTap: null,
      report: null,
      slips: [
        {
          id: ++slipSeq,
          tick: game.tick,
          seconds: query.seconds(game),
          text: reason === 'start' ? `${battle?.name ?? setup.battleId}: squad at the door. PAUSED. Give your orders, then release the paddle.` : `Raid resumed from the save. PAUSED at ${query.seconds(game).toFixed(1)} s.`,
          tone: 'caution',
        },
      ],
    });
    // KB rule 22: the save is written before the first frame.
    persist(reason);
  };

  return {
    screen: 'title',
    setup: null,
    game: null,
    agency: null,
    paused: true,
    speed: 1,
    selected: null,
    level: 0,
    hover: null,
    mode: 'normal',
    slips: [],
    saveStatus: { ok: true, reason: null, tick: null, savedAt: null },
    continueSummary: null,
    loadError: null,
    lastTap: null,
    modelsReady: false,
    modelsLoaded: 0,
    modelsTotal: 0,
    report: null,
    ai: aiLevel,

    refreshTitle() {
      set(titleState());
    },

    newBattle(seed = Math.floor(Math.random() * 1_000_000) + 1) {
      const setup: Setup = { battleId: 'block-raid', seed };
      const game = createGame(setup);
      const first = game.units.find((u) => u.side === 'agency')?.id ?? null;
      enter(setup, game, { selected: first, level: 0 }, 'start');
    },

    continueBattle() {
      const r = readSave(storage);
      if (r.kind !== 'ok') {
        set(titleState());
        return false;
      }
      const env: SaveEnvelope = r.save;
      enter(env.setup, r.state, { selected: env.selected, level: env.level }, 'leave');
      return true;
    },

    discardSave() {
      clearSave(storage);
      set({ continueSummary: null, loadError: null });
    },

    leaveBattle() {
      persist('leave');
      set({ screen: 'title', game: null, agency: null, setup: null, selected: null, hover: null, ...titleState() });
    },

    closeReport() {
      set({ screen: 'title', game: null, agency: null, setup: null, report: null, selected: null, hover: null, slips: [], ...titleState() });
    },

    setModels(loaded, total) {
      set({ modelsLoaded: loaded, modelsTotal: total, modelsReady: loaded >= total });
    },

    order(action) {
      const { game } = get();
      if (!game) return { ok: false, reason: 'no battle' };
      const r = step(game, action);
      if (!r.ok) {
        set({ slips: appendSlips(get().slips, [{ id: ++slipSeq, tick: game.tick, seconds: query.seconds(game), text: `Order refused: ${r.reason}.`, tone: 'caution' }]) });
        return { ok: false, reason: r.reason };
      }
      commit(r.state, r.events, game);
      // SAV-2: every accepted order.
      persist('order');
      return { ok: true };
    },

    advance(seconds) {
      const { game } = get();
      if (!game || seconds <= 0) return [];
      // AI-8: the hostile AI takes its turn before each tick; pause is still the absence of ticks (TIME-2).
      const r = advanceWithAi(game, seconds, hostileAi ? { hostile: hostileAi } : {});
      if (r.state === game) return r.events;
      commit(r.state, r.events, game);
      // SAV-2: every autosaveSeconds of sim time.
      const every = r.state.tuning.save.autosaveSeconds * r.state.tuning.time.ticksPerSecond;
      if (!r.state.over && r.state.tick - lastSaveTick >= every) persist('interval');
      return r.events;
    },

    setPaused(paused) {
      if (get().paused === paused || !get().game) return;
      set({ paused });
      const g = get().game!;
      const text = paused ? 'PAUSED.' : 'Time running.';
      set({ slips: appendSlips(get().slips, [{ id: ++slipSeq, tick: g.tick, seconds: query.seconds(g), text, tone: 'note' }]) });
      // SAV-2: every pause.
      if (paused) persist('pause');
    },

    togglePause() {
      get().setPaused(!get().paused);
    },

    setSpeed(speed) {
      set({ speed });
    },

    select(id) {
      const { agency } = get();
      if (id && agency) {
        const u = agency.units.find((x) => x.id === id);
        if (!u || u.side !== 'agency' || u.down) return;
        set({ selected: id, level: u.level, mode: 'normal' });
        return;
      }
      set({ selected: null, mode: 'normal' });
    },

    setLevel(level) {
      const { game } = get();
      if (!game) return;
      set({ level: Math.max(0, Math.min(game.levels - 1, level)) });
    },

    setHover(p) {
      const cur = get().hover;
      if (cur === p || (cur && p && cur.x === p.x && cur.y === p.y && cur.level === p.level)) return;
      set({ hover: p });
    },

    setMode(mode) {
      const { agency, selected } = get();
      const u = selected ? agency?.units.find((x) => x.id === selected) : undefined;
      if (mode === 'blast' && !(u && !u.down && u.charges > 0)) return;
      set({ mode });
    },

    focusUnit(id) {
      const u = get().agency?.units.find((x) => x.id === id);
      if (u) focusOn(u);
    },

    /** KB rule 25: a tap resolves in exactly one place. Legal action for the tile, else select the unit on it, else clear. */
    tapTile(p) {
      const { agency, selected } = get();
      const finish = (did: TapResult['did'], detail: string): TapResult => {
        const r = { tile: p, did, detail };
        set({ lastTap: r });
        return r;
      };
      if (!agency) return finish('clear', 'no battle');
      const holder = agency.units.find((u) => !u.down && u.x === p.x && u.y === p.y && u.level === p.level);
      const sel = selected ? agency.units.find((u) => u.id === selected && !u.down) : undefined;
      if (sel && get().mode === 'blast') {
        const r = get().order({ type: 'blast', side: 'agency', unit: sel.id, at: { x: p.x, y: p.y, level: p.level } });
        if (r.ok) set({ mode: 'normal' });
        return r.ok ? finish('blast', `${sel.id} -> ${fmtPos(p)}`) : finish('rejected', r.reason);
      }
      if (sel && holder && holder.side !== 'agency') {
        const r = get().order({ type: 'fire', side: 'agency', unit: sel.id, target: holder.id });
        return r.ok ? finish('fire', holder.id) : finish('rejected', r.reason);
      }
      if (sel && !holder) {
        const r = get().order({ type: 'move', side: 'agency', unit: sel.id, to: { x: p.x, y: p.y, level: p.level } });
        if (r.ok) return finish('move', `${sel.id} -> ${fmtPos(p)}`);
        if (!/impassable|no path|off the map/.test(r.reason)) return finish('rejected', r.reason);
      }
      if (holder && holder.side === 'agency') {
        get().select(holder.id);
        return finish('select', holder.id);
      }
      set({ selected: null, mode: 'normal' });
      return finish('clear', 'nothing to do on that tile');
    },

    saveNow(reason) {
      persist(reason);
    },

    hash() {
      const { game } = get();
      return game ? hashState(game) : null;
    },
  };
});
