# 20 - City rules spec (the strategic layer: M5a, act 1 "Whispers")

**The spec is the product** (KB rule 2): the engine in `src/city/` implements exactly this, tests under `tests/` are named by these ids (`tests/coverage.test.ts` fails on an id without a test), and every ambiguity is logged in section 15 as `RULING: <id> | <what we did> | <why>`. Where this spec and `docs/strategic-layer.md` or `docs/GAME-DESIGN.md` disagree, this spec wins. Every number written as `section.key = N` is a key in `src/data/city/tuning.json` (`npm run validate:data` checks the two agree); the city itself (districts, organisations, buildings) is `src/data/city/city.json`. Every number is a first guess *(tune)* until a `sim:city` result says otherwise (KB rule 30).

**Scope (KB rule 6):** act 1 only: the city clock, organisations with a hidden infiltration, the organism's economy and planner, symptom slips, watching, raids resolved by a calibrated model, money, confidence and the roster. Not here yet: research and the workshop (M5b), craft and the air war (M5c), the 3D city (M6), raids fought on the battle engine (M7). Every proper name is a placeholder (`PLAN.md` D10), checked against `docs/GAME-DESIGN.md` section 5. Owner decisions behind this slice: `PLAN.md` D24 (symptoms only, evidence-gated research, live intercepts, three acts) and D25 (the spread is "too perfect + the hum").

---

