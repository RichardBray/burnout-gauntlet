# wave T — `generate-mesh` S3c: `paths`, `heroDist`, `surfaceAt`, `bounds` under `#map=graph`

Decisions 7 and 8 of `tools/WAVE-T-GENERATE-PLAN.md`. Built in the main agent after two delegated
attempts failed (see §7).

## 1. BEFORE / AFTER, EVERY CONSTANT AND EVERY LITERAL TOUCHED

| what | file:line (after) | BEFORE | AFTER |
|---|---|---|---|
| world clamp | `game/physics.js:701` | `bounds = 1400` | `bounds = 2000` |
| path control spacing | `game/world.js:143` | *(did not exist)* | `const PATH_STEP = 15.0` |
| `paths` (grid) | `game/world.js:4202-4205` | `city: makePath(roundedRect(325, 325, 48, 8), true)`, `highway: makePath([[-1000, HZ+6.5], [-300, HZ+6.5], [400, HZ+6.5], [1000, HZ+6.5]], false)` | **UNCHANGED, byte for byte**; now reached as the `||` fallback of `graphPath` |
| `paths` (graph) | `game/world.js:1805` | *(did not exist)* | `graphPath = graphPaths(roadPlan, built.faces)` |
| `heroDist` under GRAPH | `game/world.js:3433-3442` | `if (GRAPH) return Infinity;` | nearest of `graphPath.city.samples` |
| `heroDist` under grid | `game/world.js:3443-3445` | rounded-box SDF, half-extent 277, radius 48 | **UNCHANGED** |
| `tryPark` clearances | `game/world.js:3448`, `PARK_OFF`, `JCLR = 16.5` | 16.5 / 2.8 / 4.6 | **UNCHANGED** — the plan says the clearance literals keep their values, only the shape of the driving line moved |
| surface query publication | `game/world.js:4328` | *(did not exist)* | `surfaceAt: GRAPH ? graphIdx.surfaceAt : surfaceAt` |
| surface query injection | `game/main.js:241` | `physics.setSurfaceQuery(surfaceAt)` | `physics.setSurfaceQuery(world.surfaceAt \|\| surfaceAt)` |
| module `surfaceAt` body | `game/world.js:66-79` | grid arithmetic over `LAYOUT` | **UNCHANGED**; only its header comment was rewritten, from "the swap has NOT happened" to how the swap is now selected |

**No `THREE.*Material` was added. `git diff` adds zero `new THREE.` calls of any material type.**
`POOL` in `traffic.js` and `NPC_DENSITY` in `world.js` are untouched. `game/scenes.js` is untouched.

## 2. THE CITY LOOP IS A PLANAR FACE, NOT A SEARCHED CYCLE. THIS IS THE ONE DESIGN CALL.

The demolition table asks for "the largest-area cycle in the `arterial` union `street` subgraph that
passes through downtown". A general largest-area cycle search is exponential, and it is also
**unnecessary**: `blocks.js` already walks every planar FACE of the graph, and a face's boundary IS
a closed cycle over road centrelines by construction. So the largest-area downtown face is the
largest-area downtown cycle — already computed, for free, out of a result S3b already pays 351 ms
for, and it **cannot leave the road network**.

Chosen: **face 90, downtown, 15.31 ha, 55 ring vertices, 1978 m** as `makePath` measures it. The
grid's `roundedRect(325, 325, 48, 8)` it replaces is ~2500 m, so the scale matches and the scenes'
existing `u` values still land in sensible places. Tie-broken on face id so the choice cannot depend
on face iteration order.

**THE RING IS DENSIFIED BEFORE IT IS SMOOTHED, AND THAT IS NOT COSMETIC.** `makePath` runs a
uniform Catmull-Rom of tension 0.5 *through* its control points, which **overshoots** at a sharp
corner between two long segments. Control points on the road therefore do NOT imply a curve on the
road, and an overshoot here is the hero spawning inside a building. Splitting every segment longer
than `PATH_STEP = 15.0` m makes the spline hug the polyline: 55 ring vertices become 157 control
points. This is why §4's check scans the 900 SAMPLES and not the control points — the control-point
version of that check is the vacuous one.

