# wave-s / perf — the optimisation pass

**I AM RUNNING ALONE.** The brief told me nothing else is touching the machine or the repo, and I
checked: `ps -Ao pcpu,args | grep -iE 'chrome|node'` shows no headless chromium and no peer
scratchpad process, load average `2.34 2.71 3.99` at start. So every frame-time number below is a
RESULT, not a smoke test. Each headline is taken three times with the spread quoted, and every
frame-time line carries `renderW/renderH/pixelRatio/devicePixelRatio/resScale`.

**Tree state before I started.** HEAD `f9a4d8d`. `git status` shows three peer edits to `game/`
that I did NOT make and do NOT revert:

- `game/main.js` — crash-feel knobs (`CRASH_HOLD_S 2.2`, `CRASH_DEMO_SEVERITY 0.55`, crash-speed
  floor `30 -> 12`). Not on a render path.
- `game/traffic.js:60` — `POOL 56 -> 22`. This one DOES change the render load, so my baseline is
  taken on the working tree as it stands and is not comparable to perf-profile's baseline.
- `game/world.js:2465` — new `NPC_DENSITY = 0.40` scaling stationary NPC populations. Same caveat.

I therefore re-take my own baseline rather than inheriting perf-profile's numbers, and say so on
every comparison.

**My work order is `verdicts/wave-s/perf-profile.md`'s ranked list**, worked top-down.

(appended as work lands)

## 0. Baseline on this tree

`node tools/fps.mjs --scenarios cruise,city --repeat 3` — warmup 2.5 s, measure 8 s, scene
`dusk-highway-chase`, headless chromium ANGLE/Metal, `--disable-frame-rate-limit`.
**Every row below: renderW 1280, renderH 720, pixelRatio 1, devicePixelRatio 1, resScale 1.**
Raw: `verdicts/wave-s/perf-base-A.json`.

| scenario | run | n | mean | p50 | p90 | p99 | max | >16.7% | calls | tris |
|---|---|---|---|---|---|---|---|---|---|---|
| cruise | 1 | 171 | 46.99 | 23.85 | 114.70 | 120.25 | 132.01 | 68.4% | 984 | 12.46 M |
| cruise | 2 | 169 | 47.45 | 23.74 | 115.67 | 122.36 | 128.57 | 67.5% | 963 | 12.10 M |
| cruise | 3 | 178 | 45.01 | 23.31 | 111.99 | 114.61 | 131.74 | 72.5% | 983 | 12.46 M |
| city | 1 | 141 | 57.27 | 28.97 | 137.72 | 179.34 | 196.14 | 72.3% | 1065 | 12.46 M |
| city | 2 | 154 | 52.04 | 25.17 | 120.54 | 139.42 | 159.65 | 77.9% | 1060 | 12.46 M |
| city | 3 | 146 | 55.27 | 24.28 | 138.79 | 164.52 | 175.41 | 71.2% | 1042 | 12.10 M |

cruise p50 spread 2.32%, city p50 spread 19.30%. **The city spread is itself the symptom**: the
distribution is bimodal and p50 samples whichever mode it lands in, exactly as perf-profile said.
Mean is the honest headline for the BEFORE state: **46.5 ms cruise / 54.9 ms city**.

## 1. The reflection probe: rate-limited, not killed

perf-profile's routed item 1. `game/car.js`.

BEFORE `car.js:1869-1871`:
```
  const PROBE_RES = 512;
  const PROBE_EVERY = 6;      // frames between refreshes
  const PROBE_MOVE = 5.0;     // ...or sooner, once the car has driven this far (metres)
```
AFTER `car.js:1869-1886` (comment elided; the literals are what matter):
```
  const PROBE_RES = 512;
  const PROBE_MIN_FRAMES = 30; // hard floor: never re-bake sooner than this many ticks
  const PROBE_MOVE = 40.0;     // ...then re-bake once the car has moved this far (metres)
  const PROBE_MAX_FRAMES = 90; // ...and always by here, so a PARKED car still tracks a time-of-day
```
and the trigger, `car.js:1965-1971`, BEFORE
`if (probeAge >= PROBE_EVERY || moved > PROBE_MOVE) refreshEnv();` AFTER
`const due = probeAge >= PROBE_MIN_FRAMES && (moved > PROBE_MOVE || probeAge >= PROBE_MAX_FRAMES);`
— i.e. a floor the distance trigger cannot undercut, which is the whole defect: at 272 km/h the old
5 m was 66 ms of travel, so distance always won and the probe re-baked ~7 times a second.

