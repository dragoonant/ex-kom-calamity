// KB rule 26: every model is loaded before anything is shown; the start button waits and says so.
// The figure manifest (docs/figures.md sections 2 and 3; docs/art/figure-models.md): one slot per figure role. A
// slot with a url is preloaded at startup and drawn by FigureModel (placeholders.tsx) in place of the procedural
// placeholder; a slot with null, or a url that fails to load, draws the placeholder. The GPU pass (M4b) delivers
// public/models/figures/<role>/{textured,textured-lod,rigged}.glb. Since D21 the board draws the rigged file (the 8k
// mesh with its `idle` and `walk` clips) at every distance, so figures move; the gallery keeps the full model.
// The LOD file is no longer drawn or preloaded. The M4d pass (2026-11-20) added the tier 1 agent and the two citizen
// bodies (`citizen`, `citizen-2`), so every humanoid role now has its own model and RULING AGENT-1 is closed.
import { useGLTF } from '@react-three/drei';
import { useSyncExternalStore } from 'react';
import { Cache } from 'three';

export type FigureRole = 'agent-t1' | 'agent-t2' | 'citizen' | 'citizen-2' | 'host-hidden' | 'host-revealed' | 'taker' | 'fighter' | 'spitter';

export const FIGURE_ROLES: FigureRole[] = ['agent-t1', 'agent-t2', 'citizen', 'citizen-2', 'host-hidden', 'host-revealed', 'taker', 'fighter', 'spitter'];

/** Camera distance (world units) beyond which the 8k LOD is drawn instead of the 30k model. */
export const LOD_DISTANCE = 12;

/**
 * The pipeline's gate on the model's orthographic front render (tools/figures/gate.py, recorded in job.json and
 * docs/art/figure-models.md section 2): a Hunyuan GLB is one unnamed mesh, so the gallery cannot measure head,
 * shoulders and legs from nodes and shows these instead, with the ruling that judged them.
 */
export interface RenderGate {
  headShare: number | null;
  shoulders: number | null;
  legs: number | null;
  /** 'house': the section 1 bands; 'reference': against the role's own locked reference (RULING HOST-1); 'recorded': creatures (RULING CREATURE-1). */
  mode: 'house' | 'reference' | 'recorded';
  verdict: 'pass' | 'recorded';
  ruling: string;
}

export interface FigureSlot {
  role: FigureRole;
  /** docs/figures.md section 2 row. */
  label: string;
  /** The full textured model (30k triangles); null until the GPU pass delivers it. */
  url: string | null;
  /** The 8k LOD drawn beyond LOD_DISTANCE; null draws the full model at every distance. */
  lod: string | null;
  /** The rigged LOD with `idle` and `walk` clips: what the board draws (D21). */
  rigged: string | null;
  /** Where the glow sprite for the painted amber core sits on the model (figure units; front is +z). */
  glow: { x: number; y: number; z: number; size: number } | null;
  gate: RenderGate | null;
  /** Unit template(s) drawn with this role, for the gallery's notes. */
  templates: string[];
}

const figure = (folder: string) => ({
  url: `models/figures/${folder}/textured.glb`,
  lod: `models/figures/${folder}/textured-lod.glb`,
  rigged: `models/figures/${folder}/rigged.glb`,
});

// The render gate of each M4d model (tools/figures/gate.py on job.json; docs/art/figure-models.md section 8).
const GATE_T1 = { headShare: 0.299, shoulders: 2.08, legs: 1.04 }; // reference 0.29 / 2.0 / 1.02
const GATE_C1 = { headShare: 0.26, shoulders: 2.22, legs: 0.8 }; // reference 0.24 / 2.33 / 0.92
const GATE_C2 = { headShare: 0.24, shoulders: 2.07, legs: 0.68 }; // reference 0.27 / 2.15 / 0.61 (seed 7)

