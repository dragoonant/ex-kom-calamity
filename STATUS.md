# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-18 | **Milestone:** M4a done (art and audio pass 1 without the GPU: the block's tile set and props, evening light and effects, the figure gallery, 23 synthesized sounds) | **Last commit:** see `git log -1`

**Play it:** `npm install`, `npm run dev`, open the printed URL. `?gallery` on the URL opens the figure gallery, `sounds.html` the sound desk. Private Artifact build (PLAN D12, D15): https://claude.ai/artifact/NtYezrJFZ5cYKuVs475YUG (owner only until shared; republish with `npm run build`, `npm run artifact`, `node tools/check-artifact.mjs`, then publish `dist-artifact/city-of-tomorrow.html` to that URL). Shots: `docs/art/shots/m4-*.png` (street and block, desktop and phone, cut-away, gallery, sound desk; remade by `npm run e2e`); `docs/screenshots/m3-*.png` stay as the M3 record (`npm run shot`). `?ai=none` on the URL plays the M2 way, `?ai=random` the random AI.

## What works now
| Area | State | Evidence |
|---|---|---|
| Spec | `docs/spec/10-rules.md`: 134 rule ids in 23 sections, 49 rulings, every tuning number cited as `section.key = N`. New in M4a: MAP-9 (styles and props as set dressing the rules never read) and two rulings; five art rulings (ART-1..5) live in `docs/art/tile-set.md` section 7 | `npm run validate:data` checks the props (kinds, tiles, no prop under a spawn) and the styles; `tests/coverage.test.ts` fails on an id without a test |
| Data | As M3, plus `halcyon-block` carries a `style` per building (residential, office, bank, depot, automat) and **416 props** of 15 kinds placed by `npm run map:make` from the room plans (`tools/make-block.ts`); the tile rows are byte-identical to M3, so saves, goldens, sim and bench are untouched | `npm run validate:data` prints the prop count; `tests/structure-blast.test.ts` MAP-9 |
| Engine | Unchanged since M3 (contract frozen, PLAN D17; golden hash `5a89285c`) | `npm test`: 152 tests (143 M3 + 9 M4a) |
| AI | Unchanged since M3 | `npm run bench:ai` 95.0% (190/200) on 2026-11-18, identical to M3 |
| Headless sim | `npm run sim`, `npm run action-fuzz`: clean on 2026-11-18, rows unchanged | baselines below |
| Client: tile set | `src/client/board/tileset.ts` (pure geometry, vitest-measured), `Tiles.tsx`: the pick mesh per level is still the only object with pointer handlers (KB rule 25) and now the body of every tile coloured by style; ten instanced dressing layers (cornices, plinths, glowing window panes lit by a stable draw, mullions, door leaves that swing when used, four treads a stair, rubble chunks, scorch bands, kerb seams, roof gravel) refilled only when tiles or the cut-away change. `Props.tsx`: one instanced mesh per prop kind (merged vertex-coloured geometry) plus four emissive glow meshes; a prop leans and darkens on a damaged floor and vanishes with a collapsed one (RULING MAP-9, ART-3) | `e2e/art.spec.ts`: 323 panes, 113 leaves, 168 treads at level 6; `tests/client-art.test.ts` |
| Client: light and effects | Fixed early evening (`Scene.tsx` `EveningLights`, RULING ART-1): warm low sun, cool sky, no shadow maps; amber alien cores pulse through one shared material. `src/client/fx.ts` turns engine events into an fx queue the store fills (hidden shooters make nothing, structure is public); `Effects.tsx` draws muzzle flashes, tracers, sparks, breach debris and collapse dust from two instanced pools; particles freeze while paused | `e2e/art.spec.ts` (blast and breach fx), `tests/client-art.test.ts` |
| Client: figures | `placeholders.tsx`: every role a table of named parts merged into **one vertex-coloured geometry** (one draw plus the core), rebuilt to `docs/figures.md`: tier 1 and tier 2 agents, citizen, revealed host, six-legged taker, stilt-legged fighter; hp bars as two instanced meshes. `models.ts`: a GLB slot per role (`public/models/<role>.glb`, `url: null` now), preloaded at startup and drawn through `Suspense fallback={null}`, placeholder only when missing or failed (KB rule 26) | `?gallery` (`src/client/Gallery.tsx`): every role beside a head-height ruler, measured from the parts; five humanoids PASS (head 35%, shoulders 1.68 to 1.96 heads, legs 1.0 heads); `e2e/gallery.spec.ts` |
| Client: sound | `src/client/audio/synth.ts`: 23 Web Audio sounds, no samples (fire by weapon class, hits by side, breach, collapse, bite, taking, revealed, the two-tone alert, down, pause and resume clacks, clicks, paddle, order, refused, raid over, the city bed); `director.ts` plays them from the fx queue, the paddle, the slips and every switch, unlocked by the first gesture; `sounds.html` (`src/sounds.tsx`) plays each by hand. Volume and mute: the console's SOUND switch and slider, persisted under `ekc-audio` (PLAN Q19), apart from the save | `e2e/sound.spec.ts`; `window.__ekc.audio()` counts plays headless. **Not verified by ear** (KB rule 9) until the owner listens |
| Frame budget | `window.__ekc.perf()`: draw calls, triangles, instances, frame times. Whole block at level 6: **44 draw calls, 397,080 triangles**, `advance(1)` with the AI 22 ms headless; street level 37 draws, cut-away at level 3 33 draws (budget: 120 draws, 2 M triangles, 900 ms). `node tools/perf.mjs` on the owner's machine (Chromium on the discrete GPU, 2026-11-18): **16.7 ms a frame, 60 fps, vsync-bound** on all three views (worst frame 35 ms during the cut-away rebuild). An integrated GPU was not available to measure; the draw and triangle counts are a tenth of what one draws at 60 fps | `e2e/art.spec.ts`; `tools/perf.mjs` |
| Save/Continue, KB rules 24-27, Look | As M3; `npm run check:look` 0 hits on 2026-11-18 (now covers `sounds.html` and `src/sounds.tsx`) | `e2e/save.spec.ts`, `e2e/rules.spec.ts`, `tools/check-look.mjs` |
| Build | Two self-contained pages (`vite.config.ts`, `vite.sounds.config.ts`); `npm run artifact` inlines the game; `node tools/check-artifact.mjs` opens the built page as a file and prints its perf report | `npm run build` |
| Art | Procedural tile set, props, light, effects and figures as above (`docs/art/tile-set.md`); no image generated, no GLB, no texture (M4b, the GPU pass) | `docs/art/shots/` |
| Audio | 23 synthesized sounds as above; no generated or recorded audio | `sounds.html` |