**SUPERSEDED, READ SECTION 6 BEFORE CHECKING THIS AGAINST `git diff`.** The three literals above are
what this step shipped and what its numbers were taken on; section 6 later moves them to
`PROBE_MIN_FRAMES 60 / PROBE_MOVE 60.0 / PROBE_MAX_FRAMES 180` and `PROBE_RES 512 -> 256`, and those
are what the final diff contains. This section is the log of the step, not the final state.

`PROBE_RES` is deliberately UNCHANGED at 512 **at this step**. Cutting it to 128 would have been the cheap way to the
same milliseconds and it would have visibly softened `car-paint-closeup`: PMREM's chain length is
`log2(size)`, so a shorter chain puts the 0.03-roughness clearcoat lobe on an already-blurred mip.
The rate is free; the resolution is not.

Plus one companion edit in `main.js` shot path, BEFORE nothing / AFTER `car.refreshEnv();` inserted
after `scene.updateMatrixWorld(true)` and before the four settle renders: with a rate limit the last
automatic bake can sit up to 90 ticks behind the final pose, and a screenshot must not reflect a
street the car has already left. The shot path is now MORE current than before the rate limit.

### Measured, `--repeat 3`, renderW 1280 / renderH 720 / pixelRatio 1 / dpr 1 / resScale 1

| scenario | mean BEFORE | mean AFTER | p50 BEFORE | p50 AFTER | p99 BEFORE | p99 AFTER | p50 spread AFTER |
|---|---|---|---|---|---|---|---|
| cruise | 46.48 | **34.52** | 23.63 | 32.87 | 119.07 | 103.12 | **0.50%** |
| city | 54.86 | **39.64** | 26.14 | 38.72 | 161.09 | 108.45 | **1.09%** |

**-11.96 ms of mean on cruise, -15.22 ms on city.** perf-profile predicted 11.4 ms of mean from
killing the probe outright and a probe-killed p50 of 33.06; I measure 11.96 ms and 32.87 from
rate-limiting it. **Agreement to 0.6 ms, and the rate limit is as good as the kill** — it keeps the
reflection live and buys the same milliseconds, so the kill-control was a fair estimate of the fix.

p50 gets WORSE by 9.2 ms and that is the correct outcome, not a regression: the old p50 was sampling
the cheap mode of a bimodal distribution. `tris` per frame drops 12.46 M -> 7.74 M and `calls`
984 -> 686, which is the mechanism, and the 2.32%/19.30% run-to-run spread collapses to
0.50%/1.09%, which is the proof there is no longer a feedback loop.

## 2. Spatial chunking of the world: frustum culling that could not previously happen

perf-profile's routed item 2 and its "instances-10pct 5.84 ms" row. `game/world.js`.

Every instanced pool was allocated by `inst()` with `frustumCulled = false` (`world.js:1076`), which
was the right call while a pool was one mesh: 150 000 mullions spread over the whole map have a
map-wide bounding sphere, so the frustum test can only ever say yes. The consequence was that
**203 540 instances / 2.40 M triangles were submitted every frame, three times over** — the colour
pass, the shadow pass, and SSAO's depth/normal prepass each re-submit the scene, which you can see
in the counters (`ssao-off` alone drops 2.16 M triangles out of the frame).

