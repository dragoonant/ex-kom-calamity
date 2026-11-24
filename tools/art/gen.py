"""IRON BASIN art generator (HF router, fal FLUX Krea / Kontext). Idempotent.
usage: python3 -I tools/art/gen.py [--force] [--raw-dir DIR] <id|group ...>   groups: portraits backdrops sky tex all
Raw downloads go to raw-dir (default scratch); finished files to public/art."""
import base64, json, re, sys, urllib.request, concurrent.futures as cf
from pathlib import Path
from PIL import Image, ImageFilter, ImageChops
import numpy as np

ROOT = Path(__file__).resolve().parents[2]; ART = ROOT / 'public/art'
RAW = Path('/tmp/claude-0/-home-user/eb51046f-a294-558b-bd74-5a15ce22f820/scratchpad/raw')
BANNED = re.compile(r'\b(chibi|mgsd|sd|super-deformed|gundam|nendoroid|cute|kawaii|toy|cartoony|stubby|tiny legs|mecha|robot|mech|front mission|wanzer)\b', re.I)
END = ' Wordless and untitled, no lettering, no numbers, no logos, no text, full-bleed.'
STYLE = ' Realistic painted concept art for a grounded near-future war game; overcast diffuse light; muted cold palette of slate blue-grey, wet concrete, dark steel, small accents of safety orange; matte, weathered.'
JACKET = 'slate blue-grey padded flight jacket with a safety-orange collar tab'
PORT = 'Head and shoulders portrait, painted, serious grounded expression, natural adult face, '
def tex(s): return 'Flat top-down orthographic photograph of ' + s + ', even lighting, no shadows, no perspective, no objects, uniform detail across the whole frame, seamless material texture.' + END

# id: (route, w, h, seed, prompt)  prompts get END appended unless tex()
I = {
 'marlow': ('krea', 896, 1152, 11, PORT + 'Captain Ines Marlow, a woman in her late thirties, short cropped dark hair, a pale scar across the chin, tired steady eyes, wearing a ' + JACKET + ' and a headset with a boom microphone, amber cockpit gauges glowing softly below her.' + STYLE),
 'okonjo': ('krea', 896, 1152, 12, PORT + 'Dace Okonjo, a broad Black man in his late forties, shaved head, short grey beard, calm heavy-lidded eyes, wearing a ' + JACKET + ', ear defenders hanging around his neck, dim hangar background.' + STYLE),
 'varga': ('krea', 896, 1152, 13, PORT + 'Pell Varga, a wiry young man in his early twenties, messy sandy hair under a knitted cap, a quick grin, sharp eyes, wearing a ' + JACKET + ', a small pair of binoculars on a strap, grey rail yard background.' + STYLE),
 'haldane': ('krea', 896, 1152, 14, PORT + 'Ruth Haldane, a woman in her fifties, long grey braid, weathered face, an oil smudge on her cheek, welding goggles pushed up on her forehead, wearing a ' + JACKET + ' with rolled sleeves, workshop background.' + STYLE),
 'aske': ('krea', 896, 1152, 15, PORT + 'Corin Aske, a man in his fifties, clean-shaven, thin rimless glasses, neat grey hair, wearing a dark navy officer raincoat with a plain silver collar pin, inside a dim command tent with a paper map behind him.' + STYLE),
 'hallen': ('krea', 896, 1152, 16, PORT + 'Major Teodric Hallen, a man in his forties, hard angular face, close-cropped blond hair, wearing a dark grey-green greatcoat with red collar piping, inside a cramped cockpit lit dull red.' + STYLE),
 'region-map': ('krea', 1344, 768, 27, 'Orthographic satellite view looking straight down from orbit, entirely flat map-like image with no horizon and no sky, an entire river basin like an old aerial reconnaissance photograph tinted cold, seen as a plan: a winding river, a hydroelectric dam at the top, rail lines converging on a rail yard beside a small town, canals, fields with patches of snow, early winter.' + STYLE),
 'hangar': ('krea', 1344, 768, 28, 'Interior of a converted locomotive shed used as a hangar for piloted walker machines, sodium work lights, drifting steam, a bare open steel scaffold gantry frame of girders and ladders standing in the centre-left with only empty air between its uprights, the shed floor in the middle of the frame completely bare wet concrete with no machine and no figures, racks of spare armour panels and actuators along the walls, ammunition crates, a workbench, the centre of the floor fairly clear.' + STYLE),
 'debrief': ('krea', 1344, 768, 23, 'Rain, a wrecked sand-and-olive camouflaged enemy piloted walker machine lying on its side in a rail yard while two mechanics in slate blue-grey jackets strip an arm off it with a mobile crane.' + STYLE),
 'defeat': ('krea', 1344, 768, 24, 'A slate blue-grey piloted walker machine lying broken in a flooded rail yard, its cockpit hatch open and empty, smoke rising, dusk.' + STYLE),
 'sky': ('krea', 1536, 768, 31, 'Overcast early-winter dawn sky, heavy layered grey clouds, a faint warm glow low on the left, a flat distant horizon line of low hills and faint industrial silhouettes in the bottom eighth of the frame.' + ' Muted cold grey palette, matte, painted.'),
 'wet-concrete': ('krea', 1024, 1024, 41, tex('cracked wet concrete slabs with joints')),
 'ballast': ('krea', 1024, 1024, 42, tex('railway track ballast, grey crushed stone gravel, a few rusty bits')),
 'mud': ('krea', 1024, 1024, 43, tex('churned dark mud with puddles and tyre marks')),
 'snow-mud': ('krea', 1024, 1024, 44, tex('thin slushy snow over mud')),
 'corrugated-rust': ('krea', 1024, 1024, 45, tex('rusted corrugated steel sheet with vertical ribs')),
 'container': ('krea', 1024, 1024, 46, tex('a red-oxide painted steel container wall with ribs and scratches')),
 'brick': ('krea', 1024, 1024, 47, tex('a sooty red-brown brick wall')),
 'silo-concrete': ('krea', 1024, 1024, 48, tex('weathered vertical concrete with formwork lines and rust streaks')),
 'paint-slate': ('krea', 1024, 1024, 49, tex('chipped slate blue-grey military paint on steel plate with worn edges and a few scratches')),
 'paint-camo': ('krea', 1024, 1024, 50, tex('sand and drab olive hard-edged two-tone camouflage paint on steel plate, chipped')),
 'title': ('kontext', 1344, 768, 61, 'Same scene and same walker, but extend the moody overcast sky upward so the top third of the image is calmer, darker and emptier, leaving clear space for a logo. Keep everything else unchanged.' + END),
}
GROUPS = {'portraits': ['marlow','okonjo','varga','haldane','aske','hallen'],
 'backdrops': ['region-map','hangar','debrief','defeat','title'], 'sky': ['sky'],
 'tex': ['wet-concrete','ballast','mud','snow-mud','corrugated-rust','container','brick','silo-concrete','paint-slate','paint-camo']}

