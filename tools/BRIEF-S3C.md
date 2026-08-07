# BRIEF — `generate-mesh` S3c: `paths`, `heroDist`, `surfaceAt`, `bounds` under `#map=graph`

You are the BUILDER for step S3c of the `generate-mesh` piece, wave T, in
`/Users/robray/fc/demos/burnout-gauntlet`.

## 0. READ THESE FIRST, IN THIS ORDER. ALL PATHS ABSOLUTE.

1. `/Users/robray/fc/demos/burnout-gauntlet/tools/WAVE-T-MAP-BRIEF.md` — binding.
2. `/Users/robray/fc/demos/burnout-gauntlet/tools/WAVE-S-PLAY-BRIEF.md` — ALSO still binding. The map
   brief adds to it, it does not replace it.
3. `/Users/robray/fc/demos/burnout-gauntlet/tools/WAVE-T-GENERATE-PLAN.md` — read **decisions 7 and 8**
   at lines 55-114. They are ALREADY MADE. Do not re-open them.
4. `/Users/robray/fc/demos/burnout-gauntlet/tools/WAVE-T-GENERATE-MESH-PLAN.md` lines 861-865 — the
   S3c definition.

You have a budget of **12 exploration commands** before you must STOP and start writing code. If you
have not understood something after 12, write down what you do not understand in the verdict and
build the parts you do understand. Do not keep exploring.

## 1. WHAT S3c IS

Under `#map=graph` the world on screen is now the Paradise City graph (S3a built the roads, kerbs,
junctions and pavement; S3b built the city — 868 blocks, buildings, props, parked cars). But four
LAYOUT-grid systems still answer in GRID coordinates and must move onto the graph. That is all of
S3c. **You are not building new geometry. You are re-pointing four consumers.**

### 1a. `surfaceAt` — the swap

`game/world.js:66` `export function surfaceAt(x, z)` is the LAYOUT-grid implementation. Above it, at
`game/world.js:54-65`, is a comment block titled `THE SWAP POINT FOR T3'S MAP` that says the swap
belongs to exactly this commit. Read it; it explains the semantics.

`game/map/graph.js`'s `createRoadGraph(doc)` already returns a verified, 189 ns/query graph-backed
`surfaceAt(x, z)` with identical semantics and the same two return keys `'tarmac'` / `'dirt'`. It is
already constructed inside `createWorld` at `game/world.js:1708` as `graphIdx`.

The wiring today is `game/main.js:18` importing the module-level `surfaceAt` and
`game/main.js:238` calling `physics.setSurfaceQuery(surfaceAt)`.

**Do it the lazy way: publish `world.surfaceAt` from `createWorld`** — `graphIdx.surfaceAt` under
`#map=graph`, the existing module-level grid `surfaceAt` otherwise — and change `main.js:238` to
`physics.setSurfaceQuery(world.surfaceAt)`. Keep the module-level export (tools import it). Do NOT
add a new module, a new indirection layer or a strategy object.

`physics.js` needs NO edit: it already switches on the returned key.

### 1b. `paths.city` and `paths.highway` — decision 7

`game/world.js:4093-4096` today:

```js
const paths = {
  city: makePath(roundedRect(325, 325, 48, 8), true),
  highway: makePath([[-1000, HZ + 6.5], [-300, HZ + 6.5], [400, HZ + 6.5], [1000, HZ + 6.5]], false),
};
```

All seven gate scenes spawn through these (`game/scenes.js:10-11` via `cruise()`, `:132-133`,
`:204-205`, calling `ctx.physics.placeOnPath(path, u, speed)`). A graph world under
`roundedRect(325, 325, 48, 8)` puts **every scene in the void**.

Under `#map=graph` only, re-derive both from the graph:

- **`paths.highway`** from the graph's `motorway`-class edges.
- **`paths.city`** from a CLOSED circuit of `arterial` / `street` edges through the districts.

**A FACT FROM S3b THAT WILL BITE YOU AND IS ALREADY MEASURED — DO NOT REDISCOVER IT.** The
motorway is NOT one road: the 52 `motorway` edges are **TWENTY connected components**, the largest
12 edges / 1285 m, the longest single edge 291.9 m. So "concatenate the motorway edges" produces a
path that teleports. Pick the LARGEST connected motorway chain and walk it; state in your verdict
which component you used, its edge count and its length in metres.

`paths.city` must be genuinely CLOSED (`makePath(points, true)`) and every one of its sample points
must be on tarmac — that is the check in §3.

