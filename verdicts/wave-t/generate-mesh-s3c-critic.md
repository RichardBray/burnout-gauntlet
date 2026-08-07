FAIL — S3c omitted its mandatory built-collision drive probe, and `paths.city` violates the arterial/street-only contract.

## Scope and method

I reviewed commit `d696581` plus tooling-only `f1bbd5a`. There are no later changes under `game/` between `d696581` and HEAD. I changed no product code. The only repository write from this review is this verdict.

Browser checks cannot run in this critic environment: both `tools/_s3c-check.mjs` and `tools/shot.mjs` fail before Chromium launch because local socket binding is denied (`listen EPERM`, on both `0.0.0.0` and `127.0.0.1`). I therefore used the pure-data map modules directly for the graph/path/spawn checks and identify every browser-only gap below.

## Builder constant table, independently re-verified

The BEFORE tree is `d696581^`; AFTER is the current game tree. A literal checker covered all 16 individual assertions below and read **16/16 true**. Poisoning `PATH_STEP 15.0 -> 16.0`, `POOL 24 -> 25`, and grid bounds `1400 -> 1399` made the corresponding checks false.

| builder row | BEFORE, independently read | AFTER, independently read | result |
|---|---|---|---|
| world clamp | `game/physics.js` before:696, `bounds = 1400` | `game/physics.js:701`, `bounds = 2000` | MATCH |
| path control spacing | no `PATH_STEP` | `game/world.js:143`, `const PATH_STEP = 15.0` | MATCH |
| grid paths | before:4093-4096, `roundedRect(325, 325, 48, 8)` and `[-1000, HZ + 6.5] ... [1000, HZ + 6.5]` | `game/world.js:4202-4205`, the same two expressions behind `graphPath ||` | MATCH |
| graph paths | no `graphPath = graphPaths` | `game/world.js:1805`, `graphPath = graphPaths(roadPlan, built.faces)` | MATCH |
| graph `heroDist` | before:3335, `if (GRAPH) return Infinity;` | `game/world.js:3433-3442`, nearest squared distance over `graphPath.city.samples` | MATCH |
| grid `heroDist` | before:3336-3338, `277` / `48` rounded-box SDF | `game/world.js:3443-3445`, identical expression | MATCH |
| parking clearances | before:3315/3318/3371/3415: `HALF + 0.5`, `16.5`, `2.8`, `4.6` | `game/world.js:3411/3414/3478/3522`, identical literals | MATCH |
| surface publication | absent | `game/world.js:4328`, `surfaceAt: GRAPH ? graphIdx.surfaceAt : surfaceAt` | MATCH |
| surface injection | `game/main.js` before:238, `physics.setSurfaceQuery(surfaceAt)` | `game/main.js:241`, `physics.setSurfaceQuery(world.surfaceAt || surfaceAt)` | MATCH |
| module `surfaceAt` body | `game/world.js` before:66 onward | `game/world.js:69` onward; extracted function bodies are byte-identical | MATCH |

The builder's rows match the literals. The failure is in required behavior/checks, not a false BEFORE/AFTER table.

## 1. Seven spawn points

I independently rebuilt `planRoads`, `createBlocks`, and `createRoadGraph` from `paradise.json`; independently implemented the committed Catmull-Rom/arclength path construction; and transcribed all seven `placeOnPath` calls from `game/scenes.js:91,110,133,169,186,205,231`. Surface classifications below come directly from the pure graph query, not the builder's page harness. Block clearance is against every built `world.blocks` AABB expanded by the same 1.0 m hero radius used at `game/physics.js:923`.

