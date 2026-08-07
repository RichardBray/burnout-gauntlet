# STATE — Burnout Gauntlet

Last updated: 2026-08-07 (session 18, wave T opened)

## READ THIS FIRST. IT SUPERSEDES EVERY OTHER "EXACT NEXT ACTION" IN THIS FILE OR IN THE ARCHIVE.

### THE PROJECT PIVOTED IN SESSION 16. THE VISUAL WAVES ARE CLOSED.

Waves K through R chased `reference/` photographs with pixel metrics, for eight waves and nine
pieces.
**That is over, by the user's explicit instruction.**
The visual bar is MET.
`reference/` and every pixel metric are now a **REGRESSION GATE, not a target**: no scene may be
made to look worse, and not one agent may be spent making a scene look better.
Burnout Paradise is a console game and this is a web game; that comparison is closed.

**Do not open a new visual wave.
Do not write a new visual critic sweep.
Do not read the visual record looking for a task.**

The bar is now **how it plays**, and it has two halves:

1. **60 fps sustained at 1280x720 REAL pixels**, measured on this machine, never estimated.
2. **Handling that feels like Burnout Paradise**, matched to researched numbers.

Everything binding about the new bar is in **`tools/WAVE-S-PLAY-BRIEF.md`**.
Brief every agent with that file path.
It carries the 720p measurement contract, the measured baseline, the instrument, the runtime knobs
and every process rule that survived from the visual waves.

### FILE LAYOUT

- **`STATE.md`** (this file) - the live record, the EXACT NEXT ACTION, and the permanent rules.
  Short on purpose. Read all of it.
- **`tools/WAVE-S-PLAY-BRIEF.md`** - the binding brief for the playability era.
  Complete; amend it, never rewrite it.
  **Still binding in wave T.** The map brief adds to it and does not replace it.
- **`tools/WAVE-T-MAP-BRIEF.md`** - the binding brief for **wave T, the map (T3)**.
  Graph schema, validator contract, chunk contract, load-time and frame-time rules, piece list.
  Brief every wave-T agent with BOTH brief paths.
- **`TASKS.md`** - the user's feature backlog and its own wave plan. Wave 4 is the map wave.
- **`STATE-HISTORY.md`** - the whole visual-wave record, waves K through R, reverse-chronological.
  **Never read this file.**
  Nothing in it is actionable.
  It exists only so a claim can be audited by `grep`.
- **`tools/STANDING-CONSTRAINTS.md`** - the retired and corrected visual targets and anchors, each
  claim cited to its verdict file.
  Only relevant if a regression-gate question comes up.
- **`tools/WAVE-P-BRIEF.md`**, **`tools/WAVE-Q-CRITIC-BRIEF.md`**, **`tools/WAVE-R-ADDENDUM.md`** -
  the visual-era briefs.
  Superseded by the play brief.
  Their process rules were folded into it; their targets were not, and must not be re-issued.

**THE TRIM RULE. When STATE.md passes ~400 lines, PREPEND the oldest block to `STATE-HISTORY.md`
and leave a one-line pointer where it was.**
Before you move a block, confirm its substance is preserved in `tools/WAVE-S-PLAY-BRIEF.md`, in
`tools/STANDING-CONSTRAINTS.md`, or in the wave's own `verdicts/` files.
Anything live and preserved nowhere else gets added to the play brief rather than dropped.
Opening a new wave block is the moment to do this, not later.

### WAVE T — LIVE. THE MAP. `TASKS.md` wave 4, task T3. Opened session 18, 2026-08-07.

**EXACT NEXT ACTION: FIND WHY TWO OF THE SEVEN SCENES NO LONGER REACH `window.__ready` UNDER
`#map=graph`, THEN S3c.** `hud-overlay` and `wet-night-asphalt` do not boot in 240 s / 300 s with no
console error; the other five boot in 3.9-6.7 s and **`#map=grid`, the default and the gate, boots
and renders all seven**. S3b caused it - the S3a tree boots `hud-overlay` under `#map=graph` in
3.9 s. Six kill-controls are already run and recorded in
`verdicts/wave-t/generate-mesh-s3b.md` section 9: **NOT `world.blocks`** (emptying it does not fix
it), **NOT `setNight`** (0.1 ms), **NOT `applyWet`** (0.1 ms), **NOT the parked population**
(suppressing all 1042 does not fix it), and **suppressing the whole graph street-furniture block at
`game/world.js:3600` boots it in 5.3 s**. It is position-dependent, not time-of-day-dependent: the
three scenes riding `paths.city` are `hud-overlay` (u 0.34, fails), `wet-night-asphalt` (u 0.565,
fails) and `daytime-downtown` (u 0.815, works), and `hud-overlay` is `dusk`. `window.__game` is
never set, so it is stuck before `main.js:883`, and `cfg.setup(ctx)` at `main.js:799` is what makes
it scene-dependent. **Profile it; do not guess.** Then
**S3c - `paths`, `heroDist`, `surfaceAt` and `bounds` under `#map=graph`**,
`tools/WAVE-T-GENERATE-MESH-PLAN.md:861-865`, decisions 7 and 8. **S3b IS OTHERWISE DONE** -
`verdicts/wave-t/generate-mesh-s3b.md`. Two things S3b left for S3c specifically: `heroDist`
(`game/world.js:3339`) RETURNS `Infinity` UNDER `#map=graph`, so the parked population is not culled
away from the hero's driving line - it cannot be, because `paths.city` is still the grid's
`roundedRect` and culling against a ring road the graph does not have would carve a hole 277 m from
the origin for no reason. And the seven scenes still spawn on grid coordinates under `#map=graph`.

Superseded next-actions, kept only so the reasoning is not lost:

**~~S3b - buildings, signage, neon, props and parked cars under `#map=graph`, from
`createBlocks(doc).blocks`.~~ DONE.**

**~~finish S3a - write the KERB AND PAVEMENT extrusion from `blocks.js`'s FACE polygons, under
`#map=graph`.~~ DONE.**

**~~the `generate` piece — build roads, kerbs, junctions and buildings FROM the
graph, and in the same commit flip `world.js`'s `surfaceAt` onto `game/map/graph.js`.** The
graph-backed `surfaceAt` is written, verified and fast; it is deliberately not wired, because the
world on screen is still the `LAYOUT` grid and the graph is a different city — pointing it at the
graph before `generate` would answer 'dirt' everywhere the player is and fire T4's off-road penalty
on every road. `world.js` carries a comment at the swap point saying so.~~ DONE - that is now S3c.

**`generate` WAS SPLIT IN SESSION 19 AND THE SPLIT IS BINDING: `tools/WAVE-T-GENERATE-PLAN.md`.**
Read it with the two briefs. It carries the eight design decisions that are already made - per-chunk
seeded RNG, per-chunk instance pools, computed caps, no new materials, `world.blocks` keeps its
shape, `LAYOUT` survives carrying `carKit`, `paths` re-derived from the graph, and `bounds` raised
early. The split exists because recon established three things: `createWorld` is a single linear
2300-line script with no per-region entry point, one global RNG stream
(`R = makeRng(0xC0FFEE)`, `world.js:1064`) decides the appearance of every object so on-demand
chunk generation changes the whole city, and `push()` silently drops on overflow
(`world.js:1133`) so every cap in the file is a silent-failure landmine at 12.7x area.

**`generate-mesh` IS DESIGNED, NOT BUILT: `tools/WAVE-T-GENERATE-MESH-PLAN.md`.** Ten sections, a
line-by-line demolition list for all 3381 lines of `world.js`, a six-step staging plan where every
step leaves the game bootable, and 17 risks. Eight findings from it are load-bearing and will each
cost a round if they are rediscovered:

- **A single graph SEGMENT is 230.3 m long, longer than one 200 m chunk** (max edge 398.4 m). So
  "assign each edge to an owning chunk" cannot work at any workable cell size, and neither can
  segment-level ownership. The ribbon must be CLIPPED INSIDE a segment, with the boundary vertex and
  its NORMAL interpolated from the same two source points in the same order by both neighbouring
  chunks, so the two are bit-identical. Normals must be precomputed over the FULL edge and passed
  in; deriving them per sub-polyline puts a V-notch at every boundary on every curved road.
- **`world.js:3165` sets `group.matrixWorldAutoUpdate = false`.** Any chunk group added after boot
  never gets its world matrix composed. Presents as "streamed chunks are invisible or in the wrong
  place" and will be blamed on the emitter. `buildChunk` must `updateMatrixWorld(true)` then clear
  the flag per chunk.
- **`roadKit.buildRibbon` returns a `THREE.Group`, not a `Mesh`, and its docstring at `road.js:2`
  advertises a `width` option that does not exist.** There are exactly two specs, `city` 20 m and
  `highway` 36 m (`road.js:1741-1744`); the graph has 21 widths from 9.0 to 49.4 m. A spec per width
  is 21 new programs and is forbidden. The answer is to draw the marked carriageway at the class's
  spec width and carry the remainder as `shoulderMat`, which tiles at any width and already exists.
- **`world.js:2159` draws from the INJECTED `rng`, not the global `R`** - a second, undeclared RNG
  stream inside `neonSign`. Harmless today because source order is fixed; under per-chunk building
  it makes the world depend on visit order, which is the exact failure per-cell seeding exists to
  prevent.
- **`road.js`'s `refl.hidden` is an unbounded registry with no removal path** (`road.js:1597`, pushed
  at `:1890`, `:1898`, `:2005`, `:2053`, iterated twice per reflection). Streaming leaks an entry per
  chunk build forever and writes `o.visible` on disposed meshes. Needs `roadKit.releaseHidden()`.
- **Shot mode ticks the sim BEFORE `window.__ready`** (`main.js` ~886), so an amortised build queue
  puts a half-built world in all seven gate screenshots. `world.settle()` must exist and be called
  on the shot path. `_loadtime.mjs` uses the playable path and still measures a real streamed boot.
- **The overpass pier row at `world.js:2859-2882` has no graph counterpart** - all 929 edges are
  `elevationClass: 'ground'` - but `world.js:2867-2876` records it as a MEASURED contributor to
  three of the seven gate scenes, with a radius chosen to fix a solved car-paint defect. Deleting it
  is a gate regression and it is the item in the demolition list most likely to be quietly dropped.
  Re-emit it alongside a motorway edge at the same `0.75/0.85` radius and 60 m pitch.
- **Caps solve themselves by DEFERRED ALLOCATION, which is better than counting.** Emit into
  caller-owned growable `Float32Array`s, then allocate each `InstancedMesh` at exactly the number of
  pushes. There is no cap during emission, so `world.js:1133`'s silent drop cannot happen and no
  count expression can be got wrong. Add the drop counter anyway for pools that stay global, and
  publish it on `chunkStats().overflow`, asserted zero.

**`generate-blocks` ROUND 1 WAS FAILED BY ITS CRITIC, NARROWLY, AND THE REASON IS THE MOST REUSABLE
THING THIS SESSION FOUND: the block list is correct and the apparatus that certifies it is not.**
Full write-up `verdicts/wave-t/generate-blocks-critic.md`. Four findings that must not be
rediscovered:

- **THE PLANAR-AREA IDENTITY IS A TAUTOLOGY, NOT A CHECK.** "The outer face's area equals the sum of
  the interior faces" holds for ANY rotation system, including a broken one. The critic ran the
  exact mutation the builder's report claims it catches - swapping two entries in one node's
  incident list - and got two MORE merged faces with the identity passing at 5844201.3 vs
  5844201.3 and every traversal check green. Two faces merged into one preserves total area
  exactly. **The check that actually works is Euler: V - E + F = 2.**
- **AND EULER FAILS TODAY: 688 - 929 + 237 = -4, so six faces are merged.** The cause is the four
  shared-node crossings the builder found and chose not to split. Splitting them in a copy of the
  doc restores chi = 2, F = 247, kept faces 234 -> 240. The output survives this - the block set from
  the split graph is SET-IDENTICAL to the shipped 693 - so the "do not split" call was right about
  the blocks and wrong about the traversal.
- **The harness passes with 53% of its own deliverable deleted.** Dropping every face above
  100000 m2 loses 3.13 km2 and 298 blocks and `tools/_mapblocks.mjs` still exits 0. Six stage areas
  are PRINTED and none is ASSERTED. Printing a number is not checking it.
- **THE OVERLAY SAID SOMETHING NO NUMBER COULD, AGAIN.** The picture confirms these really are the
  blocks of that city - magenta tiles the land between the roads and stops at it, nothing in the
  water, the coastline respected. But it also shows the 51 giant blocks are not scattered, they are
  **a spine of solid slabs running the length of the map**, and in the harbour those slabs lie over
  streets that are VISIBLE IN THE REFERENCE AND ABSENT FROM THE GRAPH. Both tarmac oracles are blind
  to that by construction, because both define tarmac as the graph. This is a `digitise` coverage
  gap presenting as a collision wall, and it is NOT being fixed by re-tracing this session - the fix
  is that a giant face emits a RING of perimeter rectangles, never one slab.

One number for `rewire`, measured not estimated: 693 blocks against `physics.js:922`'s unindexed
linear scan at `SUBSTEP = 1/240` is **166320 AABB tests/sec**, up from 8640 today. `world.blocks`
stays a flat array by decision 5, so the answer is a published `world.blockIndex`.

**`generate-mesh` S0 IS DONE** - `verdicts/wave-t/generate-mesh-s0.md`. `cellHash` at
`game/util.js:41` (100x100 lattice, 10000 distinct hashes, 0 collisions, mean Hamming distance
16.002 of 32 bits between 4-neighbours); `ribbonInto` at `road.js:1878`, `finishRibbon` at `:1919`,
`releaseHidden` at `:1955`, `buildRibbon` rewrapped at `:1976`; the wrong header docstring at
`road.js:1-14` corrected. **Zero materials added, verified live: programs 132 -> 132, geometries
463 -> 463, textures 96 -> 96, `reflStats()` identical field-for-field.**

**AND S0 CORRECTED A BAR THAT WAS SET WRONG, WHICH IS WORTH MORE THAN THE CODE. DO NOT RE-ISSUE IT.**
S0 was briefed to prove a no-op refactor by requiring all seven scene renders to be BYTE-IDENTICAL.
That is unmeetable and the builder proved it rather than rationalising it: it rendered all seven
from a tree reverted with `git checkout HEAD --`, and **all seven md5s differed from the first
render of the same bytes. 21 renders, 21 distinct md5s.** `crash-cam` twice back-to-back off one
unchanged tree differs in 45 pixels at maxdiff 2. This does NOT contradict permanent rule 2 above -
that rule says the METRICS are 0.00 run to run, and its own honest caveat is "<=0.005% of pixels at
<=9/255", which is exactly what was measured. **A metric can be bit-stable while the framebuffer is
not. Never ask for an md5 match on a render.**

