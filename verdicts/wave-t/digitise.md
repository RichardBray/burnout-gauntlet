# WAVE T - `digitise`. The Paradise City road graph. PASS.

Delivers `game/map/paradise.json` and `game/map/validate.mjs`, the two artefacts that gate every
other piece in wave T. No `game/*.js` module is touched: this piece produces data and a checker,
nothing that runs in a frame.

## Result

| | |
|---|---|
| nodes | 702 |
| edges | 937 |
| centreline | **76.89 km** |
| extent | -2000..2000 x -1430.7..1430.7 m (4000 x 2861 m) |
| scale | 2.965 m/px, from `MAP_WIDTH_M = 4000` |
| undirected components | **1** |
| strongly connected | **yes** (every edge is two-way, see below) |
| degree-1 nodes | **2, both flagged `deadEnd` after review** |
| `paradise.json` | 297 KB |

Classes, and the district split of the centreline:

| class | edges | median width |
|---|---|---|
| street | 532 | 14.0 m |
| service | 259 | 9.0 m |
| arterial | 95 | 23.7 m |
| motorway | 51 | 24.0 m |

`silverlake 18.5 km, mountain 18.5 km, palmbay 13.9 km, harbor 13.5 km, downtown 12.5 km.`

## How it is built

`bash tools/map-build.sh [workdir]`, four tools, all new:

- `tools/_mapdump.mjs` - decodes a reference JPEG to raw RGBA via a playwright canvas. There is no
  image library in this project and this job runs twice, so a browser is the decoder.
- `tools/_maptrace.mjs` - mask, pin removal, pin bridging, despeckle, component filter, closing,
  Zhang-Suen thinning, skeleton-to-graph. Eight stages, each dumping a preview.
- `tools/_mapgraph.mjs` - prune, junction merge, stub snapping, dead-end handling, width
  measurement, classification, districts, metric conversion.
- `tools/_mapoverlay.mjs` - draws the finished graph back over the source image.
- `tools/_mappng.mjs` - raw RGBA to PNG, for looking at any of the above.

The traced source is `reference/map/ign-map.jpg`, not the primary `street-names.jpg`: the primary
carries the district labels but its event/billboard overlay covers the downtown grid in black dots,
while the secondary's road network is clean and its road-class colouring is legible. Provenance for
both is in `reference/map/SOURCES.md`.

## The evidence

`verdicts/wave-t/digitise-overlay.png` - the graph drawn back over the source image, coloured by
class, with junctions in red and dead ends in green. **This is the acceptance evidence, and it is
not a debug convenience.** Every numeric check on a road graph - component count, degree-1 count,
total kilometres - passes just as happily on a graph that bears no resemblance to the city. This
project has shipped that failure five times under permanent rule 3. The only test that cannot be
faked is drawing the network on the picture and looking at whether it lands on the roads.

It does. It also caught the two real defects below, neither of which any number in this file would
have revealed.

## Three things that looked fine and were wrong

**1. The motorway was not in the map at all.** The road mask was "bright and desaturated", which is
right for surface streets and wrong for the motorway - it is drawn as a GOLD ribbon whose
saturation is well past any threshold that keeps terrain out. The traced network looked complete,
the validator would have passed it, and the single most important road on the map was absent. It
was visible only by cropping the overlay and seeing the gold ribbon with no line on it. The mask
now has a second, explicit gold clause (`tools/_maptrace.mjs`, stage 1).

**2. The classifier found the pins, not the motorway.** Once the ribbon was in the mask, `motorway`
still came back as 4 edges - and those 4 were sitting exactly on event pins, which are also gold
discs. The first threshold (`r-b > 28 && mx > 95 && sat > 0.20`) was strict enough that pins were
the only thing passing it. Dumping the gold mask as an image showed the real ribbon sitting well
below. Fixed by loosening the threshold to measured values, skipping pin pixels outright (the
tracer now exports its pin mask for this), and requiring width as well as colour so the thin orange
scenic route through White Mountain does not become a dual carriageway.

**3. Proximity clustering ate 40 km of road.** The skeleton branches roughly every 8 m, so merging
nodes within 22 m chained transitively - A~B~C~D until an entire road was one node - and the graph
came back 42.50 km against the 82.94 km that went in. Contracting short EDGES instead is bounded:
it can only ever remove that edge's own length. **The kilometre figure is now printed at every
stage of the pipeline, which is the only reason this was caught rather than shipped.**

## The dead-end decision, which is the one judgement call here

T3's rule is that no road may go nowhere, and the brief says a degree-1 node without an explicit
`deadEnd` flag fails. That check only means something if it can fail, so `deadEnd` is **never
stamped automatically**. The first clean run failed with 41 unflagged degree-1 nodes, and they were
worked through rather than waved past:

- **5** were stubs stopping within 45 m of another node - joined.
- **23** were stubs pointing at the MIDDLE of another road, 45-70 m short. Node-to-node snapping
  cannot see these; the struck edge is split to make a real T-junction.
- **11** more were then inspected on overlay crops. **Not one was a cul-de-sac** - every one was
  the mask losing a road that visibly continues in the picture, mostly dark downtown streets under
  building shadow. They are 80-230 m fragments that point at a road and stop short, so they are
  DELETED, at a cost of 2.11 km (2.7%). Flagging them would be a lie about deliberateness; joining
  them across 100 m of city block would invent roads through buildings, which is worse, because it
  changes what is drivable.
- **2** survive, listed in `REVIEWED_DEAD_ENDS` in `tools/_mapgraph.mjs` with what each actually
  is: a White Mountain switchback whose continuation is lost against rock, and a Harbor Town
  causeway deck lost against dark water. Both carry over 600 m of real road, so deleting them costs
  more than it cleans. **A listed entry that stops matching a degree-1 node is a HARD ERROR**, so
  the list cannot rot into an allowlist that pardons whatever drifts near it.

## The validator, and proof it can fail

`node game/map/validate.mjs`, wired into `tools/lint.sh` so a hand-edited graph cannot land broken.
It checks: schema version and units; missing node references, duplicate edges, degenerate
self-loops; district existence and endpoint containment; one undirected component; strong
connectivity respecting `oneWay`; and every degree-1 node explicitly flagged.

Mutation-tested, because a checker nobody has seen fail is not a checker:

| mutant | result |
|---|---|
| baseline `paradise.json` | **exit 0** |
| drop every edge at the highest-degree node | exit 1 - `2 undirected components, need exactly 1` + orphan coordinates |
| clear `deadEnd` on both reviewed nodes | exit 1 - `2 degree-1 nodes are not flagged deadEnd`, listed |
| set one edge at a dead end `oneWay` | exit 1 - `1 nodes are not strongly connected`, with the coordinate |
| point an edge at node id 999999 | exit 1 - missing node reference |

## What is honestly missing, and must not be mistaken for done

- **`oneWay` is `false` on every edge.** Nothing in a top-down still shows a turn restriction. This
  is an honest null, not an oversight: invented one-way runs would strand districts - the exact
  orphan the user banned - and the validator's directed pass would then be checking fiction. The
  pass is wired and proven (see the mutation table); it currently has nothing to catch.
- **`elevationClass` is `ground` on every edge.** Both reference maps are top-down. Paradise City
  has real vertical structure - elevated motorway, the mountain climb, the quarry pit - and none of
  it is readable from the source. The field exists in v1 because adding it later means re-authoring
  every edge.
- **Districts are a Voronoi partition of five hand-placed seeds**, not the irregular boundaries
  drawn in red on `street-names.jpg`. Tracing those needs the two source images registered to each
  other. The cells satisfy every criterion the brief asks - a total partition, so an edge is always
  inside the district it names - and the five districts are geographically separated enough that
  the cells land close. Marked `ponytail:` in the code with that upgrade path. 1.9% of endpoints
  straddle a boundary, which is expected: an edge names the district of its MIDPOINT.
- **Street names are not sourced and are absent.** Cosmetic; no criterion needs them.
- **`width` is dominated by its class floor for the two narrow classes.** Median street width is
  14.0 m and every service road is exactly 9.0 m, both of which ARE the floors in `MIN_W`. The
  measured half-width is doing real work in choosing the CLASS, and real work on arterial and
  motorway (19.8-49.4 m), but do not read a street's 14.0 m as a measurement - it is a default.
- **`MAP_WIDTH_M = 4000` is authored, not measured.** Nothing in the source image states a scale.
  It is one constant and every coordinate derives from it, so it is a calibration knob: if driving
  says the city is too big, retune that line and rebuild. Nothing else moves.

## What the next piece needs to know

`queries` should port `world.js`'s `surfaceAt(x, z)` off `LAYOUT` and onto this graph FIRST, before
any mesh generation. It is the smallest consumer, it is already injected into `physics.js` rather
than imported, and if the graph cannot answer it cheaply per frame then the spatial index is wrong
and every other consumer will inherit that. 937 edges with polyline shapes will need a grid or
R-tree; a linear scan per query is 937 segment tests per wheel per frame.

**The graph being connected says nothing about the built world being continuous.** The drive probe
over generated collision geometry is a separate, non-optional test - see the chunk contract in
`tools/WAVE-T-MAP-BRIEF.md`.
