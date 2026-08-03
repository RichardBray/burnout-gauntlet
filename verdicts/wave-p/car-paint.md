# WAVE P BUILDER — car-paint (p1) — game/car.js (+ additive output field in tools/_stripemeas.mjs)

## HEADLINE: THE WAVE-O DIAGNOSIS WAS WRONG. THE CORDUROY IS NOT THE FLAKE.

The wave-o brief named a one-constant fix: `car.js:601 FLAKE_RGH 0.22 -> ~0.45`, on the theory
that `0.22 * roughness 0.43 = 0.0946` is a near-mirror sampling the probe's "vertical channel
walls". **I built it, measured it paired, and it made the striping WORSE.** Then I found the real
carrier by isolation, and it is a different constant on a different lobe. Same bug class (rule 4,
a quantity below what its downstream can represent), different term.

The comb is carried **entirely by the clearcoat indirect specular lobe** at
`clearcoatRoughness 0.090`, and what it is imaging is the **environment's strip of lit building
windows** — a periodic row of hard-edged emissive rectangles sitting at the car's shoulder height
in `world.js`'s mid-ground band (visible in any full frame of `car-paint-closeup` at y≈400-440).
`roughnessToMip(0.090) = -2*log2(1.16*0.090) = 6.5` on a 9-level PMREM chain off the 512-px car
probe, i.e. a near-mirror of the probe's RAW content. The whole front flank therefore imaged that
window periodicity as a block of desaturated vertical bars straight through the wheel-arch
highlight.

## CONSTANTS — BEFORE -> AFTER, literal, with file:line (post-save re-grep, after the final render)

- **`car.js:1667`  `clearcoat: 1.0, clearcoatRoughness: 0.090` -> `clearcoat: 1.0, clearcoatRoughness: 0.20`** (paintMat)
- **`car.js:1723`  `clearcoat: 1.0, clearcoatRoughness: 0.090` -> `clearcoat: 1.0, clearcoatRoughness: 0.20`** (liveryMat — its own comment
  binds it to track the basecoat, and it draws over the WHOLE body with `depthWrite:false`, so
  leaving it at 0.090 would have kept the comb alive everywhere the livery covers)
- Comments at `car.js:1645-1666` and `car.js:1703-1708` rewritten to describe the values above.
- **`car.js:601  FLAKE_RGH = 0.22` — UNCHANGED, re-grepped after the final render.** It was
  changed to 0.45, measured, and REVERTED; see the disproof below. `/tmp/car-A.js` (the pre-edit
  file) was md5-verified `f0304bbf48b0e9786a5ac51c8d843de2` against the tree at session start and
  used as the A leg of every pair.
- Nothing else in `car.js` touched. No other `game/*.js` file touched.
- `tools/_stripemeas.mjs`: ADDITIVE ONLY — four new output fields (`acY1`, `acX1`, `anisAC1`,
  `anisAC3`). `anis` and every other existing field are byte-for-byte the same computation, so the
  wave-o numbers remain directly comparable.

## TOOL AUDIT (the one budgeted) — `_stripemeas.mjs` `anis` IS SHAPE-DEPENDENT. RETIRE THE 0.56 ANCHOR.

`anis = sd(colMeans)/sd(rowMeans)`. A column mean averages `nRows` samples and a row mean averages
`nCols`, so **for isotropic noise `anis -> sqrt(nCols/nRows)`, not 1.0.** Measured on four
synthetic isotropic-noise frames (`/tmp/mknoise.mjs`, triangular-dithered 8-bit grey, 1920x1080):

| patch shape | used by | measured `anis` null (4 seeds) | measured `anisAC3` null |
|---|---|---|---|
| 90x81  | ours hi `0.1094 0.1563 0.6111 0.6852` | 1.14 / 1.25 / 1.33 / 1.20 → **1.23 ± 0.08** | -0.001 / -0.003 / -0.005 / -0.002 |
| 79x40  | ours sh `0.0938 0.1354 0.7130 0.7500` | 2.17 / 1.47 / 1.88 / 1.74 → **1.82 ± 0.29** | 0.015 / 0.005 / -0.010 / 0.013 |
| 81x39  | **ref-04 hi** `0.4583 0.5 0.5500 0.5833` | 1.62 | ~0.01 |
| 60x41  | **ref-04 sh** `0.4010 0.4320 0.6330 0.6670` | 1.57 | ~0.01 |
| 45x41 @960 | ours hi at 960 | 0.79 / 1.42 / 1.68 / 0.83 — **spread 2.1x** | ~0.00 |

