# WAVE R - RESOLVER VERDICT

## READ THIS HEADER BEFORE YOU QUOTE ONE NUMBER FROM THIS FILE

**THIS FILE IS A RECONSTRUCTION, WRITTEN IN SESSION 15. IT IS NOT THE ORIGINAL.**

The session-13 (round 13) resolver agent was killed mid-flight by the harness at 884 s, together with
the four builders of that batch, by `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` (default 600 s).
**It never wrote this file.** Its actual analytical work DID land, complete and sound, but it landed
in the wrong place: as a set of large amendments written directly into `tools/STANDING-CONSTRAINTS.md`.
Those amendments then cited *this* file as their source, so every citation to
`verdicts/wave-r/resolver.md` was dangling - a claim with no traceable support, which in this project
is indistinguishable from an invented one.

This file exists to make those citations resolve. It was assembled in session 15 by a
documentation-repair agent, not a builder.

**Provenance rules that bind any reader of this file:**

1. **Every numeric figure in §1, §2 and §3 below is COPIED VERBATIM from the surviving amendment text
   in `tools/STANDING-CONSTRAINTS.md`.** Nothing was re-measured. Nothing was recomputed. Nothing was
   inferred. The reconstructing agent did not render, did not run `_px.mjs`, and was explicitly barred
   from doing so.
2. **Where the original resolver's ruling did NOT survive in any text on disk, this file says
   `UNSUPPORTED-EVIDENCE-LOST` and stops.** It does not reconstruct the gap from plausibility. Two
   such gaps exist and are listed in §4.
3. **The amendment in `tools/STANDING-CONSTRAINTS.md` is the record, not this file.** If the two ever
   disagree, the amendment wins, because the amendment is the original agent's own hand and this file
   is a transcription of it. The per-section source lines are given at the head of each section.
4. The one exception to rule 1 is **§2b**, which is a session-15 FIRST-HAND look at the crops, taken
   because the ruling in §2 is an anchor ruling and this project has now found three anchors that were
   the wrong object entirely. §2b is labelled as session-15 evidence throughout and it does not carry
   any figure attributed to the resolver.

---

## §1. `_px.mjs` PERCENTILE SAMPLER - FIXED, AND THE IMPACT AUDIT IS DONE

*Source: `tools/STANDING-CONSTRAINTS.md` §1a, the block headed "AMENDMENT, WAVE R. THE SAMPLER IS
FIXED AND THE AUDIT IS DONE". This section resolves §4 open item 4 ("Which live percentile targets
move once `_px.mjs:60` is fixed"). The audit's own primary record is
`verdicts/wave-q/px-percentile-audit.md`, which exists on disk and is the file to read for the
32-figure table; this section is the resolver's ruling ON that audit.*

**The fix.** `_px.mjs` went md5 `be244cafe4297b22429622ab63fe0833` ->
**`6b0e73db0aa999c527ab6fdd7cba5b7f`**. The strided sampler and the array sort at `:60` are replaced
by a **full-population 2551-bin histogram at 0.1 luma** (`_px.mjs:45-62`), same 0-based nearest-rank
convention, and **`p10` / `p90` were added**.

**The audit.** 32 figures were re-measured at each report's own scene / level / camera, with the old
and the new tool on the same PNG (`verdicts/wave-q/px-percentile-audit.md`).
**Nothing in the live target set flipped.** So mitigation (1) of §1a is DONE, mitigation (2)
(`sub40` / `sup200`) remains valid, and percentiles are now exact and width-independent, so no error
bar is needed.

Three corrections the audit forced on the wave-Q statement of the defect:

- **RETIRED AS UNSOUND: mitigation (3)**, "quote the percentile beside its one-pixel-narrower twin and
  treat the spread as the error bar, >5% is unusable". Paired: on `bonnetTight` at
  `daytime-downtown` / L0.95 / CAM-D the 192 / 191 / 193 px triple read **105.5 / 107.4 / 105.5** on
  the old tool - a **1.8%** spread that PASSES its own <5% gate - while the true full-population value
  is **108.6**. **Two wrong samples agreed.** The twin-quoting rule is a false comfort and is
  superseded by the fix. `wave-q/damage-model.md:288-289` and `:343`, which issued it as binding, are
  retired with it.
