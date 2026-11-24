# Presentation concept (KB rule 21)

**One line:** *Grease pencil on acetate*: the company's field map is a sheet of smoked acetate clipped over a tactical plot; orders, odds and notes are written on it in safety-orange and chinagraph-white grease pencil; headings are stencilled like the walkers' own markings; numbers are typed in mono.

## Tokens (`src/styles.css` `:root`)
| Token | Value | Use |
|---|---|---|
| `--ib-ink` | `#14181a` | page and canvas ground |
| `--ib-sheet` | smoked acetate `rgba(22,27,29,.78)` | every card |
| `--ib-chalk` | `#e9e4d6` | chinagraph white text |
| `--ib-orange` | `#ff7a1a` | safety orange: our side, primary buttons, pencil arrows |
| `--ib-red` | `#e0352a` | the Directorate, damage |
| type | Big Shoulders Stencil (headings), IBM Plex Mono (numbers, body), Kalam (pencil notes, log, banners' subline) |

Board marks are hand-drawn pencil squares (blue reach, red targets, orange selection); the log reads as pencil notes in the top-right; cards carry a strip of tape.

## Must not look like
- **ex-kom-calamity** (the 1950s Civil Defence console: enamel panels, lamps, printed slips, warm cream).
- **Stellar Derelict** (the last original tactics game) and **Three Kingdoms Tactics** (war-council sand table, cloth slips, wax seals).
- **Liangshan: 108 Stars** (ink stamps and wanted posters): no stamps, no paper textures here.
- **The source series of the genre**: no names, mechanical designs, interface frames or fonts from it.

`npm run check:look` fails if the stylesheet loses the concept's tokens or borrows a sibling's signature colours.
