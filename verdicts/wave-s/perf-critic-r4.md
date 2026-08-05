# wave-s/perf-critic-r4 — independent audit of the HUD-in-frame round (`598f8db`)

I am the round-4 performance critic. I edit no game code. This file was opened before any
measurement was taken and appended as the work happened.

## 0. Machine state, stated up front

**I RAN ALONE.** `ps aux` and `uptime` before starting, re-checked between phases.

- At start: `up 14 days, 20:32`, load `1.67 / 2.19 / 2.67`. **No headless chromium, no playwright,
  no peer measurement process.** Resident node processes are this repo's `tools/serve.mjs` (0.0%
  CPU), an unrelated project's vite + `esbuild --ping` + two tsservers, four idle `nvim`, and
  Slack's crashpad handler — the same resident population perf-critic-r2 and -r3 measured against.
  The only `claude` processes are this session's own shells.
- Re-checks are recorded at the head of each measurement section.

## 0b. Trees

- **BEFORE = `aaa8062`** (`wave-s/state`), the ACTUAL parent of the claim, as a clean `git worktree`
  under `/tmp/pc4-before`. `game/music/*.mp3` is tracked now, so no hand-copying.
  `diff -rq game /tmp/pc4-before/game` differs in **`hud.js` and `main.js` only** — exactly the two
  files the builder declares, and nothing else in `game/` moved.
- **AFTER = `598f8db`**, the claim, and HEAD.

**One process note on the builder's BEFORE.** Its verdict opens with "HEAD `bcf52b5`" and takes its
cross-tree BEFORE there, but `598f8db^` is `aaa8062`; the driver landed `1d53042` and `aaa8062`
during the round. The two intervening commits are a `physics.js` **comment** correction plus
`STATE.md` / `progress.json` / `tools/progress.mjs`, so nothing executable differs and the
comparison is still like-for-like — but the tree the builder measured is not the tree its commit
sits on, and it should have said so.

## 0c. My instrument, `tools/_pc4.mjs` — mine, not the builder's

Derived from `tools/_pc3.mjs` (round 3's critic), which I left unmodified.

- The frame ring is MINE, installed in `addInitScript` before any page script runs. `__frameStats`
  is read too and both p50s print on every run. **They agreed to every digit on all 43 windows.**
- `gl.drawingBufferWidth/Height` read off the DRIVER at the END of every window, with
  `renderer.getPixelRatio()`, `devicePixelRatio`, `getResScale()` and `isPaused()`. **The run
  THROWS rather than prints if the buffer is not 1280x720 at ratio 1 with `resScale` exactly 1.**
- `--want in|dom` asserts the live HUD route from `hudPath()` **and** from
  `hud.canvas.parentNode`, and throws rather than printing a number for the wrong route.
- Metres driven per window printed; sub-3.5 ms rAF deltas merged into their predecessor before
  percentiles, delivered fps and share-over-16.7 (perf-critic-r2 1d).
- Scenario table copied verbatim from `tools/fps.mjs:85-121`.
- **The cell neither previous round had, and the one this audit turns on: `--kill hud-cheapdraw`.**
  The builder's refutation rests on "layer present but NOT REDRAWN costs 0.00 ms", which cannot
  distinguish *compositing a dirty full-screen layer is free* from *Chrome skips a layer whose
  pixels never change*. `hud-cheapdraw` keeps the canvas in the document and **dirties it every
  frame** (one `clearRect` plus one moving 40 px `fillRect`) with the expensive HUD drawing gone.
  That is the missing control on the missing control.

(sections appended below as the work happened)

---

## 1. DID THE CHANGE BUY MILLISECONDS? NO — AND IT COSTS THEM. The builder's own headline holds

Re-checked before this phase: `ps aux | grep -iE 'chromium|playwright'` -> 0 lines. Load
`1.67 -> 3.51`. 3 runs per cell, fresh page and cold boot each. Every row:
`renderSize {"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`,
`gl.drawingBufferWidth/Height 1280x720`, `renderer.getPixelRatio() 1`, `resScale 1`,
`isPaused() false`, all read off the DRIVER at the END of the window, and the run throws rather
than prints if any is wrong. **598-602 m driven per window at 277 km/h** (cruise). My ring and
`window.__frameStats` agreed to **every digit** on all 43 windows.

### cruise, dpr 1, as p50 / delivered fps / % of frames over 16.7 ms

| cell | p50 (3 runs) | delivered fps | % > 16.7 ms | p99 |
|---|---|---|---|---|
| **BEFORE `aaa8062`, default** | **15.90** (16.00/15.90/15.90) | 59.6 | 24.9% | 36.5 |
| **AFTER, default (what ships)** | **15.90** (15.70/15.90/15.90) | 61.1 | 20.7% | 35.4 |
| **AFTER, `#hudgl=1` (the built change)** | **16.10** (16.10/16.00/16.40) | **56.6** | **41.5%** | 38.0 |
| DOM layer present, NOT redrawn (`--kill hud-draw-off`) | 13.40 (13.40/13.40/13.30) | 76.0 | 2.3% | 29.6 |
| **DOM layer present AND DIRTIED EVERY FRAME (mine)** | **13.50** (13.50/13.60/13.50) | 74.3 | 3.0% | 32.3 |
| no HUD at all (`--kill hud-off`) | 13.50 (13.50/13.50/13.70) | 74.3 | 3.7% | 32.2 |
| in-frame, not redrawn (no upload) | 13.50 (13.40/13.50/13.50) | 75.1 | 2.8% | 32.6 |

- **The default is unchanged**: 15.90 both sides, and the fps/long-frame difference (59.6 -> 61.1,
  24.9% -> 20.7%) is inside my own run-to-run spread on a scenario whose distribution is bimodal.
  The shipped code path really is `composer.render()` plus a call that returns on its first line.
- **The change the brief asked for is SLOWER, confirmed independently.** +0.20 ms on p50 is smaller
  than the builder's +0.70, but the honest statistics are worse than the p50 suggests: **56.6
  against 61.1 delivered fps and 41.5% against 20.7% of frames over 16.7 ms.** By the measure this
  wave insists on, `#hudgl=1` roughly **doubles** the share of long frames on cruise.
- **The prize the brief predicted (cruise -2.40 ms to 3.0% long) is real but it is not reachable
  this way.** With the HUD not redrawn the scenario is 13.40-13.50 ms, 74-76 fps, 2.3-3.7% long —
  i.e. the bar. Neither route gets there.
