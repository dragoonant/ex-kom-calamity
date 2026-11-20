// The figure placeholders (docs/figures.md sections 1 to 3), shared by the board (Figures.tsx) and the gallery
// (?gallery): a 1.2-unit figure of about 2.8 head-heights, the head or helmet 35% of the standing height, armoured
// shoulders 1.8 heads wide, legs one head long. Each figure is a table of named parts (head, torso, leg, arm, ...)
// merged into ONE vertex-coloured geometry, so a figure is one draw call plus its amber core; the gallery measures
// the parts' real bounding boxes, not these constants (KB rule 13: check the image, not the prompt). No pointer
// handlers and no raycast anywhere here (KB rule 25). Alien cores share CORE_MATERIAL so one uniform pulses them all.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Detailed, useGLTF } from '@react-three/drei';
import { CORE_MATERIAL, coreGlowMaterial } from './Effects';
import { FIGURE_SLOTS, LOD_DISTANCE, lodUrlOf, useModelState, type FigureRole, type RenderGate } from '../models';
import { FIGURE_H } from './world';

export const NO_RAYCAST = () => undefined;

export const HEAD = FIGURE_H * 0.35; // head height and diameter
export const LEG = HEAD; // legs one head long
export const TORSO = FIGURE_H - HEAD - LEG;
export const SHOULDER = HEAD * 1.8;

export const COLOURS = {
  agencyPlate: '#c8322a',
  agencyEdge: '#e4574c',
  agencyUnder: '#1b1b1f',
  visor: '#0b0b0d',
  lens: '#2a6a74',
  citizenCoat: '#e7dcc1',
  citizenDark: '#3b3f44',
  skin: '#d9b08c',
  hair: '#3a2a22',
  hostSkin: '#7fc8b0',
  coral: '#c96a5a',
  amber: '#e0a030',
  takerBody: '#5aa88f',
  seaGlassDeep: '#3f8a74',
  chitin: '#23312c',
  down: '#6b6b6b',
};

export type Shape = 'box' | 'sphere' | 'cyl' | 'cone';

/** One named part of a figure, in figure units; the figure stands on y = 0 and faces +z. */
export interface FigurePart {
  name: string;
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Euler rotation applied before the translation. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** A yaw applied to the finished part about the figure's axis (legs around a body). */
  spin?: number;
  colour: string;
  /** The amber core: drawn as its own mesh with the shared pulsing material. */
  core?: boolean;
}

const P = (name: string, shape: Shape, x: number, y: number, z: number, sx: number, sy: number, sz: number, colour: string, extra: Partial<FigurePart> = {}): FigurePart => ({ name, shape, x, y, z, sx, sy, sz, colour, ...extra });

const C = COLOURS;

