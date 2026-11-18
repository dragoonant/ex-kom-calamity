# Figures: the measured house style for this game

Written before any figure work (KB rule 7 scope note; `PLAN.md` D8). Every figure, placeholder or generated, is gated against this file by measurement, and the image is checked, not the prompt (KB rule 13). Words that may never appear in a prompt are KB rule 23; the list is not copied here.

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
| Agent, tier 1 (plain security gear) | Bright red (`#c8322a`) plates over black (`#1b1b1f`) underlayer; single black visor; no silver, no chest light, no crest | D7; `docs/GAME-DESIGN.md` 5 |
| Agent, tier 2 (moulded suit) | Same colours, smooth shell helmet with two upward-slanting almond lenses | `chrome-suit-t2-h2.jpg` (locked) |
| Citizen | Enamel cream coat (`#e7dcc1`) over graphite (`#3b3f44`), bare head, stern | none yet; placeholder |
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

**GLB slot per role** (`src/client/models.ts` `FIGURE_SLOTS`): `url: null` now. The GPU pass drops a rigged GLB into `public/models/<role>.glb`, fills the url, and the figure is preloaded at startup (`preloadModels`, the start switch counts it), drawn by `FigureModel` through `Suspense fallback={null}`, and falls back to the placeholder only when the file is missing or fails (rule 26). The gallery names each slot's path and state (`placeholder`, `loading`, `ready`, `failed`) and measures a GLB by nodes named head, torso or chest, leg, thigh or boot.

## 4. When figures are generated (M4, the GPU pass)
- One prompt per figure, the first with the style reference attached, through the Gemini web app in Claude in Chrome (never the API, owner's spend decision), with the locked references of D7 and D14 attached for suits and aliens.
- Gate per image: head share of height within 30-40%, shoulder width 1.6-2.0 heads, legs at most 1.2 heads, white background, no base. A side-by-side with `chrome-suit-t2-h2.jpg` goes in `docs/concept/gates/`.
- Figures that predate this file are listed here with the date they are regenerated (KB `gotchas.md`, figures).

## Sources
KB `rules.md` 7, 13, 15, 23, 26; `PLAN.md` D7, D8, D14; `docs/concept/samples/gemini-chrome-brief.md` Locked sections.
