# wave T - `generate-mesh` S3b. The city on the graph.

S3b of `tools/WAVE-T-GENERATE-MESH-PLAN.md:855-859`, built against section 5 and risks 12, 13 and 16.

## WHAT IS NOT DONE. FIRST, BECAUSE THE LAST TWO BUILDERS LED WITH IT AND WERE RIGHT.

1. **TWO OF THE SEVEN SCENES DO NOT REACH `window.__ready` UNDER `#map=graph`.** Five do, in
   3.9-6.7 s; `hud-overlay` and `wet-night-asphalt` do not, in 240 s and 300 s respectively, with
   no console error and no page error. **`#map=grid`, the default and the gate, boots and renders
   all seven.** It is caused by this change - the S3a tree boots `hud-overlay` under `#map=graph`
   in 3.9 s on the same harness. Six kill-controls narrow it to the per-edge / per-node street
   furniture and rule out `world.blocks`, the night switch, the wet switch and the parked
   population. I did not get it to a line. Section 9, and it is the first thing S3c should do.
2. **`heroDist` returns `Infinity` under `#map=graph`** (`game/world.js:3339`), so nothing is culled
   away from the hero's driving line. That is deliberate and it is S3c's to close: `paths.city` is
   still the grid's `roundedRect(325, 325, 48)` and culling the parked population against a ring
   road that does not exist in this city would carve a 277 m ring of missing cars for no reason.
3. **The pier row is SMALLER than the grid's**: 7 piers over 500 m of deck against 44 over 1400 m.
   Not dropped, not silently reduced - the graph's motorway is twenty disconnected components and
   there is no 2.4 km of freeway to put it beside. Section 6.
4. **31 frontage strips up to 432 m are still single AABBs.** `blocks.js` was NOT edited. The fix
   used here is on the mass grid, in `world.js`, and is described in section 3.
5. **`renderer.info.programs` under `#map=graph` is 180 against 101 at S3a.** Zero materials were
   added and I can show it three ways; 39 of the 79 are a second point-light-count variant. Section 7.
6. No frame-time number is reported. Peer agents may be running.

```progress-metrics
grid seven-scene gate: every scene at or under its own same-tree noise floor, worst maxd 8 at 0.0097%
determinism: 191 cells, 1191271 instances, 6 runs (1 rebuild + 5 shuffled), 0 differing cells
value-by-value: 1697327 values in the 6 densest cells, 0 differing, poison control fires
programs: grid 131 (unchanged), graph 101 -> 180, zero new materials, scene material count 133 vs grid 187
risk 12 from the building side: 0 of 4786 shaft masses and 0 of 4542 podiums outside a block AABB
world.blocks 868, world.blockIndex published, chunkStats().overflow.n = 0
```

## 1. WHAT LANDED, WITH `file:line`

| deliverable | where |
|---|---|
| `blocks` filled from `createBlocks(doc).blocks`, canonical `sort by (cx, cz)` | `game/world.js:1744-1751` |
| `createBlocks` hoisted so it is called ONCE (it costs 351 ms) | `game/world.js:1705-1710` |
| the five district profiles, replacing `downtown` | `game/world.js:2223-2263` |
| palm share, keyed on the district id and NOT on the profile | `game/world.js:2277-2278` |
| `profileOf(b)`, and the `#map=grid` radius fallback | `game/world.js:2286-2287` |
| the block-sized mass grid | `game/world.js:2302-2306` |
| tower loop on the profile | `game/world.js:2334-2363` |
| street wall on the profile, plus the depth clamp | `game/world.js:2428-2451` |
| per-edge lamps, road wear, parked ranks | `game/world.js:3643-3706` |
| per-node signals, crossings, gantries, one signal queue | `game/world.js:3708-3752` |
| motorway gantries, billboard row, guard rail, jersey barrier | `game/world.js:3754-3800` |
| the overpass deck and pier row (risk 16) | `game/world.js:3802-3888` |
| neon wet smears batched under `#map=graph` | `game/world.js:4060-4095` |
| `world.blockIndex` published | `game/world.js:4210-4215` |
| `chunkStats().content` / `.furniture` / `.smears` | `game/world.js:3990-4005` |
| determinism + order-independence harness | `tools/_s3b-determinism.mjs` |
| boot / probe / render tool | `tools/_cityshot.mjs` |
| pixel diff | `tools/_pxdiff.mjs` |

`game/map/blocks.js`, `game/map/graph.js`, `game/map/pavement.js`, `game/map/ribbons.js`,
`game/map/paradise.json`, `game/road.js`, `game/scenes.js`, `game/traffic.js` and `game/physics.js`
were NOT modified. `game/world.js` is the only existing file edited. Every edit is anchored on a
unique comment; **no pattern-matching edit was made anywhere**, which is the rule S3a paid a full
revert for.