def full(k):
    r, w, h, s, p = I[k]
    if not p.endswith(END.strip()) and k != 'sky': p += END
    if k == 'sky': p += END
    m = BANNED.search(p)
    if m: raise SystemExit(f'banned word {m.group(0)!r} in {k}')
    return p

def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Authorization': 'Bearer hf_dummy', 'Content-Type': 'application/json'})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    return base64.b64decode(d['images'][0]['url'].split(',', 1)[1])

def flatten(im, r=90, k=0.7):
    """Remove low-frequency light/colour blotches so the tile repeats less visibly."""
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    lo = np.asarray(im.convert('RGB').filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)
    return Image.fromarray(np.clip(a - k * (lo - lo.mean((0, 1))), 0, 255).astype(np.uint8))

def seamless(im, F=160):
    """Edge cross-fade: shrink the tile by F px per axis, blending the first F columns/rows with the cut-off tail,
    so the last column is the true neighbour of the first. Resized back to the original size."""
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    for ax in (1, 0):
        a = np.moveaxis(a, ax, 0); n = a.shape[0]; t = np.linspace(0, 1, F).reshape(-1, *([1] * (a.ndim - 1)))
        head = a[:F] * t + a[n - F:] * (1 - t)
        a = np.concatenate([head, a[F:n - F]], 0); a = np.moveaxis(a, 0, ax)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize(im.size, Image.LANCZOS)

CROP = {'hallen': 0.92, 'aske': 0.92}

def finish(k, raw):
    im = Image.open(raw).convert('RGB')
    if k in CROP: f = CROP[k]; im = im.crop((0, 0, int(im.width * f), int(im.height * f)))  # crop a stray signature in the corner
    if k in GROUPS['portraits']: im.resize((512, 656), Image.LANCZOS).save(ART / f'portraits/{k}.jpg', quality=85)
    elif k == 'sky': im.resize((2048, 1024), Image.LANCZOS).save(ART / 'sky.jpg', quality=85)
    elif k in GROUPS['tex']: seamless(flatten(im)).resize((1024, 1024)).save(ART / f'tex/{k}.jpg', quality=85)
    else: im.resize((1344, 768), Image.LANCZOS).save(ART / f'{k}.jpg', quality=85)

def run(k, force):
    RAW.mkdir(parents=True, exist_ok=True); raw = RAW / f'{k}.jpg'
    if raw.exists() and not force: finish(k, raw); return k, 'cached'
    r, w, h, s, _ = I[k]; p = full(k)
    if r == 'krea':
        data = post('https://router.huggingface.co/fal-ai/fal-ai/flux/krea', {'prompt': p, 'image_size': {'width': w, 'height': h}, 'num_images': 1, 'seed': s, 'sync_mode': True, 'enable_safety_checker': True})
    else:
        ref = ROOT / 'docs/concept/run1/01-key-art.jpg'
        uri = 'data:image/jpeg;base64,' + base64.b64encode(ref.read_bytes()).decode()
        data = post('https://router.huggingface.co/fal-ai/fal-ai/flux-kontext/dev', {'prompt': p, 'image_url': uri, 'seed': s, 'num_images': 1, 'sync_mode': True, 'guidance_scale': 2.5, 'resolution_mode': 'match_input'})
    raw.write_bytes(data); finish(k, raw); return k, 'ok'

if __name__ == '__main__':
    a = sys.argv[1:]; force = '--force' in a; a = [x for x in a if x != '--force']
    if '--raw-dir' in a: i = a.index('--raw-dir'); RAW = Path(a[i + 1]); del a[i:i + 2]
    ids = []
    for x in a: ids += GROUPS.get(x, [x]) if x != 'all' else sum(GROUPS.values(), [])
    for k in ids: full(k)
    with cf.ThreadPoolExecutor(3) as ex:
        for f in cf.as_completed([ex.submit(run, k, force) for k in ids]):
            try: print(*f.result())
            except Exception as e: print('ERR', e)
