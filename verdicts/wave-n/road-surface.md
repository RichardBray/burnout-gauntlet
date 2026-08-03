# WAVE N BUILDER REPORT — road-surface (n1) — game/road.js

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

The wave-M brief named `lensH/lensC/lensG` as the dominant far-field grain source. **It is not.**
Measured by forcing all three lens gains to 0.0 (`shots/road-n1-diag-lens0.png`): far band d1
21.04 -> 19.47 hfRmsNorm, near band d5 16.89 -> 11.29. The lens is already NEAR-weighted by its
consumers' own `nearK` gates; it carries ~1.5 of d1's 21 and ~5.6 of d5's 17.

The real screen-locked carrier is **`gBand`**, the cross-road groove slope read out of the normal
map alpha. It drives (a) a +/-1.6 probe-texel per-pixel warp of the mirror UV at `:1228`, and
(b) a 0.525x..3.75x contrast multiplier on the mirror at `:1374`. Both were retired only by
`bandK = 1 - smoothstep(30,120,vDist)` — and **the entire visible road in this shot is 5.6 m to
13.2 m**, so that retire is exactly 1.0 everywhere and there was no distance term at all.
Forcing `gBand` to 0: d1 21.04 -> 9.24, d3 21.96 -> 16.30, d5 16.89 -> 11.09.

Fix: a world-referenced resolvability variable, `pxAlongM` = metres of road covered by one screen
pixel along the road axis, from the screen gradient of `dUv0.y` x `DET_M`. On a grazing deck this
grows like distance squared, which `vDist` does not. Two retires ride it: `barRes` (groove octave
0.073 m crossing 5 px -> 2 px) and `lensRes` (40 mm chip crossing 2 px -> 0.7 px).

## CONSTANTS — BEFORE -> AFTER, literal, with file:line (post-save re-grep)

- `road.js:796`  NEW  `float pxAlongM = length( vec2( dFdx( dUv0.y ), dFdy( dUv0.y ) ) ) * ${DET_M.toFixed(1)};`
- `road.js:809`  NEW  `float barRes  = 1.0 - smoothstep( 0.014, 0.048, pxAlongM );`
- `road.js:819`  NEW  `float lensRes = 1.0 - smoothstep( 0.020, 0.055, pxAlongM );`
- `road.js:919`  `float lensH = ( dL0.r - dL1.r ) * 3.4;` -> `... * 3.4 * lensRes;`
- `road.js:920`  `float lensC = ( dL0.b - dL1.b ) * 3.4;` -> `... * 3.4 * lensRes;`
- `road.js:921`  `float lensG = ( dL0.g - dL1.g ) * 3.4;` -> `... * 3.4 * lensRes;`
- `road.js:1231` `disturb.y += gBand * 1.6;` -> `disturb.y += gBand * 1.6 * barRes;`
- `road.js:1366` `float bandK = 1.0 - smoothstep( 30.0, 120.0, vDist );`
              -> `float bandK = ( 1.0 - smoothstep( 30.0, 120.0, vDist ) ) * barRes;`

UNCHANGED and verified still literal: `:1377` `clamp( abs( gBand ) * 6.4, 0.0, 0.86 ) ) * 3.75`;
lens gains still `3.4`; LOD biases still `1.585` / `3.170`; `DET_M = 4.0` at `:33`.
`./tools/lint.sh` = `lint ok` after the final save; `node --check` clean; no diagnostic residue.

## PAIRED ATOMIC A/B — peers md5-identical across both renders (`PEERS STABLE`)

`shots/road-n1-pairA.png` (road.js reverted) / `shots/road-n1-pairB.png`, rendered back to back,
`tools/shot.mjs --scene wet-night-asphalt --w 1920 --h 1080`.
Metric: `tools/_bandmeas.mjs --region 0.72,1.0,<y0>,<y1>` hfRmsNorm.

| band | y | ref-01 | BEFORE | AFTER |
|---|---|---|---|---|
| d1 | .70-.76 | 5.63 | 21.23 | **10.55** |
| d2 | .76-.82 | 4.99 | 21.34 | 18.74 |
| d3 | .82-.88 | 4.59 | 21.96 | 21.99 |
| d4 | .88-.94 | 12.48 | 20.00 | 20.09 |
| d5 | .94-1.0 | 12.00 | 16.85 | 16.91 |

**HEADLINE D = d1/d5: 1.260 -> 0.625** (target 0.55-0.85, ref 0.469). **HIT.**

