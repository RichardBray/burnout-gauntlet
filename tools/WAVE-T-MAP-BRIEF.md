# WAVE T - THE MAP BRIEF. Read this whole file before you touch anything.

Wave T builds **T3, the Paradise City map**, from `TASKS.md`.
It is the last big structural change this project has planned, and it blocks T5, T6 and T8.

`tools/WAVE-S-PLAY-BRIEF.md` is NOT superseded. Everything in it still binds - the 720p
measurement contract, the visual regression gate, the runtime knobs, the rule that frame time is
not measurable while peer agents run. **This file adds to it; it does not replace it.**
Brief every agent with both paths.

## THE ONE-SENTENCE VERSION

Replace `LAYOUT` in `world.js` with a road GRAPH, generate the world from that graph in chunks
around the hero, and prove the graph is connected before anything is built from it.

## WHAT THE WORLD IS TODAY, AND WHY THAT IS THE WHOLE PROBLEM

`game/world.js:15` defines the entire road network as twelve numbers:

```js
export const LAYOUT = {
  grid: [-480, -320, -160, 0, 160, 320, 480],
  extent: 560,
  roadW: 20,
  highwayZ: -700,
  ...
};
```

Seven lines crossing seven lines, plus one straight interstate ribbon. Roughly a 1.1 km square.

**Every road-aware system in the tree derives from that object rather than from any built
geometry**, and that is the good news, because it means there is exactly one thing to replace:

| system | how it reads the road today |
|---|---|
| `world.js` road/kerb/pavement/building generation | iterates `LAYOUT.grid` directly |
| `world.js` `surfaceAt(x, z)` (T4) | two loops over `LAYOUT.grid` and one `highwayZ` compare |
| `world.js` parked ranks, signal queues | placed along `LAYOUT.grid` lines |
| `traffic.js` lanes | grid lines and `roadW` |
| `physics.js` | `blocks` list plus `bounds = 1400`, a hard position clamp |
| `hud.js` minimap | grid lines |
| `scenes.js` spawn points | absolute coordinates on the grid |

So T3 is not "add a map". It is **replace one 12-number literal with a graph, and give every
consumer above a graph query that answers the same question it asks today.**

Do that and `surfaceAt` becomes a spatial-index lookup rather than two loops, `traffic.js` gets
lanes from edges rather than from lines, and `physics.js` gets barriers from the graph perimeter
rather than a clamp. Do it the other way round - build the meshes first and retro-fit the queries -
and every one of those systems gets rewritten twice.

**`surfaceAt` is the canary.** It is the smallest consumer, it is already injected into
`physics.js` rather than imported, and its T4 docstring already says the classes grow when T3
brings terrain. If your graph cannot answer `surfaceAt` cheaply and per-frame, the graph is wrong.
Port it FIRST, before any mesh generation, and you will have found the index design you need for
everything else.

## THE SOURCE MAP

`reference/map/SOURCES.md`. Two images, primary and secondary, with what each is good for and what
is not sourced at all (street names, elevation). Read it before digitising.

**The rights line, restated because it is the one that ends the project if it is crossed:** a
faithful ROAD NETWORK, digitised by eye from a picture, with OUR OWN art. No imported Paradise
geometry, no real building footprints, no extracted game data, ever, by anyone, for any reason.

## THE GRAPH SCHEMA

One file: `game/map/paradise.json`. **This is the durable artefact of the whole wave.** Meshes,
chunks, traffic lanes and collision are all GENERATED from it and are all disposable. If the wave
is killed halfway, this file is what survives and what the next session continues from.

```jsonc
{
  "version": 1,
  "units": "metres",
  "extent": { "x": [-2000, 2000], "z": [-2000, 2000] },
  "districts": [
    { "id": "downtown",  "name": "Downtown Paradise", "polygon": [[x, z], ...] },
    { "id": "harbor",    "name": "Harbor Town",       "polygon": [...] },
    { "id": "palmbay",   "name": "Palm Bay Heights",  "polygon": [...] },
    { "id": "silverlake","name": "Silver Lake",       "polygon": [...] },
    { "id": "mountain",  "name": "White Mountain",    "polygon": [...] }
  ],
  "nodes": [
    { "id": 0, "p": [x, z], "y": 0, "deadEnd": false }
  ],
  "edges": [
    {
      "id": 0,
      "a": 0, "b": 1,
      "lanes": 2,
      "width": 20,
      "oneWay": false,
      "class": "street",
      "elevationClass": "ground",
      "district": "downtown",
      "shape": [[x, z], ...]
    }
  ]
}
```

Field rules, each of which exists because something downstream breaks without it:

- **`p` is `[x, z]`, `y` is separate.** Everything in this codebase is XZ-planar with Y up. A
  three-component position invites someone to write `[x, y, z]` and silently rotate the city.
