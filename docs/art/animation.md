# Figure animation (PLAN.md D21, milestone M4c)

How the figures on the board move. Judge it by eye on `?moves` (every animated figure doing every motion on a loop)
and `?moves&row=<role>` (one figure up close: `agent-t1`, `host-revealed`, `taker`, `fighter`).

## 1. What is drawn
- The board draws each generated figure's **rigged GLB** (`public/models/figures/<role>/rigged.glb`: the 8k mesh,
  1024 px textures, skinned to a simple armature) at every distance (D21 a). The 30k full model is kept for the
  `?gallery` close-up only; the LOD file is no longer drawn or preloaded.
- Each figure is a `SkeletonUtils.clone` with its own `AnimationMixer` (`src/client/board/Rigged.tsx`).
- Citizens and hidden hosts are still stand-ins with no skeleton; they bob, lean and squash for the same motions until
  the generated citizen model lands (D21 d, step 4).

## 2. Clips and code-built motions
| Motion | Source | When (`src/client/board/anim.ts`) |
|---|---|---|
| Idle | generated clip `idle` (2.5 s) | standing still |
| Walk | generated clip `walk` (1 s), timeScale from drawn speed (stride 1.15 tiles per cycle) | moving |
| Run | the walk clip faster, with a forward lean | moving with 6 or more path tiles left (own units) or drawn faster than 2.4 tiles/s |
| Crouch | code: hips down 0.13, thighs forward, shins back, chest forward | own unit on HOLD, or own unit aiming while still (a look until the rules slice, D21 c) |
| Aim | code: both arms raised to the shoulder, figure turns to the target | own unit with a fire target, or any figure seen firing in the last 2 s |
| Fire recoil | code: arms and chest kick, 0.16 s | each visible shot (fx `muzzle`) |
| Hit flinch | code: chest stagger, 0.35 s | each visible hit (fx `hit`) |
| Throw | code: right arm winds up over the arming, overhead release, follow-through 0.55 s | own unit arming a charge; anyone's `blast` |
| Lunge | code: lean and reach forward, body slides 0.32 tiles, 0.45 s | a melee blow (fx `muzzle` with a melee weapon) or a taking (fx `taken`, the taker) |
| Reveal | code: body swells and settles, 0.7 s | a host drops its disguise (fx `revealed`) |
| Death fall | code: the body tips backwards to lying over 0.55 s, then holds still | the unit goes down |

The creatures (taker, fighter) have a root and three legs, not limbs: their crouch, aim, recoil, flinch, throw and
lunge move the root (dip, tilt, wobble); the legs play the clips.

## 3. Rules the code keeps
- **Nothing reads the true state.** Motions come from `view(state, 'agency')` and the fx queue, which already hide a
  hidden shooter (VIEW-2). Stance is redacted to `hold` for every other side, so only the agency's own units crouch.
- **Bones are restored to their rest pose every frame** before the clips play: the mixer leaves a bone alone when the
  clip holds it still, so code-built turns would otherwise pile up frame on frame (found on `?moves`, 2026-11-20).
- **Figures glide at the unit's own pace** (`1.15 * ticksPerSecond / moveTicks` tiles per second) instead of easing
  into each tile, so the walk reads; a jump of more than 3 tiles snaps.
- No raycast on any figure part (KB rule 25); a figure lying down stops its mixer.

## 4. Known limits
- The auto-rig's skin weights are coarse: big bends (crouch, throw) stretch the mesh a little at the joints.
- The creatures' legs only play the generated walk; a creature never crouches its legs.
- Generated clips for run, crouch and throw would replace the code-built ones in the GPU pass (D21 g).
