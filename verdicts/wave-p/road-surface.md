# WAVE P BUILDER REPORT — road-surface (p1) — game/road.js

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

Two changes, both range/resolvability fixes, no new content added.

**1. The headline: the micro-aggregate stack had no resolvability term.** `road.js:880` read
`float detAmt = uDetailAmt;` — verified literal in the pre-edit file (`/tmp/road-A.js:880`), so the
Wave O brief was correct on this one. `detAmt` drives albedo cavity, the roughness swing, the
mirror cavity, `microAO`, the normal-map gain and `chipAmb` — every consumer at constant amplitude
at every distance. Wave N's `barRes`/`lensRes` retire the GROOVES and the LENS; nothing retired the
CHIPS. Fix reuses Wave N's `pxAlongM` (metres of road per screen pixel, from the screen gradient of
`dUv0.y` x `DET_M`, grows as dist^2) at the chip scale (~10 mm), exactly as target 4 specified.

**2. `:1377` (now `:1415`) clamp saturation.** Gain 6.4 against a 0.86 clamp saturated at
|gBand| = 0.1344, which the Wave O critic's own alpha-channel replica puts at 66-71% of road
texels — a binary 0.525-vs-3.75 alternation, a 7:1 step with no soft shoulder, over two thirds of
the deck. It was the largest single carrier surviving `detAmt = 0`: with the chip stack forced off,
d2 residual measures **12.85** (`shots/road-p1-diag-det0.png`) and **3.00** with this term also
forced to identity (`shots/road-p1-diag-det0-bar0.png`) — re-verified this round.

## CONSTANTS — BEFORE -> AFTER, literal, post-save re-grep

- `road.js:904` NEW `float chipRes = 1.0 - smoothstep( 0.008, 0.022, pxAlongM );`
- `road.js:880 -> :905` `float detAmt = uDetailAmt;`
  -> `float detAmt = uDetailAmt * mix( 0.10, 0.78, chipRes );`
- `road.js:1377 -> :1415` `clamp( abs( gBand ) * 6.4, 0.0, 0.86 ) ) * 3.75`
  -> `clamp( abs( gBand ) * 2.2, 0.0, 0.86 ) ) * 1.91`
  (**6.4 -> 2.2** gain; **3.75 -> 1.91** renormaliser, re-solved for `E[(1-cut)*K] = 1`)

UNCHANGED and re-verified literal: `:33 DET_M = 4.0`; `:796 pxAlongM ... * 4.0`;
`:809 barRes smoothstep( 0.014, 0.048, pxAlongM )`; `:819 lensRes smoothstep( 0.020, 0.055, pxAlongM )`;
lens gains still `* 3.4 * lensRes` at `:944-946`; `:1256 disturb.y += gBand * 1.6 * barRes`;
`:1391 bandK`. `./tools/lint.sh` = `lint ok` after the final save and again as the last action.
No diagnostic residue in the shipped file. `md5 game/road.js = 4abc18e90865a687be00dd3b58390aba`.

## PAIRED ATOMIC A/B — TWO INDEPENDENT INTERLEAVED PAIRS, A,B,A,B EACH

`tools/shot.mjs --scene wet-night-asphalt --w 1920 --h 1080`. A = `/tmp/road-A.js` reconstructed
byte-exactly (`md5 ef777d98e6d32439d1dbedfe58d5e677`), B = shipped file. Metric
`tools/_bandmeas.mjs --region 0.72,1.0,<y0>,<y1>` hfRmsNorm.

- **Pair 1** `shots/road-p1-{A1,B1,A2,B2}.png`, 05:23:56–05:32:29. Peer stability proven by mtime
  bounds: NO file in `game/` other than `road.js` has an mtime inside that window (sky.js 05:07:50,
  boost.js 05:33:38, audio.js 05:33:47, all outside).
- **Pair 2** `shots/road-p1-{A3,B3,A4,B4}.png`, rendered fresh after boost/sky/audio landed.
  Peer md5 taken before and after: **13 of 14 identical; `audio.js` moved** (ee551f61 ->
  c9900bca). By the rule that pair is VOID. It is retained as corroboration only, and it
  reproduces pair 1 to within **0.11 hfRmsNorm on all five bands** — which is itself the evidence
  that audio.js is pixel-inert. **Pair 1 is the pair of record.**

