# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-20 | **Milestone:** M4d done on branch `claude/m4d-gpu-tier1-citizen`: the tier 1 agent and the two citizen bodies generated on the owner's GPU from the references locked 2026-11-20 (D7, D22), gated and rigged, so every figure role draws a generated model (RULING AGENT-1 closed; citizens and hidden hosts wear the two citizen bodies by unit id, RULING CITIZEN-2). M4c steps 1-3 (rigged animation, stylised effects, crouch and run as rules, spec section 24) are merged; M4c step 4's citizen model is this pass, its generated clips are still open. Raids are one building each (D20). **Audio pass 2 (D23):** 36 generated sound takes behind the 23 names and five music states from ElevenLabs (`docs/audio.md`), not yet judged by ear | **Last commit:** see `git log -1`

**Play it:** https://dragoonant.github.io/ex-kom-calamity/ (GitHub Pages, branch `gh-pages`, a build of `main` pushed by hand, PLAN D12), or `npm install`, `npm run dev`, open the printed URL. `?gallery` on the URL opens the figure gallery, `sounds.html` the sound desk (also https://claude.ai/artifact/QUtrEmQaCyfeB1mA8ZuHgg, a private Artifact of the desk with its audio files). Private Artifact build (PLAN D12, D15): https://claude.ai/artifact/NtYezrJFZ5cYKuVs475YUG (the phone-friendly copy; republish with `npm run build`, `npm run artifact`, `node tools/check-artifact.mjs`, then publish `dist-artifact/city-of-tomorrow.html` to that URL; the Artifact tool serves no `.glb` supporting file under any content type, so the Artifact always falls back to the stand-ins and the Pages build is the one with the models). Shots: `docs/art/shots/m4-*.png` (street and block, desktop and phone, cut-away, gallery, a generated fighter on the board; remade by `npm run e2e`); `docs/screenshots/m3-*.png` stay as the M3 record (`npm run shot`). `?ai=none` on the URL plays the M2 way, `?ai=random` the random AI.

