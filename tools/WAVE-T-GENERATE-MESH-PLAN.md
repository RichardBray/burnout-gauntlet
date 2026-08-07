# WAVE T - `generate-mesh`, THE DESIGN. Binding.

This file is BINDING.

It is read ALONGSIDE `tools/WAVE-T-MAP-BRIEF.md`, `tools/WAVE-S-PLAY-BRIEF.md` and
`tools/WAVE-T-GENERATE-PLAN.md`, and it replaces none of them.

The eight decisions in `tools/WAVE-T-GENERATE-PLAN.md` are SETTLED.
This file implements them; it does not re-open them.

Authored as a design pass in session 19.
Every number in it was re-derived from the code and from `game/map/paradise.json`, not quoted from
prose.
Three figures in it are explicitly ESTIMATES and are marked GUESS inline where they occur; a later
reader must not mistake an estimate for a measurement.

A separate builder writes `game/map/blocks.js` concurrently, exporting
`createBlocks(doc) -> { blocks, faces, stats }` where each block is
`{cx, cz, w, d, bw, bd, district, faceId}`.
This plan is designed against that interface and assumes it exists.

---

## THE NUMBERS THIS PLAN IS BUILT ON

All re-derived from `game/map/paradise.json` directly, not from any brief.

- 688 nodes, 929 edges, 2373 straight segments, 78.81 km centreline.
- extent `x [-2000, 2000]`, `z [-1430.7, 1430.7]` = 4000 x 2861.4 m = 11.44 km2.
- degree histogram: 2 -> 358, 3 -> 228, 4 -> 70, 5 -> 21, 6 -> 7, 7 -> 2, 8 -> 1, 9 -> 1.
  Min 2, max 9.
- 21 distinct `width` values, 9.0 to 49.4 m.
- classes: street 509, service 269, arterial 99, motorway 52.
- edges per district: silverlake 222, mountain 215, palmbay 173, harbor 163, downtown 156.
- edge length: min **5.2**, p50 74.3, p90 140.9, max **398.4**.
  21 edges are longer than 200 m; none longer than 400 m.
- **single segment max = 230.3 m**, segment p50 26.9 m.
  This number decides section 3.
- all 929 edges are `elevationClass: 'ground'`.
  There is no bridge in the graph.
  This decides one item in section 8 and risk 16.
- at a 200 m lattice, **176 of 300 cells are occupied**, mean 13.5 segments per occupied cell,
  max 43 segments in one cell.

---

## 1. THE CHUNK LIFECYCLE

### Keep `CHUNK = 200`

`game/world.js:3058` sets `CHUNK = 200` and the comment at `game/world.js:3051` records it as a
measured draw-call / triangle trade, not a guess.
Three reasons to reuse it rather than re-derive it:

1. The per-chunk pools in decision 2 produce *exactly the same cut* the existing render-side pass
   produces (`world.js:3099-3155`).
   Reusing the cell size means the measured draw-call sweep behind `CHUNK = 200` still applies, and
   the whole block `world.js:3022-3167` can be **deleted** rather than kept alongside a second,
   differently-sized cut.
2. 176 occupied cells x 13.5 segments means a chunk's road content is about 2.7 km of centreline and
   about 3.5 city blocks (from roughly 600-1500 blocks over 11.44 km2, see section 5).
   That is a build unit of the right size: big enough that per-chunk fixed costs amortise, small
   enough that one build fits inside the 30 ms hitch budget.
3. A 3x3 resident set at 200 m is 600 x 600 m = 0.36 km2, against the old world's roughly 1.21 km2.
   Boot generates **less area than today**, which is what makes the load-time claim in the wave brief
   arithmetically possible.

### Resident set at boot: the 3x3 Chebyshev ring, 9 cells

`resident(cx, cz) = { max(|cx - hx|, |cz - hz|) <= RES }` with `RES = 1` at boot.

Why 1 and not 2.
I estimated the instance density from the census in `world.js:3029` - 203,540 instances over the old
1.21 km2 world.
Per 200 m cell that is about 6,700 instances; the graph's block density is about 3x the old grid's
(see section 5), so **about 20,000 instances per cell is my working figure. THIS IS A GUESS.**
The counting pass in section 6 replaces it with a real number on the first boot, and no decision in
this plan may depend on it once that number exists.
9 cells at that estimate is about 180 k instances, roughly parity with today's whole map.
25 cells would be about 500 k, 2.5x today's total submitted instance count, which would burn the
frame-time budget before the `stream` piece even starts.

So: **`RES = 1` (9 cells) at boot, `RES` is a runtime knob (`#chunkres=`), and anything beyond it is
`skyline`'s LOD problem, not `generate-mesh`'s.**

Hysteresis: build when a cell enters `RES`, dispose when it leaves `RES + 1`.
Without a dead band the hero oscillating on a boundary line thrashes build and dispose at the frame
rate.

### Signatures

```js
/**
 * Build cell (cellX, cellZ). Idempotent: returns the existing record if resident.
 * Pure function of (cellX, cellZ, graph, blocks) - never of visit order, never of R.
 * @returns {ChunkRec}
 */
function buildChunk(cellX, cellZ) -> ChunkRec

/** Tear cell (cellX, cellZ) down. No-op if not resident. */
function disposeChunk(cellX, cellZ) -> void

/** ChunkRec */
{
  key: '3,-2', cellX, cellZ,
  group: THREE.Group,                      // the only thing added to world.group
  pools: Map<stateKey, InstancedMesh>,     // see section 2
  geoms: THREE.BufferGeometry[],           // roads, junctions, kerbs, smears - chunk-owned
  hidden: THREE.Mesh[],                    // registered with roadKit's reflection; see risk 1
  contacts: {x,z,y,rx,rz,ry,a}[],          // this chunk's contact pads
  contactMesh: THREE.InstancedMesh,
  lamps: THREE.Vector3[],  neons: {...}[], // this chunk's light emitters
  poleIdx: number[],  parkedIdx: number[], // slots owned in the LIVE global registries
  stats: { edges, nodes, blocks, instances, tris, buildMs },
}
```

**`buildChunk` owns**, and `disposeChunk` destroys: every `InstancedMesh` in `pools` (the `geometry`
is a shared prototype and is *not* disposed; `instanceMatrix` and `instanceColor` die with the mesh),
every `BufferGeometry` in `geoms` (`.dispose()`), the entries this chunk pushed into `world.poles`,
`world.parkedCars`, the light-emitter list, the smear group and the reflection-hidden list, and
`contactMesh`.

**What stays global**, built once in `createWorld` and never disposed: all 45 materials, all texture
canvases, all geometry prototypes, the ground plane (`world.js:1167`, a 6000 x 6000 plane that
already covers the 4000 x 2861 extent), `world.blocks` (the full AABB list from `createBlocks(doc)` -
it is data, not geometry, and `physics.js:922` needs all of it), `world.paths`, the road graph, the
point-light pool (`world.js:2985`), `LAYOUT` plus `LAYOUT.carKit` (decision 6), and the two stable
Groups `smears` and `spillRoot`.
See risk 9: `main.js:286` captures `world.aoExclude` **once**, so the objects in it must never be
replaced.

Dispose ordering matters.
Remove from the live registries *before* `group.remove()`, so a `polefall` or `traffic` callback
firing between the two cannot write to a dead mesh.

---

## 2. THE GLOBAL / PER-CHUNK SPLIT

### Global, no exceptions - all 45 materials

Counted from `world.js`: `groundMat` 1166, `concMat` 1196, `kerbMat` 1200, `walkMat` 1204, `poleMat`
1211, `darkMat` 1214, `paintedMat` 1217, `leafMat` 1220, `railMat` 1223, `buildingMats` x4 1262,
`storeMat` 1273, `mechMat` 1303, `beaconMat` 1316, `mullionMat` 1338, `shopIntMat` 1501, `signMats`
x12 1846, `awnMat` 1954, `tubeMat` 2130, `bulbMat` 2133, `spillMat` 2137, `lampMat` 2191, `lensMat`
2261, `hydMat` 2310, palm-trunk mat 2330, `frondMat` 2335, `carPaint` 2473, `carGlass` 2476,
`tyreMat` 2479, `paintMat` 2766, `patchMat` 2770, `contactMat` 2887 = **45**.
Plus `road.js`'s `mats.city`, `mats.highway` and `shoulderMat` (`road.js:1800`, `road.js:1828`).

