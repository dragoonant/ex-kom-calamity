// Procedural city buildings in the D11 register (enamel cream, teal, mustard, graphite, chrome; agency red and
// black), shaped after the round 9 concept picks (docs/art/city-art.md: office s41, bank s55, broadcast s45,
// apartments s48, power s49, HQ s51). Each building merges into two geometries: a body with vertex colours and a
// window layer the scene lights at night, so the whole city is about fifty draws. Pure: no React here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingKind } from '../../data/city';

export const CELL = 4;
export const FLOOR_H = 1.5;

export const PAL = {
  enamel: '#e7dcc1',
  cream: '#f1e8d2',
  teal: '#2f7f7a',
  tealLight: '#5fa8a0',
  mustard: '#d2a23a',
  graphite: '#3b3f44',
  chrome: '#c9cdd1',
  red: '#c8322a',
  black: '#1b1b1f',
  roof: '#8d8577',
  glass: '#2a3a46',
};

export function cellCentre(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x * CELL + CELL / 2, 0, y * CELL + CELL / 2);
}

type Part = THREE.BufferGeometry;

function coloured(g: THREE.BufferGeometry, colour: string): Part {
  const c = new THREE.Color(colour);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) {
    const m = out.getAttribute('position').count;
    const a2 = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      a2[i * 3] = c.r;
      a2[i * 3 + 1] = c.g;
      a2[i * 3 + 2] = c.b;
    }
    out.setAttribute('color', new THREE.BufferAttribute(a2, 3));
    return out;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, colour: string): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return coloured(g, colour);
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, colour: string, seg = 16): Part {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y + h / 2, z);
  return coloured(g, colour);
}

function sphere(r: number, x: number, y: number, z: number, colour: string, half = false): Part {
  const g = new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
  g.translate(x, y, z);
  return coloured(g, colour);
}

/** Rounded slab: a box with two half-cylinder ends along x (the streamline look). */
function slab(w: number, h: number, d: number, x: number, y: number, z: number, colour: string): Part[] {
  const r = d / 2;
  const core = Math.max(0.01, w - d);
  return [box(core, h, d, x, y, z, colour), cyl(r, r, h, x - core / 2, y, z, colour, 14), cyl(r, r, h, x + core / 2, y, z, colour, 14)];
}

/** Window bands around a block: thin emissive strips just outside each face. */
function bands(w: number, d: number, y0: number, floors: number, x = 0, z = 0): Part[] {
  const out: Part[] = [];
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FLOOR_H + FLOOR_H * 0.35;
    const h = FLOOR_H * 0.38;
    out.push(box(w * 0.86, h, 0.04, x, y, z + d / 2 + 0.02, '#ffffff'));
    out.push(box(w * 0.86, h, 0.04, x, y, z - d / 2 - 0.02, '#ffffff'));
    out.push(box(0.04, h, d * 0.86, x + w / 2 + 0.02, y, z, '#ffffff'));
    out.push(box(0.04, h, d * 0.86, x - w / 2 - 0.02, y, z, '#ffffff'));
  }
  return out;
}

export interface BuildingGeo {
  body: THREE.BufferGeometry;
  windows: THREE.BufferGeometry;
  height: number;
}