/** The humanoid body to section 1 (short thick legs, broad armoured torso, head 35% of the height) in a dress. */
function humanoid(kind: 'agent-t1' | 'agent-t2' | 'citizen' | 'host-revealed'): FigurePart[] {
  const agent = kind === 'agent-t1' || kind === 'agent-t2';
  const host = kind === 'host-revealed';
  const plate = agent ? C.agencyPlate : C.citizenCoat;
  const under = agent ? C.agencyUnder : C.citizenDark;
  const headCol = agent ? C.agencyPlate : host ? C.hostSkin : C.skin;
  const legW = SHOULDER * 0.34;
  const headW = HEAD * 0.92;
  const parts: FigurePart[] = [
    // legs: short and thick; boots a shade apart
    P('leg', 'box', -SHOULDER * 0.2, LEG * 0.55, 0, legW, LEG * 0.9, HEAD * 0.52, under),
    P('leg', 'box', SHOULDER * 0.2, LEG * 0.55, 0, legW, LEG * 0.9, HEAD * 0.52, under),
    P('boot', 'box', -SHOULDER * 0.2, LEG * 0.08, HEAD * 0.04, legW * 1.05, LEG * 0.16, HEAD * 0.62, agent ? C.agencyEdge : under),
    P('boot', 'box', SHOULDER * 0.2, LEG * 0.08, HEAD * 0.04, legW * 1.05, LEG * 0.16, HEAD * 0.62, agent ? C.agencyEdge : under),
    // torso: the full shoulder width is 1.8 heads, pauldrons inside it
    P('torso', 'box', 0, LEG + TORSO / 2, 0, SHOULDER * 0.86, TORSO, HEAD * 0.62, plate),
    P('belt', 'box', 0, LEG + TORSO * 0.1, 0, SHOULDER * 0.8, TORSO * 0.16, HEAD * 0.66, under),
    // arms hang beside the torso, hands in dark gloves
    P('arm', 'box', -SHOULDER * 0.5 + HEAD * 0.12, LEG + TORSO * 0.45, 0, HEAD * 0.24, TORSO * 0.82, HEAD * 0.34, agent ? plate : under),
    P('arm', 'box', SHOULDER * 0.5 - HEAD * 0.12, LEG + TORSO * 0.45, 0, HEAD * 0.24, TORSO * 0.82, HEAD * 0.34, agent ? plate : under),
    P('hand', 'box', -SHOULDER * 0.5 + HEAD * 0.12, LEG + TORSO * 0.04, HEAD * 0.08, HEAD * 0.22, TORSO * 0.14, HEAD * 0.28, under),
    P('hand', 'box', SHOULDER * 0.5 - HEAD * 0.12, LEG + TORSO * 0.04, HEAD * 0.08, HEAD * 0.22, TORSO * 0.14, HEAD * 0.28, under),
    // head or helmet: 35% of the height
    P('head', kind === 'agent-t2' ? 'sphere' : 'box', 0, LEG + TORSO + HEAD / 2, 0, headW, HEAD, headW, headCol),
  ];
  if (agent) {
    parts.push(
      // shoulder plates: their outer edge is the 1.8-head shoulder line; red over black, no silver, no chest light (D7)
      P('pauldron', 'box', -SHOULDER * 0.5 + SHOULDER * 0.13, LEG + TORSO * 0.9, 0, SHOULDER * 0.26, TORSO * 0.24, HEAD * 0.7, C.agencyEdge),
      P('pauldron', 'box', SHOULDER * 0.5 - SHOULDER * 0.13, LEG + TORSO * 0.9, 0, SHOULDER * 0.26, TORSO * 0.24, HEAD * 0.7, C.agencyEdge),
      P('seam', 'box', 0, LEG + TORSO * 0.55, HEAD * 0.3, SHOULDER * 0.08, TORSO * 0.5, HEAD * 0.06, C.agencyUnder),
      // the weapon held low along the right thigh (section 1 pose)
      P('weapon', 'box', SHOULDER * 0.5 - HEAD * 0.12, LEG * 0.7, HEAD * 0.2, HEAD * 0.12, HEAD * 0.14, HEAD * 0.9, C.agencyUnder),
    );
  } else {
    parts.push(P('lapel', 'box', 0, LEG + TORSO * 0.7, HEAD * 0.29, SHOULDER * 0.26, TORSO * 0.5, HEAD * 0.08, under));
  }
  if (kind === 'agent-t1') {
    parts.push(
      // tier 1: a squared helmet with one black visor band, a jaw guard and a red brim
      P('visor', 'box', 0, LEG + TORSO + HEAD * 0.58, HEAD * 0.4, HEAD * 0.72, HEAD * 0.22, HEAD * 0.16, C.visor),
      P('jaw', 'box', 0, LEG + TORSO + HEAD * 0.2, HEAD * 0.32, HEAD * 0.6, HEAD * 0.22, HEAD * 0.28, C.agencyUnder),
      P('brim', 'box', 0, LEG + TORSO + HEAD * 0.78, HEAD * 0.2, headW, HEAD * 0.08, HEAD * 0.6, C.agencyEdge),
    );
  } else if (kind === 'agent-t2') {
    parts.push(
      // tier 2 (chrome-suit-t2-h2, D7): smooth shell, two upward-slanting almond lenses, an engraved mouth line, a thin crown fin
      P('lens', 'sphere', -HEAD * 0.2, LEG + TORSO + HEAD * 0.58, HEAD * 0.4, HEAD * 0.3, HEAD * 0.12, HEAD * 0.14, C.lens, { rz: 0.5 }),
      P('lens', 'sphere', HEAD * 0.2, LEG + TORSO + HEAD * 0.58, HEAD * 0.4, HEAD * 0.3, HEAD * 0.12, HEAD * 0.14, C.lens, { rz: -0.5 }),
      P('mouth', 'box', 0, LEG + TORSO + HEAD * 0.3, HEAD * 0.45, HEAD * 0.3, HEAD * 0.03, HEAD * 0.06, C.agencyUnder),
      P('fin', 'box', 0, LEG + TORSO + HEAD * 0.9, -HEAD * 0.05, HEAD * 0.05, HEAD * 0.26, HEAD * 0.6, C.agencyEdge),
    );
  } else if (kind === 'citizen') {
    parts.push(
      // bare head, stern: a hair cap and a brow line
      P('hair', 'box', 0, LEG + TORSO + HEAD * 0.84, -HEAD * 0.04, headW, HEAD * 0.32, headW, C.hair),
      P('brow', 'box', 0, LEG + TORSO + HEAD * 0.62, HEAD * 0.44, HEAD * 0.5, HEAD * 0.05, HEAD * 0.06, C.hair),
    );
  } else {
    parts.push(
      // revealed host: sea-glass skin, the amber core at the throat, branching coral on the crown (D14)
      P('core', 'sphere', 0, LEG + TORSO + HEAD * 0.02, HEAD * 0.3, HEAD * 0.3, HEAD * 0.3, HEAD * 0.3, C.amber, { core: true }),
      P('coral', 'cone', -HEAD * 0.25, LEG + TORSO + HEAD * 1.0, 0, HEAD * 0.16, HEAD * 0.36, HEAD * 0.16, C.coral, { rz: 0.5 }),
      P('coral', 'cone', HEAD * 0.2, LEG + TORSO + HEAD * 1.02, HEAD * 0.1, HEAD * 0.14, HEAD * 0.4, HEAD * 0.14, C.coral, { rx: 0.2, rz: -0.4 }),
      P('coral', 'cone', 0, LEG + TORSO + HEAD * 0.98, -HEAD * 0.25, HEAD * 0.12, HEAD * 0.3, HEAD * 0.12, C.coral, { rx: -0.5 }),
      P('brow', 'box', 0, LEG + TORSO + HEAD * 0.62, HEAD * 0.44, HEAD * 0.5, HEAD * 0.05, HEAD * 0.06, C.seaGlassDeep),
    );
  }
  return parts;
}

