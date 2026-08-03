PIECE: road-surface        ROUND: o1
SCENE: wet-night-asphalt   OURS: shots/road-o1.png, shots/road-o1b.png   REF: reference/wet-night-asphalt-01.jpg (`sips -Z 1920`)

BLIND CALL: Real wins, instantly. Ref tarmac is broad soft lateral value zones with grain
appearing ONLY in the bottom ~8% of frame, and that grain is anisotropic sparkle stretched
down-road. Ours is a uniform isotropic salt-and-pepper crust over the whole deck that reads as a
tiled noise decal. Crops: `_cropimg shots/road-o1.png 1150 1920 700 1080 1.6` vs
`_cropimg <ref@1920> 1380 1920 800 1129 1.6`.

VERDICT: real wins

## CLAIMS CHECKED (Rule 5)

ALL EIGHT constants re-grepped and literal as reported: `road.js:796 pxAlongM`, `:809 barRes
smoothstep(0.014,0.048)`, `:819 lensRes smoothstep(0.020,0.055)`, `:919-921 *3.4*lensRes`,
`:1231 *barRes`, `:1366 *barRes`. `:1377` and `DET_M 4.0` unchanged as stated. `lint ok`.

HEADLINE REPRODUCED, both resolutions, two renders each. `_bandmeas --region 0.72,1.0,<y0>,<y1>`:
d1 10.59/10.41, d2 18.53/18.63, d3 21.81/22.00, d4 19.89/20.08, d5 16.74/16.91.
**D@1920 = 0.625.** Same PNGs at `sips -Z 960`: d1 9.60/9.41, d5 13.89/14.03, **D@960 = 0.681**,
agreeing to 8.6%. Ref anchors re-derived: d1 5.63, d5 12.00, **D_ref 0.469**. Claim stands; not
aliasing. Run-to-run spread <0.2 hfRmsNorm.

CORRECTION 1 (40 m) CONFIRMED: even a level camera at eye 1.95 m / 44.36 deg vFOV puts frame
y 0.70 under 20 m. A 25 m gate is a no-op on the measured region.

CORRECTION 3 CONFIRMED AND STRENGTHENED: ref's own ladder is 5.63/4.99/4.59/**12.48**/12.00 —
non-monotonic, with a 2.7x step between d3 and d4. That step is the plate's sparkle strip
beginning at y~0.92, a SPATIAL feature, not depth. Frame-fraction depth anchors off that plate
are void. **All future band targets are hereby quoted in pxAlongM.**

## THE HANDED-DOWN `:1377` TARGET — HALF RIGHT, HALF A DIAGNOSTIC ARTEFACT

Modelled the real alpha channel (`grooveField` replicated at DET=1024, GROOVE_N 11, GROOVE_A 1.5,
8-bit quantised, three decorrelated octave draws at weights 1.05/0.26/0.44 over 1.5):
- max|gBand| = **1.167** — confirms 1.17. Saturation threshold 0.86/6.4 = 0.1344.
- **70.7% of texels exceed it** (mip1 70.3, mip2 69.7). The cut IS binary over ~70% of the road.
  CONFIRMED. It is a 0.525-vs-up-to-3.75 alternation, a 7.1x step, with no soft edge.
- **BUT `E[(1-cut)*3.75] = 1.007`.** The renormaliser is mean-neutral by construction. The
  "darkens the road ~25%" claim is FALSE: forcing `gBand = 0` sets the multiplier to its CEILING
  3.75, so `shots/road-n1-diag-gband0.png` (mean 109.7 vs live 84.5) measures 3.75x-vs-live, not
  1.0x-vs-live. **Sixth measurement finding: a null test that replaces a term with its ceiling
  instead of with identity.** The correct null is to force the whole `mix(...)` factor to 1.0.

## BIGGEST REMAINING GAP — `game/road.js:880`, `float detAmt = uDetailAmt;`

The entire micro-aggregate stack has **no resolvability term whatsoever** — no `pxAlongM`, no
`vDist`. It drives albedo cavity `:1022`, roughness `:1112`, mirror cavity `:1191` at constant
amplitude at every distance. Chips are ~10 mm; pxAlongM crosses 0.010 m/px at about d3 (y 0.85),
which is exactly where our ladder PEAKS (21.81) above the near field (16.74). Real surfaces
cannot peak in the middle distance — that hump is the signature. It survives `barRes` because
`barRes` gates the grooves, not the chips. The builder's own `detAmt = 0` diagnostic already
proves the size: d3 21.96 -> 9.35, d5 16.89 -> 4.88.

## TARGETS FOR NEXT ROUND (re-derive with `_bandmeas --region 0.72,1.0,<y>` on wet-night-asphalt @1920)

1. **MONOTONICITY, the headline. hfRmsNorm must be non-increasing with pxAlongM:
   d5 >= d4 >= d3 >= d2 >= d1.** Currently 16.74/19.89/21.81/18.53/10.59. Camera-independent,
   alias-proof, and the one shape the reference cannot violate.
2. **max over d1..d5 <= 13.0** (ref max 12.48). Currently 21.81.
3. Hold D = d1/d5 in 0.55-0.85 and hold |D@1920 - D@960| / mean < 12%.
4. Gate the detAmt consumers on a chip-scale `1 - smoothstep(0.008, 0.022, pxAlongM)`, not on
   `vDist`. Re-measure pxAlongM at each band with the step-encode shot; do not trust interpolation
   (approx d1 0.042, d2 0.027, d3 0.012, d4 0.006, d5 0.004 m/px).
5. `:1377` soften: no more than **25%** of road texels may sit at the clamp ceiling. Fix by
   lowering the 6.4 gain and re-solving the renormaliser for `E[(1-cut)*k] = 1.0`. Do NOT chase
   brightness here — the term is already mean-neutral.

## BOOST-FX NEAR-ROAD SMEAR — YES, IT IS PARTLY OURS, BUT DO NOT ACCEPT THE FRAMING

Measured `_px --region p1=0.02,0.25,0.70,0.85` on `shots/road-o1-boost.png` (scene boost-blur,
1920): p01 28 / p50 34.4 / p99 52 — total spread 24 levels. Ref `boost-blur-02@1920`, same patch:
57.5 / 106.8 / 194, spread 136. Normalised (p99-p01)/p50: ours 0.70, ref 1.28. So the road there
really does carry only 55% of the ref's relative contrast and 18% of its absolute range. The
premise holds. **But it is the wrong content:** what boost's max needs is RAY-ALIGNED elongated
brightness (lane paint, light pools, wet specular streaks), and adding more of what road.js
currently has — isotropic aggregate — would make target 1 no better while making targets 1-2
above worse. Route it as lane-paint / wet-pool content, in a separate round, and keep it OUT of
the same wave as the detAmt retire. Do not let it become a licence to raise grain.

## RETIRED / CORRECTED

- **RETIRED: per-band absolute hfRmsNorm anchors taken from ref-01 frame fractions** (5.63/4.99/
  4.59/12.48/12.00 as a depth ladder). Non-monotonic; the d3->d4 jump is the plate's sparkle
  strip. Replaced by targets 1 and 2 above.
- **CORRECTED: "the `*3.75` renormaliser darkens the road ~25%".** It is mean-neutral to 0.7%.
  The evidence for it was a ceiling-substitution null test.
- Targets 3 and 4 from wave N (P_dark/P_bright, dry patches) untouched again and not re-issued
  this round — they are a wetness-mask problem, not a grain problem, and mixing them with the
  detAmt retire will confound both.
