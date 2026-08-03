# WAVE K VERDICT — car-paint (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/car.js

PIECE: car-paint   ROUND: k1
SCENE: car-paint-closeup   OURS: shots/car-k1.png   REF: reference/car-paint-closeup-04.jpg (+ -03)
ALSO: shots/car-k1-dusk.png (dusk-highway-chase), shots/car-k1-wet.png (wet-night-asphalt)

BLIND CALL: ours, instantly. The side glass is a stack of near-clipping white vertical/
horizontal smears — brushed-metal or venetian blinds, not glazing. No Burnout still has
anything like it. Second tell: the red panels carry a fine *dark* pepper speckle at 1:1 where
ref-04's red is smooth.

VERDICT: real wins

## NUMBERS (all resolution-matched, refs `sips -Z 1920` first)
- Glass tail, `_paintmeas.mjs`. Ours closeup rear side pane `0.5156 0.625 0.350 0.412`:
  p50 40.2 / **p90 119 / p99 208.5**, specDiff 5.19, grainRMS 6.01.
  Ref-03 side pane `_ref03-1920.jpg 0.3333 0.4271 0.6083 0.6625`: p50 40.6 /
  **p90 72.3 / p99 100.5**, specDiff 2.48, grainRMS 2.94.
  **Mean level matches; the TAIL is 1.65-2.1x hot.**
- Flank horizon split, `_px.mjs`. Ours fender up `0.0833,0.1563,0.5139,0.5509` p50 81.7 /
  lo `0.0833,0.1563,0.6481,0.6852` p50 72.7 = **1.12x**.
  Ref-04 `wingTop=0.4375,0.488,0.5625,0.600` p50 152.8 / `wingSide=0.449,0.488,0.606,0.644`
  p50 95.0 = **1.61x**; ref-03 `0.1979,0.2396,0.6458,0.6625` 75.3 / `...,0.7125,0.7292` 54.6 =
  **1.38x**.
- Flake grain: ours `0.0911 0.1458 0.5556 0.6296` grainRMSpct **6.77**, period 18.7 px,
  hlFWHM 7 px. Ref-04 `0.4401 0.4661 0.575 0.6208` grainRMSpct **4.94**, period 8.4 px,
  hlFWHM 34 px.

## CLAIMS CHECKED
- Saturation claim **reproduced exactly**: fender 0.527, door 0.518 on r11's own regions vs
  ref-04 0.524/0.580. ccGain 1.6 is good; **keep it.**
- Glass "pane p90 82.5 vs ref 84.4" **NOT reproducible.** On a glass-only rect: 119 vs 72.3.
  The autocorr win (lag2 0.012) is real but it is a *frequency* metric — **it went loose from
  amplitude. Another metric/eye divorce, same pattern as the p99-vs-corduroy case.**
- Band split "2.77x vs ref-03 1.63x" **not reproducible and points the WRONG WAY**; their
  method (`_crop.mjs` column max/min) never named a ref region. On matched up/lo band means
  ours is 1.12x against 1.38-1.61x — **the flank is too FLAT, not too split.**
- **Wet-night regression REPRODUCED, and it is NOT ACCEPTABLE.** Rect
  `0.422 0.568 0.581 0.632`: p90 188.1, p99 233.9, vertical profile
  109.9/108.9/93.4/**168.4**/59.9/57.3/56.8/**141.6**/66 — 3x peak-to-floor in 4 px. It is the
  brightest object on the car in a night frame. **And it is not scene-local:** dusk rear screen
  `0.445 0.633 0.5926 0.6185` is p99 **242.6**, grainRMSpct 38.2. All three scenes have it.
  A view-angle taper on `normalScale` would hide it on ONE camera only — do not do that.
- **Damage crush-colour: mechanism location confirmed, defect CLOSED.** `damage.js:731/1098`
  only mirrors `car.paintMat.color`, so it IS car.js — but it no longer reproduces.
  `damage-shot.mjs` level 0 vs 0.75, same regions: fender sat 0.548 -> **0.584**, door
  0.524 -> **0.660**. Crush zone is now *more* saturated than at rest (ref crash-cam-04 keeps
  94.5%).

## BIGGEST REMAINING GAP: glass normal AMPLITUDE, not frequency
`makeGlassWave` (`game/car.js:922-950`) writes slope large enough that `normalFromFn` produces
near-mirror facets tilted into the bright half of the probe, so every pane resolves as
specular lamellae. Cut the height amplitude globally (roughly halve it) and add
roughness-coupled slope clamping so max |dN| stays inside the pane's blur kernel.
**Do not tune per-camera.**

## TARGETS FOR NEXT ROUND
1. Closeup rear side pane `_paintmeas.mjs shots/x.png 0.5156 0.625 0.350 0.412`: p90 <= 80,
   p99 <= 110, specDiff <= 2.8, grainRMS <= 3.5 (ref-03 `_ref03-1920.jpg 0.3333 0.4271 0.6083
   0.6625` = 72.3 / 100.5 / 2.48 / 2.94). **Hold p50 near 40.**
2. Wet-night `0.422 0.568 0.581 0.632`: p99 <= 150 and **no profile step >1.6x between
   adjacent 4-px rows.**
3. Flank split `_px.mjs` up `0.0833,0.1563,0.5139,0.5509` / lo `0.0833,0.1563,0.6481,0.6852`
   p50 ratio **1.35-1.60** (currently 1.12). This is the env-reflection half of the piece and
   is now the real paint gap.
4. Flake: grainRMSpct <= 5.0 with period <= 10 px on `0.0911 0.1458 0.5556 0.6296`, and the
   residual must skew **BRIGHT** — flake sparkles, it does not pepper.

## RETIRED/CORRECTED
- **RETIRED the crush-desaturation target.** Ours is at 107% of at-rest chroma. Do not spend a
  round on it.
- **CORRECTED the band-split DIRECTION**: previous rounds were told ours was over-split. It is
  UNDER-split. Any future split number must cite ref-04 `wingTop`/`wingSide` or ref-03
  `0.1979,0.2396,{0.6458,0.6625}/{0.7125,0.7292}` on the 1920-scaled copy.
- No reference in the set shows a near-grazing rear screen at night un-blurred (`-02` is
  motion-blurred, sets no target), so wet-night glass is judged by eye and by **cross-scene
  consistency**, not by a ref ratio.