/** The taker (D14): a low sea-glass body with an amber core on six dark chitin legs, a biting head low in front. */
function taker(): FigurePart[] {
  const bodyY = LEG * 0.9;
  const parts: FigurePart[] = [];
  for (const spin of [0.5, 1.4, 2.4, 3.9, 4.9, 5.8]) {
    parts.push(P('leg', 'cyl', 0.2, bodyY * 0.75, 0, 0.05, LEG * 0.6, 0.05, C.chitin, { rz: -0.9, spin }));
    parts.push(P('leg', 'cyl', 0.36, bodyY * 0.35, 0, 0.04, LEG * 0.8, 0.04, C.chitin, { rz: 0.5, spin }));
  }
  parts.push(
    P('torso', 'sphere', 0, bodyY, -0.04, 0.46, 0.34, 0.6, C.takerBody),
    P('head', 'sphere', 0, bodyY * 0.85, 0.34, 0.3, 0.24, 0.34, C.takerBody),
    P('jaw', 'cone', -0.08, bodyY * 0.72, 0.5, 0.06, 0.18, 0.06, C.chitin, { rx: 1.4, rz: 0.3 }),
    P('jaw', 'cone', 0.08, bodyY * 0.72, 0.5, 0.06, 0.18, 0.06, C.chitin, { rx: 1.4, rz: -0.3 }),
    P('ridge', 'box', 0, bodyY + 0.16, -0.1, 0.1, 0.06, 0.5, C.chitin),
    P('core', 'sphere', 0, bodyY + 0.02, 0.1, 0.18, 0.18, 0.18, C.amber, { core: true }),
  );
  return parts;
}

