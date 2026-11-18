# ex-kom-calamity PLAN

From 3d-game-generation `templates/PLAN.md`. Rewrite, do not append. Owner decisions carry the owner's words and a date (KB rule 14); every open question has its default written here and work continues on it (KB rule 20). "ex-kom-calamity" is the repo and internal codename only (D10).

**Status:** M1 done (battle spec, data, tick engine), 2026-11-17. Next: M2, the battle first playable.

## 1. Decisions
| # | Topic | Decision | Who / when | Source |
|---|---|---|---|---|
| D1 | Inspiration | A spiritual successor to X-COM Apocalypse: "city based, real time and turn based tactics, aliens" | owner, 2026-11-17 | owner's message; `docs/GAME-DESIGN.md` 1 |
| D2 | Scope | **The full version of both halves**: the city layer and the squad battles | owner, 2026-11-17 ("Full version of both.") | question batch 1 |
| D3 | Build order | Battle first, then the city, then the join | owner, 2026-11-17 | question batch 2 |
| D4 | Combat mode | Real-time with pause first, on a tick-based engine so a turn-based mode runs on the same rules later | owner, 2026-11-17 | question batch 1 |
| D5 | Setting | Retro-future utopia: a gleaming city of tomorrow with rot underneath | owner, 2026-11-17 | question batch 1 |
| D6 | Alien threat | Infiltration that escalates: hidden takeover of citizens and organisations first, open attacks with craft later. Our own species and story | owner, 2026-11-17 | question batch 2 |
| D7 | Armour | Suits evolve by tier: plain security gear, then the sleek moulded suit, then a flying variant. Look: sample `suit-t3-flight-s32` "looks closest to what I want, just different colors"; colours "bright red and black". **Tier 2 reference locked: `docs/concept/samples/chrome-suit-t2-h2.jpg`** (suit 2 body, rigid face-mask helmet with two upward-slanting almond lenses, engraved mouth line and thin crown fin) | owner, 2026-11-17 | question batch 1; notes on `docs/concept/samples/` round 1; lock after rounds 5-7 (`gemini-chrome-brief.md`) |
| D8 | Figure style (KB rule 7) | The house figure style of KB rule 7, animated. Owner: it "should work better for animation. Use that" | owner, 2026-11-17 | question batch 2; `docs/figures.md` (to write before the first art run) |
| D9 | Platform and stack | Vite + React + three + R3F + drei + zustand + TypeScript strict + Vitest; Playwright added with the first playable. Fixed-step sim behind a pure `step`; scripts run with `tsx` | default, not yet asked; in use since M1 | KB `recipe.md` steps 6 and 11 |
| D10 | Title | "ex-kom-calamity" is a codename only; the game shows a placeholder title until the owner picks an original one | owner, 2026-11-17 | question batch 2; KB rule 29 |
| D11 | Presentation concept (KB rule 21) | "Civil Defence switchboard of the City of Tomorrow". Owner: "I am good with the console and [futuristic] 50s look" | owner, 2026-11-17 | `docs/presentation-concept.md`; sample `console-mood-s95` |
| D12 | Hosting (KB rule 28) | Private repo `dragoonant/ex-kom-calamity`; playtests as a private Artifact | default, not yet asked | KB rule 28 |
| D13 | Save key (KB rule 22) | `ekc-save` | default | KB rule 22 |
| D14 | Engine contract frozen | `src/engine/types.ts` and the shapes in `docs/spec/10-rules.md` section 0 are frozen now that tests exist; a change needs a matching spec edit, a new golden (`npm run golden:make`) and a note here | M1, 2026-11-17 | `CLAUDE.md`; KB `recipe.md` step 3 |
| D15 | Battle tick rate | 10 ticks per second (`tuning.time.ticksPerSecond`); the client's 60 Hz loop accumulates time and issues ticks through `advance(seconds)` | default, M1 2026-11-17 | spec TIME-1, TIME-4 and RULING TIME-1 |

## 2. Open questions (each with a default; never blocks work)
Both question batches of KB rule 12 were used on 2026-11-17, so these stay on their defaults until the owner speaks.