## 2. THE FIVE DISTRICT PROFILES: BEFORE AND AFTER, LITERAL FOR LITERAL

`const downtown = (b) => Math.hypot(b.cx, b.cz) < 260;` at `game/world.js:2186` (pre-S3b) is
**DELETED**. The radius test survives in exactly one place - the `#map=grid` fallback inside
`profileOf` at `game/world.js:2286` - because a grid block has no `district` and the default path
must not move.

### `downtown` and `palmbay` reproduce the old branches expression for expression

| what | BEFORE (`file:line` at `e7967c6`) | AFTER (`file:line`) |
|---|---|---|
| tower base h, inner | `innerB ? rngRange(rb, 40, 138)` `world.js:2229` | `downtown.towerH = (r) => rngRange(r, 40, 138)` `world.js:2225` |
| tower base h, outer | `: rngRange(rb, 13, 46)` `world.js:2229` | `palmbay.towerH = (r) => rngRange(r, 13, 46)` `world.js:2233` |
| street-wall h, inner | `innerB ? rngRange(rb, 13, 36)` `world.js:2309` | `downtown.wallH = (r) => rngRange(r, 13, 36)` `world.js:2226` |
| street-wall h, outer | `: rngRange(rb, 10, 22)` `world.js:2309` | `palmbay.wallH = (r) => rngRange(r, 10, 22)` `world.js:2234` |
| masses/block, inner | `rngInt(rb, 3, innerB ? 4 : 3)` -> `rngInt(rb, 3, 4)` `world.js:2215` | `downtown.massFill = [0.75, 1.00]` `world.js:2227` |
| masses/block, outer | `rngInt(rb, 3, 3)` `world.js:2215` | `palmbay.massFill = [0.75, 0.75]` `world.js:2235` |
| tower styles, inner | `['glass','office','glass','concrete']` `world.js:2231` | `downtown.towerStyles` `world.js:2228` |
| tower styles, outer | `['brick','office','concrete']` `world.js:2232` | `palmbay.towerStyles` `world.js:2236` |
| wall styles, inner | `['office','concrete','brick','glass']` `world.js:2314` | `downtown.wallStyles` `world.js:2229` |
| wall styles, outer | `['brick','brick','office','concrete']` `world.js:2315` | `palmbay.wallStyles` `world.js:2237` |
| `rich` detail | `innerB && st === 0` `world.js:2253` | `downtown.rich = true`, `palmbay.rich = false` `world.js:2230,2238` |

`massFill` is a FRACTION of the mass grid rather than a literal count, because the mass grid is no
longer fixed at 2 x 2 (section 3). On a 2 x 2 grid it evaluates back to the literal it replaces:
`rngInt(rb, round(0.75 * 4), round(1.00 * 4))` is `rngInt(rb, 3, 4)` and
`rngInt(rb, round(0.75 * 4), round(0.75 * 4))` is `rngInt(rb, 3, 3)`. Same single draw, same place
in the stream.

### The three districts that get new numbers. Nothing on the default path can reach these.

| district | `towerH` | `wallH` | `massFill` | `towerStyles` | `wallStyles` | `rich` |
|---|---|---|---|---|---|---|
| `silverlake` | `rngRange(r, 24, 70)` | `rngRange(r, 12, 28)` | `[0.75, 1.00]` | `office, concrete, glass` | `office, concrete, brick` | yes |
| `harbor` | `rngRange(r, 10, 30)` | `rngRange(r, 8, 18)` | `[0.50, 0.75]` | `brick, brick, concrete` | `brick, brick, concrete` | no |
| `mountain` | `rngRange(r, 10, 24)` | `rngRange(r, 8, 16)` | `[0.25, 0.50]` | `concrete, brick` | `concrete, brick` | no |

Every `towerH` / `wallH` / `massFill` figure is the plan's section-5 table verbatim. `wallStyles`
for the three new districts is not in the plan's table (it has one `styles` column and the code has
two lists) and is mine, derived from the district's own `towerStyles`.

### Every other constant, BEFORE and AFTER