- **`shape` is the edge's intermediate points**, excluding both endpoints, which are `a` and `b`.
  Paradise City is mostly curves; a graph of straight segments will look like the grid we are
  replacing. An empty `shape` means a straight edge and is legal.
- **`class` is one of `motorway` | `arterial` | `street` | `mountain` | `service`.** It drives
  width, lane count, material and the LOD tier. Read it off the SECONDARY map, where the colour
  coding is legible: orange/gold is motorway, grey/white is surface street.
- **`elevationClass` is one of `ground` | `elevated` | `tunnel` | `bridge`.** Neither source image
  shows elevation, so this is authored by judgement - see `SOURCES.md`. It exists in v1 even though
  v1 may set every edge to `ground`, because adding it later means re-authoring every edge.
- **`deadEnd` must be `false` on every node.** It is retained because the schema is frozen at v1
  and because the validator reads it, but there are no dead ends to describe - see the validator
  below. Setting it does not make a terminus legal; it makes the graph INVALID.
- **`district` on an edge is denormalised on purpose.** Point-in-polygon per edge per query is
  exactly the kind of per-frame cost this project keeps having to remove.

Bump `version` on any schema change and say so in the commit.

## THE VALIDATOR - `game/map/validate.mjs`

Runs from `tools/lint.sh`. Non-zero exit fails the build. It must report, and require:

1. **One undirected connected component.** Flood fill from any node across all edges.
2. **One strongly connected component, respecting `oneWay`.** A district you can drive into and
   never leave is exactly the orphan the user is banning. Run Tarjan or a two-pass Kosaraju; do
   not hand-roll a reachability check that only tests the forward direction.
3. **ZERO degree-1 nodes. Every node has degree 2 or more.** No hanging roads, no cul-de-sacs, no
   dead ends - you can always drive out of anywhere by a road other than the one you came in on.

   **This is stricter than what this brief originally said, and the change was the user's**, made
   after they looked at the traced overlay: the first rule allowed a degree-1 node if it carried an
   explicit `deadEnd: true`, on the reasoning that a turning circle is legitimate and only a human
   can tell one from a missed junction. The user's answer is that it all has to connect. A flag is
   an annotation, not a road - the car still stops. `deadEnd` stays in the schema, must be `false`
   everywhere, and the validator now REJECTS a graph that sets it.
4. **No duplicate edge, no self-loop, no edge referencing a missing node id.**
5. **Every edge's `district` names a district that exists**, and both endpoints lie inside or on
   that district's polygon.

It must also print the counts - components, dead ends, min and mean degree, edges, total centreline kilometres -
because those are the numbers the next session needs to know the graph did not silently shrink.

**The validator checks the DATA. It does not check the BUILT WORLD, and the gap between those two
is where this project's bugs live.** A graph can be perfectly connected while the generated road
has a seam the car drops through. So there is a second, separate check:

**A DRIVE PROBE, asserting on collision geometry, not on the graph.** One route per district,
crossing every chunk boundary on that route, asserting the car never loses ground contact and never
leaves the paved surface. This is not optional and it is not the same test as the validator.

## THE CHUNK CONTRACT

`world.js:3009` already has a spatial chunking pass, `CHUNK = 200` m, with `chunkRemap` mapping
source instances into their per-cell `InstancedMesh`. **That pass is a RENDER-side cut of an
already-built world. It is not streaming, and it does not become streaming by being pointed at a
bigger world.** Read it before you design the new one; reuse its cell size and its remap discipline
if they fit, but understand that you are building a different thing.

The contract:

1. **Nothing outside the hero's resident chunk set may be BUILT during boot.** Not built and
   hidden, not built and disposed - not built. See the load budget below; this is the single rule
   that decides whether this task ships at 3.5 s or 14 s.
2. **Build and dispose are amortised across frames.** A chunk's worth of geometry generated inside
   one frame is a hitch, and the criterion is no hitch above 30 ms at a boundary.
3. **Dispose means dispose.** Geometry, materials, textures, and the entry in every registry that
   points at them. Memory must be stable over a ten-minute drive across the whole map. A chunk leak
   presents as a slow frame-time creep and will be blamed on something else.
4. **An edge crossing a chunk boundary is ONE continuous drivable surface.** Two segments that
   nearly meet is the seam the drive probe hunts.
5. **The far city still reads.** Coarse LOD or impostors for non-resident chunks, so the skyline
   the visual gate protects does not vanish at 200 m.
6. **Post-boot per-instance edits route through `chunkRemap`.** This is a standing rule from T1, it
   cost three bugs behind one green check, and a streaming system multiplies the number of places
   it can be got wrong. See `tools/HANDOFF-PARKED-CARS.md`.

## THE MEASUREMENT RULES

The 720p contract from the play brief applies unchanged: 1280x720 REAL pixels, `resScale` 1.0,
quote `ctx.renderSize()` verbatim beside every frame number, no frame-time measurement while peer
agents run. On top of it, wave T has two numbers of its own.