All 45 are constructed once, before any chunk exists, from the global `R = makeRng(0xC0FFEE)`
(`world.js:1064`).
Same for every texture canvas: `makeFacade` x4 (319), `makeStorefront` (463), `makeConcrete` (560),
`makeSign` x12 (593), `makeAwningTex` (686), `makeShopIntTex` (718), `makeMechTex` (765),
`makeContactTex` x2 (786), `makeFrondTex` (800).
This is the 2173 ms `warm` stage; it must not move and must not grow.

Two material-side consequences that are non-obvious.

- `patchAtmo` and `patchFacade` bind the **shared** `atmo` uniform object (`world.js:1098`).
  Because the material is shared, a chunk built after `setNight(true)` inherits night automatically.
  But `spillMesh.visible = night` at `world.js:3210` is a per-*mesh* flag, so `buildChunk` must end
  with `applyChunkState(rec)` that re-asserts `night` and the last `sunDir`.
  See risk 9.
- `setWet` (`world.js:3255`) and `setNight` only touch materials, so they need no per-chunk iteration
  at all.
  That is a good property; preserve it.

### Global geometry prototypes

Shared, immutable, never disposed.
A `BoxGeometry` prototype is scaled per instance, so one suffices for every box in the city.

`boxGeo` 1282, `shopQuad` 1504, `planeGeo` 1843, `braceGeo` 1887 (pre-rotated `rotateX(-0.60)`),
`awnGeo` 1957 (pre-rotated), `tubeGeo` 2131 (**this is a second `BoxGeometry(1,1,1)`; merge it into
`boxGeo`, it is a free draw-state saving**), `binGeo` 2317, `frondGeo` 2340 (pre-rotated and
translated), `carWheelGeo` 2491, `flatGeo` 2774, `discGeo` 2776, `contactGeo` 2904, plus the
cylinders and spheres at 1307, 1308, 1317, 1885, 2134, 2209, 2258, 2262, 2320, 2321, 2323, 2326,
2327, 2330, 2877.

### Per-chunk geometry - only these

- one batched road-ribbon `BufferGeometry` per `cls` per chunk, at most 2 (city, highway),
- one batched shoulder geometry per chunk,
- one batched junction-polygon geometry per chunk,
- one batched kerb / pavement extrusion per chunk,
- the wet-smear batch (`roadKit.addWetSmearBatch`, `road.js:2026`).

That is **at most 6 chunk-owned geometries**, against today's roughly 172 unshared ones: 2 per
`buildRibbon` call (`road.js:1887`, `road.js:1892`) times about 50 ribbons, plus 2 per block
(`world.js:1238`, `world.js:1248`) times 36 blocks, plus the 2400 m rails at `world.js:2838` and the
deck at `world.js:2859-2866`.
This is the item `WAVE-T-GENERATE-PLAN.md:154-157` calls out.

### Per-chunk `InstancedMesh` pools - every single one

Every `InstancedMesh` currently in `world.js` becomes per-chunk.
There is no split here; the line falls entirely on one side.
Named, with source line:

`towerMesh` x4 (1286), `podiumMesh` (1292), `capMesh` (1300), `plantMesh` (1301), `mechMesh` (1306),
`tankMesh` (1307), `mastMesh` (1308), `strutMesh` (1314), `acMesh` (1315), `beaconMesh` (1317),
`gridMesh` (1346), `shopMesh` (1505), `signMeshes` x12 (1871), `signFrame` (1884), `signStrut`
(1885), `braceMesh` (1891), `awnMesh` (1965), `gantryMesh` (2076), `tubeMesh` (2132), `bulbMesh`
(2134), `spillMesh` (2141), `slPole` / `slArm` / `slHead` / `slBulb` (2209-2212), `tlPole` / `tlArm`
/ `tlHead` / `tlLens` (2258-2262), `binMesh` (2318), `boxMesh` (2319), `hydBody` (2320), `hydCap`
(2321), `planterMesh` (2322), `shrubMesh` (2323), `benchSeat` (2324), `benchLeg` (2325),
`bollardMesh` (2326), `meterMesh` (2327), `palmTrunk` (2330), `frondMesh` (2343), `guardPost` (2442),
`guardRail` (2443), `carBody` (2488), `carCab` (2489), `carTrim` (2490), `carWheel` (2492),
`paintMesh` (2778), `patchMesh` (2779), `holeMesh` (2780), `railPost` (2844), `barrier` (2853),
`pier` (2877), `contactMesh` (2906) - **62 pools**.

They are **not** allocated as 62 pools per chunk.
Decision 2's last line points at `world.js:3088-3098`: bucket by draw state at allocation time, not
after.
The sink key is

```js
`${geo.uuid}|${mat.uuid}|${cast?1:0}${recv?1:0}|${renderOrder}`
```

which is byte-for-byte the key at `world.js:3093-3094`.
So `capMesh` / `plantMesh` / `planterMesh` / `barrier` (all `boxGeo` plus `concMat`, cast and recv)
become **one** chunk mesh; `strutMesh` / `slArm` / `tlArm` / `gantryMesh` / `railPost` become one;
`signFrame` / `slHead` / `tlHead` one; `benchSeat` / `benchLeg` / `carTrim` one.
I count **about 40 distinct draw states** across the whole pool list, so about 40 colour-pass calls
per fully-built chunk and about 360 for a 9-chunk resident set, against today's 849 for the whole
map.
That is the arithmetic the `perf` piece will check.

The worst single contributor is the **12 sign materials** (`world.js:1844-1879`): 12 draw states x 9
chunks = 108 calls for signage alone.
The highest-leverage optional follow-up is atlasing `makeSign`'s 12 textures into one material - that
*removes* 11 materials from the `warm` stage rather than adding any, which is exactly the direction
decision 4 pushes.
I am scoping it **out** of this piece, because it re-UVs every sign, and flagging it for `perf` and
`skyline`.

---

## 3. ROADS

### What `buildRibbon` actually is, and why it cannot be reused as-is

`road.js:1846-1901`.
Three hard facts read off the code, not the docstring.

1. **It returns a `THREE.Group`, not a `Mesh`** (`road.js:1861`, `road.js:1900`).
   The header comment at `road.js:2` is wrong.
   It holds up to two meshes, each with its own `BufferGeometry` built at `road.js:1877-1883`.
2. **It has no per-edge width.**
   `const spec = mats[cls].spec` (`road.js:1847`) and `build(spec.widthM / 2, ...)`
   (`road.js:1892`).
   The only two specs are `city: widthM 20` and `highway: widthM 36` (`road.js:1742-1743`).
   The graph has 21 widths from 9.0 to 49.4 m.
   Adding a spec per width means a `makeRoadTile` and a `MeshPhysicalMaterial` per width, which is
   **21 new programs**, which decision 4 forbids outright.
3. **It registers both meshes in `refl.hidden`** (`road.js:1890`, `road.js:1898`), an array with no
   removal path (`road.js:1597`, iterated twice per reflection at `road.js:1707` and `road.js:1723`).
   Under streaming this leaks, and it re-shows disposed meshes.

So `buildRibbon` cannot emit into a shared batched geometry as written.
**A new builder is needed, and it lives in `road.js`, not `world.js`.**
That is a routed finding and must be named in the builder's brief as a cross-file dependency.

### The replacement, and its material cost: zero

Add to `roadKit`, alongside `buildRibbon`:

```js
/** Append a ribbon into caller-owned arrays. No geometry allocation, no Mesh, no material.
 *  @param sink {pos, uv, nor, idx}  caller-owned growable buffers
 *  @param pts  [[x,z],...]
 *  @param nrm  [[nx,nz],...]  PRECOMPUTED per-point normals, same length as pts  <- the seam fix
 *  @param halfW  metres - the EDGE's own half-width, not the spec's
 *  @param uRepeat  how many texture widths span the ribbon (= 2*halfW / spec.widthM)
 */
ribbonInto(sink, pts, nrm, halfW, y, uRepeat, vScale)

/** One Mesh per (cls) from a filled sink, using the EXISTING mats[cls].mat. */
finishRibbon(sink, cls) -> THREE.Mesh

/** Un-register a mesh from the planar-reflection hide list. Fixes the leak above. */
releaseHidden(mesh)
```

`ribbonInto` is `road.js:1862-1884` with the array targets hoisted out and `halfW` as an argument.
`buildRibbon` is then reimplemented as a three-line wrapper over it, so nothing else in the tree
changes behaviour.
That is the check for staging step S0.

**Material cost: zero new materials.**
A chunk's roads are at most 3 draw calls - `mats.city.mat`, `mats.highway.mat`, `shoulderMat` - and
all three already exist at `road.js:1800` and `road.js:1828` and are already compiled inside the
566 ms `road` stage.

