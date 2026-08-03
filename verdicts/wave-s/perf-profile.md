# wave-s / perf-profile — where the frames go

**I MEASURE AND RANK. I DO NOT OPTIMISE.** No file under `game/` is touched by this piece. My
deliverable is a ranked, evidence-backed attribution table plus a CPU-vs-GPU verdict and a stall
diagnosis, so the optimisation agent spends its pass on the right object.

**I AM RUNNING ALONE.** The brief told me nothing else is touching this machine, so the frame-time
numbers below are RESULTS, not smoke tests. Every headline is taken three times and the spread is
quoted beside it. Every frame-time line carries `renderW/renderH/pixelRatio/devicePixelRatio`.

Tree state when I started: `git status` shows `game/main.js` modified by a peer (the crash-feel
knobs `CRASH_HOLD_S 2.2` / `CRASH_DEMO_SEVERITY 0.55` and the `Math.max(30 -> 12)` crash-speed
floor). None of that is on a render path, so I profile the working tree as-is and say so.
HEAD at start: `5c88d7c`.

## Method

- `tools/fps.mjs` (built by the fps-harness piece) for baseline, scenario and subsystem sweeps.
  I verify its ranking rather than inherit it.
- `tools/perf-probe.mjs` (mine, new) for the three things fps.mjs cannot do: per-phase CPU timing
  inside `tick()`, a timestamped stall timeline with program/geometry/texture counters attached,
  and extra kill-controls that live-poke objects fps.mjs has no toggle for (shadow map size, SSAO
  target size, MSAA sample count, world sub-groups).
- Frame time is always `window.__frameStats` (rAF-to-rAF wall clock). I never bracket
  `composer.render()` with `performance.now()` and call that a frame time.

(sections below are appended as work lands)

## 1. TODAY'S BASELINE, per scenario

`node tools/fps.mjs --repeat 3` — warmup 2.5 s, measure 8 s, scene `dusk-highway-chase`, headless
chromium ANGLE/Metal with `--disable-frame-rate-limit`. **Every row: renderW 1280, renderH 720,
pixelRatio 1, devicePixelRatio 1, resScale 1.** Raw output in `verdicts/wave-s/perf-baseline.txt`,
JSON in `perf-baseline.json`.

| scenario | p50 x3 (ms) | best p50 | mean | p90 | p99 | max | >16.7 ms | calls | tris/frame | progs | geos | km/h |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cruise | 56.26 / 59.91 / 25.90 | 25.90 | 42-99 | 100-251 | 178-330 | 363 | 63-70% | 984 | 13.23 M | 132 | 392 | 272 |
| boost | 28.11 / 29.58 / 42.62 | 28.11 | 48-59 | 96-127 | 114-187 | 194 | 72-75% | 1337 | 17.06 M | 148 | 395 | 281 |
| corner | 31.82 / 28.94 / 27.47 | 27.47 | 31-47 | 61-120 | 92-159 | 184 | 60-66% | 909 | 12.46 M | 132 | 392 | 250 |
| city | 32.78 / 40.42 / 31.66 | 31.66 | 38-58 | 73-143 | 111-211 | 238 | 68-72% | 994 | 12.07 M | 132 | 392 | 59-257 |
| night-wet | 27.91 / 25.10 / 25.34 | 25.10 | 64-113 | 197-359 | 316-461 | 474 | 51-53% | 2016 | 20.94 M | 188 | 750 | 236 |

**The tree HAS changed and the baseline moved with it.** The brief's pre-wave figure was p50 41.20 /
p99 399.70. Today cruise reads p50 25.90-59.91: the p50 got *faster* on its best run and *slower* on
its worst, and the reason is not noise, it is a feedback loop I identify in section 4. The handling
rewrite (`e3da294`) is directly implicated: cruise now settles at **272 km/h** where the fps-harness
piece recorded 137 km/h a few commits ago, and one of this frame's costs is charged **per metre
travelled**, not per second.

Three facts from this table that matter more than the p50s:

1. **The spread is the signal.** cruise's three p50s range 131%, boost 52%, city 28%, while corner
   (16%) and night-wet (11%) are tight. I owned the machine for all fifteen runs. A 131% spread on
   an uncontended machine is not measurement error, it is a bimodal build.
2. **The mean is 1.7-4.5x the p50 in every scenario** and 51-75% of frames miss 16.7 ms. This
   distribution has a long right tail on *every* run, not a clean p50 with occasional hiccups.
3. **night-wet is the tight one on p50 and the worst one on p99** (p90 up to 359 ms, p99 up to
   461 ms) at 2016 draw calls, 20.94 M triangles, 188 programs and 750 geometries. `applyTimeOfDay
   ('night')` roughly doubles the geometry count (392 -> 750) and adds 56 programs; that is a
   one-time allocation at the switch, not per-frame streaming (proved in section 4), but it means a
   player changing time of day from the pause menu pays a compile-and-upload stall.

