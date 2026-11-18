// KB rule 26: every model is loaded before anything is shown; the start button waits and says so.
// The figure manifest (docs/figures.md sections 2 and 3): one slot per figure role. A slot with a url is preloaded
// at startup and drawn by FigureModel (figures.tsx) in place of the procedural placeholder; a slot with null, or a
// url that fails to load, draws the placeholder. The GPU pass drops rigged GLBs into public/models/<role>.glb and
// fills the url here; nothing else changes.
import { useGLTF } from '@react-three/drei';

export type FigureRole = 'agent-t1' | 'agent-t2' | 'citizen' | 'host-hidden' | 'host-revealed' | 'taker' | 'fighter';

export const FIGURE_ROLES: FigureRole[] = ['agent-t1', 'agent-t2', 'citizen', 'host-hidden', 'host-revealed', 'taker', 'fighter'];

export interface FigureSlot {
  role: FigureRole;
  /** docs/figures.md section 2 row. */
  label: string;
  /** Where the rigged GLB goes once it exists; null until the GPU pass delivers it. */
  url: string | null;
  /** Unit template(s) drawn with this role, for the gallery's notes. */
  templates: string[];
}

export const FIGURE_SLOTS: Record<FigureRole, FigureSlot> = {
  'agent-t1': { role: 'agent-t1', label: 'Agent, tier 1 (plain security gear)', url: null, templates: ['agent-t1'] },
  'agent-t2': { role: 'agent-t2', label: 'Agent, tier 2 (moulded suit)', url: null, templates: ['agent-t2 (not yet in data)'] },
  citizen: { role: 'citizen', label: 'Citizen', url: null, templates: ['citizen'] },
  'host-hidden': { role: 'host-hidden', label: 'Host, passing as a citizen', url: null, templates: ['host (unrevealed: drawn as the citizen)'] },
  'host-revealed': { role: 'host-revealed', label: 'Host, revealed', url: null, templates: ['host (revealed)'] },
  taker: { role: 'taker', label: 'Taker', url: null, templates: ['taker'] },
  fighter: { role: 'fighter', label: 'Fighter', url: null, templates: ['fighter'] },
};

/** Every url the manifest names; empty until the GPU pass. */
export const MODEL_URLS: string[] = FIGURE_ROLES.map((r) => FIGURE_SLOTS[r].url).filter((u): u is string => !!u);

export type ModelState = 'placeholder' | 'loading' | 'ready' | 'failed';
const modelState = new Map<string, ModelState>();

/** What the gallery and the figures read: 'ready' draws the GLB, anything else the placeholder (rule 26). */
export function modelStateOf(role: FigureRole): ModelState {
  const url = FIGURE_SLOTS[role].url;
  if (!url) return 'placeholder';
  return modelState.get(url) ?? 'loading';
}

export async function preloadModels(onProgress: (loaded: number, total: number) => void): Promise<void> {
  const total = MODEL_URLS.length;
  onProgress(0, total);
  let loaded = 0;
  for (const url of MODEL_URLS) {
    try {
      modelState.set(url, 'loading');
      // Check the file is really there before handing it to the loader, so a missing GLB is a known failure.
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      useGLTF.preload(url);
      modelState.set(url, 'ready');
    } catch {
      // A failed load leaves the placeholder in place (rule 26); the count still advances so the button opens.
      modelState.set(url, 'failed');
    }
    loaded += 1;
    onProgress(loaded, total);
  }
  onProgress(total, total);
}
