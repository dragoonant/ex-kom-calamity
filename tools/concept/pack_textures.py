"""Make the round 10 material swatches seamless and pack them into the client's texture strip.

  python tools/concept/pack_textures.py <folder of the tex-*.png masters> public/textures [--size 512] [--pick name=seed ...]

For each surface in SURFACES (the order of src/client/board/surface.ts) it takes tex-<name>-s<seed>.png (the first
seed unless --pick says otherwise), then:
  1. crops each axis to the length that wraps best (the cut whose next strip matches the first strip), which keeps a
     regular pattern (brick courses, herringbone, paving joints) whole across the seam;
  2. blends what is left of the seam with the image rolled by half under a narrow feathered border;
  3. scales to --size and stacks the layers top to bottom into tiles.webp, with tiles.json holding the layer names,
     the size and each layer's mean colour (the shader divides by it, so a swatch adds detail, not colour).
Writes a preview sheet (each swatch tiled 2 x 2) to <src>/sheet-textures-tiled.jpg so seams can be judged by eye.
"""
import argparse
import json
import pathlib

import numpy as np
from PIL import Image

SURFACES = ['brick', 'render', 'ashlar', 'steel', 'enamel', 'plaster', 'parquet', 'linoleum', 'marble', 'concrete',
            'chequer', 'paving', 'tar', 'gravel', 'lead', 'asphalt']

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--size', type=int, default=512)
ap.add_argument('--pick', nargs='*', default=[], help='name=seed to choose a seed other than the first')
args = ap.parse_args()
src, out = pathlib.Path(args.src), pathlib.Path(args.out)
out.mkdir(parents=True, exist_ok=True)
picks = dict(p.split('=') for p in args.pick)


def best_cut(a, axis):
    """Length L (60-100% of the side) where the strip after L best matches the strip at 0."""
    n = a.shape[axis]
    k = max(4, n // 64)
    first = np.take(a, range(0, k), axis=axis)
    best, best_l = None, n
    for L in range(int(n * 0.6), n - k):
        nxt = np.take(a, range(L, L + k), axis=axis)
        d = float(np.mean(np.abs(nxt - first)))
        if best is None or d < best:
            best, best_l = d, L
    # Keep the full side unless a cut is clearly better than wrapping the image as it is.
    wrap = np.concatenate([np.take(a, range(n - k // 2, n), axis=axis), np.take(a, range(0, k - k // 2), axis=axis)], axis=axis)
    as_is = float(np.mean(np.abs(np.take(a, range(0, k), axis=axis) - wrap)))
    return best_l if best is not None and best < as_is * 0.8 else n


def seamless(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    a = a[:best_cut(a, 0), :]
    a = a[:, :best_cut(a, 1)]
    side = min(a.shape[0], a.shape[1])
    a = a[:side, :side]
    rolled = np.roll(np.roll(a, side // 2, axis=0), side // 2, axis=1)
    # Weight 1 in the middle, 0 at the edges over a border of 12% of the side: the edges come from the rolled copy,
    # whose own edges are the image's continuous middle, so the result wraps.
    border = side * 0.12
    idx = np.arange(side, dtype=np.float32)
    edge = np.minimum(idx, side - 1 - idx) / border
    ramp = np.clip(edge, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    w = np.minimum(ramp[:, None], ramp[None, :])[..., None]
    b = a * w + rolled * (1 - w)
    return Image.fromarray(np.clip(b, 0, 255).astype(np.uint8))


layers, means, previews = [], [], []
for name in SURFACES:
    seeds = sorted(src.glob(f'tex-{name}-s*.png'))
    if not seeds:
        raise SystemExit(f'missing tex-{name}-s*.png in {src}')
    f = src / f'tex-{name}-s{picks[name]}.png' if name in picks else seeds[0]
    tile = seamless(Image.open(f)).resize((args.size, args.size), Image.LANCZOS)
    layers.append(tile)
    means.append([round(float(v), 1) for v in np.asarray(tile, dtype=np.float32).reshape(-1, 3).mean(axis=0)])
    prev = Image.new('RGB', (args.size * 2, args.size * 2))
    for dx in (0, 1):
        for dy in (0, 1):
            prev.paste(tile, (dx * args.size, dy * args.size))
    previews.append((name, f.stem, prev.resize((360, 360))))
    print(f'{name:9s} {f.name}')

strip = Image.new('RGB', (args.size, args.size * len(layers)))
for i, t in enumerate(layers):
    strip.paste(t, (0, i * args.size))
strip.save(out / 'tiles.webp', quality=88, method=6)
(out / 'tiles.json').write_text(json.dumps({'size': args.size, 'layers': SURFACES, 'mean': means,
                                            'sources': {n: p[1] for n, p in zip(SURFACES, previews)}}, indent=1) + '\n')

cols = 4
rows = (len(previews) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 372 + 12, rows * 400 + 12), (236, 230, 214))
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
for i, (name, stem, prev) in enumerate(previews):
    r, c = divmod(i, cols)
    x, y = 12 + c * 372, 12 + r * 400
    sheet.paste(prev, (x, y))
    d.text((x + 4, y + 366), f'{name} ({stem}), tiled 2 x 2', fill=(40, 44, 48))
sheet.save(src / 'sheet-textures-tiled.jpg', quality=88)
print(f'{out / "tiles.webp"}  {(out / "tiles.webp").stat().st_size // 1024} KB, {len(layers)} layers of {args.size}')
