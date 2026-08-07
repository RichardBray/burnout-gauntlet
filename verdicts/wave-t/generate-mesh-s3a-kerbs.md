# wave T - `generate-mesh` S3a, part 2. The kerbs and pavement, from the face polygons.

Finishes S3a of `tools/WAVE-T-GENERATE-MESH-PLAN.md:845-853`, the two deliverables
`verdicts/wave-t/generate-mesh-s3a.md` reported as untouched.
Built against risk 12 of section 10.

**S3a is now complete.** Roads, junctions, kerbs and pavement all exist under `#map=graph`.
`#map=grid` is still the default and is inside the noise floor on all seven scenes.

**What is NOT done, stated first:** the pavement is a 7.8 m BAND around each block, not a filled
plot, and it has real gaps - 2118 of 29635 cross-sections (7.1%) are dropped and 887 quads are cut
because the ground there is tarmac.
Those gaps are deliberate and measured, not an oversight, but they are visible from the air and
whether they are acceptable is a judgement (section 7).

```progress-metrics
pavement on tarmac: 0 of 1213824 band samples (0.0000%)
kerb vertices inside a block AABB: 0 of 26798, tightest clearance 0.460 m
boundary vertices bit-identical across two independent plans: 32720 values, 0 differing
order-independence: 260400 canonical triangles, 5 shuffled face orders, 0 differing
programs: grid 131 (unchanged), graph 101 (was 99), zero new materials
chunk-owned geometries: 2 per cell, 181 cells (grid world would be 1736 unshared)
```

## 1. WHAT LANDED, WITH `file:line`

| deliverable | where |
|---|---|
| `planPavement(doc, faces, {chunk, graph})` - the whole extrusion, pure arithmetic | `game/map/pavement.js:186` |
| `lerpXs(a, b, t)` - the boundary interpolation everything rests on | `game/map/pavement.js:151` |
| `offsetCorner()` - variable-width offset-line intersection | `game/map/pavement.js:164` |
| corner joins: miter / bevel / round, split on convexity | `game/map/pavement.js:287-343` |
| the tarmac march (pull back, push out, truncate the band) | `game/map/pavement.js:349-409` |
| long-chord subdivision | `game/map/pavement.js:411-443` |
| the quad tarmac test | `game/map/pavement.js:445-478` |
| chunk split, `splitByCell` | `game/map/pavement.js:573-621` |
| the mesh build under `#map=graph` | `game/world.js:1686-1729` |
| imports | `game/world.js:15-17` |
| `chunkStats().pavement` | `game/world.js:3654` |
| node harness | `tools/_pavement.mjs` |

### Every constant, BEFORE and AFTER

Nothing that already existed changed value.
The kerb and pavement dimensions are the grid world's own numbers, carried across unchanged, which
is why the two cities read the same at street level.

| constant | BEFORE | AFTER | note |
|---|---|---|---|
| kerb step height | `BoxGeometry(w, 0.22, d)` at `game/world.js:1742` | `KERB_H = 0.22` at `game/map/pavement.js:55` | **unchanged value** |
| pavement top height | `BoxGeometry(w-1.6, 0.24, d-1.6)` at `game/world.js:1752` | `WALK_H = 0.24` at `game/map/pavement.js:58` | **unchanged value** |
| kerb stone width | the `-1.6` inset at `game/world.js:1752`, i.e. 0.8 per side | `KERB_TOP_W = 0.8` at `game/map/pavement.js:66` | **unchanged value** |
| pavement depth | `LAYOUT.walkW = 7.0` at `game/world.js:23` | `WALK_W = 7.0` at `game/map/pavement.js:74` | **unchanged value** |
| paved half-width shoulder | `SHOULDER = 3.0` (`graph.js:16`, `ribbons.js:38`, `blocks.js:26`) | `SHOULDER = 3.0` at `game/map/pavement.js:47` | must equal the other three |
| `MITER_LIMIT` | n/a - new | `2.0` at `game/map/pavement.js:88` | multiples of the local paved half-width |
| `ARC_STEP` | n/a - new | `Math.PI / 12` (15 deg) at `game/map/pavement.js:97` | round join at a reflex corner |
| `STATION_MAX` | n/a - new | `12.0` m at `game/map/pavement.js:108` | so the tarmac march samples a 230 m segment |
| `MARCH_STEP` / `MARCH_BISECT` | n/a - new | `0.25` m / `12` at `game/map/pavement.js:111,113` | 0.25 / 2^12 = 0.06 mm |
| `MAX_PUSH` / `MAX_PULL` | n/a - new | `24.0` / `8.0` m at `game/map/pavement.js:115,117` | |
| `CHORD_MAX` / `CHORD_ROUNDS` | n/a - new | `7.0` m / `4` at `game/map/pavement.js:119,121` | measured, see section 8(c) |
| `MIN_BAND` | n/a - new | `1.2` m at `game/map/pavement.js:123` | below this the strip breaks |
| `KERB_UV` / `WALK_UV` | `map.repeat.set(0.18,0.18)` / `(0.4,0.4)` on a 134 m grid block (`game/world.js:1667-1668`) | `744.4` / `335.0` m per tile at `game/map/pavement.js:126,128` | the same texture density expressed as a world-planar projection |
| `CHUNK` | `200` | `200` at `game/world.js:1222` | unchanged |
| `POOL`, `NPC_DENSITY` | `24`, `0.16` | unchanged | not touched |

