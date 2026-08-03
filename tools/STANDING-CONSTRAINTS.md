# STANDING CONSTRAINTS

Canonical list of RETIRED and CORRECTED targets, metrics, tools and reference anchors.
Every builder and every critic is briefed with this file path.
Read it in one pass before you open your piece's verdict, and do not chase anything listed here as dead.

**How to read an entry.** Each one states what is retired, the one-line proof, and what REPLACED it.
Many targets were restated as BANDS rather than deleted; that distinction is load bearing and is called out per entry.
Entries marked **OVERTURNED** were retired once and then un-retired, or retired for a reason that later proved wrong; a stale retirement costs exactly as much as a stale target.

**Precedence.** Wave Q (critic sweep) supersedes wave P (builder round) wherever the two disagree, and any conflict between sources is flagged inline with both readings.
`STATE.md`'s wave-P and wave-Q blocks are a summary of these same verdicts; where `STATE.md` and a verdict file disagree, the verdict file wins and the disagreement is noted below.
Never read `STATE-HISTORY.md`.

---

## 0. RETIRED REFERENCE ANCHORS. READ THIS SECTION FIRST.

A broken reference anchor is more dangerous than a broken tool, because it steers the DIRECTION of the fix rather than just the score.
Three have now been found, in two waves, and two of them had been driving fixes for three waves each.

### THE RULE THEY PRODUCED, AND IT IS NON-NEGOTIABLE

**Crop every reference anchor with `tools/_cropimg.mjs` and LOOK at it before you quote it.**
Pass a huge grid pitch (`100000`) when you want an un-annotated crop for a blind read (`wave-q/sky-lighting.md`).
`_cropimg.mjs` takes PIXELS, not fractions, and silently writes a 0-byte PNG if you give it fractions; this has now cost three separate rounds (`wave-p/sky-lighting.md`, `wave-q/sky-lighting.md`).

### ANCHOR 1 (RETIRED) - the chain-link fence. `crash-cam-01 --patch 0.00,0.30,0.63,0.73`.

The `majMed 4.3 px / areaMed 6` anchor that every crash target descended from contains NO debris and NO sparks.
Cropped and looked at, it is chain-link fence diamonds, a rusted stanchion, and the hero car's dazzle livery reading "SPEED" (`wave-p/crash-cam.md`, independently re-cropped in `wave-q/crash-cam.md`).
Its `meanContrast` is **-7.6**, i.e. the population is DARKER than its surround, and sparks are additive so they cannot be; the sign alone falsifies it.
Drop rate on that patch is **98.2%** (`wave-q/crash-cam.md`).
**Consequence: the briefed direction was INVERTED.** Against a clean 0%-drop anchor our sparks are 3-10x too SMALL and 3x too DIM, not 6x too large.
**RETIRED with it:** `patch A density 4.6 -> 10.1 per 1e4 px`, `areaMed 47 -> <=15`, `length p50 12.52 -> 8-12 px`.
**REPLACED BY:** `crash-cam-04 --patch 0.229,0.333,0.620,0.722`, crop-verified as ten separated golden-orange streaks with near-white cores on black road, 0% drop, contrast **+60.5**. That anchor is VALID and endorsed (`wave-q/crash-cam.md`).
**NOW CORRECTED IN THE TREE, and this line is no longer a to-do (was: "still uncorrected"):** `crash.js:2130-2148` used to cite this dead anchor as the justification for `s.streak 0.045 -> 0.012`, and `_stripemeas.mjs:11-16` used to advertise its own retired anchors as live. Both prose blocks were rewritten by the wave-R resolver and read correctly today - `crash.js:2133-2150` now opens with a "THE JUSTIFICATION THAT USED TO BE WRITTEN HERE RESTED ON A RETIRED REFERENCE ANCHOR" warning naming the fence patch, its `meanContrast -7.6` and its 98.2% drop, and `_stripemeas.mjs:13-25` now opens with "`anis` IS RETIRED. DO NOT QUOTE IT". Both were re-read in session 15 (`verdicts/wave-r/resolver.md` §4, item 9). This closes §4 item 9.
Also STRIKE from any brief the surviving sentence "our chips are 6x the reference area before boost ever touches them" (`wave-q/boost-fx.md` item 5).

### ANCHOR 2 (RETIRED) - the shattered windscreen. `refFlank 0.156,0.292,0.278,0.389` on `crash-cam-03`.

The `ref 0.648` behind damage's target 2 is the white car's **shattered windscreen, cabin interior and floating debris**, not an intact flank (`wave-q/damage-model.md` §3b).
Cropped and looked at; `p99 222.7` with 4.96% of pixels over 200 is the giveaway, that is specular glass and not a body panel.
So `ref 0.648` = (bonnet inner face) / (broken windscreen), and the band 0.55-0.70 that wave P hit was never a paint-to-paint ratio.
The statistic also swings **6x** on the choice of cc03 denominator (roof 205.6 / green flank 57.6 / shadow flank 34.9) and **2.2x** on ours (yellow 105.1 vs red 47.7), because its denominator is a body-colour luma and the reference car is white.
**RETIRED: `bonnetInner p50 / intactFlank p50` and its 0.648 anchor.** Eighteenth retirement.
**REPLACED BY:** `bonnetInner p50 / full-frame p50`, band **1.00 .. 1.35** (cc03 68.2/57.2 = 1.192; ours 61.3/85.1 = 0.720). The whole frame cannot be the wrong object and is invariant to body colour.

### ANCHOR 3 (RETIRED, CAMERA-SCOPED) - the traffic light. `daytime-downtown intactFlank 0.60,0.70,0.45,0.53`.

At the `damage-shot.mjs` DEFAULT camera this region contains no car at all: hazy storefronts, "OPEN 24 HRS" and "GOLDSTARS" signage, a green traffic-light pole (`wave-q/car-paint.md` §8).
Paired control: `setLevel(0.75)` and `setLevel(0.95)` return **bit-identical** statistics, which a region containing the car cannot do.
**But the retirement as first issued was itself wrong, and this is a live conflict you must get right.**
`wave-q/car-paint.md` retired the region by scene and level while omitting CAMERA, and instructed damage to substitute `car-paint-closeup`'s 47.7.
`wave-q/damage-model.md` §3a (written later, and it cropped both) proves that at **CAM-D** = `--cam "3.9,1.6,4.2|0,0.75,0.3|40"` the same region IS the hero car's yellow rear quarter panel, and it moves 6.2% with damage level (112.0 -> 105.1).
**CURRENT STATUS, later source wins:** the retirement is UPHELD at CAM-0 (`damage-shot.mjs` default) and INVALID at CAM-D.
The wave-P instruction to substitute `car-paint-closeup`'s 47.7 into a `daytime-downtown` numerator is void; use same-frame ratios only.
`STATE.md`'s bullet "the only valid denominator is `intactFlank` p50 = 47.7 ... supersedes BOTH the 46.3 and the 105.1 figures" is the car critic's version and is SUPERSEDED by the damage verdict above.
**A damage denominator is a FOUR-parameter quantity: scene, level, camera, and the tool revision that measured it.**

---

## 1. CROSS-CUTTING. THESE BIND EVERY PIECE.

### 1a. `_px.mjs:60` PERCENTILES WERE WRONG ON SMALL AND 32-MULTIPLE-WIDTH REGIONS. NINETEENTH. **NOW FIXED - READ THE AMENDMENT AT THE END OF THIS SUBSECTION FIRST.**

`_px.mjs:60` pushes a luminance sample only when `(n & 31) === 0`, where `n` is a raster-order pixel counter.
When the region's pixel width is a multiple of 32 the sampled set collapses to a **fixed set of 5-7 columns**, identical on every row (`wave-q/damage-model.md` §5).
Paired synthetic control, same population both times: a 12.5%-bright comb reports **`40/40/40`** at one column phase and **`240/240/240`** at another, against a true `40/40/240`. One pixel of extra width restores the correct answer.
Real-frame magnitude is **+/-4%**, which is LARGER than the scale-persistence deltas several pieces have quoted as proof, and it is invisible to A/B repetition: "A1 == A2 to the digit" is a deterministic subsample being deterministically wrong.
**RETIRED: `_px` p01/p50/p99 as tail statistics on any region whose pixel width is a multiple of 32.**
**REPLACED BY, in priority order:** (1) fix the sampler to a 256-bin histogram over every pixel; (2) until then use `sub40` / `sup200`, which are whole-population and control-verified correct; (3) if a percentile must be quoted, quote it beside the same region one pixel narrower and treat the spread as the error bar, and treat a >5% disagreement as unusable.
`rgb`, `sub40` and `sup200` are CLEAN in every control cell; only the percentiles are broken.
**Every piece quotes percentiles through `_px`. Fixing the sampler and re-deriving every live percentile target is a prerequisite for wave R, not housekeeping** (`STATE.md` EXACT NEXT ACTION item 0).

**AMENDMENT, WAVE R. THE SAMPLER IS FIXED AND THE AUDIT IS DONE; MITIGATION (3) ABOVE IS RETIRED AS UNSOUND AND THE TRIGGER ABOVE IS TOO NARROW.**
`_px.mjs` went md5 `be244cafe4297b22429622ab63fe0833` -> **`6b0e73db0aa999c527ab6fdd7cba5b7f`**. The strided sampler and the array sort at `:60` are replaced by a **full-population 2551-bin histogram at 0.1 luma** (`_px.mjs:45-62`), same 0-based nearest-rank convention, and **`p10` / `p90` were added**. 32 figures were re-measured at each report's own scene / level / camera with the old and the new tool on the same PNG (`verdicts/wave-q/px-percentile-audit.md`). **Nothing in the live target set flipped**, so mitigation (1) is DONE, (2) remains valid, and percentiles are now exact and width-independent so no error bar is needed. Two corrections you must carry:
- **RETIRED AS UNSOUND: mitigation (3), "quote the percentile beside its one-pixel-narrower twin and treat the spread as the error bar, >5% is unusable."** Paired: on `bonnetTight` at `daytime-downtown` / L0.95 / CAM-D the 192 / 191 / 193 px triple read **105.5 / 107.4 / 105.5** on the old tool - a **1.8%** spread that PASSES its own <5% gate - while the true full-population value is **108.6**. **Two wrong samples agreed.** The twin-quoting rule is a false comfort and is superseded by the fix; `wave-q/damage-model.md:288-289` and `:343`, which issued it as binding, are retired with it.
- **CORRECTED: "width is a multiple of 32" was the worst case, not the trigger.** ANY small region was suspect regardless of phase. HUD `road` (`0.9315,0.9345` -> **6 px** wide at 1920) is not a 32-multiple, but at 6 px x 81 rows the old sampler kept **15 samples in total**, so its p01/p99 were percentiles of fifteen numbers, and its `p99` moves **122.9 -> 129.9 (+5.7%)** on the fix.
- **CORRECTED MAGNITUDE: the real-frame error is NOT `+/-4%`.** Measured against the true population rather than against one other arbitrary sample, the worst errors are **+15.1%** (`bonnetTight` p99, `dd` / L0.75 / CAM-D, 110.9 -> 127.7) and **-10.4%** (`bonnetTight` p50, `car-paint-closeup` / L0.75, 81.0 -> 72.6), with -7.2% and -7.0% behind them. The wave-Q critic understated the defect by roughly 4x.