Three consequences, all binding:
1. **"ours 3.14 vs ref 0.56" compared two different statistics** — ours on a 90x81 patch (null
   1.23), ref on an 81x39 patch (null 1.62). Null-normalised it is 2.55 vs 0.35.
2. **`anis` cannot support the mandated scale-persistence check.** Its own null spans 0.79-1.68 on
   one patch shape at 960. Wave O read "ours hi holds 1.95 at 960 — real, not aliasing" off a
   statistic whose noise floor covers that entire range.
3. **The ref-04 `_stripemeas` anchors are the SAME regions wave O already retired for
   `grainRMSpct`, and they fail for the same reason.** `anisAC3` on ref-04 hi is **-0.711** — an
   extreme HORIZONTAL feature, i.e. the anchor "0.56" is a badge/shut-line edge lying across the
   patch, not flat paint. Ref-04 sh is **+0.521**, i.e. more vertically combed than ours ever was.
   **RETIRE the 0.56 / 0.99 `_stripemeas` ref-04 anchors and target 1's "hi anis <= 1.30".**
4. And I could not replace them. `car-paint-closeup-04` is a graphic-wrapped car with no flat-paint
   region at all; the cleanest red panel I could find anywhere in the reference set (ref-01
   `0.4167 0.4531 0.4537 0.5370`, `sips -Z 1920`) has `resRMS 1.63` — JPEG has erased the flake
   entirely — and scores `anisAC3 +0.854`, worse than ours ever measured. **There is no reference
   region in this set with both flat paint and legible flake at 1920. Stripe anisotropy has no
   valid external anchor; judge it internally (A/B) and by eye.**

REPLACEMENT STATISTIC, now in the tool: `anisAC1` / `anisAC3` = lag-1 / lag-3 autocorrelation of
the detrended residual DOWN a column minus the same ACROSS a row. **Null 0.00 ± 0.02 on every
patch shape and both scales** (table above). Positive = vertical comb. Use it.

## PAIRED ATOMIC A/B — PEER CHURN VOIDED FIVE PAIRS. BOTH SURVIVING ROUNDS AGREE.

`node tools/shot.mjs --scene car-paint-closeup --w 1920 --h 1080`. Peer hash =
`md5` of the 14 non-`car.js` files in `game/`, taken immediately BEFORE and immediately AFTER each
individual render. A pair counts only if all four hashes are equal.

**VOIDED, declared voluntarily:**
- `FLAKE_RGH` round 1 (A1/B1): peer moved between the A render and the B render. Discarded.
- `clearcoatRoughness` rounds 1-3 (A1/C1, A2/C2, A3/C3): a peer oscillated between
  `f696893f…` and `3dab5522…` *during* three of those six renders. All three pairs discarded.
- `./tools/lint.sh` also hard-failed once mid-session on `game/world.js` (`SYNTAX game/world.js`,
  md5 `c100185e…`) — a peer's transient non-parsing state, not mine. `game/hud.js` moved twice and
  `game/world.js` three times over the session.

**SURVIVING PAIRS.** Legacy `anis` in brackets for continuity; `anisAC3` is the real number.

### Disproof: `FLAKE_RGH 0.22 -> 0.45` (rounds 2 and 3, peers stable within each)

| region / scale | A (0.22) r2 / r3 | B (0.45) r2 / r3 |
|---|---|---|
| hi 1920 `anisAC3` | 0.277 / 0.275 | **0.520 / 0.515** (worse, +87%) |
| hi 1920 `anisAC1` | 0.049 / 0.051 | **0.121 / 0.122** (worse) |
| hi 1920 [`anis`] | [3.01 / 2.96] | [3.72 / 3.47] |
| hi 1920 `resRMS` | 5.83 / 5.91 | 4.43 / 4.48 (flake amplitude -24%) |
| hi 960 `anisAC3` | 0.089 / 0.094 | 0.229 / 0.208 (worse) |
| sh 1920 `anisAC3` | -0.406 / -0.422 | -0.421 / -0.420 (flat) |

