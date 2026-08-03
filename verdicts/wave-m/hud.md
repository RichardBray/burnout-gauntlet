# WAVE M VERDICT — hud (m1)  =>  THIS IS THE WAVE N BUILD BRIEF for game/hud.js

PIECE: hud   ROUND: m1
SCENE: hud-overlay   OURS: shots/hud-m1.png (+ hud-m1b.png, both 1920x1080)
REF: reference/hud-overlay-01.jpg (1600x900), -03.jpg (1280x800). Measured at NATIVE res, no upscaling.

BLIND CALL: picked the reference as real, and at full frame the tell is NOT the boost bar — it
is the **minimap**. Ours is a mid-grey orthogonal street *plan* (uniform grey blocks, drawn
white building rectangles, hard white keyline round a skewed card) that glows out of the
bottom-right corner. Both references are dark aerial *photo* plates: near-black building
masses, organic curved road network, no keyline. Ours reads as illustration pasted on a frame.

VERDICT: real wins

## NUMBERS

**Boost bar tear — `tools/_hudlick.mjs <file> <x0,x1,y0,y1>`** (this tool is new on disk; the
Wave L builder wrote it and it is a real contour metric — keep it).
Boxes set to the bar's own traced rail extents so `barH` is comparable across resolutions:
- ours `shots/hud-m1.png 0.057,0.224,0.883,0.954`: top rmsHF **3.39** ampP95 6.34 / bot rmsHF
  **5.65** ampP95 11.29 → **ratio bot/top 1.67**. Repeat render `hud-m1b.png` 1.68. Stable.
- ref01 `0.0875,0.231,0.8603,0.9258`: top 3.90 / bot 2.91 → **0.75**
- ref03 `0.094,0.336,0.8595,0.9265`: top 4.09 / bot 2.59 → **0.63**
**Ours is inverted: our bottom rail is the torn one, both references tear the TOP rail harder.**

**Rim colour split — `tools/_hudedge.mjs`, same x, wave-K y boxes**
(ours `0.057,0.224,0.884,0.944`; ref01 `0.0875,0.231,0.872,0.917`; ref03 `0.094,0.336,0.869,0.925`):
- ours rimTop sat **0.575** / rimBot **0.448** — a 0.127 split.
- ref01 0.507 / 0.503 (0.004). ref03 0.519 / 0.528 (0.009). Corroborates the rail asymmetry.
- HOLD, all currently in range: topRail 2.27 %H (ref 2.29 / 1.90), bottomRail 1.54 (1.75 / 1.62),
  leftCap 0.33 %W (ref01 0.36), burnFront 2.37 %W (2.67 / 2.22), blown>=250 **17.26%**
  (ref01 27.35, ref03 18.99 — inside the 17-27 band).
- Note refs ALSO have a softer top rail (2.29/1.75, 1.90/1.62) — so edge softness is not the
  cause of the inverted tear. It is a generator/erosion asymmetry.

**Minimap — `tools/_px.mjs --region`**
- ours `minimap=0.8125,0.9896,0.750,0.963`: p01 **16.3**, p50 78.7, p99 212.4, sat 0.043, **<16: 1.14%**
- ref03 `minimap3=0.762,0.930,0.7125,0.8625`: p01 **3.9**, p50 83.6, p99 220.7, sat 0.058, **<16: 7.17%**
- ref01 `minimap=0.747,0.931,0.720,0.931`: p01 0.4, p50 51.2, p99 255, sat 0.091, <16: 11.08%

## CLAIMS CHECKED
Zero — the Wave L report was lost. Everything above is re-measured from two fresh renders.
`./tools/lint.sh` = `lint ok`. The Wave L code IS in the tree: `LICK_N/LICK_W/LICK_F` at
`game/hud.js:559` are now shared by both rails as the k1 brief demanded, and `_hudlick.mjs`
exists. The k1 amplitude fix therefore LANDED and **did not fix the asymmetry** — proof the k1
diagnosis was wrong about the mechanism.

