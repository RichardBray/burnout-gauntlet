# wave-s/perf-critic-r2 — independent audit of the round-2 60 fps claim

I am the round-2 performance critic. I edit no game code. This file was opened before any
measurement was taken and appended as the work happened.

## 0. Machine state, stated up front

**I RAN ALONE.** Checked with `ps aux` and `uptime` at the start and re-checked between phases.

- At start: load average `2.05 / 2.46 / 2.95`. No headless chromium, no playwright, no peer
  measurement process.
- Residents that are NOT mine and were idle: several `claude` CLI processes (the session driver and
  sibling shells, 0.3-2.3% CPU), Arc browser, a Virtualization.framework VM, Karabiner, Logi
  Options. Same population the builder measured against, so the comparison is like for like.
- Re-checks are recorded at the head of each measurement section below.

## 0b. Which trees I measure, and why three of them

The brief warns that the tree has changed under a handling, a traffic and a menu-music builder since
round 1's baseline. A two-way A/B against round 1's numbers therefore cannot attribute a move. I
measure THREE clean `git worktree` checkouts:

- **W1 = `40d2f1c`** — round-1 perf commit. The tree round 1's critic measured (corner 13.10,
  cruise 16.20, city 22.10, boost 23.10, night-wet 48.30).
- **W2 = `ea9fc5e`** — the PARENT of the perf-r2 commit. W1 + handling-r2 + handling-r2-fix +
  handling-r2-verify + traffic-r2 + menu-music. This is the honest BEFORE for perf-r2.
- **W3 = `8cd00c7`** — HEAD, the claim.

W1 -> W2 is the peers' contribution. W2 -> W3 is the perf builder's.

(sections appended below as the work happened)

---

## 1. THE INSTRUMENT AUDIT. I re-did round 1's checks and added two of my own.

`tools/_perfcritic-r2.mjs` — my own file, written for this audit. Headless chromium
`--use-angle=metal --disable-frame-rate-limit`, viewport 1280x720, `deviceScaleFactor: 1`, scene
`dusk-highway-chase` on the playable path (`#nomenu=1&res=1.0`), fresh page and cold boot for every
run, warm 3.5 s, measure 8 s, 3 runs per cell.

### 1a. The buffer really is 1280x720 real pixels, on every window, on every tree

I read the DRIVER, not `renderer.getDrawingBufferSize()` (which is `_width * _pixelRatio`, a number
the renderer computes about itself). `gl.drawingBufferWidth/Height` off `renderer.getContext()`,
sampled at the END of every measurement window, together with the composer's own post target:

```
glDrawingBufferWidth 1280   glDrawingBufferHeight 720
renderer.getPixelRatio() 1  devicePixelRatio 1  resScale 1  paused false
composer.renderTarget1 1280x720  samples 0        (i.e. the FXAA path, not MSAA)
sky.sun.shadow.mapSize 4096x4096  shadowMap.enabled true   <- the DEFAULT is unchanged
```

**Every single row of every table below carries those values.** There is no dpr-2 lie, no hidden
2560x1440, no `resScale` below 1, and the `#shadow` knob the builder added has not been used to
flatter a default: the shipped default is still a 4096 map with shadows on.

### 1b. Two independent rAF rings agree to every digit

My ring is registered separately from `window.__frameStats` and over the same window. Across all
15 AFTER runs the two p50s differ by **0.000 ms** in every run (`ringAgree` column of my raw JSON).
That is the expected result and the point of the check: two honest rAF rings must agree exactly, and
a `performance.now()` bracket around `composer.render()` could not.

### 1c. THE CAR MOVES INSIDE EVERY WINDOW. Checked, because it is the cheapest possible fake

Metres travelled between the start and the end of each 8 s window, HEAD tree:
corner 537-539 m, cruise 602-604 m, city 400 m, boost 656 m, night-wet 484-486 m, at 245 / 277 /
76 / 281 / 53 km/h respectively. A parked car reads 0 m. Draw calls and triangles confirm the world
is loaded and not simplified: 573 calls / 0.74 M tris on the highway against **3694 calls / 6.62 M
tris at night-wet**.

### 1d. A NEW instrument defect I found, and it matters to exactly one claim

`--disable-frame-rate-limit` makes chromium issue a catch-up `BeginFrame` immediately after a long
frame, so the ring collects a **sub-1 ms delta that is not a presented frame**. Measured on HEAD:

| scenario | rAF ticks in the ring | of those, deltas < 3.5 ms | ticks/s | real presents/s |
|---|---|---|---|---|
| corner | 1935 | 21 (1.1%) | 80.5 | 79.6 |
| **cruise** | 1492 | **160 (10.7%)** | 62.1 | **55.4** |
| city | 1102 | 18 (1.6%) | 45.8 | 45.1 |
| boost | 1077 | 6 (0.6%) | 44.7 | 44.5 |
| night-wet | 727 | 0 (0.0%) | 30.2 | 30.2 |

The signature is unambiguous in the raw sequence: `... 31.7, 0.7, 15.7 ...`, `... 33.6, 0.6, 16.2
...` — a long frame, then a near-zero tick, then a normal frame. I re-derived every percentile with
each sub-3.5 ms delta MERGED into its predecessor, which is the honest reconstruction:

| scenario | raw p50 | merged p50 | merged p90 | merged p99 | frames/s | % of frames > 16.7 ms |
|---|---|---|---|---|---|---|
| corner | 13.00 | 13.00 | 15.3 | 32.6 | **79.5** | 3.5% |
| cruise | 16.10 | **16.20** | 32.2 | 35.5 | **55.2** | **33.5%** |
| city | 21.80 | 21.90 | 26.1 | 35.7 | 45.3 | 97.3% |
| boost | 22.10 | 22.10 | 26.9 | 32.8 | 44.6 | 96.1% |
| night-wet | 32.70 | 32.70 | 41.8 | 52.9 | 30.2 | 99.6% |

**The percentiles survive the correction; the "cruise passes" claim does not survive the
distribution.** cruise's p50 is 16.2 ms, inside the 16.7 ms bar — and cruise delivers **55.2 frames
per second** with **a third of its frames over 16.7 ms**, because its distribution is bimodal: a
mode at ~16 ms and a second population at 30-35 ms. p50 is the wrong statistic for a bar phrased as
"SUSTAINED", and this is not an artefact of the builder's instrument, it is a property of the frame
times. It is also not a defect the builder introduced or hid — their own table prints
`>16.7 ms: 29.7%` next to `cruise 15.96` — but their summary sentence "cruise now passes the bar"
does not survive it, and I say so in section 5.

### 1e. Boot check, since `lint ok` does not mean runnable

Across the **41 measurement boots** in section 2, the **6 kill-control boots** in section 3 and the
**8 cold boots** in 4b — on all three trees, at dusk/dry and night/wet, at `#nomenu=1` and
`res=1.0` — my harness captured **0 console errors and 0 page errors**. Every run also reached
`window.__ready === true` and `window.__frameStats` and drove.

## 2. THE NUMBERS, RE-DERIVED FROM SCRATCH ON THREE TREES

Re-checked before this phase: no chromium, no playwright, load `2.05 -> 3.31` across the run (my own
harness is the only load that changed). 3 runs per cell on W2/W3, 2 on W1. **Every cell:
`glDrawingBuffer 1280x720`, `pixelRatio 1`, `devicePixelRatio 1`, `resScale 1`, `paused false`,
`composer.renderTarget1 1280x720 samples 0`, `shadow 4096x4096 enabled`.**

| scenario | W1 `40d2f1c` p50 | W2 `ea9fc5e` p50 (the real BEFORE) | W3 `8cd00c7` p50 | W2 -> W3 | W2 p99 | W3 p99 |
|---|---|---|---|---|---|---|
| corner | 12.80 | 12.90 (12.80-12.90) | 13.00 (13.00-13.10) | +0.8% | 34.40 | **32.10** |
| cruise | 15.90 | 16.00 (16.00 x3) | 16.10 (16.10 x3) | +0.6% | 35.30 | **34.50** |
| city | 21.10 | 21.50 (21.20-21.60) | 21.80 (21.50-21.90) | +1.4% | 39.30 | **35.70** |
| boost | 21.80 | 22.00 (21.80-22.40) | 22.10 (21.90-22.20) | +0.5% | 44.50 | **32.80** |
| **night-wet** | 46.70 | **46.70** (46.50-46.90) | **32.70** (32.50-33.10) | **-30.0%** | 86.90 | **52.90** |

Run-to-run spread: 0.00-2.75%. Metres driven inside every window: 399-656 m.

### 2a. The peers moved NOTHING. W1 -> W2 is flat on all five scenarios