| band | y | ref-01@1920 | A (before) | B (after) |
|---|---|---|---|---|
| d1 | .70-.76 | 5.63 | 10.37 / 10.49 | **5.42 / 5.48** |
| d2 | .76-.82 | 4.99 | 18.40 / 18.39 | **6.90 / 6.89** |
| d3 | .82-.88 | 4.59 | 21.58 / 21.87 | **8.52 / 8.48** |
| d4 | .88-.94 | 12.48 | 19.82 / 20.08 | **12.87 / 12.90** |
| d5 | .94-1.0 | 12.00 | 16.65 / 16.91 | **12.85 / 12.91** |

## TARGETS

**1. MONOTONICITY — HIT.** B is 12.85 / 12.87 / 8.52 / 6.90 / 5.42 reading d5->d1. Strictly
non-increasing in pxAlongM except d4/d5, which differ by **0.02** — half the ±0.04 noise floor, and
they swap sign between round 1 (d5 12.85 < d4 12.87) and round 2 (12.91 > 12.90). Call it a tie.
Note **the reference's own d4/d5 inverts by 0.48** (12.48 vs 12.00), so a tie there is the
reference's shape, not a violation. The middle-distance hump (21.81 at d3 over 16.74 near) is gone.

**2. max over d1..d5 <= 13.0 — HIT.** max = **12.91** (ref max 12.48). Was 21.87.

**3. D = d1/d5 in 0.55-0.85 — MISSED, and I did not chase it.** D = 5.42/12.85 = **0.422**. Ref
D = 0.469. We were 0.625 (0.156 ABOVE ref); we are now 0.047 BELOW ref, i.e. closer to the
reference than the target band's own floor is. Hitting 0.55 requires raising d1 to ~7.1 against a
reference d1 of **5.63**, which our 5.42 already matches to 4%. **Recommend retargeting D to
0.40-0.55 and quoting per-band values instead — D is now redundant with target 1.**

**4. Gate on `1 - smoothstep(0.008, 0.022, pxAlongM)` — HIT, exactly as specified.** pxAlongM
measured from the live camera matrix (probe: unproject each row, intersect y=0, difference the
ground distance across one pixel), not interpolated: **0.0399 / 0.0252 / 0.0174 / 0.0128 / 0.0097
m/px** for d1..d5, ground distance 11.50 m (y 0.70) to 4.69 m (y 1.00). **BRIEF CORRECTION: the
brief's estimates (0.042/0.027/0.012/0.006/0.004) are 1.4x / 2.1x / 2.4x too small at d3/d4/d5.**
The whole visible deck sits above 0.0086 m/px, so nothing in this shot is ever fully inside the
gate — hence the mix range 0.10..0.78 rather than 0..1. Resulting weights 0.10/0.10/0.30/0.60/0.75.
The 0.10 floor is deliberate: a sub-pixel chip field mip-averages to a residual, it does not vanish,
and zeroing it drove D below the reference's. The 0.78 ceiling is a range fix — near band measured
16.65 against the plate's 12.00-12.48, 39% over.

**5. `:1377` <= 25% of texels at the clamp ceiling — HIT by model, not directly imageable.** Gain
2.2 puts **22%** on the ceiling (was 66-71% at 6.4) and drops the multiplier's rms contrast
0.875 -> 0.559 while keeping the same 7:1 span. Renormaliser re-solved 3.75 -> 1.91.

## THE EYE, PAIRED WITH THE METRIC — CONFIRMS

`tools/_cropimg.mjs shots/road-p1-{A1,B1}.png 1150 1920 700 1080 1.6` vs ref
`1380 1920 800 1129 1.6`, all three looked at. **A is exactly the critic's blind call**: a uniform
isotropic salt-and-pepper crust from y 720 to y 1080, reading as a tiled noise decal. **B confines
legible grain to below y ~940 and leaves the mid-field as broad soft lateral value zones** — which
is the reference's structure (ref tarmac starts y 955, broad soft to ~1000, fine anisotropic
sparkle below). The metric and the image moved the same way.

