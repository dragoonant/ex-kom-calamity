"""Labelled contact sheet. Usage: python3 tools/concept/sheet.py <out.jpg> <title> <image>[::label] [image ...]
Paths relative to the repo. Each cell is labelled with its file name (without extension), or with the text after
"::" when one is given."""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFont

repo = pathlib.Path(__file__).resolve().parent.parent.parent
out, title = repo / sys.argv[1], sys.argv[2]
files = [repo / f.split('::')[0] for f in sys.argv[3:]]
labels = [f.split('::')[1] if '::' in f else None for f in sys.argv[3:]]
CELL, LABEL, PAD, COLS = 420, 34, 12, min(4, len(files))
rows = (len(files) + COLS - 1) // COLS
sizes = [Image.open(f).size for f in files]
CH = min(CELL, max(round(CELL * h / w) for w, h in sizes))  # cell height follows the tallest image
W = COLS * (CELL + PAD) + PAD
H = 56 + rows * (CH + LABEL + PAD) + PAD
def font(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf"]:
        if pathlib.Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()
sheet = Image.new("RGB", (W, H), (236, 230, 214))
d = ImageDraw.Draw(sheet)
d.text((PAD, 14), title, fill=(40, 44, 48), font=font(26))
for i, f in enumerate(files):
    r, c = divmod(i, COLS)
    x, y = PAD + c * (CELL + PAD), 56 + r * (CH + LABEL + PAD)
    im = Image.open(f).convert("RGB")
    im.thumbnail((CELL, CH))
    sheet.paste(im, (x + (CELL - im.width) // 2, y + (CH - im.height) // 2))
    d.rectangle([x, y + CH, x + CELL, y + CH + LABEL], fill=(40, 44, 48))
    d.text((x + 8, y + CH + 7), labels[i] or f.stem, fill=(245, 240, 225), font=font(18))
sheet.save(out, quality=88)
print(out.relative_to(repo))