### 1b. `_px` `sat` IS `meanCast`, NOT SATURATION. AND `_px` WAS MUTATED MID-SWEEP.

`_px.mjs` averaged R, G, B over the whole region and only then took `(max-min)/max`, so it measured the region's average colour CAST.
Paired control on three synthetic images: a red/cyan 1 px checker, the most chromatic image possible, scores **0.000**; a flat grey scores 0.000; a flat tint `(110,128,120)` scores **0.141**, higher than either reference HUD card (`wave-q/hud.md`).
Wave P's ruling "keep the tool and just rename the metric" was **REJECTED** on the grounds that renaming does not stop the next builder satisfying it by tinting (`wave-p/hud.md` proposed the rename; `wave-q/hud.md` overruled it).
**REPLACED BY:** `_px` now prints a real per-pixel `satPx` alongside a relabelled `meanCast`, plus new `sub40` and `sup200` columns. Quote `satPx` as primary, `meanCast` only as a secondary, and never call `meanCast` saturation.
**PROCESS HAZARD:** `tools/_px.mjs` was mutated TWICE by a concurrent agent during the wave-Q sky audit (07:23 and 07:29) and its output columns changed mid-report (`wave-q/sky-lighting.md`).
On smooth sky regions `meanCast` and `satPx` agree to <= 0.005, so no wave-P or wave-Q sky figure is affected, but **`sat` is now an ambiguous word across reports.**
**Every report from here must state which `_px` revision it used** (the wave-Q revision is md5 `be244cafe4297b22429622ab63fe0833`).
**Tool edits fall under the peer-md5 rule exactly like `game/*.js` edits.**

**AMENDMENT, WAVE R. THE HISTORICAL `sat` FIGURES ARE AUDITED. THE DIVERGENCE TRIGGER IS HUE DIVERSITY, NOT SMOOTHNESS - AND THE SAME DEFECT LIVES IN A SECOND TOOL** (this amendment IS the record; `verdicts/wave-r/resolver.md` §3 is a session-15 RECONSTRUCTION transcribed from these very lines, not an independent source - see the note at the end of §4).
- **CORRECTED MECHANISM: `meanCast` and `satPx` part company in proportion to the region's HUE diversity, and are almost blind to its LUMA spread.** "Smooth sky regions" was the right conclusion for the wrong reason. Paired on the frozen references: `daytime-downtown-04`'s `roadLit` and `roadShadow` patches agree to **0.001 / 0.015** despite a 111->251 luma span, and the sodium `s` box `0.75,0.82,0.46,0.48` agrees to **0.000** (0.498 / 0.498) even though its p99-p01 is **29.9** and it contains power lines, three lamp heads and a tower-block edge. Meanwhile the whole-frame and facade-band regions of the same images diverge by **0.20 - 0.30** (dd-04 `full` 0.130 vs **0.432**; dd-02 `band` 0.249 vs **0.450**), because opposed hues cancel in the region mean and cannot cancel per pixel. **Test the region for mixed hues, not for flatness.**
- **CLEARED, all of them: every sky `sat` figure in waves K-Q.** Re-measured with `_px` `6b0e73db` on the frozen `reference/dusk-highway-chase-01.jpg` (`rz`, `rvalley`, `rmid`, `rs`, `rs2`, `m00`) and on the frozen `shots/_q-sky-1.png` (`z`, `valley`, `v1`, `v2`, `mid`, `s`, `s2`): every reference row agrees to **<= 0.001**, and on our side the worst is `v1` **0.199 -> 0.212 (+0.013)** with `mid` +0.004 and all others <= 0.001. `v1` carries no target. The live `valley` band 0.19-0.27 is on a region that agrees to 0.001. **The 2a sodium hold gate and its "our 0.498 vs ref 0.500" are unaffected by the definition** - they remain retired-as-a-reference-match for the population reason already stated, which is a different fault.
- **VOID AS SATURATION, ALREADY REPLACED, no action: HUD `minimap sat` band 0.085-0.100 and the wave-P scored HIT at 0.094** (`wave-p/hud.md:142`, `:196`). The minimap card is firmly in the divergent class: `meanCast 0.150` vs `satPx 0.188` in `wave-q/hud.md:158`, and **0.041 vs 0.111 (2.7x)** on `shots/hud-r8-final.png` re-measured this wave. Superseded by `satPx` **0.170-0.210** in 2g; nothing to re-derive.
- **NOT VOID, BUT ITS ANCHOR IS CORRECTED AND MIS-CENTRED: damage's guard `sat 0.10-0.18 (ref 0.138)`**, scored HIT at 0.110 (`wave-o/damage-model.md:61`, `wave-p/damage-model.md:158`). Re-measured on frozen artefacts: cc03 `refInner 0.5833,0.6771,0.3704,0.5741` goes `meanCast 0.138` -> `satPx` **0.175 (+27%)**, and ours `bonnetTight 0.26,0.38,0.285,0.355` goes 0.110 -> **0.123** at L0.95 and **0.099 -> 0.157 (+59%)** at L0.75. **The pass survives** (0.123 is inside 0.10-0.18) **and the direction is unchanged - we are less chromatic than cc03 - but the gap grows 1.5x, from 20% below the anchor to 30% below it, and the band is now mis-centred with the reference sitting near its ceiling.** Damage must re-derive the band around **0.175** in the same report that re-issues it, and quote `satPx`.
- **NOT IN THIS CLASS, do not "fix" them: `_facademeas.mjs:97` and `_tm-measure.mjs:53/:86` accumulate saturation PER PIXEL and are already true `satPx`.** `_facademeas` band `sat` was retired four times over for what it MEANS, not for how it is computed; that retirement is untouched by this audit.
- **NEWLY FOUND, and it is the same bug in a second tool: `_hudedge.mjs:139`, `:160` and `:177` compute `sat` as `(mx-mn)/max` of an ALREADY-AVERAGED rgb**, i.e. `meanCast` under the name `sat`, exactly as `_px.mjs:96` did. `rimTop`/`rimBot`/`box`/`bands` `sat` therefore all carry the defect. The live hold `rim sat split <= 0.02 (now 0.013)` is a WITHIN-FRAME DIFFERENCE of two same-hue strips of one graphic, so both terms carry the same bias and it is first-order safe - **but it is unaudited and I am not ruling it safe.** See section 4.

### 1c. THE ANISOTROPY-NULL CLASS. TWO TOOLS, SAME DEFECT, BOTH RETIRED.

A statistic built as `rms(colMeans) / rms(rowMeans)` has an isotropic null of `~sqrt(H/W)`, not 1.0, because a column mean averages `H` samples and a row mean averages `W`.
It is therefore REGION-SHAPE DEPENDENT and cannot be compared across regions of different aspect.

- **`_stripemeas.anis` - RETIRED** (`wave-p/car-paint.md`, independently re-proven in `wave-q/car-paint.md` on three separate grounds). Null is ~1.10 at the 90x81 patch and ~1.83 at the 81x35 patch, so the old target `hi anis <= 1.30` demanded that ours score below the null of a differently-shaped patch. It also scored a confirmed fix as a 39% regression at 960.
  **REPLACED BY:** `anisAC1` / `anisAC3`, lag-1 / lag-3 column-minus-row autocorrelation of the detrended residual. Forced vertical comb -> +1.12 to +1.18 at both patch shapes; forced horizontal comb -> -1.10 to -1.16; isotropic -> ~0; a pure shading ramp is unchanged from isotropic.
- **`_bandmeas.ratio` as a bare anisotropy target - RETIRED, seventeenth** (`wave-q/road-surface.md`). Three independent isotropic synthetic fields score **0.29 / 0.25 / 0.38**, never 1.0, in the d5 region.
  **REPLACED BY:** `anisN = ratio / null(region)`, with `null` measured by the paired control at IDENTICAL region args, plus an explicit statement of which axis you mean (`ratio > 1` = row-coherent = TRANSVERSE cross-road banding; down-road streaks score 0.05).

**NEW TOOL, and it is mandatory: `tools/_anisonull.mjs`.**
`synth` writes the isotropy-null controls; `skew --region x0,x1,y0,y1 <files>` reports the sparsity metric.
**Run every new anisotropy statistic through it before issuing a target.**

**Two further caveats on `anisAC3` specifically** (`wave-q/car-paint.md`):
- Its null is **-0.08 +/- 0.02** on the 44x42 patch used at 960, not 0.00 +/- 0.02, and sensitivity drops ~40% there. Null-correct the 960 number, or measure the same 90x81 PIXEL patch at 960 by widening the fraction.
- `anisAC` is NOT cross-quotable between our PNGs and the reference JPEGs; JPEG smoothing correlates the residual in both directions at near-unity (ref-04 `acX1 0.881`). Judge it A/B internally and by eye.
- `anisAC3` is a NORMALISED correlation and therefore amplitude-blind. **Never quote it without `resRMS` beside it.**

### 1d. ONE-SIDEDNESS AND SELF-ANCHORING. SWEEP EVERY TARGET FOR BOTH.

Six one-sided targets were caught in wave Q alone, several of which the BEFORE state already passed, and one target was anchored to our own previous leg-A value rather than to the reference.

- A one-sided target scores an overshoot PAST the reference as a clean pass. Audio moved centroid 3351 -> 1754 against ref-01's 2151 and the `<= 2500` ceiling called it a hit (`wave-p/audio.md`, ruled in `wave-q/audio.md`).
- A one-sided target can be a rubber stamp. hud's `<16 >= 7%` and `bottomRail >= 22% barH` were both already passed by the A leg (`wave-q/hud.md`).
- A self-anchored target pins the build to its own history. Audio's `0.25-0.45 s centroid = 1898` was OUR OWN leg-A value with ref-01's 1911 quoted only in parentheses (`wave-q/audio.md`).
- Legitimate one-sided targets exist and are not covered by this rule: genuine clipping limits (`solo peak < 1.0`, `busy peak < 1.0`) and audibility floors (`busy guard >= +3 LU`).

**State every target as a BAND anchored on the reference unless it is a physical limit.**

### 1e. EVERY NOMINATED NEXT GAP SHIPS WITH A KILL-CONTROL.

**Seven** nominated next gaps have now turned out to be the wrong object.
The kill-control is one render and it settles the question before a wave is spent.
Worked examples: environment's fill tint moves cSpread by **+0.17%** when fully achromatised (`wave-q/environment.md` §7a); car-paint's lit-window strip moves `anisAC3` 0.271 -> 0.280 with all 14 meshes hidden, i.e. nothing (`wave-q/car-paint.md` §5); damage's `buckle 0.052 -> 0.020` moves p50 inside the tool's own error bar and moves the ratio AWAY from target (`wave-q/damage-model.md` §6).

