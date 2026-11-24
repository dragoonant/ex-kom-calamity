// Pooled effects drawn from the presenter's fx list: muzzle flashes, tracers, sparks, explosions, smoke, thrown-off
// parts, ejecting pilots and floating damage numbers (a DOM layer positioned each frame).
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { fxList, type Fx } from '../presenter';
import { live, screenOf } from './world';

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,150,0.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function smokeTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(70,70,70,0.75)'); gr.addColorStop(1, 'rgba(60,60,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const POOL = 160;

export function FxLayer() {
  const { group, sprites, smokes, tracers, debris, floats } = useMemo(() => {
    const group = new THREE.Group();
    const glow = glowTexture(), smoke = smokeTexture();
    const sprites = Array.from({ length: POOL }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; group.add(s); return s; });
    const smokes = Array.from({ length: POOL }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, depthWrite: false, transparent: true })); s.visible = false; group.add(s); return s; });
    const tracers = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; group.add(m); return m; });
    const debris = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#3d454d', roughness: 0.7, metalness: 0.5 })); m.visible = false; m.castShadow = true; group.add(m); return m; });
    group.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
    const floats = document.createElement('div');
    floats.className = 'fx-floats';
    return { group, sprites, smokes, tracers, debris, floats };
  }, []);
  useEffect(() => {
    const host = live.canvas?.parentElement ?? document.body;
    host.appendChild(floats);
    return () => { floats.remove(); };
  }, [floats]);

  useFrame(() => {
    let si = 0, mi = 0, ti = 0, di = 0;
    const spans = floats.children;
    let fi = 0;
    const sprite = (p: THREE.Vector3, size: number, op: number, color = '#ffffff') => { const s = sprites[si++]; if (!s) return; s.visible = true; s.position.copy(p); s.scale.setScalar(size); s.material.opacity = op; s.material.color.set(color); };
    const puff = (p: THREE.Vector3, size: number, op: number, color = '#555') => { const s = smokes[mi++]; if (!s) return; s.visible = true; s.position.copy(p); s.scale.setScalar(size); s.material.opacity = op; s.material.color.set(color); };
    for (const f of fxList as Fx[]) {
      const k = f.t / f.dur;
      const size = f.size ?? 0.3;
      switch (f.kind) {
        case 'flash': sprite(f.a, size * (1.4 - k), 1 - k); break;
        case 'tracer': {
          const m = tracers[ti++]; if (!m) break;
          const head = f.a.clone().lerp(f.b, Math.min(1, k * 1.15));
          const tail = f.a.clone().lerp(f.b, Math.max(0, k * 1.15 - 0.35));
          m.visible = true; m.position.copy(head).lerp(tail, 0.5); m.lookAt(head);
          m.scale.set(1, 1, Math.max(0.01, head.distanceTo(tail)));
          (m.material as THREE.MeshBasicMaterial).color.set(f.color ?? '#ffd27a');
          break;
        }
        case 'shell': {
          const p = f.a.clone().lerp(f.b, k); p.y += Math.sin(k * Math.PI) * Math.max(1.5, f.a.distanceTo(f.b) * 0.45);
          sprite(p, 0.18, 0.9, '#ffcf8a');
          if (Math.floor(f.t * 30) % 2 === 0) puff(p, 0.18, 0.35 * (1 - k));
          break;
        }
        case 'spark': for (let i = 0; i < 6; i++) { const ang = i * 1.05 + f.id; const p = f.a.clone().add(new THREE.Vector3(Math.cos(ang) * k * size, Math.sin(i * 2.1) * k * size + k * 0.1, Math.sin(ang) * k * size)); sprite(p, 0.07 * (1 - k) + 0.02, 1 - k, '#ffd9a0'); } break;
        case 'boom': sprite(f.a, size * (0.6 + k * 1.4), Math.max(0, 1 - k * 1.3), '#ffb060'); puff(f.a.clone().add(new THREE.Vector3(0, k * 0.4, 0)), size * (0.6 + k * 1.8), 0.65 * (1 - k)); break;
        case 'smoke': for (let i = 0; i < 4; i++) { const q = ((f.t * 0.6 + i * 0.25) % 1); puff(f.a.clone().add(new THREE.Vector3(Math.sin(i * 2.3) * 0.12 + q * 0.2, q * 1.4, Math.cos(i * 1.7) * 0.12)), size * (0.5 + q * 1.2), 0.5 * (1 - q) * (1 - k * k)); } break;
        case 'dust': puff(f.a.clone().add(new THREE.Vector3(0, k * 0.2, 0)), size * (0.6 + k * 1.5), 0.5 * (1 - k), f.color ?? '#7a6e62'); break;
        case 'heal': for (let i = 0; i < 4; i++) sprite(f.a.clone().add(new THREE.Vector3(Math.sin(f.t * 20 + i) * 0.15, (i * 0.08 + k * 0.3), Math.cos(f.t * 17 + i) * 0.15)), 0.08, 1 - k, '#bff0c0'); break;
        case 'eject': { const p = f.a.clone().lerp(f.b, Math.sqrt(k)); sprite(p, 0.12, 1 - k, '#ffcf8a'); puff(p.clone().add(new THREE.Vector3(0, -0.15, 0)), 0.2, 0.5 * (1 - k)); break; }
        case 'debris': {
          const m = debris[di++]; if (!m) break;
          const p = f.a.clone().lerp(f.b, k); p.y = f.a.y + 2.2 * k - 3.2 * k * k; if (p.y < 0.08) p.y = 0.08;
          m.visible = true; m.position.copy(p); m.rotation.set(k * 9, k * 6, k * 4);
          break;
        }
        case 'float': {
          const s = screenOf(f.a.clone().add(new THREE.Vector3(0, k * 0.5, 0)));
          let el = spans[fi] as HTMLElement | undefined;
          if (!el) { el = document.createElement('span'); floats.appendChild(el); }
          fi++;
          if (!s) { el.style.display = 'none'; break; }
          el.style.display = 'block'; el.textContent = f.text ?? ''; el.style.color = f.color ?? '#fff';
          const r = floats.getBoundingClientRect();
          el.style.transform = `translate(${s.x - r.left}px, ${s.y - r.top}px) translate(-50%, -50%)`;
          el.style.opacity = String(Math.min(1, (1 - k) * 2));
          break;
        }
      }
    }
    for (; si < sprites.length; si++) sprites[si]!.visible = false;
    for (; mi < smokes.length; mi++) smokes[mi]!.visible = false;
    for (; ti < tracers.length; ti++) tracers[ti]!.visible = false;
    for (; di < debris.length; di++) debris[di]!.visible = false;
    for (let i = fi; i < spans.length; i++) (spans[i] as HTMLElement).style.display = 'none';
  });
  return <primitive object={group} />;
}
