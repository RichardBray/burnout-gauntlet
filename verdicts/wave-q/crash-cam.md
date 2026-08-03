# WAVE Q CRITIC — crash-cam

Auditing `verdicts/wave-p/crash-cam.md`. Fresh context, blind crop read first.
Tree as audited: `md5 game/crash.js = b47c5192c0ee31797f073941d8b6e4c6`, `./tools/lint.sh = lint ok`
before and after every render, and again as my last action.

## VERDICT: real wins

### Which I called real, and what in the crop decided it — before any number

Camera situation: `reference/INDEX.md` labels `crash-cam-01` "takedown cam, slow-mo, rival launched
airborne through a fence, debris".
Ours is a takedown cam on a downtown street with the rival tumbling and a debris fan.
The framings do not match — `crash-cam-01` is a close two-car composition and `crash-cam-04` is
roughly 3.5x tighter still than ours — so I compared the SUBJECT region rather than the whole frame,
and I say so rather than pretending the cameras matched.

Crops read blind:

- `node tools/_cropimg.mjs reference/crash-cam-01.jpg /tmp/q-ref01-debris.png 1620 1920 380 700 2 50`
- `node tools/_cropimg.mjs shots/o-qB1-BL-sparks.png /tmp/q-ours-debris.png 900 1200 130 450 2 50`

The reference was obvious on two features, neither of them a number.
**Every shard in the reference carries its own value** — some faces pale grey, some near black, a few
with a glossy edge — so the field reads as many objects under one light.
**Every shard in ours is the same dark silhouette**, a flat cut-out triangle or needle, and the whole
fan reads as one object stamped many times.
Second: the reference has a **translucent dust veil between the shards** that visibly desaturates and
lifts the road behind them, so the debris sits INSIDE the air.
Ours has no veil between shards at all — the road behind reads at full local contrast right up to
each shard edge, so the debris sits ON the frame.

The sparks, which are this round's subject, were the third thing I noticed and not the deciding one:
ours are thin dull-orange dashes, the reference's are blown gold lozenges with a soft fringe.

## RULE 5 — CLEAN, with one residual false anchor the builder did not correct

Every literal in the wave-P report checked against the tree by grep, not by comment:

| claim | tree | status |
|---|---|---|
| `crash.js:249` `aniso: 1 -> 16` | `:249` `aniso: 16` | OK |
| "every other texture in `crash.js` already runs 4-8" | `:75` 4, `:123` 4, `:178` 8, `:194` 4, `:353` 4, `:387` 8 | OK, exactly true |
| `r` untouched at 1.10 / g 0.609 / b 0.216 | `:2196-2198` `1.10`, `0.609`, `0.216` | OK |
| `SPARKS` 150 | `:498` `const SPARKS = 150;` | OK |
| `STREAK_VC` 0.86 | `:212` | OK |
| spawn-site `streak:` literals untouched | `:515` .012, `:1438` .015, `:1440` .008, `:1666` .013, `:1668` .016, `:1810` .013, `:1837` .013, `:2369` .009 | OK, all consistent with the wave-M/N comment block at `:2130-2148` |
| `len`/`wid` untouched | `:2144` `clamp(sp*s.streak, 0.09, 0.30)`, `:2149` `clamp(0.012 + len*0.012, 0.012, 0.032)` | OK |
| `game/boost.js` not touched | `982dde37a04031a3fc22410034b9b485` = boost-fx's own AFTER hash | OK |
| `damage.js` moved only after the last render window | `cd22a4c2dd745633093a55923343f63f` = damage-model's declared FINAL hash | OK, explained by a peer verdict |
| `_debrismeas` defaults unchanged | `:45-49` `bg 15, delta 12, minpx 4, maxpx 4000, sign both`; `sign both` = `Math.abs(dv) >= delta`, the historical predicate | OK — and it reproduces the wave-O ref-04 line to the digit (below) |
| `main.js:107-111` HalfFloatType, `main.js:68-75` no tone mapping | `:107-110` `type: THREE.HalfFloatType`; `:75` `renderer.toneMapping = THREE.NoToneMapping` | OK, the builder's premise correction is code-true |

No edit in `game/crash.js` is unexplained by the wave-P verdict; all fifteen `game/*.js` hashes are
either quoted in a wave-P verdict or belong to a peer piece's own verdict.