**The replacement is stronger than the thing it replaces and is the pattern for every future no-op
refactor in this tree: load the OLD module alongside the new one.** `git show HEAD:game/road.js`
was imported as a second module, both kits seeded from `makeRng(0xC0FFEE)`, and both `buildRibbon`s
run over the exact call set `world.js:1178-1192` makes plus three shapes the grid never produces.
53 calls, 448 vertices, 238 triangles, **zero differing values** under `Object.is` across
`position`, `normal`, `uv`, the index array and its type, boundingSphere, shadow flags,
renderOrder, the `onBeforeRender` hook, child order and `userData`. That proves the vertex buffers
bit-identical, which an md5 match never would have.

**`generate-mesh` S1 IS DONE** - `verdicts/wave-t/generate-mesh-s1.md`. The deferred-allocation sink
is in, every emitter takes `(sink, rng, ...)`, the render-side cut at `world.js:3022-3167` is
deleted, `seal()` is gone, and 51 literal caps were removed. **Proved a no-op by the S0 pattern:
`git show HEAD:game/world.js` loaded as a second module, both worlds built from identical seeds,
1294 meshes and 199311 instances on each side, 0 buckets with a count mismatch, and 0 differing
values across 3786909 compared floats bucketed-and-sorted plus 3526590 compared in traversal
order.** Draw calls EXACTLY equal on three scenes (1372, 2127, 663), triangles equal, programs
131/132 unchanged. Before deleting the caps it instrumented `push()` and measured **zero silent
drops at HEAD**, so the removal was provably safe rather than assumed safe.

Three things from S1 that outlive it:

- **A REAL BUG IT FOUND WHILE PROVING A NO-OP, AND DID NOT PRESERVE. `hidePoles` writes to the
  source pool with no `chunkRemap` lookup** - only `parkedCar.hide()` ever did one - so for any pool
  whose draw state got cut the write landed on a zeroed mesh. Measured: knocking down 5 lamps sinks
  55 instances on HEAD and 65 now; the missing 10 are `slArm` and `slHead`. **On HEAD, knocking over
  a street lamp leaves its arm and head hanging in mid-air.** This is the third bug in this project
  behind one green check, and it is the exact hazard `tools/HANDOFF-PARKED-CARS.md` documents.
- **The `neonSign` injected-`rng` fix is MEASURED AND DELIBERATELY NOT LANDED.** Flipping it inserts
  one extra `R()` at the first neon sign, and because `R` is consumed in strict source order the
  whole city downstream re-rolls: 199311 -> 199235 instances, 507 of 1294 meshes change shape,
  **24.3% of pixels in `daytime-downtown` and 45.3% in `wet-night-asphalt`, maxd 187/192.** That is
  an S2-class re-seed and landing it in S1 would have destroyed the provability S1 exists for. It is
  two lines when S2 wants it.
- **`car-paint-closeup` has exactly ONE bistable pixel, at (331,607), and BOTH trees produce BOTH
  values.** Traced across nine renders. Anyone chasing a maxd 17 in that scene should stop here.

**`generate-blocks` IS DONE**, three rounds, critic-passed at r2 with two defects fixed in r3.
`game/map/blocks.js` extracts the planar FACES of the road graph (half-edge twins, bearing sort on
the first segment leaving the node, next-clockwise walk) and fills them with axis-aligned
rectangles. **868 blocks, 1.848 km2, largest 140x112 m, zero blocks over 200 m on both sides,
0 tarmac violations of 7561948 probes at 0.5 m, min clearance 0.5050 m against
`KERB_MARGIN = 0.5`.** Build 352 ms, all-or-nothing. `buildBlockIndex` is published alongside the
flat array. `paradise.json` is NOT modified: the four shared-node crossings are split in a deep copy
at build time, 5.3 ms, so the file on disk is still non-planar and the published edge ids are
stable.

Four things from this piece that generalise:

- **`V - E + F = 2` IS THE PLANARITY CHECK. THE SIGNED-AREA IDENTITY IS A TAUTOLOGY.** See the
  critic block above. Round 1 shipped chi = -4 with six faces merged and every area check green.
- **A GIANT FACE EMITS A RING OF PERIMETER RECTANGLES, NEVER ONE SLAB.** `BIG_FACE_AREA = 40000`,
  `RING_DEPTH = 40.0`. The interior of an un-roaded loop is terrain and must stay drivable. Round 1
  put a 352x872 m solid AABB on what the overlay later showed to be **a lake with boats on it**.
- **DO NOT MEASURE "IS THERE A ROAD HERE" WITH `_maptrace.mjs`'s MASK.** Round 3 withdrew its own
  numeric 5a/5b split after re-rendering the reference and looking: the mask reads bright BARE ROCK
  as road, which is exactly the failure `digitise.md` already records as "a coverage metric over a
  noisy mask measures the noise". The replacement is five faces individually eyeballed - 90, 130,
  63, 171, 146, 0.598 km2 of face, 86 blocks - **stated as a floor with no total claimed.** Note
  face 221's apparent interior road is the RAILWAY, which `digitise` deliberately leaves untraced.
- **The block index was verified at the one parameter value where its bug could not appear.**
  `index.at(x, z, pad)` duplicated results for every `pad > 0` - 1054 of 8000 probes at `pad = 1.0`,
  which is exactly `physics.js:922`'s `hx = b.w/2 + 1.0` - while the harness only ever called
  `pad = 0`, where `reach = 0` makes it structurally impossible. Fixed by mark-and-sweep against a
  generation counter (not a `Set` per call; this runs at 240 Hz per car). The honest consequence:
  **the published speedup fell from 38x to 4x** once it was timed at the pad the caller uses.

**KNOWN INPUT TO THE DRIVE PROBE, deferred on purpose and not overlooked:** 31 frontage strips up to
432 m long are still single AABBs, so each is an unbroken 432 m collision face. Short side min 20 /
median 32 / max 64 m; 30 of the 31 sit on a ring face. Both the builder and the critic would cut
them at ~200 m before facades go on. If the probe dislikes them the fix belongs in `blocks.js`, not
in `rewire`.

**S0+S1 PASSED THEIR CRITIC** - `verdicts/wave-t/generate-mesh-s01-critic.md`. It re-ran the whole
proof independently: modules genuinely separate (HEAD's `chunkStats` is an OBJECT, the new one a
FUNCTION), a deliberate 1e-4 poison control fires, 0 differing values of 3786909 ordered AND
0 rows differing in an unordered multiset over all 199311 instance rows. It also **closed a hole
the builder left**: Pass A/B were instanced-only, so it compared the 279 PLAIN meshes too - the road
ribbons and kerbs that S0's `buildRibbon` rewrite actually builds - 0 diffs of 30684.

**THE 199311 vs 203540 INSTANCE GAP IS RESOLVED EXACTLY, WITH NO REMAINDER, AND THE STALE NUMBER IS
IN THE PLAN, NOT THE CODE.** `tools/perf-probe.mjs:955-978` adds `totalInst++` for every PLAIN mesh
as well as `o.count` for instanced ones, and the same run reports `plainObjs: 567`. Censusing six
historical trees: `40d2f1c` (where the comment was written) = 202973 = 203540 - 567 exactly, then
-640 for the -20% NPC change, -1510 for parked cars halved, -1512 for the deleted overhead wires.
567 + 640 + 1510 + 1512 = 4229. **Do not re-open this.**

Six findings, none blocking, all for S2 to absorb:

1. **`finalize()` never frees `p._m`/`p._c` (`world.js:1259`) - 18.45 MB + 2.05 MB retained across
   67 descriptors**, despite the plan saying "freed at finalize". Not a regression (total instance
   memory went 45.02 -> 33.95 MB) but it IS the "dispose path that does not dispose" that chunk
   contract rule 3 is about, and it will present at S4 as a memory creep blamed on streaming.
