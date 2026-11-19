r"""Promote one attempt into the repo: finalize (bpy) -> turnaround renders -> gate sheet -> job.json. Run with any
Python 3 (it spawns the venvs); no GPU:

  python tools/figures/promote.py <role> <seed> [--preset high] [--yaw 0] [--tex 0] [--ref-chin 0.30]

Reads %USERPROFILE%\Hunyuan3D-2\outputs\ekc-figures\<role>\s<seed>-<preset>\ and writes
  public/models/figures/<role>/  cutout.png, shape.glb, textured.glb, textured-lod.glb, turnaround.jpg, turnaround-lod.jpg, job.json
  docs/concept/gates/<role>-model.jpg
job.json holds the attempt's settings and timings (paths scrubbed to %USERPROFILE%), the normalized model's
dimensions and triangle counts, and the gate measurements.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ap = argparse.ArgumentParser()
ap.add_argument('role')
ap.add_argument('seed', type=int)
ap.add_argument('--preset', default='high')
ap.add_argument('--yaw', type=float, default=0.0)
ap.add_argument('--tex', type=int, default=0)
ap.add_argument('--lod-tex', type=int, default=1024)
ap.add_argument('--ref-chin', type=float, help='reference chin row by eye (fraction of height from the top)')
ap.add_argument('--roughness', type=float, default=0.9)
ap.add_argument('--no-regrade', action='store_true', help='keep the paint colours as Hunyuan made them')
args = ap.parse_args()

figures = json.load(open(os.path.join(P.HERE, 'figures.json')))
fig = figures[args.role]
att = os.path.join(P.WORK, args.role, f's{args.seed}-{args.preset}')
out = os.path.join(P.MODELS, args.role)
os.makedirs(out, exist_ok=True)
os.makedirs(P.GATES, exist_ok=True)


def sh(python, script, *argv):
    cmd = [python, os.path.join(P.HERE, script), *map(str, argv)]
    print('>>', os.path.basename(script), ' '.join(map(str, argv)), flush=True)
    r = subprocess.run(cmd, cwd=P.REPO, env=P.ENV, capture_output=True, text=True, encoding='utf-8', errors='replace')
    lines = r.stdout.strip().splitlines()
    result = [l for l in lines if l.startswith('{')]
    if not result and r.returncode != 0:  # bpy exits non-zero over unfreed memory after a good run: the JSON line is the verdict
        print(r.stdout[-2000:], r.stderr[-2000:])
        sys.exit(f'{script} failed')
    return result or lines


shutil.copyfile(os.path.join(P.WORK, args.role, 'cutout.png'), os.path.join(out, 'cutout.png'))
sh(P.PY2, 'scrub_glb.py', os.path.join(att, 'shape.glb'), os.path.join(out, 'shape.glb'), '--name', f'{args.role}-shape')

fin_args = [args.role, os.path.join(att, 'textured.glb'), '--yaw', args.yaw, '--tex', args.tex, '--lod-tex', args.lod_tex,
            '--roughness', args.roughness, '--out', out]
if not args.no_regrade:
    fin_args += ['--regrade', os.path.join(out, 'cutout.png')]
fin = json.loads(sh(P.PY21, 'finalize.py', *fin_args)[-1])
# the four PNG views (the front one is the gate's input) stay in the attempt folder; the repo gets the JPEG sheets
sh(P.PY21, 'render.py', os.path.join(out, 'textured.glb'), att, '--size', 768, '--keep-png')
shutil.move(os.path.join(att, 'turnaround.jpg'), os.path.join(out, 'turnaround.jpg'))
sh(P.PY21, 'render.py', os.path.join(out, 'textured-lod.glb'), att, '--size', 512, '--prefix', 'turnaround-lod', '--samples', 24)
shutil.move(os.path.join(att, 'turnaround-lod.jpg'), os.path.join(out, 'turnaround-lod.jpg'))

gate_args = [args.role, os.path.join(att, 'turnaround-front.png'), os.path.join(P.REPO, fig['reference']),
             os.path.join(P.GATES, f'{args.role}-model.jpg'), '--body', fig['body'],
             '--json', os.path.join(att, 'gate.json')]
if fin['landmarks'].get('chin_frac') is not None:
    gate_args += ['--chin', fin['landmarks']['chin_frac']]
if args.ref_chin is not None:
    gate_args += ['--ref-chin', args.ref_chin]
gate = json.loads(sh(P.PY2, 'gate.py', *gate_args)[-1])

attempt = json.load(open(os.path.join(att, 'attempt.json')))
for s in attempt['stages'].values():
    s['tail'] = [P.scrub(l) for l in s['tail']]
job = {
    'role': args.role, 'reference': fig['reference'], 'attempt': attempt, 'finalize': fin, 'gate': gate,
    'workDir': P.scrub(att), 'files': sorted(os.listdir(out)),
}
json.dump(job, open(os.path.join(out, 'job.json'), 'w'), indent=1)
print(json.dumps({'gate': gate, 'finalize': fin}, indent=1))