**Mechanism of the failure, and it is worth keeping:** widening the flake lobe made the mirrored
window strip *more* coherent, not less. The flake's per-cell randomness had been partially
DECORRELATING the reflection; blurring each cell let adjacent cells agree, so the bars fused into
smoother, longer, more legible vertical bands. The crop confirms it (`_cropimg.mjs
shots/car-paint-p1-B3.png … 180 400 620 800 3 0`): B is smoother AND the bars read better.
**Reverted. `FLAKE_RGH` stays 0.22.**

### Isolation that found the real carrier (`tools/_carpaint-eval-shot.mjs`, live overrides, one variable each)

| override | bars still present? |
|---|---|
| `g.car.liveryMesh.visible=false` | YES — not the livery |
| `g.ssao.enabled=false` | YES — not SSAO |
| all directional lights `intensity=0` | YES — not the sun |
| `g.car.envBox.uBoxHalf.value.set(1e6,1e6,1e6)` | YES — not box projection |
| `paintMat.roughnessMap = metalnessMap = normalMap = null` (**all three flake maps removed**) | **YES, and MORE legible** — not the flake |
| `paintMat.envMapIntensity = 0` | **NO** — it is the env probe |
| `g.car.setCcGain(0.0)` | **NO** — it is the CLEARCOAT indirect lobe specifically |

Then a live `clearcoatRoughness` sweep on the shipped tree: **0.14 leaves the bars legible on the
right-hand panel; 0.20 removes them completely; 0.28 is no better than 0.20.** Chose 0.20 —
`railMat` is authored as SATIN at 0.22, so 0.20 is still on the gloss side of a satin lacquer.

### The fix: `clearcoatRoughness 0.090 -> 0.20` (rounds 4 and 5, all four peer hashes `f696893f…`)

| region / scale | A4 / A5 (0.090) | C4 / C5 (0.20) |
|---|---|---|
| **hi 1920 `anisAC3`** | 0.281 / 0.279 | **0.129 / 0.122  (-55%)** |
| **hi 1920 `anisAC1`** | 0.051 / 0.051 | **-0.012 / -0.013 (crosses zero)** |
| hi 1920 [`anis`] | [3.03 / 3.00] | [2.92 / 2.83] |
| hi 1920 `resRMS` | 5.87 / 5.92 | 5.78 / 5.72 (flake amplitude held, -2.5%) |
| hi 1920 mean | 84.1 / 85.2 | 79.7 / 79.2 (-6.1%) |
| **hi 960 `anisAC3`** | 0.090 / 0.096 | **0.038 / 0.049 (-53%)** — scale-persistent |
| hi 960 [`anis`] | [1.92 / 1.87] | [3.58 / 3.52] — see below |
| sh 1920 `anisAC3` | -0.410 / -0.412 | -0.416 / -0.415 (flat) |
| sh 1920 `skew` | 0.01 / 0.01 | 0.07 / 0.01 (hold band <= 0.4: **MET**) |
| sh 1920 `darkPct` | 15.44 / 16.23 | 16.36 / 16.01 (hold band <= 18: **MET**) |
| glass `_paintmeas 0.5156 0.625 0.350 0.412` p90 | 51.2 / 51.2 | **51.2 / 51.2** (band 49-75: **MET**) |
| wing `_paintmeas 0.10 0.20 0.48 0.78` hlFWHMpx | 12 / 12 | **11 / 11** (crease line NOT widened) |
| wing hlPeak / hlFloor | 169.2 / 22.5 | 155.3 / 22.5 (still 6.9:1) |