export const FIGURE_SLOTS: Record<FigureRole, FigureSlot> = {
  'agent-t1': {
    role: 'agent-t1',
    label: 'Agent, tier 1 (plain security gear)',
    // Its own model since the M4d GPU pass (reference `chrome-suit-t1-1.jpg`, locked by the owner 2026-11-20, PLAN D7).
    // This closes RULING AGENT-1 (the squad wore the tier 2 suit from 2026-11-19 to 2026-11-20 while tier 1 had no reference).
    ...figure('agent-t1'),
    glow: null,
    gate: { headShare: GATE_T1.headShare, shoulders: GATE_T1.shoulders, legs: GATE_T1.legs, mode: 'house', verdict: 'pass', ruling: 'GATE-1' },
    templates: ['agent-t1'],
  },
  'agent-t2': {
    role: 'agent-t2',
    label: 'Agent, tier 2 (moulded suit)',
    ...figure('agent'),
    glow: null,
    gate: { headShare: 0.299, shoulders: 2.03, legs: 1.02, mode: 'house', verdict: 'pass', ruling: 'GATE-1' },
    templates: ['agent-t2 (not yet in data)'],
  },
  citizen: {
    role: 'citizen',
    label: 'Citizen (body 1)',
    // `chrome-citizen-1.jpg` (D22). Gated against its own reference like the host (RULING CITIZEN-1): the locked citizen
    // references have the passing host's build (head 24-27%), outside the house bands by the owner's choice.
    ...figure('citizen'),
    glow: null,
    gate: { headShare: GATE_C1.headShare, shoulders: GATE_C1.shoulders, legs: GATE_C1.legs, mode: 'reference', verdict: 'pass', ruling: 'CITIZEN-1' },
    templates: ['citizen (units whose id ends in an even digit, RULING CITIZEN-2)', 'host (unrevealed: drawn as this citizen, HIDE-1)'],
  },
  'citizen-2': {
    role: 'citizen-2',
    label: 'Citizen (body 2)',
    // `chrome-citizen-2.jpg` (D22): the second citizen body, so the street is not one person repeated. RULING CITIZEN-2:
    // a citizen (or hidden host) whose unit id ends in an odd digit wears this body, an even digit body 1.
    ...figure('citizen-2'),
    glow: null,
    gate: { headShare: GATE_C2.headShare, shoulders: GATE_C2.shoulders, legs: GATE_C2.legs, mode: 'reference', verdict: 'pass', ruling: 'CITIZEN-1' },
    templates: ['citizen (units whose id ends in an odd digit, RULING CITIZEN-2)', 'host (unrevealed, odd id)'],
  },
  'host-hidden': {
    role: 'host-hidden',
    label: 'Host, passing as a citizen',
    // HIDE-1: a hidden host is a citizen to the agency, so it draws the citizen model (body 1 here; the board picks the
    // body by the unit id like any citizen, RULING CITIZEN-2). Listed so the slot reads the same model as `citizen`.
    ...figure('citizen'),
    glow: null,
    gate: { headShare: GATE_C1.headShare, shoulders: GATE_C1.shoulders, legs: GATE_C1.legs, mode: 'reference', verdict: 'pass', ruling: 'CITIZEN-1, HIDE-1' },
    templates: ['host (unrevealed: drawn as the citizen, HIDE-1)'],
  },
  'host-revealed': {
    role: 'host-revealed',
    label: 'Host, revealed',
    ...figure('host'),
    glow: { x: 0, y: 0.9, z: 0.09, size: 0.16 },
    gate: { headShare: 0.22, shoulders: 1.6, legs: 1.85, mode: 'reference', verdict: 'pass', ruling: 'HOST-1' },
    templates: ['host (revealed)'],
  },
  taker: {
    role: 'taker',
    label: 'Taker',
    ...figure('taker'),
    glow: { x: 0, y: 0.5, z: 0.34, size: 0.42 },
    gate: { headShare: null, shoulders: null, legs: null, mode: 'recorded', verdict: 'recorded', ruling: 'CREATURE-1, TAKER-1' },
    templates: ['taker'],
  },
  fighter: {
    role: 'fighter',
    label: 'Fighter',
    ...figure('fighter'),
    glow: { x: 0, y: 0.98, z: 0.24, size: 0.36 },
    gate: { headShare: null, shoulders: null, legs: null, mode: 'recorded', verdict: 'recorded', ruling: 'CREATURE-1, FIGHTER-1' },
    templates: ['fighter'],
  },
  spitter: {
    role: 'spitter',
    label: 'Spitter',
    // Round 10 (2026-11-22): its own body, so RULING STRAY-3 (the spitter wore the taker's) is closed.
    ...figure('spitter'),
    glow: { x: 0, y: 0.38, z: 0.3, size: 0.4 },
    gate: { headShare: null, shoulders: null, legs: null, mode: 'recorded', verdict: 'recorded', ruling: 'CREATURE-1' },
    templates: ['spitter'],
  },
};