AFTER (`world.js:2886-3018`): a boot-time pass re-cuts every large pool into one InstancedMesh per
`CHUNK = 200` metre cell (`world.js:2918`), each with `frustumCulled = true` and its own tight
bounding sphere, attached as CHILDREN of the original mesh so that every later handle
(`spillMesh.visible`, `towers`, `carKit`) and every `setNight()` material edit still works; the
parent keeps its identity, draws nothing (`count = 0`), and is removed from the render list with
`layers.disableAll()`. Runtime evidence: `world.chunkStats` = `{chunks: 1386, moved: 192877,
cell: 200}`.

**This is frustum culling, not a distance cull, and that distinction is the whole visual argument.**
The skyline is 800 m away and is supposed to be there; culling by range would delete it. Culling by
view volume cannot change a pixel, and the kill-control below shows it does not.

`node tools/perf-probe.mjs --mode inspect` after: **294 528 of 2 590 611 triangles (11.4%) in 297 of
2448 drawables survive visibility + frustum**. Before, all of them were drawn.

Same pass also sets `group.matrixWorldAutoUpdate = false` after one forced update
(`world.js:3016-3017`): nothing under `world.group` ever moves, and the chunking multiplies the
object count in that subtree, so leaving it on would have handed back part of the win.

### Measured, cruise, renderW 1280 / renderH 720 / pixelRatio 1 / dpr 1 / resScale 1
p50 **32.87 -> 27.59** (`-5.28 ms`), triangles/frame 7.74 M -> 1.03 M, draw calls 686 -> 780.

perf-profile predicted **5.84 ms** from its instances-10pct kill-control. I measured **5.28 ms**.
Agreement inside 0.6 ms. But note what the counters say and the clock does not: **triangles fell
7.5x for 19% of the frame time.** That is the finding — this frame is not triangle-bound either, and
the ranked table's `world-hidden` row is mostly the FILL cost of a city that covers the screen,
which no culling can touch.

### CHUNK was swept, not guessed (cruise p50, 3 runs each)
| cell | p50 | draw calls |
|---|---|---|
| 120 m | 28.00 | 959 |
| **200 m** | **27.59** | 780 |
| 400 m | 28.62 | 790 |

### A hypothesis I tested and had to retract
I then bucketed pools by (geometry, material, shadow flags) before cutting them, on the theory that
the city's 2285 draw calls were the reason downtown lagged the highway: a bench slat, a light head
and a sign frame are all `boxGeo` + `darkMat` and were only separate because different functions
built them. It works as advertised — calls fell 789 -> 746 on cruise and 2554 -> 2288 in the city —
and it bought **0.16 ms, inside the noise floor**, against the ~3.5 ms I predicted from 4 µs/call.
**The city is not draw-call bound.** I kept the merge because it is strictly cheaper and it makes
the chunk count defensible, but the prediction was wrong and the reason downtown is expensive is
fill and shading, not submission.

### Visual gate
Rendered `daytime-downtown` with `CHUNK_MIN = Infinity` (chunking off, everything else identical):
`shots/s/perf-nochunk-daytime.png` against `shots/s/perf-A-daytime-downtown.png`. **Identical.**

## 3. SSAO: half-resolution AO, and a short far plane on its prepass

`game/post.js`. Two changes, one that paid and one that did not.

- `post.js:715` `AO_SCALE = 0.5`: the normal/depth prepass, the occlusion integral and the blur run
  at half linear resolution; only the multiply into the frame stays full-res. Safe because the AO
  signal is dithered by a 4x4 noise and immediately box-blurred over that same 4x4 footprint, so it
  contains nothing finer than four texels by construction.
  **p50 27.59 -> 25.85, `-1.74 ms`.** perf-profile predicted 1.60 ms from its `ssao-half`
  kill-control. Agreement inside 0.15 ms.
- `post.js:690` `_aoFar = 620` with a cloned prepass camera (`post.js:686-700`, used at
  `post.js:757` and read back into `uProj`/`uProjInv` at `post.js:790`): the prepass was being asked
  for the full 6 km view distance although both AO fade terms are identically zero past 600 m.
  **p50 25.85 -> 25.49, `-0.36 ms`, which is at the noise floor and I am reporting it as a miss.**
  On the highway the skyline is off to the sides and mostly out of frustum already, so there was
  little for the short far plane to reject. I kept it because it is lossless and it will matter more
  downtown, but it did not buy a measurable frame on the scenario I measured.

