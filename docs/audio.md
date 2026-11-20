# Audio: generated sound and music (pass 2)

**Status:** generated on 2026-11-20 through ElevenLabs (sound effects model `eleven_text_to_sound_v3`, music model `music_v2_5`), wired behind the pass 1 synth names (PLAN.md Q21) and into a five-state music director. **Not verified by ear** until the owner listens on `sounds.html` (KB rule 9). Register: `docs/presentation-concept.md` section 3 (period small arms through a radio compressor, wet glassy aliens, a clacking and chiming switchboard; "period orchestral optimism that sours in combat").

## 1. What exists
| Piece | Where | Notes |
|---|---|---|
| Manifest | `tools/audio/manifest.ts` | One entry per synth name (23) with prompt, takes, seconds, prompt influence, loop flag and target peak; one per music state (5) |
| Generator | `tools/audio/generate.ts`, `npm run audio:gen` | Idempotent: skips a take whose file exists and whose prompt hash matches the index; `--only <name|state|sfx|music>`, `--force`, `--dry`. The key comes from `.env.local` through `node --env-file` (gitignored; never read or printed; the ElevenLabs CLI wrote it) |
| Measurer | `tools/audio/measure.ts`, `npm run audio:measure` | ffmpeg decodes each file; peak, RMS, crest (peak over RMS in dB), head and tail silence, normalization gain to the manifest's level (lift capped at +12 dB) into `public/audio/index.json` |
| Files | `public/audio/sfx/<name>-<take>.mp3` (36 takes, 984 KB), `public/audio/music/<state>.mp3` (5 tracks, 4.3 MB) | Committed like the GLBs in `public/models/` so the Pages build serves them (RULING AUDIO-1) |
| Bank | `src/client/audio/bank.ts` | Reads the index beside the page, decodes every take after the first gesture, plays a take trimmed to its measured head and tail and normalized; a loop (the city bed) fades in and out |
| Music | `src/client/audio/music.ts` | `musicStateFor(screen, marked, winner)`: calm on the title, battle in the raid, tense once the view carries `marks` (VIEW-5), victory or defeat stinger on the report. 1.5 s crossfades; a looping track overlaps its own end by 2 s with a fresh start; ducks to 35% while the sim is paused |
| Director | `src/client/audio/director.ts` | Every name plays its take when `source` is `auto` and the take decoded, else the synth; the city bed likewise; `window.__ekc.audio()` reports `sampled` counts, the bank and the music player |
| Settings | `src/client/audio/settings.ts`, `ekc-audio` | Pass 2 adds `music` (0 to 1, default 0.6) and `source` (`auto` or `synth`); pass 1 records still read |
| Sound desk | `sounds.html` | A SOURCE switch to A/B synth and sample per card, a MUSIC panel for the five states, a MUSIC slider, each card's measured numbers |

## 2. Measurements (2026-11-20)
Every gunshot take came back with a crest of 18.4 to 28.5 dB (crest factor 8 or more), so the KB gotcha (AI gunshots near crest factor 2) did not bite with this model; the director still layers the synth transient at 35% under any `fire-*` take below 18 dB (`CREST_FLOOR_DB`), none today. Quietest takes: `down-agent` at -11.6 dB peak (lifted +3.6 dB), `raid-over-2` at -15.0 dB (+7.0), the city bed at -25.3 dB (+11.3, the cap is +12). Trims cut 0 to 108 ms of head silence and up to 0.8 s of tail from the 1 s shots. Music peaks sit at -0.3 to -2.3 dB except `defeat` at -12.3 dB (+6.3 dB); RMS -15 to -27 dB. Full table: `npm run audio:measure`.

## 3. Rulings
| Id | What we did | Why |
|---|---|---|
| RULING AUDIO-1 | Generated audio is committed under `public/audio/` | The KB keeps generated audio out of the repo and warns in tests; this repo already commits 51 MB of GLBs under `public/models/` and serves Pages from a hand-pushed build, so 5.3 MB of audio follows the same path. `tests/audio.test.ts` still warns rather than fails where the files are missing |
| RULING AUDIO-2 | Samples sit behind the synth's 23 names; the synth stays as the fallback and the A/B reference | PLAN.md Q21 said "dropped in behind the same names"; a build with no files (the Artifact, which carries no media beside the page) keeps sounding |
| RULING AUDIO-3 | Music states: calm (title), battle, tense (the view carries `marks`), victory and defeat stingers once, then silence; the gallery and the desk choose their own | KB recipe step 8's five states; `marks` is the one engine signal that says "endgame" without reading hidden state |
| RULING AUDIO-4 | Loops are crossfaded re-triggers, not sample loops | ElevenLabs tracks are not sample-accurate loops; a 2 s overlap hides the seam and a changed trim cannot click |
| RULING AUDIO-5 | ElevenLabs for both sound and music in this pass, not the local Audio Studio | Owner's instruction, 2026-11-20 ("Use ElevenLabs for both in this first pass") |

## 4. Redo list (after the owner listens)
- Any take the owner rejects: edit its prompt in the manifest and run `npm run audio:gen` (only that take is remade: the hash changed).
- `raid-over` has two takes by meaning (cleared, lost), picked by the sign of the variant; a third would be noise.
- The music loops are 75 to 90 s prompts asked to be "steady and loopable"; if a seam is audible, lengthen `LOOP_OVERLAP` or ask for a composition plan with matching first and last chunks.
- An announcer voice (presentation concept: "a calm announcer voice") is not in this pass.
- The Artifact build cannot carry the files (same limit as the GLBs); it plays the synth.

## 5. Not verified by ear
Nothing above has been judged by ear. The desk shows what each card plays (`generated:` or `synth:`) and the last tap's source.