| constant | BEFORE | AFTER | note |
|---|---|---|---|
| palm share | `0.075` literal at `world.js:2941` | `PALM_SHARE = { palmbay: 0.16, harbor: 0.0 }`, `PALM_SHARE_DEFAULT = 0.075` at `game/world.js:2277-2278` | see section 4 |
| mass grid | `const cols = 2, rows = 2` `world.js:2216` | `MASS_CELL = 60.0`, `MASS_GRID_MAX = 8` `game/world.js:2302-2303` | 120 / 60 = 2, so the grid is unchanged |
| slenderness | n/a - new | `MAX_SLENDER = 6.0` `game/world.js:2305` | **graph blocks only**, gated on `b.district` |
| street-wall depth | `rngRange(rb, 13, 22)` `world.js:2308` | same draw, clamped to `depAvail - 1.2` `game/world.js:2445` | never binds at `depAvail = 120` |
| lamp pitch | `x += 62` / `x += 70` `world.js:2915,2921` | `LAMP_PITCH = 62`, `LAMP_PITCH_HW = 70` `game/world.js:3644` | the grid's own literals |
| lamp lateral offset | `HALF + 2.4` = 12.4 | `e.width / 2 + LAMP_OFF`, `LAMP_OFF = 2.4` `game/world.js:3644` | per edge; 21 widths, 9.0-49.4 m |
| `PARK_OFF` | `HALF + 0.5` = 10.5 `world.js:3178` | unchanged on grid; `e.width / 2 + 0.5` passed per edge `game/world.js:3358` | new default parameter, same value |
| `JCLR` | `16.5` `world.js:3181` | unchanged on grid; `r_i + 3.5` per edge end `game/world.js:3697` | plan section 8 |
| `crossing` geometry | `d = 14.8`, zebra `+-(HALF - 0.9)`, bar at `17.4` / `5.0` / `9.4` `world.js:3458-3468` | defaults `half = HALF, d = 14.8, bar = 17.4`; per node `half = h_i`, `d = r_i + 1.8`, `bar = r_i + 4.4` `game/world.js:3475` | plan section 8 |
| `roadWear` lateral | `+-(HALF - 1.4)` `world.js:3484` | default `half = HALF`; per edge `max(3.0, e.width/2)` `game/world.js:3497` | |
| gantry pitch, motorway | `x += 240` `world.js:2627` | 240 m of edge arclength `game/world.js:3762` | |
| billboard pitch | `x += 105` `world.js:2633` | 105 m of edge arclength `game/world.js:3768` | |
| rail post pitch | 240 posts at 10 m `world.js:3524` | 10 m of edge arclength `game/world.js:3783` | plus instanced 10 m rail segments, replacing two 2400 m unshared `Mesh`es |
| jersey barrier pitch | 240 at 10 m, `9.8` long `world.js:3534` | 9.8 m of edge arclength `game/world.js:3794` | |
| pier radius / height / pitch | `CylinderGeometry(0.75, 0.85, 1, 12)`, `11.6`, `60` `world.js:3556-3559` | **unchanged**, `game/world.js:3862-3877` | risk 16 |
| deck lateral offset | `HZ - 62` `world.js:3539` | searched over `[62, 78, 96, 120, 150]`, 62 first `game/world.js:3807` | see section 6 |
| `CHUNK` | `200` | `200` | unchanged |
| `POOL` (traffic.js) | `24` | `24` | **not touched** |
| `NPC_DENSITY` | `0.16` | `0.16` | **not touched** |
| `SIN_FLOOR`, `MAX_EAT`, `RETREAT_CAP`, `SHOULDER`, `ROAD_Y` | ribbons.js / pavement.js | unchanged | not this step's files |

## 3. THE 432 m FRONTAGE STRIPS, AND WHY THE FIX IS NOT IN `blocks.js`

`blocks.js` is committed and critic-passed and I did not touch it. The problem it hands over is real:
the grid world's blocks are 36 identical 134 m squares, so `cols = rows = 2` was a fine constant;
`createBlocks` gives 868 blocks whose building line runs from 6 m to 418 m, and 31 of them are
frontage strips up to 432 m long as a SINGLE AABB. At a fixed 2 x 2 those become two 200 m building
boxes end to end, which is not a city, it is a wall.

The mass grid is therefore sized from the block: `cols = clamp(round(bw / 60), 1, 8)`.
**`MASS_CELL = 60.0` is chosen so `round(120 / 60) === 2`**, which is exactly the grid world's
existing 2 x 2, so the default path does not move a draw. `massFill` scales the number of masses
with the number of cells, so a 418 m strip gets 7 columns and 5-7 masses instead of 3-4 giants.

Two more clamps the graph needs and the grid never did, both applied AFTER their draw so the RNG
stream is untouched, and both a no-op at the grid's dimensions:

- **`MAX_SLENDER = 6.0`, graph blocks only.** A grid mass is never narrower than 39.6 m, so a
  40-138 m downtown shaft is at worst 5.75:1 and the ratio cannot bind. `createBlocks` produces
  plots 6 m wide, where the same draw is a 138 m needle on a 6 m footprint. Gated on `b.district`,
  which only a graph block carries.
