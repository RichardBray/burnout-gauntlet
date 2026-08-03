PIECE: road-surface        ROUND: q1 (critic)
SCENE: wet-night-asphalt   CAMERA: default chase, eye 1.95 m, 44.36 deg vFOV, 1920x1080
OURS: `shots/q1/B1.png`, `shots/q1/B2.png` (shipped tree, md5 `4abc18e9…`)
BEFORE: `shots/q1/A1.png`, `shots/q1/A2.png` (`/tmp/road-A.js`, md5 `ef777d98…`, swapped in and back out, md5 re-verified both ways)
REF: `reference/wet-night-asphalt-01.jpg` `sips -Z 1920` -> `shots/q1/ref1920.jpg` (1920x1129); `sips -Z 960` -> `shots/q1/ref960.jpg`

# VERDICT: real wins

## THE BLIND CALL, BEFORE ANY NUMBER

Three unlabelled crops, no grid (`_cropimg … 1382 1920 <y0> <y1> 2 99999`), same road region
(x 0.72-1.0, y 0.88-1.0): `crop-X` = ref, `crop-Y` = B, `crop-Z` = A. I called X real on sight.

**What decided it: the ref's grain is SPARSE POINT SPARKLE, ours is DENSE EMBOSS.** In X the
bright texels are isolated one- and two-pixel specks sitting on a much darker ground, with an
enormous local value range, and they ride on real large-scale structure (a thin bright wake line
running across frame, broad ripple bands). In Y and Z the grain is a *repeating pebble cell* of
near-uniform size and near-uniform mid-tone contrast, with no isolated bright points anywhere —
it reads as a normal-mapped decal laid on glass, exactly the wave-O read. Y is a softer, lower
contrast version of Z; **it is the same pattern.** Wave P shrank the crust, it did not change what
the crust is made of. That is the whole verdict.

## RULE 5 — CLEAN

Every literal re-grepped in the tree, not read from a comment:

- `road.js:904` `float chipRes = 1.0 - smoothstep( 0.008, 0.022, pxAlongM );` — present, literal.
- `road.js:905` `float detAmt = uDetailAmt * mix( 0.10, 0.78, chipRes );` — present, literal.
  `/tmp/road-A.js:880` reads `float detAmt = uDetailAmt;` — the wave-O brief and the wave-P report
  were both correct: **no distance term of any kind existed.**
- `road.js:1415` `chop *= mix( 1.0, ( 1.0 - clamp( abs( gBand ) * 2.2, 0.0, 0.86 ) ) * 1.91, barK );`
  — gain 2.2 and renormaliser 1.91 as reported.
- UNCHANGED as claimed: `:33 DET_M = 4.0`; `:796 pxAlongM … * 4.0`; `:809 barRes smoothstep(0.014,
  0.048…)`; `:819 lensRes smoothstep(0.020, 0.055…)`; `:944-946 * 3.4 * lensRes`; `:1256 gBand * 1.6
  * barRes`; `:1391 bandK`.
- `md5 game/road.js = 4abc18e90865a687be00dd3b58390aba` — matches the report exactly.
- `./tools/lint.sh` = `lint ok`. No diagnostic residue.
- **No unexplained edits.** Every `game/*.js` with an mtime after road.js (boost, sky, audio, world,
  hud, car, post, damage, crash) has a `verdicts/wave-p/` file. Nothing orphaned.

Two rule-5-adjacent process faults, neither changing a conclusion:

1. **The pair-of-record's timing does not close.** `game/road.js` mtime is **05:39:33**, i.e. AFTER
   pair 1's last render at 05:32:29. The B frames in the report were therefore not produced by the
   byte-state now shipping. Mitigated, not excused: my own fresh A/B below reproduces every B band
   to within 1.0 hfRmsNorm on the shipped file. **My pair supersedes both of the builder's.**
2. **The builder invoked a "±0.04 noise floor" that Wave P itself retired.** Determinism is 0.00.
   Its d4/d5 "tie at 0.02" was therefore a real 0.02 inversion, not noise. Conclusion survives
   anyway (see target 1) but the reasoning was wrong.

## MY A/B — PAIR OF RECORD, FROZEN TREE, DETERMINISM RE-PROVEN

`tools/shot.mjs --scene wet-night-asphalt --w 1920 --h 1080`; single-file swap `road.js` <-> A,
md5 checked before and after; metric `tools/_bandmeas.mjs --region 0.72,1.0,<y0>,<y1>` hfRmsNorm.
**A1 and A2 are identical to 0.00 on every band; B1 and B2 likewise.** The 2-render A/B holds.

