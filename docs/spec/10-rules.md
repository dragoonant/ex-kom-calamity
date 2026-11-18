# 10 - Battle rules spec (first playable slice, M1)

From 3d-game-generation `templates/spec-10-rules.md`. **The spec is the product** (KB rule 2): the engine in `src/engine/` implements exactly this, tests under `tests/` are named by these ids, and every ambiguity met while building is logged in section 17 as `RULING: <id> | <what we did> | <why>` with a status word instead of blocking. Where this spec and `docs/GAME-DESIGN.md` disagree, this spec wins. Every number written as `section.key = N` is a key in `src/data/tuning.json` (default shown; `npm run validate:data` checks that the two agree); unit and weapon numbers live in `src/data/units.json` and `src/data/weapons.json`. The engine reads numbers only from data. Every number is a first guess *(tune)* until a `sim` result says otherwise (KB rule 30).

**Scope (KB rule 6):** one raid on one building, real time with pause, hidden hosts among citizens. Nothing from the city layer (M5 on), no alien AI (M3: hostiles only defend themselves by stance here). The client rules (TIME-6, SAV-3..6) arrived with M2; everything else is M1. Every proper name is a placeholder (`PLAN.md` D10); none is taken from the inspiration (`docs/GAME-DESIGN.md` section 5).

Source documents: `docs/GAME-DESIGN.md` sections 2 and 3, `PLAN.md` D3, D4, D6, D7, Q3, Q4, Q5; KB `recipe.md` sections 2, 3, 5 and 11.

---

## 0. Engine contract (ARCH)
- **ARCH-1** `createGame(setup) -> State`. `setup = { battleId: string, seed: number, tuning?: Partial<Tuning> }`. The battle file (`src/data/battles/<battleId>.json`) names the map, the squad and every spawn; `tuning` overrides are merged key by key per section and stored in `state.tuning`, so a replay carries its own numbers.
- **ARCH-2** `step(state, action) -> { ok: true, state, events } | { ok: false, state, reason }`. Pure: never mutates its input, never throws on a bad action (a rejection returns the same state object and a readable reason). Only programmer errors throw.
- **ARCH-3** `legalActions(state, side) -> Action[]` is **never empty**: `tick` is always in it, for every side, before and after the battle ends (TIME-5).
- **ARCH-4** `query.*` computes every number a client could show (section 14). The client never does rules maths.
- **ARCH-5** `view(state, side) -> State` hides what that side cannot know (section 13). An AI reads only its own view.
- **ARCH-6** State is **plain JSON**: no classes, Maps, Sets, functions, `undefined`, `NaN` or `Infinity`. `JSON.parse(JSON.stringify(s))` deep-equals `s`.
- **ARCH-7** Randomness comes only from an sfc32 RNG whose four 32-bit words live in `state.rng`. Same seed plus the same action list gives the same state, byte for byte.
- **ARCH-8** Every resolved roll emits an event with its full breakdown (FIRE-9, DMG-4); every other change that a client would draw emits an event (moves, doors, reveals, downs, the end).
- **ARCH-9** `state.log` keeps the accepted actions in order; consecutive `tick` actions are stored as one entry `{ type: "tick", count }`. `replay(setup, log)` rebuilds the state and `hashState(state)` is a 32-bit FNV-1a of its JSON text.
- **ARCH-10** No DOM, three.js or React import anywhere under `src/engine/`; the engine depends only on `src/data/`.