### 1f. A CORRECT NUMBER ATTACHED TO A WRONG CAUSE IS ITS OWN FAILURE MODE.

Three wave-Q critics reproduced their builder's figures exactly and then overturned the explanation (car-paint, audio, crash-cam).
A wrong cause sends the next wave at the wrong file.
**Verify the story, not just the statistic.**

### 1g. RULE 5 NOW EXTENDS FROM CONSTANTS TO MEASUREMENTS.

A number presented as a probe must NAME the probe that produced it.
Damage's "diffuse ceiling 105.5 / 112.9 at albedo 1.0, AO 1.0" was never measured; those two numbers are the shipped B leg's own p99s, quoted from the report's own tables (`wave-q/damage-model.md` §2b).
Forced white actually measures **160.5 / 158.5**.

### 1h. THE `+/-0.04` RENDER-NOISE CONSTANT IS DEAD. DETERMINISM IS 0.00.

`post.js:606-621` built the SSAO kernel and its rotation-noise texture from unseeded `Math.random()`, so two boots of the same build differed in **69.9-71.9%** of `daytime-downtown` pixels at max delta 120 (`wave-p/environment.md` §2a, `wave-p/post-determinism.md`).
FIXED: `post.js:36` imports `makeRng`, `:470 SSAO_SEED = 0x5A0A5EED`, and both `Math.random()` sites now draw from it. No SSAO tuning constant was touched.
Proven NOT a quality change: the before leg was run n=6 cold and every after value lands strictly inside the before range with none at an edge.
**Measured frozen-tree noise post-fix is `0.00` on every `_facademeas` metric across all four presets at n=3 each**, including the integer band-pixel count, with `<= 0.005%` of pixels and `<= 9/255` as the honest pixel-level caveat.
The old constant was wrong by ~55x on `dark%`.
**Paired A/B now costs 2 renders, not 8.** Keep paired A/B anyway: cross-piece coupling is a different hazard and has not gone away.
The residual ~100 pixels sit in rows y=654-687 at delta 1 and are GPU rasterisation tie-breaks under ANGLE/Metal, not JS entropy; the agent explicitly did not claim byte-identity and that distinction is the behaviour to reward.
Grep audit of `game/` found exactly two render-affecting entropy sites and both are fixed; `main.js:362 performance.now()` is deliberately left because it sits after the `if (shotMode) ... return` at `main.js:307-327`.
**Consequence: any conclusion that rested on a single unseeded render is void, in either direction.** `before-dd5` alone would have read as a -3.5 point `dark%` regression on a frozen tree with nothing changed.

### 1i. DENOMINATORS, RATIOS AND ABSOLUTES.

- **Any headline ratio MUST name its reference file and exact region/radius args.** (Standing since session 11.)
- **Every ratio denominator must be quoted with scene AND damage level AND camera AND tool revision.** Scene alone was wave O's rule and it was not enough; scene+level was wave P's and it was not enough either (`wave-p/damage-model.md`, `wave-q/damage-model.md` §9).
- **`_debrismeas` absolutes are not cross-quotable between agents. Quote RATIOS across reports, and state whether the frame is spark-isolated or a beauty frame** (`wave-p/crash-cam.md`, `wave-q/boost-fx.md`).
- **`_smearmeas` `maxSmear` and `aniso` are not cross-quotable either - see 2c.**
- **The car-probe irradiance handoff is the RATIO 1.136, never the absolute `lum`.** Two harnesses following the same written method differ by 2.1x (`wave-q/car-paint.md` §7).

### 1j. PROCESS: MTIME, PEER HASHES, AND WHAT VOIDS A PAIR.

- **Render AFTER the final save and quote the file mtime beside the md5.** `road.js`'s mtime (05:39:33) was AFTER its pair-of-record's last render (05:32:29), so the shipped bytes were never the measured bytes (`wave-q/road-surface.md`).
- **An mtime mismatch is a trigger to re-verify, not an automatic void.** Both `damage.js` and `world.js` had later mtimes than their pairs and both pairs SURVIVED on md5 plus a reproducing render (`wave-q/damage-model.md` §0, `wave-q/environment.md` §0). Settle this class of question with `diff`/`md5`, never with mtime alone.
- **A CRASHED BUILDER CAN LEAVE UNMEASURED EDITS IN THE TREE.** This happened to audio and it had shipped a silent regression. Every builder's FIRST act: diff your file against the last verdict's quoted literals, and if the tree contains edits no verdict explains, re-derive them from scratch and say so.
- **Sky must quote its own file's md5.** `wave-p/sky-lighting.md` quotes only a peer digest that excludes `sky.js`, so its own file was not rule-5 auditable (`wave-q/boost-fx.md` item 7).
- **`audio.js` has ZERO imports and its harnesses load it alone. The peer-md5 protocol is DROPPED from the audio brief** (`wave-q/audio.md`). First piece to earn structural decoupling. Keep the `audio.js` md5 itself.

---

## 2. PER-PIECE. FIND YOUR SECTION.

### 2a. SKY-LIGHTING

- **SUSPENDED: every row target anchored on frame fraction (`z`, `valley`, `v1`, `v2`, `mid`).** The reference horizon sits at y **0.593-0.602** and ours at **0.5077**, a 3-5 deg unregistered elevation offset that is LARGER than `ARCH_EV` itself (`wave-q/sky-lighting.md` §"TOOL AUDIT 2"). Registered, the "PASSED" zenith row INVERTS: from R +5 too bright / sat too low, to R **31 too dark** / sat **0.171 too high**. **No sky constant may change before the frames are registered in elevation.**
- **RETIRED as ARCH targets: `z` "R within 6 of 56.5" and `z` "sat >= 0.38".** Paired control: deleting the arch entirely (`msBeam: 0.0`) scores **61.3 R / sat 0.406**, BEATING the shipped 61.5 / 0.404 on both. A target that scores best with the feature removed does not measure the feature. They may survive as whole-sky targets after registration.
- **OVERTURNED / RETIRED: "`ARCH_EV` is not tuned because every value in 3.0-8.0 deg passes."** Wave P read the flatness as evidence the parameter is irrelevant (`wave-p/sky-lighting.md`); wave Q re-reads it as the arch's ABSENCE at that elevation, worth 0.2/255 of authority there (`wave-q/sky-lighting.md` item 2). Measured upper edge is 8-12 deg (12 deg fails the R gate at 64.2). Do not re-issue the flatness as evidence of anything.
- **RESTATED: the `s` sodium-row anchor is a HOLD GATE ONLY, never a reference match.** Our box has p99-p01 = **30.1** (power lines, three lamp heads, a tower-block edge); the reference's is **2.3** (pure sky). "our sat 0.498 vs ref 0.500" compares two different populations. Use `s2 = 0.75,0.82,0.435,0.450` and crop it first.
- **DEMOTED, not retired: the dusk cloud deck.** Real and reproduced (valley sat 0.136 -> **0.261** with the decks at 0), but worth 0.125 sat on one 4%-tall row and **7 R** everywhere else, against a 94 R (frame-fraction) or 137 R (registered) deficit at `mid`. Ranking it as "the single biggest gap" was the scoreboard talking.
- **RETIRED as a fix: the wave-O brief's proposed fix #2** ("evaluate `pa` against the arch's own low-elevation direction"). Implemented exactly as written it moves the 20.8 deg row 72.4 -> 72.8. Its fix #1 was already in the code as `1-exp(-sdep/ARCH_HSH)` (`wave-p/sky-lighting.md`).
- **RETIRED, carried forward from wave O and still binding: the "22x red ramp" target.** The builder's own bound was arithmetically wrong (`sin21/sin1.5` is **13.7x, not 3.3x**), so the retirement rests instead on the wave-O critic's `scatter()` replica, which matches the shipped LUT to 3 dp: sweeping `msBeam` 0 -> 50 **asymptotes at 10.5x** while blowing the 21-deg row to code 179 against the reference's 85.
  **REPLACED BY** row-level RGB targets read from `dusk-highway-chase-01.jpg` columns `x=0.66,0.74` against ours at `x=0.55,0.65` - and note those row anchors are themselves SUSPENDED until the horizon is registered, per the first entry in this section.
- **SHIP `ARCH_HSH`-adjacent `Hsh = 0.80`. DO NOT REINSTATE 0.10 - but the numbers originally given for rejecting it were wrong, and both halves are recorded so a later wave that catches the bad numbers does not read them as licence.** Over all 192 LUT rows the NS-drift is 3.49 levels at 0.10 against 0.94 at 0.80, i.e. 3.7x worse but **converged either way**, so the quoted "zenith 65 -> 69 -> 73" does NOT reproduce; and the quoted "136-level hard step" does not reproduce at all, because the max adjacent-row step is **6.01 at 0.10 against 7.81 at 0.80**, making 0.10 the *smoother* of the two.
  **The honest ground that does stand, and the only argument to use:** a 100 m gate inside a 785 m layer, marched at a ~0.55 km minimum step, is unresolved by construction.
- **CORRECTED LINE REFS, and the wrong ones propagated into `STATE.md`:** `warmL` is `sky.js:815` NOT `:771`; `coolL` `:796` NOT `:752`; `alto/cirrus` `:1042` NOT `:1032`; `low` `:1049` NOT `:1041` (`wave-q/sky-lighting.md` item 7).
- **TREE DEFECT, uncorrected:** `sky.js:992-993` claims the post-change sodium row is `210.9,187.4,109.1 sat 0.483`; it renders `210.3,185.1,105.6 sat 0.498`.
- **TOOL FIXED AND VERIFIED: `_skyprobe --noclouds` had NEVER worked in any wave.** `#shot=1` returns without an animation loop (`main.js:326`), so the screenshot was always the pre-mutation frame (`wave-p/sky-lighting.md`, twelfth broken tool). Fixed at `_skyprobe.mjs:66-77`. **Any past claim resting on a `--noclouds` render is VOID.** The fix is independently verified by a null-mode control that is byte-identical to `shot.mjs` (`wave-q/sky-lighting.md`).
- **CROSS-PIECE RE-BASELINE, re-derived from the live engine LUT and confirmed to 0.6%.** Relative to the tree wave O measured: upward cosine irradiance **0.938x (-6.2%)**, sunward horizontal-normal **0.910x (-9.1%)**, upward B/R 1.69 -> 1.83, sodium band's own linear radiance **1.166x UP**. Wave O's "+1.075x" is CANCELLED; B is **1.008x** of the pre-arch tree. `exposure` 1.30 and `skyGain` 0.55 untouched, verified by grep. **Caveat: if the registration finding is acted on, these move again and by much more than 6-9%.**
- Any sky claim must state its LUT `u`. The measurement column x 0.55-0.65 sits at u = 0.1132 (20.4 deg off the sun), not u = 0.5, and the arch's gain profile reads very differently at the two.