## 2. THE SCENE IS SUBMITTED FIVE TIMES A FRAME, AND ONE OF THE SUBMITTERS IS NOT A PASS

`node tools/perf-probe.mjs --mode inspect` says the whole scene graph holds **2.74 M triangles**
across **843 drawables**, of which 2.68 M in 301 objects survive visibility and frustum culling at
any instant. `renderer.info` says **13.23 M triangles per frame**. Something submits the scene
about five times over, and no existing tool printed that.

`--mode submits` wraps `renderer.render()` and `WebGLShadowMap.render()` and takes the counter delta
across each call, so every triangle is attributed to the caller that submitted it. Median over 12
frames, cruise, renderW 1280 renderH 720 pixelRatio 1:

```
submission                                      invocs    calls        tris    cpuMs
renderer.render -> 512x512                           6      828    15447880   112.67
renderer.render -> 1280x720 msaa4                    3      430     5147758     3.15
renderer.render -> 1280x720                          3      300     2676086     1.17
shadowMap.render -> 1280x720 msaa4  (nested)         3      124     2451206     0.47
renderer.render -> 1536x2048  (PMREM chain)         23       23         276     0.19
renderer.render -> 640x360 and smaller (bloom)      16       16          16     0.06
```

And the per-frame totals are **bimodal, not noisy**:

```
calls/tris per frame, 12 consecutive frames:
743/7.82M  745/7.82M  1594/23.27M  743/7.82M  743/7.82M  1592/23.27M
743/7.82M  743/7.82M  743/7.82M    1594/23.27M 743/7.82M  1584/23.27M
```

Every third frame does **+850 draw calls and +15.4 M triangles** of extra work. That is a
**512x512x6 cube map re-render of the entire world**, and it is the single largest object in this
frame by a wide margin.

### It is `car.js`'s reflection probe, and the handling rewrite doubled how often it fires

`game/car.js:1869-1873`:

```js
const PROBE_RES = 512;
const PROBE_EVERY = 6;      // frames between refreshes
const PROBE_MOVE = 5.0;     // ...or sooner, once the car has driven this far (metres)
```

`serviceEnv()` (`car.js:1949-1956`) is called from the top of `car.update()` (`car.js:2330`) and
refreshes when `probeAge >= PROBE_EVERY || moved > PROBE_MOVE`. `refreshEnv()` (`car.js:1912`)
renders six 512-px faces of the whole scene with `cubeCam.update(renderer, scene)` and then runs
`PMREMGenerator.fromCubemap`.

The `PROBE_EVERY = 6` clause is not the one that fires. **`PROBE_MOVE = 5.0` metres is.** At today's
cruise speed of 272 km/h the car covers 75.6 m/s, so 5 m is **66 ms of travel** - which is less than
one frame at this build's frame time. The comment's own framing ("...or sooner") was written when
the car's terminal speed was 137 km/h; `e3da294` raised it to 272 and turned the safety clause into
the primary trigger.

Kill-controls, since a claim like that has to be deleted and measured rather than argued
(`car.js`'s probe is unreachable from `window.__game` because `serviceEnv` calls a closure-local
`refreshEnv`, so `tools/perf-probe.mjs` kills it through the two three.js prototypes it must pass
through: `CubeCamera.prototype.update` and `PMREMGenerator.prototype.fromCubemap`):

- `--kill probe-faces` (six face renders killed only): draw calls 1015 -> 717, triangles -4.63 M.
- `--kill probe` (faces + PMREM): draw calls 988 -> 684, and `probe/100f` goes to exactly 0.00,
  which is the proof the kill actually landed.

## 3. HONEST MISS FIRST: I WAS TOLD I WAS ALONE AND I WAS NOT

My brief says "YOU ARE RUNNING ALONE. Nothing else is touching the machine. Frame-time numbers you
take ARE VALID RESULTS." **That premise is false and I can show it.** Mid-session I checked `ps`
because a `--kill probe` run came back *slower* than the same build with the probe live, which is
mechanically impossible - the kill only ever removes work:

```
PID   %CPU  ELAPSED  ARGS
20390  0.0    01:27  node /private/tmp/claude-501/-Users-robray-fc-demos/91cf1b6d-.../scratchpad/carcount.mjs
20395 146.1   01:26  .../chrome-headless-shell   <- that harness's browser, at 146-202% CPU
load averages: 9.32 6.73 5.76
```

`carcount.mjs` is not mine and it lives in a different agent session's scratchpad. Later, after
waiting for a machine my own watchdog called quiet, the load average went to **38.48** during a
measurement window, with `softwareupdated` at 41%, `mobileassetd` at 46%, `WindowServer` at 41% and
a user's Arc browser at 33% - an OS software update running through my window.

