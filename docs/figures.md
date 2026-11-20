# Figures: the measured house style for this game

Written before any figure work (KB rule 7 scope note; `PLAN.md` D8); section 4.1 added after the first GPU pass (M4b). Every figure, placeholder or generated, is gated against this file by measurement, and the image is checked, not the prompt (KB rule 13). Words that may never appear in a prompt are KB rule 23; the list is not copied here.

## 1. The style, in measurements
The owner chose the house figure style of KB rule 7, animated (D8: it "should work better for animation. Use that"). The tier 2 suit reference `docs/concept/samples/chrome-suit-t2-h2.jpg` is the on-style figure every new figure is laid beside (D7).

| Measure | Value | Check |
|---|---|---|
| Height | about 2.8 head-heights | count heads in the image |
| Head or helmet | about 35% of the standing height | head height / total height |
| Shoulders | about 1.8 times the head's width, armoured, very broad | shoulder width / head width |
| Legs | short and thick, about one head long | hip to sole / head height |
| Face | covered (helmet or visor) or stern; never a child's | |
| Finish | matte, realistic paint with edge highlights, like a premium painted miniature; serious and highly detailed | |
| Pose | standing square, weapon low; one neutral pose per figure until animation says otherwise | |
| Base | none; feet on the tile | |

## 2. Rosters and colours
| Figure | Colours and marks | Reference |
|---|---|---|
| Agent, tier 1 (plain security gear) | Bright red (`#c8322a`) plates over black (`#1b1b1f`) underlayer; single black visor; no silver, no chest light, no crest | D7; `docs/GAME-DESIGN.md` 5; candidates `chrome-suit-t1-1` (gate PASS) and `chrome-suit-t1-2` (round 8, 2026-11-20, `sheet-11-tier1-citizen.jpg`), owner to pick |
| Agent, tier 2 (moulded suit) | Same colours, smooth shell helmet with two upward-slanting almond lenses | `chrome-suit-t2-h2.jpg` (locked) |
| Citizen | Enamel cream coat (`#e7dcc1`) over graphite (`#3b3f44`), bare head, stern | candidates `chrome-citizen-1` (man, briefcase) and `chrome-citizen-2` (woman, handbag), the host's body (round 8, 2026-11-20, `sheet-11-tier1-citizen.jpg`), owner to pick |
| Host, passing as a citizen | Drawn exactly as a citizen until revealed (spec HIDE-1) | `gemini-alien-host-a`, `chrome-host-2` once revealed up close |
| Host, revealed | Citizen body with sea-glass green (`#7fc8b0`) skin and an amber (`#e0a030`) core glow at the throat; coral growth on the head | `alien-host-s42` (locked, D14) |
| Taker | The organism that takes hosts: sea-glass body with an amber core on dark chitin legs | `alien-taker-s51` / `alien-taker-s52` (locked, D14) |
| Fighter (in the game since M3, template `fighter`) | Headless sea-glass column with an amber core on three dark chitin stilt legs, four coral whip arms | `gemini-alien-fighter-a`, **the first fighter in the game** (owner, 2026-11-17, D14); `alien-fighter-s61` (two-legged, crested) is a later or elite type |

## 3. Placeholders (M2, M3; rebuilt in M4 pass 1)
M2 drew procedural stand-ins in the colours above to the measurements in section 1; M3 added the fighter's. **M4 pass 1 rebuilds them** in `src/client/board/placeholders.tsx`, shared by the board (`Figures.tsx`) and the gallery (`?gallery`, `src/client/Gallery.tsx`), with every part named (`head`, `torso`, `leg`, `arm`, `boot`, `pauldron`, `core`, ...) so the gallery **measures the built mesh** instead of trusting the constants (KB rule 13). They carry no pointer handlers and no raycast (KB rule 25) and are only ever replaced, never shown while a model loads (KB rule 26). No image is generated in this pass (the GPU pass does that, section 4).

| Role (`models.ts` `FIGURE_ROLES`) | Placeholder | Measured in the gallery (2026-11-18) |
|---|---|---|
| `agent-t1` | Red plates over a black underlayer; squared helmet with one black visor band, a jaw guard and a red brim; shoulder plates, a chest seam, a belt, dark gloves and red-edged boots, a short carbine held low along the right thigh | head 35%, shoulders 1.80 heads, legs 1.0 heads: PASS |
| `agent-t2` | Same body; a smooth spherical shell helmet with two upward-slanting almond lenses (teal glint), an engraved mouth line and a thin crown fin (`chrome-suit-t2-h2.jpg`, D7). Not yet a unit template; the gallery shows it so the GLB slot exists | PASS |
| `citizen` | Cream coat with graphite lapels and trousers, bare head with a dark hair cap and a brow line, stern | PASS |
| `host-hidden` | The citizen, exactly (HIDE-1); listed so the slot reads the same model | PASS |
| `host-revealed` | Citizen body, sea-glass head with a deep-green brow, an **amber core** at the throat (shared pulsing `CORE_MATERIAL`), three coral growths on the crown | PASS |
| `taker` | Low sea-glass body (two spheres) on **six** dark chitin legs in two joints, a biting head low in front with two chitin jaws, a ridge along the back, the amber core on top. 0.55 tall | by eye against `alien-taker-s51/52` |
| `fighter` | Headless sea-glass column (0.9) on three stilt legs with knees and splayed feet, a chitin band, a deep-green cap, four coral whip arms in two segments with tips, the amber core at mid-height. 1.45 tall | by eye against `gemini-alien-fighter-a` |

Gates in the gallery (section 4 numbers): head share 30 to 40%, shoulders 1.6 to 2.0 heads, legs at most 1.2 heads, applied to the five humanoid roles; the two aliens are measured and judged by eye against the locked D14 references. `e2e/gallery.spec.ts` holds every humanoid at PASS.

