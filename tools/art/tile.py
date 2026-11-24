"""Tile check: python3 -I tools/art/tile.py out.jpg tex.jpg... (each tiled 2x2, shown at 250px)"""
import sys
from pathlib import Path
from PIL import Image
out, fs = sys.argv[1], sys.argv[2:]; T = 250
s = Image.new('RGB', (T * len(fs), T), 'white')
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((T // 2, T // 2))
    for x in range(2):
        for y in range(2): s.paste(im, (i * T + x * T // 2, y * T // 2))
s.save(out, quality=85)