**Per-edge width without a per-width material.**
The road tile is authored for `spec.widthM` with lane markings drawn in.
Two options, and the second is the recommendation.

- *(a)* Set the U coordinate to span `0 ... 2*halfW / spec.widthM` instead of `0 ... 1`, with
  `RepeatWrapping`, so a 40 m road draws the 20 m lane pattern twice rather than stretching it.
  Correct in kind (a 40 m road *is* eight lanes), and free.
  **RISK, AND THIS IS A GUESS: I have not verified that `makeRoadTile`'s albedo is horizontally
  tileable.**
  It draws a centre pair (`road.js:351`), so a horizontal repeat probably puts a double yellow line
  where a lane line belongs.
  I am guessing it is not tileable; the builder must render one and look before choosing (a).
- *(b) Recommended.*
  Draw the marked carriageway at the class's spec width (`motorway -> highway / 36 m`, everything
  else -> `city / 20 m`) and carry the remaining `width - specWidth` as **shoulder**, using
  `shoulderMat`, which is a flat colour plus a tiled normal (`road.js:1828-1832`) and tiles cleanly
  at any width.
  A 49.4 m arterial then reads as a 20 m marked carriageway with 14.7 m of hard shoulder each side.
  For the 9.0 m service roads, shrink the carriageway to 9.0 and let U span `9/20`, a partial tile,
  which is what a narrow street should look like.
  This is honest, tiles correctly, costs nothing, and matches `graph.js:16`'s `SHOULDER = 3.0`
  semantics: `surfaceAt` already calls the whole `width/2 + 3.0` corridor tarmac, so the shoulder
  must be paved-looking, and it is.

### Chunk-boundary continuity (chunk contract rule 4)

**Mechanism: clip at the boundary, with bit-identical shared boundary vertices, using per-point
normals precomputed over the FULL edge.**

Precisely:

1. For each edge, once (cached on the edge, computed on first touch), build the full point list
   `pts = [nodeP(a), ...shape, nodeP(b)]` - the same list `graph.js:35` builds - and the full normal
   list using `road.js:1856`'s central-difference formula over the **whole** polyline.
2. Walk the polyline and split it at every crossing of an `x = k*200` or `z = k*200` plane.
   At a crossing, compute the crossing point `p*` by linear interpolation in `t`, and the normal `n*`
   by the same interpolation between the two bracketing normals, then renormalise.
   **Both adjacent chunks compute `p*` and `n*` from the identical two source points and the
   identical `t`, in the identical order, so the two results are bit-identical IEEE doubles.**
3. Each sub-polyline is emitted, with its precomputed `(p, n)` pairs, into the batch of the cell it
   lies in.
4. Because `ribbonInto` takes normals rather than deriving them, a sub-polyline's *endpoint* vertex
   is computed from `n*` and not from a one-sided difference.
   This is the entire fix.
   Without it, chunk A's last cross-section uses `normalize(p_end - p_prev)` and chunk B's first uses
   `normalize(p_next - p_end)`, the two differ wherever the road curves, and the result is a visible
   V-notch at every boundary on every curved road, which in this graph is most of the 1444 shape
   points.

**Why the alternative - assign the whole edge to one owning chunk - fails, in numbers.**
Max edge length is 398.4 m and **max single segment length is 230.3 m**, both larger than one 200 m
cell.
With a 3x3 resident set (600 m across) and midpoint ownership, an edge 398 m long whose midpoint sits
500 m from the hero is *not built at all*, while its near end is 300 m away and squarely on screen -
a hole in the road that the drive probe hits at 70 m/s.
Enlarging the resident set to cover the worst edge means `RES >= 3` (1400 m), 49 cells, and on the
density estimate above about 1 M instances at boot, which is precisely the eager build that
chunk-contract rule 1 exists to forbid.
And because the *segment* max exceeds the cell size, even a segment-granular ownership rule fails;
the clip must happen *inside* a segment.
Ownership is not salvageable at any cell size below 240 m, and at 240 m the resident set is 1.7x
bigger for no benefit.

**Why not "duplicate the whole edge into every chunk it touches":** two coplanar copies of the same
tarmac at the same `y` is z-fighting across the entire overlap, and it doubles the road triangle
count.
Rejected.

**Physics note that removes half the fear here.**
The car does not drive on this geometry.
`physics.js` gets its surface class from the injected `surfaceAt` (`main.js:230`), and after
`generate-wire` that is `graph.js:152`, an analytic query on the graph, independent of any mesh.
So a geometric seam is a *visual* defect, never a "car loses ground contact" defect.
That is worth stating in the verdict, because the drive probe in `WAVE-T-MAP-BRIEF.md:154` asserts on
ground contact and will pass straight over a visible seam.
The seam has to be checked with pixels, not with the probe.

---

## 4. JUNCTIONS

Today there is no junction geometry at all.
`world.js:1178` runs the X ribbons straight through, and `world.js:1180-1186` retracts every Z ribbon
by `HALF + 1` = 11 m from each crossing and drops it 2 mm (`y: 0.028` against the default `0.03` at
`road.js:1846`).
That works only because every crossing is orthogonal and both roads are exactly 20 m.
It survives neither 688 nodes of degree 2 to 9 nor 21 widths from 9.0 to 49.4 m: at a 30 degree skew
the retraction distance is wrong by a factor of 2, and a 49.4 m road crossing a 9.0 m one leaves 20 m
of the wide road unpaved on each side of the narrow one.

### The polygon

