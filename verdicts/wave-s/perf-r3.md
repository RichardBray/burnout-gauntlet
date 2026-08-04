# wave-s / perf-r3 — the first-second regression, then the three failing scenarios

**I AM RUNNING ALONE.** Checked before touching anything:
`uptime` -> `3:02 up 14 days, 17:14, 2 users, load averages: 2.17 2.35 2.61`.
`ps -Ao comm | grep -iE 'node|chrom'` -> 4 idle `node` (this repo's `tools/serve.mjs` and an
unrelated project's vite/esbuild pair) and **Slack's `chrome_crashpad_handler`** — no headless
chromium, no playwright, no peer measurement process. So **every frame-time number below is a
RESULT, not a smoke test.** Every headline is taken three times with the spread printed.

## 0. Tree state before I touched anything (process rule 2)

HEAD `b72de30` (`wave-s/handling-r3-critic`). `git status --short`:

```
 M PROMPT.md
 M driver.log
 M progress.json
?? README.md
?? game/music/
?? verdicts/wave-s/perf-critic.md
```

**No inherited edits in `game/` at all.** Nothing to justify or revert. The tree has moved under
`handling-r3` (`3e4e645`) since perf-critic-r2 took its numbers, so I re-establish my own BEFORE on
this exact tree before claiming any delta.

(appended as the work happened)

## 1. THE REGRESSION FIRST. It had TWO causes, and neither was shader compilation.

`tools/_perfcritic-r2-first.mjs` (the critic's own instrument, unmodified) on HEAD `b72de30`,
`node tools/_perfcritic-r2-first.mjs ./game HEAD 4 700`:

```
run 1: __ready 2827 ms | frames in first 700 ms = 21 | max delta 330.4 ms | progs 192
   4.3, 82, 330.4, 6.8, 31.9, 0.8, 14, 15.3, ...
run 2: __ready 2242 ms | frames = 30 | max delta 185.5 ms      5.8, 70.6, 185.5, 15.2, ...
run 3: __ready 2255 ms | frames = 31 | max delta 194.7 ms      4.4, 67.6, 194.7, 3.6, ...
run 4: __ready 2291 ms | frames = 31 | max delta 171.0 ms      4.6, 70.1, 171.0, 12.5, ...
```

**Reproduced 4 of 4, exactly as the critic described it.** Three more boots in three separate
browser processes: 310.5 / 300.9 / 302.6 ms. So: 7 of 7.

### 1a. The instrument that found it, and why nobody had

`tools/_perfr3.mjs --mode first` is mine. It rings rAF from `addInitScript` (before any page
script), and additionally (a) samples `renderer.info` per frame for program / geometry / texture
deltas, (b) wraps every collaborator `tick()` calls in a CPU bracket, and (c) observes
`longtask` **and `long-animation-frame`**, which carries a per-script breakdown with
`sourceURL` / `sourceFunctionName` / `invoker`. That third one is what actually named the second
cause; nothing in the repo could see it.

BEFORE, the first three frames after `__ready`:

```
 #   delta   dProgs dGeos dTexs   attribution (CPU ms, >0.4 only)
 1     4.6        0     0     0   traffic.update 1
 2    85.0        8   113     3   renderer.render 65  car.update 23.2  hud.update 18.1
 3   310.5        0     0     0   composer.render 8.3  renderer.render 8.1  hud.update 1.7
```

**Frame 3 spends ten milliseconds on the CPU and three hundred waiting.** That is why every
previous look at it came back "not compilation, progs is already 192": the frame that *pays* is
frame 3 and the frame that *causes* is frame 2, which uploads **8 programs, 113 geometries and 3
textures** and then returns, leaving the compositor to block on the queue.

### 1b. CAUSE 1 — the two warm frames at boot structurally cannot cover the first tick

`main.js:761-781` renders two warm frames, then `main.js:811` calls `traffic.reset()`, which
builds its vehicles *after* them, and `hud.update` / `car.update` are not called at all until the
first real tick. So the first tick creates and uploads work no warm frame could have touched.

- `game/main.js:813` BEFORE: nothing between `traffic.reset(physics.state.pos);` and
  `requestAnimationFrame(frame);`.
  AFTER: one real `tick(0.001)` + `composer.render()` + **`gl.finish()`**, with the deltas it
  absorbs published on `window.__warmStats`.
  The `gl.finish()` is load-bearing and is the difference between moving the stall and *serving*
  it: without it the uploads are merely queued before `__ready` and the wait lands on the player
  anyway. Measured live, 12 boots: `__warmStats {"progs":8,"geos":113,"texs":3,"ms":66-103}` —
  **the same 8 / 113 / 3 that used to land on frame 2, now inside the boot bar.**

With cause 1 fixed alone, 3 of 4 boots in a batch were clean and the 4th still hitched 317 ms —
with `dProgs 0 dGeos 0 dTexs 0` and no CPU. So there was a second cause.

### 1c. CAUSE 2 — the first key the player presses builds the entire audio graph

`long-animation-frame`, on the hitching boots, names it outright:

```
LoAF blocking=242.1  scripts=[{ sourceURL: ".../main.js", sourceFunctionName: "down",
                                invoker: "DOMWindow.onkeydown", duration: 282.1 },
                              { ... "frame", "FrameRequestCallback", 9.6 }]
```

`main.js:582` — `down()` calls `audio.start()`, and on a cold graph `audio.js:build()` (`:1303`)
synchronously constructs an AudioContext, **two 3-second stereo noise buffers**, the synthesised
reverb IR, five buses and four voices. 162-282 ms, on the main thread, on the first keystroke.

**Kill-control, not an argument.** `audio.start` stubbed to a no-op after `__ready` and before the
first key, nothing else changed: **4 boots of 4 clean, 41-45 frames in the first 700 ms, max
33-37 ms.** That is the whole remainder.

- `game/audio.js:1368` BEFORE: nothing. AFTER: `prewarm()` — runs `build()` and nothing else, no
  `resume()`, no master ramp, returns the milliseconds it cost. It is silent by construction:
  a context built with no user gesture is created SUSPENDED, `master = mkGain(0.0)`
  (`audio.js:374`) so the master sum sits at zero gain until `start()` ramps it, `running` stays
  false and the `suspended` getter still reports `true`.
- `game/audio.js:53` BEFORE `start: f, stop: f, ...` AFTER the same plus `prewarm: () => -1,` on
  the headless no-op shim, so `tools/shot.mjs` is unaffected.
- `game/main.js:813` BEFORE: nothing. AFTER `if (params.audiowarm !== '0' && audio.prewarm)
  { window.__audioWarmMs = audio.prewarm(); }` in the warm stage.

**DECLARED LOUDLY, because it moves an audited invariant.** wave-s/menu-critic counted the nodes
reaching a destination before the gesture and found **exactly zero**; after this change the SFX
graph exists (suspended, at zero gain) before the first gesture. Nothing is audible and
`music.js`'s separate context and routing are untouched, but the count is no longer zero and a
future audio critic must not read that as a regression it has to fix. `#audiowarm=0` restores the
old timing exactly.

### 1d. AFTER — 12 cold boots, 12 clean, and the BEFORE never was

| tree | frames in first 700 ms after `__ready` | worst delta in that window | `__ready` at |
|---|---|---|---|
| BEFORE (HEAD `b72de30`) | 21, 30, 31, 31 (+3 fresh browsers) | **330, 186, 195, 171** (+301, 303, 305) | 2242-2874 ms |
| cause 1 only | 25, 43, 43, 41 | 318, 34.9, 35.1, 34.6 | 2544-3069 ms |
| **AFTER (both)** | **42, 42, 43, 43, 42, 40, 42, 43, 42, 42, 41, 41** | **33.9-48.2 ms, no frame over 50** | 2532-3368 ms |

**0 of 12 boots carry a hitch; 7 of 7 did before.** `0 console errors and 0 page errors` on every
one of those boots. The price is boot time: `__ready` 2242-2291 -> 2532-2629 ms on the warm
boots, i.e. **about +290 ms of boot bar** for the two absorbed costs
(`__warmStats.ms` 66-103, `__audioWarmMs` 160-165; the first page of a browser process reads
89-103 and 275-451). That is the trade and it is the right way round: the bar is a place the
player is already being told to wait.

## 2. MY OWN BEFORE, on this exact tree, and it reproduces the critic

The tree moved under `handling-r3` (`3e4e645`) and `handling-r3-critic` since perf-critic-r2 measured,
so round 2's numbers are not my BEFORE. `tools/_perfr3.mjs --mode drive` copies fps.mjs's scenario
table **verbatim** (path placement + `followPath`, the 1.6 s steering oscillator for `corner`), reads
`gl.drawingBufferWidth/Height` off the DRIVER at the end of every window and **throws** instead of
printing if it is not 1280x720 at ratio 1, and reports the catch-up-tick-merged distribution that
perf-critic-r2 1d established as the honest one. 3 runs per cell, warm 3.5 s, measure 8 s,
`#nomenu=1`, fresh page per run. Load `{3.95 3.78 3.24}` -> `{3.09 3.75 3.37}`.

| scenario | my BEFORE p50 (x3) | fps delivered | % frames > 16.7 ms | p99 | critic-r2's p50 |
|---|---|---|---|---|---|
| corner | **13.10** (13.10/13.10/13.20) | 77.3 | 4.7% | 33.6 | 13.00 |
| cruise | **16.00** (16.10/16.00/16.00) | 56.1 | 29.4% | 35.8 | 16.10 |
| city | **21.90** (22.00/21.80/21.90) | 44.7 | 98.2% | 38.2 | 21.80 |
| boost | **23.20** (23.00/23.20/23.30) | 42.8 | 96.4% | 34.0 | 22.10 |
| night-wet | **33.30** (33.30/33.30/33.40) | 29.5 | 100.0% | 54.0 | 32.70 |

Four of five within 0.6% of the critic; boost within 5%. Every row: `renderSize
{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`,
`glDrawingBuffer 1280x720`, `resScale 1`, `paused false`, 387-704 m driven per window at 55-281 km/h.

## 3. WHERE THE FRAMES ARE, re-derived from scratch. 13 kill-controls, city, 2 runs each

Each kill runs once in the SAME page after the car is placed and before the 3.5 s warm-up, so the
only difference from a baseline run is the thing killed. city BEFORE = 21.90.

| kill-control | city p50 | saves |
|---|---|---|
| world-hidden | 11.40 | 10.50 |
| **shadow-frozen** (map rendered once, then never) | 16.20 | **5.70** |
| post-chain-off | 19.20 | 2.70 |
| shadow-casters-off (map still cleared) | 19.70 | 2.20 |
| **hud-off** | 19.80 | **2.10** |
| shadow-2048 | 20.10 | 1.80 |
| ssao-off | 20.30 | 1.60 |
| bloom-off | 20.60 | 1.30 |
| **sky-off** | 20.60 | **1.30** |
| car-hidden | 21.20 | 0.70 |
| fxaa-off | 21.50 | 0.40 |
| traffic-hidden | 21.80 | 0.10 |
| refl-off | 21.80 | 0.10 |

and the same four on the other three scenarios (2 runs each, saving against that scenario's own
BEFORE):

| kill | cruise (16.00) | boost (23.20) | city (21.90) | night-wet (33.30) |
|---|---|---|---|---|
| shadow-frozen | 2.40 | 2.80 | 5.70 | **9.10** |
| hud-off | 2.20 | 2.60 | 2.10 | 2.10 |
| ssao-off | 1.00 | 1.40 | 1.60 | 1.50 |
| sky-off | 0.90 | 1.60 | 1.30 | 0.40 |

**The sun's depth map is the largest single item on every scenario and it is nearly a third of the
worst one.** That is what the rest of this piece is about, and note that the profile chose it — I
carried no guess in from the brief, and two of the three things I then tried against it failed.

## 4. FIX 1 — the sky was shading every pixel of the frame and then being painted over

`game/sky.js`. `SKY_VERT` emits `gl_Position = p.xyww` (`sky.js:605`), so every sky fragment is at
NDC z = 1.0 — the far plane. But the dome shipped with `depthTest: false` at `renderOrder = -1000`,
i.e. it ran its full procedural shader (LUT tap, stars, three cloud layers, halo) over all 921,600
pixels FIRST and the city then drew buildings on top of nearly all of them.

- `game/sky.js:1529` BEFORE `side: THREE.BackSide, depthWrite: false, depthTest: false, ...`
  AFTER `side: THREE.BackSide, depthWrite: false, depthTest: true, ...`
- `game/sky.js:1532` BEFORE `skyMesh.renderOrder = -1000;` AFTER `skyMesh.renderOrder = 1000;`
  (then made per-preset at `sky.js:1607-1626`, see below)

**Checked rather than assumed, because reordering only hurts something that relied on being painted
OVER the sky inside the opaque pass.** I enumerated every mesh in the live scene with
`material.transparent !== true && material.depthWrite === false` — the only combination that can sit
in three's opaque list without owning its depth — at dusk/dry, and again at night + wet 1.0 with
`boost.update(amount 1)` and a live `crash.trigger()`: **the list has exactly one entry, the sky
mesh itself.** Everything else additive in this build is `transparent: true`, so it is in the
transparent list, which is drawn after the entire opaque list either way.

### 4a. And then the measurement said "not at night", so it is per preset

Paired A/B in ONE page — `--kill sky-old` reverts exactly those two lines at runtime — 3 runs each:

| scenario | sky FIRST (old) | sky LAST (new) | delta | total cost of the dome |
|---|---|---|---|---|
| city | 21.70 | **20.70** | **-1.00** | 1.30 |
| boost | 23.20 | **22.50** | **-0.70** | 1.60 |
| cruise | 16.00 | 15.90 | -0.10 | 0.90 |
| **night-wet** | 33.30 | 33.80 | **+0.50** | **0.40** |

night-wet goes the wrong way and the last column says why: the night dome is a cheap shader (stars
and a dark gradient, no lit cloud layers) and it is almost entirely occluded anyway, so there are
only 0.40 ms on the table and giving up being the frame's first full-screen draw costs more than
that on a tiler. **So the order is chosen per preset from the measurement, and night keeps the old
one.** I am reporting the +0.50 rather than averaging it away.

- `game/sky.js:1607-1626` BEFORE: nothing (the order was fixed at construction). AFTER: in
  `apply(name)`, `const skyLate = !p.night; skyMesh.renderOrder = skyLate ? 1000 : -1000;` and
  `skyMat.depthTest = skyLate` with a `needsUpdate` only when it actually changes. Verified live at
  every time of day: dusk/midday/dawn -> `renderOrder 1000, depthTest true`; night ->
  `renderOrder -1000, depthTest false`.

**Zero pixels move either way.** A fragment at z = 1.0 can only be rejected by something that has
already covered it. Gate numbers in section 8.

## 5. FIX 2 — THE HUD WAS RENDERING AT FOUR TIMES THE RESOLUTION OF THE GAME, and it is the wave's own founding bug in the one surface nobody re-checked

`game/hud.js:123` BEFORE `dpr = clamp(globalThis.devicePixelRatio || 1, 1, 3);`
AFTER `dpr = clamp(globalThis.devicePixelRatio || 1, 1, Math.max(1, maxPixelRatio));`
`game/hud.js:87` BEFORE `export function createHud(container, { layout } = {}) {`
AFTER `export function createHud(container, { layout, maxPixelRatio = 1 } = {}) {`
`game/main.js:179-183` BEFORE `createHud(document.getElementById('hud'), { layout: world.LAYOUT })`
AFTER the same plus `maxPixelRatio: hudRes`, with
`const hudRes = Math.max(1, Math.min(3, parseFloat(params.hudres) || 1));`

`devicePixelRatio` is **2** on the machine this game is developed and played on. Session 16 fixed
exactly this for the 3-D buffer (`renderer.setPixelRatio(resScale)`, capped at 1.0, which is why the
GL buffer is honestly 1280x720). **Nobody re-checked the HUD**, which is a separate DOM canvas: at a
1280x720 window its backing store was **2560x1440**, four times the pixels of the frame it is drawn
over.

Measured on the player's real configuration — viewport 1280x720 with `deviceScaleFactor: 2`, the GL
drawing buffer asserted at 1280x720 ratio 1 on every window, `canvases` printed per run so the two
sizes are on the record — city, 2 runs each:

```
dpr 1   baseline 20.60   HUD hidden 18.70   -> the HUD costs 1.90 ms   canvases 1280x720 1280x720
dpr 2   baseline 24.60   HUD hidden 18.50   -> the HUD costs 6.10 ms   canvases 1280x720 2560x1440
```

**The kill-control is exact: with the HUD hidden, `deviceScaleFactor 2` costs 0.00 ms** (18.70 vs
18.50, inside the spread). So the entire 4.0 ms that a Retina display added to this build was the
HUD's backing store — a quarter of a 16.7 ms frame, spent drawing and compositing a speedometer at
four times the resolution of the game. After the fix, dpr 2 reads 20.50-20.70, i.e. **identical to
dpr 1**, and the HUD canvas is 1280x720.

This does not contradict `main.js:266`'s recorded decision that `resScale` must not soften the HUD:
that is about the resolution SLIDER and the HUD still ignores it. This is about not supersampling
past the window. `#hudres=2` restores the old behaviour with the 4.0 ms price printed beside it
(verified live: `canvases 1280x720 2560x1440`, 0 errors).

**The screenshot regression gate CANNOT see this change**, because `tools/shot.mjs` runs at
`deviceScaleFactor 1` where the two are identical. Stated plainly rather than presented as a pass:
the one thing a Retina player will see is HUD type rendered at 1x instead of 2x, over a 3-D frame
that is already 1x.

## 6. FIX 3 — the sun's depth map at night, and this one has a price I had to look at

At night the sun is `intensity 0.45` at `-7.5 deg` elevation — read off the live preset — against a
hemisphere ambient of 0.40 and a city lit by lamps. It was still rasterising a 4096x4096 map.

| night-wet | p50 | saves |
|---|---|---|
| 4096 (was the default) | 33.30 | — |
| 2048 | 28.40 | 4.90 |
| **1024** (the new night default) | **27.30** | **6.00** |
| shadows off entirely | 23.80 | 9.50 |

- `game/main.js:504-536` BEFORE
  `const shadowPx = params.shadow === undefined ? 4096 : ...; if (shadowPx === 0) renderer.shadowMap.enabled = false; sh.mapSize.set(Math.max(256, shadowPx), Math.max(256, shadowPx));`
  AFTER `const shadowParam = params.shadow === undefined ? null : ...;` plus
  `function applyShadowRes(todName) { const px = shadowParam !== null ? shadowParam : (todName === 'night' ? 1024 : 4096); ... }`
  which also disposes `sh.map` so a runtime resize takes effect, exposed as `ctx.applyShadowRes`.
- `game/main.js:312` BEFORE: nothing at the end of `applyTimeOfDay`.
  AFTER `if (ctx.applyShadowRes) ctx.applyShadowRes(tod);` — because the menu changes the time of
  day at runtime and the boot path is no longer the only caller.

**DAY, DUSK AND DAWN ARE UNCHANGED AT 4096.** perf-r2's refusal to take 2048 is a DAYTIME result
(the sun modelling 20-45 cm of facade relief; at 2048 the normalBias exceeds it and the facades read
flat) and it stands untouched. Verified live at every time of day: dusk/midday/dawn 4096, night
1024, and `#shadow=<px>` still overrides at every one of them (`#shadow=2048` reads 2048 at all four,
`#shadow=0` reads `shadowMap.enabled false`).

**THE VISUAL PRICE, LOOKED AT AND NOT ASSERTED.** `wet-night-asphalt` at 4096 vs 1024: maxDiff 37,
mean 0.1700, **0.7489%** of pixels over 2/255, against a same-build noise floor on that scene of
**maxDiff 4, mean 0.0001, 0.0003%**. So it is a real difference, not noise, and I had to look at it.
I took the 16x9 grid, found the largest cell (the lit right-hand facade), cropped x 880-1200 /
y 20-220 and read both at 3x: `shots/r3/crop-4096.png` vs `shots/r3/crop-1024.png`. Same mullion
piers, same per-floor cornices, same sill shadows, same lamp falloff, same signage edges. **Nothing
reads flatter and nothing lost contact with the ground.** I am calling this not-worse; it is the one
change in this commit that a critic should re-examine, and it is one constant away from being
reverted.

## 7. WHAT I TRIED THAT DID NOT WORK. Three misses, one of them a hypothesis I had already shipped

### 7a. MISS — "the shadow map is rasterised 2-3 times a frame" is TRUE and worth 0.00-0.30 ms

This was my best idea and the profile's biggest item, and it is wrong. `WebGLRenderer.render()`
calls `shadowMap.render()` at the top of every invocation, and this build invokes it more than once
per frame with the real scene: the colour pass, the SSAO normal/depth prepass, boost's hero-mask
depth pass and, when wet, road.js's planar reflection. I counted it by wrapping
`renderer.shadowMap.render` and only counting calls with a non-empty `shadowsArray` (the other ~18
per frame are post-processing fullscreen quads with no lights, already no-ops):

```
dusk highway  2.03 real shadow renders/frame        city midday  2.00        night + wet  3.00
```

Every one rasters the same map — `light.shadow.camera` is derived from the light, not from the
camera being rendered — so this is structurally the same defect class as perf-r2's four-times
planar reflection. I gated it to one per frame and measured:

| scenario | before the gate | after the gate |
|---|---|---|
| city | 21.90 | 21.60 |
| night-wet | 33.30 | 33.30 |
| cruise | 16.00 | 16.10 |

**0.00 to 0.30 ms, i.e. inside the run-to-run spread.** The mechanism is real and verified per call
(the 2nd and 3rd invocations now do **0** draw calls, traced), but the cost was never in the repeats
— `shadow-frozen` saves 5.70-9.10 ms and the gate saves ~0.2 of it, so essentially the whole cost is
the ONE raster that has to happen. Kept anyway because it is strictly less GPU work and provably
lossless, but **it is a miss and must not be quoted as a win**: if a future wave wants the shadow
map cheaper, the lever is the map itself, not how many times it is submitted.

- `game/main.js:680-714` BEFORE: nothing. AFTER `renderer.shadowMap.autoUpdate = false;` once,
  plus `renderer.shadowMap.needsUpdate = true;` at the top of `frame()` (before the paused branch,
  so the paused path still updates). The deterministic screenshot path returns at `:556`, above
  this, so shots keep three's default per-render behaviour.

### 7b. MISS — rate-limiting the HUD's redraw to 30 Hz buys 0.40 ms of the 2.10

Wrapping `hud.update` to run every other frame (`--kill hud-30hz`): city 20.60 -> 20.20, night-wet
33.30 -> 32.00. Against `hud-draw-off` (draw once, never again) at 18.50 in the city. So **only a
fifth of the HUD's cost is the redraw**; the rest is compositing a full-screen 2-D canvas layer over
the WebGL canvas every frame, which happens whether or not the canvas changed. A jerkier HUD for
0.40 ms is not a trade, and I did not take it. Profiled inside the redraw for the record, at dpr 1:
`hud.update` 1.84 ms/frame of CPU, of which the enumerated canvas ops are ~0.80 — 2127 `lineTo`,
199 `strokeText`, 118 `fillText`, 86 `measureText`, 39 `drawImage` and 14 `filter` assignments
**per frame**, for a speedometer. Routed in section 10.

### 7c. MISS — the first-second fix needed TWO changes and I shipped the first one alone for a while

Cause 1 (the residency warm) fixed 3 boots of 4 and I could easily have stopped there and claimed
it; the 4th boot still hitched 317 ms with `dProgs 0 dGeos 0 dTexs 0` and no CPU in the frame.
`long-animation-frame` named cause 2 and the kill-control confirmed it. Recorded because "3 of 4
boots clean" is exactly the sample size that produced round 2's refuted claim in the first place.

## 8. THE VISUAL REGRESSION GATE

All seven presets rendered at 1280x720 with my changes STASHED (`git stash push -- game/`) and again
with them applied, compared per-pixel with `tools/_perfr3-diff.mjs` (max-channel difference, plus a
16x9 grid of mean difference so a change can be localised to an object).
`shots/r3/BEFORE-<id>.png` vs `shots/r3/AFTER-<id>.png`.

| preset | maxDiff | meanDiff | % px > 2/255 | verdict |
|---|---|---|---|---|
| dusk-highway-chase | 2 | 0.0000 | 0.0000% | identical |
| boost-blur | 2 | 0.0001 | 0.0000% | identical |
| crash-cam | 2 | 0.0000 | 0.0000% | identical |
| car-paint-closeup | 2 | 0.0000 | 0.0000% | identical |
| hud-overlay | 2 | 0.0000 | 0.0000% | identical |
| daytime-downtown | 13 | 0.0002 | 0.0012% | **inside its own noise floor** |
| **wet-night-asphalt** | **37** | **0.1700** | **0.7489%** | **the night shadow map; looked at, section 6** |

`daytime-downtown` is the preset the sky reorder actually applies to, so its row is only meaningful
against the build's own noise: **two consecutive renders of the same build differ by maxDiff 13,
mean 0.0002, 0.0020% of pixels** — the same max, the same mean and MORE coverage than the
BEFORE/AFTER difference. Its grid is 0.00 in all 144 cells. The sky reorder is pixel-identical, as
designed. Same-build noise on `wet-night-asphalt` is maxDiff 4 / 0.0001 / 0.0003%, which is why
section 6 had to open the crops instead of quoting a number.

**Did any scene get worse? No.** Five presets are byte-identical to within the PNG's own
quantisation, daytime-downtown is under its noise floor, and wet-night-asphalt's real difference was
cropped and read at 3x on the cell that carries it.

The two changes the gate structurally cannot see, said plainly: the **HUD backing store** (shots run
at `deviceScaleFactor 1`, where nothing changes) and the **residency warm-up / audio prewarm** (boot
only, and the shot path returns before both).

## 9. FINAL NUMBERS

### 9a. The wave's measurement contract: 1280x720, pixelRatio 1, devicePixelRatio 1, resScale 1

3 runs per cell, warm 3.5 s, measure 8 s, fresh page per run, `#nomenu=1`.
Load `{3.72 3.74 3.43}` before, `{4.01 4.00 3.62}` after. Every cell:
`renderSize {"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`,
`glDrawingBuffer 1280x720` read off the driver, `resScale 1`, `paused false`.

| scenario | BEFORE p50 | AFTER p50 (x3) | BEFORE fps | **AFTER fps** | BEFORE >16.7 | AFTER >16.7 | AFTER p99 |
|---|---|---|---|---|---|---|---|
| corner | 13.10 | **12.90** (12.90/12.90/12.70) | 77.3 | **80.8** | 4.7% | **4.2%** | 33.5 |
| cruise | 16.00 | **15.90** (16.10/15.80/15.90) | 56.1 | **57.6** | 29.4% | **26.3%** | 35.6 |
| city | 21.90 | **20.60** (20.60/20.90/20.50) | 44.7 | **46.0** | 98.2% | 94.4% | 36.9 |
| boost | 23.20 | **23.00** (23.10/22.50/23.00) | 42.8 | **43.5** | 96.4% | 96.8% | 41.0 |
| night-wet | 33.30 | **27.60** (27.30/27.60/27.60) | 29.5 | **35.8** | 100.0% | 99.7% | 50.7 |

### 9b. THE PLAYER'S ACTUAL MACHINE: the same 1280x720 buffer with devicePixelRatio 2

This is the configuration the game is really played in on this laptop, and it is where this piece's
result lives. The GL buffer is still exactly 1280x720 real pixels at ratio 1 in every one of these
windows (asserted off the driver, and the tool throws otherwise); the only thing dpr 2 changes is
the DOM layers. BEFORE = HEAD with my `game/` changes stashed, AFTER = this commit. 2 runs each.

| scenario | BEFORE p50 / fps / >16.7 | **AFTER p50 / fps / >16.7** | p50 change |
|---|---|---|---|
| corner | 15.80 / 57.9 / 34.4% | **12.90 / 81.1 / 3.6%** | **-18.4%** |
| cruise | 20.50 / 47.8 / 81.1% | **16.00 / 58.4 / 25.4%** | **-22.0%** |
| city | 25.70 / 39.4 / 97.6% | **20.70 / 46.2 / 93.7%** | **-19.5%** |
| boost | 26.50 / 37.7 / 95.6% | **22.90 / 43.5 / 97.0%** | **-13.6%** |
| night-wet | 37.80 / 26.7 / 100.0% | **27.70 / 36.0 / 99.7%** | **-26.7%** |

**Every scenario is 14-27% faster on the machine the user plays on, and `corner` goes from a
FAILING 57.9 fps with a third of its frames long to 81.1 fps with 3.6%.** After the fix, dpr 2 and
dpr 1 agree to within noise on all five, which is the point: the Retina tax is gone rather than
hidden.

### 9c. DID IT REACH THE BAR? Plainly, per scenario, at dpr 1 and dpr 2.

- **corner PASSES, and now passes on the real machine too.** 12.90 ms, 80.8 fps, 4.2% of frames over
  16.7 ms; at dpr 2 it was 57.9 fps and is now 81.1.
- **cruise still MISSES the bar as worded.** p50 15.90 is inside 16.7, but it delivers **57.6 fps**
  with **26.3%** of frames over 16.7 ms. It is better than it was (56.1 / 29.4%, and 47.8 / 81.1% at
  dpr 2) and it is not 60 fps sustained. The distribution is bimodal — a mode near 16 ms and a
  second population at 30-35 — exactly as perf-critic-r2 1d described.
- **city MISSES: 20.60 ms, 46.0 fps.** It needs another 3.9 ms.
- **boost MISSES: 23.00 ms, 43.5 fps.** It needs another 6.3 ms.
- **night-wet MISSES: 27.60 ms, 35.8 fps** — but it is 33.30 -> 27.60 here and **37.80 -> 27.70 on
  the player's configuration**, i.e. 26.7 -> 36.0 fps.

**WHAT THE REMAINING MILLISECONDS WOULD COST, from my own kill-controls rather than from a guess:**

- **city needs 3.9 ms.** The items are the sun's depth map (5.70 total; 2048 would give 1.80 and is
  refused on daytime facade relief), the HUD composite (2.10, and only 0.40 of it is the redraw —
  see 7b), SSAO (1.60), bloom (1.30), the sky dome (1.30, already collected), FXAA (0.40). There is
  no lossless 3.9 ms left in that list: reaching it means spending SSAO **and** bloom, or the
  daytime shadow resolution, or moving the HUD into the WebGL frame (routed).
- **boost needs 6.3 ms** and its profile is the highway's plus the smear pass; the same list applies
  with less shadow in it.
- **night-wet needs 10.9 ms.** Even taking the entire remaining shadow map (3.5 more), all of SSAO
  (1.50), all of bloom and the whole HUD, it does not get there. **night-wet at 1280x720 with
  resScale 1 is not reachable losslessly and I am not going to imply otherwise.** `resScale 0.7` is
  the shipping answer for a wet night and the pause menu already has the slider.

## 10. ROUTED

1. **THE HUD SHOULD BE DRAWN INSIDE THE WEBGL FRAME, and it is now the largest lossless item
   left.** 2.10 ms at dpr 1 on every scenario, of which only 0.40 is the redraw (7b): the rest is
   the browser compositing a full-screen 2-D canvas layer over the WebGL canvas every frame. As a
   texture drawn by a pass in the existing composer chain it would cost a fraction of that and the
   compositor would have one layer instead of two. That is a hud.js + main.js structural change with
   a real regression gate available (`hud-overlay`), and it is bigger than anything else I can still
   see.
2. **`shadow-frozen` is 5.70 ms in the city and 9.10 at night, and nobody has tried to CACHE the
   map.** The blocker is real and I measured it: the car casts 56 objects / 59,564 triangles into
   that map and traffic casts 90 instances, so freezing it freezes their shadows. A two-tier scheme
   (static world baked on a texel-snapped grid + the moving casters every frame) is the standard fix
   and three.js will not do it with one light. Worth a piece of its own; not worth guessing at.
3. **The frame is fragment-bound and `resScale` is the honest knob.** perf-r2's ladder still holds
   in shape; with night-wet now at 27.60 rather than 33.35, 0.7 should put every scenario except
   night-wet under 16.7 ms. I did not re-measure the whole ladder and I am not claiming it.
4. **`STAGE_MS.warm` at `main.js:124` is now even more wrong.** It declares 78 ms against a stage
   that also carries the audio prewarm (160-450 ms) and the residency warm (66-103 ms) on top of
   perf-r2's ~1100. The boot bar's last segment moves unevenly. Cosmetic; declared, as perf-r2
   declared it.
5. **A future audio critic must know that `audio.prewarm()` exists.** wave-s/menu-critic's routing
   audit counted **zero** nodes reaching a destination before the first gesture and that number is
   now non-zero (suspended context, `master = mkGain(0.0)`, `running === false`,
   `suspended === true`). It is silent and `#audiowarm=0` disables it. This is a disclosure, not a
   defect — but it will look like one to an instrument that only counts nodes.
6. **`tools/progress.mjs` still cannot see round-2 or round-3 verdict names.** perf-r2 routed this
   (its item 5) and `8bbbf77 wave-s/board` fixed part of it; whether `perf-r3.md` lands on the board
   is not something I can verify from inside my own ownership. My headline numbers are in the fenced
   block below and are correct there.
7. **The `--kill sky-old` canary.** If a future change makes `--kill sky-old` come back FASTER than
   the default on city or boost, something has been added to the opaque list that depends on being
   painted over the sky, and section 4's enumeration needs re-running.

## 11. Instrument reference

`tools/_perfr3.mjs`

```
--mode first                     the first playable second, per frame: rAF delta, renderer.info
                                 deltas (progs/geos/texs), a CPU bracket around every tick()
                                 collaborator, longtask AND long-animation-frame with its
                                 per-script sourceURL/functionName/invoker breakdown.
                                 --kill audio-start applies the section-1c kill-control.
--mode drive --scenario <s>      p50 / p90 / p99 / max / DELIVERED fps / % of frames over 16.7 ms,
                                 with the catch-up-tick merge perf-critic-r2 1d established.
                                 fps.mjs's scenario table verbatim, including the corner oscillator.
  --kill <name>                  22 kill-controls, applied in the same page after placement:
                                 shadow-casters-off shadows-off shadow-2048 shadow-1024
                                 shadow-frozen ssao-off bloom-off output-off fxaa-off
                                 post-chain-off hud-off hud-30hz hud-draw-off world-hidden
                                 car-hidden traffic-hidden lights-0 refl-off sky-off sky-old
  --dsf 2                        emulate the Retina machine: DOM layers at 2x, GL buffer still
                                 1280x720 (asserted, and it throws if it is not)
  --repeat N --warm ms --meas ms
```

`tools/_perfr3-diff.mjs A.png B.png [amplified.png]` — max/mean/coverage plus a 16x9 grid of mean
difference, which is what localises a change to an object.

Both assert the buffer off `gl.drawingBufferWidth/Height` and **throw rather than print a number**
for a buffer that is not what was asked for.

Canary for whoever audits this: `--mode drive --scenario night-wet --kill sky-old` must come back
FASTER than the default (that is why night keeps the old order), and `--kill sky-old` on city must
come back SLOWER. If either flips, section 4a is stale.

## 12. Machine, and the one process note

**I ran alone.** `uptime` and `ps` checked at the start (section 0) and the load average is quoted
either side of every measurement block. No peer agent, no headless chromium but mine, no playwright
but mine. Every number in this verdict is a RESULT.

**I edited `game/main.js`**, which my brief explicitly permits for "renderer, pipeline, culling and
warm-up work" while it stays frozen to everyone else. Four hunks, all of that kind: the residency
warm-up and audio prewarm (`:813`), the once-per-frame shadow gate (`:680`), the per-time-of-day
shadow resolution (`:504`, `:312`), and the HUD's `maxPixelRatio` (`:179`). I touched neither
`game/physics.js` nor `game/camera.js`. All three of the driver's joins still verify on my tree:
6 near-miss events over 0.862 km (6.96/km) taking boost 0 -> 0.2525, `crash.trigger` fired from
`drainWreck`, drawn nose delta **0.0000** from `state.yaw`, 0 console errors.

**Boot check (rule 4), because `lint ok` does not mean runnable.** Eight configurations booted, each
driven, each with every runtime knob exercised in both directions (all four times of day, wet 1 and
0, resScale 0.7 and 1.0, pause and resume): `#nomenu=1` at dpr 1, at dpr 2, **the real player path
through the START menu**, `#hudres=2`, `#shadow=2048`, `#shadow=0`, `#audiowarm=0`, `#msaa=4`.
**0 console errors and 0 page errors on all eight**, and 12 more boots in section 1d with 0 errors.

```progress-metrics
night-wet p50: 27.60 ms (35.8 fps) at 1280x720 @ ratio 1.0, 3 runs 27.30-27.60 - was 33.30 (29.5 fps)
city p50: 20.60 ms (46.0 fps) at 1280x720 @ ratio 1.0 - was 21.90 (44.7 fps) - MISSES, needs 3.9 ms
cruise: 15.90 ms p50 but 57.6 fps delivered and 26.3% of frames over 16.7 at 1280x720 @ ratio 1.0
corner: 12.90 ms p50, 80.8 fps, 4.2% over 16.7 at 1280x720 @ ratio 1.0 - PASSES 60 fps sustained
Retina (dpr 2, same 1280x720 buffer): city 25.70 -> 20.70 ms, corner 15.80 -> 12.90, night-wet 37.80 -> 27.70
HUD backing store was 2560x1440 over a 1280x720 frame: 6.10 -> 1.90 ms, kill-control exact
first 700 ms of play: 40-43 frames in 12 of 12 cold boots, max 33.9-48.2 ms (was 21-31 with a 171-330 ms hitch in 7 of 7)
visual gate: 5 presets identical, daytime-downtown inside its own noise floor, wet-night-asphalt 0.75% of px (night shadow 1024, read at 3x)
```