## 0. Engine contract (CARCH)
- **CARCH-1** `createCity({ seed, tuning? }) -> CityState`. Tuning overrides merge key by key per section and are stored in `state.tuning`, so a replay carries its own numbers.
- **CARCH-2** `cityStep(state, action) -> { ok: true, state, events } | { ok: false, state, reason }`. Pure: never mutates its input; a rejection returns the same state object with a readable reason; bad input never throws.
- **CARCH-3** `cityLegalActions(state, side) -> CityAction[]` is never empty: `tick` comes first for both sides, before and after the end.
- **CARCH-4** `cityQuery.*` computes every number a client shows (section 11).
- **CARCH-5** State is plain JSON: `JSON.parse(JSON.stringify(s))` deep-equals `s`.
- **CARCH-6** Every number in the state is an integer.
- **CARCH-7** Randomness comes only from the sfc32 words in `state.rng` (battle ARCH-7's generator). `state.log` keeps accepted actions with consecutive ticks merged; `replayCity(setup, log)` rebuilds the state and `hashCity` is a 32-bit FNV-1a of its JSON.
- **CARCH-8** Nothing under `src/city/` imports the DOM, three.js or React; it depends only on `src/data/` and the battle engine's RNG.

## 1. The clock (CLOCK)
- **CLOCK-1** One tick is `clock.minutesPerTick = 10` city minutes; an hour is 6 ticks, a day 144. Tick 0 is `clock.startHour = 8` on day 0.
- **CLOCK-2** A month is `clock.daysPerMonth = 30` days. `clockOf(tuning, tick)` gives day, month, day of month, hour, minute and night.
- **CLOCK-3** One `tick` resolves in this order: (a) `tick` increases by 1; (b) agents in roster order: a finished watch reports (WATCH-2) and a healed wound returns (ROSTER-4); (c) a travelling raid arrives (RAID-2); (d) on the hour, the slips (section 4); (e) at midnight, the day's end (SPREAD-4, FUND-4, CEND-2, CEND-4); (f) at midnight on the first day of a month, the month's end (FUND-1, CEND-1).
- **CLOCK-4** Time advances only through `tick`; pause is the absence of ticks. Orders are accepted whether or not ticks flow.
- **CLOCK-5** Night is from `clock.nightStartHour = 20` to `clock.nightEndHour = 6`.
- **CLOCK-6** `advanceCity(state, seconds)` applies `round(seconds * clock.ticksPerSecond)` ticks (`clock.ticksPerSecond = 6`: one city hour per real second at speed 1) and concatenates their events; it stops early when a tick changes nothing (RAID-4, CEND-6). The client's loop drives it as the battle's TIME-6 does.

## 2. The city (CITY)
- **CITY-1** The city is a 12 x 12 grid of cells in six districts (`city.json`). Each district has an id, a name and a rectangle.
- **CITY-2** Ten organisations, each with an id, a name and a kind. Exactly one is the **source** (`source: true`): the organisation the organism grew from (`docs/strategic-layer.md` 7).
- **CITY-3** 24 buildings, each owned by one organisation, in one district, on one cell (no two share a cell), with a floor count and a `kind` the client draws.
- **CITY-4** Each building names the raid site its battle is fought on (`automat`, `depot` or `savings`, the three D20 maps) until M7 gives buildings their own maps.
- **CITY-5** Every organisation carries `infiltration` (0 to `spread.cap = 100`), `turned` and `standing` (0 to 100, starting at 50); every building carries the agency's last report (`watch`) and the tick of its last raid.

## 3. The spread (SPREAD)
- **SPREAD-1** The source starts at `spread.sourceStart = 25`, every other organisation at 0. The agency never sees an infiltration number (CVIEW-1).
- **SPREAD-2** The organism's resource is **biomass**, starting at `spread.startBiomass = 10`. At each day's end it gains `floor(total infiltration * spread.biomassPer100Points / 100)` (`spread.biomassPer100Points = 20`).
- **SPREAD-3** The organism's one order is `seed { org }`: legal when the tick has reached its ready tick, biomass is at least `spread.seedCost = 12` and the organisation is below the cap. It pays the cost, adds `spread.seedAmount = 5` (capped) and waits `spread.actEveryHours = 12` hours before the next.
- **SPREAD-4** At each day's end every infiltrated organisation grows by `max(1, floor(infiltration * spread.dailyGrowthPercent / 100))` (`spread.dailyGrowthPercent = 4`), capped; the growth counts as citizens taken (`score.taken`).
- **SPREAD-5** An organisation at or above `spread.lobbyAt = 30` lobbies against the agency (FUND-2).
- **SPREAD-6** An organisation that reaches `spread.turnAt = 60` at a day's end **turns**: its standing drops to 0, the turn is public (an event, and `turned` is visible), its buildings hold `raid.turnedGuards` more hostiles (RAID-3). A raid that pushes it below `spread.lobbyAt` turns it back.
- **SPREAD-7** Until the spine research of M5b, a raid cannot push the source below `spread.sourceFloor = 10`.

## 4. Symptoms (SIGN)
- **SIGN-1** On every hour, each building of an infiltrated organisation, in data order, rolls `infiltration * signs.permillePerPoint` in 1000 (`signs.permillePerPoint = 1`) to print a genuine slip.
- **SIGN-2** A slip has a kind, the tick, and what it names: `missing` (missing persons) names only the district; `purchase` (odd purchases) and `vote` (a council vote or price rise against the agency) name the organisation; `power` (a night power spike, lamps flickering amber in time with another building), `perfect` (too perfect: no sick days, staff in step), `hum` (the amber hum) and `spotted` (a watcher saw a host) name the building. The client words them (`docs/strategic-layer.md` 1.1, D25).
- **SIGN-3** Kinds unlock with infiltration: missing at `signs.missingMin = 1`, purchase at `signs.purchaseMin = 5`, power at `signs.powerMin = 10` and only at night, perfect at `signs.perfectMin = 15` and only by day, vote at `signs.voteMin = 30`, hum at `signs.humMin = 40` and only at night. A genuine slip picks uniformly among its unlocked kinds.
- **SIGN-4** Noise: once an hour the city rolls `signs.noisePermille = 40` in 1000 to print a false slip on a uniformly chosen clean building, of any kind but `hum` and `spotted`. The hum is never noise. Whether a slip is genuine is hidden from the agency (CVIEW-1).
- **SIGN-5** The state keeps the newest `signs.keep = 40` slips; slip ids only increase.

## 5. Watching (WATCH)
- **WATCH-1** `watch { agent, building }`: a ready agent leaves to watch a building for `watch.hours = 12` hours. `recall { agent }` brings a watching agent back with no report.
- **WATCH-2** When the time is up the agent is ready again and the building's report is set.
- **WATCH-3** The report is a **band** of the owner organisation's infiltration: `clean` (0), `low` (1 to 19), `some` (20 to 49), `heavy` (50 and up). It is right with `watch.accuracyPercent = 80`; otherwise it is one band off (up or down at even odds; the end bands move inward).
- **WATCH-4** If the organisation is infiltrated, the watcher also spots a host with `watch.spotPercent = 40`: a genuine `spotted` slip on the building.

## 6. Raids (RAID)
- **RAID-1** `raid { building, agents }`: 1 to `raid.maxAgents = 6` distinct ready agents; only one raid at a time.
- **RAID-2** The squad travels `raid.travelHours = 1` hour, then arrives (an event).
- **RAID-3** On arrival the hostiles are fixed from the organisation then: 0 if it is clean, else `min(raid.maxHostiles, 1 + floor(infiltration * raid.hostilesPer10Points / 10))` (`raid.maxHostiles = 10`, `raid.hostilesPer10Points = 1`), plus `raid.turnedGuards = 2` if it has turned.
- **RAID-4** While a squad stands at the door, unresolved, a tick changes nothing: the city waits for the battle.
- **RAID-5** `resolve { result? }` ends the raid (section 7); the building records the raid's tick.
- **RAID-6** A raid that meets no hostiles is a **scandal**: confidence falls `fund.scandalLoss = 8` and the owner's standing twice that.

## 7. Resolution (RES)
- **RES-1** Without a result, the raid is **auto-resolved**: with no hostiles it is won with no roll; otherwise the win chance is `res.winBasePercent + res.winPerAgent * agents - res.winPerHostile * hostiles`, clamped to `res.winMinPercent = 5`..`res.winMaxPercent = 98` (`res.winBasePercent = 50`, `res.winPerAgent = 12`, `res.winPerHostile = 9`), one roll in 100. Each agent then goes down with `res.downPerHostilePercent = 4` per hostile, plus `res.downOnLossPercent = 30` on a loss, at most `res.downMaxPercent = 90`. A win downs every hostile; a loss a uniform 0 to hostiles - 1. Citizens killed: uniform 0 to `floor(hostiles / 2)`.
- **RES-2** Every downed agent rolls: dead with `roster.deathPercent = 30`, else wounded for `roster.woundDays = 5` days. The others are ready.
- **RES-3** The raid cleanses the organisation by `hostiles down * res.cleansePerHostile + (won ? res.cleanseOnWin : 0)` (`res.cleansePerHostile = 6`, `res.cleanseOnWin = 10`), not below 0 (or SPREAD-7's floor).
- **RES-4** A won raid on an infiltrated building raises confidence `fund.winGain = 4` and the owner's standing as much. Any won raid, a scandal included, leaves the agency knowing the building's band: its report is set to the band after cleansing.
- **RES-5** Every citizen killed costs `fund.civilianLoss = 1` confidence and every agent killed `fund.agentLoss = 1`.
- **RES-6** With a result (a fought battle, M7), the engine checks it: `won` a boolean, `agentsDown` distinct agents of the raid, counts non-negative integers; hostiles down are clamped to the raid's hostiles. Death rolls (RES-2) still apply.

## 8. The roster (ROSTER)
- **ROSTER-1** An agent has an id, a name, a status (`ready`, `watching`, `raiding`, `wounded`, `dead`), an `until` tick, the building it watches and its raid count.
- **ROSTER-2** The agency starts with `roster.startAgents = 8` agents, named in order from `city.json`.
- **ROSTER-3** `recruit` costs `roster.recruitCost = 40` and adds one agent while the living are below `roster.cap = 12`.
- **ROSTER-4** A wound heals at its `until` tick.
- **ROSTER-5** Every living agent costs `roster.salaryPerMonth = 5` at the month's end.

## 9. Money and confidence (FUND)
- **FUND-1** The agency starts with `fund.startMoney = 100` and confidence `fund.startConfidence = 60` (0 to 100). At each month's end money changes by the grant minus salaries; money may go below 0 (a debt that blocks recruiting).
- **FUND-2** The grant is `floor(fund.grantBase * confidence / 50)` (`fund.grantBase = 200`), cut by `fund.lobbyCutPercent = 15` for every organisation lobbying (SPREAD-5) and `fund.turnedCutPercent = 25` for every turned one, never below 0.
- **FUND-3** Confidence moves only by the rules of RAID-6, RES-4, RES-5 and FUND-4, and each change is an event with its reason.
- **FUND-4** Missing persons: at each day's end confidence falls `floor(total infiltration * fund.missingPer100Points / 100)` (`fund.missingPer100Points = 1`), counted before the day's growth.

## 10. The end (CEND)
- **CEND-1** At a month's end, confidence below `end.confidenceFloor = 25` loses: the council withdraws the charter.
- **CEND-2** At a day's end, if `end.turnedLosePercent = 50` percent of the organisations have turned, the city is lost.
- **CEND-3** With no living agent and less money than a recruit costs, the agency is finished.
- **CEND-4** Act 1 ends at the end of day `end.actDays = 90`: the agency wins if total infiltration is at most `end.containedTotal = 60` and no organisation has turned; otherwise the spread has won.
- **CEND-5** The end is an event with the winner, the reason and the tick; it is final.
- **CEND-6** After the end, `tick` is accepted and changes nothing; every other order is rejected.

## 11. View and queries (CVIEW, CQRY)
- **CVIEW-1** `cityView(state, 'agency')` hides infiltration (shown as -1), biomass, the organism's ready tick, the seeds and takings in the score, whether each slip is genuine, and a travelling raid's hostiles.
- **CVIEW-2** `cityView(state, 'hostile')` hides nothing but the dice: the organism knows the city, the agency's watchers and raids included.
- **CVIEW-3** Neither view carries the RNG words.
- **CQRY-1** `clock`: day, month, hour, minute, night.
- **CQRY-2** `grant`: the grant if the month ended now (FUND-2).
- **CQRY-3** `raidOdds`: once a squad is at the door, the hostiles, the agents and the auto-resolver's win chance.
- **CQRY-4** `board`: per building, its name, organisation, district, the last band and when, the slips naming it or its organisation, the district's missing-persons slips, who watches it, the last raid and whether its owner has turned. Computed from the agency's view it leaks nothing hidden.
- **CQRY-5** `roster`: living, ready, cap and recruit cost.
- **CQRY-6** `outcome`: the end, the score, money and confidence.

## 12. The city AI (CAI)
- **CAI-1** City drivers are pure functions of a side's view returning orders; they live in `src/ai/city.ts`.
- **CAI-2** A driver's own dice are seeded from the seed, the tick and the side; the engine's RNG is never read.
- **CAI-3** The organism's **planner**: when it may seed, it scores each organisation: avoid those under watch, just raided or being raided; protect the source while it is below 30; prefer a new foothold or a still-quiet organisation (below the `perfect` threshold); push one close to turning; a little noise; and seeds the best.
- **CAI-4** `hostileRandom` seeds a random legal organisation.
- **CAI-5** `agencyPassive` only resolves a raid at the door; `agencyRandom` on the hour, 8% of the time, gives a random legal order.
- **CAI-6** `agencyCareful` (the sim's competent player and a future autopilot): resolves at the door; recruits back to 8 when it can spare the money; raids turned organisations first, then a building whose fresh report (under 4 days) says `some` or `heavy`, or `low` with a suspicion of 8 or more, with up to 6 ready agents once at least 4 are home; and sends spare agents to watch the most suspicious unwatched buildings, by a suspicion score from the week's slips (weighted by kind) and fresh reports.

## 13. Invariants (CINV) - checked by `sim:city` every city day
- **CINV-1** No NaN or Infinity; every number an integer.
- **CINV-2** Confidence within 0..100.
- **CINV-3** Infiltration within 0..cap, standing within 0..100, biomass at least 0, no organisation turned at 0.
- **CINV-4** The agents marked `raiding` are exactly the raid's squad; a squad is 1 to `raid.maxAgents`.
- **CINV-5** An agent watches a building exactly when it is `watching`; agent ids are unique; the living never exceed the cap.
- **CINV-6** At most `signs.keep` slips, ids increasing.
- **CINV-7** The organisations and buildings match `city.json`.
- **CINV-8** An end is never in the future.

## 14. Sim (CSIM)
- **CSIM-1** `npm run sim:city` plays seeded campaigns (40 per driver by default) of each agency driver against the planner. Drivers decide on the hour and whenever a squad is at the door; the invariants run every city day.
- **CSIM-2** Targets: the passive agency never wins; the random agency wins at most 10%; the careful agency wins 55% to 90%.
- **CSIM-3** Seed 1 with the careful driver replays from its log to the same hash.

### Sim baseline (2026-11-21, 40 campaigns per driver, seeds 1-40)
Filled by the run recorded in `STATUS.md`. Tuning history (KB rule 30, one change at a time, 20 campaigns each): first guesses gave careful 100% in 4 days (the source was cleansed before the spread began), so CEND-4 became a 90-day act with SPREAD-7's floor (careful 40%); `spread.dailyGrowthPercent` 5 -> 4 (35%, no change); `roster.deathPercent` 50 -> 30 (30%, fewer squad wipes but more spread losses); `watch.hours` 24 -> 12 (70%, target met).

## 15. Rulings log
- RULING: CITY-4 | buildings fight on the three D20 raid maps by their floor count until M7 | the battle engine's ARCH-1 names a battle file; per-building maps are M7's join. provisional
- RULING: RES-1 | raids are auto-resolved by a calibrated formula, not by running the battle engine | a real battle takes about 0.7 s headless, too slow for thousands of sim raids; M7 runs the real battle for raids the player fights and feeds RES-6. provisional
- RULING: CARCH-3 | the legal raid per building lists only the first ready agents up to the cap | every subset is too many to list; any subset is still accepted by `cityStep`. provisional
- RULING: CEND-4 | act 1 is a fixed 90 days, won by containment, and the source cannot be cleansed below a floor | a cleansable source let a careful agency win in 4 days before anything spread; the source is the endgame of M5b's spine research. provisional
- RULING: SPREAD-6 | a turned organisation turns back below the lobby threshold, not only at 0 | a raid that guts a turned organisation should be visible to the player as a recovery. provisional
- RULING: FUND-1 | money may go negative at a month's end | salaries are owed whatever the grant; the debt blocks recruiting (ROSTER-3). provisional
- RULING: RES-6 | a fought result's hostiles down are clamped to the city's hostile count | until M7 the raid maps carry their own rosters, which may differ from RAID-3. provisional
- RULING: SIGN-2 | a slip carries ids, never text | the client words each kind (D25: too perfect by day, the hum by night), so wording changes need no engine change. provisional