At node `v` with incident edges `e_i`, let `theta_i` be the bearing of `e_i` leaving `v` (from the
node toward the first interior point of the edge's polyline), and `h_i = e_i.width/2 + 3.0`, the
**paved** half-width, matching `graph.js:16`'s `SHOULDER` exactly, so the drawn tarmac and
`surfaceAt`'s tarmac corridor are the same surface.

1. **Retreat distance.**
   For each `i`,
   ```
   r_i = max over j != i of  h_j / max(0.20, |sin(theta_i - theta_j)|)
   r_i = clamp(r_i, h_i, 3.0 * max_j h_j)
   r_i = min(r_i, 0.45 * length(e_i))          // the 5.2 m edge must survive
   ```
   The `0.20` floor bounds the near-collinear case, two edges meeting at a shallow angle; without it
   `r_i` goes to infinity.
   The `0.45 * length` clamp is the one that keeps the 5.2 m minimum edge from being consumed
   entirely.
   When both ends clamp, the edge contributes no ribbon at all and the two junction polygons abut
   directly, which is correct and is what a very short link between two big junctions looks like.
2. **Corners.**
   Terminate ribbon `i` at arclength `r_i`; its terminal cross-section has two corner points
   `L_i = p_i(r_i) - n_i*h_i` and `R_i = p_i(r_i) + n_i*h_i`, where `p_i(r_i)` and `n_i` come from the
   *same* full-edge polyline and normal arrays used in section 3.
3. **Fill.**
   Sort the incident edges by `theta_i`.
   The junction polygon is the closed loop `[R_1, L_1, R_2, L_2, ..., R_d, L_d]`: each edge
   contributes its two corners and consecutive edges are joined corner to corner.
   Triangulate as a fan from `v`.
   That is `2d` triangles: 4 for degree 2, 18 for degree 9.
   Total across the 330 nodes of degree 3 or more is about 1,600 triangles for the entire city's
   junctions.
4. **Material and UVs.**
   `mats[cls].mat` of the **widest incident edge's class**.
   UVs are a planar world projection, `u = x / spec.widthM`, `v = z / spec.tileLenM`, so the asphalt
   grain and aggregate continue through the junction.
   Lane markings will appear at an arbitrary orientation inside the junction box; that is why
   `crossing()` (`world.js:2784`) exists and gets re-pointed at junctions in section 8 - the zebra,
   the stop bar and the manholes are what dress a junction, and they are already instanced quads with
   a polygon offset.
5. **Degree-2 nodes, 358 of them.**
   No polygon.
   If the two edges' widths are equal, the polylines simply concatenate.
   If they differ, emit a two-triangle taper quad between the two cross-sections.
   This is the only place a degree-2 node produces geometry.

### Z-fighting, without the 2 mm hack

The 2 mm offset at `world.js:1185` exists for exactly one reason: the ribbons **overlap**.
Once every ribbon is retracted to `r_i` and the gap is filled by a polygon whose corner vertices *are*
the ribbons' terminal vertices, there is **no coplanar overlap anywhere in the road network**.
Nothing can z-fight with nothing.

That lets every ground-class road surface sit at exactly one `y = 0.03`, one plane for the whole
city, which is also what `road.js:1609`'s `anchor = new THREE.Vector3(0, PLANE_Y, 0)` - the planar
reflection's mirror plane - assumes.
Today's 2 mm-dropped ribbons are *already* slightly wrong for that reflection; removing them fixes it
as a side effect.

Two follow-on rules.

- The shoulder ring (`road.js:1887`, `y - 0.02`) is **not** emitted at junctions, because the
  junction polygon is already drawn at the paved half-width.
  The shoulder ribbon likewise terminates at `r_i`.
- Everything overlaid on the road - `paintMesh` / `patchMesh` / `holeMesh` at `world.js:2778-2780` -
  keeps its `polygonOffset` (`world.js:2768`, `world.js:2772`) and its `PAINT_Y = 0.045`
  (`world.js:2781`).
  That mechanism is correct and unchanged.

---

## 5. BUILDINGS

Stage 15 (`world.js:1699-1776`, towers) and stage 16 (`world.js:1778-1827`, perimeter street wall)
both do `for (const b of blocks)` and draw from the global `R`.

### Block -> chunk ownership rule

**A block belongs to the single cell containing its centre:
`owner(b) = (floor(b.cx/200), floor(b.cz/200))`.**

A block *is not* clipped and *is not* built twice.
A building is not a clippable object - half a tower is worse than no tower - and duplicate ownership
would double-draw every straddling mass.
Blocks in this graph are bounded by the face polygons of a road network whose p50 edge is 74 m, so
most blocks are well under 200 m and straddle at most one boundary.

Consequence, stated plainly because it is a visible artefact: a large block whose centre is just the
wrong side of a boundary pops in as a whole when its owner cell loads.
With `RES = 1` the pop happens 400-600 m from the hero, behind the fog build-up (`world.js:1100`
`uHazeD`), and it is `skyline`'s LOD job to cover it.
If it reads badly, the fix is `RES = 2` plus impostors, not a change to the ownership rule.

Sorting: within a chunk, iterate owned blocks in a canonical order - `sort by (cx, cz)` - so nothing
depends on `blocks.js`'s face-traversal order.

### The seed function

Decision 1 requires a pure function of the cell.
I recommend a strict **refinement** of it, not a re-litigation, that is immune to a later change of
`CHUNK` or of the ownership rule.

```js
// game/util.js - new export. `hash` does not exist today; `hashNum` at world.js:954
// is a URL-hash-param reader and is a different thing entirely. Do not overload the name.
export function cellHash(a, b, salt = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ (salt | 0);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return (h ^ (h >>> 16)) >>> 0;
}
```

- **Per block:** `makeRng(cellHash(Math.round(b.cx * 8), Math.round(b.cz * 8), 0xB10C))`.
  A block's appearance depends only on where it is, not on which cell owns it or in what order it was
  reached.
- **Per edge:** `makeRng(cellHash(e.id, 0, 0xED6E))` - lamps, road wear, parked ranks, gantries.
- **Per node:** `makeRng(cellHash(n.id, 0, 0x10DE))` - junction dressing, signals, crossings.
- **Per cell:** `makeRng(cellHash(cellX, cellZ, 0xC0FFEE))` - only for things that genuinely belong
  to the cell and to nothing in it.
  I expect this to be used almost nowhere, which is the point.
- `R = makeRng(0xC0FFEE)` (`world.js:1064`) stays for materials and textures and **must not be
  referenced inside any emitter**.
  The easiest way to enforce that is to shadow it after the material block - `const R = null;` in the
  emitter scope - so any surviving reference throws at boot instead of silently non-determinising the
  world.

Every emitter function that currently closes over `R` gets `rng` as its first parameter.
That is `facadePaint` (1435), `facadeGrid` (1441), `shopBay` (1520), `storefrontBand` (1533),
`rooftop` (1591), `facadeDetail` (1631), `panelPair` (1907), `placeSign` (1919), `awning` (1975),
`neonSign` (2145), `gantry` (2077), `palm` (2345), `rank` (2672), `signalQueue` (2723), `roadWear`
(2807), `parkedCar` (2547).

**`world.js:2159` is a live bug that streaming makes fatal.**
Inside `neonSign`, `const bo = (rng() - 0.5) * (w - bw) * 0.8;` draws from the **injected** `rng`
(`main.js:183`, `makeRng(0xC17E)`), not from `R` - a second, undeclared, order-dependent stream.
It must become the emitter's `rng`.

### Districts replace `downtown`

`world.js:1673` - `const downtown = (b) => Math.hypot(b.cx, b.cz) < 260;` - is deleted and replaced by
a table keyed on `b.district`, which `createBlocks(doc)` supplies, attributed from the face's own
edges.

The rule that protects the visual gate: **the two profiles that carry the existing skyline are copied
verbatim from the current literals; only the three new districts get new numbers.**

| district | tower base h | street-wall h | masses/block | styles | `rich` detail |
|---|---|---|---|---|---|
| `downtown` | `rngRange(rng, 40, 138)` - verbatim `world.js:1715` inner branch | `rngRange(rng, 13, 36)` - verbatim `world.js:1794` inner | `rngInt(rng, 3, 4)` - verbatim `world.js:1701` inner | `['glass','office','glass','concrete']` - verbatim 1717 | yes (`world.js:1739`) |
| `silverlake` | `rngRange(rng, 24, 70)` | `rngRange(rng, 12, 28)` | `rngInt(rng, 3, 4)` | `['office','concrete','glass']` | yes |
| `palmbay` | `rngRange(rng, 13, 46)` - verbatim `world.js:1715` outer | `rngRange(rng, 10, 22)` - verbatim 1794 outer | `rngInt(rng, 3, 3)` | `['brick','office','concrete']` - verbatim 1718 | no |
| `harbor` | `rngRange(rng, 10, 30)` | `rngRange(rng, 8, 18)` | `rngInt(rng, 2, 3)` | `['brick','brick','concrete']` | no |
| `mountain` | `rngRange(rng, 10, 24)` | `rngRange(rng, 8, 16)` | `rngInt(rng, 1, 2)` | `['concrete','brick']` | no |

`palmbay` additionally raises the palm share at `world.js:2399` from `0.075` to about `0.16`;
`harbor` lowers it to 0.
That is an instance-data change, not a material change.

Everything downstream of `innerB` - the `1.65` height multiplier (1716), `PAINT_CHANCE` (1422),
`facadeDetail(..., innerB && st === 0)` (1739) - reads the profile instead of the radius, with the
same expressions.

**The gate constraint this creates.**
`daytime-downtown` is one of the seven scenes and it is judged on a 40-138 m skyline.
So `paths.city` (section 8) **must** pass through the `downtown` district, and the block that the
`daytime-downtown` camera looks at must be a `downtown` block.
Verify with a shot before claiming the gate.

There are 156 `downtown` edges of 929, 17%, so the district is large enough to hold a scene.

---

## 6. CAPS: COUNTED, NOT GUESSED

Decision 3 says count first, allocate second.
A literal two-pass counter has a nasty property: pass 1 would consume the RNG, and the code paths are
RNG-branched (`if (R() < 0.45)` at `world.js:1607`, `while (t < len/2 - 12)` at `world.js:1790`,
`rngInt` counts everywhere), so a count that does not draw the same random numbers is a *bound*, not
a count.

**Design: single pass, deferred allocation.
The cap IS the count, because allocation happens after emission.**

```js
function makeSink() {
  const pools = new Map();   // stateKey -> {geo, mat, cast, recv, ro, m:Float32Array, c:Float32Array, n:0}
  return {
    /** Same argument list as world.js:1132 push(), plus the pool descriptor. */
    push(desc, x, y, z, ry, rz, sx, sy, sz, color) { /* grow-by-doubling, write 16 floats */ },
    /** bench() at world.js:2365-2366 does `push(); count--`. The sink MUST support it. */
    pop(desc) { p.n--; },
    /** Allocate exactly p.n instances per pool and upload in one set(). */
    finalize(chunkGroup) {
      /* new InstancedMesh(geo, mat, p.n);
         im.instanceMatrix.array.set(p.m.subarray(0, p.n * 16)) */
    }
  };
}
```

- **The count expression, for every one of the 62 pools, is literally `p.n` at `finalize()` time** -
  the number of `push` calls minus the number of `pop` calls.
  There is no expression to get wrong, no branch to mis-predict, no `rngInt(R,2,5)` to over-bound.
- Growth is by doubling a `Float32Array`, starting at 256 instances = 16 KB.
  Peak transient for the biggest pool (`gridMesh`, `world.js:1346`, cap 190,000 today) at the
  estimated 20 k instances per chunk is 1.3 MB, freed at `finalize`.
  No per-instance object allocation, so no GC pressure, which matters because this runs mid-frame
  under the 30 ms hitch budget.
- `push()`'s silent drop at `world.js:1133` **cannot happen**, because there is no cap during
  emission.

**Where a count is genuinely hard to precompute: nowhere.**
Deferred allocation makes every pool exact, including the ones that would have needed estimates -
`gridMesh`, `capMesh`, `strutMesh`, `frondMesh`, `contactMesh`.
Note that `contactMesh` at `world.js:2906` is *already* allocated `contacts.length + 8` after the
fact, which is the same trick applied once by hand.
So the overflow counter has nothing to count for chunk pools, and it is published as a hard zero.

**But the overflow counter is still built, for a different reason.**
Any pool that stays global, and any pool a future builder adds with a literal cap, can still silently
drop.
The file records four historical incidents of exactly that: `world.js:1880`, `world.js:1961`,
`world.js:2313`, `world.js:1838`.
So:

```js
// world.js, the shared push() at :1132
if (m.count >= m.userData.cap) {
  dropStats.n++;
  dropStats.pools[m.name] = (dropStats.pools[m.name] || 0) + 1;
  return;
}
```

published on `world.chunkStats().overflow` and asserted `=== 0` by the probe in section 7.
That closes the incident class permanently, for one line.

Two counting traps the builder will hit.

- `bench()` at `world.js:2365-2366` pushes a placeholder and then does `benchLeg.count--`.
  Without `sink.pop()` the array holds a stale 16-float entry and the count is one too high per bench
  leg, two per bench.
  Handle it, or better, delete the placeholder line - it is dead code.
- `streetLight` (`world.js:2231`) and `parkedCar` (`world.js:2589`) write matrices *directly* rather
  than through `push()`, and record `[mesh, index]` pairs for a later `hide()`.
  Under the sink, `rec()` must record `[desc, index]` and `hide()` must resolve `desc -> finalized
  mesh` after `finalize()`.
  Get this wrong and you reproduce the phantom-parked-car bug that the note at `world.js:2617-2621`
  describes.

---

## 7. WHAT MUST BE ASSERTED AT `window.__ready`

The anti-metric rule (`WAVE-T-MAP-BRIEF.md:234`) means the assert must **count objects that exist in
the scene graph**, not read bookkeeping counters.
A counter can say "9 chunks built" while the scene holds 300.

### `world.chunkStats` is a function, and it traverses

```js
world.chunkStats = function chunkStats() {
  let meshes = 0, instances = 0, tris = 0;
  const geoms = new Set();
  group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    meshes++; instances += o.count; geoms.add(o.geometry.uuid);
    tris += o.count * (o.geometry.index ? o.geometry.index.count
                                        : o.geometry.attributes.position.count) / 3;
  });
  const rc = [...resident.values()];
  return {
    cell: CHUNK,                                   // 200
    residentCells: rc.length,                      // <- THE number
    residentKeys: rc.map((c) => c.key).sort(),
    mapCells: MAP_CELLS,                           // 300
    mapOccupiedCells: MAP_OCCUPIED,                // 176, precomputed from the graph
    // Counted off the chunk records that EXIST, not off a running total.
    edgesBuilt:  rc.reduce((a, c) => a + c.stats.edges,  0),
    nodesBuilt:  rc.reduce((a, c) => a + c.stats.nodes,  0),
    blocksBuilt: rc.reduce((a, c) => a + c.stats.blocks, 0),
    edgesTotal: 929, nodesTotal: 688, blocksTotal: world.blocks.length,
    meshes, instances, geometries: geoms.size, tris,
    chunkGeoms: rc.reduce((a, c) => a + c.geoms.length, 0),
    builds: buildCount, disposes: disposeCount,    // lifetime, for the leak check
    lastBuildMs, maxBuildMs,
    overflow: { n: dropStats.n, pools: { ...dropStats.pools } },
  };
};
```

`residentCells` and `instances` are both derived from live objects.
An eagerly-built world cannot produce `residentCells: 9` while holding 300 cells' worth of geometry,
because the resident map *is* the set of `Group`s under `world.group`.

### The probe expression

```
node tools/probe.mjs --scene daytime-downtown --expr \
"(()=>{const s=window.__game.world.chunkStats();return{
 residentCells:s.residentCells, mapOccupied:s.mapOccupiedCells,
 areaKm2:+(s.residentCells*s.cell*s.cell/1e6).toFixed(3),
 edges:s.edgesBuilt, edgesTotal:s.edgesTotal,
 blocks:s.blocksBuilt, blocksTotal:s.blocksTotal,
 instances:s.instances, meshes:s.meshes, geometries:s.geometries, chunkGeoms:s.chunkGeoms,
 overflow:s.overflow.n, progs:(window.__warmStats||{}).progs}})()"
```

**Pass conditions, each of which fails on an eager build:**

| assert | pass | on an eager build |
|---|---|---|
| `residentCells <= 9` | 9 | 176 |
| `areaKm2 <= 0.36` | 0.36 | 7.04 |
| `edges / edgesTotal <= 0.15` | about 90 / 929 | 929 / 929 |
| `blocks / blocksTotal <= 0.15` | about 35 of about 700 | all |
| `chunkGeoms <= 6 * residentCells` | 54 or fewer | 1000 or more |
| `overflow === 0` | 0 | - |
| `progs` unchanged vs baseline | decision 4 | - |

Two more, from `WAVE-T-GENERATE-PLAN.md:150`.

- `node tools/_loadtime.mjs` - **per-stage split quoted**, `world` stage expected to go *down* from
  235 ms, `warm` expected to be unchanged at about 2173 ms, total below 3493 ms.
- determinism: `buildChunk(k) -> snapshot instanceMatrix -> disposeChunk(k) -> buildChunk(k) ->
  snapshot` must be byte-identical.
  This is the checkable form of decision 1 and it belongs in the probe too.

`_loadtime.mjs` measures the **playable** path, no `?shot=1`, where `world.settle()` is not called,
so it measures a genuine 9-cell boot.

---

## 8. THE DEMOLITION LIST, IN DEPENDENCY ORDER

`D` = delete.
`M` = move to a per-chunk emitter.
`G` = stays global.
`R` = rewritten in place.

| lines | what | verdict |
|---|---|---|
| 15-23 | `LAYOUT` literal | **G**, unchanged. Decision 6: it carries `carKit` (2517) and `main.js:214` / `hud.js` still read it. Add `LAYOUT.graph`. Deleting `grid` / `extent` is `rewire`'s. |
| 25-73 | `surfaceAt` plus `PAVED_HALF` / `HIGHWAY_HALF` | **R** -> delegate to the injected graph's `graph.js:152`. Same two keys, so `physics.js:1705` needs no edit. Lands in the same commit (`generate-wire`). |
| 78-104 | `makePath` | **G**, unchanged. |
| 188 | `roundedRect` | **D** - its only callers are 3018 and, in spirit, 2653. Both go. |
| 116-1057 | PCSS, texture makers, `patchAtmo` / `patchFacade` | **G**, untouched. This is the 2173 ms `warm` stage. |
| 1064 | `R = makeRng(0xC0FFEE)` | **G** for materials and textures only; shadowed to `null` before the first emitter (section 5). |
| 1098-1163 | `atmo`, `dummy`, `inst`, `push`, `seal`, `shadowAt` | `atmo` / `dummy` **G**. `inst` / `push` / `seal` / `shadowAt` **M** -> the sink of section 6. `push` keeps a global drop counter. |
| 1165-1171 | ground plane | **G**. 6000 x 6000 already covers 4000 x 2861. |
| **1173-1187** | the grid ribbon loops | **D** -> per-chunk road emitter (section 3). |
| **1188-1192** | highway ribbon plus the slip road | **D** -> the graph's 52 `motorway` edges *are* the highway; the hand-drawn slip road at 1190-1192 has no graph counterpart and is deleted outright. |
| 1194-1225 | 9 shared materials | **G**. |
| 1227-1236 | `blocks` construction | **D** -> `createBlocks(doc).blocks`, published whole on `world.blocks` (decision 5). |
| 1238-1253 | per-block kerb plus pavement `Mesh` x2 | **M** -> one batched extrusion per chunk, following the **face polygon**, inset. See risk 12 on the face / AABB divergence. |
| 1257-1278 | facade plus storefront textures and materials | **G**. |
| 1282 | `boxGeo` | **G** prototype. |
| 1286, 1292 | 4 tower plus 1 podium `InstancedMesh` | **M**. |
| 1300-1346 | `capMesh` to `gridMesh`, 10 pools, plus `mechMat` / `mullionMat` / `beaconMat` plus 4 prototypes | pools **M**, materials and geometry prototypes **G**. |
| 1348-1438 | `tintVary`, paint tables, `facadePaint` | **G** tables; `facadePaint` gains an `rng` parameter. |
| 1441-1492 | `facadeGrid` | **M** `(sink, rng, ...)`. |
| 1494-1526 | `shopIntMat` / `shopQuad` **G**; `shopMesh` **M**; `shopBay` **M**. |
| 1533-1574 | `storefrontBand` | **M**. |
| 1577-1671 | `parapet`, `rooftop`, `facadeDetail`, `FACES` | **M** (`FACES` is **G**). |
| **1673** | `downtown = hypot(cx,cz) < 260` | **D** -> the five-district profile table of section 5. |
| 1674-1675 | `towers`, `frontages` | **M** -> per-chunk arrays on the `ChunkRec`. No external consumer: `world.towers` at 3184 is read by nothing outside `world.js`, grepped. |
| 1689-1697 | `canonFrontage` | **G**, pure. |
| **1699-1776** | tower loop | **M** -> per-chunk, over owned blocks, canonical order, per-block RNG. |
| **1778-1827** | perimeter street wall | **M**, same. |
| 1831-1891 | 12 sign materials plus `signFrame` / `signStrut` / `braceMesh` / `braceGeo` | materials plus `braceGeo` / `planeGeo` **G**; the 15 pools **M**. |
| 1893-1950 | `panelPair`, `placeSign` | **M**. |
| 1952-1988 | `awnTex` / `awnMat` / `awnGeo` **G**; `awnMesh` **M**; `awning` **M**. |
| 1991-2073 | frontage loop, rooftop billboards | **M**. |
| 2075-2101 | `gantry` | **M**. |
| **2102-2108** | `for (const z of G) for (const x of G)` gantries | **D** -> per node of degree 3 or more on `arterial` / `motorway` edges, `rng() < 0.5` from the node RNG, span from the node's own `2 * max h_i`, facing along the widest arm. |
| **2109-2112** | `for (x = -900; x <= 900; x += 240)` highway gantries | **D** -> walk each `motorway` edge by **arclength from the edge's own start**, gantry every 240 m. Arclength-from-edge-start is what makes the placement chunk-independent. |
| **2113-2123** | `for (x = -1000; x <= 1000; x += 105)` billboard row | **D** -> same, every 105 m of motorway arclength, side alternating on `floor(s/105) % 2`, offset `e.width/2 + 13`. |
| 2127-2143 | neon materials and geoms **G**; `tubeMesh` / `bulbMesh` / `spillMesh` **M**. |
| 2145-2165 | `neonSign` | **M**. **`world.js:2159` must stop using the injected `rng`** (section 5). |
| 2167-2187 | neon over towers | **M**, per-chunk `towers`. |
| 2190-2213 | `lampMat` **G**; `poles` / `hidePoles` -> **live registry** (`main.js:198` holds the array by reference); `slPole` / `slArm` / `slHead` / `slBulb` **M**. |
| 2215-2241 | `streetLight` | **M**; `rec()` records `[desc, idx]` and resolves after `finalize()`. |
| **2244-2249** | `for (const z of G) for (x = -EX+30; ...; x += 62)` lamps | **D** -> per edge: lamps every 62 m of **edge arclength**, alternating side, lateral offset `e.width/2 + 2.4`. A lamp is owned by the chunk containing the **lamp**, not the edge, so a 398 m edge's lamps stream correctly. |
| **2250-2253** | `for (x = -600; x <= 600; x += 70)` highway lamps | **D** -> same rule with a 70 m pitch on `motorway` edges. |
| 2257-2285 | traffic-light pools **M**, `trafficLight` **M**. |
| **2286-2291** | `for (const x of G) for (const z of G)` signals | **D** -> per node of degree 3 or more whose class is `arterial` / `street`: one head per incident arm, at `v + dir_i * (r_i + 2.6)` offset laterally by `h_i + 2.6`. |
| 2294-2307 | deleted-wires comment | **G**, keep. |
| 2309-2343 | prop materials plus 12 pools plus palm / frond | materials and geoms **G**, pools **M**. |
| 2345-2371 | `palm`, `bench` | **M**. Delete the dead placeholder at 2365-2366. |
| 2374-2432 | block perimeter prop walk | **M**, over the chunk's owned blocks, per-block RNG, AABB edges unchanged (decision 5). |
| **2436-2469** | guard railing per block | **M** - pools per-chunk, loop over owned blocks. |
| 2472-2501 | car materials plus `carColors` plus `carWheelGeo` | **G**. |
| 2488-2492 | 4 car pools | **M**. |
| 2503-2517 | `carKit`, `LAYOUT.carKit = carKit` | **G**, verbatim. Decision 6. |
| 2519-2545 | `NPC_DENSITY = 0.16`, `parkCounts`, `parkedBodies` | `NPC_DENSITY` **G** and **unchanged** (`WAVE-T-MAP-BRIEF.md:248`). `parkedBodies` -> **live registry**, mutated in place (`main.js:231`, `main.js:246` hold the reference). |
| 2547-2630 | `parkedCar` | **M**. Its `hide()` at 2612-2628 **loses the `chunkRemap` indirection**: with per-chunk pools the pool it wrote into *is* the pool that draws. Simplify, and re-verify with `tools/_phantom-probe.mjs`. Also: dispose must remove the body from the live registry, and a body promoted to a live traffic slot whose chunk then unloads must not be double-freed. |
| 2639-2642 | `PARK_OFF = HALF + 0.5`, `JCLR = 16.5` | **R** -> `PARK_OFF = e.width/2 + 0.5`, `JCLR_i = r_i + 3.5`, the junction retreat of section 4 plus a car half-length. |
| **2653-2657** | `heroDist` rounded-rect SDF | **R** -> nearest-sample distance to `paths.city`, using the same CSR uniform grid `graph.js:66-86` builds, over the path's 900 samples. Decision 7. The clearances at 2660 / 2689 / 2732 (2.8, 4.6) keep their literals. |
| 2659-2691 | `tryPark`, `rank` | **M**, per edge. |
| **2693-2703** | rank loop over `G` | **D** -> per edge: rank both kerbs between `JCLR_a` and `len - JCLR_b`. |
| 2705-2735 | `signalQueue` | **M**. |
| **2738-2746** | signal-queue loop over `G x G` | **D** -> per junction node, one random arm. |
| 2757-2781 | `paintMat` / `patchMat` / `flatGeo` / `discGeo` **G**; `paintMesh` / `patchMesh` / `holeMesh` **M**. |
| 2784-2795 | `crossing` | **R** -> takes `(node, theta_i, h_i, r_i)`; `d = r_i + 1.8`, zebra bars span `+/-(h_i - 0.9)` instead of `+/-(HALF - 0.9)`, stop bar at `r_i + 4.4`. |
| **2796-2800** | crossing loop over `G x G` | **D** -> per junction node, per arm. |
| 2807-2826 | `roadWear` | **M**, per edge by arclength, lateral extent from `e.width/2`. |
| **2827-2833** | roadWear loop over `G` | **D**. |
| **2836-2850** | highway guard rails: two 2400 m `Mesh` (2838) plus 480 `railPost` | **D** as written -> per-`motorway`-edge emitter; the two 2400 m meshes become **instanced 10 m segments** in a `railMat` pool. This is one of the four unshared geometries in the tree. |
| **2852-2857** | jersey barrier, 240 hardcoded | **D** -> per-motorway-edge, one side, 9.8 m pitch. |
| **2859-2882** | overpass deck, 2 edges, 44 piers | **See risk 16.** No graph edge is `elevated` or `bridge`; all 929 are `ground`. `world.js:2867-2876` records the pier row as a measured contributor to `dusk-highway-chase` (delta 146), `crash-cam` (72) and `daytime-downtown` (68). Deleting it **is a visual-gate regression**. Verdict: **M, not D** - re-emit deck plus piers as a per-chunk emitter parallel to the longest `motorway` edge at a 62 m lateral offset, preserving the object in kind and its measured radius (`0.75/0.85`, `world.js:2877`). |
| 2884-2958 | contact shadows plus `layoutContacts` | `contactTex` / `contactMat` / `contactGeo` **G**; `contactMesh` **M** per chunk; `layoutContacts(sunDir)` **R** -> iterate resident chunks, and **cache `sunDir`** so a chunk built later reproduces it. |
| 2960-2999 | point-light `POOL = 10`, `emitters` | `POOL` **G**, unchanged. `emitters` -> **live registry**, appended and removed per chunk. |
| 3001-3014 | wet smears | **M** - one `addWetSmearBatch` per chunk into a **stable global `smears` Group**, because `aoExclude` (`main.js:286`) is captured once. |
| **3016-3020** | `paths.city` / `paths.highway` | **R**. Decision 7. `paths.highway` from the `motorway` subgraph's longest chain; `paths.city` from the largest-area cycle in the `arterial` union `street` subgraph **that passes through `downtown`** (section 5's gate constraint). Both fed to `makePath` (78) unchanged. |
| **3022-3167** | the whole render-side chunk cut, `chunkRemap`, `CHUNK_MIN` | **D**. Per-chunk pools are the same cut, done at build time. **Keep the `matrixWorldAutoUpdate` discipline at 3164-3165, per chunk** - see risk 2. |
| 3169-3181 | `setTubeGain` | **G**. |
| 3182-3199 | the `world` object | **R** - `chunkStats` becomes the function of section 7; `blocks` / `poles` / `parkedCars` / `aoExclude` become stable, mutated-in-place containers. |
| 3201-3216 | `setNight` | **R** - `spillMesh.visible` (3210) becomes a loop over resident chunks; `night` is cached and re-applied by `buildChunk`. |
| 3234-3253 | `applyKeyFill` | **R** - caches `sunDir` for later chunks. |
| 3255-3264 | `setWet` | **G**, unchanged, material-level only. |
| 3271-3375 | `update` | **R** - the streaming pump goes at the top, before the atmosphere block. |

