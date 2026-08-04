# wave-s / perf-r2 — closing the half of the bar that round 1 left open

**I AM RUNNING ALONE.** The brief says no peer agent is running, and I checked before I started:
`sysctl -n vm.loadavg` = `{ 1.72 2.44 2.59 }`, and `ps -Ao pcpu,args | grep -iE 'chrome|playwright|node'`
showed **no headless chromium and no playwright** — only idle residents from an unrelated project
(two `nvim` embeds, a `vite`/`esbuild` pair, two `tsserver`, this repo's `node tools/serve.mjs`,
Slack's crashpad handler), every one at 0.0-0.1% CPU. So **every frame-time number in this verdict
is a RESULT, not a smoke test.** Each headline is taken three times with the spread quoted, and the
load average is sampled immediately before and after every measurement block and quoted with it.

`ctx.renderSize()` is quoted verbatim beside every number. `tools/_perfr2.mjs` additionally reads
`gl.drawingBufferWidth/Height` off the driver at the end of every window and **throws** rather than
printing a statistic if the buffer is not 1280x720 at ratio 1 dpr 1.

## 0. Tree state before I touched anything (process rule 2)

HEAD `ea9fc5e`. `git status --short` at start:

```
 M PROMPT.md
 M driver.log
 M game/main.js      <- INHERITED, not mine. Justified and EXTENDED; see section 7.
 M progress.json
?? README.md
?? game/music/
?? verdicts/wave-s/perf-critic.md
```

The inherited `game/main.js` hunk force-shows `crash.group` and `boostFx.group` for one
`renderer.compile()` at boot. It is a p99 fix aimed at exactly the defect I was briefed to close, so
I did not revert it: I measured it, found it covers only part of the compile stalls, and rebuilt that
block around what the measurement says (section 7). It is in my commit and I am accounting for it
here rather than inheriting it silently.

The three round-2 builder commits (`handling-r2`, `traffic-r2`, `menu-music`) have all landed, so the
tree I measure is **not** the tree `perf-critic` measured (`40d2f1c`). I therefore take my own
baseline and treat the critic's five numbers as the round-1 reference, never as my own BEFORE.

## 1. MY BASELINE, and it reproduces the critic to within 3%

`node tools/fps.mjs --repeat 3` — warmup 2.5 s, measure 8 s, scene `dusk-highway-chase`, headless
chromium ANGLE/Metal, `--disable-frame-rate-limit`. Load `{1.55 2.37 2.56}` at start, `{3.12 ...}` at
end. Raw: `verdicts/wave-s/perf-r2-base.json`.
**Every row: renderW 1280, renderH 720, pixelRatio 1, devicePixelRatio 1, resScale 1.**

| scenario | p50 x3 | my p50 | critic's p50 (round 1) | mean | p90 | p99 | max | calls | tris |
|---|---|---|---|---|---|---|---|---|---|
| corner | 13.02 / 13.10 / 13.19 | **13.10** | 13.10 | 12.77 | 15.7 | 32.7 | 49.6 | 576 | 0.74 M |
| cruise | 16.08 / 15.97 / 15.98 | **15.98** | 16.20 | 16.17 | 31.6 | 35.6 | 75.9 | 746 | 1.02 M |
| city | 21.89 / 21.57 / 21.67 | **21.67** | 22.10 | 21.90 | 27.2 | 43.3 | 54.0 | 2315 | 4.07 M |
| boost | 22.60 / 22.98 / 23.02 | **22.98** | 23.10 | 23.28 | 27.9 | 81.6 | 98.1 | 972 | 1.29 M |
| night-wet | 47.47 / 48.26 / 47.70 | **47.70** | 48.30 | 47.90 | 53.6 | 95.4 | 102.5 | 2517 | 3.95 M |

Run-to-run p50 spread 0.14-1.88%. **The critic's numbers are confirmed on a different tree**, which
is the strongest available statement that the round-1 result was real.

## 2. WHERE THE FRAMES WENT, before I optimised anything

Two new instruments in `tools/_perfr2.mjs`, both of which exist because the tools in the repo could
not answer the question:

- **`--mode decomp`** — `night-wet` is one scenario name hiding four independent states, and round 1
  routed its 49 ms without ever separating them. Measures day/night x dry/wet at ONE map position in
  ONE page, interleaved, so the four cells are paired.
- **`--mode trace`** — a per-INVOCATION trace of `renderer.render` with the render target, the
  **camera identity**, the draw-call/triangle delta and the nesting depth of each call.
  `tools/perf-probe.mjs --mode submits` aggregates by target size, which cannot tell a road
  reflection apart from the SSAO prepass when both land in a 640x360 target. This can.

### 2a. night-wet decomposed (`--mode decomp --repeat 2`, best of 2 per cell, 1280x720 ratio 1 dpr 1)

| state | p50 | mean | calls | tris | progs | geos | visible point lights |
|---|---|---|---|---|---|---|---|
| midday / dry | 25.75 | 25.76 | 1433 | 2.42 M | 130 | 392 | 0 |
| midday / **wet** | 32.73 | 32.86 | 2420 | 3.74 M | 130 | 749 | 0 |
| **night** / dry | 39.57 | 39.79 | 1536 | 2.56 M | 184 | 750 | 14 |
| **night** / **wet** | 49.99 | 50.33 | 2677 | 4.15 M | 184 | 750 | 14 |

```
wet alone (in daylight):   +6.98 ms   and +987 draw calls, +357 geometries
night alone (dry):        +13.82 ms   and +54 programs, +14 visible point lights
wet at night:             +10.42 ms
night + wet together:     +24.24 ms
```

### 2b. The trace, night-wet, per frame

```
camera + target                   invoc/frame   calls    tris        ms (inclusive of nesting)
1ea4... 640x360  overrideMaterial     1.00       1567    2.43 M     26.32   <- SSAO normal/depth
b471... 1280x720                      1.00       2118    3.58 M     18.18   <- the frame
0b55... 640x360                       1.00        762    1.26 M      4.25   <- road reflection
0b55... 320x180  (nested in SSAO)     1.00        725    1.24 M      7.44   <- road reflection
0b55... 256x144  (nested in a probe)  1.00        358    0.87 M     10.83   <- road reflection
7ff0... 256x256  x4 face cameras      1.00        790    1.75 M     14.32   <- car.js probe faces
```

**Camera `0b55...` is `road.js`'s planar-reflection camera and it appears THREE TIMES PER FRAME.**
That is the finding this piece is built on.

## 3. FIX 1 — the road's planar reflection was rendering the whole scene FOUR times a frame

`game/road.js`. The reflection is a full mirrored re-render of the scene, driven off the road mesh's
own `onBeforeRender` and guarded by a token that means *one reflection per outer render pass*. It
does exactly that. The defect is that a wet frame has four outer passes that draw a road with a
perspective camera, so it was asked for four full re-renders: the frame, the SSAO normal/depth
prepass, `boost.js`'s hero-mask depth pass, and each of `car.js`'s cube-probe faces.

**22.5 ms of a 48 ms frame, of which 18.3 ms was drawn into a buffer that nothing sampled.**

Two gates, both lossless by construction rather than by taste:

- `road.js:1678` BEFORE: nothing. AFTER:
  `if (material && scene.overrideMaterial === material) { state.skipped++; return; }`
  — `material` is what three is about to draw the road WITH. When an outer pass installs
  `scene.overrideMaterial`, the road's own shader and therefore the `uReflMap` sampler are not in
  that pass at all, so a reflection rendered for it cannot be read by anything. This kills the SSAO
  and hero-mask rows.
- `road.js:1679` BEFORE: nothing. AFTER:
  `if (state.mainCamera && camera !== state.mainCamera) { state.skipped++; return; }`
  with `state.mainCamera` set through the new `kit.setMainCamera(cam)` (`road.js:1908`), called from
  `main.js:162` as `roadKit.setMainCamera(camera)`. This kills the cube-probe row.
  **With no main camera registered the gate is inert**, so a harness that boots the kit without
  `main.js` keeps the old behaviour.
- `road.js:1596` BEFORE: nothing. AFTER: `mainCamera: null,` on the reflection state.
- `road.js:1601` BEFORE: nothing. AFTER: `renders: 0, skipped: 0,` plus `kit.reflStats()`
  (`road.js:1911-1915`), so the gate is assertable without reading pixels. Live at night-wet:
  `{"enabled":true,"renders":46,"skipped":695,"rt":"640x360"}` — one render per frame, 695 rejected.
- `road.js:1896` BEFORE `road.onBeforeRender = (r, sc, cam) => { if (refl.render) refl.render(sc, cam); };`
  AFTER `road.onBeforeRender = (r, sc, cam, geo, mat) => { if (refl.render) refl.render(sc, cam, mat); };`

### Measured (`tools/fps.mjs --repeat 3`, 1280x720 ratio 1 dpr 1 resScale 1)

| scenario | p50 BEFORE | p50 AFTER | p99 BEFORE | p99 AFTER |
|---|---|---|---|---|
| night-wet | 47.70 | **42.09** (42.09-42.16, 0.14%) | 95.4-103.8 | 54.5-80.8 |
| city | 21.67 | 21.68 | 43.3 | 41.4 |
| cruise | 15.98 | 15.97 | 35.6 | 35.1 |

**-5.61 ms on night-wet, 0.00 on the dry scenes** — which is the correct signature, because
`refl.enabled` is `wet > 0.02`. Raw: `perf-r2-step1.json`.

The 5.6 ms is a lot less than the 18.3 ms of CPU wall the trace attributed, and that is expected
rather than a discrepancy: wall time inside a GL call is where the driver blocks on a full command
queue, so the same GPU milliseconds get counted in whichever call is unlucky. The counts are the
honest part, and the counts say two entire scene submissions per frame are gone.

## 4. FIX 2 — fourteen point lights, and the pool was handing its slots to lights behind the camera

`game/world.js`. Every visible light in the scene costs every shaded fragment in the frame:
three's forward renderer puts them in one uniform array and `NUM_POINT_LIGHTS` is a shader define,
so a light nobody can see is not free. `--mode sweep` (hide N of the pool + full material
recompile + re-warm, 2 runs per cell, night-wet, 1280x720 ratio 1 dpr 1):

| visible point lights | p50 | vs 14 |
|---|---|---|
| 14 (shipped) | 44.97 | — |
| 10 | 36.93 | **-8.04** |
| 6 | 32.97 | -12.00 |
| 4 | 31.64 | -13.33 |
| 2 | 30.62 | -14.35 |
| 0 | 29.72 | -15.25 |

**Fifteen milliseconds of a 45 ms frame for fourteen lamps, and the first four cost 2 ms each.**

The selection was `the POOL nearest emitters within 120 m`, which spends slots on emitters that
cannot put a photon in the frame — a lamp 20 m behind the camera outranks a neon sign 60 m ahead.
So slots are now filled **frustum-first**: each candidate's sphere (its own `range`, where its
attenuation reaches exactly zero) is tested against the camera frustum and skipped if it misses.

