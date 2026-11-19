r"""Re-export a trimesh GLB without its metadata extras (the Hunyuan face reducer goes through a temp .ply and trimesh
writes that absolute path into the mesh extras: KB rule 11, no home path in anything committed). Runs in the 2.0 venv:

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe tools/figures/scrub_glb.py <in.glb> <out.glb> [--name shape]
"""
import argparse

import trimesh

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('--name', default='shape')
args = ap.parse_args()

mesh = trimesh.load(args.src, force='mesh')
mesh.metadata.clear()
mesh.metadata['name'] = args.name
scene = trimesh.Scene()
scene.add_geometry(mesh, node_name=args.name, geom_name=args.name)
scene.export(args.dst)
print(f'{args.dst}: {len(mesh.faces)} faces')
