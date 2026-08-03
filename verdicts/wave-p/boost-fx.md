# WAVE P BUILDER REPORT — boost-fx

PIECE: boost-fx   FILE: `game/boost.js` (only file touched)
md5 BEFORE `229e0a08a3136458dbccc7b1276f9ed6` -> AFTER `982dde37a04031a3fc22410034b9b485`
`./tools/lint.sh` = `lint ok` before every screenshot and as the last action.

## MECHANISM — THE TWO max() BRANCHES WERE DELETED, NOT TUNED

The brief's headline was right and its suspect sites were right. Verified against code first
(Rule 5): `PK_BANDS 12.0` :394, `pj` :395-396, `PK_REACH 6.0` :409, `NP 16` :410, `dsub` :412,
`if (pl > pkL) { pkL = pl; pk = tap; }` :428, `smear = max(smear, ...)` with `pj` :461-469.
All reproduced exactly.

Root cause, three compounding parts, all in the *same* direction:

1. **`max()` over a sparse station set is piecewise-constant in its own argument.** Walk one pixel
   down a ray and `pkLen` slides all 16 absolute sample positions; the latched station stays
   latched until one crosses off its source feature, then the output JUMPS. Piecewise-constant
   along a ray IS a comb — hard bright teeth at the station period with gaps between them.
2. **`floor(ang * PK_BANDS)` made the sampling phase discontinuous at every wedge boundary**, and
   `max()` carries that discontinuity to the output at full amplitude. 16 stations x 12
   wedges/radian = the herringbone the critic named. This was my own Wave N "win" and it was wrong.
3. **`PK_REACH 6.0`** let a pixel latch content ~430 px up-ray, so bare tarmac inherited the hazard
   barrier and the car flank at nearly full value.