### 2b. ROAD-SURFACE

- **RETIRED (upheld, re-proven independently): the `D` scale-persistence clause `|D@1920 - D@960| / mean < 12%`.** `_bandmeas.mjs:79-88` computes `hfRms` over a fixed 5x5 PIXEL box while `:76` angular-corrects only the 1-D band radius, so the clause is screen-locked. On the reference's own unchanged pixels `D_ref@1920 = 0.469` vs `D_ref@960 = 0.980`, a **70.5%** move against a 12% clause. A photograph cannot alias. Do not re-issue it, on road or anywhere else.
  **REPLACED BY:** per-band `P = hf@960 / hf@1920` compared against the reference's OWN per-band P (ref 1.957/1.858/1.797/0.961/0.938). Mean `|P - P_ref|` moved 0.717 -> 0.510. A flat 0.69-0.92 profile is the aliasing signature.
- **RETIRED OUTRIGHT, not retargeted: `D = d1/d5 in 0.55-0.85`, AND its proposed successor band 0.40-0.55.** We measure 0.462 against `D_ref` 0.469, within 1.5% of the plate; reaching 0.55 needs d1 15% PAST the photograph (`wave-q/road-surface.md`). Wave P recommended retargeting to 0.40-0.55 (`wave-p/road-surface.md`); wave Q deleted it instead, because D is a ratio of two fixed-pixel-box readings at two different `pxAlongM` and carries no information the per-band values do not.
  **REPLACED BY per-band absolute bands:** d1 **4.8-6.5**, d2 **4.2-8.0**, d3 **4.0-8.5**, d4 **10.5-13.5**, d5 **10.0-13.5**, max over d1..d5 **<= 13.0**.
- **RETIRED: `_bandmeas.ratio` as an anisotropy target - see 1c.** This voids road's own nominated next gap three ways: normalised against the measured 0.29 null, ours is 5.1x isotropic against the reference's 9.8x (a 1.9x gap, not an infinite one); `ratio > 1` means TRANSVERSE banding, the opposite axis from the "down-road sheen" that was quoted; and ref-01's row structure there is **water ripple and the headlight-pool edge**, not aggregate. **NO ANISOTROPY TARGET IS SET.**
- **OVERTURNED: "native 960 is correct mip behaviour, flagging not fixing."** Wave P declined to fix it as physically correct (`wave-p/road-surface.md`); wave Q **OVERRULES that and calls it a bug**, now a gate (`wave-q/road-surface.md`). B at native 960 undershoots its own supersampled truth by **64% / 56%** at d4/d5 where the pre-change build matched to 2%; `chipRes` decays ~2.8x faster than the `1/px` mip law. Plus an unreported **+11.3%** resolution-dependent road brightness shift (A: +3.6%), which is a grade shift, not a detail budget.
  **REPLACEMENT GATE:** every band's native value within 25% of its supersampled value, and the d5 region mean within 4%. **Fix the falloff law; do NOT add a viewport term** - the knees are already correctly in m/px and a viewport term just re-tunes 960 by hand. This supersedes the wave-P note that "if the game ships below 1920 the knees need a viewport term."
- **CORRECTED: `pxAlongM` is 0.0399 / 0.0252 / 0.0174 / 0.0128 / 0.0097 m/px for d1..d5**, measured from the live camera matrix and independently re-derived in closed form to within 3-5% (`wave-p/road-surface.md`, `wave-q/road-surface.md`). The wave-O brief's estimates were 1.4x / 2.1x / 2.4x too small at d3/d4/d5. **Derive from geometry, never from frame fraction.**
- **CORRECTED: road's own "+/-0.04 noise floor" invocation is void.** Determinism is 0.00, so its d4/d5 "tie at 0.02" was a real inversion, merely small. The conclusion survives because the reference inverts the same pair in the same direction by 0.48.
- **STANDING, PRESERVED: measure resolution-matched.** `sips -Z 1920` the reference first. Corrected ref-01 anchors: dark **12.48**, bright **12.00**, ratio 1.04. The old smear-length gap is a RESOLUTION ARTEFACT and stays retired.
- **STANDING, PRESERVED: `wet-night-asphalt-01` is the bar; `-02` is motion-blurred and sets no numeric target.**

### 2c. BOOST-FX

- **RETIRED (metric 17): `_smearmeas` `maxSmear` and `aniso` as ABSOLUTE, cross-image quantities.** Ground-truth control on our own nofx frame: a known **78 px** blur reports 34.9 and a known **40 px** blur reports 11.4, so the estimator is not even proportional; a jitter-only change that cannot lengthen a kernel swings it **29%** (77.8 -> 54.9); and `aniso` is `maxSmear` divided by a `minSmear` pinned at 1.3-2.9 px in all eight images measured, ours and reference alike, i.e. **one number quoted twice** (`wave-q/boost-fx.md`).
  Boost's wave-P headline "maxSmear 78 vs ref 62.4, aniso 40 vs 33.7" does not survive as stated, and the whole figure is **one spark occupying 4% of the patch** - the spark-free 90% of P1 reads maxSmear **1.6 px** against the reference's **79.0**.
  **REPLACED BY:** `maxSmear` kept only as (a) a within-image A/B on identical content, (b) in a sub-patch verified free of isolated bright objects, and (c) alongside an ideal-blur control built from that round's own nofx frame. Never quote `aniso` beside `maxSmear` as independent evidence.
- **OVERTURNED / REJECTED: "hpRms ratio <= 1.2 is unreachable by construction; state it ABSOLUTELY."** Wave P restated the target absolutely and the restatement was accepted at the time (`wave-p/boost-fx.md` correction 1); **wave Q rejects BOTH halves** (`wave-q/boost-fx.md` rulings 1 and 4).
  (a) An ideal 78 px radial blur about the exact declared focus, on the same nofx frame with the same 1.15 input, scores ratio **0.36**. A convex average of taps SPREADS the content it drags in, so it lowers patch HF. The residual 1.87 is the single spark; the spark-free 90% already scores **0.39**.
  (b) "fx hpRms must not exceed ref-02's 5.26" is one-sided, and we sit **59% BELOW** it while the pass is a SINK in five of six patches (P3edgeR 6.48 -> 3.94, P5roadR 1.39 -> 0.38). P1 is the only patch above 1 and it is the emptiest one.
  **REPLACED BY:** a BAND on the ratio measured in the spark-free sub-patch P1a, **[0.25, 0.70]**, with an ideal-blur control rendered every round as the band's floor.
- **RETIRED, UPHELD, BUT ON REPLACED REASONING: `radSmear >= 12`.** Wave P's reason was "a focus of expansion ref-02 does not share" (`wave-p/boost-fx.md`). **That reason is wrong on our side:** `0.504,0.508` is our own `uFocus` to four decimals. The real defect is that the patch subtends **38 degrees** of radial angle against `radSmear`'s ~+/-10 deg acceptance, so it is an angle-agreement test with a cliff, not a length; an ideal radial blur about the exact focus scores only 5.8 there (`wave-q/boost-fx.md` ruling 2). The reference end IS a foreign-focus reading, so both ends are invalid for two different reasons. `radSmear` is still valid where the patch is angularly narrow (`P2roadL`: ours 17.1, ideal control 27.2).
- **VOID, NOT RE-ISSUED: the whole wave-O "density 4.6 -> 10.1 / areaMed <= 15" cross-piece family.** Patch-A absolutes are road paint in every agent's frames: with the spark mesh HIDDEN, patch A still scores **17 of 21 blobs and 6.29 of 6.71 fill** (`wave-p/crash-cam.md`, re-confirmed in `wave-q/boost-fx.md` and `wave-q/crash-cam.md`). Only visible-minus-hidden deltas are spark-attributable.
- **RESTATED, AND BOOST IS NOT CLEAR: the cross-piece is not settled.** Boost LIVE still deletes **34%** of the spark-attributable blob population (68 -> 45 in patch S) and **42%** of the spark-attributable contrast (+7.2 -> +4.2). The comb-fusion artefact crash was blocked on IS gone; the mean-branch damage is not (`wave-q/boost-fx.md` item 6).
- **BOUND ON WHAT BOOST CAN FIX, hand this to road-surface:** lengthening the kernel cannot produce the reference's grainy bands because there is no grain to smear. Relative HF in the spark-free sub-patch: ref-02 **post-blur 5.95%**, ours **pre-blur 2.46%**, **post-blur 1.03%**, which is ~1.3 LSB, at the 8-bit quantisation floor. A filter cannot add grain.
- **STANDING, PRESERVED: the 6.5:1 plume aspect target is RETIRED** - it was measured off the HUD BOOST BAR in `boost-blur-04`, not a flame; real flames there are ~1.9:1. **The depth gate is VERIFIED GOOD.**
- **CONFLICT, unresolved:** the preserved note "this scene has +/-6% run-to-run variance, render twice" predates the SSAO seed fix. Post-fix noise was measured at **0.00** on four presets, but `boost-blur` was NOT one of them (`wave-p/post-determinism.md` §5). See section 4.

### 2d. AUDIO

- **RETIRED: `--cent 0 0.25 <= 2500 Hz` as a target.** One-sided; it scored a 397 Hz overshoot PAST the reference as a clean pass.
  **The proposed replacement band 1900-2400 is ALSO REJECTED** (`wave-q/audio.md`): the centroid and the tilt are one degree of freedom measured twice at **195 Hz of centroid per dB of tilt**, so 1900-2400 is 1.6x TIGHTER than the tilt tolerance it duplicates and contradicts it on the shipped build. The reference-consistent band would be 1761-2541 and adds nothing.
  **REPLACED BY:** the centroid is a REPORTED DIAGNOSTIC, not a target. Print it; do not score it.
- **RETIRED: `0.25-0.45 s centroid = 1898`.** Anchored to our own leg-A value, with ref-01's 1911 quoted only in parentheses.
  **OVERTURNED: the builder's self-scored MISS on it is WITHDRAWN.** Against ref-01's 1911 +/- 390 the shipped 1731 PASSES. It was never a miss (`wave-p/audio.md` scored it MISSED; `wave-q/audio.md` withdrew it).
