// The city board's DOM labels (no drei Html: its per-label React roots unmount during render under React 19).
// One overlay div beside the canvas holds every label; `LabelProjector`, inside the canvas, moves each one to its
// anchor's screen point every frame. Labels take no pointer (KB rule 25): the pick mesh takes every tap.
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { CITY } from '../../data/city';
import { cityQuery, type Band } from '../../city';
import { rig } from '../board/world';
import { CELL } from './cityMeshes';
import { useCity } from './store';
import { BAND_WORDS, buildingName, orgName } from './text';

/** Each lot's pick height, for the hook to aim a tap at a building's visible top (window.__ekcCity), and labels. */
export const lotHeights = new Map<string, number>();

/** The building under the pointer, from the pick mesh's hover. */
export const useHover = create<{ hovered: string | null; setHovered(id: string | null): void }>((set, get) => ({
  hovered: null,
  setHovered: (id) => {
    if (get().hovered !== id) set({ hovered: id });
  },
}));

interface Anchor {
  el: HTMLElement;
  pos: THREE.Vector3;
  /** Shown only with the camera at least this far out. */
  minDistance: number;
}
const anchors = new Map<string, Anchor>();

function useAnchor(key: string, pos: [number, number, number], minDistance = 0) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) anchors.set(key, { el, pos: new THREE.Vector3(...pos), minDistance });
      else anchors.delete(key);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pos[0], pos[1], pos[2], minDistance],
  );
}

/** Inside the canvas: puts every label on its anchor's screen point. */
export function LabelProjector() {
  const size = useThree((s) => s.size);
  const v = new THREE.Vector3();
  useFrame(({ camera }) => {
    for (const a of anchors.values()) {
      v.copy(a.pos).project(camera);
      const hidden = v.z > 1 || v.z < -1 || rig.distance < a.minDistance;
      a.el.style.opacity = hidden ? '0' : '1';
      if (hidden) continue;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

const BAND_COLOUR: Record<Band, string> = { clean: '#3fae63', low: '#d9a62e', some: '#d9533f', heavy: '#c8322a' };

function BuildingTag({ id, selected }: { id: string; selected: boolean }) {
  const view = useCity((s) => s.view);
  const def = CITY.buildings.find((b) => b.id === id);
  const h = lotHeights.get(id) ?? 2;
  const ref = useAnchor(`tag-${selected ? 'sel' : 'hover'}`, [def ? def.x * CELL + CELL / 2 : 0, h + 1.4, def ? def.y * CELL + CELL / 2 : 0]);
  if (!view || !def) return null;
  const row = cityQuery.board(view).find((b) => b.id === id);
  const watchers = view.agents.filter((a) => a.building === id);
  return (
    <div ref={ref} className={`city-tag ${selected ? 'city-tag-selected' : ''}`} data-testid={selected ? 'city-tag-selected' : 'city-tag-hover'}>
      <div className="city-tag-name">{buildingName(id)}</div>
      <div className="city-tag-line">
        {orgName(def.org)}
        {row?.turned ? ' · TURNED' : ''}
      </div>
      <div className="city-tag-line">
        {row?.band ? <span className="city-tag-band" style={{ background: BAND_COLOUR[row.band] }} /> : null}
        {row?.band ? BAND_WORDS[row.band] : 'No report yet'}
      </div>
      {watchers.length > 0 && <div className="city-tag-line">{watchers.map((a) => `${a.name} (${a.status === 'travelling' ? 'driving out' : 'watching'})`).join(', ')}</div>}
    </div>
  );
}

function DistrictLabel({ d }: { d: (typeof CITY.districts)[number] }) {
  const ref = useAnchor(`district-${d.id}`, [(d.x + d.w / 2) * CELL, 18, (d.y + d.d / 2) * CELL], 95);
  return (
    <div ref={ref} className="city-district">
      {d.name.toUpperCase()}
    </div>
  );
}

/** Beside the canvas: the label layer. */
export function CityLabels() {
  const selected = useCity((s) => s.selected);
  const hovered = useHover((s) => s.hovered);
  const isLot = (id: string | null) => !!id && CITY.buildings.some((b) => b.id === id);
  return (
    <div className="city-labels" aria-hidden="true">
      {CITY.districts.map((d) => (
        <DistrictLabel key={d.id} d={d} />
      ))}
      {isLot(hovered) && hovered !== selected && <BuildingTag key={`h-${hovered}`} id={hovered!} selected={false} />}
      {isLot(selected) && <BuildingTag key={`s-${selected}`} id={selected!} selected />}
    </div>
  );
}
