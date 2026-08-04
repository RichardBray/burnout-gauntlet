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

| piece | owns | state after round 2 |
|---|---|---|
| `research` | `docs/BURNOUT-HANDLING.md` | **DONE.** Which numbers bind is settled; see below |
| `fps-harness` | `tools/fps.mjs` | **DONE.** Instrument independently audited and sound |
| `traffic` | `game/traffic.js` | **PASS** (round 2). Event stream is the wave's best result |
| `menu` | `game/menu.js`, `game/music.js`, `game/audio.js` | **PASS** (round 2). Soundtrack, two volumes, scene picker |
| `handling` | `game/physics.js`, `game/camera.js` | **PARTIAL.** Drift fixed; three items open, round 3 live |
| `perf` | broadest, driven by the profile | **PARTIAL. THE 60 FPS BAR IS NOT MET.** Round 3 live |
| driver | `game/main.js` (frozen to everyone else) | **DONE.** `da65fcf`, `68c093b` — see the joins below |

**THE ONE NEW CONCURRENCY RULE, AND IT IS SPECIFIC TO THIS ERA.**
Every measurement in this project's history could tolerate concurrent agents because it was
deterministic pixels.
**Frame time cannot.**
A peer agent compiling shaders or rendering a screenshot steals GPU and CPU from the measurement
window and there is no way to detect it after the fact.
So: builders and critics that do not measure frame time may run concurrently and must label any
frame-time number they take as a smoke test; **every agent that reports a frame-time RESULT runs
ALONE and must say so in its verdict.**

### WAVE S RESULTS — rounds 1, 2 and the driver's joins. Session 17.

Round 1 shipped six pieces, each judged by a separate critic that PLAYED it.
Round 2 was three concurrent builders on a hard file partition plus three fresh critics plus a
repair-and-verify pass on the one piece that failed.
The full evidence is in `verdicts/wave-s/`; only what is still live is written here.

**`research`** — `docs/BURNOUT-HANDLING.md`.
Unusually honest: it logs four failed instruments and prints `NOT FOUND` seven times rather than
interpolating, and round 1's handling critic re-read it and published which of its numbers may be
scored HIT/MISS and which are directional only.
**Score against: boost bar exactly 8.0 s, full-bar-only gate, ceiling ratio ~1.00, 0-100 mph
3.45-3.48 s, MaxSpeed 177-201 mph, straight-line yaw < 0.2 deg/s, brake-tap-or-e-brake entry with no
drift button.
Do NOT score against: yaw 28-38 deg/s (player-used, speed bracketed not measured — a sanity band
only), the yaw curve's values (shape only), drift scrub (`NOT FOUND`, any band is self-anchored).**

**`fps-harness`** — `tools/fps.mjs`, five drive scenarios, resolution sweep, interleaved A/B
subsystem attribution.
Round 1's perf critic audited the instrument the hard way and it passed: `window.__frameStats` and an
independently installed second rAF ring agree to every digit, which is the expected result and the
point.

**`menu` + `menu-music`** — **PASS.**
Start and Esc pause menus, time of day, wet, resolution scale with a live buffer readout, the full
control list, a scene picker with no reload, the soundtrack, and separate MUSIC and SFX sliders.
The critic patched `AudioNode.prototype.connect` before the page built a single node, enumerated
every node that reaches a destination (**exactly two, on two different AudioContexts, zero before
the gesture**) and hung its own analyser off each: music **-16.52 dBFS RMS**, SFX master **-19.08**,
cross-checked against an MP3 it decoded itself.
**The routing rule is settled by kill-control in both directions: muting SFX moves the music 0.14 dB
while collapsing itself 69 dB; muting music moves SFX 1.15 dB while collapsing itself 74 dB; and
`audio.stop()`, which CLOSES audio.js's context, leaves the music playing at -16.23 dBFS.**
D1-D7 all closed. One new defect the critic found and the driver fixed at `68c093b`: a swallowed
keyup latched `heldNow` forever and was re-synthesised on every later resume (steer +0.99999857 with
the keyboard idle).

**`traffic` + `traffic-r2`** — **PASS.**
`laneTraffic()`'s 1255 standing cars are gone; `POOL` is **30**, decided on measured
corridor-ahead and events-per-km evidence, with `setPool` so the next agent can re-derive it in one
boot.
All four round-1 defects closed at the mechanism: parked in a junction box the phase flips 7 times
in 22.8 s with **0** cars frozen (was 0 flips, 15 frozen); closest VISIBLE highway spawn 240.8 m
with 0 inside 240 m (was 62.9 m with 26 inside 120 m); visible line-end retires 0 in 141 s (was 3 in
40 s); a wrong-way hero is shied 3.000 m (was 0.000 and driven through).
Overlap **0.000 m over ~340k vehicle-frames**.
The builder also found an unreported bug: the oncoming shy had no `latSign`, so on three of four
(axis, dir) combinations it steered cars TOWARD the hero.
**`traffic.drainEvents()` is the strongest single result of the wave**: every emitted clearance
equals the clearance the critic computed itself from the published pose, 0 of 11 `oncoming` tags
wrong, 0 of 37 near misses mistagged, 6.85-7.20 events/km of highway, and **zero** on all three
attempts to make it a timer or an odometer.

