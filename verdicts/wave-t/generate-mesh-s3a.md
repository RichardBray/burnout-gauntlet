# wave T - `generate-mesh` S3a. The graph's roads, behind `#map=graph`.

S3a of `tools/WAVE-T-GENERATE-MESH-PLAN.md:845-853`, built against sections 3 and 4.

**S3a is NOT complete.** Roads, junctions and degree-2 tapers are built and the boundary
bit-identity is proved. **Kerbs and pavement from the face polygons are not written.** That is
stated here first rather than at the bottom, because the step was scoped as "roads, junctions,
kerbs and pavement" and two of the four are missing.

## 1. WHAT LANDED

| deliverable | where |
|---|---|
| `planRoads(doc, {chunk, shoulder})` - the whole geometric plan, pure arithmetic | `game/map/ribbons.js:187` |
| `crossAt(a, b, t)` - the boundary interpolation everything rests on | `game/map/ribbons.js:92` |
| `normalsOf()` - central difference over the FULL polyline | `game/map/ribbons.js:57` |
| retreat distances, degree >= 3 only | `game/map/ribbons.js:235-256` |
| joint normal at degree-2 nodes | `game/map/ribbons.js:258-284` |
| junction ring construction | `game/map/ribbons.js:351-391` |
| node harness | `tools/_ribbons.mjs` |
| junction camera tool | `tools/_junctionshot.mjs` |
| `#map=graph` fetch | `game/main.js:183-191` |
| `GRAPH` gate and the graph road build | `game/world.js:1070`, `game/world.js:1538-1637` |
| `ribbonInto`'s new `v0` parameter | `game/road.js:1878` |

### Literals

| constant | value | `file:line` |
|---|---|---|
| `SHOULDER` | `3.0` | `game/map/ribbons.js:38` - must equal `graph.js:16` or drawn tarmac and `surfaceAt` tarmac diverge |
| `SIN_FLOOR` | `0.20` | `game/map/ribbons.js:41` - plan section 4 verbatim |
| `MAX_EAT` | `0.45` | `game/map/ribbons.js:43` - plan section 4 verbatim |
| `RETREAT_CAP` | `3.0` | `game/map/ribbons.js:45` - plan section 4 verbatim |
| `ROAD_Y` | `0.03` | `game/world.js:1521` - **one plane for the whole city** |
| grid Z-ribbon drop | `y: 0.028` BEFORE -> **not emitted under `#map=graph`** | the 2 mm hack, retired |
| `CHUNK` | `200` | unchanged |

## 2. BOUNDARY BIT-IDENTITY - THE HEADLINE

The plan's mechanism is implemented exactly: normals are computed once over the whole edge
polyline (`normalsOf`), the trim and the clip both interpolate through the single function
`crossAt(a, b, t)`, and `ribbonInto` receives those normals rather than deriving anything.

**The first version of the check was weak and I replaced it.** Within one plan the two cells either
side of a boundary hold the *same vertex object*, so comparing them proves only that the object was
shared - a structural fact, not the numerical claim. The claim that matters is the streaming one.
So `tools/_ribbons.mjs` builds the entire plan **twice**, as two separate computations with two
separate object graphs, and compares run 1's upstream vertex against run 2's downstream vertex.

| | result |
|---|---|
| edges straddling a chunk boundary | **261 of 929** |
| boundary crossings walked | **301** (the brief asked for at least 20) |
| cross-run pairs that are the same object | **0** - the test is not vacuous |
| values compared (`x`, `z`, `nx`, `nz`, `s` per crossing) | **1,505** |
| **differing** | **0** |
| poison control: 1 ULP on one normal component | **caught** |
| arclength continuity across every join (texture V) | **0 jumps** |

The `s` field is arclength along the full edge and is passed to `ribbonInto` as the new `v0`
argument, so the asphalt tile does not restart at a boundary. Without it the vertices would match
and the join would still be visible as a texture seam.

`tools/_ribbons.mjs` also reports: 1,240 ribbon pieces over 180 occupied cells, 330 junction
polygons, 176 tapers, **0 edges left with no ribbon**, every junction polygon with real area.

