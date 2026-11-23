r"""One review sheet of the round 10 models: the three-quarter view of each turnaround (render.py) with its id,
triangles and size, from docs/art/round-10-models.json. Run with any Python 3 that has Pillow:

  python tools/figures/models_sheet.py docs/art/shots/round-10-models.jpg [--group props]
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--group')
ap.add_argument('--cols', type=int, default=6)
args = ap.parse_args()

log = json.load(open(os.path.join(P.REPO, 'docs', 'art', 'round-10-models.json')))
objects = {k: v for k, v in json.load(open(os.path.join(P.HERE, 'objects.json'))).items() if k != '_'}
items = [(k, log[k]) for k in objects if k in log and log[k].get('ok') and (not args.group or objects[k]['group'] == args.group)]


def font(size):
    for f in ('C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/segoeuib.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


CELL, LABEL = 340, 44
cols = min(args.cols, max(1, len(items)))
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * CELL, rows * (CELL + LABEL)), 'white')
d = ImageDraw.Draw(sheet)
f1, f2 = font(17), font(13)
for i, (oid, r) in enumerate(items):
    turn = os.path.join(P.WORK, oid, f's{r["seed"]}-{objects[oid]["preset"]}', 'final', 'turnaround.jpg')
    im = Image.open(turn)
    w = im.width // 4
    q = im.crop((w, 0, 2 * w, im.height))  # the three-quarter view
    q.thumbnail((CELL, CELL))
    x, y = (i % cols) * CELL, (i // cols) * (CELL + LABEL)
    sheet.paste(q, (x + (CELL - q.width) // 2, y + (CELL - q.height) // 2))
    d.text((x + 8, y + CELL + 2), f'{i + 1}. {oid}', fill=(30, 34, 40), font=f1)
    d.text((x + 8, y + CELL + 22), f'{r["triangles"]} tris, {r["bytes"] // 1024} KB, texture {r["texture"]}', fill=(90, 96, 104), font=f2)
os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
sheet.save(args.out, quality=88)
print(args.out, len(items), 'models')
