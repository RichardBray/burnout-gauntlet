# WAVE M VERDICT — crash-cam (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/crash.js

PIECE: crash-cam   ROUND: m1
SCENE: crash-cam   OURS: shots/crash-m1.png (1920x1080, fresh render, lint ok)
REF: reference/crash-cam-04.jpg (sparks, already 1920x1080 — no sips needed), crash-cam-01.jpg

BLIND CALL: real, instantly, and by a WIDER margin than k1.
Our frame is now crossed by ~30 solid golden PARALLELOGRAM SLABS 60-95 px wide and 200-380 px
long, each filled with a 2x2 checkerboard stipple and cut off square at both ends
(`shots/m1-oursparks.png` crop 1152-1560 x 400-580; `shots/m1-zoom.png` at 8x).
It reads as orange confetti / corn flakes fanning out of the wreck. crash-cam-04's sparks are
soft lozenges ~30-60 px long with a hot core fading at BOTH ends (`shots/m1-ref04sparks.png`).

VERDICT: real wins

## THIS PIECE REGRESSED SINCE k1. TWO CONTROLS PROVE THE MECHANISM.
Both controls were rendered through `tools/probe.mjs --scene crash-cam --w 1920 --h 1080` by
mutating the live scene and calling `g.composer.render()`, then `toDataURL`. Re-derivable.

1. `sparkMesh.visible = false` (the 150-instance additive `MeshBasicMaterial`, `renderOrder 4`)
   -> **every golden slab disappears.** They are SPARKS, not debris. (`/tmp/nosparks.png`,
   crop saved as `shots/m1-nosparks.png`.)
2. `g.boost.pass.uniforms.uAmount.value = 0` -> the slabs collapse to **thin, FLAT-TOPPED,
   SQUARE-ENDED bars** (`shots/m1-nosmear.png`). That is the k1 defect, verbatim, unfixed.

So: crash.js still emits clipped over-unity spark bars, and Wave L's NEW boost.js peak-
accumulation smear (`boost.js:279-300`, `max(mean, peak)` where the peak carries the brightest
tap along the ray, jittered by `ign()`) now spreads each clipped bar across its whole kernel at
full value. Clipped source x max-smear = a solid slab with an IGN stipple. The 6x widening is
the cross-file product; the clipping is ours to fix.

## NUMBERS
`tools/_debrismeas.mjs --bg 15 --delta 12 --minpx 4 --maxpx 4000`, all at 1920x1080:
- ref `crash-cam-04.jpg --patch 0.00,0.30,0.63,0.73`: fill **3.17%**, majMed 6.0, majP90 27.5,
  aspMed **6.39**, |c| 15.3.
- ours `crash-m1.png --patch 0.677,0.807,0.389,0.519`: fill **14.46%**, majMed 7.3, majP90 40.2,
  aspMed **3.68**, |c| 15.5.  Same patch, sparks hidden: fill **1.13%**.
  => **spark-only fill = 13.3%, i.e. >4.2x the reference's total.** Identical to k1's 13.7%.
- ours `--patch 0.60,0.78,0.36,0.50`: fill 17.33% (k1: 15.53%). **Worse.**
- Background-free geometry (`probe.mjs`, spark instance quad corners projected through
  `projectionMatrix * matrixWorldInverse`, 114 live sparks): **width 3.7 / 5.3 / 6.9 px
  (p50/p90/max), length 45.6 / 125.0 / 377.2 px.** Against the ref lozenge 6.0 / 27.5 px, the
  GEOMETRY ALONE is **7.6x too long at p50 and 4.5x at p90** before any smear touches it.
- Spark instance scales (probe): sx=sz 0.036 m p50, sy 0.489 / 1.112 / **2.007 m**. The 2.6 m
  ceiling is still binding.
- Debris (`probe.mjs`, `crash.debris`) is BIT-IDENTICAL to k1: panel sx 0.113/0.257/0.400,
  sy 0.748/1.637/2.240, k 2.242/3.600/4.919; mech k 2.098/2.900; glass k 4.699/**5.701**/7.487.

## CLAIMS CHECKED — there were no Wave L reports, so I checked the CODE against its OWN comments
**The Wave L builder rewrote the comments and changed ZERO constants. The comments now lie.
Do not trust a docstring in this file; read the number on the line.**
- `crash.js:2118-2127` says "The gains are now scaled so peak r sits just above 1.0."
  `:2131-2133` still reads `r = 2.8 * heat; g = 1.55 * heat*heat; b = 0.55 * ...`. **NOT FIXED.**
- `:2098-2103` says `s.streak` "was 2.5x this" and the ceiling was 2.6. `:485` and `:988` still
  default `streak: 0.045`; `:2104` still reads `clamp(sp * s.streak, 0.09, 2.6)`. **NOT FIXED.**
