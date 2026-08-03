PIECE: car-paint          ROUND: o1
SCENE: car-paint-closeup  OURS: shots/car-paint-o1-a.png (+b,c,d,e)  REF: reference/car-paint-closeup-04.jpg
TREE: `md5 game/*.js | md5` = 88b8b49d407972090551f8cf528e8e9a, unchanged across all 5 renders. lint ok.

BLIND CALL: Instant. Ref-04's fender is a smooth red gradient carrying one razor specular line.
Ours is peppered with dark specks AND ruled by vertical light/dark streaks running the full panel
height through the wheel-arch highlight (`_cropimg.mjs shots/car-paint-o1-a.png /tmp/x.png 220 320
660 740 8 0`). No real panel is vertically corduroyed.

VERDICT: real wins

## THE BUILDER IS HONEST. EVERY CLAIM REPRODUCES.
All 9 constants at car.js:1144/1341/1342/1352/1376/1390/1391/1435/1683 read the reported literals;
car.js:599-601 unchanged as claimed. No Rule-5 drift. Its saved pair re-measures exactly (ctrl
4.73/4.32=1.095, gated 3.71/3.29=1.128). Correction 1 CONFIRMED: `metalnessmap_fragment` multiplies
`material.metalness=0.27`, so Wave M's "metalness 1.0 zeroes diffuse" was wrong; the roughness
swing 0.43 -> 0.0946 is the amplifier. Corrections 2 and 3 accepted as live-override disproofs.
**The visual win is real and large** - ctrl peppers uniform spatter across the whole door incl. the
dark rocker, gated concentrates it at the arch. Shadow `skew` 1.17 -> 0.06, `darkPct` 25.5 -> 16.2.
Ship it, do not revert.

## FINDING #8 - TARGET 1 IS NOT "IMMOVABLE", IT IS INVALID. RETIRE IT.
Correction 4 reaches the right action by the wrong argument. Real reason: `_paintmeas.mjs:41-49`
grainRMSpct is a FIXED 3x3 box high-pass, cutoff locked to screen pixels, so it is not the same
statistic on two images - and **ref-04's two target regions contain no flake at all**:
- ref hi `0.4583 0.5 0.5500 0.5833` = a chrome badge + panel shut line, grainPeriodPx **>24**
- ref sh `0.4010 0.4320 0.6330 0.6670` = a specular crease streak + shut line, period **16.1**
- ours = period **3.4**, actual flake.
The 1.58 anchor is a ratio of a badge edge to a crease streak. Proof it is scale-broken: at 960 ref's
grain RISES (hi 6.09 -> 10.07, sh 3.85 -> 8.36), ratio falls 1.58 -> 1.20, while a clean ref sky control
`0.651 0.755 0.05 0.167` holds 0.24 -> 0.26 (so: structure folding into the passband, not codec).
**Retire target 1 and the 1.58 anchor; do not re-derive.** Ours reads 1.167-1.241 over 5 renders
(was 1.095), 1.007 at 960.

## NEW METRIC - `tools/_stripemeas.mjs` (written to disk, lint ok)
9x9 detrend, `anis` = std(col means)/std(row means). Isotropic flake ~1.0; vertical probe streaks >>1.
| region | gated | ctrl | ref-04 |
|---|---|---|---|
| hi `0.1094 0.1563 0.6111 0.6852` | **3.14** | 2.63 | **0.56** |
| sh `0.0938 0.1354 0.7130 0.7500` | 1.15 | 1.38 | **0.99** |
Ours hi holds 1.95 at 960 - real, not aliasing. The gate made it slightly worse.

BIGGEST REMAINING GAP: **the flake roughness swing pushes lit cells below what the probe can
represent.** `FLAKE_RGH 0.22` x `roughness 0.43` = 0.0946, a near-mirror sampling PMREM mip ~0 of the
512-px probe (`car.js:1853`) whose dominant content is vertical channel walls; each lit cell mirrors a
wall and they coalesce into streaks. Rule 4's bug class. Confirmed by the gate: striping tracks
`matxGate` (3.14 open, 1.15 closed). File: **game/car.js:601**.

TARGETS (all `_stripemeas.mjs`, args above, at 1920 AND 960):
1. hi `anis` <= 1.30 (ref 0.56, ours 3.14), sh `anis` in 0.9-1.4.
2. Hold o1's win: sh `skew` <= 0.4, sh `darkPct` <= 18.
3. Hold glass `_paintmeas 0.5156 0.625 0.350 0.412` p90 in 49-75 (ours 49.1).
Cheapest lever, one constant, already scoped by n1: `car.js:601 FLAKE_RGH 0.22 -> ~0.45`. Attack the
swing, do not gate it further; the gate is done.

RETIRED/CORRECTED: target 1 (>=1.45) and the ref-04 1.58 anchor RETIRED, evidence above; target 2's
"hold hi >= 4.7" clause dies with it; `grainRMSpct` is valid only A/B'd on one image at one resolution.
Wave M's metalness mechanism CORRECTED. Flank split untouched a 4th round (1.14 vs 1.35-1.60).

## CROSS-PIECE - car-paint IS STABLE. Damage may derive brightness targets.
Frozen tree, 5 renders: hi mean 85.7/83.9/85.0/85.6/84.9 (2.1%). Three `damage-shot.mjs --level 0.75`:
`intactFlank 0.60,0.70,0.45,0.53` p50 **48.1/47.9/48.5** (1.2%), rgb.r 139.4/139.2/141.4 (1.6%).
**The 99.5 -> 194.7 swing was Wave N peer churn, not car.js nondeterminism, and it is gone.** Caveat:
`bonnetInner 0.29,0.43,0.30,0.41` p50 is looser at 56.2/52.7/52.2 (7.1%) - that is damage's side.
Also: the builder's absolute means (72.8/48.6) sit 15% below mine on the identical tree because they
were taken mid-Wave-N. Only its RATIOS transfer.
