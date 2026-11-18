# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-18 | **Milestone:** M2 done (battle first playable on a destructible city block) | **Last commit:** see `git log -1`

**Play it:** `npm install`, `npm run dev`, open the printed URL. Private Artifact build (PLAN D12, D15): https://claude.ai/artifact/NtYezrJFZ5cYKuVs475YUG (owner only until shared; republish with `npm run build`, `npm run artifact`, then publish `dist-artifact/city-of-tomorrow.html` to that URL). Screenshots: `docs/screenshots/m2-title.png`, `m2-battle.png`, `m2-block.png` (`npm run shot` remakes them).

## What works now
| Area | State | Evidence |
|---|---|---|
| Spec | `docs/spec/10-rules.md`: 119 rule ids in 19 sections, 35 rulings, every tuning number cited as `section.key = N`. New in M2: the city block (MAP-7, MAP-8), structure (STR-1..6), charges (ORD-9, BLAST-1..5), the client loop (TIME-6), the client save (SAV-3..6), QRY-7, QRY-8, INV-8 | `npm run validate:data` checks the spec's numbers against `src/data/tuning.json` and the ids' uniqueness; `tests/coverage.test.ts` fails on an id without a test |
| Data | `tuning.json`, `weapons.json` (5, with `structureDamage`), `units.json` (4 templates, with `charges`), `materials.json` (8), maps `civic-savings-branch` (16 x 12 x 3, the test and sim map) and `halcyon-block` (60 x 60 x 7, five buildings of 1, 2, 3, 4 and 6 floors, written by `npm run map:make`), battles `first-raid` and `block-raid` (6 agents, 6 hosts, 2 takers, 11 citizens) | `npm run validate:data` prints the unit, weapon and material tables |
| Engine | `src/engine/`: as M1, plus `structure.ts`: tiles carry `material` and `hp`; walls, doors and windows break to rubble; upper floors collapse and drop whoever stood on them; a missed ranged shot chews the wall behind the target; agents carry two charges, armed over 6 ticks, that damage structure and units on nine tiles. No new randomness. Contract changed under PLAN D17 (spec edited, golden remade) | `npm test`: 127 tests named by rule id; golden `tests/golden/first-raid-seed-7.json` |
| Headless sim | `npm run sim`: 40 battles per driver pair on `first-raid`, then a demolition sweep of 4 capped battles on the block; `npm run action-fuzz`: 3 runs x 3000 ticks of random legal and malformed actions, about 120 charges a run | both clean on 2026-11-18: 0 invariant failures |
| Client | `src/client/`: one zustand store calls `step`; a fixed-step accumulator feeds `advance` (pause is the absence of ticks); `window.__ekc.advance(seconds)` and friends for tests; R3F board with one instanced mesh per level, a floor selector that cuts the block away level by level, placeholder figures to `docs/figures.md`; the Civil Defence console: time dial, PAUSE paddle, speeds 1x 2x 4x, squad lamps, stance switches, HALT, CHARGE, WITHDRAW, a file card (tile kind, material, hp, hit chance, charge preview, path cost, all from `query.*`) and the message-slip tray; title screen with the placeholder title only (D10); incident report with Copy report | `npm run e2e` (8 tests), `npm run shot` |
| Save/Continue (KB rule 22) | Key `ekc-save`. Written when a raid starts, on every pause, every accepted order, every 10 s of sim time and on leaving. The envelope keeps a tile diff against the map file plus the state hash (a few KB, not 2 MB). Continue names what it reopens and reopens paused; Discard asks once more; a finished raid clears its save; an unreadable save, a changed map or refused storage says why | `tests/client-save-loop.test.ts` SAV-3..6; `e2e/save.spec.ts` (browser closed and reopened on a persistent profile, corrupt save, hash mismatch, finished raid, refused storage) |
| KB rules 24-27 | 24: `src/base.css` and the `selectstart` / `contextmenu` listeners. 25: pointer handlers only on the tile meshes; figures have no raycast; a tap resolves in `store.tapTile`. 26: `src/client/models.ts` preload (no GLBs yet), `Suspense fallback={null}`, the start switch waits and says so. 27: wheel zooms to the cursor, right-drag turns and tilts, middle-drag pans, left-drag pans until a middle button is seen (remembered under `ekc-mouse`); touch: one finger pans, two twist and pinch | `e2e/rules.spec.ts`, one test per rule |
| Look (KB rule 21) | "Civil Defence switchboard" tokens in `src/styles.css`; `npm run check:look` fails on a sibling's look, a native tooltip or the codename | 0 hits on 2026-11-18. Not yet done: screenshots side by side with project-x (`docs/presentation-concept.md` section 5) |
| AI | None (M3). Hostiles defend themselves by stance only, so the agency wins every sim; that is expected | |
| Art | Placeholder meshes only. Concept rounds 1-7 in `docs/concept/samples/`; references locked in `PLAN.md` D7 and D14; `docs/figures.md` written | |
| Audio | none | |

