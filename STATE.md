# STATE — Burnout Gauntlet

Last updated: 2026-08-03 (session 16)

## READ THIS FIRST. IT SUPERSEDES EVERY OTHER "EXACT NEXT ACTION" IN THIS FILE OR IN THE ARCHIVE.

### THE PROJECT PIVOTED IN SESSION 16. THE VISUAL WAVES ARE CLOSED.

Waves K through R chased `reference/` photographs with pixel metrics, for eight waves and nine
pieces.
**That is over, by the user's explicit instruction.**
The visual bar is MET.
`reference/` and every pixel metric are now a **REGRESSION GATE, not a target**: no scene may be
made to look worse, and not one agent may be spent making a scene look better.
Burnout Paradise is a console game and this is a web game; that comparison is closed.

**Do not open a new visual wave.
Do not write a new visual critic sweep.
Do not read the visual record looking for a task.**

The bar is now **how it plays**, and it has two halves:

1. **60 fps sustained at 1280x720 REAL pixels**, measured on this machine, never estimated.
2. **Handling that feels like Burnout Paradise**, matched to researched numbers.

Everything binding about the new bar is in **`tools/WAVE-S-PLAY-BRIEF.md`**.
Brief every agent with that file path.
It carries the 720p measurement contract, the measured baseline, the instrument, the runtime knobs
and every process rule that survived from the visual waves.

### FILE LAYOUT

- **`STATE.md`** (this file) - the live record, the EXACT NEXT ACTION, and the permanent rules.
  Short on purpose. Read all of it.
- **`tools/WAVE-S-PLAY-BRIEF.md`** - the binding brief for the playability era.
  Complete; amend it, never rewrite it.
- **`STATE-HISTORY.md`** - the whole visual-wave record, waves K through R, reverse-chronological.
  **Never read this file.**
  Nothing in it is actionable.
  It exists only so a claim can be audited by `grep`.
- **`tools/STANDING-CONSTRAINTS.md`** - the retired and corrected visual targets and anchors, each
  claim cited to its verdict file.
  Only relevant if a regression-gate question comes up.
- **`tools/WAVE-P-BRIEF.md`**, **`tools/WAVE-Q-CRITIC-BRIEF.md`**, **`tools/WAVE-R-ADDENDUM.md`** -
  the visual-era briefs.
  Superseded by the play brief.
  Their process rules were folded into it; their targets were not, and must not be re-issued.

**THE TRIM RULE. When STATE.md passes ~400 lines, PREPEND the oldest block to `STATE-HISTORY.md`
and leave a one-line pointer where it was.**
Before you move a block, confirm its substance is preserved in `tools/WAVE-S-PLAY-BRIEF.md`, in
`tools/STANDING-CONSTRAINTS.md`, or in the wave's own `verdicts/` files.
Anything live and preserved nowhere else gets added to the play brief rather than dropped.
Opening a new wave block is the moment to do this, not later.

### THE DEFECTS THE USER REPORTED FROM PLAYING IT. This is the source of the wave-S work list.

- **Steering was INVERTED.** Right steered left.
  **FIXED**, at the INPUT mapping in `game/main.js`, where left now maps to `+1`.
  It had to be fixed there and not on `yawRate`: `physics.js` integrates `yaw += yawRate*dt` and a
  positive Y rotation in three.js is counter-clockwise seen from above, i.e. a LEFT turn, but
  `yawRate` also feeds `lat`, which drives `slip` and `lean`, so negating `yawRate` would have made
  the car bank the wrong way through corners.
  **Any future change to this chain must preserve that invariant: D turns right AND the body leans
  away from the turn centre.**
- **The traffic was a car park.** 2667 vehicles, all standing still.
  Density won a screenshot metric, and a still frame cannot tell a parked car from a moving one, so
  the loop optimised toward something wrong.
  This is the clearest example in the whole project of a metric coming loose from the thing it was
  supposed to measure, and it is worth remembering that the loop produced it while every visual
  number improved.
