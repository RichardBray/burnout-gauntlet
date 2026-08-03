# WAVE R BUILDER — boost-fx

Live log. Written BEFORE planning or measuring, per `tools/WAVE-R-ADDENDUM.md` §3. Appended as I go.

## 0. STEP-ZERO ABANDONED-EDIT AUDIT

`git log` state: `e1c1e82` = tree as round 13 left it (baseline, NOT known-good). `fa97680` touched
only `STATE.md` and `tools/WAVE-R-ADDENDUM.md`. So **HEAD's `game/boost.js` blob carries round 13's
abandoned edit**, and the working tree carries a SECOND abandoned edit on top of it — round 14's
(mtime 08:49:09), which is a REVERT of round 13's.

`git diff -- game/boost.js` (HEAD -> worktree) is a pure deletion of 46 lines. Decoded:

| # | edit | who | `file:line` + literal | decision |
|---|---|---|---|---|
| E1 | `float kg = smoothstep(3.0, 12.5, lenPix);` + 30 lines of "SUB-FEATURE GATE" comment | round 13 ADDED, round 14 REMOVED | in HEAD at `boost.js:300`; ABSENT from worktree | see below |
| E2 | `vec3 sharp = ...; vec3 col = mix(sharp, blurred, kg);` replacing `vec3 col = mean + bb * max(pk - mean, vec3(0.0));` | round 13 ADDED, round 14 REMOVED | in HEAD at `boost.js:497-505`; worktree has the plain `:461` form | see below |
| E3 | 8-line "WAVE R: THE ARGUMENT ABOVE IS WRONG ABOUT ITS OWN VARIABLE" comment at `:270`, asserting `uSpeed01` is affine with a 26 m/s dead zone | round 13 ADDED, round 14 REMOVED | comment only, no constant | see below |
| E4 | `tools/_idealblur.mjs` (82 lines, new file) | round 13/14, mtime 08:29:39 | `--len` default `41.2`, `--taps` default `24` | KEEP, validated by ground truth (§2) |
| E5 | `tools/_sparkboost.mjs` (100 lines, new file) | round 13/14, mtime 08:31:56 | signature `isInstancedMesh && renderOrder === 4 && material.blending === 2` | KEEP, validated by reproduction (§2) |

**The decisive fact, and it settles E1/E2/E3 cleanly:** the worktree `game/boost.js` is md5
`982dde37a04031a3fc22410034b9b485`, which is **byte-for-byte the md5 `verdicts/wave-q/boost-fx.md:5`
quotes as the tree it audited** ("= wave-P AFTER"). Round 14's revert restored wave-P AFTER exactly.
So the file on disk is NOT in an unexplained state: it is the exact tree the wave-Q critic measured,
line numbers and all, and every figure in that verdict is re-derivable against it.

**Decisions:**
- **E1 + E2: the REVERT STANDS as my A leg.** Round 13's `kg` gate was unmeasured and unrecorded, so
  by §0.3 it cannot be inherited silently. I am not, however, discarding the idea — the wave-Q
  headline names `:331-345` (the plain mean) as the crash-beat culprit and an output-side length
  gate is the right shape of fix for it. I will re-derive it from scratch, measured, and only then
  claim it. If it does not measure, it stays out and I say so.
- **E3: the COMMENT was reverted but its CLAIM is TRUE, and it is the most important thing in this
  audit.** Rule-5 greped: `boost.js:1370  const spd01 = clamp((Math.abs(speed) - 26) / 66, 0, 1);`.
  That is an AFFINE map with a 26 m/s dead zone, not a speed fraction. Consequences worked out in
  §1 below; they partially REFUTE my own briefed headline gap.
- **E4/E5: keep.** These are measurement instruments, not shipping behaviour, and both were written
  to re-create throwaway `/tmp` harnesses that wave-Q's own targets depend on. Neither can change a
  rendered pixel. But "cannot regress the render" is not "correct", so each is validated below
  before any number of mine leans on it.

Peer files at audit time (mtime): `audio.js` 08:36:32, `crash.js` 08:36:57, `road.js` 08:49:11,
`sky.js` 08:47:21. `road.js` is dirty vs HEAD (+42/-3) and `sky.js`/`audio.js`/`crash.js` are not.
Concurrent owners: sky-lighting, road-surface, audio. `crash.js` is under separate forensic
investigation this round and I do not touch it.