- **CORRECTED TRIGGER: "width is a multiple of 32" was the worst case, not the trigger.** ANY small
  region was suspect regardless of phase. HUD `road` (`0.9315,0.9345` -> **6 px** wide at 1920) is not
  a 32-multiple, but at 6 px x 81 rows the old sampler kept **15 samples in total**, so its p01/p99
  were percentiles of fifteen numbers, and its `p99` moves **122.9 -> 129.9 (+5.7%)** on the fix.
- **CORRECTED MAGNITUDE: the real-frame error is NOT `+/-4%`.** Measured against the true population
  rather than against one other arbitrary sample, the worst errors are **+15.1%** (`bonnetTight` p99,
  `dd` / L0.75 / CAM-D, 110.9 -> 127.7) and **-10.4%** (`bonnetTight` p50, `car-paint-closeup` / L0.75,
  81.0 -> 72.6), with -7.2% and -7.0% behind them. **The wave-Q critic understated the defect by
  roughly 4x.**

---

## §2. RULING: `daytime-downtown-04` IS A DUSK / BLUE-HOUR FRAME AND IS NOT OUR CAMERA

*Source: `tools/STANDING-CONSTRAINTS.md` §2f, the two entries headed "CONFLICT RESOLVED, WAVE R" and
"RULING, WAVE R, on what `-04` may still anchor", plus "CAMERA SITUATION, RULED". This section
resolves §4 open item 2.*

### §2a. The ruling and the resolver's own pixel evidence

**The preserved constraint line "`daytime-downtown-04` is the only reference with our camera" is FALSE
and is STRUCK.** `-04` is a dusk / blue-hour frame and anchors nothing photometric in a day scene.
`wave-q/environment.md` §1 and §9 are UPHELD on this; the older "hazy bright day" reading of the frame
is wrong except for the word "hazy".

Pixels, not prose. Every figure in this sub-section is the resolver's, copied from the amendment:

- Zenith strip `0.05,0.95,0.00,0.05`: `-04` reads **0.5,36.3,59.4**, luma p50 **34.4**, **99.97%** of
  pixels under luma 40, R = **0.5/255** so B/R = **119**. `-01` (high noon) reads
  **53.3,133.7,180.1**, p50 **122.2**, at the identical region.
- Clean-sky patches: `-04` `0.30,0.75,0.01,0.09` = 1.6,44.8,72.1 p50 **36.7** against `-02`
  `0.28,0.37,0.01,0.10` = 62,118.8,142.6 p50 **108.4**, i.e. **3.0x darker**.
- The illuminant is the horizon glow, not a sun disc: `-04`'s near-horizon sky
  `0.42,0.52,0.44,0.49` is 229,218.8,214.7 with **100%** of pixels >= 200, so zenith->horizon luma runs
  36.7 -> 221.6, a **6.0x** gradient against `-02`'s **2.1x**.
- No sun disc, confirmed off the shadow: lit road `0.06,0.14,0.83,0.88` p50 **166.2** against the car's
  own cast shadow `0.30,0.40,0.86,0.92` p50 **134.6**, ratio **0.81** - a 19% darkening with a
  shapeless soft penumbra.
- Lights not yet on: the street-lamp head (crop `1380 1750 330 520`) has no emissive core and no light
  pool; the headlights and the tower's "R R" sign are unlit.

**Conclusion: late civil twilight under heavy aerial haze.**

**What `-04` may still anchor: nothing photometric and nothing geometric in a `daytime-downtown`
brief.** It may not anchor luma, chroma, sobel, `dark%` or any row-fraction target for a day scene.
Its chroma figures are blue-hour-grade numbers and must be read as such wherever they appear -
`cSpread 128.14`, band `sat` 0.556, and the block-distance row p50 **113.6** / p90 **214.0** in the
§2f DIAGNOSTIC entry. **`daytime-downtown-03` (74.23 / p50 56.0 / p90 125.1) is the operative
day-scene comparison in that table, not `-04`.** `-04` survives only as (i) a source of
time-of-day-independent qualitative observations at its own grade - aerial-perspective falloff shape,
clearcoat and chrome behaviour, the soft-occlusion contact gradient - and (ii) a CANDIDATE, not an
endorsed, dusk anchor for dusk pieces; it is a downtown street and `dusk-highway-chase` is a highway,
so anyone using it that way must crop and register first.

