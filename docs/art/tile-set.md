# The tile set: buildings, streets and props of the first block (M4, pass 1)

What the client draws for every tile kind of `docs/spec/10-rules.md` MAP-2 and every prop of MAP-9, per building style, in each destructible state (STR-2..4), in the D11 register ("Civil Defence switchboard of the City of Tomorrow", `docs/presentation-concept.md`). Pass 1 is procedural three.js geometry with no textures and no GPU-made assets; the GPU pass (`PLAN.md` M4b) may replace any piece by name without changing the map format. Everything here is **dressing**: the rules never read a style or a prop (RULING MAP-9). Code: `src/client/board/tileset.ts` (geometry, palettes, layers, props), `Tiles.tsx` (the pick mesh and the layers), `Props.tsx`, `Effects.tsx`, `Scene.tsx` (light). Shots: `docs/art/shots/`.

## 1. How it is built (one draw per layer, picking on the pick mesh only)
| Piece | What | Instancing | Picking |
|---|---|---|---|
| Pick mesh | One `InstancedMesh` per drawn level, one box per tile scaled into the tile's **body**: ground slab, floor slab, wall body, window sill and spandrel, door frame, stair tread base, rubble bed. Coloured per tile (style, roof, damage, visibility, hover, path, blast) | 3,600 instances a level, 7 levels | **The only object with pointer handlers** (KB rule 25), as in M2; `window.__ekc.tileAtScreen` raycasts these alone |
| Dressing layers | Ten `InstancedMesh`es across every drawn level: `trim` (cornices, lintels, sills), `plinth`, `glass` (window panes, emissive), `mullion` (window bars, door handles, stair rail), `leaf` (door leaves, swung when open), `step` (four treads a stair), `chunk` (rubble pieces), `scorch` (damage bands), `kerb` (paving seams), `gravel` (roof pebbles) | Buffers sized once per map (`layerCapacity`), refilled only when the tiles change or the cut-away moves | none (`raycast` no-op) |
| Props | One `InstancedMesh` per prop kind (15) across every level, each a **merged vertex-coloured geometry** so a many-part desk is one instance; four kinds add an emissive glow mesh (lamp heads, vending displays, the kiosk sign, the mast beacon) | 416 props on the block | none |
| Figures | Placeholders in `placeholders.tsx` (`docs/figures.md` section 3) or a rigged GLB per role from `models.ts` | per unit | none |
| Effects | Two `InstancedMesh`es (debris 320, flashes 64) fed by the store's fx queue (`src/client/fx.ts`) | pooled | none |

Draw calls on the whole block at level 6: 7 pick meshes + 10 layers + 15 props + 4 glows + 2 effects + figures (each placeholder is 15 to 30 meshes; about 30 units) = about 110. The e2e `e2e/art.spec.ts` holds the block under 120 draw calls and 2 M triangles and times `advance(1)` plus the following frame (section 6).

## 2. Styles (MAP-9 `buildings[].style`) and their palettes
Every colour is a role of `src/styles.css` or a material of the block carried into 3D. `STYLE_PALETTE` in `tileset.ts`.

| Style | Building (Q14) | Outer wall | Partition | Floor | Roof | Door | Glow | Furniture note |
|---|---|---|---|---|---|---|---|---|
| `residential` | Halcyon Arms, 6 floors | warm brick `#b86a4c` | plaster `#e6dcc6` | parquet `#d9c9a8` | tar `#7d7466` | walnut `#5f3e2c` | warm `#ffc478` | beds, lockers, a desk per flat; a concierge counter and planters in the lobby |
| `office` | Meridian Wireless, 4 floors | rendered stone `#c4b79b` | pale `#eee8d8` | linoleum `#cfd3cf` | gravel grey `#6e7378` | teal `#3f7f82` | fluorescent `#dfe9c8` | two desks and a shelf per room, a machine in the lobby, the **mast** on the roof |
| `bank` | Civic Savings, branch 12, 3 floors | ashlar `#9c8d78` | cream `#ece4d2` | marble `#b9a98f` with a runner stripe on the ground floor | lead `#6b6a66` | deep teal `#2f5f62` | lamp gold `#ffd27a` | counters along the banking hall, benches for customers; desks, lockers (deposit boxes) and shelves above |
| `depot` | Depot 7, 2 floors | sheet steel `#7d8a94` | plaster `#d9d2c0` | concrete `#9a9a94` | `#5f666c` | mustard `#d9a62e` | sodium `#fff1c0` | racks of shelves between the pillars, crates, a machine, lockers and a desk in the back office |
| `automat` | Sunbeam Automat, 1 floor | enamel `#e0c9a6` | `#f4ece0` | **chequer** `#f0e6d2` / teal `#3f7f82` | `#8a8072` | coral `#d9533f` | `#ffe9a0` | vending machines along the long wall, a counter, benches in rows |
| `street` | streets, courtyard, kiosk | brick `#a8624a` (planters, kiosk) | | paving `#aab3a8` with kerb seams every 6 tiles | | | | lamps, benches, planters, parked saloons, the kiosk sign, two crates by the depot door |

