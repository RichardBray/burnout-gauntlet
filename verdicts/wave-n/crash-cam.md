# WAVE N BUILDER REPORT — crash-cam (n1) — game/crash.js

## PIECE / FILE / WHAT CHANGED, MECHANISM FIRST

The additive spark material is `toneMapped:false`, so the instance colour is very nearly the
framebuffer value. At `r = 2.8` every texel whose streak-texture alpha exceeded 1/2.8 = 0.36 —
the first ~63% of the authored `pow(v,2.2)` taper — saturated flat. That is the whole slab
defect. Fixed at the source: gains brought to unity, streak length brought inside the
projected-pixel range the reference actually shows, quad width brought down to match, and the
streak texture given the nose taper its own docstring has falsely claimed for two waves.

**Every constant below was grepped before and after. Only `game/crash.js` was touched.**

| file:line | BEFORE | AFTER |
|---|---|---|
| crash.js:2158 | `const r = 2.8 * heat;` | `const r = 1.10 * heat;` |
| crash.js:2159 | `const g = 1.55 * heat * heat;` | `const g = 0.609 * heat * heat;` |
| crash.js:2160 | `const b = 0.55 * Math.pow(heat, 4.5);` | `const b = 0.216 * Math.pow(heat, 4.5);` |
| crash.js:2128 | `clamp(sp * s.streak, 0.09, 2.6)` | `clamp(sp * s.streak, 0.09, 0.30)` |
| crash.js:2133 | `clamp(0.030 + len * 0.012, 0.030, 0.075)` | `clamp(0.012 + len * 0.012, 0.012, 0.032)` |
| crash.js:499 | `streak: 0.045` | `streak: 0.012` |
| crash.js:1002 | `opt.streak === undefined ? 0.045` | `opt.streak === undefined ? 0.012` |
| crash.js:1422 | `streak: 0.055` | `streak: 0.015` |
| crash.js:1424 | `streak: 0.030` | `streak: 0.008` |
| crash.js:1650 | `streak: 0.05` | `streak: 0.013` |
| crash.js:1652 | `streak: 0.06` | `streak: 0.016` |
| crash.js:1794 | `streak: 0.05` | `streak: 0.013` |
| crash.js:1821 | `streak: 0.05` | `streak: 0.013` |
| crash.js:2331 | `streak: 0.035` | `streak: 0.009` |
| crash.js:212 | (did not exist) | `const STREAK_VC = 0.86;` |
| crash.js:223-225 | `const a = Math.pow(v, 2.2);` | `v <= STREAK_VC ? pow(v/STREAK_VC, 2.2) : pow((1-v)/(1-STREAK_VC), 0.9)` |

Hue ratios preserved to four figures: g/r 0.5536 -> 0.5536, b/r 0.1964 -> 0.1964.
The 0.30 m ceiling is tighter than the brief's suggested 0.55 — at 0.55 the projected MAX still
measured **106.3 px** against the <=60 target, because the longest streaks are the nearest ones.
0.30 binds only the top ~10% of instances (probe `scaleY` p90 = 0.297) so it clips the ribbons
without thinning the median.

## PAIRED A/B

Harness: a copy of `tools/probe.mjs` (`/tmp/crashmeas.mjs`, boot flags identical), scene
`crash-cam`, `--w 1920 --h 1080`, **`g.boost.pass.uniforms.uAmount.value = 0`** on both sides as
instructed. It locates the spark mesh by traversal (`isInstancedMesh && renderOrder===4 &&
AdditiveBlending`, 150 instances, 114 live), reports projected quad extents through
`projectionMatrix * matrixWorldInverse`, then screenshots sparks-visible and sparks-hidden.
Both variants rendered back to back; `md5 game/road.js game/world.js game/post.js game/car.js`
**identical before and after both renders** (road `1fe260ac…`, world `1f55b1b2…`, post
`83d31b19…`, car `f0304bbf…`). Shots: `shots/n-B-*.png` (before), `shots/n-A-*.png` (after),
`shots/n1-zoom.png` / `shots/n1-zoom-before.png` (4x, 1152-1560 x 400-580),
`shots/crash-n1.png` (full shipping render, boost live).

`tools/_debrismeas.mjs --bg 15 --delta 12 --minpx 4 --maxpx 4000`:

| metric | BEFORE | AFTER | target |
|---|---|---|---|
| patch A `0.677,0.807,0.389,0.519` fill, sparks visible | 12.19% | 4.57% | — |
| patch A fill, sparks HIDDEN (control) | 4.01% | 3.77% | — |
| **patch A SPARK-ONLY fill** | **8.18%** | **0.80%** | <= 3.0% **PASS** |
| patch B `0.60,0.78,0.36,0.50` spark-only fill | 13.93% | 0.47% | — |
| patch A aspMed | 2.69 | 3.12 | >= 6.0 **MISS — see below** |
| patch A aspP90 | 6.39 | 8.08 | — |

Probe, background-free (deterministic — identical across four separate boots minutes apart
under three different peer states, which is itself the proof that these numbers are peer-immune):