**The highway is short and that is the graph, not a defect here.** The 52 `motorway` edges are 20
connected components (S3b measured that). Exhaustive DFS over the subgraph — deterministic, because
both the edge scan and the adjacency lists are in id order — gives a longest simple chain of
**11 edges / 1190.5 m**, against the grid's straight 2000 m. Cost **1 ms**. `makePath` clamps `u` on
an open path, so both highway scenes still spawn correctly. Declared, not hidden.

## 3. `heroDist` IS A LINEAR SCAN, AND THE COST IS MEASURED, NOT ESTIMATED

The graph path is a polyline, so there is no SDF; the distance is the nearest of the path's 900
samples. **Measured in the page: 1042 calls, 12.9 ms total** under `#map=graph` on `hud-overlay`,
with `parkedCounts` `{rank: 0, queue: 1038, culled: 4}`. Not worth indexing at build time; the
comment in the code says so and carries the upgrade path if a caller ever runs it per frame.

**A FIRST DRAFT OF THAT COMMENT CLAIMED "4.0 ms over 1379 calls" BEFORE ANYTHING WAS MEASURED, AND
THAT IS EXACTLY THE FAILURE PERMANENT RULE 5 EXISTS FOR.** It was replaced with the numbers above
only after instrumenting the running page. Recorded because the bad version nearly shipped.

Only 4 of 1042 candidates are culled, because the graph's driving line is a 1978 m downtown loop
rather than a ring road round the whole world. That is the correct answer, not a weak one.

## 4. SEVEN SCENES SPAWN ON TARMAC — `tools/_s3c-spawn.mjs`, PASS 7/7

```
PASS dusk-highway-chase spawn [760.8,-470.8]  tarmac | end [393.5,-316.7] tarmac 15.2 m off path
PASS boost-blur         spawn [855.8,-463.5]  tarmac | end [413,-363.1]   tarmac  2.0 m off path
PASS crash-cam          spawn (placed directly) | end [1410.8,-236.3] tarmac
PASS wet-night-asphalt  spawn [1367.5,109.1]  tarmac | end [1287.9,52.3]  tarmac  1.0 m off path
PASS daytime-downtown   spawn [1026.9,-28.2]  tarmac | end [1146.4,-91.8] tarmac  9.0 m off path
PASS car-paint-closeup  spawn (placed directly) | end [431,-400.8] tarmac
PASS hud-overlay        spawn [1613.1,-86.6]  tarmac | end [1587.4,24.3]  DIRT   14.6 m off path
city 900/900 on tarmac (1978 m)   highway 900/900 on tarmac (1191 m)   [all seven scenes]
paths.stats {"faceId":90,"faceArea":153116.1,"cityPts":157,"hwEdges":11,"hwLen":1190.5,"hwPts":94}
```

**THE FIRST VERSION OF THIS CHECK REPORTED `hud-overlay` SPAWNING ON DIRT, AND IT WAS WRONG.** It
read `physics.state.pos`, but the harness can only be read after `window.__ready`, by which time
shot mode has already simulated up to 9.5 s of driving — so that position is where the car ENDED.
The probe now asserts the TRUE spawn, `paths[name].at(u)` for the `(path, u)` each scene hands
`cruise()` (transcribed from `scenes.js:91, :110, :169, :186, :231`), and reports the end position
separately. `crash-cam` and `car-paint-closeup` place the car directly and have no spawn row.

**HONEST AND NOT ASSERTED ON: `hud-overlay` ENDS ON DIRT, 14.6 m off the path**, after 7 s at
214 km/h round a 1978 m downtown loop with corners far tighter than the grid ring road's 48 m
radius. That is a handling result — `followPath` cutting a corner — not a map one, so gating this
check on it would fail it for the wrong reason. It is a real thing a player would feel and it is
`rewire`/`feel`'s, not S3c's. **The scene will screenshot with the off-road penalty active**; watch
for it at S3d.

## 5. `#map=grid` IS UNCHANGED — PAIRED A/B, ALL SEVEN

A = `f2bbf6e` (the post-hotfix HEAD), B = this tree, `tools/_pxdiff.mjs`:

| scene | maxd | % | mean |
|---|---|---|---|
| dusk-highway-chase | 4 | 0.0060% | 0.0001 |
| boost-blur | 1 | 0.0042% | 0 |
| crash-cam | 1 | 0.0015% | 0 |
| wet-night-asphalt | 29 | 0.0046% | 0.0001 |
| daytime-downtown | 18 | 0.0114% | 0.0002 |
| car-paint-closeup | 1 | 0.0004% | 0 |
| hud-overlay | 1 | 0.0044% | 0 |

`daytime-downtown`'s maxd 18 was checked rather than assumed: **the same tree rendered twice gives
maxd 18 at 0.0116%**, identical. `STATE.md`'s recorded floor of "maxd 9" for that scene is stale in
the same way `wet-night-asphalt`'s "maxd 4" was; both are corrected there. This is expected — the
grid branch's literals are byte-identical, `bounds` cannot bind on a 1.1 km world, and
`world.surfaceAt` on the grid path is the same function object it always was.

## 6. T4 AND THE DRIVE RESULT

`node tools/_t4-surface.mjs --grid` — **T4 OK**, unchanged: 9/9 classifications correct, penalty
12.5% dry / 10.5% boost (target band 10-15%), largest single-frame speed step 0.031 m/s,
`surfaceAt` 0.0352 us/call.

Graph mode: **all 9 classifications correct** (centreline / ribbon edge / shoulder / kerb face
tarmac, past-the-kerb dirt, junction tarmac, mid-block dirt, open ground dirt, interstate tarmac)
and penalty **13.7% dry / 11.7% boost, inside the band**. `surfaceAt` costs **0.7541 us/call**
against grid's 0.0352 — 21x, and still 0.00075 ms of a 16.7 ms frame at one call per frame.
The tool nevertheless prints `T4 FAIL`, on its transition test only: the probe drives off the
tarmac at 58 m/s and the trace shows speed collapsing 58.7 -> 14.8 m/s in one frame at t 3.2 s, i.e.
**it hit a building.** That is a probe-placement problem — on the graph map "straight off the road"
is not open ground — and NOT a physics defect. **It is also not my code to fix: `_t4-surface.mjs`'s
graph mode was written by a concurrent agent, not by me (see §7), and I have not verified it.**

The drive evidence for S3c is §4's: seven scenes each driving up to 9.5 s of real simulated
kilometres under `#map=graph`, six of seven finishing on tarmac, no scene clamped by `bounds`.
**The full drive probe the brief specifies — one route per district, crossing every chunk boundary,
asserting on the built COLLISION GEOMETRY — is deliberately NOT claimed here.** It needs the chunk
boundaries `stream` has not built yet, and it belongs to `stream`/`rewire`.

## 7. TWO PROCESS FAILURES, BOTH WORTH MORE THAN THE CODE

**A DELEGATED BUILDER FAILED TWICE AT THE CLI LEVEL, NOT THE QUALITY LEVEL.** `grok-4.5` via the
courier was given the full S3c spec; both runs died after printing four lines of preamble, the
second with exit code 1, having made zero edits. That is a harness failure, so "tighten the prompt
and rerun" does not apply — and S3c's core is a graph algorithm, which the driver brief already
says to keep in the main agent. It was built here instead. **Delegation overhead on this piece was
8 minutes for nothing.**

**AND THEN A SECOND AGENT WORKED ON S3c CONCURRENTLY WITH ME, WHICH THE CONCURRENCY RULE FORBIDS.**
Partway through this piece `tools/_t4-surface.mjs` changed on disk *while I was running it*, and
`tools/BRIEF-S3C.md`, `tools/BRIEF-S3C-CRITIC.md` and `tools/_s3c-check.mjs` appeared in the tree —
none of them mine. An `opencode` (glm-5.2) process was found still running. **`game/world.js` was
verified byte-identical (md5 `7e22417c60aa08a0c5feb7cf878ba99b`) to my own saved copy before
committing**, so this build is uncontaminated, but that was luck: two writers on `world.js` would
have silently destroyed one side. **This commit deliberately contains only my own files.** The
foreign files are left in the working tree, uncommitted and unverified, for the user to judge.

## ROUND 2

Round 2 fixes only the two critic blockers: the city circuit is arterial/street-only, and
`tools/_s3c-drive.mjs` is now the required built-collision probe. Round-1's re-verified constant
table is untouched.

### Literals introduced or changed