So I added `verdicts/wave-s/perf-witness.txt`: my run script samples `ps` and the load average
before every measurement step, so each number below can be checked against the machine state that
produced it. Consequences, stated plainly:

- **Everything in section 1 (the baseline sweep, 19:05-19:11) and the first kill-control table
  (19:38) predate the peer harness** and I treat them as results.
- **A `--kill probe` stall window taken at 19:40 read p50 99.27 ms against a live-probe p50 of
  26.68 ms.** That is not a finding about the probe, it is 146% of a CPU belonging to somebody else.
  I am reporting it because the naive reading of that pair - "the reflection probe makes the game
  faster" - is exactly the kind of inverted conclusion this project has been burned by before.
- **The load-bearing evidence in this verdict is deliberately weighted towards quantities contention
  cannot move**: draw calls, triangles, per-frame submission counts, instance counts, the bimodal
  743/1594-call frame pattern, and WITHIN-window paired comparisons. Where I quote milliseconds I
  quote the min-envelope over interleaved passes and the load average that was in force.

Recommendation to whoever runs the next wave: **`ps -Ao pcpu,args | grep chrome-headless` and
`sysctl -n vm.loadavg` before trusting any ms figure in this project**, and re-run frame-time work
on a genuinely idle machine. The counts in this verdict will hold; the milliseconds deserve one
confirmation pass.

## 4. THE CLEAN BASELINE, taken on a verified-quiet machine

`node tools/fps.mjs --scenarios cruise,city --repeat 3`, load average 3.7 at start
(`perf-witness.txt`), raw in `perf-baseline-recheck.txt`. renderW 1280 renderH 720 pixelRatio 1
devicePixelRatio 1 resScale 1 on every row:

| scenario | p50 x3 | mean | p90 | p99 | max | >16.7 ms | spread |
|---|---|---|---|---|---|---|---|
| cruise | 23.15 / 23.49 / **23.04** | 45.1-45.8 | 110-112 | 115-118 | 121 | 69-73% | **1.93%** |
| city | 29.56 / 27.79 / **24.52** | 51.9-53.3 | 119-138 | 144-175 | 177 | 74-77% | 20.6% |

The 1.93% spread against the 131% I measured earlier is the proof that the earlier spread was the
machine, and that these are the numbers to quote.

**p50 IS THE WRONG STATISTIC FOR THIS BUILD, AND IT FLATTERS IT.** cruise reads p50 23.04 ms with a
**mean of 45.1 ms** and 70% of frames over 16.7 ms. A distribution whose mean is double its median
is not "24 fps with hiccups": it is two populations. The p50 is sampling the *cheap* frames between
reflection-probe bakes, and the p90 (110 ms) is sampling the bakes. Anyone who optimises against p50
on this build can halve the cheap frames and move the felt frame rate by almost nothing.

For comparison, the same scene with the probe killed is **uniform**: p50 33.06, mean 33.72, p99
52.78. The probe fix makes the p50 *worse* and the mean 11 ms *better*, and the mean is what the
player feels.

## 5. IS IT CPU OR GPU BOUND? GPU, WITH A LARGE RESOLUTION-INDEPENDENT FLOOR

Two independent tests, both with the probe killed so a fixed 512-px cost is not sitting inside every
cell, both on a quiet machine.

### Test (a): does frame time follow pixel count? Partly, and the intercept is the story

`--mode res --kill probe --repeat 3`, best p50 per cell (`perf-res-noprobe.txt`):

| resScale | buffer | Mpx | best p50 | vs res 1.0 | pixels vs 1.0 |
|---|---|---|---|---|---|
| 1.00 | 1280x720 | 0.92 | 33.06 | x1.00 | x1.00 |
| 0.85 | 1088x612 | 0.67 | 28.78 | x0.87 | x0.72 |
| 0.70 | 896x503 | 0.45 | 24.18 | x0.73 | x0.49 |
| 0.55 | 704x396 | 0.28 | 20.28 | x0.61 | x0.30 |
| 0.40 | 512x288 | 0.15 | 18.03 | x0.55 | x0.16 |

Perfectly monotonic and almost perfectly linear in pixel count:

```
p50  =  15.2 ms  +  19.4 ms per megapixel        (fit through 0.15 and 0.92 Mpx; predicts
                                                  res 0.70 at 23.9 vs 24.18 measured)
```

So at res 1.0 the frame is **17.9 ms of pixel-proportional work (54%) on top of a 15.2 ms floor that
resolution cannot touch (46%)**. Cutting pixels by 84% cut frame time by 45%.

