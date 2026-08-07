# wave T - `generate-mesh` S2. The lattice, and per-thing seeding.

S2 of `tools/WAVE-T-GENERATE-MESH-PLAN.md:838-843`, built against section 5.

One sentence: the city is now built into a 200 m lattice of 50 cells, and every random draw in it is
seeded from **where the thing is** rather than from **when it was visited**.

**This is the step where pixels legitimately move.** They moved. Section 5 says by how much, says
which scene got worse, and does not claim parity.

## 1. THE LITERALS

| what | BEFORE | AFTER |
|---|---|---|
| the global stream | `const R = makeRng(0xC0FFEE)` (`world.js:1064` at `c31cb1b`) | `let R = makeRng(0xC0FFEE)` at `game/world.js:1071`, **nulled at `game/world.js:1842`** |
| `createWorld` signature | `(scene, { rng: injectedRng, roadKit })` | `(scene, { roadKit })` at `game/world.js:1062` |
| `neonSign` bar offset | `(injectedRng() - 0.5)` | `(rng() - 0.5)` at `game/world.js:2512` |
| `CHUNK` | `200` | `200` at `game/world.js:1211` - unchanged, now the OWNERSHIP granularity too |
| `CHUNK_MIN` | `400` | `400` at `game/world.js:1324` - unchanged |
| `POOL`, `NPC_DENSITY` | `10`, `0.16` | unchanged |
| sign texture seed | `makeSign(R, ...)` | `makeSign(makeRng(cellHash(v, 0, S_TEX)), ...)` at `game/world.js:2187` |
| awning texture seed | `makeAwningTex(R)` | `makeAwningTex(makeRng(cellHash(1, 0, S_TEX)))` at `game/world.js:2294` |
| frond texture seed | `makeFrondTex(R)` | `makeFrondTex(makeRng(cellHash(2, 0, S_TEX)))` at `game/world.js:2699` |

### The seed function and its salts

`game/world.js:1082`:

```js
const atRng = (x, z, salt) => makeRng(cellHash(Math.round(x * 8), Math.round(z * 8), salt));
```

x8 before rounding is 12.5 cm resolution - finer than anything here is placed to, coarse enough
that a float differing in its last bit still hashes the same.

| salt | `file:line` | owns |
|---|---|---|
| `S_BLOCK = 0xB10C` | `game/world.js:1085` | a block's towers - **plan section 5 verbatim** |
| `S_NODE  = 0x10DE` | `game/world.js:1086` | junction dressing - **plan section 5 verbatim** |
| `S_EDGE  = 0xED6E` | `game/world.js:1087` | road-segment dressing - **plan section 5 verbatim** |
| `S_WALL  = 0x5EA1` | `game/world.js:1088` | a block's perimeter street wall |
| `S_FRONT = 0xF00D` | `game/world.js:1089` | one street frontage's signage |
| `S_ROOF  = 0x50FA` | `game/world.js:1090` | a tower's rooftop billboard |
| `S_NEON  = 0x0E04` | `game/world.js:1091` | a tower's neon |
| `S_PROP  = 0x9309` | `game/world.js:1092` | a block's pavement furniture |
| `S_TEX   = 0x7E88` | `game/world.js:1093` | texture canvases baked after the first emitter runs |

The plan's per-edge/per-node rules are `cellHash(e.id, 0, salt)`. The OLD world has no graph and no
edge ids, so the analogue is the thing's own coordinates: a road segment is keyed on its midpoint, a
junction on its intersection. When `generate-wire` puts the graph in, those two become `e.id` and
`n.id` verbatim and nothing else moves.

**112 `R` references inside 12 top-level loops** were replaced with a scoped, position-seeded
stream. The 20 emitters already took `rng` as an argument from S1, so their bodies did not change at
all - only what is handed to them.

### `R` is nulled, not just discouraged

`game/world.js:1842`, immediately after the last texture canvas is baked. The plan suggested
shadowing it; `let` + `R = null` is the same intent and it means a surviving `R(...)` throws
`R is not a function` at boot rather than silently reintroducing a build-order dependency that
nothing would notice until a cell rebuilt differently.

That required a prior fix, and it is worth stating because it is the kind of thing that would
otherwise have been written off as "the re-seed changed it": **three texture makers ran AFTER the
first emitter** - `makeSign` x12, `makeAwningTex`, `makeFrondTex`. On the shared stream their canvas
content depended on how many buildings the city happened to have. They now take their own
`cellHash`-derived streams, so adding a 13th sign cannot change the first twelve. The five texture
makers that run before any emitter (`makeConcrete`, `makeFacade` x4, `makeStorefront`, `makeMechTex`,
`makeShopIntTex`) still draw from `R` in the same order and are **byte-identical** to S1.

### The lattice

