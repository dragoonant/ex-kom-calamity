r"""Repaint a promoted figure without remodelling it (D25 / Q22, round 10): a new cutout from the role's paint
reference in figures.json, then only the 2.0 paint stage on the kept shape of the promoted attempt. Run with any Python 3:

  python tools/figures/repaint.py <role>

Reads the promoted attempt from public/models/figures/<role>/job.json, writes
%USERPROFILE%\Hunyuan3D-2\outputs\ekc-figures\<role>\s<seed>-repaint\ (shape.glb copied, textured.glb, attempt.json)
and makes the new cutout the role's cutout.png (the old one is kept as cutout-shape.png). Then promote it:

  python tools/figures/promote.py <role> <seed> --preset repaint
"""
import json
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths as P

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
role = sys.argv[1]
fig = json.load(open(os.path.join(P.HERE, 'figures.json')))[role]
job = json.load(open(os.path.join(P.MODELS, role, 'job.json')))
seed, preset = job['attempt']['seed'], job['attempt']['preset']
role_dir = os.path.join(P.WORK, role)
src_att = os.path.join(role_dir, f's{seed}-{preset}')
att = os.path.join(role_dir, f's{seed}-repaint')
os.makedirs(att, exist_ok=True)
shutil.copyfile(os.path.join(src_att, 'shape.glb'), os.path.join(att, 'shape.glb'))
cutout = os.path.join(role_dir, 'cutout.png')
keep = os.path.join(role_dir, 'cutout-shape.png')
if not os.path.exists(keep):
    shutil.copyfile(cutout, keep)

record = {'role': role, 'reference': fig['reference'], 'shapeReference': fig.get('shapeReference'), 'seed': seed,
          'preset': 'repaint', 'shapeFrom': f's{seed}-{preset}', 'texture': fig['texture'], 'stages': {},
          'started': time.strftime('%Y-%m-%d %H:%M:%S')}


def run(name, script, argv):
    t0 = time.time()
    r = subprocess.run([P.PY2, os.path.join(P.HERE, script), *map(str, argv)], cwd=P.REPO, env=P.ENV,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = [l.strip()[-300:] for l in (r.stdout + r.stderr).replace('\r', '\n').split('\n') if l.strip()][-8:]
    record['stages'][name] = {'seconds': round(time.time() - t0), 'ok': r.returncode == 0, 'tail': [P.scrub(l) for l in tail]}
    json.dump(record, open(os.path.join(att, 'attempt.json'), 'w'), indent=1)
    print(f'== {name}: {"ok" if r.returncode == 0 else "FAILED"} in {record["stages"][name]["seconds"]}s', flush=True)
    if r.returncode:
        print('\n'.join(tail))
        sys.exit(1)


run('cutout', 'stage_cutout.py', ['--src', os.path.join(P.REPO, fig['reference']), '--out', cutout])
run('paint', 'stage_paint.py', ['--mesh', os.path.join(att, 'shape.glb'), '--image', cutout,
                                '--out', os.path.join(att, 'textured.glb'), '--texture', fig['texture']])
record['finished'] = time.strftime('%Y-%m-%d %H:%M:%S')
record['gpuSeconds'] = record['stages']['paint']['seconds']
json.dump(record, open(os.path.join(att, 'attempt.json'), 'w'), indent=1)
print(f'repainted: {P.scrub(att)}', flush=True)