**This kills "drop resScale to hit 60" as a standalone plan: the floor alone is 15.2 ms, and
`setResScale` clamps at 0.4 (main.js:74), where the measured best is 18.03 ms.**

### Test (b): where is the main thread while the frame elapses? Inside the GL calls

`--mode phase` patches the live module methods and times each one; `--mode finish` brackets
`composer.render()` and then calls `gl.finish()`. Probe killed, res 1.0, load 4.9:

```
phase                calls   meanMs      p50      p99     maxMs   %frame     (frame mean 33.72 ms)
composer.render        182    31.76    31.54    42.03     72.34    94.21
hud.update             182     0.92     0.87     1.67      2.04     2.73
traffic.update         182     0.08     0.07     0.17      0.18     0.23
audio.update / physics.step / camRig / car / world / boost / sky   each <= 0.06     total 0.25
-- accounted                  32.93                                97.67
-- tick() only                 1.17            <- ALL of our simulation, per frame
-- unaccounted                 0.79                                 2.33
```

**Our own game logic is 1.17 ms of a 33.72 ms frame.** There is no CPU-side simulation problem in
this build at all: physics, traffic, world, sky, camera, boost and audio together cost 0.25 ms.
Optimising any of them is worth nothing.

The remaining 31.76 ms is wall time spent *inside* `composer.render()`, and `gl.finish()` immediately
afterwards costs **0.01 ms** - the GPU has nothing left to drain. On its own that pattern is
ambiguous: it reads as "the CPU is slow inside the driver". The disambiguating measurement is the
same bracket at res 0.4:

| res | frame p50 | submit (CPU wall inside composer.render) | gl.finish() after it |
|---|---|---|---|
| 1.00 | 32.90-33.32 | **32.63 mean** | 0.01 |
| 0.40 | 18.03-18.40 | **16.04 mean** | 0.01 |

**Pixel count cannot change the amount of CPU work needed to submit a fixed set of draw calls. The
submission wall time halved with the pixel count, so that time is the ANGLE/Metal driver blocking on
a full command queue - it is GPU time, charged to the CPU's clock inside the draw calls, which is
also why `gl.finish()` finds nothing left to do.**

Two more contention-immune facts point the same way: `car-hidden` removes **387 draw calls** for
**1.72 ms** (4.4 us per call, so ~740 calls is not a submission bottleneck), while `msaa-off` removes
**zero** draw calls and **zero** triangles for **7.48 ms** - a pure bandwidth-and-resolve win.

**CONCLUSION: GPU-bound. Fragment/bandwidth work is 54% of the frame at res 1.0; the other 46% is a
resolution-independent GPU floor (vertex submission of 7.8 M triangles/frame, the shadow-map depth
pass, and the HUD canvas composite). CPU-side JavaScript is 3.5% of the frame and is not worth one
minute of anybody's time.**

## 6. THE RANKED ATTRIBUTION TABLE. THIS IS THE DELIVERABLE.

`node tools/perf-probe.mjs --mode toggles --scenario cruise --repeat 3 --warmup 2 --measure 5
--kill probe`, three interleaved passes, car respotted before every window, a fresh paired baseline
taken seconds before every toggle. renderW 1280 renderH 720 pixelRatio 1 devicePixelRatio 1
resScale 1. Load average 3.72 at start; raw in `perf-toggles-noprobe.txt`.

**`car.js`'s reflection probe is killed for the whole table.** That is deliberate and it is what
makes the table readable: the identical sweep with the probe live (`perf-toggles-cruise.txt`) has a
**min-envelope noise floor of 23.09 ms** and 17 of its 21 rows are unusable. With the probe off the
noise floor is **0.47 ms** and every row below the last three is REAL with the same sign in all
three passes. The probe is therefore reported separately, above the table, as the thing to fix first.