## 1. Time (TIME)
- **TIME-1** Time is counted in ticks; `time.ticksPerSecond = 10`. `state.tick` starts at 0.
- **TIME-2** Time advances **only** through the `tick` action. Pause is the absence of ticks: orders (section 4) are accepted whether or not ticks are flowing, so the player gives orders paused or live.
- **TIME-3** One `tick` resolves in this order: (a) every living unit in id order acts: it picks its current target (FIRE-2) and either aims or fires at it, or, with no current target, advances its move order (section 5); (b) proximity reveals (HIDE-3); (c) `tick` increases by 1; (d) the end check (section 12).
- **TIME-4** `advance(state, seconds) -> { state, events }` applies `round(seconds * time.ticksPerSecond)` tick actions and concatenates their events. It is the deterministic hook a client's fixed-step loop and the tests drive (KB `recipe.md` section 11); nothing in the engine reads a clock.
- **TIME-5** After the battle is over (END-5), `tick` is still legal and accepted; it returns the same state (no log entry, no event).
- **TIME-6** The client's loop (M2) owns no clock of its own: each frame it feeds wall time, clamped to 0.25 s and multiplied by the speed setting (1, 2 or 4), into an accumulator and issues `floor(accumulated * time.ticksPerSecond)` ticks through `advance` (TIME-4), keeping the remainder. A paused frame feeds nothing. The same `advance(seconds)` is exposed on the page as `window.__ekc.advance(seconds)` so tests drive time without a frame clock.

## 2. Map (MAP)
- **MAP-1** The battle takes place on one map of `width` x `depth` tiles on `levels` levels. A tile is `{ x, y, level, kind, open }`, `x` east, `y` south, level 0 the ground. **Every tile carries a level** (`PLAN.md` Q4).
- **MAP-2** Tile kinds and their map legend: `ground` (`,`, outdoors, passable), `floor` (`.`, indoors, passable), `wall` (`#`, impassable, blocks sight), `door` (`+`, passable; blocks sight while closed), `stair` (`>`, passable, connects levels, MAP-4), `void` (space, impassable, does not block sight: open air beside an upper floor).
- **MAP-3** `open` is `false` on every tile except a door that has been used: it becomes `true` forever when a unit steps onto a `door` tile (MOVE-7).
- **MAP-4** A `stair` tile at `(x, y, L)` connects to the tile at `(x, y, L+1)` and to `(x, y, L-1)` when that tile is also a `stair`. There is no other way between levels.
- **MAP-5** Distance between two tiles on the same level is Euclidean between tile centres: `sqrt(dx^2 + dy^2)`. Adjacency for melee is Chebyshev distance 1 (the eight neighbours). Tiles on different levels have no distance.
- **MAP-6** The first map is `civic-savings-branch`: a two-floor bank branch with a roof (levels 0, 1, 2), 16 x 12 tiles, the street around it on level 0. The building belongs to a placeholder organisation, "Civic Savings"; the name appears only in data and may change.

## 3. Units (UNIT)
- **UNIT-1** Sides: `agency` (the player), `hostile` (hosts and takers), `civilian` (citizens; engine-driven, never gives orders).
- **UNIT-2** A unit is created from a template in `units.json` with `hp`, `armour`, `aim`, `moveTicks` (ticks per orthogonal step), `sight` (tiles), `weapon` (a `weapons.json` id or none), `disguised` (HIDE-1) and `defaultStance` (STANCE-2). Agents may override the weapon per battle file.
- **UNIT-3** Unit ids: agents `a1..aN` in squad order; every other unit `u1..uM` in order of `(level, y, x)` of its spawn tile, so an id says nothing about what a unit is.
- **UNIT-4** A unit with `hp = 0` is **down**: it acts no more, takes no more orders, stops blocking movement (MOVE-5) and is never a legal target. Its body stays on its tile in the state.
- **UNIT-5** Templates in the first slice: `agent-t1` (plain security gear, `PLAN.md` D7 tier 1), `host` (a taken-over citizen, disguised, pocket pistol), `taker` (the organism, fast, melee, never disguised), `citizen` (unarmed). Numbers are in `units.json`; the JSON wins.