| scene | x,z m | surface / nearest edge | margin inside paved/kerb limit | expanded block overlaps / nearest clearance |
|---|---:|---|---:|---:|
| dusk-highway-chase | 760.85,-470.76 | tarmac / motorway 184 | 15.000 m | 0 / 17.761 m |
| boost-blur | 855.79,-463.55 | tarmac / motorway 199 | 15.000 m | 0 / 18.547 m |
| crash-cam | 1407.46,-234.56 | tarmac / **service 323** | 7.161 m | 0 / 17.563 m |
| wet-night-asphalt | 1367.54,109.15 | tarmac / arterial 456 | 13.447 m | 0 / 24.147 m |
| daytime-downtown | 1026.87,-28.16 | tarmac / street 392 | 9.473 m | 0 / 9.873 m |
| car-paint-closeup | 431.04,-400.76 | tarmac / motorway 251 | 15.000 m | 0 / 16.395 m |
| hud-overlay | 1613.13,-86.63 | tarmac / arterial 373 | 13.577 m | 0 / 14.539 m |

Result: **7/7 tarmac, 0/7 inside an expanded block, y = 0 for all seven**. This is stronger than “on tarmac,” but `crash-cam` also exposes the city-path class defect discussed below.

Poison control: I replaced the first spawn with the centre of built block 0. The same predicate reported **1 failure** instead of 0.

## 2. Mandatory built-collision drive probe

**No legitimate probe exists or was run. The builder's deferral is not legitimate.** `BRIEF-S3C.md` §3.4 requires it in this step; `WAVE-T-MAP-BRIEF.md` says it is “not optional”; and the S3c definition in `WAVE-T-GENERATE-MESH-PLAN.md:861-865` ends with “drive probe.” `stream`/`rewire` ownership does not override those explicit S3c acceptance requirements.

The checked-in `tools/_s3c-check.mjs` is not that probe:

- it chooses district starts from `world.blocks`, not authored graph routes;
- it drives arbitrary +X headings rather than one graph route per district;
- it teleports `state.pos.z` by up to 6 m to put the car back on tarmac;
- it counts cell-key changes, but does not establish the boundaries belonging to a route;
- it records results into JSON but has no failing assertion or non-zero exit for stopped/stuck/out-of-bounds routes;
- it does not test ground contact.

More fundamentally, the current physics cannot observe a seam in the built road mesh. At `game/physics.js:718`, `airborne` is documented as dead state; at `:1973`, `state.pos.y = 0` is forced; and at `:1791-1793`, the surface comes from `surfaceAt`, i.e. graph data. Physics collides against `world.blocks`, parked/live cars, and the scalar bounds, not against ribbon/junction triangles. A “never loses ground contact” assertion would therefore stay green with the road render geometry deleted or severed.

What it would take: expose a collision representation or raycast/BVH over the actually built ribbon and junction geometry, author one connected route in each of downtown/harbor/palmbay/silverlake/mountain, enumerate every 200 m boundary crossed by each route, drive the physics across them, and fail on loss of mesh contact, stop/stuck, or bounds contact. Then poison it by removing/severing a route ribbon or inserting a collision wall and require red.

Measured route/probe numbers in this review: **0/5 district collision routes exist, 0 collision routes driven, 0 valid poison controls possible**. Browser execution was additionally blocked by `listen EPERM`, but even a browser-capable environment would not cure the missing mesh-contact signal.

## 3. `paths.city` / `paths.highway` closure and continuity

Independent reconstruction measured:

| path | controls | samples on tarmac | curve length | largest consecutive sample gap | endpoint closure |
|---|---:|---:|---:|---:|---:|
| city | 157 | **900/900** | 1978.375 m | **4.069 m** | **0.000 m** |
| highway | 94 | **900/900** | 1191.265 m | **1.811 m** | open path; endpoints 789.088 m apart |

The motorway graph has **20 components**. The largest has **12 edges / 1285.150 m**. The chosen longest simple chain is **11 edges / 1190.500 m**, edge ids `176,210,201,199,184,183,181,193,251,284,372`, all within that largest component. There is no teleport in either sampled path.

