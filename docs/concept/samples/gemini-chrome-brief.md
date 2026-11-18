# Brief: Gemini samples through Claude in Chrome (2026-11-18)

For a session on the owner's machine, where Claude in Chrome is connected. The cloud session could not reach Chrome, and the owner stopped Gemini API use on 2026-11-18 because of the spend, so **do not call the Gemini API**; use the Gemini web app in Chrome only.

## What the owner has said so far
- Round 4 (`sheet-6-gemini.jpg`) is the first set with the right proportions. Round 1's `suit-t3-flight-s32.jpg` has the sleekness the owner liked; colours are bright red and black (`PLAN.md` D7).
- Open: a tier 2 suit that keeps round 4's proportions but is slimmer, like `s32`; an alien host that passes for an ordinary clerk (round 4's hosts grew armoured shoulders).

## Do
1. Open gemini.google.com in a new tab. Attach `gemini-suit-t2-c.jpg` and `suit-t3-flight-s32.jpg` from this folder and ask for the first figure's proportions and paint with the second figure's slim, smooth plates. Make 3 variants.
2. Run the host prompt below as written, adding "no armour, no shoulder plates, no hood, soft cloth suit only". Make 2 variants.
3. Save results here as `chrome-suit-t2-<n>.jpg` and `chrome-host-<n>.jpg`, build a labelled contact sheet, and show the owner.
4. Gate each image (KB rule 13): about 2.8 head-heights, helmet about 35% of the height, red and black only, no chest light, crest or antenna.

## Prompts (from `prompts-r4-gemini.json`)
### Tier 2 suit
Photograph of one premium hand-painted collectible miniature figure with heroic compact proportions, serious and highly detailed. The figure is short and very wide: it is only two and a half heads tall. The helmet is oversized, as large as the whole torso, and takes up more than one third of the figure's height. Massive round shoulder shells make the shoulders nearly twice as wide as the helmet. Thick short arms with large gloved fists. Very short thick legs, no longer than the helmet is tall, ending in big heavy boots. Matte realistic paint with crisp edge highlights and fine panel-line shading. Stern, serious mood. Full figure standing directly on the ground with no base, front three-quarter view, centred, plain pure white background, soft even studio light. Subject: an agent in a sleek moulded protection suit from a 1950s vision of the future. Thin smooth segmented plates that hug the body closely like a second skin, with a sculpted chest plate, fine ribbed flexible joints at the waist, elbows and knees, and a raised collar ring. The suit is slim and streamlined, not bulky. Colours: bright signal red plates on the helmet, chest, shoulder shells, forearms, thighs and boots; matte black on the joints, sides, upper arms, gloves and undersuit; no white, no silver. Smooth domed helmet in bright red that fully covers the head, with one large glossy black visor and small round ear housings. No chest light, no crest, no antenna. Holds a short rounded carbine in one hand, pointed at the ground.

### Host
Photograph of one premium hand-painted collectible miniature figure with heroic compact proportions, serious and highly detailed. The figure is short and very wide: it is only two and a half heads tall. The helmet is oversized, as large as the whole torso, and takes up more than one third of the figure's height. Massive round shoulder shells make the shoulders nearly twice as wide as the helmet. Thick short arms with large gloved fists. Very short thick legs, no longer than the helmet is tall, ending in big heavy boots. Matte realistic paint with crisp edge highlights and fine panel-line shading. Stern, serious mood. Full figure standing directly on the ground with no base, front three-quarter view, centred, plain pure white background, soft even studio light. Subject: an ordinary office clerk of a 1950s vision of the future who has been taken over by an alien organism. Mustard suit jacket, narrow tie, grey trousers, polished shoes, short neat hair, blank calm face with pale glassy eyes. A translucent pale sea-green growth like branching sea-glass coral spreads up the back of the neck, along the jaw and over one hand, with a faint amber glow inside it. Arms hanging at the sides, head tilted slightly. The face is a normal human face; only the growth is alien.

## Result (2026-11-17, run on the owner's machine through Claude in Chrome)
- Made: `chrome-suit-t2-1..3.jpg`, `chrome-host-1..2.jpg`, prompts as sent in `prompts-r5-chrome.json`, labelled sheet `sheet-7-chrome.jpg` (references A and B included for comparison). Gemini Pro web app, "Download full size image"; no API calls.
- Gate (KB rule 13), read off pixel rows by eye, about +/-10%:
  - Suits: all three are about 3.4-3.7 head-heights with the helmet about 27-30% of the height, the same as reference A (about 3.4 heads, 29%), not the 2.8 / 35% target. Red and black only, no chest light, crest or antenna, on all three. Variant 2 has the smallest shoulder plates (about 1.85x helmet width) and is the only one that reads as slim like reference B; variants 1 and 3 kept reference A's large shoulder shells. The red is a brick red rather than bright signal red.
  - Hosts: both about 4 head-heights, head about 25%. Soft cloth suit only, no armour, shoulder plates or hood; growth on jaw, neck and one hand with the amber glow; face normal. Host 1 came out landscape (2752x1536) with the figure small in frame; host 2 is portrait.
