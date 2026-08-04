# wave-s/perf-critic-r3 — independent audit of the round-3 60 fps claim

I am the round-3 performance critic. I edit no game code. This file was opened before any
measurement was taken and appended as the work happened.

## 0. Machine state, stated up front

**I RAN ALONE.** Checked with `ps aux` and `uptime` before starting and re-checked between phases.

- At start: `up 14 days`, load average `2.52 / 2.64 / 3.08`. **No headless chromium, no playwright,
  no peer measurement process.** The only node processes are long-lived editor/LSP/dev-server
  residents (`tools/serve.mjs`, a vite, two tsservers, esbuild --ping) all at 0.0-0.1% CPU, plus
  four idle `nvim` instances. Same resident population perf-critic-r2 measured against, so my
  BEFORE/AFTER comparison is like for like.
- Re-checks are recorded at the head of each measurement section.

## 0b. Trees, and why two are enough this time

- **BEFORE = `b72de30`** — the parent of the claim (handling-r3-critic). This is the tree the
  builder's own BEFORE table is supposed to describe.
- **AFTER = `197d70a`** — the claim, and it is HEAD.

Both checked out as clean `git worktree`s under `/tmp`. `game/music/*.mp3` is UNTRACKED in this
repo, so a bare worktree 404s the soundtrack; I copied `game/music/` into both worktrees so the
two trees differ by the commit and nothing else. `diff -r game /tmp/pc3-after/game` is empty.

## 0c. My instrument, `tools/_pc3.mjs` — mine, not the builder's

- The frame ring is installed in `addInitScript`, i.e. before any page script runs, and lives for
  the whole life of the document. `window.__frameStats` is read as well and both p50s are printed
  on every run.
- `gl.drawingBufferWidth/Height` is read off the DRIVER at the END of every window, together with
  `renderer.getPixelRatio()`, `devicePixelRatio`, `resScale`, `isPaused()`, the sun's live
  `shadow.mapSize`, `shadowMap.enabled/autoUpdate`, the sky mesh's live `renderOrder`/`depthTest`
  and every `<canvas>` element's backing-store size. **The run throws rather than prints if the
  buffer is not 1280x720 at ratio 1.**
- Metres driven inside the measurement window are printed per run.
- Sub-3.5 ms rAF deltas are merged into their predecessor before percentiles, delivered fps and
  share-over-16.7 are derived (perf-critic-r2 section 1d: `--disable-frame-rate-limit` issues a
  catch-up BeginFrame that is not a presented frame).
- The scenario table is copied verbatim from `tools/fps.mjs:85-121`.

(sections appended below as the work happened)

---

## 1. IS THE BAR MET, PER SCENARIO? Re-derived from scratch on both trees

Re-checked before this phase: no chromium, no playwright, load `2.52 -> 3.31`. 3 runs per cell,
fresh page and cold boot each. **Every row: `gl.drawingBufferWidth/Height 1280x720`,
`renderer.getPixelRatio() 1`, `devicePixelRatio 1`, `resScale 1`, `isPaused() false`**, read off
the driver at the END of each 8 s window, and the run throws if any of them is wrong.
Metres driven inside every window: **392-675 m** (a parked car reads 0). My ring and
`window.__frameStats` agreed to **every digit** on all 30 runs.

| scenario | BEFORE `b72de30` p50 / delivered fps / % > 16.7 ms | AFTER `197d70a` p50 / fps / % > 16.7 | AFTER p99 | **SUSTAINED 60 fps?** |
|---|---|---|---|---|
| corner | 13.10 / 79.1 / 3.8% | **12.90 / 81.2 / 3.1%** | 32.5 | **YES** |
| cruise | 16.10 / 58.9 / 28.8% | 15.90 / 60.0 / **23.3%** | 36.4 | **NO** |
| city | 22.00 / 44.0 / 96.2% | 21.20 / 44.9 / 93.3% | 38.3 | no |
| boost | 23.30 / 42.7 / 95.6% | 23.20 / 43.0 / 96.8% | 40.1 | no |
| night-wet | 33.30 / 29.5 / 99.6% | **27.00 / 36.6 / 99.7%** | 44.9 | no |

