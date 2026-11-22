// The city's one store (KB recipe step 6): it alone calls the city engine. Everything drawn comes from
// cityView(state, 'agency') and cityQuery.*; time moves only through ticks from advance() (CLOCK-4, CLOCK-6).
// The organism's planner runs inside advance on its own view (CAI-1). Save and Continue under `ekc-campaign`
// (KB rule 22, real-time form of PLAN Q5): on every pause, every accepted order and every 10 s of play.
import { create } from 'zustand';
import { hostilePlanner } from '../../ai/city';
import {
  cityQuery,
  cityStep,
  cityView,
  createCity,
  hashCity,
  type CityAction,
  type CityEvent,
  type CityState,
  type RaidResult,
} from '../../city';
import type { StorageLike } from '../save';
import type { Roster } from '../../engine';
import { battleOf, rosterOf } from './join';
import { isWire, traySlipsFor, type TraySlip } from './text';

export const CAMPAIGN_KEY = 'ekc-campaign';
export const CAMPAIGN_VERSION = 4; // 2: M5b's shelf, lab and workshop; 3: the air war and the acts; 4: the 24 x 24 city and travel (TRAVEL)
export type CitySpeed = 1 | 4 | 12;
export const CITY_SPEEDS: CitySpeed[] = [1, 4, 12];
const MAX_TRAY = 60;
/** CWIRE-1: the wire keeps the newest 40 slips, as the state keeps 40 (SIGN-5). */
const MAX_WIRE = 40;
const AUTOSAVE_TICKS = 60;

export interface CampaignEnvelope {
  key: typeof CAMPAIGN_KEY;
  version: number;
  savedAt: string;
  hash: string;
  state: CityState;
  tray: TraySlip[];
  /** CWIRE-1: the city wire's slips; a save from before the wire has none and its tray is split on Continue. */
  wire?: TraySlip[];
}

export interface CampaignSummary {
  day: number;
  money: number;
  confidence: number;
  agents: number;
  savedAt: string;
}

/** A battle the player chose to fight from the door (M7); the result comes back through finishFight. */
export interface PendingFight {
  /** A raid at a door, or an assault on headquarters (ACT-5). */
  kind: 'raid' | 'defence';
  building: string;
  /** The building whose raid map the battle is fought on: the raid's own, or the one a wreck fell on. */
  site: string;
  /** CJOIN-1, CJOIN-3: the battle and the roster it is fought with. */
  battle: string;
  roster: Roster;
  agents: string[];
  hostiles: number;
}

export interface CityClient {
  active: boolean;
  game: CityState | null;
  view: CityState | null;
  paused: boolean;
  speed: CitySpeed;
  selected: string | null;
  /** The agents ticked for the next raid. */
  squad: string[];
  tray: TraySlip[];
  /** CWIRE-1: the organism's slips, newest last, for the banner over the board. */
  wire: TraySlip[];
  /** The newest events, for the board's effects and the sound (cleared on read by nobody: replaced each advance). */
  lastEvents: CityEvent[];
  eventSeq: number;
  saveOk: boolean;
  summary: CampaignSummary | null;
  loadError: string | null;
  fight: PendingFight | null;

  refresh(): void;
  start(seed?: number): void;
  resume(): boolean;
  discard(): void;
  leave(): void;
  advance(seconds: number): CityEvent[];
  advanceTicks(ticks: number): CityEvent[];
  order(action: Exclude<CityAction, { type: 'tick' }>): { ok: true } | { ok: false; reason: string };
  setPaused(p: boolean): void;
  togglePause(): void;
  setSpeed(s: CitySpeed): void;
  select(id: string | null): void;
  /** CWIRE-3: a name picked on the wire: selects the building, opens its file card and brings the camera round. */
  focusBuilding(id: string): void;
  /** Bumped by focusBuilding; the board glides the camera to `selected` when it changes. */
  focusSeq: number;
  toggleSquad(agent: string): void;
  beginFight(): PendingFight | null;
  finishFight(result: RaidResult | null): void;
  saveNow(): void;
  hash(): string | null;
}

let traySeq = 0;
const nextTrayId = () => ++traySeq;

function storage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCampaign(st: StorageLike | null): { ok: true; env: CampaignEnvelope } | { ok: false; reason: string } | null {
  if (!st) return null;
  let text: string | null;
  try {
    text = st.getItem(CAMPAIGN_KEY);
  } catch {
    return { ok: false, reason: 'the browser refused to read storage' };
  }
  if (!text) return null;
  try {
    const env = JSON.parse(text) as CampaignEnvelope;
    if (env.key !== CAMPAIGN_KEY || env.version !== CAMPAIGN_VERSION) return { ok: false, reason: 'it was saved by another version' };
    if (!env.state || !Array.isArray(env.state.orgs)) return { ok: false, reason: 'it is incomplete' };
    if (hashCity(env.state) !== env.hash) return { ok: false, reason: 'it does not match its checksum' };
    return { ok: true, env };
  } catch {
    return { ok: false, reason: 'it is not readable' };
  }
}

