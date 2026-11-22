# The tech tree and the armoury (proposal, 2026-11-22)

`PLAN.md` D28 and milestone M10. This is the design; the rules land slice by slice in `docs/spec/20-city.md` (city side) and `docs/spec/10-rules.md` (battle side), and where this file and a spec disagree, the spec wins (KB rule 2). Every number here is a first guess *(tune)* that will live in data and move only with a `sim:city` or `bench:ai` result (KB rule 30). **Every name is a placeholder** (D10), checked against `docs/GAME-DESIGN.md` section 5: none is the inspiration's.

## 1. Why
Today the lab has 11 projects and the workshop two items (the shell plate and the arc carbine), and the kit is dealt out at the door to the first agents in the squad (SHOP-4, CJOIN-3). Every other agent fights with the gun its spawn point names. The owner, 2026-11-22: "This isn't going to work if there's only a few options to choose from." The owner chose, in question batch 10 (2026-11-22):

| # | Question | Owner's pick |
|---|---|---|
| a | Tree size | **About 40 projects in seven branches**, about 30 items; a careful campaign finishes about 70% of it |
| b | Human engineering | **A branch that needs no alien evidence**, paid in money and time; alien tech stays evidence-gated (D24 c) |
| c | Loadout | **Slots by suit**: suit, long arm, sidearm and belt slots that grow with the suit tier; over the suit's carry limit the agent is slower; kit changes only at headquarters |
| d | The flying suit | **Its own slice after the core weapons**: armoury, screen and most of the tree first, then flight rules with a bench result, then the GPU model |

The principle stays the one in `docs/strategic-layer.md` 2: **verbs, not bonuses**. Most projects give the squad something new to *do* in a raid; the few passive ones are marked.

## 2. Evidence
The shelf (LAB-1) keeps `host`, `taker`, `fighter`, `core`, `liveHost`, `liveTaker` and gains two kinds:
- **`spitter`**: a spitter's body (battle section 28). Spitters are fought only in fought battles (CJOIN-4), so the auto-resolver shelves one spitter for every fifth hostile down once the owner is at 30 infiltration, as CJOIN-4 counts them.
- **`hull`**: a plate of a wreck's hull. A won wreck raid (AIR-8) adds `hull` 1 from a scout, 2 from a seeder, 3 from a carrier, beside its cores.