- **RESTATED: `over20`'s time half, `>= +30 ms` -> `+30 to +70 ms`.** One-sided; it would score a +350 ms peak as a clean pass. ref-01 is +39. ref-02's +123 belongs to a doppler swish-by and must not widen the band.
- **CORRECTED: "the pink swap took the contiguous hold 160 -> 0 ms" is FALSE.** This appears in `wave-p/audio.md` and was propagated into `STATE.md:55` as a project-level lesson. Paired control across three builds: pink + BODY with the thump UNTOUCHED holds **160 ms**; the collapse to 0 requires **`THUMP_PK 0.55 -> 0.42`**, the constant wave P itself cut (`wave-q/audio.md`). The MECHANISM claim survives and is confirmed in both directions: the LF thump sets the first 20 ms and `THUMP_STEP` is the hold knob. The transferable lesson is sharper as corrected: a level cut on the layer that owns the first two frames is invisible to a peak-seeking metric.
- **CORRECTED: the nominated onset-impact gap is NOT cross-piece and NOT headroom-blocked.** Busy peak is **0.9279** with boost and **0.9272** without, so the entire boost layer moves it 0.007 dB and the busy peak is set by the engine/crash bed, not the ignition. `THUMP_PK 0.42 -> 0.48` puts all three onset figures on ref-01 with the busy peak unchanged to four decimals and the hold at 170 ms. **`BED_TRIM` is NOT needed and the orchestrator is NOT involved. Owner: the audio builder.**
- **DO NOT RE-RUN, both null and both recorded:** control 1 (bypass `clip` + `limiter`) moves the ignition metrics by <= 0.1 dB, so `audio-isolate.mjs`'s subtraction is linear-valid and the tool is CLEARED. Control 2 (halve `IGN_OVER`) is CONFOUNDED by the sustained voice and the sidechain duck and must never be quoted as evidence of compression. Note control 1's published figures were measured on the pre-fix leg; re-anchor to +5.8 / +6.2 / +7.8 @ +39 / 150 ms.
- **ref-01 is the SOLE spectral anchor. ref-02 sets no spectral target** - it returns centroid 219 / 245 Hz, a sci-fi doppler swish an octave and a half below ref-01, and averaging the two produces a meaningless band.
- **STANDING, PRESERVED: analyse `ours-squeal.wav`, never `-solo`** (`audio-isolate.mjs:61` leaves `brake: 1` in the bed). **`_audio-verify.mjs` is a CONFIRMED false fail** - its page never constructs an `AudioContext`. **Verify in the busy mix, not only on stems.**
- **STANDING, PRESERVED:** the absolute 1e-4 onset gate stays VOID on the mp3 references; use `IGN_REL=0.1`. The 8-15 kHz band on the refs sets no target (96 kbps lowpass). `--lu` stays CHANNEL-SPLIT only until `_ignmeas.mjs:28-41` is fixed to K-weight per channel and sum per BS.1770; mono under-reports the guard by ~0.7-1.0 LU.
- Sustained-overshoot definition, unchanged: contiguous run from the DETECTED onset, non-overlapping 10 ms rms frames, >= +3 dB over steady rms (onset+1.3-1.7 s), 400 ms cap, stop at the first frame below. Hop matters as much as contiguity. Never quote total.

### 2e. CAR-PAINT

- **RETIRED: `_stripemeas` target 1 `hi anis <= 1.30`, and the ref-04 `0.56` / `0.99` anchors.** See 1c for the shape-null. The anchors were also cropped: ref-04's `hi` patch is dark roof, a hard horizontal white silhouette edge and a white/silver graphic spike with essentially no flat paint (`resRMS 16.55`, `anisAC3 -0.711`); the `sh` patch carries a shadow wedge and a diagonal graphic streak (`anisAC3 +0.521`, i.e. MORE vertically combed than ours ever measured) (`wave-p/car-paint.md`, `wave-q/car-paint.md`).
  **NO VALID EXTERNAL ANCHOR EXISTS for stripe anisotropy in this reference set.** Judge it A/B internally and by eye.
- **RETIRED: the `envMapIntensity = 0` isolation step.** It deletes **61%** of the panel's luminance, and `anisAC3` on that control reads **0.495**, the OPPOSITE of what the builder read off it (`wave-q/car-paint.md` §5). **`setCcGain(0)` is the valid form of that control** (0.271 -> 0.053 with the flake held).
- **OVERTURNED MECHANISM: `FLAKE_RGH 0.45` is confirmed a regression, but the stated reason is wrong.** Wave P said blurring the flake FUSED the mirrored bars (`wave-p/car-paint.md`). Variance decomposition against a synthetic calibration shows `FLAKE_RGH 0.22 -> 0.45` leaves comb amplitude within **5%** at BOTH clearcoat values while destroying **28-31%** of the flake: it **UNMASKS** the comb and is **not on the causal path at all** (`wave-q/car-paint.md` §3). The revert is UPHELD; do not re-try 0.45; do not carry the "blurring makes reflections more coherent" story into any other roughness decision.
- **OVERTURNED CARRIER: the comb is NOT the lit-window strip. It is `world.js:2713-2716`'s OVERPASS PIER ROW.** Wave P named the window strip (`wave-p/car-paint.md`); hiding all 14 of those meshes, verifiably gone from the frame, moves `anisAC3` 0.271 -> **0.280**, i.e. nothing. Hiding `world.group.children[141]` alone moves it 0.271 -> **0.097** with `resRMS` and mean held (`wave-q/car-paint.md` §5, reproduced to the digit in `wave-q/environment.md` §8a).
  44 concrete cylinders, r 1.5-1.7 m, 11.6 m tall, exact 60 m pitch, standing **64 m directly BEHIND the camera**, in the flank's specular direction.
  **The offending object is not on screen.** No measurement of the `car-paint-closeup` frame's own content can see it; the only valid measurement is `_stripemeas anisAC3` on the CAR's hi patch `0.1094 0.1563 0.6111 0.6852` with `resRMS` beside it.
  **WAVE R OWNERSHIP IS ENVIRONMENT, NOT CAR.**
- **DO NOT RE-USE: the wheel/rim patches** `0.2396 0.3646 0.6019 0.8241` and `0.8125 0.8958 0.5741 0.7130`. They are dominated by spoke geometry and are bit-identical across pier removal AND the clearcoat change; they cannot see a reflection. The claim that `chromeMat`/`rimMat`/`discMat` still mirror the strip is therefore UNMEASURED, neither supported nor refuted.
- **`PROBE_RES` (`car.js:1853`) is NOT the lever; do not spend a round on it.**
- **NOTED: our camera is `car-paint-closeup-03`'s (pure side profile), not `-04`'s (three-quarter front).** Waves M/N/O/P all anchored on `-04`.
- **The shipped `clearcoatRoughness 0.20` bought its win with the piece's oldest gap** and should be revisited the moment `world.js:2713` is fixed: flank split moved AWAY from target (1.09 -> 1.03 against ref-03 1.38 / ref-04 1.74) and rocker p99 fell 23%. It is still the correct call while the pier row stands.

### 2f. ENVIRONMENT

- **RETIRED: target 1, `--band 0.05,0.55` dark% >= 18.** Proved at zero noise, not argued: canyon MAXED plus `#air=0` reaches dark% **13.0** and its far-band sobel is **24.00, gate BROKEN**. Inside the gates the ceiling is **11.4** (`wave-q/environment.md` §9). The remaining 5-7 points do not exist in `world.js`.
- **RETIRED: the companion `darkAll% >= 9`.** Unreachable in-gate (ceiling 6.88) AND satisfiable by a **30% exposure pull** with nothing else changed (6.47 -> 14.94 under a flat x0.7 gain). **REPLACED BY:** `darkAll%` in **6.0 .. 8.5** with a mandatory `lum` hold.
- **REJECTED BEFORE ISSUE: `cSpread >= 90`.** One-sided; above the in-gate ceiling of 80.24 (SMOKE, every mass magenta/green); satisfiable by a x1.85 post saturation gain; and derived from a reference set quoted as 128-163 when `daytime-downtown-03` was omitted and reads **74.23**, so the real span is **74.23-163.01**.
  **REPLACED BY: `cSpread` into `60 .. 72`**, with holds far-band sobel **12-22**, `lum` **78-90** (the anti-exposure hold), `darkAll%` **6.0-8.5**, `shadow-ab` road MAD **> 12**.
  **Mandatory companion diagnostic, NOT a hold: the GREY paired control and `cSpreadR = cSpread(shipping)/cSpread(GREY)`** (currently 1.380, verified gain-invariant to 2.5%). If `cSpread(GREY)` itself rises by more than 1.15x the gain came from a global chroma knob and the result is VOID. Do NOT require `cSpreadR` to rise; a light-side fix correctly lowers it, and requiring it to rise is exactly the mistake `_stripemeas.anis` made for three waves.
- **ACCEPTED: `cSpread` as the metric.** Correct null (0.89 at zero chroma), correct contraction under an additive cast (-52%), monotone in paint with the haze frozen (38.41 / 53.01 / 80.24).
- **RETIRED, FOURTH INDEPENDENT DISPROOF: `_facademeas` band `sat`.** Painting every mass one flat grey RAISES it +0.040 while cSpread correctly falls 14.6. Now disproved by the `#air=0` inversion (wave O), the constant-max and constant-luminance palette variants (wave N), the wave-P GREY row, and this one. **Do not reinstate it under any name.**
  Strike with it the old brief's claim that `daytime-downtown-01`/`-02` carry "no achromatic mass": that is FALSE, measured cream sat 0.125 and white sat 0.221.
- **RETIRED: the builder's nominated next gap, the multiplicative fill tint** (`world.js:802-843`, `:2929-2933`). Fully achromatising `uFillSky`, `uFillGnd`, `uSkyWarm` and `uBounce` moves cSpread by **+0.17%** and nothing else. Seventh wrong-object find.
- **OVERTURNED: canyon occlusion moves from "unresolvable" to "DISPROVEN AND SUPERSEDED."** Wave P retired the wave-O "+0.9 dark%" figure as unresolvable inside the unseeded-SSAO noise band (`wave-p/environment.md` §6). Wave Q DISAGREES with that framing and resolved it in two deterministic renders: canyon MAXED buys **+0.6 dark% / +0.41 darkAll%** and COSTS **6.5% of cSpread** (53.01 -> 49.54) (`wave-q/environment.md` §9). The wave-O conclusion (occlusion is not the lever) was right, the number was 0.9 and is really 0.6, and the chroma cost was never recorded. **Leaving it labelled "unresolvable" invites someone to reopen it; it is measured and closed.**
- **CORRECTED: the wave-P rule-4 clearance on `world.js:954` is FALSE.** "`de <= dist` so no term gains range" compares the wrong pair of quantities: what reaches the consumer is `uHazeD * de`, and `uHazeD` rose 1.367x at the same time, so `tau_new/tau_old` asymptotes to **1.367x** with a peak mix excess of **+0.0137 at 292 m** (`wave-q/environment.md` §3b). The 200 m fixed point is real (crossover 199.55 m) and this is a defect in the ARGUMENT, not a shipped regression.
  **Binding restatement: a renormalisation holds ONE point fixed and does not make a gain harmless. State which point is held and give the ratio at BOTH extremes of the domain.**