## 4. Orders (ORD)
- **ORD-1** Actions: `{ type: "tick" }`; `{ type: "move", side, unit, to: { x, y, level } }`; `{ type: "fire", side, unit, target }`; `{ type: "stance", side, unit, stance }`; `{ type: "halt", side, unit }`; `{ type: "withdraw", side: "agency" }`.
- **ORD-2** An order is rejected (`ok: false`) when the battle is over, the unit does not exist, is down or does not belong to `side`, or the side is `civilian`.
- **ORD-3** `move` is legal when `to` is a passable tile other than the unit's own, not held by a living unit, and a path exists (MOVE-2). It replaces any earlier move order and keeps the fire target.
- **ORD-4** `fire` is legal when the target is a living unit of another side that `side` can currently see (SEE-5), at any range. It sets the unit's **explicit target** (a new target resets `aimProgress`; the same target again changes nothing); the unit fires when it can (FIRE-1) and otherwise keeps moving. A `fire` on a unit that appears to be a citizen is legal: the player may shoot a suspect, and pays for it in the counters (CIV-3).
- **ORD-5** `stance` is legal for any stance other than the unit's current one (STANCE-1).
- **ORD-6** `halt` is always legal for a living own unit: it clears the move order, the explicit target and any aim in progress.
- **ORD-7** `withdraw` is legal for `agency` while the battle is not over; it ends the battle at once (END-4).
- **ORD-8** `legalActions(state, side)` lists, in this order: `tick`; for each living unit of the side in id order, `halt`, each other `stance`, `move` to every reachable tile (QRY-3), `fire` at every legal target; then `withdraw` for the agency. For `civilian` and for a finished battle the list is `tick` alone.

## 5. Movement (MOVE)
- **MOVE-1** Movement is 8-directional on a level. A diagonal step is allowed only when both orthogonal tiles it passes are passable (no corner cutting). A level step is a move between a `stair` tile and the tile above or below it (MAP-4).
- **MOVE-2** Step cost in ticks: orthogonal `unit.moveTicks`; diagonal `round(moveTicks * move.diagonalCostPercent / 100)`, `move.diagonalCostPercent = 141`; level step `round(moveTicks * move.stairCostPercent / 100)`, `move.stairCostPercent = 150`. Paths are cheapest-first (Dijkstra) over passable tiles, ignoring units; ties break by the neighbour order east, south, west, north, then the four diagonals clockwise from north-east, then up, then down.
- **MOVE-3** A move order holds the remaining path and a `progress` counter. Each tick in which the unit has no current target (FIRE-2), `progress` rises by 1; when it reaches the cost of the next step the unit moves onto that tile, `progress` returns to 0 and a `moved` event is emitted. On the last step an `arrived` event follows and the order clears.
- **MOVE-4** A unit with a current target does not advance its move order (it stands and fights); the order survives and resumes when the target is gone.
- **MOVE-5** A tile holds at most one living unit. Down units do not block. When the next tile is held, the unit waits (`progress` stays at the step cost) and counts `blockedTicks`; at `move.blockedWaitTicks = 5` it replans around every held tile; if no path remains the order clears with a `moveBlocked` event.
- **MOVE-6** Reaching a tile is instantaneous for rules purposes: the unit is on exactly one tile at every tick, the one in `unit.x, unit.y, unit.level`.
- **MOVE-7** Stepping onto a closed `door` opens it (`doorOpened` event) at no extra cost (MAP-3).
- **MOVE-8** A unit is **moving** for FIRE-5 when, at its most recent step of TIME-3a, it advanced its move progress (it had a move order, no current target and was not blocked). The flag is `unit.moving`; a shooter earlier in unit order reads the target's flag from the previous tick.

## 6. Sight (SEE)
- **SEE-1** Line of sight between two tiles on the same level follows the Bresenham line between their centres; it is blocked when any tile strictly between them is a `wall` or a closed `door`. Units, bodies, `void` and `ground` never block. There is no line of sight between levels.
- **SEE-2** A unit sees a tile when the tile is on its level, within its `sight` (MAP-5) and in line of sight (SEE-1). A unit always sees its own tile.
- **SEE-3** A side sees every tile that one of its living units sees. `civilian` sees nothing for rules purposes.
- **SEE-4** A side sees a unit when it sees that unit's tile. A side always sees its own units.
- **SEE-5** "Can currently see" in ORD-4 and section 13 means SEE-4 evaluated on the true state at that moment.
- **SEE-6** A diagonal line that passes exactly between two wall corners is not blocked (Bresenham visits no wall tile).