## TOOL AUDIT (the round's one) — **TARGET 3's SCALE-PERSISTENCE CLAUSE IS A BROKEN METRIC**

`|D@1920 - D@960| / mean < 12%` cannot be satisfied by anything, including a photograph.
`_bandmeas`'s `hfRms` is a **fixed 5x5 pixel box** (`_bandmeas.mjs:80-88`) — the tool angular-corrects
the 1-D profile radius `R` (`:76`) but NOT the 2-D kernel, exactly as the standing constraint warns.
So a 2x downsample shifts which spatial band `hfRms` reads. On **the reference itself**, unchanged
pixels, `sips -Z 960`:

| band | ref@1920 | ref@960 | P_ref |
|---|---|---|---|
| d1 | 5.63 | 10.94 | 1.943 |
| d2 | 4.99 | 9.14 | 1.832 |
| d3 | 4.59 | 8.13 | 1.771 |
| d4 | 12.48 | 12.98 | 1.040 |
| d5 | 12.00 | 11.07 | 0.923 |

**D_ref@1920 = 0.469, D_ref@960 = 0.988 — the reference fails the 12% clause by 71%, 6x over.**
A real photograph cannot alias. Retire the clause.

**The valid replacement, and it makes the change look BETTER not worse: per-band
P = hf@960 / hf@1920, compared against the reference's OWN per-band P.**

| band | P_ref | P_A | P_B |
|---|---|---|---|
| d1 | 1.943 | 0.904 | **1.391** |
| d2 | 1.832 | 0.694 | **0.941** |
| d3 | 1.771 | 0.718 | **0.957** |
| d4 | 1.040 | 0.763 | **0.809** |
| d5 | 0.923 | 0.831 | **0.858** |

A's profile is flat 0.69-0.90 across every band: **all of its content half-died on a 2x box
downsample, i.e. it was at or near per-pixel scale everywhere** — the aliasing signature, on the
piece that already beat the 12.48 anchor at 13.38 by aliasing once. B moves every band toward the
reference's profile; mean |P - P_ref| improves 0.72 -> 0.51 (29%). Nothing was traded for a coherent
comb: no band gained energy at 1920, four of five lost it, and the far field moved from
sub-pixel toward the ref's multi-pixel scale.

## HONEST FLAG — NATIVE 960 RE-RENDER IS NOT THE SAME AS A DOWNSAMPLE

`shots/road-p1-{A3,B3}-960.png` are genuine 960x540 renders. There pxAlongM doubles, so `chipRes`
closes across the whole deck and B reads d1 6.57 / d5 **4.87** against A's 7.72 / 13.91. That is
physically what a mip chain should do at half resolution, and it is why the gate is correct rather
than a bug — but it means **near-field grain is materially weaker at 960 native**, and the near-band
mean also runs +8.6% there (102.6 vs 94.5) where at 1920 it is neutral (91.8 vs 92.4). If the game
must ship below 1920, `chipRes`'s knees need a viewport-relative term. Flagging, not fixing.

## WHAT I DID NOT DO / NEXT ROUND

- **Boost near-road smear.** Left alone, per the brief. Confirmed the right call: it wants
  ray-aligned elongated brightness (lane paint, wet pools), and raising isotropic aggregate to
  chase it would directly undo targets 1 and 2. Route as lane-paint/wet-pool content, separate wave.
- **P_dark/P_bright and dry patches** (Wave N targets 3-4) untouched a third time — wetness-mask
  problem, still confounded with grain if mixed in.
- **Anisotropy.** Ref grain is "anisotropic sparkle stretched down-road"; ours is still isotropic.
  Now that the amplitude ladder is right, direction is the next legible gap. `_bandmeas`'s
  `ratio` already reads it: ref d5 is 2.19:1 row:col, B d5 is 1.52:1.
- Did not re-derive the `road.js` mean-brightness numbers against sky's new `scene.environment`;
  no brightness target was in scope this round and every dusk number remains stale by the
  cross-piece note.
