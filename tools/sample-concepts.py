"""Cloud stand-in for the local Flux Studio: renders docs/concept/samples/prompts.json for judging only.
The proxy supplies the credential; the token below is a dummy. Usage: python3 tools/sample-concepts.py <prompts file in docs/concept/samples> [id ...]"""
import json, pathlib, sys, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent / "docs/concept/samples"
spec = json.loads((root / sys.argv[1]).read_text())
want = set(sys.argv[2:])
for it in spec["items"]:
    if want and it["id"] not in want:
        continue
    style = {"figure": spec["style_figure"], "creature": spec["style_creature"], "plain": ""}[it["kind"]]
    prompt = (style + " " + it["prompt"]).strip()
    for seed in it["seeds"]:
        out = root / f"{it['id']}-s{seed}.jpg"
        if out.exists():
            continue
        body = json.dumps({"prompt": prompt, "seed": seed, "num_inference_steps": 28, "guidance_scale": 3.5,
                           "image_size": {"width": it["w"], "height": it["h"]}}).encode()
        req = urllib.request.Request("https://router.huggingface.co/fal-ai/fal-ai/flux/dev", data=body,
                                     headers={"Authorization": "Bearer hf_dummy", "Content-Type": "application/json"})
        res = json.load(urllib.request.urlopen(req, timeout=180))
        out.write_bytes(urllib.request.urlopen(res["images"][0]["url"], timeout=120).read())
        print(out.name, flush=True)