## 7. Disguise (HIDE)
- **HIDE-1** A `disguised` hostile (a host) that is not yet `revealed` appears to the agency as a citizen: in the agency's view (VIEW-2) it carries the `citizen` template, side `civilian`, no weapon, no orders.
- **HIDE-2** A host is revealed the moment it resolves a shot (FIRE-6), whether or not the shot hits.
- **HIDE-3** A host is revealed when, at TIME-3b, a living agency unit on its level has line of sight to it within `sight.revealRange = 3` tiles.
- **HIDE-4** Revealing is permanent and emits `revealed { unit, by: "fire" | "proximity" }`.
- **HIDE-5** Stance fire (STANCE-3) never targets a unit that appears to be a citizen to the shooter's side: agents never fire on their own at unrevealed hosts or at citizens. The hostile side has no disguise to see through.

## 8. Stances (STANCE)
- **STANCE-1** Stances: `engage` (fire at any eligible target), `retaliate` (fire only at eligible targets that have fired within the last `fire.retaliateMemoryTicks = 50` ticks), `hold` (never fire without an explicit target).
- **STANCE-2** Each template names its `defaultStance`: agents and hostiles `engage`, citizens `hold`.
- **STANCE-3** An **eligible** stance target for a unit is a living unit of an enemy side (agency vs hostile; citizens are never eligible, HIDE-5) that the unit itself sees (SEE-2), that is in weapon range (FIRE-1) and, for `retaliate`, whose `lastFiredTick` is within memory (`tick - lastFiredTick <= fire.retaliateMemoryTicks`, and it has fired at all).
- **STANCE-4** Among eligible targets the unit picks the nearest by MAP-5; ties go to the earliest in unit order (UNIT-3: agents first, then `u1, u2, ...`).

## 9. Fire (FIRE)
- **FIRE-1** A unit can fire at a target when it has a weapon, the target is a living unit of another side on its level, the shooter sees the target's tile (SEE-2), and the target is in range: Euclidean distance `<= weapon.range` for `ranged` weapons, Chebyshev distance 1 for `melee` weapons.
- **FIRE-2** A unit's **current target** at its step of TIME-3a is its explicit target (ORD-4) when FIRE-1 holds for it, otherwise its stance target (STANCE-3, STANCE-4), otherwise none. An explicit target that is down or no longer seen by the side is dropped; one that is merely out of range or out of the shooter's own sight is kept and waited for.
- **FIRE-3** With a current target and the weapon ready (`tick >= readyTick`), `aimProgress` rises by 1 per tick; when it reaches `weapon.aimTicks` the shot resolves in that same tick. A tick without a current target resets `aimProgress` to 0. With a current target but the weapon not ready, the unit waits (and stands, MOVE-4).
- **FIRE-4** Resolving a shot sets `readyTick = tick + weapon.cooldownTicks`, `lastFiredTick = tick`, `aimProgress = 0`, counts `score.shotsFired`, and reveals a disguised shooter (HIDE-2).
- **FIRE-5** Hit chance in percent: `raw = weapon.accuracy + shooter.aim - weapon.falloffPerTile * floor(distance) - (target moving ? fire.movingTargetPenalty : 0)`, `fire.movingTargetPenalty = 15`; `chance = clamp(raw, fire.minHitChance, fire.maxHitChance)`, `fire.minHitChance = 5`, `fire.maxHitChance = 95`. Melee uses distance 0.
- **FIRE-6** The roll is one RNG integer `0..99`; the shot hits when `roll < chance`.
- **FIRE-7** A miss has no further effect (no stray hits in this slice).
- **FIRE-8** A hit applies damage (section 10) to the target.
- **FIRE-9** Every shot emits `shot { shooter, target, weapon, distance, moving, breakdown: { accuracy, aim, falloff, movingPenalty, raw, chance }, roll, hit }`.

