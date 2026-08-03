# WAVE Q CRITIC — boost-fx

VERDICT: real wins

Tree as audited: `game/boost.js` md5 `982dde37a04031a3fc22410034b9b485` (= wave-P AFTER).
`./tools/lint.sh` = `lint ok` before and after every render, and as the last action.
Two temporary probe edits were made and reverted; `diff` against the pre-probe copy is empty and
the md5 above is the md5 on disk now.

## THE CROP DECIDED IT, BEFORE ANY NUMBER

Frame: `shots/q/qb-B-fx.png`, scene `boost-blur` (dusk), chase cam, `uAmount 1.0`,
`uSpeed01 0.385`, full beauty frame from `tools/_heromask.mjs` (fx and nofx in one boot).
Reference: `reference/boost-blur-02.jpg` at `sips -Z 1920` (1728x1080 -> 1920x1200).

**Camera situation is matched on framing (chase cam behind the hero under heavy boost) but NOT on
light**: INDEX calls -02 "industrial waterfront, daylight"; our `boost-blur` scene is
`timeOfDay: 'dusk'`. Patch mean luma ours 40.3 against the reference's 98.2. Stated here because
several numbers below are affected and I have kept them as ratios where possible.

Crops, `node tools/_cropimg.mjs <f> <out> 538 768 778 994 2 50` (ours) and
`... 538 768 864 1104 2 50` (reference, same patch fractions on the taller frame):

- **Ours**: a near-black wash. Total luma range across the whole 230x216 px crop is ~18 code
  values. One thin orange streak in the bottom-right corner. That is the entire content.
- **Reference**: two smeared yellow lane bands crossing the crop end to end, and — the thing that
  actually decides it — a dense mat of fine longitudinal tarmac striations *inside* the smear. The
  reference's blur **carries grain**. Ours carries one spark.

The wave-P builder's headline claim is confirmed by eye: **the countable cream picket fence is
gone**, there are no teeth and no herringbone anywhere in the crop. The comb was real and the
retraction of the wave-N "win" is correct. But what replaced it is a wash, not a smear.

## RULE 5 — CLEAN

Every literal in the wave-P table re-greped against the tree, including the line numbers:

| claim | tree |
|---|---|
| `PK_BANDS`, `pj`, `dsub` DELETED | `grep -n 'pj\b\|PK_BANDS\|dsub'` -> comment lines 355/356/365/479/500 only, no code |
| `PK_REACH = 2.2` :416 | `:416 const float PK_REACH = 2.2;` |
| `PK_BIAS = 3.0` :417 | `:417` exact |
| `PK_LCAP = 0.60` :418 | `:418` exact |
| `NP = 24` :419 | `:419 const int NP = 24;` |
| `w = (1.0 - 0.45*t) * (1.0 + PK_BIAS*min(pl,PK_LCAP))` :432 | `:432` exact |
| `vec3 pk = pacc / max(pwsum, 1e-4);` :436 | `:436` exact |
| `lenPix = uAmount * (0.30 + 0.70*uSpeed01) * 72.0 * falloff * mask * velo` :270 | `:270` exact |
| `bb = smoothstep(9.0, 34.0, lenPix) * (0.45+0.55*uSpeed01)` :460 | `:460` exact |
| speed-line loop `for (int i = 0; i < 16; i++)` :505 | `:505` exact |
| `vec3 smear = sacc / max(senv, 1e-4);` :517 | `:517` exact |
| UNCHANGED `PK_KNEE 1.00` :111 / `PK_CEIL 1.60` :112 / `N = 20` :331 / `sLen = 260.0 * ...` :477 | all exact |

Numbers reproduce on the current tree too, which is a stronger check than the hash: builder
reported fx hpRms 2.06/2.34, maxSmear 77.3/78.0, aniso 40.4/39.3, radSmear 5.5, P 1.25/1.28.
I measure **2.15 / 77.8 / 39.95 / 5.5 / 1.260**. Reference figures reproduce exactly
(62.4 / 33.71 / 2.3 / 5.26).

**Edits no verdict explains — one, and it is not boost's.** `game/sky.js` is `69f00e3c...` today;
boost recorded `c8c50d75...` stable through both of its rounds, so the shipped sky is not the sky
boost measured against. `verdicts/wave-p/sky-lighting.md` **never quotes an md5 for `sky.js`
itself** (only a peer digest that excludes it), so sky's own file is not rule-5 auditable and the
change cannot be tied to a verdict by hash. Boost is unaffected in practice — every one of its
figures reproduced on the newer sky — but sky must quote its own file hash next wave.
`camera.js`, `main.js`, `physics.js`, `scenes.js`, `util.js` carry no wave-P hash either; all
five are plausibly untouched, but nobody has asserted it.