Under `#map=grid` both paths must be **byte-for-byte the expression they are today**. The grid
scenes are the visual gate.

### 1c. `heroDist` — decision 7's other half

`game/world.js:3329-3339`. It is the rounded-rect SDF of the OLD `paths.city`, hardcoded, and
`game/world.js:3335` currently short-circuits `if (GRAPH) return Infinity;` with a comment saying
S3c is where that ends. Re-point it at the REAL `paths.city` so the parked-car cull comes back.

`makePath` returns `{ curve, closed, length, samples, tangents, ... }` — 900 samples. A nearest-
sample distance over 900 samples, called once per candidate parked car, is fine and is the lazy
correct answer; do NOT build a spatial index for it unless you measure the build getting slower by
more than 100 ms, and if you do, say so with the two timings.

Delete the `if (GRAPH) return Infinity;` line and its now-false comment. Report the BEFORE and AFTER
parked-car counts (`chunkStats().content.parkedCars`) and the culled count.

### 1d. `bounds` — decision 8

`game/physics.js:696`: `export function createPhysics({ blocks = [], bounds = 1400 } = {})`.

The graph is **4000 x 2861 m**. Behind a +/-1400 m clamp four fifths of it is out of reach and no
drive check on the built world is possible. Raise it to the graph extent. `game/main.js:200` calls
`createPhysics({ blocks: world.blocks })` — pass the bound through from the world so the grid keeps
1400 and the graph gets the graph extent, OR raise the default and justify it; your call, but
**quote the BEFORE and AFTER literal with `file:line` in the verdict** and say plainly that this was
taken early (it is nominally `rewire`'s) and why.

Publish the extent from `createWorld` rather than hardcoding 2000 in two files.

## 2. HARD CONSTRAINTS. BREAKING ANY ONE OF THESE FAILS THE STEP.

- **`#map=grid` IS THE VISUAL GATE AND MUST NOT MOVE.** All seven scenes at or under their own
  same-tree noise floor. Every graph-side change is behind the existing `GRAPH` flag
  (`game/world.js:1073`, `const GRAPH = !!mapDoc;`).
- **ZERO new materials.** Not one `new THREE.*Material`. This step should add zero — it builds no
  geometry. Verify with `git diff | grep -c 'new THREE\..*Material'` and quote the number.
- **NPC car count is set by the user and must not be raised.** `POOL = 24` in `game/traffic.js`,
  `NPC_DENSITY = 0.16` in `game/world.js`. Do not touch either. Restoring the `heroDist` cull LOWERS
  parked cars, which is correct and expected.
- **Nothing outside the hero's resident chunk set may be BUILT during boot.** S3c must not make the
  build eager. If your `paths` derivation walks the whole graph, that is graph DATA, not meshes, and
  is fine — say so and quote its millisecond cost.
- **NEVER bulk-edit `game/world.js` by pattern match.** A pattern-matching script cost this project a
  full revert of `world.js` in S3a: it matched the wrong occurrences, `bash tools/lint.sh` said
  `lint ok`, and the page then hung at boot with NO console error. Anchor every edit on a unique
  comment and print the line you are guarding before you edit it.
- **`lint ok` DOES NOT MEAN RUNNABLE. Boot the page before you hand the tree on.** Both modes.
- **A "HANG" AT BOOT IS PROBABLY A THROW.** Shot mode ticks the sim at `game/main.js:896` BEFORE
  `window.__ready` is set and that loop is not wrapped, so one exception gives you a live page with
  an empty console that never signals ready. Run `node tools/_hangprobe.mjs` FIRST — it reads the
  page's own error slot — before you spend a single bisect on it.
- **Do not import real Paradise geometry, building footprints, or extracted game data, ever, for any
  reason.** Digitised-by-eye graph and our own art only.
- **Do not open a visual wave and do not write a visual critic sweep.** The visual bar is MET and
  `reference/` is a REGRESSION GATE, not a target. You may not spend effort making a scene look
  BETTER.

## 3. THE CHECKS YOU MUST RUN AND QUOTE

1. **`node tools/_t4-surface.mjs` green in GRAPH coordinates.** Its probe points are grid
   coordinates today; move them onto the graph and say what you moved them to and why each point is
   the thing it claims to be (ribbon, shoulder, kerb, junction, open ground).
2. **All seven scenes spawn ON TARMAC under `#map=graph`**, with the `game/scenes.js` camera rigs
   UNTOUCHED. Assert `world.surfaceAt(pos.x, pos.z) === 'tarmac'` at the spawn point of each of the
   seven, and quote all seven coordinates and results.
3. **`paths` sanity:** every one of `paths.city`'s 900 samples on tarmac, and every one of
   `paths.highway`'s. Quote the counts, not "all good". If some fraction is off tarmac, quote the
   fraction and the worst offset in metres — an honest number beats a green claim.
4. **DRIVE PROBE.** This is the check the map brief says a connected graph over a seamed world
   passes without. Assert on the BUILT COLLISION GEOMETRY, not on the graph data: drive one route per
   district, crossing every chunk boundary on the route, and assert the car is not stopped, not
   stuck, and not out of bounds. **The validator checks the DATA; this must check what was BUILT.**
   Report the routes, the districts, the number of chunk boundaries crossed and any wall you hit.
   **A KNOWN INPUT, deferred on purpose, not an oversight:** 31 frontage strips up to 432 m long are
   still single AABBs, so each is an unbroken 432 m collision face (short side min 20 / median 32 /
   max 64 m; 30 of the 31 sit on a ring face). If the drive probe dislikes them, the fix belongs in
   `game/map/blocks.js`, NOT here — report it, do not fix it.
5. **`#map=grid` seven-scene render**, each at or under its own same-tree noise floor.
   **`wet-night-asphalt`'s same-tree noise floor is maxd 29 at 0.0056%, NOT maxd 4** — measured twice
   off one tree. Anything quoting the old figure reads its own noise as a regression.
6. `bash tools/lint.sh`, and hand-check `game/map/*.js` — the lint glob misses them
   (`tools/WAVE-T-GENERATE-PLAN.md:167`).
7. `node tools/progress.mjs` at the end.

**NEVER ASK FOR AN MD5 MATCH ON A RENDER.** 21 renders off one unchanged tree gave 21 distinct md5s;
`crash-cam` twice back-to-back off one tree differs in 45 pixels at maxdiff 2. A metric can be
bit-stable while the framebuffer is not. Judge on the pixel metrics against the noise floor.

**DO NOT REPORT A FRAME-TIME NUMBER.** Peer agents may be running and frame time is not measurable
while they are. Frame time and cold load belong to the `perf` piece. If you want to note something
performance-shaped, note it as an observation and label it unmeasured.

## 4. OUTPUT

Write `/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c.md`.

**Maximum 400 lines.** An unbounded or chatty verdict is a failed acceptance criterion.

It must contain:

- **A table of every constant you touched with its BEFORE and AFTER literal value and its
  `file:line`.** This is checked against the literal values in the tree, not against your prose.
  **Do not trust a docstring; grep the constant.**
- The numbers from every check in §3, quoted, not summarised as "passing".
- What you did NOT do, and what is honestly still open. An honest open item is worth more than a
  green claim; every step of this wave that hid one cost a round.
- Which motorway component you used for `paths.highway` and how you chose `paths.city`'s circuit.

Then commit, with a message body that says what moved. Do NOT add yourself as co-author.

## 5. THE FOUR THINGS THAT END THIS WAVE BADLY

They are here because they are the ones that PASS THEIR OWN TESTS:

1. Building the whole graph's meshes at boot and using the chunk system only for disposal. Satisfies
   every functional criterion and turns a 3493 ms cold load into ~14 s. **Assert on what EXISTS at
   `__ready`, never on a frame time.**
2. Adding material variants. Shader compile is already 62% of the load. **Prefer a new texture or new
   instance data over a new material, every time.**
3. A connected graph over a world with a SEAM in it. The validator checks the DATA. **The drive probe
   in §3.4 is the only thing that checks the built collision geometry.**
4. Importing real Paradise geometry or extracted game data. Never, by anyone, for any reason.

## 6. ONE MORE PATTERN THIS PROJECT PAID FOR THREE TIMES

**For anything the user would SEE, assert on the RENDER side** — the instance matrix, the submitted
instance count, or actual pixels. A check against a simulation array stays green while the screen is
empty; that cost this project three bugs behind one green check. Any post-boot per-instance edit
routes through `chunkRemap` in `game/world.js`, and **the reference you record for a post-boot edit
must be the one `push()` handed back — the `[descriptor, index]` pair, NOT the pool handle**, which
is reachable by name and looks right. That bug class has now appeared four times.