**PAIR THE METRIC WITH THE EYE — and here they disagree, twice, and the eye wins both times.**
`_cropimg.mjs shots/car-paint-p1-ccA5.png … 180 400 620 800 3 0` vs the same on `ccC5`: A has a
sharply-bounded block of desaturated grey-blue vertical bars overlaying the wheel-arch highlight
and continuing across the shut line onto the next panel; C has none — a warm gradient with
isotropic sparkle. Legacy `anis` moves only 3.02 -> 2.88 on that (because its value is dominated by
its 1.23 shape null plus the panel's shading ramp), and **at 960 legacy `anis` says the fix made
things 1.9x WORSE (1.90 -> 3.55) while `anisAC3`, the crop and the full frame all say it is fixed.**
That is the third independent reason to stop using `anis`.

## TARGETS

1. hi `anis <= 1.30`: **MISSED as stated (2.88), and the target is RETIRED** — its ref anchor is a
   horizontal graphic edge on a differently-shaped patch, proof above. On the shape-independent
   replacement the gap closed 55% at 1920 and 53% at 960 and the sign of `anisAC1` inverted.
   sh `anis` 1.15-1.18, inside the 0.9-1.4 window: **MET.**
2. Hold o1's win — sh `skew <= 0.4` (0.01-0.07) and sh `darkPct <= 18` (16.0-16.4): **MET.**
3. Hold glass p90 in 49-75: **MET, 51.2, identical A and C.**
4. Wave N's `ccLum/irrMean` gate: **NOT TOUCHED.** `car.js:1341/1342/1352/1376/1390/1391/1435/1683`
   and the `matxFloor/matxLo/matxHi/normFloor` opts all re-grepped at their wave-N literals.

## TREE INTEGRITY CHECK (first act, as instructed)

All nine wave-N constants at `car.js:1144/1341/1342/1352/1376/1390/1391/1435/1683` and the
wave-N/wave-O `car.js:599-601` literals read exactly as the verdicts claim. `metalness: 0.27,
roughness: 0.43` at `car.js:1643` unchanged. **No unexplained edits in `car.js`.** (Peers were a
different story — see the void list.)

## DUSK RE-BASELINE — THE SKY MOVE DID NOT REACH THE CAR, AND HERE IS WHY

Mandated re-baseline against the CURRENT tree, method: `tools/probe.mjs --scene car-paint-closeup
--w 1920 --h 1080`, renders a white dielectric sphere (metalness 0, roughness 1.0) and a metal
mirror sphere into a 96x96 **FloatType** RT with `NoToneMapping` and `toneMappingExposure = 1`,
reads back with `readRenderTargetPixels`, averages the non-background texels. Full expression
saved in the report body of this round; it is 20 lines and reproducible verbatim.

| quantity | value (CURRENT tree) |
|---|---|
| **car probe, diffuse irradiance** (`paintMat.envMap`, `envMapIntensity 2.1`) | **rgb 0.09804 / 0.10543 / 0.10080, lum 0.10353** |
| `scene.environment`, same measurement | rgb 0.07959 / 0.09533 / 0.08375, lum **0.09115** |
| ratio car probe : scene.environment | **1.136** |
| `paintMat.envMapIntensity` | 2.10 |
| `renderer.toneMappingExposure` | 1.30 |

**BRIEF CORRECTION, cross-piece, and the damage builder should act on it:** sky's -6.2% / -9.1%
move is on `scene.environment`, and **`car-paint-closeup`'s paint does not read
`scene.environment` at all.** Every material in `envUsers` (`car.js:1841-1845`) is bound to the
car's OWN cube probe, re-rendered from the live scene by `refreshEnv()` (`car.js:1895`) and PMREM'd
locally. Empirically: wave O measured the hi-patch mean at 85.7/83.9/85.0/85.6/84.9 across five
renders; my A leg (byte-identical `car.js`) measures 84.1/85.0/84.1/85.2. **0.995x. The dusk panel
brightness did not move.** The sky change reaches the car only second-hand, through whatever the
probe's cube render happens to see.

## HANDOFF TO THE `damage` BUILDER (batch 3)

`syncFromPaint` (`damage.js:878-885`) copies `car.paintMat.envMap` by reference and nothing else.
`clearcoatRoughness` is a paintMat scalar; it is not on `partPaint`/`partUnder`/`dmgMat`/`shardMat`
and it is not in the probe. **The env-probe readback above is BIT-IDENTICAL before and after my
edit** (re-ran the same probe expression on both trees: `carProbe_diffuse lum 0.10353` both times,
all 15 digits). So:

- **env probe for `partUnder`: rgb 0.09804 / 0.10543 / 0.10080, lum 0.10353, unchanged by p1.**
- **`intactFlank 0.60,0.70,0.45,0.53` p50, `damage-shot.mjs --do "d.setLevel(0.75)"`, paired,
  peers stable across all four renders (`3dab5522…`):**
  **A (before) 46.5 / 46.3   →   C (after) 46.8 / 45.8.** `rgb.r` 133.8/132.0 → 134.6/129.9.
  **Unchanged inside its own ±1.1% spread. Derive your targets from ~46.3, not from wave O's 48.1-48.5.**
  (Wave O read 48.1/47.9/48.5 on the wave-O tree; the current tree reads 0.96x that. That drift is
  peer-side, not mine — my A leg reads the same 46.3-46.5 with the untouched `car.js`.)
- `bonnetInner 0.29,0.43,0.30,0.41` p50: A 52.8 / 46.5, C 58.9 / 50.7. **Still the loose one
  (13% spread within one arm). Do not tune against it without three renders per arm.**

## RETIRE / RESTATE

- **RETIRE** `_stripemeas` target 1 (`hi anis <= 1.30`) and the ref-04 `0.56` / `0.99` anchors.
  Proof: shape-dependent null (table above) and `anisAC3 -0.711` on the ref hi patch, i.e. the
  anchor is a horizontal edge.
- **RETIRE** `_stripemeas.anis` as a scale-persistence statistic outright — its null spans 2.1x at
  960 on a single patch shape, and it scored this round's confirmed fix as a 1.9x regression at 960.
  Use `anisAC1`/`anisAC3`, null 0.00 ± 0.02 at every shape and scale.
- **RESTATE** the wave-O headline: `FLAKE_RGH` is not the striping mechanism, `clearcoatRoughness`
  is; and `FLAKE_RGH 0.45` is an active regression (+87% `anisAC3`, -24% flake amplitude), measured
  paired over two agreeing rounds. Do not re-try it.
- **RESTATE** wave-O's "the gate made it slightly worse" (`matxGate` 3.14 open / 1.15 closed): the
  gate is not creating stripes. Closing it dims the flake, which dims everything the patch
  contains, including its response to the clearcoat lobe underneath. Correlation, not cause — the
  all-flake-maps-removed render still combs.

## THE SINGLE BIGGEST REMAINING CAR-PAINT GAP

**The car probe images `world.js`'s lit-window strip as a hard periodic emissive band, and 0.20
only hides it on the paint.** Look at any full frame of `car-paint-closeup` at y≈400-440: a
continuous row of bright yellow window rectangles at exactly the car's shoulder height, which is
exactly the reflection direction of the flank. Every SHARPER material on the car still mirrors it —
`chromeMat` (roughness 0.055, `envMapIntensity 3.0`), `rimMat` (0.085), `glassMat`, `discMat`
(0.06, `envMapIntensity 2.4`). Ref-04's chrome wheels "pick up the palm trees and the sky, giving a
legible curved reflection"; ours will pick up a picket fence.

**That content is `world.js` and I did not touch it, per the one-file rule.** The environment
builder should break the window strip's periodicity (vary emissive per window, not one band). If
car-paint has to own it, the lever is `PROBE_RES` at `car.js:1853` (512), whose comment currently
argues for keeping it high; the counter-argument is that a 512-px probe of a scene with a periodic
emissive band buys resolution the scene has no legitimate detail to fill. **Do not spend a round on
that until the environment side has been asked** — and measure the wheels/chrome, not the paint,
because the paint's lobe is now wide enough that it is no longer the piece that shows it.

Secondary, unchanged and now four rounds old: the flank split, 1.14 against a 1.35-1.60 window.
Untouched again this round.

## WHAT I DID NOT DO

- Did not edit `world.js`, `damage.js`, `main.js`, `scenes.js`, or any other `game/*.js`.
- Did not touch `FLAKE_RGH`, `FLAKE_SKEW`, `FLAKE_MET`, `flakeMaps`, `flakeMip`, `flakeFloor`,
  `normalScale`, `envMapIntensity`, `PROBE_RES`, the wave-N `matxGate` chain, or the flank split.
- Did not re-anchor stripe anisotropy externally — I established that it cannot be, and said so
  rather than inventing an anchor.
- `./tools/lint.sh` prints `lint ok` and both `clearcoatRoughness` literals re-grepped at
  `car.js:1667` and `car.js:1723` as the LAST action after the final render.