| item | BEFORE | AFTER literal and file:line |
|---|---|---|
| city allowed classes | absent; all Downtown faces eligible | `new Set(['arterial', 'street'])`, `game/world.js:158` |
| chunk plane | absent | `const CHUNK = 200`, `tools/_s3c-drive.mjs:21` |
| collision corridor radius | absent | `const HERO_RADIUS = 1.0`, `tools/_s3c-drive.mjs:22` |
| physics call step | absent | `const FIXED_DT = 1 / 60`, `tools/_s3c-drive.mjs:23`; physics internally uses its real 1/240 substep |
| route start speed | absent | `const START_SPEED = 15`, `tools/_s3c-drive.mjs:24` |
| follower lookahead | absent | `const LOOKAHEAD = 20`, `tools/_s3c-drive.mjs:25` |
| route-end radius | absent | `const END_RADIUS = 10`, `tools/_s3c-drive.mjs:26` |
| boundary crossing tolerance | absent | `const BOUNDARY_TOLERANCE = 18`, `tools/_s3c-drive.mjs:27` |
| stuck threshold | absent | `const STUCK_SPEED = 2`, `const STUCK_SECONDS = 2`, `tools/_s3c-drive.mjs:28-29` |
| authored routes | absent | Downtown `[595,447]`, Harbor `[741,567]`, Palm Bay `[94,71]`, Silver Lake `[100,77]`, Mountain `[339,253]`, `tools/_s3c-drive.mjs:33-39` |

`PATH_STEP = 15.0` at `game/world.js:143`, grid paths at `game/world.js:4235-4236`,
`POOL = 24` at `game/traffic.js:89`, and `NPC_DENSITY = 0.16` at `game/world.js:3343`
are unchanged. Round-2 adds zero `new THREE.*Material` expressions and zero materials.

### Class-pure city circuit and path measurements

The old selector admitted any face whose majority district was Downtown and chose face 90. The new
selector joins every face segment to its source graph edge, rejects missing/disallowed segments,
then chooses the largest remaining Downtown face with the same deterministic area/id ordering.

Chosen face **124**: edge ids
`421,422,435,467,485,500,523,568,593,564,540,507,426`; classes exactly
`arterial,street`; source boundary **997.887 m**. Boundary by district: Downtown **997.887 m**;
Harbor/Palm Bay/Silver Lake/Mountain **0.000 m**. A broader pure closed circuit was not available;
purity, closure and continuity take precedence as the round-2 brief requires.

Independent pure-Node reconstruction of Three's Catmull-Rom/arclength sampling from
`game/map/*.js`: city **82 controls, 900/900 tarmac, 998.889 m curve, 1.553 m largest consecutive
sample gap, 0.000 m endpoint closure**. Unchanged highway: **94 controls, 900/900 tarmac,
1191.265 m, 1.811 m largest gap**.

### Seven revised spawn points

Block clearance is against every `world.blocks` AABB expanded by the 1.0 m hero radius.

| scene | x,z m | surface / nearest edge | paved margin | expanded-block overlaps / clearance |
|---|---:|---|---:|---:|
| dusk-highway-chase | 760.85,-470.76 | tarmac / motorway 184 | 15.000 m | 0 / 17.761 m |
| boost-blur | 855.79,-463.55 | tarmac / motorway 199 | 15.000 m | 0 / 18.547 m |
| crash-cam | 1070.37,75.16 | tarmac / street 435 | 10.791 m | 0 / 10.125 m |
| wet-night-asphalt | 994.77,333.80 | tarmac / street 568 | 9.965 m | 0 / 13.775 m |
| daytime-downtown | 925.52,213.98 | tarmac / street 507 | 10.000 m | 0 / 13.058 m |
| car-paint-closeup | 431.04,-400.76 | tarmac / motorway 251 | 15.000 m | 0 / 16.395 m |
| hud-overlay | 1053.05,193.73 | tarmac / street 500 | 9.658 m | 0 / 17.947 m |

Result: **7/7 tarmac, 0/7 in an expanded block**. `crash-cam` moved off service edge 323.

### Built-collision drive probe