| band | y | pxAlongM | ref@1920 | A (before) | B (after) |
|---|---|---|---|---|---|
| d1 | .70-.76 | 0.0399 | 5.63 | 10.32 | **5.46** |
| d2 | .76-.82 | 0.0252 | 4.99 | 18.47 | **7.03** |
| d3 | .82-.88 | 0.0174 | 4.59 | 21.38 | **8.23** |
| d4 | .88-.94 | 0.0128 | 12.48 | 18.83 | **12.14** |
| d5 | .94-1.0 | 0.0097 | 12.00 | 15.56 | **11.82** |

**The mid-distance hump is REAL and it is GONE. Headline claim CONFIRMED.** (A's d4/d5 read ~1.0
lower than the builder's because seven other pieces landed after its renders; the delta is
unaffected.)

- **Target 1, monotonicity — PASS with a stated exception.** d5..d1 = 11.82 / 12.14 / 8.23 / 7.03 /
  5.46. d4 exceeds d5 by 0.32, and with determinism at 0.00 that is NOT noise. But **the reference
  inverts the same pair in the same direction by 0.48**, and wave O already proved that step is the
  plate's sparkle strip beginning at y~0.92 — a spatial feature, not depth. Ours now inverts *less*
  than the plate. Pass.
- **Target 2, max <= 13.0 — HIT.** max = 12.14 (ref max 12.48). Was 21.38.
- **Target 4, the gate — HIT, exactly as specified,** and the derived weights reproduce
  (below).
- **Target 5, clamp occupancy — accepted as modelled**, not independently imageable; the alpha
  channel is the wave-O critic's replica and I did not rebuild it. The image-side evidence (every
  band lost energy, d2/d3 by 2.6x) is consistent.

## pxAlongM — RE-DERIVED INDEPENDENTLY, CLOSED FORM, CONFIRMED

Not taken from the builder's probe. Pinhole, eye 1.95 m, half-vFOV 22.18 deg (T = tan = 0.4076),
near-level pitch: ground distance `d = e / t` with `t = (2y - 1) T`, so
`dd/dpx = (e / t^2) * 2T / 1080`. At band midpoints y = .73/.79/.85/.91/.97:

**0.0419 / 0.0263 / 0.0181 / 0.0132 / 0.0100 m/px** vs the builder's probe **0.0399 / 0.0252 /
0.0174 / 0.0128 / 0.0097.** Agreement 3-5%, all mine uniformly high, which is exactly the signature
of the small downward pitch that also explains its 4.69 m bottom-row distance against my level-camera
4.78 m. **CONFIRMED.** The wave-O brief's `0.042/0.027/0.012/0.006/0.004` is right at d1/d2 and
**1.5x / 2.1x / 2.5x too small at d3/d4/d5** — the builder's correction stands, re-derive from
geometry and never from frame fraction again.

Gate weights follow directly: `mix(0.10, 0.78, 1 - smoothstep(0.008, 0.022, px))` =
**0.10 / 0.10 / 0.27 / 0.60 / 0.75**. Matches the report. The whole deck sits above 0.0086 m/px, so
`chipRes` never reaches 1.0 in this shot — the 0.78 ceiling is doing range-fitting work, not
resolvability work. Hold that thought for the 960 finding.

## SCALE-PERSISTENCE — RETIREMENT UPHELD, REPLACEMENT REPRODUCED

`_bandmeas.mjs:79-88` computes `hfRms` over a **fixed 5x5 PIXEL box** while `:76` angular-corrects
only the 1-D profile radius `R`. Screen-locked by construction. On the reference's own untouched
pixels: **D_ref@1920 = 5.63/12.00 = 0.469, D_ref@960 = 11.02/11.25 = 0.980** — a 70.5% move against
a 12% clause. A photograph cannot alias. **The `|D@1920 - D@960| < 12%` clause is RETIRED.
Confirmed independently. Do not re-issue it, on road or anywhere else.**

The replacement reproduces. Per-band `P = hf@960(sips -Z of the same PNG) / hf@1920`:

| band | P_ref | P_A | P_B |
|---|---|---|---|
| d1 | 1.957 | 0.919 | **1.419** |
| d2 | 1.858 | 0.697 | **0.949** |
| d3 | 1.797 | 0.717 | **0.937** |
| d4 | 0.961 | 0.760 | **0.799** |
| d5 | 0.938 | 0.832 | **0.859** |

mean |P - P_ref| **0.717 -> 0.510** (builder: 0.72 -> 0.51). A's flat 0.70-0.92 profile is the
aliasing signature and it is real. **No band gained energy at 1920** — all five fell — so no
coherent comb was traded in. Both halves of the guard pass.

