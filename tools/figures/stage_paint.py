r"""Mesh + cutout -> textured mesh with Hunyuan3D 2.0 paint. Runs in the 2.0 venv. Mirrors the studio's pipeline/paint.py.

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe tools/figures/stage_paint.py --mesh shape.glb --image cutout.png
      --out textured.glb [--texture 2048]
"""
import argparse
import os
import time

os.environ.setdefault('HF_HUB_OFFLINE', '1')

ap = argparse.ArgumentParser()
ap.add_argument('--mesh', required=True)
ap.add_argument('--image', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--texture', type=int, default=2048)
args = ap.parse_args()

t0 = time.time()
print('loading Hunyuan3D 2.0 paint model', flush=True)
import trimesh
from PIL import Image
from hy3dgen.texgen import Hunyuan3DPaintPipeline

paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2', subfolder='hunyuan3d-paint-v2-0')
paint.render.set_default_texture_resolution(args.texture)
print(f'loaded in {time.time() - t0:.0f}s; painting at {args.texture}', flush=True)
mesh = trimesh.load(args.mesh, force='mesh')
mesh = paint(mesh, image=Image.open(args.image))
mesh.export(args.out)
print(f'textured: {os.path.getsize(args.out) / 1e6:.1f} MB, {time.time() - t0:.0f}s total', flush=True)
