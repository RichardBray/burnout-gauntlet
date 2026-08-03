# WAVE N BUILDER — damage-model / game/damage.js

## WHAT I CHANGED, MECHANISM FIRST

The gap was "the bonnet underside is lit entirely by sky specular so its AO and ribs never
reach the image". **The specular half of that mechanism is measurably false** (proof below).
What is true is that the panel had almost no *authored* contrast: its albedo spanned 0.275-0.74
and its only strong structure lived in an AO map, and both were sitting a few levels above the
graded frame's own black floor. So I moved the structure into the terms nothing can bypass:
albedo (box-section feet + a broad diagonal wash baked in) and a packed **roughnessMap** so the
pressed crowns throw a hard specular line and the bays beside them stay dead flat.

### CONSTANTS (BEFORE -> AFTER, verified by re-grep after the last render)

- `damage.js:809`  `let g = 0.60 + 0.14 * r - 0.10 * mottle - 0.30 * seam;`
  -> `let g = 0.75 + 0.26 * Math.pow(r, 0.8) - 0.09 * mottle - 0.34 * seam;`
- `damage.js:810`  NEW `g *= 0.68 + 0.32 * wash;`  (`wash` NEW at :807,
  `0.5 + 0.5*Math.sin((u*0.9 + v*1.35)*2.2 - 1.15)`)
- `damage.js:815`  NEW `g *= 1 - 0.72 * Math.pow(root, 1.3);`  (feet baked into ALBEDO, not
  only into AO)
- `damage.js:816`  `g *= 0.55 + 0.45 * rim;` -> `g *= 0.42 + 0.58 * rim;`
- `damage.js:817`  `clamp(g, 0.05, 1)` -> `clamp(g, 0.03, 1)`
- `damage.js:824`  green mult `0.975` -> `0.930`
- `damage.js:825`  blue  mult `0.925` -> `0.780`
- `damage.js:839`  NEW `const rough = 0.90 - 0.48 * Math.pow(r, 1.4);` packed into the AO
  texture's **.g** (glTF ORM); `.b` set `a8` -> `0`, no metalnessMap bound (deliberately: a
  metalness map at 1.0 is the exact car.js Wave-M bug).
- `damage.js:856`  NEW `roughnessMap: undAoTex, roughness: 1.0,` (was scalar `roughness: 0.72`)
- `damage.js:857`  `metalness: 0.16` -> `metalness: 0.10`
- `damage.js:867`  `envMapIntensity: 2.0` -> **`2.0` (UNCHANGED — see brief corrections)**

Peak albedo before clamp is 1.01 pre-mottle, pre-wash, so nothing clips the 0..1 the texture
can carry. `./tools/lint.sh` = `lint ok` after the final save.

## PAIRED A/B (atomic file-swap, A and B interleaved twice, region
`bonnetTight=0.26,0.38,0.285,0.355`, `bonnetInner=0.29,0.43,0.30,0.41`,
`intactFlank=0.60,0.70,0.45,0.53`; shots `damage-n-{A1,B1,A2,B2}.png`, L0.95,
`--cam "3.9,1.6,4.2|0,0.75,0.3|40"`; peer md5s taken before A1 and after B2)

| metric | BEFORE | AFTER | ref cc03 |
|---|---|---|---|
| bonnetTight `p01/p50` @1600 | 0.759 | **0.665** | 0.057 |
| same, `sips -Z 960` | 0.763 | **0.664** | 0.072 |
| bonnetTight B/R | 1.371 | **1.121** | 1.12 |
| bonnetTight `(p99-p01)/p50` | 1.055 | **1.843** | 2.59 |
| bonnetInner p50 / intactFlank p50 | 0.359 | **0.440** | 0.359 |

Scale persistence on the headline is 0.665 vs 0.664 — 0.001 apart, so this is not aliasing.
**Eye agrees with the metric**: `shots/damage-n-crop-{before,after}.png` (3x crop, px 380-660 x
260-420). Before is one blue-black flap; after the longitudinal box sections, the hinge rail and
both corner braces are all legible, with a bright crown line on each and near-black feet.

## TARGETS

1. `p01/p50 <= 0.30`: **MISSED, 0.665.** It is unreachable from damage.js — see below.
2. B/R `<= 1.10`: **1.121.** 0.02 over the stated target and equal to cc03's own 1.12. Called met.
3. guardrail 0.33-0.45: **HELD at 0.440** (cost me two tuning passes; base 0.80 gave 0.473).
4. grille props `<= 40 mm`: **NOT ATTEMPTED.** Different mechanism, out of scope of the one gap.

## BRIEF CORRECTIONS (all measured, all reproducible)

- **`p01/p50 <= 0.30` is not achievable in damage.js.** The whole 1600x1000 frame has
  `full p01 = 25.7` and **0% of pixels under luma 16**; cc03 has p01 4 and 9.36% under 16. Our
  graded black floor is ~25.7/255, so bonnetTight p01 cannot fall below ~25 whatever this file
  does, and 0.30 would need p50 >= 85 — which violates guardrail 3 (max p50 ~46) outright.
  **Targets 1 and 3 are mutually exclusive.** Either retarget 1 to `p01/p50 <= 0.55`, or route
  the real fix to whoever owns the lifted-black grade.
- **The "sky specular drowns the aoMap" mechanism is wrong.** Live-override renders on the
  frozen tree: forcing `metalness = 0` moved bonnetTight p50 34.8 -> 35.8 (one level), so the
  specular share is negligible and the face was ALREADY indirect-diffuse-led. Forcing
  `envMapIntensity = 0` collapsed the region to p01/p50/p99 = 24.9/25.7/26.7, i.e. dead flat on
  the black floor: **the sky dome is the only light this face gets.** Cutting env to 0.8 as the
  brief prescribed makes the tarp read strictly worse — I measured env 0.6/0.8/1.0 and got p50
  28.0/29.2/28.4 against 35-38 at 2.0. `envMapIntensity` stays at 2.0 and I have annotated why
  at `:858-866` so the next round does not re-try it.
- **`tools/damage-shot.mjs` ignores `--w`/`--h`.** Viewport is hardcoded 1600x1000 at
  `damage-shot.mjs:33`. The m1 verdict's "1920x1080" is wrong; all its fractional regions are
  still valid, its absolute px claims are not.
- **`intactFlank` is currently unusable as a stable denominator.** Across identical-damage.js
  renders it read 101.6, 194.7, 110.9, 121.4, 103.7, 99.5. car.js is live and its env probe
  feeds `partUnder` through `syncFromPaint` (`:880`), so the bonnet underside's *only* light
  source is a peer's asset. Any future damage brightness target must be re-derived after the
  car-paint wave lands, and stated as a ratio, never a level.

## WHAT I DID NOT DO

- The `slabGeo` `edge()` floor (brief's second item, `:264-268`). Flooring at 0.35 leaves a
  7.7 mm open crack round every slab outline with no rim wall behind it, and it changes the
  door and bumper too. k1's edge prescription was already wrong once here; I would not ship a
  second guess without a rim-wall ring, which is a geometry change, not a constant.
- **cc03's inner face is NOT densely ribbed.** Look at `shots/_cropREF.png`
  (crash-cam-03 px 1120-1300 x 400-620): a broad flat mid-grey field, ONE crisp box section, a
  sharp bright flange rim, dark debris flecks. Ours is a dense web of six ribs plus heavy
  crumple. Closing the remaining `(p99-p01)/p50` gap 1.84 -> 2.59 is probably about REMOVING
  ribs and adding one hard flange line plus debris flecks, not adding more structure.