Agency engineering needs no evidence. It costs **money** at the start (the workshop's SHOP-1 rule, applied to the lab) as well as hours.

## 3. The tree: 43 projects in seven branches
The 11 projects built in M5b keep their ids and effects; **built** marks them. *needs* stays on the shelf, *consumes* is used up at the start (LAB-2). Hours are lab hours; a city day is 24.

### 3.1 Agency engineering (10) - money and time, no evidence
| id | Name | Requires | Hours | Cost | Gives |
|---|---|---|---|---|---|
| `marksman-rifle` | Marksman rifle | - | 48 | 60 | Long arm: range 20, accuracy 75, falloff 1 a tile, aim 14 ticks, 5 rounds. Aimed shots only (a snap shot is -40): it decides a fight across a hall, not a room |
| `burst-carbine` | Burst carbine | - | 48 | 60 | Long arm: each shot is 3 rounds rolled at -10 each, 12 rounds. Kills in the open, empties fast |
| `riot-vest` | Riot vest | - | 36 | 40 | Suit (tier 1+): armour 6, the tier 1 frame's slots |
| `smoke-canister` | Smoke canister | - | 24 | 30 | Belt, used up: thrown 6 tiles, a 3 x 3 cloud for 15 s that blocks sight through it, both ways |
| `shaped-charge` | Shaped charge | - | 36 | 40 | Belt, used up: placed on an adjacent wall or floor, destroys that one tile with no blast around it (a clean breach with no collateral) |
| `field-dressing` | Field dressing | - | 24 | 25 | Belt, used up: 3 s on itself or an adjacent agent, +20 hp up to the maximum |
| `folding-barrier` | Folding barrier | `riot-vest` | 36 | 40 | Belt, used up: 2 s to stand a low-cover barrier (COVER, a solid prop) on an adjacent tile; it can be shot apart |
| `second-bench` | Second lab bench | - | 72 | 120 | The lab works two projects at once |
| `second-line` | Second workshop line | - | 72 | 120 | The workshop builds two items at once |
| `infirmary` | Infirmary | - | 48 | 80 | Passive: wounds heal in half the time |

### 3.2 Host (7)
| id | Name | Needs / consumes | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `restraints` **built** | Stun baton and restraints | host 1 | - | 24 | Capture (LAB-3, OBJ-1). **New:** restraints become a belt item; a capture uses one carried restraint |
| `host-tells` **built** | The host's tells | host 2 | - | 36 | Watching +10 (LAB-4) |
| `interrogation` **built** | Questioning a captive | liveHost 1 | `restraints` | 24 | `question` (LAB-5) |
| `hand-scanner` **built** | Hand scanner | consumes liveHost 1 | `host-tells` | 48 | Watching +5, spotting +30, the last-hostiles marks (NIGHT-3). **New:** a belt item, reusable: 2 s to test one citizen in sight within 4 tiles; a host is revealed |
| `sight-flare` | Sight flare | host 3 | `host-tells` | 36 | Belt, used up: thrown 8 tiles, reveals every host within 4 tiles of it for 10 s |
| `tell-lenses` | Tell lenses | liveHost 1 | `host-tells` | 48 | Belt (worn), reusable: the wearer's reveal range 3 -> 5 tiles (HIDE) |
| `host-graft` *(dark)* | Sight graft | consumes liveHost 1 | `hand-scanner` | 72 | An operation on one agent, not an item: that agent sees hidden hosts within 6 tiles. In each fought battle there is a 5% chance the graft takes the agent, who becomes a host mid-raid. If a grafted agent dies in public, confidence falls by 10. Optional; nothing requires it |

### 3.3 Taker (6)
| id | Name | Needs / consumes | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `antiserum` **built** | Bite antiserum | taker 1 | - | 36 | Fewer deaths (LAB-6) |
| `taker-cage` **built** | Taker cage | taker 1 | `restraints` | 24 | Capture takers (LAB-3) |
| `evacuation` **built** | Evacuation drill | taker 2 | `antiserum` | 36 | Fewer citizens killed (LAB-6), EVACUATE (OBJ-2) |
| `lure-charge` | Lure charge | taker 2 | - | 36 | Belt, used up: thrown 6 tiles; every taker within 10 tiles goes to it for 8 s (taker AI) |
| `bite-lining` | Bite lining | taker 3 | `antiserum` | 48 | Passive: every suit gets +4 armour against bites and melee |
| `snare-gun` | Snare gun | liveTaker 1 | `taker-cage` | 48 | Long arm: range 6, 3 rounds; a hit holds the target for 4 s, and a held target can be captured at any health |

### 3.4 Fighter (6)
| id | Name | Needs / consumes | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `shell-plate` **built** | Shell plate | fighter 1, core 1 | - | 72 | Suit tier 2 (D7): armour 8, hp 70 |
| `stilt-study` | Stilt study | fighter 2 | - | 36 | Passive: a fighter hit for 25 or more in one shot is crippled and moves at half pace for 10 s |
| `whip-cutter` | Whip-cutter | fighter 2, core 1 | - | 48 | Long arm, melee (range 1): damage 40 to 60; 2 s to cut a wall tile quietly, with no blast |
| `braced-shell` | Braced shell | fighter 3, core 2 | `shell-plate` | 72 | Suit tier 2+: armour 11, hp 75 |
| `tendril-line` | Tendril line | fighter 1 | `whip-cutter` | 48 | Belt, reusable: 3 s to climb or drop one level at a window or a roof edge |
| `chitin-shield` | Chitin shield | fighter 2 | `shell-plate` | 36 | Sidearm slot: while the agent is not firing its long arm, half cover (-25) from the front |

### 3.5 Spitter (2)
| id | Name | Needs | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `filter-mask` | Filter mask | spitter 1 | - | 24 | Belt (worn), reusable: spore sacs do half damage and no suppression to the wearer |
| `spore-grenade` | Spore grenade | spitter 2 | `filter-mask` | 48 | Belt, used up: thrown 8 tiles, a 3 x 3 cloud for 6 s: 10 damage a second and +30 suppression to anyone in it, agents without masks included |

### 3.6 Wrecks (4)
| id | Name | Needs | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `hull-alloy` | Hull alloy | hull 1 | - | 48 | Passive: every suit's carry +1 |
| `hull-screen` | Hull screen | hull 2, core 1 | `hull-alloy` | 72 | Belt (worn): absorbs the first 40 damage of each battle |
| `drive-study` | Drive study | hull 1, core 1 | - | 48 | Passive: cars fly 25% faster |
| `craft-beam` | Craft beam | hull 2, core 2 | `drive-study` | 72 | Passive: a car's hit does 25 instead of 15 (AIR-4) |

### 3.7 The spine: the amber core (8)
| id | Name | Needs / consumes | Requires | Hours | Gives |
|---|---|---|---|---|---|
| `arc-carbine` **built** | Arc carbine | core 2 | - | 72 | Long arm (the first energy weapon) |
| `arc-pistol` | Arc pistol | core 2 | `arc-carbine` | 36 | Sidearm, energy |
| `arc-driver` | Arc driver | core 3, fighter 1 | `arc-carbine` | 72 | Heavy long arm, weight 4: damage 50 to 80, structure damage 40, 4 rounds. Opens walls in passing |
| `core-study` **built** | The amber core | core 3 | - | 48 | Opens the source (LAB-7) |
| `amber-burst` | Amber burst | core 2 | `core-study` | 48 | Belt, used up: thrown 6 tiles, stuns every alien body (revealed host, taker, fighter, spitter) within 2 tiles for 4 s, so they can be captured; harmless to humans |
| `core-cell` | Core cell | core 4 | `core-study` | 96 | Nothing of its own: it powers the flying suit |
| `flight-suit` | Flying suit | core 2, fighter 1, hull 1 | `core-cell`, `braced-shell` | 120 | Suit tier 3 (D7): armour 9, hp 75, flies (M10g) |
| `source-trace` **built** | Tracing the source | core 5, consumes liveTaker 1 | `core-study` | 96 | Act 3 (ACT-3) |

**Count:** 10 + 7 + 6 + 6 + 2 + 4 + 8 = **43 projects** (11 built, 32 new). 26 give items, 9 are passive, 3 are facilities and 5 are story gates or enablers (`interrogation`, `core-study`, `core-cell`, `source-trace`, `host-graft`).

### 3.8 Pacing
Target *(tune)*, measured by `sim:city` with the careful driver once its research order covers the whole tree:
- **Act 1** (90 days, mostly host bodies, some takers, fighters from 40 infiltration): about 14 projects. Engineering, the host line, the taker basics, the shell plate, the arc carbine.
- **Act 2** (wrecks and spitters arrive): about 10 more. Wrecks, spitter, braced shell, the arc pistol and driver, stilt study.
- **Act 3**: the core cell, the flying suit, the source. A careful campaign ends with about 30 of 43 done (70%), and which 30 differs by run because the evidence does.

## 4. The items: 31
**Free** kit is unlimited and never built. **Limited** kit is built (SHOP-1) or bought (SHOP-2) one piece at a time and held by whoever carries it. **Used up** kit is built in pairs and spent in battle.

| Slot | Item | Free / limited / used up | Weight | Build cost / hours |
|---|---|---|---|---|
| Suit | Security gear (tier 1, `agent-t1`) | free | - | - |
| Suit | Riot vest (tier 1+) | limited | - | 40 / 24 |
| Suit | Shell plate (tier 2, `agent-t2`) **built** | limited | - | 30 / 24 |
| Suit | Braced shell (tier 2+) | limited | - | 60 / 36 |
| Suit | Flying suit (tier 3) | limited | - | 120 / 72 |
| Long arm | Patrol carbine | free | 2 | - |
| Long arm | Scatter gun | free | 2 | - |
| Long arm | Marksman rifle | limited | 3 | 35 / 18 |
| Long arm | Burst carbine | limited | 2 | 35 / 18 |
| Long arm | Snare gun | limited | 2 | 40 / 24 |
| Long arm | Whip-cutter | limited | 2 | 40 / 24 |
| Long arm | Arc carbine **built** | limited | 2 | 25 / 18 |
| Long arm | Arc driver | limited | 4 | 70 / 36 |
| Sidearm | Service pistol | free | 1 | - |
| Sidearm | Arc pistol | limited | 1 | 30 / 18 |
| Sidearm | Chitin shield | limited | 2 | 35 / 24 |
| Belt | Breaching charge (BLAST, two to a slot) | free | 1 | - |
| Belt | Shaped charge | used up | 1 | 20 / 12 a pair |
| Belt | Smoke canister | used up | 1 | 15 / 8 a pair |
| Belt | Field dressing | used up | 1 | 15 / 8 a pair |
| Belt | Folding barrier | used up | 1 | 20 / 12 a pair |
| Belt | Restraints | used up | 1 | 10 / 6 a pair |
| Belt | Hand scanner | limited | 1 | 30 / 24 |
| Belt | Sight flare | used up | 1 | 20 / 12 a pair |
| Belt | Tell lenses | limited | 1 | 30 / 24 |
| Belt | Lure charge | used up | 1 | 20 / 12 a pair |
| Belt | Filter mask | limited | 1 | 15 / 12 |
| Belt | Spore grenade | used up | 1 | 25 / 12 a pair |
| Belt | Tendril line | limited | 1 | 25 / 18 |
| Belt | Hull screen | limited | 1 | 50 / 36 |
| Belt | Amber burst | used up | 1 | 30 / 18 a pair |

### 4.1 The suit decides the frame
| Suit | Belt slots | Carry | Armour | hp |
|---|---|---|---|---|
| Security gear | 2 | 5 | 4 | 60 |
| Riot vest | 2 | 5 | 6 | 60 |
| Shell plate | 3 | 7 | 8 | 70 |
| Braced shell | 3 | 7 | 11 | 75 |
| Flying suit | 4 | 6 | 9 | 75 |

- A belt slot holds one item, or two of a used-up kind.
- **Weight** is the long arm, the sidearm and one per belt item. Each point over the suit's carry adds 1 to the agent's `moveTicks` (4 -> 5 is a quarter slower). At most 2 points over are allowed. So the arc driver on security gear is a choice: heavy fire, a slow agent.
- A new recruit is issued security gear, a patrol carbine, a service pistol and two breaching charges.

## 5. The armoury (city rules, M10a)
- **Items are pieces, not counts.** The armoury holds limited and used-up kit as pieces `{ id, item, sabotaged }`; `sabotaged` is hidden from the agency (CVIEW-1). A piece is either on the shelf or carried by one agent.
- **`equip { agent, slot, piece | item }`** is legal only for a `ready` agent at headquarters. Free kit is named by item, everything else by piece. Taking a piece off returns it to the shelf. Fitting over the weight limit is rejected with a reason.
- **Each agent's kit goes with them**: on a watch, on a drive and into a raid. CJOIN-3 and SHOP-4's "first agents carry the stock" are retired. The roster sends each agent's own suit, long arm, sidearm and belt.
- **A sabotaged piece** (SHOP-3) looks whole. In battle a suit gives the frame below it, a gun jams after its first magazine, and a used-up item is a dud. The agency learns it only by fielding it.
- **What comes home:** used-up kit spent in a fought battle is gone and the rest returns. In an auto-resolved raid, each agent spends one used-up item if it carries one. A dead agent's kit is recovered if the raid is won and lost if it is lost (Q23).
- **The auto-resolver** (RES-1) reads every agent's kit through each item's `resolve` values in data (`win` points, `downCutPercent`), replacing `shop.plateWin` and `shop.carbineWin`. A sabotaged piece counts as nothing.
- **The careful driver** (CAI-7) gets a research order over all 43 projects. Its equip policy is "best fit": the strongest suit, then the long arm the raid's hostiles call for, then belt items by a priority list in data. Its build policy is a squad's worth of suits and arms first, then used-up kit.

## 6. Battle rules (M10b and after)
- **The roster** (ARCH-11) carries `{ name, suit, weapon, sidearm, belt }`. Each suit is a unit template (`agent-t1`, `agent-t1v`, `agent-t2`, `agent-t2b`, `agent-t3`), with move ticks raised by the weight rule. Without a roster nothing changes.
- **The unit** gains `sidearm`, `active` (long or side) and `belt` (item and count per slot). It also gains two orders: **`swap`** (1 s, long arm and sidearm; the pistol is the reload you do not have to wait for) and **`use { item, at | target }`** for belt items. Each item is its own small spec section with ids and tests.
- **This is a D17 contract change:** a spec edit, a new golden and a note in PLAN D17.
- **The AIs:** the agency `normal` driver (the bench's other seat) learns to use each item as it lands. The hostile AI reacts to smoke (it loses sight like anyone), lures (takers go) and flares (revealed hosts run or fight). Every slice re-runs `bench:ai` (gate 95%) and `sim`.

## 7. The screens
- **ARMOURY**, a new console tab beside LAB AND WORKSHOP. **Built in M10a** as a wide sheet above the console (the console's card column was too narrow for it; on a phone the sheet stacks at the top):
  - *Left:* the roster with status lamps; only agents marked ready can be changed.
  - *Centre:* the selected agent's card. It shows the suit as a silhouette and the slot lamps (SUIT, LONG ARM, SIDEARM, BELT 1 to 4), a carry gauge that turns amber over the limit, and the numbers that matter (hit chance at 5 and 15 tiles, armour, hp, move pace). Every number comes from a new `query.kit` (ARCH-4: the client does no rules maths).
  - *Right:* the shelf, filtered by the slot clicked, with counts and the built or ordered mark. Click a piece to fit it.
  - *Buttons:* BEST FIT FOR EVERYONE AT HOME, and STRIP (everything back to the shelf). SAME AS LAST RAID was dropped in M10a: an agent keeps its kit between raids, so the last raid's kit is already what it carries.
  - Info cards are drawn by the console, never native tooltips (KB rule 8). The mouse map stays KB rule 27's. On a phone the three columns stack.
- **Raid card:** the RAID file card lists each picked agent's kit in one row, with a CHANGE KIT link to the armoury (only before the squad leaves).
- **LAB as a tree.** The LAB tab draws the seven branches as columns of lamps: done, in progress, ready, *needs evidence* (with what is missing and what the shelf holds) and *locked* (with the projects it requires). A click opens the project's card and, once done, its lab report (`docs/strategic-layer.md` 2: the reports tell the story).
- **WORKSHOP:** one queue per line, used-up kit built in pairs, and the supplier's price and the line's time side by side.
- **Battle console:** the agent card gains the sidearm, a SWAP switch and a button per belt slot with its count. Keys are picked in M10b against the existing map (Q28).

## 8. Art and sound
- **Icons:** each item gets a procedural icon in the D11 enamel-and-lamp palette (no GPU), and the slot lamps use the same set.
- **On the figures:** stand-in weapon props in hand, by kind (pistol, carbine, rifle, heavy, melee). The riot vest and the braced shell are paint variants of the tier 1 and tier 2 models. The flying suit needs a new model from the locked tier 3 look (D7: sample `suit-t3-flight-s32`, bright red and black), gated by measurement on the GPU host (Q7) in M10g.
- **Sound:** smoke, flare, lure, spore and amber burst take new takes in the D23 manner (`tools/audio/manifest.ts`), with the synth as the fallback.

## 9. Data
- `src/data/items.json`, new and shared by the city and the battle: `id`, `name`, `slot`, `kind` (free, limited, usedUp), `weight`, `design` (the project that unlocks it), `build` (cost and hours, pairs for used-up kit), `battle` (the unit template, the `weapons.json` id or the belt item's effect id) and `resolve` (win points, down cut).
- `src/data/city/research.json` grows to 43 projects with `cost` (money, engineering) and `kind` (item, passive, facility, gate).
- `validate:data` checks the following:
  - every item has a design, and the design exists;
  - every project can be reached (no cycles, and every `requires` exists);
  - every evidence kind exists on the shelf;
  - every effect id has a spec rule.

## 10. What this is not
- The hostiles do not get the agency's kit, and there is no loot from hostile weapons beyond the evidence.
- There is no item weight on the auto-resolver, no ammunition count in the city, no item repair and no selling kit back.
- Field trials (`docs/strategic-layer.md` 3; RULING LAB-2) wait for M10h.
- The dark options stay a single project (`host-graft`) until a playtest asks for more.
