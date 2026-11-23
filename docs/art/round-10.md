# Art round 10: generated art for what was procedural (2026-11-22)

The owner asked for generated art wherever the game still drew procedural shapes: the title screen, the buildings in
the tactical and strategic modes, the furniture inside the buildings, and the aliens still on stand-ins (PLAN D28).
Everything ran on the owner's GPU (RTX 5080, 16 GB) through local, permissively licensed models: no paid API, no
Gemini, no Hugging Face router.

| Stage | Tool | Licence |
|---|---|---|
| Concept images and edits | FLUX.2 klein 4B through the local Flux Studio (`tools/concept/flux_local.mjs`) | Apache-2.0 |
| Background cutout | rembg (in the Hunyuan3D-2 venv) | MIT |
| Shape | Hunyuan3D 2.1 (`tools/figures/stage_shape.py`) | Tencent Hunyuan community |
| Paint | Hunyuan3D 2.0 paint (`tools/figures/stage_paint.py`) | Tencent Hunyuan community |
| Normalize, renders, rig | Blender 4.0 as `bpy` (`finalize.py`, `render.py`, `rig.py`) | GPL (tool only) |

## 1. Concept round (checkpoint A)
102 images from 49 prompt items (`docs/concept/samples/r10/prompts-r10.json`; one more edit, the broadcast tower's
sign painted out, was made after the picks). Prompts describe shapes in measurements and materials only (KB rule
23) and were checked against `docs/GAME-DESIGN.md` section 5 (KB rule 29). Contact sheets
`docs/concept/samples/r10/sheet-r10-1..7-*.jpg`; the picks, numbered, `sheet-r10-picks-a/b/c-*.jpg`. **The owner
approved all 35 picks on 2026-11-22** ("These all look great").

- Alien craft: round 9's three craft all failed as built aircraft. Prompting each as one natural object with the word
  "craft" left out (a spindle seed pod with hoops, a lumpy gourd with an amber pod cluster, a ring-segmented larva)
  gave pearl and chitin shapes that read as grown. The seeder pick (`alien-seeder-s144`) had a small green stem,
  removed by a klein edit (`alien-seeder-nostem-s150`: no green on aliens, D25).
- Repaint references: klein edits of the locked D14 references, green to pearl and coral to amber filament ridges and
  chitin tendrils (Q22), shapes unchanged: `repaint-host-s161`, `repaint-taker-s163`, `repaint-fighter-s166`.
- Title: the owner chose **the full painting** (`title-backdrop-s174`, portrait `title-backdrop-tall-s176`).
- Tile textures: 16 materials x 2 seeds; picks in `public/textures/tiles.json` `sources`.

## 2. Title screen
`public/title/backdrop.webp` (1791 x 997, the paper border cropped) and `backdrop-tall.webp` (1019 x 1814) under the
poster (`src/client/Poster.tsx` `useBackdrop`). With the painting loaded only the clouds, the civilian cars and the
patrol car stay animated on top; the drawn sky, layers, rail, train and towers are hidden. If the file fails the
poster draws in full as before.

## 3. Tactical buildings: textures, not models
Walls and floors break tile by tile (D16 c), so a whole-building model cannot stand in for them. Instead the tile
boxes wear generated material swatches (`src/client/board/surface.ts`):