**`handling` + `handling-r2` + repair** — **PARTIAL, and it is the piece still open.**
Round 1 passed on numbers and failed on feel; its critic's section 6 ranked the ten things that made
the car least fun and that list drove everything since.
Now measured live through the real key listeners: **the three drift orderings all hold** — 2.22 s
hands-off / 2.72 s after a tapped countersteer / 0.80 s under a held one, against round 1's
0.63 / 0.61 / 0.68 where holding opposite lock kept you sideways LONGER than doing nothing.
Swapping `rHold` back for `rTarget` on one line collapses the hold 2.35 -> 0.59 s, so the mechanism
is single-point and is the one claimed.
The e-brake rotates the car, is monotone in hold time at 80/130/200/250 km/h and never accelerates
you; the wall now tiers 77/53/20/1% of speed kept at 10/20/45/90 deg from the face; the passive boost
refill is verified gone (0.0000 over 20 s of held W); body roll 3.31 -> 6.9 deg; the sign invariant
holds in both directions from world matrices.
The chain drift went 6.2 deg / 0% drifting to **17.7 deg / 57%**, and forcing `rearBroke` false puts
every beat back to 6.2 deg / 0%.
**Still open at the end of round 2, and this is round 3's brief:** `driftFlick` supplies 7.5 of the
chain's 16.2 deg by ADDING to `state.vLat` (free energy — it changes ground speed, which is now the
speedometer), brake+lock sweeps 2.8 deg of heading in 400 ms against throttle+lock's 11.9, and there
is **still no power-on grip edge** (250 km/h held lock: dead-flat 28-29 deg/s, peak slip 4.9 deg,
0% drifting) — third round on that one, and `gripUse` is NOT the cause, refuted by kill-control and
reverted 0.95 -> 0.85.

**`perf` + `perf-r2`** — **PARTIAL. THE 60 FPS BAR IS NOT MET.**
Round 1 took the highway 46.5 -> 17.2 ms mean.
Round 2 found the biggest thing nobody had looked for: **`road.js`'s planar reflection is a full
mirrored re-render, and on a wet frame it ran FOUR times** — once for the frame, once inside SSAO's
prepass, once inside boost's hero-mask depth pass and once per cube-probe face — 22.5 ms of a 48 ms
frame, 18.3 ms of it into buffers nothing sampled.
Night-wet p50 **46.70 -> 32.70 ms**, p99 86.90 -> 52.90, boost p99 44.50 -> 32.80, all independently
reproduced by a critic that ran alone on three clean worktrees and read `gl.drawingBufferWidth` off
the driver at the end of all 41 windows.
**The honest state of the bar, 1280x720 pixelRatio 1 dpr 1 resScale 1, as p50 / delivered fps /
share of frames over 16.7 ms: corner 13.00 / 79.5 / 3.5% PASSES; cruise 16.10 / 55.2 / 33.5%;
city 21.80 / 45; boost 22.10 / 45; night-wet 32.70 / 30.**
**`p50 <= 16.7 ms` IS NOT `60 fps sustained` and must not be reported as it** — cruise passes on p50
with a third of its frames long. Report p50 AND delivered fps AND share-over-16.7, always.
Two of round 2's mechanisms were overturned by runtime kill-control and **must not be re-claimed**:
the frustum-first point-light fill is worth **0.00 ms** (an unused slot is still visible and still in
`NUM_POINT_LIGHTS`; `POOL` is the entire win, at 2.2 ms per light), and reflection gate 2 is worth
**0.00 ms** on p50/p99 (it cuts max only, 72-86 -> 54).
And round 2 introduced a live regression: **a deterministic 174-300 ms hitch on the third frame after
`__ready` in 4 of 4 cold boots**, reproduced by `tools/_perfcritic-r2-first.mjs`.

**THE DRIVER'S JOINS — `68c093b`, and `da65fcf` before it.**
`main.js` was frozen for all three round-2 builders and taken by the session driver, because it is
the one file all of them would otherwise have touched.
What landed there, each routed by a builder that was forbidden to make it:
- `physics.setEventSource(() => traffic.drainEvents())` — **this IS the boost economy.**
  Without it, drift was the only earn path in the shipped game.
  Measured live: 6.95 events/km, and 6 near misses take an empty bar to 0.2525, so a full bar costs
  about 24 events.
- `const w = physics.drainWreck(); if (w) crash.trigger(w)` — `state.crashed` was set by nothing at
  all, so `crash.js`'s whole state machine was unreachable from driving.
- `carRoot.rotation.y = s.yaw`, dropping `- s.slip * 0.22`.
  That term predates physics having a real lateral velocity and was subtracting the slide from the
  thing that shows the slide: it spent 12.6 of the 18.3 deg the camera-sign fix bought and had the
  WRONG SIGN at peak slip.
  Regression gate: `slip` is at most 0.00407 in all seven shot presets, so it is worth under 0.05 deg
  there and `carRoot.rotation.y` is identical to five decimals in every one.
- The HUD and engine audio read `s.ground` (|v|), not `s.speed`: they read **52% low** at 61 deg of
  slip, i.e. exactly when the player is doing something interesting.
- `frameStats.push` no longer saturates `over16_7pct` past 4096 frames.

**A NEW PERMANENT LESSON, and it belongs beside permanent rule 3.**
Round 2's handling builder retracted two of its own constants after its critic's kill-controls
refuted them, and round 2's traffic builder rejected its own first fix on measurement (bounding the
junction latch at 3.2 s broke a hard-won 0.000 m overlap invariant, caught with the critic's own
instrument BEFORE shipping).
Both are the behaviour this loop is for.
**A builder that reverts its own unmeasured change is producing the most valuable output available
here.**

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