## What works now
| Area | State | Evidence |
|---|---|---|
| Spec | `docs/spec/10-rules.md`: 141 rule ids, 57 rulings, every tuning number cited as `section.key = N`. MAP-10 (one-building raid sites, D20), VIEW-5 (the last hostiles marked), MAP-9 (styles and props as set dressing the rules never read); five art rulings (ART-1..5) in `docs/art/tile-set.md` section 7; thirteen figure rulings (GATE-1, GATE-2, HOST-1, CREATURE-1, TAKER-1, FIGHTER-1, BASE-1, LOD-1, RIG-1, RIG-2, and from M4d CITIZEN-1, CITIZEN-2, BUDGET-1) in `docs/art/figure-models.md`, summarized in `docs/figures.md` 4.1; RULING AGENT-1 is closed | `npm run validate:data` checks the props and the styles; `tests/coverage.test.ts` fails on an id without a test |
| Data | Three raid sites written by `npm run map:make` from the block's own building plans (MAP-10): `sunbeam-automat-site` 22 x 18 x 2 (`automat-raid`: 3 hosts, 1 taker, 1 fighter), `depot-7-site` 32 x 23 x 3 (`depot-raid`: 4, 1, 2), `civic-savings-site` 26 x 24 x 4 (`savings-raid`: 4, 2, 2), each with citizens, props and street dressing; `RAID_SITES` in `src/data/index.ts`. `halcyon-block` and `block-raid` are byte-identical to M4 and no longer offered. `tuning.sight.markLastHostiles = 2` | `npm run validate:data` prints the maps and battles |
| Engine | VIEW-5: `view(state, 'agency')` carries `marks` when 1 or 2 hostiles live; the true state never does. The new tuning key changed every state hash once: golden remade (`2416aab6`, same 53 entries, tick and outcome); old saves still load (they carry their own tuning) and show no marks | `npm test`: 154 tests |
| AI | Unchanged since M3 | `npm run bench:ai` 95.0% (190/200) on `bench-raid` on 2026-11-20, identical to M3; on the sites 85% / 80% / 85% (20 battles each, a smoke figure, not a gate) |
| Headless sim | `npm run sim`: the demolition sweep now runs over the block and every site; clean on 2026-11-20 | baselines below; spec section 18 |
| Client: tile set, light, effects | As M4a: `src/client/board/tileset.ts` and `Tiles.tsx` (one pick mesh per level, still the only object with pointer handlers, KB rule 25, plus ten instanced dressing layers), `Props.tsx`, `Scene.tsx` `EveningLights` (RULING ART-1), `fx.ts` and `Effects.tsx` | `e2e/art.spec.ts`, `tests/client-art.test.ts` |
| Client: figures | **Seven generated models, every role drawn** (M4b and M4d, `docs/art/figure-models.md`): `src/client/models.ts` `FIGURE_SLOTS` points `agent-t1`, `agent-t2`, `citizen`, `citizen-2`, `host-hidden` (the citizen model, HIDE-1), `host-revealed`, `taker` and `fighter` at `public/models/figures/<agent-t1|agent|citizen|citizen-2|host|taker|fighter>/`; the board draws `rigged.glb` (the 8k mesh with `idle` and `walk`, D21) at every distance and the gallery `textured.glb` (30k); the 14 files are preloaded at startup (whole bodies, the start switch counts them; the bytes are handed to the loader through three's file cache so nothing is read back from the browser's disk cache, which failed for one file on a fresh Chromium profile on 2026-11-20; `useModelState` re-reads a slot whenever the preload changes one), drawn through `Suspense fallback={null}`, stand-in only on a failed load (KB rule 26), no pointer handlers and a no-op raycast (rule 25). The amber cores are painted, so one additive glow sprite per alien pulses with the stand-ins' core material; no glow on humans. `roleOf` (`Figures.tsx`) deals the two citizen bodies by the unit id's last digit, odd body 2 (RULING CITIZEN-2), hidden hosts included | `?gallery` (`src/client/Gallery.tsx`): every role beside a head-height ruler; the cell reports what it really drew (GLB or stand-in), a GLB's height from its mesh (humans 1.00 figure units, taker 0.79, fighter 1.25) and its ratios from the pipeline's render gate with the ruling named; `e2e/gallery.spec.ts` asserts all eight cells drawn as GLBs, three core glows, 6/6 humanoid gates; `tests/client-art.test.ts` the body rule |
| Client: sound | **Pass 2 (D23, `docs/audio.md`):** `src/client/audio/bank.ts` reads `public/audio/index.json` beside the page, decodes the 36 generated takes after the first gesture and plays each trimmed and normalized behind its synth name (several takes per shot, cycled; `raid-over` by outcome); the synth stays as the fallback and the desk's A/B reference. `music.ts`: calm on the title, battle in the raid, tense once the view carries `marks` (VIEW-5), a victory or defeat stinger on the report; 1.5 s crossfades, loops by a 2 s overlapped re-trigger, ducked to 35% while paused. Settings add the music level and the source switch under `ekc-audio` (Q19). `sounds.html` gets a SOURCE switch, a MUSIC panel and each card's measurements. **Not verified by ear** (KB rule 9) until the owner listens | `e2e/sound.spec.ts` (bank decoded 41/41, sampled counts, the desk's switches), `tests/audio.test.ts` (manifest, measure, music rule, files vs index); checked in the browser pane on 2026-11-20: every event sound played its take, the title plays `calm`, the raid `battle`, ducked on pause |
| Frame budget | `window.__ekc.perf()`; the e2e budget is 120 draws, 2 M triangles, 900 ms for `advance(1)`. `perf().figures` counts GLBs at full detail, at the LOD level, glow sprites and stand-ins. Since D20 the e2e measures the Civic Savings site (26 x 24 x 4) instead of the block, inside the budget; close on a fighter at ground level on 2026-11-20: 36 draws, 290,778 triangles, 9 GLBs, 1 glow (`docs/art/shots/m4-figure-board.png`). The block's M4a figure was 44 draws, 397,080 triangles. Real frame times on the owner's discrete GPU were 60 fps vsync-bound on M4a (`node tools/perf.mjs`); not remeasured with the GLBs | `e2e/art.spec.ts` |
| Save/Continue, KB rules 24-27, Look | As M3; `npm run check:look` 0 hits on 2026-11-18 | `e2e/save.spec.ts`, `e2e/rules.spec.ts`, `tools/check-look.mjs` |
| Build and hosting | Two self-contained pages (`vite.config.ts`, `vite.sounds.config.ts`); `dist/` carries `public/models/` (51 MB of figure files) and `public/audio/` (5.3 MB); GitHub Pages serves a hand-pushed build of `main` (D12); `npm run artifact` inlines the game for the Artifact | `npm run build` |
| Art | Procedural tile set, props, light and effects (`docs/art/tile-set.md`); seven generated figures (`docs/art/figure-models.md`, pipeline in `tools/figures/`); no tile texture yet | `docs/art/shots/`, `docs/concept/gates/<role>-model.jpg` |
| Audio | 36 generated takes under 23 names and 5 music tracks (`tools/audio/manifest.ts` through ElevenLabs, `npm run audio:gen`, idempotent by prompt hash; `npm run audio:measure` writes the index with peak, RMS, crest, trims and gain); the gunshots measured 18 to 28 dB crest, so the synth-transient layer (`CREST_FLOOR_DB`) stays idle | `sounds.html`, `docs/audio.md` 2 |

## Balance baselines (KB rule 30)
D20 adds maps and a view field, no roll and no AI change. The M3 rows stand (rerun 2026-11-18; the bench row again on 2026-11-20):

### Sim drivers (`npm run sim`, 40 battles per pair, seeds 1-40, `first-raid`)
| Driver pair | Agency wins | Mean sim seconds | Agents down / battle | Civilian hits / battle | Hit rate |
|---|---|---|---|---|---|
| random vs random | 100% | 25.4 | 0.57 | 0.40 | 55.0% |
| sweep vs stand | 100% | 32.0 | 0.10 | 0.00 | 59.8% |

Block demolition sweep (`block-raid`, 4 battles capped at 500 ticks): 48 charges, 34 tiles destroyed, 88 steps between levels, 12 hostiles down, 0 agents down, 0 invariant failures (unchanged on 2026-11-20). The same sweep on the sites: every `automat-raid` and `depot-raid` battle cleared (15 to 50 sim seconds), `savings-raid` reaches the 50 s cap with 5 or 6 of 8 hostiles down.

### AI bench (`npm run bench:ai`, 200 battles, 100 per seat, seeds 1-100, `bench-raid`)
| Seat | Battles | Normal wins | Random wins | Draws | Mean sim seconds | Agents down / battle | Hostiles down / battle | Taken / battle | Civilian hits / battle |
|---|---|---|---|---|---|---|---|---|---|
| normal hostiles vs random agents | 100 | 98.0% | 2.0% | 0 | 25.1 | 5.97 | 1.99 | 2.14 | 5.43 |
| normal agents vs random hostiles | 100 | 92.0% | 8.0% | 0 | 46.2 | 1.90 | 8.18 | 0.37 | 4.91 |
| **both seats** | **200** | **95.0% (190/200)** | 5.0% | 0 | | | | | |

Determinism: seed 1 in the hostile seat replays to the same hash (`59bd6fcd`). Gate (PLAN M3, 95% over at least 200): **PASS, with no margin**, as in M3. Do not tune against these numbers blindly: the balance pass (PLAN Q9) is still next, one number at a time.

## Gates (run before every commit)
`npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` | `npm run check:look` (all pass on 2026-11-20; this container ran the e2e with `PW_CHROMIUM=/opt/pw-browsers/chromium`, since its pre-installed Chromium is not the build this Playwright pins). The e2e uses port 5181 (`PW_PORT` to change) and reuses a dev server already on it; the reconcile ran it on 5191 (KB gotchas: port reuse serves a stale sibling build). 19 e2e tests: `smoke`, `save`, `rules`, `ai` (M2, M3), `marks` (VIEW-5: the last two hostiles' beacons, floor lamps and console line, `docs/screenshots/last-hostiles-marked.png`), `art` (4: the fourth advances a raid until a hostile is in view and asserts it is drawn as its GLB near and as its LOD far, through `perf().figures`), `gallery` (1, asserting all eight cells drawn as GLBs), `sound` (2). M4d ran the e2e on port 5203.

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| `PLAN.md` Q1-Q21, D20, D21, D22, D23 | owner | as written there |
| 57 provisional rulings in `docs/spec/10-rules.md`, 5 art rulings in `docs/art/tile-set.md` section 7, 13 figure rulings in `docs/art/figure-models.md` (HOST-1 and CITIZEN-1 gate the host and the citizens against their own references; CITIZEN-2 deals the citizen bodies by unit id; BUDGET-1 raises the committed-GLB budget to 100 MB; TAKER-1 and FIGHTER-1 keep models whose leg count and leg length miss the reference) | owner may confirm or reverse any | as written there |
| The generated figures' look: brick red and dark grey rather than deep red and black on the agents and host, a tan rather than enamel cream coat on the citizens, six legs on the taker, short legs on the fighter | owner, by eye on `?gallery` and the gate sheets | kept as generated (`figure-models.md` 7 is the redo list) |
| The sounds and the music | owner, by ear on `sounds.html` (SOURCE switch for the synth, MUSIC panel for the five states) | pass 2 generated takes in use, not verified by ear; the redo list is `docs/audio.md` 4 |
| The fighter's and the whip's numbers, the `ai` tuning section, everything marked *(tune)* since M1 | owner, with a `sim` or `bench:ai` result (KB rule 30) | first guesses *(tune)* |
| Citizens that run (PLAN Q18) | owner or the balance pass | they stand (RULING CIV-1) |

## Known limits of the playable
- Animation is the generated idle and walk clips plus motions built in code (`docs/art/animation.md`); the auto-rig's coarse skin stretches at big bends. Citizens and hidden hosts now walk on the citizen rigs too.
- The hostile AI does not crouch or run yet (RULING POSE-1).
- One agent is selected at a time (PLAN Q6); no drag box, no "select all" yet.
- The title offers the three raid sites by hand; the city layer (M7) will pick the site from an alert. The site rosters are first guesses, not calibrated like `bench-raid`.
- A mark (VIEW-5) shows a disguised host too (RULING VIEW-5); it gives no right to fire.
- Props are dressing: no cover, no obstacle, no breaking of their own (RULING MAP-9).
- The tier 1 squad wears its own generated suit (RULING AGENT-1 closed 2026-11-20); the tier 2 model is kept for the `agent-t2` slot, which no unit template uses yet.
- The fourteen preloaded GLBs weigh about 70 MB (seven rigged files for the board, seven full models for the gallery); the first load on Pages waits for them (the title counts `LOADING MODELS n/14` before the site switches show). A re-UV weld would cut that threefold (`figure-models.md` 5); preloading the full models only on `?gallery` is the cheaper fix.
- Sound and music are generated and unjudged (pass 2); there is no announcer voice. The game's Artifact build inlines one page without the audio files and plays the pass 1 synth, with no music; the sound desk itself is published as a private Artifact with every file (`docs/audio.md` 4).
- Frame times with the GLBs were not measured on a real GPU; `node tools/perf.mjs` prints them on any machine.
- The private Artifact shows the stand-ins: the Artifact tool serves no `.glb` file beside a page. The Pages build has the models.

## Known failing (left alone on purpose)
None.

## Next
1. M4c step 4's remainder (D21 g): generated run, crouch and throw clips on the GPU machine (the citizen model landed in M4d).
2. The rest of the GPU pass (PLAN Q7): tile textures or GLBs by name (`docs/art/tile-set.md` 8), the figures' redo list (`figure-models.md` 7: texture re-grade toward the roster colours, the taker's legs, the fighter's legs, the re-UV weld that would cut the 70 MB preload); the audio redo list (`docs/audio.md` 4) once the owner has judged `sounds.html` by ear.
3. The balance pass (PLAN Q9): rerun `sim` and `bench:ai` after each single change; decide Q18 (citizens that run) with a bench result.
