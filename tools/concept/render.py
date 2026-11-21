"""Render a concept prompts file with FLUX.1-dev through the Hugging Face router (judging samples only).
The network proxy supplies the credential; the bearer token below is a dummy.
Usage: python3 tools/concept/render.py <prompts json, relative to the repo> [id ...]
Each item renders to <folder of the json>/<id>-s<seed>.jpg; existing files are skipped.
Style prefix: spec["style_<kind>"] if present, nothing for kind "plain"."""
import json, pathlib, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

repo = pathlib.Path(__file__).resolve().parent.parent.parent
spec_path = repo / sys.argv[1]
spec = json.loads(spec_path.read_text())
out_dir = spec_path.parent
want = set(sys.argv[2:])
ENDPOINT = "https://router.huggingface.co/fal-ai/fal-ai/flux/dev"

jobs = []
for it in spec["items"]:
    if want and it["id"] not in want:
        continue
    style = spec.get("style_" + it["kind"], "")
    prompt = (style + " " + it["prompt"]).strip()
    for seed in it["seeds"]:
        out = out_dir / f"{it['id']}-s{seed}.jpg"
        if not out.exists():
            jobs.append((out, prompt, seed, it["w"], it["h"]))

def run(job):
    out, prompt, seed, w, h = job
    body = json.dumps({"prompt": prompt, "seed": seed, "num_inference_steps": 28, "guidance_scale": 3.5,
                       "image_size": {"width": w, "height": h}, "output_format": "jpeg"}).encode()
    req = urllib.request.Request(ENDPOINT, data=body,
                                 headers={"Authorization": "Bearer hf_dummy", "Content-Type": "application/json"})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=240))
        out.write_bytes(urllib.request.urlopen(res["images"][0]["url"], timeout=120).read())
        return f"ok {out.name}"
    except Exception as e:  # report and carry on with the rest
        return f"FAIL {out.name}: {e}"

print(f"{len(jobs)} calls", flush=True)
with ThreadPoolExecutor(4) as pool:
    for line in pool.map(run, jobs):
        print(line, flush=True)
