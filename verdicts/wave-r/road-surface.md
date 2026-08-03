PIECE: road-surface        ROUND: r15 (builder)
FILE OWNED: `game/road.js`. Tools used read-only: `tools/_anisonull.mjs`, `tools/_bandmeas.mjs`,
`tools/_cropimg.mjs`, `tools/shot.mjs`. No tool was modified.
SCENE: wet-night-asphalt    CAMERA: default chase, 1920x1080, damage 0
BRIEF: `verdicts/wave-q/road-surface.md` T1 (sparsify the specular residual), T2 guard, T3 ladder
REF: `reference/wet-night-asphalt-01.jpg` -> `shots/q1/ref1920.jpg` (`sips -Z 1920`, 1920x1129),
copied to `shots/r1/ref1920.jpg`, md5 unchanged.
A LEG: `/tmp/r-A.js` md5 **`4abc18e90865a687be00dd3b58390aba`** = wave-Q's pair-of-record.
B LEG (SHIPPED): `game/road.js` md5 **`52cdd45f5efc4678822013368333a0ea`**, mtime **11:46:29**;
final confirming render `shots/r1/B3.png` at **11:46:58**, i.e. AFTER the last save, and it
reproduces `B1.png` to every digit.
PEERS: `md5 game/*.js` minus road, digest `51666235ab85eb7c88f5ac2f9f3fad12`, identical before and
after every render of the pair of record. `sky.js` went transiently NON-PARSING mid-round (see
PROCESS below); no measurement in this file was taken inside that window.

---

# STEP 0 — ABANDONED-EDIT AUDIT (round 13/14 leftovers, written before anything else)