- **Street-wall depth clamped to the block.** The wall is `dep` deep measured inward from the
  building line. On a grid block 120 m is available and 13-22 m never binds. On a 6 m building line
  an unclamped 22 m box comes out of the far side of the block and stands in the road - risk 12 from
  the building side.

If the drive probe still dislikes a 432 m collision face, that is a `blocks.js` change and it should
be made deliberately, in that file, by someone who re-runs `tools/_mapblocks.mjs`.

## 4. THE REGRESSION THIS STEP CAUGHT ON ITSELF, WHICH IS WORTH MORE THAN THE FEATURE

The first version put plan section 5's raised Palm Bay palm share (0.075 -> 0.16) and the harbour's
0.0 on the `palmbay` and `harbor` PROFILE OBJECTS. That looked right and it broke the default path,
because **a `#map=grid` block has no district and falls back to the `palmbay` profile**, so the
raise landed on every outer grid block.

Measured on `#map=grid`, per pool, before against after:

| pool | grid at `e7967c6` | grid with the bug |
|---|---|---|
| `palmTrunk` | 340 | **578** |
| `frondMesh` | 2724 | **4624** |
| `benchSeat` | 2150 | 2342 |
| `binMesh` | 1114 | 822 |
| `meterMesh` | 598 | 640 |
| `hydBody` / `hydCap` | 382 | 360 |
| `boxMesh` | 1000 | 1040 |

The palm branch consumes RNG draws that the other branches do not, so the whole per-block prop
stream downstream re-rolled. Seven-scene cost: `crash-cam` **15.1% of pixels at maxd 184**,
`hud-overlay` 15.3%, `daytime-downtown` 10.9%, `wet-night-asphalt` 7.5%.

Fixed by keying palm share on `b.district` in a table of its own (`game/world.js:2277`) which a grid
block structurally cannot reach. After the fix the pool census is **identical pool for pool** and the
seven scenes are back at the noise floor.

**The generalisable rule: a profile shared with the `#map=grid` fallback is only "verbatim" in the
fields the grid actually reads. The plan tabulates six columns and the palm share is a seventh
sentence underneath it; the seventh is the one that moved the gate.** Check every field.

## 5. RISK 12, FROM THE BUILDING SIDE - THE DIRECTION S3a COULD NOT CHECK

S3a-kerbs proved the drawn kerb is outside the block AABB (0 of 26,798 vertices inside, tightest
clearance 0.460 m). The other end of the rule is that every building mass sits ON the AABB.

Measured live in the page, on the DRAWN instance matrices rather than on a bookkeeping array, all
four plan corners of every mass tested against the published `world.blockIndex`:

| population | masses | corners outside any block AABB | worst overhang |
|---|---|---|---|
| tower shafts (`tower_glass/office/brick/concrete`) | **4786** | **0** | **0.000 m** |
| storefront podiums (`podiumMesh`) | **4542** | **0** | **0.000 m** |

Cornices (`capMesh`, `w + 3.0`) deliberately overhang the shaft and are not part of this test; they
are 0.75 m thick bands 6-8 m up and carry no collider.

And `blocks.js`'s own direction re-run unchanged: `node tools/_mapblocks.mjs` -> **PASS**, ZERO block
samples on tarmac, block index 0 bad probes of 8000 at every pad in [0, 1, 5, 50, 200], 0 duplicates.

### What a building does where the pavement is missing

S3a-kerbs handed over that **7% of the ring length (2,118 of 29,635 cross-sections) has no pavement**
where a foreign corridor crowds the face. **My decision: nothing special, and no widening of
anything.** The building line is `bw = w - 2 * WALK_W`, so a mass already stands **7.0 m inside the
AABB edge on its own**, independent of whether pavement was drawn in front of it. A dropped
cross-section therefore reads as 7 m of unpaved ground between a building and the kerb, not as a
building overhanging the road, and every one of the 9328 masses above is inside its AABB. Widening
the pavement band to cover it would put pavement on tarmac, which is exactly what
`tools/_pavement.mjs` measures at zero. It is a texture problem, not a geometry problem, and it
belongs to whoever tunes `MIN_BAND` against the built city.

## 6. RISK 16 - THE PIER ROW IS NOT DROPPED, AND THE HONEST NUMBER IS SMALLER

Two things were wrong before this step and one is new information.

**The grid's overpass deck was NOT gated.** `world.js:3538-3545` built a 1400 m concrete beam at
`(0, 12.5, -700)` unconditionally, so `#map=graph` has been carrying it since S3a - a beam over open
graph ground with no piers and no road under it. It is now behind `if (!GRAPH)`.

**The motorway is not one road.** Re-derived from `paradise.json`: the 52 `motorway` edges fall into
**twenty connected components**, the largest 12 edges / 1285 m, the longest single edge 291.9 m,
4.57 km in total. There is no 2.4 km freeway in this graph to lay 44 piers beside, and any claim of
one would be false. Three successive attempts and what each measured:

| placement rule | deck segments | piers |
|---|---|---|
| longest single edge, fixed 62 m offset | 5 | 5 |
| every motorway edge, both sides tried, block test only | 34 | 25 - **and a beam over a Palm Bay street with a pier in a shopfront** |
| every edge, block + tarmac test, runs of 4 required | 3 | 3 |
| **shipped: best (edge, end) walk, chosen by usable stations, offset searched, runs of 4** | **10 (500 m)** | **7** |

What is preserved exactly, because it is what the measurement depends on: the pier
`CylinderGeometry(0.75, 0.85, 1, 12)`, the 11.6 m height, the 60 m pitch, the deck section
(1.7 m x 13 m with two 1.3 x 0.5 edge beams at +-6.5 m) and the `shadowAt(..., 4.2, 0.9)` pad. What
moved: the lateral offset is searched over `[62, 78, 96, 120, 150]` with the grid's 62 first, and the
winner here was 78 m. Nothing in risk 16's text depends on the offset; it depends on the radius and
the pitch.

Two rules the placement had to learn, both from a picture and not from a number:

- **A station is usable only if it is clear of every block AABB AND off the tarmac.** The block test
  alone put a pier on a Palm Bay pavement and a beam across the street above it. The tarmac test is
  what keeps a pier out of a carriageway.
- **A viaduct that appears for one 50 m segment and stops is worse than no viaduct.** It reads as a
  concrete beam hanging in mid-air with cut ends. Only runs of 4 consecutive usable stations (200 m)
  are built.

## 7. ZERO NEW MATERIALS - AND THE PROGRAM COUNT MOVED ANYWAY

Live, read out of the running page.

| | programs at `__ready` | geometries | textures | distinct materials in the scene |
|---|---|---|---|---|
| `#map=grid`, `e7967c6` | 131 | 392 | 92 | 187 |
| `#map=grid`, this tree | **131** | 392 | 92 | 187 |
| `#map=graph`, `e7967c6` | 101 | 785 | 49 | 78 |
| `#map=graph`, this tree | **180** | 802 | 107 | **133** |

**`#map=grid` is 131, unchanged to the program.** `#map=graph` went 101 -> 180 and that is not new
materials. Three independent ways of showing it:

1. `git diff game/world.js | grep -E '^\+.*(new THREE\.[A-Za-z]*Material|patchAtmo\(|patchFacade\()'`
   returns **nothing**. Not one material is constructed by this change.
2. The scene's distinct material count under `#map=graph` is **133, below grid's 187** - the graph
   city draws a SUBSET of the material vocabulary the grid world already compiles.
3. Dumping every `renderer.info.programs[i].cacheKey` and normalising out the light-count field
   collapses graph's **180 to 141**. So **39 of the 79 added programs are a second
   point-light-count variant of an already-compiled material**: the graph city has 890 lamps and
   608 neons feeding the `POOL = 10` dynamic light pool, where S3a's graph world had none and never
   compiled the two-point-light variant. Grid's 131 does not change under the same normalisation.
   Of the remaining 21, all are draw states grid also compiles, plus ShaderMaterial ids that shift
   with construction order.

This is a `perf` item and it should be in the load-time budget when the default flips at S3d. It is
not a decision-4 breach.

### The neon smears had to be batched, and it was this step's debt to pay

`road.js`'s `addWetSmear` builds a `Mesh` with its OWN geometry and its OWN material per call and
pushes it into `refl.hidden`, which `road.js` iterates twice per reflection render. At the grid
world's 69 neons that is fine. At the graph city's 608 it put **725 distinct materials and 802
geometries** in the scene, against grid's 187 and 392. Nothing NEW was introduced - it is the same
`MeshBasicMaterial` the smear always used - but 536 extra instances of it is exactly the cost
decision 4 exists to prevent, and the population that causes it is the one this step adds.

Bucketed by (colour, length quantised to 2 m) and emitted through the existing
`roadKit.addWetSmearBatch`: **725 -> 133 materials**, in canonical key order so the batch set does
not depend on emission order. **The `#map=grid` branch is left byte-for-byte as it was**, because
`wet-night-asphalt` is a gate scene and a 2 m length quantisation is a visible change to it.

## 8. THE SEVEN `#map=grid` SCENES

A and A2 rendered off the stashed tree (`git stash push game/world.js`), B off this tree, all three
today. Not md5 - `STATE.md:169-177` records why that bar is unmeetable on this renderer.
`tools/_pxdiff.mjs`.