`game/map/blocks.js`, `game/map/graph.js`, `game/map/paradise.json`, `game/scenes.js` and
`game/traffic.js` were not modified. `game/world.js` is the only existing file edited, and the edit
is one insertion anchored on the unique comment `// ---- THE GRAPH KERBS AND PAVEMENT (#map=graph)`
plus three import lines and one `chunkStats` field. No pattern-matching edit was made anywhere.

## 2. THE TWO OVERLAP NUMBERS - RISK 12, BOTH DIRECTIONS

`node tools/_pavement.mjs`, which is the whole check and runs in 12 s with no browser.

### pavement-in-road: **0 of 1,213,824 band samples (0.0000%)**

Sampled over the surface that was actually emitted - `plan.runs`, the maximal runs of
cross-sections the emitter turned into triangles - on a 4 x 12 grid per quad, against
`game/map/graph.js`'s `surfaceAt`.

The kerb FACE itself reads tarmac on 15,391 of 101,152 samples and that is reported separately
rather than counted as a violation. `surfaceAt`'s test is inclusive (`d2 <= hp*hp`,
`graph.js:165`) and the kerb is built to sit exactly on the corridor boundary; that coincidence is
what makes the shoulder ribbon and the kerb one continuous surface with no gap between them.
Counting it would be scoring the design as a bug.

Poison control: a sample moved 4 m back onto the carriageway is reported as tarmac.

### AABB-outside-pavement: **0 of 26,798 drawn kerb vertices inside a block AABB, 0 kerb segments crossing one, tightest clearance 0.460 m**

This is the direction nobody had checked. `blocks.js` proves no block overlaps tarmac; nothing
proved the kerb is outside the AABB, and `physics.js:922` colliding the car with empty air over the
carriageway is what that costs.

Stated exactly, with no polygon closure and no orientation: the kerb is outside the AABB iff no
drawn kerb-face vertex lies inside any AABB and no drawn kerb segment crosses one. Both are 0.
The tightest clearance anywhere is 0.460 m, which is `blocks.js`'s own `KERB_MARGIN = 0.5` less the
4 m raster quantisation, so the two files agree by construction rather than by luck.

And `blocks.js`'s own direction re-run here for completeness: **0 of 31,248 AABB samples on tarmac**.

Poison controls: a point at a block centre is reported inside that block; a point 3 m past the kerb
is reported outside.

**A SIGNED NEAREST-KERB TEST WAS THE FIRST INSTRUMENT AND IT WAS THE WRONG ONE, which matters more
than the number it produced.** It reported 159 samples "outside" with a 25.99 m worst case. Every
example inspected was a correct block measured against a kerb it has nothing to do with: on a big
face's frontage ring a block sits up to 40 m from the road (`blocks.js` `RING_DEPTH`), the nearest
surviving kerb segment can be 37 m away and around a corner, and the sign of the offset against
that segment's inward direction is then meaningless. An earlier point-in-polygon version was worse
still - it had to exclude 821 of 868 blocks because their face ring has a gap, so it "passed" on 5%
of the deliverable.

## 3. CHUNK-BOUNDARY CONTINUITY

Same discipline as `tools/_ribbons.mjs`, and for the same reason: **within one plan the two cells
either side of a boundary hold the same cross-section object, so comparing them proves sharing, not
agreement.** The harness builds the whole plan TWICE, as two separate computations with two separate
object graphs, and compares the two runs' on-plane vertices.

| | result |
|---|---|
| strips split at a chunk plane | **752** (the brief asked for at least 20) |
| distinct vertices lying exactly ON a chunk plane | **1,340** |
| on-plane vertices harvested per run | 4,090 / 4,090 |
| values compared (x, y, z, nx, ny, nz, u, v) | **32,720** |
| **differing** | **0** |
| poison control: 1 ULP on one on-plane vertex | **caught** |