```
                            base p50 33.0 ms                        per-frame counters
kill-control              minBase   minOff    delta  medDelta   calls-      tris-  sign  verdict
car.js reflection probe   (see section 7: +138-236 ms on 33-37% of frames; 11.4 ms of the MEAN)
post-chain-off              33.01    17.59    15.41     15.41      283    2524409   3/3     REAL
world-hidden                33.04    20.53    12.51     12.40      250    7054184   3/3     REAL
msaa-off                    33.13    25.65     7.48      7.33       -2        -14   3/3     REAL
instances-10pct             33.05    27.21     5.84      5.49       -1    6347141   3/3     REAL
ssao-off                    32.99    27.99     5.00      5.00      269    2524397   3/3     REAL
shadow-casters-off          33.03    28.19     4.84      4.46      124    2307864   3/3     REAL
shadows-off                 32.83    28.58     4.25      4.37      124    2307869   3/3     REAL
bloom-off                   33.30    29.34     3.96      3.90       12          7   3/3     REAL
hud-off                     32.86    29.08     3.78      3.56       -1         -5   3/3     REAL
shadow-autoupdate-off       33.10    30.18     2.92      2.81      125    2307871   3/3     REAL
output-grade-off            33.15    30.59     2.56      2.34       -1         -7   3/3     REAL
car-hidden                  33.26    31.53     1.72      1.35      387     299395   3/3     REAL
ssao-half-res               32.98    31.38     1.60      1.61        0         -1   3/3     REAL
sky-hidden                  33.21    31.63     1.58      1.20        1         14   3/3     REAL
shadow-map-1024             32.98    32.39     0.59      0.48        0         -3   3/3     REAL
shadow-map-2048             33.01    32.50     0.51      0.21        0         -2   3/3     REAL
buildings-hidden            33.18    33.05     0.14      0.01       15      46551   2/3    noise
probe-faces-off             33.27    33.16     0.11     -0.05        0         -2   1/3    noise
car-env-probe-off           33.11    33.02     0.09      0.07        0         -1   2/3    noise
smear-pass-off              33.04    32.95     0.09      0.16        0          0   3/3    noise
traffic-hidden              32.99    33.15    -0.16      0.14       13      10602   2/3    noise
lamps-hidden                33.02    33.20    -0.18     -0.22       11      49534   1/3    noise
```

`probe-faces-off` and `car-env-probe-off` reading 0.09-0.11 ms is the table's own internal control:
the probe is already dead from `--kill probe`, so those two rows *must* come out as noise, and they
do. Any row claiming a win larger than 0.47 ms is above the floor that produced those two.

Rows worth reading twice:

- **`post-chain-off` 15.41 ms is a ceiling, not an item.** It is the sum of everything after
  RenderPass, and its parts are measured separately: ssao 5.00 + bloom 3.96 + output-grade 2.56 +
  smear 0.09 = 11.61, plus the MSAA resolve that RenderPass-direct-to-canvas also skips.
- **`msaa-off` is the biggest single-knob win in the table at 7.48 ms** and it changes no counts at
  all. `main.js:170` builds the composer target with `samples: 4`.
- **The 4096x4096 shadow map, the brief's "prime suspect", is worth 0.51 ms.** Dropping it to 2048
  buys 0.51 and to 1024 buys 0.59. **The suspect is cleared.** What shadows actually cost is the
  *caster submission*: `shadow-casters-off` (map still allocated, nothing drawn into it) is 4.84 ms
  and removes 124 calls and 2.31 M triangles per frame, and freezing the map with
  `shadowMap.autoUpdate = false` recovers 2.92 of that 4.84.
- **`traffic-hidden` -0.16 ms confirms the fps-harness piece's retraction.** 56 vehicles in 7
  InstancedMeshes are free. Nobody should optimise traffic.
- **`hud-off` 3.78 ms, but `hud.update()` only costs 0.92 ms of CPU** (section 5). So ~2.9 ms of it
  is the browser compositing a full-window 2-D canvas over the WebGL canvas every frame, not the
  drawing.

## 7. THE p99 IS A SEPARATE DEFECT AND IT HAS EXACTLY ONE CAUSE

`--mode stall` samples a timestamped row per frame from before the first paint: dt, plus
`renderer.info.programs.length`, geometries, textures, `usedJSHeapSize`, and a counter on
`CubeCamera.prototype.update`. A stall is then attributed by which counter moved on the same frame.
Clean 45 s cruise window, load 6.7, `perf-stall-cruise.txt`; the earlier 48 s window agrees.

**Every candidate in my brief except one is ruled out by counters, not by argument:**

| candidate | verdict | evidence |
|---|---|---|
| shader compilation | **boot only** | `programs` goes 4 -> 58 -> 132 during boot and then **never changes again**: 0 growth over 43 s of driving |
| texture upload | **boot only** | `textures` 4 -> 92 at boot, 0 growth afterwards |
| world.js streaming / LOD swap | **does not exist** | `geometries` 13 -> 392 at boot, then **0** growth. `world.update()` is uniform writes plus an emitter sort; it costs 0.01 ms |
| garbage collection | **ruled out** | forced `window.gc()` kill-control on this heap: **10.68-13.44 ms**, an order of magnitude under the stalls. Heap deltas at stall frames are ~0 |
| PMREM environment re-bake | **CONFIRMED, and it is per-frame, not one-off** | see below |
| HUD canvas redraw | **no** | 0.92 ms of CPU, no spikes (p99 1.67 ms, max 2.04) |

### The one cause: `car.js`'s 512-px reflection probe, 7 times a second, forever

Within-window attribution - the same window's frames split by whether the probe re-baked on that
frame, so drift and contention cancel:

```
clean window (load 6.7):    frames WITH a refresh  n 63   mean 169.74 ms  p50 134.74 ms
                            frames WITHOUT one     n 106  mean  31.48 ms  p50  19.76 ms
                            37.28% of frames carry a refresh, 138.27 ms each -> 51.54 ms of the mean

second window (load ~5):    WITH n 117 mean 286.31 / WITHOUT n 233 mean 49.75
                            33.43% of frames, 236.56 ms each -> 79.08 ms of the mean
```

- **WHEN: periodically, forever, roughly 7 times a second.** 337 refreshes in 48.3 s. Of 325 stalls
  over 50 ms in one window, **221 landed on a frame where the probe re-baked**; those had p50 96 ms
  and max 300 ms.
- **WHY THAT OFTEN:** `car.js:1871 PROBE_MOVE = 5.0` metres. At today's 272 km/h that is 66 ms of
  travel, i.e. less than one frame, so the probe re-bakes as fast as the frame loop lets it. The
  `PROBE_EVERY = 6` frame clause never gets a chance to fire.
- **THE FEEDBACK LOOP, and it is why this build is bistable.** The trigger is *distance travelled*,
  so a slower frame covers more ground, which makes the next refresh sooner, which makes the frame
  slower. Above roughly 66 ms/frame the probe fires on **every** frame and the loop latches. That is
  the mechanism behind the 131% p50 spread in section 1, behind the 23 ms noise floor in the
  live-probe kill-control sweep, and behind the fps-harness piece's routed anomaly #3 ("resScale
  0.55 and 0.40 are reproducibly worse than 0.70"): **with the probe live the resolution ladder is
  non-monotonic (res 1.00 -> 22.97, res 0.70 -> 28.09, res 0.40 -> 21.28), and with the probe killed
  it is perfectly monotonic** (section 5). The cube faces are 512x512 whatever `resScale` is, so
  lowering resolution raises the probe's share of the frame and can make things worse. That anomaly
  is now explained and it is not an MSAA or `ssao.setSize` problem.
- **The other boot-time stalls are real but one-off:** 657 ms before `__ready` and 967 ms at
  `__ready + 0.97 s`, the latter carrying `dProgs 74, dGeos 379, dTexs 88` - the first frame that
  touches every material and texture. That is the 845.8 ms max in the brief's baseline. It needs a
  warm-up/preload fix, not a per-frame one, and `main.js:588` already calls `renderer.compile()`;
  it evidently does not cover everything the first real frame touches.
- **A second one-off worth knowing about:** `applyTimeOfDay('night')` takes geometries 392 -> 750 and
  programs 132 -> 188 (section 1), so changing time of day from the pause menu will stall once.

## 8. THE MAP: 92% OF THE CITY'S TRIANGLES ARE OVER 400 m AWAY AND ALL OF THEM ARE DRAWN

`--mode map` decodes every instance matrix in `world.group` and bins it by distance from the car
(cruise, car at -284, -694). Counts, so contention cannot move them:

```
world.group: 69 InstancedMeshes + 567 plain meshes, 203540 instances, 2.40 M triangles
  withinM  instances  cumInst%        tris  cumTris%
      200        363      0.18        4480      0.19
      300       5718      2.99       66116      2.95
      400      10250      8.02      118338      7.89
      600      34270     24.86      407916     24.91
      all     152939    100.00     1798734    100.00
```

**Only 0.19% of the city's triangles are within 200 m of the car, and 92% are beyond 400 m. Every
one of them is submitted every frame, in every pass.** The reason is structural and deliberate:
`world.js:1236` and the kitbash meshes after it set `frustumCulled = false`, and even without that
an InstancedMesh's bounding sphere spans the whole 1120 m map, so three's frustum test could never
reject one. `--mode inspect` shows it from the other side: 288 of 810 drawables are "in frustum" but
**97.8% of the scene's triangles are**, because the big instanced populations are always in.

Is a smaller map a real win? **Yes, and I measured the size of it rather than assuming.**
`instances-10pct` cuts every world InstancedMesh's `count` to a tenth - a spatially random 90% cull,
which is not what a distance cull would *look* like but costs what one would *save*:

**5.84 ms (min-envelope, 3/3 passes, noise floor 0.14 ms), removing 6.35 M triangles per frame and
exactly zero draw calls.** So the win is vertex/geometry bandwidth, and it is available either by
shrinking the map or by a per-instance distance cull that keeps the map. For scale, hiding the entire
`world.group` is 12.51 ms, so distant instances are just under half of everything the city costs.

Two corrections to how this cost is usually described:

- **The building masses are not the cost.** `buildings-hidden` (the 5 InstancedMeshes of box towers
  and podiums, `world.js:1230-1245`) is **0.14 ms and 46 551 triangles - noise.** The cost is the
  facade-detail kitbash that follows it (cornices, parapets, ledge bands, rooftop greebles: 75 808 +
  15 699 + 14 366 + ... instances of 12-40 triangles each).
