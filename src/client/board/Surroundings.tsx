// The street around a raid site (set dressing only, as RULING MAP-9): the evening sky dome and fog, a pavement
// and a ring road around the map, a first row of low shops across the road, a taller second row, and the City of
// Tomorrow's towers on the horizon, their windows lit for the evening. It sits below and outside the board, takes
// no pointer (KB rule 25), and stays low near the map so the camera always sees over it.
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { HorizonFog, Skyline, SkyDome, eveningSky, skyAt, towerRing, type Tower } from './backdrop';
import { Inst, unitBox, type Item } from './instanced';
import { markWindows, patchWindows, windowUniforms } from './windows';

const noRay = () => null;
const PASTEL = ['#efe6cf', '#e9dcc0', '#dfe3d6', '#efdcc0', '#e6d8bf', '#d8e2dc'];
const ROOFS = ['#b3aa96', '#a9a08c', '#6f8f8c', '#b8b09c', '#c27a5c'];
const AWNING = ['#3f7f82', '#d9a62e', '#c86b4a'];
const LEAF = ['#6f9361', '#7fa06a', '#5f8a66', '#8aa36a'];

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distance from the pavement edge to the first row, and the rows' depths. */
const PAVE = 1.4;
const ROAD = 6;
const ROW1 = 4;
const GAP = 3;
const ROW2 = 6;

interface Row {
  walls: Item[];
  roofs: Item[];
  awnings: Item[];
  trees: Item[];
  crowns: Item[];
}

/**
 * Lays one row of buildings on all four sides of a rectangle: `inner` is the row's inside edge offset from the
 * map, `depth` its depth, `hMin`..`hMax` its height range.
 */
function ring(W: number, D: number, inner: number, depth: number, hMin: number, hMax: number, r: () => number, out: Row, shops: boolean): void {
  const sides: { x0: number; z0: number; len: number; alongX: boolean; out: number }[] = [
    { x0: -inner - depth, z0: -inner - depth, len: W + 2 * (inner + depth), alongX: true, out: -1 },
    { x0: -inner - depth, z0: D + inner, len: W + 2 * (inner + depth), alongX: true, out: 1 },
    { x0: -inner - depth, z0: -inner, len: D + 2 * inner, alongX: false, out: -1 },
    { x0: W + inner, z0: -inner, len: D + 2 * inner, alongX: false, out: 1 },
  ];
  for (const s of sides) {
    let t = 0;
    while (t < s.len - 1.5) {
      const w = Math.min(s.len - t, 3 + Math.floor(r() * 4));
      const gap = r() < 0.26;
      const along = t + w / 2;
      const cx = s.alongX ? s.x0 + along : s.x0 + depth / 2;
      const cz = s.alongX ? s.z0 + depth / 2 : s.z0 + along;
      if (gap) {
        // A pocket park between buildings.
        for (let k = 0; k < 2; k++) {
          const tx = cx + (r() - 0.5) * (s.alongX ? w - 1 : depth - 1.5);
          const tz = cz + (r() - 0.5) * (s.alongX ? depth - 1.5 : w - 1);
          const sc = 1.6 + r() * 0.8;
          out.trees.push({ x: tx, z: tz, sx: sc, sy: sc, sz: sc });
          out.crowns.push({ x: tx, z: tz, sx: sc, sy: sc, sz: sc, ry: r() * 6, colour: LEAF[Math.floor(r() * LEAF.length)] });
        }
      } else {
        const h = hMin + r() * (hMax - hMin);
        const sx = s.alongX ? w - 0.3 : depth;
        const sz = s.alongX ? depth : w - 0.3;
        out.walls.push({ x: cx, z: cz, sx, sy: h, sz, colour: PASTEL[Math.floor(r() * PASTEL.length)] });
        out.roofs.push({ x: cx, y: h, z: cz, sx: sx + 0.2, sy: 0.22, sz: sz + 0.2, colour: ROOFS[Math.floor(r() * ROOFS.length)] });
        if (shops) {
          // The awning faces the map.
          const off = -s.out * (depth / 2 + 0.45);
          const face = s.alongX ? { x: cx, z: cz + off, sx: sx * 0.86, sz: 0.9 } : { x: cx + off, z: cz, sx: 0.9, sz: sz * 0.86 };
          out.awnings.push({ x: face.x, y: 1.25, z: face.z, sx: face.sx, sy: 0.12, sz: face.sz, colour: AWNING[Math.floor(r() * AWNING.length)] });
        }
      }
      t += w;
    }
  }
}

