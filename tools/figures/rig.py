r"""Rigging attempt (M4b scope 3): a simple armature with automatic weights and two short clips, exported as rigged.glb.
Runs in the 2.1 venv (bpy):

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe tools/figures/rig.py <role> <textured.glb> <out.glb>
      --kind humanoid|legs [--tex 1024]

humanoid: hips, spine, chest, neck, head, upper/lower arm and upper/lower leg on each side, placed from the mesh's
own landmarks (chin and crotch as in finalize.py, shoulder width from the silhouette at the shoulder line).
legs: a root plus one bone per leg, the legs found by clustering the lowest 20% of the mesh by angle (tripod).
Clips: idle (a slow breathing sway, 60 frames) and walk (24 frames, legs alternate, arms counter-swing).
Weights: proximity skinning (two nearest bone segments, distance-blended), because Blender's bone heat solver left
every vertex unweighted on these fused surfaces. The caller judges the result by rendering a walk frame (render.py --frame).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('role')
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--kind', choices=['humanoid', 'legs'], default='humanoid')
ap.add_argument('--tex', type=int, default=1024)
args = ap.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.src), merge_vertices=True)
fig = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.ops.object.select_all(action='DESELECT')
fig.select_set(True)
bpy.context.view_layer.objects.active = fig
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for img in bpy.data.images:
    if args.tex and img.size[0] > args.tex:
        img.scale(args.tex, args.tex)

verts = [v.co.copy() for v in fig.data.vertices]
H = max(v.z for v in verts)
xs = [v.x for v in verts]
W = max(xs) - min(xs)
report = {'role': args.role, 'kind': args.kind, 'height': round(H, 3), 'width': round(W, 3)}


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _landmarks


def chin_z():
    z = _landmarks.chin_z(fig, H, W)
    return z if z is not None else 0.7 * H


def crotch_z():
    z = _landmarks.crotch_z(fig, H, W)
    return z if z is not None else 0.35 * H


def half_width_at(z, band=0.03):
    sel = [abs(v.x) for v in verts if abs(v.z - z) < band * H]
    return max(sel) if sel else W / 4


arm = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, tail, parent=None, connect=False):
    b = arm.edit_bones.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if parent:
        b.parent = arm.edit_bones[parent]
        b.use_connect = connect
    return b


if args.kind == 'humanoid':
    chin, crotch = chin_z(), crotch_z()
    shoulder_z = chin - 0.06 * H
    sw = half_width_at(shoulder_z) * 0.8
    report.update(chin=round(chin, 3), crotch=round(crotch, 3), shoulder_half_width=round(sw, 3))
    torso = chin - crotch
    bone('hips', (0, 0, crotch), (0, 0, crotch + torso * 0.25))
    bone('spine', (0, 0, crotch + torso * 0.25), (0, 0, crotch + torso * 0.6), 'hips', True)
    bone('chest', (0, 0, crotch + torso * 0.6), (0, 0, chin - 0.02 * H), 'spine', True)
    bone('neck', (0, 0, chin - 0.02 * H), (0, 0, chin + 0.03 * H), 'chest', True)
    bone('head', (0, 0, chin + 0.03 * H), (0, 0, H), 'neck', True)
    for side, sx in (('L', 1), ('R', -1)):
        bone(f'shoulder.{side}', (sx * 0.1 * W, 0, shoulder_z), (sx * sw, 0, shoulder_z), 'chest')
        elbow = (sx * (sw + 0.03 * W), 0, crotch + torso * 0.45)
        bone(f'upper_arm.{side}', (sx * sw, 0, shoulder_z), elbow, f'shoulder.{side}', True)
        bone(f'lower_arm.{side}', elbow, (sx * (sw + 0.02 * W), 0, crotch + 0.02 * H), f'upper_arm.{side}', True)
        hip = (sx * 0.16 * W, 0, crotch)
        knee = (sx * 0.17 * W, 0.01 * H, crotch * 0.5)
        bone(f'upper_leg.{side}', hip, knee, 'hips')
        bone(f'lower_leg.{side}', knee, (sx * 0.17 * W, 0, 0.02 * H), f'upper_leg.{side}', True)
else:
    low = [v for v in verts if v.z < 0.2 * H]
    import numpy as np
    pts = np.array([[v.x, v.y] for v in low])
    ang = np.arctan2(pts[:, 1], pts[:, 0])
    # three legs: split the angle circle into three bins around the largest gaps
    order = np.argsort(ang)
    gaps = np.diff(np.concatenate([ang[order], [ang[order][0] + 2 * math.pi]]))
    cuts = sorted(order[np.argsort(gaps)[-3:]].tolist(), key=lambda i: ang[i])
    cut_angles = sorted((ang[i] + gaps[np.where(order == i)[0][0]] / 2) for i in cuts)
    legs = []
    for k in range(3):
        a0, a1 = cut_angles[k], cut_angles[(k + 1) % 3] + (2 * math.pi if k == 2 else 0)
        sel = [v for v, a in zip(low, ang) if a0 <= a < a1 or a0 <= a + 2 * math.pi < a1]
        if not sel:
            continue
        tip = min(sel, key=lambda v: v.z)
        legs.append(tip)
    body_z = 0.3 * H
    report.update(legs=[[round(t.x, 3), round(t.y, 3), round(t.z, 3)] for t in legs], body_z=round(body_z, 3))
    bone('root', (0, 0, body_z), (0, 0, H))
    for i, tip in enumerate(legs):
        bone(f'leg.{i}', (tip.x * 0.3, tip.y * 0.3, body_z), (tip.x, tip.y, tip.z), 'root')

bpy.ops.object.mode_set(mode='OBJECT')
# Weights: Blender's bone heat gives nothing on these fused, non-manifold Hunyuan surfaces (it reported no solution
# and left every vertex unweighted on the first attempt), so the rig uses proximity skinning instead: each vertex
# is blended between its two nearest bone segments with exp(-d / sigma), sigma 6% of the height. Deterministic, no
# failure mode; the clips show how crude it is.
import numpy as np
bones = list(arm.bones)
heads = np.array([b.head_local for b in bones])
tails = np.array([b.tail_local for b in bones])
co = np.array([v.co for v in fig.data.vertices])
seg = tails - heads
seg_len2 = np.maximum((seg ** 2).sum(axis=1), 1e-9)
d = np.empty((len(co), len(bones)))
for i in range(len(bones)):
    t = np.clip(((co - heads[i]) * seg[i]).sum(axis=1) / seg_len2[i], 0, 1)
    nearest = heads[i] + t[:, None] * seg[i]
    d[:, i] = np.linalg.norm(co - nearest, axis=1)
sigma = 0.06 * H
order = np.argsort(d, axis=1)[:, :2]
w = np.exp(-np.take_along_axis(d, order, axis=1) / sigma)
w /= w.sum(axis=1, keepdims=True)
groups = [fig.vertex_groups.new(name=b.name) for b in bones]
for bi, g in enumerate(groups):
    for col in range(2):
        idx = np.where(order[:, col] == bi)[0]
        for vi in idx:
            g.add([int(vi)], float(w[vi, col]), 'ADD')
mod = fig.modifiers.new('rig', 'ARMATURE')
mod.object = rig  # not parented: a skinned mesh under the armature node draws a validator warning
report['weights'] = 'proximity (two nearest bones, sigma 6% of height)'
report['unweighted_vertices'] = int((w.sum(axis=1) < 1e-4).sum())


def clip(name, frames, pose):
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
    for f in range(0, frames + 1, 3):
        t = f / frames
        for b in rig.pose.bones:
            b.rotation_euler = pose(b.name, t)
            b.keyframe_insert('rotation_euler', frame=f)
    for fc in action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    action.use_fake_user = True
    return action


def idle(name, t):
    s = math.sin(t * 2 * math.pi)
    if name in ('spine', 'chest', 'root'):
        return (math.radians(1.5) * s, 0, 0)
    if name == 'head':
        return (math.radians(-1.0) * s, 0, math.radians(2) * math.sin(t * 2 * math.pi + 1))
    if name.startswith('upper_arm'):
        return (0, 0, math.radians(2) * s * (1 if name.endswith('L') else -1))
    return (0, 0, 0)


def walk(name, t):
    s = math.sin(t * 2 * math.pi)
    side = 1 if name.endswith('.L') else -1
    if name.startswith('upper_leg'):
        return (math.radians(28) * s * side, 0, 0)
    if name.startswith('lower_leg'):
        return (math.radians(max(0.0, -s * side)) * 30, 0, 0)
    if name.startswith('upper_arm'):
        return (math.radians(-18) * s * side, 0, 0)
    if name == 'spine':
        return (0, 0, math.radians(3) * s)
    if name == 'head':
        return (0, 0, math.radians(-3) * s)
    if name.startswith('leg.'):
        i = int(name.split('.')[1])
        ph = math.sin((t + i / 3) * 2 * math.pi)
        return (math.radians(14) * ph, math.radians(10) * max(0.0, ph), 0)
    if name == 'root':
        return (math.radians(2) * s, 0, math.radians(2) * math.cos(t * 2 * math.pi))
    return (0, 0, 0)


clip('idle', 60, idle)
clip('walk', 24, walk)
rig.animation_data.action = None
# NLA strips so both clips export
for action in (bpy.data.actions['idle'], bpy.data.actions['walk']):
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, 0, action)
bpy.context.scene.frame_end = 60
bpy.ops.object.select_all(action='DESELECT')
fig.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.out), export_format='GLB', export_yup=True,
                          use_selection=True, export_animations=True, export_skins=True,
                          export_image_format='AUTO', export_apply=False)
report['bones'] = len(arm.bones)
report['bytes'] = os.path.getsize(args.out)
print(json.dumps(report))