/** The fighter (gemini-alien-fighter-a, D14): a headless sea-glass column on three long chitin stilt legs, four coral whip arms, the core at mid-height. */
function fighter(): FigurePart[] {
  const legH = FIGURE_H * 0.6;
  const colH = FIGURE_H * 0.75;
  const parts: FigurePart[] = [];
  for (const spin of [Math.PI / 6, Math.PI / 6 + (Math.PI * 2) / 3, Math.PI / 6 + (Math.PI * 4) / 3]) {
    parts.push(P('leg', 'cyl', 0.24, legH * 0.5, 0, 0.05, legH * 1.1, 0.05, C.chitin, { rz: 0.42, spin }));
    parts.push(P('knee', 'sphere', 0.33, legH * 0.72, 0, 0.09, 0.09, 0.09, C.chitin, { spin }));
    parts.push(P('foot', 'cone', 0.5, 0.06, 0, 0.1, 0.12, 0.1, C.chitin, { rx: Math.PI, spin }));
  }
  parts.push(
    P('torso', 'cyl', 0, legH + colH / 2, 0, 0.34, colH, 0.34, C.takerBody),
    P('cap', 'sphere', 0, legH + colH, 0, 0.34, 0.14, 0.34, C.seaGlassDeep),
    P('band', 'cyl', 0, legH + colH * 0.3, 0, 0.38, 0.06, 0.38, C.chitin),
  );
  for (const spin of [0.4, Math.PI / 2 + 0.4, Math.PI + 0.4, (Math.PI * 3) / 2 + 0.4]) {
    const y = legH + colH * 0.8;
    parts.push(P('arm', 'cyl', 0.3, y + 0.1, 0, 0.05, 0.6, 0.05, C.coral, { rz: -1.2, spin }));
    parts.push(P('arm', 'cyl', 0.62, y - 0.1, 0, 0.035, 0.5, 0.035, C.coral, { rz: -0.5, spin }));
    parts.push(P('tip', 'cone', 0.74, y - 0.38, 0, 0.05, 0.16, 0.05, C.coral, { rx: Math.PI, spin }));
  }
  parts.push(P('core', 'sphere', 0, legH + colH * 0.5, 0.2, 0.2, 0.2, 0.2, C.amber, { core: true }));
  return parts;
}

/** The parts of every role (docs/figures.md section 2). A hidden host is the citizen (HIDE-1). */
export const FIGURE_PARTS: Record<FigureRole, FigurePart[]> = {
  'agent-t1': humanoid('agent-t1'),
  'agent-t2': humanoid('agent-t2'),
  citizen: humanoid('citizen'),
  'host-hidden': humanoid('citizen'),
  'host-revealed': humanoid('host-revealed'),
  taker: taker(),
  fighter: fighter(),
};

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
};

/** The part's geometry placed in figure space (so a bounding box of it is the part's measure). */
export function partGeometry(p: FigurePart): THREE.BufferGeometry {
  const g = UNIT[p.shape].clone();
  g.scale(p.sx, p.sy, p.sz);
  if (p.rx) g.rotateX(p.rx);
  if (p.ry) g.rotateY(p.ry);
  if (p.rz) g.rotateZ(p.rz);
  g.translate(p.x, p.y, p.z);
  if (p.spin) g.rotateY(p.spin);
  return g;
}

function coloured(g: THREE.BufferGeometry, colour: string): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(colour);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

const bodyCache = new Map<FigureRole, THREE.BufferGeometry>();

/** One merged, vertex-coloured geometry per role: the whole figure but its core. */
export function figureGeometry(role: FigureRole): THREE.BufferGeometry {
  const hit = bodyCache.get(role);
  if (hit) return hit;
  const gs = FIGURE_PARTS[role].filter((p) => !p.core).map((p) => coloured(partGeometry(p), p.colour));
  const merged = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  if (!merged) throw new Error(`figure ${role} did not merge`);
  bodyCache.set(role, merged);
  return merged;
}

export const FIGURE_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.12 });
export const DOWN_MATERIAL = new THREE.MeshStandardMaterial({ color: COLOURS.down, roughness: 0.9 });
const CORE_GEO = new THREE.SphereGeometry(0.5, 12, 10);

/** The placeholder for a role: one body mesh (grey when down) and its core, if any. */
export function Placeholder({ role, down = false }: { role: FigureRole; down?: boolean }) {
  const geometry = useMemo(() => figureGeometry(role), [role]);
  const cores = FIGURE_PARTS[role].filter((p) => p.core);
  return (
    <group>
      <mesh name="body" raycast={NO_RAYCAST} geometry={geometry} material={down ? DOWN_MATERIAL : FIGURE_MATERIAL} />
      {!down &&
        cores.map((p, i) => (
          <mesh key={i} name="core" raycast={NO_RAYCAST} geometry={CORE_GEO} material={CORE_MATERIAL} position={[p.x, p.y, p.z]} scale={[p.sx, p.sy, p.sz]} />
        ))}
    </group>
  );
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type Drawn = 'glb' | 'placeholder';

function Gltf({ url, name, onDrawn }: { url: string; name: string; onDrawn?: (what: Drawn) => void }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.name = name;
    s.traverse((o) => {
      o.raycast = NO_RAYCAST; // KB rule 25
    });
    return s;
  }, [gltf, name]);
  useEffect(() => {
    onDrawn?.('glb');
  }, [onDrawn, scene]);
  return <primitive object={scene} />;
}

