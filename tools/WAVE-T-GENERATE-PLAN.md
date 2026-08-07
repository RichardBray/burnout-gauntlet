# WAVE T - THE `generate` PIECE, DECOMPOSED. Binding. Read with the two briefs, not instead of them.

Binding, in this order:

1. `tools/WAVE-T-MAP-BRIEF.md` - the wave brief. Graph schema, validator contract, chunk contract,
   load-time and frame-time rules.
2. `tools/WAVE-S-PLAY-BRIEF.md` - still binding. The 720p measurement contract, the visual
   regression gate, the runtime knobs, the rule that frame time is not measurable while peer agents
   run.
3. This file - what `generate` actually is, split into three sub-pieces that can each be judged
   alone, plus the eight design decisions that are already made and are not up for re-litigation.

`generate` was listed in the wave brief as one piece.
It is not one piece.
Recon of `game/world.js` established why, and the three facts below are the reason this file exists.

## THE THREE FACTS THAT FORCED THE SPLIT

**`createWorld` is one linear script, not a set of stages.**
`game/world.js:1060` to `game/world.js:3381` runs top to bottom with no phase boundary and no
per-region entry point.
Later stages read arrays that earlier stages produced (`blocks` -> `towers` / `frontages` ->
signage -> neon -> emitters).
There is no subset of it that can be run for one chunk.
It has to be re-expressed as per-chunk emitters over shared pools, not parameterised.

**One global RNG stream decides the appearance of every object.**
`R = makeRng(0xC0FFEE)` at `game/world.js:1064` is consumed in strict source order by every stage.
Generating chunks on demand as the hero drives changes the sequence and therefore changes every
downstream object.
A per-chunk seeded RNG is mandatory, not an optimisation.

**`push()` silently drops on overflow.**
`game/world.js:1133` is `if (m.count >= m.userData.cap) return;` - no throw, no warning, no counter.
Every `cap` in the file was sized for a 1.1 km square.
A 12.7x world against unchanged caps produces a city that looks built and is arbitrarily missing
instances, with nothing in any log.
The file already records four historical incidents of exactly this
(`world.js:1880`, `:1961`, `:2313`, `:1838`).

## THE THREE SUB-PIECES

| sub-piece | deliverable | judged by |
|---|---|---|
| `generate-blocks` | `game/map/blocks.js` - graph -> city blocks -> `{cx,cz,w,d,bw,bd}` AABBs | node harness only. No renderer. See below. |
| `generate-mesh` | per-chunk emitters in `game/world.js` building roads, kerbs, junctions, buildings from the graph | boot-residency assert; visual gate over all seven scenes |
| `generate-wire` | the `surfaceAt` swap, `paths`, `bounds`, and the harnesses that hardcode LAYOUT coordinates | `tools/_t4-surface.mjs` green in graph coordinates; drive probe |

`generate-blocks` gates the other two and is fully testable in node with no browser.
`generate-mesh` and `generate-wire` land in the same commit as each other, because a world built
from the graph with `surfaceAt` still on `LAYOUT` answers `dirt` on every road, and a `surfaceAt` on
the graph with the world still on `LAYOUT` answers `dirt` everywhere the player is.
Either half alone is a broken game.

## THE EIGHT DECISIONS. ALREADY MADE. DO NOT RE-OPEN.

**1. Per-chunk deterministic RNG, keyed on the cell, never on visit order.**
`makeRng(hash(cellX, cellZ))` from `game/util.js`.
The seed must be a pure function of the cell coordinates so a chunk built at boot and the same chunk
built after a ten-minute drive are byte-identical.
This is the whole determinism contract of streaming and it is checkable: build a chunk, dispose it,
build it again, compare the instance matrices.
`R = makeRng(0xC0FFEE)` stays for anything genuinely global (material tables, texture canvases);
it must not be touched inside a per-chunk emitter.

**2. Per-chunk `InstancedMesh` pools, allocated by `inst()` at chunk build.**
An `InstancedMesh` cannot grow after construction - `cap` is the GPU buffer allocation.
Global pools therefore cannot serve a streaming world at any cap, because the cap for the whole map
is the eager-build memory the chunk contract exists to prevent.
Per-chunk pools also give tight bounding spheres for free and make dispose a real
`geometry.dispose()` plus `group.remove()`, which chunk-contract rule 3 requires.
Bucket by draw state inside the chunk, exactly as `world.js:3088-3098` does, or draw calls explode.

**3. Caps are computed from the chunk's own content, never guessed.**
Count first, allocate second. The emitter walks the chunk's edges and blocks, sums exactly how many
instances each pool will receive, then calls `inst()` with that number.
A guessed cap is `push()`'s silent drop with extra steps.
If a cap must be an estimate for any pool, that pool gets an explicit overflow counter that is
published on `world.chunkStats` and asserted to be zero.

**4. No new materials. None.**
Shader compile is 2173 ms of the 3493 ms cold load and does not scale with streaming quality.
The 45 materials in `createWorld` are the vocabulary; a new district colour is a new texture or new
instance colour, never a new material.
If a variant genuinely must exist, its measured cost in the `warm` stage is quoted in the same
commit that adds it.
Note `patchAtmo` and `patchFacade` do not set `customProgramCacheKey`, so material count and
compiled-program count are not one to one - measure programs with `window.__warmStats.progs`, do
not count materials.