function summaryOf(env: CampaignEnvelope): CampaignSummary {
  const s = env.state;
  return { day: cityQuery.clock(s).day + 1, money: s.money, confidence: s.confidence, agents: s.agents.filter((a) => a.status !== 'dead').length, savedAt: env.savedAt };
}

function speedFromSearch(): CitySpeed {
  return 1;
}

let sinceSave = 0;

export const useCity = create<CityClient>((set, get) => {
  const commit = (next: CityState, events: CityEvent[], extra: Partial<CityClient> = {}) => {
    const slips = traySlipsFor(events, cityView(next, 'agency'), nextTrayId);
    const toTray = slips.filter((t) => !isWire(t.kind));
    const toWire = slips.filter((t) => isWire(t.kind));
    const tray = toTray.length ? [...get().tray, ...toTray].slice(-MAX_TRAY) : get().tray;
    const wire = toWire.length ? [...get().wire, ...toWire].slice(-MAX_WIRE) : get().wire;
    // Auto-pause when the squad reaches a door, an organisation turns, or the act ends.
    const stop = events.some((e) => e.type === 'raidArrived' || e.type === 'turned' || e.type === 'cityOver' || e.type === 'actBegan' || e.type === 'assault' || e.type === 'hqFound' || (e.type === 'launched' && e.kind !== 'scout'));
    set({ game: next, view: cityView(next, 'agency'), tray, wire, lastEvents: events, eventSeq: get().eventSeq + (events.length ? 1 : 0), ...(stop ? { paused: true } : {}), ...extra });
    if (stop) get().saveNow();
  };

  return {
    active: false,
    game: null,
    view: null,
    paused: true,
    speed: speedFromSearch(),
    selected: null,
    squad: [],
    tray: [],
    wire: [],
    focusSeq: 0,
    lastEvents: [],
    eventSeq: 0,
    saveOk: true,
    summary: null,
    loadError: null,
    fight: null,

    refresh() {
      const r = readCampaign(storage());
      if (!r) set({ summary: null, loadError: null });
      else if (r.ok) set({ summary: summaryOf(r.env), loadError: null });
      else set({ summary: null, loadError: r.reason });
    },

    start(seed) {
      const s = createCity({ seed: seed ?? ((Date.now() % 100000) + 1) });
      traySeq = 0;
      const intro: TraySlip = { id: nextTrayId(), tick: 0, stamp: 'D1 08:00', text: 'The switchboard is live. Watch the city wire along the top: the organism hides, but a building that is too perfect by day, or hums amber by night, gives it away. Pick a name on the wire to open its file.', tone: 'note', building: null, kind: 'intro' };
      set({ active: true, game: s, view: cityView(s, 'agency'), paused: true, selected: null, squad: [], tray: [intro], wire: [], lastEvents: [], fight: null });
      get().saveNow();
    },

    resume() {
      const r = readCampaign(storage());
      if (!r || !r.ok) {
        if (r && !r.ok) set({ loadError: r.reason });
        return false;
      }
      const all = [...r.env.tray, ...(r.env.wire ?? [])];
      traySeq = all.reduce((m, t) => Math.max(m, t.id), 0);
      // CWIRE-1: a save from before the wire kept the organism's slips in the tray; they move to the wire.
      const tray = r.env.tray.filter((t) => !isWire(t.kind));
      const wire = (r.env.wire ?? r.env.tray.filter((t) => isWire(t.kind))).slice(-MAX_WIRE);
      set({ active: true, game: r.env.state, view: cityView(r.env.state, 'agency'), paused: true, selected: null, squad: [], tray, wire, lastEvents: [], fight: null });
      return true;
    },

    discard() {
      try {
        storage()?.removeItem(CAMPAIGN_KEY);
      } catch {
        // nothing to do: the title says what it found next time
      }
      set({ summary: null, loadError: null });
    },

    leave() {
      get().saveNow();
      set({ active: false, game: null, view: null, paused: true, fight: null });
      get().refresh();
    },

    advance(seconds) {
      const g = get().game;
      if (!g) return [];
      return get().advanceTicks(Math.round(seconds * g.tuning.clock.ticksPerSecond));
    },

    advanceTicks(n) {
      let s = get().game;
      if (!s || s.over) return [];
      const all: CityEvent[] = [];
      for (let i = 0; i < n; i++) {
        // CAI-1: the organism decides on the hour from its own view.
        if (s.tick % 6 === 0) {
          for (const a of hostilePlanner(cityView(s, 'hostile'))) {
            const r = cityStep(s, a);
            if (r.ok) {
              s = r.state;
              all.push(...r.events);
            }
          }
        }
        const r = cityStep(s, { type: 'tick' });
        if (!r.ok || r.state === s) break; // RAID-4 or the end: time stands still
        s = r.state;
        all.push(...r.events);
        if (r.events.some((e) => e.type === 'raidArrived' || e.type === 'turned' || e.type === 'cityOver' || e.type === 'actBegan' || e.type === 'assault' || e.type === 'hqFound' || (e.type === 'launched' && e.kind !== 'scout'))) break;
      }
      commit(s, all);
      sinceSave += n;
      if (sinceSave >= AUTOSAVE_TICKS * 10) {
        sinceSave = 0;
        get().saveNow();
      }
      return all;
    },

    order(action) {
      const g = get().game;
      if (!g) return { ok: false, reason: 'no campaign' };
      const r = cityStep(g, action as CityAction);
      if (!r.ok) {
        const slip: TraySlip = { id: nextTrayId(), tick: g.tick, stamp: '', text: `Order refused: ${r.reason}.`, tone: 'caution', building: null, kind: 'refused' };
        set({ tray: [...get().tray, slip].slice(-MAX_TRAY) });
        return { ok: false, reason: r.reason };
      }
      const extra: Partial<CityClient> = {};
      if (action.type === 'raid') extra.squad = [];
      commit(r.state, r.events, extra);
      get().saveNow();
      return { ok: true };
    },

    setPaused(p) {
      set({ paused: p });
      if (p) get().saveNow();
    },
    togglePause() {
      get().setPaused(!get().paused);
    },
    setSpeed(speed) {
      set({ speed });
    },
    select(id) {
      set({ selected: id });
    },
    focusBuilding(id) {
      set({ selected: id, focusSeq: get().focusSeq + 1 });
    },
    toggleSquad(agent) {
      const sq = get().squad;
      const max = get().game?.tuning.raid.maxAgents ?? 6;
      if (sq.includes(agent)) set({ squad: sq.filter((x) => x !== agent) });
      else if (sq.length < max) set({ squad: [...sq, agent] });
    },

    beginFight() {
      const g = get().game;
      if (g?.defence) {
        // ACT-5: headquarters is fought on the Civic Savings map (RULING ACT-5) with the agents at home.
        const home = g.agents.filter((a) => a.status === 'ready').map((a) => a.id).slice(0, g.tuning.raid.maxAgents);
        const fight: PendingFight = { kind: 'defence', building: 'hq', site: 'hq', battle: battleOf(g, 'defence', 'hq'), roster: rosterOf(g, home, g.defence), agents: home, hostiles: g.defence.hostiles };
        set({ fight });
        get().saveNow();
        return fight;
      }
      if (!g?.raid?.arrived) return null;
      const crash = g.crashes.find((c) => c.id === g.raid!.building);
      const fight: PendingFight = { kind: 'raid', building: g.raid.building, site: crash ? (crash.building ?? 'wreck') : g.raid.building, battle: battleOf(g, 'raid', g.raid.building), roster: rosterOf(g, g.raid.agents, g.raid, g.raid.building), agents: [...g.raid.agents], hostiles: g.raid.hostiles };
      set({ fight });
      get().saveNow();
      return fight;
    },

    finishFight(result) {
      const f = get().fight;
      set({ fight: null });
      if (!f) return;
      if (f.kind === 'defence') get().order(result ? { type: 'defend', side: 'agency', result } : { type: 'defend', side: 'agency' });
      else get().order(result ? { type: 'resolve', side: 'agency', result } : { type: 'resolve', side: 'agency' });
    },

    saveNow() {
      const g = get().game;
      const st = storage();
      if (!g || !st) return;
      const env: CampaignEnvelope = { key: CAMPAIGN_KEY, version: CAMPAIGN_VERSION, savedAt: new Date().toISOString(), hash: hashCity(g), state: g, tray: get().tray, wire: get().wire };
      try {
        st.setItem(CAMPAIGN_KEY, JSON.stringify(env));
        set({ saveOk: true });
      } catch {
        set({ saveOk: false });
      }
    },

    hash() {
      const g = get().game;
      return g ? hashCity(g) : null;
    },
  };
});
