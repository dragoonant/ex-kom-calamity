# ex-kom-calamity STATUS

**Rewrite this file at the end of every milestone; do not append.** `ls` every path before claiming it exists.

**As of:** 2026-11-17 | **Milestone:** M0 done | **Last commit:** see `git log -1`

## What works now
| Area | State | Evidence |
|---|---|---|
| Engine | Seam stub only: `tick` action, plain-JSON state (`src/engine/index.ts`) | `npm test` 3 tests |
| Client | Placeholder page with the working title | `npm run build` green |
| Save/Continue (KB rule 22) | no | arrives with M2 |
| KB rules 24-27 | 24: CSS and listeners in place, no e2e gate yet; 25-27: no board yet | `src/base.css`, `src/main.tsx` |
| AI | none | |
| Art | none | |
| Audio | none | |

## Gates (run before every commit)
`npm run typecheck` | `npm test` | `npm run build` (all pass). `validate:data`, `sim`, `e2e` do not exist yet.

## Open
| Item | Owner of the decision | Default in use |
|---|---|---|
| Presentation concept yes (`PLAN.md` Q1) | owner | "Civil Defence switchboard of the City of Tomorrow" |
| `PLAN.md` Q2-Q8 | owner | as written there |

## Known failing (left alone on purpose)
None.

## Next
1. M1: write `docs/spec/10-rules.md` for the battle slice (tick engine, orders, stances, hosts), then data, engine, `sim` and `action-fuzz`.