- **`lamps-hidden` is noise too** (-0.18 ms), so street furniture is not it either.

## 9. RANKED RECOMMENDATIONS

Every ms figure is measured, at renderW 1280 renderH 720 pixelRatio 1 devicePixelRatio 1, against a
33.0 ms probe-killed baseline unless stated. Work top-down.

| # | change | measured worth | file:line | visual risk |
|---|---|---|---|---|
| 1 | **Rate-limit `car.js`'s reflection probe.** Not "remove it": make the trigger time- or view-change-based instead of distance-based, and/or round-robin one cube face per frame, and/or drop `PROBE_RES` to 256 | **11.4 ms of the MEAN frame** (45.1 -> 33.7) and it removes the entire 96-300 ms stall class (p99 115.05 -> 52.78 ms, measured over a 179-frame probe-killed window). Also un-breaks the resolution ladder | `game/car.js:1869-1873` (`PROBE_RES 512`, `PROBE_EVERY 6`, `PROBE_MOVE 5.0`), refresh at `car.js:1912`, called from `car.js:2330` | **LOW.** The reflection stays; it updates less often. A slightly staler env map on a car moving at 75 m/s is not a visible defect. 256 px halves the PMREM chain - check the clearcoat lobe note at `car.js:1655` first |
| 2 | **MSAA `samples: 4` -> 0, with a post-AA pass if edges suffer** | **7.48 ms**, zero calls, zero triangles | `game/main.js:170` | **HIGH as a bare change** (nothing else anti-aliases; `antialias: false` at main.js:62). Roughly 1 ms of FXAA/SMAA in the existing chain buys most of it back. Do the A/B against `shots/` |
| 3 | **Distance-cull the world's instanced detail** (rebuild instance ranges per block, or shrink the map) | **5.84 ms**, 6.35 M triangles | `game/world.js:1236` and the kitbash meshes after `world.js:1250`, all `frustumCulled = false` | **LOW-MEDIUM.** 92% of these triangles are >400 m out and mostly sub-pixel; cull by projected feature size, not by a flat radius, or the skyline silhouette thins |
| 4 | **Stop submitting casters that cannot cast into the cascade.** The shadow camera spans +/-130 m (`main.js:404`) yet every greeble in the city has `castShadow = true` | **4.84 ms** ceiling (all casters off), of which **2.92 ms** is recoverable by freezing the map alone | `game/main.js:393-410` (cascade), `castShadow` flags throughout `world.js` | **LOW if done by distance** - a caster outside the cascade contributes nothing today. Freezing `autoUpdate` instead would make shadows lag the car: don't |
| 5 | **Stop redrawing/compositing the HUD canvas every frame** | **3.78 ms**, of which only 0.92 ms is the drawing | `game/hud.js:2684-2688` (`update` -> `draw` unconditionally), canvas sized at full window by `main.js:209` | **NONE** if the redraw is gated on changed values and the composite is left alone. Note the deliberate rule at `main.js:206-208`: HUD must stay full-res when `resScale` drops |
| 6 | **Bloom** (5-mip UnrealBloom at full res) | **3.96 ms** | `game/main.js:184`, `sky.applyBloom` | MEDIUM - it is a signature of the look. Half-res mip chain first, measure again |
| 7 | **SSAO** - it re-renders the whole scene for a normal/depth prepass (269 calls, 2.52 M tris) | **5.00 ms** off, **1.60 ms** at half res | `game/post.js:679-717`, wired at `main.js:178-181` | LOW at half res (AO is low-frequency and the apply pass already samples it with a linear filter). Sharing the main pass's depth instead of a second full submission is the bigger structural win |
| 8 | **Output grade pass** | 2.56 ms | `game/post.js` output pass, `main.js:190` | **DO NOT REMOVE** - it is the tonemapper. Listed only so its cost is known |
| 9 | Merge the hero car's meshes | **1.72 ms** for **387 draw calls** | `game/car.js`, `game/damage.js` | LOW. **This is a correction to the fps-harness piece's #1 recommendation:** at 4.4 us per call this frame is not draw-call bound, and 387 calls are worth 1.7 ms, not the top of the list |
| 10 | Shadow map 4096 -> 2048 | **0.51 ms** | `main.js:396` | MEDIUM (facade relief is the reason it is 4096, `main.js:387-392`). **Not worth the visual risk** |
| - | Traffic, street lamps, building masses, the smear pass | **0.00 ms (noise)** | - | Do not touch any of them |

## 10. THE HONEST CEILING

