# The strategic layer, proposal 1 (2026-11-21)

Status: **proposal**, the drafter's, awaiting the owner (KB rule 12). It grows `docs/GAME-DESIGN.md` section 4 and becomes `docs/spec/20-city.md` in M5; where they disagree, the spec wins (KB rule 2). Every proper name here is a placeholder (D10) and was checked against `docs/GAME-DESIGN.md` section 5 (KB rule 29). Numbers marked *(tune)* are first guesses that will live in data (KB rule 30).

## 0. The one idea
**Every strategic choice changes the next battle, and every battle changes the next strategic choice.** Nothing on the city layer is a stat bump in a menu: research gives the squad new *verbs*, the air war decides *where* and *what* the next battle is, and the hidden enemy is a second player with an economy the squad can starve.

The loop, one turn of it:

```
 slip on the switchboard ─► investigate ─► choose a raid (where, when, with what)
        ▲                                              │
        │                                              ▼
 the enemy adapts ◄── research and workshop ◄── battle: what you kill, capture, lose, break
```

## 1. The hidden enemy is a player with an economy (the heart of it)
The alien is one organism in three bodies (D14). On the city layer it is a planner that reads `view(state, 'hostile')` only, exactly like the battle AI (spec section 22), and spends one resource:

- **Biomass** *(tune)*: grows with every citizen taken. Spent on new takers, purpose-grown fighters, seeder craft, and **influence** inside an organisation.
- **Infiltration** per organisation, 0 to 100%. It is **never shown** to the player as a number. The player sees **symptoms**, printed as slips on the switchboard (D11):
  - missing-persons reports clustered on one district
  - an organisation's odd purchases (cold storage, mineral salts, amber resin)
  - a power-draw spike at night in one building
  - a council vote or a price rise that goes against the agency
  - a supplier's shipment that arrives short, or sabotaged
- **What a high infiltration does:** the organisation lobbies to cut the agency's funding, raises its prices to you, refuses you its buildings, sells you sabotaged gear, and past a threshold *(tune 60%)* turns: its guards fight beside the hosts in raids on its buildings.

**Why it is fun:** whom you raid is a deduction. Raid a clean building and you pay a scandal (confidence and the owner's standing fall); raid a rotten one and the battle is what its infiltration says it is. The tactical layer already has the content for this: a 15% building is a raid with 2 hosts among 12 citizens (the reveal game of HIDE-1..5); a 70% building is a nest with takers and a fighter.

**Investigation as a verb, not a menu:** an agent sent to *watch* a building for a day *(tune)* narrows its infiltration to a band (low / some / heavy) and may spot a host (a slip with a face). Research unlocks better tools (section 2). Captured hosts can be questioned (section 2) to reveal which organisation a cell reports to.

## 2. Research: the specimen drives the tree
Research is gated by **what the squad brings home**, not by time alone. A project needs its evidence on the shelf: a corpse, a live capture, a weapon, a core, a piece of a wreck. So the battle decides what the lab can study, and a live capture is worth far more than a kill.

Three branches, one per body, and a spine through the amber core that ends the game:

| Branch | Evidence | What it gives the squad (verbs, not bonuses) |
|---|---|---|
| **Host** (the hidden body) | host corpse, then a live host | *Tells*: reveal range 3 → 4 tiles (HIDE). *Hand scanner*: an action that tests one citizen in sight. *Sight flare*: a thrown item that reveals every host in a radius for a few seconds. *Questioning*: a captured host names its cell |
| **Taker** (the organism) | taker corpse, then a live one | *Antiserum*: an agent bitten in battle can be saved if pulled out within N seconds *(tune)*. *Evacuation protocol*: citizens run from takers (the Q18 rule, unlocked by research rather than switched on). *Lure*: a charge that draws takers |
| **Fighter** (the grown soldier) | fighter corpse, whip arm, chitin | *Coral plate*: the tier 2 moulded suit's armour (D7). *Whip-cutter*: a melee arm that cuts walls cleanly. *Stilt study*: fighters' legs break under heavy fire (a crippled state) |
| **Spine: the amber core** | cores from every body, a wreck's drive | *Arc carbine* (first energy weapon) → *core cell* (the flying suit's power, tier 3, D7) → *the source*: where the organism started (the endgame) |

