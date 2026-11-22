// Small shared pieces for set dressing: one instanced mesh from a list of placements, a unit box standing on
// the ground, and the soft round sprite every glow uses. No pointer handlers (KB rule 25).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const noRay = () => null;

export interface Item {
  x: number;
  y?: number;
  z: number;
  sx?: number;
  sy?: number;
  sz?: number;
  ry?: number;
  colour?: string;
}

/** One instanced mesh from a list of placements; per-instance colour when any item names one. */
export function Inst({ geo, mat, items, cast = false, receive = false }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Item[]; cast?: boolean; receive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry ?? 0);
      t.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
      m.setMatrixAt(i, t);
      if (it.colour) m.setColorAt(i, c.set(it.colour));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} raycast={noRay} castShadow={cast} receiveShadow={receive} />;
}

export function unitBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** A soft round sprite for every glow on the board (lamps, car lights). */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

