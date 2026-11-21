"""Image-to-3D through the Hugging Face router's fal passthrough (judging assets only).
The network proxy supplies the credential; the bearer token below is a dummy.
Usage: python3 tools/concept/to3d.py <route> <input image, relative to repo> <out .glb, relative to repo>
<route> is the fal model path, e.g. fal-ai/trellis or fal-ai/hunyuan3d/v2.
The image is sent inline as a data: URI under both image_url and input_image_url."""
import base64, json, pathlib, sys, urllib.request, urllib.error

repo = pathlib.Path(__file__).resolve().parent.parent.parent
route, src, out = sys.argv[1], repo / sys.argv[2], repo / sys.argv[3]
mime = "image/png" if src.suffix == ".png" else "image/jpeg"
uri = f"data:{mime};base64," + base64.b64encode(src.read_bytes()).decode()
body = {"image_url": uri, "input_image_url": uri}
body.update(json.loads(sys.argv[4]) if len(sys.argv) > 4 else {})
req = urllib.request.Request(f"https://router.huggingface.co/fal-ai/{route}", data=json.dumps(body).encode(),
                             headers={"Authorization": "Bearer hf_dummy", "Content-Type": "application/json"})
try:
    res = json.load(urllib.request.urlopen(req, timeout=600))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read()[:2000].decode(errors="replace"))
    sys.exit(1)
print(json.dumps(res)[:1500])
def find_url(o):
    if isinstance(o, dict):
        for k in ("model_mesh", "model_glb", "glb", "mesh"):
            if k in o and isinstance(o[k], dict) and "url" in o[k]:
                return o[k]["url"]
        for v in o.values():
            u = find_url(v)
            if u: return u
    return None
url = find_url(res)
if url:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(urllib.request.urlopen(url, timeout=300).read())
    print("wrote", out.relative_to(repo), out.stat().st_size, "bytes")
