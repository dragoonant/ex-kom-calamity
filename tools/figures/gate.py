r"""Measure a figure silhouette against docs/figures.md section 1 and draw the gate sheet. Runs in the 2.0 venv
(PIL + numpy; no GPU):

  %USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe tools/figures/gate.py <role> <front.png with alpha> <reference.jpg>
      <out.jpg> [--body humanoid|creature] [--chin 0.30] [--ref-chin 0.30] [--json out.json] [--label model]

The image is measured, never the prompt (KB rule 13). From the alpha silhouette (or the near-white background of a
reference photo), row by row from the top:
  head width  = the widest row above the shoulder line (where the width first jumps: the plates start), or
                above the chin when that jump is inside the head (tentacles)
  chin        = the bottom of the head. The shoulder plates sit beside the helmet on these figures, so the silhouette
                never narrows at the neck; the chin row comes from the mesh (finalize.py: the lowest downward-facing
                surface in the central column of the upper half) or, for a reference photo, by eye (--ref-chin),
                and the sheet says which. Without either, the shoulder line is used and marked a lower bound.
  shoulders   = the widest row 8-12% of the height below the chin (lower down the arms and hands are wider)
  crotch      = the first row below 40% where the centre column is empty and the row splits in two (the leg gap)
Humanoid gate (figures.md section 4): head share 30-40% of height, shoulders 1.6-2.0 head widths, legs at most 1.2
head heights. Creatures record width/height and the leg share and pass by inspection.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('role')
ap.add_argument('front')
ap.add_argument('reference')
ap.add_argument('out')
ap.add_argument('--body', default='humanoid')
ap.add_argument('--chin', type=float, help='model chin row as a fraction of the silhouette height from the top')
ap.add_argument('--ref-chin', type=float, help='reference chin row, by eye, as a fraction of the height from the top')
ap.add_argument('--json')
ap.add_argument('--label', default='model')
args = ap.parse_args()


def silhouette(img):
    im = Image.open(img).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    if a.min() == 255:  # no alpha: a photo on a near-white background
        rgb = np.asarray(im.convert('RGB')).astype(int)
        border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).min(axis=1)
        bg = float(np.median(border))
        a = np.where(rgb.min(axis=2) < bg - 30, 255, 0).astype(np.uint8)
    mask = a > 127
    try:  # keep the largest connected blob: shadows and halos fall away
        from scipy import ndimage
        lab, k = ndimage.label(mask)
        if k > 1:
            sizes = ndimage.sum(mask, lab, range(1, k + 1))
            mask = lab == (1 + int(np.argmax(sizes)))
    except ImportError:
        pass
    return im, mask


def measure(mask, chin_frac=None):
    rows = np.where(mask.any(axis=1))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    n = bottom - top + 1
    widths = np.array([mask[y].sum() for y in range(top, bottom + 1)], dtype=float)
    k = max(3, n // 100)
    sm = np.convolve(widths, np.ones(k) / k, mode='same')
    wmax = float(sm.max())
    step = max(2, int(n * 0.02))
    jump = None
    for y in range(step, int(n * 0.6)):
        if sm[y] - sm[y - step] > 0.10 * wmax and sm[y] > 0.45 * wmax:
            jump = y - step
            break
    if jump is None:
        jump = int(n * 0.25)
    head_w = float(sm[:max(jump, 2)].max())
    chin_src = 'shoulder line (lower bound)'
    if chin_frac is not None:
        chin = int(round(chin_frac * n))
        chin_src = 'given'
    else:
        # a true neck: a local minimum of the width at least 8% below the head's width, before the shoulders
        chin = jump
        seg = sm[jump:int(n * 0.5)]
        if len(seg) > 2:
            m = int(np.argmin(seg))
            if seg[m] < 0.92 * head_w:
                chin, chin_src = jump + m, 'neck minimum'
    # head width: the widest row above the chin. Shoulders: the widest row 8-12% of the height below the chin
    # (where any humanoid's shoulder line sits); further down the arms and hands can be wider.
    # (above the shoulder line when that line is below the head; above the chin when the jump is inside the head,
    # as with the host's tentacles)
    if chin > 2:
        head_w = float(sm[:(jump if jump > 0.4 * chin else chin)].max())
    lo, hi = min(n - 2, chin + int(0.08 * n)), min(n - 1, chin + int(0.12 * n))
    shoulder = lo + int(np.argmax(sm[lo:hi + 1]))
    shoulder_w = float(sm[shoulder])
    cols = np.where(mask.any(axis=0))[0]
    cx = int((cols[0] + cols[-1]) / 2)
    crotch = None
    for y in range(int(n * 0.4), n):
        row = mask[top + y]
        if row[cx]:
            continue
        xs = np.where(row)[0]
        runs = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1) if len(xs) else []
        big = [r for r in runs if len(r) > 0.08 * shoulder_w]
        if len(big) >= 2 and any(r[-1] < cx for r in big) and any(r[0] > cx for r in big):
            crotch = y
            break
    legs = (n - crotch) if crotch is not None else None
    return {
        'top': top, 'bottom': bottom, 'height': n, 'jump': jump, 'chin': chin, 'chin_source': chin_src,
        'shoulder_row': shoulder, 'crotch': crotch, 'head_h': chin, 'head_w': round(head_w, 1),
        'shoulder_w': round(shoulder_w, 1), 'width': int(len(cols)),
        'head_share': round(chin / n, 3),
        'shoulders_in_heads': round(shoulder_w / head_w, 2) if head_w else None,
        'legs_in_heads': round(legs / chin, 2) if legs is not None and chin else None,
        'leg_share': round(legs / n, 3) if legs is not None else None,
        'aspect': round(len(cols) / n, 3),
    }


TOL = 0.05  # RULING GATE-1 (docs/art/figure-models.md): 5% on the band edges, the silhouette method's own noise


def verdict(m):
    if args.body != 'humanoid':
        return 'recorded', []
    fails = []
    if not 0.30 * (1 - TOL) <= m['head_share'] <= 0.40 * (1 + TOL):
        fails.append(f"head {m['head_share']:.0%} not in 30-40%")
    if m['shoulders_in_heads'] is None or not 1.6 * (1 - TOL) <= m['shoulders_in_heads'] <= 2.0 * (1 + TOL):
        fails.append(f"shoulders {m['shoulders_in_heads']} heads not in 1.6-2.0")
    if m['legs_in_heads'] is None:
        fails.append('no leg gap found')
    elif m['legs_in_heads'] > 1.2 * (1 + TOL):
        fails.append(f"legs {m['legs_in_heads']} heads over 1.2")
    return ('pass' if not fails else 'fail'), fails


def panel(img, mask, m, title, size=720):
    rgb = Image.new('RGB', img.size, 'white')
    rgb.paste(img, mask=img.split()[3])
    cols = np.where(mask.any(axis=0))[0]
    pad = int(0.08 * m['height'])
    box = (max(0, int(cols[0]) - pad), max(0, m['top'] - pad), min(rgb.width, int(cols[-1]) + pad), min(rgb.height, m['bottom'] + pad))
    crop = rgb.crop(box)
    s = (size - 40) / crop.height
    crop = crop.resize((max(1, int(crop.width * s)), size - 40), Image.LANCZOS)
    out = Image.new('RGB', (max(crop.width, 360), size), 'white')
    out.paste(crop, (0, 40))
    d = ImageDraw.Draw(out)

    def Y(row):
        return int(40 + (m['top'] + row - box[1]) * s)

    lines = [(0, (200, 40, 40), 'top'),
             (m['chin'], (200, 40, 40), f"chin ({m['chin_source']}): head {m['head_share']:.0%} of height"),
             (m['shoulder_row'], (40, 90, 200), f"shoulders {m['shoulders_in_heads']} heads wide"),
             (m['height'] - 1, (200, 40, 40), 'sole')]
    if m['crotch'] is not None:
        lines.append((m['crotch'], (40, 150, 60), f"crotch: legs {m['legs_in_heads']} heads"))
    for row, colour, text in lines:
        d.line([(0, Y(row)), (out.width, Y(row))], fill=colour, width=1)
        d.text((4, Y(row) + 2), text, fill=colour)
    d.text((4, 4), title, fill=(20, 20, 20))
    return out


img_m, mask_m = silhouette(args.front)
img_r, mask_r = silhouette(args.reference)
mm, mr = measure(mask_m, args.chin), measure(mask_r, args.ref_chin)
v, fails = verdict(mm)
left = panel(img_r, mask_r, mr, f'reference: {os.path.basename(args.reference)}')
right = panel(img_m, mask_m, mm, f'{args.label}: {args.role}')
sheet = Image.new('RGB', (left.width + right.width + 30, 790), 'white')
sheet.paste(left, (10, 0))
sheet.paste(right, (left.width + 20, 0))
d = ImageDraw.Draw(sheet)
line1 = (f"{args.role} ({args.body}): head {mm['head_share']:.0%} (ref {mr['head_share']:.0%}), "
         f"shoulders {mm['shoulders_in_heads']} heads (ref {mr['shoulders_in_heads']}), "
         f"legs {mm['legs_in_heads']} heads (ref {mr['legs_in_heads']}), width/height {mm['aspect']} (ref {mr['aspect']})")
line2 = f"gate: {v.upper()}" + (' - ' + '; '.join(fails) if fails else '') + '   (docs/figures.md section 1 with 5% on the band edges, RULING GATE-1; measured on the image: KB rule 13)'
d.text((10, 725), line1, fill=(20, 20, 20))
d.text((10, 745), line2, fill=(160, 20, 20) if v == 'fail' else (20, 100, 20))
d.text((10, 765), 'red: top, chin, sole; blue: widest shoulders; green: the leg gap. The chin comes from the mesh for the model and by eye for the photo.', fill=(90, 90, 90))
sheet.save(args.out, quality=90)
result = {'role': args.role, 'body': args.body, 'verdict': v, 'fails': fails, 'model': mm, 'reference': mr}
if args.json:
    json.dump(result, open(args.json, 'w'), indent=1)
keys = ('head_share', 'shoulders_in_heads', 'legs_in_heads', 'aspect', 'chin_source')
print(json.dumps({'verdict': v, 'fails': fails, 'model': {k: mm[k] for k in keys}, 'reference': {k: mr[k] for k in keys}}))