- **Capturing needs a tool first:** the first project of the game is a *stun baton* and a *restraint* (an agent carries a captive like a charge). The battle choice becomes: kill the host from safety, or close in and risk a bite to bring it home.
- **Lab reports are the story.** Each finished project prints a typed report in the D11 voice: dry science that gets stranger as the plot comes out. The order the player researches is the order the story is told.
- **Dark options:** some projects use the organism itself (a core-cell suit, a graft that sees hosts). Stronger, but an agent who wears it may be taken in battle, and the council's confidence drops if it leaks. Optional, never required.

## 3. Weapons: know how, then build, then field-test
Three steps, each a decision:

1. **Research** gives the design (section 2).
2. **The workshop** builds a **prototype**: one item, slow, costs material. It goes into battle as a single named piece.
3. **Field trials:** using the prototype in battle (hits, kills, captures) completes its trials, then it can be **manufactured** in the workshop or **ordered** from an organisation.

The supplier is the twist: buying from an arms maker is cheaper and faster than building, but **an infiltrated supplier delivers sabotaged gear** (a weapon that jams, a charge that is a dud) and its money feeds the enemy's biomass. Building at home is the safe, slow road. The symptom slips (section 1) warn you, if you read them.

The first line, all placeholders: stun baton; restraint; improved charge (shaped breach, smoke); sight flare; hand scanner; arc carbine; whip-cutter; coral plate; core cell. Each one changes how a raid is played, not only its numbers.

## 4. The air war: flying cars over the city
The agency's craft are flying patrol cars (`docs/concept/samples/craft-patrol-s71.jpg`). They carry the squad to a raid **and** fight in the sky. The air war is the same tick engine and the same real time with pause, drawn over the 3D city.

**Alien craft by act** *(tune)*:
- **Scout:** fast, weak; if it lives it finds the agency's garages and marks them.
- **Seeder:** slow and armoured; it drops takers onto a roof. Missed, it starts an infiltration at that building and a **seeding alert** (a rescue battle on a clock).
- **Carrier** (act 3): drops fighters; shot down, it is the biggest crash site of the game.

**Intercept, real time with pause:** pick the cars, give them a posture (press, stand off, shadow), pause and re-order mid-fight. Cars take damage that costs garage time; a car lost with its crew is a memorial entry.

**Where it falls matters, and the player steers it:**
- Shot down over a building: the building takes damage (billed to its owner, standing falls) but the wreck is **inside a raid site**: a battle on that building's map (D20) with survivors and the craft's drive as evidence.
- Shot down over the river, the park or a rail yard: no bill, a **crash-site battle** in the street ring, fewer survivors, the drive damaged.
- Let it go: no battle, but its cargo lands.

So the dogfight is about *herding* a craft toward the ground you want to fight on, and the crash is the next battle.

**Travel time is a real cost:** a squad in the air is not at the garage; two alerts at once means choosing. Ground vans are cheaper and slower and stop at damaged roads.

## 5. The city, the clock and the money
- **The clock:** real time with pause, a dial on the console *(tune: 1 city hour per real second at speed 1)*. Day and night are real (Q20): a raid at noon finds more citizens and more hosts among the workers; a raid at 3 a.m. finds fewer witnesses and hosts asleep in nests.
- **Districts and organisations:** about 6 districts and 10 organisations *(tune)*, each owning buildings, each with a standing toward the agency and a hidden infiltration.
- **Money:** a monthly grant from the city council by **public confidence**. Confidence rises with clean raids, rescues, crashes on open ground; it falls with collateral damage, dead citizens, scandals and seeders let through.
- **The agency's buildings:** an HQ and rented buildings with slots: lab, workshop, garage, infirmary, **quarantine**, cells. Found by a scout, a building can be attacked: a defence battle on our own map.

