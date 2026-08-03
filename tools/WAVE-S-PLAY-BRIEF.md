# WAVE S — THE PLAY BRIEF. Read this whole file before you touch anything.

This wave is a HARD PIVOT. Every previous wave (K through R) judged this project by comparing
still frames against `reference/` photographs. **That is over.** The visual bar is MET and
`reference/` plus every pixel metric is now a **REGRESSION GATE, not a target**.

## THE TWO RULES THAT REPLACE EVERYTHING

1. **You may not make any scene look worse.** If your change moves a rendered frame, say so and
   show it is not a regression. If it does not touch rendering, say that instead.
2. **You may not spend one minute making a scene look better.** No new visual targets, no critic
   sweeps against stills, no chasing a photograph. If you find yourself measuring `hfRms`, you are
   in the wrong wave.

The bar is now **how it plays**, and it has two halves:

- **60 fps sustained at 1280x720 REAL pixels.** Measured, never estimated.
- **Handling that feels like Burnout Paradise**, matched to researched numbers.

## THE 720p MEASUREMENT CONTRACT. THIS IS NOT NEGOTIABLE.

This is a Retina machine where `devicePixelRatio` is 2. A 1280x720 canvas at ratio 2 is secretly
2560x1440 — four times the pixels — and every frame-rate number taken from it is a lie by that
factor. `main.js` now caps the renderer's pixel ratio to `resScale` (default **1.0**, never above
it) and the canvas CSS upscales the result to fill the window.

**State the render size and the pixel ratio beside EVERY frame-time measurement you report.**
`ctx.renderSize()` returns `{w, h, cssW, cssH, pixelRatio, devicePixelRatio}` — quote it verbatim.
A measurement without those numbers attached is not a measurement and will be rejected.

## THE MEASURED BASELINE, taken before this wave started work

Headless chromium, ANGLE/Metal, `--disable-frame-rate-limit`, viewport 1280x720,
`deviceScaleFactor: 1`, so `renderW 1280 / renderH 720 / pixelRatio 1`. Scene
`dusk-highway-chase` on the playable path (`#nomenu=1`), throttle held for 6 s, 146 frames:

| statistic | value |
|---|---|
| mean | 49.65 ms (20.1 fps) |
| p50 | **41.20 ms (24.3 fps)** |
| p90 | 77.80 ms |
| p99 | **399.70 ms** |
| max | 845.8 ms |
| frames over 16.7 ms | 82.9% |

**60 fps means p50 <= 16.7 ms. That is a 2.5x speedup, and the p99 says there are also multi-hundred-
millisecond stalls that a p50 fix will not touch.** Treat the two as separate defects.

## FRAME-TIME MEASUREMENT IS NOT VALID WHILE PEER AGENTS ARE RUNNING

Every other measurement in this project's history could tolerate concurrency because it was
deterministic pixels. **Frame time cannot.** A peer agent compiling shaders or rendering a
screenshot steals GPU and CPU from your measurement window and there is no way to detect it after
the fact.

- If you are told **"you are running concurrently"**: do not report a frame-time number as a result.
  You may take them as smoke tests and must label them as such.
- If you are told **"you are running alone"**: you own the machine. Say so in your verdict, and
  take every measurement three times to show the spread.

## THE INSTRUMENT

`main.js` exposes `window.__frameStats` on the playable path:

- `reset()` — clear the window. Call this AFTER the scene is warm and before you measure.
- `stats()` — `{n, mean, p50, p90, p99, max, fpsMean, fpsP50, fpsP99, over16_7pct, renderW,
  renderH, pixelRatio, devicePixelRatio, resScale}`.

It rings **rAF-callback to rAF-callback wall-clock deltas**. That is the honest quantity: it
includes compositing and any main-thread work outside our own render call. **Do not replace it with
a `performance.now()` bracket around `composer.render()`** — GPU work is pipelined, so that bracket
routinely reads 4 ms on a build that is visibly dropping frames. This project has been burned four
separate times by a metric that could be satisfied without the thing it claimed to measure
(`STATE.md`, permanent rule 3); a CPU-side render bracket is exactly that failure again.

## RUNTIME KNOBS THAT NOW EXIST — use them, do not rebuild them

On `window.__game` (the `ctx` object):

- `applyTimeOfDay('dawn'|'midday'|'dusk'|'night')` — full plumbing, in the right order
  (sky preset, night window sets, car lights, bloom, key:fill, traffic lights).