2. **"Risk 2 HANDLED" IS A COMMENT, NOT CODE** - exactly 1 object in the subtree has
   `matrixWorldAutoUpdate === false`, the same as HEAD. That is rule 5's exact shape. **And the
   hazard is not real**: a Group added post-boot composes correctly on both trees because
   `Object3D.updateMatrix()` forces the Scene subtree every frame. **Which also means HEAD's claimed
   2.9 ms/frame saving from the opt-out at the old `world.js:3156-3163` IS NOT BEING DELIVERED.**
   Two corrections in one finding: fix the comment, and do not budget for that 2.9 ms.
3. **The `hidePoles` bug was BIGGER than the builder claimed**: `tlArm`/`tlHead` had it too, not
   just `slArm`/`slHead`. 5 lamps + 5 signals sink 30 instances on HEAD against 50 now. Four pools,
   not two. Fix verified idempotent, distinct slots, no over-hide, `_phantom-probe.mjs` clean.
4. `resolve()` drops HEAD's write-to-source fallback, so a future miss fails silently.
5. `SIGN_CAP = 1000` is left as dead code, and the cap count is **53, not 51**.
6. The `Array.isArray(material)` guard and its comment were deleted from the bucketing.

**`generate-mesh` S2 IS DONE** (`c31cb1b` fixes, `bcc0037` S2), `verdicts/wave-t/generate-mesh-s2.md`.
The world is now built on the 200 m lattice with `cellHash` seeding, `R` is nulled in the emitter
scope, and the `neonSign` injected-`rng` leak is fixed. **Determinism: 50 cells, 3816986 values per
run, SEVEN runs - one rebuild and six with the population order shuffled - all 0 differing**, with a
1e-4 poison control firing on exactly 1 value in 1 cell.

**THE ORDER-INDEPENDENCE TEST PAID FOR ITSELF ON ITS FIRST RUN, AND WHAT IT FOUND WAS NOT A SEEDING
BUG. 287 OF 288 STREET-LAMP PANELS WERE INVISIBLE FROM THE ROAD.** `streetLight()` needs rotation
order `XYZ` for the bulb panel; the caller set it once before the loop and the last line of
`streetLight` set it back to `YZX`, so only the FIRST lamp ever got it. Under `YZX` the panel normal
faces the sky and `lampMat` is `FrontSide`. The test caught it only because which lamp came first
depended on visit order. **A build/rebuild determinism test would NOT have found this. Shuffle the
order, always.**

Two more from S2 worth keeping:

- **THREE TEXTURE MAKERS RAN AFTER THE FIRST EMITTER**, so the sign, awning and frond canvases
  depended on how many buildings the city happened to have. They have their own `cellHash` seeds
  now. The five that run before any emitter are byte-identical to S1.
- **The `matrixWorldAutoUpdate` line saves ONE matrix multiply per frame, not 1709.** Read out of
  the running page: three r180's `updateMatrixWorld` recurses into children UNCONDITIONALLY, and the
  `if (child.matrixWorldAutoUpdate === true || force === true)` guard the old comment described is
  gone from the library. The old `world.js:3156-3163` comment's 2.9 ms/frame is not available and
  must not be budgeted at S4.

**A VISUAL-GATE ITEM IS OPEN AND IT IS DELIBERATELY NOT FIXED YET. `daytime-downtown` IS WORSE.**
Seven-scene pixel deltas (same-tree noise floor in parens): dusk 7.7% (0.004%), boost 8.3%,
crash 38.6%, wet-night 97.0%, daytime 85.9%, car-paint 31.4%, hud 46.7% - large because the re-seed
is the whole point of S2. `wet-night-asphalt` is BETTER (denser legible signage, and the lamp panels
visible for the first time). But `daytime-downtown`'s S1 frame had three large near-field billboards
carrying the left wall and this draw put none there, so the near third reads flatter and greyer.
Nothing is missing globally - signage is -1.9% map-wide, instances +0.8% - **this camera simply
landed on a stretch that drew badly.**

**The builder could have fixed it by re-rolling `S_FRONT` at `game/world.js:1089` and deliberately
did not, because picking a salt by looking at one screenshot tunes the seed to the test. That call
was right and it stands.** The correct fix is that S3's district profiles must make near-field
frontage density robust enough that no camera lands on a bare stretch, and it is verified at S3d
when the graph city replaces this content wholesale. **Do not spend an agent re-rolling a salt to
improve a grid-city frame that S3d deletes.** Carry this row until S3d and settle it there.

Two things S2 flagged rather than inheriting silently: a map-wide mesh (draw state under
`CHUNK_MIN`) has no owning cell and therefore no dispose path, which is correct now and wrong the
moment cells stream - noted in code for S4; and true per-cell build/dispose/rebuild cannot be tested
until `buildChunk`/`disposeChunk` exist, so what S2 proves is the property they will depend on, not
the plumbing.

**`generate-mesh` S3a IS PARTIAL** (`3081710`), `verdicts/wave-t/generate-mesh-s3a.md`. Roads and
junctions are in under `#map=graph`; **kerbs and pavement are NOT WRITTEN**, two of four deliverables
untouched. `#map=grid` is still the default and all seven scenes are within the noise floor.
Programs: grid 131, graph 99, zero new materials. The 2 mm z-fight hack is GONE - every ground road
sits at one `y = 0.03`, exactly as section 4 predicted once ribbons retract and the junction polygon
owns the gap.

**BOUNDARY BIT-IDENTITY HOLDS, AND THE FIRST VERSION OF THE CHECK WAS VACUOUS.** Within one plan the
two cells either side of a boundary hold the SAME VERTEX OBJECT, so comparing them proves sharing,
not agreement. The harness now builds the whole plan TWICE as two separate computations with
separate object graphs and compares run 1's upstream vertex against run 2's downstream one:
**301 crossings over the 261 straddling edges, 1505 values, 0 differing, 0 pairs that are the same
object, 1 ULP poison control caught.** Arclength is carried through a new `v0` argument to
`ribbonInto` - **without it the vertices match and the join is STILL visible as a texture seam**,
which the bit-identity check alone would never have caught.

**THE PICTURE FOUND A BUG EVERY NUMBER PASSED, for the fourth time in this wave.** The first
degree-9 junction render had its mouths torn open while the harness reported 330 polygons all with
real area. A corner pair is `t +/- n*h` and `n` is the left normal of the edge's own `a->b`
direction, so an arm TERMINATING at the node contributes its corners in the opposite rotational
order and the ring zigzagged. The first fix - sort all corners by angle - fixed that node and broke
others by destroying each arm's corner adjacency. **The correct fix keeps arms sorted by bearing and
flips only the SIGN of `n` against the outward direction, so corners stay exactly the ribbon's
terminal vertices.**

Settled by reading rather than guessing: **section 3 option (a) is WRONG for this texture.**
`road.js:351` draws a centre pair, so a horizontal repeat puts a double yellow line down the middle
of every lane. Option (b) shipped - marked carriageway at the class spec width, remainder as
`shoulderMat`.

**Two junction artefacts, honestly reported, both the specified formula behaving as specified, and
both a judgement for the picture rather than a bug:** a 78 m plaza at node 319 and 15 smaller
siblings straight out of `SIN_FLOOR = 0.20`; and downtown retreats of 25-40 m putting adjacent
junction polygons nearly in contact, so it reads as broad merged paving rather than distinct
intersections. Degree-9 is right; downtown is coarse.

