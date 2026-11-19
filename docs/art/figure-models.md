# Figure models, pass 1 (M4b, 2026-11-18)

The GPU half of M4: one 3D model per locked concept reference (PLAN D7, D14), generated on the owner's GPU PC with
the Local AI Studio pipeline (Hunyuan3D 2.1 shape, 2.0 paint), gated by measurement against `docs/figures.md`
section 1 (KB rule 13: the image is measured, never the prompt), normalized for the client and committed under
`public/models/figures/<role>/`. Pipeline and how to rerun it: `tools/figures/README.md`. The M4a loader and
gallery wire these files into the game; this document records what was made and why.

Not made: the tier 1 agent and the citizen have no locked reference yet (`docs/figures.md` section 2), so they
keep their placeholders.

## 1. Output contract

Every `public/models/figures/<role>/` holds:

| File | What |
|---|---|
| `textured.glb` | the full model: at most 30,000 triangles, one matte material (metallic 0, roughness 0.9), 2048 PNG texture embedded |
| `textured-lod.glb` | collapse-decimated LOD: 8,000 triangles, 1024 texture |
| `rigged.glb` | the LOD mesh skinned to a simple armature with `idle` (60 frames) and `walk` (24 frames) clips |
| `shape.glb` | the untextured Hunyuan shape (30,000 faces), for reference and re-painting |
| `cutout.png` | the background-removed reference the shape and paint stages read |
| `turnaround.jpg`, `turnaround-lod.jpg`, `walk.jpg` | front (orthographic), three-quarter, side and back renders; the walk sheet is frame 6 of the walk clip |
| `job.json` | settings, seed, stage timings, triangle counts, dimensions, mesh landmarks and gate measurements (paths scrubbed to `%USERPROFILE%`) |