## TOOL AUDIT (the budgeted one) — `_smearmeas`: `maxSmear` and `aniso` FAIL GROUND TRUTH

Paired control: force the thing the metric claims to measure to a KNOWN value and check the
metric follows. Instrument `/tmp/qblur.mjs` (throwaway): 48-tap trailing box mean of a known
length along a known direction, applied to **our own `qb-B-nofx.png`**, so content is held fixed
and only the kernel moves.

| input | truth | `maxSmear` reported (patch P1) |
|---|---|---|
| nofx blurred 78 px @115 deg | **78** | **34.9** (45% of truth) |
| nofx blurred 40 px @115 deg | **40** | **11.4** (29% of truth) |
| nofx, ideal RADIAL 78 px about the exact declared focus `0.504,0.508` | 78 | 16.1 |
| boost fx (real kernel: `_boostkernel` says lenPix caps at **41.2 px**) | 41 | **77.8** |

The estimator under-reports a known 78 px kernel by 55%, is not even proportional
(78/40 = 1.95 in, 34.9/11.4 = 3.06 out), and reports 77.8 for a pass whose own debug buffer says
41.2. Second control, mechanism-only: with the sampling jitter frozen (`float j = 0.5;`, probe
reverted) — a change that cannot lengthen a kernel — `maxSmear` moved **77.8 -> 54.9**, a 29%
swing on the headline number.

`aniso` is not a second confirmation. The tool prints `anisoFree = maxSmear/minSmear`, and
`minSmear` sat in **1.3-2.9 px in all eight images measured**, ours and reference alike. So
`aniso` is `maxSmear` divided by a floor: 77.8/1.9 = 40.9 vs reported 39.95; 62.4/1.9 = 32.8 vs
reported 33.71. **maxSmear 78 and aniso 40 are one number quoted twice.**

**And the headline patch is 96% empty and 4% spark.** Split `P1 = 0.28,0.40,0.72,0.92`:

| sub-patch | ours fx | ours nofx | ref-02 |
|---|---|---|---|
| `P1a = 0.28,0.375,0.72,0.86` (spark-free, ~90% of P1) | maxSmear **1.6** px, hpRms **0.39** | 2.3, 0.99 | maxSmear **79.0**, hpRms **5.84** |
| `P1b = 0.36,0.40,0.88,0.92` (the one spark) | maxSmear **77.2**, hpRms **7.18** | 2.9, 1.60 | — |
| `P1` (full) | 77.8, 2.15 | 2.7, 1.15 | 62.4, 5.26 |

The entire "maxSmear 78 / aniso 40 / hpRms 2.15" headline is **one spark occupying 4% of the
patch**. The reference's smear is field-wide: its spark-free sub-patch scores *higher* (79.0)
than the full patch. Ours scores 1.6.

**RETIRED (metric 17): `_smearmeas` `maxSmear` and `aniso` as ABSOLUTE, cross-image quantities.**
Keep `maxSmear` only as (a) a within-image A/B on identical content, (b) in a sub-patch verified
free of isolated bright objects, and (c) alongside an ideal-blur control built from that round's
own nofx frame, which is the calibration ceiling. Never quote `aniso` beside `maxSmear` as
independent evidence.

## RULING 1 — "hpRms ratio <= 1.2 is unreachable by construction; state it ABSOLUTELY": REJECTED, both halves

**(a) "Unreachable by construction because the input is 1.1" is FALSE, disproved by paired
control.** An ideal 78 px radial blur about the *exact declared focus*, applied to the *same*
nofx frame with the *same* 1.15 input, scores **P1 hpRms 0.41, ratio 0.36**. A ratio far below
1.2 is not merely reachable — it is what a correct blur of that exact input produces. The premise
"any legitimate up-ray content must raise HF above 1.1" is wrong: a convex average of taps
spreads the content it drags in, so it lowers patch HF, it does not raise it.

The residual 1.87-2.17 is not a floor either. It is the single spark: strip the spark corner and
the ratio in the remaining 90% of the patch is **0.39/0.99 = 0.39**, already passing the target
the builder called unreachable. The builder read a one-object artefact as a structural bound.

**(b) "Restate it absolutely: fx hpRms must not exceed ref-02's 5.26" is REJECTED as one-sided** —
exactly the trap the shared brief names. We sit at 2.15, **59% BELOW** the reference, and the
pass is a **sink in every patch that has any content in it**:

| patch | nofx hpRms | fx hpRms | change |
|---|---|---|---|
| P3edgeR `0.78,0.98,0.30,0.50` | 6.48 | 3.94 | **-39%** |
| P4rail `0.02,0.22,0.33,0.50` | 7.03 | 5.60 | -20% |
| P2roadL `0.02,0.25,0.70,0.85` | 1.57 | 0.55 | **-65%** |
| P5roadR `0.62,0.86,0.75,0.95` | 1.39 | 0.38 | **-73%** |
| P6sky `0.35,0.65,0.10,0.30` | 0.66 | 0.58 | -12% |
| P1 (the headline patch) | 1.15 | 2.15 | +87% |

**P1 is the only one of six patches where the ratio exceeds 1, and it is the patch with the least
input content.** An upper bound of 5.26 scores all five sinks as clean passes. The wave-N energy
sink that the max() was invented to fix has come back through the other door; the headline metric
cannot see it because it is measured in the one place there is nothing to sink.

Correct form, and my T1 below: a **BAND on the ratio, measured in the spark-free sub-patch**, with
an ideal-blur control rendered every round as the band's floor.

## RULING 2 — "`radSmear >= 12` RETIRED": CONCLUSION UPHELD, REASONING REPLACED, EVIDENCE REJECTED

**Upheld, with a stronger proof than the builder's.** A ground-truth ideal radial blur about the
exact declared focus scores `radSmear` **5.8** in that patch. The target of 12 is unreachable by a
*perfect* radial blur, never mind ours (5.5). Retired.

**Reasoning replaced.** It is *not* "a focus of expansion ref-02 does not share" on our side.
`0.504,0.508` is our own `uFocus` to four decimals (probed: `[0.50398, 0.50846]`). The actual
defect is that **the patch subtends 38 degrees of radial angle** — 114.2 deg at its near corner,
151.9 deg at its far corner — while `radSmear`'s angular acceptance is about +/-10 deg. Swept
profile, our fx frame, `--foc` chosen to aim the radial axis at each angle in turn:

| aim (deg) | 50 | 90 | 100 | **110** | **120** | 130 | 140 | 160 |
|---|---|---|---|---|---|---|---|---|
| radSmear | 2.4 | 5.2 | 8.2 | **17.6** | **22.4** | 6.5 | 4.3 | 2.5 |

`radSmear >= 12` is met over a ~15-degree window and collapses to 2 outside it. It is an
angle-agreement test with a cliff, not a length. The builder's claim **is** correct for the
reference end: crop-verified, ref-02's focus of expansion is off to the left and its lane bands in
that patch run at ~5 deg, near-perpendicular to our radial 133 deg, so its 2.3 is a foreign-focus
reading. Both ends are invalid, for two different reasons, and only one of them is the one the
builder gave.

**Supporting evidence REJECTED.** "maxSmear 78 px and aniso 39-40 both now EXCEED ref-02
(62.4/33.7), so the directional smear exists" does not survive the tool audit above: the estimator
fails ground truth, swings 29% on a jitter-only change, `aniso` is `maxSmear` restated, and the 78
is one spark. On the spark-free 90% of the same patch we measure **1.6 px against the reference's
79.0**. The smear does exist — on isolated emissive objects. It does not exist on the road.

`radSmear` is not broken everywhere: in `P2roadL` the ideal control reaches 27.2 and we reach
17.1. That is where it should be used.

## CROSS-PIECE — RE-DERIVED. NOT the briefed target, and boost is NOT clear.

The wave-O "density 4.6 -> 10.1 / areaMed <= 15" family stays **VOID** and is not re-issued. I
re-derived boost's side from scratch on the current tree.

Method: `node /tmp/crashmeas-o.mjs --tag q1` — one boot, four **full beauty frames** (spark-
isolated by DIFFERENCE, never by absolute): boost LIVE / `uAmount 0`, each x sparks-visible /
sparks-hidden. Live `uAmount = 0.27087161491258294`, `uSpeed01 = 0` (both re-probed). Scene
`crash-cam`, `simTime 0.9`, orbit camera, severity 1.
`node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000
--patch 0.677,0.807,0.389,0.519:A --patch 0.30,0.75,0.42,0.72:S`

| frame | patch | blobs | fill | **dropPct** | areaMed | contrast |
|---|---|---|---|---|---|---|
| BL sparks | A | 16 | 5.84% | 1.2% | 105 | 18.1 |
| BL nosparks | A | 15 | 5.06% | 1.1% | 43 | 13.9 |
| B0 sparks | A | 21 | 6.71% | 1.4% | 53 | 22.1 |
| B0 nosparks | A | 17 | 6.29% | 1.1% | 53 | 14.9 |
| BL sparks | S | 135 | 3.39% | 2.1% | 14 | 20.1 |
| BL nosparks | S | 90 | 3.04% | 1.5% | 14 | 20.9 |
| B0 sparks | S | 429 | 4.19% | **12.9%** | 7 | 21.6 |
| B0 nosparks | S | 361 | 3.95% | **12.7%** | 7 | 19.2 |

