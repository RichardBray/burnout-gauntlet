# WAVE Q CRITIC — hud / `game/hud.js`

SCENE: hud-overlay. OURS: `shots/_q-hud-A1.png` (`node tools/shot.mjs --scene hud-overlay --w 1920 --h 1080`),
`md5 game/hud.js = f0fd0f533c0a8988f001b2994d75c58b` (= the wave-P builder's B, byte-identical).
REF: `reference/hud-overlay-03.jpg` (1280x800), `-01.jpg` (1600x900). Both measured at NATIVE
resolution, never upscaled. Camera situation matched per `reference/INDEX.md`: chase cam, full
HUD present, minimap card bottom-right.

## VERDICT: real wins

### What in the crop decided it, before any number

`tools/_cropimg.mjs shots/_q-hud-A1.png /tmp/q-ours-card.png 1560 1900 810 1040 3` against
`tools/_cropimg.mjs reference/hud-overlay-03.jpg /tmp/q-ref03-card.png 954 1254 548 740 3`
(PIXELS, not fractions).

Two things, in this order, and neither is a value:

1. **Ours is a lattice; ref03 is a plan that was never drawn on a grid.** Ref03's card carries a
   five-way star junction with a roundabout at its centre, an arterial that follows the coastline
   in a continuous curve, and **triangular and wedge-shaped parcels at every diagonal**. Ours is a
   Manhattan module of rectangles. The wave-P bow is visible — the roads do bend — but they bend
   **across** blocks that stayed rectangular, so the bend reads as a wobble laid over a grid rather
   than as a plan.
2. **Ours has a bold, regular, white dashed centre line on nearly every road. Ref03 has none at
   all.** At 0.17 screen px per metre no aerial plate resolves lane marking, and the reference
   doesn't. Ours does, because `hud.js:1772` draws the dash in TILE space (0.522 px/m) where it is
   legible, and the tile is then blitted down. It is the single loudest "this is a UI map" cue left.

At 8x on one block (`_cropimg ... 1767 1830 820 860 8` vs `... 987 1047 598 641 8`) the road
treatment itself now genuinely matches — mid-grey body, pale broken kerb, both. The builder's
polarity finding is correct and the fix landed. What is left is the geometry under it.

## RULE 5: CLEAN

Every literal in `verdicts/wave-p/hud.md` greped to its claimed post-edit value:
`:1229` `{freeway:9.5,arterial:6.8,street:4.6,lane:2.8,loop:3.2}`; `:1258-1259`
`#9c8442/#5f6966/#59635f/#454e4a/#4d5754`; `:1263` `#050805`; `:1265` `#091405`; `:1429` `> 0.55`;
`:1552-1555` `24/0.30/0.30/0.17`; `:1558/:1593/:1602/:1617/:1618/:1626` all present as described
(`KERB_RGB = [200, 228, 212]`); `:1661` `1 + Math.round(t.tone * 34)`; `:1663` both variants;
`:1728` `b.big ? 196 + ... : 14 + Math.round(b.tone * 175)`; `:1733/:1735/:1736`; `:1756-1759`
`kerbAt` + `ROAD_FILL` through `strokeRoad` with index `i`; `:1765` `rgba(12,15,14,0.10+|jit|*0.20)`;
`:1772` `rgba(226,206,150,0.55)/rgba(222,230,214,0.42)`; `:582` `LICK_BN = 0.34` with
`LICK_TA 1.15 / LICK_BW 2.60` unchanged; `:724-730` `FOOT_A 0.40, FOOT_H 0.30` + the gradient;
`:794/:795` `0.402/0.490`; `:664` `FRAY_TOP_A 0.85, FRAY_BOT_A 0.45` correctly UNCHANGED, matching
the declared null result. No edit in `game/hud.js` is unexplained by the wave-P report.

### The A leg — SPOT-CHECKED AND SOUND, by two independent routes

The brief said the whole A leg rests on the pre-edit reproduction. It does, and it holds:

- `shots/hud-p-before.png` (the A1 render of record) re-measured by me today with
  `_px --region minimap=0.8125,0.9896,0.750,0.963 --region road=0.9315,0.9345,0.795,0.870
  --region inner=0.840,0.975,0.775,0.945`: road p50 **195.5**, minimap p01 **4.9**, <16 **15.37%**,
  meanCast **0.060**, p50 **44.4**, p99 **235.8**, inner p99 **237.9**. Every figure in the
  builder's A column, to the decimal.
- Those same figures are independently on record in `verdicts/wave-o/hud.md:15-16,69` written by a
  different agent in a previous wave (p01 4.9, <16 15.4%, sat 0.061, road p50 195.5, ratio 0.72,
  bottomRail 12 px = 15.8% barH). Two independent sources agree, so the A state is not self-reported.
- I did NOT byte-reconstruct A. I did not need to: the B leg reproduces on my machine from a fresh
  render to the decimal on all nine `_px` fields, all six `_hudedge` fields and all five `_hudlick`
  fields, so the determinism claim underpinning the A/B is verified directly.

Peer-snapshot caveat: I could not compare the builder's `dc33863d...` peer digest (different
digest pipeline). It is moot — my fresh render, taken hours later against whatever the peers are
now, is bit-equivalent in every measured statistic to `shots/hud-p-after.png`. **Scale persistence:**
native 960x540 re-render, road p50 **88.8** (87.9 at 1920), minimap meanCast 0.094, p50 54.7,
satPx 0.179 (0.188). Stable. `./tools/lint.sh` -> `lint ok` after my tool edits.

