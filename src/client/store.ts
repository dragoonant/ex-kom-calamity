// One zustand store for the whole client. The engine state is `live`; what the board draws is `shown`, which the
// presenter advances event by event (separate presented state from live state: KB, Mallet 42k lessons).
import { create } from 'zustand';
import { chooseAction } from '../ai';
import { applyResult, newCampaign, deployFrom, type Campaign } from '../engine/campaign';
import { dist } from '../engine/grid';
import { canTarget, moveRange, unitById, weapons } from '../engine/query';
import { legalActions, newBattle, step, view } from '../engine/step';
import type { Action, BattleState, GameEvent, WeaponSlot } from '../engine/types';
import { audio } from './audio';
import { readSave, writeSave, clearSave, type Envelope, type Screen as SaveScreen } from './save';

export type Screen = 'title' | 'briefing' | 'battle' | 'debrief' | 'hangar' | 'next';
export interface Batch { events: GameEvent[]; state: BattleState }
export interface Settings { closeups: boolean }

const SETTINGS_KEY = 'ib-settings';
function readSettings(): Settings {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>; return { closeups: s.closeups ?? true }; } catch { return { closeups: true }; }
}

export interface ClientState {
  screen: Screen;
  campaign: Campaign;
  /** The campaign as it stood when the current battle began (Retry restarts from it). */
  preBattle: Campaign | null;
  live: BattleState | null;
  shown: BattleState | null;
  seed: number;
  actions: Action[];
  queue: Batch[];
  presenting: boolean;
  selected: string | null;
  hover: { x: number; y: number } | null;
  target: string | null;
  targetObj: { x: number; y: number } | null;
  feed: { text: string; side: 'player' | 'hostile' | 'note' }[];
  banner: { text: string; sub: string; until: number } | null;
  settings: Settings;
  saveError: string | null;
  menuOpen: boolean;
  aiDelay: number;
  clock: number;

  setScreen: (s: Screen) => void;
  newGame: () => void;
  continueGame: () => boolean;
  startBattle: () => void;
  dispatch: (a: Action) => boolean;
  tapTile: (x: number, y: number) => void;
  select: (id: string | null) => void;
  setHover: (p: { x: number; y: number } | null) => void;
  setTarget: (id: string | null) => void;
  fire: (slot: WeaponSlot) => void;
  fireObject: (slot: WeaponSlot) => void;
  finishBattle: () => void;
  retry: () => void;
  setCampaign: (c: Campaign) => void;
  setSettings: (p: Partial<Settings>) => void;
  note: (text: string, side?: 'player' | 'hostile' | 'note') => void;
  save: () => void;
}

