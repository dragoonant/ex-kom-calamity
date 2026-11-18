# Figures: the measured house style for this game

Written before any figure work (KB rule 7 scope note; `PLAN.md` D8). Every figure, placeholder or generated, is gated against this file by measurement, and the image is checked, not the prompt (KB rule 13). Words that may never appear in a prompt are KB rule 23; the list is not copied here.

## 1. The style, in measurements
The owner chose the house figure style of KB rule 7, animated (D8: it "should work better for animation. Use that"). The tier 2 suit reference `docs/concept/samples/chrome-suit-t2-h2.jpg` is the on-style figure every new figure is laid beside (D7).

| Measure | Value | Check |
|---|---|---|
| Height | about 2.8 head-heights | count heads in the image |
| Head or helmet | about 35% of the standing height | head height / total height |
| Shoulders | about 1.8 times the head's width, armoured, very broad | shoulder width / head width |
| Legs | short and thick, about one head long | hip to sole / head height |
| Face | covered (helmet or visor) or stern; never a child's | |
| Finish | matte, realistic paint with edge highlights, like a premium painted miniature; serious and highly detailed | |
| Pose | standing square, weapon low; one neutral pose per figure until animation says otherwise | |
| Base | none; feet on the tile | |

## 2. Rosters and colours
| Figure | Colours and marks | Reference |
|---|---|---|
| Agent, tier 1 (plain security gear) | Bright red (`#c8322a`) plates over black (`#1b1b1f`) underlayer; single black visor; no silver, no chest light, no crest | D7; `docs/GAME-DESIGN.md` 5 |
| Agent, tier 2 (moulded suit) | Same colours, smooth shell helmet with two upward-slanting almond lenses | `chrome-suit-t2-h2.jpg` (locked) |
| Citizen | Enamel cream coat (`#e7dcc1`) over graphite (`#3b3f44`), bare head, stern | none yet; placeholder |
| Host, passing as a citizen | Drawn exactly as a citizen until revealed (spec HIDE-1) | `gemini-alien-host-a`, `chrome-host-2` once revealed up close |
| Host, revealed | Citizen body with sea-glass green (`#7fc8b0`) skin and an amber (`#e0a030`) core glow at the throat; coral growth on the head | `alien-host-s42` (locked, D14) |
| Taker | The organism that takes hosts: sea-glass body with an amber core on dark chitin legs | `alien-taker-s51` / `alien-taker-s52` (locked, D14) |
| Fighter (in the game since M3, template `fighter`) | Headless sea-glass column with an amber core on three dark chitin stilt legs, four coral whip arms | `gemini-alien-fighter-a`, **the first fighter in the game** (owner, 2026-11-17, D14); `alien-fighter-s61` (two-legged, crested) is a later or elite type |

## 3. Placeholders in M2 and M3
M2 draws procedural stand-ins in the colours above, built to the measurements in section 1 (head sphere 35% of a 1.2-unit figure, shoulders 1.8 heads wide, legs one head long); the taker's stand-in is a column on three legs until its own model exists. M3 adds the fighter's stand-in: a taller headless column on three long stilt legs with four whip arms angled out, the amber core at mid-height (`src/client/board/Figures.tsx`, `Fighter`). They carry no pointer handlers (KB rule 25) and are only ever replaced, never shown while a model loads (KB rule 26). No art is generated in M2 or M3.

## 4. When figures are generated (M4)
- One prompt per figure, the first with the style reference attached, through the Gemini web app in Claude in Chrome (never the API, owner's spend decision), with the locked references of D7 and D14 attached for suits and aliens.
- Gate per image: head share of height within 30-40%, shoulder width 1.6-2.0 heads, legs at most 1.2 heads, white background, no base. A side-by-side with `chrome-suit-t2-h2.jpg` goes in `docs/concept/gates/`.
- Figures that predate this file are listed here with the date they are regenerated (KB `gotchas.md`, figures).

## Sources
KB `rules.md` 7, 13, 15, 23, 26; `PLAN.md` D7, D8, D14; `docs/concept/samples/gemini-chrome-brief.md` Locked sections.
