"""Contact sheet: python3 -I tools/art/sheet.py out.jpg file...  (thumbnails, labelled)"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw
out, files = sys.argv[1], [Path(f) for f in sys.argv[2:]]
TW = 300; tiles = []
for p in files:
    im = Image.open(p).convert('RGB'); im.thumbnail((TW, TW)); t = Image.new('RGB', (TW, TW + 16), 'white')
    t.paste(im, ((TW - im.width) // 2, 0)); ImageDraw.Draw(t).text((4, TW + 2), p.stem, fill='black'); tiles.append(t)
cols = min(4, len(tiles)); rows = (len(tiles) + cols - 1) // cols
s = Image.new('RGB', (cols * TW, rows * (TW + 16)), 'white')
for k, t in enumerate(tiles): s.paste(t, ((k % cols) * TW, (k // cols) * (TW + 16)))
s.save(out, quality=80)
