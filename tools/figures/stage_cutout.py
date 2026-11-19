r"""Reference image -> background-removed RGBA cutout. Runs in the 2.0 venv (rembg lives there).

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe tools/figures/stage_cutout.py --src ref.jpg --out cutout.png
"""
import argparse

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--max', type=int, default=1536, help='longest side after resize; Hunyuan works at 512-1024')
args = ap.parse_args()

from PIL import Image

image = Image.open(args.src).convert('RGB')
if max(image.size) > args.max:
    s = args.max / max(image.size)
    image = image.resize((round(image.width * s), round(image.height * s)), Image.LANCZOS)
from hy3dgen.rembg import BackgroundRemover
cut = BackgroundRemover()(image)
cut.save(args.out)
print('cutout', cut.size, flush=True)