However, the city path is not the contracted arterial/street circuit. Along its 900-sample curve I measured **164.707 m nearest to `service` edges**; the underlying face boundary has **7 service segments / 161.305 m**, from edges **323 and 369**. Boundary length by edge district is only Palm Bay **857.278 m** and Downtown **1132.171 m**, not all five districts.

Poison controls: shifting highway sample 450 by 500 m changed the result from 900/900 to **899/900 tarmac** and raised max gap to **501.290 m**. Changing used street edge 291 to motorway raised disallowed face-boundary length from **161.305 m / 7 segments** to **302.914 m / 10 segments**.

## 4. `#map=grid` seven-scene pixel stability

I could not render any scene: `tools/shot.mjs` fails at its `127.0.0.1` listener with `EPERM`. Thus I do **not** adopt the builder's seven pixel rows as independently verified numbers, and I did not use MD5.

The source-side prerequisites are verified: both grid path expressions and the module `surfaceAt` body are identical to BEFORE; grid publishes bounds **1400**; the graph branch derives **2000**. This is not a substitute for pixels. No pixel poison control was possible without a runnable renderer.

## 5. `heroDist` render-side application

The `Infinity` short-circuit is gone. The graph branch scans **900 samples**. Source control flow at `game/world.js:3448-3450` returns from `tryPark` before `parkedCar`, and `parkedCar` is the function that pushes every rendered instance and CPU collision body. A source poison removing that `return` made the control-flow predicate red.

I could not inspect submitted instance counts/matrices or independently reproduce the builder's runtime `{rank:0, queue:1038, culled:4}` because the page cannot boot here. I therefore do not claim the runtime cull count, nor claim that zero rendered parked cars sit on `paths.city`.

## 6. Materials and compiled programs

Added `new THREE.*Material` constructors in `d696581`: **0**. Poisoning the diff with one added `new THREE.MeshBasicMaterial()` changed the counter to **1**.

Grid `renderer.info.programs` could not be measured without the page. The known graph 180-versus-grid 131 difference is explicitly out of scope as a finding.

## 7. NPC constants

`game/traffic.js:89` is literally `let POOL = 24`; `game/world.js:3311` is literally `const NPC_DENSITY = 0.16`. Poisoning POOL to 25 made the literal check fail. Both constraints pass.

## 8. Bounds in both modes

The published bound derives to **2000 graph / 1400 grid**, and `game/main.js:201` passes `world.bounds` to physics. The graph value is derived from the one `mapDoc.extent` source; it is not hardcoded again in `main.js`. Poisoning `paradise.json` x-max to 2100 changed the derived bound to **2100**; poisoning grid 1400 to 1399 made the literal check fail. This check passes.

## 9. Boot and console

Neither mode could be booted because localhost binding is forbidden before navigation. Measured boots: **0 graph, 0 grid**. Console/page-error counts are therefore unavailable. No boot poison control was possible.

## 10. Eager-build rule and syntax

S3c adds **0** mesh/geometry constructors and **0** material constructors. Its new whole-graph work is data: one face sort/densification and DFS over 52 motorway edges. Poisoning the diff with `new THREE.Mesh()` raised the constructor counter from 0 to **1**. I could not traverse the scene at `__ready`, so resident mesh/instance counts remain unverified.

`bash tools/lint.sh`: **exit 0, `lint ok`**. `node --check` over `game/map/*.js`: **4/4**. Appending invalid syntax in-memory changed the module syntax check from exit 0 to **exit 1** at the poisoned line.

## Findings

### BLOCKING — the required drive probe was omitted and cannot currently measure its target

The deferral to `stream`/`rewire` contradicts three binding S3c requirements. The available harness can pass without following district routes or touching built road collision, and the physics has no road-mesh contact signal to assert. This is the exact “connected data over a world with a seam” gap the critic brief prioritizes.

### BLOCKING — `paths.city` uses forbidden road classes

