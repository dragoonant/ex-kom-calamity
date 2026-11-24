// KB rule 27, the mouse map: wheel zooms towards the cursor, right-drag rotates and tilts, middle-drag pans,
// left picks; left-drag pans until the first middle-button press shows the mouse has one (remembered in
// localStorage `ib-mouse`); preventDefault on a middle pointerdown (Windows autoscroll). Touch: one finger
// pans, two twist and pinch. WASD pans while held. A pan moves the view with the input: drag or press right
// looks further right. Picking itself lives on the tiles (rule 25), not here.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { applyRig, clampRig, groundAtScreen, lerpRig, live, readMouseMode, rememberThreeButton, rig, shot } from './world';


/** Moves the camera target by (right, back) in screen terms, in the camera's ground plane: +right is the camera's right, +back is towards the camera. */
function panView(right: number, back: number): void {
  const sy = Math.sin(rig.yaw);
  const cy = Math.cos(rig.yaw);
  rig.target.x += right * cy + back * sy;
  rig.target.z += -right * sy + back * cy;
  clampRig();
}

/** WASD pan speed in camera distances per second (the view crosses roughly its own height in about a second). */
const KEY_PAN_RATE = 0.9;
const PAN_KEYS: Record<string, [right: number, back: number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

interface Drag {
  mode: 'pan' | 'rotate' | 'none';
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  button: number;
}

export function CameraRig() {
  const { camera, gl } = useThree();

  const drag = useRef<Drag | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; angle: number } | null>(null);

  useEffect(() => {
    live.camera = camera;
    live.canvas = gl.domElement;
    return () => {
      if (live.camera === camera) live.camera = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    const el = gl.domElement;
    const pan = (dx: number, dy: number) => {
      // The view moves with the mouse: drag right looks further right, drag down looks further towards the camera.
      panView(dx * rig.distance * 0.0016, dy * rig.distance * 0.0016);
    };
    const rotate = (dx: number, dy: number) => {
      rig.yaw -= dx * 0.006;
      rig.pitch += dy * 0.006;
      clampRig();
    };

    const onDown = (e: PointerEvent) => {
      if (shot.active) return;
      if (e.pointerType === 'touch') {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.current.size === 2) {
          const [a, b] = [...touches.current.values()];
          pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), angle: Math.atan2(b!.y - a!.y, b!.x - a!.x) };
        }
        return;
      }
      if (e.button === 1) {
        e.preventDefault(); // Windows autoscroll
        if (readMouseMode() !== 'three-button') rememberThreeButton();
        drag.current = { mode: 'pan', pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: 1 };
      } else if (e.button === 2) {
        drag.current = { mode: 'rotate', pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: 2 };
      } else if (e.button === 0) {
        // Left pans only for a mouse that has shown no middle button yet; a short left press stays a pick.
        drag.current = { mode: readMouseMode() === 'two-button' ? 'pan' : 'none', pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: 0 };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const t = touches.current.get(e.pointerId);
        if (!t) return;
        if (touches.current.size === 1) {
          pan(e.clientX - t.x, e.clientY - t.y);
        } else if (touches.current.size >= 2 && pinch.current) {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [a, b] = [...touches.current.values()];
          const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          const angle = Math.atan2(b!.y - a!.y, b!.x - a!.x);
          rig.distance *= pinch.current.dist / Math.max(1, dist);
          rig.yaw += angle - pinch.current.angle;
          clampRig();
          pinch.current = { dist, angle };
          return;
        }
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (d.mode === 'pan') pan(dx, dy);
      else if (d.mode === 'rotate') rotate(dx, dy);
      d.x = e.clientX;
      d.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.current.delete(e.pointerId);
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
      if (drag.current && drag.current.pointerId === e.pointerId) drag.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const before = groundAtScreen(e.clientX, e.clientY);
      const factor = Math.exp(e.deltaY * 0.0012);
      rig.distance *= factor;
      clampRig();
      if (before) {
        // Zoom towards the cursor: keep the ground point under it where it was.
        applyRig(camera);
        const after = groundAtScreen(e.clientX, e.clientY);
        if (after) {
          rig.target.x += before.x - after.x;
          rig.target.z += before.z - after.z;
          clampRig();
        }
      }
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera]);

  // WASD pans while held; the keys are read per frame so the move is smooth and scales with the frame time.
  const held = useRef(new Set<string>());
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.code in PAN_KEYS)) return;
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      held.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => held.current.delete(e.code);
    const onBlur = () => held.current.clear();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, dt) => {
    if (held.current.size > 0) {
      let right = 0;
      let back = 0;
      for (const code of held.current) {
        const [r, b] = PAN_KEYS[code]!;
        right += r;
        back += b;
      }
      if (right !== 0 || back !== 0) {
        const step = rig.distance * KEY_PAN_RATE * Math.min(dt, 0.1);
        panView(right * step, back * step);
      }
    }
    if (shot.active && shot.from && shot.to) {
      shot.t = Math.min(shot.dur, shot.t + Math.min(dt, 0.1));
      const k = shot.t / shot.dur;
      applyRig(camera, lerpRig(shot.from, shot.to, k * k * (3 - 2 * k)));
      return;
    }
    applyRig(camera);
  });

  return null;
}
