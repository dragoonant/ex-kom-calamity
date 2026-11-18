# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-17 | **Milestone:** M1 done (battle spec, data, tick engine) | **Last commit:** see `git log -1`

## What works now
| Area | State | Evidence |
|---|---|---|
| Spec | `docs/spec/10-rules.md`: 97 rule ids in 17 sections, 23 rulings, every tuning number cited as `section.key = N` | `npm run validate:data` checks the spec's numbers against `src/data/tuning.json` and the ids' uniqueness |
| Data | `src/data/tuning.json`, `weapons.json` (5), `units.json` (4 templates), `maps/civic-savings-branch.json` (16 x 12, 3 levels), `battles/first-raid.json` (6 agents, 4 hosts, 1 taker, 4 citizens) | `npm run validate:data` prints the unit and weapon tables |
| Engine | `src/engine/`: `createGame`, pure `step`, tick-only time (pause = no ticks), `legalActions` never empty, `query.*`, `view` with the hosts' disguise, sfc32 in `state.rng`, plain-JSON state, `advance(seconds)`, compressed log, `replay`, `hashState`. No DOM, three.js or React imports (tested) | `npm test`: 101 tests named by rule id, a golden replay (`tests/golden/first-raid-seed-7.json`) and a coverage test that fails on any spec id without a test |
| Headless sim | `npm run sim` (40 seeded battles per driver pair, invariants after every step, replay hash at the end); `npm run action-fuzz` (3 runs x 3000 ticks of random legal and malformed actions, deep invariants every step) | both clean on 2026-11-17: 0 invariant failures, 17,153 fuzz steps, 1,275 rejections, no throw |
| Client | Placeholder page with the working title; no board yet | `npm run build` green |
| Save/Continue (KB rule 22) | Engine side only: the state is the snapshot, `replay(setup, log)` rebuilds it (SAV-1); autosave points in `tuning.save` (SAV-2) | `tests/end-view-query.test.ts` SAV-1 |
| KB rules 24-27 | 24: CSS and listeners in place, no e2e gate yet; 25-27: no board yet | `src/base.css`, `src/main.tsx` |
| AI | None (M3). The sim's drivers (`src/sim/policies.ts`: random, sweep, stand) exist only to finish battles and cover rules | |
| Art | Concept rounds 1-7 on `docs/concept/samples/`; tier 2 suit reference locked (`PLAN.md` D7) | |
| Audio | none | |

## Balance baseline (KB rule 30)
`npm run sim`, 40 battles per pair, seeds 1-40, 2026-11-17. Hostiles have no AI yet, so this is a coverage check and the starting line for M3, not a verdict on the numbers.

| Driver pair | Agency wins | Mean sim seconds | Agents down / battle | Civilian hits / battle | Hit rate |
|---|---|---|---|---|---|
| random vs random | 100% | 28.1 | 0.45 | 0.28 | 54.8% |
| sweep vs stand | 100% | 32.0 | 0.10 | 0.00 | 59.8% |

Reading: six agents with tier 1 gear clear four standing hosts and one roof taker without loss. The hosts' pocket pistol (55% base, 15-25 damage against armour 4) barely scratches a 60 hp agent, and nothing moves to flank. Do not tune the numbers against these drivers; re-run after the M3 AI moves the hostiles, then change one number at a time (KB rule 30).

## Gates (run before every commit)
`npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` (all pass). `e2e` arrives with M2.

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| Figure proportions on the real art run (`PLAN.md` Q1) | owner | gate each figure by measured head ratio |
| `PLAN.md` Q2-Q9 | owner | as written there |
| 23 provisional rulings in `docs/spec/10-rules.md` section 17 | owner may confirm or reverse any | as written there |

## Known failing (left alone on purpose)
None.

## Next
1. M2: the battle first playable on the engine: R3F board of `civic-savings-branch` with the three levels, tile-only picking (KB rule 25), the mouse map (27), orders and stances from the console HUD (`docs/presentation-concept.md`), a fixed-step loop that issues `tick` actions and pauses by not issuing them, save/Continue on the `ekc-save` key at the SAV-2 points, Playwright e2e for rules 22, 24, 25, 27, published as a private Artifact.
2. M3: hostile AI on `view(state, 'hostile')`, then the balance pass against this file's baseline.