Patch A confirmed road paint again: **17 of 21 blobs and 6.29 of 6.71 fill survive with the spark
mesh hidden.** Boost's wave-P cross-piece table (14/21 blobs, areaMed 107 -> 46) is patch-A
absolutes on beauty frames; 80% of it is tarmac. Do not quote it.

Spark-attributable (visible minus hidden), which is the only readable column:

| | patch A blobs | patch S blobs | S density /1e4 | A contrast delta |
|---|---|---|---|---|
| boost 0 | 4 | **68** | 2.43 | **+7.2** |
| boost LIVE | 1 | **45** | 1.61 | **+4.2** |

**Boost LIVE still deletes 34% of the spark-attributable blob population in the real spark field
and cuts spark-attributable contrast 42%.** In patch A, three of four sparks vanish and the
survivor is a fused blob (areaMed 105 against a boost-0 53, while the sparks-hidden control moves
43 vs 53 — i.e. the fusion is on the sparks, not the paint). Crash-cam's re-derived headline
target is `contrast 22.1 -> 45+` measured at `uAmount = 0`; under the *shipping* boost that
population starts 42% dimmer than the number crash is aiming from. crash-cam is unblocked on the
comb, but boost has not finished paying for the crash beat.

## BIGGEST REMAINING GAP

**`game/boost.js:270` — `float lenPix = uAmount * (0.30 + 0.70 * uSpeed01) * 72.0 * falloff *
mask * velo;`. One speed curve serves both scenes and it is wrong at both ends, in opposite
directions.**

- At `boost-blur` (`uSpeed01 0.385`) it caps the kernel at **41.2 px** anywhere in frame
  (`node tools/_boostkernel.mjs`, rows `tarmac-nearL` / `tarmac-botL` / `tarmac-botR`, all 41.2;
  `tarmac-mid` 38.9). The reference's near road carries a field-wide smear the same estimator
  reads at 79.0 px in the spark-free sub-patch. Our spark-free sub-patch reads 1.6.
- At the crash beat (`uSpeed01 = 0` exactly) the `0.30` floor still yields ~3-6 px of kernel over
  1.4 px-wide spark slivers, which is what deletes 34% of the spark population and 42% of its
  contrast above. `bb` is not the culprit there — at `lenPix ~5.9` the gate at `:460` sits at
  ~0.02 and the bright-biased branch is off. The damage is the plain mean at `:331-345`.
- **The builder wrote the argument against its own constant** at `:258-269`: "a shutter smear is a
  distance travelled during the exposure, so at `uSpeed01 = 0` it is zero, and 55% of the full
  kernel is not a defensible floor for it." It then shipped 30% instead of 0.

**BOUND ON WHAT BOOST CAN FIX, hand this to road-surface.** Lengthening the kernel will not
produce the reference's grainy bands, because there is no grain to smear. In the spark-free
sub-patch, relative HF (hpRms / mean luma): ref-02 **post-blur 5.95%**; ours **pre-blur 2.46%**,
**post-blur 1.03%**. Our un-blurred near road already has 2.4x less relative texture than the
reference has *after* its blur, and our post-blur hpRms of 0.39 is ~1.3 LSB, i.e. at the 8-bit
quantisation floor — bug-class rule 4 again, the consumer cannot represent what is left. Boost is
a filter; a filter cannot add grain. Boost's own ceiling here is the 41.2 px kernel; the rest of
the 50x gap is upstream of `boost.js`.

## NEXT-ROUND TARGETS — methods, exact args, bands

Every measurement below: state frame type (spark-isolated vs beauty) and the live `uAmount`.
Quote `_debrismeas` and `_smearmeas` figures as RATIOS across reports, never absolutes.
Always print `dropPct`.

**T1 (HEADLINE, replaces both retired forms of the hpRms target) — spark-free filter band.**
```
node tools/_heromask.mjs --scene boost-blur --out shots/<tag>.png
node tools/_smearmeas.mjs --foc 0.504,0.508 \
  --patch 0.28,0.375,0.72,0.86:P1a --patch 0.36,0.40,0.88,0.92:P1b --patch 0.28,0.40,0.72,0.92:P1 \
  shots/<tag>-fx.png shots/<tag>-nofx.png
```
Headline = `hpRms(fx)/hpRms(nofx)` in **P1a**. Now **0.39** (0.39/0.99).
**BAND [0.25, 0.70].** Below 0.25 the pass is an energy sink; above 0.70 it is not filtering.
P1 and P1b are reported as diagnostics only, so the reader can see how much of P1 is one object.
Floor control, rendered every round: an ideal radial box blur of that round's own nofx frame at
the pass's measured `lenPix` — its P1a ratio is the band's lower edge (78 px control gives 0.25).

