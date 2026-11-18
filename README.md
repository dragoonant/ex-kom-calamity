# ex-kom-calamity

Codename for an original 3D game by **evilgouki**: one retro-future city, real-time-with-pause squad battles, a hidden alien takeover. A spiritual successor to X-COM Apocalypse with its own names, art and story. The codename is not the game's title.

Start with `CLAUDE.md`, then `PLAN.md` and `STATUS.md`. Design: `docs/GAME-DESIGN.md`. Look: `docs/presentation-concept.md`.

`npm install`, then `npm run dev` to play the first raid (real time with pause on a destructible city block; Space pauses, 1 to 6 pick an agent, B arms a charge, PgUp and PgDn change floor, wheel zooms, right-drag turns, middle-drag pans). `?gallery` on the page opens the figure gallery; `sounds.html` is the sound desk.

Gates: `npm run typecheck` | `npm test` | `npm run build` | `npm run validate:data` | `npm run sim` | `npm run action-fuzz` | `npm run bench:ai` | `npm run e2e` | `npm run check:look`. Tools: `npm run map:make` (rewrites the block map, its props and its battle), `npm run golden:make`, `npm run shot` (screenshots into `docs/screenshots/`), `node tools/perf.mjs` (real frame times through the machine's GPU), `npm run artifact` (one self-contained page in `dist-artifact/` for a private Artifact). Rules: `docs/spec/10-rules.md`; the look: `docs/art/tile-set.md`, `docs/figures.md`.