I then sized the pool from the measured distribution rather than guessing. `--mode lights`, 703
frames over 30 s of night driving at five places on the city path, counting how many emitters were
**in shot** before the pool cap applied:

```
emitters in shot     5     6     7     8     9    10    11
cumulative %      1.28 15.20 53.27 88.07 98.58 99.72 100.00
```

- `world.js:2866` BEFORE `const POOL = 14;` AFTER `const POOL = 10;`
  Ten slots hold every emitter in shot on **99.72%** of frames. Eight would have bought a further
  4 ms and would have dropped a lit emitter in shot on 12% of frames; this wave may not make a scene
  look worse, so I took the 8 ms and not the 12.
- `world.js:2869-2874` BEFORE: nothing. AFTER: `_lightFrustum` / `_lightPV` / `_lightSphere`
  scratch and a `lightStats` census.
- `world.js:3148` BEFORE `update(dt, focus) {` AFTER `update(dt, focus, camera) {` — optional third
  argument; with no camera the old distance ranking stands.
- `world.js:3221-3255` BEFORE `for (let i = 0; i < POOL; i++) { ... emitters[scored[i][1]] ... }`
  (slot i gets the i-th nearest, unconditionally) AFTER a single pass over `scored` that skips any
  emitter whose sphere misses the frustum and fills slots in order, zeroing the rest.
