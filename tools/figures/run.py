r"""One generation attempt for one figure: cutout (cached per role) -> 2.1 shape -> 2.0 paint, each stage in its own
venv, one GPU process at a time (KB rule 10). Run with any Python 3 (it only spawns):

  python tools/figures/run.py <role> [--seed 1234] [--preset high|standard|fast] [--faces 30000] [--texture 2048]
                               [--cut-base] [--no-paint]

Writes .figures-work/<role>/s<seed>-<preset>/ with cutout.png, shape.glb, textured.glb and attempt.json (settings,
timings, log tail). Nothing here touches public/ : finalize.py promotes the attempt that passes the gate.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

# The children print tqdm bars (box-drawing characters); a cp1252 console would crash this script on them.
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PRESETS = {'fast': (256, 20), 'standard': (384, 50), 'high': (512, 50)}

ap = argparse.ArgumentParser()
ap.add_argument('role')
ap.add_argument('--seed', type=int, default=1234)
ap.add_argument('--preset', choices=PRESETS, default='high')
ap.add_argument('--faces', type=int, default=30000)
ap.add_argument('--texture', type=int, default=2048)
ap.add_argument('--guidance', type=float, default=5.0)
ap.add_argument('--cut-base', action='store_true')
ap.add_argument('--no-paint', action='store_true')
args = ap.parse_args()

figures = json.load(open(os.path.join(P.HERE, 'figures.json')))
fig = figures[args.role]
octree, steps = PRESETS[args.preset]
role_dir = os.path.join(P.WORK, args.role)
att_dir = os.path.join(role_dir, f's{args.seed}-{args.preset}')
os.makedirs(att_dir, exist_ok=True)
cutout = os.path.join(role_dir, 'cutout.png')
shape = os.path.join(att_dir, 'shape.glb')
textured = os.path.join(att_dir, 'textured.glb')
record = {
    'role': args.role, 'reference': fig['reference'], 'seed': args.seed, 'preset': args.preset,
    'octree': octree, 'steps': steps, 'guidance': args.guidance, 'faces': args.faces, 'texture': args.texture,
    'cutBase': args.cut_base, 'stages': {}, 'started': time.strftime('%Y-%m-%d %H:%M:%S'),
}


def run(name, python, script, argv):
    t0 = time.time()
    print(f'== {name}: {os.path.basename(script)} {" ".join(map(str, argv))}', flush=True)
    log = []
    proc = subprocess.Popen([python, script, *map(str, argv)], cwd=P.REPO, env=P.ENV,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    for raw in proc.stdout:
        for line in raw.replace('\r', '\n').split('\n'):
            line = line.strip()
            if not line or ('it/s]' in line and '100%' not in line):  # drop partial progress bars
                continue
            print('  ' + line[-160:], flush=True)
            log.append(line[-300:])
    proc.wait()
    secs = round(time.time() - t0)
    record['stages'][name] = {'seconds': secs, 'ok': proc.returncode == 0, 'tail': [P.scrub(l) for l in log[-12:]]}
    json.dump(record, open(os.path.join(att_dir, 'attempt.json'), 'w'), indent=1)
    if proc.returncode != 0:
        print(f'!! {name} failed ({proc.returncode}) after {secs}s', flush=True)
        sys.exit(proc.returncode)
    print(f'== {name} done in {secs}s', flush=True)


if not os.path.exists(cutout):
    run('cutout', P.PY2, os.path.join(P.HERE, 'stage_cutout.py'),
        ['--src', os.path.join(P.REPO, fig['reference']), '--out', cutout])
else:
    record['stages']['cutout'] = {'seconds': 0, 'ok': True, 'tail': ['cached']}

shape_args = ['--src', cutout, '--out', shape, '--seed', args.seed, '--steps', steps, '--guidance', args.guidance,
              '--octree', octree, '--faces', args.faces] + (['--cut-base'] if args.cut_base else [])
run('shape', P.PY21, os.path.join(P.HERE, 'stage_shape.py'), shape_args)

if not args.no_paint:
    run('paint', P.PY2, os.path.join(P.HERE, 'stage_paint.py'),
        ['--mesh', shape, '--image', cutout, '--out', textured, '--texture', args.texture])

record['finished'] = time.strftime('%Y-%m-%d %H:%M:%S')
record['gpuSeconds'] = sum(s['seconds'] for n, s in record['stages'].items() if n in ('shape', 'paint'))
json.dump(record, open(os.path.join(att_dir, 'attempt.json'), 'w'), indent=1)
print(f'attempt written: {att_dir} (GPU {record["gpuSeconds"]}s)', flush=True)
