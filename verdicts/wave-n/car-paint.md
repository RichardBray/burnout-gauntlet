# WAVE N BUILDER — car-paint (n1) — game/car.js

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

The flake material map (`matx`, roughnessMap.g + metalnessMap.b) is no longer ungated.
`roughnessFactor` / `metalnessFactor` are re-derived inside the `normal_fragment_maps`
replacement, after stock `<roughnessmap_fragment>` / `<metalnessmap_fragment>` have run, as
`scalar * mix( BINDER, matxTexel, matxGate )`. `matxGate` is the fraction of a flake a cell is
allowed to be at this fragment. The same gate is applied as a second factor on the normal map's
`flakeGate`.

The gate driver is NOT `flakeGate` (the brief's suggestion) and NOT irradiance. Both were built
and measured and both fail — see BRIEF CORRECTIONS. It is the dimensionless ratio
`ccLum / irrMean` (near-mirror reflected radiance over this fragment's own hemispherical mean
radiance), pushed through a `smoothstep`. No tuned gain, so it tracks preset/exposure/
`envMapIntensity` for free.

## CONSTANTS — BEFORE -> AFTER, literal, with file:line (post-save re-grep)

- `car.js:1144` signature: added `matxFloor = 0.0, matxLo = 1.2, matxHi = 3.2, normFloor = 1.0`
  (defaults are a deliberate no-op so `liveryMat`, which shares this shader and has no
  normal/roughness map, is untouched).
- `car.js:1683` paintMat opts: `{ flakeMip: 0.12, flakeFloor: 0.50, gain: 6.0, ccGain: 1.6, scatter: 0.10 }`
  -> `{ flakeMip: 0.12, flakeFloor: 0.50, matxFloor: 0.00, matxLo: 1.20, matxHi: 3.20, normFloor: 0.45, gain: 6.0, ccGain: 1.6, scatter: 0.10 }`.
  `flakeMip`, `flakeFloor`, `gain`, `ccGain`, `scatter` UNCHANGED.
- `car.js:1341` NEW `float litResp = smoothstep( 1.200, 3.200, ccLum / max( irrMean, 1e-4 ) );`
- `car.js:1342` NEW `matxGate = mix( 0.000, 1.0, litResp );`
- `car.js:1352` NEW `flakeGate *= mix( 0.450, 1.0, litResp );`
- `car.js:1376` NEW `matxGate = min( 1.0, matxGate + sunGate );` (sun lobe factored out of the
  pre-existing `flakeGate +=` line; that line is numerically unchanged)
- `car.js:1390-1391` NEW `roughnessFactor = roughness * mix( 1.000, matxTexel.g, matxGate );`
  / `metalnessFactor = metalness * mix( 0.580, matxTexel.b, matxGate );`
- `car.js:1435` cache key gained `:${matxFloor}:${matxLo}:${matxHi}:${normFloor}`.
- **`car.js:599-601` UNCHANGED and verified by re-grep after the final render:**
  `FLAKE_SKEW = 1.8`, `FLAKE_MET = 1.00, BINDER_MET = 0.58`, `FLAKE_RGH = 0.22, BINDER_RGH = 1.00`.
  Nothing in `flakeMaps` (car.js:603-666) was touched. `metalness: 0.27, roughness: 0.43` at the
  material are unchanged.

## PAIRED A/B — peer-hash confirmed stable across the pair

Control is the SAME BUILD with `matxFloor: 1.00, normFloor: 1.00`, which makes both gates
identically 1.0 and is therefore bit-equivalent to the shipped ungated behaviour. Renders are
back-to-back, `md5 game/*.js` minus car.js identical before and after the pair (**PEERS_STABLE**).
`node tools/shot.mjs --scene car-paint-closeup --w 1920 --h 1080`.
Metric: `node tools/_paintmeas.mjs <png> <x0 x1 y0 y1>` grainRMSpct.

| region (args) | ctrl | gated |
|---|---|---|
| hi `0.1094 0.1563 0.6111 0.6852` | 4.73 (mean 72.2) | **3.71** (mean 72.8) |
| sh `0.0938 0.1354 0.7130 0.7500` | 4.32 (mean 46.3) | **3.29** (mean 48.6) |
| **coupling ratio** | **1.095** | **1.128** |
| same PNGs at `sips -Z 960` | 4.83 / 4.36 = **1.108** | 3.97 / 4.09 = **0.971** |

Glass no-regress `0.5156 0.625 0.350 0.412`: p50 35.8 / p90 **49.1** / p99 66.8 -> 67.4. p90
identical, inside the 49-75 hold band.
Cross-scene `dusk-highway-chase`: car region rgb 113.8,77.9,57.1 p99 236.9, no NaN rectangle, no
black bloom tile.

## TARGETS

1. **Ratio >= 1.45 at 1920: MISSED, 1.128** (from 1.095 — inside the +/-0.04 noise band, so call
   it unmoved). **Second half MET and it is real: the ratio now FALLS to 0.971 at 960, from
   1.128 at 1920.** It was 1.09 -> 1.09, perfectly scale-invariant, before. The flake is no
   longer resolution-independent noise.
2. **Shadow grainRMSpct <= 3.9: MET, 3.29** (ref 3.85). **"while holding hi >= 4.7": MISSED, 3.71.**
3. Flank split: NOT ATTEMPTED. Untouched three rounds running.
4. Glass: not tuned. p90 49.1, held.

**The eye beats the metric here, and by a lot.** `_cropimg.mjs shots/... 180 480 640 880 3 0` on
the paired pair: the control has dense hot-orange specks at uniform density across the entire
door including the shadowed lower-left; the gated build concentrates them in and around the
wheel-arch highlight and the shadowed rocker goes to a faint stipple. That is the blind call
("bedliner/spatter, not clearcoat") substantially answered while the headline number moved 0.03.

## BRIEF CORRECTIONS

1. **"Metalness 1.0 zeroes a cell's diffuse albedo" is FALSE.** `metalnessmap_fragment` is
   `metalnessFactor *= texelMetalness.b`, a MULTIPLIER on `material.metalness = 0.27`
   (`car.js:1601`). Effective per-cell metalness is 0.157 -> 0.27, never near 1.0, and diffuse
   is never zeroed. The real amplitude in the matx map is the ROUGHNESS swing: 0.43 x 1.00 ->
   0.43 x 0.22 = **0.43 -> 0.0946, a 4.5x swing into a near-mirror**. That is the contrast
   amplifier. The gap is real; the stated mechanism was the wrong one of the two channels.
2. **The brief's literal fix — "multiply the matx deviation by the same `flakeGate`" — INVERTS
   the ratio.** Built and measured, paired: hi 4.37 -> 2.63, sh 4.48 -> 3.58, ratio 0.98 -> 0.73.
   `flakeGate` is `ccFresnel * ccLum`, and the Schlick term dominates it, so it is a
   GRAZING-ANGLE field, not a lit field: the rocker is seen edge-on and gates HIGH, the
   near-face-on wheel arch gates LOW. Right gate for the normal map, wrong one for a BRDF swap.
3. **A pure irradiance gate does nothing.** Paired: 1.100 -> 1.080, and the 3x crop is
   pixel-for-pixel unchanged. Reason: the lit arch and the shadowed rocker are on the SAME door
   panel with nearly the SAME normal, and `getIBLIrradiance` is a function of the normal alone.
   What separates them is where the panel is AIMED.
4. **Target 1 may be close to immovable by any multiplicative gate, and the next critic should
   test this before another builder spends a round on it.** `grainRMSpct` normalises by patch
   mean, and a gate cannot change either patch's mean (flake is near zero-mean). So the ratio
   only moves if the gate differs between patches — but the grain in the shadow patch IS its
   locally-bright specks, i.e. exactly the pixels any brightness-keyed gate keeps. Measured
   gate attenuation this round: hi x0.784, sh x0.762 — a 1.03 differential from a gate whose
   step-probe population split is 64% vs 20%. The gate and the grain are computed from the same
   per-pixel radiance field, so they cannot be decorrelated. If ref-04 really is 1.58, the
   difference is that ref's shadowed rocker has nothing bright in its mirror direction, which is
   a PROBE/environment property, not a paint-shader one.

## MEASUREMENT NOTE FOR THE NEXT CRITIC

The `car-paint-closeup` scene's exposure moved hard mid-round from a peer edit — the two brief
regions read mean 73/46 at 04:37, mean 213/192 at 05:05, and mean 72/46 again at 05:30. Any
car-paint number captured in that window is void. Three of my renders were lost to it. This is
why every figure above comes from a single back-to-back pair with PEERS_STABLE, not from the
pre-edit baseline `shots/car-paint-n1-before.png`.

Debug technique worth keeping: to read a shader-internal scalar through the graded output pass,
pack `step(thresholdA/B/C, value)` into RGB and take the region mean. A binary survives ACES and
the per-preset grade, so the mean is the fraction above threshold. The grade's per-channel
saturation/tint means you may only compare the SAME channel across images, never R against G.
`tools/_carpaint-eval-shot.mjs --js "const g=window.__game; g.ssao.enabled=false; g.bloom.enabled=false;"`.
Note `liveryMat` shares `applyPaintShader` and draws OVER the whole body with `depthWrite: false`
— a debug write must be fenced on `USE_ROUGHNESSMAP` or it reads the livery, not the paint.

## WHAT I DID NOT DO / NEXT ROUND

- Flank split (target 3) untouched, still ~1.14 against a 1.35-1.60 window. Three rounds now.
- Did not lower `flakeFloor` (0.50) or touch `FLAKE_RGH` (0.22). If the next round wants the
  panel smoother still, `FLAKE_RGH` 0.22 -> ~0.45 attacks the 4.5x roughness swing directly
  instead of gating it, and is one constant.
- Did not touch `flakeMaps` cell size/skew, glass, livery, or any other file. Only `game/car.js`
  was edited.
- The remaining dark stipple is the flake NORMAL map at `normalScale 0.95` under `flakeFloor
  0.50`. It is now lighting-coupled at 0.45 floor but not eliminated. Ref-04 shows bright specks
  and no dark ones; making the flake a one-sided brightener is the obvious next mechanism.