Materials keep their own reading whatever the style: a `steel` wall is always the depot grey, a `plaster` partition always pale, and the rubble of each takes its colour (section 4).

## 3. Tiles and props by kind
### Tiles (MAP-2)
| Kind | Intact | Damaged (hp below the material's, STR-3) | Rubble or gone (STR-4) |
|---|---|---|---|
| `ground` | paving slab, kerb seam every sixth tile | never damaged (STR-2) | |
| `floor` | slab in the style's floor colour; a roof (level = building `floors`) in the roof colour with sparse gravel | darkened by hp share, a dark patch | level 0: rubble bed and three chunks; above: `void`, nothing drawn, the prop on it is gone |
| `wall` | full-height body (2.0) on lower levels, cut to 0.9 on the active level; cornice strip on top; plinth band at the foot (outer walls); partitions thinner and pale | body darkens; a dark scorch band across the lower half grows with the damage | rubble bed, three chunks in the wall's colour, one pale (plaster), one charred |
| `window` | sill and spandrel (lower 34%), a pane (upper 55%) **lit or dark by a stable draw** (62% lit) with the style's glow, a cross mullion, a sill strip; the pane, mullions and crack turn to lie in the wall's own line (`openingYaw`: a quarter turn when the wall-like neighbours run north-south, else east-west) | pane cracked (a dark streak) | as a wall's rubble, glass pale |
| `door` | frame (full height, a third deep), a leaf 78% high in the style's door colour, a handle, a lintel; **open** (MAP-3): the leaf swung on its west hinge into the south half of the tile | leaf darkens | rubble |
| `stair` | tread base plus four rising steps along x, a rail bar on the north side; never damaged (RULING STR-2) | | |
| `rubble` | rubble bed and three chunks at stable angles | | |
| `void` | nothing | | |

### Props (MAP-9 `props[]`, `PROP_KINDS`)
Sizes in tiles; a figure is 1.2 tall. Where a style places them is section 2; `tools/make-block.ts` writes them from the room plans. **State:** intact on an intact floor; **askew and darkened** (tilt 0.12 to 0.37 rad, tint to 45%) when the tile under it is damaged, its glow out; **gone** when the tile is rubble or void.

| Kind | Height | Parts | Where |
|---|---|---|---|
| `desk` | 0.8 | top, two pedestals, a tray and a teal desk lamp | offices, flats, bank upper floors, depot office |
| `counter` | 0.7 | counter, enamel front panel, a till | bank hall, automat, residential lobby |
| `shelf` | 1.2 | two uprights, three shelves, three coloured boxes | offices, bank, depot racks, automat |
| `bed` | 0.7 | frame, mattress, pillow, teal blanket, headboard | flats |
| `locker` | 1.5 | body, two teal doors, two handles | flats, bank, depot office |
| `machine` | 1.6 | coral vending body, **lit display**, tray, button, chrome top | automat, lobbies, depot |
| `lamp` | 3.3 | teal post, base, arm, **glowing head**, enamel shade | streets every 8 tiles, the courtyard |
| `kiosk-sign` | 2.3 | post, enamel board with a **coral lettering band**, teal rail | the courtyard kiosk |
| `bench` | 0.8 | seat, two steel legs, back rail | courtyard, bank hall, automat |
| `vehicle` | 1.0 | 1.9-tile two-tone saloon: teal body, cream trim line, glass bubble cabin, cream roof, two coral tail fins, four wheels, **headlamp strip** | kerbside in the streets |
| `planter` | 1.0 | brick box, cream rim, two tiers of green | courtyard, lobbies |
| `tank` | 1.6 | stem, drum, coral lid, four legs | every roof |
| `vent` | 0.9 | housing, drum, cream cap, dark grille | every roof |
| `mast` | 4.6 | pole, base, two cross bars, a dish, **coral beacon** | the office roof |
| `crate` | 0.6 | box, three bands, a mustard stencil plate | depot, outside its door |

## 4. Light and glow (Scene.tsx `EveningLights`, `EVENING`)
Fixed early evening (RULING ART-1 below): a hemisphere light (sky `#9fb8c9`, ground `#6b5a4a`, 0.95), a warm low sun from the west (`#ffb774`, 1.5, from (-28, 16, 12)), a cool fill from the north-east (`#7fa7b8`, 0.35), the canvas cleared to a dusk grey `#c7bfb2` (light, not black: the concept's "must not look like" list). No shadow maps. Glow is emissive geometry only: window panes (`glass` layer, emissive 0.55 tinted per instance), lamp heads, vending displays, the kiosk sign and the mast beacon (`PROP_GLOW`), and the **amber alien core** (`CORE_MATERIAL`, one material pulsing 0.3 to 1.2 at 3.1 rad/s on every revealed host, taker and fighter). No point lights.

## 5. Effects from engine events (fx.ts, Effects.tsx)
| Event | Effect | Sound (`audio/synth.ts`) |
|---|---|---|
| `shot` by a shooter the squad sees (or at its own) | muzzle flash at the shooter's chest height (warm for agency, amber for hostiles, sea-glass for melee) and a tracer bar to the target for 0.09 s | `fire-pistol`, `fire-carbine`, `fire-scatter`, `fire-whip`, `bite` by weapon |
| `damaged` on a seen unit | five sparks (red for agents, amber for hostiles) and a white flash | `hit-armour` / `hit-alien` / `hit-flesh` by side |
| `blast` | a 1.6-tile amber flash, 18 charred chunks and 10 dust puffs thrown outward | `breach` |
| `tileDestroyed` to rubble | 18 chunks in the material's colour (brick, plaster, steel, glass, timber) and dust | `breach` |
| `tileDestroyed` to void (collapse) | 30 chunks falling with grey dust | `collapse` |
| `down`, `fell` on a seen unit | dust at the feet | `down-agent` / `down-hostile` / `hit-flesh` |
| `revealed`, `taken` (seen) | an amber bloom at the throat for 0.5 s | `revealed` or `taking`, then the two-tone `alert` |
Particles freeze while the sim is paused (pause is the absence of ticks and of time). Nothing is drawn for what the agency cannot see (VIEW-2, AI-9); structure is public (VIEW-1).

## 6. Frame budget (e2e `art.spec.ts`; `window.__ekc.perf()`)
| Measure | Budget | Why |
|---|---|---|
| Draw calls, whole block at level 6 | at most 120 | about 40 meshes of structure and props plus the figures; an integrated GPU draws a few hundred instanced calls at 60 fps |
| Triangles | at most 2,000,000 | 25,200 tile boxes (12 tris each) + dressing + props + figures sit near 0.9 M |
| `advance(1)` with the hostile AI, the whole block | under 900 ms on the test machine (headless) | the sim is 0.14 ms a tick; the time is the React commit and the board's refill, which only run when tiles change |
| Instances | glass 323, leaves 113, steps 168 at level 6; 3,600 tile instances a level | the counts `make-block` prints, so the e2e sees every window |
Headless Chromium draws through SwiftShader at a few frames a second, so wall-clock fps is not asserted there; the counts are. `node tools/perf.mjs` opens Chromium on the machine's GPU and prints real frame times: on 2026-11-18 (the owner's discrete GPU) the street, the whole block and the cut-away all ran at 16.7 ms a frame, 60 fps vsync-bound, worst frame 35 ms on the cut-away's rebuild; 44 draws and 0.4 M triangles leave an integrated GPU a wide margin, but one was not measured.

## 7. Rulings (art; the spec's rulings stay in `docs/spec/10-rules.md`)
- RULING: ART-1 | A fixed early-evening light instead of a time-of-day cycle | The city layer (M5) owns the clock; a battle lasts minutes, and a fixed rig is one shader state for the scene-start budget (KB recipe step 9). provisional
- RULING: ART-2 | Window lighting is a stable per-tile draw (62% lit), not a map field | Lit rooms are dressing with no rules meaning; a stable hash keeps saves and screenshots identical, and the map format gains nothing from 323 booleans. provisional
- RULING: ART-3 | A damaged prop leans and darkens; it never breaks on its own | Props have no health (RULING MAP-9); the tile's health is the only truth, so the prop shows it. provisional
- RULING: ART-4 | Effects and sounds only for what the agency sees, structure excepted | The fx queue is built from the same `view` the tray uses (VIEW-2, AI-9); tiles are public (VIEW-1), so a far breach is heard and seen. provisional
- RULING: ART-5 | Pass 1 ships no textures and no GPU assets | The owner's GPU host (PLAN.md Q7) is not reachable from this session; the merged-geometry props and style palettes are designed so a GLB per kind can replace a merged geometry by name in `propGeometry` without touching the map or the layers. provisional

## 8. For the GPU pass (M4b)
- Replace `propGeometry(kind)` with a loaded GLB per kind (same origin: standing on y = 0, facing +z, one tile wide); keep the glow parts as separate emissive meshes or bake emissive into the GLB.
- Facade textures (brick courses, enamel panels, signage) as a small atlas on the pick mesh and the layers; the palettes above are the colour keys.
- Rigged figures into `public/models/<role>.glb` and `FIGURE_SLOTS[role].url` (`models.ts`); the gallery measures them by named nodes (head, torso, leg).
- Shadows: a single directional shadow map on the active level only, if a phone tier allows it (M9).

## Sources
`PLAN.md` D11, D16, M4; `docs/presentation-concept.md` section 3; `docs/spec/10-rules.md` MAP-2, MAP-3, MAP-8, MAP-9, STR-2..4, VIEW-1, VIEW-2; `tools/make-block.ts`; KB `rules.md` 21, 25, 26; KB `gotchas.md` (instancing with rule 25, additive materials need `fog: false`, hidden panes throttle frames).
