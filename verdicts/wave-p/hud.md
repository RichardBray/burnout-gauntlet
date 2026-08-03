# WAVE P BUILDER REPORT — hud / `game/hud.js` (r15)

## TREE CHECK FIRST (the new standing rule) — CLEAN

Diffed `game/hud.js` against every literal quoted in `verdicts/wave-n/hud.md` and
`verdicts/wave-o/hud.md` before touching anything.
All eight of the wave-O critic's spot-checks greped to the claimed value, and the
wave-N constant table reproduces line for line: `:1638` `'overlay'`, `:1197`
`#0a0c09`, `:1180` `{freeway:15,...}`, `:1194` `#f7fbf0`, `:1565` `16 + tone*126`,
`:577` `LICK_TA 1.15 / LICK_BN 0.42 / LICK_BW 2.60`, `:587` `LICK_LT/LB
0.060/0.140`, `:658-659` `FRAY_R0 0.40 / FRAY_TOP_A 0.85 / FRAY_BOT_A 0.45`,
`:660` `ftH = ih*1.30`, plus the card-presentation set (`:1967` 0.038, `:1969`
0.26, `:1975` 0.72, `:1984` 0.13, `:2003` 0.14).
The pre-edit render reproduces the wave-O critic's figures exactly — minimap p01
**4.9**, <16 **15.37%**, sat **0.060**, p99 **235.8**, road p50 **195.5**,
`_hudlick` 4.09/2.96 ratio **0.72** — so **no unmeasured edits were sitting in the
tree**. `md5 game/hud.js = 2a32f2ba5e4c4d348ed3a5855e56b222` at start.

---

## WHAT CHANGED, MECHANISM FIRST

### 1. HEADLINE — the minimap's road POLARITY was inverted, and its strokes were one width

The critic's gap was "value range fixed, spatial statistics not". Cropping our card
and `hud-overlay-03`'s card side by side at 3x says the mechanism is more specific
than jitter:

**We drew a NEAR-WHITE road body inside a NEAR-BLACK casing. Both references draw a
MID-GREY ASPHALT BODY inside a PALE KERB.** That is the difference between an ink
street plan and an aerial plate, and it is the whole of the 106-level road error:
`ROAD_FILL.arterial` was `#f7fbf0` (247,251,240) over a `rgba(1,2,2,0.98)` casing.
Reversing the polarity is one edit that fixes the tone, the polarity and the
"cartography" read at the same time — and it is a range fix, not a new term.

On top of that, `strokeRoad` was literally one `stroke()` of the plan polyline at one
`lineWidth`, so a grid line was a mathematically straight constant-width bar. It now
builds a **spine**: resampled every `ROAD_STEP` m, displaced perpendicular to its own
axis by a two-octave sine of arc length under an end-pinned envelope, then drawn
**span by span**, each span at its own width from a third sine times a per-road
scale. The kerb's own VALUE is modulated along arc length too, so the pale edge fades
in and out instead of reading as an outline.

**Bug-class rule 4, done before writing the gains.** The consumer is a 1024 px tile
over MAP_SPAN 1960 m = 0.522 px/m, blitted into a ~340 px card = **~0.17 screen px
per metre**. A lane (`ROAD_W` 8 m) is 1.4 screen px wide, so the width term had to be
a FRACTION of each road's own width — an absolute metre jitter big enough to see on a
freeway erases every lane — and the bow is scaled by width for the same reason at the
other end (a bow approaching the 160 m block module walks arterials through their own
parcels). Both terms are expressed in road widths and neither can exceed its carrier.
Same check on the kerb: at the r14 casing widths the new kerb colour put minimap p01
at **8.1 against a hold of <=6**, so `ROAD_CASE` came down 37%.

### 2. Target 4 — the bottom rail's SOFT FOOT (the coupling is broken, not traded)

r14 reported bottomRail and the tear ratio as antagonistic. They are only antagonistic
through one variable: `FRAY_BOT_A` and `LICK_LB` both widen the 10-90 span by adding
CONTOUR EXCURSION, which is exactly what `_hudlick` rmsHF caps. The references are
low-tear AND wide, i.e. a **graded low-alpha falloff**. So `hud.js:724` lays a
partial-alpha band under the rail **after** the fray, where nothing can erode it into
a contour. Range check before writing the gain: the consumers are a 50%-of-plateau
crossing and a 10-90 span, so `FOOT_A` must stay **below 0.5** or the traced contour
itself moves. At 0.40 it provably cannot, and the 10% point lands ~0.78 of `FOOT_H`
below the rail — which is the entire widening.