**T2 (replaces `radSmear >= 12`, and replaces absolute `maxSmear`/`aniso`) — field-wide smear.**
Same args as T1. **P1a `maxSmear` is now 1.6 px; ref-02 at `sips -Z 1920` is 79.0 px.**
TARGET: **P1a maxSmear in [20, 60] px** AND within **[0.5x, 1.5x] of the ideal-blur control** built
from the same nofx frame at the pass's own `lenPix` (`node tools/_boostkernel.mjs`, `tarmac-nearL`
row; currently 41.2 px). Two-sided on purpose. Do not quote `aniso` alongside it.
Secondary, where `radSmear` is actually valid: `--patch 0.02,0.25,0.70,0.85:P2roadL`, ours 17.1,
ideal control 27.2, **BAND [20, 30]**.

**T3 (CROSS-PIECE boost -> crash, replaces the VOID density/areaMed family).**
```
node /tmp/crashmeas-o.mjs --tag <tag>
node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000 \
  --patch 0.30,0.75,0.42,0.72:S shots/o-<tag>-{BL,B0}-{sparks,nosparks}.png
```
Spark-attributable = visible minus hidden, beauty frames, live `uAmount 0.27087`, `uSpeed01 0`.
Now: blob count **BL 45 vs B0 68**; spark-attributable contrast **BL +4.2 vs B0 +7.2**.
TARGET: boost LIVE retains **>= 90% of the boost-0 spark-attributable blob count (>= 61)** and
**>= 90% of the spark-attributable contrast (>= 6.5)**. Patch A absolutes are forbidden as targets
(17 of 21 blobs are road paint, re-confirmed this wave).

**T4 (gate, keep, never a headline).** `P = hpRms(960)/hpRms(1920)` in P1 via `sips -Z 960`.
Now **1.260** (ref 1.30). Must stay in **[1.0, 1.5]**. It moved only 1.35 -> 1.26 while the picket
fence vanished; it is nearly blind and the builder was right to say so.

## RETIREMENTS AND RESTATEMENTS FROM THIS ROUND

1. **RETIRED — `_smearmeas` `maxSmear` and `aniso` as absolute cross-image quantities.** Paired
   control above: 78 px truth -> 34.9, 40 px truth -> 11.4, jitter-only change swings it 29%, and
   `aniso` is `maxSmear` over a pinned 1.3-2.9 px `minSmear` floor.
2. **RETIRED (upheld, new proof, new reason) — `radSmear >= 12` at
   `--foc 0.504,0.508 --patch 0.28,0.40,0.72,0.92`.** An ideal radial blur about the exact declared
   focus scores 5.8 there. Cause is the patch's 38-degree radial span, not a foreign focus.
3. **REJECTED BEFORE ISSUE — "fx hpRms <= ref-02's 5.26" as an absolute target.** One-sided; we are
   59% below it while sinking HF in five of six patches. If stated absolutely it must be a band.
4. **REJECTED — "the <= 1.2 ratio is unreachable by construction."** The ideal-blur control of the
   same input gives 0.36, and the spark-free sub-patch of our own shipping frame gives 0.39.
5. **STRIKE from `STATE.md:94-101`** the surviving text "our chips are 6x the reference area before
   boost ever touches them" and the `crash-cam-01 majMed 4.3 / areaMed 6` anchor under it. That
   anchor is fence, livery and `meanContrast -7.6`; the direction is inverted. Boost's wave-P
   BRIEF CORRECTION 2 rests on it and should be struck with it.
6. **RESTATED — boost's cross-piece claim is not settled.** Boost LIVE still costs the crash beat
   34% of its spark population and 42% of its spark contrast (spark-attributable, `--sign pos`,
   patch S, dropPct 1.5-2.1%). The comb-fusion artefact crash was blocked on IS gone; the
   mean-branch damage is not.
7. **LOGGED — `verdicts/wave-p/sky-lighting.md` quotes no md5 for `game/sky.js`.** Its own file is
   not rule-5 auditable, and `sky.js` moved after boost's measurement window closed. Boost's
   figures all reproduced on the newer sky, so nothing here is void, but sky must quote its own
   hash next wave.
