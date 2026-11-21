# City and craft art, round 9 (2026-11-21)

Judging samples for the strategic layer (`docs/strategic-layer.md`, PLAN D24) and the alien repaint (D25, Q22). Made with FLUX.1-dev through the Hugging Face router (`tools/concept/render.py`, the same call as `tools/sample-concepts.py`); prompts in `docs/concept/samples/city-r9/prompts-r9.json` describe shapes in measurements and materials only. Palette: enamel cream, teal, mustard, graphite, chrome; agency signal red and black; aliens pearl `#d4dadb`, amber `#e0a030`, dark chitin. No Gemini calls.

**Calls:** 44 image calls (36 first seeds + 8 re-rolls, all returned an image); 3 image-to-3D calls, all refused (below). No GLB was made, so `public/models/craft/` was not created.

**Gate:** each image was opened and checked by eye for palette, no coral or green, white background for objects, whole object in frame, and the brief's shape. A failed group got one re-roll with a fixed prompt (`first_prompt` / `reroll` in the prompts file). Results: **pass**, **partial** (usable with a named fix), **fail**.

## Picks
| Group | Pick | Gate | Notes |
|---|---|---|---|
| Patrol car, variant A (car body, side fan pods) | none | fail | s11 has wheels and a badge, front-on view; s12 front-on but has the two fan pods and bubble canopy (partial); re-roll s15 has wheels, garbled lettering on the side and no fan pods |
| Patrol car, variant B (teardrop, fan pods) | **`patrol-car-b-s13`** | pass | Red with a black belly and nose cone, chrome trim lines, bubble canopy, tail fin, a chrome-ringed ducted fan pod on each side, three-quarter view on white. One small wheel shows under the body (paint out). Continuity with `craft-patrol-s71`: same teardrop and chrome nose, repainted in the agency colours. s14 fails (garbled lettering on the fin, black stand block, reads as a jet) |
| Armoured van | **`transport-van-s22`** | pass | Rounded loaf body, three portholes, roof beacon, chrome strips, black bumpers, front three-quarter. Black is only on bumpers and tyres (brief asked for a black skirt). s21 is a rear view of a plain 1940s panel van (partial) |
| Alien scout | none (closest `alien-scout-s31`) | fail | All three read as built aircraft: s31 pearl-blue spindle with an amber seam, but a cockpit bubble and a fin, no chitin ribs; s32 grey, canopy, peg stand; re-roll s37 is a winged jet |
| Alien seeder | none (closest `alien-seeder-s33`) | fail | s33 has the right amber pod cluster under a bulbous hull, but the hull is weathered metal with gun barrels and no pearl panels; s34 has a teal-green glass canopy and rust (fails the no-green rule); re-roll s39 is a literal winged beetle carrying amber grapes |
| Alien carrier | none (closest `alien-carrier-s57`) | fail | s57 is a segmented dark-chitin larva of the right length, with no pearl plates and no amber light rows; s35 is a mechanical hull; **s36 reads as a submarine (undersea look, reject)** |
| Office tower | **`bldg-office-s41`** | pass | Rounded bands of ribbon windows, teal base, chrome spire; isometric on white. s42 is soft and blurry (fail as an asset) |
| Bank | **`bldg-bank-s55`** (re-roll) | pass | Six round columns on a stepped porch, cornice, clock. s43 and s44 have no columns (fail) |
| Broadcast station | **`bldg-broadcast-s45`** | partial | Good streamline building with a lattice mast and ball top, but a garbled sign over the door (paint out) and the mast is about one building-height, not three. s46 has a modern cell-tower mast with antenna panels (fail, anachronism) |
| Apartment block | **`bldg-apartments-s48`** | pass | Balcony rows, rounded corners, roof garden. s47 also passes |
| Power station | **`bldg-power-s49`** | pass | Turbine hall, two stacks with rings, pylons with lines. s50 also passes |
| Agency HQ | **`bldg-hq-s51`** | pass | Rounded floors, red roof pad with a white ring, red band at the base. s52 also passes (red pad, red doors); the red-and-black banding asked for is light on both |
| Mood: dusk | **`mood-dusk-s62`** | pass | Cream rocket-like towers, a monorail with a lit train, flying cars, orange sunset under a teal sky. s61 passes too but its glass towers look more present-day |
| Mood: the hum | none (closest `mood-hum-s67`) | fail | No image isolates one amber building: s63 and s64 are a 1930s-looking city, everything amber under a teal-green haze; re-roll s67 has the right retro-future night (capsule towers, monorail) but amber window strips on many towers. Recommend doing the hum in the engine (one building's window emissive pulsing in unison) and using s67 as the night-palette reference only |
| Mood: the lobby | **`mood-lobby-s65`** | pass | Two exact rows of identical mustard-jacketed staff with the same smile, terrazzo with a teal inlay, symmetric plants; properly uncanny. The rows face each other, not the viewer; all staff are men. s66 also passes |
| Host repaint | **`alien-host-r9-s72`** (body) | partial | The body matches the locked `alien-host-s42` (mustard jacket, grey trousers, dark gloves); the head is pale and green-free but reads as a warm cream skull, the amber ridges are only three faint lines and there is no throat glow. Re-roll s77 has a pearl head and amber glow from the mouth but no ridges; s71 has toy proportions and dotted bumps. For the GPU repaint, take the head colour from s77 and paint the three ridges per Q22 |
| Taker repaint | **`alien-taker-r9-s73`** | partial | Pearl bell on six dark chitin legs with an amber core on top, matching the locked `alien-taker-s51` shape; the core reads as a literal lamp bulb (tone it down). s74 is a flat disc on legs and reads as a saucer (fail) |
| Fighter repaint | none (colour reference `alien-fighter-r9-s79`) | fail | None is headless: s75 has a horned head and a person's stance; s76 has a crested head-like top; re-roll s79 has a pearl column and chitin stilt legs but a skull-like knob on top and two arms, not four. Keep `gemini-alien-fighter-a` as the shape and take only the pearl/chitin/amber colours from s79 |

No image in the set shows coral; the only green is the s34 canopy glass (rejected) and the teal-green sky haze of the hum images (a city colour, not on an alien). Alien figure backgrounds came out a pale blue-grey rather than pure white.

## What did not work and why
- **Alien craft.** "Alien craft" pulls Flux toward built aircraft and ships whatever the prompt says about pearl and chitin; the re-roll's "living organism, grown not built, no metal" pulled it the other way, to literal insects. The next try should give one strong single image to copy (a seed pod, a gourd, a larva) and leave the word "craft" out entirely, or be modelled by hand from simple primitives (spindle plus hoops for the scout, a lumpy ellipsoid plus a pod cluster for the seeder, a ring-segmented tube for the carrier), which the stand-ins would need anyway.
- **Headless fighter.** Flux adds a head to any tall creature with arms; the locked Gemini reference stays the shape.
- **The hum.** A single picture cannot keep one building amber and the rest white; the effect belongs in the engine.

## 3D route
Probed with `patrol-car-b-s13.jpg`, script `tools/concept/to3d.py`, body `{"image_url": "data:image/jpeg;base64,...", "input_image_url": "<same>"}`, bearer `hf_dummy`:

| Endpoint | Answer |
|---|---|
| `POST https://router.huggingface.co/fal-ai/fal-ai/trellis` | HTTP 400 `{"error":"Model not supported by provider fal-ai"}` |
| `POST https://router.huggingface.co/fal-ai/fal-ai/hunyuan3d/v2` | HTTP 400 `{"error":"Model not supported by provider fal-ai"}` |
| `POST https://router.huggingface.co/fal-ai/fal-ai/hunyuan3d-v21` | HTTP 400 `{"error":"Model not supported by provider fal-ai"}` |

The router refuses the model before reading the body; it passes through only the fal models it maps (FLUX.1-dev works). No GLB, triangle count or file size exists. Image-to-3D needs the owner's machine (the local 3D studio, one GPU job at a time) or a direct fal key; the inputs to use are `patrol-car-b-s13` and, once the alien craft are redone, a scout, a seeder and a carrier.

## Files
- Images: `docs/concept/samples/city-r9/*.jpg` (44), prompts `prompts-r9.json`.
- Sheets: `sheet-agency-vehicles.jpg`, `sheet-alien-craft.jpg`, `sheet-buildings.jpg`, `sheet-mood.jpg`, `sheet-aliens.jpg` in the same folder, each cell labelled with its file name.
- Scripts: `tools/concept/render.py` (prompts file to images), `tools/concept/sheet.py` (labelled contact sheet), `tools/concept/to3d.py` (image-to-3D probe).