## TOOL AUDIT (the round's one) — `_bandmeas.ratio`'s ISOTROPIC NULL IS NOT 1.0. IT IS ~0.29.

This is the seventeenth. It is the **same defect already retired in `_stripemeas.anis`**
(`sqrt(nCols/nRows)`), sitting undetected in a second tool, and it directly voids the gap the
wave-P builder nominated for wave Q.

`rowBandRel` is the RMS of the high-passed **row means** — each averaged over `W` columns.
`colBandRel` is the RMS of the high-passed **column means** — each averaged over `H` rows. For an
isotropic field the averaging alone drives the ratio to `sqrt(H/W)`. In the d5 region
(`0.72,1.0,0.94,1.0` -> W = 538, H = 65) that predicts **0.348**.

**PAIRED CONTROL** — four synthetic 1920x1080 fields, deterministic LCG, same region args
(`/tmp/q-aniso.mjs synth`, then `_bandmeas --region 0.72,1.0,0.94,1.0`):

| field | ratio | what it is |
|---|---|---|
| `/tmp/q-iso.png` | **0.29:1** | perfectly isotropic white noise |
| `/tmp/q-isoblur.png` | **0.25:1** | isotropic, 3x3 box — multi-pixel, still isotropic |
| `/tmp/q-sparse.png` | **0.38:1** | isotropic 4% sparse impulses |
| `/tmp/q-vert.png` | 0.05:1 | coherent DOWN-ROAD (column) streaks |
| `/tmp/q-horiz.png` | 1.72:1 | coherent TRANSVERSE (row) bands |

**Three independent isotropic fields score 0.25-0.38, never 1.0.** The metric follows direction
correctly (0.05 vs 1.72) but its null is offset and **region-shape dependent**, so it is not
comparable across regions of different aspect and it cannot be read against 1.0.

Three consequences, all of which change the next round:

1. **The builder's "ref d5 2.19:1 vs ours 1.52:1, ours is isotropic" is wrong on the premise.**
   Against the measured null 0.29, ref sits at **9.8x isotropic** and ours at **5.1x** (my figures,
   same region: ref 2.83:1, B 1.49:1 — the builder's 2.19 is a different resize of the plate).
   **Ours is already strongly anisotropic.** The gap is 1.9x, not the ~infinite one implied.
2. **The axis is backwards.** `ratio > 1` means row-coherent, i.e. **TRANSVERSE cross-road banding**
   (`_bandmeas.mjs:4-5` says so). The feature the builder quoted — `INDEX` on `-02`, "anisotropic
   sheen streaked along the direction of travel" — is DOWN-ROAD, which scores **0.05:1**, and `-02`
   duly measures 0.54:1. Chasing ref-01's 2.83 adds cross-road stripes, the opposite of the
   described feature.
3. **It is probably the wrong object anyway.** Looking at `crop-X`: ref-01's row structure in d4/d5
   is water-ripple bands and the reflected headlight-pool boundary — reflected-source content, not
   aggregate. Our `GROOVE_STRETCH = 5` field (`road.js:232`) already supplies transverse grain.

**RETIRED: `_bandmeas.ratio` as a bare anisotropy target.** Restated: quote
`anisN = ratio / null(region)` where `null` is measured with `/tmp/q-iso.png` at the *identical*
region args, and always state which axis you mean. **NO ANISOTROPY TARGET IS SET THIS ROUND.**
The builder asked whether the amplitude/anisotropy trade-off is real before setting a target on it.
**The trade-off question is void because the deficit it assumed is not there.**

## BIGGEST REMAINING GAP — `game/road.js:1137`

```
roughnessFactor *= mix( 1.0, 0.58 + rghD * 0.90, detAmt );
```

**The chip roughness field is an AFFINE map of a unimodal noise channel, so our specular residual
is near-Gaussian, while the reference's is sparse and heavy-tailed.** `rghD` (`:876`) is a linear
blend of three detail-map green channels; that channel is built at `:262` as
`rgh = (0.28 + c*0.70) * (1 - sm*0.62) * (1 - max(gv,0)*0.52)` — again affine in the height field
`c`. A symmetric swing about a mean produces a symmetric relief, not glitter. Wet asphalt sparkle is
a **sparse population of near-mirror facets**: a heavy low-roughness tail, a few texels going very
glossy, not everything wobbling.

Measured, `/tmp/q-aniso.mjs skew --region 0.72,1.0,<y>` on the 5x5 high-pass residual `e`:

| field | d5 p99/p50 |e| | d5 top-5% energy share | d4 p99/p50 | d4 top-5% |
|---|---|---|---|---|
| iso white noise (control) | 2.22 | 16.4% | — | — |
| iso 3x3-blur noise (control) | 3.77 | 27.8% | — | — |
| **A (before)** | 4.77 | 34.4% | 4.40 | 32.4% |
| **B (after)** | 4.63 | **33.4%** | 4.60 | **33.0%** |
| **ref-01@1920** | **7.88** | **50.7%** | 7.52 | **46.6%** |
| 4% sparse impulses (control) | 42.50 | 93.5% | — | — |

**Half of the reference's high-frequency energy lives in 5% of its pixels. A third of ours does,
and Wave P moved that by one point (34.4 -> 33.4).** The amplitude ladder is now right and the
distribution is untouched — which is precisely what the blind crop said before I measured anything.
This is the mechanism behind "emboss, not sparkle," and it is a different lever from every target
issued so far.

Paired control confirms the metric is monotone in exactly the thing it claims (16.4 -> 27.8 -> 50.7
-> 93.5 as the field goes from dense-Gaussian to sparse-impulse), and it is a ratio of percentiles,
so **it cannot be gamed by raising amplitude** — scaling `e` scales every percentile equally.
It CAN be gamed by per-pixel salt-and-pepper, so it is issued **paired** with the P guard below.

## SECOND FINDING — `chipRes` OVER-RETIRES AT 960. THIS IS A BUG, NOT CORRECT MIP BEHAVIOUR.

The builder flagged native 960 as "physically what a mip chain should do" and declined to fix it.
**I rule against that.** The correct target for a render at resolution N is the *supersampled*
image — the box downsample of the 1920 render. Measured, genuine 960x540 renders
(`shots/q1/{A1,B1}-960native.png`) against `sips -Z 960` of the same builds:

| band | B native 960 | B supersampled (960 ds) | shortfall | A native | A supersampled | shortfall |
|---|---|---|---|---|---|---|
| d4 | 3.49 | 9.70 | **-64%** | 14.14 | 14.32 | -1% |
| d5 | 4.43 | 10.15 | **-56%** | 12.74 | 12.94 | -2% |

**A converges on its own supersampled truth to within 2% in the near field. B misses it by 2.3x.**
A mip chain converges; this does not. Mechanism, derived not guessed: at 960 `pxAlongM` doubles, so
d5 goes 0.0097 -> 0.0194, which sits just under the 0.022 knee — `chipRes` collapses 0.959 -> 0.056
and the weight goes **0.752 -> 0.138, a 5.4x cut** where honest averaging costs ~2x. Quantitatively,
mip averaging of a texel-scale field decays as `1/px`; `chipRes` decays **~2.8x faster than 1/px**
across its 2.75x knee span. That excess is the bug.

Also unreported and worse than the grain shift: **B's d5 region mean is 96.1 at 1920 and 107.0 at
960 native, +11.3%. A's moves +3.6%.** Wave P tripled the resolution-dependence of road *exposure*,
via `barRes` retiring the `:1415` renormaliser at 960. A resolution-dependent brightness is not a
detail budget, it is a grade shift.

Do not "add a viewport term" — the knees are already correctly in m/px, and a viewport term would
just re-tune 960 by hand. **The 0.10 floor and 0.78 ceiling are range-fitting the 1920 plate, and
that is why the curve is steeper than physics.** Fix the falloff law, and let the acceptance test be
native-vs-supersampled agreement.

## RULING ON D (0.55-0.85, missed at 0.422)

**The miss was CORRECT and the target was WRONG. D IS RETIRED OUTRIGHT — do not retarget it.**

My measurement: D = 5.46/11.82 = **0.462** against D_ref **0.469**. We are within **1.5%** of the
plate. Reaching the old floor of 0.55 needs d1 = 6.5 against a reference d1 of 5.63 — deliberately
over-graining the near field **15% past the photograph** to satisfy a ratio. That is textbook
optimising a number that has come loose from the thing it represents.

The builder proposed retargeting to 0.40-0.55. I go further, for three reasons: (a) `D` is a ratio
of two `hfRms` readings taken with a **fixed 5x5 pixel box at two different pxAlongM**, so it is not
a physical quantity at all — the same defect that killed the persistence clause, one level up;
(b) d1 and d5 are each now within 3% and 1.5% of their own anchors, so the ratio carries no
information the per-band values do not; (c) a band on a ratio can be satisfied by moving either term
the wrong way. **Replace with per-band absolute bands.** This matches the builder's own
recommendation and it is the right call.

## NEXT-ROUND TARGETS

All on `tools/shot.mjs --scene wet-night-asphalt --w 1920 --h 1080`, ref
`reference/wet-night-asphalt-01.jpg` `sips -Z 1920`, region `0.72,1.0,<y0>,<y1>`, damage 0,
default chase camera. Determinism is 0.00: two renders is a valid A/B.

**T1 — HEADLINE: SPARSIFY THE SPECULAR RESIDUAL.** `node /tmp/q-aniso.mjs skew --region
0.72,1.0,0.94,1.0` (and `…,0.88,0.94`). Top-5% energy share **33.4% -> band 42-52%** at d5 and
**33.0% -> 40-50%** at d4 (ref 50.7 / 46.6; stated as bands, an overshoot past ~55% is glitter-noise
and fails). `p99/p50` of |e| **4.6 -> band 6.5-8.5** (ref 7.88 / 7.52). Mechanism to attack:
`road.js:1137` and the source at `:262` — give roughness a sparse low tail (a polished-flake
subpopulation), do not widen the symmetric swing.

**T2 — GUARD ON T1, mandatory, same round.** T1 is gameable by salt-and-pepper. Re-run
`P = hf(sips -Z 960 of the render) / hf(render)`. **d4 P must stay in 0.75-1.05 and d5 P in
0.80-1.05** (ref 0.961 / 0.938; current B 0.799 / 0.859). A T1 gain that drops either P below 0.75
is aliasing and is rejected. **Pair with `_cropimg … 1382 1920 950 1080 2 99999` and look at it** —
the pass condition in the eye is isolated bright specks on a darker ground, not a finer emboss.

**T3 — HOLD THE LADDER. Per-band absolute bands, replacing D.** d1 **4.8-6.5** (ref 5.63,
now 5.46), d2 **4.2-8.0** (ref 4.99, now 7.03), d3 **4.0-8.5** (ref 4.59, now 8.23), d4 **10.5-13.5**
(ref 12.48, now 12.14), d5 **10.0-13.5** (ref 12.00, now 11.82). d2/d3 are the two still visibly
over the plate (1.4x and 1.8x) and are the only amplitude work left; d1/d4/d5 are do-not-regress.
Max over d1..d5 stays **<= 13.0**.

**T4 — RESOLUTION CONSISTENCY, new gate.** Render native 960x540 and `sips -Z 960` the 1920 render
of the same build. **Every band's native value must be within 25% of its supersampled value**
(currently d4 -64%, d5 -56%), and **the d5 region mean must agree within 4%** (currently +11.3%).
Fix by replacing the `chipRes` smoothstep with a falloff that matches mip averaging near `1/px`,
not by adding a viewport term.

**NOT TARGETED, and say why in the next report if you touch it:** anisotropy (null defect above,
axis is backwards, object is probably the reflection not the grain); `P_dark`/`P_bright` and dry
patches (wetness-mask work, still confounded with grain); boost near-road smear (lane-paint/wet-pool
content, separate wave).

## RETIREMENTS AND RESTATEMENTS FROM THIS ROUND

- **RETIRED (upheld, re-proven independently):** the `D` scale-persistence clause
  `|D@1920 - D@960| / mean < 12%`. The reference itself fails it by 70.5%. Cause:
  `_bandmeas.mjs:79-88` `hfRms` is a fixed 5x5 PIXEL box while `:76` angular-corrects only `R`.
- **RETIRED (new, seventeenth):** `_bandmeas.ratio` as a bare anisotropy target. Its isotropic null
  is `~sqrt(H/W)`, measured **0.25-0.38** for the d5 region, not 1.0, and it is region-shape
  dependent. Same defect class as the already-retired `_stripemeas.anis`. Replacement:
  `anisN = ratio / null(region)` with `null` measured by the paired control at identical args, plus
  an explicit statement of axis (row = transverse, col = down-road).
- **RETIRED (new):** target `D = d1/d5 in 0.55-0.85`, and its proposed successor band 0.40-0.55.
  Not retargeted — deleted. Replaced by the per-band bands in T3.
- **RESTATED:** the builder's "±0.04 render noise floor" is void; determinism is 0.00 and a 0.02
  band difference is real, merely small.
- **OVERRULED:** "native 960 is correct mip behaviour, flagging not fixing." It is a confirmed bug —
  native undershoots its own supersampled truth by 2.3x at d5 where the pre-change build matched to
  2% — plus an unreported +11.3% resolution-dependent brightness shift. Now T4.
- **NEW TOOL, shipped at `tools/_anisonull.mjs`** (`synth` writes the isotropy-null controls,
  `skew --region x0,x1,y0,y1 <files>` reports the sparsity metric). Use this for T1 and for every
  future `ratio` null.