## 3. PER-EDGE WIDTH, ZERO NEW MATERIALS

Option (b), as recommended. The marked carriageway is `min(width, spec.widthM)` on `mats[cls].mat`
and everything out to `width/2 + SHOULDER` is `shoulderMat`. A 49.4 m arterial is a 20 m marked
carriageway with 14.7 m of hard shoulder each side; a 9.0 m service road gets a partial tile with U
spanning 9/20.

**Option (a) was not taken and its premise was not assumed either way** - I did not need to render
it, because reading `makeRoadTile` settles it: `road.js:351` draws a centre pair, so a horizontal
repeat puts a double yellow line down the middle of every lane. The plan flagged this as a guess;
it is now a read fact, and (a) is wrong for this texture.

Live program count, same scene, `composer.render()` warmed:

| | programs | roadKit materials |
|---|---|---|
| `#map=grid` | **131** | `city+highway` |
| `#map=graph` | **99** | `city+highway` |

Zero new materials and zero new programs. Graph mode compiles *fewer* because S3a builds no
buildings, signage or props.

## 4. JUNCTIONS, AND THE BUG THE PICTURE FOUND

Retreat, corners and fan are per plan section 4. Because the polygon's corners *are* the ribbons'
terminal vertices there is no coplanar overlap anywhere in the network, so **the 2 mm drop is gone
and every ground road sits at `y = 0.03`** - which is also what `road.js:1609`'s planar-reflection
mirror plane assumes.

Measured: 1,142 retreats, min 2.3 m, p50 24.8 m, p90 38.7 m, max 68.3 m. Junction areas: median
491 m2 (about 22 m across, right for a 20 m road crossing a 20 m road), 16 above 2,000 m2 and 2
above 4,000 m2. The largest is node 319, a degree-4 node at 6,145 m2 (78 m across) where a
near-collinear pair hits the `SIN_FLOOR`. That is the formula as specified, and I have not
second-guessed it, but a 78 m paved plaza is a real artefact and it is 2 of 330.

**The screenshot found a bug that every number passed.** The first render of the degree-9 node
showed the junction mouths torn open - wedges of missing tarmac, triangles inverted and culled -
while `_ribbons.mjs` reported 330 polygons all with real area. Cause: a corner pair is
`t +- n*h`, and `n` is the left normal of the edge's own polyline direction, which runs `a -> b`.
For an arm that *terminates* at the node that direction points inward, so its two corners come out
in the opposite rotational order from an arm that leaves. Half the arms were reversed and the ring
zigzagged across itself.

My first fix - sorting all corners by angle about the node - fixed the degree-9 node and broke
others, because it interleaves corners from two arms of similar bearing and very different width
and destroys the adjacency the fan depends on. The correct fix keeps the plan's structure (arms
sorted by bearing, each arm contributing its two corners adjacently) and flips only the SIGN of `n`
against the outward direction from the node, so the corners stay exactly the ribbon's terminal
vertices and the join stays watertight. `game/map/ribbons.js:351-391`.

### The junction screenshots, in my own words

`tools/_junctionshot.mjs --at -1246.7,116.9 --h 130` (node 403, degree 9, widths 14/14/9/14/14/9/9/15.8/14):
**good.** It reads as a real paved plaza. All nine arms arrive, the polygon fills the mouth
completely, no gap and no overlap at any arm, and the shoulder band runs continuously round the
outside. The lane markings inside the polygon sit at an arbitrary orientation, which is expected and
is what `crossing()` is for in section 8.

`tools/_junctionshot.mjs --at 1579.9,-181.0 --h 120` (node 267, degree 7, widths up to 29.7):
**acceptable, not good.** The junction itself is filled and connected, but this is dense downtown
where retreats of 25-40 m put adjacent junction polygons almost in contact, and the result reads as
broad merged paving rather than as distinct intersections. Nothing is torn, but the street pattern
is coarser than the reference. I would expect section 8's crossings, stop bars and manholes to carry
a lot of this, and if they do not then `SIN_FLOOR` deserves re-derivation.