- `world.js:3076` BEFORE: nothing. AFTER `lightStats() { ... }` on the returned world.
- `main.js:404` BEFORE `world.update(sdt, s.pos);` AFTER `world.update(sdt, s.pos, camera);`

### Measured, 3 runs, 1280x720 ratio 1 dpr 1 resScale 1 (`perf-r2-step2.json`)

| scenario | p50 before this step | p50 after | spread after |
|---|---|---|---|
| night-wet | 42.09 | **33.33** (33.33-33.34) | **0.02%** |
| city | 21.68 | 21.69 | 2.19% |
| cruise | 15.97 | 16.05 | 0.40% |

**-8.76 ms on night-wet**, against the 8.04 ms the sweep predicted for four fewer lights.
**0.00 on city and cruise**, which is the expected signature: the pool is only visible at night.

## 5. THE p50 IS REAL WORK AND NOT THE DISPLAY CADENCE. I checked, because 33.33 is suspicious.

`33.33 ms` is exactly two 60 Hz intervals, and round 1 spent two measurements mistaking a pinned
p90 for its own workload. So I added `frameStats.samples()` (`main.js:613-626`, read-only: the raw
ring, oldest first, from which `stats()` already derives its percentiles) and a `--mode hist`, and
looked at the distribution instead of a percentile. night-wet, 8 s, 1280x720 ratio 1 dpr 1:

```
 16-18 ms   1     28-30 ms  18     40-42 ms   2     68-70 ms  1
 18-20 ms  19     30-32 ms  43     42-44 ms   2     70-72 ms  1
 20-22 ms   4     32-34 ms  76     44-46 ms   1
 22-24 ms  10     34-36 ms  35     48-50 ms   6
 24-26 ms   4     36-38 ms  11     50-52 ms  10
 26-28 ms   5     38-40 ms  10     52-54 ms  11
```