---

## 9. THE STAGING PLAN

Every step boots and every step has a check.
Steps 3a to 3c hide behind `#map=graph`, default `grid`, so the **default path, and therefore the
visual gate, never moves until 3d**.

**S0 - `road.js` plus `util.js` prep. No behaviour change.**
Add `cellHash` to `util.js`.
Add `ribbonInto` / `finishRibbon` / `releaseHidden` to `roadKit`; reimplement `buildRibbon`
(`road.js:1846`) as a wrapper over `ribbonInto`.
*Check:* all seven `tools/shot.mjs` renders **byte-identical** to the pre-change PNGs;
`roadKit.reflStats()` unchanged.
A wrapper that is not byte-identical is a bug, not a judgement call.

**S1 - Emitter refactor of `createWorld`, one chunk, one RNG. No behaviour change.**
Introduce the sink of section 6.
Convert every stage from closure-over-pools to `(sink, rng, ...)`.
Run all stages against a single chunk whose bounds are the whole old world, passing the global `R` as
`rng` so the draw order is preserved exactly.
Delete the render-side cut (3022-3167) and let `finalize()` produce the same buckets.
*Check:* seven shots byte-identical again.
This is the strong check: it proves the refactor is behaviour-preserving before any seeding changes.
`chunkStats().residentCells === 1`.
Draw-call count within 5% of the pre-change number.