// Round 10 (docs/art/round-10.md): generated models for what was procedural geometry. Each slot names the file the
// GPU pass delivered (tools/figures/objects.json, docs/art/round-10-models.json), or null to draw the procedural
// piece. A slot that fails to load keeps the procedural piece too (rule 26), so a missing file never leaves a hole.
export type AssetGroup = 'prop' | 'building' | 'vehicle' | 'craft';
export interface AssetSlot {
  id: string;
  group: AssetGroup;
  label: string;
  url: string | null;
}
const slot = (group: AssetGroup, name: string, label: string, file: string | null): AssetSlot => ({ id: `${group}:${name}`, group, label, url: file ? `models/${group === 'prop' ? 'props' : group === 'building' ? 'buildings' : group === 'vehicle' ? 'vehicles' : 'craft'}/${file}.glb` : null });

export const ASSET_SLOTS: AssetSlot[] = [
  slot('prop', 'desk', 'Desk', 'desk'),
  slot('prop', 'counter', 'Counter', 'counter'),
  slot('prop', 'shelf', 'Shelf', 'shelf'),
  slot('prop', 'bed', 'Bed', 'bed'),
  slot('prop', 'locker', 'Locker', 'locker'),
  slot('prop', 'machine', 'Vending machine', 'machine'),
  slot('prop', 'lamp', 'Street lamp', 'lamp'),
  slot('prop', 'kiosk-sign', 'Kiosk sign', 'kiosk-sign'),
  slot('prop', 'bench', 'Bench', 'bench'),
  slot('prop', 'vehicle', 'Parked saloon', 'vehicle'),
  slot('prop', 'planter', 'Planter', 'planter'),
  slot('prop', 'tank', 'Roof tank', 'tank'),
  slot('prop', 'vent', 'Roof vent', 'vent'),
  slot('prop', 'mast', 'Radio mast', 'mast'),
  slot('prop', 'crate', 'Crate', 'crate'),
  slot('building', 'office', 'Office tower', 'office'),
  slot('building', 'bank', 'Bank', 'bank'),
  slot('building', 'broadcast', 'Broadcast station', 'broadcast'),
  slot('building', 'residential', 'Apartment block', 'residential'),
  slot('building', 'power', 'Power station', 'power'),
  slot('building', 'automat', 'Automat', 'automat'),
  slot('building', 'depot', 'Depot', 'depot'),
  slot('building', 'civic', 'Civic hall', 'civic'),
  slot('building', 'works', 'Works', 'works'),
  slot('building', 'hq', 'Agency headquarters', 'hq'),
  slot('vehicle', 'patrol-car', 'Agency patrol car', 'patrol-car'),
  slot('vehicle', 'van', 'Agency van', 'van'),
  slot('vehicle', 'civilian', 'Civilian flying car', 'civilian'),
  slot('craft', 'scout', 'Scout', 'scout'),
  slot('craft', 'seeder', 'Seeder', 'seeder'),
  slot('craft', 'carrier', 'Carrier', 'carrier'),
];
const ASSET_BY_ID = new Map(ASSET_SLOTS.map((a) => [a.id, a]));

/**
 * The urls preloaded at startup: the rigged figures the board draws and the round 10 assets; the 30k figure models
 * only on `?gallery`, which is the only page that draws them (the board draws the rigged mesh, D21). This took the
 * first load on Pages from 14 figure files to 7 (STATUS known limits, 2026-11-22).
 */
export function modelUrls(gallery: boolean): string[] {
  return [
    ...new Set([
      ...FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].rigged).filter((u): u is string => !!u),
      ...ASSET_SLOTS.map((a) => a.url).filter((u): u is string => !!u),
      ...(gallery ? FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].url).filter((u): u is string => !!u) : []),
    ]),
  ];
}
/** Every url either page may preload (tests read it). */
export const MODEL_URLS: string[] = modelUrls(true);

export type ModelState = 'placeholder' | 'loading' | 'ready' | 'failed';
const modelState = new Map<string, ModelState>();