The contract says arterial/street. The delivered path includes about **164.707 m of service-road curve** on service edges 323 and 369. `crash-cam` spawns on service edge 323. The path is closed and continuous, but it is the wrong circuit.

### NON-BLOCKING — highway uses 11 of the largest component's 12 edges

It is a continuous 1191.265 m open path with a 1.811 m largest sample gap and 900/900 tarmac samples. The omitted component branch is declared and does not create a teleport.

## Checks I could not complete

- The mandatory collision-geometry drive probe: there is no road-mesh ground-contact signal; localhost is also blocked. It needs the collision/raycast representation, five authored routes, boundary enumeration, and a wall/sever poison.
- Both-mode boot and console collection: localhost listeners fail `EPERM`.
- Seven grid renders and same-session noise floors: same listener failure; no pixel claims adopted.
- Render-side `heroDist` instance count/matrices and parked-car/path overlap: page unavailable.
- Grid compiled program count and `__ready` resident scene traversal: page unavailable.

These gaps do not soften the verdict: the brief itself requires FAIL when the drive probe cannot be made to fail under poison, and the city-path class contract is independently red.

## ROUND 2 — FAIL

Round 2 fixes the class purity of `paths.city` and supplies a non-vacuous probe, but the probe is
not a reliable wave seam check. Its baseline is red for controller excursions that it attributes to
the world, and all five authored “chains” are one edge long, so none crosses a junction. I changed no
product code; this appended verdict is my only write.

### Attribution ruling on the five baseline failures

**Ruling: (c), probe/controller artefacts — not (a) `blocks.js`/`digitise`, and not (b) S3c's
`paths`/`surfaceAt`/`heroDist`/`bounds`.**

The orchestrator's run is genuinely red: exit 1, five failures over Harbor, Silver Lake, and
Mountain. All five routes nevertheless reached their ends, crossed 2/2 enumerated planes, stayed
inside bounds, and never met the stuck threshold. The poisons are genuine too: `--poison=wall`
exited 1 with eight failures and additionally stopped Downtown reaching its end and crossing every
plane; `--poison=sever` exited 1 on `connected edge chain`.

But those five baseline failures do not identify the known map debt:

- Independent pure-data reconstruction puts all five authored centrelines 100% on tarmac and finds
  **zero expanded-`world.blocks` intersections** on each. Counts are Downtown 76/76, Harbor 75/75,
  Palm Bay 77/77, Silver Lake 104/104, Mountain 87/87.
- The blocks named by the runtime are nowhere near the nominal routes. Harbor edge 741 is at least
  **610.541 m** from block 512 and **727.658 m** from block 529. Mountain edge 339 is at least
  **1654.247 m** from block 134. Those cannot be frontage walls intersecting the authored corridor;
  the follower drove hundreds of metres away before touching them.
- `tools/_s3c-drive.mjs:239-258` seeds `corridorBlocks` from the authored path and then adds every
  block hit by the driven trajectory into the same set, losing provenance. Its output therefore
  cannot distinguish “the route is obstructed” from “the driver left the route and later found a
  block.” Harbor taking 854 steps for 287.697 m versus Downtown's 400 for 302.014 m is evidence of
  that excursion, not evidence that block 512 or 529 obstructs edge 741.
- The same distinction was already accepted for `hud-overlay`: ending 14.6 m off-path at 214 km/h
  was controller corner-cutting, not a map defect. Here the effect is larger, but the attribution
  rule is the same. Off-tarmac samples measure `followPath` unless the probe first proves the
  authored corridor itself is bad; my reconstruction proves the opposite.

The pre-existing map debts remain real, but these five failures do not measure them. They are now
named and owned explicitly: **`digitise` owns a Paradise graph-coverage piece for the visible
untraced street grids; `generate-blocks` owns a `blocks.js` piece to split the 31 frontage AABBs
up to 432 m before they become collision walls.** Neither debt converts this probe to green.

### Round-2 product checks

