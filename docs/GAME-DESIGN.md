# Game design, draft 1 (2026-11-17)

Working title and **every proper name here are placeholders**. Where this file and a spec disagree, the spec wins (KB rule 2). Numbers marked *(tune)* are first guesses that will live in data (KB rule 30). Items marked **(proposal)** are the drafter's and await the owner; everything else cites an owner decision in `PLAN.md`.

## 1. Pitch
One retro-future city, one agency, one hidden enemy. You run the city's emergency agency. Something is quietly taking over citizens and whole organisations from the inside; you raid buildings in real time with pause to root it out, and every raid is watched by the organisations that fund, supply or oppose you. When the enemy stops hiding, the fight moves to the streets and the sky.

Inspiration, stated openly (KB rule 3): X-COM Apocalypse. The owner, 2026-11-17: "I loved the setting - city based, real time and turn based tactics, aliens. The ultraman suits really stuck with me."

## 2. Pillars
| # | Pillar | Source |
|---|---|---|
| 1 | **The city is the board.** One city, always the same one, that changes because of what you do | D1, D2 |
| 2 | **Real time, with pause.** Orders are given paused or live; a turn-based mode on the same rules follows | D4 |
| 3 | **It starts hidden.** Infiltration first, open war later; whom you raid matters as much as how | D6 |
| 4 | **The suit is the reward.** Plain security gear, then the sleek moulded suit, then the flying suit | D7 |
| 5 | **Bright surface, rot underneath.** A city of tomorrow that is proud of itself | D5 |

## 3. The battle half (built first, D3)
- Squad of 6 *(tune, Q3)* inside one building: several floors, rooms, doors, stairs, destructible walls and furniture (**proposal**; floors per Q4).
- Time runs in fixed ticks. The player pauses at will, gives orders to one agent or several, and unpauses. Agents left alone defend themselves by stance (**proposal**).
- Enemy: hosts (taken-over citizens who look ordinary until close), the organisms that take hosts, and later purpose-grown fighters (**proposal**, from D6).
- Civilians and property count: the building belongs to an organisation, and damage is billed to your standing with it (**proposal**, from pillars 1 and 3).
- The M1 spec (`docs/spec/10-rules.md`) holds the actual rules and numbers; this section is intent only.

## 4. The city half (built second, D3)
- A 3D city of districts and buildings, each owned by an organisation (**proposal**).
- Organisations have a standing with the agency and an infiltration level the player cannot see directly (**proposal**, from D6).
- The agency's income depends on the city's confidence in it (**proposal**).
- Ground and air craft respond to alerts; in the open phase alien craft appear over the city (D6).
- Research turns recovered material into the suit tiers of D7 (**proposal**).

## 5. Keep it our own (KB rules 3, 18, 29)
| Stay clear of | What we do instead |
|---|---|
| X-COM Apocalypse's names for its city, organisations, agency, aliens and equipment | Our own names; placeholders until the owner picks |
| Its alien roster and their look | Our own species, designed from D6 |
| Its story of where the aliens come from and how the game ends | Our own; not written yet |
| Its interface, building tiles and city map layout | `docs/presentation-concept.md`; our own maps |
| The Ultraman costume's marks: its silver-and-red pattern, the chest light, the head crest, the eye shape | A moulded suit in our own two-tone scheme with a single visor band; figures are described by measurements and materials only (KB rule 23) |
| Sibling games' looks (project-x "Bodycam feed") | `docs/presentation-concept.md` |

The codename "ex-kom-calamity" sounds like the inspiration's title, so it stays out of the game itself (D10).

## Changelog
- Draft 1, 2026-11-17: kickoff, from the owner's messages and two question batches.