---

## CONSTANTS — BEFORE -> AFTER with `file:line` (post-edit lines)

Road polarity and palette:
- `:1229` `ROAD_CASE = {freeway:15, arterial:11.5, street:7.6, lane:4.4, loop:5}` ->
  `{freeway:9.5, arterial:6.8, street:4.6, lane:2.8, loop:3.2}`
- `:1258-1259` `ROAD_FILL` `#e6bd60/#f7fbf0/#e9efe2/#b6bcae/#d2d8c9` ->
  `#9c8442/#5f6966/#59635f/#454e4a/#4d5754`
- `:1617` NEW `KERB_RGB = [200, 228, 212]` (the pale kerb; replaces the
  `rgba(1,2,2,0.98)` dark casing literal that was inline at old `:1585`)
- `:1756-1759` road draw: dark casing + white fill -> `kerbAt` + `ROAD_FILL`, both via
  the new span-by-span `strokeRoad`, both passed the road index `i`
- `:1765` wear wash `rgba(30,36,34, 0.06+|jit|*0.12)` -> `rgba(12,15,14, 0.10+|jit|*0.20)`
  and moved from `strokeRoad` to `strokeSpine` (translucent styles bead at span joints)
- `:1772` centre dashes `rgba(58,38,6,0.8)/rgba(70,78,74,0.55)` ->
  `rgba(226,206,150,0.55)/rgba(222,230,214,0.42)` (dark ink on white -> light paint
  on asphalt, forced by the polarity flip)
- `:1263` `C_LAND '#0a0c09'` -> `'#050805'`; `:1265` `C_PARK '#0e1c09'` -> `'#091405'`
  (`:1264` `C_WATER '#091820'` UNCHANGED)
- `:1661` cell patchwork `v = 5 + round(tone*34)` -> `v = 1 + round(tone*34)`
- `:1663` patchwork warm variant `rgb(v+6,v+3,v-3)` -> `rgb(v+2,v+5,v-1)`;
  cool variant `rgb(v-2,v+4,v+2)` -> `rgb(v-3,v+4,v+2)`
- `:1728` roof `v = 16 + round(tone*126)` ->
  `v = b.big ? 196 + round((tone-0.92)*300) : 14 + round(tone*175)`
- `:1733` roof family A `rgb(v+5, v*0.98, v*0.91)` -> `rgb(v*0.95, v, v*0.93)`
- `:1735` roof family B `rgb(v, v+2, v+3)` -> `rgb(v*0.90, v+2, v)`
- `:1736` roof family C `rgb(v*0.82, v*0.85, v*0.83)` -> `rgb(v*0.76, v*0.85, v*0.80)`
- `:1429` tower frequency `rnd() > 0.72` -> `rnd() > 0.55`

Road geometry (all NEW):
- `:1552` `ROAD_STEP = 24` (m between spine samples)
- `:1553` `ROAD_BOW = 0.30` (perpendicular bow amplitude, in road widths)
- `:1554` `ROAD_WJ = 0.30` (along-length width modulation, fraction of width)
- `:1555` `ROAD_WR = 0.17` (per-road width scale spread)
- `:1558` NEW `roadSpine()`, `:1593` NEW `roadWidthAt()`, `:1618` NEW `kerbAt()`,
  `:1626` NEW `strokeSpine()`; `:1602` `strokeRoad()` rewritten from a single
  `stroke()` of `r.pts` to a per-span loop over the spine

Boost bar:
- `:724` NEW `FOOT_A = 0.40, FOOT_H = 0.30` + the mask gradient at `:725-730`
- `:582` `LICK_BN 0.42` -> `0.34` (`LICK_TA 1.15`, `LICK_BW 2.60` UNCHANGED)
- `:794` `st(cy + ih*0.360), col.core` -> `st(cy + ih*0.402), col.core`
- `:795` `st(cy + ih*0.425), col.edge` -> `st(cy + ih*0.490), col.edge`
- `:664` `FRAY_TOP_A 0.85, FRAY_BOT_A 0.45` **UNCHANGED** — see the null result below
- `:773` the stale comment the wave-O critic flagged (claimed "0.370/0.470" over code
  reading 0.360/0.425) is corrected against the constants.