## TOOL AUDIT (the one budgeted) — `_px` `sat` CONFIRMED BROKEN, WITH A PAIRED CONTROL, AND REPLACED

The builder's audit is **correct on the mechanism** and I am upgrading their ruling. `_px.mjs:56-68`
averages R, G and B over the whole region and only then takes `(max-min)/max`. Paired control, run
today on three synthetic 64x64 images:

| image | what it is | `sat` (meanCast) | `satPx` (new) |
|---|---|---|---|
| `/tmp/chroma_max.png` | red/cyan 1 px checker — **the most chromatic image possible** | **0.000** | **1.000** |
| `/tmp/chroma_zero.png` | flat grey 128 — zero chroma | 0.000 | 0.000 |
| `/tmp/cast_only.png` | flat `(110,128,120)` — a pure cast, **zero spatial chroma** | **0.141** | 0.141 |

`sat` scores the maximally chromatic image identically to flat grey, and scores a flat tint **higher
than either reference card**. It is a mean-CAST number. Corroborated on real images, `--region
full=0,1,0,1`: `hud-overlay-01.jpg` scores **0.025**, one quarter of our minimap card.

**RULING — I do not accept "keep it and rename it".** Renaming a metric does not stop the next
builder satisfying it by tinting, and this project has been caught by that exact class sixteen times.
`_px.mjs` now computes and prints **`satPx`**, the mean per-PIXEL `(max-min)/max`, alongside a
relabelled `meanCast`. Both are printed; the paired control above is the acceptance proof for the
replacement.

**And the good news, which the builder could not have known:** on this particular target the two
agree. Minimap `satPx` **0.188** against ref03 card **0.206** and ref01 card **0.171** — dead in
range, and it moved 0.131 -> 0.173 (inner) with the polarity fix. So target 2 was **not** a false
pass; the builder's decision to pair it with a crop is what saved it. From here, **quote `satPx` as
the primary and `meanCast` only as a secondary.**

### `_hudlick.mjs:85` — CONFIRMED UNFIXED, NOW FIXED, AND THE RE-DERIVATION CHANGES A TARGET

Confirmed: `:85` read `bandMed(cy1 + barH*1.5, cy1 + barH*1.75)` = y1144-1163 in a 1080 frame.
`bandMed` returns 0 on an empty band, so `thrBot` was **exactly** `plateau/2` on every image ever
measured, silently. I fixed it rather than forbidding the measurement, because forbidding it would
have retired the one metric that gates the bottom rail.

`_hudlick.mjs` now takes an optional `[botLo,botHi]` in barH, **defaults to `0.35,0.60`**, and
**prints the band with an explicit IN FRAME flag** so the 0 can never be silent again. The
builder's arithmetic that 1.0-1.25 barH does not fit is right in substance (though their per-image
attribution was garbled): the binding constraint is OURS, with 50 px = 0.65 barH of headroom below
the core. 0.35-0.60 is in frame on all three.

Decisive experiment, both bands, all three images (`ours 0.057,0.224,0.883,0.954`;
`ref03 0.094,0.336,0.8595,0.9265`; `ref01 0.0875,0.231,0.8603,0.9258`):