Run-to-run spread, AFTER: corner 12.90-13.00, cruise 15.80-16.10, city 20.80-21.30,
boost 22.80-23.20, night-wet 27.00-27.60. So **night-wet (-6.30 ms, -18.9%) and city (-0.80) are
outside the spread; corner and cruise (-0.20) are at its edge; boost (-0.10) is inside it.**

**My BEFORE reproduces the builder's BEFORE to 0.1 ms on 5 of 5** (they published 13.10 / 16.00 /
21.90 / 23.20 / 33.30; I measure 13.10 / 16.10 / 22.00 / 23.30 / 33.30). Their AFTER reproduces to
0.6 ms or better on 5 of 5. **Nothing in this commit's headline table is inflated.**

**`cruise` delivers exactly 60.0 frames per second and I still refuse to call it 60 fps sustained**:
23.3% of its frames are over 16.7 ms, because its distribution is bimodal (a mode near 15 ms and a
second population at 31-36 ms). The builder says the same thing in its own misses list.

### 1b. THE MACHINE IT IS ACTUALLY PLAYED ON — `deviceScaleFactor 2`, GL buffer still asserted 1280x720 ratio 1

2 runs per cell. This is the one place the commit is transformative rather than incremental.

| scenario | BEFORE p50 / fps / % > 16.7 | AFTER p50 / fps / % > 16.7 | change |
|---|---|---|---|
| corner | 15.90 / 57.9 / 36.9% | **12.80 / 81.3 / 4.7%** | **-19.5%** |
| city | 25.50 / 39.9 / 95.3% | 21.00 / 44.9 / 90.0% | -17.6% |
| night-wet | 36.40 / 27.1 / 100.0% | 27.40 / 36.5 / 99.7% | -24.7% |

**On a Retina display, `corner` did not pass the bar before this commit and does now** (57.9 -> 81.3
delivered fps, 36.9% -> 4.7% long frames). The builder's dsf-2 table is confirmed in shape and
magnitude on every cell I re-measured.

## 2. IS THE COLD-BOOT HITCH GONE? YES — 0 of 11 boots, and I overturn the DIAGNOSIS of cause 1

Instrument: `tools/_perfcritic-r2-first.mjs` **unmodified, the round-2 critic's own file**, plus my
own `tools/_pc3first.mjs`, which adds a `longtask` PerformanceObserver and two kill-controls.

| tree / configuration | boots | frames in first 700 ms after `__ready` | worst delta | hitched (>100 ms) |
|---|---|---|---|---|
| BEFORE, r2's tool | 5 | 24, 31, 31, 31, 30 | 170.2-306.0 | **5 of 5** |
| BEFORE, my tool | 4 | 19, 32, 32, 28 | 174.6-325.4 | **4 of 4** |
| **AFTER, r2's tool** | 6 | 41, 39, 43, 43, 43, 43 | 33.6-55.2 | **0 of 6** |
| **AFTER, my tool** | 5 | 41, 43, 43, 44, 40 | 34.0-37.3 | **0 of 5** |

**The regression is closed: 9 of 9 before, 0 of 11 after.** Cost: `__ready` moves from 2240-2827 ms
to 2351-3179 ms, i.e. **+250 to +350 ms of boot bar**, which is what the builder declared (~290).

### 2a. Kill-controls on the two claimed causes — cause 2 is the whole hitch, cause 1 is not

- **BEFORE + `audio.start` stubbed after `__ready` and before the first key: 0 of 4 boots hitch**
  (frames 37-42, worst delta 67.6-84.8 ms). Frame 2's 67-85 ms upload cost remains; the 170-306 ms
  frame 3 is *gone*.
- **AFTER + `#audiowarm=0` (residency warm only, no audio prewarm): 1 of 4 boots hitch** (181.5 ms,
  with a 161 ms longtask on it). That is exactly the 3-of-4 result the builder honestly declared in
  its process miss.

**And the longtask evidence refutes the builder's mechanism for cause 1.** Their profile says frame
3 is *"310 ms of wall with 10 ms of CPU in it... NO CPU IN IT AT ALL"*, and attributes it to the
compositor blocking on queued uploads. My observer, on the unmodified BEFORE tree, records **a
main-thread longtask of 162, 163, 205 and 308 ms starting exactly at the hitch** in 4 of 4 boots:

```
run 1: __ready 2827   deltas 3.9, 85.0, 325.4, 7.0, ...   longtasks [[2827.4, 93], [2920.4, 308]]
run 3: __ready 2267   deltas 3.9, 67.1, 175.5, 10.1, ...  longtasks [[2267.7, 74], [2342.4, 163]]
```