---

## PAIRED ATOMIC A/B — A,B,A,B INTERLEAVED, AND THE FIRST FOUR RENDERS WERE VOID

A was reconstructed byte-exactly (`md5 2a32f2ba5e4c4d348ed3a5855e56b222`, identical to
the session-start hash) and B saved as `md5 f0fd0f533c0a8988f001b2994d75c58b`.
Command for every render: `node tools/shot.mjs --scene hud-overlay --w 1920 --h 1080`.

**The first A,B,A,B set is VOID by rule and is not quoted anywhere below.** `car.js`
oscillated between `8fe0417f7b95c86f376c5fedabd04d8a` and
`f0304bbf48b0e9786a5ac51c8d843de2` inside ALL FOUR measurement windows — the
car-paint peer running its own A/B. Discarded and re-run with a retry loop that
re-renders whenever `md5 game/*.js` (hud excluded) differs between the start and the
end of a window. Round A1 needed six attempts; the other three passed first time.
**All four renders of record carry the identical peer snapshot
`md5sum(peer list) = dc33863d033d3b9921172da25728b620`.** `shots/hud-p-before.png`
= A1, `shots/hud-p-after.png` = B1.

`_px.mjs --region minimap=0.8125,0.9896,0.750,0.963` and
`--region road=0.9315,0.9345,0.795,0.870` and
`--region inner=0.840,0.975,0.775,0.945` (card interior, both rounds identical):

| metric | A1 | A2 | B1 | B2 | target | ref |
|---|---|---|---|---|---|---|
| road p50 | 195.5 | 195.5 | **87.9** | **87.9** | 85-110 **HIT** | ref03 89.7 |
| road rgb | 177.9,182.6,177.2 | " | **84,94,93.1** | " | — | ref03 91.5,100.8,98.4 |
| minimap p01 | 4.9 | 4.9 | **5.9** | **5.9** | <=6 **HIT** | ref03 5.4 / ref01 2.0 |
| minimap <16 | 15.37% | 15.37% | **13.22%** | **13.21%** | >=7% **HIT** | 4.35 / 10.6 |
| minimap sat | 0.060 | 0.060 | **0.094** | **0.094** | 0.085-0.100 **HIT** | 0.091 / 0.099 |
| minimap p50 | 44.4 | 44.4 | **54.2** | **54.2** | 50-60 **HIT** | 53.7 / 58.4 |
| minimap p99 | 235.8 | 235.8 | 177.7 | 177.7 | (not a wave-P target) | 211.2 / 255 |
| inner p50 | 51.9 | 51.9 | 65.9 | 65.9 | — | ref03 inner 55.6 |
| inner p99 | 237.9 | 237.9 | 187.2 | 187.2 | — | ref03 inner 215.4 |

`_hudedge.mjs 0.057,0.224,0.884,0.944` — **all widths normalised to barH = 76 px**,
per the wave-O tool ruling (raw %-of-frame is not comparable across images):

