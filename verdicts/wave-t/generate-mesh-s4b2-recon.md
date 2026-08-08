# generate-mesh S4b-2 - READ-ONLY RECON

Delegated recon (grok-4.5), relayed and transcribed by the orchestrator.
The agent reported its findings but did not write this file itself, so this is the orchestrator's
transcription of the relayed report.
Nothing here was executed in a browser; every line number below is a grep result against the tree at
`d8f9b90`.

**Purpose: make S4b-2 splittable.** S4b-2 as written is `emitCells` / `disposeCells` + the `update()`
pump with hysteresis + `world.settle()` + per-cell contact and emitter rebuild + cell ownership of
the live registries + streaming collision + the flip of the default to `RES = 1`, in one diff.
S3d and S4 and S4b were each split, and each split bought a check rather than costing one.

## 1. THE GROW-ONLY ACCUMULATORS

The plan's `world.js:2342-2343` for `frontages` / `towers` is STALE. Current:

```
game/world.js:2470  const towers = [];
game/world.js:2471  const frontages = [];
```

Full list. `G` = map-wide, read by a later phase. `P` = per-cell.

| name | decl | push sites | read sites | P/G |
|---|---|---|---|---|
| `contacts` | 1252 | via `shadowAt` 1643-1644, all call sites | 4055 cap; 4091-4109 `layoutContacts` | G |
| `blocks` | 1930 | 1937 from `graphBuilt.blocks` | sort 1938; emission loops 2495+; `chunkStats` 4309; published 4341 | G |
| `towers` | 2470 | 2584 | 2889 rooftop signs; 2976 neon; 4309 stats; published 4352 | G |
| `frontages` | 2471 | 2574 mass; 2642 street wall | 2814 signage and awnings | G |
| `neons` | 2930 | 2973 `neonSign` | 4149-4153 emitters; 4181/4197 smears; 4309; published 4341 | G |
| `lampPositions` | 3001 | 3061 `streetLight` | 4148 emitters; 4165-4166 wet batch; 4311 stats; published 4341 | G |
| `poles` | 3007 | 3065 lamp; 3095 signal | 4310 stats; published 4354 | G |
| `signalLights` | 3076 | 3093 | 4311 stats only | G |
| `parkedBodies` | 3359 | 3417 `parkedCar`; ranks and queues via furniture 3783-3786, 3839-3841 | 4310; published as `parkedCars` 4354 | G |
| `emitters` | 4147 | 4148-4153 from lamps and neons | 4489-4532 `update()` light pool | G |
| `lightPool` | 4133 | 4144, fixed `POOL = 10` | 4380 `setNight`; 4527-4533 update | G, fixed size |
| `resident` | 1339 Map | 1360 `chunkAt` insert | `finalize` / `chunkStats` | P |

There are no per-cell grow-only lists. Every one of the eleven is a map-wide array filled by a
one-shot emission pass.

## 2. THE LIVE REGISTRIES - WHAT OUTSIDE MODULES HOLD BY REFERENCE

This is the silent-failure surface. Re-creating any of these arrays per cell while the holder keeps
the old reference fails with no error.

| name | published at | retained by |
|---|---|---|
| `blocks` | 4341 | `main.js:201` `createPhysics({ blocks })`; `main.js:223` `createTraffic({ blocks })` |
| `poles` | 4354 | `main.js:207` `createPoleFall(scene, world.poles)`, then `polefall.js:26,91` scans it forever |
| `parkedCars` (= `parkedBodies`) | 4354 | `main.js:244` `physics.setParkedBodies`; `main.js:259` `traffic.setStaticBodies`; `main.js:681` crash-shell scan |
| `paths` | 4341 | `scenes.js:10,132,204` |
| `aoExclude` | 4364 | `main.js:299`, once, into SSAO |
| `LAYOUT` | 4341 | `main.js:218` hud; `main.js:223` traffic, for `carKit` |
| `surfaceAt` | 4344 | `main.js:243` `physics.setSurfaceQuery` |
| `group` | 4341 | the scene graph, added at 1149 |
| `neons`, `lampPositions`, `buildings`, `towers` | 4341-4352 | published, no long-lived outside holder found |
| `blockIndex` | 4351 | published, no consumer found yet - `rewire`'s |

## 3. `refl.hidden` AND `releaseHidden`

**It already exists and nothing calls it from the world.** S0 built it.

Declared `game/road.js:1960-1970`:

```js
releaseHidden(obj) {
  if (!obj) return 0;
  const doomed = new Set();
  if (obj.traverse) obj.traverse((o) => doomed.add(o));
  else doomed.add(obj);
  let removed = 0;
  for (let i = refl.hidden.length - 1; i >= 0; i--) {
    if (doomed.has(refl.hidden[i])) { refl.hidden.splice(i, 1); removed++; }
  }
  return removed;
},
```

Call sites: the docstring at `road.js:12-13`, and exactly one real caller, `road.js:2141`, the
wet-smear probe teardown. **No call from `world.js`, because `world.js` has no dispose path.**

## 4. THE EMISSION PHASES, IN ORDER

`P` = purely per-cell. `A` = infrastructure or accumulator-dependent. `G` = genuinely map-wide.

