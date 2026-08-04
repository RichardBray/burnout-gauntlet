# wave-s/perf-critic — independent audit of the 60 fps claim

I am the performance critic. I edit no game code. Written before any measurement was taken and
appended as the work happened.

## 0. Machine state, stated up front

**I RAN ALONE.** No peer agent was driving this machine while I measured. Checked at the start
(`ps aux`, `uptime`) and re-checked between phases:

- No headless chromium, no playwright, no peer measurement process at the start.
- Background residents that were present and are NOT mine: two `nvim` embeds, an idle
  `vite`/`esbuild` pair and two `tsserver` processes from an unrelated project (`~/lms`), a
  `node tools/serve.mjs` from this repo, Slack's crashpad handler. All at 0.0% CPU in `ps`.
- Load average at start `2.25 / 2.95 / 3.45`. Apple M1, 8 cores, macOS 26.5.2.

This is the same population of idle residents the builder measured against, so the comparison is
like for like. Where a number is close to a decision boundary I say so rather than round it my way.

## 0b. The tree is NOT the commit. Stated before any number.

`git status` at the start of my run:

```
 M game/traffic.js      <- peer edit, UNCOMMITTED
 M PROMPT.md
 M driver.log
?? README.md
?? game/music/
```

`game/traffic.js:60` `const POOL = 56;` -> `const POOL = 22;` is an uncommitted peer edit that
cuts the traffic population by 60%. That is a live confound for a frame-time audit: the working
tree is cheaper than the commit the builder's report describes. I therefore measure BOTH:

- **HEAD (`40d2f1c`) in a clean `git worktree`** — the build the claim is about. Primary.
- **the working tree as it stands** — what a player would actually boot right now. Secondary.

---

(sections appended below as the work happened)

## 1. THE INSTRUMENT AUDIT. It passes, and I checked it the hard way.

`/tmp/critic/instrument.mjs`, headless chromium ANGLE/Metal, viewport 1280x720,
`deviceScaleFactor: 1`, scene `dusk-highway-chase`, `#nomenu=1&res=1.0`, tree = HEAD worktree.

### 1a. The render target really is 1280x720 real pixels

I did not trust `ctx.renderSize()` to report on itself. `renderer.getDrawingBufferSize()` is just
`_width * _pixelRatio` - a number the renderer computes about itself and would keep reporting even
if the allocation had gone elsewhere. I read the driver instead, `gl.drawingBufferWidth` off
`renderer.getContext()`:

```
glDrawingBufferWidth   1280      canvasAttrWidth  1280     cssStyleW  1280px
glDrawingBufferHeight   720      canvasAttrHeight  720     cssStyleH   720px
devicePixelRatio          1      rendererPixelRatio   1    resScale        1
composer renderTarget1  1280x720  samples 0  type HalfFloat (1016)
gl MAX_SAMPLES            4      paused false
```

**The buffer the driver allocated is 1280x720. There is no dpr-2 lie, no hidden 2560x1440, no
`resScale` below 1, and the composer's own post target is the same size** (which is where the
expensive passes actually run, and is a place a cheat could have hidden that a canvas check would
miss). `samples: 0` confirms the shipped chain really is the FXAA path, not MSAA.

I re-read `gl.drawingBufferWidth`/`Height` at the END of every single measurement window in
sections 2-4 as well, not just at boot. Every row reports 1280x720 ratio 1 dpr 1.

### 1b. The frame times are rAF-to-rAF wall clock. Proven, not assumed.

I installed a SECOND rAF ring that I own, in the page, and ran it over the same window as
`window.__frameStats`:

| | n | mean | p50 | p90 | p99 | max | >16.7% |
|---|---|---|---|---|---|---|---|
| `window.__frameStats` | 362 | 16.5854 | 16.20 | 32.70 | 47.50 | 71.70 | 43.92 |
| my independent ring | 362 | 16.5854 | 16.20 | 32.70 | 47.50 | 71.70 | 43.92 |

Identical to every digit, which is the expected result and the point: two rAF callbacks registered
in the same frame receive the same `now`, so two honest rAF rings must agree exactly. **It is not a
`performance.now()` bracket around `composer.render()`** - a bracket would have read ~4 ms here
against my 16.6. `main.js:585-588` pushes `(now - last)` at the TOP of the callback, before any
work, which is the correct place. The instrument is sound.

### 1c. One real defect in the instrument, found and reported

