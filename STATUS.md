# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-18 | **Milestone:** M4 done (M4a: the block's tile set and props, evening light and effects, the figure gallery, 23 synthesized sounds; M4b: four generated figure models gated by measurement, reconciled with the loader so the game draws them) | **Last commit:** see `git log -1`

**Play it:** https://dragoonant.github.io/ex-kom-calamity/ (GitHub Pages, branch `gh-pages`, a build of `main` pushed by hand, PLAN D12), or `npm install`, `npm run dev`, open the printed URL. `?gallery` on the URL opens the figure gallery, `sounds.html` the sound desk. Private Artifact build (PLAN D12, D15): https://claude.ai/artifact/NtYezrJFZ5cYKuVs475YUG (the phone-friendly copy; republish with `npm run build`, `npm run artifact`, `node tools/check-artifact.mjs`, then publish `dist-artifact/city-of-tomorrow.html` to that URL; the Artifact tool serves no `.glb` supporting file under any content type, so the Artifact always falls back to the stand-ins and the Pages build is the one with the models). Shots: `docs/art/shots/m4-*.png` (street and block, desktop and phone, cut-away, gallery, a generated fighter on the board; remade by `npm run e2e`); `docs/screenshots/m3-*.png` stay as the M3 record (`npm run shot`). `?ai=none` on the URL plays the M2 way, `?ai=random` the random AI.

## What works now
| Area | State | Evidence |
|---|---|---|
| Spec | `docs/spec/10-rules.md`: 134 rule ids in 23 sections, 49 rulings, every tuning number cited as `section.key = N`. MAP-9 (styles and props as set dressing the rules never read); five art rulings (ART-1..5) in `docs/art/tile-set.md` section 7; ten figure rulings (GATE-1, GATE-2, HOST-1, CREATURE-1, TAKER-1, FIGHTER-1, BASE-1, LOD-1, RIG-1, RIG-2) in `docs/art/figure-models.md`, summarized in `docs/figures.md` 4.1 | `npm run validate:data` checks the props and the styles; `tests/coverage.test.ts` fails on an id without a test |
| Data | As M3, plus `halcyon-block` carries a `style` per building and **416 props** of 15 kinds placed by `npm run map:make`; the tile rows are byte-identical to M3, so saves, goldens, sim and bench are untouched | `npm run validate:data` prints the prop count |
| Engine | Unchanged since M3 (contract frozen, PLAN D17; golden hash `5a89285c`) | `npm test`: 152 tests |
| AI | Unchanged since M3 | `npm run bench:ai` 95.0% (190/200) on 2026-11-18, identical to M3 |
| Headless sim | `npm run sim`, `npm run action-fuzz`: clean on 2026-11-18, rows unchanged | baselines below |
| Client: tile set, light, effects | As M4a: `src/client/board/tileset.ts` and `Tiles.tsx` (one pick mesh per level, still the only object with pointer handlers, KB rule 25, plus ten instanced dressing layers), `Props.tsx`, `Scene.tsx` `EveningLights` (RULING ART-1), `fx.ts` and `Effects.tsx` | `e2e/art.spec.ts`, `tests/client-art.test.ts` |
| Client: figures | **Four generated models drawn** (M4b, `docs/art/figure-models.md`): `src/client/models.ts` `FIGURE_SLOTS` points `agent-t2`, `host-revealed`, `taker` and `fighter` at `public/models/figures/<agent|host|taker|fighter>/textured.glb` (30k triangles, within 12 units of the camera) and `textured-lod.glb` (8k, beyond, through drei `Detailed`); all eight files are preloaded at startup (the start switch counts them), drawn by `FigureModel` through `Suspense fallback={null}`, stand-in only on a failed load (KB rule 26), no pointer handlers and a no-op raycast (rule 25). The amber cores are painted, so one additive glow sprite per alien pulses with the stand-ins' core material. `rigged.glb` (`idle` and `walk` clips) is listed in the slots and not yet drawn. `agent-t1` wears the tier 2 suit until its own reference is locked (RULING AGENT-1, owner 2026-11-19); `citizen` and `host-hidden` keep the M4a merged-geometry stand-ins (no locked reference yet) | `?gallery` (`src/client/Gallery.tsx`): every role beside a head-height ruler; the cell reports what it really drew (GLB or stand-in), a GLB's height from its mesh (agent and host 1.00 figure units, taker 0.79, fighter 1.25) and its ratios from the pipeline's render gate with the ruling named; `e2e/gallery.spec.ts` asserts the GLBs drawn in five cells, three core glows, 5/5 humanoid gates |
| Client: sound | As M4a: 23 Web Audio sounds, the director, `sounds.html`, volume and mute under `ekc-audio` (PLAN Q19). **Not verified by ear** (KB rule 9) until the owner listens | `e2e/sound.spec.ts` |
| Frame budget | `window.__ekc.perf()`; the e2e budget is 120 draws, 2 M triangles, 900 ms for `advance(1)`. `perf().figures` counts GLBs at full detail, at the LOD level, glow sprites and stand-ins. Whole block at level 6 with no hostile in view: 44 draws, 397,080 triangles (as M4a); close on a fighter and a down taker at ground level with six agents: 39 draws, 187,742 triangles, 5 GLBs, 1 glow (`docs/art/shots/m4-figure-board.png`). Real frame times on the owner's discrete GPU were 60 fps vsync-bound on M4a (`node tools/perf.mjs`); not remeasured with the GLBs | `e2e/art.spec.ts` |
| Save/Continue, KB rules 24-27, Look | As M3; `npm run check:look` 0 hits on 2026-11-18 | `e2e/save.spec.ts`, `e2e/rules.spec.ts`, `tools/check-look.mjs` |
| Build and hosting | Two self-contained pages (`vite.config.ts`, `vite.sounds.config.ts`); `dist/` carries `public/models/` (51 MB of figure files); GitHub Pages serves a hand-pushed build of `main` (D12); `npm run artifact` inlines the game for the Artifact | `npm run build` |
| Art | Procedural tile set, props, light and effects (`docs/art/tile-set.md`); four generated figures (`docs/art/figure-models.md`, pipeline in `tools/figures/`); no tile texture yet | `docs/art/shots/`, `docs/concept/gates/<role>-model.jpg` |
| Audio | 23 synthesized sounds; no generated or recorded audio | `sounds.html` |

