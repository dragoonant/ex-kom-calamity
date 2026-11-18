# Presentation concept (KB rule 21 worksheet)

From 3d-game-generation `templates/presentation-concept.md`. Status: **the owner said yes to the console and the 1950s-future look on 2026-11-17** after seeing `docs/concept/samples/console-mood-s95.jpg` (`PLAN.md` D11). The token table below is still the drafter's detail built on that yes.

## 1. One-line concept
**"Civil Defence switchboard of the City of Tomorrow"**: the player sits at the agency's control board, a 1950s-future console of enamel panels, lamp rows, toggle switches and printed message slips.

## 2. Must not look like
| Name | Why it is a risk | What we do differently |
|---|---|---|
| project-x ("Bodycam feed": scanlines, REC, timestamps, target brackets; KB `projects/project-x.md`) | Newest sibling and the code donor | No video-feed effects at all. Solid enamel panels, lamps and printed slips; light background, not black |
| Three Kingdoms Tactics ("war-council sand table") and Virtually Off ("orbital proving ground") (KB `recipe.md` step 1) | The two siblings before that | No parchment or wood; no neon holograms |
| The starter template | Structure donor | Every token in section 3 rewritten |
| X-COM Apocalypse's own interface | The inspiration | Our own layout, icons and palette; no copied panel shapes or button art |

## 3. Tokens, rewritten from nothing
| Surface | Decision |
|---|---|
| Palette (named roles) | Enamel cream (panel), teal (structure), coral (alert), mustard (caution), graphite (text), lamp green (ok). The agency's own colours are bright red and black (`PLAN.md` D7), used for agent lamps and markers |
| Typefaces | Display: a geometric sans in wide caps; body: a humanist sans; numerals: tabular, as on a meter face |
| Frame shapes | Rounded-rectangle panels with a chrome bead edge, visible screw heads at corners, no cut corners |
| Title screen and menu | A city skyline poster in flat colour under the console; menu items are labelled toggle switches |
| HUD | A console strip along the bottom: agent lamps, stance switches, a large PAUSE paddle; time control reads as a dial |
| Event feed | Message slips that drop into a tray, newest on top, each stamped with the sim time |
| Unit cards | Personnel file cards with a clipped photo corner |
| Prompts and modals | A hinged cover that lifts over the console |
| Icons | Single-colour pictograms in the style of period public signage |
| Transitions and stingers | Lamp-test sweep on load; a two-tone chime for alerts |
| Music and voice | Period orchestral optimism that sours in combat; a calm announcer voice. Not verified by ear until `sounds.html` exists (KB rule 9) |
| End screen | An incident report form with a "Copy report" button |

## 4. Kept from the template (structure only, KB rule 16)
Layout rules, camera rig and mouse map (KB rule 27), save/Continue flow (KB rule 22), tile-only picking (KB rule 25).

## 5. Checks before the first playable ships
- [ ] Screenshots of the title, the setup screen and a mid-battle view beside project-x's; none could be mistaken for the other.
- [ ] A failing check greps the stylesheet for project-x's fonts, palette colours and scanline effects (0 hits).
- [x] Owner's yes recorded in `PLAN.md` with the date (D11, 2026-11-17).

## Sources
`PLAN.md` D5, D11; KB `rules.md` rules 16 and 21; KB `projects/project-x.md` section 2.