`tools/_s3c-drive.mjs` boots the real `#map=graph` WebGL world, pauses the live loop, disables only
traffic/parked-car contacts, and drives real physics with `followPath` and `step(1/60)`. It authors
routes from graph edge ids, validates district/orientation/chain connectivity, enumerates each
route's 200 m plane intersections, and exits non-zero for end/stuck/bounds/surface/block-corridor/
boundary failures. It never writes the car position after the initial `reset`; there is no road snap
or teleport.

Pure-data route preflight: Downtown edge 595 **302.014 m / 2 boundaries / 76/76 tarmac**; Harbor
741 **287.697 / 2 / 75/75**; Palm Bay 94 **294.619 / 2 / 77/77**; Silver Lake 100
**398.397 / 2 / 104/104**; Mountain 339 **337.008 / 2 / 87/87**. Total **1619.735 m,
10 boundaries, 0 source-corridor intersections with expanded built blocks**.

**Probe written, not executed, blocked by listen EPERM.** Baseline, `--poison=wall`, and
`--poison=sever` each failed before Chromium launch at `listen EPERM 127.0.0.1`; their status 1 is
an environment failure, not claimed as a probe-red result. The orchestrator must run all three.

The wall poison appends a 14 x 14 m AABB across Downtown's authored route; the sever poison appends
edge 598 at the wrong node after edge 595. Pure-data controls made the common predicates red:
the wall intersects the 1.0 m route corridor and the sever fails chain continuity. Further controls:
reselecting old face 90 restores **161.305 m** of disallowed boundary on service edges 323/369;
substituting block 0 centre `[-982,-1298]` makes path tarmac **899/900** and spawn overlap **1**;
shifting one sample by 500 m raises max gap from **1.553 m to 500.553 m**.

### Honest limitation and remaining runtime checks

This probe asserts on `world.blocks` collision and `surfaceAt` continuity along authored graph
routes; it does **NOT** assert ribbon/junction mesh contact, because physics has no such signal
(`game/physics.js:1973` forces `pos.y = 0`). That gap is real, named, and belongs to a later piece.
The baseline drive, wall poison, sever poison, both-mode boot/console, and grid pixels remain
unexecuted solely because localhost binding is denied. The grid path literals are unchanged and the
new product selection executes only behind `GRAPH` at `game/world.js:1834-1837`; no pixel pass is
claimed.

`node --check game/world.js`, `node --check tools/_s3c-drive.mjs`, and `bash tools/lint.sh` all exit
0 (`lint ok`). No frame-time number was taken or reported.

## ROUND 3

Round 3 changes only `tools/_s3c-drive.mjs`: it fixes the probe's attribution and replaces the five
single-edge routes with connected three-edge chains. `paths.city`, `paths.highway`, and everything
under `game/` are untouched.

### Authored routes: pure-data preflight

The same path construction, 4 m sampling, `createRoadGraph(doc).surfaceAt`, `createBlocks(doc)`,
1.0 m hero expansion, and 200 m plane enumeration used by the probe were run in pure Node before
any browser driving. Every chain is connected; “junctions” counts the two distinct shared nodes.

| district | edge ids in order | length m | junctions | chunk boundaries | tarmac | expanded block hits |
|---|---|---:|---:|---:|---:|---:|
| Downtown | 602, 904, 903 | 128.255 | 2 | 2 | 34/34 | 0 |
| Harbor | 925, 924, 792 | 132.525 | 2 | 2 | 35/35 | 0 |
| Palm Bay | 447, 431, 404 | 135.732 | 2 | 3 | 35/35 | 0 |
| Silver Lake | 126, 135, 151 | 125.685 | 2 | 2 | 33/33 | 0 |
| Mountain | 806, 813, 832 | 137.713 | 2 | 2 | 36/36 | 0 |

Route literals changed from one `[edge,entry]` pair per district at old lines 34-38 to the three
pairs per district at `tools/_s3c-drive.mjs:41-45`. The only new numeric literal is
`DRIVER_POISON_OFFSET = 120` m at `tools/_s3c-drive.mjs:36`; all existing strictness constants are
unchanged.

### WORLD versus DRIVER provenance

`worldFailures` is populated only during the all-route preflight at `tools/_s3c-drive.mjs:216-303`:
edge existence/district/orientation, connected chain, at least two junctions and chunk boundaries,
100% authored-sample tarmac, and zero expanded-`world.blocks` intersections. Any WORLD failure
returns before physics drives. No world assertion was deleted or loosened.

