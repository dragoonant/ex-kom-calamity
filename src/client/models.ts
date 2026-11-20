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

export type FigureRole = 'agent-t1' | 'agent-t2' | 'citizen' | 'citizen-2' | 'host-hidden' | 'host-revealed' | 'taker' | 'fighter';

export const FIGURE_ROLES: FigureRole[] = ['agent-t1', 'agent-t2', 'citizen', 'citizen-2', 'host-hidden', 'host-revealed', 'taker', 'fighter'];

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
};

/** Every url preloaded at startup: the rigged files the board draws first, then the full models for the gallery. */
export const MODEL_URLS: string[] = [
  ...new Set([
    ...FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].rigged).filter((u): u is string => !!u),
    ...FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].url).filter((u): u is string => !!u),
  ]),
];

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

export async function preloadModels(onProgress: (loaded: number, total: number) => void): Promise<void> {
  const total = MODEL_URLS.length;
  onProgress(0, total);
  let loaded = 0;
  for (const url of MODEL_URLS) {
    try {
      setModelState(url, 'loading');
      // Fetch the whole file first, so a missing GLB is a known failure and the start switch opens only once the
      // bytes are really here (rule 26); the loader then reads them back from the HTTP cache.
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const bytes = await r.arrayBuffer();
      // Hand the loader these bytes instead of letting it read the file back from the browser's disk cache: three's
      // FileLoader checks its own cache first (key `file:<url>`) and passes the entry to the parser on a 0 ms timer. A
      // second read of a 7 MB entry that was written a moment ago failed with ERR_CACHE_READ_FAILURE on a fresh
      // Chromium profile (the save e2e, 2026-11-20), which would have left that figure a stand-in for the session.
      // The parser copies what it keeps, so the entry is dropped once the timer has fired.
      Cache.enabled = true;
      Cache.add(`file:${url}`, bytes);
      useGLTF.preload(url);
      await new Promise((res) => setTimeout(res, 20));
      Cache.remove(`file:${url}`);
      Cache.enabled = false;
      setModelState(url, 'ready');
    } catch {
      // A failed load leaves the placeholder in place (rule 26); the count still advances so the button opens.
      setModelState(url, 'failed');
    }
    loaded += 1;
    onProgress(loaded, total);
  }
  onProgress(total, total);
}
