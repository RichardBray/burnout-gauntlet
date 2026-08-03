# WAVE K VERDICT — damage-model (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/damage.js

PIECE: damage-model   ROUND: k1
SCENE: daytime-downtown via
  `node tools/damage-shot.mjs --scene daytime-downtown --do "d.setLevel(L)" --cam "3.9,1.6,4.2|0,0.75,0.3|40"`
  at L=0/0.4/0.7/0.95
OURS: shots/damage-model-k1-{rest,0.4,0.7,0.95}.png   REF: reference/crash-cam-02.jpg, crash-cam-03.jpg

BLIND CALL: real. crash-cam-02's wreck shows **sheet thickness at every torn edge and a LIT
interior**; ours puts a 1.4x1.0 m matte-black lid where the bonnet should be and drapes the
valance on the tarmac as a zero-thickness silk sheet with rounded folds.

VERDICT: real wins

## NUMBERS
- Crush depth **REPRODUCES r8 digit-for-digit**: 29042 verts, rest z-extent 4.7500, tail pinned
  -2.3750 at every level; crush 0.2774 / 0.6355 / 0.7605 at L0.4/0.7/0.95 vs anchors
  0.2834/0.6414/0.7545 = -6.0/-5.9/+6.0 mm. setLevel(0) exactly stock.
- **Props "0 mm at every level" is TAUTOLOGICAL.** `applyCrushToRigids`
  (`damage.js:1687-1692`) *sets* `z += (fz + leadF) - front` using `footSkinZ`, so any metric
  built on footprint z-MAX reads 0 **by construction**. The critic reproduces 0 mm err_max for
  splitter/grille/lampL/lampR at all three levels — and it is **a fixed point of the setter,
  not a measurement.**
- Independent version (5x5 cells over each prop's own (x,y) footprint, per-cell skin z-max,
  lead error vs rest): grille **+158 mm @L0.7, +211 mm @L0.95** median-cell; splitter
  **+323 mm @L0.7**; lampR -1010 mm min-cell. The grille stands proud of the metal over MOST of
  its footprint while touching it at one surviving high point. This is the quantitative form of
  r8's own "intact black box" note.
- **WAVELENGTH METRIC IS STILL DIRTY.** `_paintmeas.mjs shots/damage-model-k1-rest.png 0.22
  0.34 0.45 0.57` (grille-free nose lobe, **PRISTINE** car) = grainPeriodPx 7.6,
  grainRMSpct 5.46. Damaged L0.4 in the identical window = **5.5 px, i.e. BELOW the pristine
  floor.** `reference/crash-cam-03.jpg 0.28 0.44 0.20 0.55` = ">24" at 1920 AND ">24" at
  `sips -Z 1600`. The tool **cannot resolve the reference at all** and cannot see past car.js's
  flake speckle. r8 diagnosed this and did not replace the metric.
- Exposed-interior brightness, normalised in-frame (immune to scene exposure):
  exposedInner p50 / intact-body p50 = ours 26.7/109.8 = **0.24**
  (`_px.mjs shots/damage-model-k1-0.95.png --region bonnetInner=0.29,0.43,0.30,0.41 --region
  intactFlank=0.60,0.70,0.45,0.53`); crash-cam-03 71.7/205.9 = **0.35**
  (`--region exposedInner=0.536,0.714,0.296,0.648`); crash-cam-02 77.8/58 = **1.34**
  (`--region tornRoofPanel=0.435,0.53,0.435,0.50` / `cleanFlank=0.30,0.40,0.65,0.70`).
  Worse, **ours is FLAT**: p50/p01 = 1.07 vs 8.9 (cc03) and 1.69 (cc02).
- Ablation proving ownership: recolouring only `0x0a0b0d` to magenta at runtime turns the entire
  lid magenta (`shots/_dmg-k1-abl-dark.png`), and R=255 renders at 38 — so the plate is 15% lit
  where cc03's inner is 35%, on a 4%-albedo material, with nothing behind it.

