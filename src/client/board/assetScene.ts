// A round 10 asset's scene for code that builds its meshes imperatively or must not suspend (the agency's cars, the
// alien craft, the civilian traffic): the hook returns null until the slot's file is preloaded and parsed, and the
// caller keeps drawing its procedural piece meanwhile and for good if the file fails (KB rule 26).
import { useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PRELOADED_BYTES, useAssetUrl } from '../models';
import { boxOf, fitScene, type FitOptions, type Fitted } from './glbFit';

const parsed = new Map<string, Promise<THREE.Object3D>>();

/** Parses a url once, from the bytes the preload kept (never a second read of the disk cache), else from the network. */
export function loadAssetScene(url: string): Promise<THREE.Object3D> {
  let p = parsed.get(url);
  if (!p) {
    const bytes = PRELOADED_BYTES.get(url);
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    p = (bytes ? new GLTFLoader().parseAsync(bytes.slice(0), base) : new GLTFLoader().loadAsync(url)).then((g) => g.scene);
    parsed.set(url, p);
  }
  return p;
}

/** The slot's scene once it is ready, else null. */
export function useAssetScene(id: string): THREE.Object3D | null {
  const url = useAssetUrl(id);
  const [scene, setScene] = useState<{ url: string; scene: THREE.Object3D } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadAssetScene(url)
      .then((s) => {
        if (live) setScene({ url, scene: s });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);
  return url && scene?.url === url ? scene.scene : null;
}

/** The slot's model fitted into the box of `procedural` (the piece it replaces), or null while it is not ready. */
export function useFittedAsset(id: string, procedural: THREE.BufferGeometry | THREE.Box3, opts: Omit<FitOptions, 'box'> = {}): Fitted | null {
  const scene = useAssetScene(id);
  return useMemo(() => {
    if (!scene) return null;
    const box = 'isBox3' in procedural ? procedural : boxOf(procedural);
    return fitScene(scene, { ...opts, box });
  }, [scene, procedural]); // eslint-disable-line react-hooks/exhaustive-deps
}