**Intent, one line:** hold T1 inside [0.25,0.70], attack T2 (P1a maxSmear 1.6 vs ref 79.0) via the
`lenPix` GAIN rather than the speed curve, and protect the crash beat with an output-side length
gate — with an ideal-blur control every round, because T2 may be unreachable by construction.

## 1. DETERMINISM FOR `boost-blur` — MEASURED. THE `+/-6%` CLAIM IS DEAD. (resolves standing item 4.1)

`tools/STANDING-CONSTRAINTS.md` §4 item 1 says `boost-blur` was not among the four presets measured
after the SSAO seed fix, so its preserved "+/-6% run-to-run variance, render twice" was unreconciled.
Two independent boots, tree frozen (`node tools/_heromask.mjs --scene boost-blur` x2 ->
`shots/r/det1*`, `shots/r/det2*`):

| | P1a maxSmear | P1a hpRms | P1b maxSmear | P1b hpRms | P1 maxSmear | P1 hpRms |
|---|---|---|---|---|---|---|
| det1-fx | 1.6 | 0.39 | 77.2 | 7.18 | 77.8 | 2.15 |
| det2-fx | 1.6 | 0.39 | 77.2 | 7.18 | 77.8 | 2.15 |
| det1-nofx | 2.3 | 0.99 | 2.9 | 1.60 | 2.7 | 1.15 |
| det2-nofx | 2.3 | 0.99 | 2.9 | 1.60 | 2.7 | 1.15 |

**`boost-blur` determinism = 0.00 on every `_smearmeas` metric, in every patch, fx and nofx.** It
joins the other four presets. The PNGs are NOT byte-identical (md5 differs), which is the same
GPU-rasterisation-tie-break residual §1h already documents and explicitly declines to call
byte-stability. Additionally the four `_sparkboost` crash-cam frames reproduced to the digit across
two boots per leg (§4). **Retire the "+/-6%, render twice" line.** I kept paired A/B anyway, because
the hazard it protects against here turned out to be real and to be `road.js` (§5).

Baseline A reproduces `verdicts/wave-q/boost-fx.md` exactly: P1a 1.6 / 0.39, P1b 77.2 / 7.18,
P1 77.8 / 2.15, nofx 2.3 / 0.99. Tree md5 `982dde37a04031a3fc22410034b9b485`.

## 2. TOOL VALIDATION of the two inherited tools (E4, E5)

**`tools/_idealblur.mjs` — VALIDATED, KEEP.** Read line by line: uniform-weight, inward-only,
bilinear, constant length, convex. It cannot add HF anywhere, so its hpRms is a genuine floor.
Independent check against a figure it was never fitted to: `verdicts/wave-q/boost-fx.md:262` states
"a 78 px control gives 0.25" for the T1 floor. Built from `det1-nofx.png` at `--len 78 --taps 40`
it gives P1a hpRms 0.23 against nofx 0.99 = **ratio 0.232**. Reproduces wave-Q's independently
derived floor to 0.02. Second check: at `--len 41.2` P1 hpRms is 0.41, and wave-Q's throwaway
`/tmp` control reported "P1 hpRms 0.41, ratio 0.36" for an ideal radial blur of the same frame.
**Exact.** The tool re-creates the lost harness correctly.

**`tools/_sparkboost.mjs` — VALIDATED, KEEP.** It asserts the spark mesh signature and refuses to
run on a mismatch, which is the right failure mode. Reproduction check: it returns
`uAmount 0.27087161491258294`, `uSpeed01 0`, `shutter01 0.213`, `sparkCount 150` — `uAmount` matches
`verdicts/wave-q/boost-fx.md:182` to all 17 digits — and its patch-S spark-attributable blob counts
land at 46/73 against wave-Q's 45/68 on a `road.js` that has since moved. It re-creates
`/tmp/crashmeas-o.mjs` faithfully.

## 3. THE HEADLINE GAP IS HALF FALSE AND I AM RETRACTING BOTH HALVES OF IT

### 3a. `:270`'s `0.30` IS the physically correct constant. Rule 5 on the PRODUCER, not the line.

Greped, not trusted:

    game/boost.js:1425   const spd01 = clamp((Math.abs(speed) - 26) / 66, 0, 1);