**Can this reach p50 16.7 ms at resScale 1.0? Yes, but only by taking MSAA out, and the honest
fallback is 0.85.** Working from the uniform 33.0 ms probe-killed baseline:

- Resolution alone **cannot** get there from any direction: the fit is `15.2 ms + 19.4 ms/Mpx`, so
  the floor at zero pixels is 15.2 ms and the measured best at the `setResScale` clamp of 0.4 is
  18.03 ms. Anyone planning "ship it at 0.4" should know the answer is 18 ms, not 60 fps.
- The wins that do not move a pixel or barely do - probe rate-limit, instance cull, caster cull, HUD
  gating, SSAO half-res - are **5.84 + 4.84 + 3.78 + 1.60 = 16.06 ms** of nominal headroom against a
  33.0 ms frame. They will not sum arithmetically (they overlap in the same bottleneck), so budget
  60-70%: **33.0 -> roughly 21-23 ms at res 1.0.** That is 43-48 fps, not 60.
- Adding `msaa-off` (7.48) or an equivalent AA swap is what closes the gap: **16-18 ms at res 1.0**,
  i.e. 60 fps, with the aliasing risk stated in recommendation 2.
- Without touching MSAA, SSAO or bloom, the same list at **resScale 0.85** (which removes a further
  ~4.3 ms of fill) lands near **17 ms**, and at **0.70** comfortably under it.

So: **60 fps at 1280x720 real pixels is reachable, and it is reachable at resScale 1.0 only if the
wave is willing to change how edges are anti-aliased. If it is not, the deliverable should be 60 fps
at resScale 0.85 and that should be said out loud now rather than discovered in the last round.**

One more thing the next agent should not have to rediscover: **fix the probe before measuring
anything else.** Every attribution table taken with it live has a 23 ms noise floor, a non-monotonic
resolution ladder and a p50 that reports the gaps between bakes instead of the frames.

```progress-metrics
p50 cruise: 23.04 ms at 1280x720 real px, ratio 1.0 (mean 45.13 ms, 69% of frames over 16.7 ms)
p99 cruise: 115.05 ms at 1280x720 real px, ratio 1.0 (max 121.13, p90 110.27)
p50 with car.js probe killed: 33.06 ms at 1280x720 real px, ratio 1.0 (uniform: mean 33.72, p99 52.78)
reflection probe cost: 138-236 ms per re-bake on 33-37% of frames, 7 refreshes/s
resolution floor: 18.03 ms at 512x288 real px, ratio 0.4 - fit is 15.2 ms + 19.4 ms/Mpx
GPU vs CPU: 31.76 of 33.72 ms inside composer.render, all game logic 1.17 ms, gl.finish 0.01 ms
top three kill-controls: post-chain 15.41 ms, world 12.51 ms, MSAA 4x 7.48 ms
```

## Regression gate

**This piece cannot move a pixel.** I own `verdicts/wave-s/perf-profile.md` and `tools/perf-probe.mjs`
and I edited no file under `game/`. `git diff --stat` for `game/` is empty on my account; the
`game/main.js` modification in the tree is a peer's crash-feel change (`CRASH_HOLD_S`,
`CRASH_DEMO_SEVERITY`, crash speed floor 30 -> 12) and I left it alone. Every kill-control in
`perf-probe.mjs` pokes live objects through `window.__game` or three's prototypes inside the page and
is restored afterwards, so no measurement here can leak into a shipped frame. Screenshot presets were
therefore not re-rendered.

## Tool reference

`tools/perf-probe.mjs` modes, all at viewport 1280x720 / deviceScaleFactor 1, all refusing to print a
statistic when `ctx.renderSize()` is not the buffer asked for:

```
--mode inspect     scene census: drawables, instances, triangles, frustum contents, shadow config
--mode submits     wraps renderer.render + shadowMap.render: who submits the scene, how often
--mode map         decodes every instance matrix, bins the city by distance from the car
--mode phase       per-phase CPU inside tick(), with an "unaccounted" row against the rAF delta
--mode finish      composer.render() CPU wall time vs the gl.finish() after it (CPU/GPU test)
--mode stall       timestamped per-frame timeline with program/geometry/texture/heap/probe counters
--mode toggles     interleaved paired kill-controls, min-envelope ranking, noise floor printed
--kill probe|probe-faces|none      kills car.js's reflection probe through three's prototypes
--res-list 1.0,0.85,0.7,0.55,0.4   resolution ladder for --mode res
```

Canary for whoever audits this: `node tools/perf-probe.mjs --mode toggles --scenario cruise
--repeat 3 --kill probe` must print `probe-faces-off` and `car-env-probe-off` as **noise** (they are
already dead) and a min-envelope noise floor **under 1 ms**. Without `--kill probe` the same command
must print a noise floor around 20 ms. If either of those changes, the probe's behaviour changed.