At session start `git status` showed `game/road.js` MODIFIED against `e1c1e82` ("tree as left by
round 13"), mtime 08:49, with no verdict anywhere. Three hunks. **The first version of this audit
got hunk 3 backwards and the correction is recorded here rather than silently fixed, because the
mistake is instructive: `e1c1e82` is NOT a known-good baseline, and a working-tree diff against it
can be round 14 REVERTING round 13, not round 14 editing wave Q.**

### The thing that settled it: wave-Q's byte state was still on disk.
`/tmp/road-B.js`, `/tmp/road-B-q.js` and `/tmp/road-A.js` all carry md5
**`4abc18e90865a687be00dd3b58390aba`**, exactly the md5 `verdicts/wave-q/road-surface.md` quotes
for its shipped B leg. `e1c1e82:game/road.js` is **`89a9bb2a4942fe59f76dad721b588b35`** and differs
from it by **one line**. Rendered, the 4abc18e9 state reproduces wave Q's figures to every digit
(d5 `hfRmsNorm` **11.82**, mean **96.1**, `ratio` **1.49:1**, top-5% share **33.4%**, p99/p50
**4.63**; d4 **12.14** / **33.0%** / **4.60**). So 4abc18e9 is the true A leg and `e1c1e82`
contains a round-13 edit that was committed into the baseline.

### EDIT 3 (audited first because it decides the other two) — the mirror gain at `:1428`.
```
wave-Q state (4abc18e9)   float k = reflGate * fres * mix( 0.32, 1.0, reflW ) * ( 0.25 + 0.75 * gloss )
e1c1e82 (round 13)        float k = 0.25 * reflGate * fres * mix( 0.32, 1.0, reflW ) * ( 0.25 + 0.75 * gloss )
working tree (round 14)   float k = reflGate * fres * mix( 0.32, 1.0, reflW ) * ( 0.25 + 0.75 * gloss )
```
Round 13 INSERTED `0.25 *`, a 4x cut of the whole mirror radiance, unmeasured and uncommented, and
contradicting the comment block directly above it, which still describes the 0.25-scaled gain.
`shots/r1/C-k50.png` and `C-k75.png` (mtime 08:39, round 13's own leftovers) show it was sweeping
that constant. Round 14 reverted it. **DECISION: the round-13 insertion is REVERTED — I ship
`k = reflGate * ...`, i.e. round 14's form and wave Q's form.** Measured cost of the round-13
insertion, so nobody re-tries it blind: d5 `hfRmsNorm` **11.82 -> 17.40** (T3 band 10.0-13.5,
FAILS, and `max <= 13.0` FAILS at 17.40), d4 12.14 -> ~15.0, and the d5 region mean **96.1 -> 77.5**,
a -19% road brightness shift. **This is the single largest thing repaired this round and it was
sitting in HEAD.**

### EDIT 1 — `:763-793` DECL: `sparseShape()` + `SPARSE_KN 0.020` / `SPARSE_PWR 2.00` /
### `SPARSE_CAP 6.00`. **KEPT IN MECHANISM, REWRITTEN IN FORM AND IN PROSE, AND NOW MEASURED.**
It is T1's prescribed direction, so it was worth measuring rather than discarding. Measured, the
r13 form fails: see FINDING 1. It ships with a gain knob added, retuned, moved to a different
channel, and with its comment block rewritten, because three of its claims were false.
**Rule-5 defects found in the r13 prose, all corrected in place:**
1. "shaped magnitude is capped at SPARSE_CAP * SPARSE_KN = 0.30" — 6.00 * 0.020 = **0.12**.
2. "the consumer saturates at lensH = 2.7" — `clamp( 1.0 + lensH * 0.75 * ..., 0.0, 2.6 )`
   saturates at lensH = **2.13**, and it is not the binding consumer anyway; the mirror UV warp
   `clamp( lensH * 2.6, -1.2, 1.2 )` binds first, at lensH **0.462**.
3. "RMS-NEUTRAL at the right knee, so it buys sparsity WITHOUT buying amplitude" — **false, and it
   is the whole reason the r13 form does not work.** See FINDING 1.

### EDIT 2 — `:944-945`: `lensH`/`lensC` routed through the shaper. **HALF KEPT.**
Measured one channel at a time (FINDING 2), `lensH` is a null and `lensC` carries the entire
effect. Shipped: `lensC` shaped, `lensH` restored to affine. Shaping `lensH` was dead range.

### `tools/_stripemeas.mjs` — NOT MINE, NOT TOUCHED, NOT COMMITTED.
mtime 08:36 but `git diff tools/_stripemeas.mjs` is EMPTY, so round 13's edit to it is already
inside `e1c1e82` and there is nothing in the working tree to adjudicate. It is car-paint's tool.
Flagged, untouched.

### `/tmp/q-aniso.mjs` — ALREADY PROMOTED, no reconstruction needed.
`md5 /tmp/q-aniso.mjs` = `6523633ab1ef98478a4471b09f361c82` = `md5 tools/_anisonull.mjs`,
byte-identical. Wave Q shipped it into `tools/` already and the brief's fallback is moot. **Every
T1 figure below was taken with `tools/_anisonull.mjs`, not the `/tmp` copy.** Nothing to add.

---

# MANDATORY NULL CHECK ON THE T1 STATISTIC — IT PASSES, AND IT IS NOT IN THE `sqrt(H/W)` CLASS

`tools/_anisonull.mjs synth`, then `skew` at four region shapes spanning 96x756, 1690x32, 538x65
and 384x216 pixels:

| field | top-5% share | p99/p50 | shape dependence over the four regions |
|---|---|---|---|
| `/tmp/q-iso.png` white noise | **16.4%** | **2.22-2.23** | none, 16.4% at all four |
| `/tmp/q-isoblur.png` 3x3 box | **27.8%** | **3.76-3.77** | none, 27.8% at all four |
| `/tmp/q-vert.png` down-road streaks | 19.9-20.1% | 2.65-2.68 | none |
| `/tmp/q-horiz.png` transverse bands | 19.9-20.0% | 2.64-2.67 | none |

Two results. (a) **The null is a constant, not `~sqrt(H/W)`** — unlike `_bandmeas.ratio`, which
lives in the same file and is retired for exactly that defect. The sparsity statistic is safe to
quote across regions of different aspect. (b) **It is blind to anisotropy** (vert and horiz both
score ~20% against iso's 16.4%), so it is not an anisotropy statistic wearing a different name,
and a win on it cannot be a disguised win on the retired `ratio`.

---

# FINDING 1 — THE r13 SHAPER'S PREMISE IS WRONG: SPARSITY IS NOT FREE IN AMPLITUDE

The r13 form REPLACES the channel with `KN^(1-p) * |v|^p * sign(v)`. That squashes the bulk of a
unimodal field toward zero and removes far more energy than the tail returns. Paired, everything
else frozen, d5 (top-5% share / p99p50 / 5x5 rms), both channels shaped:

| (PWR, G) | d5 share | d5 p99/p50 | d5 rms | d4 share | d4 rms |
|---|---|---|---|---|---|
| A leg, no shaper | 33.4% | 4.63 | **11.20** | 33.0% | **10.87** |
| (2.00, 1.00) = the r13 constants | 53.1% | 9.02 | 6.94 | 45.1% | 7.63 |
| (2.30, 1.50) | 48.6% | 6.85 | 7.39 | 42.5% | 8.00 |
| (2.00, 1.60) | 47.7% | 6.57 | 7.49 | 42.0% | 8.07 |
| (1.70, 1.90) | 45.0% | 5.85 | 7.84 | 40.4% | 8.35 |
| (2.60, 2.60) | 38.9% | 4.78 | 8.81 | 36.6% | 9.11 |
| (3.00, 3.20) | 34.8% | 4.18 | 9.72 | 33.6% | 9.83 |

**As shipped by r13 it hits T1 and breaks T3 by 41%** (d5 `hfRmsNorm` 7.91 against band 10.0-13.5;
d4 9.00 against 10.5-13.5). A compensating gain does not rescue it: the six rows above are a
one-dimensional FRONTIER on which share and amplitude move in opposite directions, and **nowhere on
it are T1 and T3 both satisfied.** So the r13 edit, had it shipped unmeasured, would have traded a
won target for the headline without saying so.

Two other forms were built and measured before the frontier was accepted as real:
- **Additive tail on the same carrier** (`v + G*KN*max(a^p - a, 0)`, bulk left bit-identical).
  Amplitude rises as designed — d5 rms 11.20 -> **13.76** — and share FALLS to **28.6%**, below the
  A leg. Adding tail energy to a 3-9 px band spreads it over ~25 px, so it reads as more dense
  structure, not as specks. Recorded so nobody re-derives it.
- **`SPARSE_PWR` above ~2.3 is inert**, which is how the map's real behaviour was found: PWR 2.30
  and 2.55 return figures identical to three digits at fixed G. That can only happen if `min()` is
  taking `CAP` for essentially the whole population, i.e. the carrier's sigma is well above
  `SPARSE_KN` and the map is a compress-then-clip, NOT the power expansion its own comment claimed.
  The shipped comment now says so.

---

# FINDING 2 — CHANNEL ATTRIBUTION: THE DENSE FLOOR IS `chipAmb`, AND THE MIRROR IS A NULL

Same map, one channel at a time, at (PWR 2.30, G 1.50):

| shaped channel | d5 share | d5 rms | reading |
|---|---|---|---|
| `lensC` only | 33.4% -> **48.4%** | 11.20 -> 7.57 | the whole effect is here |
| `lensH` only | 33.4% -> **33.3%** | 11.20 -> 11.00 | **nothing**, at every (PWR, G) tried |
| both | 48.6% | 7.39 | = `lensC` alone |

So the dense, symmetric part of the near-field specular residual is the **ambient chip floor**
(`chipAmb`, `road.js:1544`), not the mirror path. Anyone briefed at the mirror is at the wrong
object.

# FINDING 3 — THE BRIEFED MECHANISM (`:1137` / `:262`, ROUGHNESS) HAS NO AUTHORITY. KILL-CONTROLLED.

The brief names `:1137` and its source at `:262` and asks for a sparse low tail in roughness. Built
it: a polished-flake subpopulation `smoothstep(FLK_LO, FLK_HI, hL * mix(1, cavV, 0.65))` driving
`roughnessFactor *= mix(1.0, FLK_RGH, flake * detAmt)`. At a ~4% population it moved d5 share
**33.4% -> 33.6%** and p99/p50 4.63 -> 4.73, i.e. nothing.

**Kill-control, the one that settles it:** force `flake = 1` EVERYWHERE at `FLK_RGH 0.42` — a 2.4x
global roughness cut over the entire road — and d5 share reaches only **35.1%** at p99/p50 5.05.
A second arm, `FLK_RGH 0.05` at the sparse threshold, reaches **34.0%**. **The roughness path's
TOTAL authority over this statistic is under 2 points against a 17-point gap.** On a wet night road
the near-field residual is carried by reflected radiance, not by BRDF lobe width. The whole
roughness lever was removed from the tree again; it is not in the shipped diff.
**Consequence for the brief: T1's stated mechanism was the wrong object.** Eighth such find.

# FINDING 4 — T1 IS SATISFIABLE BY DELETING A FEATURE, WHICH MEANS IT IS NOT A SPARSITY TEST ALONE

`SPARSE_G = 0.00`, i.e. `lensC` and therefore `chipAmb` removed outright: d5 share **58.5%**,
p99/p50 **14.65**, rms 6.68. **The target is maximised, PAST the reference's 50.7%, by deleting the
intrinsic-grain term.** Precedent is explicit in the standing constraints (2a: "a target that
scores best with the feature removed does not measure the feature", which retired two sky targets).
And the round-13 mirror cut is a third instance from the other side: it raised share 33.4% -> 43.0%
purely by removing smooth radiance. **T1's share, alone, rises whenever near-field specular energy
is removed by any means.** It is only a real target when paired with T3 held, which is how it was
treated below. Wave Q's "it cannot be gamed by raising amplitude" is true; the unstated converse is
that it is trivially gamed by LOWERING it.

---

# WHAT SHIPS — a PAIR, tuned jointly, that moves energy from dense to sparse instead of adding or removing it

Because the dense floor can be thinned (share up, energy down) and a genuinely sparse population
can be added (share up, energy up), the two together can raise share at CONSTANT energy, which is
what the plate actually looks like. Both halves are in the diff and neither is meaningful alone.

BEFORE / AFTER literals, all verifiable with `git diff game/road.js` against `4abc18e9`:

| file:line | BEFORE | AFTER |
|---|---|---|
| `road.js:1428` (`e1c1e82`) | `float k = 0.25 * reflGate * fres * ...` | `float k = reflGate * fres * ...` (round-13 insertion reverted) |
| `road.js:776` | *(absent)* | `#define FLK_A    0.580` |
| `road.js:777` | *(absent)* | `#define FLK_B    0.700` |
| `road.js:778` | *(absent)* | `#define FLK_AMP  0.240` |
| `road.js:779` | *(absent)* | `#define SPARSE_KN  0.020` |
| `road.js:780` | *(absent)* | `#define SPARSE_PWR 2.30` |
| `road.js:781` | *(absent)* | `#define SPARSE_CAP 6.00` |
| `road.js:782` | *(absent)* | `#define SPARSE_G   1.90` |
| `road.js:783-786` | *(absent)* | `float sparseShape( float v ) { float a = abs( v ) / SPARSE_KN; return sign( v ) * SPARSE_KN * SPARSE_G * min( pow( a, SPARSE_PWR ), SPARSE_CAP ); }` |
| `road.js` MAP_FRAG `lensC` | `float lensC = ( dL0.b - dL1.b ) * 3.4 * lensRes;` | `float lensC = sparseShape( ( dL0.b - dL1.b ) * 3.4 ) * lensRes;` |
| `road.js` MAP_FRAG `lensH` | `float lensH = ( dL0.r - dL1.r ) * 3.4 * lensRes;` | UNCHANGED (deliberate, FINDING 2) |
| `road.js` MAP_FRAG `lensG` | `float lensG = ( dL0.g - dL1.g ) * 3.4 * lensRes;` | UNCHANGED |
| `road.js:1137` | `roughnessFactor *= mix( 1.0, 0.58 + rghD * 0.90, detAmt );` | UNCHANGED (FINDING 3) |
| `road.js:262` | `const rgh = clamp((0.28 + c * 0.70) * (1 - sm * 0.62) * (1 - Math.max(gv, 0) * 0.52), 0, 1);` | UNCHANGED (FINDING 3) |
| `road.js` REFL_FRAG, after `chipAmb` | *(absent)* | `float flk = smoothstep( FLK_A, 1.0, dL0.r ) * smoothstep( FLK_B, 1.0, dL0.b );` and `outgoingLight += flk * FLK_AMP * uWet * detAmt * chipFar * vec3( 0.90, 0.96, 1.10 );` |

Mechanism of the added half: the sparse population is the product of two DECORRELATED upper tails
of the band-limited mip sample `dL0` — height and cavity — so a facet has to be both a proud crown
and open to the sky. It is sampled from `dL0` (LOD 1.585), not from `dA`, so it inherits the same
`>= 3 px` band limit as the lens and cannot be per-pixel salt; T2 below is what checks that rather
than the argument.

Rule-4 range check on everything touched. The shaped `lensC` ceiling is
`SPARSE_KN * SPARSE_G * SPARSE_CAP = 0.228`, against a binding consumer that needs 0.462 (the
mirror UV warp `clamp( lensH * 2.6, -1.2, 1.2 )` — note `lensH` is unshaped so the warp is
untouched anyway), 2.13 (the mirror gain) and 2.80 (the roughness term). Nothing downstream
saturates. `FLK_AMP` is a radiance add of 0.240 at full mask into `outgoingLight`, whose consumer
is the ACES path, and the crust test below bounds what it does to the mean.

---

# PAIRED A/B — A,B,A,B INTERLEAVED, PEER DIGEST HELD, DETERMINISM 0.00

`tools/shot.mjs --scene wet-night-asphalt --w 1920 --h 1080`, single-file swap, peer digest
`51666235ab85eb7c88f5ac2f9f3fad12` identical at all four renders. **A1 == A2 and B1 == B2 to every
digit on every metric**, and a fifth render `B3` taken after the final save also matches `B1`
exactly. Two-render A/B is valid, as wave Q established.

## T1 — HEADLINE. HIT, ALL FOUR NUMBERS.
`node tools/_anisonull.mjs skew --region 0.72,1.0,0.94,1.0` and `...,0.88,0.94`:

| | A (before) | B (SHIPPED) | band | ref-01@1920 | verdict |
|---|---|---|---|---|---|
| d5 top-5% energy share | 33.4% | **51.5%** | 42-52% | 50.7% | **HIT** |
| d5 p99/p50 of \|e\| | 4.63 | **7.91** | 6.5-8.5 | 7.88 | **HIT** |
| d4 top-5% energy share | 33.0% | **44.9%** | 40-50% | 46.6% | **HIT** |
| d4 p99/p50 of \|e\| | 4.60 | **6.67** | 6.5-8.5 | 7.52 | **HIT** |

d5 lands 0.5 points from the ceiling of its band and 0.8 above the reference; that is deliberate,
the swept neighbour (FLK_AMP 0.250 / G 1.85) reads 52.2% and would breach it. Nothing is near the
55% glitter-noise fail line.

## T2 — GUARD ON T1. PASS, AND IT IMPROVED.
`P = hfRms(sips -Z 960 of the render) / hfRms(render)`:

| band | A | B | band | ref | verdict |
|---|---|---|---|---|---|
| d4 | 0.802 | **0.825** | 0.75-1.05 | 0.961 | PASS, +0.023 toward ref |
| d5 | 0.857 | **0.886** | 0.80-1.05 | 0.938 | PASS, +0.029 toward ref |

A's 0.802 / 0.857 reproduce wave Q's 0.799 / 0.859. **No band gained high-frequency energy at 1920
while losing it at 960, so no coherent comb and no salt was traded in.**

## T3 — LADDER. ALL FIVE BANDS HELD IN BAND. `hfRmsNorm`, `tools/_bandmeas.mjs`.

| band | A | B | band | ref | verdict |
|---|---|---|---|---|---|
| d1 | 5.46 | **5.46** | 4.8-6.5 | 5.63 | HELD |
| d2 | 7.03 | **7.00** | 4.2-8.0 | 4.99 | HELD |
| d3 | 8.23 | **8.18** | 4.0-8.5 | 4.59 | HELD |
| d4 | 12.14 | **11.10** | 10.5-13.5 | 12.48 | HELD |
| d5 | 11.82 | **11.12** | 10.0-13.5 | 12.00 | HELD |

`max` over d1..d5 = **11.12**, gate `<= 13.0` PASS.

## DO-NOT-REGRESS: THE MID-DISTANCE HUMP AND MONOTONICITY.
**The dead hump stays dead.** d5..d1 = **11.12 / 11.10 / 8.18 / 7.00 / 5.46**: the ladder still
rises monotonically from the far field to the near field with no interior peak, exactly as in the A
leg (11.82 / 12.14 / 8.23 / 7.03 / 5.46). d3 does not exceed d4 in either leg.
**One honest deviation, on the d4/d5 pair the brief told me not to "fix".** A inverted it by
**+0.32** (d4 above d5) and the plate inverts it by **+0.48** in the same direction. B reads
**-0.02**, i.e. the inversion is now gone rather than reduced. It was not targeted and no constant
was aimed at it; it is a side effect of the added population being slightly stronger at d5 than at
d4. Ours is now 0.50 flatter than the plate on that step where it was 0.16 flatter. Small, real,
and stated rather than rounded to "monotonicity passes".

## CRUST TEST — the one that makes a one-sided add admissible.
`FLK_AMP` is a ONE-SIDED radiance add, and this file has failed into a "pale grit crust" twice. The
bound is the mean: **d5 region mean 96.1 -> 96.9 (+0.8 codes), d4 90.8 -> 91.5 (+0.7)** while d5
p99/p50 goes 4.63 -> 7.91. A crust lifts the mean and the floor together; a sparkle lifts the top
and leaves the mean alone. The reference's own d5 mean is 114.1, so we did not close the gap by
brightening.

## EYE GATE — PAIRED WITH THE METRIC, PASSED, WITH ONE RESERVATION.
`tools/_cropimg.mjs <img> <out> 1382 1920 950 1080 2 99999`, and the reference row-registered to
its own 1129-px height (`... 1382 1920 993 1129 2 99999`), in `shots/r1/eye-{A,B,REF}.png`.
- **A**: a repeating pebble cell of near-uniform size and near-uniform mid-tone contrast, with no
  isolated bright points anywhere in the unlit half. The wave-O/Q "emboss, not sparkle" read,
  confirmed on sight.
- **B**: isolated pale flecks now sit on the darker blue-grey ground in the unlit half, where A had
  none, and the lit band's glints have separated from each other. **This is the brief's stated pass
  condition — isolated bright specks on a darker ground, not a finer emboss.**
- **RESERVATION, and it is the same thing the skew number says:** our flecks are all BRIGHT and
  fairly uniform in size, which at this crop scale reads faintly like fine snow; the plate's field
  is bright specks AND dark voids riding on real large-scale ripple and a wake line. We now have the
  right concentration of energy in the wrong shape of population.

## NOT ADDRESSED, MEASURED ANYWAY: T4 (960 native vs supersampled). UNCHANGED, STILL FAILING.
| band | A native | A ds | A shortfall | B native | B ds | B shortfall |
|---|---|---|---|---|---|---|
| d4 | 3.49 | 9.70 | -64% | 3.44 | 9.13 | -62% |
| d5 | 4.43 | 10.15 | -56% | 4.30 | 9.87 | -56% |

d5 region mean 960-native vs 1920: A +11.5%, B **+10.5%**. `chipRes`'s falloff law was not touched,
so T4 is neither fixed nor worsened. It remains open and the wave-Q diagnosis of it stands.

---

# BRIEF CORRECTIONS (evidence above, ranked by how much a later round would lose to them)

1. **T1's mechanism was the wrong object.** `:1137` and `:262` (roughness) have under 2 points of
   total authority over the statistic, kill-controlled two ways. The carrier is `chipAmb` /
   `lensC`. FINDING 3.
2. **T1 alone is satisfiable by deleting the feature it is meant to build** (58.5% at `lensC` gain
   zero, past the reference). It must always be quoted with T3 held. FINDING 4.
3. **"Give roughness a sparse low tail... do not widen the symmetric swing" is right in spirit and
   wrong in arithmetic: a sparse tail on an EXISTING unimodal channel cannot do it either.** Every
   pointwise reshaping of the existing carrier lies on a share-vs-amplitude frontier (FINDING 1).
   The population has to be a new, independently sparse one.
4. **`e1c1e82` must not be described as a baseline in any future brief.** It contains at least one
   unmeasured round-13 edit that fails a live target by 41%. The recoverable ground truth was
   `/tmp/road-B.js`'s md5 matching the wave-Q verdict, and that is luck, not process.
5. Wave-Q's own md5 for its B leg is correct and its line numbers are correct; nothing else in that
   verdict failed to reproduce.

# PROCESS

- `bash tools/lint.sh` prints `lint ok` as the last action before commit, and `game/road.js`
  parses on its own (`node --check`).
- **`game/sky.js` went transiently NON-PARSING** (`SyntaxError: Unexpected identifier 'lutAt'` — a
  backtick inside a comment inside a template literal) during my sweep, and it silently voided one
  render: a `shot.mjs` failure with stderr discarded left a STALE PNG in place, which then measured
  bit-identical to the previous parameter set. Caught by exactly that impossibility. **Two renders
  in the sweep were discarded and re-taken; no figure in this verdict comes from that window, and
  the pair of record was rendered after `lint ok` returned.** Method note for the next builder:
  `rm -f` the output and `test -f` it after every render, and never send `shot.mjs`'s stderr to
  `/dev/null`.
- One tool audit for the round: the `_anisonull` null check above. It CLEARS the statistic.

# BIGGEST REMAINING GAP — the sparse population is one-sided and the plate's is symmetric

The residual's SKEW. Ours at d5 is **+1.404** (A leg +0.300), the plate's is **+0.059**; at d4 ours
is **+0.852** and the plate's is **-0.217**. The reference reaches its 50.7% share with a
near-symmetric high-contrast field — bright facets AND dark voids, which is what a rippled water
film over dark aggregate produces — while ours reaches 51.5% with an additive bright-only sparkle,
23x more skewed. This is the same class of gap T1 was: the concentration statistic is now matched
and the SHAPE of the concentrated population is not. It is measurable with the tool already in
`tools/`, it has a clean reference anchor, and a fix has to make the sparse population signed
(darken the voids as much as it brightens the crowns) rather than adding light. The obvious first
arm is to give `flk` a signed twin from the LOWER tails of the same two channels and check whether
skew falls toward 0.06 with the share and the ladder held.