**5. `world.blocks` keeps its exact shape: `{cx, cz, w, d, bw, bd}`, axis-aligned.**
It is a published contract read by `physics.js:922`, `traffic.js:1068`, `camera.js:251` and seven
tools. It is not a build artefact and it is not `generate`'s to redesign.
A graph face is a polygon; the deliverable is that polygon filled with axis-aligned rectangles.

**6. `world.LAYOUT` keeps existing and keeps carrying `carKit`.**
`world.js:2517` sets `LAYOUT.carKit = carKit` and `traffic.js:280` reads it, because `LAYOUT` is the
only object `main.js:214` forwards to `createTraffic`.
`generate` does not delete `LAYOUT`; it stops GENERATING from it. Deleting it is `rewire`'s call
once traffic is off the grid.

**7. `paths.city` and `paths.highway` must be re-derived from the graph, in `generate`.**
All seven scenes spawn through them (`scenes.js:10`, `:132`, `:204`) and the visual gate is judged on
all seven. A graph world under `roundedRect(325, 325, 48, 8)` puts every scene in the void.
`paths.highway` comes from the graph's `motorway` class edges; `paths.city` comes from a closed
circuit of `arterial`/`street` edges through the districts.
`world.js:2653`'s `heroDist` is the same rounded-rect SDF hardcoded and must move with it.

**8. `physics.js`'s `bounds = 1400` rises to the graph extent, in `generate-wire`.**
It is nominally `rewire`'s, but a 4000 x 2861 m map behind a +/-1400 m clamp puts four fifths of the
graph out of reach and no drive check on the built world is possible.
Raise it, quote the BEFORE and AFTER literal, and say in the verdict that it was taken early and
why.

## `generate-blocks` - THE HARNESS IT IS JUDGED BY

`game/map/blocks.js`, no three.js import, same discipline as `game/map/graph.js`: data and
arithmetic, runs in node under a harness as happily as in the browser.

City blocks are the FACES of the planar graph. Extract them properly - sort each node's incident
half-edges by bearing and walk next-clockwise - do not sample-and-cluster. The graph has no dead
ends and is strongly connected, which is exactly the precondition face traversal needs, and it is
the reason the user's zero-dead-ends rule was worth enforcing.

The outer face is the whole map boundary and must be identified and discarded; it is the one with
negative signed area under a consistent winding.

Write `tools/_mapblocks.mjs` alongside it. It must report, and a critic must be able to re-run it:

- face count, and total face area against the extent area - the faces plus the paved corridor should
  account for the map, and a large shortfall means the traversal dropped faces
- every face closed, every half-edge used exactly once
- block count, and the block AABB total area
- **zero blocks overlapping tarmac**, probed against `game/map/graph.js`'s own `surfaceAt` - sample
  each block's AABB on a grid and assert every sample is `dirt`. This is the check that matters: a
  block overlapping the road is a building in the middle of the street and the drive probe will hit
  it at 70 m/s.
- the largest and smallest block, because a 5.2 m edge exists in the graph and will produce
  degenerate faces
- district attribution per block, from the face's own edges

## WHAT `generate-mesh` MUST ASSERT, AND WHAT IT MUST NOT

**Assert on what EXISTS at `window.__ready`.** Count the chunks built, count the instances
submitted, count the geometries. Publish it on `world.chunkStats` and read it with
`tools/probe.mjs`. Never infer boot residency from a frame time - a frame time passes just as
happily on a world that eagerly built everything and is now culling it.

The number to beat: the resident set at boot must be a small fraction of the map, and cold load
should go DOWN from 3493 ms, not up, because boot now generates less than the old 1.1 km square did.
Quote the per-stage split from `node tools/_loadtime.mjs`, not just the total.

Roads and kerbs are the one part of the current world that is NOT instanced -
`roadKit.buildRibbon()` returns a plain `Mesh` (`world.js:1174-1187`) and each block's pavement is
two unshared `BoxGeometry` meshes (`world.js:1238`, `:1248`).
At 12.7x that is thousands of unshared geometries and it is the first thing to fix, not to inherit.

**Do not touch the seven scene camera rigs in `scenes.js`.** `scenes.js:29-87` is fifty-five lines of
measured camera derivation. Move where the car spawns, never how it is filmed.

## PROCESS, UNCHANGED

- Every builder writes `verdicts/wave-t/<sub-piece>.md` with the BEFORE and AFTER literal value of
  every constant it touched, quoted with `file:line`.
- A builder's report is checked against literal values, not against prose. Do not trust a docstring.
- `bash tools/lint.sh` does NOT parse-check `game/map/*.js` - it globs `game/*.js` only. A syntax
  error in `graph.js` or `blocks.js` lints clean and presents as a 60 s harness timeout. Fix the
  glob or check those files by hand.
- `lint ok` does not mean runnable. Boot the page and read the console.
- Frame time is not measurable while peer agents run. An agent reporting a frame-time RESULT runs
  alone and says so in its verdict.
- NPC car count is user-set. `POOL = 24` at `traffic.js:89`, `NPC_DENSITY = 0.16` at
  `world.js:2535`. A bigger map is an argument for spawning the same number near the hero.