**The one thing the builder missed.** It corrected the false prose at `:2160-2193` but left the SAME
retired anchor standing, uncorrected, at **`crash.js:2130-2148`**, where it is the stated
justification for the constants that set spark length and width:

> "crash-cam-04's sparks measure 6 px / 27 px" ... "The reference sparks are ~1 px wide slivers
> (aspect p50 6.4)"

Those are the `--maxpx 4000` crumb statistics at **95.2% drop** (proven below).
On that basis `s.streak` was cut `0.045 -> 0.012` and every spawn override scaled by 0.267.
The constants happen to land defensibly (see ASPECT below), but their written justification is void
and it is in the file that created rule 5. **A wave-R builder must correct it in place.**

Minor: the builder quotes `aspMed 4.74 -> 5.90` in its `uAmount = 0` row. `aspMed` is RETIRED
outright, not merely at boost-live. Decorative, not load-bearing, but it should not have been there.
`aspP90` is quoted only in the `uAmount = 0` rows — compliant.

## REPRODUCTION — the wave-P report reproduces bit-for-bit from a cold boot

Harness `/tmp/crashmeas-o.mjs --tag qB1` (wave N's, unmodified). Scene `crash-cam`, `#shot=1`,
1920x1080, `simTime 0.9`. **Frame type: full beauty frames, spark-isolated by DIFFERENCE
(visible minus hidden) in one boot.** Live `uAmount = 0.27087161491258294`; `uSpeed01 = 0`, so the
speed-line branch is inert and I do not reason about it. `md5 game/*.js` identical before and after
the render window on all fifteen files.

Geometry reproduced to four figures: `lenPx p50 12.523 / p90 33.58 / max 60.005`,
`widPx p50 1.426`, `aspect p50 9.18`, `peak r 1.0093`, `live 114 / 150`.

I then rebuilt A myself (`sed '249s/aniso: 16/aniso: 1/'`, `md5 3a9c7c797110e8708eec4e5582147635`,
`lint ok`) and re-rendered. Metric on every line below:
`node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000`,
patch A `0.677,0.807,0.389,0.519`, patch S `0.30,0.75,0.42,0.72`. **`dropPct` printed on every one.**

| config | patch | A (aniso 1) vis / hid | B (aniso 16) vis / hid | drop% |
|---|---|---|---|---|
| `uAmount 0` | A | 21 blobs 6.98% / 17 blobs 6.29% | 21 / 6.71% / 17 / 6.29% | 1.1-1.5 |
| `uAmount 0` | S | 425 / 4.35% ; 361 / 3.95% | 429 / 4.19% ; 361 / 3.95% | 12.3-12.9 |
| boost LIVE | S | 114 / 3.32% ; 90 / 3.04% | 135 / 3.39% ; 90 / 3.04% | 1.5-2.1 |

Spark-attributable (visible minus hidden): fill `0.69 -> 0.42 pt (-39%)` patch A and
`0.40 -> 0.24 pt (-40%)` patch S at unchanged blob count; `aspP90 14.96 -> 18.24` at `uAmount 0`;
boost-LIVE patch S blob count `24 -> 45 (+88%)`, `majP90 38.6 -> 26.5`.
**Every figure in the wave-P table reproduces exactly.** The sparks-hidden control is identical to
the digit between my A and my B on every statistic in both patches — the builder's null test holds
independently.

**The patch-A contamination claim is confirmed and is if anything understated.** With the spark mesh
hidden, patch A at `uAmount 0` still scores **17 of 21 blobs (81%) and 6.29 of 6.71 fill (94%)**.
Patch-A absolutes are road paint in every agent's frames.

## TOOL AUDIT (the budgeted one) — `_debrismeas`'s `meanContrast` SATURATES. RETIRED as a brightness target.

### Part 1: the wave-P anchor retirements are ENDORSED, verified by crop and by paired control

`node tools/_cropimg.mjs reference/crash-cam-01.jpg /tmp/q-ref01-patchA.png 0 576 680 788 3 50`
— I looked at it. **Chain-link fence diamonds, a rusted stanchion, and the hero car's dazzle livery
reading "SPEED". No debris, no sparks, anywhere in it.** Confirmed.

`--sign both --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.00,0.30,0.63,0.73`:

| file | blobs | fill | majMed | areaMed | contrast | **drop** |
|---|---|---|---|---|---|---|
| `crash-cam-01.jpg` | 65/350 | 1.40% | 4.3 | 6 | **-7.6** | **98.2%** |
| `crash-cam-04.jpg` | 63/157 | 3.17% | 6 | 6 | -1.0 | **95.2%** |
| ours, patch A, `uAmount 0` | 21/49 | 6.71% | 16.9 | 53 | +22.1 | **1.4%** |

Paired control, only `--maxpx` moved to `1e8`: ref-01 fill `1.40% -> 79.13%`, ref-04
`3.17% -> 66.28%` at an unchanged 63-66 blob count. The field percolates into one component and
`maxpx` throws it away. **The wave-O reference statistics were computed over 1.8% and 4.8% of their
own masks against our 98.6%. They were never comparable, and `crash-cam-01`'s was not about sparks
at all — its sign alone (-7.6, darker than surround) falsifies it for an additive population.**
Both anchors and every target derived from them stay RETIRED. This ruling is the correct one and the
builder earned it.

`crash-cam-04 --patch 0.229,0.333,0.620,0.722` — **cropped and looked at**
(`_cropimg reference/crash-cam-04.jpg /tmp/q-ref04-anchor.png 440 640 670 780 5 25`):
it is genuinely a spark field. Ten separated golden-orange streaks with bright near-white cores on
black road, at 0% drop, `contrast +60.5`. **The re-derived ANCHOR is valid and I endorse it.**

### Part 2: the re-derived TARGET number is wrong, and the metric under it does not measure radiance

Paired control, the one nobody ran: scale the emitter gain and check the metric follows.
`crash.js:2196-2198` scaled by k with hue preserved (`r 1.10k, g 0.609k, b 0.216k`), `lint ok`,
one boot each, patch S, `uAmount 0`, spark-attributable:

| k | r | `_debrismeas` contrast (beauty frame) | diff-image p90 | diff-image p99 | diff-image max |
|---|---|---|---|---|---|
| 1 | 1.10 | 21.6 | 54.2 | 113.1 | 154.4 |
| 2 | 2.20 | 23.5 | 84.9 | 151.7 | 179.8 |
| 3 | 3.30 | 25.0 | 104.6 | 169.3 | 187.7 |
| 5 | 5.50 | 27.1 | 131.2 | 182.3 | 194.2 |

**A 5x increase in emitter radiance moves `meanContrast` 21.6 -> 27.1.** It cannot reach 45, let
alone 60.5, at any physically sane gain. The mechanism is in the tool: the blob is defined by a
`|L-bg| >= 12` mask, so raising brightness RECRUITS marginal edge pixels into the blob faster than it
raises the interior, and the mean over the mask is self-limiting. On a population that is 1.4 px wide
almost every pixel is a partial-coverage edge pixel, so the dilution dominates.
**`_debrismeas meanContrast` is RETIRED as a spark brightness target.**

It also fails for a second, separate reason the builder itself discovered and then did not apply to
its own number: **22.1 was measured on a beauty frame whose mask is 94% road paint.** Measured on a
properly spark-isolated frame — the visible-minus-hidden DIFFERENCE image, patch S, drop 5.8-15.1% —
the same tool with the same args gives:

| build | blobs | fill | drop | aspMed | **contrast** |
|---|---|---|---|---|---|
| A, `aniso 1` | 64 | 0.44% | 5.8% | 4.52 | 23.5 |
| B, `aniso 16` (shipped) | 62 | 0.26% | 15.1% | 4.42 | **37.0** |
| B + `r 2.20` | 74 | 0.38% | 8.0% | 5.11 | **47.1** |

**We are at 37.0, not 22.1, and the reference band is 45.0-60.5. The gap is 1.3x, not 3x.**
The "our sparks are 3x too dim" headline is itself an artefact of the contamination the same report
uncovered. The direction is right; the factor is not.

### Replacement metric, with its paired control

`/tmp/q-sparkdiff.mjs vis.png hid.png x0,x1,y0,y1` — percentiles of `L_vis - L_hid` over a patch.
No threshold, no mask, no components, so nothing can be diluted by recruitment. Paired control: it
tracked the 5x radiance sweep monotonically on every percentile (table above) where `meanContrast`
did not. For the reference, the matched statistic is `L - bg` percentiles over the anchor patch,
where the local background IS bare dark road (crop-verified), so the two are comparable:

| | p90 | p99 | max |
|---|---|---|---|
| ref-04 `0.229,0.333,0.620,0.722` | 116.2 | 149.0 | 178.2 |
| ref-04 `0.00,0.12,0.620,0.700` | 117.5 | 151.5 | 175.8 |
| ref-04 `0.28,0.36,0.615,0.690` | 112.8 | 146.9 | 156.0 |
| **ours, shipped `r 1.10`** | **54.2** | **113.1** | **154.4** |
| ours, `r 2.20` | 84.9 | 151.7 | 179.8 |
| ours, `r 3.30` | 104.6 | 169.3 | 187.7 |

Two independent statistics converge on the same answer: **`r = 2.2` puts us on the reference.**

### RETIRED / RESTATED THIS ROUND

1. **`_debrismeas meanContrast` as a spark brightness target — RETIRED.** Saturating; 5x radiance
   buys +25%. Replaced by diff-image `p90/p99`, or by `meanContrast` computed on the
   visible-minus-hidden DIFFERENCE image only.
2. **The target "contrast 22.1 -> 45+" — RETIRED as stated.** Correct figure on an isolated frame is
   37.0 against a 45-60.5 band; see the re-derived target below.
3. **Spark ASPECT as a cross-frame target — RETIRED, and the builder's "already met, do not chase"
   is REJECTED as stated.** The builder compared our GEOMETRIC quad aspect (9.18, from the probe)
   against the reference's IMAGE-BLOB aspect (8.37, `_debrismeas`). Those are not the same
   measurement. Method-matched on the isolated difference image, **ours is `aspMed 4.42` against the
   reference's 8.37** — a 1.9x shortfall, not a pass. But it is also not actionable: at
   `widPx p50 1.426` our streaks sit on the resolution floor, where AA and the MSAA resolve pin the
   measured minor axis near 1 px and compress measured aspect regardless of the quad. Neither end of
   this comparison is scale-free. **Do not issue an aspect target for sparks at this framing in
   either direction.** The right closure is: the quad aspect is correct, the image aspect is not
   measurable, drop it.
4. **`addedLumaPerPx` / spark density between `crash-cam-04` and our `crash-cam` — DO NOT USE.**
   Reference 11.9-14.0, ours 0.147-0.165. That 80x is a framing and shower-density difference (the
   ref anchor is a dense contact-scrape shower filling 16-19% of a tight patch), not a defect.
5. Endorsed and re-affirmed: the `crash-cam-01` patch-A anchor, the `--maxpx 4000` reference
   statistics beneath it, `patch A density 4.6 -> 10.1`, `areaMed 47 -> <=15`, and
   `length p50 12.52 -> 8-12 px` all stay retired, now with crop and paired-control proof.

## THE `r <= 1.10` CEILING, RE-DERIVED

The old premise is disproven in code, exactly as the builder said: `main.js:107-110` is
`THREE.HalfFloatType` and `main.js:75` is `NoToneMapping`, and three only applies tone mapping when
the target is the canvas, so an additive write of 2.8 was stored as 2.8. **Nothing clipped. The
wave-N reduction `2.8 -> 1.10` had no valid justification.** But "the old reason was false" is not
"restore the old number", so here is the ceiling derived from what actually consumes `r`.

**What consumes `r`, in order:**
1. Additive blend into the HalfFloat MSAA target — effectively unbounded. Not the limiter.
2. `post.js` bloom prefilter — `uClamp 24.0` firefly cap (`post.js:279`), threshold 1.0, knee 0.45,
   so the knee starts at `br = 0.55` (`post.js:353`, `uFilter.y = threshold - knee`). Confirmed.
3. The graded ACES output pass (`post.js:208-214`, `c *= uExposure/0.6` at exposure 1.30), then the
   highlight-to-white roll and the S-curve. This is the real limiter, and it is a smooth shoulder,
   not a clip.

**Upper bound A — overshoot.** At `r = 3.30` our spark p99 (169.3) and max (187.7) both EXCEED the
reference band (146.9-151.5 / 156.0-178.2). Two-sided, so this is a fail, not a bonus.
Staying inside the reference band caps `r` at about **2.6**.

**Upper bound B — the shoulder re-flattens the authored taper.** The realised internal range of the
spark population, diff-image `p99/p50`: `14.9x` at r 1.10, `12.2x` at 2.20, `10.0x` at 3.30, `7.6x`
at 5.50. Wave N's instinct was right about the *shoulder* even though its *clip* claim was false —
the taper does get crushed, just smoothly. Holding the loss to <=20% of today's range caps `r` at
about **2.3**.

**Upper bound C — pointlessness.** `d(p99)` per doubling of `r`: +34% (1.1->2.2), +12% (2.2->3.3),
+7.7% (3.3->5.5). Past 3.3 the ACES shoulder returns almost nothing while continuing to crush the
profile.

**DERIVED CEILING: `r <= 3.3` hard. Usable band `r` in [1.9, 2.6]. Recommended point 2.2.**
The shipped 1.10 is half the floor of that band. The old 2.8 sits just above its top — nearly right,
for entirely the wrong reason. Crops at `r = 3.30` and `r = 5.50`
(`_cropimg shots/o-qK3-B0-sparks.png ... 1300 1549 420 560 3 40`) show no return of the square-cut
bar at either, confirming the square end was the mip artefact and not the gain.

**But raising `r` will NOT buy glare — see the gap.**

## BIGGEST REMAINING GAP

**No spark in the frame carries bloom glare, and `r` cannot buy it, because the bloom prefilter is a
4-tap box evaluated at HALF resolution (`post.js:64-71`, written into a half-res mip 0 at
`post.js:325-327`, thresholded at `post.js:353`) while a spark is `widPx p50 1.426` wide
(`crash.js:2149`, `wid = clamp(0.012 + len*0.012, 0.012, 0.032)`).**

The four taps sit at `±1 full-res texel` about a half-res pixel centre, so a feature whose peak lives
in a single full-res pixel contributes to at most one tap and `br` arrives at the knee at roughly a
quarter of the streak's true peak. **The effective bloom knee for a sub-2 px feature is ~2.2 HDR, not
the nominal 0.55, and full weight needs ~4.0** — above the entire derived `r` ceiling.

Paired control, which is what proves it rather than asserts it. Spark-attributable diff-luma in patch
S at `uAmount 0`, binned:

| r | glare band (1 <= dl < 6) px | core (dl >= 40) px |
|---|---|---|
| 1.10 | 603 | 358 |
| 2.20 | 560 | 623 |
| 3.30 | 531 | 809 |
| 5.50 | **487** | **1057** |

**A 5x radiance increase grows the core 3x and SHRINKS the glare footprint.** If bloom were engaging,
the low-level skirt would grow superlinearly. It does not grow at all. There is no glare on any spark
at any gain reachable within the ceiling. This is bug-class rule 4 again — the consumer (a half-res
4-tap prefilter) cannot represent the feature it is being fed.

Consequence for whoever takes this: **raising `r` alone closes the peak-luma and contrast numbers but
will not change the look much**, and my `r`-sweep crops confirm that — `r = 3.30` and `r = 5.50` are
only modestly brighter than shipped and neither glows. Glare requires the streak to be wider than the
prefilter's footprint, or a dedicated bloom contribution that is not gated by a half-res box tap.
Widening the quad without lengthening it will destroy the quad aspect (9.18, currently correct), so
this is a `len` AND `wid` change together, or a `post.js` change.

Second gap, the one that actually decided my blind call and which I did not quantify: **the debris
shards read as flat single-value silhouettes with no inter-shard dust veil** (`panelMat`,
`crash.js:449`, is a lit `MeshPhysicalMaterial`, so this is not a material-class bug — it is that the
shards are thin plates near-edge-on to a dusk key with nothing scattering between them). Bigger to
the eye than the sparks. Nobody has measured it; the patches I tried are contaminated by the wreck
body and the buildings, so I am naming it rather than issuing a number I cannot defend.

## NEXT-ROUND TARGETS

Every target below is stated as a BAND, is measured on a spark-ISOLATED frame (visible minus hidden
in one boot), states `uAmount`, and requires `dropPct` printed. **A `dropPct > 50%` on either end
means you are measuring the sieve — throw the measurement away.**

**T1 (headline, mechanism) — put glare on the sparks.**
Method: `/tmp/q-halo.mjs <vis>.png <hid>.png 0.30,0.75,0.42,0.72`, `uAmount 0`, beauty frames.
Today: glare band 603 px against a core of 358 px, and the band does not respond to radiance.
Target: **glare band (1 <= dl < 6) >= 1200 px AND `haloPerCore` >= 2.5**, with the paired control
that it must RISE when `r` rises (today it falls). Reject any fix that raises the core without the
band. Named sites: `crash.js:2144` / `:2149` (streak length and width) or `post.js:64-71`.

**T2 — spark peak luma into the reference band.**
Method: `/tmp/q-sparkdiff.mjs shots/<tag>-B0-sparks.png shots/<tag>-B0-nosparks.png 0.30,0.75,0.42,0.72`.
Reference, `L - bg` over `crash-cam-04` patches `0.229,0.333,0.620,0.722` / `0.00,0.12,0.620,0.700` /
`0.28,0.36,0.615,0.690`: p90 **112.8-117.5**, p99 **146.9-151.5**, max **156.0-178.2**.
Ours today: p90 54.2, p99 113.1, max 154.4.
Target BAND: **p90 in [95, 125], p99 in [140, 158], max in [155, 185]**. Overshoot is a fail.
`r = 2.20` measured p90 84.9 / p99 151.7 / max 179.8 — p99 and max land, p90 is still short, so the
fix is not a flat multiplier: it wants the BODY of the population lifted, i.e. a flatter `heat`
exponent (`crash.js:2195`, `Math.pow(u, 0.55)`) or a longer hot phase, not more peak.
**Constraint: `r <= 3.3` hard, `r` in [1.9, 2.6] recommended (derived above).**

**T3 — spark-isolated contrast, restated on a clean frame.**
Method: build the difference image (`/tmp/q-mkdiff.mjs`), then
`node tools/_debrismeas.mjs --sign pos --bg 15 --delta 12 --minpx 4 --maxpx 4000 --patch 0.30,0.75,0.42,0.72`.
Ours today **37.0** at drop 15.1%; reference **45.0-60.5** at drop 0-0.4%.
Target BAND: **[45, 60]**. Do not chase it on a beauty frame; that number is road paint.

**T4 — do-not-regress gate on the wave-P win.** At `uAmount 0`, spark-attributable fill in patch S
must stay `<= 0.28 pt` at a blob count `>= 60`, and `aspP90 >= 18.0` (legal only at `uAmount 0`).
Today 0.24 pt / 68 / 18.24.

**T5 — the shard field.** Unblocked and unmeasured. First job is a valid patch: find one in our frame
that contains shards over bare road and nothing else, verify by crop, and report `--sign pos` and
`--sign neg` blob counts separately against `crash-cam-01 --patch 0.844,1.0,0.352,0.648` (ref there:
pos 116 blobs at 23.8% drop, neg 150 at 11.5% drop). Do not reuse my patch
`0.469,0.625,0.120,0.417` — it is contaminated by the wreck body and the buildings and I am reporting
it only so nobody re-derives it.

## MEASUREMENT LOG

All renders: scene `crash-cam`, `#shot=1`, 1920x1080, `simTime 0.9`, harness `/tmp/crashmeas-o.mjs`,
**full beauty frames spark-isolated by difference**, live `uAmount 0.27087161491258294`,
forced `uAmount 0` for the B0 pair, `uSpeed01 = 0`. `lint ok` before each. `md5 game/*.js` stable
inside every render window. Damage level and camera are the scene's baked defaults for `crash-cam`
(the settled wreck at `simTime 0.9`) on every line, ours and the sweep alike.

Tags on disk: `shots/o-qA1-*` (aniso 1), `shots/o-qB1-*` (shipped), `shots/o-qK2/qK3/qK5-*`
(the `r` sweep, all reverted; `md5 game/crash.js` back to `b47c5192c0ee31797f073941d8b6e4c6`,
`lint ok` confirmed as my last action).
New scripts, kept in `/tmp` deliberately since they are diagnostic and not yet earned a place in
`tools/`: `/tmp/q-sparkdiff.mjs`, `/tmp/q-halo.mjs`, `/tmp/q-mkdiff.mjs`, `/tmp/q-refpk.mjs`.
If wave R uses T1 or T2 as its headline, promote `q-sparkdiff` and `q-halo` into `tools/` first.
