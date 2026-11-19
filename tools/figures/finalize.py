r"""Normalize a painted Hunyuan GLB for the client and write it (plus a decimated LOD) to public/models/figures/<role>/.
Runs in the 2.1 venv (it has bpy):

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe tools/figures/finalize.py <role> <textured.glb> [--yaw 0]
      [--height 1.2] [--lod 8000] [--max 30000] [--roughness 0.9]

Output contract (docs/art/figure-models.md): Y up, feet on y=0, centred on x/z, front faces +Z, height in world
units from figures.json (the agent stands 1.2 like the client's FIGURE_H), one material, metallic 0, roughness
0.8-1.0, texture embedded as PNG. textured.glb is the full mesh (at most --max triangles), textured-lod.glb the
collapse-decimated LOD (at most --lod). The glTF importer welds the vertex seams (merge_vertices) before decimation,
which is what keeps the LOD from tearing along UV islands (KB gotchas, 2026-11-09).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

ap = argparse.ArgumentParser()
ap.add_argument('role')
ap.add_argument('src')
ap.add_argument('--height', type=float)
ap.add_argument('--yaw', type=float, default=0.0, help='degrees about the vertical, if the model faces the wrong way')
ap.add_argument('--lod', type=int, default=8000)
ap.add_argument('--max', type=int, default=30000)
ap.add_argument('--roughness', type=float, default=0.9)
ap.add_argument('--tex', type=int, default=0, help='downscale the texture of the full model to this size (0 keeps it)')
ap.add_argument('--lod-tex', type=int, default=1024, help='texture size of the LOD')
ap.add_argument('--regrade', help='cutout.png: match the texture colours to this image (Hunyuan paint drifts pale and warm)')
ap.add_argument('--out', help='output folder (default public/models/figures/<role>)')
args = ap.parse_args()

figures = json.load(open(os.path.join(P.HERE, 'figures.json')))
height = args.height or figures[args.role]['height']
out_dir = args.out or os.path.join(P.MODELS, args.role)
os.makedirs(out_dir, exist_ok=True)


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path), merge_vertices=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if len(meshes) > 1:
        bpy.ops.object.join()
    fig = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != fig:
            bpy.data.objects.remove(o)
    return fig


def normalize(fig):
    fig.rotation_mode = 'XYZ'
    fig.rotation_euler[2] = math.radians(args.yaw)
    bpy.ops.object.transform_apply(rotation=True)
    pts = [Vector(v.co) for v in fig.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    s = height / (hi.z - lo.z)
    fig.scale = (s, s, s)
    fig.location = (-(lo.x + hi.x) / 2 * s, -(lo.y + hi.y) / 2 * s, -lo.z * s)
    bpy.ops.object.transform_apply(location=True, scale=True)
    fig.name = 'figure'
    fig.data.name = f'{args.role}-mesh'
    # Hunyuan exports fully metallic materials, which render near-black without an environment map;
    # painted miniatures are matte (docs/figures.md section 1).
    for m in fig.data.materials:
        if m and m.use_nodes:
            p = m.node_tree.nodes.get('Principled BSDF')
            if p:
                for name, value in (('Metallic', 0.0), ('Roughness', args.roughness)):
                    sock = p.inputs[name]
                    for link in list(sock.links):
                        m.node_tree.links.remove(link)
                    sock.default_value = value
            m.name = f'{args.role}-paint'
    return {'width': round((hi.x - lo.x) * s, 3), 'depth': round((hi.y - lo.y) * s, 3), 'height': round(height, 3)}


def measure(fig):
    """Body landmarks from the mesh, in fractions of the height from the top (gate.py reads them); see _landmarks.py."""
    import _landmarks
    xs = [v.co.x for v in fig.data.vertices]
    W = max(xs) - min(xs)
    chin, crotch = _landmarks.chin_z(fig, height, W), _landmarks.crotch_z(fig, height, W)
    return {
        'chin_frac': round(1 - chin / height, 3) if chin is not None else None,
        'crotch_frac': round(1 - crotch / height, 3) if crotch is not None else None,
    }


def _srgb_to_lab(rgb):
    import numpy as np
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def _lab_to_srgb(lab):
    import numpy as np
    fy = (lab[:, 0] + 16) / 116
    f = np.stack([fy + lab[:, 1] / 500, fy, fy - lab[:, 2] / 200], axis=1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    m = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    c = np.clip(xyz @ m.T, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def regrade(cutout):
    """Reinhard colour transfer in Lab: the used texels' mean and spread of L, a and b are moved to the cutout's
    (KB gotchas: Hunyuan paint flattens pale and warm, so re-grade). Unused black texels are left alone."""
    import numpy as np
    from PIL import Image
    ref = np.asarray(Image.open(cutout).convert('RGBA'))
    ref_lab = _srgb_to_lab(ref[ref[:, :, 3] > 200][:, :3].astype(np.float64) / 255)
    rm, rs = ref_lab.mean(axis=0), ref_lab.std(axis=0) + 1e-6
    for img in bpy.data.images:
        if img.size[0] < 16:
            continue
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float64).reshape(h, w, 4)
        used = px[:, :, :3].max(axis=2) > 0.02
        lab = _srgb_to_lab(px[:, :, :3][used])
        lab = (lab - lab.mean(axis=0)) / (lab.std(axis=0) + 1e-6) * rs + rm
        px[:, :, :3][used] = _lab_to_srgb(lab)
        img.pixels = px.astype(np.float32).ravel().tolist()
        img.pack()


def shrink_textures(size):
    if not size:
        return
    for img in bpy.data.images:
        if img.size[0] > size:
            img.scale(size, size)


def triangulate_and_decimate(fig, target):
    if target and len(fig.data.polygons) > target:
        mod = fig.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = target / len(fig.data.polygons)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    tri = fig.modifiers.new('tri', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=tri.name)


def export(path):
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format='GLB', export_image_format='AUTO',
                              export_yup=True, export_apply=True, export_materials='EXPORT')


result = {}
fig = load(args.src)
dims = normalize(fig)
result['landmarks'] = measure(fig)
if args.regrade:
    regrade(args.regrade)
shrink_textures(args.tex)
triangulate_and_decimate(fig, args.max)
full = os.path.join(out_dir, 'textured.glb')
export(full)
result['full'] = {'triangles': len(fig.data.polygons), 'bytes': os.path.getsize(full), 'texture': args.tex or 'as painted'}

fig = load(args.src)
normalize(fig)
if args.regrade:
    regrade(args.regrade)
shrink_textures(args.lod_tex)
triangulate_and_decimate(fig, args.lod)
lod = os.path.join(out_dir, 'textured-lod.glb')
export(lod)
result['lod'] = {'triangles': len(fig.data.polygons), 'bytes': os.path.getsize(lod), 'texture': args.lod_tex}
result['dimensions'] = dims
result['yaw'] = args.yaw
result['roughness'] = args.roughness
result['regrade'] = bool(args.regrade)
print(json.dumps(result))