/** The pulsing glow over a generated figure's painted core (hidden when the figure is down, like the stand-ins' cores). */
export function CoreGlow({ role }: { role: FigureRole }) {
  const glow = FIGURE_SLOTS[role].glow;
  if (!glow) return null;
  return <sprite name="glow" raycast={NO_RAYCAST} material={coreGlowMaterial()} position={[glow.x, glow.y, glow.z]} scale={[glow.size, glow.size, 1]} />;
}

function PlaceholderDrawn({ role, down, onDrawn }: { role: FigureRole; down: boolean; onDrawn?: (what: Drawn) => void }) {
  useEffect(() => {
    onDrawn?.('placeholder');
  }, [onDrawn]);
  return <Placeholder role={role} down={down} />;
}

/**
 * The figure for a role: the preloaded GLB when the manifest has one and it loaded (never shown while loading,
 * KB rule 26: `Suspense fallback={null}`), else the placeholder. A GLB that fails at render falls back too.
 * `detail="auto"` (the board) draws the 8k LOD beyond LOD_DISTANCE when it loaded; `"full"` (the gallery) always
 * draws the full model. `onDrawn` reports which of the two the cell really shows, for the gallery's table.
 */
export function FigureModel({ role, down = false, detail = 'auto', onDrawn }: { role: FigureRole; down?: boolean; detail?: 'auto' | 'full'; onDrawn?: (what: Drawn) => void }) {
  const state = useModelState(role); // re-read when the preload lands, so a figure mounted early still gets its GLB
  const url = FIGURE_SLOTS[role].url;
  if (!url || state !== 'ready') return <PlaceholderDrawn role={role} down={down} onDrawn={onDrawn} />;
  const lod = detail === 'auto' ? lodUrlOf(role) : null;
  return (
    <ModelBoundary fallback={<PlaceholderDrawn role={role} down={down} onDrawn={onDrawn} />}>
      <Suspense fallback={null}>
        {lod ? (
          <Detailed distances={[0, LOD_DISTANCE]} raycast={NO_RAYCAST}>
            <Gltf url={url} name="glb" onDrawn={onDrawn} />
            <Gltf url={lod} name="glb-lod" />
          </Detailed>
        ) : (
          <Gltf url={url} name="glb" onDrawn={onDrawn} />
        )}
        {!down && <CoreGlow role={role} />}
      </Suspense>
    </ModelBoundary>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Measurement (docs/figures.md section 1 table; the gates of section 4).

export interface Measure {
  height: number;
  /** Head height over the standing height. */
  headShare: number | null;
  /** Shoulder width (torso and shoulder plates) in head widths. */
  shoulders: number | null;
  /** Leg length (legs and boots) in head heights. */
  legs: number | null;
  /** Which parts were found; a GLB without named nodes reports what it can. */
  found: string[];
}

export const GATES = { headShare: [0.3, 0.4], shoulders: [1.6, 2.0], legsMax: 1.2 } as const;
const HEAD_NAMES = ['head', 'helmet', 'skull'];
const TORSO_NAMES = ['torso', 'chest', 'pauldron', 'shoulder'];
const LEG_NAMES = ['leg', 'thigh', 'shin', 'boot'];

function measure(height: number, head: THREE.Box3 | null, torso: THREE.Box3 | null, leg: THREE.Box3 | null): Measure {
  const found: string[] = [];
  if (head) found.push('head');
  if (torso) found.push('torso');
  if (leg) found.push('legs');
  const headH = head ? head.max.y - head.min.y : null;
  const headW = head ? head.max.x - head.min.x : null;
  return {
    height,
    headShare: headH !== null && height > 0 ? headH / height : null,
    shoulders: torso && headW ? (torso.max.x - torso.min.x) / headW : null,
    legs: leg && headH ? (leg.max.y - leg.min.y) / headH : null,
    found,
  };
}

/** Measures a placeholder from its parts' geometry (what is drawn, not the constants). */
export function measureParts(role: FigureRole): Measure {
  const parts = FIGURE_PARTS[role];
  const all = new THREE.Box3();
  const by = (names: string[]) => {
    const b = new THREE.Box3();
    let any = false;
    for (const p of parts) {
      if (!names.some((n) => p.name.includes(n))) continue;
      const g = partGeometry(p);
      g.computeBoundingBox();
      b.union(g.boundingBox!);
      any = true;
    }
    return any ? b : null;
  };
  for (const p of parts) {
    const g = partGeometry(p);
    g.computeBoundingBox();
    all.union(g.boundingBox!);
  }
  return measure(all.max.y - all.min.y, by(HEAD_NAMES), by(TORSO_NAMES), by(LEG_NAMES));
}

function unionBox(root: THREE.Object3D, names: string[]): THREE.Box3 | null {
  const box = new THREE.Box3();
  let any = false;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && names.some((n) => o.name.toLowerCase().includes(n))) {
      box.union(new THREE.Box3().setFromObject(o));
      any = true;
    }
  });
  return any ? box : null;
}