| | thrTop/thrBot @1.5-1.75 | ratio | thrTop/thrBot @0.35-0.60 | bot rmsHF | **ratio** |
|---|---|---|---|---|---|
| ours (B) | 135.1/**122.8** (forced) | 0.71 | 135.1/**141.2** (real, base 36.8) | 2.66 | **0.65** |
| ref03 | 140.8/**120.8** (forced) | 0.63 | 140.8/**129.9** (real, base 18.2) | 2.58 | **0.63** |
| ref01 | 158.1/**122.2** (forced) | 0.75 | 158.1/**158.1** (real, base 71.9) | 2.71 | **0.69** |

**The conclusion survives the fix — the ordering is preserved and ours stays between the two
references — but the target does not.** The old band `0.60-0.80` was set on the broken metric and
is **2.9x wider than the reference spread**. Re-derived from the corrected tool the references are
0.63 and 0.69. Retire `0.60-0.80`; the band is now **0.63-0.70**, and ours at 0.65 is a real pass.

## THE WAVE-N FALSIFICATION — VERIFIED, AND IT SURVIVES THE TOOL FIX

Wave N concluded bottomRail and the tear ratio "cannot both be hit". **Falsified, and I am recording
it.** `_hudedge.mjs 0.057,0.224,0.884,0.944` on my fresh render: bottomRail **21.1 px**, topRail
23.4 px, rimTop/rimBot sat 0.516/0.529 (split 0.013), blown>=250 **21.72%**. Normalised to
`barH = 76` (from the `_hudlick` core box `0.883,0.954` — the two tools use different boxes and the
barH source must always be stated), bottomRail = **27.8% barH** against ref01 26.8% / ref03 24.5%,
simultaneously with `_hudlick` ratio **0.65** on the CORRECTED band and rim split 0.013.

The mechanism the builder gives is right and is the transferable part: `FRAY_BOT_A` and `LICK_LB`
both widen the 10-90 span **by adding contour excursion**, which is the same quantity `_hudlick`
rmsHF caps — so driving both through that one variable makes them antagonistic by construction. The
soft foot at `hud.js:724-730` is a sub-50%-alpha band laid **after** the fray, so it widens the
10-90 span without moving the 50%-of-plateau crossing the contour tracer follows. Their declared
null (`FRAY_BOT_A` 0.45 -> 0.26 moves bot rmsHF by 0.01) is consistent with this and with their
restoring the constant rather than leaving a tuned-looking no-op. **A false "impossible" cost this
project a wave. Recorded as retired.**

## THE p99 REGRESSION — MY RULING: NOT ACCEPTABLE, BUT p99 IS THE WRONG INSTRUMENT

The builder self-reported card-interior p99 237.9 -> **187.2** against ref03 inner 215.4, and noted
that the outer-region p99 sat at 177.7 across three bakes because a fixed HUD graphic pins it.
That last observation is the important one: **a p99 over a 77k-pixel region is the top 770 pixels,
and one graphic sets it. p99 on this card is retired.** I replaced it with an AREA statistic that
cannot be pinned by a single element — `_px` now prints **`sup200`**, the % of region pixels at
luma >= 200:

| region | A (before) | B (after) | ref03 card | ref01 card |
|---|---|---|---|---|
| minimap `>=200` | **6.37%** | **0.51%** | 3.26% | 3.72% |
| inner `>=200` | 9.69% | 0.70% | — | — |
| minimap `<40` | 45.67% | 38.15% | 33.0% | 34.51% |
| minimap `<16` | 15.37% | 13.22% | 4.35% | 10.6% |
| minimap `satPx` | 0.150 | 0.188 | 0.206 | 0.171 |

**The regression is real and larger than p99 made it look.** B threw away **92% of the card's
bright area** and now sits **6.4x below both references**, where A sat 1.7-2.0x above. A overshot;
B undershot by more. It must be priced, but the fix must not reinstate the ink plan: A's 6.37% was
the near-white road fill, i.e. the polarity error itself. The recovery has to come from
**sunlit roof faces and pale plaza/parking surfaces**, both of which the references show and neither
of which is a road. Stated as a **band** so it cannot overshoot back to A.

**Also caught, and it is the guard the brief warned about:** wave-O's hold `<16 >= 7%` is
one-sided and was a rubber stamp — A already scored **15.37%**, more than double the floor, so the
"hold" was never at risk in either direction. Both references are 4.35% and 10.6%; ours at 13.22%
is **outside the reference range on the high side** and always was. Restated as a band below.

## BIGGEST REMAINING GAP

**`hud.js:1403-1404` derives the building-parcel setback from `layout.roadW` (`world.js:18`, = 20 m),
a constant that has no relationship to any of the four constants that actually draw the road.** The
block model and the road presentation are two unrelated geometries, so the road corridor is not
reserved in the city model at all.

Arithmetic, all from the tree:
- setback from the grid line = `layout.roadW * 0.5 + 5` = **15 m**.
- an arterial's drawn kerb half-width = `(ROAD_W 30 + ROAD_CASE 6.8) / 2` = 18.4 m, times
  `roadWidthAt` max `(1 + ROAD_WR 0.17)(1 + ROAD_WJ 0.30)` = 1.521 -> **28.0 m**, plus `roadSpine`'s
  bow `ROAD_BOW 0.30 * 30` = **9.0 m**. Reach = **37.0 m into a 15 m corridor**.
- a freeway: `(46 + 9.5)/2 * 1.521` = 42.2 + `0.30*46` = 13.8 -> **56.0 m into the same 15 m**.

So roads occupy 2.5-3.7x their allotted corridor and eat their neighbours' parcels. This existed
before wave P (18.4 m and 27.75 m against 15 m) but was uniform and axis-parallel, so it read as
"the roads are a bit wide"; **wave P doubled the overrun and randomised it**, which is exactly what
makes the crop read as a wobble laid over a grid. This subsumes and sharpens the builder's own
nominated gap: **displacing `GXX`/`GXZ` alone would NOT fix it**, because the setback constant would
still be the wrong one. The corridor must be derived from `ROAD_W[cls] + ROAD_CASE[cls]`, scaled by
the same `roadWidthAt` maximum and offset by the same `roadSpine` displacement that draws it — one
shared function, consumed by both `strokeRoad` and the parcel/patchwork/building placement.

## NULL RESULT — DO NOT RE-RUN THIS. Card high-frequency texture is NOT the gap.

I hypothesised from the 8x crops that our card is flat-shaded vector while ref03 is a photographic
plate, and measured it with a new 3x3 high-pass (`tools/_hfpatch.mjs`, written this wave):
ref03 card hfRms **23.73**, ours **10.69** — a 2.22x deficit that looks damning.
**It is entirely a JPEG/scene noise-floor artifact.** Paired control on a flat non-HUD patch of each
image (`sky=0.30,0.45,0.05,0.15`): ref03 **12.56**, ours **5.88** — a **2.14x** baseline offset that
accounts for essentially all of it. Self-normalised, card/flat = ref03 **1.89** vs ours **1.82**.
**Do not issue a card hfRms target against a JPEG reference.** `_hfpatch.mjs` is kept only for
paired within-image ratios.

## TARGETS FOR THE NEXT ROUND

Render: `node tools/shot.mjs --scene hud-overlay --w 1920 --h 1080`, plus a native 960x540 for
scale persistence. Scene hud-overlay, chase cam, full HUD, no damage state involved.

1. **Road/parcel corridor coherence — the headline.** `hud.js:1403-1404`: replace `layout.roadW`
   with the class-correct corridor `(ROAD_W[cls] + ROAD_CASE[cls]) * 0.5 * 1.521 + ROAD_BOW *
   ROAD_W[cls] + 5`, and apply the SAME `roadSpine` displacement to `GXX`/`GXZ` (and therefore to
   `cellsTone`, `subdivide` and the building rects) so parcels bend with their road and wedge at
   diagonals. Method: `_cropimg shots/<new>.png out.png 1560 1900 810 1040 3` against
   `_cropimg reference/hud-overlay-03.jpg out.png 954 1254 548 740 3`. **Acceptance is the crop:
   no road may cross a building rectangle, and blocks adjacent to a bowed road must bow with it.**
   Numeric hold so the fix is not bought by shrinking the network: minimap `p50` stays **50-60**.
2. **Recover the bright tail without the ink plan.** `_px --region minimap=0.8125,0.9896,0.750,0.963`
   **`sup200` 2.5-4.0%** (BAND; refs 3.26 / 3.72; now 0.51%; A's failed value was 6.37%). Drive it
   from `hud.js:1728` roof tone and from pale plaza/parking fills — **not** from `ROAD_FILL`, which
   must hold. Hold: `--region road=0.9315,0.9345,0.795,0.870` p50 stays **85-110** (now 87.9).
   **`p99` on this card is RETIRED** — the outer region's is pinned by a fixed HUD graphic
   (177.7 to the decimal across three bakes).
3. **Ground level, restated as a BAND.** Same region **`<16` in 4.0-11.0%** (refs 4.35 / 10.6; now
   **13.22% = a MISS**) and **`<40` in 31-36%** (refs 33.0 / 34.51; now 38.15%). The old `>= 7%`
   floor is RETIRED as a one-sided rubber stamp. Lift `C_LAND` (`hud.js:1263`, now `#050805`) and
   the `hud.js:1661` patchwork floor, which wave P dropped 5 -> 1.
4. **Chroma, on the corrected metric.** Same region **`satPx` 0.170-0.210** (refs 0.171 / 0.206;
   now 0.188 — HOLD). Quote `meanCast` only as a secondary; **never call it saturation.**
5. **`_hudlick.mjs 0.057,0.224,0.883,0.954`** (default band is now the fixed `0.35,0.60`):
   **ratio bot/top 0.63-0.70** (refs 0.63 / 0.69; now 0.65 — HOLD). **Always print `thr` and the
   `botBand ... IN FRAME` line beside the ratio.** The old `0.60-0.80` is RETIRED.
6. **`_hudedge.mjs 0.057,0.224,0.884,0.944`**, all widths normalised to `barH = 76` from the
   `_hudlick` box and the barH source stated: bottomRail **24-28% barH** (refs 24.5 / 26.8; now
   27.8 — HOLD, and note it is now near the TOP of the reference band, so `>=22%` is retired as
   one-sided). Hold rim sat split **<= 0.02** (now 0.013) and blown>=250 **17-27%** (now 21.72%).
7. **Cheap, and it is the second thing the eye catches:** delete or subdue the minimap centre-line
   dash (`hud.js:1772`). It is drawn in tile space at 0.522 px/m where it is legible, then blitted
   to 0.17 px/m; ref03 shows **no lane marking whatsoever** on its card. Classic rule 4 — detail
   above the resolution the consumer represents. Acceptance: the crop.
8. Left cap still a pale plate with three ribs (wave-M item 4). Fourth round untouched. Cosmetic.

## RETIRED / CORRECTED THIS WAVE

- **`_px`'s `sat` is `meanCast`, not saturation** — paired control: a red/cyan checker scores
  **0.000**, a flat tint scores 0.141. `_px.mjs` now prints **`satPx`** (true per-pixel chroma) and
  relabels the old field. Quote `satPx` as primary. Target 2 was NOT a false pass (satPx 0.188 vs
  refs 0.171/0.206) — the crop pairing is what saved it.
- **`_hudlick.mjs:85` FIXED**, not merely documented. Default bottom base band is now
  **0.35-0.60 barH**, in frame on all three images, and the tool prints an explicit
  `IN FRAME: true/false` line. `_hudlick` itself is KEPT (wave N's threshold disproof stays failed).
- **`_hudlick` ratio target `0.60-0.80` RETIRED**, re-derived from the fixed tool as **0.63-0.70**.
- **Minimap `p99` RETIRED** as a card metric — pinned by a fixed HUD graphic. Replaced by
  `sup200` (bright AREA), which no single element can pin.
- **`<16 >= 7%` RETIRED** as a one-sided rubber stamp (the before-state already scored 15.37%);
  restated as the band 4.0-11.0%. **`bottomRail >= 22% barH` RETIRED** likewise; restated 24-28%.
- **Wave N's "bottomRail and the tear ratio cannot both be hit" is FALSIFIED and retired.** 27.8%
  barH at ratio 0.65 on the corrected metric. They were antagonistic only because both were driven
  through contour excursion.
- **Card hfRms against a JPEG reference is forbidden** — the noise floor is 2.14x and accounts for
  the entire apparent 2.22x deficit. Paired control recorded above.
- **New on disk:** `tools/_hfpatch.mjs` (3x3 high-pass RMS per region; **paired within-image ratios
  only**). `tools/_px.mjs` gains `satPx`, `sub40`, `sup200`. `tools/_hudlick.mjs` gains the
  configurable, in-frame-checked bottom base band.
