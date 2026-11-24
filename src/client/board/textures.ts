// Every texture the board uses, loaded before the battle shows (KB rule 26).
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

export const TEX_IDS = ['wet-concrete', 'ballast', 'mud', 'snow-mud', 'corrugated-rust', 'container', 'brick', 'silo-concrete', 'paint-slate', 'paint-camo'] as const;
export type TexId = (typeof TEX_IDS)[number];

function load(url: string): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    loader.load(url, (t) => resolve(t), undefined, () => {
      // A failed load is the only case for a stand-in (rule 26): a flat grey texture.
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d'); if (g) { g.fillStyle = '#6b7178'; g.fillRect(0, 0, 4, 4); }
      resolve(new THREE.CanvasTexture(c));
    });
  });
}

export async function preloadTextures(onProgress?: (done: number, total: number) => void): Promise<void> {
  const urls: [string, string][] = [...TEX_IDS.map((id) => [id, `art/tex/${id}.jpg`] as [string, string]), ['sky', 'art/sky.jpg']];
  let done = 0;
  await Promise.all(urls.map(async ([id, url]) => {
    if (!cache.has(id)) {
      const t = await load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      cache.set(id, t);
    }
    done++; onProgress?.(done, urls.length);
  }));
}

/** A texture by id, optionally a repeat-adjusted clone. */
export function tex(id: TexId | 'sky', repeat?: [number, number]): THREE.Texture {
  let t = cache.get(id);
  if (!t) {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    t = new THREE.CanvasTexture(c);
    cache.set(id, t);
  }
  if (!repeat) return t;
  const k = `${id}@${repeat[0]}x${repeat[1]}`;
  let r = cache.get(k);
  if (!r) { r = t.clone(); r.repeat.set(repeat[0], repeat[1]); r.needsUpdate = true; cache.set(k, r); }
  return r;
}

export const texturesReady = (): boolean => TEX_IDS.every((id) => cache.has(id));