### Visual gate
`daytime-downtown` re-rendered with `AO_SCALE = 1.0` and `_aoFar = 6000`:
`shots/s/perf-aofull-daytime.png` against `shots/s/perf-A-daytime-downtown.png`. No visible
difference; region stats move by at most 1.5/255 (`tools/_px.mjs`).

## 4. THE BIG ONE, AND THE ONE WITH A REAL COST: 4x MSAA -> FXAA

`game/main.js:183-185, 211-215`. BEFORE `samples: 4` hard-coded. AFTER
`const msaaSamples = Math.max(0, Math.min(8, Math.round(parseFloat(params.msaa) || 0)));` with
`samples: msaaSamples`, plus `const fxaa = msaaSamples > 0 ? null : new ShaderPass(FXAAShader);`
appended last in the chain, after the graded output pass, with its `resolution` uniform driven off
the DRAWING BUFFER size (`main.js:239-243`) so `resScale` cannot blur it.

| build | cruise p50 |
|---|---|
| 4x MSAA (as shipped) | 25.49 |
| 2x MSAA | 21.35 |
| 0x MSAA | 18.15 |
| **0x MSAA + FXAA (shipped)** | **18.71** |

**4x MSAA was 7.34 ms of a 25.49 ms frame.** FXAA costs 0.56 ms of that back. perf-profile predicted
7.48 ms for the MSAA row; I measured 7.34.

**The counterfactual, measured on the FINAL build:** `#msaa=4` gives cruise p50 **23.41 / 24.76 ms
(40-43 fps)**. So with 4x MSAA, 60 fps at resScale 1.0 is not reachable by any other change in this
verdict. perf-profile's stated ceiling ("60 at 1.0 only if MSAA changes") is confirmed exactly.

### Visual gate: THIS IS THE ONE CHANGE WITH A VISIBLE COST, AND IT IS SHIPPED BEHIND A KNOB
`shots/s/zoom-msaa4.png` vs `shots/s/zoom-fxaa.png` (`daytime-downtown`, 900-1180 x 40-250, 3x).
At 3x zoom FXAA is **softer**: the 1-px cornice lines and the mullion piers lose a little
definition, and FXAA's edge filter is doing its job (nothing is jagged) but it is not resolving what
four samples resolved. At 1:1 it reads as a slight softening rather than as aliasing.

I am not shipping this silently and I am not calling it free. `#msaa=4` restores the old chain
exactly (and skips FXAA, because stacking them only costs sharpness); `#msaa=2` is the middle at
21.35 ms. **The decision is available to the user with both numbers and both PNGs.** The default is
the 60 fps path because 60 fps is this wave's bar.

## 5. The HUD: three `ctx.filter` blurs were the entire HUD cost

perf-profile routed the HUD's 3.78 ms as compositing a full-window 2-D canvas and said `hud.update()`
was only 0.92 ms of CPU. **The mechanism was wrong and the number was right**, and the difference
matters because "compositing" is unfixable in-page while what it actually is, is fixable.

Kill-control ladder, one sub-draw removed at a time, cruise p50, baseline 19.15:
`drawCrashState` 19.57, `drawStreetPlate` 19.27, `drawMinimap` 19.32, `drawFeed` 19.38,
`drawSpeedo` 19.14, `drawBanner` 19.50 — **all noise** — and **`drawBoost` 15.68**. Then, inside
`drawBoost`, skipping only the three additive `BOOST_BLOOM` passes and leaving every fbm, mask,
fray, filament and gradient running: **15.59**. So the whole HUD cost is three
`ctx.filter = blur(...)` draws. Skia allocates a save-layer and runs a separable blur per pass per
frame on the raster thread, which is exactly why a `performance.now()` bracket around `hud.update()`
could not see it.

