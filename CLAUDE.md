# iron-basin - agent orientation

An original 3D walker-tactics game by **evilgouki** (never the owner's real name, email or home path). Knowledge base: `dragoonant/3d-game-generation` (read `rules.md` first, `recipe.md`, `gotchas.md`).

- **Orientation:** `PLAN.md` (decisions D#, defaults Q#), `STATUS.md` (rewrite, never append), `docs/spec/10-rules.md` (**the spec is the product**), `docs/presentation-concept.md`.
- **Engine contract (frozen):** pure `step` that never throws; `legalActions` never empty; `query.*` owns every number; `view(state, side)`; sfc32 RNG in the state; plain-JSON state. No DOM, three.js or React in `src/engine/` or `src/ai/`. The AI reads `view(state, side)` only.
- **Every ambiguity** becomes `RULING: <id> | <what> | <why>` in the spec. **Balance changes** need a `sim` or `bench:ai` result recorded in `docs/spec/80-sim.md`.
- **Keep it our own:** no names, machine designs, places, factions or UI from the genre's source series; image prompts describe walkers as "piloted walker machine" in measurements and materials; the banned word list is KB rule 23 and is linted by `tools/art/gen.py`.
- **Standing KB rules:** 1, 2, 6, 8-13, 19-30, with save/Continue (22), base.css and listeners (24), tile-only picking (25), load before show (26), the mouse map (27), no native tooltips (8).
- **Questions** go through the multiple-choice UI, at most two batches of four, recommended option first; write the default into `PLAN.md` and keep building.
- **Before every commit:** grep the staged diff for the real name and the home path (it must print nothing).
- Gates: `npm run typecheck`, `npm test`, `npm run build`, `npm run validate:data`, `npm run sim`, `npm run action-fuzz`, `npm run bench:ai`, `npm run e2e`, `npm run check:look`.