- **RETIRED for atmosphere comparisons: `_facademeas dark%`.** Its denominator is the non-sky population and the sky mask `(B-R) >= 8 && luma >= 110` is fed by the scene's own blue airlight; the band population moves **566271 -> 619694 px (+9.4%)** across nothing but an airlight change, and reaches 831351 px at `#air=0`. **REPLACED BY `darkAll%`** (fixed rectangle). `dark%` is not comparable across any airlight change, including the entire wave-O `#air` table.
- **RESTATED: scale persistence for this piece runs on the A/B DELTA, natively rendered.** Absolute `dark%` is NOT scale-stable (10.8 at native 1920 vs 8.9 at native 960, 17.6% disagreement, outside the 10% gate); the DELTA is stable to within 0 (+2.9 at both). A `--normw 960` downsample is a resampling test, not a rendering test.
- **CORRECTED, cross-piece: "hiding the pier row changes no visible pixel" is FALSE.** It changes **11.06%** of the `car-paint-closeup` frame, 0.20% by more than 8/255, max delta **51**, all on the car. It also changes `dusk-highway-chase` (max **146**), `crash-cam` (max 72) and `daytime-downtown` (max 68). **DO NOT DELETE THE MESH** (`wave-q/environment.md` §8b).
- **CORRECTED, cross-piece: the prescribed pier lever is the WRONG one.** Jitter saturates at **-17% by +/-8 m** and buys nothing further out to +/-24 m; per-pier height/radius VARIATION is a clean null (0.275 vs 0.271). **The carrier is occluded solid angle, not the 60 m pitch** (`wave-q/environment.md` §8c). `anisAC3` is a vertical-streakiness statistic, not a periodicity statistic.
  **Validated arms:** radius x0.5 -> 0.151, and it is INVISIBLE in `daytime-downtown` (0.0059% of pixels, max 4/255, zero above 8/255); radius x0.45 + jitter +/-12 m + every third pier dropped -> 0.130.
  **RESTATED: car-paint's T1 band `-0.05 .. +0.12` is unreachable without deleting the mesh** (mesh-hidden floor 0.097, best non-destructive arm 0.130). Wave R band is **`anisAC3` 0.09 .. 0.17** with `resRMS` 5.5-6.1 and mean 80-85.
- **DIAGNOSTIC TO REPORT, not yet a target: the bulk chromaticity deficit is in the MEDIAN, not the tail.** Block-distance quantiles: ours p50 **29.8** / p90 122.5 against dd-03 56.0 / 125.1 and dd-04 113.6 / 214.0. Our p90 is already inside dd-03's. A palette edit that adds a few hero masses moves p90 and p99 and will NOT move p50, which is why wave N's palette round scored nothing.
- **STANDING, PRESERVED: the 19-21 street-band sobel target is RETIRED as a camera artefact.** Shadows are ALIVE. Mirrored signs are FIXED.
- **STANDING, PRESERVED, struck by wave K: STOP USING `shadow-ab` TO REASON ABOUT PADS.** Its `meanOn` has run-to-run variance of 1.0 and facade-MAD variance of 0.24 and cannot resolve the pad effect at all. Keep it ONLY as the do-not-regress gate: road MAD must stay **> 12** (now 14.82).
- **CONFLICT RESOLVED, WAVE R: the preserved line "`daytime-downtown-04` is the only reference with our camera" is FALSE AND STRUCK. `-04` IS A DUSK / BLUE-HOUR FRAME AND ANCHORS NOTHING PHOTOMETRIC IN A DAY SCENE** (the entries below ARE the record; `verdicts/wave-r/resolver.md` §2 is a session-15 reconstruction of them, and its §2b adds an independent session-15 crop check that CONFIRMS the ruling: `-04` is a static low three-quarter-front hero shot of a stationary car, so it fails "our camera" on shot type before photometry, and its lamp head has no emissive core. `wave-q/environment.md` §1 and §9 UPHELD; `reference/INDEX.md` lines for BOTH `-02` and `-04` corrected in place).
  Pixels, not prose. Zenith `0.05,0.95,0.00,0.05`: `-04` reads **0.5,36.3,59.4** luma p50 **34.4**, **99.97%** of pixels under luma 40, R = **0.5/255** so B/R = **119**; `-01` (high noon) reads **53.3,133.7,180.1** p50 **122.2** at the identical region. Clean-sky patches: `-04` `0.30,0.75,0.01,0.09` = 1.6,44.8,72.1 p50 **36.7** against `-02` `0.28,0.37,0.01,0.10` = 62,118.8,142.6 p50 **108.4**, i.e. **3.0x darker**. The illuminant is the horizon glow: `-04`'s near-horizon sky `0.42,0.52,0.44,0.49` is 229,218.8,214.7 with **100%** of pixels >= 200, so zenith->horizon luma runs 36.7 -> 221.6, a **6.0x** gradient against `-02`'s 2.1x. No sun disc: lit road `0.06,0.14,0.83,0.88` p50 **166.2** against the car's own cast shadow `0.30,0.40,0.86,0.92` p50 **134.6**, ratio **0.81** - a 19% darkening with a shapeless soft penumbra. Lights not yet on: the street-lamp head (crop `1380 1750 330 520`) has no emissive core and no light pool, and the headlights and the tower's "R R" sign are unlit. **Late civil twilight under heavy aerial haze.** The "hazy" half of the old label was right.
- **RULING, WAVE R, on what `-04` may still anchor: nothing photometric and nothing geometric in a `daytime-downtown` brief.** It may not anchor luma, chroma, sobel, `dark%` or any row-fraction target for a day scene. Its chroma figures are blue-hour-grade numbers and must be read as such wherever they appear - `cSpread 128.14`, band `sat` 0.556, and the block-distance row p50 **113.6** / p90 214.0 in the DIAGNOSTIC entry below. **`daytime-downtown-03` (74.23 / p50 56.0 / p90 125.1) is the operative day-scene comparison in that table, not `-04`.** `-04` survives only as (i) a source of time-of-day-independent qualitative observations at its own grade - aerial-perspective falloff shape, clearcoat and chrome behaviour, the soft-occlusion contact gradient - and (ii) a CANDIDATE, not an endorsed, dusk anchor for dusk pieces; it is a downtown street and `dusk-highway-chase` is a highway, so anyone using it that way must crop and register first.
- **CAMERA SITUATION, RULED: `daytime-downtown-02` is the shot-type match and `-01` the lighting-class match. NEITHER is a row-fraction match, and this is a NEW caveat wave Q did not state.** Ours is a chase cam straight down a downtown boulevard, buildings both sides, gantry route signs, vanishing point at **y 553/1080 = 0.512** (consistent with 2a's 0.5077). `-02` is the same shot type and subject scale but is pitched UP and its boulevard crests over a hill, so it has **NO visible horizon at all**: the lane lines converge at **y ~935/1080 = 0.866**. `-04`'s ground horizon is ~**0.67**. **Therefore no frame-fraction row anchor may be taken from `-02` either**, for exactly the reason 2a suspended the sky rows. Note also that `-02`'s traffic lights and car headlights ARE lit, so it is late-afternoon low sun, not midday.

### 2g. HUD

- **RETIRED: minimap `p99` as a card metric.** The outer region's p99 is pinned by a fixed HUD graphic (177.7 to the decimal across three separate bakes), so a p99 over a 77k-pixel region is one element (`wave-p/hud.md`, ruled in `wave-q/hud.md`).
  **REPLACED BY `sup200`, the % of region pixels at luma >= 200, band 2.5-4.0%** (refs 3.26 / 3.72; A 6.37%, B 0.51%). **The regression is real and LARGER than p99 made it look: B threw away 92% of the card's bright area and sits 6.4x below both references.** Drive the recovery from sunlit roof faces and pale plaza/parking fills, NEVER from `ROAD_FILL`.
- **RETIRED as a one-sided rubber stamp: `<16 >= 7%`.** The BEFORE state already scored 15.37%, more than double the floor. **REPLACED BY the band 4.0-11.0%** (refs 4.35 / 10.6; ours 13.22% is now a MISS on the high side). Companion `<40` band **31-36%**.
- **RETIRED as one-sided: `bottomRail >= 22% barH`.** **REPLACED BY the band 24-28%** (refs 24.5 / 26.8; ours 27.8%, near the top of the reference band).
- **RETIRED: `_hudlick` ratio band `0.60-0.80`.** It was set on a broken metric and is 2.9x wider than the reference spread. `_hudlick.mjs:85` read `bandMed(cy1 + barH*1.5, cy1 + barH*1.75)` = y1144-1163 in a 1080 frame, and `bandMed` returns 0 on an empty band, so `thrBot` was silently EXACTLY `plateau/2` on every image ever measured.
  **FIXED, not merely documented:** the default bottom base band is now **0.35-0.60 barH**, in frame on all three images, and the tool prints an explicit `IN FRAME: true/false` line (`wave-q/hud.md`).
  **REPLACED BY the re-derived band 0.63-0.70** (refs 0.63 / 0.69; ours 0.65, a real pass). The conclusion survived the tool fix; the target did not.
- **OVERTURNED: wave N's "bottomRail and the tear ratio cannot both be hit" is FALSIFIED and retired.** 27.8% barH at ratio 0.65 on the corrected metric, with rim sat split 0.013 (`wave-p/hud.md`, verified in `wave-q/hud.md`). They were antagonistic only because both were driven through contour excursion; a graded sub-50%-alpha foot laid AFTER the fray widens the 10-90 span without moving the 50%-of-plateau crossing the contour tracer follows. **A false "impossible" cost this project a wave.**
- **FORBIDDEN: card `hfRms` against a JPEG reference.** The hud critic's own texture hypothesis died to its control: ref03 card hfRms 23.73 vs ours 10.69 looks like a 2.22x deficit, but a flat non-HUD patch of each image reads 12.56 vs 5.88, a **2.14x noise-floor offset** that accounts for essentially all of it. Self-normalised, card/flat is 1.89 vs 1.82. `tools/_hfpatch.mjs` is kept for **paired within-image ratios only**.
- **NULL RESULT, do not re-run: `FRAY_BOT_A` is no longer a lever on the bottom rail's tear.** 0.45 -> 0.33 -> 0.26 moves bot rmsHF by 0.01 total; the excursion is set by `LICK_BN`.
- **KEEP `_hudlick`, and always print `thr` beside the ratio.** Wave N tried to explain our 1.68 tear inversion as the tool's threshold gap (135.1 vs 122.2) and wave O disproved it: every image carries the same-signed bias and **ours is the LEAST biased of the three** (ref-01's 158.1/122.2 gap of 36 is handicapped 2.8x harder and still measures top-torn-harder). A smaller-than-reference threshold gap is CONSERVATIVE, so it can never manufacture a pass. The builder's control render remains real evidence, but of an asymmetry in our own additive halo rather than in the tool.
- **Always normalise `_hudedge` widths to `barH` and STATE THE barH SOURCE** - `_hudedge` and `_hudlick` use different boxes.
- **STANDING, PRESERVED: HUD is structurally incapable of being graded** (separate DOM canvas layer).

### 2h. DAMAGE-MODEL