`uSpeed01` is an AFFINE map with a **26 m/s dead zone**, not a speed fraction, so `uSpeed01 = 0`
means "at or below 26 m/s", NOT "stopped". Inverting: `speed = 26 + 66*s`. A smear genuinely linear
in speed, normalised to 1.0 at `s = 1` (92 m/s), is

    (26 + 66*s) / 92  =  0.2826 + 0.7174*s      against the shipped  0.30 + 0.70*s

**Within 6% at `s = 0` and exact at `s = 1`.** The shipped `0.30` is the exact affine reconstruction
of the dead zone, arrived at by accident. My brief's third bullet ("the wave-P builder wrote the
argument against its own constant at `:258-269`... it then shipped 30% instead of 0") is therefore
inverted: the wave-P builder shipped the RIGHT number and wrote a WRONG justification for it, and
both wave-P and my own wave-R brief then read the wrong justification as the defect.

Arithmetic bound on what the speed factor could ever buy: substituting the exact `0.2826 + 0.7174*s`
moves the crash beat from 5.85 px to **5.51 px**, 6%. Even the maximally aggressive reading — pretend
`uSpeed01` is a speed fraction and use bare `uSpeed01` — takes the crash beat to 0 while taking
boost-blur 41.0 -> **27.7 px**, i.e. it pays for the crash beat with a third of the scene the pass
exists for. **`:270` is not a lever at either end. I changed no constant on that line.**
This half of the finding is round 13's, recovered from its reverted comment (E3) and re-derived.

### 3b. T2 IS UNREACHABLE, ITS TWO CLAUSES CONTRADICT EACH OTHER, AND ITS REFERENCE ANCHOR IS A DIFFERENT OBJECT

T2 asks for P1a `maxSmear` in **[20, 60] px** AND within **[0.5x, 1.5x] of the ideal-blur control at
the pass's own `lenPix`**. Both clauses measured on this round's own frames:

| P1a of `det1-nofx.png`, ideal radial box blur | `maxSmear` | `hpRms` | T1 ratio vs nofx 0.99 |
|---|---|---|---|
| `--len 41.2 --taps 24` (the pass's own kernel, `_boostkernel` `tarmac-nearL`) | **5.4** | 0.26 | **0.263** |
| `--len 78 --taps 40` | **4.4** | 0.23 | 0.232 |
| `--len 160 --taps 64` | **6.5** | 0.28 | 0.283 |

Three consequences, each independently fatal to T2:

1. **The two clauses have an EMPTY INTERSECTION.** Clause 2 at our own `lenPix` is
   `[0.5, 1.5] x 5.4 = [2.7, 8.1]`. Clause 1 is `[20, 60]`. Nothing satisfies both. T2 cannot be
   passed by any build.
2. **P1a `maxSmear` is NON-MONOTONE in kernel length**: 41.2 -> 78 -> 160 px gives 5.4 -> 4.4 -> 6.5.
   A perfect blur, quadrupling its length, moves the statistic by 2 px in the wrong direction first.
   The estimator carries no length information in this patch at all. (Fourth control, same class as
   metric 17's: at `sips -Z 960` our own fx frame reads P1a `maxSmear` 9.2, `norm@1920w` **18.4**,
   against **1.6** on the identical pixels at 1920 — an 11x scale disagreement.)
3. **The 79.0 anchor is a WRONG-OBJECT ANCHOR.** Cropped and looked at, per §0 of the standing
   constraints, which is non-negotiable and which is what settled it:
   - `node tools/_cropimg.mjs /tmp/ref02-1920.png shots/r/crop-ref-P1a.png 538 720 864 1032 4 100000`
     -> **two continuous saturated yellow lane bands** crossing the patch end to end, plus fine
     tarmac striations between them.
   - `node tools/_cropimg.mjs shots/r/det1-nofx.png shots/r/crop-ours-P1a-nofx.png 538 720 778 929 4 100000`
     -> **bare dusk tarmac. No lane paint of any kind. No grain.** Total content is a soft diagonal
     shading boundary.
   P1a was chosen (correctly) as spark-free on OUR side. Nobody checked it on the REFERENCE side,
   and metric 17's own caveat (b) requires the sub-patch to be free of isolated bright objects. Two
   full-length lane lines are isolated bright objects. **So `1.6 vs 79.0` is a lane-paint-PRESENCE
   difference, not a kernel-length difference**, and it is the same failure mode as metric 17 itself:
   `maxSmear` reports the length of the longest coherent bright object in the patch. Our own frame
   proves the mechanism from the other side — in `P2roadL`, which DOES contain our yellow double
   line, `maxSmear` reads **9.8 px on the zero-blur nofx frame**, 6x the P1a fx reading, with no
   blur applied at all.

**RETIRED, and it is an ANCHOR retirement, the dangerous kind: T2's `ref-02 P1a maxSmear = 79.0`,
and the T2 band [20,60] with it.** Not retargeted — deleted. There is no valid form of "P1a
maxSmear" that measures our kernel. The subject-matched replacement, if a later wave wants one, is
`P2roadL` (our yellow double line vs the reference's), where the estimator does respond to blur:
nofx 9.8 -> fx 43.9 on identical content, ideal-41 control available.

This is the outcome §2c's "BOUND ON WHAT BOOST CAN FIX" predicted from the other direction:
there is no grain and no paint in P1a to smear, and a filter cannot add either.

### 3c. AND LENGTHENING THE KERNEL IS AFFIRMATIVELY WRONG, by T1's own floor

The ideal-blur table above is also the kill-control (§1e) on the obvious fix. An ideal **78 px**
radial blur of our own nofx frame scores T1 = **0.232**, which is BELOW T1's own `[0.25, 0.70]`
sink floor. So doubling the kernel makes the pass an energy sink *by the headline target's own
definition*, while moving P1a `maxSmear` 5.4 -> 4.4, i.e. nowhere. **Two independent reasons not to
touch the 72.0 gain. I did not touch it.**

## 4. WHAT I DID CHANGE — one gate, output-side, at the crash beat

BEFORE/AFTER literals, `git diff`-checkable. **No existing constant changed value.**

| `file:line` | BEFORE | AFTER |
|---|---|---|
| `game/boost.js:286` | `float lenPix = uAmount * (0.30 + 0.70 * uSpeed01) * 72.0 * falloff * mask * velo;` | **UNCHANGED, byte for byte** (see §3a) |
| `game/boost.js:328` | *(no such line)* | `float kg = smoothstep(3.0, 12.5, lenPix);` — NEW |
| `game/boost.js:518` | `float bb = smoothstep(9.0, 34.0, lenPix) * (0.45 + 0.55 * uSpeed01);` | **UNCHANGED** |
| `game/boost.js:519-529` | `vec3 col = mean + bb * max(pk - mean, vec3(0.0));` | `vec3 blurred = mean + bb * max(pk - mean, vec3(0.0));` then `vec2 co0 = caOff * 0.45; vec3 sharp = vec3(texture2D(tDiffuse, uv0 + co0).r, texture2D(tDiffuse, uv0 - co0 * 0.5).g, texture2D(tDiffuse, uv0 - co0 * 0.5).b); vec3 col = mix(sharp, blurred, kg);` |
| `game/boost.js:258-285` | 12-line comment arguing the `0.30` is a range violation | replaced with the §3a derivation showing it is correct. **The constant it describes is unchanged and that is stated in the comment.** |

Mechanism: rule 4 in the spatial domain. A trailing mean of length `L` over a feature of width `w`
attenuates the feature to ~`w/L` while producing a streak only `L` long, so there is a band of `L`
in which this pass is all cost and no smear. Both knees are SET, not chosen: lower `3.0` px = 2x the
spark sliver's width (`widPx p50 1.426`, §2j); upper `12.5` px = the sliver's own length
(`lenPx p50 12.52`). At the crash beat `lenPix = 0.27087 * 0.30 * 72 = 5.85` px, so `kg = 0.216`.
It gates the OUTPUT, not `lenPix`: shortening the kernel would keep the attenuation and merely
shrink the streak, which is the wrong half of the trade. `sharp` is the `t = 0` tap of the mean loop
(barrel distortion, heat haze and chromatic split still applied, only the SMEAR removed), so `kg`
does not silently become a gate on three unrelated effects.

**Provenance, stated plainly: this is round 13's abandoned E1/E2 edit, re-derived and now measured.**
I did not inherit it — the A leg is the reverted tree — but the design is round 13's and the claim
belongs to it. What was missing was any measurement; that is below.

## 5. PAIRED A/B, INTERLEAVED A,B,A,B, TWO PAIRS, PEER md5 HELD WITHIN EACH PAIR

A leg reconstructed byte-exactly from the HEAD blob minus round 13's 46 lines:
md5 **`982dde37a04031a3fc22410034b9b485`** = the tree `verdicts/wave-q/boost-fx.md:5` audited.
B leg md5 `6ba0188a65464eda1296d2f6f425f73a`, mtime **2026-08-03 11:28:12**, `lint ok`.
**`road.js` moved three times during my round** (`bc69cf` -> `ab4285` -> `309b1b` -> `81c0ef`), which
is exactly why the interleave was necessary; `sky.js`, `crash.js`, `audio.js` held throughout.
`crash.js` `d6d191185771c0cca2f55eed39504549` untouched by me, as required.

### T1 (HEADLINE) — `hpRms(fx)/hpRms(nofx)` in P1a. BAND [0.25, 0.70]. **PASS, and a deliberate null.**

`road.js` `bc69cf` (pair 1) and `ab4285` (pair 2), fx and nofx both re-rendered per leg:

| | A1 | B1 | A2 | B2 |
|---|---|---|---|---|
| P1a fx hpRms | 0.39 | 0.39 | 0.39 | 0.39 |
| P1a nofx hpRms | 0.99 | 0.99 | 0.99 | 0.99 |
| **T1 ratio** | **0.394** | **0.394** | **0.394** | **0.394** |
| P1a maxSmear (T2 diag) | 1.6 | 1.6 | 1.6 | 1.6 |
| P1b maxSmear / hpRms (diag) | 77.2 / 7.18 | 77.2 / 7.18 | 77.2 / 7.18 | 77.2 / 7.18 |
| P1 maxSmear / hpRms (diag) | 77.8 / 2.15 | 77.8 / 2.15 | 77.8 / 2.15 | 77.8 / 2.15 |
| P2roadL maxSmear / hpRms | 43.9 / 0.55 | 43.9 / 0.55 | 43.9 / 0.55 | 43.9 / 0.55 |
| P6sky maxSmear / hpRms | 1.9 / 0.49 | 1.9 / 0.49 | 1.9 / 0.49 | 1.9 / 0.49 |

**T1 = 0.394, inside [0.25, 0.70], unchanged by my edit to the printed digit in every patch.**
That is the intended and predicted result: at boost-blur the road runs `lenPix 38.9-41.2 px`, so
`kg = smoothstep(3.0, 12.5, lenPix)` is exactly 1.0 there and `mix(sharp, blurred, 1.0) == blurred`
is an algebraic identity. **Floor control, rendered this round from this round's own nofx frame:**
ideal radial box blur at the pass's own 41.2 px scores P1a **0.263**. So we sit 0.13 above the floor
and 0.31 below the ceiling — the pass is filtering, and there is only 0.13 of headroom before it
becomes a sink, which is the second reason §3c gives for not lengthening the kernel.

P1 and P1b are diagnostics only, per T1's own instruction: P1b (the single spark, 4% of P1) carries
`hpRms 7.18` against P1a's 0.39, so 100% of the "P1 hpRms 2.15" headline the wave-N/P rounds chased
is still one object. That retraction stands and I am not reopening it.

**A `road.js` caveat, reported rather than hidden.** A confirming render taken AFTER my final save,
on `road.js` `81c0ef` (a fourth state), reads P1a **fx 0.39 unchanged** but **nofx 1.08** (P1 nofx
1.15 -> 1.36), giving T1 = **0.361**. Our numerator did not move; road-surface lowered the
denominator. Still in band. Quoted so the next critic is not surprised by a 0.394/0.361 discrepancy
between reports: **T1's denominator is `road.js`-owned and T1 is not cross-round-quotable across a
road edit.** Both of my A/B pairs held their peers, so the A/B conclusion is unaffected.

### T4 (gate) — `P = hpRms(960)/hpRms(1920)` in P1, band [1.0, 1.5]. **HELD.**

`sips -Z 960` on the fx frames: A1 2.72/2.15 = **1.265**, B1 2.71/2.15 = **1.260**. Both in band,
and 1.260 is wave-Q's own figure to three decimals.

### T3 (CROSS-PIECE, boost -> crash) — REAL RECOVERY, ~2x on the tail, NOT a pass of the >=90% bar

`node tools/_sparkboost.mjs --tag {A1,B1,A2,B2}` — beauty frames, spark-attributable = visible minus
hidden, `uAmount 0.27087161491258294`, `uSpeed01 0`, `shutter01 0.213`, `sparkCount 150`,
`--scene crash-cam`, `simTime 0.9`. `road.js` `309b1b` and `crash.js` `d6d191` held across all four
legs. A1 == A2 and B1 == B2 to the digit on every column, in both patches — a second, independent
determinism confirmation, this time on `crash-cam`.

`_debrismeas --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.30,0.75,0.42,0.72:S
--patch 0.677,0.807,0.389,0.519:A`. `dropPct` printed as required and is 0.9-5.5% in patch A/S-BL
and 12.8-12.9% at `uAmount 0` — all far under the 50% sieve threshold.

| patch S, spark-attributable | A (before) | B (after) | retention target >= 90% |
|---|---|---|---|
| `_debrismeas` blob count, BL | 136 - 90 = **46** | 220 - 164 = **56** | |
| `_debrismeas` blob count, B0 | 431 - 358 = **73** | 430 - 359 = **71** | |
| **retention** | **63%** | **79%** | MISS |
| `_sparkdiff` diff-image p90, BL / B0 | 19.96 / 52.85 = 37.8% | 23.88 / 52.85 = **45.2%** | MISS |
| `_sparkdiff` diff-image p99, BL / B0 | 50.45 / 109.75 = 46.0% | 71.57 / 109.75 = **65.2%** | MISS |
| `_sparkdiff` diff-image max, BL / B0 | 92.4 / 154.44 = 59.8% | 118.54 / 154.44 = **76.8%** | MISS |
| `_sparkdiff` pctGE40, BL / B0 | 0.038 / 0.119 = 32% | 0.086 / 0.119 = **72%** | MISS |
| patch-A `meanContrast` delta, BL / B0 | +4.2 / +7.7 = 55% | +4.7 / +7.7 = 61% | MISS (retired metric, §2j) |

`_sparkdiff` is the metric §2j ENDORSED as `meanContrast`'s replacement (diff image, no threshold,
no mask, no components), so the p99 46% -> 65% and pctGE40 32% -> 72% rows are the headline and the
`meanContrast` row is quoted only because T3 asks for it. **The fusion the gate was aimed at is
measurably reduced:** patch-S `areaMed` 14 -> 9, `majMed` 6.2 -> 4.8, and the raw blob count on the
sparks-visible frame goes 136 -> 220 because slivers previously bridged into one component now
resolve separately.

**T3 is a MISS on all five columns and I am scoring it as one.** 79% is not 90%. The remaining 21%
is not reachable from `boost.js`: at `kg = 0.216` the residual smear is 22% of a 5.85 px kernel, and
driving `kg` to 0 at the crash beat means raising the lower knee above the sliver width, which
deletes the pass's legitimate short-kernel behaviour everywhere else in every scene. The rest is
`crash.js`'s emitter, which is under separate investigation and which I did not touch.

### THE EYE, paired with the metric as §3 of the standing constraints requires

`node tools/_cropimg.mjs shots/r/sb-{A1,B1}-BL-sparks.png ... 700 1180 500 800 2 100000`.
**A:** sparks read as dim brown smudges; most of the population has washed into the dust haze and
the ones that survive have no legible ends. **B:** the same population reads as discrete, bright
orange slivers with individually legible streaks, and a whole outer ring of sparks that A had
erased is back. The improvement is unambiguous by eye and it agrees in sign and rough magnitude
with the p99 and pctGE40 columns. This is not a broken-metric case.

The boost-blur crop is a deliberate null and looks like one: `node tools/_sparkdiff.mjs
shots/r/hm-B1-fx.png shots/r/hm-A1-fx.png 0,1,0,1` reports 124152 changed pixels frame-wide,
max delta 109.7, but only **0.112%** of the frame over delta 20 — and in P6sky the max delta is
1.07 luma. The change lands where `lenPix` is small AND there is an edge: the horizon (1.6 px), the
sky (2.0), the viaduct (7.8-8.6). `reference/boost-blur-02`'s INDEX line asks for exactly that —
the kernel "scales with radial distance from the vanishing point ... at center it is nearly zero" —
so the direction is reference-aligned, though I claim no measured win for it.

## 6. RETIREMENTS AND CORRECTIONS THIS ROUND

1. **RETIRED — T2 in both clauses, and its `ref-02 P1a maxSmear = 79.0` ANCHOR.** Empty intersection
   between its two clauses; non-monotone in kernel length (5.4/4.4/6.5 at 41/78/160 px on a perfect
   blur); 11x scale disagreement at 960; and crop-verified to be comparing our bare tarmac against
   the reference's two yellow lane lines. Fourth retired reference anchor. **No replacement band is
   issued.** If a later wave wants one, use `P2roadL` (subject-matched: our yellow double line vs
   theirs), where the estimator does respond — nofx 9.8 -> fx 43.9 on identical content.
2. **CORRECTED — `boost.js:270`'s `0.30` is NOT a range violation.** It is the exact affine
   reconstruction of `:1425`'s 26 m/s dead zone (`(26+66s)/92 = 0.2826 + 0.7174s`), within 6%. My own
   brief's headline, its third bullet, and the wave-P comment that used to stand at `:258-269` are
   all wrong about this constant, in the same direction, for three rounds running. The tree comment
   is now fixed in place and the constant is unchanged.
3. **RETIRED — the "`boost-blur` has +/-6% run-to-run variance, render twice" line**
   (`STANDING-CONSTRAINTS.md` §2c last bullet, §4 item 1). Measured 0.00 on every `_smearmeas` metric
   in five patches over two boots, plus 0.00 on every `_debrismeas` and `_sparkdiff` column over two
   boots of `crash-cam`. **§4 item 1 is RESOLVED.**
4. **NEW CAVEAT — T1's denominator is `road.js`-owned.** P1a nofx `hpRms` moved 0.99 -> 1.08 (T1
   0.394 -> 0.361) under a peer `road.js` edit with our fx frame bit-stable at 0.39. T1 is a valid
   within-window A/B and is NOT cross-round-quotable across a road edit. State the `road.js` md5
   beside any T1 figure.