**A PROCESS FAILURE WORTH MORE THAN THE CODE, AND IT IS THE PLAY BRIEF'S OWN RULE.** A
pattern-matching script wrapped seven grid-only loops and matched the WRONG occurrences, including
code inside `makeFrondTex` where `GRAPH` is not in scope. **`tools/lint.sh` said `lint ok` and the
page then hung at boot with NO console error**, costing a full revert of `world.js`. The rule
"`lint ok` DOES NOT MEAN RUNNABLE - always boot the page" was known, quoted, and not followed. Gates
are now anchored on unique comments, each verified by printing the line it guards. **Never bulk-edit
`world.js` by pattern match. Boot the page before handing the tree to the next step.**

**`generate-mesh` S3a IS NOW COMPLETE.** `verdicts/wave-t/generate-mesh-s3a-kerbs.md`.
`game/map/pavement.js` extrudes the kerb and pavement from `createBlocks(doc).faces`, batched to
**exactly two chunk-owned geometries per cell** over 181 cells - against the 1736 unshared
`BoxGeometry` meshes the grid world's two-boxes-per-block discipline would have produced at 868
blocks. **Zero new materials; `#map=grid` stays at 131 programs and every one of the seven scenes
is at or under its own same-tree noise floor.** Graph mode went 99 -> 101 programs and that is NOT
two new materials: `kerbMat` and `walkMat` always existed and were simply never DRAWN under
`#map=graph` before, so they were never compiled; both are already inside grid's 131.

**BOTH DIRECTIONS OF RISK 12 ARE NOW MEASURED, and the second one had never been:**
**pavement-in-road 0 of 1,213,824 band samples**, and **0 of 26,798 drawn kerb vertices inside a
block AABB with 0 kerb segments crossing one**, tightest clearance 0.460 m against `blocks.js`'s own
`KERB_MARGIN = 0.5`. Boundary continuity: the plan built TWICE as separate computations, 32,720
values over the on-plane vertices, **0 differing**, 1 ULP poison control caught. Order-independence:
**260,400 canonical triangles, five shuffled face orders, 0 differing.**

Four findings from it that must not be rediscovered:

- **THE OBVIOUS CONSTRUCTION IS WRONG AND `blocks.js` ALREADY SAID SO IN ITS OWN COMMENTS.**
  Offsetting a face polygon inward by its own bounding edges' paved half-widths puts pavement on the
  road, because road corridors do not respect faces (`blocks.js:244-250`). Every cross-section is
  MARCHED against `surfaceAt` instead - pushed out, pulled back, and the band truncated at the next
  tarmac inward. 16,803 pushed (mean 2.58 m, max 23.99 m), 10,880 pulled back, 966 truncated.
- **A STATION-WISE GUARANTEE IS NOT A SURFACE-WISE GUARANTEE, AND THEN A VERTEX-WISE ONE IS NOT AN
  EDGE-WISE ONE.** With every cross-section individually marched clear, **3.03% of the drawn band
  was still on tarmac** - the quad BETWEEN two stations sweeps a wedge across a corner. And with not
  one of 15,578 kerb vertices inside a block AABB, **51 kerb SEGMENTS still cut a block corner, the
  worst 4.01 m deep**, on 17-35 m corner chords. Fixed by testing each quad and by subdividing and
  re-marching any chord over 7.0 m. Both went to zero; both were invisible to the check one level up.
- **A REFLEX CORNER MUST NOT BE MITERED.** At a convex corner the two offset lines converge and
  their intersection lies ON both, hence exactly `h` from each road. At a reflex corner they diverge
  and the miter runs `h / sin(theta/2)` up the bisector - 5.7x the paved half-width at a 340 degree
  interior angle - which put 14 kerb vertices up to 7.54 m inside a block. A round join at radius
  `h` about the ring vertex fixes it and is also what makes the junction mouths read right.
- **THE SIGNED NEAREST-KERB TEST IS THE WRONG INSTRUMENT for "is the AABB outside the pavement".**
  It reported 159 samples outside at 25.99 m worst; every one was a correct block on a big face's
  40 m frontage ring measured against a kerb 37 m away and round a corner. The exact test needs no
  orientation and no closed ring: no drawn kerb vertex inside an AABB, no drawn kerb segment
  crossing one.

Honestly open at S3a's close: the pavement is a **7.8 m BAND, not a filled plot**, and **7% of the
ring length has no pavement at all** (2,118 of 29,635 cross-sections dropped, 887 quads cut) where a
foreign corridor comes within `MIN_BAND` of the face boundary. Visible from 500 m as short breaks.
And `planPavement` is 499 ms + `createBlocks` 351 ms run over the WHOLE map at boot under
`#map=graph` - the eager build rule 1 forbids, correct for S3a, an S4 item. `planPavement` already
takes the cell size and restricts trivially.

One cross-runtime caveat, measured: node and headless chromium classify exactly ONE of 29,635
stations differently (a station sitting on the corridor boundary where the round join's `Math.cos`
differs in the last bit). Within one runtime the result is bit-exact. Do not read a node-vs-browser
dump difference as a bug.

**`generate-mesh` S3b IS DONE, WITH ONE OPEN DEFECT ON THE NON-DEFAULT PATH (see the EXACT NEXT
ACTION above)** - `verdicts/wave-t/generate-mesh-s3b.md`. Under `#map=graph` the
graph is now a CITY: 868 blocks from `createBlocks(doc).blocks`, five district profiles replacing
`downtown = hypot < 260`, buildings, street wall, signage, neon, awnings, props, guard railing,
street lamps, traffic signals, zebra crossings, gantries, road wear, parked ranks, signal queues,
the motorway's rails and billboards, and the overpass. **`world.blocks` (868) and `world.blockIndex`
are published.** 1,191,271 instances over 191 cells, `overflow.n === 0`, boot to `__ready` 4.9 s.

**`#map=grid` IS STILL PIXEL-STABLE, AND THE FIRST VERSION WAS NOT - THIS STEP CAUGHT ITSELF.**
Putting plan section 5's raised Palm Bay palm share on the `palmbay` PROFILE looked right and was
wrong: a grid block has no district and falls back to the `palmbay` profile, so the raise landed on
every outer grid block. Measured on the default path: `palmTrunk` 340 -> 578, `frondMesh`
2724 -> 4624, and because the palm branch consumes RNG draws the whole prop stream re-rolled
(`benchSeat` 2150 -> 2342, `binMesh` 1114 -> 822) for **15.1% of pixels in `crash-cam` at maxd 184**.
Palm share is now a separate table keyed on `b.district` (`game/world.js:2277`) which a grid block
cannot reach. After the fix the pool census is IDENTICAL pool for pool and all seven scenes are at
their own same-tree noise floor. **A "verbatim" profile shared with the grid fallback is only
verbatim in the fields the grid reads; check every field, not the two the plan tabulates.**

Five things from S3b that must not be rediscovered:

- **THE BLOCK LIST IS THE WHOLE CITY.** Filling `blocks` from `createBlocks` gave towers, the
  street wall, signage, neon, awnings, props and guard railing for free, because every one of them
  iterates `blocks` or the `frontages` / `towers` arrays it produces. Only the populations the grid
  hung off `LAYOUT.grid` directly needed new per-edge / per-node code.
- **A FIXED 2 x 2 MASS GRID DOES NOT SURVIVE THE GRAPH.** The grid's blocks are all 134 m; the
  graph's building line runs 6 m to 418 m and 31 blocks are frontage strips up to 432 m as a SINGLE
  AABB. At 2 x 2 those are two 200 m building boxes end to end. `MASS_CELL = 60.0`
  (`game/world.js:2302`) sizes the grid from the block and evaluates back to exactly 2 x 2 at
  `bw = 120`, so the default path does not move. `blocks.js` was NOT edited.
- **RISK 12 IS CLEAN FROM THE BUILDING SIDE, MEASURED: all four footprint corners of all 4786 shaft
  masses and all 4542 podiums lie inside a block AABB, worst overhang 0.000 m.** S3a-kerbs proved
  the kerb is outside the AABB; this is the other end of the same rule.