- Open for the owner: pick a suit (2 is closest to the brief) or ask for a round with reference B's shoulder size written into the prompt as a measurement; the proportions target may need the prompt to say "three and a half heads" if reference A's look is the one wanted.

## Round 6 (2026-11-17): helmet redesign on suit 2

Owner's call after round 5: suit 2 is right, but the domed glass-visor helmet reads as a spaceman. Wanted: a sculpted face-mask helmet with large upward-slanting eye lenses and a crown fin, described in measurements and materials only.

- Made: `chrome-suit-t2-h1..h3.jpg` from `chrome-suit-t2-2.jpg` as the attached base, prompts in `prompts-r6-chrome.json`, sheet `sheet-8-helmet.jpg`. Same Gemini web app through Claude in Chrome, no API calls. A third prompt came back as a near-duplicate of h2 and was dropped.
- RULING: r6-crest | the round 5 gate said "no crest"; the requested face-mask carries a thin central fin from between the eyes over the crown, so the fin is allowed and the gate for this suit now reads "no antenna, no chest light" | the owner asked for this helmet shape on 2026-11-17.
- Gate (KB rule 13), by eye, about +/-10%:
  - h1: about 3.5 heads, helmet 28%, shoulders 2.2x. Red and black only. FAIL on the helmet: it reads as a living alien face with a nose, lips and skin texture, not a rigid helmet. Body bulked up versus the base.
  - h2: about 3.2 heads, helmet 31%, shoulders 2.1x. Red and black only, no light, no antenna. Rigid metal mask with sharp-rimmed almond lenses, engraved mouth line, thin crown fin. Closest to the ask. Body is bulkier than suit 2 (shoulder shells came back).
  - h3: about 3.2 heads, helmet 31%, shoulders 2.1x. Same mask with softer edges and a pointed chin; shoulders a little smaller than h2 but still not as slim as suit 2.
- Open for the owner: h2 or h3 as the helmet; whichever is picked, the next round should lock the body to suit 2 (Gemini kept drifting bulkier when editing in-chat, even with the photo re-attached), probably by starting a fresh chat with suit 2 attached and the chosen helmet image attached as a second reference.

## Round 7 (2026-11-17): smooth-shell helmet, body locked to suit 2

Owner's call after round 6: h2 is good but reads too much like a well-known armoured-suit film hero. The culprits were the faceplate seams, jaw plates, brow ridges and the rectangular mouth slot. Wanted: the same lenses and fin on one smooth seamless shell.

- Made: `chrome-suit-t2-s1..s3.jpg`, prompts in `prompts-r7-chrome.json`, sheet `sheet-9-smooth-helmet.jpg`. Fresh Gemini chat with two references attached (suit 2 for the body, h2 for the helmet), then two follow-up turns for proportions only. No API calls.
- What worked: the two-reference fresh chat held the helmet exactly across all three turns and kept suit 2's slim plates and small shoulder plates. The helmet is now one smooth shell with two almond lenses, a short engraved mouth line and a thin crown fin, nothing else. What drifted: proportions. The first result went tall and slender; the follow-ups brought it back.
- Gate (KB rule 13), by eye, about +/-10%:
  - s1: about 3.6 heads, helmet 28%, shoulders 1.8x. Red and black only, no light, no antenna. Helmet passes. Body too tall and slender with a long neck and legs about 1.5 heads.
  - s2: about 3.6 heads, helmet 28%, shoulders 2.0x. Helmet passes. Short neck ring, slim plates, legs about 1.2 heads.
  - s3: about 3.2 heads, helmet 31%, shoulders 1.9x. Helmet passes. Stoutest of the three, legs about one head, closest to the 2.8 / 35% target. Shoulder plates a little larger than suit 2's but in proportion to the bigger head.
- The drafter recommended s3; the owner chose otherwise (next section).

## Locked (2026-11-17): tier 2 suit reference

The owner picked `chrome-suit-t2-h2.jpg` (sheet 9, REF 2) over the round 7 smooth-shell variants. It is now the tier 2 suit reference, recorded in `PLAN.md` D7: suit 2 body, rigid face-mask helmet with two upward-slanting almond lenses with sharp rims, a straight engraved mouth line and a thin crown fin, bright red and black, no chest light, no antenna. Its measured proportions are about 3.2 head-heights with the helmet about 31% of the height, which supersedes the 2.8 / 35% target for this suit. Later art prompts for tier 2 attach this image as the reference.