The mechanism is `lerpXs(a, b, t)` at `game/map/pavement.js:151`: the whole cross-section - base
point, offset vector and all three offset parameters - is interpolated from one pair of sources at
one `t`, in one order. The band's inner rows are cut at that same `t` rather than at their own plane
crossing, so a boundary produces one shared cross-section and not three independent ones; a cell is
an ownership label, not a clipping volume, and clipping each row separately would tear the pavement
at every boundary.

## 4. DETERMINISM AND ORDER-INDEPENDENCE

Every emitted triangle canonicalised as `cell | material | 3 x (pos, normal, uv)` and sorted.
**260,400 triangles.**

| run | differing |
|---|---|
| rebuild, same face order | **0** |
| shuffled face order `0x5EED` | **0** |
| shuffled `0xA11CE` | **0** |
| shuffled `0xBEEF` | **0** |
| shuffled `0x1234` | **0** |
| shuffled `0xFFFF` | **0** |

Poison control: appending one character to one triangle string makes the comparator report exactly 1.

**One honest caveat, measured not assumed.** Node and headless chromium disagree on ONE station out
of 29,635: node classifies it as pushed-off-tarmac, chromium as pulled-back-to-kerb
(16,802/10,881 against 16,803/10,880; the sum is identical). It is a station sitting exactly on the
corridor boundary where the round join's `Math.cos`/`Math.sin` differ in the last bit between the
two runtimes. Within one runtime the result is bit-exact, which is what streaming needs; across
runtimes the geometry can differ by about 1e-9 m at that one station. Stating it because a future
agent comparing a node dump against a browser dump will otherwise think something is broken.

## 5. ZERO NEW MATERIALS, AND THE PROGRAM COUNT MOVED ANYWAY - HERE IS WHY

Live count, `daytime-downtown` on the shot path, `info.autoReset = false`, one warm
`composer.render()` then five more:

| | programs | geometries | textures | draw calls | triangles |
|---|---|---|---|---|---|
| `#map=grid` | **131** | 392 | 92 | 1362 | 2,447,590 |
| `#map=graph` | **101** | 785 | 49 | 627 | 400,030 |

`#map=grid` is **131, exactly the S3a figure**, unchanged. **`#map=graph` is 101 against S3a's 99,
and the +2 is not two new materials.** `kerbMat` (`game/world.js:1659`) and `walkMat`
(`game/world.js:1663`) already existed and were already constructed in both modes; under
`#map=graph` before this step nothing was ever DRAWN with them, so they were never compiled. They
are now. Both are already inside grid mode's 131, so when S3d flips the default the count does not
rise. Zero materials were added.

Geometries: 362 of graph mode's 785 are the new kerb and pavement batches - **exactly 2 per
occupied cell over 181 cells**, which is what plan section 2's six-geometries-per-chunk cap
requires. The grid world's discipline is two unshared `BoxGeometry` meshes per block
(`game/world.js:1742`, `:1749`); at `createBlocks`' 868 blocks that would have been **1,736 unshared
geometries**, and inheriting it is the thing `WAVE-T-GENERATE-PLAN.md:154-157` names.

## 6. `#map=grid` IS UNCHANGED

Seven scenes at 1280x720, rendered three times: A and A2 off the same stashed tree (the same-tree
noise floor, taken today rather than quoted), and B off this tree. Not md5 - `STATE.md:169-177`
records why that bar is unmeetable on this renderer.

| scene | noise floor (A vs A2) | this change (A vs B) |
|---|---|---|
| dusk-highway-chase | maxd 6, 0.0058% | maxd **1**, 0.0047% |
| boost-blur | maxd 1, 0.0090% | maxd **1**, 0.0018% |
| crash-cam | maxd 4, 0.0034% | maxd **1**, 0.0020% |
| wet-night-asphalt | maxd 1, 0.0014% | maxd **4**, 0.0012% |
| daytime-downtown | maxd 9, 0.0111% | maxd **9**, 0.0176% |
| car-paint-closeup | maxd 1, 0.0011% | maxd **1**, 0.0012% |
| hud-overlay | maxd 1, 0.0025% | maxd **3**, 0.0023% |

Every scene is at or below its own floor on maxd, and no scene exceeds 0.018% of pixels. This is
what it should be: every line added is inside `if (GRAPH)`.

`bash tools/lint.sh` -> `lint ok`. **And `lint ok` was not treated as runnable.** Both modes were
booted headless to `window.__ready` with console and pageerror collected: `#map=grid` **0 errors**,
`#map=graph` **0 errors**. Boot to `__ready` on the playable path: grid 4321 ms, graph 4741 ms.
No frame-time number is reported; peer agents may be running.