- **THE 608 NEON WET SMEARS HAD TO BE BATCHED AND IT WAS THIS STEP'S DEBT.** `road.js`'s
  `addWetSmear` builds a Mesh with its OWN geometry and material per call and pushes it into
  `refl.hidden`, which is iterated twice per reflection render. At the grid's 69 neons that is
  fine; at 608 it put **725 distinct materials in the scene against grid's 187**. Bucketed by
  (colour, length quantised to 2 m) under `#map=graph` only: **725 -> 133, below grid's 187.** The
  grid branch is untouched because `wet-night-asphalt` is a gate scene.
- **THE MOTORWAY IS NOT ONE ROAD. The 52 `motorway` edges are TWENTY connected components**, the
  largest 12 edges / 1285 m, longest single edge 291.9 m. So risk 16's pier row cannot be 44 piers
  over 2.4 km: the chain is walked from every (edge, end) pair, the chain is chosen by how much
  viaduct it can carry rather than by its own length, and the result is **10 deck segments (500 m)
  and 7 piers at the unchanged 0.75/0.85 radius, 11.6 m height and 60 m pitch.** The row is NOT
  dropped. The grid's ungated 1400 m deck at `z = -700` WAS being drawn under `#map=graph` over
  open ground with nothing under it; it is now behind `if (!GRAPH)`.

Determinism: **191 cells, 1,191,271 instances, six runs - one rebuild and five with the population
order shuffled - 0 differing cells, and 1,697,327 values compared value-by-value in the six densest
cells with 0 differing.** Poison control fires on exactly 1 cell. `tools/_s3b-determinism.mjs`.

Open at S3b's close, honestly: `renderer.info.programs` under `#map=graph` is **180 against 101 at
S3a and 131 for grid**, and that is NOT new materials - `git diff` adds zero `new THREE.*Material`
calls and the scene's distinct material count is 133, below grid's 187. Normalising the light-count
field out of the three.js program cache key collapses 180 to 141: **39 of the 79 are a second
point-light-count variant** of already-compiled materials, because the graph city fills the
`POOL = 10` dynamic light pool where S3a's empty graph world did not. The remaining gap is draw
states grid also compiles. Flag for `perf`, not a decision-4 breach.

Read the chunk contract in the brief BEFORE writing the generator, not after. The rule that decides
whether this task ships at 3.5 s or 14 s is that **nothing outside the hero's resident chunk set
may be BUILT during boot** — and it must be asserted on what EXISTS at `__ready`, never inferred
from a frame time.

The binding brief is **`tools/WAVE-T-MAP-BRIEF.md`**. Read it and the play brief before anything.
Its one-sentence version: replace `LAYOUT` in `world.js` with a road GRAPH, generate the world from
that graph in chunks around the hero, and prove the graph is connected before anything is built
from it.

| piece | owns | state |
|---|---|---|
| `digitise` | `game/map/paradise.json`, `game/map/validate.mjs` | **DONE.** `verdicts/wave-t/digitise.md` |
| `queries` | graph spatial index, `surfaceAt` off `LAYOUT` | **DONE.** `verdicts/wave-t/queries.md` |
| `generate` | graph -> roads, kerbs, junctions, buildings | **SPLIT INTO THREE.** See below. Owns the `surfaceAt` swap |
| ├ `generate-blocks` | `game/map/blocks.js`, graph faces -> building blocks | **DONE.** 3 rounds. `verdicts/wave-t/generate-blocks{,-critic,-critic-r2}.md` |
| ├ `generate-mesh` | per-chunk emitters in `world.js` | **DESIGNED** (`tools/WAVE-T-GENERATE-MESH-PLAN.md`). **S0-S2 DONE** (S0+S1 critic-passed). **S3a DONE**: roads, junctions, kerbs and pavement. **S3b DONE**: the city - blocks, districts, buildings, signage, neon, props, cars, street furniture, `world.blocks` + `world.blockIndex`; **2 of 7 scenes do not boot under `#map=graph`**, grid unaffected. **S3c next** |
| └ `generate-wire` | `surfaceAt` swap, `paths`, `bounds`, harness coords | not started; lands with `generate-mesh` |
| `stream` | chunk build/dispose around the hero | not started; needs `generate` |
| `rewire` | `traffic.js`, parked ranks, signals, `physics.js` blocks, minimap, spawns | not started; needs `queries` |
| `skyline` | far LOD / impostors | not started |
| `perf` | load time and frame time | not started; runs ALONE on the machine |

**`digitise` IS DONE**, including two follow-up passes the user asked for. `game/map/paradise.json`:
**688 nodes, 929 edges, 78.81 km** of centreline over 4000 x 2861 m, ONE connected component,
strongly connected, **min degree 2, ZERO dead ends**.

**THE USER'S RULE IS STRICTER THAN THE BRIEF'S WAS, AND IT WINS: no hanging roads, no cul-de-sacs,
no dead ends, it all connects.** The brief originally allowed a degree-1 node if it was explicitly
flagged `deadEnd: true`. That is gone. Every node has degree 2 or more, `deadEnd` must be `false`
everywhere, and the validator rejects a graph that sets it - a flag is an annotation, not a road,
and the car still stops. Confirmed by `game/map/validate.mjs` AND independently by
`tools/_mapconnect.mjs`, a second implementation sharing no code with it: every node reaches every
other node and back, 200 random pairs round-tripped. `game/map/validate.mjs` runs from `tools/lint.sh` and is mutation-tested — a
severed network, a cleared `deadEnd`, a stranding `oneWay` and a ghost node reference all exit 1
while the real file exits 0. Rebuild the whole chain with `bash tools/map-build.sh`.

Full write-up, including what is honestly missing, is `verdicts/wave-t/digitise.md`. Three things
from it that will cost the next session a day if they are rediscovered instead of read:

- **THE OVERLAY IS THE ACCEPTANCE TEST, not a debug convenience.** `verdicts/wave-t/digitise-overlay.png`
  draws the graph back over the source image. Every numeric check on a road graph passes just as
  happily on a graph that looks nothing like the city, and the overlay caught two defects that no
  number in the pipeline would have shown: **the motorway was missing from the map entirely** (it
  is gold, and the mask was "bright and desaturated"), and then **the classifier found the event
  pins instead of the motorway** (pins are gold discs too).
- **Print the kilometre figure at every stage.** Merging nodes by PROXIMITY chained transitively
  and silently ate 40 of 83 km; contracting short EDGES is bounded and cannot. The stage-by-stage
  km print is the only reason that was caught.
- **THERE IS A RAILWAY ON THE MAP AND IT MUST NOT BE TRACED.** A dark reddish line loops the city;
  75% of it coincides with the motorway corridor the graph already has, and the other 25% runs over
  open water and mountainside with NO ROAD UNDER IT. That quarter is correctly uncovered. Do not
  chase it to raise a coverage number - it would lay drivable road across water.
- **A coverage metric over a noisy mask measures the noise.** Asking what share of the ROAD MASK
  had no graph edge near it returned 43.6%, which was rock, surf, beach and roofs. The honest
  quantity is coverage of the traced CENTRELINE: 13.5%, now 12.9%.
- **Dead ends are removed, not annotated.** Stubs are first SNAPPED into the network wherever a
  real junction was missed - 5 to a nearby node, 21 split onto the middle of another road to make a
  T-junction - and only what still dead-ends after that is deleted, 38 fragments totalling 2.51 km
  (3.1%). Every one was inspected on overlay crops first and not one was a genuine cul-de-sac; they
  are all places the mask lost a road that visibly continues.