## BIGGEST REMAINING GAP: `game/hud.js` minimap — it is a vector plan, not an aerial plate
Mechanism: the map is composited entirely from mid-grey fills plus white strokes, so its
histogram has **no values below 16** (1.14% vs 7.17-11.08%) and no clipped whites (p99 212 vs
221-255). A real Burnout minimap is a dark photographic aerial with black building masses and
blown white road casing; the value range, not the linework, is what sells it. Needs a dark
ground (near-0) with per-block luma variance and bright road casing, and the hard white keyline
+ card skew dropped. Ref: crop `hud-overlay-03.jpg 960,1280,570,800` and `-01 1190,1495,640,845`.

## TARGETS FOR NEXT ROUND
1. **Minimap** at `_px.mjs --region minimap=0.8125,0.9896,0.750,0.963`: p01 **<= 6**,
   **<16 >= 7%**, sat **>= 0.055**, p99 **>= 220**. Do NOT chase ref01's p50 51.2 (see below).
2. **Rail tear ratio** `_hudlick.mjs` with the boxes above: bot/top rmsHF **0.60-0.80**, top
   rmsHF **3.9-4.2**, bot **2.6-3.0**. Render twice.
   Prime suspect, and it is NOT amplitude: `game/hud.js:608-612`, the SECOND fray-eraser copy is
   drawn at `cy - ftH*0.66` with height `ftH*1.3`. Its two puff bands then land at
   [-1.98,-0.759] and [+0.703,+1.92] bar-half-heights, while the rails live at 0.50-0.715 — so
   copy 2 erodes the BOTTOM rail's tongues and misses the TOP rail entirely. Copy 1
   (`cy - ftH*0.5`) is symmetric. Centre copy 2, then bias erosion toward the top.
3. HOLD: the four edge widths, blown>=250 17-27%, and bring rimTop/rimBot sat within 0.02 of
   each other (currently 0.575 / 0.448) at ~0.51.
4. Cosmetic, low priority: our left cap is a pale-outlined rounded plate with three dark
   strokes; both refs' caps are a small dark burnt nub with no outline.

## RETIRED/CORRECTED
- **RETIRED: the wave-K "lick-zone sd" 10-strip p50-luma metric.** Re-run on this shot
  (`_px.mjs`, 10 strips over x 0.0573-0.2292, top band y 0.8639,0.8843, bottom 0.9528,0.9731) it
  gives top sd **32.5** / bottom **7.1**, ratio **0.22** — where k1 measured 7.0 on a similar
  bar, and where the contour metric and my eye both say the BOTTOM is the torn rail. The
  estimator is bimodal: two of ten strips (t5, t8) have their median fall inside the body and
  jump 40 -> 120 while the rest sit at background. It also positions its bands straddling the
  current rails (top rail meanY 953.4, band ends 955). It cannot resolve tear. Use `_hudlick.mjs`.
- **CORRECTED: the k1 note about a missing "unfilled track with hatched segment cells" at
  `hud-overlay-01` x395-600.** Those are **tyre tread marks in the dirt forecourt**, not a HUD
  graphic — `hud-overlay-03` (clean road, near-full bar) shows **no empty-track graphic at all**
  to the right of its burn front. The r5 decision at `game/hud.js:499-505` (draw only the burning
  length) is CORRECT. Do not build a track. Also: our scene already captures at `boost = 0.68`
  (`game/scenes.js:232`), so this WAS judgeable and it is settled.
- **CORRECTED: the k1 minimap target `p50 51.2 / p99 255 / sat 0.091` from `hud-overlay-01`.**
  `hud-overlay-03`'s minimap gives p50 **83.6** / p99 220.7 / sat 0.058 and ours is 78.7 — we
  already match ref03 on mean level. The two references disagree because they are different
  districts. Only the **black floor** (p01, <16%) is consistent across both, so that is the
  target; the p50/sat/p99 part is retired.
- Confirmed per standing constraints: HUD is a separate DOM canvas layer, ungraded by design.
  No grade or tonemap gap reported.