- `applyWet(0..1)`, `getWet()`
- `setResScale(0.4..1)`, `getResScale()`, `renderSize()`
- `setPaused(bool)`, `isPaused()`
- `frameStats`
- `traffic` — the live traffic module (`game/traffic.js`)
- `menu` — the start/pause menu (`game/menu.js`)

URL hash params: `#nomenu=1` skips the start menu (this is what a harness should use so a
measurement never depends on a click), `#res=<n>` sets the initial resolution scale,
`#shot=1&scene=<id>` is the unchanged deterministic screenshot path.

## PROCESS RULES CARRIED FORWARD FROM WAVES P/Q/R. Each was paid for in a lost round.

1. **VERDICT-FIRST.** `verdicts/wave-s/<piece>.md` is the FIRST file you write, before you edit any
   code, and you append to it as you work. Rounds 13 and 14 of this project both left real edits
   with zero verdicts; the loss was never the edits, it was that no record existed of what any edit
   was *for*.
2. **CHECK THE TREE BEFORE YOU TRUST IT.** `git status` and `git diff` your own files first. A
   crashed builder can leave unmeasured edits behind, and this has already shipped one silent
   regression and one fatal crash. An unmeasured edit nobody can justify gets reverted, never
   inherited silently.
3. **OWN YOUR FILES AND ONLY YOUR FILES.** Your brief names them. If the fix belongs in someone
   else's file, write that down as a routed finding and stop. Do not reach across.
4. **`lint ok` DOES NOT MEAN RUNNABLE.** `bash tools/lint.sh` catches syntax only. Round 13 shipped
   a `WebAudio` argument of exactly 0 that lints clean and throws at runtime, and it deadlocked a
   builder for 19 minutes at 0% CPU. **Always boot the page and check for console errors.**
5. **RULE 5: DO NOT TRUST A DOCSTRING, VERIFY THE CONSTANT.** Your report is checked against
   `git diff`, not read as prose. A comment claiming a change the code does not make is the worst
   outcome available here. Quote BEFORE and AFTER literal values with `file:line`.
6. **A KILL-CONTROL, NOT AN ARGUMENT.** Before you claim X is the cause, delete X and measure. Seven
   nominated causes in this project turned out to be the wrong object, and every one of them was
   settled by one kill-control render that nobody had run.
7. **NO ONE-SIDED AND NO SELF-ANCHORED TARGETS.** A target of "`>= N`" that the BEFORE state already
   passes is a rubber stamp. A target anchored to our own previous value rather than to a real
   Burnout measurement is not a target.
8. **REPORT HONEST MISSES.** A scored miss stated plainly is worth more here than a pass. Several of
   this project's most valuable results were builders retracting their own wins.
9. **COMMIT ONLY YOUR OWN FILES**, one commit, message `wave-s/<piece>: <one line>`. Never
   `git add -A`.

## THE REGRESSION GATE, concretely

Before and after your change, render the presets your change could possibly touch:

```
node tools/shot.mjs --scene dusk-highway-chase --w 1280 --h 720 --out shots/s/<piece>-A.png
```

Scene ids: `dusk-highway-chase`, `boost-blur`, `crash-cam`, `wet-night-asphalt`,
`daytime-downtown`, `car-paint-closeup`, `hud-overlay`.

Compare with `node tools/_px.mjs` / `tools/_facademeas.mjs` if you want numbers, but the binding
test is simpler: **open both PNGs, look at them, and state whether anything got worse.** If your
change cannot move a pixel (a new tool, a doc), say that and skip this.

## PUT YOUR HEADLINE NUMBERS ON THE BOARD

`progress.html` now has a playability section that shows fps and handling numbers beside each
piece. It reads them out of your own verdict file so they cannot drift away from the evidence.
Include ONE fenced block, anywhere in `verdicts/wave-s/<piece>.md`, with your 3-8 most important
numbers as free-form `key: value` lines:

````
```progress-metrics
p50: 16.2 ms
p99: 24.8 ms
render: 1280x720 @ ratio 1.0
0-100 km/h: 3.4 s (Burnout 3.2-3.6)
```
````

Always fold the measurement conditions into the value itself, as above. A `p50: 16.2 ms` with no
render size next to it is the exact lie this wave exists to prevent. Then run
`node tools/progress.mjs` as your last step so the board picks it up.

## HOW YOU WILL BE JUDGED

A separate critic with fresh context will judge your piece by **PLAYING it** and by measuring frame
time and handling numbers. Not by comparing stills. It will re-derive your headline number from
scratch and it will look for the mechanism, not just the statistic — three builders in wave Q had
correct numbers and overturned mechanisms, and a correct number attached to a wrong cause sends the
next wave at the wrong file.