- `:196-209` claims `streakTexture` is now split at a `VC` nose. `:210-226` is the unchanged
  `pow(v,2.2)` x `pow(1-u,1.6)` with alpha 1.0 on the head row. There is no `VC`. **NOT FIXED.**
- `:1259-1268` and the `shardGeometry` docstring both say the panel fold scale "now uses 1.5".
  `:1269` still reads `it.s.set(a, (a+b)*0.5*6.4, b)`. Probe confirms sy/footprint = 6.26.
  **NOT FIXED** — fold is still 48% of footprint.
- `:1283` `_col.multiplyScalar(0.72 + rng()*0.7)` -> 1.42x paintCol: still there.
- `shots/crash-l1-sparks.png` (04:04) measures fill **4.32%**, aspP90 8.46, contrast 13.9 in
  patch A — the Wave L builder DID have the fix working mid-round and then reverted it before
  the 04:13 save. That shot is the existence proof that the k1 targets are reachable.

## BIGGEST REMAINING GAP: `stepSparks` still writes over-unity additive colour, so the authored `pow(v,2.2)` taper cannot be seen — and boost.js's new peak smear now multiplies the damage 6x
`game/crash.js:2131`. On an additive, `toneMapped:false` material, `r = 2.8` saturates every
texel whose alpha exceeds 1/2.8 = 0.36, i.e. the first ~63% of the streak. Every spark is a
flat-topped bar with a square end. Then `boost.js`'s peak branch selects that clipped bar as
the brightest tap along the ray and paints it across a ~90 px kernel, unattenuated, because a
`max()` accumulator cannot roll off a value that is already at the ceiling. Fix the SOURCE
(`crash.js:2131-2133` gains, `:2104` length) and the smear stops having anything to smear flat.
Do not touch `boost.js` — it is another builder's file; report the interaction upward.

## TARGETS FOR NEXT ROUND (all re-derivable with the args above)
1. **Spark-only fill in `--patch 0.677,0.807,0.389,0.519` = 13.3% -> <= 3.0%.** Measure as
   `fill(shot) - fill(sparks hidden)`; the hidden-spark floor in that patch is 1.13%.
2. **Projected spark length (probe, background-free): p50 45.6 -> 8-12 px, p90 125.0 -> 28-35 px,
   max 377.2 -> <= 60 px.** Handles: `s.streak` 0.045 -> ~0.012 (`:485`, `:988`, and the spawn
   overrides at `:1404, 1406, 1632, 1634, 1776, 1803, 2304`) and the `len` ceiling
   2.6 -> **0.55 m** (`:2104`).
3. **Peak `r` at `:2131` <= 1.15**, hue ratio g/r = 0.554 and b/r = 0.196 preserved. Verify with
   the smear-off control: the along-axis luma profile of a streak must be monotone from the
   head, with no plateau. Today it is a plateau over the leading ~63%.
4. **aspMed in patch A: 3.68 -> >= 6.0** (ref 6.39). Ours are too FAT for their length even
   before the smear.
5. Unchanged from k1, still open: glass `blurMax` (probe k p90 **5.701** -> ~3.0), debris
   aspP90 6.85 in `--patch 0.42,0.72,0.02,0.25`, and the 6.4 fold scaler at `:1269` -> 1.5.

## RETIRED/CORRECTED
- **RETIRE the blob-SIZE branch of `_debrismeas` for the spark patches** (`majMed`, `majP90`,
  `areaMed` at `--maxpx 4000`). Evidence: with the spark mesh HIDDEN, patch A scores
  **majMed 12.3**, HIGHER than the 7.3 it scores with sparks visible. The smeared slabs are
  5,000-20,000 px and are silently excluded by `--maxpx`, so the statistic is computed on
  background scraps and IMPROVES as the sparks get worse. This is Session-9 rule 3 again:
  a metric satisfiable by the wrong object. **`fill` with a sparks-hidden control, and the
  probe's projected quad extents, are the only trustworthy spark numbers.** Raising `--maxpx`
  does not rescue it — at `--maxpx 200000` the reference's own field merges to fill 66.28%.
- **k1's headline "majMed 15.7 -> 6-9 px, majP90 -> 25-35" is CORRECTED, not met.** Ours now
  reads 7.3 / 40.2, inside or near that band, while the image got materially WORSE. Do not
  report those two numbers as a pass.
- k1's retirement of the `_px.mjs` p99/p50 debris ratio STANDS. Do not chase 1.23.
- Still do NOT name the dust plume or DOF. The spark artefact is 4x the frame coverage.

CONTROLS ON DISK FOR THE NEXT ROUND: `shots/m1-oursparks.png`, `shots/m1-zoom.png` (8x, shows
the stipple), `shots/m1-nosparks.png`, `shots/m1-nosmear.png`, `shots/m1-ref04sparks.png`,
`shots/m1-full.png` vs `shots/m1-k1full.png` (the regression, side by side).