- **OVERTURNED, AND THIS IS THE MOST IMPORTANT ENTRY IN THE PIECE: the wave-P proof that targets 1 and 2 are MUTUALLY EXCLUSIVE is WITHDRAWN.**
  Wave P proved unsatisfiability from a "diffuse ceiling at albedo 1.0 / AO 1.0" of p99 **105.5 / 112.9** and concluded `p50` caps at 37.0 against target 2's required 57.8, recommending retirement (`wave-p/damage-model.md`).
  **Those two ceiling numbers were never measured; they are the shipped B leg's own p99s, quoted from the report's own tables.** Measured properly, with `partUnder`'s maps stripped and colour forced white, the ceiling is **160.5 / 158.5** (`wave-q/damage-model.md` §4).
  Corrected arithmetic: `(160.5 - 28.9) / 2.30 = **57.2**` against target 2's `0.55 x 105.1 = **57.8**`. **57.2 vs 57.8, within 1%: marginal, NOT incompatible.**
  **CURRENT STATUS: target 1 is RESTATED as population-safe bands, NOT retired.** Report `bonnetTight sub40 %` and `sup200 %` as a pair, band **8-15% / 0.2-1.2%** (cc03 `refInner` 11.43% / 0.58%; ours 8.65% / 0.00%). **Do NOT re-issue `>= 2.30`.** If a ratio is still wanted after `_px`'s sampler is fixed, use `(p90-p10)/p50` and re-derive the anchor from cc03 in the same report that issues it.
- **RETIRED: `bonnetInner p50 / intactFlank p50` and its 0.648 anchor - see ANCHOR 2 above.**
- **RETIRED: `_px` p01/p50/p99 on 32-multiple-width regions - see 1a.** All three damage regions are exactly that at 1600x1000 (`bonnetTight` 192 px, `bonnetInner` 224 px, `intactFlank` 160 px).
- **STAYS RETIRED, upheld and grade-owned: `p01/p50 <= 0.30`.** Our frame p01 is **25.7** with **0.00%** of pixels under luma 16; cc03's frame p01 is **4.0** with **9.36%** under 16. **Do not target the dark tail; it belongs to the grade owner, not to `damage.js`.**
- **UPHELD, do not re-try: the metal-flange-in-ORM-`.b` negative result.** `bonnetTight` p99 105.4 -> 89.6, i.e. 15% worse, because the sky dome's radiance along the reflection vector is dimmer than its irradiance. Fully reverted and annotated in-file at `damage.js:877-885`. **Read the "15% worse" as DIRECTIONAL, not exact** - it is a p99 delta on a column-aliased region.
- **NOT ENDORSED: the builder's nominated next gap, `damage.js:972 buckle 0.052 -> 0.020`.** Tested one-variable and reverted byte-exactly: p50 61.3 -> 59.5 (inside the tool's own error bar), the ratio moves AWAY from target, and the crop barely changes. The two folds carrying every large light and dark band are `:976 crease` and `:977 bend`, and the case for touching them is an eye case, not a metric one.
- **UPHELD: wave N's standing results.** `envMapIntensity 2.0` at `:914`, structure in albedo plus an ORM `roughnessMap`, no `metalnessMap` - all verified present and unmodified.
- **UPHELD: the wave-P sub-tessellation constraint.** The bonnet slab is `slabGeo(24, 18, ...)`, so **any feature narrower than `du = 0.042` in u or `dv = 0.056` in v must live in the 512-px maps, never in the `ribs` displacement callback.** The wave-M/N rib web violated this and that is measurably where the "crumpled foil" read came from; the diagonal braces were `ribTent(...,0.042)`, one vertex across, emitting grid-aligned displacement noise.
- **UPHELD: `tools/damage-shot.mjs`'s `--w/--h` fix is live** at `:36-38` (`const vpW = Number(args.w) || 1600`), default 1600x1000 preserved so historical fractional regions stay comparable.
- **STANDING, PRESERVED: crush depth is 0.2834 / 0.6414 / 0.7545 m at levels 0.4/0.7/0.95** (29042 verts, rest 4.7500, tail pinned at -2.3750). **The colour problem is in `car.js`, not `damage.js`. Render only via `tools/damage-shot.mjs`.**
- The eye gate ("at most ONE longitudinal box section legible") is MET and credited; the rib web is genuinely gone. But "the web is gone" and "the plane reads as a plane" are two different gates and only the first has been passed: cc03's inner face has three HARD edges on a mid-grey plane and ours is a uniformly soft near-black undulating sheet. **The gap moved; it did not close.**

### 2i. CHASE-CAMERA (piece retired, passed the bar - these constraints still bind anyone measuring it)

- **STANDING, PRESERVED: the contact-line "geometric lock" is RETIRED.** It was only locked with height fixed.
- **Corrected targets:** depression **0.29-0.30**, roof-to-horizon gap **7.8-8.8%**, contact **0.769-0.771**, car height **~20.5% to the roof PANEL**.
- Depression is scene-generic: it is a ratio of offsets from the horizon, so focal length, resolution and aspect all cancel.
- **Always state whether you measured the roof PANEL or the topmost point, on BOTH images.** Conflating them is what produced two successive wrong targets.
- Note that `wave-q/sky-lighting.md`'s horizon-registration finding (2a) applies to any future frame-fraction row anchor here too, since depression is measured against the horizon.

### 2j. CRASH-CAM

- **RETIRED: `_debrismeas meanContrast` as a spark brightness target.** Paired control, the one nobody ran: a **5x** increase in emitter radiance moves it only **21.6 -> 27.1**, because the blob is defined by a `|L-bg| >= 12` mask and raising brightness RECRUITS marginal edge pixels faster than it raises the interior. On a population 1.4 px wide almost every pixel is a partial-coverage edge pixel (`wave-q/crash-cam.md`).
  **REPLACED BY:** diff-image `p90/p99/max` percentiles over the patch (`/tmp/q-sparkdiff.mjs`), no threshold, no mask, no components. Paired-control-verified monotone across the same 5x radiance sweep. Or `meanContrast` computed on the visible-minus-hidden DIFFERENCE image only.
- **OVERTURNED: the re-derived target "contrast 22.1 -> 45+" is ITSELF RETIRED as stated.** Wave P derived it (`wave-p/crash-cam.md`) from a beauty frame whose mask is 94% road paint. On a properly spark-isolated difference image we are at **37.0**, not 22.1, against a reference band of **45.0-60.5**. **The gap is 1.3x, not 3x.** The direction is right; the factor is not.
  **REPLACED BY the band [45, 60]** on the isolated difference image, plus a peak-luma band p90 **[95,125]** / p99 **[140,158]** / max **[155,185]**.
- **RETIRED IN BOTH DIRECTIONS: spark ASPECT as a cross-frame target.** Wave P said "already met, do not chase" (geometric 9.18 vs reference 8.37); **that is REJECTED as stated** because it compares our GEOMETRIC quad aspect against the reference's IMAGE-BLOB aspect. Method-matched on the isolated difference image ours is **4.42** against 8.37, a 1.9x shortfall. But it is also not actionable: at `widPx p50 1.426` our streaks sit on the resolution floor where AA and the MSAA resolve pin the measured minor axis near 1 px. **Neither end is scale-free. Do not issue an aspect target for sparks at this framing in either direction.** The quad aspect is correct; the image aspect is not measurable; drop it (`wave-q/crash-cam.md` item 3).
- **RETIRED BY NAME, and this is the field-level form of the aspect entry above: `_debrismeas aspMed` and `aspP90`.** `aspMed` is decoupled on spark patches - with the sparks HIDDEN it scores 2.82 and visible 3.12, so it is measuring debris, not sparks. `aspP90` was nominated in wave N as its replacement and then **INVERTS under boost LIVE** (4.9 sparks-visible against 5.3 sparks-hidden), so it is valid only at `uAmount = 0` and is not safe in the shipping render. Bare `aniso` on boost patch 1 is retired with them; the old 3.02 there was stipple.
- **DO NOT USE: `addedLumaPerPx` / spark density between `crash-cam-04` and our `crash-cam`.** Reference 11.9-14.0 against ours 0.147-0.165; that 80x is a framing and shower-density difference, not a defect.
- **`--maxpx 4000` DELETES THE SUBJECT on a real spark field.** On `crash-cam-04`, removing maxpx moves fill **3.17% -> 66.28%** at an unchanged 63-64 blob count: the field percolates into one component holding 63% of the patch. **Always print `dropPct`. A `dropPct > 50%` on either end means you are measuring the sieve - throw the measurement away.** Reference drop rate was 95.2% against ours at 1.4%; the two sides were never comparable.
- **`_debrismeas`'s mask was UNSIGNED** and accepted dark blobs as readily as bright ones. `--sign pos|neg|both` and a `dropPct` column were added; defaults unchanged and every prior number reproduces exactly.
- **OVERTURNED: `r <= 1.10` rested on a disproven premise, and the ceiling has now been RE-DERIVED.**
  Wave N's stated reason for `r 2.8 -> 1.10` was that 2.8x additive clipped the authored `pow(v,2.2)` taper. The render target is `HalfFloatType` (`main.js:107-111`) with `NoToneMapping` (`main.js:75`), so 2.8 was stored as 2.8 and NOTHING CLIPPED (`wave-p/crash-cam.md` correction 3).
  **"The old reason was false" is not "restore the old number."** Three independent bounds (`wave-q/crash-cam.md`): overshoot - at `r 3.30` our p99 169.3 and max 187.7 EXCEED the reference band 146.9-151.5 / 156.0-178.2, capping `r` at ~2.6; taper crush - diff-image `p99/p50` goes 14.9x / 12.2x / 10.0x / 7.6x at r 1.10 / 2.2 / 3.3 / 5.5, which is the **ACES shoulder, a smooth version of what wave N wrongly called a clip**, capping `r` at ~2.3; pointlessness - +7.7% p99 for +67% radiance past 3.3.
  **DERIVED CEILING: `r <= 3.3` hard, usable band `[1.9, 2.6]`, recommended 2.2.** Two independent statistics converge on 2.2. **The shipped 1.10 is HALF the floor of that band; the old 2.8 was nearly right, for entirely the wrong reason.**
- **RAISING `r` WILL NOT BUY GLARE, and this is bug-class rule 4 again.** The bloom prefilter is a 4-tap box at +/-1 full-res texel evaluated at HALF resolution (`post.js:64-71`, `:325-327`, `:353`) against a `widPx p50 1.426` streak, so **the effective knee for a sub-2 px feature is ~2.2 HDR, not the nominal 0.55**, and full weight needs ~4.0, above the entire derived ceiling. Paired control: 5x radiance grows the core 358 -> 1057 px and **SHRINKS** the glare band 603 -> 487 px. Glare requires the streak to be wider than the prefilter's footprint, or a `post.js` change.
- **STANDING, PRESERVED: the dust plume and DOF are later rounds. The scene captures at `simTime 0.9`, inside the slow-mo beat.**
- `uSpeed01` is **exactly 0** in `crash-cam`, so the speed-line branch contributes nothing there; the real levers are the `lenPix` speed floor and the `bb` gate.

---

## 3. THE TRANSFERABLE LESSONS. RE-READ BEFORE BRIEFING ANYONE.