- **The car did not feel right.**
- **No scene picker and undiscoverable controls.** The user had to ASK what boost was bound to.

### SESSION 16 — THE PIVOT, AND THE PLUMBING THAT MADE IT MEASURABLE. Commit `caa3e17`.

**THE SEVENTEENTH BROKEN MEASUREMENT, AND IT WOULD HAVE INVALIDATED THE ENTIRE NEW BAR.**
`main.js` set `renderer.setPixelRatio(min(devicePixelRatio, 2))`.
This is a Retina machine where `devicePixelRatio` is 2, so a 1280x720 window rendered a **2560x1440**
buffer - four times the pixels - and every frame-rate number taken from it would have been wrong by
that factor.
The pixel ratio is now `resScale`, default **1.0** and hard-capped at 1.0, so the drawing buffer is
exactly `innerWidth x innerHeight` real pixels and the canvas CSS upscales it to fill the window.
**Quote the render size and the pixel ratio beside every frame-time number, every time.**

**THE MEASURED PRE-WAVE BASELINE.**
Headless chromium, ANGLE/Metal, `--disable-frame-rate-limit`, viewport 1280x720,
`deviceScaleFactor 1`, so `renderW 1280 / renderH 720 / pixelRatio 1`.
Scene `dusk-highway-chase` on the playable path (`#nomenu=1`), throttle held 6 s, 146 frames:
**p50 41.20 ms (24.3 fps), p90 77.80, p99 399.70, max 845.8, 82.9% of frames over 16.7 ms.**
60 fps means p50 <= 16.7 ms, so the wave needs a **2.5x p50 speedup**, and the p99 is a **separate
stall defect** that no p50 fix will touch.

**WHAT THE PLUMBING COMMIT ADDED**, all in `main.js` unless stated:
- `window.__frameStats` - a ring of **rAF-callback to rAF-callback wall-clock deltas** with
  full-sort percentiles.
  rAF-to-rAF is the honest quantity: it includes compositing and main-thread work outside our own
  render call.
  **A `performance.now()` bracket around `composer.render()` is NOT a substitute** - GPU work is
  pipelined, so that bracket reads ~4 ms on a build that is visibly dropping frames, which is
  permanent rule 3's failure mode for the fifth time.
- `ctx.applyTimeOfDay('dawn'|'midday'|'dusk'|'night')` - both knobs existed but each needed three or
  four collaborators poked in the right order, which is why nothing but the boot path had ever
  changed them.
  Order: `sky.apply`, `world.setNight`, `traffic.setNight`, `car.setLights`, `sky.applyBloom`,
  `world.applyKeyFill`.
- `ctx.applyWet(0..1)`, `ctx.setResScale(0.4..1)`, `ctx.renderSize()`, `ctx.setPaused()`.
- `#nomenu=1` (skip the start menu, which is what a harness must use so a measurement never depends
  on a click) and `#res=<n>`.
- Module seams for `game/traffic.js` and `game/menu.js`, wired into `tick()` and the boot path
  against a documented contract in each file's header, so the builders that fill them in never have
  to touch `main.js`.
  Traffic updates on the **scaled** dt so a crash's slow-mo dilates other cars too.
- `progress.html` gained a PLAYABILITY section with PASS / PARTIAL / FAIL verdicts and per-piece
  numbers, read out of a fenced `progress-metrics` block inside each verdict file so the numbers
  cannot drift away from the evidence that produced them.
  The visual pieces moved below it under a note saying they are closed.

### WAVE S — LIVE. The playability wave. Pieces, each judged alone by a separate critic.

| piece | owns | state |
|---|---|---|
| `research` | `docs/BURNOUT-HANDLING.md` | see the results block below |
| `fps-harness` | `tools/fps.mjs` | see the results block below |
| `traffic` | `game/traffic.js`, the vehicle code in `world.js` | see the results block below |
| `menu` | `game/menu.js` | see the results block below |
| `handling` | `game/physics.js`, `game/camera.js` | see the results block below |
| `perf` | broadest ownership, driven by the profile | see the results block below |

