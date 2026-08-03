# WAVE K VERDICT — crash-cam (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/crash.js

PIECE: crash-cam   ROUND: k1
SCENE: crash-cam   OURS: shots/crash-k1.png
REF: reference/crash-cam-04.jpg (sparks), crash-cam-01.jpg (debris fan)

BLIND CALL: real, instantly. Our frame is crossed by ~100 **straight golden bars of constant
width, hard 1-px parallel edges and square-cut ends** (`shots/k1-oursparks.png`, crop
1152-1498 x 400-580). crash-cam-04's sparks are soft-edged lozenges with a hot core fading at
both ends (`shots/k1-ref04sparks.png`). Secondary: our wreck shows no wheel, lamp or plate.

VERDICT: real wins

## NUMBERS (all `_debrismeas.mjs`, NEW TOOL, bg=15 delta=12 minpx=4 maxpx=4000, both 1920x1080)
- **SPARK STREAK LENGTH.** ref `crash-cam-04.jpg --patch 0.00,0.30,0.63,0.73`: majMed 6.0 px,
  majP90 27.5, fill 3.17%.
  ours `--patch 0.677,0.807,0.389,0.519`: majMed **15.7**, majP90 **108.1**, fill **13.7%**.
  ours `--patch 0.60,0.78,0.36,0.50`: 18.3 / 72.2 / 15.5%.
  => **2.6-3.1x too long at p50, 2.6-3.9x at p90, 4.3-4.9x the coverage.**
- DEBRIS SHAPE. ref `crash-cam-01.jpg --patch 0.86,1.00,0.33,0.55`: majMed 7.5, majP90 19.2,
  aspP90 4.69. ours `--patch 0.42,0.72,0.02,0.25`: 9.5 / 33.0 / **8.08**. Secondary gap.
- Probe (`probe.mjs --scene crash-cam --w 1920 --h 1080`, `crash.debris`): stretch k p50/p90 =
  panel 2.24/3.60, mech 2.10/2.90, glass 4.70/5.70 (max 7.49). Background-free.

## CLAIMS CHECKED
- All r8 material edits present and correct: `crash.js:437-440` color 0xb9cbd6, opacity 0.78,
  env 1.05; bimodal instance colour on one `rng()` at `:1310-1318`. Glass reads dark. VERIFIED.
- p99/p50 2.13: critic gets 2.00 in the same region (run variance). REPRODUCED.
- **"Background-limited": CONFIRMED, and WORSE than stated.** In `0.42,0.72,0.02,0.25`, **26% of
  pixels differ from their own local background and they are facade windows, roofs, gantry rail
  and sky/roof edges.** The near-all-sky sub-patch `0.500,0.600,0.000,0.120` still measures
  **30% fill from background alone** while containing 2 shards. **Metric is broken.**
- "panel p50 13.6 cm / p90 30.0": VERIFIED (sx_p50 0.113, sz_p50 0.126, sx_p90 0.257).
  NOTE for the next probe: **`sy` (p50 0.748) is the FOLD-BULGE SCALER, NOT a length.** Do not
  panic when you see it.

## BIGGEST REMAINING GAP: `stepSparks` emits OVER-UNITY additive colour, destroying its own authored streak falloff
`game/crash.js:2058-2059` sets `len = clamp(sp*0.045, 0.09, 2.6)` and caps `wid` at 0.075 m;
`:2071-2073` sets instanceColor r=**2.8**\*heat, g=1.55\*heat^2 on an **additive,
`toneMapped:false`** material. `streakTexture` (`:200-213`) tapers alpha as `pow(v,2.2)` along
the streak and `pow(1-u,1.6)` across it — **but at 2.8x gain the pixel CLIPS until alpha < 0.36,
i.e. v < 0.63, so the first ~63% of every streak renders FLAT-CLIPPED.** That is why a 1.2-1.5 m
streak reads as a hard-edged ribbon with a square end instead of a motion-blurred hot particle.
**Same class as the r8 glass albedo>1.0 bug.**

## TARGETS FOR NEXT ROUND (re-derive with the args above)
1. ours spark majMed 15.7-18.3 -> **6-9 px**; majP90 72-108 -> **25-35 px**; fill 13.7-15.5% ->
   **3-5%**. Handles: `s.streak` 0.045 -> ~0.018 and the `len` ceiling 2.6 -> ~0.8 m.
2. Peak spark `r` under **~1.3** so the pow(2.2) taper survives; check the streak no longer has
   a flat top (spark-blob |contrast| should fall from 13.1 toward the ref's 15.3 spread).
3. Debris aspP90 8.08 -> **<=5.0** in `--patch 0.42,0.72,0.02,0.25`; majP90 33 -> ~20.
   Handle: glass `blurMax` (probe k p90 5.70 -> ~3.0).

## RETIRED/CORRECTED
- **RETIRED: debris p99/p50 in `--region debris=0.42,0.72,0.02,0.25` via `_px.mjs`.** It is set
  by BACKGROUND, not debris (evidence above). **Replaced by `tools/_debrismeas.mjs`**, which
  keys only on pixels differing from their own 15-px local background, so flat sky, sunlit
  facades and the gantry sign contribute nothing. **Do NOT chase 1.23.**
- FLAGGED (not the headline): the panel fold bulge is `0.077 * 6.4 = 49%` of mean footprint
  (`crash.js:1238`), i.e. a 12 cm shard stands ~6 cm proud. The `shardGeometry` docstring claims
  9% and the spawn comment claims ~35%. **This is worse than the "14% of a half-metre plate"
  case the file itself condemns as sheet steel folded like card.**
- The `_col.multiplyScalar(0.72 + rng()*0.7)` -> 1.42x paintCol at `crash.js:1247` is still there.
- **Do NOT name the dust plume or DOF**: the plume is present and visible around the wreck, and
  the spark artefact is 4-5x the frame coverage of anything either would fix.

NEW TOOL ON DISK: `tools/_debrismeas.mjs` (local-background-keyed blob measurement). REUSE IT.
