// A name board over each building's main street door (docs/art/tile-set.md section 3): an enamel panel with the
// building's name (MAP-8 `buildings[].name`, a placeholder per PLAN.md D10) in the display face's wide caps, lit
// faintly at evening. Dressing only: no handler and no raycast (KB rule 25). It hangs on the storey above the
// street, so it shows once that storey is drawn (the cut-away above the street level).
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAPS, type BuildingDef } from '../../data';
import type { State, Tile } from '../../engine';
import { useClient } from '../store';
import { buildingIndex, outsideOf } from './tileset';
import { LEVEL_H } from './world';

const NO_RAYCAST = () => undefined;

interface Sign {
  key: string;
  text: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  accent: string;
}

const ACCENT: Record<string, string> = { residential: '#3f7f82', office: '#d9a62e', bank: '#2f5f62', depot: '#d9533f', automat: '#d9533f' };

/** The street door nearest the middle of its facade, per building, and the board's place over it. */
export function signsFor(state: Pick<State, 'tiles' | 'width' | 'depth'>, buildings: readonly BuildingDef[], idx: ReturnType<typeof buildingIndex>): Sign[] {
  const out: Sign[] = [];
  for (const b of buildings) {
    let best: { t: Tile; dir: [number, number]; score: number } | null = null;
    for (let y = b.y; y < b.y + b.d; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const t = state.tiles[y * state.width + x];
        if (!t || t.kind !== 'door') continue;
        const dir = outsideOf(state, idx, t);
        if (!dir) continue;
        // Offset from the middle of the side the door is on, as a share of that side.
        const score = dir[0] === 0 ? Math.abs(x + 0.5 - (b.x + b.w / 2)) / b.w : Math.abs(y + 0.5 - (b.y + b.d / 2)) / b.d;
        if (!best || score < best.score) best = { t, dir, score };
      }
    if (!best) continue;
    const text = b.name.split(',')[0]!.trim().toUpperCase();
    const side = best.dir[0] === 0 ? b.w : b.d;
    out.push({
      key: b.id,
      text,
      x: best.t.x + 0.5 + best.dir[0] * 0.7,
      y: LEVEL_H + 0.32,
      z: best.t.y + 0.5 + best.dir[1] * 0.7,
      yaw: Math.atan2(best.dir[0], best.dir[1]),
      width: Math.min(side - 1, Math.max(3, text.length * 0.34)),
      accent: ACCENT[b.style ?? 'residential'] ?? '#3f7f82',
    });
  }
  return out;
}

function signTexture(text: string, accent: string, aspect: number): THREE.CanvasTexture {
  const h = 128;
  const w = Math.round(h * aspect);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const r = 22;
  g.fillStyle = '#efe6cf';
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#8d959b';
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(18, h - 30, w - 36, 8);
  g.fillRect(18, 22, w - 36, 4);
  g.fillStyle = '#2b2f33';
  const display = getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif';
  let size = 64;
  g.font = `600 ${size}px ${display}`;
  // Wide caps: letter-spaced where the browser can, shrunk to fit either way.
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '6px';
  while (g.measureText(text).width > w - 60 && size > 20) {
    size -= 2;
    g.font = `600 ${size}px ${display}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 - 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function SignBoard({ sign }: { sign: Sign }) {
  const height = 0.62;
  const material = useMemo(() => {
    const tex = signTexture(sign.text, sign.accent, sign.width / height);
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#fff2d0'), emissiveIntensity: 0.35, roughness: 0.5 });
  }, [sign.text, sign.accent, sign.width]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  return (
    <group position={[sign.x, sign.y, sign.z]} rotation={[0, sign.yaw, 0]}>
      <mesh raycast={NO_RAYCAST} position={[0, 0, -0.03]} castShadow>
        <boxGeometry args={[sign.width + 0.12, height + 0.12, 0.06]} />
        <meshStandardMaterial color="#8d959b" roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh raycast={NO_RAYCAST} material={material} position={[0, 0, 0.012]}>
        <planeGeometry args={[sign.width, height]} />
      </mesh>
    </group>
  );
}

export function Signs({ state }: { state: State }) {
  const active = useClient((s) => s.level);
  const map = MAPS[state.mapId];
  const signs = useMemo(() => (map?.buildings?.length ? signsFor(state, map.buildings, buildingIndex(map)) : []), [map]); // eslint-disable-line react-hooks/exhaustive-deps
  if (active < 1 || state.levels < 2) return null;
  return (
    <group name="signs">
      {signs.map((s) => (
        <SignBoard key={s.key} sign={s} />
      ))}
    </group>
  );
}