/**
 * Measures a built object (a loaded GLB) by its named nodes. A generated figure is one unnamed mesh, so when the nodes
 * are missing the pipeline's gate on the orthographic render (`FIGURE_SLOTS[role].gate`, docs/art/figure-models.md
 * section 4) fills the ratios and `found` says so; the height is always the mesh's own.
 */
export function measureFigure(root: THREE.Object3D, gate: RenderGate | null = null): Measure {
  root.updateWorldMatrix(true, true);
  const all = new THREE.Box3().setFromObject(root);
  const m = measure(all.max.y - all.min.y, unionBox(root, HEAD_NAMES), unionBox(root, TORSO_NAMES), unionBox(root, LEG_NAMES));
  if (m.found.length === 0 && gate) {
    return { ...m, headShare: gate.headShare, shoulders: gate.shoulders, legs: gate.legs, found: ['render gate'] };
  }
  return m;
}

/** Which roles the section 1 table gates; aliens are measured but judged by eye against the D14 references. */
export function humanoidRole(role: FigureRole): boolean {
  return role !== 'taker' && role !== 'fighter';
}

export interface Gate {
  headShare: boolean | null;
  shoulders: boolean | null;
  legs: boolean | null;
  pass: boolean;
  /** What the gate column says: PASS, FAIL, by eye (creatures), or the ruling a generated figure passed under. */
  verdict: string;
}

/**
 * The gate for a measure. A placeholder is held to the section 1 bands; a generated figure measured by the render gate
 * carries its own verdict and ruling (the host passes against its reference under RULING HOST-1, creatures are recorded
 * under CREATURE-1), so the bands are shown but the pipeline's verdict decides.
 */
export function gateOf(m: Measure, role: FigureRole, gate: RenderGate | null = null): Gate {
  if (gate && m.found.includes('render gate')) {
    if (gate.mode === 'house') {
      // RULING GATE-1: the bands are checked with 5% on their edges (29.9% and 2.03 heads pass).
      const tol = 0.05;
      const headShare = m.headShare === null ? null : m.headShare >= GATES.headShare[0] * (1 - tol) && m.headShare <= GATES.headShare[1] * (1 + tol);
      const shoulders = m.shoulders === null ? null : m.shoulders >= GATES.shoulders[0] * (1 - tol) && m.shoulders <= GATES.shoulders[1] * (1 + tol);
      const legs = m.legs === null ? null : m.legs <= GATES.legsMax * (1 + tol);
      const pass = gate.verdict === 'pass' && headShare === true && shoulders === true && legs === true;
      return { headShare, shoulders, legs, pass, verdict: `${pass ? 'PASS' : 'FAIL'} (render, ${gate.ruling})` };
    }
    if (gate.mode === 'reference') return { headShare: null, shoulders: null, legs: null, pass: gate.verdict === 'pass', verdict: `${gate.verdict === 'pass' ? 'PASS' : 'FAIL'} vs reference (${gate.ruling})` };
    return { headShare: null, shoulders: null, legs: null, pass: true, verdict: `recorded, by eye (${gate.ruling})` };
  }
  if (!humanoidRole(role)) return { headShare: null, shoulders: null, legs: null, pass: true, verdict: 'by eye' };
  const headShare = m.headShare === null ? null : m.headShare >= GATES.headShare[0] && m.headShare <= GATES.headShare[1];
  const shoulders = m.shoulders === null ? null : m.shoulders >= GATES.shoulders[0] && m.shoulders <= GATES.shoulders[1];
  const legs = m.legs === null ? null : m.legs <= GATES.legsMax;
  const pass = headShare === true && shoulders === true && legs === true;
  return { headShare, shoulders, legs, pass, verdict: pass ? 'PASS' : 'FAIL' };
}