FIX: both branches are now **convex/affine accumulations**, so the output is a weighted average of
the taps — bounded by them, continuous in phase / r / ang, and an *averaging* operator. The
"carries the brightest thing its ray swept" behaviour is kept by putting luma in the **weight**
instead of in a **selection** (a 1-D range-weighted blur along the motion vector). The wedge hash
is gone entirely; `j` (the mean's per-pixel jitter) is now correct for both, because an
accumulation averages a per-pixel phase away — the Wave N diagnosis of the jitter asymmetry was
right and was then solved in the wrong direction.

## CONSTANTS CHANGED — BEFORE -> AFTER, with file:line (AFTER re-greped post-render)

| site | BEFORE | AFTER |
|---|---|---|
| `boost.js:394` | `const float PK_BANDS = 12.0;` | **DELETED** |
| `boost.js:395-396` | `float pj = fract(sin(floor(ang * PK_BANDS + 0.6*sin(ang*3.1+1.7)) * 12.9898 + 4.1) * 43758.5453);` | **DELETED** (no `pj` remains in code; `grep -n 'pj\b'` hits comments only) |
| `boost.js:409` -> `:416` | `const float PK_REACH = 6.0;` | `const float PK_REACH = 2.2;` |
| `boost.js:410` -> `:419` | `const int NP = 16;` | `const int NP = 24;` |
| `boost.js:412` | `float dsub = (0.94 / float(NP)) * 0.5;` | **DELETED** (3-tap sub-stations removed; 24 dense taps replace 16x3) |
| `boost.js:416` -> `:426` | `float t = (float(i) + pj) / float(NP);` | `float t = (float(i) + j) / float(NP);` |
| `boost.js:417` -> `:427` | `float u = 0.06 + 0.94 * t;` | `float u = 0.03 + 0.97 * t;` |
| `boost.js:428` -> `:432-435` | `float pl = ...; if (pl > pkL) { pkL = pl; pk = tap; }` | `float w = (1.0 - 0.45*t) * (1.0 + PK_BIAS * min(pl, PK_LCAP)); pacc += tap*w; pwsum += w;` |
| new `boost.js:417` | — | `const float PK_BIAS = 3.0;` |
| new `boost.js:418` | — | `const float PK_LCAP = 0.60;` |
| new `boost.js:436` | — | `vec3 pk = pacc / max(pwsum, 1e-4);` |
| `boost.js:258` -> `:270` | `float lenPix = uAmount * (0.55 + 0.45 * uSpeed01) * 72.0 * falloff * mask * velo;` | `float lenPix = uAmount * (0.30 + 0.70 * uSpeed01) * 72.0 * falloff * mask * velo;` |
| `boost.js:437` -> `:460` | `float bb = smoothstep(2.5, 16.0, lenPix) * (0.45 + 0.55*uSpeed01);` | `float bb = smoothstep(9.0, 34.0, lenPix) * (0.45 + 0.55*uSpeed01);` |
| `boost.js:460` -> `:505` | `for (int i = 1; i <= 10; i++) { float t = (float(i) - 0.5 + pj) / 10.0;` | `for (int i = 0; i < 16; i++) { float t = (float(i) + j) / 16.0;` |
| `boost.js:469` -> `:513-517` | `smear = max(smear, s * smoothstep(0.55,1.30,lum) * exp(-t*2.0));` | `float env = exp(-t*2.0); sacc += s * (smoothstep(0.55,1.30,lum) * env); senv += env;` then `vec3 smear = sacc / max(senv, 1e-4);` |

UNCHANGED and re-verified: `PK_KNEE = 1.00` :111, `PK_CEIL = 1.60` :112, `shoulder()` :113-119,
`const int N = 20` (mean) , `sLen = 260.0 * uAmount * (0.4 + 0.6*uSpeed01)`, the hero/jet mask,
the depth gate, `caOff`, vignette. `game/crash.js` NOT touched (md5 `a0b741957c...` throughout).

Two design notes worth keeping:
- The speed-line accumulation divides by the sum of the **decay envelope alone**, with the luma
  gate left inside the numerator. Dividing by the realised weights would renormalise a single
  bright station back to full value — the latch again in disguise. A ray bright end-to-end (a
  tunnel light strip, -03's blown VP) still comes out at full strength; one bright station among
  16 comes out at ~19%.
- `PK_LCAP` caps the luma entering the weight so an over-unity spark cannot buy unbounded weight.
  A tap at luma >= 0.60 counts 2.8x a black one and no more, whether it arrives at 0.6 or at 2.8.

## PAIRED A/B — TWO ROUNDS, A,B,A,B INTERLEAVED, PEER-HASH VERIFIED

A was reconstructed byte-exactly for round 2 (`md5 game/boost.js = 229e0a08...`, confirmed).
Peer hashes checked inside every measurement window AND across each pair: sky.js
`c8c50d7557a615912a35c2e1afcb017d`, road.js `4abc18e90865a687be00dd3b58390aba`, crash.js,
car.js, main.js, scenes.js, post.js all **STABLE for the whole round**. `scene.environment` did
not move. `game/audio.js` moved once (`ee551f61...` -> `c9900bca...`) in the gap between round-1 A
and round-1 B — it is off the pixel path, and it was stable within every render window; round 2
(A2/B4) is clean on all fifteen files including audio.js, and round 2 reproduces round 1.

### Target 1 (HEADLINE) — fx/nofx hpRms. `_heromask --scene boost-blur` (fx + nofx in ONE boot), `_smearmeas --foc 0.504,0.508 --patch 0.28,0.40,0.72,0.92`

| round | A fx | A nofx | **A ratio** | B fx | B nofx | **B ratio** |
|---|---|---|---|---|---|---|
| 1 (`_bpA1` / `_bpB3`) | 14.44 | 1.15 | **12.56** | 2.06 | 1.10 | **1.87** |
| 2 (`_bpA2` / `_bpB4`) | 14.53 | 1.17 | **12.42** | 2.34 | 1.08 | **2.17** |

ref-02 (`sips -Z 1920`) same patch: hpRms **5.26**.
**A blur no longer adds HF at 8.7-12.6x; it adds 1.9-2.2x, and our absolute fx hpRms (2.06-2.34)
is now BELOW the reference's 5.26.** Target `<= 1.2` MISSED — see BRIEF CORRECTIONS.

Same patch, same runs (A -> B): **maxSmear 4.4 -> 77.3/78.0 px** (ref-02 62.4),
**aniso 2.10 -> 40.4/39.3** (ref-02 33.71), radSmear 4.0 -> 5.5.

### EYE, PAIRED WITH THE METRIC — `_cropimg <f> <out> 538 778 768 994 2 40`
- `shots/_bpA1-nofx-crop.png`: plain dark tarmac, nothing in it.
- `shots/_bpA1-fx-crop.png`: a **countable** row of cream picket teeth on a diagonal plus a fan of
  dark radial chevrons. Manufactured, exactly as the critic said.
- `shots/_bpB3-fx-crop.png`: teeth **gone**. Smooth tarmac, one faint continuous warm smear
  upper-left, and one small bright element drawn out into a single continuous tapered streak
  lower-right. Continuous, like the reference. The number and the image moved together.

### Target 3 (gate) — scale-persistence P = hpRms(960x540)/hpRms(1920)
A1 19.49/14.44 = **1.350**; A2 19.64/14.53 = **1.352** (reproduces the critic's 1.354).
B3 2.58/2.06 = **1.252**; B4 3.00/2.34 = **1.282**. ref-02 1.30. **In [1.0,1.5] — PASS.**

### Target 4 (CROSS-PIECE, crash-cam is unblocked) — `_heromask --scene crash-cam` fx(boost LIVE)/nofx(boost 0) in one boot, `_debrismeas --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.677,0.807,0.389,0.519`. Patch = 249.6x140.4 = 3.504e4 px. Live `uAmount 0.27087`, `uSpeed01 0` (probed).

| | A blobs | A dens/1e4 | A areaMed | B blobs | B dens/1e4 | B areaMed |
|---|---|---|---|---|---|---|
| round 1, boost LIVE | 14 | 4.00 | **107** | 21 | **6.00** | **46** |
| round 1, boost 0 | 26 | 7.42 | 32 | 26 | 7.42 | 32 |
| round 2, boost LIVE | 18 | 5.14 | **67** | 21 | **6.00** | **41** |
| round 2, boost 0 | 27 | 7.71 | 34 | 26 | 7.42 | 38 |

**areaMed 67-107 -> 41-46; density 4.0-5.1 -> 6.0**, against a boost-0 ceiling/floor of 7.4 / 32-38.
Boost's own contribution to spark fusion is down from a 2.2-3.3x area inflation to ~1.2x.

EYE: `_cropimg shots/_bpcA2-fx.png ... 1300 1549 420 560 3 40` vs `_bpcB4-fx.png`. Before: three
fat wedge-shaped orange slabs with soft square tops — the fused slivers. After: three separate
thin tapered debris streaks with sharp leading tips. This is the artefact crash-cam was blocked on
and it is gone. **crash-cam is unblocked and may now raise SPARKS.**

## TARGETS: HIT / MISSED

1. fx/nofx hpRms `<= 1.2`: **MISSED, 1.87-2.17** (from 12.4-12.6). 6x closer; absolute fx hpRms
   now below ref. See corrections.
2. radSmear `>= 12`: **MISSED, 5.5** (from 4.0). maxSmear 78 px and aniso 39-40 both now EXCEED
   ref-02 (62.4 / 33.7) in the same patch, so the smear itself is there.
3. P in [1.0,1.5]: **PASS, 1.25-1.28** (ref 1.30).
4. crash patch A density 10.1 / areaMed <= 15: **MISSED as stated, both unreachable from
   boost.js** — see corrections. Moved to 6.00 / 41-46 against a boost-0 baseline of 7.42 / 32-38.

## BRIEF CORRECTIONS (with evidence)

1. **`hpRms(fx)/hpRms(nofx) <= 1.2` is unreachable while the pass does any work at all, in THIS
   patch.** The pass's own input there measures hpRms 1.08-1.17 — near-featureless tarmac. Any
   smear that legitimately drags content in from up-ray (the bright chip visible at lower-right in
   `_bpB3-fx-crop.png` is real, in-frame, and on that pixel's motion vector) must raise HF above
   1.1. The defensible form of the target is **absolute**: fx hpRms must not exceed ref-02's 5.26.
   We are at 2.06-2.34. Recommend restating target 1 as "fx hpRms <= ref hpRms in the same patch,
   AND the fx/nofx ratio must be O(1) not O(10)".
2. **Crash patch-A `density 10.1` and `areaMed <= 15` are both crash.js quantities, not boost.js
   ones.** Measured with boost fully bypassed in the same boot: density **7.42-7.71**, areaMed
   **32-38**. The reference (`crash-cam-01.jpg`, `sips -Z 1920`, `--patch 0.00,0.30,0.63,0.73`)
   scores blobs 65, fill 1.40%, **majMed 4.3 px, areaMed 6**. Our chips are 3x wider and ~6x the
   area *before boost touches them*. Boost cannot raise a count it does not create nor shrink a
   chip it does not author. Achievable boost-side targets are the boost-0 figures: density -> 7.4,
   areaMed -> 32-38. We are at 6.00 / 41-46. **The residual belongs to crash.js's emitter chip
   size, and crash may now proceed.**
3. **My absolute `_debrismeas` figures do not match the critic's** (critic boost-0 fill 0.81%,
   count 48, areaMed 16/10; mine 7.3-7.6%, 26-27, 32-38 with the identical args). Same tool, same
   args, same patch, same scene, `uAmount` identical to 5 dp. The likely difference is that the
   critic measured a spark-ISOLATED frame (their column is labelled "spark-only") where mine are
   full beauty frames from `_heromask`. **The direction and the ratios reproduce exactly** (boost
   LIVE always fewer, larger blobs), so the paired comparison stands, but the critic's absolute
   numbers should not be quoted against mine. Whoever re-derives this must state whether the frame
   is spark-isolated.
4. `uSpeed01` is **exactly 0** in the crash-cam scene while `uAmount` is 0.2709. Nothing in the
   brief said so, and it is the single most useful fact for the crash x boost coupling: it means
   the **speed-line branch contributes literally nothing there** (it multiplies by `uSpeed01`), so
   all of boost's spark damage came from `lenPix` and the one-sided `bb * max(pk-mean,0)` add. That
   is why the `(0.55 + 0.45*uSpeed01)` floor and the `bb` gate were the effective levers.
5. Confirming the critic's tool finding from the other side: **P moved only 1.35 -> 1.25 while
   hpRms(fx) fell 14.5 -> 2.1 and the picket fence vanished from the image.** P is nearly blind to
   a 6x change in synthesised low-frequency structure. Never use P as a headline.

## WHAT I DID NOT DO / FOR THE NEXT ROUND

- Did not touch `game/crash.js`, did not raise crash's `r`, did not touch any peer file.
- Did not chase the retired 6.5:1 aspect target or the retired near-road radSmear/aniso patch-1
  targets. Did not touch the plume, the hero mask, the depth gate or the tonemap path.
- **radSmear is still 5.5 against a nominal 12.** I did not push it, for two reasons I want on
  record rather than hidden: (a) `maxSmear` and `aniso` in the same patch now BEAT ref-02, so the
  directional smear exists and `radSmear`-at-`--foc 0.504,0.508` is measuring agreement with an
  assumed focus of expansion that ref-02 does not share (its VP is off-frame left; the critic
  found ref-02 itself scores radSmear 2.3-3.5 there); (b) the only lever left was a longer kernel,
  and I had just shortened it 21% to unblock crash. **Recommend Wave Q re-derive target 2 from
  `maxSmear`/`aniso` and drop `radSmear` at a foreign focus, or retire it.**
- The `lenPix` speed floor cost boost-blur 21% of its kernel (52.1 -> 41.0 px at `uSpeed01 0.385`).
  If a later round wants it back it should come from raising `uSpeed01` in the boost-blur scene
  (`scenes.js`, not mine) rather than from restoring the 0.55 floor, which is what damaged crash.
- `PK_BIAS 3.0` / `PK_LCAP 0.60` are the only two genuinely tuned numbers I added. Both are
  dimensionless and bounded by construction; a critic should smoke-test `PK_BIAS = 0` (pure mean)
  to confirm the bright bias is doing visible work rather than assuming it.
</content>
</invoke>