## 6. The squad lives on the city layer
- **A roster** of named agents with experience, wounds that take days to heal, and a memorial wall on the console.
- **Bitten agents:** a bite in battle may infect *(tune)*; the agent goes to quarantine, and without antiserum turns on a clock. Late in the game, with the city heavily infiltrated, **one recruit may already be a host**: the paranoia beat, handled by the hand scanner.
- **Suits are the reward** (pillar 4): tier 1 security gear → tier 2 moulded suit (coral plate research) → tier 3 flying suit (core cell). The flying suit changes battles: agents land on roofs and fight on any level.

## 7. Three acts
| Act | The enemy | New on the city layer | Battles |
|---|---|---|---|
| 1. **Whispers** | Hidden: takers seed hosts, hosts steer organisations | Symptoms, watching, the first raids, the stun baton | Raids on one building (D20), small, mostly hosts |
| 2. **Open sky** | Seeder and scout craft over the city; the first organisation turns | Craft, intercepts, crash sites, the workshop line | Crash sites, seeding rescues, raids on a turned organisation |
| 3. **The bloom** | Coral grows on infiltrated buildings at night; carriers drop fighters | The source located through the spine; the agency HQ is found | Carrier crashes, HQ defence, the final assault on the source |

**The story proposal (ours, not the inspiration's):** the organism did not arrive by spacecraft this year. It was in the ground before the city, and the miracle material the City of Tomorrow was built on, the amber, is the organism's core. The city's wealth is the alien (pillar 5: bright surface, rot underneath). The organisation that first sold the amber is the source of the infiltration, and its tower is the last raid.

**Win:** reach the source and raid it. **Lose:** the council withdraws the charter (confidence under a floor *(tune)* for a month), or half the organisations turn.

## 8. How each battle comes from the city
| City event | Battle | Built on |
|---|---|---|
| A raid the player chose | One building, roster from its infiltration and the hour | D20 sites, HIDE, TAKE |
| A seeder missed | Rescue on a roof, a clock until the takers take the floor below | TAKE, VIEW-5 |
| A craft shot down | Crash site: wreck in the street ring or inside a building, survivors, evidence | D20 maps, the halcyon block kept as data |
| HQ found | Defence on the agency's own building | a new map |
| The end | The source | a new map |

Results flow back: kills and captures to the lab shelf, damage to the owner's standing and the bill, citizens saved or taken to confidence and biomass, wounds and deaths to the roster.

## 9. How it is built (engine contract, M5 onward)
- One pure `step` for the city, as the battle has: time moves only through `tick`, pause is the absence of ticks, `legalActions` never empty, `query.*` owns every number, plain-JSON state with a seeded RNG, `view(state, side)` hides infiltration from the agency.
- The enemy's planner lives in `src/ai/` and reads `view(state, 'hostile')`, like the battle AI.
- Battles the player does not fight are auto-resolved by running the battle engine with both AIs (the bench drivers), so auto-resolve and the real fight follow the same rules.
- `sim` gains city bots (a passive agency, a greedy agency, a careful one) and a win-rate target, as M5 asks (`PLAN.md` 4).

Suggested slices, each shippable:
1. **M5a** city clock, organisations, infiltration with symptoms, the enemy's biomass planner, raids chosen from slips, battles auto-resolved. Sim: the passive agency loses, the careful one wins.
2. **M5b** the lab and the workshop: evidence shelf, the three branches and the spine, prototypes and field trials, suppliers and sabotage.
3. **M5c** the air war: craft, intercept with pause, crash location, crash-site battles.
4. **M6** the 3D city on the switchboard; **M7** the join (a chosen raid opens the real battle, results flow back, one campaign save).

## Open questions for the owner (defaults in use until answered)
| # | Question | Default |
|---|---|---|
| S1 | How hidden is infiltration? | Symptoms only, narrowed to a band by watching and research; never a number |
| S2 | Air combat form | Real time with pause over the 3D city; where the craft falls decides the next battle |
| S3 | Research gating | Evidence-gated, with live capture worth most |
| S4 | Campaign length | Three acts, about 10 to 15 hours *(tune)* |
