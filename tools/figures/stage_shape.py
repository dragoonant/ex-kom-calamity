r"""Cutout -> untextured mesh with Hunyuan3D 2.1 shape. Runs in the 2.1 venv. Mirrors the studio's pipeline/shape.py.

  %USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe tools/figures/stage_shape.py --src cutout.png --out shape.glb
      [--seed 1234] [--steps 50] [--guidance 5.0] [--octree 512] [--faces 30000] [--cut-base]

One GPU job at a time (KB rule 10). Weights come from %USERPROFILE%\.cache\hy3dgen with HF_HUB_OFFLINE=1.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

sys.path.insert(0, os.path.join(P.HY21, 'hy3dshape'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--seed', type=int, default=1234)
ap.add_argument('--steps', type=int, default=50)
ap.add_argument('--guidance', type=float, default=5.0)
ap.add_argument('--octree', type=int, default=512)
ap.add_argument('--faces', type=int, default=30000)
ap.add_argument('--cut-base', action='store_true', help='slice off a display base if the concept had one')
args = ap.parse_args()


def cut_base(mesh):
    """From the studio: slice off a wide slab at the very bottom whose footprint is clearly larger than what stands on it."""
    import numpy as np
    import trimesh
    from scipy.spatial import ConvexHull

    v = np.asarray(mesh.vertices)
    y = v[:, 1]
    y0, height = y.min(), y.max() - y.min()
    n, span = 40, 0.4
    areas = []
    for i in range(n):
        lo = y0 + height * span * i / n
        pts = v[(y >= lo) & (y < lo + height * span / n)][:, [0, 2]]
        areas.append(ConvexHull(pts).volume if len(pts) >= 10 else 0.0)
    slab = max(areas[:4])
    for i in range(2, n):
        if areas[i] < 0.72 * slab:
            frac = span * i / n
            if frac > 0.3:
                break
            cut = trimesh.intersections.slice_mesh_plane(mesh, [0, 1, 0], [0, y0 + height * frac, 0], cap=False)
            return cut, frac
    return mesh, None


def pick_low_poly(mesh, target):
    """The planar halving keeps most props whole, but thin lattices (a power station's pylons and lines) can fold it
    into a few sheets; then Hunyuan's own reducer is kept if it stays closer to the 20k mesh (surface area and box)."""
    import numpy as np

    def score(m):
        box = np.prod(np.maximum(m.extents, 1e-6)) / np.prod(np.maximum(mesh.extents, 1e-6))
        return abs(1 - m.area / mesh.area) + abs(1 - box)

    a = low_poly(mesh, target)
    print(f'low poly (planar halving): area {a.area / mesh.area:.2f}, score {score(a):.2f}', flush=True)
    if score(a) < 0.25:
        return a
    b = FaceReducer()(mesh.copy(), max_facenum=target)
    print(f'low poly (hunyuan reducer): area {b.area / mesh.area:.2f}, score {score(b):.2f}', flush=True)
    return a if score(a) <= score(b) else b


def low_poly(mesh, target):
    """Below 20k faces Hunyuan's reducer (preservetopology on, one step) folds a marching-cubes mesh into a few huge
    triangles; halving with planar quadrics and without the topology lock keeps a 1.5k prop whole (round 10)."""
    import pymeshlab
    import trimesh
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=mesh.vertices, face_matrix=mesh.faces))
    n = len(mesh.faces)
    while n > target:
        n = max(target, n // 2)
        ms.apply_filter('meshing_decimation_quadric_edge_collapse', targetfacenum=n, qualitythr=0.3, planarquadric=True,
                        preserveboundary=True, boundaryweight=3, preservenormal=False, preservetopology=False, autoclean=True)
    m = ms.current_mesh()
    return trimesh.Trimesh(m.vertex_matrix(), m.face_matrix())


t0 = time.time()
print('loading Hunyuan3D 2.1 shape model', flush=True)
import torch
from PIL import Image
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
from hy3dshape.postprocessors import DegenerateFaceRemover, FaceReducer, FloaterRemover

pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2.1')
print(f'loaded in {time.time() - t0:.0f}s; generating (seed {args.seed}, octree {args.octree}, {args.steps} steps)', flush=True)
image = Image.open(args.src).convert('RGBA')
t1 = time.time()
mesh = pipeline(image=image, num_inference_steps=args.steps, guidance_scale=args.guidance,
                octree_resolution=args.octree, generator=torch.manual_seed(args.seed))[0]
print(f'generated in {time.time() - t1:.0f}s: {len(mesh.faces)} raw faces', flush=True)

mesh = FloaterRemover()(mesh)
mesh = DegenerateFaceRemover()(mesh)
if args.cut_base:
    mesh, cut = cut_base(mesh)
    if cut:
        print(f'base cut at {cut:.0%}', flush=True)
    mesh = FloaterRemover()(mesh)
mesh = FaceReducer()(mesh, max_facenum=max(args.faces, 20000))
if args.faces < 20000:
    mesh.export(args.out.replace('.glb', '-20k.glb'))
    mesh = pick_low_poly(mesh, args.faces)
mesh.metadata.clear()  # the reducer's temp .ply path would otherwise land in the GLB extras (KB rule 11)
mesh.metadata['name'] = 'shape'
mesh.export(args.out)
print(f'shape: {len(mesh.faces)} faces, {time.time() - t0:.0f}s total', flush=True)
