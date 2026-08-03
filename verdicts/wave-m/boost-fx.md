# WAVE M VERDICT — boost-fx (m1) => WAVE N BUILD BRIEF for game/boost.js

PIECE: boost-fx   ROUND: m1
SCENE: boost-blur   OURS: shots/boost-fx-m1.png (1920x1080, rendered by me)
REF: reference/boost-blur-02.jpg (blur), -01 (flame)

BLIND CALL: ref-02 is real, instantly, and the cue is NEW. Our whole boost field is a
diagonal 1-px STIPPLE dot screen (shots/boost-fx-m1.png x 600-900 / y 780-1040): the red
tail-light wedges and white speed bars read as 1990s stipple transparency. Ref-02's road is
torn into continuous 105 px yellow bands. Second tell, unchanged: our near road has no streak.

VERDICT: real wins

## NUMBERS (all `_smearmeas`, resolution-matched; ref-02 `sips -Z 1920` -> /tmp/_ref02-1920.jpg 1920x1200)
- HEADLINE. `--foc 0.504,0.508 --patch 0.02,0.25,0.70,0.85` on shots/boost-fx-m1.png:
  maxSmear **3.4 px / aniso 3.09 / radSmear 1.8 / hpRms 0.60**. Ref-02 `--foc 0.62,0.50`,
  same patch: **104.7 / 52.64 / 4.2 / 6.02**. Ratio **0.032x**. k1 was 3.0 / 2.63 / 1.9 /
  0.49 — **Wave L moved the near road by nothing.**
- Pass is STILL A SINK there. `_heromask --scene boost-blur` -fx vs -nofx, same patch:
  hpRms **1.96 -> 0.59**, radSmear **3.0 -> 1.8**. `_boostkernel`: lenPix **52.2**, mask
  **1.000** at tarmac-nearL — identical to k1.
- SCALE-PERSISTENCE (new metric, `sips -z 540 960`), P = hpRms(960)/hpRms(1920):
  ref-02 nearL 6.02 -> 8.25, **P=1.37**. Ours, streak field `--patch 0.28,0.40,0.72,0.92`:
  23.46 -> **13.50, P=0.58**; radSmear 2.8 px @1920 vs 16.8 px @960. **All the streak-field
  HF energy is 1-px stipple that dies on a 2x downsample.**
- Hero mask, `_px` on shots/_m1mask.png `underCar=.44,.56,.86,.94`: p50 **0**, 100% <16.
  k1 target 2 (p50>=120) **NOT MET**; the solid block is unchanged.
- Flame (`_plumemeas shots/_m1mask-fx.png shots/_m1mask-noflame.png --box 0.40,0.60,0.74,0.95
  --thr 8`): L 143x197, aspect 1.38:1. dR/dG **0.59, 0.61, 0.48, 0.20, -0.01, -0.06** —
  **non-increasing: k1's inverted ramp IS FIXED.** But `_px --region
  Lcore=.4365,.4469,.7944,.8130` p50 **93.6** vs ref-01
  `nozzle=.21875,.234375,.2361,.2685` p50 **229.5**. Target 3 half met.
## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch.

## BIGGEST REMAINING GAP: the peak branch is a PER-PIXEL-JITTERED SPARSE MAX
`game/boost.js:324-338`. Wave L added `max(mean, peak)` (PK_REACH 6.0, NP 24 over ~313 px)
but picks its tap station with `j = ign(gl_FragCoord.xy + uTime*...)` (`:280`) — the SAME
per-pixel jitter the mean uses. A mean averages jitter away; **a max AMPLIFIES it.**
Neighbouring pixels on one band latch different stations, so estimator variance lands as
uncorrelated 1-px noise and along-band correlation is destroyed (2.8 px) by the very operator
meant to create it. The `:319` comment calls this "along-band texture"; it is sampling noise.
FIX: correlate the jitter ALONG the ray — hash the perpendicular/angular coordinate only, so
every pixel on one radial band shares a station offset — and max over a 3-tap along-ray mean
instead of a single texel.

## TARGETS FOR NEXT ROUND
1. `_smearmeas --foc 0.504,0.508 --patch 0.02,0.25,0.70,0.85` at 1920: radSmear **>=15 px**,
   aniso **>=15**, hpRms **>=3.0** (ref-02 resized: 4.2 / 52.6 / 6.02).
2. ANTI-STIPPLE GATE, must pass alongside 1: `--patch 0.28,0.40,0.72,0.92`,
   P = hpRms(960)/hpRms(1920) **>= 1.0** (now 0.58; ref-02 1.37). Downsample `sips -z 540 960`.
3. Sink gate: fx/nofx radSmear ratio in patch 1 **>= 2.0** (now 0.60).
4. Flame: keep dR/dG non-increasing; Lcore p50 **93.6 -> >=180** (ref-01 229.5), aspect fixed.

## RETIRED/CORRECTED
- **RETIRE bare hpRms as a boost target.** It is satisfiable by stipple: our streak field
  scores 23.46, four times ref-02's 6.02, while reading as a dot screen. Pair every hpRms
  target with the scale-persistence gate (target 2). Fifth piece caught buying a metric
  with high-frequency garbage.
- **CORRECTED: k1's "max-of-taps" prescription was right in kind, wrong in sampling.** The
  branch exists and is bounded correctly; it fails on jitter correlation, not gain. Do not
  undo it, and do NOT lengthen the kernel (52.2 px already, still not the lever).
- Still retired: 6.5:1 plume (HUD bar), ref-04 "two 65x35 px" (livery), "added-light G/B>700"
  (dB~=0), "protected fraction %" / "mask mean".
