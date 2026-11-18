// The units on the board, drawn from view(state, 'agency') only, so an unrevealed host is a citizen (HIDE-1).
// Bodies come from placeholders.tsx (stand-ins to docs/figures.md, or a rigged GLB once the manifest has one, KB rule
// 26). No pointer handlers and no raycast anywhere here (KB rule 25): a figure never blocks a tap on the tile
// behind it. Movement between tiles is smoothed for the eye only; every position is the engine's.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Pos, State, Unit } from '../../engine';
import { useClient } from '../store';
import type { FigureRole } from '../models';
import { COLOURS, FigureModel, NO_RAYCAST } from './placeholders';
import { FIGURE_H, LEVEL_H, tileToWorld } from './world';

/** The figure role a unit in the agency's view is drawn with (docs/figures.md section 2). */
export function roleOf(u: Unit): FigureRole {
  if (u.side === 'agency') return u.template === 'agent-t2' ? 'agent-t2' : 'agent-t1';
  if (u.template === 'taker') return 'taker';
  if (u.template === 'fighter') return 'fighter';
  if (u.template === 'host') return 'host-revealed'; // the view already turned an unrevealed host into a citizen
  return 'citizen';
}

/** Smoothed positions of the drawn figures, read by the instanced hp bars each frame. */
const shownPositions = new Map<string, THREE.Vector3>();

function Figure({ unit, selected }: { unit: Unit; selected: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = tileToWorld(unit);
  const shown = useRef(target.clone());
  const facing = useRef(0);
  const role = roleOf(unit);
  shownPositions.set(unit.id, shown.current);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const s = shown.current;
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    if (Math.abs(dx) + Math.abs(dz) + Math.abs(target.y - s.y) > 0.002) {
      if (Math.hypot(dx, dz) > 0.05) facing.current = Math.atan2(dx, dz);
      const k = 1 - Math.exp(-dt * 9);
      s.lerp(target, Math.hypot(dx, dz) > 3 ? 1 : k);
    }
    g.position.copy(s);
    g.rotation.y = facing.current;
    g.rotation.x = unit.down ? -Math.PI / 2 : 0;
  });

  return (
    <group ref={group} position={target}>
      {selected && (
        <mesh raycast={NO_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.36, 0.46, 32]} />
          <meshBasicMaterial color={COLOURS.agencyPlate} />
        </mesh>
      )}
      <group position={[0, unit.down ? 0.12 : 0, 0]}>
        <FigureModel role={role} down={unit.down} />
      </group>
    </group>
  );
}

const BAR_BOX = new THREE.BoxGeometry(1, 1, 1);
const BAR_BACK = new THREE.MeshBasicMaterial({ color: '#1b1b1f' });
const BAR_FILL = new THREE.MeshBasicMaterial();
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const COL = new THREE.Color();

/** Every standing unit's hp bar in two instanced draws (KB recipe step 9: count draws). hp and maxHp are engine fields (VIEW-2). */
function HpBars({ units }: { units: Unit[] }) {
  const back = useRef<THREE.InstancedMesh>(null);
  const fill = useRef<THREE.InstancedMesh>(null);
  const capacity = useMemo(() => Math.max(1, units.length), [units.length]);
  useFrame(() => {
    const b = back.current;
    const f = fill.current;
    if (!b || !f) return;
    let n = 0;
    for (const u of units) {
      if (u.down) continue;
      const p = shownPositions.get(u.id);
      if (!p) continue;
      const frac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
      M.compose(V.set(p.x, p.y + FIGURE_H + 0.18, p.z), Q, S.set(0.6, 0.06, 0.02));
      b.setMatrixAt(n, M);
      M.compose(V.set(p.x - (0.6 * (1 - frac)) / 2, p.y + FIGURE_H + 0.18, p.z + 0.011), Q, S.set(Math.max(0.01, 0.6 * frac), 0.045, 0.01));
      f.setMatrixAt(n, M);
      f.setColorAt(n, COL.set(frac > 0.6 ? '#4caf6a' : frac > 0.3 ? '#e0a030' : '#d9342b'));
      n += 1;
    }
    b.count = n;
    f.count = n;
    b.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh key={`b${capacity}`} ref={back} args={[BAR_BOX, BAR_BACK, capacity]} raycast={NO_RAYCAST} frustumCulled={false} />
      <instancedMesh key={`f${capacity}`} ref={fill} args={[BAR_BOX, BAR_FILL, capacity]} raycast={NO_RAYCAST} frustumCulled={false} />
    </group>
  );
}

function OrderMarks({ unit }: { unit: Unit }) {
  if (!unit.order) return null;
  const pts: [number, number, number][] = [];
  const here = tileToWorld(unit);
  pts.push([here.x, here.y + 0.1, here.z]);
  for (const p of unit.order.path) {
    const w = tileToWorld(p);
    pts.push([w.x, w.y + 0.1, w.z]);
  }
  const dest = tileToWorld(unit.order.to);
  return (
    <group>
      <Line points={pts} color="#e4b43a" lineWidth={2} raycast={NO_RAYCAST} />
      <mesh raycast={NO_RAYCAST} position={[dest.x, dest.y + 0.3, dest.z]}>
        <coneGeometry args={[0.14, 0.4, 4]} />
        <meshBasicMaterial color="#e4b43a" />
      </mesh>
    </group>
  );
}

export function Figures({ state }: { state: State }) {
  const selected = useClient((s) => s.selected);
  const level = useClient((s) => s.level);
  const drawn = state.units.filter((u) => u.level <= level);
  return (
    <group>
      {drawn.map((u) => (
        <Figure key={u.id} unit={u} selected={u.id === selected} />
      ))}
      <HpBars units={drawn} />
      {state.units
        .filter((u) => u.side === 'agency' && !u.down && u.order && u.level <= level)
        .map((u) => (
          <OrderMarks key={`o-${u.id}`} unit={u} />
        ))}
    </group>
  );
}

export function unitHeadWorld(u: Pos): THREE.Vector3 {
  const v = tileToWorld(u);
  v.y += FIGURE_H;
  return v;
}

export { LEVEL_H };