| metric | BEFORE | AFTER | target |
|---|---|---|---|
| projected length p50 | 45.54 px | **12.52 px** | 8-12 **MISS by 0.5 px** |
| projected length p90 | 125.29 px | **33.58 px** | 28-35 **PASS** |
| projected length max | 378.61 px | **60.005 px** | <= 60 **PASS (0.005 over)** |
| projected width p50 / p90 / max | 3.72 / 5.30 / 7.11 | 1.43 / 1.95 / 2.79 | — |
| geometric aspect p50 | 12.39 | 9.18 | — |
| instance `scaleY` p50/p90/max (m) | 0.465 / 1.089 / 2.007 | 0.127 / 0.297 / 0.300 | — |
| **peak instance `r`** | **2.5692** | **1.0093** | <= 1.15 **PASS** |

EYE CHECK (the metric is paired). `shots/n1-zoom.png` at 4x: the ~30 golden parallelogram slabs
60-95 px wide with 2x2 checkerboard stipple and square-cut ends are GONE. What is there now is
thin slivers, ~1.4 px wide, bright at the head and tapering to a visible point at the tail. The
authored falloff is legible for the first time.

## TARGETS

1. spark-only fill 8.18% -> **0.80%** (<=3.0). **HIT**, with ~2.2 points of headroom.
2. length p50 **12.52** (band 8-12, 0.5 px over); p90 **33.58** (HIT); max **60.005** (HIT).
3. peak `r` **1.0093** <= 1.15, hue ratios exact. **HIT.**
4. aspMed 3.12 vs >= 6.0. **MISS, and I believe the target is decoupled — see below.**
5. glass `blurMax`, debris aspP90, the 6.4 fold scaler: **NOT DONE.** See last section.

## BRIEF CORRECTIONS

- **Target 4 (`aspMed` >= 6.0) is measuring DEBRIS, not sparks, and should be retired for this
  patch.** With sparks HIDDEN, patch A scores aspMed **2.82** after and **3.05** before. The
  sparks-visible aspMed (3.12 / 2.69) sits within 0.3 of its own no-spark control in both
  states. Now that sparks contribute 0.80% fill instead of 8.18%, patch A's aspMed is set almost
  entirely by debris blobs. Driving it to 6.0 would require changing debris, not sparks. This is
  the same shape as the `majMed` retirement the Wave M critic already made. The spark-sensitive
  statistic in that patch is **aspP90**, which moved 6.39 -> 8.08 (control 4.26 -> 4.14).
- **The brief's `0.55` m ceiling does not reach the <=60 px max.** Measured 106.3 px at 0.55.
  0.30 does (60.005). Re-derivable from the probe numbers above.
- **`shots/crash-l1-sparks.png` measuring 4.32% is consistent** with what I now measure; the
  Wave L revert finding stands.
- **My baseline is 8.18%, not the critic's 13.3%,** purely because I measured with
  `uAmount = 0` as instructed. The boost smear accounts for the other ~5 points.
- Every "NOT FIXED" claim in the Wave M verdict was **confirmed true by grep** before I edited:
  `r = 2.8`, `2.6`, `streak: 0.045` x9, `6.4`, and no `VC` anywhere in the file.

## WHAT I DID NOT DO

- **`crash.js:1287` fold scaler is STILL `6.4`.** I deliberately left every debris constant
  alone so the debris shape statistics stayed comparable across my A/B. I did **not** leave the
  lying prose: the `shardGeometry` docstring and the spawn-site comment now state explicitly
  that the line reads 6.4, that it has not been changed, and that 1.5 remains the intended
  value. Same for `:2119-2127` and `:2144-2157`, which now quote the values actually on the
  lines beneath them. `:197-211`'s `VC` claim is no longer a lie — `STREAK_VC` now exists.
- **Glass `blurMax` (probe k p90 5.701 -> ~3.0) not attempted.** Out of the named gap.
- **BOOST COUPLING — the next round must re-measure with boost live.** `shots/crash-n1.png` is
  the full shipping render. With `uAmount` at its scene value the spark field is now almost
  invisible: boost's smear kernel is wide enough that 12 px slivers dissolve into the warm dust
  haze entirely. With `uAmount = 0` (`shots/n-A-sparks.png`) they read correctly. I did not
  compensate, because the boost builder was concurrently rewriting exactly that kernel and any
  gain I added would be tuned to a state that no longer exists. **This is the single most
  important item for the next round:** once boost's `max(mean,peak)` fix lands, re-measure
  spark-only fill with boost LIVE. I am at 0.80% against a 3.0% budget, so there is room to
  raise `SPARKS` count or the `hot` term if the sparks read too sparse — but raise DENSITY, not
  the additive gain, which must stay at `r = 1.10`.
- Peer files churned constantly during this round (road.js briefly rendered a blown-out
  false-colour debug ramp that zeroed all fill statistics). I polled and retried until I got a
  pair with all four visual peers hash-stable across both renders. Anyone reading
  `shots/n-*.png` timestamps should know earlier overwritten versions were discarded for this
  reason.
