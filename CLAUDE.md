# ex-kom-calamity - agent orientation

From 3d-game-generation `templates/CLAUDE.md`. An original 3D video game by **evilgouki** (never the owner's real name, email or home path; use `%USERPROFILE%`). Knowledge base: `dragoonant/3d-game-generation` (on the owner's machine `C:/Claude Code Projects/3d-game-generation`; upstream `tabletop-kb`). Read its `rules.md` first, `recipe.md` for the build order (section 11 for real time), and `gotchas.md` for the area you touch.

- **What it is:** a spiritual successor to X-COM Apocalypse: one retro-future city, real-time-with-pause squad battles, a hidden alien takeover. "ex-kom-calamity" is a codename and never appears in the game (`PLAN.md` D10).
- **Orientation docs:** `PLAN.md` (decisions D#, open questions with defaults, milestones), `STATUS.md` (rewrite, never append), `docs/GAME-DESIGN.md`, `docs/presentation-concept.md` (KB rule 21), `docs/spec/10-rules.md` once M1 writes it (**the spec is the product**).
- **Engine contract (frozen once tests exist):** pure `step`; time advances only through a `tick` action, so pause is the absence of ticks; `legalActions` never empty; `query.*` owns every number; `view(state, side)`; seeded RNG in the state; plain-JSON state; every tile carries a level. No DOM, three.js or React in `src/engine/` or `src/ai/`. The AI (`src/ai/`, spec section 22) reads `view(state, 'hostile')` only and is a pure function of it; the client runs it inside `advance` (`advanceWithAi`).
- **Real time:** fixed-step sim separate from drawing; expose a deterministic `advance(seconds)` hook for tests, because a hidden browser pane throttles `requestAnimationFrame` (KB `recipe.md` section 11).
- **Every ambiguity** becomes `RULING: <id> | <what we did> | <why>` in the spec; never block on it.
- **Balance changes** need a `sim` or `bench:ai` result (KB rule 30).
- **Keep it our own:** check names, art prompts and UI copy against `docs/GAME-DESIGN.md` section 5 before each batch (KB rule 29).
- **Standing rules applied without re-asking:** 1, 2, 6, 8-13, 19-30 of the KB `rules.md`. In particular: save/Continue from the first playable (22, real-time form in `PLAN.md` Q5), `src/base.css` and listeners (24), tile-only picking (25), preload models and `Suspense fallback={null}` (26), the mouse map (27), no native tooltips (8).
- **Questions** go through the multiple-choice UI in at most two batches of four, recommended option first; write the default into `PLAN.md` and keep building (12, 20).
- **Image prompts** describe figures in measurements and materials only; the banned word list is KB rule 23 and is not copied into this repo.
- **Studios:** they run on the owner's machine. Announce GPU work, one GPU job at a time, never kill node by image name, stop the studios when done (10, 17).
- **Before every commit:** grep the staged diff for the real name and the home path (it must print nothing); commits end with the attribution lines the session provides.
- **Update the KB entry** `projects/ex-kom-calamity.md` at the end of every milestone (KB rule 19).
- Gates today: `npm run typecheck`, `npm test`, `npm run build`, `npm run validate:data`, `npm run sim`, `npm run action-fuzz`, `npm run bench:ai`, `npm run e2e`, `npm run check:look`.