The main thread was **busy**, not idle, and stubbing `audio.start` removes it. So: the 174-306 ms
hitch was **one cause, the AudioContext build on the first keydown** — which the builder found,
named with `long-animation-frame` and fixed. The residency warm is a real but much smaller fix
(the 67-85 ms frame 2, which it does remove: `__warmStats.geos` is 113 on every boot) and its
"the compositor blocks for 300 ms" story should not be carried forward.

`__warmStats` as shipped, measured over 14 boots: `{progs: 2, geos: 113, texs: 3, ms: 47.8-51.1}`.
The report claims `{progs: 8, geos: 113, texs: 3, ms: 66-103}` — **geometries and textures exact,
programs and milliseconds overstated by 4x and ~2x.** `__audioWarmMs` 158.7-286.5.

## 3. ARE THE CLAIMED MECHANISMS REAL? Four kill-controls, all inside one page

### 3a. Night's 1024 shadow map IS the entire night-wet win — confirmed exactly

`--kill shadow-4096` on the AFTER tree puts the sun's map back to 4096 at runtime and changes
nothing else:

| night-wet, AFTER tree | p50 | delivered fps | p99 |
|---|---|---|---|
| as shipped (1024 at night) | **27.00** (27.00-27.60) | 36.6 | 44.9 |
| `--kill shadow-4096` | **33.30** (32.90-33.30) | 29.5 | 53.6 |
| BEFORE tree, unmodified | **33.30** (33.30-33.40) | 29.5 | 54.7 |

The kill-control lands **on** the BEFORE value to two decimals. The mechanism and the number are
both the builder's. Verified live: `sky.sun.shadow.mapSize` reads `1024x1024` at night and
`4096x4096` in the city on the AFTER tree, so day/dusk/dawn are untouched and perf-r2's refusal
stands.

### 3b. The sky reorder IS the entire city win — confirmed, at 0.80 ms rather than 1.00

`--kill sky-old` restores `renderOrder = -1000` and `depthTest = false` at runtime:

| city | p50 | fps | % > 16.7 |
|---|---|---|---|
| AFTER as shipped (`renderOrder 1000`, `depthTest true`) | **21.20** | 44.9 | 93.3% |
| AFTER `--kill sky-old` | **22.00** | 43.9 | 96.6% |
| BEFORE tree, unmodified | **22.00** | 44.0 | 96.2% |

Again the kill-control lands exactly on the BEFORE value. **-0.80 ms** against the claimed -1.00,
inside the difference between our harnesses. The per-preset choice is real in the shipped code:
at night my probe reads `renderOrder -1000, depthTest false`; in the city `1000 / true`.

### 3c. The HUD's backing store WAS the entire Retina tax — confirmed, and it costs MORE than claimed

`canvases` read out of the live DOM per run, and this is the whole claim in one line:
**BEFORE at `deviceScaleFactor 2` prints `1280x720 2560x1440`; AFTER prints `1280x720 1280x720`.**

city p50, 2 runs per cell:

| | dpr 1 | dpr 1, HUD hidden | dpr 2 | dpr 2, HUD hidden |
|---|---|---|---|---|
| BEFORE | 22.00 | 19.50 | **25.50** | 20.00 |
| AFTER | 21.20 | 17.80 | **21.00** | 17.70 |

- **With the HUD visible, `dpr 2` cost the BEFORE tree +3.50 ms and costs the AFTER tree -0.20 ms.**
- **With the HUD hidden, `dpr 2` costs +0.50 ms (BEFORE) and -0.10 ms (AFTER)** — nil either way.
- Therefore the entire Retina penalty was the HUD's 2560x1440 backing store. **CONFIRMED.**

One correction, and it makes the routed item bigger, not smaller: the HUD's *total* cost on the
shipped tree is **3.40 ms** in the city at dpr 1 (21.20 -> 17.80) and **2.40 ms** on cruise
(15.90 -> 13.50), not the 1.90 ms the report quotes.

### 3d. The one-raster-per-frame shadow gate is worth 0.00 ms — the builder's declared MISS is right