`driverFindings` is populated only from the driven trajectory at
`tools/_s3c-drive.mjs:305-365`: end progress, stuck time, bounds, driven `surfaceAt`, driven block
contacts, crossed planes, and exact polyline lateral distance. Each route result always includes
`driver.maxLateralDeparture` in metres. Baseline DRIVER findings are loud diagnostics but nonfatal;
they can never become WORLD failures. Only the explicit driver poison finding is fatal.

### Baseline and poisons

**Probe written, not executed, blocked by listen EPERM.** The probe and all four browser modes need
WebGL-built `world.blocks`; I did not fake a run, add a Node fallback, or claim an exit result.

| invocation | authored mechanism / pure-data control | browser result here |
|---|---|---|
| baseline | clean WORLD preflight above; runtime reports every route's max lateral departure | not executed |
| `--poison=wall` | 14 x 14 m block at Downtown u=0.52; pure data hits 3 authored segments | not executed; designed WORLD red / exit 1 |
| `--poison=sever` | appends edge 598 at node 450 after route exit node 476; connectivity is false | not executed; designed chain red / exit 1 |
| `--poison=driver` | one 120 m lateral shove of physics state; never mutates world data | not executed; designed fatal DRIVER finding / exit 1 with zero WORLD failures |

Fresh local checks: `node --check tools/_s3c-drive.mjs`, `node --check game/map/graph.js`,
`node --check game/map/blocks.js`, and `bash tools/lint.sh` exit 0 (`lint ok`). The patch adds zero
materials and changes no files under `game/`; protected `POOL = 24` and `NPC_DENSITY = 0.16` remain
untouched. No frame-time number or visual wave was opened.

### Honest limitation

The probe still cannot see a missing road ribbon or a ribbon/junction render-mesh seam. Physics has
no ground-contact signal against road triangles, and `game/physics.js:1973` forces
`state.pos.y = 0`. This remains a real, explicitly uncovered gap; the probe makes no contrary claim.

## ROUND 4

Round 4 changes only the probe and this required verdict append. It preserves the five authored
three-edge routes, their boundary enumeration, the WORLD/DRIVER provenance split, every WORLD
assertion, and `BOUNDARY_TOLERANCE = 18` exactly.

### Cause and fix

The three Round-3 misses were all final route boundaries. Their distances before the route end are:
Harbor **2.77 m**, Palm Bay **5.29 m**, and Mountain **6.64 m**. The old completion test used
`END_RADIUS = 10`, so it declared each drive complete before the car reached its last plane.

`tools/_s3c-drive.mjs` changes `const END_RADIUS = 10` **BEFORE** to
`const END_RADIUS = 2` **AFTER**. This does not change a boundary, route, follower, tolerance, or
car position. It makes the real physics drive continue far enough to cross each final plane.

A missed boundary now calls `findDriver(..., true)`. It is therefore baseline-fatal while remaining
a DRIVER finding with no code path into `worldFailures`. The explicit driver poison remains a fatal
DRIVER finding and still does not mutate authored/world data.

### Pure-Node trajectory check

I reconstructed the probe's exact graph polylines, 200 m boundary enumeration, crossing predicate,
and real `createPhysics().followPath(path, 20)` integration at 1/60 s with 15 m/s start speed. No
position was written after `reset`, no boundary was removed or widened, and no route was shortened.

| route | enumerated | physically crossed |
|---|---:|---:|
| Downtown | 2 | 2 |
| Harbor | 2 | 2 |
| Palm Bay | 3 | 3 |
| Silver Lake | 2 | 2 |
| Mountain | 2 | 2 |

All five trajectories reached the route end under the new 2 m completion radius. Fresh static
checks: `node --check tools/_s3c-drive.mjs`, `node --check game/map/graph.js`, and
`node --check game/map/blocks.js` exit 0.

**Probe written, not executed, blocked by listen EPERM.** I did not run or claim baseline,
`--poison=wall`, `--poison=sever`, or `--poison=driver` browser results. The orchestrator must run
all four modes against the WebGL-built world. No visual wave was opened and no frame-time number was
taken or reported.