**CAMERA SITUATION, RULED: `daytime-downtown-02` is the shot-type match and `-01` the lighting-class
match. NEITHER is a row-fraction match, and that caveat is new - wave Q did not state it.** Ours is a
chase cam straight down a downtown boulevard, buildings both sides, gantry route signs, vanishing point
at **y 553/1080 = 0.512** (consistent with §2a's 0.5077). `-02` is the same shot type and subject scale
but is pitched UP and its boulevard crests over a hill, so it has **NO visible horizon at all**: the
lane lines converge at **y ~935/1080 = 0.866**. `-04`'s ground horizon is ~**0.67**. **Therefore no
frame-fraction row anchor may be taken from `-02` either**, for exactly the reason §2a suspended the
sky rows. Note also that `-02`'s traffic lights and car headlights ARE lit, so it is late-afternoon low
sun, not midday.

### §2b. SESSION-15 FIRST-HAND CROP CHECK OF THE RULING (not the resolver's evidence)

The ruling above is an ANCHOR ruling, and this project has retired three anchors for being the wrong
object entirely (§0 of the standing constraints). Session 15 therefore cropped and LOOKED at both
frames with `tools/_cropimg.mjs` before propagating the ruling into `reference/INDEX.md`. This is a
qualitative confirmation only; no figure below is measured and none is attributed to the resolver.

Crops taken (all at 1920x1080 source, un-annotated blind reads at grid pitch `100000`):

- `_cropimg.mjs reference/daytime-downtown-02.jpg ... 0 1920 0 1080 0.55 100000`
- `_cropimg.mjs reference/daytime-downtown-04.jpg ... 0 1920 0 1080 0.55 100000`
- `_cropimg.mjs reference/daytime-downtown-01.jpg ... 0 1920 0 1080 0.55 100000`
- `_cropimg.mjs reference/daytime-downtown-04.jpg ... 1380 1750 330 520 3 100000` (the lamp head)
- `_cropimg.mjs reference/daytime-downtown-02.jpg ... 400 1300 820 1080 1.5 100000` (the road crest)

What is actually in the `-04` frame: **a static, low three-quarter-front HERO SHOT of a stationary red
muscle car filling the middle of the frame**, bonnet-scoop and grille facing camera, with the street
receding behind it on both sides. It is a car-presentation framing, not a driving view. **The car is
not moving and the camera is not behind it.** So "the only reference with our camera" fails on shot
type before the photometry is even considered: our camera is a chase cam, and `-04` is not a chase cam
at all. The sky reads deep navy at the top grading to a pale warm band low down behind the towers; the
distant towers are washed almost to sky colour by haze; the streetlamp in the `1380 1750 330 520` crop
is a dark grey lamp head against a dark facade with **no emissive core and no pool of light beneath
it**; the "R R" tower sign is a dim unlit graphic. Nothing in the frame is emitting. This is
unambiguously blue hour, and it matches the resolver's ruling exactly.

What is actually in the `-02` frame: **a forward view straight down a downtown boulevard, towers on
both sides, and a row of green overhead gantry route signs on the right reading "WATERFRONT" /
"RIVER CITY" / "PALM BAY HEIGHTS"** - the same shot vocabulary as ours. Traffic is in frame with
**headlights and tail lights lit and the traffic signals lit**, so it is low-sun late afternoon, not
midday. The upper thirds of the towers are in warm direct sun while the canyon floor is in full shade.
In the `400 1300 820 1080` crop the roadway visibly **humps over a crest** and the lane lines run out
of frame over it rather than converging on a horizon; by eye the convergence sits at roughly source
y 937, which is where the resolver put it (y ~935). **There is no visible sky horizon at ground level
in `-02`.**

**Session-15 verdict on the conflict: the resolver's ruling is CORRECT and is adopted.** `-02` is the
shot-type / camera-situation match, `-01` the lighting-class match, `-04` is a blue-hour hero shot and
is neither. Neither `-02` nor `-04` may be used for a frame-fraction row anchor. `reference/INDEX.md`
has been corrected for `-02` and `-04` accordingly.

---

## §3. AUDIT OF THE HISTORICAL `_px` `sat` FIGURES, AND THE SAME DEFECT FOUND IN A SECOND TOOL

*Source: `tools/STANDING-CONSTRAINTS.md` §1b, the block headed "AMENDMENT, WAVE R. THE HISTORICAL
`sat` FIGURES ARE AUDITED". This section resolves §4 open item 3 and opens new item 10.*

- **CORRECTED MECHANISM: `meanCast` and `satPx` part company in proportion to the region's HUE
  diversity, and are almost blind to its LUMA spread.** "Smooth sky regions" was the right conclusion
  for the wrong reason. Paired on the frozen references: `daytime-downtown-04`'s `roadLit` and
  `roadShadow` patches agree to **0.001 / 0.015** despite a 111->251 luma span, and the sodium `s` box
  `0.75,0.82,0.46,0.48` agrees to **0.000** (0.498 / 0.498) even though its p99-p01 is **29.9** and it
  contains power lines, three lamp heads and a tower-block edge. Meanwhile the whole-frame and
  facade-band regions of the same images diverge by **0.20 - 0.30** (dd-04 `full` 0.130 vs **0.432**;
  dd-02 `band` 0.249 vs **0.450**), because opposed hues cancel in the region mean and cannot cancel
  per pixel. **Test the region for mixed hues, not for flatness.**
- **CLEARED, all of them: every sky `sat` figure in waves K-Q.** Re-measured with `_px`
  `6b0e73db` on the frozen `reference/dusk-highway-chase-01.jpg` (`rz`, `rvalley`, `rmid`, `rs`, `rs2`,
  `m00`) and on the frozen `shots/_q-sky-1.png` (`z`, `valley`, `v1`, `v2`, `mid`, `s`, `s2`): every
  reference row agrees to **<= 0.001**, and on our side the worst is `v1` **0.199 -> 0.212 (+0.013)**
  with `mid` +0.004 and all others <= 0.001. `v1` carries no target. The live `valley` band 0.19-0.27
  is on a region that agrees to 0.001. **The §2a sodium hold gate and its "our 0.498 vs ref 0.500" are
  unaffected by the definition** - they remain retired-as-a-reference-match for the population reason
  already stated, which is a different fault.
- **VOID AS SATURATION, ALREADY REPLACED, no action: HUD `minimap sat` band 0.085-0.100 and the wave-P
  scored HIT at 0.094** (`wave-p/hud.md:142`, `:196`). The minimap card is firmly in the divergent
  class: `meanCast 0.150` vs `satPx 0.188` in `wave-q/hud.md:158`, and **0.041 vs 0.111 (2.7x)** on
  `shots/hud-r8-final.png` re-measured this wave. Superseded by `satPx` **0.170-0.210** in §2g;
  nothing to re-derive.
- **NOT VOID, BUT ITS ANCHOR IS CORRECTED AND MIS-CENTRED: damage's guard `sat 0.10-0.18 (ref 0.138)`**,
  scored HIT at 0.110 (`wave-o/damage-model.md:61`, `wave-p/damage-model.md:158`). Re-measured on
  frozen artefacts: cc03 `refInner 0.5833,0.6771,0.3704,0.5741` goes `meanCast 0.138` -> `satPx`
  **0.175 (+27%)**, and ours `bonnetTight 0.26,0.38,0.285,0.355` goes 0.110 -> **0.123** at L0.95 and
  **0.099 -> 0.157 (+59%)** at L0.75. **The pass survives** (0.123 is inside 0.10-0.18) **and the
  direction is unchanged - we are less chromatic than cc03 - but the gap grows 1.5x, from 20% below the
  anchor to 30% below it, and the band is now mis-centred with the reference sitting near its
  ceiling.** Damage must re-derive the band around **0.175** in the same report that re-issues it, and
  quote `satPx`.
- **NOT IN THIS CLASS, do not "fix" them: `_facademeas.mjs:97` and `_tm-measure.mjs:53/:86` accumulate
  saturation PER PIXEL and are already true `satPx`.** `_facademeas` band `sat` was retired four times
  over for what it MEANS, not for how it is computed; that retirement is untouched by this audit.
- **NEWLY FOUND, and it is the same bug in a second tool: `_hudedge.mjs:139`, `:160` and `:177` compute
  `sat` as `(mx-mn)/max` of an ALREADY-AVERAGED rgb**, i.e. `meanCast` under the name `sat`, exactly as
  `_px.mjs:96` did. `rimTop` / `rimBot` / `box` / `bands` `sat` therefore all carry the defect. The
  live hold `rim sat split <= 0.02 (now 0.013)` is a WITHIN-FRAME DIFFERENCE of two same-hue strips of
  one graphic, so both terms carry the same bias and it is **first-order safe - but it is UNAUDITED and
  the resolver explicitly declined to rule it safe.** This is new open item 10 in §4 of the standing
  constraints.

---

## §4. DISPOSITION OF THE §4 OPEN-ITEM LIST, AND WHAT IS GENUINELY LOST

The resolver's summary line, which survives verbatim at `tools/STANDING-CONSTRAINTS.md` §4, claimed:
*"Items 2, 3, 4, 8 and 9 are RESOLVED and are no longer open ... Items 1, 5, 6 and 7 are CONFIRMED
STILL CORRECTLY PARKED ... Two new items, 10 and 11, were opened by the resolver's own evidence."*

Session 15 checked each of those claims against what actually survives on disk. Result:

| item | resolver's claim | does the substance survive? |
| --- | --- | --- |
| 1 (`boost-blur` variance) | still parked | yes - untouched, still open, still owned by boost |
| 2 (`daytime-downtown-04` anchor) | RESOLVED | **YES** - fully, see §2 above |
| 3 (historical `_px sat`) | RESOLVED | **YES** - fully, see §3 above |
| 4 (which percentile targets move) | RESOLVED | **YES** - fully, see §1 above |
| 5 (shard field / dust veil) | still parked | yes - untouched, still open |
| 6 (`chromeMat`/`rimMat`/`discMat`) | still parked | yes - untouched, still open |
| 7 (dusk ratios after registration) | still parked | yes - untouched, still open |
| 8 (five files with no wave-P hash) | RESOLVED | **NO - see below** |
| 9 (retired-anchor prose in the tree) | RESOLVED | **YES, by action in the tree - see below** |
| 10 (`_hudedge` `sat`) | newly opened | **YES** - the finding survives in §3 above |
| 11 (unidentified) | newly opened | **NO - see below** |

### Item 9 - RESOLVED BY ACTION, and the evidence is the tree itself

Item 9 was "prose in the tree still citing retired anchors: `crash.js:2130-2148` and
`_stripemeas.mjs:11-16`". **Both prose blocks have in fact been rewritten and now state the
retirements correctly.** Session 15 read both, read-only:

- `tools/_stripemeas.mjs:13-25` now opens with "`!! anis IS RETIRED. DO NOT QUOTE IT AND DO NOT SET A
  TARGET ON IT. !!`", gives the `sqrt(H/W)` null with the 1.10 / 1.83 shape figures, cites
  `verdicts/wave-p/car-paint.md` and `verdicts/wave-q/car-paint.md`, and names `anisAC1`/`anisAC3` plus
  the `-0.08` 960 null and the mandatory `tools/_anisonull.mjs` pass as the replacement.
- `game/crash.js:2133-2150` now opens with "`!! READ THIS BEFORE YOU TOUCH THESE NUMBERS. THE
  JUSTIFICATION THAT USED TO BE WRITTEN HERE RESTED ON A RETIRED REFERENCE ANCHOR. !!`", names the
  chain-link-fence anchor `crash-cam-01 --patch 0.00,0.30,0.63,0.73` with its `meanContrast -7.6` and
  98.2% drop rate, states the direction was INVERTED, and points at the replacement anchor
  `crash-cam-04 --patch 0.229,0.333,0.620,0.722`.

So item 9 is closed, and `tools/STANDING-CONSTRAINTS.md` §0 ANCHOR 1's line "Still uncorrected in the
tree" was stale; session 15 has corrected that line in place.

**FORENSIC NOTE, FOR THE `game/crash.js` FORENSIC AGENT, offered as a hypothesis and not as a
finding.** `tools/WAVE-R-ADDENDUM.md` §0 and `STATE.md` record `game/crash.js` as an anomaly: edited at
08:36 with no round-13 agent owning it, leading hypothesis "`boost-fx` leaving a debris-bypass patch in
place as temporary instrumentation". The `crash.js:2133-2150` prose block above is a **comment-only
edit that does exactly what §4 item 9 asked for**, and item 9 was the resolver's item. The simplest
explanation of the 08:36 mtime is therefore **the resolver fixing item 9's prose in `crash.js`, not a
builder leaving instrumentation.** This does NOT clear `crash.js` - a comment edit and a constant edit
can sit in the same save, and the forensic agent must still verify every constant against
`verdicts/wave-p/crash-cam.md` and `wave-q/crash-cam.md`. Session 15 did not touch `game/`.

### Item 8 - UNSUPPORTED-EVIDENCE-LOST. THE ITEM REVERTS TO OPEN.

Item 8 is "`camera.js`, `main.js`, `physics.js`, `scenes.js`, `util.js` carry no wave-P hash in any
verdict. All five are plausibly untouched but nobody has asserted it (`wave-q/boost-fx.md`)."

The resolver's summary line asserts this item was resolved. **No trace of that ruling survives
anywhere on disk** - not in the `tools/STANDING-CONSTRAINTS.md` amendments, not in `STATE.md`, not in
any `verdicts/` file, and there is no md5 table for those five files in the tree. A resolution of item
8 necessarily consists of five hashes plus an assertion, and none of the five exists.

**Status: UNSUPPORTED-EVIDENCE-LOST.** Session 15 has NOT reconstructed a ruling and has NOT computed
substitute hashes (hashes taken in session 15 would prove nothing about the wave-P window, which is
what the item is about). **Item 8 is restored to OPEN in `tools/STANDING-CONSTRAINTS.md` §4 and must be
re-done by whoever next needs it.** Do not read the resolver's summary line as licence to treat those
five files as cleared.

### Item 11 - UNSUPPORTED-EVIDENCE-LOST. ITS IDENTITY IS UNRECOVERABLE.

The resolver's summary line says **two** new items were opened, 10 and 11. Item 10 is recoverable
without ambiguity: the `_hudedge.mjs:139/:160/:177` `sat` defect in §3 above ends with "it is unaudited
and I am not ruling it safe. See section 4", which is an explicit hand-off to the open list.

**Nothing on disk identifies item 11.** No second surviving amendment sentence hands off to section 4,
and the open list itself stops at item 9, so the resolver was killed before it wrote either new item
into the list.

**Status: UNSUPPORTED-EVIDENCE-LOST.** For the record, and explicitly NOT as an attribution, the two
loose ends in the resolver's own surviving evidence that a later agent might reasonably have promoted
to an open item are (a) damage's `sat` band needing re-derivation around `satPx` 0.175 (§3) and (b)
whether `-04` can serve as a registered dusk anchor for `dusk-highway-chase` given that one is a
street and one is a highway (§2). **Neither is item 11; the resolver's item 11 is simply gone.**
Session 15 has recorded item 11 in `tools/STANDING-CONSTRAINTS.md` §4 as
`UNSUPPORTED-EVIDENCE-LOST` rather than filling it with a guess.

---

## §5. WHAT THIS RECONSTRUCTION DID NOT DO

- **Did not re-measure anything.** No render, no `_px.mjs` run, no `_hudedge.mjs` run. Every figure in
  §1-§3 is a transcription.
- **Did not touch `game/`.** Four builders were concurrently editing `game/sky.js`, `game/boost.js`,
  `game/road.js` and `game/audio.js` while this file was written. `game/crash.js` was read, read-only,
  for the item 9 check in §4.
- **Did not audit the `_hudedge.mjs` `sat` defect** (new item 10). It is recorded as open, exactly as
  the resolver left it.
- **Did not verify the `_px.mjs` md5 `6b0e73db0aa999c527ab6fdd7cba5b7f` against the tool on disk.**
  `tools/_px.mjs` sits in a tree that four builders are actively editing, so a hash taken now would not
  be attributable to the resolver's window either way. The md5 is quoted as the resolver quoted it.
- **Did not edit `STATE.md` or `tools/WAVE-R-ADDENDUM.md`.** Both still describe
  `verdicts/wave-r/resolver.md` as "never written", which was true of the original agent and is now
  stale as a description of the tree. Whoever next updates `STATE.md` should note that the file now
  exists as a labelled reconstruction.
