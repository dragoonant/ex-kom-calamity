// Placeholder figures to docs/figures.md section 3: a 1.2-unit figure, head 35% of height, shoulders 1.8 heads
// wide, legs one head long. No pointer handlers and no raycast anywhere here (KB rule 25): a figure never
// blocks a tap on the tile behind it. Drawn from view(state, 'agency') only, so an unrevealed host is a citizen.
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Pos, State, Unit } from '../../engine';
import { useClient } from '../store';
import { FIGURE_H, LEVEL_H, tileToWorld } from './world';

const NO_RAYCAST = () => undefined;

const HEAD = FIGURE_H * 0.35; // head height and diameter
const LEG = HEAD; // legs one head long
const TORSO = FIGURE_H - HEAD - LEG;
const SHOULDER = HEAD * 1.8;

const COLOURS = {
  agencyPlate: '#c8322a',
  agencyUnder: '#1b1b1f',
  visor: '#0b0b0d',
  citizenCoat: '#e7dcc1',
  citizenDark: '#3b3f44',
  skin: '#d9b08c',
  hostSkin: '#7fc8b0',
  amber: '#e0a030',
  takerBody: '#5aa88f',
  chitin: '#23312c',
  down: '#6b6b6b',
};

function kindOf(u: Unit): 'agent' | 'citizen' | 'host' | 'taker' {
  if (u.side === 'agency') return 'agent';
  if (u.template === 'taker') return 'taker';
  if (u.template === 'host') return 'host';
  return 'citizen';
}

function Humanoid({ kind, down }: { kind: 'agent' | 'citizen' | 'host'; down: boolean }) {
  const plate = down ? COLOURS.down : kind === 'agent' ? COLOURS.agencyPlate : COLOURS.citizenCoat;
  const under = down ? '#4a4a4a' : kind === 'agent' ? COLOURS.agencyUnder : COLOURS.citizenDark;
  const head = down ? COLOURS.down : kind === 'agent' ? COLOURS.agencyPlate : kind === 'host' ? COLOURS.hostSkin : COLOURS.skin;
  return (
    <group>
      {/* legs: short and thick */}
      <mesh raycast={NO_RAYCAST} position={[-SHOULDER * 0.22, LEG / 2, 0]}>
        <boxGeometry args={[SHOULDER * 0.34, LEG, HEAD * 0.5]} />
        <meshStandardMaterial color={under} roughness={0.9} />
      </mesh>
      <mesh raycast={NO_RAYCAST} position={[SHOULDER * 0.22, LEG / 2, 0]}>
        <boxGeometry args={[SHOULDER * 0.34, LEG, HEAD * 0.5]} />
        <meshStandardMaterial color={under} roughness={0.9} />
      </mesh>
      {/* torso: very broad armoured shoulders */}
      <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO / 2, 0]}>
        <boxGeometry args={[SHOULDER, TORSO, HEAD * 0.6]} />
        <meshStandardMaterial color={plate} roughness={0.7} metalness={kind === 'agent' ? 0.15 : 0} />
      </mesh>
      {/* arms */}
      <mesh raycast={NO_RAYCAST} position={[-SHOULDER / 2 - HEAD * 0.14, LEG + TORSO * 0.45, 0]}>
        <boxGeometry args={[HEAD * 0.28, TORSO * 0.95, HEAD * 0.35]} />
        <meshStandardMaterial color={under} roughness={0.9} />
      </mesh>
      <mesh raycast={NO_RAYCAST} position={[SHOULDER / 2 + HEAD * 0.14, LEG + TORSO * 0.45, 0]}>
        <boxGeometry args={[HEAD * 0.28, TORSO * 0.95, HEAD * 0.35]} />
        <meshStandardMaterial color={under} roughness={0.9} />
      </mesh>
      {/* head or helmet: 35% of the height */}
      <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO + HEAD / 2, 0]}>
        <sphereGeometry args={[HEAD / 2, 16, 12]} />
        <meshStandardMaterial color={head} roughness={0.6} />
      </mesh>
      {kind === 'agent' && !down && (
        <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO + HEAD * 0.55, HEAD * 0.4]}>
          <boxGeometry args={[HEAD * 0.7, HEAD * 0.22, HEAD * 0.25]} />
          <meshStandardMaterial color={COLOURS.visor} roughness={0.2} metalness={0.4} />
        </mesh>
      )}
      {kind === 'host' && !down && (
        <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO - HEAD * 0.05, HEAD * 0.28]}>
          <sphereGeometry args={[HEAD * 0.14, 10, 8]} />
          <meshStandardMaterial color={COLOURS.amber} emissive={COLOURS.amber} emissiveIntensity={0.8} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

