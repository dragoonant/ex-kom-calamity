# 20 - City rules spec (the strategic layer: M5a, act 1 "Whispers")

**The spec is the product** (KB rule 2): the engine in `src/city/` implements exactly this, tests under `tests/` are named by these ids (`tests/coverage.test.ts` fails on an id without a test), and every ambiguity is logged in section 15 as `RULING: <id> | <what we did> | <why>`. Where this spec and `docs/strategic-layer.md` or `docs/GAME-DESIGN.md` disagree, this spec wins. Every number written as `section.key = N` is a key in `src/data/city/tuning.json` (`npm run validate:data` checks the two agree); the city itself (districts, organisations, buildings) is `src/data/city/city.json`. Every number is a first guess *(tune)* until a `sim:city` result says otherwise (KB rule 30).

**Scope (KB rule 6):** the whole campaign: act 1 with M5b's lab and workshop (sections 17 to 19), M5c's air war (section 20), acts 2 and 3 (section 21) and travel (section 22), over: the city clock, organisations with a hidden infiltration, the organism's economy and planner, symptom slips, watching, raids resolved by a calibrated model, money, confidence and the roster. Not here yet: research and the workshop (M5b), craft and the air war (M5c), the 3D city (M6), raids fought on the battle engine (M7). Every proper name is a placeholder (`PLAN.md` D10), checked against `docs/GAME-DESIGN.md` section 5. Owner decisions behind this slice: `PLAN.md` D24 (symptoms only, evidence-gated research, live intercepts, three acts) and D25 (the spread is "too perfect + the hum").

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
- **CLOCK-3** One `tick` resolves in this order: (a) `tick` increases by 1; (b) agents in roster order: a healed wound returns (ROSTER-4), a watcher arrives (TRAVEL-2), an agent reaches home (TRAVEL-2, TRAVEL-4), a finished watch reports (WATCH-2); (c) a travelling raid arrives (RAID-2); (d) on the hour, the lab and the workshop advance one hour and due deliveries arrive (LAB-2, SHOP-1, SHOP-2), then the slips (section 4); (e) at midnight, the day's end (SPREAD-4, FUND-4, CEND-2, CEND-4); (f) at midnight on the first day of a month, the month's end (FUND-1, CEND-1).
- **CLOCK-4** Time advances only through `tick`; pause is the absence of ticks. Orders are accepted whether or not ticks flow.
- **CLOCK-5** Night is from `clock.nightStartHour = 20` to `clock.nightEndHour = 6`.
- **CLOCK-6** `advanceCity(state, seconds)` applies `round(seconds * clock.ticksPerSecond)` ticks (`clock.ticksPerSecond = 6`: one city hour per real second at speed 1) and concatenates their events; it stops early when a tick changes nothing (RAID-4, CEND-6). The client's loop drives it as the battle's TIME-6 does.