5. **KEPT AND VALIDATED, not inherited silently — `tools/_idealblur.mjs` and
   `tools/_sparkboost.mjs`** (§2). `_idealblur` reproduces two of wave-Q's independently derived
   control figures (0.232 vs "0.25"; P1 0.41 exactly). `_sparkboost` reproduces `uAmount` to 17
   digits and wave-Q's patch-S counts to within a `road.js` move.
6. **CLAIMED FOR ROUND 13, NOT FOR ME — the `kg` length gate design and the `:1425` affine finding.**
   Both were in round 13's reverted edit. Neither had a measurement. Both now do.

## 7. WHAT I DID NOT DO / FOR THE NEXT ROUND

- **I did not lengthen the kernel and the next round should not either without new evidence.** Two
  independent kill-controls say no: an ideal 78 px blur scores T1 = 0.232, below the band floor, and
  moves P1a `maxSmear` 5.4 -> 4.4. `72.0` at `:286` untouched.
- **T3 is the live gap and it is now `crash.js`-side.** Boost went 63% -> 79% blob retention and
  46% -> 65% diff-image p99. The residual is a 22%-strength smear on a 5.85 px kernel over a 1.4 px
  sliver, and removing it requires raising the lower knee above the sliver's own width, which would
  disable the gate's legitimate behaviour in every scene. Hand the rest to `crash.js`.
- **The real remaining boost-blur gap is upstream, exactly as §2c said.** Our P1a contains no lane
  paint and no grain; the reference's contains two lane lines and a mat of striations. Relative HF:
  ref-02 post-blur 5.95%, ours pre-blur 2.46%, post-blur 1.03% (~1.3 LSB, at the 8-bit floor). This
  is `road.js`'s, and the crop pair `shots/r/crop-ref-P1a.png` / `shots/r/crop-ours-P1a-nofx.png` is
  the single clearest statement of it in the project. Hand it to road-surface.
- **Unmeasured:** whether sharpening the horizon/viaduct band (the 0.112% of the frame my gate
  actually moves at boost-blur) is an improvement. It is reference-aligned by INDEX's own words but
  I claim no number for it. A `_bandmeas`/eye pass on the viaduct is one render.
