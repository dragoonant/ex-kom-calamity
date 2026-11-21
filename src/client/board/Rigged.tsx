// A generated figure that moves (PLAN.md D21 a): the rigged GLB (the 8k mesh skinned to a simple armature, with
// `idle` and `walk` clips, docs/art/figure-models.md), cloned per figure with its own skeleton and mixer. Each frame
// the clips play by the pose's weights (anim.ts), then the pose's code-built motions are laid onto the bones: crouch,
// aim, recoil, flinch, throw, lunge, run lean. Humanoids (agent, host) have named limbs; the creatures (taker,
// fighter) have a root and three legs, so they bob, tilt and lunge with the root. No raycast (KB rule 25).
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { REST_POSE, throwArmAngle, type Pose } from './anim';

const NO_RAYCAST = () => undefined;
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
const QR = new THREE.Quaternion();
const V = new THREE.Vector3();

/**
 * Turns a bone by `angle` about an axis of the figure's own frame (x to the figure's left, y up, z forward), on top
 * of whatever the clip set: the axis is carried into the bone's parent space and the turn premultiplies the bone's
 * local rotation. The bone's world matrix is refreshed so a child turned next sees it.
 */
export function turnBone(root: THREE.Object3D, bone: THREE.Object3D | undefined, axis: 'x' | 'y' | 'z', angle: number): void {
  if (!bone || !bone.parent || angle === 0) return;
  root.getWorldQuaternion(QR).invert();
  bone.parent.getWorldQuaternion(QA);
  QA.premultiply(QR); // parent's rotation relative to the figure root
  V.copy(AX[axis]).applyQuaternion(QA.invert());
  QB.setFromAxisAngle(V, angle);
  bone.quaternion.premultiply(QB);
  bone.updateMatrixWorld(true);
}

interface Bones {
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  chest?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  foreL?: THREE.Object3D;
  foreR?: THREE.Object3D;
  thighL?: THREE.Object3D;
  thighR?: THREE.Object3D;
  shinL?: THREE.Object3D;
  shinR?: THREE.Object3D;
  root?: THREE.Object3D;
}

function findBones(scene: THREE.Object3D): Bones {
  const by = (name: string) => scene.getObjectByName(name);
  return {
    hips: by('hips'),
    spine: by('spine'),
    chest: by('chest'),
    armL: by('upper_armL') ?? by('upper_arm.L'),
    armR: by('upper_armR') ?? by('upper_arm.R'),
    foreL: by('lower_armL') ?? by('lower_arm.L'),
    foreR: by('lower_armR') ?? by('lower_arm.R'),
    thighL: by('upper_legL') ?? by('upper_leg.L'),
    thighR: by('upper_legR') ?? by('upper_leg.R'),
    shinL: by('lower_legL') ?? by('lower_leg.L'),
    shinR: by('lower_legR') ?? by('lower_leg.R'),
    root: by('root'),
  };
}

/** Lays the code-built motions of a pose onto a humanoid's bones (after the clips have set them). */
export function poseHumanoid(scene: THREE.Object3D, b: Bones, p: Pose): void {
  if (b.hips) b.hips.position.y -= 0.13 * p.crouch + 0.03 * p.run;
  scene.updateMatrixWorld(true);
  turnBone(scene, b.spine, 'x', 0.3 * p.crouch + 0.3 * p.run + 0.25 * p.lunge - 0.14 * p.recoil + 0.06 * p.aim - 0.12 * Math.abs(p.flinch));
  turnBone(scene, b.spine, 'z', 0.22 * p.flinch);
  if (p.throwPhase !== null) turnBone(scene, b.chest, 'y', -0.5 * Math.sin(Math.PI * p.throwPhase));
  turnBone(scene, b.thighL, 'x', -1.15 * p.crouch);
  turnBone(scene, b.thighR, 'x', -1.15 * p.crouch);
  turnBone(scene, b.shinL, 'x', 1.9 * p.crouch);
  turnBone(scene, b.shinR, 'x', 1.9 * p.crouch);
  // Arms: raised to the shoulder when aiming (both hands on the weapon), kicked up by a shot, thrown forward in a lunge.
  const reach = Math.max(p.aim, p.lunge);
  const kick = 0.35 * p.recoil;
  if (p.throwPhase !== null) turnBone(scene, b.armR, 'x', throwArmAngle(p.throwPhase));
  else {
    turnBone(scene, b.armR, 'x', -1.45 * reach - kick);
    turnBone(scene, b.armR, 'y', 0.3 * p.aim);
  }
  turnBone(scene, b.armL, 'x', -1.25 * reach - kick);
  turnBone(scene, b.armL, 'y', -0.45 * p.aim);
  turnBone(scene, b.foreL, 'x', -0.4 * p.aim);
}

/** The creatures: the root carries the whole body, so they crouch, tilt up to aim, kick, wobble and dip into a bite. */
export function poseCreature(scene: THREE.Object3D, b: Bones, p: Pose): void {
  if (b.root) b.root.position.y -= 0.08 * p.crouch;
  scene.updateMatrixWorld(true);
  turnBone(scene, b.root, 'x', 0.35 * p.lunge - 0.18 * p.aim - 0.15 * p.recoil + 0.12 * p.run + (p.throwPhase !== null ? -0.4 * Math.sin(Math.PI * p.throwPhase) : 0));
  turnBone(scene, b.root, 'z', 0.28 * p.flinch);
}

export function RiggedModel({ url, pose, frozen }: { url: string; pose: MutableRefObject<Pose>; frozen: MutableRefObject<boolean> }) {
  const gltf = useGLTF(url);
  const { scene, mixer, idle, walk, bones, humanoid, rest } = useMemo(() => {
    const s = cloneSkinned(gltf.scene);
    s.name = 'glb-rigged';
    s.traverse((o) => {
      o.raycast = NO_RAYCAST; // KB rule 25
      // A skinned mesh's bounds are its bind pose; the moving figure may leave them, so it is never culled.
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
      // The board's sun throws figure shadows on the street (Scene.tsx BoardSun).
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    const m = new THREE.AnimationMixer(s);
    const clip = (n: string) => gltf.animations.find((a) => a.name === n);
    const idleClip = clip('idle');
    const walkClip = clip('walk');
    const i = idleClip ? m.clipAction(idleClip) : null;
    const w = walkClip ? m.clipAction(walkClip) : null;
    i?.play();
    w?.play();
    if (w) w.setEffectiveWeight(0);
    const bn = findBones(s);
    // The rest pose of every bone: restored before the clips play each frame, so the code-built turns never pile up
    // (the mixer leaves a track's value alone when the clip holds it still, so it does not reset a turned bone).
    const rest: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
    s.traverse((o) => {
      if ((o as THREE.Bone).isBone) rest.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    });
    return { scene: s, mixer: m, idle: i, walk: w, bones: bn, humanoid: !!bn.hips, rest };
  }, [gltf]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  useFrame((_, dtRaw) => {
    if (frozen.current) return; // a figure lying down keeps its last pose
    const dt = Math.min(dtRaw, 0.1);
    const p = pose.current ?? REST_POSE;
    idle?.setEffectiveWeight(p.idle);
    if (walk) {
      walk.setEffectiveWeight(p.walk);
      walk.setEffectiveTimeScale(p.rate * (1 + 0.35 * p.run));
    }
    for (const r of rest) {
      r.o.position.copy(r.p);
      r.o.quaternion.copy(r.q);
      r.o.scale.copy(r.s);
    }
    mixer.update(dt);
    if (humanoid) poseHumanoid(scene, bones, p);
    else poseCreature(scene, bones, p);
  });

  return <primitive object={scene} />;
}