## 7. THE PICTURES, IN PLAIN WORDS

Rendered under `#map=graph`, overhead and at eye height. This is the acceptance test, and it is the
fourth time in this wave it has decided something.

**Street level, looking along street 595 at (922.8, 511.1), eye 2.2 m - this is the one that
settles it.** Yellow centre line, white lane lines, and a kerb on BOTH sides running dead straight
to the horizon: a crisp 22 cm step catching its own shadow, the lighter kerb stone, then the
pavement behind it. The kerb is parallel to the carriageway and at the right distance from it. It
reads like a street. The same view down street 788 shows the same thing plus a cross street in the
foreground whose kerbs meet the near ones correctly.

**The degree-9 junction at (-1246.7, 116.9) from 130 m - good.** All nine arms arrive into a paved
plaza and the pavement wraps round every mouth as a smooth rounded corner rather than a spike. That
rounding is the reflex round join doing its job and it is the single most visible improvement over
the first version I built. Nothing is torn and nothing laps over the carriageway.

**The two long parallel streets at (922.8, 511.1) from 150 m - good.** Continuous pavement bands on
both sides of every road, closing around the junctions, with the dark block interiors between them.
This is the picture that shows the kerbs really do follow the roads across a whole neighbourhood
rather than at the two nodes I happened to screenshot.

**Downtown at (1579.9, -181.0) from 260 m - the kerbs are right and the CITY is coarse.** Every
road corridor is bounded by pavement and the bands close into rings around the blocks, so the
extrusion is doing what it should. But this is the area S3a already flagged: retreats of 25-40 m
merge neighbouring junction polygons into one broad slab of tarmac, and the pavement now outlines
that slab and makes it more obvious, not less. That is S3a's `SIN_FLOOR` artefact showing through a
new lens, not a kerb defect, and I have not touched the retreat formula.

**The northwest quadrant from 500 m - correct, with visible gaps.** Pavement rings the coastal loop,
the mountain switchbacks and the harbour streets; the big open faces get frontage only and their
interiors stay clear, which is what `blocks.js`' `RING_DEPTH` intends and what keeps a lake
drivable. The gaps are real and countable: **2,118 of 29,635 cross-sections dropped and 887 quads
cut**, so about 7% of the ring length has no pavement, always where a foreign road corridor comes
within `MIN_BAND` of the face boundary. At street level you would drive past a stretch where the
pavement simply stops for 10-20 m. My judgement: acceptable for S3a and worth revisiting at S3b,
because a building placed on a block whose frontage has no kerb will read wrong.

**A 1600 m whole-map shot is NOT a usable diagnostic** and I am repeating S3a's warning rather than
rediscovering it - the airlight washes the ground to near-white. Judge this from 150-500 m and from
eye height.

**One artefact I am not hiding:** at a few junction mouths the pavement narrows to a thin spike
before it terminates, where two corridors nearly meet and the band is truncated to almost nothing
just before `MIN_BAND` cuts it. It is a sliver a metre or two long. It is the truncation behaving as
specified, and it is ugly.

## 8. THE THREE THINGS THE NUMBERS FOUND, IN THE ORDER THEY BIT

Each one passed every check that existed before it, which is the pattern this project keeps hitting.

**(a) THE OBVIOUS CONSTRUCTION IS WRONG AND `blocks.js` ALREADY SAID SO.** Offsetting a face polygon
inward by its own bounding edges' paved half-widths is what "the kerb follows the face polygon"
sounds like, and it puts pavement on the road, because road corridors do not respect faces - a
49.4 m arterial one face away reaches over a 9 m service road, and a junction fan overlaps several
faces at once (`blocks.js:244-250` records the same finding from the block side). So every
cross-section is MARCHED: pushed outward until `surfaceAt` stops saying tarmac, pulled back toward
the road if it started too far in, and the band truncated at the next tarmac going inward.
16,803 stations pushed (mean 2.58 m, max 23.99 m), 10,880 pulled back (max 4.59 m), 966 truncated.

**(b) A STATION-WISE GUARANTEE IS NOT A SURFACE-WISE GUARANTEE.** With every cross-section
individually marched clear, **3.03% of the drawn band was still on tarmac**. Marching a cross-section
proves the RAY is clear and says nothing about the quad between two of them, and at a corner the two
stations have very different offset directions so the quad sweeps a wedge across the junction. Each
quad is now sampled on its own 5 x 6 grid and an edge that touches tarmac is CUT (`chordMax` and the
quad test). At a 3 x 4 grid six samples still slipped through, which is the honest way to say this
is a sampled guarantee and not a proof.

