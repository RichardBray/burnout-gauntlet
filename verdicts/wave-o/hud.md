PIECE: hud                ROUND: o1
SCENE: hud-overlay        OURS: shots/hud-o1.png (+ hud-o1b.png repeat)   REF: reference/hud-overlay-01.jpg, -03.jpg
BLIND CALL: real, instantly. Two cues: (a) our minimap road network is a constant-width
near-white orthogonal grid over hard-edged rectangular parcels; both refs are irregular
curved networks over mottled organic ground. (b) our boost bar's BOTTOM rail is a hard
cliff while ref01's rails both dissolve into feathery green tendrils.
VERDICT: real wins

## CLAIMS CHECKED — ALL EIGHT REPRODUCE. Rule 5 clean.

Every constant greps to the claimed literal: `hud.js:1638` `'overlay'`, `:1197` `#0a0c09`,
`:1180` `{freeway:15,...}`, `:1194` `#f7fbf0`, `:1565` `16 + tone*126`, `:577` `LICK_TA 1.15,
LICK_BN 0.42, LICK_BW 2.60`, `:587` `LICK_LT/LB 0.060/0.140`, `:658-659` `FRAY_R0 0.40,
FRAY_TOP_A 0.85, FRAY_BOT_A 0.45`, `:660` `ftH = ih*1.30`. Re-rendered twice, bit-stable.
`_px --region minimap=0.8125,0.9896,0.750,0.963`: p01 **4.9**, <16 **15.4%**, sat 0.061,
p99 235.8. `_hudlick 0.057,0.224,0.883,0.954`: 4.09/2.96, ratio **0.72**. All confirmed.
(One stale comment: `:750` says "pulled in to 0.370/0.470"; code reads 0.360/0.425 — the
report is right, the comment is wrong. Cosmetic, but fix it.)

## SIXTH TOOL FINDING — `_hudlick`'s `baseBot` IS ALWAYS ZERO, AND THE DISPROOF FAILS

`_hudlick.mjs:85` samples `baseBot` from `cy1 + 1.5*barH .. cy1 + 1.75*barH`. On ours that is
y 1144-1163 in a 1080-tall frame; on ref01 y 921-936 in 900; on ref03 y 820-834 in 800.
**In all three images the band is off the bottom of the frame, `v` is empty, and line 82
returns 0.** The bottom threshold is therefore never scene-derived — it is exactly
`plateau/2` on every image ever measured. The builder's stated mechanism ("the scene below
is near 0") is wrong: the tool never looked.

But the asymmetry it inferred does not survive either, and this is the headline. Printed
`base`/`thr`: ours **25.7/0 -> 135.1/122.2** (gap 13). ref01 **71.9/0 -> 158.1/122.2**
(gap **36**). ref03 **39.9/0 -> 140.8/120.8** (gap 20). Every image carries the same-signed
bias and **ours carries the smallest of the three**. If a lower threshold inflates the
bottom rail, ref01 is handicapped 2.8x harder than we are — and ref01 still measures
top 3.90 / bot 2.91. So the tool bias cannot be what made us read 1.68 inverted.

**Ruling: do NOT retire `_hudlick`, and do NOT quote it bare.** It is like-for-like on the
bottom rail (all three get plateau/2). Compensation rule, binding: quote `thrTop/thrBot`
with every ratio, and treat a top/bottom threshold gap smaller than the reference's as a
conservative reading, not a favourable one. Whoever owns tools should change `:85` to a
1.0-1.25 barH band so it stays in frame; until then `baseBot=0` is a documented constant.

The builder's control render (top's noise on both rails -> 3.32/5.22) is still real evidence
of a real asymmetry — but it is in OUR COMPOSITE (the additive halo under the bar), not in
the tool. The per-rail gain is compensating a genuine thing for the wrong stated reason.

## THE COUPLING CLAIM IS REAL — verified from tool source, not from the report

`_hudedge.mjs:122-123` derives `topRail`/`bottomRail` as the 10-90 span of `vprof`, and
`:150` samples `rimTop`/`rimBot` at the 50% crossing of that *same* `vprof`. Both ride on
one quantity, rail contour excursion, which is exactly what `_hudlick` rmsHF measures.
Targets 2, 3 and the blown-core hold are one variable. Re-check them together. Endorsed.

**But they are not antagonistic** — the refs hit both. Ref bottom rails have LOW tear and a
WIDE SOFT FOOT: a graded low-alpha falloff, not a contour excursion. `FRAY_BOT_A` is the
wrong lever (it raises erosion alpha -> contour). The right lever is the bottom copy's
band WIDTH and an alpha gradient across it — partial graded erosion, `hud.js:658-680`.

## SEVENTH FINDING — `_hudedge` widths in %H OF FRAME ARE NOT COMPARABLE

Normalise by `barH`. bottomRail: ours 12 px / 76 = **15.8% barH**; ref01 15.8/59 = 26.8%;
ref03 13/53 = 24.5%. The miss is a 40% shortfall, far worse than "1.11 vs 1.75 %H" reads.
topRail is fine: ours 30.8% barH vs 34.9 / 28.7.

## BIGGEST REMAINING GAP

**Minimap value range is FIXED; its spatial statistics are not.** `strokeRoad`
(`hud.js:1585-1586`) draws one constant width per class with no curvature and no per-segment
jitter, and `ROAD_FILL` is now authored at `#f7fbf0` (247,251,240) over `C_LAND #0a0c09`.
Measured road level `_px --region road=0.9315,0.9345,0.795,0.870` p50 **195.5**; ref03 same
kind of sample `--region road=0.8555,0.8600,0.700,0.780` p50 **89.7**. Our roads are 2.2x
too bright and form a perfect Manhattan grid, which is what still reads as cartography.
The histogram target came loose from the thing it represented. File: `game/hud.js:1180-1199,
1585-1586` and the `C.roads` generator.

## TARGETS FOR NEXT ROUND (all re-derivable)

1. `_px --region road=0.9315,0.9345,0.795,0.870` road p50 **85-110** (ref03 89.7); keep
   `--region minimap=0.8125,0.9896,0.750,0.963` p01 <=6 and <16 >=7%. Non-negotiable hold.
2. Same minimap region: **sat 0.085-0.100** (ref01 0.099, ref03 0.091 over card extents
   `0.783,0.978,0.706,0.925` and `0.745,0.98,0.685,0.925`). Ours 0.061. **The old ">=0.055"
   was set below both references — CORRECTED, it was too lax.**
3. Same region **p50 50-60** (ref 58.4 / 53.7). Ours 43.9. Lift ROOFS, not ground.
4. `_hudedge 0.057,0.224,0.884,0.944` bottomRail **>= 22% of barH** (i.e. >=17 px at
   barH 76) via a graded bottom fray band, while holding `_hudlick` ratio 0.60-0.80,
   rim sat split <=0.02 and blown>=250 in 17-27. Re-check all four in one render.
5. Per-segment road width jitter and curvature in the minimap network.

## RETIRED / CORRECTED

- **CORRECTED:** minimap sat target `>=0.055` -> **0.085-0.100**; it was below both refs.
- **CORRECTED:** `_hudlick` is NOT the cause of the tear inversion. Keep the tool; always
  print `thr`. `baseBot` is a hard 0 (out-of-frame sample), not a measurement.
- **CORRECTED:** all `_hudedge` rail widths must be quoted in % of `barH`, never % of frame.
- Left cap still a pale plate with three ribs. Cosmetic, still untouched.
