# WAVE T - `queries`. The spatial index, and a graph-backed `surfaceAt`. PASS.

Delivers `game/map/graph.js` (the index and the queries) and `tools/_mapquery.mjs` (the check).
One comment added to `game/world.js` marking the swap point. No behaviour change to the running
game - see "what is deliberately NOT wired" below.

## Result

| | |
|---|---|
| segments indexed | 2373 (from 929 edges) |
| grid | 2944 cells of 64 m, 6399 entries, **2.17 per cell** |
| index memory | **92 KB** |
| build time | **3.0 ms** |
| `surfaceAt` | **189 ns/query** (5.30 M/s) |
| `nearest` | 760 ns/query (1.32 M/s) |
| brute force, same answer | 8088 ns/query - the index is **43x** faster |
| four wheels, one frame | **0.00075 ms** against a 16.7 ms budget |

`surfaceAt` is the map brief's canary: the smallest consumer of `LAYOUT`, already injected into
`physics.js` rather than imported. If the graph could not answer it cheaply per frame, the index
design was wrong and every other consumer would have inherited that. It can.

## Why a uniform grid

The input is a road network: segments are short, similar in length, and spread fairly evenly over
the map. That is the case a uniform grid is best at and the case where an R-tree or BVH's extra
indirection buys nothing. 2.17 segments per cell means a `surfaceAt` query examines about twenty
segments across its 3x3 neighbourhood, and `nearest` stops after one ring on any road.

Stored as a CSR layout - `start[c]..start[c+1]` into a flat `items` array - rather than an array of
per-cell arrays. Chunk streaming will rebuild indices as the hero moves, and a few thousand small
arrays per rebuild is exactly the garbage that world does not need. Segment endpoints are flat
`Float32Array`s for the same reason: every query does the same four multiplies over a handful of
segments, and an array of objects would chase a pointer per segment for nothing.

## Correctness, which is checked and not assumed

`tools/_mapquery.mjs` compares **every** answer against a brute-force scan of all 2373 segments,
written independently in the harness rather than shared with the module:

```
correctness over 10000 probes (5312 of them on tarmac, 53%)
  surfaceAt disagreements: 0
  nearest disagreements:   0 (worst distance error 6.14e-5 m)
```

Two details that make this a real test rather than a green light:

- **The probe set is half on tarmac.** Uniform random points over a 4000 x 2861 m map are almost
  all dirt, so a uniform-only probe set would pass against an index that simply always answered
  `dirt`. 6000 of the 10000 probes walk the segments themselves with a jitter of +-2x the paved
  half-width, which straddles the kerb face in both directions - the boundary is where a grid index
  goes wrong, by missing the segment registered in the next cell.
- **The 6.14e-5 m worst error is float32 endpoints against the harness's float64 arithmetic**, not
  a disagreement. The threshold is 1 mm.

The harness's own first run reported 480 `nearest` failures. That was the HARNESS being wrong:
`nearest` returns null beyond its 400 m search radius, which is correct out at sea, and the check
counted null as a miss. Fixed, and noted in the file so the next reader does not re-derive it.

## What is deliberately NOT wired, and why

**`world.js`'s `surfaceAt` still reads `LAYOUT`.** The graph-backed version exists, matches
semantics, and is verified - but the world the car currently drives on IS the LAYOUT grid, and the
graph describes Paradise City, a different city in different coordinates. Pointing `world.js` at
the graph now would answer `dirt` almost everywhere the player actually is, and T4's off-road
penalty would fire on every road in the game.

The swap belongs to `generate`, in the same commit that puts the graph on screen. `world.js` now
carries a comment saying exactly that, so it reads as a decision rather than an unfinished edit.

## Semantics, and one improvement over what it replaces

Same two classes, same meaning: PAVED is wider than the painted road and runs to the kerb face, so
clipping a kerb or cutting a junction is still tarmac - T4's acceptance criterion.

The difference is that `LAYOUT`'s version used one hardcoded `PAVED_HALF = 13.0` for every road.
The graph version uses each edge's own `width / 2 + 3.0`, so a motorway's paved corridor is
correctly wider than a service road's. More classes arrive with terrain exactly as T4's docstring
promised: this returns a key and every caller already switches on it.

## For the next piece

`nearest()` returns `{ dist, edge, t, x, z, seg }` - the edge index, the parameter along it, and
the closest point. That is what `rewire` needs for traffic lanes (position along an edge), what
`generate` needs for junction geometry, and what T6 will need to place events on the network.

`createRoadGraph(doc)` takes a parsed document, so a node harness and the browser share one path.
`loadRoadGraph(url)` is the browser convenience. The module imports no three.js, on purpose.
