# WAVE K VERDICT — sky-lighting (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/sky.js

PIECE: sky-lighting   ROUND: k1
SCENE: dusk-highway-chase   OURS: shots/sky-k1.png   REF: reference/dusk-highway-chase-01.jpg (+02/-04)

BLIND CALL: real, instantly. Ref-01's sky is a bold teal->sodium ramp; ours goes blue ->
**achromatic grey** -> pale salmon. The tell is a neutral grey band across the middle of our
sky at y 0.36-0.42 that no dusk sky has.

VERDICT: real wins

## NUMBERS (all `_px.mjs`, fractional regions; refs unresized — COLOUR metrics only, no spatial-frequency claim)
- Near-horizon sky, ~25-30deg off sun. ours `--region s=0.75,0.82,0.46,0.48` -> 183.2,161.5,144.1
  sat **0.213**, linear B/R **0.586**. ref-01 `--region b=0.78,0.86,0.44,0.47` ->
  248.4,226.1,126.1 sat **0.492**, B/R **0.221**. ref-04 `--region g=0.13,0.21,0.28,0.335` ->
  211.9,195.7,142.0 sat 0.330, B/R 0.375. ref-02 `0.45,0.55,0.28,0.34` -> sat 0.176, B/R 0.828
  (late blue-hour, **NOT a target**).
- **Ref-01's horizon glow is azimuthally FLAT**: x=0.62-0.70 / 0.78-0.86 / 0.90-0.98 at
  y 0.44-0.47 all read 246-248,224-226,126-130, sat 0.474-0.492. Ours falls off with azimuth
  (0.68,0.74,0.44,0.48 -> sat 0.217; column 0.55,0.65 at y 0.40-0.42 -> sat **0.067**,
  rgb 152.6,157.2,146.7 = GREY).
- Sat-vs-height column scan (ours x 0.55-0.65 vs ref-01 x 0.66-0.74, 0.04 steps): ours min sat
  0.046 at y 0.36-0.40; ref-01 min 0.163 at y 0.12-0.16 then climbs to 0.499. **Our crossover
  valley is 3.5x deeper and sits 24% of frame lower.**
- Zenith B/G: ours (0.55,0.65,0.00,0.04) 56.0,92.2,125.3 -> **1.36**. ref-01
  (0.66,0.74,0.00,0.04) -> 1.06; ref-02 -> 1.23; ref-04 -> 1.22. Ours is cobalt, not teal.
- LUT direct (`_skyprobe.mjs`, `sky.sampleLut`): dusk e=0, u=0.50 = **0.313,0.322,0.325** —
  achromatic IN LINEAR. e=0 u=0.02 = 1.166,0.425,0.325 (B/R 0.28, correct). **So the sun wedge
  is right and the rest of the horizon is grey.**

## CLAIMS CHECKED
- REPRODUCED: night bake horizon row is neutral **0.115,0.125,0.129** linear, exactly as
  claimed. Midday's is neutral AND bright: **2.834,3.219,3.221**, ~7-10x authored
  `aerialLow 0x94a9bf` (0.295,0.394,0.522).
- NOT reproduced: the 126.4->166.6 midday render A/B. There is no runtime hook for `aerialSky`
  and the critic may not edit `game/`.
- Midday/night presets do NOT regress at current clamps: midday sky 0.44,0.50,0.10,0.20 ->
  sat 0.134 pale blue; night 0.44,0.52,0.08,0.16 -> sat 0.553 blue, horizon
  0.46,0.53,0.33,0.38 sat 0.409. Both read correctly.

## BIGGEST REMAINING GAP: the dusk horizon row is fed ONLY by the spectrally-flat multiple-scatter fudge, so it bakes grey
`game/sky.js:371,386-387`: at sunElevation -0.9deg `sunTransmittance()` returns 0 for every
low-altitude sample (planet occludes the sun), killing the direct term; the surviving source is
`( sR + sM ) * msW`, and **the analytic `src/ext` at saturated optical depth cancels betaR — the
betaR in numerator and denominator are the same vector, so the result is achromatic BY
CONSTRUCTION.**
FIX: tint the ms source by a twilight transmittance (sunTransmittance evaluated up at the
ozone-tent altitude, or a per-preset vec3 from the sun-path optical depth) and drop the 0.015
`msW` floor. Then **delete BOTH `aerialSky` clamps.**

## RETIRED/CORRECTED
- Correcting r11: the midday (`aerialSky 0.15`) and night (`0.30`) clamps are **NOT two
  preset-specific bake bugs.** Dusk's own e=0 u=0.50 row is equally achromatic
  (0.313,0.322,0.325); **all three presets share ONE shader defect**, and dusk is the one
  showing it unclamped. Fix the ms tint once and all three clamps go.

## TARGETS FOR NEXT ROUND (re-derive with the args above)
1. `--region s=0.75,0.82,0.46,0.48`: sat **>= 0.33**, linear B/R **<= 0.45** (bracketed by
   ref-04 0.330/0.375 and ref-01 0.492/0.221).
2. `sky.sampleLut(0.50, 0)` for dusk: B/R **<= 0.60** (now 1.04).
3. Column scan x 0.55-0.65, 0.04 steps: **no row below sat 0.15**, and the minimum above
   y 0.24 (ref-01: 0.163 at y 0.12-0.16).
4. Zenith `--region z=0.55,0.65,0.00,0.04`: B/G into **1.05-1.25** (now 1.36).
5. Regression gates: midday `0.44,0.50,0.10,0.20` sat 0.12-0.16; night
   `0.44,0.52,0.08,0.16` sat >= 0.50.
