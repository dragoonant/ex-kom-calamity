# tools/figures: the figure model pipeline (M4b)

Turns a locked concept reference (`docs/concept/samples/`, PLAN D7 and D14) into the GLBs under
`public/models/figures/<role>/`, gated by measurement against `docs/figures.md`. Results and rulings:
`docs/art/figure-models.md`. Everything runs on the owner's GPU PC with the Local AI Studio installed
(`HANDOFF-hunyuan-install.md` in the studio repo); the scripts never touch the studio's `server.js`.

## What it needs

| Need | Where | Why |
|---|---|---|
| Hunyuan3D-2 venv (Python 3.11) | `%USERPROFILE%\Hunyuan3D-2\.venv` (or `HY2_DIR`) | background cutout (rembg), 2.0 paint, PIL/numpy for the gate |
| Hunyuan3D-2.1 venv (Python 3.10, has bpy 4.0) | `%USERPROFILE%\Hunyuan3D-2.1\.venv` (or `HY21_DIR`) | 2.1 shape, finalize, renders, rig |
| weights | `%USERPROFILE%\.cache\hy3dgen` | loaded with `HF_HUB_OFFLINE=1`; nothing downloads |
| gltf-transform | `npx --yes @gltf-transform/cli` | validation and inspection of the GLBs |

Work files go to `%USERPROFILE%\Hunyuan3D-2\outputs\ekc-figures\<role>\` (override with `FIGURES_WORK`): the
cutout once per role, then one folder per attempt `s<seed>-<preset>\` with `shape.glb`, `textured.glb`,
`attempt.json`, the four render PNGs and `gate.json`. Nothing in the repo holds an absolute path:
`_paths.py` resolves everything from the user profile and scrubs it to `%USERPROFILE%` in `job.json`.

## The run, per figure

```bash
# 1. one GPU attempt: cutout (cached) -> 2.1 shape (High: octree 512, 50 steps) -> 2.0 paint (2048)
"%USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe" tools/figures/run.py agent --seed 1234 --preset high
```

```bash
# 2. promote the attempt that passes: finalize + LOD, turnaround sheets, gate sheet, job.json (CPU only)
"%USERPROFILE%\Hunyuan3D-2\.venv\Scripts\python.exe" tools/figures/promote.py agent 1234 --ref-chin 0.30
```

```bash
# 3. rig attempt (humanoid: 15 bones; legs: root + one bone per leg) from the LOD, with idle and walk clips
"%USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe" tools/figures/rig.py agent public/models/figures/agent/textured-lod.glb public/models/figures/agent/rigged.glb --kind humanoid
```

```bash
# 4. a posed render to judge the rig, and validation
"%USERPROFILE%\Hunyuan3D-2.1\.venv\Scripts\python.exe" tools/figures/render.py public/models/figures/agent/rigged.glb public/models/figures/agent --prefix walk --clip walk --frame 6 --size 512
```

```bash
npx --yes @gltf-transform/cli validate public/models/figures/agent/textured.glb
```

`figures.json` holds each role's reference, world height (the agent is 1.2 units, the client's `FIGURE_H`),
body kind (humanoid figures are gated; creatures record their dimensions), preset, face and texture targets, and
the seed order for retries. One GPU job at a time (KB rule 10): `run.py` is sequential and `promote.py`, `render.py`
and `rig.py` are CPU only (Cycles on the CPU), so they can run while the next shape job holds the GPU.

## Scripts

| Script | venv | Does |
|---|---|---|
| `run.py` | any | one attempt: spawns the three stages below in their venvs, writes `attempt.json` with timings |
| `stage_cutout.py` | 2.0 | reference JPEG -> RGBA cutout (rembg), longest side 1536 |
| `stage_shape.py` | 2.1 | cutout -> `shape.glb` (Hunyuan3D 2.1, floaters and degenerate faces removed, face count capped) |
| `stage_paint.py` | 2.0 | `shape.glb` + cutout -> `textured.glb` (Hunyuan3D 2.0 paint) |
| `finalize.py` | 2.1 (bpy) | normalize (Y up, feet at the origin, front +Z, height from `figures.json`), matte material, Lab colour transfer to the cutout, textures as PNG, the full GLB (at most 30k triangles) and the collapse-decimated LOD (8k, 1024 texture); prints the mesh landmarks |
| `render.py` | 2.1 (bpy) | front (orthographic), three-quarter, side and back on white, as one JPEG sheet; `--clip`/`--frame` pose a rigged GLB |
| `gate.py` | 2.0 | measures the silhouette (head share, shoulders in heads, legs in heads) on the model's front render and on the reference, draws the side-by-side gate sheet, prints the verdict |
| `rig.py` | 2.1 (bpy) | armature from the mesh landmarks, proximity skinning, `idle` and `walk` clips, skinned GLB |
| `promote.py` | any | finalize, renders, gate and `job.json` for one attempt |
| `_paths.py`, `_landmarks.py` | | shared: venv and folder resolution with scrubbing; chin and crotch from the mesh |

## Gate (docs/figures.md section 1, measured on the image: KB rule 13)

Humanoids: head 30-40% of the height, shoulders 1.6-2.0 head widths, legs at most 1.2 head heights, with 5% on
the band edges (RULING GATE-1 in `docs/art/figure-models.md`). The chin cannot be read from a silhouette whose
shoulder plates sit beside the helmet, so the model's chin comes from the mesh (`_landmarks.py`) and the
reference photo's from `--ref-chin`, set by eye on a gridded copy and printed on the sheet. Creatures (taker,
fighter) record width/height and leg share and pass by inspection against the reference.

## Known limits

- Hunyuan paint drifts pale and warm (KB gotchas); `finalize.py --regrade` moves the texture's Lab mean and spread
  to the cutout's. It brings the agent's plates from orange to brick red, not to the reference's deep red.
- The glTF exporter splits every vertex at Hunyuan's UV islands (three vertices per triangle), so the GLBs are
  about three times the size a welded mesh would be. A re-UV pass is the fix, not in this round.
- Blender's bone-heat weights give nothing on these fused surfaces; the rig uses proximity skinning (two nearest
  bones, blended by distance), which bends the plates at the joints. Good enough for a tactical camera, not for
  close-ups (docs/art/figure-models.md, rig state).
- `bpy` exits non-zero after a good run over unfreed memory; the callers read the JSON line, not the exit code.
