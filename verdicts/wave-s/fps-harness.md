# wave-s / fps-harness

Piece: build the frame-time harness this wave is judged on.
Owned files: `tools/fps.mjs` (new). No edits to `game/*`.

**I am running CONCURRENTLY with three peer agents.**
Every frame-time number in this file is a SMOKE TEST, not a result.
Nothing was tuned against any of them.

## Tree check before starting (process rule 2)

`git status` at start: `PROMPT.md`, `driver.log`, `game/index.html`, `game/main.js`, `game/world.js`,
`progress.json` modified by peers/driver; `README.md` and three `verdicts/wave-r/*.md` untracked.
None of those are mine. I touch none of them.
`tools/` is clean, so `tools/fps.mjs` starts from nothing.

## Regression gate

This piece cannot move a pixel: it adds one new file under `tools/` that nothing in `game/`
imports. No shot comparison is applicable. The harness only pokes live objects through
`window.__game` inside its own throwaway browser pages.

## Design decisions and why

1. **rAF-to-rAF only.** The harness reads `window.__frameStats.stats()` and never brackets
   `composer.render()` itself. Permanent rule 3 territory: a CPU-side bracket is satisfiable
   without the thing it claims to measure.

2. **The pixel-ratio guard fails the run, it does not annotate it.** `assertRenderSize()` compares
   the buffer that `ctx.renderSize()` reports against the size the CLI asked for and refuses to
   emit a statistic on a mismatch. A harness that reports a number next to a warning is a harness
   whose numbers get quoted without the warning.

3. **Draw-call counters are averaged over a real frame window, not read after one `render()`.**
   `WebGLRenderer.info` resets at the top of every `renderer.render()` call, and the composer calls
   render once per enabled pass, so reading `info.render.calls` after a frame returns the cost of
   the LAST PASS ONLY - a couple of hundred triangles for a fullscreen quad. The harness sets
   `info.autoReset = false`, resets once, counts N real rAF frames, and divides. This is exactly
   the class of bug this wave exists to catch, in the instrument rather than the game.

4. **Subsystem attribution re-measures the baseline after the sweep.** A single baseline at the
   top of a 12-toggle sweep drifts (thermal, peer load, the car driving into a different part of
   the city). Deltas are quoted against the mean of the opening and closing baseline, and the
   drift between the two is printed so a delta smaller than the drift can be dismissed on sight.

5. **Toggles that change shader defines force `material.needsUpdate`.** `renderer.shadowMap.enabled`
   is a program define; flipping it without invalidating materials measures nothing at all. The
   harness re-warms for the full warmup after any toggle so the recompile stall lands outside the
   measurement window.

## Log

- Wrote this verdict first, before `tools/fps.mjs` existed.
- Read `tools/shot.mjs` (static server + ANGLE/Metal launch flags reused verbatim), `game/main.js`
  (frameStats, ctx surface, resScale contract), `game/physics.js` (`placeOnPath`/`clearPath` for
  the `city` scenario), `game/scenes.js`, `game/traffic.js`.
- **Finding as first written, LATER RETRACTED - see the correction section below, do not quote this
  paragraph:** `game/traffic.js` is a 35-line STUB. It builds an empty `THREE.Group`, and
  `update`/`setNight`/`reset` are all no-ops with `count = 0`. So the `traffic-hidden` row of the
  subsystem table is expected to read ~0 ms, and it is not evidence that traffic is cheap - there is
  no traffic. (This was true of the tree I started against. A peer landed live traffic mid-run and
  I re-measured; the correction is below.)

## CORRECTION to the traffic finding above (process rule 8)

The stub finding is **STALE and I am retracting it**. `wave-s/traffic` (commit `7d6badc`) landed
while I was measuring: `game/traffic.js` went from a 35-line no-op to 597 lines with 56 live
lane-driving vehicles. I re-ran the `traffic-hidden` row against the live build to check.

Traffic is not absent any more, and it is still nearly free, for a good reason: traffic.js:137
builds **seven InstancedMeshes for the whole population** (five by day - head and tail lights are
night-only). Measured on the live build, `traffic-hidden` saves **3 draw calls and ~340k triangles**
and its per-pass deltas were `[-0.2, 18.0, 11.0, 6.1]` ms, i.e. 3/4 sign agreement and dominated by
noise. So: traffic is real, and traffic is not the frame-time problem. Nobody should go optimise it.

Also of note: a driver committed my work-in-progress in `a39448e` before I was finished, and a peer
has `game/main.js` modified in the tree. The harness still boots clean against both.

## VALIDATION RESULTS (all required checks)

### 1. The pixel-ratio guard is honest. Proven with a kill-control, not an argument.

`--force-ratio 2` pokes `renderer.setPixelRatio(2)` + `composer.setPixelRatio(2)` on the live page,
reproducing exactly the lie the pre-wave-S build told. The harness refuses:

```
FAILED: RENDER SIZE CONTRACT VIOLATED (cruise res 1 run 1)
  observed: renderW 2560 renderH 1440 cssW 1280 cssH 720 pixelRatio 2 devicePixelRatio 1
  ! buffer 2560x1440, expected 1280x720
  ! pixelRatio 2, expected 1
  refusing to report a frame-time number for a buffer this is not.
```

Process exit code 1. It both refuses AND names 2560x1440, so it cannot be misread.

`--dsf 2` (playwright deviceScaleFactor 2) is the other half. It also refuses, and the reason is
worth recording because it is NOT the same failure:

```
  observed: renderW 1280 renderH 720 cssW 1280 cssH 720 pixelRatio 1 devicePixelRatio 2
  ! devicePixelRatio 2, expected 1 (pass --allow-dpr to measure anyway)
```

main.js's ratio cap holds, so the buffer stays 1280x720 even at dsf 2 - the fix works. But the
compositor is now upscaling to a 2x backing store, so the harness still declines by default.

### 2. The numbers move when the load moves.

cruise, best p50 of 3 runs per cell, 1280x720 base, dpr 1:

```
res           1.00   0.85   0.70   0.55   0.40
best p50 ms   29.5   18.3   16.0*  16.7   48.7
 med p50 ms   30.1   18.4   16.1*  17.1   50.0
```

29.5 -> 16.0 ms across 1.00 -> 0.70 is a 1.8x move on a 2.04x pixel-count change. The harness is
measuring the GPU. An earlier 2-run check read 40.6 ms at res 1.00 against 14.8 ms at res 0.50.

### 3. Order-of-magnitude check against the recorded baseline. SMOKE TEST.

Play brief baseline: p50 **41.20 ms** at 1280x720 / pixelRatio 1 / dpr 1, dusk-highway-chase cruise.
My first cruise run, same conditions, `renderW 1280 renderH 720 pixelRatio 1 devicePixelRatio 1
resScale 1`: p50 **41.95 ms**, mean 43.40, p90 69.37, p99 84.96, n 95 over 4 s. Same order of
magnitude, within 2%. Concurrent, therefore a smoke test.

## HONEST MISSES AND THINGS THAT DID NOT WORK

- **My first subsystem design was wrong and its table was garbage.** One opening baseline, eleven
  serial toggles, one closing baseline, and the car left driving throughout. It credited **36.40 ms
  and 164 draw calls** to hiding a traffic group that was, at that moment, provably EMPTY. Cause:
  the sweep takes minutes, the car covers kilometres, and no two rows saw the same scene. Fixed by
  respotting before every window and interleaving a fresh baseline before every toggle.
- **A comment I wrote was wrong and I caught it before committing.** I had justified `followPath` by
  claiming keyboard-only cruise "settled at 137 km/h instead of ~280". False: 137 km/h is this car's
  terminal speed on throttle alone (physics.js drag balances the throttle term at 38.2 m/s), and
  followPath reads 137.5 too. Rewritten to say what I actually measured. Rule 5.
- **`corner` in the city measured a parked car.** Keyboard steer + `clearPath()` downtown put the car
  into a building in ~2 s; `collide()` multiplies speed by 0.62 per contact and the window read
  **2.65 km/h**. Moved to the open highway with an 0.8 s half-period slalom: now 137.5 km/h at
  |slip| 0.67-0.83, which is genuinely cornering. This is why the table carries km/h and |slip|
  columns - without them that run would have been reported as a valid corner measurement.
- **Non-monotonic resolution scaling at 0.55 and 0.40, and I cannot explain it.** cruise at res 0.40
  (512x288) read p50 48.67 / 50.04 / 51.62 ms over three runs - a **6% spread, so not contention** -
  against 16.0 ms at res 0.70. Lowering resolution made it 3x SLOWER, reproducibly. Routed below.
- **Under concurrency the timing half of the subsystem table mostly resolves nothing**, and the
  harness says so rather than ranking noise. In one 4-pass sweep the baseline p50 range was 198%.
  Only 3 of 11 rows cleared the floor with 4/4 sign agreement.

## RANKED SUBSYSTEM ATTRIBUTION

`--subsystem --sub-scenario cruise --repeat 4 --measure 3 --warmup 1.5`, interleaved A/B, car
respotted before every window. **renderW 1280 renderH 720 pixelRatio 1 devicePixelRatio 1
resScale 1** for every row. Baseline: **988 draw calls/frame, 12.46M triangles/frame, 132 programs,
392 geometries, 92 textures.** CONCURRENT - the ms columns are smoke tests, the counters are not.