### Load time - `node tools/_loadtime.mjs`, budget 5.0 s, baseline 3493 ms

Measured 2026-08-07 before any map work, headless chromium at 1280x720, navigation to
`window.__ready` on the player's path:

| stage | cold, ms |
|---|---|
| warm (shader compile) | **2173** |
| road | 566 |
| world | 235 |
| car | 187 |
| sim | 85 |
| sky | 47 |
| post | 26 |
| **total** | **3493** (median of 4138 / 3493 / 3477) |

Two consequences, and the second is the one that will bite:

**Geometry generation scales with area; streaming is what stops that mattering.** Road plus world
is 801 ms for a 1.1 km square. Paradise City is ~4x4 km, about 12.7x the area. Built eagerly that
is roughly 10 s more generation and a ~14 s cold load. Built to the chunk contract, boot generates
only the resident set, which is LESS than today - **cold load should go DOWN.**

**Shader compilation does NOT scale with area, and it is already 62% of the load.** It scales with
the number of MATERIAL VARIANTS, so no amount of good streaming touches it, and every new district
that brings its own materials pays at boot forever. T3's scope says keep the current material and
lighting vocabulary; that line was written to protect the visual gate and it protects load time
too. **Prefer a new texture or new instance data over a new material, every time.** If a variant
genuinely must be added, state its measured cost in the `warm` stage in the same commit that adds
it - by the tenth one nobody will be able to say where the seconds went.

**Quote the per-stage split, not just the total.** A total that holds while `world` triples and
`warm` drops is not a pass, it is two changes cancelling.

### Frame time - 60 fps at 1280x720, p99 stated

Sustained while DRIVING ACROSS DISTRICT BOUNDARIES, which is the case the old world could not
produce at all. p50 <= 16.7 ms. State p99 separately: chunk streaming is a p99 defect generator by
construction and a p50 that holds tells you nothing about it.

## THE PROCESS RULES THAT ARE ALREADY PAID FOR

These are not new. They are here because a fresh agent reads this file and not the history.

- **A metric that can be satisfied without the thing it claims to measure is not a metric.** This
  has happened five times in this project. The chunk-contract version: a streaming test that
  passes because the whole world was built at boot and the chunk system only disposes. Rule 1 of
  the chunk contract is what that test must actually assert, so assert it - count what exists at
  `__ready`, do not infer it from a frame time.
- **For anything the user reports SEEING, assert on the render side.** The instance matrix, the
  submitted instance count, or actual pixels. A check against a simulation array stays green while
  the screen is empty. See `tools/HANDOFF-PARKED-CARS.md`.
- **Do not trust a docstring; grep the constant.** A builder's report is checked against literal
  values with `file:line`, not against prose.
- **Every builder writes `verdicts/wave-t/<piece>.md`** with the BEFORE and AFTER literal value of
  every constant it touched, quoted with `file:line`.
- **Update `STATE.md` incrementally as each piece lands, never at the end.** A row must never say
  RUNNING for a builder that is no longer running.
- **NPC car count is user-set and must not be raised.** `POOL = 24` in `traffic.js`,
  `NPC_DENSITY = 0.16` in `world.js`. A 12.7x bigger map is not an argument for more cars; it is
  an argument for spawning the same number near the hero. If a critic reports the streets read
  empty, report it and leave the number alone.

## THE PIECES, and what each can be judged on alone

| piece | deliverable | judged by |
|---|---|---|
| digitise | `game/map/paradise.json` + `validate.mjs` | validator green; `tools/_mapconnect.mjs` green; overlay vs `reference/map/` |
| queries | graph spatial index; `surfaceAt` ported off `LAYOUT` | T4's surface tests still pass; per-frame query cost stated |
| generate | graph -> roads, kerbs, junctions, buildings, props | visual regression gate over every scene |
| stream | chunk build/dispose around the hero | boot-residency assert; no hitch >30 ms; memory flat over 10 min |
| rewire | `traffic.js` lanes, parked ranks, signals, `physics.js` blocks, minimap, spawns | drive probe; traffic and boost events work in every district |
| skyline | far LOD / impostors | visual gate; draw-call count stated |
| perf | the two measurement rules above | alone on the machine, three replicates |

`digitise` gates everything. `queries` and `generate` can run concurrently once the schema is
frozen. `stream` needs `generate`. `rewire` needs `queries`. **Do not run `generate` and `rewire`
against an unfrozen schema** - that is the collision this wave has instead of a shared file.

## THE ORDER, AND THE ONE THING NOT TO DO

Digitise, validate, port `surfaceAt`, then generate, then stream, then rewire.

The failure mode to forbid explicitly, restated because it passes every functional test in T3 and
quietly turns 3.5 s into 14 s: **building the whole graph's meshes at boot and using the chunk
system only for disposal.**