`oneWay` is false everywhere and `elevationClass` is `ground` everywhere — both honest nulls, since
a top-down still shows neither. Do not read them as unfinished work to go and fill in blind.

**`queries` IS DONE.** `game/map/graph.js` indexes the graph's 2373 segments into a uniform 64 m
grid (2944 cells, 2.17 segments per cell, 92 KB, built in 3.0 ms) and answers:

- `surfaceAt(x, z)` at **189 ns**, 43x faster than a brute-force scan and identical to it on all
  10000 probes. Four wheels for one frame costs **0.00075 ms** of a 16.7 ms budget.
- `nearest(x, z)` at 760 ns, returning `{ dist, edge, t, x, z, seg }` — the edge, the parameter
  along it and the closest point, which is what `rewire` needs for traffic lanes and `generate`
  needs for junctions.

`tools/_mapquery.mjs` is the check and it compares against brute force written separately in the
harness. **Half the probes are on tarmac on purpose**: uniform random points over a 4000 x 2861 m
map are almost all dirt, so a uniform-only probe set passes against an index that always says
`dirt`. 6000 probes walk the segments with a jitter that straddles the kerb face, because the
boundary is where a grid index fails — by missing a segment registered in the next cell.

Uniform grid over an R-tree because road segments are short, similar in length and evenly spread;
CSR layout over per-cell arrays because chunk streaming will rebuild indices as the hero moves and
a few thousand small arrays per rebuild is garbage that world does not need.

One improvement over what it replaces: `LAYOUT` used a single hardcoded `PAVED_HALF = 13.0` for
every road; the graph version uses each edge's own `width / 2 + 3`, so a motorway's paved corridor
is properly wider than a service road's.

**WHAT LANDED IN THIS WAVE'S PREP (no game code touched):**

- **The source map is sourced and recorded.** `reference/map/street-names.jpg` (1759x1184) is the
  PRIMARY - it is the only candidate carrying district boundaries, and it labels all five
  districts and the airport, quarry, island and stock-car circuit. `reference/map/ign-map.jpg`
  (1349x965) is the SECONDARY, lower resolution but with a clean road network and legible road
  CLASS colouring. Both provenance-recorded with rejected candidates in `reference/map/SOURCES.md`.
  **Street names and elevation are NOT sourced and are not worth another session** - see that file.
- `tools/WAVE-T-MAP-BRIEF.md` written.
- The trim rule was run: session 16's plumbing commit and the whole wave-S record are now in
  `STATE-HISTORY.md`.

**THE FINDING THAT SHAPES THE WHOLE WAVE.** Every road-aware system in the tree reads `LAYOUT`
(`world.js:15`, twelve numbers) rather than any built geometry - `surfaceAt`, the road/kerb/building
generation, parked ranks, signal queues, `traffic.js` lanes, `physics.js` blocks, the minimap and
`scenes.js` spawns. So there is exactly ONE thing to replace, and the port order follows from it:
**give the consumers a graph query first, generate meshes second.** The reverse order rewrites
every one of them twice. `surfaceAt` is the canary - smallest consumer, already injected rather
than imported. If the graph cannot answer it cheaply per frame, the graph is wrong.

**THE FAILURE MODE THIS WAVE MUST NOT SHIP:** building the whole graph's meshes at boot and using
the chunk system only for disposal. It passes every functional test in T3 and quietly turns a
3493 ms cold load into ~14 s. Assert on what EXISTS at `__ready`, not on a frame time.

### SESSION 17 — TASKS.md WAVES 0 AND 1. Commits `f095b88`, `80477c4`, `c5770d7`, `7330f1a`, `45e7e6c`.

`TASKS.md` is the user's seventeen-feature backlog and its own wave plan. Waves 0 and 1 are done;
wave 1's T16 is the only item still open at the time of writing.

- **T9, the dev tuning menu** (`f095b88`). `game/devtune.js`, 26 sliders over steering, drift and
  camera, writing straight into the live `TUNE` / `camRig.config` / `FRAME` objects. **TEMPORARY:
  it is deleted once the user reports final figures**, and that closing step is wave 2.
  A `git worktree` at `../burnout-tune` is pinned to this commit so the user can tune against a
  stable tree while agents rewrite the main one.
- **T1, struck parked cars** (`80477c4`). The promotion path was never broken; the impulse was
  too small to see. Now a real momentum exchange, with spin from the lever arm rather than a coin
  flip. Full numbers in `verdicts/wave-s/t1-t17-parked-cars.md`.
- **T17, the C crash key** (`80477c4`, `7330f1a`). Gone, prose updated rather than deleted.
- **T14, menu cleanup** (`c5770d7`) and **T12, drift metres** (`45e7e6c`). Built by glm-5.2 and
  gpt-5.6 in live sessions against `tools/BRIEF-T14.md` and `tools/BRIEF-T12.md`, both verified
  independently before landing; T12 needed two defects fixed on top.

**Three corrections to `TASKS.md` were found by reading the code, and are recorded in the
verdicts rather than left to be rediscovered:** `gripLow` and the `1/(1+(sn-gripLow)*1.35)` yaw
decay factor do not exist (the curve was rewritten to `min(rGrip, rGeo)` in wave-S round 2); the
orbit camera was never shared between the C key and the real crash path; and T16 needs
`traffic.js`, which the wave-1 plan assigns to a different agent, so it was resequenced behind T1
rather than run concurrently.

**FRAME TIME IN THIS SESSION IS SMOKE-TEST ONLY.** Peer agents were running throughout, which the
play brief forbids reporting a frame number under. Re-take alone before quoting any of it.

**THE TRIM RULE WAS RUN when wave T opened**, taking this file from 474 lines back under 300.

### THE DEFECTS THE USER REPORTED FROM PLAYING IT. This is the source of the wave-S work list.

- **Steering was INVERTED.** Right steered left.
  **FIXED**, at the INPUT mapping in `game/main.js`, where left now maps to `+1`.
  It had to be fixed there and not on `yawRate`: `physics.js` integrates `yaw += yawRate*dt` and a
  positive Y rotation in three.js is counter-clockwise seen from above, i.e. a LEFT turn, but
  `yawRate` also feeds `lat`, which drives `slip` and `lean`, so negating `yawRate` would have made
  the car bank the wrong way through corners.
  **Any future change to this chain must preserve that invariant: D turns right AND the body leans
  away from the turn centre.**
- **The traffic was a car park.** 2667 vehicles, all standing still.
  Density won a screenshot metric, and a still frame cannot tell a parked car from a moving one, so
  the loop optimised toward something wrong.
  This is the clearest example in the whole project of a metric coming loose from the thing it was
  supposed to measure, and it is worth remembering that the loop produced it while every visual
  number improved.
- **The car did not feel right.**
- **No scene picker and undiscoverable controls.** The user had to ASK what boost was bound to.

### SESSION 16'S PLUMBING COMMIT AND THE ENTIRE WAVE-S RECORD — MOVED TO `STATE-HISTORY.md`.

Trimmed when wave T opened. What still binds from it lives in `tools/WAVE-S-PLAY-BRIEF.md` (the
720p contract, the baseline, the instrument, the runtime knobs) and in `verdicts/wave-s/`. The
archive is for auditing a claim by `grep`, not for reading.

### A MEASUREMENT RULE THIS WAVE ADDED, AND IT IS NOT OPTIONAL

**`p50 <= 16.7 ms` IS NOT `60 fps sustained`. Report p50 AND delivered fps AND the share of frames
over 16.7 ms, every time.**
`cruise` sat at p50 15.90 ms — inside the bar — while dropping **23.3%** of its frames and
delivering 60.0 fps.
A p50 that passes with a quarter of the frames long does not feel like 60 fps, and reporting p50
alone would have declared the bar met on a scenario a player would call uneven.

