// KB rule 26: every model is loaded before anything is shown; the start button waits and says so.
// M2 ships procedural stand-ins only (docs/figures.md section 3), so the manifest is empty; the plumbing is
// here so M4 adds GLB urls in one place and nothing else changes.
import { useGLTF } from '@react-three/drei';

export const MODEL_URLS: string[] = [];

export async function preloadModels(onProgress: (loaded: number, total: number) => void): Promise<void> {
  const total = MODEL_URLS.length;
  onProgress(0, total);
  let loaded = 0;
  for (const url of MODEL_URLS) {
    try {
      useGLTF.preload(url);
      // drei's preload is fire-and-forget; wait for the loader cache by fetching the file ourselves.
      await fetch(url, { cache: 'force-cache' });
    } catch {
      // A failed load leaves the stand-in in place (rule 26); the count still advances so the button opens.
    }
    loaded += 1;
    onProgress(loaded, total);
  }
  onProgress(total, total);
}