| scene | noise floor (A vs A2) | this change (A vs B) |
|---|---|---|
| dusk-highway-chase | maxd 2, 0.0039% | maxd **6**, 0.0078% |
| boost-blur | maxd 1, 0.0037% | maxd **1**, 0.0027% |
| crash-cam | maxd 4, 0.0033% | maxd **4**, 0.0031% |
| wet-night-asphalt | maxd 8, 0.0031% | maxd **6**, 0.0026% |
| daytime-downtown | maxd 8, 0.0047% | maxd **8**, 0.0097% |
| car-paint-closeup | maxd 1, 0.0007% | maxd **2**, 0.0015% |
| hud-overlay | maxd 1, 0.0008% | maxd **1**, 0.0005% |

Two scenes sit one maxd step above their own floor at under 0.01% of pixels; five are at or under
it. No scene exceeds 0.01% of pixels. The stronger check is the one in section 4: the `#map=grid`
per-pool instance census is **identical pool for pool** against the stashed tree, which a pixel
diff cannot claim and which is the thing that actually failed the first time.

`bash tools/lint.sh` -> `lint ok`. **And `lint ok` was not treated as runnable**: `#map=grid` and
`#map=graph` were each booted headless to `window.__ready` with console and pageerror collected,
**0 errors each**, more than a dozen times over the course of the step. See section 9 for the one
scene that did not boot.

## 9. THE DEFECT I AM NOT HIDING: TWO OF SEVEN SCENES DO NOT REACH `__ready` UNDER `#map=graph`

`#map=grid`, the default and the gate, boots and renders all seven. Under `#map=graph`:

| scene | S3a tree (`e7967c6`) | this tree |
|---|---|---|
| `daytime-downtown` | 3.9 s | **4.9 s** |
| `dusk-highway-chase` | - | **6.7 s** |
| `crash-cam` | - | **5.5 s** |
| `boost-blur` | - | **5.3 s** |
| `car-paint-closeup` | - | **3.9 s** |
| `hud-overlay` | **3.9 s** | **did not reach `__ready` in 240 s** |
| `wet-night-asphalt` | - | **did not reach `__ready` in 300 s, twice** |

No console error, no page error, in any run. **It is caused by this change** - the S3a tree boots
`hud-overlay` under `#map=graph` in 3.9 s, measured with the same harness minutes apart.

I did not get it to a single line, and I am reporting where the kill-controls left it rather than
guessing. Rule 6 of the play brief, run four times:

| kill-control | result |
|---|---|
| empty `world.blocks` under `#map=graph` (0 instead of 868) | **still fails**. Not the collidable AABB list, so not risk 5. |
| `world.setNight(true)` timed in the page | **0.1 ms**. Not the night switch. |
| `applyWet(1)` timed in the page | **0.1 ms**. Not the wet switch. |
| first render after `setNight` | 1438.6 ms ONCE (night shader variants; programs 180 -> 229), then 57-69 ms/frame against 38.7 ms by day. Real, but seconds, not minutes. |
| suppress the parked ranks and signal queues (0 parked cars instead of 1042) | **still fails**. Not the parked population. |
| **suppress the whole graph street-furniture block** (`game/world.js:3600`) | **boots in 5.3 s.** |

So it is inside the per-edge / per-node emitters this step adds, and it is not the parked cars. What
is left in that block, with the populations it creates:

- **890 street lamps and 992 traffic signals** -> `world.poles` **1882** (grid: 386),
  `world.lampPositions` **890** (grid: 288), `world.signalLights` **992** (grid: 98), and 1498
  entries in the point-light emitter list (grid: 360).
- roughly **50,000 `shadowAt` pads**, which `layoutContacts(sunDir)` rebuilds wholesale
  (`world.js:2932-2957`, and this is exactly risk 9).
- 1142 crossings, 1452 road-wear runs, 99 gantries, 970 rail posts.

Three further facts a debugger should start from rather than re-derive:

1. **It is position-dependent, not time-of-day-dependent.** The three scenes that ride `paths.city`
   are `hud-overlay` (u 0.34, fails), `wet-night-asphalt` (u 0.565, fails) and `daytime-downtown`
   (u 0.815, **works**). `hud-overlay` is `dusk`, not night. So "the night path" is the wrong
   suspect and the hero's position on the path is the right one.
2. **`window.__game` is never set**, so it is stuck before `main.js:883` - i.e. inside the
   synchronous boot chain, not inside the shot runner's tick loop, which starts at `main.js:896`.
   `cfg.setup(ctx)` runs at `main.js:799`, before that line, which is what makes it scene-dependent.
3. A `page.evaluate` issued every 5 s answers throughout, but that does **not** prove the main
   thread is idle - the V8 inspector can interrupt a running script - so do not read it as an async
   stall without checking again.