export const useGame = create<ClientState>((set, get) => ({
  screen: 'title',
  campaign: newCampaign(),
  preBattle: null,
  live: null,
  shown: null,
  seed: 1,
  actions: [],
  queue: [],
  presenting: false,
  selected: null,
  hover: null,
  target: null,
  targetObj: null,
  feed: [],
  banner: null,
  settings: readSettings(),
  saveError: null,
  menuOpen: false,
  aiDelay: 0,
  clock: 0,

  setScreen: (screen) => { set({ screen, menuOpen: false }); get().save(); },
  newGame: () => {
    clearSave();
    set({ campaign: newCampaign(), preBattle: null, live: null, shown: null, actions: [], queue: [], feed: [], screen: 'briefing' });
    get().save();
  },
  continueGame: () => {
    const r = readSave();
    if (!r.ok) return false;
    const env = r.env;
    if (env.screen === 'battle' && env.battle) {
      set({ campaign: env.campaign, preBattle: env.campaign, live: env.battle.snapshot, shown: env.battle.snapshot, seed: env.battle.seed, actions: env.battle.actions, queue: [], presenting: false, screen: 'battle', selected: null, target: null, feed: [{ text: `Resumed: round ${env.battle.snapshot.round}.`, side: 'note' }] });
    } else set({ campaign: env.campaign, screen: env.screen, live: null, shown: null });
    return true;
  },
  startBattle: () => {
    const c = get().campaign;
    const seed = (Date.now() % 100000) + 1;
    const b = newBattle('marrow-yard', seed, deployFrom(c));
    set({ preBattle: c, live: b, shown: b, seed, actions: [], queue: [], presenting: false, selected: null, target: null, targetObj: null, feed: [{ text: 'Marrow Yard. Clear every Directorate walker.', side: 'note' }], screen: 'battle', banner: { text: 'YOUR PHASE', sub: 'ROUND 1', until: get().clock + 1.6 } });
    audio.play('turn-player');
    get().save();
  },
  dispatch: (a) => {
    const { live } = get();
    if (!live || live.result) return false;
    const r = step(live, a);
    if (r.events[0]?.type === 'rejected') return false;
    set((st) => ({ live: r.state, actions: [...st.actions, a], queue: [...st.queue, { events: r.events, state: r.state }] }));
    get().save();
    return true;
  },
  select: (id) => {
    set({ selected: id, target: null, targetObj: null });
    const u = id ? get().live?.units.find((x) => x.id === id) : null;
    if (u && u.side === 'player') { audio.play('select'); void audio.voice(`${u.pilot}-select`).catch(() => {}); }
  },
  setHover: (p) => set({ hover: p }),
  setTarget: (id) => set({ target: id, targetObj: null }),
  tapTile: (x, y) => {
    const st = get();
    const live = st.live;
    if (!live || live.result || st.presenting || st.queue.length || live.phase !== 'player') return;
    const here = live.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;
    const sel = st.selected ? unitById(live, st.selected) : null;
    // 1. A legal move for the selected walker.
    if (sel && sel.side === 'player' && !sel.moved && !sel.acted && !here) {
      if (moveRange(live, sel).some((t) => t.x === x && t.y === y)) { audio.play('confirm'); st.dispatch({ type: 'move', unit: sel.id, x, y }); return; }
    }
    // 2. An enemy the selected walker can fire on: open the attack preview.
    if (sel && sel.side === 'player' && !sel.acted && here && here.side === 'hostile') {
      if (weapons(sel).some((w) => canTarget(live, sel, w.slot, here))) { audio.play('ui-tick'); set({ target: here.id, targetObj: null }); return; }
    }
    // 3. A breakable object in range.
    const tile = live.tiles[y * live.w + x];
    if (sel && sel.side === 'player' && !sel.acted && !here && tile?.obj && ['wagon', 'container', 'shed', 'barrier'].includes(tile.obj)) {
      const ok = weapons(sel).some((w) => w.usable && (w.def.class === 'direct' || w.def.class === 'melee') && dist(sel, { x, y }) >= w.def.min && dist(sel, { x, y }) <= w.def.max);
      if (ok) { audio.play('ui-tick'); set({ targetObj: { x, y }, target: null }); return; }
    }
    // 4. Otherwise select whatever stands there, or clear.
    if (here) st.select(here.id);
    else { if (st.selected) audio.play('cancel'); set({ selected: null, target: null, targetObj: null }); }
  },
  fire: (slot) => {
    const st = get();
    if (!st.selected || !st.target) return;
    const u = st.live ? unitById(st.live, st.selected) : null;
    if (u?.side === 'player') void audio.voice(`${u.pilot}-attack`).catch(() => {});
    if (st.dispatch({ type: 'attack', unit: st.selected, slot, target: st.target })) set({ target: null });
  },
  fireObject: (slot) => {
    const st = get();
    if (!st.selected || !st.targetObj) return;
    if (st.dispatch({ type: 'attackObject', unit: st.selected, slot, x: st.targetObj.x, y: st.targetObj.y })) set({ targetObj: null });
  },
  finishBattle: () => {
    const { live, campaign } = get();
    if (!live?.result) return;
    set({ campaign: applyResult(campaign, live), screen: 'debrief' });
    get().save();
  },
  retry: () => { const pre = get().preBattle; if (pre) set({ campaign: pre }); get().startBattle(); },
  setCampaign: (c) => { set({ campaign: c }); get().save(); },
  setSettings: (p) => { const s = { ...get().settings, ...p }; set({ settings: s }); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* refused storage */ } },
  note: (text, side = 'note') => set((st) => ({ feed: [...st.feed.slice(-40), { text, side }] })),
  save: () => {
    const st = get();
    if (st.screen === 'title') return;
    const screen: SaveScreen = st.screen === 'next' ? 'hangar' : st.screen;
    const env: Envelope = { v: 1, savedAt: Date.now(), screen, campaign: st.screen === 'battle' ? (st.preBattle ?? st.campaign) : st.campaign, battle: st.screen === 'battle' && st.live ? { seed: st.seed, actions: st.actions, snapshot: st.live } : null };
    if (st.screen === 'debrief' || st.screen === 'hangar' || st.screen === 'next') env.battle = null;
    set({ saveError: writeSave(env) });
  },
}));

/** The hostile side's next order, from its view only (ARCH-4). */
export function aiOrder(live: BattleState): Action {
  return chooseAction(view(live, 'hostile'), 'normal');
}

export function allActed(live: BattleState): boolean {
  return live.units.filter((u) => u.alive && u.side === 'player').every((u) => u.acted);
}
export { legalActions };