I also rendered a 420 m altitude overview and it is **not** a usable diagnostic - the ground plane
is nearly the same value as the tarmac and the airlight washes it out. Do not judge this piece from
altitude; the two node-level shots are the evidence.

## 5. THE OVERLAY - THE ACCEPTANCE PICTURE

Not the source graph. The **BUILT** centrelines - post-retreat, post-clip - were dumped in
`paradise.json`'s shape (1,240 pieces, 2,480 endpoints) and run through the existing
`tools/_mapoverlay.mjs` against `reference/map/ign-map.jpg`.

The built network lands on the reference roads across the whole island: the coastal loop, the
downtown grid, the mountain switchbacks and the motorway all follow the underlying carriageways.
Every piece endpoint shows as a green "dead end" marker, which is an artefact of dumping each clip
piece as an isolated edge, not a defect.

## 6. `#map=grid` IS UNCHANGED

Seven scenes, `#map=grid`, against the S2 tree, compared to the same-tree noise floor established
in S0/S1:

| scene | noise floor | S3a grid vs S2 |
|---|---|---|
| dusk-highway-chase | maxd 5, 0.004% | maxd 6, 0.0080% |
| boost-blur | maxd 1, 0.002% | maxd 4, 0.0052% |
| crash-cam | maxd 2, 0.003% | maxd 10, 0.0067% |
| wet-night-asphalt | maxd 4, 0.003% | maxd 8, 0.0026% |
| daytime-downtown | maxd 10, 0.011% | maxd 8, 0.0144% |
| car-paint-closeup | maxd 2, 0.002% | maxd 1, 0.0010% |
| hud-overlay | maxd 1, 0.002% | maxd 5, 0.0063% |

Same order as the floor on every scene, none above 0.015% of pixels. The default path has not moved.

`#map=graph` boots with no console errors (`_junctionshot.mjs` collects and would report them; it
reported none across three runs). `bash tools/lint.sh` -> `lint ok`.

`chunkStats()` under `#map=graph`: `map: 'graph'`, 180 road cells, 396 road meshes, 1,240 ribbon
pieces, 330 junctions, 176 tapers, 311 boundary vertices, and **0 instanced pools** - correct, S3a
builds no content.

## 7. WHAT DOES NOT WORK, AND WHAT I DID NOT DO

**Kerbs and pavement are not built.** `createBlocks(doc)` is committed and gives 868 blocks with
face polygons and `buildBlockIndex`, and risk 12's rule is understood - extrude the drawn pavement
from the FACE polygon, never the inscribed AABB, because the AABB is what buildings sit on and the
pavement must always be outside it. None of that is written. It is the largest remaining piece of
S3a and it is untouched, not half-done.

**Two junction artefacts I am not hiding.** The 78 m plaza at node 319 and its 15 smaller siblings
come straight from `SIN_FLOOR = 0.20`; and downtown, large retreats make neighbouring junctions
merge into continuous paving. Both are the specified formula behaving as specified. Whether they are
acceptable is a judgement for the picture, and my judgement is that the degree-9 node is right and
the downtown case is coarse.

**A process failure worth recording.** I wrapped seven grid-only loops in `if (!GRAPH)` with a
pattern-matching script that matched the wrong occurrences - it wrapped code inside `makeFrondTex`
and `gantry`, where `GRAPH` is not even in scope. `bash tools/lint.sh` returned `lint ok` and the
page then hung at boot with no console error, which cost a full revert of `game/world.js` and a
re-apply. `lint ok` does not mean runnable; I knew that and still shipped an unbooted tree into the
next step. The gates are now anchored on unique comments and each one was verified by printing the
line it guards.

## 8. WHAT S3b INHERITS

- `planRoads()` is pure and node-testable; `tools/_ribbons.mjs` is the regression harness and
  already carries a poison control.
- `ribbonInto(..., v0)` is the texture-continuity hook; any future clipped ribbon must pass it.
- The junction ring is emitted pre-wound (signed area normalised in `ribbons.js`), so a consumer
  fans without guessing.
- Kerb and pavement extrusion from `createBlocks(doc).faces` is the first job.