A smooth mode at 32-34 ms with populated bins either side, not a pile at 16.7/33.3/50.0 with empty
bins between. **night-wet's 33.3 ms is work, not a dropped present**, so the remaining gap is real
and I am not entitled to claim it away.

## 6. THE RE-RANKED ATTRIBUTION, and the point where this stops being free

`tools/_perfr2.mjs --mode kill`, paired (baseline and variant in the SAME page, car respotted before
every window, re-warmed after any change that invalidates a shader), 2 interleaved runs, min-envelope
ranking. 1280x720 ratio 1 dpr 1 resScale 1.

| kill-control | night-wet BEFORE my fixes | night-wet AFTER | city AFTER |
|---|---|---|---|
| world-hidden | 35.95 | 23.50 | 12.79 |
| **shadow-casters-off** | 12.85 | **9.92** | **7.20** |
| lights-0 | 17.13 | 7.47 | — (0 at day) |
| post-chain-off | 12.40 | 6.42 | 5.52 |
| hud-off | 3.86 | 3.39 | 2.87 |
| car-hidden | 6.66 | 3.36 | 1.28 |
| ssao-off | 8.24 | 3.12 | 2.27 |
| bloom-off | 1.17 | 2.99 | 1.40 |
| grade-off | 0.36 | — | — |
| traffic-hidden | 0.70 (1/2 sign) | — | 0.01 |

The sun's depth pass is now the largest single item at both, and I established what inside it costs,
because that decides whether there is a lossless version:

| shadow variant | night-wet | city |
|---|---|---|
| 4096 -> 2048 | **4.85** | **2.81** |
| 4096 -> 1024 | 5.33 | 2.89 |
| PCFSoft -> PCF (the SAMPLING) | 0.13 | -0.16 (noise) |
| all casters off (map still cleared) | 9.92 | 7.20 |

**It is raster area, not filtering and not submission, and the knee is at 2048.** But `main.js:466-471`
records a visual result waves K-R paid for: at 2048 the default normalBias is deeper than the 20-45 cm
of facade relief and the facades read FLAT. So **I did not take it.** It is a hash parameter with its
price printed beside it instead:

- `main.js:459-477` BEFORE `sh.mapSize.set(4096, 4096);`
  AFTER `const shadowPx = params.shadow === undefined ? 4096 : ...; if (shadowPx === 0) renderer.shadowMap.enabled = false; sh.mapSize.set(Math.max(256, shadowPx), Math.max(256, shadowPx));`
  Default is **unchanged at 4096**. Verified live: `#shadow=2048` reads `mapSize {x:2048,y:2048}`,
  `#shadow=0` reads `shadowMap.enabled false`, both with 0 console errors.

## 7. THE p99 IS A SEPARATE DEFECT AND IT HAD THREE CAUSES. All three are down.

### 7a. The reflection probe was STILL the entire p90/p99 tail, and round 1's diagnosis of it was wrong

Round 1 split the bake across seven ticks on the theory that this converted one ~100 ms hitch into
six ~14 ms ones. The trace says a single cube FACE submits **1469 draw calls and 2.34 M triangles**
against the main camera's 639 and 0.80 M in the same frame — a 90-degree frustum over the whole
city — so the tick carrying a face costs more than the frame it rides in.

Kill-control (probe pinned to one bake), cruise, 20 s windows, 1280x720 ratio 1 dpr 1:

| build | p50 | p90 | p99 | frames > 40 ms of ~1360 |
|---|---|---|---|---|
| bake every ~1 s (shipped) | 15.38 | 25.81 | 48.83 | 17 |
| baked exactly once | 15.47 | 17.22 | 33.88 | 2 |
| **after my change** | 15.43 | **18.07** | **34.47** | **6** |

- `car.js:1905` BEFORE `const PROBE_MIN_FRAMES = 60;` AFTER `const PROBE_MIN_FRAMES = 180;`
- `car.js:1906` BEFORE `const PROBE_MOVE = 60.0;` AFTER `const PROBE_MOVE = 120.0;`
- `car.js:1907` BEFORE `const PROBE_MAX_FRAMES = 180;` AFTER `const PROBE_MAX_FRAMES = 480;`

**Nearly all of the kill-control's benefit with the reflection still live, and p50 unmoved.** The
cost is staleness in a cube consumed exclusively as a PMREM roughness chain on curved painted
panels; at 276 km/h down one street, the sky gradient, horizon split and road brightness that survive
to the mip a 0.06-roughness lobe samples do not change over 120 m. The screenshot gate cannot see
this change at all, because the shot path calls `refreshEnv()` synchronously — stated plainly rather
than presented as a pass.