## Balance baselines (KB rule 30)
Nothing in M4 touches the rules, the data the rules read, or the AI. The M3 rows stand and were rerun on 2026-11-18:

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
`npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` | `npm run check:look` (all pass on 2026-11-18). The e2e uses port 5181 (`PW_PORT` to change) and reuses a dev server already on it; the reconcile ran it on 5191 (KB gotchas: port reuse serves a stale sibling build). 17 e2e tests: `smoke`, `save`, `rules`, `ai` (M2, M3), `art` (4: the fourth advances a raid until a hostile is in view and asserts it is drawn as its GLB near and as its LOD far, through `perf().figures`), `gallery` (1, asserting the four GLBs drawn), `sound` (2).

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| `PLAN.md` Q1-Q21 | owner | as written there |
| 49 provisional rulings in `docs/spec/10-rules.md` section 17, 5 art rulings in `docs/art/tile-set.md` section 7, 10 figure rulings in `docs/art/figure-models.md` (HOST-1 gates the host against its own reference; TAKER-1 and FIGHTER-1 keep models whose leg count and leg length miss the reference) | owner may confirm or reverse any | as written there |
| The generated figures' look: brick red and dark grey rather than deep red and black on the agent and host, six legs on the taker, short legs on the fighter | owner, by eye on `?gallery` and the gate sheets | kept as generated (`figure-models.md` 7 is the redo list) |
| The sounds themselves | owner, by ear on `sounds.html` | first draft, not verified by ear |
| The fighter's and the whip's numbers, the `ai` tuning section, everything marked *(tune)* since M1 | owner, with a `sim` or `bench:ai` result (KB rule 30) | first guesses *(tune)* |
| Citizens that run (PLAN Q18) | owner or the balance pass | they stand (RULING CIV-1) |

## Known limits of the playable
- One agent is selected at a time (PLAN Q6); no drag box, no "select all" yet.
- Props are dressing: no cover, no obstacle, no breaking of their own (RULING MAP-9).
- The generated figures stand still: the rigged GLBs' `idle` and `walk` clips are not played yet (D8 note); a down figure is laid flat, as before. Citizens and hidden hosts are stand-ins. The agent model is the tier 2 suit; the tier 1 squad wears it until a tier 1 reference exists (RULING AGENT-1), so the opening camera shows six LOD agents, full models within 12 units.
- The eight GLBs weigh 39 MB; the first load on Pages waits for them (the start switch counts `LOADING MODELS n/8`). A re-UV weld would cut that threefold (`figure-models.md` 5).
- Sound is synthesized and unjudged; there is no music, no voice.
- Frame times with the GLBs were not measured on a real GPU; `node tools/perf.mjs` prints them on any machine.
- The private Artifact shows the stand-ins: the Artifact tool serves no `.glb` file beside a page. The Pages build has the models.

## Known failing (left alone on purpose)
None.

## Next
1. The walk cycle from `rigged.glb` (D8): `SkeletonUtils.clone`, one mixer per figure, locomotion phase from distance travelled (KB gotchas), the LOD level replaced by the rigged mesh.
2. The rest of the GPU pass (PLAN Q7): tile textures or GLBs by name (`docs/art/tile-set.md` 8), the figures' redo list (`figure-models.md` 7), a concept round for the tier 1 agent and the citizen, generated audio once the owner has judged `sounds.html` by ear.
3. The balance pass (PLAN Q9): rerun `sim` and `bench:ai` after each single change; decide Q18 (citizens that run) with a bench result.