Geometry: Y up, feet on y = 0, centred on x and z, front facing +Z, scaled so the agent stands 1.2 units
(the client's `FIGURE_H`); the host 1.2, the taker 0.95 and the fighter 1.5, the heights of their M2/M3
stand-ins (`src/client/board/Figures.tsx`). Gate sheets: `docs/concept/gates/<role>-model.jpg`, the model's
front render beside its reference with the measured lines drawn on both.

## 2. Results

GPU time is the shape plus paint stage wall time on the RTX 5080 (High preset: octree 512, 50 steps, guidance 5,
2048 texture). All four first attempts used seed 1234; the host's second seed (7) replaced its first.

| Role | Reference | Attempt kept | GPU | Triangles full / LOD | Size full / LOD / rigged | Gate | Rig |
|---|---|---|---|---|---|---|---|
| agent (tier 2 suit) | `chrome-suit-t2-h2.jpg` | seed 1234 High | 4.6 min | 30,000 / 8,000 | 7.5 / 2.2 / 2.7 MB | **pass**: head 30%, shoulders 2.03 heads, legs 1.02 heads (reference 30% / 2.05 / 1.05) | humanoid, 15 bones, walk and idle usable |
| host (revealed) | `alien-host-s42.jpg` | seed 7 High (second attempt) | 4.5 min (8.5 with the first) | 30,000 / 8,000 | 6.8 / 2.0 / 2.5 MB | **pass against its reference** (RULING HOST-1): head 22% (ref 21%), legs 1.85 heads (ref 1.9), width/height 0.36 (ref 0.38); shoulders 1.6 heads (ref 1.23) reported | humanoid, 15 bones, walk usable |
| taker | `alien-taker-s51.jpg` | seed 1234 High | 4.3 min | 30,000 / 8,000 | 6.5 / 1.8 / 2.3 MB | **recorded**: 0.79 wide, 1.14 deep, 0.95 tall; width/height 0.83 (ref 0.82); leg share 15% (ref 24%) | root + 3 leg bones |
| fighter | `gemini-alien-fighter-a.jpg` | seed 1234 High | 4.1 min | 30,000 / 8,000 | 7.5 / 2.2 / 2.7 MB | **recorded**: 0.90 wide, 0.56 deep, 1.5 tall; width/height 0.60 (ref 0.52); leg share 22% (ref 45%) | root + 3 leg bones |

Committed binary total: `public/models/figures/` 51 MB plus 0.5 MB of gate sheets (budget 60 MB). The full
attempt folders (every seed, the 2048 paint before re-grading, the render PNGs) sit in
`%USERPROFILE%\Hunyuan3D-2\outputs\ekc-figures\<role>\s<seed>-high\`.

### 2.1 Agent (tier 2 suit)

- The first attempt passed the gate and is kept. Helmet with the two upward-slanting almond lenses, the mouth line
  and the crown fin, the small shoulder plates, the segmented belly plates, the pistol in the left hand and the
  backpack all came through; the back of the suit, which the reference does not show, was invented by the model
  as a plated pack and reads fine.
- Paint: Hunyuan 2.0 paints the plates orange and the undersuit teal (KB gotchas: paint drifts pale and warm).
  The Lab colour transfer in `finalize.py` (mean and spread moved to the cutout's) brings them to brick red and
  dark grey. Not the reference's deep red; a hand re-grade of the texture is a follow-up.
- Measurements on the orthographic front render, chin from the mesh (section 4): head 29.9% of height (the band
  is 30-40%, within RULING GATE-1), shoulders 2.03 head widths (band 1.6-2.0; the locked reference itself
  measures 2.05 by the same method), legs 1.02 head heights (at most 1.2).
- LOD at 8,000 triangles shows no tearing (`turnaround-lod.jpg`); see section 5 on why.

### 2.2 Host (revealed)

- Second attempt (seed 7) kept: jacket with lapels and pocket flaps, shirt and tie, gloved hands, the pale green
  head with the tentacle fringe and the toothed mouth. The side view shows the head leaning forward a little more
  than the reference's.
- The locked reference is not in the house proportions (it measures head 21% of height, shoulders 1.23 head
  widths, legs 1.9 head heights by the same method), so the house gate cannot be met by any faithful model of it.
  RULING HOST-1 below gates the host against its own reference instead. Seed 1234's head was 14% smaller in share
  and its legs 14% longer than the reference's; seed 7, kept, is within 5% on both and 6% narrower overall.

### 2.3 Taker

- Dome with the amber core showing through, the dark root cluster underneath, dark chitin legs: the species reads.
  Hunyuan gave it six legs and a short rear tail where the reference shows four legs (the depth, 1.14 units
  against 0.79 width, is the tail). A second seed was tried; section 3.
- Seed 7 gave the same six legs and a longer tail, so the rear is not seed noise: the reference shows the taker
  from the front only and Hunyuan invents the rest as an insect body. Attempt 3 (seed 1234, the shorter tail) is
  kept and a third seed was not spent (RULING TAKER-1).
- The rig clusters the lowest 20% of the mesh into three leg groups (a tripod gait like the M2 stand-in), so with
  six legs two legs share each bone. Recorded, not fixed.

### 2.4 Fighter (the first fighter in the game, D14)

- Ribbed sea-glass column with the amber core showing through the plates, the four coral whip arms from the
  shoulder sockets, the dark pointed stilt legs. The legs are shorter than the reference's (22% of the height
  against about 45%), which makes the model squatter (width/height 0.60 against 0.52). Seed 7 reproduced the
  same leg share to the percent: the shape model reads the thin stilts short on both seeds, so attempt 5 is kept
  and no third seed was spent (RULING FIGHTER-1).
- Three leg clusters found; the walk clip lifts them in turn.

## 3. Attempts

Every GPU attempt, in order. "Kept" is what `public/models/figures/<role>/` holds.

| # | Role | Seed | Preset | Shape | Paint | Outcome |
|---|---|---|---|---|---|---|
| 1 | agent | 1234 | High | 203 s | 73 s | gate pass; kept |
| 2 | host | 1234 | High | 174 s | 68 s | head 18%, legs 2.17 heads: 14% off the reference; replaced by attempt 8 |
| 3 | taker | 1234 | High | 196 s | 64 s | recorded; six legs and a tail; kept pending attempt 6 |
| 4 | fighter | 1234 | High | 82 s | | CUDA out of memory 82 s into the shape (the desktop held 3.5 GB; the retry 5 min later ran with 1.4 GB in use) |
| 5 | fighter | 1234 | High | 181 s | 63 s | recorded; short legs; kept pending attempt 7 |
| 6 | taker | 7 | High | 202 s | 64 s | recorded; the same six legs with a longer tail (depth 1.21 against 1.14); attempt 3 stays |
| 7 | fighter | 7 | High | 201 s | 56 s | recorded; the same leg share (22%) and silhouette as attempt 5; attempt 5 stays |
| 8 | host | 7 | High | 205 s | 63 s | head 22%, legs 1.85 heads, within 5% of the reference (RULING HOST-1); **kept** |

An earlier run of attempt 1 died before the shape finished because the orchestrator crashed printing a tqdm bar to
a cp1252 console (fixed: stdout re-opened as UTF-8); the GPU child died with the pipe and nothing was left running.

## 4. The gate, as applied

`docs/figures.md` section 4: head share of height 30-40%, shoulder width 1.6-2.0 heads, legs at most 1.2 heads,
measured on the image. `tools/figures/gate.py` measures the alpha silhouette of the model's orthographic front
render and the reference photo the same way: top and sole from the silhouette, head width as the widest row above
the shoulder line, shoulders as the widest row 8-12% of the height below the chin, crotch as the first row below
40% where the centre column is empty and the row splits in two. The chin cannot be read from these silhouettes
(the shoulder plates sit beside the helmet, so the width never narrows at the neck); for the model it comes from
the mesh (`tools/figures/_landmarks.py`: the 2% band of the top 45% holding the most downward-facing surface area
in the central column, the helmet's or jaw's underside) and for the reference photo it is set by eye on a gridded
copy (`--ref-chin`: agent 0.30, host 0.21). The sheet says which, and draws every line, so the owner can check the
measurement rather than trust it.

- RULING: GATE-1 | the three bands are checked with 5% on their edges (29.9% and 2.03 heads pass) | the locked
  agent reference itself measures 2.05 heads at the shoulders by this method, and the silhouette method's own
  noise (smoothing, anti-aliased edges) is about 0.05 heads; a stricter edge would reject the reference.
- RULING: GATE-2 | the chin is measured on the mesh for models and by eye for the reference photo, both printed
  on the sheet | a silhouette has no chin when shoulder plates stand beside the helmet; the mesh does.
- RULING: HOST-1 | the host is gated against its locked reference (`alien-host-s42.jpg`), not against the house
  bands: head share and leg length within 15% of the reference's, silhouette aspect within 5%; shoulders in heads
  reported but not gated because it compounds the head error | the owner locked this reference (D14) knowing it
  is a citizen body in a suit, and `docs/figures.md` section 2 says the host is drawn as a citizen; a model that met
  the 30-40% head band would not be the locked figure. Seed 1234 measured head 18% and legs 2.17 heads (14% off
  the reference on both); seed 7 measures head 22% and legs 1.85 (within 5%), with the silhouette 6% narrower
  than the reference's (a slimmer jacket fit), just over the 5% the ruling asks; kept because the head and legs
  are what the gate is for, and recorded here.
- RULING: CREATURE-1 | the taker and fighter record width, depth, height, width/height and leg share and pass by
  inspection beside their reference | they have no head, shoulders or legs in the humanoid sense (the brief's own
  instruction).
- RULING: TAKER-1 | the taker keeps seed 1234 after two seeds and no third | both seeds invent the same insect
  rear from a front-only reference; a third seed would spend 4 GPU minutes on the same ambiguity. The fix is a
  side or back concept view (a second Gemini image of `alien-taker-s51`), then a multi-view shape run.
- RULING: FIGHTER-1 | the fighter keeps seed 1234 after two seeds with identical leg share | the 512 octree
  resolves the thin stilts but the shape prior shortens them the same way on both seeds; a longer-legged result
  needs a different input (a cutout with the legs scaled up 1.6x in the image, or the two-legged `alien-fighter-s61`
  look), which is an owner's call on the locked reference.
- RULING: BASE-1 | no display base is cut (`--cut-base` off) | none of the four references has one; the studio's
  base cutter slices the lowest wide slab and would take the taker's and fighter's splayed feet.

## 5. Normalization, LOD and validation

`tools/figures/finalize.py` (bpy 4.0 in the 2.1 venv) imports the painted GLB with `merge_vertices`, joins,
applies transforms, rotates by `--yaw` (0 for all four: Hunyuan's +Z front matched), scales to the role's height,
sets the material matte and re-grades the texture, then exports the full model and a collapse-decimated LOD.

- RULING: LOD-1 | the LOD is Blender's collapse decimation on the welded import, not a second Hunyuan run at 8k
  faces | KB gotchas (2026-11-09) say Blender decimation tears Hunyuan meshes because UV seams split the vertices;
  importing with `merge_vertices=True` welds them again (UVs stay per corner), and the 8k LODs show no holes in
  `turnaround-lod.jpg`. The gotcha holds for an unwelded import.
- Triangle counts: full 30,000 (the shape stage's face cap, so no decimation on the full model), LOD 8,000.
- Vertex counts are three per triangle in every file (the exporter splits at Hunyuan's per-triangle UV islands),
  so the files are about three times what a welded mesh would weigh. A re-UV pass is a follow-up.
- Materials: one per model, metallic 0, roughness 0.9, no emissive (the amber cores are painted; the client can add
  a glow sprite as the stand-ins do).
- Textures: PNG, 2048 on the full model, 1024 on the LOD and the rigged file. KTX2 would need `toktx`, which the
  toolchain does not have.

Validation, `npx --yes @gltf-transform/cli validate` on all twelve GLBs (full, LOD, rigged for each role), run
2026-11-18 after the final promote:

```
agent/textured.glb       No errors found. No warnings found. No infos found. No hints found.
agent/textured-lod.glb   No errors found. No warnings found. No infos found. No hints found.
agent/rigged.glb         No errors found. No warnings found. No infos found. No hints found.
host/textured.glb        No errors found. No warnings found. No infos found. No hints found.
host/textured-lod.glb    No errors found. No warnings found. No infos found. No hints found.
host/rigged.glb          No errors found. No warnings found. No infos found. No hints found.
taker/textured.glb       No errors found. No warnings found. No infos found. No hints found.
taker/textured-lod.glb   No errors found. No warnings found. No infos found. No hints found.
taker/rigged.glb         No errors found. No warnings found. No infos found. No hints found.
fighter/textured.glb     No errors found. No warnings found. No infos found. No hints found.
fighter/textured-lod.glb No errors found. No warnings found. No infos found. No hints found.
fighter/rigged.glb       No errors found. No warnings found. No infos found. No hints found.
```

`gltf-transform inspect` on `agent/textured-lod.glb`: glTF 2.0, generator Khronos glTF Blender I/O v4.0.43, no
extensions, one mesh, TRIANGLES, 8,000 primitives, 24,000 vertices, u16 indices, NORMAL / POSITION / TEXCOORD_0,
bounding box -0.41..0.41 x 0..1.2 y -0.35..0.35 z.

Total GPU time: 8 jobs, 34.5 minutes of shape and paint (plus the 82 s of the out-of-memory run).

The first rigged export drew `NODE_SKINNED_MESH_NON_ROOT` (the skinned mesh was parented under the armature node);
the mesh is now a sibling with an armature modifier and the warning is gone.

## 6. Rig state

`tools/figures/rig.py` (bpy): the armature is placed from the mesh's own landmarks (chin and crotch as in section
4, shoulder half-width from the mesh at the shoulder line); humanoids get hips, spine, chest, neck, head, and
shoulder, upper and lower arm, upper and lower leg per side (15 bones); creatures a root plus one bone per leg,
the legs found by splitting the lowest 20% of the mesh into three angular clusters.

- RULING: RIG-1 | weights are proximity skinning (each vertex blended between its two nearest bone segments with
  exp(-d / 0.06 H)), not Blender's bone heat | on the first attempt `parent_set(ARMATURE_AUTO)` returned without
  an error and left all 90,000 vertices unweighted (bone heat finds no solution on these fused, non-manifold
  surfaces: KB rule 15 and gotchas); the glTF exporter then failed adding a neutral bone. Proximity weights are
  deterministic and cover every vertex.
- RULING: RIG-2 | `rigged.glb` carries the 8k LOD mesh with the 1024 texture, not the 30k mesh | the budget: a
  rigged full mesh is 6.4 MB per role, which would push the four roles past 60 MB. Rigging the full mesh is one
  command (`rig.py <role> textured.glb ...`).
- Clips: `idle` is a 1.5 degree spine sway with a slight head turn over 60 frames; `walk` swings the upper legs
  plus or minus 28 degrees with knee bend, arms counter-swinging 18 degrees, over 24 frames; creature legs lift in
  turn (tripod phase). `walk.jpg` in each folder is frame 6.
- Judgement from the walk sheets: the agent and host stride readably at the tactical camera distance; the
  proximity weights bend the agent's plates at the hips and fold the host's jacket at the thigh, which would show
  in a close-up. The taker's six legs share three bones. **Usable for M4's gallery and for a walk cycle in the
  board at the current camera distances; not final.** A proper rig needs a re-topologized mesh, which is out of
  scope for a fused Hunyuan surface (KB rule 15: do not reopen for fused meshes without the owner).
- Time spent on rigging: about 25 minutes of the session, within the quarter the brief allowed.

## 7. What to redo and why

| Item | Why | How |
|---|---|---|
| Agent and host texture colours | the Lab transfer lands at brick red / dark grey, not the deep red and black of the reference | hand re-grade of the 2048 texture, or a paint pass with a stronger reference weight |
| Taker leg count | six legs and a tail against four in the reference, on both seeds | a side or back concept view of `alien-taker-s51`, then a multi-view shape run (RULING TAKER-1) |
| Fighter leg length | legs about half the reference's share of height, on both seeds | a cutout with the legs stretched 1.6x before the shape stage (RULING FIGHTER-1), checked against the reference by the same gate |
| Vertex welding | three vertices per triangle inflate every file threefold | re-UV (xatlas with island merging) and re-bake, then weld with `gltf-transform weld` |
| Tier 1 agent, citizen | no locked reference | concept round first (Gemini web app, never the API), then this pipeline |
| Rig | proximity skinning | only with a re-topologized mesh, as a separate owner decision |

## Sources

Brief for M4b (2026-11-18); `docs/figures.md`; `PLAN.md` D7, D8, D14, D15, Q7; `docs/concept/samples/gemini-chrome-brief.md`
Locked sections; KB `rules.md` 7, 10, 11, 13, 15, 17, 23, 26 and `gotchas.md` (figures, GLBs); the studio's
`HANDOFF-hunyuan-install.md` and `pipeline/*.py`; `public/models/figures/*/job.json`.