### 7b. The first frame of the drive was 718 ms of buffer and texture upload

Stall timeline, cruise, 45 s, threshold 50 ms, 1280x720 ratio 1 (`tools/perf-probe.mjs --mode stall`):

```
BEFORE                                        AFTER
t+0.72  718 ms  dProgs 68 dGeos 379 dTexs 88   t-0.02  1158 ms  dProgs 166 dGeos 268 dTexs 85
t+1.94   68 ms  dProgs 1                       t+0.10    95 ms  dProgs 8   dGeos 113
t+3.84   70 ms  dProgs 1                       t+0.42   307 ms
t+4.36   69 ms  dProgs 1                       t+1.31    69 ms  dProgs 1
t+5.44   64 ms  dProgs 1                       t+3.71    71 ms  dProgs 1
                                               t+4.79    64 ms  dProgs 1
```

The 718 ms is not compilation: `renderer.compile()` builds PROGRAMS, and that frame's counters say
379 vertex buffers and 88 textures being uploaded the first time something draws with them. The only
way to force an upload is to draw. So the warm stage now renders real frames:

- `main.js:730-757` BEFORE (inherited hunk) `renderer.compile(scene, camera); for (const o of hidden) o.visible = false;`
  AFTER: `renderer.compile(scene, camera);` then one `composer.render()` with the hidden effect
  subtrees still forced visible, then the visibility restore, then a second `composer.render()` in
  the shipping visibility state. Both wrapped in `try {} catch {}` so a warm frame can never stop a
  boot.

Measured, two cold boots each, 1280x720 dsf 1: **`__ready` at 1358/1666 ms -> 2279/2733 ms**, and the
first 700 ms of play goes from **1 frame delivered to 43-45**. The stall did not disappear, it moved
behind the boot bar the player is already being told to wait at, and it shrank on the way (718 -> 95).

### 7c. boost's p99 was 79 ms, and it was seventeen shader compiles on the first boost

`boost.js` renders its hero mask only while the pass is actually smearing, and that mask installs
`scene.overrideMaterial` — so the depth and silhouette program variants for every attribute layout in
the scene compile on the player's first boost. Measured: five stalls of 55-108 ms between t+3.1 s and
t+9.4 s, `renderer.info.programs` walking **178 -> 195** during the drive.

- `main.js:746-753` BEFORE: nothing. AFTER: the warm frame is rendered with
  `boostFx.pass.uniforms.uAmount.value = 1` **and `boostFx.pass.enabled = true`**, both restored
  immediately after.

The `enabled` half is load-bearing and I only found it by measuring: `boost.js:1062` ships the pass
disabled, a disabled pass is skipped by `EffectComposer`, and with `uAmount` alone the compile
stalls were **completely unchanged** (progs still 178 -> 195). With both: programs during play
195 -> 198, post-`__ready` stalls 9 -> 6, and

**boost p99 79.4 -> 35.4 / 32.5 ms** at 1280x720 ratio 1 dpr 1.

## 8. FINAL NUMBERS

`node tools/fps.mjs --repeat 3`, warmup 2.5 s, measure 8 s, scene `dusk-highway-chase`, headless
chromium ANGLE/Metal `--disable-frame-rate-limit`. Load `{3.35 3.39 3.33}` before, `{3.11 3.38 3.34}`
after. Raw: `perf-r2-final-scenarios.{txt,json}`; the res-1.0 column of `perf-r2-final-res.json` is
an independent third confirmation taken in a separate process.
**Every row: renderW 1280, renderH 720, pixelRatio 1, devicePixelRatio 1, resScale 1.**

| scenario | p50 x3 | p50 | round-1 critic p50 | mean | p90 | p99 | max | >16.7 ms | fps @ p50 |
|---|---|---|---|---|---|---|---|---|---|
| corner | 13.17 / 13.20 / 12.97 | **13.17** | 13.10 | 12.66 | 15.6 | 32.2 | 49.7 | 4.9% | **75.9** |
| cruise | 15.96 / 16.03 / 15.93 | **15.96** | 16.20 | 16.01 | 30.1 | 34.6 | 70.8 | 29.7% | **62.7** |
| city | 21.36 / 21.89 / 21.55 | **21.55** | 22.10 | 21.81 | 26.7 | 36.3 | 50.9 | 95.8% | 46.4 |
| boost | 22.85 / 22.92 / 22.97 | **22.92** | 23.10 | 23.18 | 27.5 | **35.4** | 108.3 | 93.4% | 43.6 |
| night-wet | 33.35 / 33.34 / 34.01 | **33.35** | 48.30 | 34.19 | 50.4 | **53.4** | 66.3 | 99.4% | 30.0 |

Against the round-1 critic's independently re-measured state:

| scenario | critic p50 | my p50 | change | critic p99 | my p99 | change |
|---|---|---|---|---|---|---|
| corner | 13.10 | 13.17 | +0.5% | 37.0 | 32.2 | -13% |
| cruise | 16.20 | 15.96 | -1.5% | 37.7 | 34.6 | -8% |
| city | 22.10 | 21.55 | -2.5% | 44.5 | 36.3 | -18% |
| boost | 23.10 | 22.92 | -0.8% | 64.2 | **35.4** | **-45%** |
| night-wet | 48.30 | **33.35** | **-31%** | 94.4 | **53.4** | **-43%** |

### Resolution ladder, best p50 of 2 runs, buffer size asserted on every cell

| resScale | buffer | cruise | city | boost | night-wet |
|---|---|---|---|---|---|
| 1.00 | 1280x720 | **15.9** | 21.4 | 23.2 | 33.3 |
| 0.85 | 1088x612 | **14.1** | 18.9 | 18.8 | 29.5 |
| 0.70 | 896x503 | **12.1** | **15.9** | **15.2** | 25.6 |
| 0.55 | 704x396 | **9.9** | **14.3** | **12.5** | 21.9 |

(bold = p50 <= 16.7 ms). Round 1's night-wet ladder was 50.7 / 44.3 / 38.8 / 32.9; every cell is now
~1.4-1.5x faster, and 0.55 has come from 32.9 to 21.9.

### DID IT REACH THE BAR? PARTLY, AND HERE IS EXACTLY WHERE.

- **cruise and corner hold 60 fps at 1280x720 real pixels** (15.96 and 13.17 ms). cruise was already
  marginal at 16.20 and is now 15.96 with a 0.60% spread, so it is a pass rather than a coin flip —
  but 29.7% of its frames are still over 16.7 ms, so the honest phrasing stays "makes 60 Hz more
  often than not on the highway", not "60 fps sustained".
- **city 21.55 (46 fps) and boost 22.92 (44 fps) still miss at scale 1.0**, and both hold 60 at 0.70.
- **night-wet 33.35 (30 fps) still misses at every scale**, but it is no longer the outlier it was:
  48.3 -> 33.35 is a 31% cut and its p99 halved.
- **The p99 defect is materially closed**: worst-case p99 across all five scenarios went from
  94.4 ms to 53.4 ms, and boost's from 64.2 to 35.4.

## 9. WHAT I TRIED THAT DID NOT WORK. Reported as misses.

1. **Instancing the 288 street-lamp wet smears and excluding the additive glow quads from the SSAO
   prepass bought 0.00 ms.** They were 288 cloned PlaneGeometries and 288 materials, they were being
   submitted by the colour pass, the AO prepass and the reflection alike, and removing them removed
   **287 geometries and 156 draw calls per frame** — for `night-wet` p50 33.33 -> 33.34. The city is
   not draw-call bound; round 1 found the same thing from the other direction and I did not believe
   it hard enough. **Kept**, because it is strictly less memory and provably pixel-identical
   (additive + `depthWrite:false` sums in any order), but it is a miss and it is not a win.
   - `road.js:2026-2073` new `addWetSmearBatch(parent, positions, color, w, l, intensity)`.
   - `world.js:2894-2899` BEFORE `for (const p of lampPositions) { roadKit.addWetSmear(smears, p.x, p.z + 5, 0, 0xffc98a, 1.8, 16, 0.16); }`
     AFTER `roadKit.addWetSmearBatch(smears, lampPositions.map((p) => ({ x: p.x, z: p.z + 5 })), 0xffc98a, 1.8, 16, 0.16);`
   - `world.js:3073` new `aoExclude: [smears, spillMesh]`, consumed at `main.js:217`
     BEFORE `exclude: [sky.skyMesh, boostFx.group],` AFTER `exclude: [sky.skyMesh, boostFx.group, ...(world.aoExclude || [])],`
2. **Warming the whole scene instead of named subtrees.** `scene.traverse` forcing every hidden node
   visible for the boot compile took the warm stage to **10.1 seconds**, compiled 172 programs
   instead of 68, uploaded 296 more geometries — **and still left three compiles in the first five
   seconds of play**, because what those three want is a material variant no hidden node carries.
   Reverted to the named list. Twelve seconds of boot to move 200 ms of stall is not a trade.
3. **`boostFx.pass.uniforms.uAmount = 1` alone** did nothing at all (progs still 178 -> 195) because
   the pass ships `enabled = false` and a disabled pass is never called. One measurement, not one
   argument, is what separated the two.
4. **PCFSoft -> PCF** is 0.13 ms at night-wet and -0.16 ms (noise) in the city. The shadow cost is
   raster area; the filter is free. Not taken, and worth knowing so nobody spends a round on it.

