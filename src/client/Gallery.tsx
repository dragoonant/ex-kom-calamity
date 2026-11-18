// ?gallery: every figure role of docs/figures.md section 2 in a row, each beside a head-height ruler, with the
// measurements of the built mesh against the section 1 table (gates of section 4) and the state of its GLB slot
// (KB recipe step 7: the gallery close-up check; rule 26: a GLB is preloaded, never stood in for). The same
// FigureModel the board uses draws each cell, so what passes here is what the playable shows.
import { Canvas } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EveningLights, EVENING } from './board/Scene';
import { CorePulse } from './board/Effects';
import { FigureModel, GATES, HEAD, NO_RAYCAST, gateOf, humanoidRole, measureFigure, measureParts, type Measure } from './board/placeholders';
import { FIGURE_H } from './board/world';
import { FIGURE_ROLES, FIGURE_SLOTS, modelStateOf, type FigureRole } from './models';

const SPACING = 2.0;
const RULER_HEADS = 2.8;

interface Row {
  role: FigureRole;
  measure: Measure;
}

function Ruler() {
  // Rungs at every head-height behind the figure, the 2.8-head line in coral.
  const rungs: number[] = [];
  for (let h = 1; h <= 3; h++) rungs.push(h * HEAD);
  return (
    <group position={[0, 0, -0.5]}>
      <mesh raycast={NO_RAYCAST} position={[0, (RULER_HEADS * HEAD) / 2, 0]}>
        <boxGeometry args={[0.03, RULER_HEADS * HEAD, 0.03]} />
        <meshBasicMaterial color="#5a6066" />
      </mesh>
      {rungs.map((y) => (
        <mesh key={y} raycast={NO_RAYCAST} position={[0, y, 0]}>
          <boxGeometry args={[1.2, 0.02, 0.02]} />
          <meshBasicMaterial color="#5a6066" />
        </mesh>
      ))}
      <mesh raycast={NO_RAYCAST} position={[0, RULER_HEADS * HEAD, 0]}>
        <boxGeometry args={[1.4, 0.03, 0.03]} />
        <meshBasicMaterial color="#d9533f" />
      </mesh>
      <mesh raycast={NO_RAYCAST} position={[0, -0.03, 0.5]}>
        <boxGeometry args={[1.6, 0.06, 1.6]} />
        <meshStandardMaterial color="#efe6cf" />
      </mesh>
    </group>
  );
}

function Cell({ role, index, onMeasure }: { role: FigureRole; index: number; onMeasure: (role: FigureRole, m: Measure) => void }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    // A placeholder is measured from its parts (each part's real geometry); a loaded GLB from its named nodes.
    if (modelStateOf(role) === 'ready' && ref.current) onMeasure(role, measureFigure(ref.current));
    else onMeasure(role, measureParts(role));
  });
  return (
    <group position={[(index - (FIGURE_ROLES.length - 1) / 2) * SPACING, 0, 0]}>
      <Ruler />
      <group ref={ref}>
        <FigureModel role={role} />
      </group>
    </group>
  );
}

function pct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`;
}
function heads(x: number | null): string {
  return x === null ? 'n/a' : `${x.toFixed(2)} heads`;
}
function mark(ok: boolean | null): string {
  return ok === null ? '' : ok ? ' PASS' : ' FAIL';
}

export function Gallery() {
  const [rows, setRows] = useState<Record<string, Measure>>({});
  const onMeasure = (role: FigureRole, m: Measure) => {
    setRows((r) => {
      const old = r[role];
      if (old && Math.abs(old.height - m.height) < 1e-6 && old.headShare === m.headShare && old.shoulders === m.shoulders && old.legs === m.legs) return r;
      return { ...r, [role]: m };
    });
  };
  const list: Row[] = useMemo(() => FIGURE_ROLES.filter((r) => rows[r]).map((r) => ({ role: r, measure: rows[r]! })), [rows]);
  const passes = list.filter((r) => humanoidRole(r.role) && gateOf(r.measure, r.role).pass).length;
  return (
    <div className="gallery" data-testid="gallery">
      <div className="gallery-canvas">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ fov: 30, near: 0.1, far: 100, position: [0, 1.6, 13.5] }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor(EVENING.clear);
            camera.lookAt(0, 0.7, 0);
          }}
        >
          <EveningLights />
          <CorePulse />
          <Suspense fallback={null}>
            {FIGURE_ROLES.map((role, i) => (
              <Cell key={role} role={role} index={i} onMeasure={onMeasure} />
            ))}
          </Suspense>
        </Canvas>
      </div>
      <div className="console gallery-console">
        <div className="console-bead" />
        <div className="panel-title">FIGURE GALLERY: {FIGURE_ROLES.length} roles, measured {list.length}, humanoid gates passed {passes}/{FIGURE_ROLES.filter(humanoidRole).length}</div>
        <div className="hint">
          Targets (docs/figures.md section 1): height about {RULER_HEADS} heads; head {GATES.headShare[0] * 100} to {GATES.headShare[1] * 100}% of height; shoulders {GATES.shoulders[0]} to {GATES.shoulders[1]} heads wide; legs at most {GATES.legsMax} heads. Aliens are measured and judged by eye against the D14 references. A GLB slot reads &quot;placeholder&quot; until the GPU pass fills it.
        </div>
        <table className="report-table num gallery-table" data-testid="gallery-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Height</th>
              <th>Head share</th>
              <th>Shoulders</th>
              <th>Legs</th>
              <th>Gate</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>
            {FIGURE_ROLES.map((role) => {
              const m = rows[role];
              const g = m ? gateOf(m, role) : null;
              const slot = FIGURE_SLOTS[role];
              const state = modelStateOf(role);
              return (
                <tr key={role} data-testid={`gallery-row-${role}`} className={g && !g.pass ? 'gallery-fail' : ''}>
                  <th>
                    {slot.label}
                    <div className="hint">{slot.templates.join(', ')}</div>
                  </th>
                  <td>{m ? `${(m.height / FIGURE_H).toFixed(2)} figure units, ${m.headShare ? (1 / m.headShare).toFixed(1) : 'n/a'} heads` : 'measuring'}</td>
                  <td>{m ? pct(m.headShare) + mark(g!.headShare) : ''}</td>
                  <td>{m ? heads(m.shoulders) + mark(g!.shoulders) : ''}</td>
                  <td>{m ? heads(m.legs) + mark(g!.legs) : ''}</td>
                  <td data-testid={`gallery-gate-${role}`}>{g ? (humanoidRole(role) ? (g.pass ? 'PASS' : 'FAIL') : 'by eye') : ''}</td>
                  <td data-testid={`gallery-model-${role}`}>
                    {state}
                    {slot.url ? ` (${slot.url})` : ' (slot: public/models/' + role + '.glb)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="switch-row">
          <a className="toggle" href="./" data-testid="gallery-back">
            BACK TO THE CONSOLE
          </a>
          <a className="toggle" href="./sounds.html" data-testid="gallery-sounds">
            SOUNDS
          </a>
        </div>
      </div>
    </div>
  );
}