// Figures mount before the preload ends (the gallery at once, the board after the start switch), so every change
// of a slot's state is published: a figure that read 'loading' at mount re-reads it when the file lands. Without
// this the gallery stayed on the stand-ins for good on a slow connection (owner's desktop, 2026-11-19).
const listeners = new Set<() => void>();
function setModelState(url: string, state: ModelState): void {
  modelState.set(url, state);
  for (const l of listeners) l();
}
export function subscribeModels(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The slot's state for a React figure, re-read whenever the preload changes any slot. */
export function useModelState(role: FigureRole): ModelState {
  return useSyncExternalStore(subscribeModels, () => modelStateOf(role));
}

/** What the gallery and the figures read: 'ready' draws the GLB, anything else the placeholder (rule 26). */
export function modelStateOf(role: FigureRole): ModelState {
  const url = FIGURE_SLOTS[role].url;
  if (!url) return 'placeholder';
  return modelState.get(url) ?? 'loading';
}

/** The rigged url for a role when it loaded, else null (the board then draws the full model or the stand-in). */
export function riggedUrlOf(role: FigureRole): string | null {
  const r = FIGURE_SLOTS[role].rigged;
  return r && modelState.get(r) === 'ready' ? r : null;
}

/** The rigged url for a React figure, re-read whenever the preload changes any slot. */
export function useRiggedUrl(role: FigureRole): string | null {
  return useSyncExternalStore(subscribeModels, () => riggedUrlOf(role));
}

/** The LOD url for a role when it loaded, else null (the full model is drawn at every distance). */
export function lodUrlOf(role: FigureRole): string | null {
  const lod = FIGURE_SLOTS[role].lod;
  return lod && modelState.get(lod) === 'ready' ? lod : null;
}

/** An asset slot's url when its file loaded, else null (the procedural piece is drawn). */
export function assetUrlOf(id: string): string | null {
  const url = ASSET_BY_ID.get(id)?.url ?? null;
  return url && modelState.get(url) === 'ready' ? url : null;
}

/** An asset slot's state, for the gallery. */
export function assetStateOf(id: string): ModelState {
  const url = ASSET_BY_ID.get(id)?.url ?? null;
  if (!url) return 'placeholder';
  return modelState.get(url) ?? 'loading';
}

/** The asset url for a React piece, re-read whenever the preload changes any slot. */
export function useAssetUrl(id: string): string | null {
  return useSyncExternalStore(subscribeModels, () => assetUrlOf(id));
}

/**
 * The bytes of the slots drawn by code that builds its meshes itself (vehicles and craft, `board/assetScene.ts`), kept
 * from the preload so they are parsed from memory, never read back from the disk cache (see below).
 */
export const PRELOADED_BYTES = new Map<string, ArrayBuffer>();
const KEEP_BYTES = new Set(ASSET_SLOTS.filter((a) => a.group === 'vehicle' || a.group === 'craft').map((a) => a.url));

export async function preloadModels(onProgress: (loaded: number, total: number) => void, gallery = false): Promise<void> {
  const urls = modelUrls(gallery);
  const total = urls.length;
  onProgress(0, total);
  let loaded = 0;
  // Three fetches at a time (round 10 took the boot list from 14 files to 40; one at a time, a slow connection waited
  // for each in turn; six at once raised Chromium's ERR_CACHE_READ_FAILURE on a fresh profile once in six save e2e
  // runs). The hand-off to the loader below toggles three's global Cache, so it runs one file at a time.
  let handOff: Promise<void> = Promise.resolve();
  const one = async (url: string) => {
    try {
      setModelState(url, 'loading');
      // Fetch the whole file first, so a missing GLB is a known failure and the start switch opens only once the
      // bytes are really here (rule 26); the loader then reads them back from the HTTP cache.
      // A failed read of the disk cache (ERR_CACHE_READ_FAILURE) is retried once from the network, so a figure is not
      // left a stand-in for the session over a cache race.
      const r = await fetch(url, { cache: 'force-cache' }).catch(() => fetch(url, { cache: 'reload' }));
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const bytes = await r.arrayBuffer();
      if (KEEP_BYTES.has(url)) PRELOADED_BYTES.set(url, bytes.slice(0));
      // Hand the loader these bytes instead of letting it read the file back from the browser's disk cache: three's
      // FileLoader checks its own cache first (key `file:<url>`) and passes the entry to the parser on a 0 ms timer. A
      // second read of a 7 MB entry that was written a moment ago failed with ERR_CACHE_READ_FAILURE on a fresh
      // Chromium profile (the save e2e, 2026-11-20), which would have left that figure a stand-in for the session.
      // The parser copies what it keeps, so the entry is dropped once the timer has fired.
      const step = handOff.then(async () => {
        Cache.enabled = true;
        Cache.add(`file:${url}`, bytes);
        useGLTF.preload(url);
        await new Promise((res) => setTimeout(res, 20));
        Cache.remove(`file:${url}`);
        Cache.enabled = false;
      });
      handOff = step.catch(() => undefined);
      await step;
      setModelState(url, 'ready');
    } catch {
      // A failed load leaves the placeholder in place (rule 26); the count still advances so the button opens.
      setModelState(url, 'failed');
    }
    loaded += 1;
    onProgress(loaded, total);
  };
  let next = 0;
  const worker = async () => {
    while (next < urls.length) await one(urls[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(3, urls.length) }, worker));
  onProgress(total, total);
}