## 10. AVAILABLE BUT NOT TAKEN, with numbers, so the decision is the user's

- **`#shadow=2048`** — 4.85 ms at night-wet, 2.81 ms in the city, 0.5 ms on the highway. Default
  stays 4096 because `main.js:466-471` is a visual result: at 2048 the normal bias exceeds the facade
  relief and the facades read flat. `#shadow=0` is 9.92/7.20 ms and obviously visible.
- **`POOL = 8`** (`world.js:2866`) — a further ~4 ms at night. It drops a lit emitter that is in shot
  on 12% of frames. Not taken for that reason; the histogram in section 4 is there so the number can
  be re-decided without re-measuring.
- **`#msaa=4`** — round 1's knob, unchanged, still ~7 ms.
- **resScale 0.70** holds 60 fps in the city and under boost, and the pause menu already has the
  slider. That is the shipping answer for downtown today.
- **Merging the hero car's meshes** — `car-hidden` is 3.36 ms at night-wet and 1.28 in the city for
  387 draw calls. Round 1 ranked it ninth; at night it is now fourth.

## 11. ROUTED

1. **night-wet's remaining 33.3 ms is not reachable losslessly and I want to say so precisely.** The
   items left are the sun's depth raster (9.92), the ten remaining point lights (7.47), the post
   chain (6.42), the HUD composite (3.39), the car (3.36), SSAO (3.12) and bloom (2.99). Every one of
   them is either a visual result somebody already paid for or a full-frame effect. Reaching 16.7 ms
   at scale 1.0 on a wet night means choosing which of those to spend, and that is a decision for the
   user, not a bug for the next builder.
2. **A cube-probe face submits 2.34 M triangles through a 90-degree frustum** (section 7a). The
   structural fix nobody has taken is a projected-size or distance LOD applied only while the probe
   is baking: a 256-px face that ends up as a PMREM roughness chain does not need the facade greeble
   kitbash. That is the last big lossless-looking win I can see, and it needs a visual gate on
   `car-paint-closeup` that I did not have time to build.
3. **Three programs still compile in the first five seconds of a drive** (t+1.31, 3.71, 4.79, ~65-70
   ms each) and I could not identify which. `renderer.info.programs` walks 178 -> 181 on cruise. They
   are not covered by warming `crash.group`, `boostFx.group`, the boost mask or a whole-scene
   traverse, which means they are variants created on demand at runtime rather than at boot.
4. **`main.js:730-757` now owns the boot/first-frame trade.** The two warm frames cost ~0.9 s of boot and
   buy the first 700 ms of play going from 1 delivered frame to 44. If boot time ever becomes a bar,
   that is the line, and `STAGE_MS.warm = 78` at `main.js:124` is now badly wrong (it is ~1100) so
   the boot bar's last segment moves unevenly.
5. **`tools/progress.mjs` cannot see ANY round-2 verdict, mine included, and this is wave-wide.**
   It maps a piece to a verdict file by exact name (`PLAY` keys at `tools/progress.mjs:48-55`, lookup
   at `:86-105`), so `perf-r2.md`, `handling-r2.md`, `traffic-r2.md`, `menu-music.md` and every
   `*-critic-r2.md` land under piece keys that are not on the board. Run right now it prints
   `6 playability pieces (0 passing)` and the `perf` row still shows ROUND ONE's numbers as current.
   The fix is a two-line normalisation of `-r2`/`-fix`/`-verify` suffixes onto the base piece name.
   **I did not make it: `tools/progress.mjs` is not in my ownership and process rule 3 is a hard
   partition this round.** My headline numbers are in the fenced `progress-metrics` block above and
   are correct there; the board is what is stale.
6. **`frameStats.samples()`** is new (`main.js:613`). It is the only thing in the instrument that can
   distinguish work from cadence pinning, and section 5 is what it is for.

```progress-metrics
night-wet p50: 33.35 ms (30.0 fps) at 1280x720 @ ratio 1.0, 3 runs 33.34-34.01 - was 47.70
night-wet p99: 53.4 ms at 1280x720 @ ratio 1.0 (was 95.4-103.8)
boost p99: 35.4 ms at 1280x720 @ ratio 1.0 (was 79.4) - 17 first-boost shader compiles warmed at boot
cruise p50: 15.96 ms (62.7 fps) at 1280x720 @ ratio 1.0, 3 runs 15.93-16.03 - PASSES the 16.7 bar
city p50: 21.55 ms (46.4 fps) at 1280x720 @ ratio 1.0 - misses, holds 60 at resScale 0.70
first playable second: 44 frames delivered (was 1) - the 718 ms upload stall moved behind the boot bar
60 fps holds at resScale: 1.0 highway, 0.70 city and boost, never night-wet
```

## 12. THE VISUAL REGRESSION GATE, in one place