## 10. Damage (DMG)
- **DMG-1** Raw damage is one RNG integer in `weapon.damageMin..weapon.damageMax` inclusive.
- **DMG-2** Damage dealt is `max(0, raw - target.armour)`.
- **DMG-3** `hp` falls by the damage dealt and never below 0. At 0 the unit is down (UNIT-4) and a `down` event follows the `damaged` event; the side counters `score.agentsDown`, `score.hostilesDown`, `score.civiliansDown` rise.
- **DMG-4** Every hit emits `damaged { unit, raw, armour, dealt, hp }` and `score.hits` rises.

## 11. Citizens (CIV)
- **CIV-1** Citizens never move, fire or take orders in this slice; they stand where they spawned.
- **CIV-2** Citizens block movement like any living unit and never block sight.
- **CIV-3** `score.civilianHits` rises on every hit on a unit that appears to be a citizen to the agency at that moment (a real citizen, or a host not yet revealed); `score.civiliansDown` counts real citizens only.

## 12. End of battle (END)
- **END-1** The agency wins when no living hostile unit remains: `over = { winner: "agency", reason: "cleared", tick }`.
- **END-2** The hostiles win when no living agency unit remains: `winner: "hostile", reason: "squad-lost"`. When both END-1 and END-2 hold after the same tick, `winner: "none", reason: "mutual"`.
- **END-3** When `tick >= time.maxBattleSeconds * time.ticksPerSecond` with no winner, `winner: "none", reason: "timeout"`; `time.maxBattleSeconds = 600`.
- **END-4** `withdraw` ends the battle with `winner: "none", reason: "withdrawn"` (what a withdrawal costs is the city layer's business, M7).
- **END-5** Once `over` is set it never changes; every order is rejected (ORD-2) and `tick` is a no-op (TIME-5). An `over` event is emitted once.

## 13. View (VIEW)
- **VIEW-1** `view(state, side)` returns a `State` that holds the side's own units in full and keeps tiles, tick, tuning, score and `over`.
- **VIEW-2** Units of other sides appear only while the side can currently see them (SEE-5), **redacted**: `order: null`, `fireTarget: null`, `aimProgress: 0`, `readyTick: 0`, `lastFiredTick: -1`, `stance: "hold"`; a disguised, unrevealed host additionally shows template `citizen`, side `civilian`, `weapon: null`, `disguised: false` and the citizen template's name (HIDE-1). Position, `moving`, `hp`, `maxHp`, `armour`, `aim`, `moveTicks`, `sight`, `revealed` and `down` are shown as they are (the suit says what it is).
- **VIEW-3** Down units of other sides are shown while their tile is seen, redacted the same way.
- **VIEW-4** The view's `rng` is `[0, 0, 0, 0]` and its `log` is empty, so no side can foresee a roll or read the other side's orders. `civilian` sees only its own units.

## 14. Queries (QRY)
- **QRY-1** `query.seconds(state)` = `tick / time.ticksPerSecond`; `query.ticksFor(state, seconds)` = `round(seconds * time.ticksPerSecond)`.
- **QRY-2** `query.hitChance(state, shooterId, targetId)` returns the FIRE-5 breakdown with `chance`, or `{ ok: false, reason }` when FIRE-1 fails; `query.damageRange(state, shooterId, targetId)` returns `{ min, max }` after armour.
- **QRY-3** `query.reachable(state, unitId)` lists every tile the unit can path to with its cost in ticks (MOVE-2), excluding tiles held by living units; `query.path(state, unitId, to)` returns `{ steps, ticks }` or `null`.
- **QRY-4** `query.canSee(state, side, unitId)`, `query.visibleTiles(state, side)` and `query.los(state, a, b)` expose section 6; `query.distance(a, b)` exposes MAP-5.
- **QRY-5** `query.outcome(state)` returns the counters of `state.score`, living counts per side and `over`.
- **QRY-6** `query.unitsSeen(state, side)` lists the ids of units the side can see (SEE-4).

## 15. Save (SAV) - engine side (SAV-1, SAV-2) and client side (SAV-3..SAV-6, M2; `PLAN.md` D13, Q5; KB rule 22)
- **SAV-1** The save snapshot is `state` itself (ARCH-6). A battle reopens by loading the snapshot; the action list rides along for replay (`replay(setup, log)` equals the snapshot, ARCH-9).
- **SAV-2** Autosave points for M2: every pause, every accepted order and every `save.autosaveSeconds = 10` seconds of sim time. The engine only supplies the number.
- **SAV-3** The client keeps one save under the `localStorage` key `ekc-save`: an envelope `{ game: "ekc", version: 1, savedAt, reason, setup, snapshot, log, paused: true, selected, level }` where `snapshot` is the state and `log` equals `snapshot.log`. It is written when a raid starts (before its first frame), at every SAV-2 point and when the player leaves the battle screen. Over-long saves are not a concern: one envelope is about 60 KB.
- **SAV-4** Continue reopens the snapshot **paused**, with the saved selection and level, without replaying; the title screen names what it reopens: the battle, the sim seconds, agents standing out of the squad, hostiles down and the time saved. Discard asks once more before clearing.
- **SAV-5** A finished battle clears its save the moment `over` is set; the report is shown from memory.
- **SAV-6** Never silent: a save that is not readable JSON, of another version, for a battle this build lacks, or with an incomplete snapshot is reported on the title screen by reason, with Discard offered; a storage that refuses a write is reported in the console strip and the battle plays on unsaved.

## 16. Invariants (INV) - checked by `sim` and `action-fuzz` after every step
- **INV-1** `legalActions(state, side)` is never empty for any side (ARCH-3).
- **INV-2** `0 <= hp <= maxHp` for every unit; a unit is down exactly when `hp = 0`.
- **INV-3** No two living units share a tile; every unit stands on a passable tile that exists; every tile carries an integer level in `0..levels-1`.
- **INV-4** `tick` never decreases and increases by exactly 1 per accepted tick while the battle is not over.
- **INV-5** `JSON.parse(JSON.stringify(state))` deep-equals `state`; the JSON text contains no `NaN`, `Infinity` or `undefined`.
- **INV-6** `view(state, side)` contains no unit the side cannot see and no field VIEW-2 redacts.
- **INV-7** `replay(setup, state.log)` hashes to `hashState(state)` (checked at the end of every sim battle).

## 17. Rulings log
`RULING: <rule id> | <what we did> | <why>` with a status word (`open`, `provisional`, `owner-confirmed`). One per line, newest last.

- RULING: ARCH-3 | `tick` is legal after the battle is over, as a no-op | `CLAUDE.md` freezes "legalActions never empty" without an exception, and a real-time client keeps ticking until the player leaves the end screen. provisional
- RULING: TIME-1 | 10 ticks per second, not the 60 Hz of KB section 11 | 60 Hz is a frame rate for an action game; a squad sim needs 100 ms resolution, and a client's 60 Hz loop accumulates time and issues ticks (TIME-4). provisional
- RULING: MOVE-1 | 8-directional movement with no corner cutting, like project-x MOVE-2 | 4-directional paths look wrong on an isometric board and the cost is one table row (MOVE-2). provisional
- RULING: MOVE-4 | A unit with a current target stands still, even during its weapon cooldown | Firing on the move needs animation and accuracy rules this slice has no evidence for; `hold` lets the player push through. provisional
- RULING: MOVE-5 | Paths ignore units until a unit is blocked for 5 ticks, then replan around held tiles | Units move, so planning around them makes paths flap; a short wait then a replan is what the player expects. provisional
- RULING: SEE-1 | No line of sight between levels and `void` never blocks | Cross-level sight needs geometry (parapets, windows) the map format does not carry yet; the roof is a ring of parapet walls instead. provisional
- RULING: SEE-1 | Units never block line of sight | Real-time positions change every tick; unit-blocked lines would make hit chances flicker. provisional
- RULING: HIDE-2 | A host is revealed by firing or by proximity, not by being hit | Being shot says nothing about what one is; a hit on a disguised host still counts as a civilian hit (CIV-3) so the counter leaks nothing either. provisional
- RULING: UNIT-3 | Non-agent ids are assigned by spawn position, not by kind | Ids by kind (`h1`, `c1`) would tell the player which citizen is a host. provisional
- RULING: UNIT-5 | `host.hp` equals `citizen.hp` in data | VIEW-2 shows `hp` and `maxHp`; a different value would unmask a host. provisional
- RULING: ORD-4 | A fire order at a target out of range is legal and waits | It doubles as a focus-fire order; rejecting it would make the player re-issue it every second. provisional
- RULING: FIRE-2 | An explicit target the side can still see but the shooter cannot is kept; one the side cannot see is dropped | The player asked for it; the squad still knows where it is. provisional
- RULING: FIRE-3 | A tick without a current target resets aim | A half-aimed shot carried across a chase would fire the instant the target reappears, which looks like a reflex the unit does not have. provisional
- RULING: FIRE-7 | Misses have no stray effect in this slice | Stray hits on citizens and walls are a destruction feature for M4 or later. provisional
- RULING: END-2 | Both sides wiped in one tick is `winner: "none", reason: "mutual"` | Unit order inside a tick should not decide a battle. provisional
- RULING: END-4 | Withdrawal is `winner: "none", reason: "withdrawn"` | The cost of leaving belongs to the city layer (M7). provisional
- RULING: VIEW-2 | Enemy `hp` is visible; orders, stances and aim are not | The suit's state is drawable; intentions are not. provisional
- RULING: VIEW-4 | The view zeroes the RNG and empties the log | An AI reading its view could otherwise predict rolls or read the player's orders. provisional
- RULING: CIV-1 | Citizens do not move in this slice | Fleeing is behaviour and arrives with the M3 AI milestone. provisional
- RULING: STANCE-2 | Hostiles default to `engage` | Hosts opening fire from disguise is the drama of the first playable; the M3 AI will set stances itself. provisional
- RULING: ORD-4 | A new fire order resets the aim in progress; re-issuing the same target does not | Swinging to a new target takes the aim time; a repeated click must not be a penalty. provisional
- RULING: MOVE-8 | The moving flag is the target's state at its last step, which may be the previous tick | A shooter earlier in unit order cannot know what the target will do later in the same tick; the lag is one tick and symmetric. provisional
- RULING: TIME-3 | Inside a tick a unit downed by an earlier unit does not act | Units act in a fixed order; the alternative (simultaneous resolution) needs a two-phase tick this slice does not need. provisional
- RULING: SAV-4 | A raid always reopens paused, and a new raid starts paused | The player should never return to a fight already moving; the opening pause is where orders are given (PLAN.md Q5 default). provisional
- RULING: SAV-5 | The save is cleared when the battle ends, not when the report is closed | A reload during the report returns to the title without a stale Continue; the report is a summary the city layer (M7) will own. provisional
- RULING: ORD-4 | A tap on a tile that holds an apparent citizen with an agent selected is a fire order | KB rule 25 resolves a tap to the legal action for the tile; the hover card names the target and the civilian-hit cost before the tap. provisional

## 18. Sim baseline (KB rule 30)
`npm run sim`, 40 battles per driver pair, seeds 1-40, 2026-11-17, numbers as committed. The drivers are not an AI (hostiles stand or take random orders), so this is the starting line, not a verdict. Re-run after M3 and change one number at a time.

| Driver pair | Agency wins | Mean sim seconds | Agents down / battle | Civilian hits / battle | Hit rate |
|---|---|---|---|---|---|
| random vs random | 100% | 28.1 | 0.45 | 0.28 | 54.8% |
| sweep vs stand | 100% | 32.0 | 0.10 | 0.00 | 59.8% |

## Sources
`docs/GAME-DESIGN.md` draft 1 (2026-11-17), `PLAN.md` D3, D4, D6, D7, D10, Q3-Q5; KB `rules.md` 2, 8, 22, 30; KB `recipe.md` sections 2, 3, 5, 11; project-x `docs/spec/10-rules.md` as the shape donor (ARCH, MOVE-2, MOVE-7).
