# WAVE M VERDICT — road-surface (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/road.js

PIECE: road-surface   ROUND: m1
SCENE: wet-night-asphalt   OURS: shots/road-surface-m1.png   REF: reference/wet-night-asphalt-01.jpg
(measured via shots/m1/ref01-1920.jpg = `sips -Z 1920`, and shots/m1/ref01-960.jpg / shots/m1/ours-960.png = `sips -Z 960`)

BLIND CALL: picked the reference in under a second.
`_cropimg.mjs shots/road-surface-m1.png ... 1382 1920 756 1080 1.4` — our road is one uniform
fish-scale crackle whose grain size DOES NOT CHANGE between 4 m and 40 m. Real tarmac
foreshortens; ours does not, so it reads as a screen-door laid over the road, not as aggregate.
Ref's wet asphalt is smooth at pixel scale near the horizon and only breaks up in the last
15% of frame.

VERDICT: real wins

## NUMBERS (ref-01 @1920 unless stated; regions are frame fractions, x 0.72-1.0 avoids the car in BOTH)

**HEADLINE — DEPTH PERSISTENCE D = hfRmsNorm(far band d1 `0.72,1.0,0.70,0.76`) / hfRmsNorm(near band d5 `0.72,1.0,0.94,1.0`), `tools/_bandmeas.mjs` (it auto-scales its hp radius by width, so 1920 and 960 are compared at matched ANGULAR scale):**
- **ref 5.63 / 12.00 = 0.469.  ours 21.16 / 16.92 = 1.251.  2.67x wrong, and on the wrong side of 1.**

Full depth ladder, hfRmsNorm @1920 (`--region 0.72,1.0,<y0>,<y1>`):

| band | y | ref | ours | ours/ref |
|---|---|---|---|---|
| d1 | .70-.76 | 5.63 | 21.16 | **3.76x** |
| d2 | .76-.82 | 4.99 | 21.46 | 4.30x |
| d3 | .82-.88 | 4.59 | 22.03 | 4.80x |
| d4 | .88-.94 | 12.48 | 20.07 | 1.61x |
| d5 | .94-1.0 | 12.00 | 16.92 | 1.41x |

The reference's grain COLLAPSES 2.6x with distance. Ours is flat and slightly INVERTED.
Wave K only ever measured d4/d5, the two bands where the reference happens to be loud, so a
3.8x whole-road excess was invisible.

SCALE-PERSISTENCE P (Wave K's metric, re-derived): ours dark 15.30/20.07 = **0.762**
(K: 0.765), bright 14.04/16.92 = **0.830** (K: 0.834). Ref 12.98/12.48 = 1.040 and
11.07/12.00 = 0.923. **P did not move at all**, while absolute grain rose 13.38 -> 20.07 (+50%).
rowBandRel d4: ref 0.0389, ours 0.0299. colBandRel d4: ref 0.0145, ours 0.0190 (now OVER).
Repeat render `shots/m1/rep2.png`: 21.13 / 16.74 — run-to-run sd 0.03-0.09, confirming +/-0.04.

## CLAIMS CHECKED
none available - Wave L reports lost, re-measured from scratch. Code inspection only:
the chip lens WAS rebuilt (`road.js:1188-1215`), gChipN is gone from REFL_FRAG, the warp is
clamped to +/-1.2 texels off a mip-difference carrier. That edit landed. It did not work.

## BIGGEST REMAINING GAP: `game/road.js:872-879` — `lensH/lensC/lensG` is a SCREEN-LOCKED carrier
`dL0 = texture2D(uDetailMap, dUv0, 1.585)`, `dL1 = ... 3.170`, difference x 3.4.
A FIXED LOD BIAS is a band-pass at 3-9 SCREEN pixels **at every distance**. The builder's own
comment argues this proves it cannot fake grain — correct about the floor, wrong about depth:
it re-injects full-amplitude 3-9 px relief onto tarmac 40 m away, where the reference has
almost none, and it is now the dominant grain source at d1-d3. It also explains why P barely
moved: a 3-9 px feature at 1920 is 1.5-4.5 px at 960, so its low half still folds.
FIX: the carrier must be WORLD-referenced, not LOD-referenced. Drive lens* from an
absolute-LOD read (`textureLod` at a level fixed by tile metres, or `dUv0` scaled so the band
sits at 3-9 px only in the near field), and multiply the whole lens/glint stack by a distance
gate that reaches ~0.25 by 25 m — the same `smoothstep(7.0,30.0,vDist)` shape `pomFade`
already uses at `road.js:788`. Consumers to gate: `lensH` at `:1214`, plus the lensC/lensG
paths feeding cavD and roughnessFactor.

## TARGETS FOR NEXT ROUND
1. **D >= 0.55 and <= 0.85** (ref 0.469). Derive: `_bandmeas.mjs --region 0.72,1.0,0.70,0.76`
   and `--region 0.72,1.0,0.94,1.0` on the 1920 shot; D = first/second. From 1.251.
2. **d1/d2/d3 hfRmsNorm <= 9.0** (ref 5.63/4.99/4.59). From 21.16/21.46/22.03. This is the
   real work; d4/d5 are already only 1.4-1.6x over.
3. THEN P_dark >= 0.95, P_bright >= 0.92 (as Wave K). Do not chase P before D — D is the
   metric aliasing cannot fake in either direction, and fixing D will move P for free.
4. Unchanged from K: dry-patch absence. `_px.mjs --region d3=0.72,1.0,0.82,0.88` p01 <= 20 and
   sub-16 >= 1.0% while d5 p01 >= 40.

## RETIRED/CORRECTED
- **RETIRED as a standalone score: scale-persistence P.** It is not wrong, but it is
  insensitive — the Wave L rebuild changed the grain mechanism completely and moved P by 0.003.
  Keep P as a secondary gate; **D (depth persistence) is the headline from now on.**
- **CORRECTED: the absolute grain anchors 12.48/12.00 are NEAR-FIELD-ONLY.** Applying them to
  the whole road licensed a 3.8x excess at d1-d3. Any future grain target must name its depth band.
- **CORRECTED: the chip lens (K's named gap) is FIXED and is no longer the aliasing source.**
  Do not re-open `road.js:1188-1215`.
- Still standing from K: dark/bright hfRmsNorm ratio 1.04 stays retired; `dusk-highway-chase`
  sets no grain target.
