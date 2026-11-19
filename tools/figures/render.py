r"""Turnaround renders of a GLB: front, three-quarter, side, back on white, plus a sheet. Runs in the 2.1 venv (bpy):

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe tools/figures/render.py <model.glb> <out_dir> [--size 768]
      [--prefix turnaround] [--frame 0]

Writes <prefix>-front.png (with alpha, for measuring), -quarter, -side, -back and <prefix>.jpg (the four side by side).
The front view is orthographic so the measurements in gate.py are not foreshortened; the others are perspective.
--clip and --frame render a pose from an animated GLB (the rig check).
"""
import argparse
import math
import os

import bpy
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out_dir')
ap.add_argument('--size', type=int, default=768)
ap.add_argument('--prefix', default='turnaround')
ap.add_argument('--frame', type=int, default=0)
ap.add_argument('--clip', help='animation (action) name to pose at --frame, for a rigged GLB')
ap.add_argument('--samples', type=int, default=48)
ap.add_argument('--keep-png', action='store_true', help='keep the four PNG views next to the sheet (the front one is the gate input)')
args = ap.parse_args()

args.out_dir = os.path.abspath(args.out_dir)  # Blender resolves relative render paths elsewhere
os.makedirs(args.out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.src))
scene = bpy.context.scene
if args.clip:
    action = bpy.data.actions.get(args.clip) or next((a for a in bpy.data.actions if a.name.startswith(args.clip)), None)
    for o in scene.objects:
        if o.type == 'ARMATURE':
            o.animation_data_create()
            for track in o.animation_data.nla_tracks:
                track.mute = True
            o.animation_data.action = action
scene.frame_set(args.frame)

meshes = [o for o in scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
centre = (lo + hi) / 2
size = max(hi - lo)

scene.render.engine = 'CYCLES'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = args.size
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

world = bpy.data.worlds.new('w')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
scene.world = world
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 2.0
sun.data.angle = math.radians(12)
sun.rotation_euler = (math.radians(45), 0, math.radians(-35))
scene.collection.objects.link(sun)

target = bpy.data.objects.new('target', None)
target.location = centre
scene.collection.objects.link(target)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.constraints.new('TRACK_TO').target = target

# glTF +Z (the front) imports as Blender -Y
views = [('front', -90, True), ('quarter', -45, False), ('side', 0, False), ('back', 90, False)]
outs = []
for name, az, ortho in views:
    a = math.radians(az)
    dist = size * 2.2
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.ortho_scale = size * 1.15
    cam.data.lens = 60
    elev = 0.0 if ortho else size * 0.25
    cam.location = centre + Vector((math.cos(a) * dist, math.sin(a) * dist, elev))
    scene.render.filepath = os.path.join(args.out_dir, f'{args.prefix}-{name}.png')
    bpy.ops.render.render(write_still=True)
    outs.append(scene.render.filepath)

from PIL import Image, ImageDraw
tiles = []
for p, (name, _, _) in zip(outs, views):
    t = Image.open(p).convert('RGBA')
    bg = Image.new('RGB', t.size, 'white')
    bg.paste(t, mask=t.split()[3])
    ImageDraw.Draw(bg).text((12, 10), name, fill=(40, 40, 40))
    tiles.append(bg)
sheet = Image.new('RGB', (args.size * len(tiles), args.size), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, (args.size * i, 0))
sheet_path = os.path.join(args.out_dir, f'{args.prefix}.jpg')
sheet.save(sheet_path, quality=88)
if not args.keep_png:
    for p in outs:
        os.remove(p)
import json
print(json.dumps({'sheet': sheet_path, 'views': [v[0] for v in views]}))