**S2 - Many chunks over the OLD world, per-cell and per-block RNG.**
Split the single chunk into the 200 m lattice; switch to `cellHash` seeding.
Pixels change here, and only here, for reasons of seeding.
*Check:* seven shots, eyeballed for "not worse" (`WAVE-S-PLAY-BRIEF.md:8`).
`chunkStats().residentCells` about 36.
**Determinism check:** build, dispose, rebuild a cell and compare `instanceMatrix` byte for byte.

**S3a - `#map=graph`: roads, junctions, kerbs, pavement only.**
Graph edges -> clipped ribbons; nodes -> junction polygons; `blocks.js` faces -> kerb / pavement
extrusion.
No buildings, no props.
*Check:* `#map=graph` boots with no console errors; overlay the built ribbon centrelines against
`tools/_mapoverlay.mjs`; walk 20 chunk boundaries with `tools/probe.mjs` and confirm the shared
boundary vertices are bit-identical; screenshot a junction of degree 7 and one of degree 9 and look
at them.
`#map=grid` shots unchanged.

**S3b - `#map=graph`: buildings, signage, neon, props, parked cars.**
`world.blocks` from `createBlocks(doc)`; district profiles; all the emitters from section 8.
*Check:* `#map=graph` boots; block-versus-tarmac assert re-run from `tools/_mapblocks.mjs`;
`chunkStats().overflow.n === 0`.
`#map=grid` unchanged.