**Session 11's lesson, preserved verbatim in substance.**
Three separate pieces were found optimising a number that had come loose from the thing it was supposed to represent: the car glass matched p99 while reading as corduroy (p90 was 52% hot), the boost's spectral sweep scored perfectly on level-blind ratios while sitting at -50 dB and inaudible, and the boost plume was stretched to 6.5:1 to match what turned out to be a HUD graphic.
**Always pair the metric with the eye (or the ear), and make the critic name the reference region so the next round can re-derive it.**

**The dominant bug class, now seen from four sides.**
A quantity outside the range its CONSUMER can represent.
Seen as a producer too large (the rib web below its own tessellation, `wave-p/damage-model.md`).
Seen as a consumer too narrow (the arch's few-degree source in a molecular phase function spanning only 2:1 over the whole sphere, `wave-p/sky-lighting.md`).
Seen in the spatial domain (a 12.5 x 1.4 px quad forcing isotropic LOD 5.5 on a 64x64 texture, so all 64 authored rows collapsed into two alpha values, `wave-p/crash-cam.md`).
Seen in the post chain (a half-res 4-tap prefilter that cannot represent a 1.4 px streak, `wave-q/crash-cam.md`; a 0.17 screen-px-per-metre minimap drawing lane dashes authored at 0.522 px/m, `wave-q/hud.md`).
**Do the rule-4 range check BEFORE you write the gain.**

**A builder retracting its own scored win is the behaviour to reward.**
Boost disowned its wave-N "P 0.57 -> 1.36 win" as part 2 of the bug it was fixing.
Road voluntarily voided its own confirming A/B pair when `audio.js`'s md5 moved inside the window.
Car-paint voluntarily voided FIVE pairs.
Post-determinism distinguished "I removed all JS nondeterminism" from "the image is byte-stable" instead of rounding it to a pass.

---

## 4. UNRESOLVED - NEEDS A RULING NEXT WAVE.

These are genuinely ambiguous across sources or explicitly left open. Do not guess; get a ruling.

**WAVE R RESOLVER PASS, AS AUDITED IN SESSION 15. Items 2, 3, 4 and 9 are RESOLVED and are no longer open; their rulings are recorded above in place and transcribed in full in `verdicts/wave-r/resolver.md` (a labelled RECONSTRUCTION - see the note at the end of this section). Items 1, 5, 6 and 7 are CONFIRMED STILL CORRECTLY PARKED with their live owners and were deliberately not touched. Item 10 is new and its evidence survives in §1b. Item 8 was claimed resolved and item 11 was claimed opened, but NEITHER RULING SURVIVES ANYWHERE ON DISK; both are marked `UNSUPPORTED-EVIDENCE-LOST` below and item 8 is RESTORED TO OPEN. The resolver's original summary line said "items 2, 3, 4, 8 and 9 are RESOLVED"; that half-sentence is the only support item 8 ever had and it is not evidence.**

1. **`boost-blur` run-to-run variance.** The preserved constraint says the boost scene has +/-6% run-to-run variance and to render twice. Post-SSAO-seed noise was measured at **0.00** on `daytime-downtown`, `car-paint-closeup`, `crash-cam` and `dusk-highway-chase`, but **`boost-blur` was not among them** (`wave-p/post-determinism.md` §5). Measure it or keep rendering twice; do not assume either way.
2. **`daytime-downtown-04` as an environment anchor.** The preserved constraint calls it "the only reference with our camera" (scoring 12.96 to our 13.83 on street-band sobel); `wave-q/environment.md` calls it a dusk/blue-hour frame, says `reference/INDEX.md`'s "hazy bright day" label is wrong, and names `-02` as our camera situation. The sobel target's RETIREMENT is not in question; what `-04` may still anchor is. **Also fix the `INDEX.md` line.**
3. **Historical `_px sat` figures where `meanCast` and `satPx` diverge.** They agree to <= 0.005 on smooth sky regions, but nobody has confirmed that no piece's scored history was built on the old single-column `sat` in a region where the two definitions part company (`wave-q/sky-lighting.md`, hazards).
4. **Which live percentile targets move once `_px.mjs:60` is fixed.** The audit has not been run. Every piece is exposed.
5. **The crash-cam shard field and the inter-shard dust veil.** It decided the wave-Q blind call and is entirely unmeasured; every patch tried so far is contaminated by the wreck body and the buildings (`wave-q/crash-cam.md`). No valid patch exists yet.
6. **Whether `chromeMat` / `rimMat` / `discMat` still mirror the pier row or the window strip.** Explicitly UNMEASURED, neither supported nor refuted; the wheel/rim patches cannot see a reflection (`wave-q/car-paint.md` §11).
7. **The dusk irradiance ratios after horizon registration.** The six cross-piece ratios in 2a are confirmed to 0.6% against the CURRENT frames, but the sky critic states they will move again, by much more than 6-9%, if the registration finding is acted on.
8. **STILL OPEN, AND ITS CLAIMED RESOLUTION IS `UNSUPPORTED-EVIDENCE-LOST`. `camera.js`, `main.js`, `physics.js`, `scenes.js`, `util.js` carry no wave-P hash in any verdict.** All five are plausibly untouched but nobody has asserted it (`wave-q/boost-fx.md`). The wave-R resolver's summary line claimed this item resolved; **no hash table, no assertion and no ruling on it survives in any file on disk**, and a resolution of this item is exactly five hashes plus an assertion. Session 15 deliberately did NOT compute substitute hashes - a hash taken now says nothing about the wave-P window, which is the whole content of the item. **Re-do it from scratch; do not treat those five files as cleared** (`verdicts/wave-r/resolver.md` §4, item 8).
9. **CLOSED, WAVE R. Prose in the tree citing retired anchors: `crash.js:2130-2148` and `_stripemeas.mjs:11-16`.** Both prose blocks were rewritten by the resolver and were re-read in session 15; `crash.js:2133-2150` and `_stripemeas.mjs:13-25` now state the retirements correctly and name the replacement anchors. See §0 ANCHOR 1 and `verdicts/wave-r/resolver.md` §4, item 9. **Forensic note carried with it: the unexplained `game/crash.js` 08:36 mtime that `tools/WAVE-R-ADDENDUM.md` §0 attributes to a possible boost debris-bypass patch is more simply explained as the resolver making exactly this comment-only edit. That is a hypothesis, not a clearance - a comment edit and a constant edit fit in one save, so the crash forensic pass still has to check every constant.**
10. **NEW, WAVE R: `_hudedge.mjs:139`, `:160`, `:177` compute `sat` as `meanCast`, and the `rim sat split` hold is UNAUDITED.** Same defect as the old `_px.mjs:96`. `rimTop`/`rimBot`/`box`/`bands` `sat` all carry it. The live hold `rim sat split <= 0.02 (now 0.013)` is a within-frame difference of two same-hue strips of one graphic, so both terms carry the same bias and it is first-order safe, **but the resolver explicitly declined to rule it safe and nobody has measured it since.** Owner: hud. Evidence in §1b (`verdicts/wave-r/resolver.md` §3, last bullet).
11. **`UNSUPPORTED-EVIDENCE-LOST` - the resolver's eleventh item is GONE and must not be back-filled with a guess.** Its summary line says two new items were opened, 10 and 11. Item 10 is recoverable without ambiguity (above). **Nothing on disk identifies item 11**: no second surviving amendment sentence hands off to this section, and the resolver was killed before it wrote either new item into this list. Two loose ends exist in its surviving evidence - damage's `sat` band needing re-derivation around `satPx` 0.175 (§1b) and whether `-04` can serve as a registered dusk anchor for the highway scene (§2f) - **but neither is attributable to item 11 and neither is recorded here as item 11.** If you find yourself needing an eleventh item, open a new one under your own name (`verdicts/wave-r/resolver.md` §4, item 11).

**NOTE ON `verdicts/wave-r/resolver.md`, BINDING ON ANYONE WHO CITES IT.** The session-13 resolver was killed by the harness before it wrote its verdict; its work landed instead as the amendments in §0, §1a, §1b and §2f of this file. Session 15 reconstructed `verdicts/wave-r/resolver.md` from those amendments so that the citations to it resolve, and the file is labelled a RECONSTRUCTION on its first line. **Every figure in it is transcribed from this file and none was re-measured. This file is the record; the reconstruction is a transcription of it. Where they disagree, this file wins.** Its only first-hand content is the session-15 crop check in its §2b, which is labelled as such.

---

## 5. TOOLS ON DISK - REUSE, DO NOT REWRITE.

`_px.mjs` (JPEG-capable, repeatable `--region name=x0,x1,y0,y1`; now prints `meanCast`, `satPx`, `sub40`, `sup200`; **percentiles broken on 32-multiple widths, see 1a**), `_tm-measure.mjs`, `_skyprobe.mjs` (`--noclouds` FIXED this session), `_bandmeas.mjs` (`hfRms` is a fixed 5x5 PIXEL box, `ratio` has a `sqrt(H/W)` null), `_paintmeas.mjs` (grain period + highlight FWHM), `_facademeas.mjs` (now with `darkAll%` and `cSpread`), `_cammeas.js`, `_boostkernel.mjs`, `_smearmeas.mjs` (absolutes not cross-quotable), `_stripemeas.mjs` (`anis` retired; use `anisAC1`/`anisAC3`), `_debrismeas.mjs` (now `--sign pos|neg|both` and a `dropPct` column), `_crop.mjs`, `_cropimg.mjs` (**PIXELS, not fractions**), `_hudlick.mjs` (bottom band fixed, prints `IN FRAME`), `_hudedge.mjs`, `_hfpatch.mjs` (paired within-image ratios only), `_anisonull.mjs` (**mandatory before any anisotropy target**), `_ignmeas.mjs` (`--lu` needs channel-split), `_carpaint-eval-shot.mjs`, `shadow-ab.mjs` (do-not-regress gate only), `damage-shot.mjs`, `probe.mjs`, `progress.mjs`, the `audio-*` suite.
`tools/shot.mjs` takes `--hash tone=agx&bloom=dual` for display-chain A/Bs, and `--hash air=6&airmax=0.0105&airs=0` reproduces the pre-edit airlight shader bit-for-bit.
Diagnostic scripts not yet promoted: `/tmp/q-sparkdiff.mjs`, `/tmp/q-halo.mjs`, `/tmp/q-mkdiff.mjs`, `/tmp/q-refpk.mjs`. Promote `q-sparkdiff` and `q-halo` into `tools/` before wave R uses them as headlines.

**STANDING, PRESERVED, AND CLOSED: no AgX. The tonemapper decision is CLOSED.**
**The per-preset grade is LIVE on the shipping ACES path** (`main.js:13/:75/:128` build `createOutputPass`; `post.js:414` switches only the tonemapper; the grade block at `post.js:224-240` runs on the default ACES path too). Lifted blacks are authored. Any measurement of ours from before 02:00 on the session-11 clock is void.