## Balance baseline (KB rule 30)
`npm run sim`, 40 battles per pair, seeds 1-40, battle `first-raid`, 2026-11-18. Hostiles have no AI yet, so this is a coverage check and the starting line for M3, not a verdict on the numbers.

| Driver pair | Agency wins | Mean sim seconds | Agents down / battle | Civilian hits / battle | Hit rate |
|---|---|---|---|---|---|
| random vs random | 100% | 25.4 | 0.57 | 0.40 | 55.0% |
| sweep vs stand | 100% | 32.0 | 0.10 | 0.00 | 59.8% |

Reading: sweep vs stand is identical to the M1 baseline, so stray rounds and the new fields changed no outcome. Random vs random moved (28.1 s, 0.45, 0.28 in M1) only because the random driver now also throws charges, which hurt its own side and the citizens. Do not tune against these drivers; re-run after the M3 AI moves the hostiles, then change one number at a time.

Block demolition sweep (`block-raid`, 4 battles capped at 500 ticks, sweep plus random charges vs stand): 46 charges, 50 tiles destroyed, 96 steps between levels, 7 hostiles down, 1 agent down, 0 invariant failures. No floor collapsed under a unit in the sweep; collapses are covered by `tests/structure-blast.test.ts` and the fuzz.

## Gates (run before every commit)
`npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run e2e` | `npm run check:look` (all pass). The e2e uses port 5181 (`PW_PORT` to change) and reuses a dev server already on it.

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| `PLAN.md` Q1-Q10 | owner | as written there |
| 35 provisional rulings in `docs/spec/10-rules.md` section 17, 12 of them new in M2 (charges, collapse, stray rounds, windows, the packed save, tap on a citizen) | owner may confirm or reverse any | as written there |
| The numbers of structure and charges (`materials.json`, `tuning.blast`, `tuning.structure`, weapon `structureDamage`) | owner, with a sim result (KB rule 30) | first guesses *(tune)* |
| Lifts (D16 says stairs or lifts) | owner | stairs only (RULING MAP-7) |
| `CLAUDE.md` still says "`e2e` arrives with M2" in its gates line | owner or the next session | this file's gates line is the current one |

## Known limits of the first playable
- One agent is selected at a time (PLAN Q6); no drag box, no "select all" yet.
- Furniture and props are not in the map format yet; rooms are bare (art pass, M4).
- A phone can play it (touch pan, pinch, tap), but the console takes almost half the screen and the floor selector is large; phone tiers are M9.
- The Artifact build was checked as a local single file at desktop and phone size, not inside the claude.ai viewer.

## Known failing (left alone on purpose)
None.

## Next
1. M3: hostile AI on `view(state, 'hostile')` (hosts that move, flank and flee, takers that hunt), agents' self-defence behaviour, citizens that run; bench normal beats random at least 95%; then the balance pass against this file's baseline, structure and charge numbers included.
2. M4: art and audio pass 1 on the block (building and street tile set, interiors and props, rigged figures), through the Gemini web app and the GPU host of PLAN Q7.