`push()` already received the position, so the cell routing went there and **not one of the 145
call sites moved**. `pushMat` reads the cell from the matrix's own translation. A pool is now a
`THREE.Group` HANDLE (`game/world.js:1257`) carrying only the draw state; the instances live in
per-cell descriptors (`game/world.js:1238`) hanging off it, and each `ChunkRec`
(`game/world.js:1220`) keeps an explicit list of the meshes it owns so per-cell teardown needs no
tree containment. Parenting stays by pool so `spillMesh.visible` and `world.aoExclude` keep working.

`finalize()` (`game/world.js:1347`) allocates one mesh per (cell, draw state) for draw states above
`CHUNK_MIN`, and one map-wide mesh per draw state below it.

## 2. DETERMINISM - THE HEADLINE

Every instance in the world, harvested with its **own world position** deciding which cell it counts
against (not the mesh name, which could lie), grouped by cell and draw state, sorted canonically,
compared with `Object.is` over all 19 values per instance (16 matrix + 3 colour).

**50 cells. 3,816,986 values compared per run. Seven runs.**

| run | instances | cells | values compared | **differing** |
|---|---|---|---|---|
| rebuild, same order | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0x5EED` | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0xA11CE` | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0xBEEF` | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0x1234` | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0xFFFF` | 200,894 | 50 | 3,816,986 | **0** |
| permuted `0x7` | 200,894 | 50 | 3,816,986 | **0** |

**Poison control.** A comparator reporting zero has to be shown capable of reporting non-zero. One
matrix element of one instance in the densest cell perturbed by `1e-4`: **1 differing value, 1 cell
flagged.** The comparator has teeth.

Coverage: all 50 cells, every run. Densest `-1,0` at 11,258 instances; sparsest `6,-4` and `-7,-4`
at 4 each; `5,-4` at 66 and `-6,-4` at 69. `residentCells === 50` and **every resident cell has
geometry** - `emptyResidentCells === 0` - so the cell count is not padded with empty records.

### Order-independence, and what it caught

`visitOrder()` (`game/world.js:1102`) shuffles every top-level population when
`globalThis.__t3Perm` is set, and is inert otherwise. 17 call sites. This is the test that
distinguishes real per-thing seeding from a seed that merely looks positional, because a
visit-order-dependent seed passes build/rebuild and fails this.

**It caught a real bug on the first run** - 12 differing values in 2 cells, and they were not a
seeding artefact:

`streetLight()` needs `dummy.rotation.order === 'XYZ'` for the lamp's bulb panel, because the
rotation has an X component `push()` cannot express. The order was set once by the CALLER before the
lamp loops - but the last line of `streetLight` set it back to `'YZX'`. So **only the first of the
288 lamps was ever built with the order it needs.** The two are not cosmetically equivalent: the
measured matrices differ by a sign flip in two columns. Under `'XYZ'` the panel normal is `(0,-1,0)`,
facing DOWN at the street, which is what a lamp's luminous underside is for. Under `'YZX'` it is
`(0,+1,0)`, facing the sky - and `lampMat` is `FrontSide`, so **287 of the 288 lamp panels were
invisible from the road.**

The permutation test found it because which lamp came *first* depended on visit order. Fixed at
`game/world.js:2553` by having `streetLight` set and restore the order itself, so there is nothing
for a caller to arrange and nothing for a future caller to forget. All 288 panels now face down.

This is the honest positive control for the whole exercise: the test was not run to confirm a belief,
and it did not.

### What this does NOT yet prove

The plan's literal check is "build a cell, dispose it, build it again". `buildChunk` /
`disposeChunk` do not exist yet - they are S4 - so a single cell cannot be torn down and rebuilt in
isolation today. What is proven is the property those functions will depend on: **each cell's
content is a pure function of its own coordinates and of nothing else**, established by seven
independent builds including six with the population order shuffled. The remaining gap is plumbing,
not seeding, and it should be re-checked at S4 rather than assumed.

## 3. THE COUNTS

`world.chunkStats()`, measured live:

| | S1 | S2 |
|---|---|---|
| `residentCells` | 1 | **50** |
| cell meshes | 1272 | 1276 |
| map-wide meshes | 20 | 20 |
| total meshes | 1294 | 1298 |
| instances | 199,311 | 200,894 (+0.8%) |
| triangles | 2,321,910 | 2,350,858 (+1.2%) |
| `overflow.n` | 0 | **0** |
| geometries | 28 | 28 |

50 cells rather than the plan's "about 36": 36 is the 1.1 km core at 200 m, and the old world also
puts the highway at `z = -700`, its pier row from `x = -1300` to `+1340` and its billboard row out to
`x = +-1000`, which occupy the other 14.

### Draw calls and programs

Same method as S1 - `info.autoReset = false`, one warm `composer.render()`, then five more.

| scene | draw calls S1 -> S2 | triangles S1 -> S2 | programs | geometries |
|---|---|---|---|---|
| daytime-downtown | 1372 -> **1362** | 2,430,910 -> 2,447,590 | 131 -> **131** | 392 -> 392 |
| wet-night-asphalt | 2127 -> **2133** | 3,728,574 -> 3,919,136 | 132 -> **132** | 463 -> 466 |
| dusk-highway-chase | 663 -> **674** | 905,134 -> 935,998 | 131 -> **131** | 392 -> 392 |

Within 1.7% on every scene. **Zero new materials and zero new programs, verified with a live program
count.** The three extra geometries at wet-night are the three extra neon smears from 69 neons
becoming 72.

## 4. IS ANYTHING MISSING? NO - IT IS A RESHUFFLE

Before judging the pictures, the populations, S1 against S2, per pool:

| pool | S1 | S2 | delta |
|---|---|---|---|
| all 12 sign variants | 6,708 | 6,582 | **-1.9%** |
| `gridMesh` (mullions) | 75,808 | 76,900 | +1.4% |
| `capMesh` | 16,548 | 16,634 | +0.5% |
| `awnMesh` | 10,188 | 10,330 | +1.4% |
| `shopMesh` | 10,480 | 10,580 | +1.0% |
| `carBody` / parked cars | 382 / 191 | 366 / 183 | -4.2% |
| `towers` | 115 | 114 | -0.9% |
| `slPole` / `slBulb` / `tlPole` | 288 / 288 / 98 | 288 / 288 / 98 | **0%** |
| `blocks` | 36 | 36 | **0%** |
| total instances | 199,311 | 200,894 | +0.8% |

Nothing thinned. The largest swing is a 4.2% dip in parked cars and a 17.9% / -15.6% swap between
brick and office shaft styles, both of which are dice.

## 5. THE SEVEN SCENES. NOT PARITY, AND ONE IS WORSE

Against the same-tree noise floor from S0/S1 (this renderer is not byte-deterministic; the floor is
the HEAD-vs-HEAD column).

| scene | noise floor | S2 vs S1 | judgement |
|---|---|---|---|
| dusk-highway-chase | maxd 5, 0.004% | maxd 125, **7.7%** of pixels, mean 0.57 | neutral |
| boost-blur | maxd 1, 0.002% | maxd 145, **8.3%**, mean 2.88 | neutral |
| crash-cam | maxd 2, 0.003% | maxd 204, **38.6%**, mean 10.05 | neutral - healthy frame, good shopfront colour |
| wet-night-asphalt | maxd 4, 0.003% | maxd 213, **97.0%**, mean 36.29 | **better** |
| daytime-downtown | maxd 10, 0.011% | maxd 216, **85.9%**, mean 41.64 | **WORSE** |
| car-paint-closeup | maxd 2, 0.002% | maxd 134, **31.4%**, mean 4.63 | neutral - the car is unchanged, the background re-rolled |
| hud-overlay | maxd 1, 0.002% | maxd 212, **46.7%**, mean 12.02 | neutral |

Every one of these is orders of magnitude above the noise floor. That is the point of the step and
it is not a defect.

**`wet-night-asphalt` is better.** Denser and more legible signage down both walls, more saturated
shopfront interiors, the overhead gantry now reads, and the lamp panels are visible for the first
time - 287 of them were facing the sky.

**`daytime-downtown` is worse, and I am not going to talk around it.** The S1 frame had three large
cantilevered billboards in the near field carrying the left wall; the S2 draw put none there, so the
near third reads flatter and greyer, and a long guard rail now dominates the left kerb where planters
and a sign used to be. Nothing is missing globally - signage is down 1.9% across the map - this
camera simply landed on a stretch that drew badly.

The salts are free parameters. Re-rolling `S_FRONT` would very likely restore a big near-field board
on this camera, and I have deliberately **not** done that, because picking a salt by looking at one
screenshot is tuning the seed to the test and the next camera would pay for it. If the coordinator
wants that trade it is a one-line change at `game/world.js:1089`; it should be a decision, not
something I quietly did.

## 6. CHECKS RUN

- `bash tools/lint.sh` -> `lint ok`.
- All seven scenes render `ok`, exit 0. `tools/shot.mjs` fails the run on any console error or
  pageerror; there were none. The page was booted, not just linted.
- `chunkStats().overflow` = `{ n: 0, pools: {} }`.
- Program count read live per scene: unchanged.

No frame-time number is reported. Peer agents are running.

## 7. WHAT S3 INHERITS

- `atRng(x, z, salt)` becomes `cellHash(e.id, 0, S_EDGE)` / `cellHash(n.id, 0, S_NODE)` the moment
  the graph supplies ids. The salts do not change.
- `R` is dead after `game/world.js:1842`. Any emitter that reaches for it throws at boot.
- **Flagged, not inherited silently:** a map-wide mesh (a draw state under `CHUNK_MIN`) has no owning
  cell and therefore no dispose path. Correct while the whole world is resident, wrong once cells
  stream. The note is in the code at the map-wide branch of `finalize()`. It belongs to S4.
- `visitOrder()` stays. It costs nothing when `__t3Perm` is unset and it is the only thing standing
  between "the seed is positional" and "the seed looks positional", which this step has now shown is
  a distinction with a bug behind it.