AFTER (`hud.js:913-960`): each pass is blurred in a buffer downscaled by `D = clamp(floor(r / 2), 1,
4)` with the radius divided by `D`, then expanded bilinearly. A blur of radius r has no content
finer than r, so this is close to free of information. The tightest pass (0.030 bar-heights, r ~ 1.8
px) correctly lands on `D = 1` and is untouched. The r7 composite-order rule is untouched: halo
first, crisp body last, body still at native resolution.

- downscaled blur, `imageSmoothingQuality = 'high'`: p50 19.15 -> **17.29** (`-1.86 ms`)
- `'low'` (bilinear; the source is a blur, so 'high' resampling is buying nothing): **16.52**
  (`-2.63 ms` total)

### Visual gate
`shots/s/zoom-hudorig.png` vs `shots/s/zoom-hudnew.png` (`hud-overlay`, the boost bar, 2x).
Identical to the eye: same halo reach, same torn rails, same white-hot filament.

## 6. The p99 is a separate deliverable, and it is the probe again

After section 1 the probe was still one 6-face bake landing inside a single rAF callback: cruise
p99 88 ms against a p50 of 18.7.

AFTER (`car.js:1928-2038`): `refreshEnv()` is split into `aimProbe()` / `renderProbeFace(face)` /
`finishProbe()`, and `serviceEnv()` walks a bake across seven consecutive ticks — one cube face per
tick, then the PMREM chain. All six faces still render from the position captured when the bake
STARTED, so the cube has no seam. This removes **zero** total GPU work; it converts one 100 ms hitch
into six ~14 ms ones. `refreshEnv()` survives as the synchronous path for the first bake at boot and
for the screenshot runner.

**cruise p99 88.5 -> 50.5 ms, max 98 -> 80 ms, for p50 +0.6 ms.** That is the trade, stated plainly.

Then two cadence/cost changes, both measured against their own visual gate:
- `car.js:1885-1887` `PROBE_MIN_FRAMES 30 -> 60`, `PROBE_MOVE 40 -> 60`, `PROBE_MAX_FRAMES 90 -> 180`.
- `car.js:1869` `PROBE_RES 512 -> 256`. **I argued against this in section 1 and then measured it and
  changed my mind.** `shots/s/perf-probe256-car.png` against `shots/s/perf-A-car-paint-closeup.png`
  is indistinguishable by eye and moves the full-frame mean by 0.2/255; the shorter PMREM chain does
  not show on this car at 720p. p99 49.6 -> 35.8.

### And a kill-control that overturned my own diagnosis of p90
cruise p90 sat at **33.3 ms in every single build** from the chunking step onward — 33.90, 33.63,
33.56, 33.28, 33.36 — while p50 walked from 27.6 down to 16.4. I assumed it was the probe. With the
probe set to bake exactly ONCE (`PROBE_MOVE = 1e9, PROBE_MAX_FRAMES = 1e9`) it is still
**p90 33.33, p50 16.28**. 33.33 ms is exactly two 60 Hz intervals. **The 33 ms mode is a dropped
present, not our workload**: now that the frame costs ~16.5 ms we are riding the cadence, and a frame
that misses it waits for the next one. It is invisible while p50 is above ~20 ms, which is why no
earlier pass saw it. Corollary for whoever reads the headline: p50 16.5 means "makes 60 Hz more often
than not", and buying real headroom (~14 ms) is worth more from here than buying another 0.5 ms.

## 7. FINAL NUMBERS

`node tools/fps.mjs --repeat 3`, warmup 2.5 s, measure 8 s, scene `dusk-highway-chase`.
**Every row: renderW 1280, renderH 720, pixelRatio 1, devicePixelRatio 1, resScale 1.**
Raw: `verdicts/wave-s/perf-final-scenarios.{txt,json}`.

