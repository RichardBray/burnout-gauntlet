# wave T — `generate-mesh` S3b hotfix: the two scenes that would not boot under `#map=graph`

Closes the EXACT NEXT ACTION carried at the top of `STATE.md`: `hud-overlay` and `wet-night-asphalt`
did not reach `window.__ready` in 240 s / 300 s under `#map=graph`, with no console error.

## 1. IT WAS NEVER A HANG. IT WAS AN UNCAUGHT EXCEPTION INSIDE THE SHOT-MODE TICK LOOP.

`tools/_hangprobe.mjs` paused the main thread at 25 s and found it idle, then read the page's own
error slot:

```
Error: resolve: no finalized instance for pool tlPole index undefined
    at resolve   (world.js:1489)
    at Object.hide (world.js:2870)
    at knock     (polefall.js:64)
    at Object.update (polefall.js:94)
    at tick      (main.js:736)
    at boot      (main.js:896)
```

`main.js:896` is the shot-mode `for (i < steps) tick(FIXED_DT)` loop, which runs BEFORE
`window.__ready` is set. It is not wrapped, so one throw inside it skips the assignment and every
harness in the tree then waits forever on a page that is alive, error-free in the console (the throw
is captured into the page's own state object, not re-logged) and simply never signals. **That is why
six kill-controls all "worked": every one of them changed where the hero was and therefore whether
it drove into a pole in the first four simulated seconds.** The scene-dependence in the EXACT NEXT
ACTION - `hud-overlay` u 0.34 fails, `daytime-downtown` u 0.815 works - is exactly that, and nothing
to do with time of day or with `world.blocks`.

## 2. THE DEFECT: THREE EMITTERS RECORDED THE POOL HANDLE INSTEAD OF `push()`'s RETURN VALUE.

`push()` / `pushMat()` return `[descriptor, index]` — the per-cell descriptor the instance was
actually written into (`world.js:1362`). `sink.remap` is keyed on that descriptor
(`world.js:1414`), and `resolve()` looks the pair up there (`world.js:1481`).

All three post-boot editors recorded `[handle, handle.count]` instead. The handle is the
`THREE.Group` returned by `pool()` (`world.js:1268-1280`); it has no `.count`, so **every recorded
index was `undefined`** and `resolve()` threw on the first `hide()` of the process's life.

BEFORE / AFTER, literal, with `file:line` at the pre-edit revision (`5cebe42`):

| site | before | after |
|---|---|---|
| `world.js:2887` `streetLight` | `const rec = (m) => used.push([m, m.count]);` + `rec(slPole); push(slPole, ...)` | `const rec = (ref) => used.push(ref);` + `rec(push(slPole, ...))` |
| `world.js:2911` `streetLight` bulb | `used.push([slBulb, slBulb.count]); pushMat(slBulb, dummy.matrix);` | `rec(pushMat(slBulb, dummy.matrix));` |
| `world.js:2945` `trafficLight` | `const rec = (m) => used.push([m, m.count]);` + `rec(tlPole); push(tlPole, ...)` (5 sites incl. the 3-lens loop) | `rec(push(tlPole, ...))` |
| `world.js:3238` `parkedCar` | `const rec = (m) => used.push([m, m.count]); const at = (m,...) => { rec(m); push(m, ...); }` | `const rec = (ref) => used.push(ref); const at = (m,...) => { rec(push(m, ...)); }` |
| `world.js:3273` `parkedCar` wheels | `used.push([carWheel, carWheel.count]); pushMat(carWheel, dummy.matrix);` | `rec(pushMat(carWheel, dummy.matrix));` |

19 insertions, 23 deletions in `game/world.js`, nothing else. **No constant changed, no emitter
changed the order or the arguments of a single `push()`, and no material, geometry or pool was
added.** The only thing that changed is what the `used` array holds.

**`parkedCar` was broken in exactly the same way and nobody had noticed**, because the grid scenes
never promote a parked car inside their four simulated seconds. It is fixed here rather than left
for `rewire` to find: it is one line, and it is the same defect.

This is the *fourth* time in this project that a post-boot per-instance edit has gone to the wrong
object (see `tools/HANDOFF-PARKED-CARS.md`, and S1's `hidePoles` finding). The standing rule stands:
**any post-boot per-instance edit routes through `chunkRemap` / `sink.resolve`, and the reference it
uses must be the one `push()` handed back — never a handle you can reach by name.**

## 3. THE CHECK: `tools/_polefall-probe.mjs`, ASSERTED ON THE SUBMITTED INSTANCE MATRICES.

New, and deliberately not a check against `world.poles` — the array stays identical whether or not
the pole is still on screen, which is the shape of the three bugs this project already paid for.
The probe walks **every `InstancedMesh` in the scene, every instance, `getMatrixAt` composed through
`matrixWorld`**, and counts instances above `y = 1`. For each sampled pole it asserts:

1. `hide()` does not throw;
2. the **global** above-ground instance count falls by **exactly** the pole's own part count
   (lamp 4: pole/arm/head/bulb; signal 6: pole/arm/head/3 lenses) - so the whole pole went and
   nothing else in the city moved;
3. the count within 6 m of the pole falls by the same number.

Criterion 3 is deliberately NOT "goes to zero". One sampled signal read `before 8, after 2` — a
second pole standing inside the 6 m neighbourhood. `globalDrop` was 6, the exact part count. **A
radius is a neighbourhood, not an identity**; the first version of the check called that a failure.

Results, 12 poles sampled evenly across all 1882:

```
map=graph  hud-overlay  PASS 12/12
map=graph  crash-cam    PASS 12/12
grid       hud-overlay  PASS 12/12
grid       crash-cam    PASS 12/12
```

**POISON CONTROL, run against the pre-fix `world.js`, `daytime-downtown` under `#map=graph`** (that
scene boots on the broken tree, which is what makes it usable as the control):

```
BAD {"kind":"lamp",  "before":4,"after":4,"globalDrop":0,"err":"resolve: no finalized instance for pool slPole index undefined"}
BAD {"kind":"lamp",  "before":4,"after":4,"globalDrop":0,"err":"resolve: no finalized instance for pool slPole index undefined"}
BAD {"kind":"signal","before":6,"after":6,"globalDrop":0,"err":"resolve: no finalized instance for pool tlPole index undefined"}
FAIL 3/3
```

`globalDrop 0` on the broken tree and the exact part count on the fixed one. The check fails when the
thing it measures is absent.

## 4. ALL SEVEN SCENES BOOT UNDER `#map=graph`.

`hud-overlay` READY in **9.5 s** (was: never, at 240 s), `wet-night-asphalt` READY in **9.5 s**
(was: never, at 300 s), both via `tools/_hangprobe.mjs --wait 90`. All seven then rendered clean
through `tools/shot.mjs --hash map=graph`: `dusk-highway-chase`, `boost-blur`, `crash-cam`,
`wet-night-asphalt`, `daytime-downtown`, `car-paint-closeup`, `hud-overlay` — 7/7 OK.

## 5. `#map=grid`, THE DEFAULT AND THE GATE, IS UNCHANGED.

Paired A/B, A = pre-fix tree, B = fixed tree, all seven scenes, `tools/_pxdiff.mjs`:

| scene | maxd | % pixels | mean |
|---|---|---|---|
| dusk-highway-chase | 1 | 0.0028% | 0 |
| boost-blur | 1 | 0.0047% | 0 |
| crash-cam | 2 | 0.0022% | 0 |
| wet-night-asphalt | 29 | 0.0054% | 0.0001 |
| daytime-downtown | 9 | 0.0111% | 0.0001 |
| car-paint-closeup | 1 | 0.0002% | 0 |
| hud-overlay | 1 | 0.0023% | 0 |

`wet-night-asphalt`'s maxd 29 is NOT a regression and was checked rather than assumed: **the same
tree rendered twice gives maxd 29 at 0.0056%** (B vs B2), while the cross-tree pair A2 vs B2 gives
**maxd 8 at 0.0038%**. The cross-tree difference is smaller than this scene's own run-to-run noise.
`STATE.md`'s recorded floor of "maxDiff 4" for this scene is stale — quote 29 from now on, or
re-measure.

## 6. ONE THING MEASURED THAT IS NOT MINE, AND IS NOT FIXED HERE.

`node tools/_loadtime.mjs` (grid default, no hash) now reports **cold median 12.6 s** against the
5.0 s bar and `STATE.md`'s recorded 3493 ms:

```
boot sky 109ms  road 2110ms  world 662ms  car 685ms  sim 306ms  post 92ms  warm 6320ms
cold  median 12747 ms  (11745, 12801, 12747)
warm  median 11263 ms  (12696, 11263, 8618)
```

**It predates this fix.** Measured on the pre-fix tree in the same session: cold median 12434 ms
(7669, 12434, 13887). The run-to-run spread is 7.7 s to 13.9 s, which is itself larger than the
whole bar, so this is either a real regression from S3a/S3b's eager `createBlocks` + `planPavement`
or machine contention, and **it cannot be settled by a run taken alongside anything else.** It
belongs to `perf`, which runs alone. Recorded here so it is not discovered as "the hotfix tripled
the load".
