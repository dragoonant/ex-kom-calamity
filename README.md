# IRON BASIN (working title)

An original turn-based walker-tactics game for the browser by **evilgouki**. A hired company of piloted walkers fights a proxy war in a cold northern river basin; hits land on separate body parts, and between contracts you rebuild your walkers from what you salvage. It takes the genre's shape (grid battles, part damage, counter-fire, the hangar) and nothing else from any existing series.

```
npm install
npm run dev        # play; ?gallery shows the walker kits
npm test           # rules, campaign and save tests, named by rule id
npm run e2e        # browser tests (title to hangar, rules 22, 24, 25, 27)
npm run sim        # AI-vs-AI balance table
npm run artifact   # single-page build for a private claude.ai Artifact
```

Plan: `PLAN.md` · Status: `STATUS.md` · Rules: `docs/spec/10-rules.md` · Look: `docs/presentation-concept.md` · Art: `docs/spec/70-art.md` · Audio: `docs/spec/60-audio.md` · Balance: `docs/spec/80-sim.md`