| metric | A1 | A2 | B1 | B2 | target | ref (normalised) |
|---|---|---|---|---|---|---|
| bottomRail | 12.0 px = **15.8% barH** | 12.0 = 15.8% | **21.0 px = 27.6% barH** | 21.0 = 27.6% | >=22% barH **HIT** | ref01 26.8%, ref03 24.5% |
| topRail | 23.5 px = 30.9% | 23.5 = 30.9% | 23.5 px = **30.9%** | 23.3 = 30.7% | hold **HIT** | 34.9% / 28.7% |
| leftCap %W | 0.33 | 0.33 | 0.33 | 0.33 | hold **HIT** | — |
| burnFront %W | 2.38 | 2.37 | 2.37 | 2.37 | hold **HIT** | — |
| rimTop/rimBot sat | 0.517/0.534 (split 0.017) | 0.516/0.535 (0.019) | 0.517/**0.529** (split **0.012**) | 0.517/0.531 (**0.014**) | split <=0.02 **HIT** | refs 0.507/0.503, 0.519/0.528 |
| blown >=250 | 18.95% | 18.95% | **21.72%** | 21.72% | 17-27 **HIT** | — |

`_hudlick.mjs 0.057,0.224,0.883,0.954` — **`thr` printed beside every ratio**, per the
wave-O compensation rule:

| | A1 | A2 | B1 | B2 | target |
|---|---|---|---|---|---|
| thrTop/thrBot | 135.0/122.2 | 135.1/122.2 | 135.1/122.8 | 136.0/122.8 | — |
| base top/bot | 25.4/**0** | 25.7/**0** | 24.7/**0** | 26.4/**0** | (`baseBot` is the documented out-of-frame 0) |
| top rmsHF | 4.09 | 4.10 | 4.08 | 4.08 | 3.9-4.2 **HIT** |
| bot rmsHF | 2.96 | 2.96 | 2.91 | 2.88 | 2.6-3.0 **HIT** |
| **ratio bot/top** | **0.72** | **0.72** | **0.71** | **0.71** | 0.60-0.80 **HIT** |
| top/bot rmsLF | 2.47/3.43 | 2.46/3.43 | 2.47/2.93 | 2.46/2.97 | (ref 4.05/2.38, 3.31/1.73) |

Our top/bottom threshold gap is **12.3** (B) against ref01's **36** and ref03's **20**,
i.e. still the SMALLEST of the three, so by the wave-O rule this is a conservative
reading of our bottom rail, not a favourable one.

**Scale persistence (required, and NOT sufficient on its own).** Native 960x540
re-render, not a downsample, both builds: B minimap sat 0.094 (vs 0.094 at 1920),
p50 54.7 (54.2), p01 6.5 (5.9), road p50 88.8 (87.9); A road p50 197.0 (195.5). The
whole effect is scale-stable, so it is not per-pixel aliasing.

**And the crop, which is the primary evidence because the gap is spatial.**
`shots/hud-p-card-before.png` and `shots/hud-p-card-after.png` (`_cropimg` 1560 1900
810 1040, 3x — PIXELS, not fractions) against `hud-overlay-03` at 954 1254 548 740.
Before: a constant-width near-white orthogonal lattice over hard black rectangles —
the critic's blind call, visible instantly. After: grey asphalt ribbons of visibly
varying width, bowing between junctions, with a pale kerb that fades in and out along
each road, over mottled parcels with varied light roofs. Side by side with ref03 the
road treatment now reads the same way. **What still differs on the eye is the BLOCK
geometry, not the roads** — see the remaining gap.

---

## TARGETS: 6 HIT, 0 MISSED

1. road p50 85-110 — **HIT** (87.9), with the p01<=6 / <16>=7% hold — **HIT** (5.9 / 13.2%)
2. minimap sat 0.085-0.100 — **HIT** (0.094)
3. minimap p50 50-60 — **HIT** (54.2), lifted via ROOFS as instructed, not ground
4. bottomRail >=22% barH — **HIT** (27.6%) with all three simultaneous holds:
   `_hudlick` ratio 0.71, rim sat split 0.012, blown 21.72%
5. per-segment road width jitter and curvature — **HIT** (`roadSpine` / `roadWidthAt`)
6. the stale `:750` comment — fixed

---

## TOOL AUDIT (the one budgeted) — `_px`'s `sat` IS A MEAN-CAST NUMBER, NOT SATURATION

`_px.mjs:57-61` computes `mr,mg,mb` as the region MEANS and only then takes
`(max-min)/max`. So it measures **the region's average colour cast**, and it is
identically **zero** for any region of perfectly complementary chroma — a 50/50 field
of pure red (255,0,0) and pure cyan (0,255,255) means to (127.5,127.5,127.5) and
scores 0.000 while being the most chromatic image possible.

Empirical corroboration with the tool itself, `--region full=0,1,0,1`:
`hud-overlay-01.jpg` — a bright daylight racing frame with green trees, a khaki road,
blue sky and a full-saturation HUD — scores **sat 0.025**. Our whole frame scores
0.063 and our minimap card scores 0.094. **A colourful photograph scoring a quarter of
our minimap card is the tell.**

**Ruling: KEEP the tool, do NOT retire target 2, but RESTATE the metric's name.** The
target is honest for THIS use, because both reference cards are genuinely
cast-dominated (visibly green-cyan in the crops) and the number is reproducible and
ref-derived. But it must never be quoted as "saturation": a builder can satisfy it by
tinting an entire region and adding no chroma at all, which is precisely the
metric-came-loose failure this project keeps hitting. I paired it with the crop
deliberately for that reason, and I did move some of it with a cast (roads and roofs
biased R below G to match ref03's card mean 65.5,72,68.6). **Quote it as
`meanCast` from here on.**

### `_hudlick.mjs:85` — the fix is NOT in the tool. Verified, not assumed.

`:85` still reads `bandMed(cy1 + barH*1.5, cy1 + barH*1.75)`. Our bar core bottom is
y1030 in a 1080 frame, so that band is y1144-1163 — off the bottom. Confirmed live:
`baseBot` printed **0** in every one of the eight renders above. So `thrBot` is still
exactly `plateau/2` and the wave-O ruling stands verbatim; I quoted `thr` beside every
ratio and did not touch the tool. **A note for whoever fixes it: the critic's proposed
1.0-1.25 barH band ALSO does not fit.** Our bar leaves only 50 px = 0.66 barH below
the core, and by the critic's own arithmetic ref01's bar bottom sits at y832 of 900
and ref03's at y740 of 800 — 0.68 and 1.12 barH of headroom. The only band that is
in-frame on all three images is roughly **0.35-0.60 barH** below the core.

### NULL RESULT, recorded so nobody re-runs it

`FRAY_BOT_A` is no longer a lever on the bottom rail's tear. With the soft foot in,
0.45 -> 0.33 -> 0.26 moved bot rmsHF by **0.01 total** (3.31 -> 3.32). The rail's
excursion at the new 50% crossing is set by the generator amplitude (`LICK_BN`), which
moved it 3.31 -> 2.91 in one step. `FRAY_BOT_A` was therefore restored to its r14
value of 0.45 rather than left at a tuned-looking number that does nothing.

---

## BRIEF CORRECTIONS

- The brief framed the road gap as "constant-width orthogonal strokes AND a road fill
  106 levels too bright" as if they were two defects. **They are one: the polarity was
  inverted.** Fixing the polarity fixed 106 of the 108 levels and half the spatial
  read in a single edit, and the jitter/curvature work sits on top of it. Any future
  round tempted to darken `ROAD_FILL` without also inverting the casing will get the
  histogram and keep the plan.
- Wave N's report says the bottomRail regression and the tear ratio "could not be hit
  at the same time". **That is now falsified** — 27.6% barH at ratio 0.71. The
  conflict was an artefact of driving both through contour excursion.

## WHAT I DID NOT DO / FOR THE NEXT ROUND

- **BIGGEST REMAINING HUD GAP: the minimap's BLOCK geometry, not its roads.** The road
  network now curves and varies; the land under it does not. `buildCity`
  (`hud.js:1298-1301, 1400-1443`) is still a strict rectangular module — `GXX`/`GXZ`
  axis-aligned grid lines, `subdivide` producing axis-aligned parcels, `cellsTone`
  drawing axis-aligned patchwork rectangles. `hud-overlay-03`'s card has curved
  arterials that BEND the blocks with them, wedge-shaped parcels at every diagonal,
  and a roundabout. Ours reads as an aerial photograph of Manhattan; the reference
  reads as an aerial photograph of Paradise City. Concretely: displace `GXX`/`GXZ` in
  the CITY MODEL (so parcels and patchwork inherit the curve) instead of only in
  `roadSpine`, which is a presentation-layer displacement and leaves the blocks behind.
- **Minimap p99 regressed 235.8 -> 177.7** (card interior 237.9 -> 187.2 against
  ref03's interior 215.4). Removing the near-white road fill removed the card's whole
  bright tail. Raising `KERB_RGB` 182->200 and the roof ceiling 160->205 both failed to
  move it (177.7 to the decimal in three different bakes), so in the OUTER region p99
  is pinned by a fixed HUD graphic in the card border, not by map content; only the
  `inner` region responds. **The next round should target `inner` p99 ~215 via bright
  sunlit roofs**, and should not use the outer-region p99 for this at all.
- The left cap is still a pale plate with three ribs (wave-M item 4, cosmetic).
  Untouched for the third round running.
- `roadSpine` caches on the road object (`r.spine`), so the bow is baked once. If the
  card is ever re-baked per frame this becomes a per-frame cost.

`./tools/lint.sh` -> `lint ok`, re-run as the last action, and every constant above
re-greped from the saved file afterwards.
