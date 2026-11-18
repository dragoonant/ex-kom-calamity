// KB rule 27, the mouse map: wheel zooms towards the cursor, right-drag rotates and tilts, middle-drag pans,
// left picks; left-drag pans until the first middle-button press shows the mouse has one (remembered in
// localStorage `ekc-mouse`); preventDefault on a middle pointerdown (Windows autoscroll). Touch: one finger
// pans, two twist and pinch. Picking itself lives on the tiles (rule 25), not here.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { applyRig, clampRig, groundAtScreen, live, readMouseMode, rememberThreeButton, rig, LEVEL_H } from './world';
import { useClient } from '../store';

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
  const level = useClient((s) => s.level);
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
      // Pan in the camera's ground plane: screen right is +camera right, screen up moves away from the camera.
      const k = rig.distance * 0.0016;
      const sy = Math.sin(rig.yaw);
      const cy = Math.cos(rig.yaw);
      rig.target.x -= (dx * cy - dy * sy) * k;
      rig.target.z -= (-dx * sy - dy * cy) * k;
      clampRig();
    };
    const rotate = (dx: number, dy: number) => {
      rig.yaw -= dx * 0.006;
      rig.pitch += dy * 0.006;
      clampRig();
    };

    const onDown = (e: PointerEvent) => {
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
      const before = groundAtScreen(e.clientX, e.clientY, live.levelY);
      const factor = Math.exp(e.deltaY * 0.0012);
      rig.distance *= factor;
      clampRig();
      if (before) {
        // Zoom towards the cursor: keep the ground point under it where it was.
        applyRig(camera, live.levelY);
        const after = groundAtScreen(e.clientX, e.clientY, live.levelY);
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

  useFrame(() => {
    live.levelY = level * LEVEL_H;
    applyRig(camera, live.levelY);
  });

  return null;
}