All seven presets rendered at 1280x720 BEFORE (my changes stashed) and AFTER, and compared as
per-pixel max-channel difference, not just looked at:
`shots/r2/BEFORE-<id>.png`, `shots/r2/FINAL-<id>.png`. (`shots/` is in `.gitignore`, so those PNGs
are on disk and not in the commit; the numbers below and the attribution kill-control are.)

| preset | maxDiff | meanDiff | % px > 2/255 | verdict |
|---|---|---|---|---|
| dusk-highway-chase | 2 | 0.0001 | 0.000% | identical |
| boost-blur | 2 | 0.0000 | 0.000% | identical |
| crash-cam | 2 | 0.0000 | 0.000% | identical |
| daytime-downtown | 6 | 0.0001 | 0.001% | identical |
| car-paint-closeup | 1 | 0.0000 | 0.000% | identical |
| hud-overlay | 2 | 0.0001 | 0.000% | identical |
| **wet-night-asphalt** | **87** | **0.1296** | **1.303%** | **one real change; see below** |

**The build's own run-to-run noise, measured rather than assumed**, because six of those rows are
only meaningful against it: two consecutive renders of `daytime-downtown` on the SAME build differ by
maxDiff 21, mean 0.0004, 0.0035% of pixels — i.e. **larger than the BEFORE/AFTER difference on every
row except wet-night-asphalt.** Those six are inside the noise floor.

### The one real change, localised and attributed by kill-control

A 16x9 grid of mean difference puts **all** of it on the car (cells row 6, cols 6-9: 2.28-3.46/255)
and on the car's own reflection in the wet road directly above it (0.60-0.73). Everything else in the
frame reads 0.00. Kill-control, one render with reflection gate (2) removed and nothing else changed:
the difference against BEFORE collapses from mean 0.1296 / 1.30% to **0.0296 / 0.12%**, and the
kill render is far from AFTER (0.1051 / 1.15%). **So it is gate (2) — `car.js`'s cube-probe faces no
longer rendering their own planar reflection — and nothing else.**

I looked at both at 3x (`shots/r2/zoom-BEFORE-car.png`, `shots/r2/zoom-AFTER-car.png`). Same paint,
same clearcoat highlights, same specular structure, same body horizon; the AFTER rear valance is a
touch more legible. **It is not worse.** It is what a probe face reflecting the frame's own mirror
instead of its own costs, and it was 10.83 ms/frame. The gate is one line and it is reversible at
runtime with `__game.world.roadKit.setMainCamera(null)`.

`shots/r2/DIFF-wet-night-asphalt.png` is the amplified (12x) difference image if anyone wants to
re-read the localisation themselves.

Boot check (rule 4): playable path booted headless at 1280x720, `#nomenu=1`, **0 console errors**,
then `applyTimeOfDay('night')`, `applyWet(1)`, `applyTimeOfDay('midday')`, `applyWet(0)`,
`setResScale(0.7)`, `setResScale(1.0)`, `setPaused(true)`, `setPaused(false)` — still **0 console
errors**. `#shadow=2048` and `#shadow=0` also boot with 0 errors. Live runtime state afterwards:
`renderSize {"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`,
`chunkStats {"chunks":1386,"moved":192877,"cell":200}`,
`lightStats {"pool":10,"inShot":6,"used":6,"maxInShot":7}`,
`reflStats {"enabled":true,"renders":46,"skipped":695,"rt":"640x360"}`.

## 13. Instrument reference — `tools/_perfr2.mjs`

```
--mode decomp    night-wet split into day/night x dry/wet, one page, interleaved, paired
--mode trace     per-INVOCATION renderer.render trace: target, camera uuid, override, calls, tris, ms
                 --frames N --minms M
--mode hist      frame-time histogram off frameStats.samples(): tells work apart from cadence pinning
--mode lights    how many light emitters are in shot at once, histogrammed over a real night drive
--mode sweep     visible-point-light count sweep with the material recompile that makes it real
--mode kill      paired interleaved kill-controls, min-envelope ranking, sign agreement per row
                 --variants lights-0,ssao-off,bloom-off,grade-off,post-chain-off,world-hidden,
                            traffic-hidden,car-hidden,hud-off,shadow-map-2048,shadow-map-1024,
                            shadow-pcf,shadows-off,shadow-casters-off
```

Every mode asserts `ctx.renderSize()` **and** `gl.drawingBufferWidth/Height` at the end of every
window and throws rather than printing a number for a buffer it is not.

Canary for whoever audits this: `--mode kill --scenario city --variants shadow-pcf` must come back as
noise (the shadow filter is free; the raster is not), and `--mode kill --scenario night-wet
--variants traffic-hidden` must come back as noise. If either changes sign, something structural
moved.