/** One building's two geometries, centred on its cell's centre at the origin. */
export function buildingGeometry(kind: BuildingKind | 'hq', floors: number, variant: number): BuildingGeo {
  const body: Part[] = [];
  const win: Part[] = [];
  const W = CELL * 0.7;
  const H = Math.max(1, floors) * FLOOR_H;
  let height = H;
  const accent = variant % 2 === 0 ? PAL.teal : PAL.mustard;
  // a plinth for every lot
  body.push(box(CELL * 0.76, 0.14, CELL * 0.76, 0, 0, 0, PAL.roof));
  switch (kind) {
    case 'office': {
      const tiers = Math.max(2, floors + 1);
      let y = 0.12;
      for (let t = 0; t < tiers; t++) {
        const s = 1 - t * 0.18;
        const h = (H * 1.6) / tiers;
        body.push(...slab(W * s, h, W * 0.8 * s, 0, y, 0, t === 0 ? accent : PAL.enamel));
        win.push(...bands(W * s * 0.98, W * 0.8 * s, y, Math.max(1, Math.round(h / FLOOR_H))));
        y += h;
      }
      body.push(cyl(0.05, 0.12, 1.6, 0, y, 0, PAL.chrome, 8));
      height = y + 1.6;
      break;
    }
    case 'bank': {
      const h = H * 0.9;
      body.push(box(W, 0.3, W * 0.9, 0, 0.12, 0, PAL.enamel));
      body.push(box(W * 0.84, h, W * 0.62, 0, 0.42, -W * 0.1, PAL.enamel));
      for (let i = 0; i < 6; i++) body.push(cyl(0.11, 0.11, h, -W * 0.38 + (i * W * 0.76) / 5, 0.42, W * 0.32, PAL.cream, 10));
      body.push(box(W * 1.02, 0.28, W * 0.92, 0, 0.42 + h, 0, PAL.graphite));
      body.push(box(W * 0.7, 0.3, W * 0.5, 0, 0.7 + h, -W * 0.1, accent));
      win.push(...bands(W * 0.84, W * 0.62, 0.42, Math.max(1, floors - 1), 0, -W * 0.1));
      height = h + 1;
      break;
    }
    case 'broadcast': {
      body.push(...slab(W, H, W * 0.7, 0, 0.12, 0, PAL.enamel));
      body.push(box(W * 1.04, 0.2, W * 0.74, 0, 0.12 + H, 0, accent));
      const mast = H * 2.2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const g = new THREE.CylinderGeometry(0.03, 0.06, mast, 4);
        g.translate(Math.cos(a) * 0.18, 0.32 + H + mast / 2, Math.sin(a) * 0.18);
        body.push(coloured(g, PAL.red));
      }
      body.push(sphere(0.22, 0, 0.32 + H + mast, 0, PAL.chrome));
      win.push(...bands(W, W * 0.7, 0.12, floors));
      height = H + mast;
      break;
    }
    case 'residential': {
      const h = H * 1.4;
      body.push(...slab(W, h, W * 0.75, 0, 0.12, 0, PAL.cream));
      const n = Math.max(2, Math.round(h / FLOOR_H));
      for (let f = 1; f < n; f++) body.push(box(W * 1.08, 0.08, W * 0.9, 0, 0.12 + (f * h) / n, 0, PAL.teal));
      body.push(box(W * 0.6, 0.16, W * 0.5, 0, 0.12 + h, 0, '#6f8f5f'));
      win.push(...bands(W, W * 0.75, 0.12, n));
      height = h + 0.3;
      break;
    }
    case 'power': {
      body.push(box(W * 1.1, H * 0.8, W * 0.6, 0, 0.12, W * 0.12, PAL.enamel));
      body.push(cyl(W * 0.55, W * 0.55, W * 0.6, 0, 0.12 + H * 0.8 - W * 0.3, W * 0.12, PAL.graphite, 16));
      for (const sx of [-0.28, 0.28]) {
        body.push(cyl(0.2, 0.28, H * 2.2, W * sx, 0.12, -W * 0.36, PAL.enamel, 12));
        body.push(cyl(0.29, 0.29, 0.14, W * sx, 0.12 + H * 1.6, -W * 0.36, PAL.red, 12));
      }
      win.push(...bands(W * 1.1, W * 0.6, 0.12, Math.max(1, floors - 1), 0, W * 0.12));
      height = H * 2.3;
      break;
    }
    case 'automat': {
      body.push(...slab(W * 1.05, FLOOR_H * 1.1, W * 0.7, 0, 0.12, 0, PAL.cream));
      body.push(box(W * 1.1, 0.3, W * 0.78, 0, 0.12 + FLOOR_H * 1.1, 0, PAL.mustard));
      body.push(box(0.12, 1.1, 0.7, W * 0.45, 0.12 + FLOOR_H * 1.1, 0, PAL.red));
      win.push(...bands(W * 1.05, W * 0.7, 0.12, 1));
      height = FLOOR_H * 1.1 + 1.2;
      break;
    }
    case 'depot': {
      body.push(box(W * 1.1, H * 0.8, W * 0.8, 0, 0.12, 0, PAL.graphite));
      const roof = new THREE.CylinderGeometry(W * 0.4, W * 0.4, W * 1.1, 16, 1, false, 0, Math.PI);
      roof.rotateZ(Math.PI / 2);
      roof.translate(0, 0.12 + H * 0.8, 0);
      body.push(coloured(roof, PAL.tealLight));
      body.push(box(W * 0.4, H * 0.5, 0.06, 0, 0.12, W * 0.41, PAL.mustard));
      win.push(...bands(W * 1.1, W * 0.8, 0.12 + H * 0.4, 1));
      height = H * 0.8 + W * 0.4;
      break;
    }
    case 'civic': {
      body.push(box(W, H, W * 0.8, 0, 0.12, 0, PAL.enamel));
      body.push(cyl(W * 0.3, W * 0.34, 0.5, 0, 0.12 + H, 0, accent, 16));
      body.push(sphere(W * 0.3, 0, 0.62 + H, 0, PAL.chrome, true));
      win.push(...bands(W, W * 0.8, 0.12, floors));
      height = H + 0.62 + W * 0.3;
      break;
    }
    case 'works': {
      body.push(box(W * 1.1, H * 0.9, W * 0.8, 0, 0.12, 0, PAL.enamel));
      for (let i = 0; i < 3; i++) {
        const g = new THREE.CylinderGeometry(0.01, W * 0.22, W * 0.8, 3, 1);
        g.rotateX(Math.PI / 2);
        g.rotateZ(Math.PI);
        g.translate(-W * 0.36 + i * W * 0.36, 0.12 + H * 0.9 + 0.1, 0);
        body.push(coloured(g, PAL.graphite));
      }
      body.push(cyl(0.14, 0.2, H * 1.8, W * 0.45, 0.12, -W * 0.3, PAL.red, 10));
      win.push(...bands(W * 1.1, W * 0.8, 0.12, Math.max(1, floors)));
      height = H * 1.8;
      break;
    }
    case 'hq': {
      body.push(...slab(W * 1.05, H * 1.2, W * 0.85, 0, 0.12, 0, PAL.cream));
      body.push(box(W * 1.1, 0.18, W * 0.95, 0, 0.12, 0, PAL.red));
      body.push(cyl(W * 0.42, W * 0.42, 0.12, 0, 0.12 + H * 1.2, 0, PAL.red, 24));
      body.push(cyl(W * 0.3, W * 0.3, 0.13, 0, 0.12 + H * 1.2, 0, PAL.black, 24));
      body.push(cyl(W * 0.26, W * 0.26, 0.14, 0, 0.12 + H * 1.2, 0, PAL.red, 24));
      win.push(...bands(W * 1.05, W * 0.85, 0.12, Math.round((H * 1.2) / FLOOR_H)));
      height = H * 1.2 + 0.3;
      break;
    }
  }
  return { body: mergeGeometries(body, false)!, windows: mergeGeometries(win, false)!, height };
}