**This is the first thing S3c should do and it should take one profile, not one guess.**

## 10. DETERMINISM AND ORDER-INDEPENDENCE

`node tools/_s3b-determinism.mjs --poison`. Every instance harvested with its **own world position**
deciding which cell it counts against - not the mesh name, which could lie - canonicalised as
`drawState | 16 matrix values | 3 colour values`, sorted, digested per cell.

Baseline: **191 cells, 1,191,271 instances.**

| run | cells | differing cells | values compared value-by-value | differing |
|---|---|---|---|---|
| rebuild, same order | 191 | **0** | 1,697,327 | **0** |
| permuted `0x5EED` | 191 | **0** | 1,697,327 | **0** |
| permuted `0xA11CE` | 191 | **0** | 1,697,327 | **0** |
| permuted `0xBEEF` | 191 | **0** | 1,697,327 | **0** |
| permuted `0x1234` | 191 | **0** | 1,697,327 | **0** |
| permuted `0xFFFF` | 191 | **0** | 1,697,327 | **0** |

Poison control: one canonical string in the densest cell perturbed -> **exactly 1 differing cell**.

The value-by-value column is the six densest cells in full (89,333 instances x 19 values); every
other cell is compared by a 32-bit FNV-1a digest over its whole sorted canonical list.

Five of the six runs shuffle the population order through `visitOrder()`, which is the test S2
proved is not the same as a rebuild test. It covers the block loops, the frontage and tower loops
and this step's new per-edge and per-node loops. **It does not cover the motorway and overpass
pass**, which is deliberately not shuffled: that pass sorts its edges by id and picks its chain by
an exhaustive search over every (edge, end) pair, so it has no visit-order input to perturb.

Seeding is plan section 5 verbatim now that the graph supplies ids: `makeRng(cellHash(e.id, 0,
S_EDGE))` per edge (`game/world.js:3640`) and `makeRng(cellHash(n.id, 0, S_NODE))` per node
(`game/world.js:3641`), replacing S2's coordinate-keyed stand-in. Per block it is unchanged:
`atRng(b.cx, b.cz, S_BLOCK)`, which is `makeRng(cellHash(round(cx*8), round(cz*8), 0xB10C))`.

## 11. `chunkStats()` UNDER `#map=graph`

```json
{"cells":191,"meshes":8431,"instances":1191271,"tris":13964118,"geometries":28,"overflow":0,
 "content":{"blocks":868,"towers":1009,"frontages":7569,"neons":608,"parkedCars":1042,
            "poles":1882,"lamps":890,"signals":992,
            "districts":{"mountain":260,"silverlake":220,"harbor":164,"palmbay":121,"downtown":103}},
 "furniture":{"lamps":890,"signals":992,"gantries":99,"crossings":1142,"ranks":732,"queues":310,
              "billboards":66,"railPosts":970,"barriers":489,"piers":7,"deck":10,"wear":1452,
              "motorwayEdges":52,"deckSkipped":2,"chainEdges":4,"chainLen":577.7,
              "deckOff":78,"deckSide":1,"pier0":[441.1,-534.4]},
 "smears":{"neons":608,"batches":16}}
```

`#map=grid` for comparison: 50 cells, 1333 meshes, 202,954 instances, 36 blocks, 114 towers, 72
neons, 183 parked cars, 288 lamps, 98 signals. **`overflow.n === 0` in both.**

Two densities worth stating because the brief asks for them explicitly:

- **Parked cars are LESS dense than the grid world, not more.** 1042 over 11.44 km2 is 91/km2
  against the grid's 183 over 1.21 km2, i.e. 151/km2. `NPC_DENSITY = 0.16` and `POOL = 24` were not
  touched and are not in the diff. **If the streets read empty, that is the report, and the numbers
  stay where the user set them.**
- **Risk 13, palms: 578 palm trunks map-wide** under `#map=graph`. Palm density is per kerb-metre
  and the graph has 6.5x the centreline, so this is a real alpha-test fill item for `perf`. **The
  base share was deliberately NOT multiplied to compensate for the map**; only Palm Bay goes up
  (0.16) and only the harbour goes down (0.0), which is plan section 5.

## 12. THE PICTURES. THIS IS THE ACCEPTANCE TEST AND IT DECIDED TWO THINGS.

Twenty renders under `#map=graph`, read with the Read tool: street level and 140-350 m oblique in
five districts. Full set in `shots/s3b/`.

**Downtown at 140 m (`F3-downtown-140.png`) - this is the one that settles it.** A stepped tower with
setbacks, a projecting cornice at every step, rooftop plant, a lit storefront band wrapping the
podium, and around it a full block of mid-rise street wall with signage. Every junction arm carries
a zebra crossing and a stop bar, a sign gantry spans the arterial, cars stand at the kerbs. It reads
as a downtown, not as a graph with boxes on it.