| phase | lines | class |
|---|---|---|
| SETUP_SINK | 1141-1644 | A |
| GROUND | 1646-1652 | G |
| ROADS_GRAPH | 1654-1781 | **P** |
| MATERIALS | 1783-1814 | G |
| PAVEMENT_GRAPH | 1816-1918 | **P** |
| BLOCKS_LIST | 1920-1941 | G |
| BUILDING_POOLS | 1943-2471 | A |
| MASS_TOWERS | 2495-2594 | **P** |
| STREET_WALL | 2596-2653 | **P** |
| SIGNAGE | 2655-2898 | G, only because it reads `frontages` / `towers` |
| NEON | 2929-2997 | G, same reason |
| STREET_LIGHTS_DEFS | 2999-3096 | A |
| SIDEWALK_PROPS | 3113-3244 | **P** |
| GUARD_RAIL | 3246-3284 | **P** |
| PARKED_KIT | 3286-3359 | A |
| ROAD_MARKINGS_HELPERS | 3566-3634 | A |
| HIGHWAY_POOLS | 3636-3656 | A |
| FURNITURE_GRAPH | 3658-4031 | **P** |
| CONTACTS_BAKE | 4033-4113 | G |
| LIGHT_POOL | 4115-4154 | G |
| WET_SMEARS | 4156-4201 | G |
| PATHS | 4203-4207 | G |
| FINALIZE | 4209-4223 | **P** |
| WORLD_API | 4257-4548 | A |

**8 of 24 phases are purely per-cell.** `SIGNAGE` and `NEON` are map-wide ONLY because of the
accumulators, which is exactly what S4b-2b converts.

## 5. THE SHOT PATH

The plan says "about `main.js:886`". **The real line is `main.js:901`**; 886 is `applyCarTransform`.

```js
for (let i = 0; i < steps; i++) tick(FIXED_DT);   // main.js:901
```

Then the HUD snap at 903-907, `car.refreshEnv()` at 914, the renders at 916-918, and
`window.__ready = true` at **921**.

`world.settle()` does not exist anywhere in the codebase.

**What it must guarantee, and the shape of the guarantee is the finding:** every cell the shot needs
is fully built before the FIRST `tick(FIXED_DT)`, including `finalize()`-equivalent meshes so that
draw, hide and `resolve()` work, and the registries `tick` consumes (`blocks`, `parkedCars`, `poles`,
`surfaceAt`, and contacts/emitters if night lighting runs). **The guarantee is binary, not
amortised**: `settle()` is a pre-tick gate, never "tick a few more times to drain a queue". One
partially built cell mid-loop puts a half-built world in all seven gate frames.

## 6. WHAT IS ALREADY RE-ENTRANT

Precise, not generous.

| deliverable | status | evidence |
|---|---|---|
| `emitCells` | **greenfield** | no such symbol in `world.js` |
| `disposeCells` | **greenfield** | no symbol, no `ChunkRec` disposal at all |
| `update()` pump | partial | `world.update` 4439-4543 is atmo plus the light pool only; no build or dispose queue |
| hysteresis | partial | `RES + 1` appears in `plannerKeep` 1328-1333 and the edge keep at 3733, but there is no build-at-`RES` / dispose-at-`RES + 1` pump |
| `world.settle()` | **greenfield** | absent; the shot path never calls it |
| per-cell contact rebuild | **greenfield** | one global `contacts[]`, one `contactMesh`, `layoutContacts` rewrites it whole at 4081-4112 |
| per-cell emitter rebuild | **greenfield** | `emitters` filled once at 4147-4154, never rebuilt |
| cell ownership of registries | partial | the `ChunkRec` owns `descs` / `meshes` / `geoms` at 1360-1368; all eleven registries of section 1 stay global |

S2 through S4a delivered per-cell SEEDING, `chunkAt`, the deferred-allocation sink, `finalize()`,
`chunkRemap`, and a residency FILTER. A one-shot subset is not re-entrancy.

## 7. THE PROPOSED SPLIT

**S4b-2a - the cell build/dispose API and `settle()`.**
`emitCells` / `disposeCells` over the geometry and pools that are already cell-owned; call
`roadKit.releaseHidden` on dispose; `world.settle()` wired into the shot path after create and
before the tick loop.
*Solo check, and it is the plan's own section 7 determinism assert:* boot at `#chunkres=1`,
`settle()`, snapshot the instance matrices, `disposeCells` one key, `emitCells` the same key,
snapshot again - **byte-identical**. Assert `refl.hidden` length returns to its pre-dispose value.
No pump, no registry move and no default flip is anywhere near this check.

**S4b-2b - registry ownership, and the contact and emitter rebuild.**
Move the section 1 accumulators onto the `ChunkRec`; rebuild `contactMesh` and `emitters` from
resident cells only; keep the published arrays as live views or give them an explicit rebind API,
because of the outside holders in section 2.
*Solo check:* dispose a cell and the published lengths drop by exactly that cell's counts; re-emit
and they come back. The night light pool considers only the remaining emitters.

**S4b-2c - the pump, the collision stream, and the default flip.**
Hysteresis in `update()`, build at `RES` and dispose at `RES + 1`, default `RES = 1`, and the
collision list kept coherent as the hero moves.
*Solo check:* drive across a cell boundary; `residentCells` follows the hysteresis rule without
thrashing on the line; collision and parked cars still answer near the hero after the crossing; the
shot path is still complete after `settle()`.

## THE THREE FACTS THAT MOST CHANGE HOW S4b-2 IS BUILT

1. **There is no dispose path at all**, and `releaseHidden` is already built and uncalled
   (`road.js:1960-1970`, only caller `road.js:2141`). `disposeCells` is greenfield and owns the
   teardown contract.
2. **All eleven registries are global arrays and four are held by reference outside `world.js`**
   (`main.js:201`, `:207`, `:223`, `:244`, `:259`, `:681`, `polefall.js:26,91`, `scenes.js:10,132,204`).
   Cell ownership is an architectural change, not incremental work, which is why it is its own piece.
3. **The shot path ticks at `main.js:901` and sets `__ready` at `:921`**, so `settle()`'s guarantee is
   binary and pre-tick, not an amortised drain.