- `tools/concept/pack_textures.py` makes each swatch seamless (a crop to the length that wraps best on each axis,
  then a half-roll blend under a 12% feathered border) and packs the 16 layers into `public/textures/tiles.webp`
  (512 x 8192, 581 KB) with `tiles.json` (layer names, each layer's mean colour, sources). Preview:
  `docs/concept/samples/r10/sheet-textures-tiled.jpg`.
- One `DataArrayTexture`, sampled triplanar from world position, so a wall of separate boxes reads as one brick wall
  and no UVs are needed. Each tile instance carries its layer in `aSurf` (-1: none).
- **The swatch adds detail, not colour:** the shader multiplies the tile's existing colour by texel / layer mean
  (clamped 0.35 to 1.8), so the style palettes, damage, visibility, path, blast and hover tints keep their meaning.
- Mapping (mirrors `baseColour`): outer walls brick (residential, street), render (office), ashlar (bank), steel
  (depot), enamel (automat); plaster and steel walls by material; floors parquet, linoleum, marble, concrete;
  roofs tar, gravel, lead; stairs and rubble concrete; the ground paving.
- PLAIN scenery and a failed load both set `uSurfOn` to 0: the plain colours.
- RULING: ART-12 | tactical buildings get textures on the tile boxes, not models | destructible tiles (D16 c) and
  the one pick mesh per level (KB rule 25) rule out a building mesh; the textures change no geometry, no pick and no
  draw call (the same instanced mesh per level) | closes ART-5 for the tile set. provisional
- Known: the chequer, lead and enamel swatches show a faint ghost of the blend; chequer is in the strip but no tile
  uses it.

## 4. Models
One pipeline for every object (`tools/figures/objects.json`, `batch_objects.py`): cutout, Hunyuan3D 2.1 shape
(Standard: octree 384, 50 steps), reduced to the object's budget **before** painting, Hunyuan3D 2.0 paint at 2048,
then `finalize.py --align` (turns the model so its smallest footprint rectangle is square to the axes, by the
smallest turn) with the texture shrunk and stored as WebP. Every result is logged in `round-10-models.json`.

- RULING: LOWPOLY-1 | below 20k faces the shape stage halves the mesh with planar quadrics and no topology lock,
  and keeps Hunyuan's own reducer instead when that stays closer to the 20k mesh (area and box) | Hunyuan's reducer
  (topology lock on, one step) folded a 1.5k desk into a few huge triangles, and a collapse decimation after painting
  did the same; the halving kept the desk whole at 1,432 triangles but folded the power station's lattice pylons, and so did the fallback, so the power station ships its 20k mesh. provisional
- Budgets: furniture 1,500 triangles and a 512 texture (the largest raid site, about 400 props, stays far under the
  2 M triangle budget); city buildings 8,000 and 1024; vehicles 3,000 and 1024; craft 6,000 and 1024.

Review sheet: `docs/art/shots/round-10-models.jpg` (three-quarter render of each).

| Asset | Reference | Triangles | Size | Notes |
|---|---|---|---|---|
| `props-desk` | `prop-desk-s102.jpg` | 1,432 | 158 KB |  |
| `props-counter` | `prop-counter-s104.jpg` | 1,500 | 161 KB |  |
| `props-shelf` | `prop-shelf-s105.jpg` | 1,498 | 169 KB |  |
| `props-bed` | `prop-bed-s107.jpg` | 1,495 | 168 KB |  |
| `props-locker` | `prop-locker-s110.jpg` | 1,500 | 166 KB |  |
| `props-machine` | `prop-machine-s111.jpg` | 1,499 | 165 KB | the top is painted white (the reference never showed it); the board's high camera sees it |
| `props-lamp` | `prop-lamp-s113.jpg` | 1,500 | 161 KB |  |
| `props-kiosk-sign` | `prop-kiosk-sign-s115.jpg` | 1,500 | 154 KB |  |
| `props-bench` | `prop-bench-s117.jpg` | 1,500 | 163 KB |  |
| `props-vehicle` | `prop-vehicle-s120.jpg` | 1,496 | 173 KB | the reference's orange tail fin came through as painted |
| `props-planter` | `prop-planter-s121.jpg` | 1,486 | 186 KB |  |
| `props-tank` | `prop-tank-s124.jpg` | 1,500 | 161 KB |  |
| `props-vent` | `prop-vent-s125.jpg` | 1,499 | 163 KB |  |
| `props-mast` | `prop-mast-s127.jpg` | 1,496 | 167 KB |  |
| `props-crate` | `prop-crate-s130.jpg` | 1,500 | 177 KB |  |
| `buildings-office` | `bldg-office-s41.jpg` | 8,000 | 852 KB | a thin dark slab is left where the paving was cut off |
| `buildings-bank` | `bldg-bank-s55.jpg` | 7,997 | 807 KB |  |
| `buildings-broadcast` | `bldg-broadcast-nosign-s213.jpg` | 7,997 | 851 KB |  |
| `buildings-residential` | `bldg-apartments-s48.jpg` | 7,893 | 849 KB |  |
| `buildings-power` | `bldg-power-s49.jpg` | 20,000 | 2012 KB | 20k triangles: the lattice pylons fold under 8k (LOWPOLY-1); the only building over 1.1 MB |
| `buildings-hq` | `bldg-hq-s51.jpg` | 8,000 | 832 KB |  |
| `buildings-automat` | `bldg-automat-s131.jpg` | 8,000 | 879 KB |  |
| `buildings-depot` | `bldg-depot-s134.jpg` | 8,000 | 827 KB |  |
| `buildings-civic` | `bldg-civic-s135.jpg` | 7,999 | 854 KB |  |
| `buildings-works` | `bldg-works-s138.jpg` | 7,986 | 834 KB |  |
| `vehicles-patrol-car` | `patrol-car-b-s13.jpg` | 2,999 | 334 KB |  |
| `vehicles-van` | `transport-van-s22.jpg` | 3,000 | 348 KB |  |
| `vehicles-civilian` | `car-civilian-s140.jpg` | 3,000 | 357 KB |  |
| `craft-scout` | `alien-scout-s141.jpg` | 5,999 | 623 KB |  |
| `craft-seeder` | `alien-seeder-nostem-s150.jpg` | 5,912 | 674 KB |  |
| `craft-carrier` | `alien-carrier-s148.jpg` | 6,000 | 620 KB |  |

### 4.1 How the client draws them
- `src/client/models.ts` `ASSET_SLOTS`: 31 slots, each preloaded with the figures, drawn through
  `Suspense fallback={null}`, and the procedural piece kept on a missing or failed file (KB rule 26). No pointer
  handlers: the pick meshes stay the only targets (rule 25).
- `src/client/board/glbFit.ts` merges a model into one geometry and one material fitted to the box of the piece it
  replaces, so every placement, footprint and test is unchanged and one instanced mesh per kind still draws all of a
  kind. Furniture fits by **footprint** (fills the tile footprint, own height within 40%); a model whose long side
  runs across the old piece's is turned a quarter.
- City buildings (`CityScene.tsx`): one instanced mesh per kind, fitted by footprint per lot. Night windows and the
  hum stay rules-driven: `patchGlass` (`board/windows.ts`) marks as glass the texels clearly darker than their 16 x
  16 neighbourhood (18 to 27% of nine of the ten textures, the bank 6%), lights a stable hashed share of them by
  night as the procedural windows do, and lights them all in the emissive amber for the hum and turned buildings. A
  colour rule (dark and blue-leaning) was tried first: it found 0 to 5% on the bank, the apartments and the broadcast
  tower and would have lit the depot's blue roof.
- Vehicles: the agency's patrol car and van (`CityOverlays.tsx` `makeCar`), civilian traffic (`CityDressing.tsx`),
  and the parked saloon prop. Craft (`CityScene.tsx` Sky): scout, seeder, carrier, each with its core glow sprite.
- `?gallery` gains a second canvas and table (`src/client/AssetGallery.tsx`): every slot on a grid with its state
  and whether the GLB was drawn.

## 5. The spitter and the D25 repaint
Sheet: `docs/art/shots/round-10-aliens.jpg`.

- **Spitter** (`alien-spitter-s152`, figures.json `spitter`, High preset, seed 1234): a pearl pear body with amber
  filament seams on four dark chitin legs, the amber spore sac at the front under a chitin tube. 0.61 wide, 0.78 deep,
  0.9 tall (0.75 figure units); recorded by eye (CREATURE-1). Rigged with the legs rig (`rig.py --kind legs`: root plus
  three leg bones, proximity weights, 0 unweighted vertices) with `idle` and `walk`; `walk.jpg` beside it.
  `Figures.tsx` `roleOf` sends the spitter to its own role, and its stand-in in `placeholders.tsx` is the same body
  in primitives. RULING STRAY-3 (the spitter wore the taker's body) is closed.
- **Repaint, not remodel (D25, Q22):** `tools/figures/repaint.py` cuts out the role's new paint reference and runs only
  the 2.0 paint stage on the kept shape of the promoted attempt (`s<seed>-repaint`), then `promote.py --preset
  repaint` and `rig.py` as before. `figures.json` keeps each role's `shapeReference` (the D14 reference the shape was
  made from) beside its new `reference`. Shapes, dimensions and gate figures are unchanged (host 22% head, HOST-1;
  taker and fighter recorded).
  - Host: the paint pushed the pearl head to a saturated sky blue at the back and sides; `finalize.py --calm-hue
    185,260` keeps a quarter of the saturation of that hue band, which leaves a silver-pearl head with the amber crown
    growths (`job.json` records it). The jacket, trousers and gloves are outside the band.
  - Taker: a pearl shell crazed with amber lines over the dark chitin legs.
  - Fighter: a pearl column with a dark chitin cap and four chitin tendril arms threaded with amber.
- The stand-ins follow: no coral and no sea-glass green in `placeholders.tsx`; the host's crown is three amber ridges.
- Gallery: nine cells, every one a GLB, four core glows (`e2e/gallery.spec.ts`).

## 6. Size
RULING: BUDGET-2 | committed GLBs may reach 130 MB (BUDGET-1 was 100 MB) | the round 10 assets add 15.4 MB (31 files) and the spitter about 11 MB, taking `public/models/` from 90 to 116 MB; the 30k
figure models now preload only on `?gallery`, so the board's first load does not grow. provisional

## 7. GPU time
Concept round: 103 klein jobs at about 12 s each (about 25 min). Objects: 93 min of shape and paint over 31 models plus the reruns (the desk three times while the reduction was found, the power station twice); the batch took 101 min end to end with finalize and renders on the CPU. Figures: 7.0 min (the spitter's shape and paint, three paint-only repaints). One GPU job at a time throughout (KB rule 10); Flux Studio was stopped before the first Hunyuan job.