**Downtown street level (`F1-downtown-street.png`, `g2-street-downtown.png`) - good.** Continuous
signage down both walls at first-floor height, awnings, lit shop interiors, a zebra crossing in the
middle distance, a gantry beyond it, kerbs and guard railing on both sides, and a parked car at the
right kerb. Compared with the same camera before this step - which was tarmac between two bare
pavement bands - this is the whole point of S3b.

**The districts ARE distinguishable, at 200-300 m.** Downtown is 40-138 m towers with a clear
skyline; Silver Lake is mid-rise with occasional taller shafts; Palm Bay is dense and uniformly low;
the harbour is low, blocky and brick, with the long quay frontages reading as warehouses; White
Mountain is sparse, low and mostly open ground. I could tell four of the five apart without the
filename. Silver Lake and Palm Bay are the pair I would confuse.

**The viaduct (`F8-viaduct.png`) - good, and small.** A continuous elevated deck on a pier row
crossing open water beside the motorway, with a clean start and end rather than a cut beam. It is
500 m where the grid's was 1400 m.

**What the picture caught that no number did, twice.** The first deck placement put a concrete beam
straight over a Palm Bay street at 12.5 m with a pier standing on the pavement, and every number was
green - the block test passed, the segment count was healthy. The second, with the tarmac test
added, produced 200 m of viaduct in three disconnected 50 m stubs, which no count would have flagged
either. Both were only visible by looking.

**What is honestly not good.**

- **An aerial above ~350 m is not a usable diagnostic** and I am repeating S3a's warning rather than
  rediscovering it: the airlight washes the whole frame to near-white. Judge from 140-300 m.
- **The big open faces read as holes.** `blocks.js` gives a face over `BIG_FACE_AREA` a 40 m
  frontage ring and leaves the interior clear so it stays drivable. That is correct and it is what
  keeps a lake drivable, but from 260 m over downtown it reads as several large empty lots inside
  the built area. It is the `digitise` coverage gap the block critic already recorded, seen through
  a new lens.
- **The downtown merged-junction coarseness from S3a is still there and buildings make it more
  visible**, not less: retreats of 25-40 m merge neighbouring junction polygons into broad paving,
  and now there are facades framing it. Unchanged `SIN_FLOOR = 0.20`; not touched here.
- **The road-wear patches read as sheets of paper on the road** in the harbour street shot. That is
  inherited grid behaviour at an unlucky camera, not new, and the file's own comment already warns
  about it.

## 13. CHECKS RUN

- `node tools/_s3b-determinism.mjs --poison` -> DETERMINISM: OK, poison control fires.
- `node tools/_mapblocks.mjs` -> **PASS**, 0 block samples on tarmac, index clean at every pad.
- `node tools/_pavement.mjs` -> **PAVEMENT OK**. `node tools/_ribbons.mjs` -> **ribbons ok**.
  Neither file was modified; re-run to prove that.
- `bash tools/lint.sh` -> `lint ok`.
- Both `#map=grid` and `#map=graph` booted headless to `window.__ready` with console and pageerror
  collected: 0 errors each. **Except `wet-night-asphalt` under `#map=graph`** - section 9.
- Seven `#map=grid` scenes against a same-tree noise floor taken today, plus a per-pool instance
  census against the stashed tree.
- Live program, geometry, texture and material counts read out of the running page, in both modes,
  on both trees.
- Risk 12 measured on the drawn instance matrices against the published `world.blockIndex`.
- Twenty `#map=graph` renders read with the Read tool.

## 14. WHAT S3c INHERITS

- **`heroDist` returns `Infinity` under `#map=graph`** (`game/world.js:3339`). Re-point it at the
  re-derived `paths.city` and the parked cull comes back with no other change; the literal
  clearances 2.8 and 4.6 at the two `tryPark` call sites are untouched.
- **The `wet-night-asphalt` boot** (section 9). Run the kill-control first.
- `world.blocks` (868) and `world.blockIndex` are published. `physics.js:922` still scans the flat
  array linearly - `rewire`'s, not mine, but the index it needs now exists on `world`.
- `LAYOUT.grid` is still what `hud.js`'s minimap reads (risk 17), and the seven scenes still spawn
  on grid coordinates under `#map=graph`. Both are known and neither is fixed here.
- `planPavement` (499 ms) + `createBlocks` (351 ms) + the whole content build still run eagerly over
  the WHOLE map at boot under `#map=graph`. S3a flagged it; S3b made it bigger. It is S4's, and it
  is the reason graph boot is 4.9 s against grid's 2.6 s.
