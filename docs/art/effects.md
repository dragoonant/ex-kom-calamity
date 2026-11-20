# Effects (PLAN.md D21 e-f, milestone M4c)

Bold stylised effects in the D11 palette: hot cores, flat toon-edged puffs, bright tracers. They are not soft
photographic smoke. Code: `src/client/board/Effects.tsx` (what each event spawns) and `src/client/board/fxkit.ts`
(the billboard batch and its shapes). Every effect comes from the store's fx queue (`src/client/fx.ts`), so a shooter
the squad cannot see makes no flash (VIEW-2). Structure events are public (VIEW-1).

## 1. What each event draws
| Event (fx kind) | Drawn |
|---|---|
| Shot (`muzzle`) | A flame-shaped flash and a white core at the muzzle, a point-light pulse (0.09 s), a tracer that streaks from muzzle to impact, a wisp of smoke. A miss flies on past the target and ends in sparks and a pale puff where it lands. Melee: a pale green slash ring |
| Hit on a unit (`hit`) | A white impact flash and sparks; amber spatter off the organism. No blood |
| Round strikes a wall (`chip`, from `tileDamaged` outside a blast tick) | Sparks (more off steel), a puff in the wall's colour, flakes of its material |
| Charge (`blast`) | A white flash, twelve fireball flames on the fire ramp (white, mustard, coral, soot), a shockwave ring, 22 sparks, a dark smoke burst, 18 chunks of casing and floor, a 40-strength orange light pulse (0.4 s), a scorch mark that stays for the battle, a fire that burns on for 3.5 to 5.5 s, a smoke column for 7 to 10 s, and a camera jolt |
| Wall, door or window breaks (`breach`) | Chunks in the tile's own material that tumble, bounce once, settle and sink away after 7 to 11 s; a dust plume tinted by the material; glass shards and a glint; steel sparks; timber and plaster catch fire on a stable 35% draw |
| Floor collapses (`collapse`) | More chunks dropping to the level below, a bigger dust plume, a smaller camera jolt |
| Unit down or falls (`down`, `fell`) | A dust puff |
| Host revealed, citizen taken (`revealed`, `taken`) | An amber bloom and ring at the throat, amber sparks |

Damaged walls and panes **crack** before they break (`pushCracks` in `tileset.ts`). Each face gets zigzag fissures,
more of them as the tile weakens, by a stable draw per tile so they never flicker. A wall chars only past half
damage.

## 2. Budget (the laptop target, D21 f)
- Six draws carry every effect: chunks, tracers, scorches, the glow batch (fire, flashes, sparks, rings; additive),
  and the smoke batch (smoke, dust; alpha). There are also four pooled point lights.
- The lights always exist and sit at zero intensity when idle, so no shader recompiles mid-battle.
- Pools are capped (520 chunks, 420 glow, 380 smoke, 48 tracers, 48 scorches, 24 emitters) and recycle the oldest.
- The e2e checks the 120-draw budget with a blast in view (`e2e/effects.spec.ts`).

## 3. Camera shake
- A blast jolts the camera by up to 0.4, scaled down with distance from the view's centre; a collapse jolts by 0.25.
- The jolt decays in about half a second. It moves the eye only, never the rig, so picking and the hook read the
  steady pose.
- The console's **SHAKE / NO SHAKE** switch turns it off. The setting is kept per browser under `ekc-view`, apart from
  the save and the sound settings.

## 4. Rules the code keeps
- Pause freezes every effect with the world. The shake still settles.
- Effects queued before the board mounted (a Continue) are history and do not replay.
- Nothing has a pointer handler or a raycast (KB rule 25).