`--kill shadow-multi` sets `renderer.shadowMap.autoUpdate = true` at runtime, i.e. back to three's
per-render behaviour (2 rasters/frame in the city, 3 at night+wet by the builder's count):

| scenario | gate ON (shipped) | gate OFF (`autoUpdate = true`) |
|---|---|---|
| city | 21.20 | **21.00** |
| night-wet | 27.00 | **27.70** |

Both inside the spread, and city is nominally *faster* without the gate. **0.00 ms, exactly as the
builder declared.** It is kept as strictly-less-GPU-work; it must never be quoted as a win. See 5c
for the one behavioural note attached to it.

## 4. DID ANY SCENE GET WORSE TO LOOK AT? NO. The veto does not fire

All seven presets rendered at 1280x720 from each worktree with each worktree's own `tools/shot.mjs`,
compared per pixel, **and my own same-build noise floor measured first on four of them.**

| preset | BEFORE vs AFTER: maxDiff / mean / % px > 2/255 | my same-build noise floor | read |
|---|---|---|---|
| boost-blur | 1 / 0.0000 / 0.0000% | — | identical |
| car-paint-closeup | 1 / 0.0000 / 0.0000% | — | identical |
| crash-cam | 2 / 0.0000 / 0.0000% | — | identical |
| dusk-highway-chase | 3 / 0.0001 / 0.0002% | 2-3 / 0.0000-0.0001 / 0.0000-0.0001% | noise |
| daytime-downtown | 15 / 0.0003 / 0.0018% | **13 / 0.0002 / 0.0018%** | noise |
| hud-overlay | 31 / 0.0002 / 0.0013% | **31 / 0.0002 / 0.0013%** | noise, identically |
| **wet-night-asphalt** | **37 / 0.1700 / 0.7489%** | 4 (BEFORE) / 17 (AFTER) / <=0.0003% | **REAL** |

- **dusk-highway-chase is the important null result.** It is a dusk preset, so the sky reorder IS
  active in it, and it is the preset with the most visible sky. It is identical to its own noise
  floor. Together with daytime-downtown that is the reorder's pixel-neutrality measured, not argued.
- **hud-overlay's `maxDiff 31` is not a regression**: its BEFORE-vs-BEFORE floor on this machine is
  *the same 31 / 0.0002 / 0.0013%*, and the 16x9 grid is 0.00 in 142 of 144 cells (0.01 and 0.02 in
  two). The builder quoted `maxDiff 2` here; on my machine this preset simply has a noisier floor.
- **wet-night-asphalt moved, and my numbers reproduce the builder's to four decimals**
  (37 / 0.1700 / 0.7489%). It is the night 1024 shadow map, which is the only pixel-moving change
  in the commit. **I opened it.**
  - Both full frames at 1:1 (`shots/pc3/B-wet-night-asphalt.png`, `A-...`): same buildings, same
    lamp falloff, same wet reflections, same car, no shadow missing or displaced.
  - The 16x9 grid localises the difference to the lit right-hand facades (0.27-0.86) and one
    hotspot at the FAIRMONT GARAGE sign (1.47). I cropped both at 3x and 4x
    (`shots/pcr3/crop-{B,A}-facade.png`, `crop-{B,A}-hot.png`) and read them side by side:
    same mullion piers, same per-floor cornices, same sill shadows, same sign lettering and awning
    edge. **Nothing reads flatter, nothing detached from the ground.**
  - (`shots/` is gitignored in this repo, so the PNGs below are on disk beside the tree, not in the commit.)
  - The 12x amplified difference (`shots/pcr3/amp-wetnight.png`) is a faint diffuse wash over lit
    facades and reflections with **no shadow edge appearing or disappearing** — the signature of
    penumbra resampling, not of lost occlusion.

**NOTHING GOT WORSE. The quality veto does not fire.**

### 4b. The two changes the repo's gate structurally cannot see — I closed one of them

The builder declared both, which is the right behaviour. I checked the one that is checkable:

- **The shadow gate is invisible to `tools/shot.mjs`**, because `renderer.shadowMap.autoUpdate =
  false` is set at `main.js:752` and `shotMode` returns at `main.js:571`. So the whole gate is
  **untested by the screenshot gate**. I therefore took LIVE in-play frames at midday in the city
  on the AFTER tree, gate on and gate off (`tools/_pc3live.mjs`, `shots/pcr3/live-gate-{on,off}.png`,
  0 console errors both). The per-pixel number is useless here and I say so: the same-configuration
  noise floor of a live frame is `maxDiff 142 / mean 3.45 / 35.1% of pixels` (traffic, motion blur,
  animated sky) against `143 / 4.14 / 40.5%` for gate-on vs gate-off. **So the test is the eye**, and
  the eye says: the long building shadow across the carriageway, the kerb shadows, the sign shadows
  and **the moving car's own shadow** are all present, in the same places, with the same softness.
  Lossless in play.
- **The HUD backing store only differs at `deviceScaleFactor 2`**, which `shot.mjs` never uses. Not
  closable with a screenshot; it is a resolution reduction of an overlay to exactly the frame's own
  resolution, and the DOM canvas sizes are printed above.

## 5. FINDINGS THE BUILDER DID NOT REPORT, OR REPORTED DIFFERENTLY

### 5a. The prewarmed AudioContext is NOT suspended on this machine. It is silent for the other reason

The builder declared the moved invariant loudly, which is exactly right, and gave two reasons the
prewarmed graph is silent. I patched `AudioNode.prototype.connect` before any page script (the
menu critic's technique) and booted the **START-menu path with no gesture at all**:

```
AFTER  tree, before any gesture: connectionsToDestination 1 (WaveShaperNode)  audio.info().running false  ctx.state "running"   __audioWarmMs 283.1
BEFORE tree, before any gesture: connectionsToDestination 0                    audio.info().running false  ctx.state "closed"
```

- The declaration is **correct**: one node reaches the destination before the gesture where zero did.
- But **`ctx.state` is `running`, not `suspended`** — headless chromium does not suspend it — so the
  first of the two stated reasons for silence does not hold here. Silence rests entirely on the
  second one, which I verified as a constant: **`master = mkGain(0.0)` at `game/audio.js:376`**
  (the comment says `:374`), ramped up only by `start()` (`:1415-1417`).
- Consequence worth one line for whoever owns audio next: on this configuration the graph — five
  buses and a convolution reverb — is **rendered by the audio thread from boot** instead of from the
  gesture. It is silent, but it is not free, and `#audiowarm=0` is the escape hatch.

### 5b. Rule 5: every constant is real; the line numbers in the report have drifted a few lines

I verified each claimed change against the live file rather than the prose. All present and all with
the claimed values: `game/sky.js:1530` `depthTest: false -> true`; `sky.js:1533` `renderOrder -1000
-> 1000` with the per-preset choice at `:1626-1628` (`const skyLate = !p.night`); `game/hud.js:151`
`clamp(dpr, 1, 3) -> clamp(dpr, 1, max(1, maxPixelRatio))` with `maxPixelRatio = 1` defaulted at
`:87`; `game/main.js:182-183` `#hudres` 1..3 default 1; `main.js:529-543` `4096` fixed ->
`todName === 'night' ? 1024 : 4096` with `#shadow` still overriding, called from `applyTimeOfDay` at
`:321`; `main.js:752-753` and `:760` the `autoUpdate = false` / per-frame `needsUpdate`;
`main.js:932-946` the audio prewarm + `tick(0.001)` + `composer.render()` + `gl.finish()`;
`game/audio.js:1401` `prewarm()` and `:55` the no-op shim. **The cited line numbers are off by 2-120
lines in six places** (`sky.js:1529`, `hud.js:123`, `main.js:680/:714/:813`, `audio.js:1368`). No
constant is misdescribed, so this is not a rule-5 failure — but a critic grepping the quoted lines
finds comments instead of code, and that costs time.

### 5c. A one-frame-stale shadow map on cube-probe frames, which nobody has stated

`renderer.shadowMap.needsUpdate = true` is armed at the top of `frame()` (`main.js:760`), but the
sun is repositioned inside `tick()` at `main.js:443-444` (`sky.update` then `reassertKeyDir`), and
`car.js`'s cube-probe bake calls `renderer.render()` *earlier* in `tick()`. On a bake frame the map
is therefore rasterised from the previous frame's sun/box and reused for the visible pass. At
~40 m/s and one bake per ~180 frames that is a sub-metre box offset on one frame in 180; I could not
see it in the live check and it is not a defect. It is worth knowing before anyone builds the
two-tier shadow cache, because that scheme makes the ordering load-bearing.

### 5d. Boot check, because `lint ok` does not mean runnable

Nine configurations on the AFTER tree — `#nomenu=1` at dpr 1 and dpr 2, the real START-menu click
path, `#hudres=2`, `#shadow=2048`, `#shadow=0`, `#audiowarm=0`, `#msaa=4`, `#res=0.7` — each driven
through all four times of day with wet 1/0, a resolution-scale change and a pause/resume, plus the
30 measurement boots and the 15 first-second boots: **0 console errors and 0 page errors on every
one.** `#shadow=2048` correctly overrides the night default (reads 2048 after `applyTimeOfDay
('night')`), and `#shadow=0` disables the map.

`tools/_joins.mjs` still verifies all three of the driver's joins on HEAD: 6 near-miss events over
0.86 km (6.98/km) taking boost `0 -> 0.2525`, `crash` fired from `drainWreck` (`crashActive true`),
drawn nose delta `0.0000`, `renderSize 1280x720 ratio 1`, `errors []`.

## 6. THE CHEAT LIST, worked one item at a time

- **resolution scale silently below 1** — no. `resScale 1`, `gl.drawingBufferWidth 1280`,
  `gl.drawingBufferHeight 720` read off the driver at the end of all 44 measurement windows, and my
  harness throws rather than prints if they differ.
- **pixel ratio moved** — no. `renderer.getPixelRatio()` 1 on every window, including the dpr-2
  runs, which is the whole point of the dpr-2 table.
- **the `#shadow` knob used to flatter the default** — no, and this is the one to watch this round.
  The DAY default is still 4096 (`sky.sun.shadow.mapSize 4096x4096` live in city/cruise/boost/corner
  windows). Only `night` is 1024, it is declared, and it is the change that moves pixels.
- **`#hudres` used to flatter the default** — the default *is* the fast path this time, so the
  question is whether quality was taken. At the wave's own measurement contract (dpr 1) the HUD's
  backing store is 1280x720 **before and after** — identical. The change only bites at dpr 2, where
  it makes the overlay exactly as crisp as the frame instead of 4x it.
- **measured while paused or on the menu** — no. `isPaused() false` asserted on every window.
- **the car is not moving** — no. 392-675 m per 8 s window at 42-96 km/h.
- **the world not loaded / a scene simplified** — no. 186-239 programs live and the night-wet
  windows carry the full wet city.
- **a percentile improved by shortening the window** — no. Fixed 3.5 s warm + 8 s window on both
  trees, and the first playable second is measured separately in section 2, where the AFTER is the
  better one.
- **the instrument counting frames it did not present** — corrected, as in round 2: sub-3.5 ms
  catch-up ticks are merged into their predecessor before fps and share-over-16.7 are derived, and
  the raw/merged counts are printed per run (e.g. city `n 365/400`).
- **the win borrowed from a peer** — not possible: BEFORE is the direct parent commit.
- **two instruments, one of them broken** — my ring and `__frameStats` agree to every digit on 44
  windows.

## 7. VERDICT

VERDICT: PARTIAL

This is the strongest of the three perf rounds on every axis I can test.

**1. Is the bar met, per scenario?** At `gl.drawingBufferWidth/Height 1280x720`,
`pixelRatio 1`, `devicePixelRatio 1`, `resScale 1`:

| scenario | p50 | delivered fps | % of frames > 16.7 ms | 60 fps SUSTAINED? |
|---|---|---|---|---|
| corner | 12.90 | 81.2 | 3.1% | **YES** |
| cruise | 15.90 | 60.0 | 23.3% | **NO** |
| city | 21.20 | 44.9 | 93.3% | no |
| boost | 23.20 | 43.0 | 96.8% | no |
| night-wet | 27.00 | 36.6 | 99.7% | no |

**2. Is the 174-300 ms cold-boot hitch gone?** **YES.** 9 of 9 boots hitch on the parent commit
(170-325 ms), **0 of 11 on HEAD**, measured with the round-2 critic's own unmodified instrument and
again with mine. Frames in the first 700 ms of play: 19-32 -> 39-44. Paid for with +250-350 ms of
boot bar.

**3. Are the claimed mechanisms real?** Three of four, exactly; the fourth was declared a miss by
the builder and is one. Every one settled by a runtime kill-control that lands on the BEFORE value:
night 1024 = the whole night-wet win; the sky reorder = the whole city win (0.80 ms, not 1.00); the
HUD's 2560x1440 backing store = the whole Retina tax (and the HUD costs 3.40 ms, not 1.90). **One
diagnosis is overturned:** the 174-306 ms hitch was *not* a GPU-residency stall with "no CPU in it"
— a 162-308 ms main-thread longtask sits exactly on it in 4 of 4 boots, and stubbing `audio.start`
alone removes it in 4 of 4. The residency warm is worth the 67-85 ms second frame, not the hitch.

**4. Did any scene get worse to look at?** **NO.** Six presets are at or inside a noise floor I
measured myself; wet-night-asphalt moved for real (37 / 0.1700 / 0.75% against <=0.0003%) and at 3x
and 4x on the two worst cells it is not worse. Day, dusk and dawn keep the 4096 map. **The veto does
not fire.**

Why PARTIAL and not PASS: the bar itself is met on one scenario of five. Why not FAIL, and why this
round should be read as a success: the regression round 2 introduced is closed and shown closed
against the same instrument, every headline number reproduces on an independent harness, all three
shipped mechanisms survive kill-control, the honest misses are all genuinely misses (I re-measured
the shadow gate and it is 0.00 ms as declared), the moved audio invariant was declared before I
could find it, and no scene got worse.

## 8. THE ONE PLAIN STATEMENT

**60 fps sustained during normal driving at 1280x720 real pixels is PARTIALLY MET.**
Met on **`corner`** (12.90 ms p50, **81.2 delivered fps**, 3.1% of frames over 16.7 ms) — and now
met there on a Retina display too, which it was not before this commit (57.9 -> 81.3 fps).
**NOT met on `cruise`** (15.90 ms p50 but 60.0 fps with 23.3% of frames long), **`city`** (44.9 fps),
**`boost`** (43.0 fps) or **`night-wet`** (36.6 fps).

**THE SINGLE NEXT ACTION: draw the HUD inside the WebGL frame.** It is the builder's own top routed
item and my measurements make it larger and sharper than theirs. Measured on HEAD at dpr 1 with
`--kill hud-off`, 2 runs each:

| scenario | HUD as shipped | HUD hidden | change |
|---|---|---|---|
| **cruise** | 15.90 ms / 60.0 fps / **23.3% long** | **13.50 ms / 75.3 fps / 3.0% long** | **-2.40 ms, and the bar is MET** |
| city | 21.20 / 44.9 | 17.80 / 48.5 | -3.40 ms |

A full-screen 2-D canvas composited over the WebGL canvas every frame costs 2.4-3.4 ms; only 0.4 ms
of that is the drawing (the builder measured the redraw rate limit and correctly refused it). As a
texture drawn by a composer pass the compositor has one layer instead of two. **That one change
takes `cruise` from 23.3% long frames to 3.0% — i.e. from failing the bar to passing it — and it is
lossless, and `hud-overlay` is a real gate for it.** After that, the sun's depth map (two-tier
static/dynamic cache) is the only item left that is worth more than a millisecond in the city and at
night.

```progress-metrics
corner: 12.90 ms p50, 81.2 delivered fps, 3.1% over 16.7 ms at 1280x720 ratio 1 dpr 1 - the only scenario that SUSTAINS 60 fps
cruise: 15.90 ms p50 but 60.0 fps and 23.3% of frames over 16.7 ms at 1280x720 ratio 1 - NOT sustained
city / boost / night-wet: 21.20 / 23.20 / 27.00 ms p50 = 44.9 / 43.0 / 36.6 fps at 1280x720 ratio 1
night-wet: 33.30 -> 27.00 ms (-18.9%), and --kill shadow-4096 returns it to 33.30 - the whole win is night's 1024 shadow map
Retina (dpr 2, GL buffer still 1280x720 ratio 1): corner 15.90 -> 12.80 ms, 57.9 -> 81.3 fps - corner passes the bar there for the first time
cold-boot hitch: 0 of 11 boots on HEAD, 9 of 9 on the parent (170-325 ms); cause is audio.start() on the first keydown, killed 4/4
HUD cost on HEAD at dpr 1: 2.40 ms on cruise (15.90 -> 13.50, 23.3% -> 3.0% long) and 3.40 ms in the city - the next action
visual regression gate: 6 presets inside my own noise floor; wet-night-asphalt maxDiff 37 / 0.75% of px, read at 3x, not worse
```