```
subsystem disabled    minBase   minOff    delta  medDelta  calls-      tris-  sign  verdict
post-chain-off          23.61    11.79    11.83     10.82     348    3448449   4/4     REAL
car-hidden              21.83    12.39     9.44      9.65     404     685583   4/4     REAL
world-hidden            22.24    13.11     9.13     15.95     469   10942876   4/4     REAL
shadows-off             22.16    17.86     4.30      8.25     167    3223612   4/4   likely
sky-hidden              24.70    21.11     3.59      2.47     -18    -386171   3/4    noise
bloom-off               22.11    18.74     3.37      2.96      55     772418   4/4   likely
ssao-off                22.93    21.80     1.13      1.52     332    3448426   3/4    noise
traffic-hidden          25.98    25.67     0.32      0.32      21      45805   3/4    noise
smear-pass-off          21.59    21.95    -0.37     -6.13     -21    -386198   1/4    noise
output-grade-off        22.10    23.48    -1.38     -7.20     -19    -386195   2/4    noise
hud-off                 21.96    23.41    -1.44     -2.87      -5        -23   1/4    noise
```

`minBase`/`minOff` are the LOWEST p50 each state reached across the four passes. Contention is
one-sided - a peer can only ever make a frame slower - so the floor is the estimator that survives
it, and it is what the ranking uses. A second independent 4-pass sweep put the same three rows on
top (post-chain-off, car-hidden, world-hidden) with deltas 19.5 / 30.1 / 4.8-12.0 ms, so the
ORDERING is reproducible even where the magnitudes are not.

### The contention-immune half of that table, which is where the real finding is

Draw-call and triangle counts do not care what else is running on the machine. Of **988 draw calls
per frame**:

- **The hero car is 404 of them (41%) for only 0.69M triangles.** It is drawn three times per frame
  (main pass, SSAO pass, shadow pass), so it is roughly **135 separate meshes**. 135 meshes for one
  car, costing 41% of the frame's draw calls to render 5.5% of its triangles, is the single most
  actionable number I produced.
- **SSAO is a whole extra scene pass: 332 draw calls and 3.45M triangles**, and it is 96% of what
  `post-chain-off` removes in draw-call terms. The rest of the post chain (bloom, smear, grade) is
  ~16 calls of fullscreen quads.
- **The shadow map is another 167 calls and 3.22M triangles** at 4096x4096 PCFSoft.
- **world.group is 10.94M of the 12.46M triangles (88%)** for 469 calls.
- **Traffic is 3-21 calls and ~340k triangles.** Seven InstancedMeshes for 56 vehicles. Free.

## ROUTED FINDINGS

1. **To the optimisation piece, highest value:** the hero car is ~135 meshes / 404 draw calls per
   frame across three passes. Merging the car's static shell into a handful of meshes is a
   draw-call win of a size nothing else on this list can match, and it is a `game/car.js` +
   `game/damage.js` question, not a renderer one.
2. **To the optimisation piece:** SSAO costs a full second geometry submission (332 calls,
   3.45M tris). A depth-prepass-sharing or half-res SSAO changes the shape of the frame, not just
   its shading.
3. **To whoever owns the resolution ladder:** `resScale` 0.55 and 0.40 are reproducibly WORSE than
   0.70 on this machine (0.40: p50 48.67/50.04/51.62 over three runs, 6% spread, versus 16.0 ms at
   0.70). Something non-obvious happens below 0.70 - candidates I did not get to test are the
   `samples: 4` MSAA resolve at small target sizes and `ssao.setSize()` at 512x288. Until that is
   understood, **"drop resScale to hit 60" is not a valid mitigation**, and the pause menu should
   not offer 0.4 as if it were the fastest setting. Needs a quiet machine.
4. **To the critic:** `--force-ratio <n>` exists purely to prove the size guard trips. Run
   `node tools/fps.mjs --scenarios cruise --repeat 1 --measure 3 --force-ratio 2` and it must exit 1.
   If a future edit ever makes that command print a frame time, the whole wave's measurement
   contract is broken and that command is the canary.

## HOW TO RUN IT

```
node tools/fps.mjs                                    # 5 scenarios x 3 runs, 1280x720, 8 s windows
node tools/fps.mjs --res 1.0,0.85,0.7 --repeat 3       # the "at what res do we hold 60" sweep
node tools/fps.mjs --subsystem --repeat 4              # ranked attribution, interleaved A/B
node tools/fps.mjs --subsystem --toggles ssao-off      # re-confirm one row cheaply
node tools/fps.mjs --json out/fps.json                 # machine-readable, every run kept
```

Artifacts from the runs quoted above: `verdicts/wave-s/fps-scenarios.json`,
`verdicts/wave-s/fps-res-sweep.json`, `verdicts/wave-s/fps-subsystem.json`,
`verdicts/wave-s/fps-subsystem-live-traffic.json`.
