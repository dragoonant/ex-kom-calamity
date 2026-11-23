r"""Round 10 objects, one after another on the GPU (KB rule 10): for each entry of objects.json, run.py (cutout ->
2.1 shape -> 2.0 paint), finalize.py --align into the attempt folder, a turnaround render, then the shipped GLB copied to
public/models/<group>/<file>. The shape stage reduces to the object's face budget before painting (a collapse
decimation after painting tears a 20k mesh apart at 1.5k), so finalize only normalizes. Run with any Python 3 (it only spawns):

  python tools/figures/batch_objects.py [--only props-desk,craft-scout] [--seed 1234] [--force]

An object whose public GLB exists is skipped unless --force. Every result goes to docs/art/round-10-models.json
(triangles, bytes, yaw, GPU seconds), which docs/art/round-10.md cites.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ap = argparse.ArgumentParser()
ap.add_argument('--only', help='comma-separated object ids')
ap.add_argument('--seed', type=int)
ap.add_argument('--force', action='store_true')
ap.add_argument('--yaw', type=float, default=0.0, help='extra degrees for finalize (a re-run after a turnaround check)')
args = ap.parse_args()

objects = {k: v for k, v in json.load(open(os.path.join(P.HERE, 'objects.json'))).items() if k != '_'}
only = set(args.only.split(',')) if args.only else None
log_path = os.path.join(P.REPO, 'docs', 'art', 'round-10-models.json')
log = json.load(open(log_path)) if os.path.exists(log_path) else {}


def call(argv):
    print('>>', ' '.join(os.path.basename(str(a)) if i < 2 else str(a) for i, a in enumerate(argv)), flush=True)
    out = []
    proc = subprocess.Popen([str(a) for a in argv], cwd=P.REPO, env=P.ENV, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            out.append(line)
            if not line.startswith('  ') or '!!' in line or 'done in' in line:
                print('   ' + line[-200:], flush=True)
    proc.wait()
    return proc.returncode, out


started = time.time()
for oid, o in objects.items():
    if only and oid not in only:
        continue
    public_dir = os.path.join(P.REPO, 'public', 'models', o['group'])
    target = os.path.join(public_dir, o['file'])
    if os.path.exists(target) and not args.force:
        print(f'-- {oid}: {os.path.relpath(target, P.REPO)} exists, skipped', flush=True)
        continue
    seed = args.seed or o['seeds'][0]
    print(f'== {oid} (seed {seed})', flush=True)
    att = os.path.join(P.WORK, oid, f's{seed}-{o["preset"]}')
    textured = os.path.join(att, 'textured.glb')
    if not os.path.exists(textured) or args.force:
        code, _ = call([sys.executable, os.path.join(P.HERE, 'run.py'), oid, '--seed', seed, '--preset', o['preset'],
                        '--faces', o['faces'], '--texture', 2048] + (['--cut-base'] if o.get('cutBase') else []))
        if code:
            print(f'!! {oid}: generation failed', flush=True)
            log[oid] = {'ok': False, 'seed': seed, 'stage': 'generate'}
            continue
    final = os.path.join(att, 'final')
    code, out = call([P.PY21, os.path.join(P.HERE, 'finalize.py'), oid, textured, '--out', final, '--align',
                      '--yaw', args.yaw, '--max', o['faces'] * 2, '--lod', o['faces'] * 2, '--tex', o['texture'],
                      '--lod-tex', o['texture'], '--roughness', 0.85, '--image-format', 'WEBP'])
    result = next((json.loads(l) for l in reversed(out) if l.startswith('{')), None)
    if code or not result:
        print(f'!! {oid}: finalize failed', flush=True)
        log[oid] = {'ok': False, 'seed': seed, 'stage': 'finalize', 'tail': [P.scrub(l) for l in out[-8:]]}
        continue
    call([P.PY21, os.path.join(P.HERE, 'render.py'), os.path.join(final, 'textured.glb'), final, '--size', 512,
          '--samples', 24])
    os.makedirs(public_dir, exist_ok=True)
    shutil.copyfile(os.path.join(final, 'textured.glb'), target)
    attempt = json.load(open(os.path.join(att, 'attempt.json')))
    log[oid] = {'ok': True, 'seed': seed, 'reference': o['reference'], 'file': f'models/{o["group"]}/{o["file"]}',
                'triangles': result['full']['triangles'], 'bytes': os.path.getsize(target), 'texture': o['texture'],
                'yaw': result['yaw'], 'dimensions': result['dimensions'], 'gpuSeconds': attempt.get('gpuSeconds'),
                'turnaround': P.scrub(os.path.join(final, 'turnaround.jpg'))}
    json.dump(log, open(log_path, 'w'), indent=1)
    print(f'== {oid}: {log[oid]["triangles"]} tris, {log[oid]["bytes"] // 1024} KB, yaw {log[oid]["yaw"]}', flush=True)

json.dump(log, open(log_path, 'w'), indent=1)
print(f'batch done in {(time.time() - started) / 60:.1f} min', flush=True)