**THE ONE NEW CONCURRENCY RULE, AND IT IS SPECIFIC TO THIS ERA.**
Every measurement in this project's history could tolerate concurrent agents because it was
deterministic pixels.
**Frame time cannot.**
A peer agent compiling shaders or rendering a screenshot steals GPU and CPU from the measurement
window and there is no way to detect it after the fact.
So: builders and critics that do not measure frame time may run concurrently and must label any
frame-time number they take as a smoke test; **every agent that reports a frame-time RESULT runs
ALONE and must say so in its verdict.**

<!-- WAVE S RESULTS: written at the end of session 16. -->

## THE PERMANENT RULES. Everything above this line is the live record; everything below was paid for in rounds.

### NEW CONCURRENCY RULE — nine concurrent builders is PAST THE LIMIT

Wave N ran nine at once and the paired-A/B discipline nearly broke down. Recorded damage:
car.js went transiently NON-PARSING inside another builder's measurement window; road.js spent
part of the round rendering a blown-out false-colour debug ramp that zeroed every fill
statistic; scene exposure moved 73 -> 213 -> 72 mid-round; `intactFlank` swung 99.5 -> 194.7
across renders with identical damage.js. Three separate builders had to reconstruct their
pre-edit file byte-exactly (md5-verified) and interleave A,B,A,B to get a usable pair.