**S3c - `#map=graph`: `paths`, `heroDist`, `surfaceAt`, `bounds`.**
Decisions 7 and 8.
`physics.js` `bounds = 1400` -> 2000, quoting the BEFORE and AFTER literal at `physics.js:696`.
*Check:* `tools/_t4-surface.mjs` green in graph coordinates; all seven scenes spawn on tarmac under
`#map=graph`, with the `scenes.js` camera rigs untouched; drive probe.

**S3d - Flip the default to `graph`; delete the grid branch, the LAYOUT-derived generators, and
`roundedRect`.**
*Check:* the visual gate, honestly.
This is the step where the seven frames legitimately show a different city; state that plainly rather
than claiming parity.
`hud-overlay` will show a 1.1 km minimap grid over a 4 km city until `rewire` - declare it.

**S4 - Residency: boot builds 3x3, `update()` pumps.**
*Check:* the probe expression of section 7; `node tools/_loadtime.mjs` with the per-stage split
quoted; memory flat over a 10-minute drive.

**S5 - Cleanup: delete the `#map` branch, `LAYOUT.grid` reads inside `world.js`, dead constants.**
*Check:* `bash tools/lint.sh`, and **hand-check `game/map/*.js`** because
`WAVE-T-GENERATE-PLAN.md:167` records that the lint glob misses them; boot the page and read the
console; seven shots.

---

## 10. THE RISKS THE BRIEFS DID NOT MENTION

1. **`refl.hidden` is an unbounded, removal-free registry.**
   `road.js:1597` declares it; `road.js:1890` and `road.js:1898` push both ribbon meshes per
   `buildRibbon`; `road.js:2005` and `road.js:2053` push per wet smear; only `road.js:2030` ever pops,
   and only one scratch probe.
   It is iterated twice per reflection render at `road.js:1707` and `road.js:1723`.
   Under streaming this leaks one entry per chunk build forever, and `road.js:1723` writes `o.visible`
   on **disposed** meshes.
   Fix: `roadKit.releaseHidden(mesh)`, called from `disposeChunk`.
   Cross-file; must be in the brief.

2. **`world.js:3165` sets `group.matrixWorldAutoUpdate = false`.**
   Any chunk `Group` added after boot never gets its world matrix composed - the chunk renders at the
   identity transform or not at all.
   This presents as "the streamed chunks are invisible or in the wrong place", which will be blamed on
   the emitter.
   Fix: in `buildChunk`, after `group.add(rec.group)`, call `rec.group.updateMatrixWorld(true)` then
   `rec.group.matrixWorldAutoUpdate = false`.
   That preserves the 2.9 ms per frame saving the comment at `world.js:3156-3163` records.

3. **`world.js:2159` draws from the injected `rng`, not `R`.**
   `const bo = (rng() - 0.5) * (w - bw) * 0.8;` inside `neonSign` uses `main.js:183`'s
   `makeRng(0xC17E)` - a second, undeclared RNG stream, consumed once per neon sign.
   Today it is harmless because source order is fixed; under per-chunk building it makes the world
   depend on visit order, which is exactly the failure decision 1 exists to prevent.
   It is the only such leak I found, and it is invisible to a reader because the parameter is named
   `rng` in `createWorld`'s destructuring at `world.js:1060`.

4. **`bench()` at `world.js:2365-2366` pushes an instance and then decrements the count.**
   With a counted sink this is an off-by-one per bench leg, two per bench, and it leaves a stale
   matrix in the buffer.
   The line is dead code with a `// placeholder, replaced below` comment; delete it, but the sink must
   still expose `pop()` in case anything else does this.