## 2. The city (CITY)
- **CITY-1** The city is a 24 x 24 grid of cells in six districts that tile it (`city.json`). Each district has an id, a name and a rectangle.
- **CITY-2** Ten organisations, each with an id, a name and a kind. Exactly one is the **source** (`source: true`): the organisation the organism grew from (`docs/strategic-layer.md` 7).
- **CITY-3** 48 buildings, each owned by one organisation, in one district, on one cell (no two share a cell, none on headquarters' cell), with a floor count and a `kind` the client draws.
- **CITY-4** Each building names the raid site its battle is fought on (`automat`, `depot` or `savings`, the three D20 maps) until M7 gives buildings their own maps.
- **CITY-5** Every organisation carries `infiltration` (0 to `spread.cap = 100`), `turned` and `standing` (0 to 100, starting at 50); every building carries the agency's last report (`watch`) and the tick of its last raid.

## 3. The spread (SPREAD)
- **SPREAD-1** The source starts at `spread.sourceStart = 25`, every other organisation at 0. The agency never sees an infiltration number (CVIEW-1).
- **SPREAD-2** The organism's resource is **biomass**, starting at `spread.startBiomass = 10`. At each day's end it gains `floor(total infiltration * spread.biomassPer100Points / 100)` (`spread.biomassPer100Points = 20`).
- **SPREAD-3** The organism's one order is `seed { org }`: legal when the tick has reached its ready tick, biomass is at least `spread.seedCost = 12` and the organisation is below the cap. It pays the cost, adds `spread.seedAmount = 7` (capped) and waits `spread.actEveryHours = 12` hours before the next.
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
- **WATCH-1** `watch { agent, building }`: a ready agent drives out (TRAVEL-2) and watches the building for `watch.hours = 12` hours. `recall { agent }` turns a travelling or watching agent for home with no report (TRAVEL-3).
- **WATCH-2** When the time is up the building's report is set and the agent drives home (TRAVEL-2).
- **WATCH-3** The report is a **band** of the owner organisation's infiltration: `clean` (0), `low` (1 to 19), `some` (20 to 49), `heavy` (50 and up). It is right with `watch.accuracyPercent = 80`; otherwise it is one band off (up or down at even odds; the end bands move inward).
- **WATCH-4** If the organisation is infiltrated, the watcher also spots a host with `watch.spotPercent = 40`: a genuine `spotted` slip on the building.

## 6. Raids (RAID)
- **RAID-1** `raid { building, agents }`: 1 to `raid.maxAgents = 6` distinct ready agents; only one raid at a time.
- **RAID-2** The squad drives from headquarters to the building or crash site (TRAVEL-1, TRAVEL-4), then arrives (an event).
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
- **RES-7** A fought result may also carry `captured` (hosts and takers taken alive: they go to the shelf live instead of LAB-3's capture), `saved` (citizens evacuated: `fund.savedGain = 1` confidence each) and `core` (a wreck's drive: the AIR-8 cores come only if it was secured).
- **RES-6** With a result (a fought battle, M7), the engine checks it: `won` a boolean, `agentsDown` distinct agents of the raid, counts non-negative integers; hostiles down are clamped to the raid's hostiles. Death rolls (RES-2) still apply.

## 8. The roster (ROSTER)
- **ROSTER-1** An agent has an id, a name, a status (`ready`, `travelling`, `watching`, `raiding`, `returning`, `wounded`, `dead`), an `until` tick, the building it drives to or watches, the drive under way (`leg`, TRAVEL-1), its raid count and the kit it carries (`kit`, SHOP-5).
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
- **CEND-4** Act 1 ends at the end of day `end.actDays = 90`: if total infiltration is at most `end.containedTotal = 60` and no organisation has turned, act 2 opens (ACT-2); otherwise the spread has won. The campaign is won only by the final raid (ACT-7) and also lost by a fallen headquarters (ACT-5) or time (ACT-6).
- **CEND-5** The end is an event with the winner, the reason and the tick; it is final.
- **CEND-6** After the end, `tick` is accepted and changes nothing; every other order is rejected.

## 11. View and queries (CVIEW, CQRY)
- **CVIEW-1** `cityView(state, 'agency')` hides infiltration (shown as -1), biomass, the organism's ready tick, the seeds and takings in the score, whether each slip is genuine, a travelling raid's hostiles, and which stock and orders are sabotaged (SHOP-3).
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
- **CAI-8** From day 30 the planner also launches a seeder at the organisation it seeds (or one of the three least infiltrated) when it can spare the biomass, and a scout only as a decoy while a seeder flies.
- **CAI-9** The careful agency sends every ready car after the first seeder (a scout only with two cars free), presses over open ground and shadows over buildings, raids a crash site first with three or more agents, and buys a third car with money to spare.
- **CAI-10** From act 2 the planner sends scouts to look for headquarters over its nearest building until it is found; in act 3 it launches carriers when it can afford one and assaults headquarters whenever it may.
- **CAI-11** The careful agency meets every assault, sends carriers' interceptors before seeders', and in act 3 makes the final raid as soon as a full squad is home.
- **CAI-7** The careful agency also researches in a fixed order (restraints, the host's tells, antiserum, questioning, shell plate, arc carbine, hand scanner, evacuation, taker cage, the amber core, tracing the source) whenever the lab is idle and the next project it can start is found, questions captives, and builds kit up to a squad's worth when it has the cost plus a recruit's and 20 to spare. Every hour it hands the kit to the agents who would raid next (the first ready, up to a squad), from the store first, then from the wounded and the ready beyond the squad (SHOP-5). It never buys from the supplier.

## 13. Invariants (CINV) - checked by `sim:city` every city day
- **CINV-1** No NaN or Infinity; every number an integer.
- **CINV-2** Confidence within 0..100.
- **CINV-3** Infiltration within 0..cap, standing within 0..100, biomass at least 0, no organisation turned at 0.
- **CINV-4** The agents marked `raiding` are exactly the raid's squad; a squad is 1 to `raid.maxAgents`.
- **CINV-5** An agent names a building exactly when it is `travelling` or `watching`; agent ids are unique; the living never exceed the cap.
- **CINV-12** An agent has a drive exactly when it is `travelling`, `returning`, or on a squad that has not reached the door; a travelling or returning agent's drive arrives on its `until` tick; a drive ends after it starts and stays on the map.
- **CINV-6** At most `signs.keep` slips, ids increasing.
- **CINV-7** The organisations and buildings match `city.json`.
- **CINV-8** An end is never in the future.
- **CINV-11** The act is 1, 2 or 3; an assault waits only in act 3; headquarters is found only from act 2.
- **CINV-10** A car is flying exactly when it chases a craft, and that craft exists; car and craft health stay in range; craft stay on the map; crash ids are unique.
- **CINV-13** The agents never carry more of a kind than the stock holds, never two of a kind, and the dead carry nothing.
- **CINV-9** The shelf never goes below 0; no project is done twice or worked on once done; sabotaged stock never exceeds the stock; a raid's takers and fighters never exceed its hostiles.

## 14. Sim (CSIM)
- **CSIM-1** `npm run sim:city` plays seeded campaigns (40 per driver by default) of each agency driver against the planner. Drivers decide on the hour and whenever a squad is at the door; the invariants run every city day.
- **CSIM-2** Targets, for the whole campaign: the passive agency never wins; the random agency wins at most 10%; the careful agency wins 40% to 85%.
- **CSIM-3** Seed 1 with the careful driver replays from its log to the same hash.

### Sim baseline, kit per agent (2026-11-22, 40 campaigns per driver, seeds 1-40, acts 1 to 3)
| Agency driver | Wins | Reached act 2 | Reached act 3 | Mean days | Raids | Agents killed | End confidence | Ends |
|---|---|---|---|---|---|---|---|---|
| passive | 0.0% | 0% | 0% | 28.2 | 0 | 0 | 7 | turned 40 |
| random | 0.0% | 0% | 0% | 30.7 | 9.2 | 2.3 | 9 | confidence 28, turned 12 |
| careful | 67.5% | 88% | 70% | 121.5 | 219.8 | 18.4 | 78 | source 27, time 6, turned 4, hq 1, spread 1, confidence 1 |

SHOP-4..6 (RULING SHOP-5): kit belongs to agents, new items go to the first agent at home, and the careful driver hands its kit to the next squad every hour (CAI-7). The careful agency moved from 65.0% to 67.5%, inside CSIM-2. No number was tuned. Seed 1 (careful) replays to `6a810e97`.

### Sim baseline, the whole campaign on the 24 x 24 city with travel (2026-11-22, 40 campaigns per driver, seeds 1-40, acts 1 to 3)
| Agency driver | Wins | Reached act 2 | Reached act 3 | Mean days | Raids | Agents killed | End confidence | Ends |
|---|---|---|---|---|---|---|---|---|
| passive | 0.0% | 0% | 0% | 28.2 | 0 | 0 | 7 | turned 40 |
| random | 0.0% | 0% | 0% | 30.7 | 9.2 | 2.3 | 9 | confidence 28, turned 12 |
| careful | 65.0% | 88% | 68% | 120.3 | 225.3 | 18.3 | 80 | source 26, time 7, turned 4, hq 1, spread 1, confidence 1 |

The owner's bigger city (RULING CITY-1, `PLAN.md` D27) and travel (section 22) over acts 1 to 3, measured before any tuning, with the air speeds and the headquarters scout range doubled with the map (RULING AIR-1): the careful agency moved from 67.5% to 65.0%, inside CSIM-2's 40% to 85%. No number was tuned. Seed 1 (careful) replays to `4ecb578c`. Act 1 alone on the bigger city, before acts 2 and 3 were merged in: passive 0%, random 0%, careful 87.5% (it had been 90.0% on the 12 x 12 city).

### Sim baseline, the whole campaign on the 12 x 12 city (2026-11-21, 40 campaigns per driver, seeds 1-40, acts 1 to 3)
| Agency driver | Wins | Reached act 2 | Reached act 3 | Mean days | Raids | Agents killed | End confidence | Ends |
|---|---|---|---|---|---|---|---|---|
| passive | 0.0% | 0% | 0% | 28.2 | 0 | 0 | 7 | turned 40 |
| random | 0.0% | 0% | 0% | 30.3 | 7.8 | 1.6 | 5 | confidence 29, turned 11 |
| careful | 67.5% | 90% | 75% | 124.5 | 255.6 | 19.1 | 81 | source 27, time 6, turned 5, hq 2 |

Seed 1 (careful) replays to `527716b0`. No number was tuned for acts 2 and 3; the planner was changed once (CAI-10: hunting headquarters comes before a seeder while it is unfound).

### Sim baseline, act 1 as it stood before acts 2 and 3 (2026-11-21, 40 campaigns per driver, seeds 1-40)
| Agency driver | Wins | Mean days | Raids | Raids won | Clean raids | Agents killed | Citizens taken | End confidence | Ends |
|---|---|---|---|---|---|---|---|---|---|
| passive | 0.0% | 28.2 | 0 | 0 | 0 | 0 | 254 | 7 | turned 40 |
| random | 0.0% | 30.3 | 7.8 | 3.6 | 2.1 | 1.6 | 255 | 5 | confidence 29, turned 11 |
| careful | 90.0% | 85.9 | 164.1 | 125.1 | 19.7 | 12.5 | 199 | 89 | contained 36, turned 4 |

With M5b's lab and workshop (CAI-7) and M5c's air war (CAI-8, CAI-9). Seed 1 (careful) replays to `7f92a08e`. M5c: as first written the planner spent biomass on scouts that did nothing and the careful agency won 92.5%; `air.seederAmount` 10 -> 20 changed nothing (the careful bot cleanses a seeded organisation fast) and was reverted; scouts as decoys only while a seeder flies (an AI change, CAI-8) gave 90.0%. Before M5b (M5a alone, 2026-11-21) the careful agency won 77.5%. **The careful agency sits on the 90% edge of CSIM-2's band:** research makes act 1 easier for a bot that works every hour, which may be right for act 1 and is an owner call (STATUS Open). M5b tuning (40 campaigns each): research as first guessed gave 92.5%; `shop.carbineWin` 3 -> 1 changed nothing (the bot rarely has money for kit) and was reverted; `lab.tellsAccuracy` 10 -> 5 gave 97.5% (noise) and was reverted; `spread.dailyGrowthPercent` 4 -> 5 changed nothing (a careful agency holds every organisation in the 1-point minimum) and was reverted; `spread.seedAmount` 5 -> 7 gave 90.0% (kept); 7 -> 9 gave 92.5% (louder seeds are found sooner) and was reverted. M5a tuning history (KB rule 30, one change at a time, 20 campaigns each): first guesses gave careful 100% in 4 days (the source was cleansed before the spread began), so CEND-4 became a 90-day act with SPREAD-7's floor (careful 40%); `spread.dailyGrowthPercent` 5 -> 4 (35%, no change); `roster.deathPercent` 50 -> 30 (30%, fewer squad wipes but more spread losses); `watch.hours` 24 -> 12 (70%, target met).

## 16. The client: save and the join (CSAV, CJOIN) - M6, M7
- **CSAV-1** The campaign saves under `ekc-campaign` (KB rule 22; `PLAN.md` Q5's real-time form): on start, on every accepted order, on every pause, whenever the city pauses itself (CSAV-3), and every 600 ticks of play. The envelope holds the key, a version, the time, the state, its `hashCity` and the tray.
- **CSAV-2** Continue reopens the save paused, and only if its key, version, shape and hash agree; otherwise the title says why and offers to discard it. A save of the version before (4, without kit) is checked against its own hash and carried over: every agent gets an empty kit, then the stock is issued to the living in roster order, one of each kind each (RULING SHOP-5).
- **CSAV-3** The city pauses itself when a squad reaches a door, an organisation turns, a seeder crosses into the city, or the act ends. It also holds still while a headquarters screen (LAB, ARMOURY, SQUAD) is open, and on closing runs again only if it was running when the screen opened (RULING CSAV-3).
- **CJOIN-1** At a door, or with headquarters under assault, the player may **fight it**. The battle is the raid site the building names (CITY-4); for a wreck, the site of the building it fell on, or `wreck-raid` (a broken hull in a plaza) on open ground; for an assault, `hq-defence` (the squad holds headquarters' corridor, the attackers come from the street).
- **CJOIN-2** When the battle's report closes, its result returns as a fought result (RES-6, or ACT-5's `defend`): won if the agency won, the downed battle agents mapped in order onto the raid's agents, the battle's hostiles and citizens down. Leaving the battle without a report resolves the raid automatically.
- **CJOIN-6** A fought battle is at night when the city's clock says night (CLOCK-5; battle NIGHT-1), and marks its last hostiles only once the lab has the `hand-scanner` (battle NIGHT-3).
- **CJOIN-5** A fought battle may capture when the lab has `restraints` (battle OBJ-1), and its result carries the captives by kind, the citizens evacuated and, on a wreck, whether the core was secured (RES-7).
- **CJOIN-4** In a fought battle, once the building's owner is at 30 infiltration a fifth of the hostiles (floored, taken from the hosts) are spitters (battle STRAY-3); the auto-resolver does not model them (RES-1).
- **CJOIN-3** The battle is fought with the city's own people (battle ARCH-11): the raid's agents by name in order, those carrying a working shell plate (as `agent-t2`) or a working arc carbine wearing it, as SHOP-4 counts them; and the raid's hostiles by kind (RAID-3, RAID-7, AIR-8, ACT-5, ACT-7).

## 17. The lab (LAB) - M5b: evidence-gated research (`PLAN.md` D24 c)
- **LAB-1** The **shelf** holds evidence: `host`, `taker` and `fighter` bodies, amber `core`s, and live `liveHost` and `liveTaker` captives. A resolved raid shelves its hostiles down, filled hosts first, then takers, then fighters (RAID-7); every taker and fighter body also yields one core.
- **LAB-2** The lab works one project at a time (`src/data/city/research.json`). `research { project }` is legal when the lab is idle, the project is not done, its `requires` are done, the shelf holds its `needs` (not used up) and its `consumes` (used up when it starts). The project advances one hour of work per city hour and is done at its `hours`.
- **LAB-3** **Capture:** with `restraints` done, a won raid takes `lab.capturePerRaid = 1` host alive instead of shelving its body; with `taker-cage` done, one taker too.
- **LAB-4** **Watching:** `host-tells` adds `lab.tellsAccuracy = 10` to a watch's accuracy; `hand-scanner` adds `lab.scannerAccuracy = 5` more and `lab.scannerSpot = 30` to the spotting chance.
- **LAB-5** **Questioning:** with `interrogation` done, `question` uses one live host and names the most infiltrated organisation (ties in data order): a genuine `confession` slip, and every building of that organisation gets a true report.
- **LAB-6** **Losses:** `antiserum` multiplies `roster.deathPercent` by `lab.antiserumDeathPercent = 50` percent; `evacuation` multiplies the auto-resolver's citizens killed by `lab.evacuationCivilianPercent = 50` percent (floored).
- **LAB-7** **The source:** `core-study` (the amber core) has no effect of its own in act 1 and opens `source-trace`, which lifts SPREAD-7's floor, so raids can cleanse the source to 0.

## 18. The workshop (SHOP) - M5b
- **SHOP-1** `shell-plate` and `arc-carbine` research give designs. `build { item }` starts one item when the workshop is idle and the design is done: a plate costs `shop.plateCost = 30` and `shop.plateHours = 24` hours, a carbine `shop.carbineCost = 25` and `shop.carbineHours = 18` hours. The money is paid at the start; the item joins the stock when done.
- **SHOP-2** `order { item }` buys a designed item from the supplier organisation (`kind: "arms"`) for `shop.supplierPricePercent = 80` percent of the cost, delivered after `shop.supplierHours = 6` hours. It is legal while the supplier has not turned.
- **SHOP-3** **Sabotage:** an order placed while the supplier's infiltration is at least `shop.sabotageAt = 20` is sabotaged: it arrives and counts in the stock, but gives nothing, and `shop.sabotageBiomassPercent = 50` percent of its price feeds the organism's biomass. Which items are sabotaged is hidden from the agency (CVIEW-1).
- **SHOP-4** **On a raid**, the squad's members who carry an item of a kind (SHOP-5) take it; the working ones (the carried items scaled by the stock less the sabotaged over the stock, floored, counted from the front of the squad) add `shop.plateWin = 2` (plate) and `shop.carbineWin = 3` (carbine) per agent to the win chance, and a plated agent's down chance falls by `shop.plateDownCutPercent = 40` percent.
- **SHOP-5** **Kit:** the stock is the agency's items, in the store or carried; an agent carries at most one item of each kind. `equip { agent, item }` hands an agent at headquarters (`ready` or `wounded`) a spare item from the store; `unequip { agent, item }` returns it. An agent away (driving, watching, on a raid) keeps what it carries and cannot change it.
- **SHOP-6** A new item (built or delivered) is issued to the first agent at headquarters, in roster order, without one of that kind; with nobody to take it, it waits in the store. A killed agent's kit returns to the store; a wounded agent keeps its kit.

## 19. Raid composition (RAID-7)
- **RAID-7** Of a raid's hostiles, a quarter (floored, at least 1 when there are 2 or more) are takers once the organisation is at `raid.takersAt = 20`, and a quarter (floored) are fighters once it is at `raid.fightersAt = 40`; the rest are hosts. Turned guards count as hosts.

## 20. The air war (AIR) - M5c (`PLAN.md` D24 b: live intercepts; where the craft falls decides the battle)
- **AIR-1** Craft and cars have positions in tenths of a city cell (integers, CARCH-6), 0 to `size * 10` (240) on each axis. Everything in the air moves on the hour (CLOCK-3 d), after the lab and before the slips.
- **AIR-2** From day `air.startDay = 30` the organism may `launch { kind, target }` a **scout** for `air.scoutCost = 6` biomass or a **seeder** for `air.seederCost = 18`, once every `air.launchEveryHours = 24` hours. The craft enters at a point on the city's edge chosen by the engine's dice and flies straight for its target building's cell at `air.scoutSpeed = 60` or `air.seederSpeed = 24` tenths an hour, with `air.scoutHp = 30` or `air.seederHp = 90`. A seeder that arrives **lands**: its target's organisation gains `air.seederAmount = 10` infiltration and a genuine `landing` slip names the building. A scout that arrives turns away. The agency sees every craft but not where it is going (CVIEW-1).
- **AIR-3** The agency starts with `air.startCars = 2` flying cars (`air.carHp = 60`) at headquarters. `intercept { craft, cars }` sends ready cars after a craft; they fly at `air.carSpeed = 80` tenths an hour toward it. `buyCar` adds one for `air.carCost = 80`, up to `air.carCap = 4` that are not lost.
- **AIR-4** A craft's **posture**, set by `posture { craft, press | shadow }`, starts at `press`. Each hour that cars are within `air.engageRange = 6` tenths of a pressed craft they fight: each car hits with `air.carHitPercent = 60` for `air.carDamage = 15`; a seeder fires back at each engaged car, hitting with `air.craftHitPercent = 35` for `air.craftDamage = 20`. A shadowed craft is followed without a shot, so the player chooses where it falls.
- **AIR-5** A car at 0 is lost. When its craft is gone, a car returns: damaged ones go to the hangar for `air.repairHours = 24` hours and come back whole.
- **AIR-6** A craft at 0 **falls where it is**: a crash site with `air.seederSurvivors = 3` or `air.scoutSurvivors = 1` survivors. If it falls on a building's cell, the owner's standing drops `air.crashStanding = 10` and confidence `air.crashConfidence = 3`; over open ground nothing is billed.
- **AIR-7** A crash site not raided within `air.crashHours = 24` hours scatters: the nearest building's organisation gains `air.scatterPerSurvivor = 2` infiltration per survivor.
- **AIR-8** A crash site can be raided like a building (RAID-1); its hostiles are its survivors, a seeder's all takers. It is never a scandal; the site is cleared either way, and a won raid adds `air.crashCores = 2` cores from the craft's drive to the shelf.

## 21. The three acts (ACT) - `PLAN.md` D24 d, `docs/strategic-layer.md` 7
- **ACT-1** The campaign has three acts: 1 "Whispers", 2 "Open sky", 3 "Perfect day". The state carries the act and the day it began; each change of act is an event.
- **ACT-2** **Act 2** opens when act 1 ends contained (CEND-4). From then the organism's daily biomass is raised by `act.biomassBonusPercent = 50` percent and it may launch a craft every `act.launchEveryHours = 12` hours.
- **ACT-3** **Act 3** opens when `source-trace` is finished during act 2 (LAB-7): the agency knows where the source is.
- **ACT-4** From act 2, a scout that passes within `act.hqScoutRange = 30` tenths of headquarters **finds it**: an event and a genuine `found` slip. It stays found.
- **ACT-5** In act 3 the organism may launch **carriers** (`act.carrierCost = 40`, `act.carrierSpeed = 16`, `act.carrierHp = 160`), which fire back at `act.carrierDamagePercent = 200` percent of a seeder's damage, land for `act.carrierAmount = 15` infiltration and leave `act.carrierSurvivors = 4` fighters in a wreck. Once headquarters is found it may **assault** it for `act.assaultCost = 50` biomass, at most every `act.assaultEveryDays = 10` days: `act.assaultHostiles = 6` hostiles, a third takers and a third fighters. While an assault waits, a tick changes nothing (as RAID-4). `defend { result? }` meets it with the agents at home (ready), auto-resolved as RES-1 with up to `raid.maxAgents` of them, or with a fought result; with nobody at home it is lost. A won defence shelves the attackers; a lost one loses the campaign.
- **ACT-6** Act 2 lasts at most `act.act2Days = 100` days and act 3 at most `act.act3Days = 90`; running out of either loses the campaign to time.
- **ACT-7** **The final raid:** in act 3, a raid on the source's tower (`city.json` `agency.final`) meets `act.finalHostiles = 12` hostiles, a third takers and a third fighters. Winning it wins the campaign.

## 22. Travel (TRAVEL) - agents drive between headquarters and the city
- **TRAVEL-1** Headquarters and every building stand at their cell's centre, in tenths of a cell (`x * 10 + 5`); a crash site at its own point. A drive (`leg`) goes in a straight line from one point to another and takes `max(1, ceil(round(distance) * 6 / travel.speedTenthsPerHour))` ticks (`travel.speedTenthsPerHour = 60`: six cells an hour), leaving on the tick it is ordered.
- **TRAVEL-2** A watcher is `travelling` until its drive arrives, then `watching` for `watch.hours`; when the watch ends it reports (WATCH-2) and is `returning` on a drive home; at home it is `ready` (an event).
- **TRAVEL-3** A recalled agent turns for home from where it is: from the building if it was watching, or from the point its drive had reached (integer tenths, truncated toward the start) if it was travelling.
- **TRAVEL-4** A raid's squad shares one drive out (RAID-2); at the door the drive ends. After the raid the agents who are not down are `returning` on a drive home from the building or crash site; the downed are wounded or dead at once (RES-2).

## 15. Rulings log
- RULING: CITY-4 | buildings fight on the three D20 raid maps by their floor count until M7 | the battle engine's ARCH-1 names a battle file; per-building maps are M7's join. provisional
- RULING: RES-1 | raids are auto-resolved by a calibrated formula, not by running the battle engine | a real battle takes about 0.7 s headless, too slow for thousands of sim raids; M7 runs the real battle for raids the player fights and feeds RES-6. provisional
- RULING: CARCH-3 | the legal raid per building lists only the first ready agents up to the cap | every subset is too many to list; any subset is still accepted by `cityStep`. provisional
- RULING: CEND-4 | act 1 is a fixed 90 days, won by containment, and the source cannot be cleansed below a floor | a cleansable source let a careful agency win in 4 days before anything spread; the source is the endgame of M5b's spine research. provisional
- RULING: SPREAD-6 | a turned organisation turns back below the lobby threshold, not only at 0 | a raid that guts a turned organisation should be visible to the player as a recovery. provisional
- RULING: FUND-1 | money may go negative at a month's end | salaries are owed whatever the grant; the debt blocks recruiting (ROSTER-3). provisional
- RULING: RES-6 | a fought result's hostiles down are clamped to the city's hostile count | until M7 the raid maps carry their own rosters, which may differ from RAID-3. provisional
- RULING: SIGN-2 | a slip carries ids, never text | the client words each kind (D25: too perfect by day, the hum by night), so wording changes need no engine change. provisional
- RULING: CSAV-1 | the save holds the whole city state (with its log), not a replay log alone | replaying 90 days of ticks takes seconds on a phone; the state is about 30 KB. provisional
- RULING: CJOIN-3 | a fought battle's hostiles fill the site's hostile spawn points, so more hostiles than a map has points stand on its citizen points as hosts (battle RULING ARCH-11) | the maps were drawn for their own rosters; per-building maps would place each one. provisional
- RULING: LAB-2 | field trials (`docs/strategic-layer.md` 3) wait for a later slice; a built item works at once | the first cut keeps the workshop to cost and time, so the sim can measure research alone. provisional
- RULING: AIR-2 | craft fly in act 1 from day 30, before act 2 exists | D24's "open sky" is act 2; until it is built, a mid-act escalation lets the air war be played and measured. provisional
- RULING: AIR-4 | the live dogfight is resolved on the hour by rolls; the client draws it in real time between hours | the city's tick is ten minutes, and an hour per real second at speed 1 keeps a fight readable while pausable. provisional
- RULING: CSIM-2 | the targets now measure the whole campaign (40% to 85% for the careful agency) instead of act 1 alone (55% to 90%) | act 1 no longer ends the game; a three-act campaign should be lost more often than one act. provisional
- RULING: ACT-3 | act 3 opens on the research, not on a raid | D24 makes research evidence-gated; tracing the source is the evidence that the agency knows where to strike. provisional
- RULING: CITY-1 | "four times as large" is four times the area: the 12 x 12 grid became 24 x 24, the districts doubled in each direction, and the buildings went from 24 to 48 (each old one moved to a cell of its doubled block, 24 new ones placed by a seeded draw with a free cell around each) | the owner asked for a city four times as large (2026-11-22); doubling rather than quadrupling the buildings keeps the slip rate per organisation (SIGN-1 rolls per building) within reach of the old balance, and the 10 organisations are unchanged. provisional
- RULING: TRAVEL-1 | drives are straight lines at one speed, by car, with no traffic or roads in the rules | the owner asked to see agents travel and to pay travel time (2026-11-22); the client draws the car on the street grid's line of sight, and roads would add a path search to every order for no decision. provisional
- RULING: TRAVEL-4 | a squad drives home after a raid, and the wounded are off the books at once | an agent tied up on the drive home is the travel cost the owner asked for; carrying the wounded home changes no decision. provisional
- RULING: AIR-1 | the craft and car speeds doubled with the city (scout 60, seeder 24, car 80, carrier 16 tenths an hour), and with them the range at which a scout finds headquarters (ACT-4, 15 -> 30 tenths, the same share of a scout's hourly step) | a crossing takes as many hours as before, so the air war's timing and balance carry over. provisional
- RULING: SHOP-5 | kit is carried per agent and changed only at headquarters, through the new SQUAD screen; new items are issued to the first agent at home without one (SHOP-6) | the owner asked for the lab, the armory and squad equip on screens of their own (2026-11-22); the old share-out (the first agents of any squad carry the stock) left nothing to equip. Issuing new items to the roster's front keeps the old share-out for a player who never opens the SQUAD screen and for the careful driver, which raids with the first ready agents (`sim:city` below). A save of version 4 is carried over by issuing its stock this way to the living (CSAV-2). provisional
- RULING: CSAV-3 | the lab, the armoury and the squad are sheets of their own over the city (`src/client/city/Screens.tsx`), and the city holds still while one is open, running again as it was on closing | the owner asked for each on a screen of its own (2026-11-22, PLAN D29); a sheet hides the board and the tray, so time passing behind it would let a squad reach a door or a craft cross unseen. provisional