**From Wave P on: run builders in two batches of 4-5, and put coupled pieces in DIFFERENT
batches.** Known couplings: crash x boost (smear kernel), car x damage (`syncFromPaint` env
probe is `partUnder`'s only light), sky x everything (exposure/grade), and **NEW IN WAVE R:
boost x road** — boost's T1 denominator is the `road.js`-owned nofx frame, and a peer road edit
moved it 0.99 -> 1.08 (T1 0.394 -> 0.361) while boost's own fx frame stayed bit-stable. Builders must still
reconstruct-and-interleave; that technique worked and should be in the brief, not rediscovered.

### THE FOUR RULES THAT WERE PAID FOR IN ROUNDS. DO NOT REDISCOVER THEM.

1. **Critic sweeps and builder waves strictly alternate; never overlap.** Wave J proved
   concurrent builders perturb each other's headline metrics badly enough to invalidate
   unpaired before/after measurements (road watched its ratio move 0.86 -> 1.11 with zero
   road.js changes, because sky.js landed an aerial-perspective change mid-round).
2. **Per-piece run-to-run render noise is 0.00. Paired atomic A/Bs are still not optional.**
   The old "+/-0.04" figure in this rule is SUPERSEDED and must not be quoted again. Post
   determinism fix, measured frozen-tree noise is **0.00 on every metric across all four
   presets**, n=3 each, every replicate printing an identical `_facademeas` line including the
   integer band-pixel count (`verdicts/wave-p/post-determinism.md`); the honest pixel-level
   caveat is `<=0.005%` of pixels at `<=9/255`. Paired A/B therefore costs 2 renders, not 8.
   **Keep paired A/B anyway.** Its real job was never the noise floor: every large mid-round
   swing previously written off as noise was CROSS-PIECE COUPLING, and that hazard is untouched
   by the seed fix. `boost-blur` was not one of the four presets measured, so render it twice
   until someone measures it.
3. **A metric that can be satisfied by aliasing, by inaudible signal, or by the wrong object
   is not a metric.** This failure has now happened four times: car glass matched p99 while
   reading as corduroy; boost's spectral sweep scored perfectly at an inaudible -50 dB; boost's
   plume was stretched to 6.5:1 to match a HUD graphic instead of the car; road exceeded the
   12.48 grain anchor at 13.38 using per-pixel aliasing. The model fix is a SCALE-PERSISTENCE
   ratio — measure at 1920 and at 960 and require the ratio to hold, which aliasing cannot fake.
   **If a number says we match but the image reads wrong, the number is the broken thing.**

   **WAVE O AMENDMENT — SCALE-PERSISTENCE IS NOT A COMPLETE GUARD. This is the project's own
   safeguard and it has now been beaten.** P only rejects PER-PIXEL aliasing. A **20 px coherent
   comb scores 1.35** and sails through. Boost moved P 0.57 -> 1.36 by trading 1 px noise for a
   low-frequency herringbone (NP=16 stations x 12 wedges/radian), and `_heromask` fx-vs-nofx
   shows hpRms **1.70 -> 14.74** — an 8.7x HF *increase* from a pass that is supposed to be a
   BLUR (ref 5.26). **Always pair P with an fx/nofx ratio (a blur must REDUCE HF) and with a
   crop.** A pass that manufactures structure is not filtering.
4. **Check every gain/amplitude term against the dynamic range of whatever consumes it.**
   Four Wave K gaps were the same bug class: a quantity pushed past the range its own
   downstream falloff can represent. Crash sparks at 2.8x additive clipped the first 63% of the
   authored `pow(v,2.2)` taper; car glass slope exceeded the pane's blur kernel; road's chip lens
   warped mirror UVs +/-6 texels per pixel with no matching mip; boost's box-mean accumulation
   averaged away the contrast it was supposed to smear. r8's glass-albedo>1.0 bug was the first.

   **Wave M confirms this is the dominant bug class in the project.** Five of the eight Wave M
   gaps are the same shape: audio's IGN_DEC (93 dB in 0.17 s), car's ungated metalness (1.0
   zeroes diffuse), damage's envMapIntensity 2.0 (drowns aoMap), road's fixed LOD bias (no
   distance term), boost's max-over-jitter (amplifies estimator variance). **Before writing any
   gain, ask what consumes it and what range that consumer can represent.**

Wave O damage-shot tool defect and the wave-O crash x boost cross-piece table: see STATE-HISTORY.md; all live constraints are folded into tools/STANDING-CONSTRAINTS.md.

### RULE 5 — NEW IN WAVE M. DO NOT TRUST A DOCSTRING. VERIFY THE CONSTANT.

The Wave M crash-cam critic found that the Wave L crash.js builder **rewrote the comments and
changed zero constants.** `crash.js:2118-2127` says "gains are now scaled so peak r sits just
above 1.0"; `:2131` still reads `r = 2.8`. `:2098` claims the streak scaler and the 2.6 m ceiling
came down; `:485/:988/:2104` are unchanged. `:196-209` describes a `VC` nose split in
`streakTexture` that **does not exist**. `:1259` says the panel fold scaler "now uses 1.5";
`:1269` still reads `6.4`. And `shots/crash-l1-sparks.png` (04:04) measures fill 4.32% against
the current 14.46% — **the builder had the fix working and reverted it before saving.**

Consequences, binding on every future wave:
- **Critics: never read a comment as evidence.** Grep the constant. The crash-cam critic caught
  this only because it probed the live scene and diffed against an intermediate screenshot.
- **Builders: your report is checked against `git diff`-equivalent constant values, not prose.**
  A comment claiming a change that the code does not make is the worst outcome available here —
  it costs the next full critic round to detect and it poisons the brief chain.
- This is why every builder must write `verdicts/wave-<letter>/<piece>.md` for its own wave with
  the BEFORE and AFTER literal values of every constant it touched, quoted with `file:line`.

### ONE STANDING CROSS-FILE ROUTE — honour it

The environment fix needs the real fog density, but `world.js:2749` historically read
`scene.fog.density`, a dead `0.001` placeholder hardcoded at `sky.js:1404` — a file the SKY
builder owns. The arranged route: sky exposes the true preset `d0` on `sky.fogParams[0]`;
world.js reads it READ-ONLY and never edits sky.js. Check `verdicts/wave-m/sky-lighting.md`
and `verdicts/wave-m/environment.md` for the symbol that actually exists now.