## Balance baselines (KB rule 30)
Nothing in M4a touches the rules, the data the rules read, or the AI. The M3 rows stand and were rerun on 2026-11-18:

### Sim drivers (`npm run sim`, 40 battles per pair, seeds 1-40, `first-raid`)
| Driver pair | Agency wins | Mean sim seconds | Agents down / battle | Civilian hits / battle | Hit rate |
|---|---|---|---|---|---|
| random vs random | 100% | 25.4 | 0.57 | 0.40 | 55.0% |
| sweep vs stand | 100% | 32.0 | 0.10 | 0.00 | 59.8% |

Block demolition sweep (`block-raid`, 4 battles capped at 500 ticks): 48 charges, 34 tiles destroyed, 88 steps between levels, 12 hostiles down, 0 agents down, 0 invariant failures.

### AI bench (`npm run bench:ai`, 200 battles, 100 per seat, seeds 1-100, `bench-raid`)
| Seat | Battles | Normal wins | Random wins | Draws | Mean sim seconds | Agents down / battle | Hostiles down / battle | Taken / battle | Civilian hits / battle |
|---|---|---|---|---|---|---|---|---|---|
| normal hostiles vs random agents | 100 | 98.0% | 2.0% | 0 | 25.1 | 5.97 | 1.99 | 2.14 | 5.43 |
| normal agents vs random hostiles | 100 | 92.0% | 8.0% | 0 | 46.2 | 1.90 | 8.18 | 0.37 | 4.91 |
| **both seats** | **200** | **95.0% (190/200)** | 5.0% | 0 | | | | | |

Determinism: seed 1 in the hostile seat replays to the same hash (`59bd6fcd`). Gate (PLAN M3, 95% over at least 200): **PASS, with no margin**, as in M3. Do not tune against these numbers blindly: the balance pass (PLAN Q9) is still next, one number at a time.

## Gates (run before every commit)
`npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` | `npm run check:look` (all pass on 2026-11-18). The e2e uses port 5181 (`PW_PORT` to change) and reuses a dev server already on it; this milestone ran it on 5187 against a dev server started by hand (KB gotchas: port reuse serves a stale sibling build). 16 e2e tests: `smoke`, `save`, `rules`, `ai` (M2, M3), `art` (3), `gallery` (1), `sound` (2).

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| `PLAN.md` Q1-Q21 (Q19 audio settings, Q20 fixed evening light, Q21 synthesized sounds are new) | owner | as written there |
| 49 provisional rulings in `docs/spec/10-rules.md` section 17 (2 new: props are dressing; dressing lives in the map file) and 5 art rulings in `docs/art/tile-set.md` section 7 | owner may confirm or reverse any | as written there |
| The sounds themselves | owner, by ear on `sounds.html` | first draft, not verified by ear |
| The fighter's and the whip's numbers, the `ai` tuning section, everything marked *(tune)* since M1 | owner, with a `sim` or `bench:ai` result (KB rule 30) | first guesses *(tune)* |
| Citizens that run (PLAN Q18) | owner or the balance pass | they stand (RULING CIV-1) |

## Known limits of the playable
- One agent is selected at a time (PLAN Q6); no drag box, no "select all" yet.
- Props are dressing: no cover, no obstacle, no breaking of their own (RULING MAP-9); a prop under a figure is never placed, but a unit may walk through one.
- Figures are merged placeholders, unanimated; rigged GLBs, images and textures are the GPU pass (M4b, PLAN Q7). The tier 2 agent exists only in the gallery (no `agent-t2` template yet).
- Sound is synthesized and unjudged; there is no music, no voice (presentation concept section 3 waits for the audio pass).
- Frame times were measured on the owner's discrete GPU (60 fps, vsync-bound, 44 draws on the whole block), not on an integrated one; `node tools/perf.mjs` prints them on any machine.
- The hostile AI, the phone tiers and the Artifact-viewer check are as M3.

## Known failing (left alone on purpose)
None.

## Next
1. M4b, the GPU pass on evilaegis (PLAN Q7): figure images through the Gemini web app gated by measurement (`docs/figures.md` 4), rigged GLBs into `public/models/<role>.glb` and `models.ts`, textures or GLBs for the tile set by name (`docs/art/tile-set.md` 8), generated audio behind the synth names once the owner has judged `sounds.html` by ear.
2. The balance pass (PLAN Q9): rerun `sim` and `bench:ai` after each single change; decide Q18 (citizens that run) with a bench result.