Anti-aliasing check, the one the standing warning demands. Same two shots at `sips -Z 960`:
d1 14.44 -> 9.58, d5 13.99 -> 14.03. **D@960 1.032 -> 0.683.** D@1920 and D@960 now agree to 9%
(before: 22% apart), so the drop is real texture removal, not a downsample artefact. Scale
persistence at d1 itself went 14.44/21.23 = **0.680 -> 9.58/10.57 = 0.906** — the content deleted
was precisely the part that died on a 2x box downsample. P_dark (d4) 0.763 -> 0.763 and P_bright
(d5) 0.830 -> 0.830, unchanged as intended (those bands are untouched).

Bars preserved where the reference wants them: rowBandRel d4 0.0299 -> 0.0300 (ref 0.0389),
colBandRel d4 0.0189 -> 0.0190. d1 rowBandRel 0.0436 -> 0.0221.

EYE, paired: `shots/n1-before-crop.png` vs `shots/n1-final-crop.png` (`_cropimg.mjs 1150 1920
700 1080 1.6`). Before, a comb of hard horizontal dashes runs at constant size from 6 m to 13 m
and chops the reflected streaks into dotted lines. After, the strip above y~830 reads as smooth
foreshortened wet tarmac, the reflected street-name text is legible instead of serrated, and the
near field keeps its aggregate. Metric and eye agree.

## TARGETS

1. D in 0.55-0.85 — **HIT, 0.625.**
2. d1/d2/d3 <= 9.0 — **MISSED. 10.55 / 18.74 / 21.99.** d1 is close; d2/d3 are not.
3. P_dark >= 0.95, P_bright >= 0.92 — **MISSED, unmoved at 0.763 / 0.830** (d4/d5 untouched).
4. Dry patches: `_px.mjs --region d3=0.72,1.0,0.82,0.88` p01 45.9, sub-16 0.0% (targets <=20 and
   >=1.0%); d5 p01 45.7. **Untouched, still missed.** Not attempted this round.

A tighter knee (`barRes` upper 0.038 instead of 0.048) hits target 2 at d1 = 9.04 but drops D to
0.532, just under the band. D is the stated headline, so I shipped 0.048. That pair is the whole
trade available from this term; the numbers are in `shots/road-n1-B.png`.

## BRIEF CORRECTIONS (evidence attached)

1. **"onto tarmac 40 m away" is wrong by ~3x.** Raycast of the ground plane through the shipping
   camera (`probe.mjs`, eye 1.95 m, 44.36 deg vFOV): y 0.70 -> 13.2 m, 0.82 -> 8.5 m, 0.94 -> 6.3 m,
   1.0 -> 5.6 m. The whole d1..d5 ladder spans 5.6-13.2 m. A gate "reaching ~0.25 by 25 m" as the
   brief prescribes would have changed **nothing** in the measured region.
2. **The lens is not the dominant far-field source.** Numbers above. Gating it was still correct
   and I did it, but it is worth ~1.5 of d1's 21, not ~12.
3. **d1/d2/d3 <= 9.0 is not physically reachable on this camera.** d3 (8.5 m) and d4 (7.2 m) are a
   1.2x distance apart, and `pxAlongM` only changes 1.4x between them, yet the targets ask for
   4.59 vs 12.48 — a 2.7x grain collapse. The reference plate is a static forecourt shot whose
   frame fractions map to completely different world distances than ours. **Frame-fraction depth
   bands are not comparable across cameras; D (a within-image ratio) partly survives that, the
   absolute per-band anchors do not.** Any future band target should be quoted against `pxAlongM`
   or metres, not y.
4. `bandK`'s docstring at the old `:1317` claimed the bars "retire on distance"; measured, its
   value is exactly 1.0 over 100% of the visible road. Rule-5 case, now fixed in code and comment.

## WHAT I DID NOT DO / NEXT ROUND

- **`road.js:1377` is an unfixed instance of the wave-M bug class and is the next thing to take.**
  `clamp( abs( gBand ) * 6.4, 0.0, 0.86 )` saturates for every texel with |gBand| > 0.134, and
  gBand reaches 1.17, so the cut is a **binary** 0.86 for the large majority of pixels and the
  bars render as hard-edged dashes rather than a modulation. The `* 3.75` renormaliser is also not
  energy-neutral against a saturated cut (zeroing gBand raised the d1 region mean 87.6 -> 109.7,
  i.e. the term is darkening the road ~25% on average while handing a 3.75x spike to the
  unsaturated minority). Fixing the gain/renormaliser pair is what should bring d2/d3 down without
  deleting the bars.
- d3/d4 grain is dominated by the `detAmt` micro stack, not by gBand or the lens: with
  `detAmt = 0.0`, d1 17.42 / d3 9.35 / d5 4.88 (`shots/road-n1-diag-det0.png`). Whoever chases
  d2/d3 next should start from `rghD`/`microAO`, not from the mirror path.
- Dry-patch absence (target 4) untouched.