5. **`physics.js:922`'s `collide()` is O(all blocks) per call, and the block count is about to go up
   roughly 20x.**
   Today it is 36 blocks.
   The graph has E - V + 1 = 242 inner faces, and decision 5 fills each polygon with axis-aligned
   rectangles, so I estimate **600-1500 blocks. THIS IS A GUESS** - `generate-blocks` will produce the
   real number and it must be substituted here before anyone sizes an index against it.
   `traffic.js:1068` runs the same loop per wrecked vehicle per tick, and `camera.js:251`
   segment-casts against the same list.
   That is a p99 generator on the exact frame the streaming system is being blamed for.
   `world.blocks` must stay a full flat array (decision 5), so the fix is a uniform grid *over*
   blocks, published alongside.
   Nominally `rewire`'s, but `generate-mesh` should publish `world.blockIndex` so `rewire` has it.

6. **`buildRibbon` has no width parameter and only two road specs.**
   `road.js:1741-1744` defines `city: widthM 20` and `highway: widthM 36`; `road.js:1847` reads
   `mats[cls].spec` and `road.js:1892` uses `spec.widthM / 2`.
   The docstring at `road.js:2` advertises a `width` option that does not exist - a live instance of
   "do not trust a docstring".
   The graph's 21 widths cannot go through this API, and the naive fix, a spec per width, costs 21
   programs against decision 4.

7. **`createWorld` runs before the hero position is known.**
   `main.js:183` builds the world; the scene does not place the car until `scenes.js` runs, much
   later.
   So `buildChunk`'s boot origin has to be passed in - `createWorld(scene, { rng, roadKit, origin })` -
   or defaulted and immediately corrected.
   Worse: in shot mode, `main.js` runs `for (let i = 0; i < steps; i++) tick(FIXED_DT)` **before**
   `window.__ready = true`, around `main.js:886`, so an amortised pump would put a half-built world in
   every one of the seven gate screenshots.
   **`world.settle()`, a synchronous "drain the build queue", must exist and must be called on the
   shot path.**
   `_loadtime.mjs` uses the playable path and so still measures a real streamed boot.

8. **`main.js:142`'s `STAGE_MS = { ... world: 154 ... }` will be wrong after this change.**
   Cosmetic, since it only weights the boot bar, but it should be re-measured with `?bootlog=1` and
   quoted in the verdict, because a wildly wrong weight makes the bar look like a hang.

9. **`layoutContacts` and `world.aoExclude` both assume a world built once.**
   `world.js:2932-2957` rebuilds `contactMesh` wholesale on every time-of-day change and is called
   from `applyKeyFill` (`world.js:3251`); with per-chunk contacts it must iterate resident chunks
   **and** cache the last `sunDir` so a chunk built afterwards reproduces it.
   Separately, `main.js:286` passes `world.aoExclude` into `createSsaoPass` **once**, and
   `post.js:786` iterates that exact array every frame - so the `smears` Group and the spill mesh must
   be stable objects created at `createWorld`, with chunks adding and removing *children*.
   Replacing either object silently disables the AO exclusion, and the symptom is "AO looks wrong on a
   wet night", not "streaming is broken".

10. **`push()` still drops silently for anything that stays global**, `world.js:1133`.
    The deferred sink removes the risk for chunk pools but not for future code.
    Adding the counter is one line and it closes a class of bug with four recorded incidents.

11. **The `y`-plane assumption in the planar reflection.**
    `road.js:1609` mirrors through `y = PLANE_Y`.
    Today's 2 mm-dropped Z ribbons (`world.js:1185`) already violate it slightly.
    Removing the hack (section 4) *improves* this, but the junction polygons and the shoulder ring
    must all be at the same two heights, `0.03` and `0.01`, that they are today, or the reflection
    will separate from the surface at junctions.

12. **The face polygon and the block AABB are two different shapes for the same block.**
    Decision 5 fixes `world.blocks` as AABBs; the *drawn* pavement should follow the face polygon,
    which is the whole point of face traversal.
    If the AABB pokes outside the drawn pavement, `physics.js:922` collides the car with empty air over
    the road; if the building masses are placed on the face rather than the AABB, the car drives
    through a wall.
    **Rule to state and enforce: the AABB is inscribed, every building mass is placed relative to the
    AABB (`b.bw` / `b.bd`), and the drawn kerb and pavement follow the face polygon and are always
    outside the AABB.**
    `generate-blocks`' "zero blocks overlapping tarmac" check (`WAVE-T-GENERATE-PLAN.md:135`) covers
    one direction of this but not the other.

13. **`frondMesh` is `700 * 9 = 6300` alpha-tested quads today** (`world.js:2343`) over 1.21 km2.
    Palm density is per kerb-metre (`world.js:2399`, 7.5% of props at a 2.5-5.5 m pitch), and the graph
    has 78.81 km of centreline against roughly 12 km today.
    A counted cap makes the *count* correct, but the alpha-test fill cost is a frame-time item, not a
    cap item.
    Flag it for `perf`; the `palmbay` / `harbor` district split in section 5 is a partial answer.

14. **A single graph segment is 230.3 m long, longer than a whole 200 m chunk.**
    This kills not just whole-edge ownership but segment-level ownership too; clipping must operate
    inside a segment.
    It also means the batched road geometry for one chunk can be dominated by a single long straight.

15. **Two of the seven gate scenes are anchored to the old highway.**
    `paths.highway` at `world.js:3019` sits at `z = HZ + 6.5 = -693.5`, and `dusk-highway-chase` and
    `car-paint-closeup` (`scenes.js:204`) film from it.
    Re-deriving `paths.highway` from the graph's motorway edges moves both scenes to a genuinely
    different place.
    The camera rigs must not move (`WAVE-T-GENERATE-PLAN.md:158`), so the *content* of two gate frames
    legitimately changes.
    Declare this before rendering, and pick the motorway stretch that best matches the current one -
    open, with the pier row alongside - rather than the longest.

16. **The overpass and pier row have no representation in the graph.**
    All 929 edges are `elevationClass: 'ground'`; `paradise.json` has no bridge.
    But `world.js:2867-2876` records the pier row as a measured contributor to three of the seven gate
    frames, with a specific radius chosen to fix a car-paint anisotropy defect
    (`wave-q/car-paint.md` section 5).
    Deleting `world.js:2859-2882` is therefore a gate regression on three scenes and would silently
    reopen a solved defect.
    It must be re-emitted alongside a motorway edge, at the same `0.75/0.85` radius and 60 m pitch, and
    the verdict must say so.
    This is the single item in the demolition list most likely to be quietly dropped.

17. **`hud.js`'s minimap still reads `LAYOUT.grid`, and `hud-overlay` is one of the seven gate
    scenes.**
    Between S3d and `rewire`, that scene shows a 1.1 km grid over a 4 km city.
    It is `rewire`'s file, so it is a routed finding, not a fix, but it must be stated in the verdict
    rather than discovered by the critic.

---

## THE THREE ESTIMATES IN THIS FILE, COLLECTED

Repeated here so no reader can miss them.

1. **About 20,000 instances per 200 m cell** (section 1, and used again in section 6 for the transient
   buffer size).
   GUESS, extrapolated from the 203,540-instance census at `world.js:3029` scaled by an assumed 3x
   block-density increase.
   Replaced by a real number from `chunkStats().instances` on the first boot of S2.
2. **600-1500 city blocks** (sections 1, 5, 7 and risk 5).
   GUESS, from 242 inner faces times an assumed 2-6 axis-aligned rectangles per face.
   `generate-blocks` produces the real number; substitute it before sizing any index.
3. **The road tile albedo is probably not horizontally tileable** (section 3, option (a)).
   GUESS, inferred from `road.js:351`'s `makeRoadTile` drawing a centre pair.
   Render one and look before choosing option (a) over option (b).

---

## FILES THIS PIECE TOUCHES

- `game/world.js` - the whole of `createWorld`, and the demolition list above.
- `game/road.js` - `ribbonInto` / `finishRibbon` / `releaseHidden`, and `buildRibbon` reimplemented
  over them. Cross-file; coordinate.
- `game/util.js` - `cellHash`.
- `game/map/graph.js` - read-only consumer.
- `game/map/blocks.js` - written concurrently by `generate-blocks`; consumed here.
- `game/main.js` - the boot origin argument and `world.settle()` on the shot path;
  `STAGE_MS` re-measure.
- `game/physics.js` - `bounds` only, in S3c, per decision 8.

Routed findings that belong to other pieces and must NOT be fixed here: `hud.js`'s minimap (risk 17),
`physics.js` / `traffic.js` / `camera.js` block-loop cost (risk 5), and the sign-texture atlas
(section 2).