function Taker({ down }: { down: boolean }) {
  const body = down ? COLOURS.down : COLOURS.takerBody;
  const legs = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  return (
    <group>
      {legs.map((a) => (
        <mesh key={a} raycast={NO_RAYCAST} position={[Math.sin(a) * 0.22, LEG * 0.55, Math.cos(a) * 0.22]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]}>
          <cylinderGeometry args={[0.03, 0.05, LEG * 1.1, 6]} />
          <meshStandardMaterial color={COLOURS.chitin} roughness={0.5} />
        </mesh>
      ))}
      <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO * 0.6, 0]}>
        <cylinderGeometry args={[0.16, 0.2, TORSO * 1.2 + HEAD * 0.4, 10]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.1} />
      </mesh>
      {!down && (
        <mesh raycast={NO_RAYCAST} position={[0, LEG + TORSO * 0.7, 0.14]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color={COLOURS.amber} emissive={COLOURS.amber} emissiveIntensity={1} />
        </mesh>
      )}
    </group>
  );
}

function Figure({ unit, selected }: { unit: Unit; selected: boolean }) {
  const group = useRef<THREE.Group>(null);
  const target = tileToWorld(unit);
  const shown = useRef(target.clone());
  const facing = useRef(0);
  const kind = kindOf(unit);
  const tps = 10; // visual smoothing only; the engine's tick rate is in state.tuning and read by the loop
  void tps;

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
    if (unit.down) g.rotation.x = -Math.PI / 2;
    else g.rotation.x = 0;
  });

  return (
    <group ref={group} position={target}>
      {selected && (
        <mesh raycast={NO_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.36, 0.46, 32]} />
          <meshBasicMaterial color={COLOURS.agencyPlate} />
        </mesh>
      )}
      <group position={[0, unit.down ? 0.12 : 0, 0]}>{kind === 'taker' ? <Taker down={unit.down} /> : <Humanoid kind={kind} down={unit.down} />}</group>
      {!unit.down && <HpBar unit={unit} />}
    </group>
  );
}

function HpBar({ unit }: { unit: Unit }) {
  // hp and maxHp are engine fields (VIEW-2 shows them); no maths beyond the bar's width.
  const frac = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
  const colour = frac > 0.6 ? '#4caf6a' : frac > 0.3 ? '#e0a030' : '#d9342b';
  return (
    <group position={[0, FIGURE_H + 0.18, 0]}>
      <mesh raycast={NO_RAYCAST}>
        <boxGeometry args={[0.6, 0.06, 0.02]} />
        <meshBasicMaterial color="#1b1b1f" />
      </mesh>
      <mesh raycast={NO_RAYCAST} position={[-(0.6 * (1 - frac)) / 2, 0, 0.011]}>
        <boxGeometry args={[Math.max(0.01, 0.6 * frac), 0.045, 0.01]} />
        <meshBasicMaterial color={colour} />
      </mesh>
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
  return (
    <group>
      {state.units
        .filter((u) => u.level <= level)
        .map((u) => (
          <Figure key={u.id} unit={u} selected={u.id === selected} />
        ))}
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