export function Surroundings({ width, depth, night = false }: { width: number; depth: number; night?: boolean }) {
  // NIGHT-1: a night raid stands under the night sky, its windows lit; otherwise the fixed evening (RULING ART-1).
  const tone = useMemo(() => {
    const t = night ? skyAt(23) : eveningSky();
    t.ground.set(night ? '#1e222b' : '#8f8b7d');
    return t;
  }, [night]);
  const windows = useMemo(() => {
    const u = windowUniforms(1.1, 2.0, 0.45);
    u.uNight.value = 0.75;
    return u;
  }, []);
  const box = useMemo(() => markWindows(unitBox(), true), []);
  const plain = useMemo(() => markWindows(unitBox(), false), []);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5).translate(0, 0.3, 0), []);
  const crownGeo = useMemo(() => new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.85, 0), []);
  const wallMat = useMemo(() => patchWindows(new THREE.MeshLambertMaterial({ color: '#ffffff' }), windows, 'grid'), [windows]);
  const solid = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), []);
  const asphalt = useMemo(() => new THREE.MeshLambertMaterial({ color: '#5d6062' }), []);
  const paint = useMemo(() => new THREE.MeshLambertMaterial({ color: '#e8d9a8' }), []);
  const bark = useMemo(() => new THREE.MeshLambertMaterial({ color: '#6d5a48' }), []);
  const leaf = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), []);

  const W = width;
  const D = depth;
  const parts = useMemo(() => {
    const r = rng(W * 131 + D * 17);
    const row: Row = { walls: [], roofs: [], awnings: [], trees: [], crowns: [] };
    const near = PAVE + ROAD;
    ring(W, D, near + 1.2, ROW1, 1.9, 2.6, r, row, true);
    ring(W, D, near + 1.2 + ROW1 + GAP, ROW2, 2.6, 4.6, r, row, false);
    ring(W, D, near + 1.2 + ROW1 + GAP + ROW2 + GAP, 8, 3.6, 7.5, r, row, false);
    // Pavements: around the map and along the far side of the ring road.
    const pave: Item[] = [];
    const strip = (x0: number, z0: number, x1: number, z1: number) => pave.push({ x: (x0 + x1) / 2, y: -0.09, z: (z0 + z1) / 2, sx: x1 - x0, sy: 0.08, sz: z1 - z0, colour: '#c9c4b6' });
    const o1 = PAVE;
    strip(-o1, -o1, W + o1, 0);
    strip(-o1, D, W + o1, D + o1);
    strip(-o1, 0, 0, D);
    strip(W, 0, W + o1, D);
    const a = near;
    const b = near + 1.2 + ROW1 + GAP + ROW2 + GAP + 8 + 0.5;
    strip(-b, -b, W + b, -a);
    strip(-b, D + a, W + b, D + b);
    strip(-b, -a, -a, D + a);
    strip(W + a, -a, W + b, D + a);
    // The ring road's centre line, dashed.
    const dash: Item[] = [];
    const mid = PAVE + ROAD / 2;
    for (let x = -mid; x < W + mid; x += 2) {
      dash.push({ x, y: -0.075, z: -mid, sx: 1, sz: 0.1 });
      dash.push({ x, y: -0.075, z: D + mid, sx: 1, sz: 0.1 });
    }
    for (let z = -mid + 1; z < D + mid; z += 2) {
      dash.push({ x: -mid, y: -0.075, z, sx: 0.1, sz: 1 });
      dash.push({ x: W + mid, y: -0.075, z, sx: 0.1, sz: 1 });
    }
    // Street trees on the far pavement.
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const per = 2 * (W + D + 4 * a);
      let d = t * per;
      let x: number;
      let z: number;
      if (d < W + 2 * a) [x, z] = [-a + d, -a - 0.6];
      else if ((d -= W + 2 * a) < D + 2 * a) [x, z] = [W + a + 0.6, -a + d];
      else if ((d -= D + 2 * a) < W + 2 * a) [x, z] = [W + a - d, D + a + 0.6];
      else [x, z] = [-a - 0.6, D + a - (d - W - 2 * a)];
      const sc = 1.5 + r() * 0.6;
      row.trees.push({ x, y: -0.02, z, sx: sc, sy: sc, sz: sc });
      row.crowns.push({ x, y: -0.02, z, sx: sc, sy: sc, sz: sc, ry: k, colour: LEAF[k % LEAF.length] });
    }
    return { row, pave, dash };
  }, [W, D]);
  const far = useMemo<Tower[]>(
    () =>
      towerRing(W / 2, D / 2, Math.max(W, D) + 110, Math.max(W, D) + 260, 150, 9, (x, z) => x > -30 && x < W + 30 && z > -30 && z < D + 30).map((t) => ({ ...t, r: t.r * 1.5, h: t.h * 1.3 })),
    [W, D],
  );
  useFrame(() => {
    windows.uNight.value = night ? 1 : 0.75;
  });
  return (
    <group>
      <SkyDome tone={tone} />
      <HorizonFog tone={tone} near={90} far={320} />
      {/* Past the road the dome's own ground band is the land: no plane to shade under the board. */}
      <mesh position={[W / 2, -0.1, D / 2]} rotation={[-Math.PI / 2, 0, 0]} material={asphalt} raycast={noRay} renderOrder={9}>
        <planeGeometry args={[W + 2 * (PAVE + ROAD + 1.4), D + 2 * (PAVE + ROAD + 1.4)]} />
      </mesh>
      <Inst geo={plain} mat={solid} items={parts.pave} />
      <Inst geo={plane} mat={paint} items={parts.dash} />
      <Inst geo={box} mat={wallMat} items={parts.row.walls} />
      <Inst geo={plain} mat={solid} items={parts.row.roofs} />
      <Inst geo={plain} mat={solid} items={parts.row.awnings} />
      <Inst geo={trunkGeo} mat={bark} items={parts.row.trees} />
      <Inst geo={crownGeo} mat={leaf} items={parts.row.crowns} />
      <Skyline towers={far} windows={windows} />
    </group>
  );
}