## CLAIMS CHECKED
- Reproduced: crush depths, vert count, tail pin, setLevel(0) stock, HINGE_MERGE 0.35 (:1021),
  buckle1 lerp(0.030,0.196) (:2192), foldAmp depth*0.26 (:2102), relax 0.22 (:2285), and all
  three metric contaminations.
- **FAILED: "setLevel cut from 7 impacts to 6 with front-metre hits 4 -> 3".** `setLevel`
  (:2580-2591) still holds **SEVEN** spots, and **FOUR** of them (z = 2.28, 1.74, 1.72, 1.50)
  are inside the front metre (front face z = +2.375). The deleted bonnet strike at z=1.32 was
  replaced by one at z=1.50, which is *inside* the front metre. **The claimed structural
  reduction did not happen; only the hinge-merge did.**

## BIGGEST REMAINING GAP: the bonnet is the only torn panel with NO SHEET THICKNESS and NO INTERIOR
`bonnetGeo` at `damage.js:764` uses `panelGeo(24,18,...)` — a **single-sided sheet** — while
`doorGeo` (:788) and `bumperGeo` (:808) already use `slabGeo(..., 0.075 / 0.15, ...)` with a rim
that closes to zero at the outline. `addPart` then fakes the underside by instancing **the SAME
single-sided geo 5 cm away** in `partDark` (:715, color 0x0a0b0d, no map, no normal, no AO), so
the largest and most camera-facing panel in the wreck is **two parallel paper sheets with open
edges and a 4%-albedo back.** At L0.7/0.95 that black plate is ~7% of frame and is flat to
within 2 luma levels across 40% of its area.
FIX (in damage.js only): rebuild `bonnetGeo` with `slabGeo(24,18,[0,1,0],~0.022,...)`, drop the
`inner:` duplicate, and give the underside a mid-grey mapped material with stamped ribs so
`exposedInner/intactBody` lands in 0.35-0.45 with internal p50/p01 > 3.

## TARGETS FOR NEXT ROUND
1. `exposedInner p50 / intactFlank p50` = **0.35-0.45** and internal **p50/p01 >= 3.0**, args as
   above on `shots/damage-model-k1-0.95.png`; refs crash-cam-03 (0.35, 8.9) and crash-cam-02
   (1.34, 1.69).
2. Grille/splitter **median-cell** lead error **<= 40 mm** at L0.7 and L0.95 (5x5 footprint
   cells, per-cell skin z-max, vs rest). Currently +158/+211 and +323. Fix the PIN RULE at
   `damage.js:1687-1692` — pin to the footprint **MEDIAN** and let the prop sink, or
   `detach()` the grille above L~0.55. **Do NOT report footprint-z-MAX error again; it is
   defined to be zero.**
3. Sheet-metal fold signature, **replacing grainPeriodPx**: count dark crease LINES per metre of
   panel (ridge-valley pairs where local luma drops >25% below a 24 px box mean) in the nose
   lobe. `crash-cam-03 0.28-0.44/0.20-0.55` is the target; ours has essentially none at L0.4.

## RETIRED/CORRECTED
- **RETIRE `grainPeriodPx` / the 18.5 px crumple-wavelength anchor ENTIRELY.** It is
  unmeasurable on the reference (">24" at both 1920 and 1600 on crash-cam-03), and on our side
  the **PRISTINE car scores 7.6 px in the same window while damaged L0.4 scores 5.5** — the
  metric is **anti-correlated** with the thing it claims to measure. Superseded by target 3.
- **CORRECT "props 0 mm at every level, monotonic and exact"** to: zero **by construction of the
  setter**; the real median-footprint error is 158-323 mm at L0.7/0.95.
- **CORRECT "6 impacts, 3 front-metre hits"** to: **7 impacts, 4 front-metre hits**, unchanged
  from r7.
- `hlFWHMpx` confirmed **resolution-dependent** (crash-cam-03 same region: 273 px @1920 ->
  227 px @1600). Do not quote it without a resolution.