| scenario | mean | p50 (3 runs) | spread | p90 | p99 | fps @ p50 | >16.7 ms |
|---|---|---|---|---|---|---|---|
| corner | 13.26 | **13.17** (13.17-13.30) | 0.99% | 16.9 | 33.6 | **75.9** | 11.0% |
| cruise | 17.16 | **16.50** (16.33-16.65) | 1.99% | 33.3 | 46.7 | **60.6** | 46.5% |
| city | 22.76 | **22.53** (22.30-22.82) | 2.31% | 28.8 | 44.3 | 44.4 | 93.0% |
| boost | 24.27 | **23.94** (23.84-23.95) | 0.46% | 29.5 | 78.9 | 41.8 | 89.3% |
| night-wet | 50.64 | **49.95** (48.81-50.14) | 2.72% | 67.9 | 101.2 | 20.0 | 99.4% |

Against my own tree baseline (section 0): cruise mean **46.48 -> 17.16** (2.71x), p99
**119.07 -> 46.73** (2.55x); city mean **54.86 -> 22.76** (2.41x), p99 **161.09 -> 44.26** (3.64x).
Against the brief's pre-wave baseline (mean 49.65, p50 41.20, p99 399.70): mean 2.9x, p99 8.6x.

### DID IT REACH 60 AT SCALE 1.0? PARTLY, AND HERE IS EXACTLY WHERE.
**Yes** on the open highway, which is the scene the wave baseline was taken on: cruise p50 16.50 ms
(60.6 fps) and cornering 13.17 ms (75.9 fps), both at 1280x720 real pixels.
**No** downtown (22.53 ms, 44 fps), **no** under boost (23.94 ms, 42 fps), and **emphatically no** at
night in the wet (49.95 ms, 20 fps). And even on cruise, 46.5% of frames are over 16.7 ms because
the frame sits right on the 60 Hz boundary (section 6) — the honest phrasing is "it makes 60 Hz
about half the time on the highway", not "60 fps sustained".

### Resolution ladder, p50 ms, 2 runs each (`verdicts/wave-s/perf-final-res.txt`)
| resScale | buffer | cruise | city | night-wet |
|---|---|---|---|---|
| 1.00 | 1280x720 | 16.38 | 23.24 | 50.69 |
| 0.85 | 1088x612 | 14.14 | 20.31 | 44.34 |
| 0.70 | 896x504 | 12.33 | 17.30 | 38.75 |
| 0.55 | 704x396 | 10.03 | 15.40 | 32.88 |

Highest scale that holds 60 fps at p50: **cruise 1.0** (0.85 for comfortable headroom at 14.1 ms),
**city ~0.55**, **night-wet not reachable at any scale down to 0.55**. night-wet only loses 35% of
its frame time for 70% of its pixels, so it is not fill-bound and resolution is the wrong lever for
it — see the routed findings.

## 8. WHAT I TRIED THAT DID NOT WORK
1. **Bucketing pools by draw state to cut the city's draw calls** — worked mechanically (2554 -> 2288
   calls), bought 0.16 ms against a predicted 3.5 ms. The city is not draw-call bound. Kept anyway.
2. **A short far plane on the SSAO prepass** — 0.36 ms, at the noise floor on cruise. Lossless, kept,
   but reported as a miss.
3. **CHUNK 120 and CHUNK 400** — both worse than 200 (28.00 and 28.62 against 27.59).
4. **My own p90 diagnosis** — I spent two measurements assuming the flat 33.3 ms p90 was the probe.
   The kill-control says it survives the probe being dead. Retracted; see section 6.
5. **`imageSmoothingQuality = 'high'` on the HUD halo upscale** — 0.77 ms more expensive than `'low'`
   for a resample of an image that is already a blur. Not a mistake I would have caught by reading.

## 9. AVAILABLE BUT NOT TAKEN, with numbers, so the decision is the user's
- **4x MSAA.** `#msaa=4`. Costs 7.0 ms (cruise p50 16.5 -> 23.4). Sharper mullion and cornice edges
  than FXAA. If the user prefers the edges to the frame rate, this is one hash parameter.
- **Shadows.** `shadows-off` is still 3.74 ms on the optimised build. The 4096 map itself is cleared
  (perf-profile measured 2048 at 0.51 ms); the cost is caster submission plus PCFSoft's taps in every
  pixel. Not taken: every cheaper option I could see (PCF instead of PCFSoft, a lower-frequency
  cascade update) changes what shadows LOOK like, and that is the hard constraint.