**(c) A CORRECT VERTEX SET WITH AN INCORRECT CHORD SET.** With not one of the 15,578 kerb vertices
inside a block AABB, **51 drawn kerb segments still cut a block corner, the worst 4.01 m deep**. The
offending chords are 17 to 35 m long and every one is a corner join, where two adjacent stations
legitimately sit far apart. Subdividing any chord over `CHORD_MAX` and MARCHING the inserted station
takes it to zero. Measured: 7.0 m gives 0 crossings at 260,400 triangles; 9.0 m still leaves 5
crossings at 0.43 m; 5.0 m costs 52% more triangles for nothing.

And one correction to my own first design, which is the reason (c) was ever reachable:
**a reflex corner must not be mitered.** At a convex corner the two offset lines converge and their
intersection lies ON both of them, so it is at exactly `h` from each road and can never be deeper
into a block than `KERB_MARGIN`. At a reflex corner they DIVERGE and the intersection runs away up
the bisector at `h / sin(theta/2)`, which at a 340 degree interior angle is 5.7 times the paved
half-width. That put 14 kerb vertices inside a block AABB, the worst 7.54 m in, every one a reflex
miter sitting on the `2.0*h` clamp. The fix is a round join - an arc at radius `h` about the ring
vertex, which is on the centreline, so every station is exactly `h` from the road. It is also what
made the junction mouths look right.

## 9. HOW THE WIDTH PER RING SEGMENT IS OBTAINED, since it is not obvious

`faces[].polygon` is the only thing `blocks.js` publishes and it carries no edge identity, and I was
told not to modify `blocks.js`. So each ring segment's paved half-width comes from
`graph.nearest()` at the segment MIDPOINT, which lies exactly on a road centreline. That is asserted,
not assumed: **0 of 4,189 ring-segment midpoints are further than 0.1 mm from a centreline, worst
5.44e-5 m**, and a face whose worst lookup exceeds 0.5 m is skipped and reported rather than built
on a guessed width. `blocks.js` also works on a deep copy with four crossings split, while
`graph.js` indexes the file on disk; split children inherit the parent's width, so the lookup is
unaffected.

## 10. BUILD COST, AND WHAT IS ROUTED ONWARD

`planPavement` is **499 ms** and `createBlocks` **351 ms**, both `#map=graph` only, both currently
run once over the WHOLE map at boot. Graph boot went 4321 -> 4741 ms against grid on the playable
path. That is the eager build chunk-contract rule 1 forbids, and it is correct for S3a and wrong at
S4: `planPavement` takes the face list and the chunk size and is trivially restrictable to a cell
set, but doing that now would mean writing `buildChunk` in the wrong step. **Flagged for S4, not
inherited silently.** The cost is dominated by the tarmac march - roughly 1.5 M `surfaceAt` calls at
189 ns - and the march is per cross-section, so it scales with resident cells and not with the map.

Routed findings, not fixed here:

- **The pavement band is 7.8 m, not a filled plot.** The grid world's block mesh is a solid box, so
  its pavement covers the whole block including under the buildings. Here the interior of a block is
  bare ground until S3b puts buildings on it. If S3b wants ground under a building it should emit
  it with the building, not widen this band.
- **The 7% of ring length with no pavement** (section 7) will read as a missing frontage once
  buildings arrive. It belongs to whoever tunes `MIN_BAND` against the built city.
- **The downtown merged-junction coarseness** is S3a's `SIN_FLOOR = 0.20`, unchanged and untouched.
- `world.blocks` is still empty under `#map=graph`. Publishing `createBlocks(doc).blocks` and
  `buildBlockIndex` onto `world` is S3b's, and this step deliberately did not do it: it would put
  868 collidable AABBs into `physics.js` in a step that has no buildings for them.

## 11. CHECKS RUN

- `node tools/_pavement.mjs` -> **PAVEMENT OK**, 25 assertions, 5 poison controls, all green.
- `bash tools/lint.sh` -> `lint ok` (the glob now covers `game/map/*.js`, so `pavement.js` is
  parse-checked).
- Both `#map=grid` and `#map=graph` booted headless to `window.__ready`, console and pageerror
  collected: **0 errors each**. The page was booted, not just linted.
- Seven `#map=grid` scenes against a same-tree noise floor taken today.
- Live program, geometry, texture, draw-call and triangle counts read out of the running page.
- Six `#map=graph` renders read with the Read tool, overhead and at eye height.