**GLB slot per role** (`src/client/models.ts` `FIGURE_SLOTS`): filled by the GPU pass for `agent-t2`, `host-revealed`, `taker` and `fighter` with `public/models/figures/<agent|host|taker|fighter>/textured.glb` (30k triangles, drawn within 12 units of the camera), `textured-lod.glb` (8k, drawn beyond, through drei's `Detailed`) and `rigged.glb` (listed, not yet drawn: the client does not animate, D8). Every url is preloaded at startup (`preloadModels`, the start switch counts 8 files), drawn by `FigureModel` through `Suspense fallback={null}`, and falls back to the placeholder only when a file is missing or fails (rule 26); the GLBs carry no pointer handlers and a no-op raycast (rule 25). The amber cores are painted, not emissive, so one additive glow sprite per alien (`glow` in the slot) keeps the stand-ins' pulse. `agent-t1` has no locked reference and wears the tier 2 model until it has one (RULING AGENT-1); `citizen` and `host-hidden` have none and keep their stand-ins. The gallery names each slot's state (`placeholder`, `loading`, `ready`, `failed`) and what the cell really drew (`GLB` or `stand-in`), measures a GLB's height from its mesh and, since a generated figure is one unnamed mesh, takes its ratios from the pipeline's render gate (section 4.1) with the ruling named in the gate column.

## 4. When figures are generated (M4, the GPU pass)
- One prompt per figure, the first with the style reference attached, through the Gemini web app in Claude in Chrome (never the API, owner's spend decision), with the locked references of D7 and D14 attached for suits and aliens.
- Gate per image: head share of height within 30-40%, shoulder width 1.6-2.0 heads, legs at most 1.2 heads, white background, no base. A side-by-side with `chrome-suit-t2-h2.jpg` goes in `docs/concept/gates/`.
- Figures that predate this file are listed here with the date they are regenerated (KB `gotchas.md`, figures).

### 4.1 The gate as applied (M4b, 2026-11-18; full report `docs/art/figure-models.md`)
M4b went straight from the locked references to 3D (Hunyuan3D 2.1 shape, 2.0 paint on the owner's GPU) and gated the **model's orthographic front render** with `tools/figures/gate.py`, the reference photo measured the same way beside it (`docs/concept/gates/<role>-model.jpg`). Head width is the widest row above the shoulder line, shoulders the widest row 8-12% of the height below the chin, the crotch the first row below 40% where the centre column splits. The chin cannot be read from a silhouette whose shoulder plates stand beside the helmet, so **the chin comes from the mesh** (`_landmarks.py`: the 2% band of the top 45% holding the most downward-facing surface in the central column) and for the reference photo is set by eye on a gridded copy; the sheet says which (RULING GATE-2). **The three bands are checked with 5% on their edges** (RULING GATE-1): the locked agent reference itself measures 2.05 heads at the shoulders by this method and the silhouette noise is about 0.05 heads, so a strict edge would reject the reference. The gallery applies the same 5% to a generated figure's render-gate numbers.

| Role | Reference | Result | Ruling |
|---|---|---|---|
| Agent, tier 2 | `chrome-suit-t2-h2.jpg` | **PASS**: head 29.9%, shoulders 2.03 heads, legs 1.02 heads (reference 30% / 2.05 / 1.05) | GATE-1, GATE-2 |
| Host, revealed | `alien-host-s42.jpg` | **PASS against its reference**: head 22% (ref 21%), legs 1.85 heads (ref 1.9), silhouette 6% narrower; shoulders 1.6 heads reported, not gated | HOST-1: the locked reference is a citizen body (head 21%), so the house bands cannot be met by any faithful model of it; the host is gated within 15% of its own reference on head share and leg length |
| Taker | `alien-taker-s51.jpg` | **recorded**: 0.79 wide, 1.14 deep, 0.95 tall; width/height 0.83 (ref 0.82); leg share 15% (ref 24%); six legs and a tail on both seeds | CREATURE-1 (creatures record width, depth, height and leg share and pass by inspection); TAKER-1 (seed 1234 kept after two seeds; the fix is a side or back concept view) |
| Fighter | `gemini-alien-fighter-a.jpg` | **recorded**: 0.90 wide, 0.56 deep, 1.5 tall; width/height 0.60 (ref 0.52); leg share 22% (ref 45%) on both seeds | CREATURE-1; FIGHTER-1 (seed 1234 kept; longer legs need a stretched cutout or the two-legged `s61` look, an owner's call) |

Also ruled there: BASE-1 (no display base cut), LOD-1 (the 8k LOD is Blender collapse decimation on a `merge_vertices` import, which does not tear), RIG-1 (proximity skinning, because bone heat silently left the fused mesh unweighted), RIG-2 (`rigged.glb` carries the LOD mesh, for the 60 MB budget). **Not generated:** the tier 1 agent and the citizen (and so the hidden host) have no locked reference yet and go through a concept round first; the citizen and hidden host keep their stand-ins. **RULING AGENT-1** (owner, 2026-11-19, "Yes, use it"): the tier 1 squad is drawn with the generated tier 2 suit in the meantime, so the playable shows models from its first frame instead of six stand-ins; the gallery marks the cell `GATE-1, AGENT-1`, and the slot goes back to a tier 1 model once that reference is locked and generated. Texture colours (brick red and dark grey rather than deep red and black), the taker's leg count, the fighter's leg length and a re-UV weld are the redo list in `figure-models.md` section 7.

## Sources
KB `rules.md` 7, 13, 15, 23, 26; `PLAN.md` D7, D8, D14; `docs/concept/samples/gemini-chrome-brief.md` Locked sections.