- **Bloom** 1.69 ms and the remaining **SSAO** 2.61 ms both have quality-for-time trades left in them.

## 10. ROUTED
1. **`night-wet` is now the worst scene in the build by a factor of two: 49.95 ms, 20 fps, 99.4% of
   frames over budget.** It is NOT fill-bound (0.55 resScale only takes it to 32.9 ms) and it is not
   my changes making it worse — with chunking disabled it is 57.35 ms, so chunking is buying it 7.4
   ms. The counters point at `world.js`'s dynamic point-light pool (`POOL = 14`, `world.js:2850`):
   `progs 182` and `geos 750` against `130`/`392` at dusk, i.e. every material recompiles for 14
   lights and every draw call shades all of them. A tighter pool, or lights culled per draw call, is
   the next wave's biggest single win.
2. **The 33.3 ms second mode is the display cadence, not the workload** (section 6). Anyone chasing
   `>16.7%` down needs headroom to ~14 ms, not another 0.5 ms off 16.5.
3. **`boost` is 23.94 ms**, 7.4 ms worse than cruise on the same road, with `calls 974` and `progs
   146`. The plume and the smear pass are the delta. I did not touch `boost.js` because the
   `smear-pass-off` kill-control reads as noise when the pass is idle; under actual boost it is not
   idle and nobody has measured it in that state.
4. **`hud.js` now owns a perf-sensitive constant** (`MIN_SMALL_R`, `hud.js:936`). If the boost bar's
   halo is ever re-tuned, the halo passes are the HUD's entire frame cost and they are the first
   thing to re-measure.

```progress-metrics
cruise p50: 16.50 ms (60.6 fps) at 1280x720 @ ratio 1.0, 3 runs 16.33-16.65
cruise p99: 46.73 ms at 1280x720 @ ratio 1.0 (was 119.07)
city p50: 22.53 ms (44.4 fps) at 1280x720 @ ratio 1.0
night-wet p50: 49.95 ms (20.0 fps) at 1280x720 @ ratio 1.0 - worst scene, routed
cruise mean: 17.16 ms (was 46.48) at 1280x720 @ ratio 1.0
60 fps holds at resScale: 1.0 highway, ~0.55 city, never night-wet
```

## 11. THE VISUAL REGRESSION GATE, in one place
All seven scene ids re-rendered at 1280x720 after every change: `shots/s/perf-FINAL-<id>.png`.
All seven render; `tools/shot.mjs` is unchanged in behaviour.

Each change was gated against a build differing ONLY in that change, because the working tree also
carries a peer's `world.js` NPC_DENSITY edit which re-rolls the shared procedural RNG stream and
therefore changes every building, shadow and parked car downstream of it — a naive
HEAD-vs-now comparison shows large differences that are not mine, and I nearly reported one.

| change | control | verdict |
|---|---|---|
| probe rate limit + `car.refreshEnv()` in shot path | `car.js` at HEAD | region stats **byte-identical** |
| world chunking | `CHUNK_MIN = Infinity` | identical |
| SSAO half-res + short far plane | `AO_SCALE 1.0`, `_aoFar 6000` | identical to the eye, <=1.5/255 |
| HUD halo downscale | `hud.js` before the edit | identical to the eye at 2x zoom |
| PROBE_RES 512 -> 256 | the 512 render | identical to the eye, 0.2/255 on the full frame |
| **4x MSAA -> FXAA** | `#msaa=4` | **VISIBLE: softer edges. Shipped behind `#msaa`, section 4.** |

Boot check (rule 4): playable path booted headless, `#nomenu=1`, **0 console errors**, then
`applyTimeOfDay('night')` + `applyWet(1)` + `applyTimeOfDay('midday')` + `setResScale(0.7)`,
still **0 console errors**. `world.chunkStats` reads
`{chunks: 1386, moved: 192877, cell: 200}` at runtime.