`paths.city` is fixed. Independent reconstruction selected face 124 with edge ids
`421,422,435,467,485,500,523,568,593,564,540,507,426`; classes are exactly `arterial` and `street`,
with **zero service edges**. It has 82 controls, **998.889 m** curve length, **1.553 m** largest
sample gap, **0.000 m** endpoint closure, and **900/900** tarmac samples. Its source boundary is
997.887 m, all Downtown. Re-selecting old face 90 is a valid poison: it restores **7 disallowed
segments / 161.305 m** on service edges 323 and 369.

The fall from 1978.375 m to 998.889 m and from two districts to Downtown only is **acceptable but
weak coverage**: Round 2 explicitly made broader coverage desirable, not mandatory, and prioritized
purity, closure, and continuity. This is NON-BLOCKING.

The unchanged highway remains 94 controls, **1191.265 m**, **1.811 m** largest gap, and **900/900**
tarmac.

I independently re-derived all seven scene placements. Result: **7/7 tarmac, 0/7 inside any
1.0 m hero-expanded block**, with nearest expanded-block clearances respectively 17.761, 18.547,
10.125, 13.775, 13.058, 16.395, and 17.947 m. `crash-cam` is now on street edge 435, not service
edge 323.

Fresh literal/source checks:

- added `new THREE.*Material` expressions in `dfa3e98`: **0**; a synthetic added material changes
  the counter to 1;
- `game/traffic.js:89`: `POOL = 24`; `game/world.js:3343`: `NPC_DENSITY = 0.16`;
- `game/world.js:4349-4354`: graph bound derives from the document extent to **2000**, grid stays
  literal **1400**; `game/main.js:201` passes `world.bounds`;
- `game/world.js:4360` publishes graph `graphIdx.surfaceAt` and the unchanged grid query otherwise;
- the probe's limitation is honest: its header says it does not assert ribbon/junction contact,
  and `game/physics.js:1973` forces `state.pos.y = 0`.

`node --check game/world.js`, `node --check tools/_s3c-drive.mjs`, and `bash tools/lint.sh` freshly
exit 0 (`lint ok`).

### Findings

**BLOCKING — the drive probe is not strong enough to close the wave seam check.** Every district
route at `tools/_s3c-drive.mjs:34-38` is a single edge, 287.697-398.397 m, with two 200 m plane
crossings. A one-edge path is trivially connected but never traverses a graph junction, the most
likely seam site. More fundamentally, the acknowledged `pos.y = 0` limitation means it cannot see a
missing ribbon/junction or a render-mesh seam at all. This may be an honest `world.blocks` probe,
but it is not the map brief's built-surface seam check.

**BLOCKING — the baseline assertions confound driver error with world error.** The current probe
must exit 0 in baseline by its own header, yet exits 1 because `followPath` leaves known-good
centrelines. Until the probe preserves route-versus-driven provenance and uses controller behavior
that can stay on a verified route, its five failures cannot support a world verdict. A red poison
does not cure a false-red baseline.

**NON-BLOCKING — named pre-existing map debt.** Visible untraced streets belong to `digitise`; the
31 unsplit frontage AABBs belong to `generate-blocks`/`blocks.js`. They need their own pieces, but
the measured failures here are not evidence against either specific object.

### Checks I could not run

- Browser execution of baseline and both poisons: local bind fails at `127.0.0.1` with
  `listen EPERM`. I rely on the orchestrator's recorded exit codes and counts and do not claim them
  as my runs.
- Both-mode boot/console and scene renders: same socket restriction. I adopt only the supplied boot
  evidence (grid READY 7.1 s; graph `hud-overlay` 8.4 s and `wet-night-asphalt` 8.1 s; empty error
  slots), not an independent boot or pixel result.
- Render-side `heroDist` instance matrices/counts and grid compiled-program count: browser
  unavailable. Round 2 did not change that logic, but I do not claim a fresh runtime verification.