| # | Question | Recommended default (in use) | Asked | Answer |
|---|---|---|---|---|
| Q1 | Figure proportions on the real art run | Round 1 was off-model (owner: "Proportions are definitely off"); round 2 reworded the measurements. Attach the style reference image on the owner's machine and gate each figure by measured head ratio (KB rules 7, 13) | 2026-11-17, with the samples | open |
| Q2 | Shipping title | Placeholder "CITY OF TOMORROW (working title)" on the title screen | not yet | |
| Q3 | Squad size in a battle | 6 agents *(tune)*; in `src/data/battles/first-raid.json` | not yet | |
| Q4 | Floors per building in the first map | 2 floors plus a roof; every tile carries a level from the first engine step, because height is hard to retrofit and the flying suit (D7) needs it. Built: `civic-savings-branch`, 16 x 12 x 3 | not yet | |
| Q5 | How a real-time battle saves (KB rule 22) | Autosave on every pause, every accepted order and every 10 s of sim time *(tune)*; Continue reopens paused | not yet | |
| Q6 | Selecting several agents at once | Tile tap selects one (KB rule 25); squad buttons and a "select all" key; no drag box until a playtest asks for it, because left-drag pans (KB rule 27) | not yet | |
| Q7 | GPU and overnight art runs (KB rule 10) | Ask first. The studios run on the owner's machine, which a cloud session cannot reach | not yet | |
| Q8 | When the turn-based mode lands | After the join (M8), on the same tick rules | not yet | |
| Q9 | Balance of the first slice | Leave the M1 numbers until the M3 AI moves the hostiles; the M1 sim baseline (agency wins 100% against standing hosts, `STATUS.md`) is the starting line, and each later change moves one number with a `sim` result (KB rule 30) | not yet | |
| Q10 | The hosts' disguise | Hosts look like citizens until they fire or an agent comes within 3 tiles with line of sight (spec HIDE-1..5, `tuning.sight.revealRange`); a hit does not reveal them | not yet | |

## 3. Standing rules adopted
KB `rules.md` rules 1, 2, 6, 8-13, 19-30 apply without re-asking. Notes: rule 22 follows the real-time form (Q5); rule 25 applies because battles are on a tile grid; rule 6 limits each spec to the slice being built, so D2 is the target and the milestones below are the path. Rule 2 in force since M1: `docs/spec/10-rules.md` is the product, tests are named by its ids (`tests/coverage.test.ts` fails on an id without a test), and every ambiguity is a `RULING:` line there.

## 4. Milestones
| # | Milestone | Done when | Status | Date | Tokens (actual) |
|---|---|---|---|---|---|
| M0 | Kickoff, scaffold, `CLAUDE.md`, `PLAN.md`, `STATUS.md`, design draft 1 | `npm run build` green | done | 2026-11-17 | not measured |
| M1 | Battle spec, data, tick engine | `docs/spec/10-rules.md` with ids; tests by rule id; golden replay; `sim` and `action-fuzz` clean | done: 97 ids, 23 rulings, 101 tests, golden seed 7, sim 80 battles and fuzz 17k steps clean | 2026-11-17 | ~0.35M (one session, estimate) |
| M2 | Battle first playable (real-time with pause, one building, save/Continue, KB rules 24-27) | Clickable on a URL with a screenshot | next | | |
| M3 | Alien AI and agent self-defence behaviour | Bench: normal beats random at least 95% | | | |
| M4 | Art and audio, pass 1 | `docs/figures.md`; rigged GLBs through `?gallery`; `sounds.html` judged by ear | | | |
| M5 | City spec, data, engine | `docs/spec/20-city.md` with ids; clock sim with bots inside a win-rate target | | | |
| M6 | City first playable | 3D city, organisations, alerts, craft, auto-resolved battles | | | |
| M7 | The join | A city alert opens a battle on that building's map; results flow back; one campaign save | | | |
| M8 | Turn-based mode | The player picks the mode per battle; same rules and data | | | |
| M9 | Polish and playtest tools | No scene-start hitch; phone tiers; tuning panel; Copy report | | | |

## 5. Out of scope for now
Multiplayer; a second city; anything from M5 on in the M1 spec (KB rule 6: spec the slice being built).

## Sources
Owner's messages and two multiple-choice batches of 2026-11-17; 3d-game-generation `rules.md`, `recipe.md`, `projects/project-x.md`; `docs/spec/10-rules.md` and `STATUS.md` for M1.