handling-r2, handling-r2-fix, handling-r2-verify, traffic-r2 and menu-music landed between round 1's
audit and this one. Measured: corner 12.80 -> 12.90, cruise 15.90 -> 16.00, city 21.10 -> 21.50,
boost 21.80 -> 22.00, night-wet 46.70 -> 46.70. **Every one inside my own run-to-run spread. No
scenario regressed from the handling / traffic / music direction**, and none improved either.

### 2b. My harness reads 2-5% faster than round 1's on the IDENTICAL tree, and that voids four of the builder's five deltas

W1 is round 1's own commit. Round 1 published, and I measure on the same commit:

| scenario | round-1 critic | me, W1 | offset |
|---|---|---|---|
| corner | 13.10 | 12.80 | -2.3% |
| cruise | 16.20 | 15.90 | -1.9% |
| city | 22.10 | 21.10 | -4.5% |
| boost | 23.10 | 21.80 | -5.6% |
| night-wet | 48.30 | 46.70 | -3.3% |

The builder's report compares its AFTER against **round 1's published numbers** and claims corner
+0.5%, cruise -1.5%, city -2.5%, boost -0.8%. **Those four deltas are smaller than the
between-session offset on the same code**, and against the correct BEFORE (W2, the parent of their
own commit) all four are flat or marginally SLOWER. Only night-wet's -30% is larger than every
source of noise I can find, and it reproduces almost exactly (-31% claimed, -30.0% measured).

**Nothing here is inflated and nothing is a lie about the buffer.** But four of the five p50 rows in
the builder's headline table describe noise, and the report presents them as small wins.

## 3. WHERE THE 14 ms ACTUALLY CAME FROM. Three kill-controls, and one of the three fixes is worth 0.00 ms

### 3a. The point-light pool is the biggest single item: -8.9 ms, and I measured it directly

W2 ships `POOL = 14` and `setNight` does `for (const l of pool) l.visible = night;`
(`world.js:3089`), so at night all fourteen are visible and `NUM_POINT_LIGHTS` is 14 in every
shader. I disabled the last **4 of the 14 visible point lights at runtime on W2** — which is exactly
what `POOL = 10` does to the shader — and left everything else in W2 alone:

| W2 night-wet | p50 | p99 |
|---|---|---|
| as shipped (14 visible point lights) | 46.70 | 86.90 |
| **4 lights disabled at runtime (10 visible)** | **37.80** (37.80-38.20, 1.06%) | 71.70 |

**-8.9 ms for four point lights, 2.2 ms each, at 1280x720 ratio 1.** The mechanism is confirmed and
it is the builder's: the count is a shader define and it is charged to every shaded fragment.

**But this also proves the frustum-first fill is worth 0.00 ms.** An unused slot still has
`visible === true` and still occupies its place in the define; `world.js:3242` only zeroes its
intensity. So the entire 8.9 ms is `POOL 14 -> 10` and the frustum ranking is a pure
quality-preservation measure with no frame-time content. The builder's summary — *"filling
frustum-first and sizing POOL to 10 ... took it to 33.35 ms"* — reads as though the two shared the
win. They do not. This matters for the next wave: **the lever is POOL, and the frustum fill is what
makes a smaller POOL safe.**

Census check on the sizing decision, my own numbers: over 345-frame night-wet windows the pool
reports `inShot 6, maxInShot 10, pool 10`, and the day-time city census also peaks at
`maxInShot 10`. So POOL 10 is at the top of the observed demand, not comfortably above it — the
builder's histogram (99.72% covered at 10, max 11) is consistent with what I see.

### 3b. Reflection gate 1 (the override-material gate) is the rest of the win, and it is lossless

46.70 (W2) - 8.9 (pool) = 37.8 expected from the pool alone; measured W3 is 32.70, so the gates plus
the probe-rate change are worth the remaining **~5.1 ms** — which lands on top of the builder's own
paired step-1 measurement of **-5.61 ms** for both gates together. Independent, and it agrees.

### 3c. Reflection gate 2 — the ONLY change in this commit that moves a pixel — is worth 0.00 ms

`road.js:1679` (`camera !== state.mainCamera`) is reversible at runtime, so this is a clean
kill-control. Same tree, same scenario, gate 2 switched off with
`window.__game.roadKit.setMainCamera(null)` after boot:

| W3 night-wet | p50 | p90 | p99 | max |
|---|---|---|---|---|
| gate 2 ON (shipped) | **32.70** (32.50-33.10) | 41.8-49.6 | 52.90 | 53.9-54.9 |
| gate 2 OFF (kill-control) | **33.00** (33.00-33.10) | 46.5-49.8 | 53.90 | **72.2-86.0** |

**p50 and p99 are identical inside the 0.3-1.0% spread. Gate 2 buys nothing at the p50 and nothing
at the p99.** What it buys is the `max`: 54 ms instead of 72-86 ms, i.e. it flattens the one or two
frames per eight seconds that carry a cube-probe bake. That is a real but narrow win, and it is
**not** the 10.83 ms the builder's trace attributes to the probe row.

The reflection's own census says why, and it is the mechanism check the builder did not run:

```
night-wet, 8 s window, 245 frames.   reflStats() delta over the window
gate 2 ON :  renders 244   skipped 3936   rt 640x360   -> 1.00 reflection renders per frame
gate 2 OFF:  renders 249   skipped 3769   rt 640x360   -> 1.02 reflection renders per frame
```

Turning the probe gate off adds **five** reflection renders in eight seconds, not one per frame,
because the builder's OWN other change (`car.js:1905` `PROBE_MIN_FRAMES 60 -> 180`) already reduced
the bake rate to roughly one bake per window, and one bake is six faces. So the trace row
`256x144 (nested in a probe) invoc/frame 1.00 ... 10.83 ms` is a per-BAKING-frame cost presented as
a per-frame average, and the headline *"22.5 ms of a 48 ms frame, 18.3 ms of it drawn into buffers
that nothing sampled"* over-counts by roughly the whole probe row. **The direction is right, one of
the four passes is real (SSAO), one is real but rare (boost's hero mask, only while boosting), and
the fourth is ~0.7% of frames.**

### 3d. A MECHANISM THE REPORT DOES NOT NAME, and it is probably most of gate 1's 5 ms

`road.js:1623-1641`, `ensureRT()`, sizes the reflection target from **the render target that is
currently bound** — `cur ? cur.width : drawingBufferSize`, halved. Before gate 1, a wet frame asked
for a reflection from four passes bound to four differently-sized targets, so on **every single
frame** the code path was: dispose a HalfFloat `WebGLRenderTarget` with a depth buffer, allocate a
new one at 320x180, allocate again at 256x144, allocate again at 640x360, and rebind
`uReflMap` across every road material each time (`state.uniforms` loop at `:1640`). That is a
per-frame GPU allocate/free cycle on a depth-backed float target, which is exactly the kind of cost
that shows up as driver wall time in whichever call is unlucky — and it explains the builder's own
puzzle in section 3 ("the 5.6 ms is a lot less than the 18.3 ms of CPU wall the trace attributed").
My census confirms the RT is now stable: `rt: "640x360"` at the start and the end of every window,
on every run. **The fix is right; the attribution is "two extra scene submissions" when it is also
"three render-target reallocations per frame".** Worth writing down because the next person to add a
pass that draws a road will re-create it.

## 4. THE p99 STALL DEFECT: GENUINELY DOWN, BUT THE FIRST SECOND OF PLAY GOT WORSE

### 4a. p99 is down on all five scenarios, and boost's is the real win

W2 -> W3, my own rings, 3 runs each: corner 34.40 -> 32.10, cruise 35.30 -> 34.50,
city 39.30 -> 35.70, **boost 44.50 -> 32.80 (-26%)**, **night-wet 86.90 -> 52.90 (-39%)**.
W2's night-wet p99 across its three runs was 100.0 / 82.6 / 86.9; W3's is 53.3 / 52.6 / 53.9 — the
100 ms class of frame is gone from that scenario. `renderer.info.programs` at the end of an 8 s
window is 130 (W2) vs 194 (W3) on cruise and 146 vs 198 on boost, so the boot-time warming really is
compiling ~64 extra programs before play, which is the mechanism the builder claims.

**The stall defect is reduced, not fixed.** Every scenario still has a p99 of 32-53 ms, i.e. 2-3x the
16.7 ms bar, and boost still shows a 93-109 ms `max` in every window.

### 4b. "the first 700 ms of play goes from 1 delivered frame to 44" — REFUTED

This is the one claim I overturn outright. My own instrument (`tools/_perfcritic-r2-first.mjs`)
installs a rAF ring in `addInitScript`, i.e. before any page script runs, records the wall time at
which `window.__ready` becomes true, and counts frames in the 700 ms after it. Four cold boots per
tree, `#nomenu=1`, W held:

| tree | frames in first 700 ms after `__ready` | worst delta in that window | `__ready` at |
|---|---|---|---|
| **W2 (BEFORE)** | **43, 42, 43, 2** | 36.5, 36.1, 34.7, **616.3** | 2645, 2100, 2161, **1282** ms |
| **W3 (HEAD)** | **24, 31, 29, 32** | **300.0, 174.6, 224.6, 178.2** | 2744, 2338, 2277, 2287 ms |

The first twelve deltas after `__ready` show the shape:

```
W2 run 1:  12.7, 16.2, 15.9, 12.5, 15.1, 14.2, 11.7, ...       <- clean
W2 run 4:   3.5, 616.3, 195.4, 7.9, 16.2, 16.7, 12.7, ...      <- the builder's BEFORE
W3 run 1:   3.9,  82.6, 300.0, 10.8, 13.7, 16.2, 15.5, ...     <- HEAD, and this is 4 runs out of 4
W3 run 4:   3.8,  68.0, 178.2,  8.4, 13.9, 15.2, 12.8, ...
```

**Three of four BEFORE boots deliver 42-43 frames with no frame over 37 ms. Four of four HEAD boots
deliver 24-32 frames and every one carries a 174-300 ms hitch as its third frame of play.** The
builder measured "two cold boots each" and their BEFORE pair happened to catch the 1-in-4 case where
`__ready` fires early (1282 ms here) and the upload lands after it. On the median boot the change is
a **regression**: the first second of play is worse, and it cost ~0.9 s of boot
(`__ready` 2100-2645 -> 2277-2744 ms) to get there.

I am not claiming the warm frames are worthless — they demonstrably move 64 program compiles behind
the bar and they are what cut boost's p99 by 26%. I am claiming that the *first-frame upload stall
they were built to remove is still there on HEAD*, deterministically, at 174-300 ms, and that the
1-frame -> 44-frame figure is an artefact of a 2-run sample of a bimodal quantity.

## 5. DID ANY SCENE GET WORSE TO LOOK AT? NO. The veto does not fire.

My own renders, `tools/shot.mjs` from each worktree, 1280x720, all seven presets, plus a SECOND
render of two presets on each tree so the build's own noise floor is mine and not quoted:

| preset | maxDiff W2 vs W3 | mean | % pixels > 2/255 | same-tree noise (maxDiff) |
|---|---|---|---|---|
| dusk-highway-chase | 1 | 0.0001 | 0.0000% | — |
| boost-blur | 1 | 0.0001 | 0.0000% | — |
| crash-cam | 2 | 0.0001 | 0.0000% | — |
| hud-overlay | 2 | 0.0000 | 0.0000% | — |
| car-paint-closeup | 2 | 0.0000 | 0.0000% | — |
| daytime-downtown | 21 | 0.0003 | 0.0037% | **7 (W2), 10 (W3)**, mean 0.0002 |
| **wet-night-asphalt** | **87** | **0.1296** | **1.3024%** | **3 (W2), 6 (W3)** |

Six presets are at or inside the noise floor. daytime-downtown's `maxDiff 21` is 2-3x the same-tree
max but its mean and its coverage are identical to the noise, so it is a handful of isolated pixels;
I checked this rather than accept the builder's claim that same-build noise is `maxDiff 21` — on my
machine it is 7-10, so their noise floor was quoted generously, but their conclusion still holds.

**wet-night-asphalt moved for real**, and my numbers reproduce the builder's to four decimal places
(87 / 0.1296 / 1.30%). A 16x9 grid of mean difference puts all of it in exactly two places: the car
(2.28-3.46 / 255) and the car's reflection in the wet road immediately above and below it
(0.34-0.73), with 0.00 in every other cell. That is the signature of the cube-probe environment
changing, i.e. gate 2, and it matches the builder's kill-control attribution.

**I opened both at 3x** (`shots/pcr2/crop-BEFORE-car.png` vs `crop-AFTER-car.png`, a 420x230 crop of
the car upscaled nearest-neighbour). Same paint, same clearcoat lobe, same tail-light bars, same
diffuser and valance geometry, same body horizon, same wheel-arch shadow, same specular structure on
the rear haunches. The AFTER's lower rear quarters read a hair cleaner. **No scene got worse. The
quality veto does not fire.**

The uncomfortable part is section 3c: **the only change in this commit that moves a pixel is the one
worth 0.00 ms at the p50 and 0.00 at the p99.** It buys a `max` improvement on ~1 frame in 200. If
anyone ever wants byte-identical wet-night pixels back, `road.js:1679` / `main.js:162` is the line to
drop and it costs 0.3 ms of p50 and 18-31 ms of `max`.

## 6. THE CHEAT LIST, worked one item at a time

- **resolution scale silently below 1** — no. `resScale 1` and `gl.drawingBufferWidth 1280` read off
  the driver at the END of all 41 measurement windows.
- **pixel ratio moved** — no. `renderer.getPixelRatio()` 1, `devicePixelRatio` 1, and
  `composer.renderTarget1` 1280x720 `samples 0` on every window.
- **the new `#shadow` knob used to flatter the default** — no. `sky.sun.shadow.mapSize` reads
  4096x4096 with `shadowMap.enabled true` on every window of every scenario. `main.js:475` confirms
  `params.shadow === undefined ? 4096 : ...`. The refusal is real and the default is untouched.
- **measured while paused or on the menu** — no. `isPaused()` false everywhere; `#nomenu=1`.
- **the car is not moving** — no. 399-656 m per 8 s window, 50-281 km/h.
- **the world not loaded / a scene simplified** — no. 3694 calls and 6.62 M triangles at night-wet on
  HEAD against W2's 3866-4031 / 6.42-6.81 M: the same order, and the *reason* it is not lower is
  that neither gate removes a draw from the presented frame.
- **the p50 flattered by display cadence** — checked, and it is not. corner delivers 79.5 frames/s,
  well above any 60 Hz cadence, so `--disable-frame-rate-limit` is working and nothing is pinned to
  16.67 / 33.3. night-wet's mode is a smooth 32-34 ms with populated bins either side.
- **the instrument counting frames it did not present** — PARTLY TRUE, and it is mine as much as
  theirs: see 1d. 10.7% of cruise's ring is catch-up ticks under 3.5 ms. Merging them moves the p50
  by 0.1 ms and does not change any verdict, but it is why I report frames/s beside every p50.
- **the win borrowed from a peer's commit** — no. W1 -> W2 is flat (2a), so the 14 ms is this
  commit's.
- **a percentile improved by shortening the window** — no. My windows are a fixed 8 s after a fixed
  3.5 s warm on all three trees, and the first-second behaviour is measured separately in 4b, where
  it is the AFTER that is worse.

## 7. PROCESS FINDINGS

1. **`game/main.js` was edited.** `tools/WAVE-S-ROUND2.md:24` says *"`game/main.js` IS OWNED BY
   NOBODY THIS ROUND ... it is now FROZEN"*, and this commit changes it in six hunks, 114 lines. The
   same brief also says perf is not in that round's batch and runs alone afterwards, so I read the
   freeze as scoped to the three concurrent builders and lapsed by the time perf ran. The edits are
   declared line by line in the report, they are all additive, and I found no collision with the
   peers' work. **Flagged, not scored against the piece** — but the next brief should say which of
   the two readings is intended, because a builder guessing costs a round.
2. **`tools/progress.mjs` staleness is confirmed** and the routing is correct. `PLAY` at
   `tools/progress.mjs:48-55` keys on base piece names and `pieces[]` at `:86-105` keys on the
   verdict filename, so `perf-r2.md`, `perf-critic.md` and this file all land under keys that do not
   exist and the board still shows round ONE's perf numbers. Round 1's critic verdict was never on
   the board either. Not in my ownership.
3. **`STAGE_MS.warm` at `main.js:124`** is declared 78 ms against a measured ~1100 ms. Confirmed by
   the `__ready` times in 4b. Cosmetic, and the builder already declared it.

## 8. THE VERDICT

VERDICT: PARTIAL

**Is the p50 bar met, per scenario, with the buffer read off the driver?** At
`glDrawingBuffer 1280x720, pixelRatio 1, devicePixelRatio 1, resScale 1`:

| scenario | p50 | p50 <= 16.7? | frames delivered/s | % of frames > 16.7 ms | sustained 60 fps? |
|---|---|---|---|---|---|
| corner | 13.00 | **YES** | **79.5** | 3.5% | **YES** |
| cruise | 16.10 | **YES** | 55.2 | 33.5% | **NO** |
| city | 21.80 | no | 45.3 | 97.3% | no |
| boost | 22.10 | no | 44.6 | 96.1% | no |
| night-wet | 32.70 | no | 30.2 | 99.6% | no |

**Is the p99 stall defect fixed?** Improved on every scenario and cut hard on the two that were
worst (night-wet -39%, boost -26%), but not fixed: every scenario's p99 is still 2-3x the bar, boost
still throws a 93-109 ms frame every window, and **the first second of play regressed** (4b).

**Did any scene get worse to look at?** No. Six presets are inside the noise floor;
wet-night-asphalt moved 87/255 on the car and its reflection only, and at 3x it is not worse. **The
veto does not fire.**

**Is the wave's bar — 60 fps SUSTAINED at 1280x720 real pixels — met?** **PARTIALLY MET.**
Genuinely met on `corner` (79.5 fps, 3.5% of frames over 16.7 ms). Met on `cruise` by the p50 and
**not** by the bar as worded: 55.2 frames per second and a third of frames over 16.7 ms.
**NOT met on `city` (45 fps), `boost` (45 fps) or `night-wet` (30 fps)** — and night-wet is the
state a player reaches with two clicks in the menu the wave itself shipped.

Why PARTIAL and not PASS: the headline is real (night-wet -30%, reproduced), the p99 work is real,
and nothing is faked — but two of the three mechanism claims need correcting before the next wave
acts on them (the frustum fill is worth 0.00 ms and POOL is the entire light win; the cube-probe row
of the trace is over-counted by ~10 ms and gate 2 is worth 0.00 ms at p50/p99), one headline claim is
refuted outright (the first playable second is worse, not better), and four of the five p50 rows in
the report are noise dressed as small wins.

Why not FAIL: every number I could re-derive reproduced, the buffer is honest on all 41 windows, the
kill-controls confirm the two fixes that matter, the shadow-map refusal is real and the default is
untouched, and no scene got worse.

## 9. WHAT THE NEXT WAVE SHOULD DO WITH THIS, ranked

1. **`POOL` is the lever at night, at 2.2 ms per point light, measured.** 10 -> 8 is ~4.4 ms and the
   census says it drops an in-shot emitter on ~12% of frames. That is a quality decision with a
   price tag on it, and it is the largest single lossless-looking item left on the worst scene.
2. **The probe's cube faces are still 1469 calls / 2.34 M triangles per face.** A bake-only distance
   LOD is untaken and it is now a `max`/p99.5 fix rather than a p50 one — size the work accordingly.
3. **The 174-300 ms hitch on the third frame of play is a live, reproducible, deterministic defect on
   HEAD** (4b). It is not shader compilation (progs is already 192 at `__ready`). Nobody has traced
   it. It is the single most player-visible stall left in the build.
4. **Do not spend a round on reflection gate 2 or on the frustum fill.** Both are worth 0.00 ms.
5. **`night-wet` cannot reach 16.7 ms losslessly** and the builder's routed item stands. The
   decomposition to spend against is theirs; my only correction is that "ten remaining point lights
   7.47 ms" is a real 22 ms of shader cost at 2.2 ms/light if you take them all away.

```progress-metrics
night-wet p50: 32.70 ms at 1280x720 ratio 1 dpr 1 (BEFORE 46.70, -30.0%, 3 runs 32.50-33.10)
night-wet p99: 52.90 ms at 1280x720 ratio 1 (BEFORE 86.90, -39%)
cruise p50: 16.10 ms at 1280x720 ratio 1 - inside the bar, but 55.2 frames/s and 33.5% over 16.7 ms
corner: 13.00 ms p50, 79.5 frames/s, 3.5% over 16.7 ms - the only scenario that SUSTAINS 60 fps
city / boost p50: 21.80 / 22.10 ms at 1280x720 ratio 1 - MISS, flat vs the true BEFORE
point light cost: 2.2 ms each at night-wet 1280x720 (kill-control: 14 -> 10 lights = -8.9 ms)
reflection gate 2 (the only pixel-moving change): 0.00 ms p50, 0.00 ms p99, -18 to -31 ms on max
first 700 ms of play: HEAD 24-32 frames with a 174-300 ms hitch in 4/4 boots; BEFORE 42-43 in 3/4
visual regression gate: no scene worse; wet-night-asphalt maxDiff 87 on the car only, noise floor 3-6
```