**AND: MEASURE SIGNED, NOT ABSOLUTE.**
Round 3's biggest find was invisible to two previous instruments because both measured heading change
as `|yaw - yaw0|`.
An absolute value scores a car rotating the WRONG WAY as a car rotating well; the car was spinning
away from the corner at 96 deg/s and both instruments read it as a success.
**Any instrument measuring a directional quantity must keep the sign.**

## THE PERMANENT RULES. Everything above this line is the live record; everything below was paid for in rounds.

### NEW CONCURRENCY RULE — nine concurrent builders is PAST THE LIMIT

Wave N ran nine at once and the paired-A/B discipline nearly broke down. Recorded damage:
car.js went transiently NON-PARSING inside another builder's measurement window; road.js spent
part of the round rendering a blown-out false-colour debug ramp that zeroed every fill
statistic; scene exposure moved 73 -> 213 -> 72 mid-round; `intactFlank` swung 99.5 -> 194.7
across renders with identical damage.js. Three separate builders had to reconstruct their
pre-edit file byte-exactly (md5-verified) and interleave A,B,A,B to get a usable pair.

**From Wave P on: run builders in two batches of 4-5, and put coupled pieces in DIFFERENT
batches.** Known couplings: crash x boost (smear kernel), car x damage (`syncFromPaint` env
probe is `partUnder`'s only light), sky x everything (exposure/grade), and **NEW IN WAVE R:
boost x road** — boost's T1 denominator is the `road.js`-owned nofx frame, and a peer road edit
moved it 0.99 -> 1.08 (T1 0.394 -> 0.361) while boost's own fx frame stayed bit-stable. Builders must still
reconstruct-and-interleave; that technique worked and should be in the brief, not rediscovered.

### THE FOUR RULES THAT WERE PAID FOR IN ROUNDS. DO NOT REDISCOVER THEM.

1. **Critic sweeps and builder waves strictly alternate; never overlap.** Wave J proved
   concurrent builders perturb each other's headline metrics badly enough to invalidate
   unpaired before/after measurements (road watched its ratio move 0.86 -> 1.11 with zero
   road.js changes, because sky.js landed an aerial-perspective change mid-round).
2. **Per-piece run-to-run render noise is 0.00. Paired atomic A/Bs are still not optional.**
   The old "+/-0.04" figure in this rule is SUPERSEDED and must not be quoted again. Post
   determinism fix, measured frozen-tree noise is **0.00 on every metric across all four
   presets**, n=3 each, every replicate printing an identical `_facademeas` line including the
   integer band-pixel count (`verdicts/wave-p/post-determinism.md`); the honest pixel-level
   caveat is `<=0.005%` of pixels at `<=9/255`. Paired A/B therefore costs 2 renders, not 8.
   **Keep paired A/B anyway.** Its real job was never the noise floor: every large mid-round
   swing previously written off as noise was CROSS-PIECE COUPLING, and that hazard is untouched
   by the seed fix. `boost-blur` was not one of the four presets measured, so render it twice
   until someone measures it.
3. **A metric that can be satisfied by aliasing, by inaudible signal, or by the wrong object
   is not a metric.** This failure has now happened four times: car glass matched p99 while
   reading as corduroy; boost's spectral sweep scored perfectly at an inaudible -50 dB; boost's
   plume was stretched to 6.5:1 to match a HUD graphic instead of the car; road exceeded the
   12.48 grain anchor at 13.38 using per-pixel aliasing. The model fix is a SCALE-PERSISTENCE
   ratio — measure at 1920 and at 960 and require the ratio to hold, which aliasing cannot fake.
   **If a number says we match but the image reads wrong, the number is the broken thing.**

   **WAVE O AMENDMENT — SCALE-PERSISTENCE IS NOT A COMPLETE GUARD. This is the project's own
   safeguard and it has now been beaten.** P only rejects PER-PIXEL aliasing. A **20 px coherent
   comb scores 1.35** and sails through. Boost moved P 0.57 -> 1.36 by trading 1 px noise for a
   low-frequency herringbone (NP=16 stations x 12 wedges/radian), and `_heromask` fx-vs-nofx
   shows hpRms **1.70 -> 14.74** — an 8.7x HF *increase* from a pass that is supposed to be a
   BLUR (ref 5.26). **Always pair P with an fx/nofx ratio (a blur must REDUCE HF) and with a
   crop.** A pass that manufactures structure is not filtering.
4. **Check every gain/amplitude term against the dynamic range of whatever consumes it.**
   Four Wave K gaps were the same bug class: a quantity pushed past the range its own
   downstream falloff can represent. Crash sparks at 2.8x additive clipped the first 63% of the
   authored `pow(v,2.2)` taper; car glass slope exceeded the pane's blur kernel; road's chip lens
   warped mirror UVs +/-6 texels per pixel with no matching mip; boost's box-mean accumulation
   averaged away the contrast it was supposed to smear. r8's glass-albedo>1.0 bug was the first.

   **Wave M confirms this is the dominant bug class in the project.** Five of the eight Wave M
   gaps are the same shape: audio's IGN_DEC (93 dB in 0.17 s), car's ungated metalness (1.0
   zeroes diffuse), damage's envMapIntensity 2.0 (drowns aoMap), road's fixed LOD bias (no
   distance term), boost's max-over-jitter (amplifies estimator variance). **Before writing any
   gain, ask what consumes it and what range that consumer can represent.**

Wave O damage-shot tool defect and the wave-O crash x boost cross-piece table: see STATE-HISTORY.md; all live constraints are folded into tools/STANDING-CONSTRAINTS.md.

### RULE 5 — NEW IN WAVE M. DO NOT TRUST A DOCSTRING. VERIFY THE CONSTANT.

The Wave M crash-cam critic found that the Wave L crash.js builder **rewrote the comments and
changed zero constants.** `crash.js:2118-2127` says "gains are now scaled so peak r sits just
above 1.0"; `:2131` still reads `r = 2.8`. `:2098` claims the streak scaler and the 2.6 m ceiling
came down; `:485/:988/:2104` are unchanged. `:196-209` describes a `VC` nose split in
`streakTexture` that **does not exist**. `:1259` says the panel fold scaler "now uses 1.5";
`:1269` still reads `6.4`. And `shots/crash-l1-sparks.png` (04:04) measures fill 4.32% against
the current 14.46% — **the builder had the fix working and reverted it before saving.**

Consequences, binding on every future wave:
- **Critics: never read a comment as evidence.** Grep the constant. The crash-cam critic caught
  this only because it probed the live scene and diffed against an intermediate screenshot.
- **Builders: your report is checked against `git diff`-equivalent constant values, not prose.**
  A comment claiming a change that the code does not make is the worst outcome available here —
  it costs the next full critic round to detect and it poisons the brief chain.
- This is why every builder must write `verdicts/wave-<letter>/<piece>.md` for its own wave with
  the BEFORE and AFTER literal values of every constant it touched, quoted with `file:line`.

### ONE STANDING CROSS-FILE ROUTE — honour it

The environment fix needs the real fog density, but `world.js:2749` historically read
`scene.fog.density`, a dead `0.001` placeholder hardcoded at `sky.js:1404` — a file the SKY
builder owns. The arranged route: sky exposes the true preset `d0` on `sky.fogParams[0]`;
world.js reads it READ-ONLY and never edits sky.js. Check `verdicts/wave-m/sky-lighting.md`
and `verdicts/wave-m/environment.md` for the symbol that actually exists now.