`main.js:550-556`: `ftLongTotal` counts every push over 16.7 ms since `reset()` and is never
decremented, but `stats()` divides it by `a.length`, which saturates at `FT_CAP = 4096`. So
`over16_7pct` is only correct while fewer than 4096 frames have been pushed since the reset. I hit
this deliberately: a window with `n: 4096` reported `over16_7pct: 4.13` when the true figure over
the ring's contents was far higher. Every window in this wave is ~150-600 frames so **no published
number is affected**, but it is a live trap for anyone who lengthens the measure window past ~68 s,
and `>16.7%` is the metric this wave's bar is phrased in. Routed to whoever owns `main.js`.

## 2. RE-MEASURED INDEPENDENTLY. My harness, cold boot per run, five runs.

`/tmp/critic/measure.mjs` - my own file, not `tools/fps.mjs`. Own rAF ring, own scenario placement,
own raw-GL assertion, own proof-of-drive (metres travelled inside the window). Fresh page and a
fresh boot for every run; warm 3.5 s, measure 8 s. Tree = **HEAD `40d2f1c` in a clean worktree**,
which carries `POOL = 56` traffic, i.e. it is HEAVIER than the tree the builder measured.

Headless chromium, `--use-angle=metal --disable-frame-rate-limit`, viewport 1280x720 dsf 1.
**Every row below verified at glDrawingBuffer 1280x720, pixelRatio 1, devicePixelRatio 1,
resScale 1, paused=false.**

| scenario | runs | mean | p50 (5 runs) | p90 | p99 | max | >16.7% | m driven in window | calls | tris |
|---|---|---|---|---|---|---|---|---|---|---|
| corner | 5 | 13.19 | **13.10** (12.90-13.20) | 17.0 | 37.0 | 102.5 | 11.0% | 537-540 | 573 | 0.75 M |
| cruise | 5 | 16.58 | **16.20** (16.10-16.50) | 33.1 | 37.7 | 73.3 | 42.3% | 601-604 | 642 | 0.83 M |
| city | 5 | 22.45 | **22.10** (21.90-22.20) | 28.6 | 44.5 | 58.8 | 93.3% | 400-405 | 2570 | 4.73 M |
| boost | 5 | 23.56 | **23.10** (22.80-23.60) | 29.4 | 64.2 | 109.4 | 90.2% | 651-653 | 763 | 1.06 M |
| night-wet | 5 | 49.40 | **48.30** (47.70-49.20) | 66.7 | 94.4 | 106.6 | 99.3% | 488-494 | 3235 | 5.26 M |

**The builder's headline numbers reproduce.** Against their table: cruise 16.50 -> my 16.20, city
22.53 -> 22.10, corner 13.17 -> 13.10, boost 23.94 -> 23.10, night-wet 49.95 -> 48.30. Every one
inside 4%, all of mine slightly faster despite the extra traffic. Run-to-run spread 0.6-3.5%.
**No number in the builder's report is inflated and none of them is a lie about the buffer size.**

### 2a. The cheat list, worked through one at a time

- **resolution scale silently below 1.0** - no. `resScale 1`, `gl.drawingBufferWidth 1280` read at
  the end of every window.
- **pixel ratio changed somewhere** - no. `renderer.getPixelRatio()` 1 and `devicePixelRatio` 1 at
  the end of every window, and the composer's post target is 1280x720 too.
- **measured while paused or on the start menu** - no. `isPaused()` false in every window, and my
  harness boots `#nomenu=1` so the menu never opens.
- **the harness holds no input so the car never moves** - no, and this is the check that catches a
  fake most cheaply. **The car covers 400-653 m inside each 8 s window** (277 km/h on cruise,
  281 under boost, 81 km/h in the downtown grid, 179 at night in the wet). A parked car would read
  0 m. Slalom `corner` moves 537-542 m with live slip.
- **traffic or world content not spawned during the window** - no. `traffic.reset()` is called at
  placement and the counters show the load arriving: 642 draw calls / 0.83 M tris on the highway
  against **2570 calls / 4.73 M tris downtown and 3235 / 5.26 M at night-wet**. An empty world
  would not produce those.
- **a scene simplified below what the gate allows** - see section 5.
- **the measurement window placed after the stalls** - partly true and it is fair: 3.5 s of warmup
  puts the boot shader compile outside the window. I checked what that hides in section 6.
- **vsync or a frame cap flattering the p50** - see 3, and it turns out to be the interesting one.

