// KB rule 26: every model is loaded before anything is shown; the start button waits and says so.
// The figure manifest (docs/figures.md sections 2 and 3; docs/art/figure-models.md): one slot per figure role. A
// slot with a url is preloaded at startup and drawn by FigureModel (placeholders.tsx) in place of the procedural
// placeholder; a slot with null, or a url that fails to load, draws the placeholder. The GPU pass (M4b) delivers
// public/models/figures/<role>/{textured,textured-lod,rigged}.glb; the full model is drawn up close, the 8k LOD
// beyond LOD_DISTANCE, and the rigged file waits for the animation pass (the client does not animate yet, PLAN D8).
import { useGLTF } from '@react-three/drei';
import { useSyncExternalStore } from 'react';

export type FigureRole = 'agent-t1' | 'agent-t2' | 'citizen' | 'host-hidden' | 'host-revealed' | 'taker' | 'fighter';

export const FIGURE_ROLES: FigureRole[] = ['agent-t1', 'agent-t2', 'citizen', 'host-hidden', 'host-revealed', 'taker', 'fighter'];

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
  /** The rigged LOD with `idle` and `walk` clips; listed, not yet drawn. */
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

const none = { url: null, lod: null, rigged: null, glow: null, gate: null };

export const FIGURE_SLOTS: Record<FigureRole, FigureSlot> = {
  'agent-t1': {
    role: 'agent-t1',
    label: 'Agent, tier 1 (plain security gear)',
    // RULING AGENT-1: the tier 1 agent has no locked reference, so the squad wears the generated tier 2 suit until
    // its own concept round (owner, 2026-11-19: "Yes, use it", so the playable shows models from the first frame).
    ...figure('agent'),
    glow: null,
    gate: { headShare: 0.299, shoulders: 2.03, legs: 1.02, mode: 'house', verdict: 'pass', ruling: 'GATE-1, AGENT-1' },
    templates: ['agent-t1 (drawn with the tier 2 model until a tier 1 reference is locked, RULING AGENT-1)'],
  },
  'agent-t2': {
    role: 'agent-t2',
    label: 'Agent, tier 2 (moulded suit)',
    ...figure('agent'),
    glow: null,
    gate: { headShare: 0.299, shoulders: 2.03, legs: 1.02, mode: 'house', verdict: 'pass', ruling: 'GATE-1' },
    templates: ['agent-t2 (not yet in data)'],
  },
  citizen: { role: 'citizen', label: 'Citizen', ...none, templates: ['citizen'] },
  'host-hidden': { role: 'host-hidden', label: 'Host, passing as a citizen', ...none, templates: ['host (unrevealed: drawn as the citizen)'] },
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

/** Every url the manifest names (full models first, then LODs), preloaded at startup. */
export const MODEL_URLS: string[] = [
  ...new Set([
    ...FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].url).filter((u): u is string => !!u),
    ...FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].lod).filter((u): u is string => !!u),
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
      await r.arrayBuffer();
      useGLTF.preload(url);
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
