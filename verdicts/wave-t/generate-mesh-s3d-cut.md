# generate-mesh S3d, part 2 of 2 - THE CUT

Wave T, task T3. Commits `e19c761` (2a), `ffdc9d9` (2b), `a81c4c6` (2c), `f538a1d` (tidy).
Briefs: `tools/WAVE-T-MAP-BRIEF.md`, `tools/WAVE-S-PLAY-BRIEF.md`,
`tools/WAVE-T-GENERATE-MESH-PLAN.md:866-870` and its section 8 demolition list.
Run by the orchestrator (main agent), alone on the machine. No peer agents ran during any
measurement in this file.

## THE ACCEPTANCE TEST, AND WHY IT EXISTS AT ALL

**Pixel identity against `shots/t-s3d/`**, the seven frames the flip commit (`b52a253`) established,
each read against its own same-tree noise floor. **Not against the grid frames.** The whole reason
S3d was split was to have this test: with the flip and the cut in one commit the deletion would have
landed inside a diff that is already 100% different and nothing could have read it.

It earned its keep immediately - see the `wet-night-asphalt` row below, which is the only number in
this piece that needed thinking about, and which would have been completely invisible in a combined
commit.

## WHAT WAS DELETED

`game/world.js` and `game/main.js`, **274 net lines removed** (66 insertions, 274 deletions against
`20ea141`). `game/world.js` 4400 -> 4354 lines with the comment additions netted in.

**2a - the nine dead `if (!GRAPH)` blocks** (`e19c761`). The 2400 m straight highway ribbon and its
hand-drawn slip road; the highway gantry row; the roadside billboard row; the highway street-lamp
row; the 2400 m guard rail; its 480 posts; the 240 jersey barriers; the 1400 m overpass deck and its
two edge beams; the 44-pier row at `z = LAYOUT.highwayZ - 62`.

None has a graph counterpart to keep. **The graph's motorway is 52 edges in 20 connected components**
(S3b), longest chain 12 edges / 1285 m, so there is no 2400 m run to draw at all; the viaduct, deck
and piers are already re-emitted per motorway chain by the graph block, 10 deck segments and 7 piers.
`railPost`, `barrier` and `pier` keep their pools because that block fills them.

**2b - the `LAYOUT.grid`-driven generators** (`ffdc9d9`). `G` and the ten loops it drove: the grid
road ribbons, the 6x6 block construction, the block gantries, the street lamps, the traffic signals,
the kerb parking ranks, the signal queues, the zebra crossings, the road wear. Plus `roundedRect` and
the grid drive-path fallback `makePath(roundedRect(325, 325, 48, 8), true)` - a 650 m rounded square
in a 4 km city, which `tools/BRIEF-S3C.md:60` already recorded would put every scene in the void.

The two unshared `BoxGeometry` meshes per block that were the kerb and the pavement went with the
block loop. **At the graph's 868 blocks that construction would have been 1736 unshared meshes**;
`game/map/pavement.js` extrudes both from the face polygons into exactly two batched chunk-owned
geometries per cell. `kerbMat` and `walkMat` did not become unused - they are still pavement's.

**2c - the grid `surfaceAt`** (`a81c4c6`). `surfaceAt`, `PAVED_HALF = 13.0` and
`HIGHWAY_HALF = LAYOUT.highwayW / 2 + 2.2` deleted; `createWorld` publishes `graphIdx.surfaceAt`
unconditionally; `main.js` drops the module-level import and the `|| surfaceAt` fallback.

**Selection is still by publication, not by a branch,** and that is the property that let this swap
happen at S3c with `physics.js` untouched: it switches on the returned key and never knew which city
it was asking about.

## THE CONSTANT TABLE

Every constant that changed value or ceased to exist. **No constant changed value in this piece; the
whole diff is deletion.**

| file:line (before) | constant | BEFORE | AFTER |
|---|---|---|---|
| `game/world.js:40` | `PAVED_HALF` | `13.0` | **deleted** - `game/map/graph.js` carries the paved-corridor rule now |
| `game/world.js:41` | `HIGHWAY_HALF` | `LAYOUT.highwayW / 2 + 2.2` | **deleted** |
| `game/world.js:69` | `export function surfaceAt` | grid query | **deleted** |
| `game/world.js:316` | `roundedRect(hx, hz, r, seg = 10)` | grid path shape | **deleted** |
| `game/world.js:1652` | `G` | `GRAPH ? [] : LAYOUT.grid` | **deleted** |
| `game/world.js:1653` | `EX` | `LAYOUT.extent` | **deleted** |
| `game/world.js:1653` | `HALF` | `LAYOUT.roadW / 2` | **KEPT, value unchanged** - `PARK_OFF = HALF + 0.5` and the optional `half =` arguments of `crossing` and `roadWear` still read it |
| `game/world.js:1769` | `HZ` | `LAYOUT.highwayZ` | **deleted** (`f538a1d`, once its last reader went) |
| `game/world.js:4235` | grid `paths` fallback | `roundedRect(325, 325, 48, 8)` / 4-point highway | **deleted**; `paths = graphPath` |
| `game/world.js` pier geometry | pier radii / height / pitch | `0.75 / 0.85`, `11.6 m`, `60 m` | **UNCHANGED** - see below |
| `game/main.js:191` | map-mode predicate | `if (!/map=grid/…)` | **deleted**; `const mapDoc = await …` unconditionally |
| `game/traffic.js` | `POOL` | `24` | **not touched** |
| `game/world.js` | `NPC_DENSITY` | `0.16` | **not touched** |
| `game/physics.js:701` | `bounds` | graph extent (2000) | **not touched** |
| `game/world.js:1089` | `S_FRONT` | unchanged | **not touched** - no salt was re-rolled anywhere in S3d |

**Zero materials added.** `git diff 20ea141 HEAD` contains no `new THREE.*Material` call; the diff is
274 deletions and comment rewrites.

**THE PIER CONSTANTS ARE THE ONE THING IN THE DEMOLITION LIST MOST LIKELY TO BE QUIETLY DROPPED, AND
THEY WERE NOT.** The plan's risk 16 says so explicitly. The 44-pier grid row is deleted, but
`0.75 / 0.85`, the 11.6 m height and the 60 m pitch are unchanged and the comment carrying their
derivation was rewritten to say what it is now for rather than deleted with the row it was measured
on: the carrier of the car-paint-closeup vertical comb is OCCLUDED SOLID ANGLE, not the pitch;
jitter saturates at -17% by +/-8 m; per-pier variation is a clean null at 0.275 vs 0.271. **That
rationale is the deliverable, not the row.**

## THE SEVEN FRAMES, EACH STEP

Against `shots/t-s3d/`. `node tools/shot.mjs`, 1920x1080.

| scene | 2a | 2b | 2c |
|---|---|---|---|
| `dusk-highway-chase` | maxd 1, 0.0026% | maxd 1, 0.0027% | maxd 2, 0.0029% |
| `boost-blur` | maxd 1, 0.0035% | maxd 1, 0.0029% | maxd 1, 0.0026% |
| `crash-cam` | maxd 1, 0.0026% | maxd 1, 0.0011% | maxd 1, 0.0028% |
| `wet-night-asphalt` | maxd 14, 0.0066% | **maxd 31, 0.0123%** | **maxd 30, 0.0130%** |
| `daytime-downtown` | maxd 1, 0.0006% | maxd 1, 0.0008% | **maxd 0, 0%** |
| `car-paint-closeup` | maxd 2, 0.0105% | **maxd 0, 0%** | maxd 1, 0.0003% |
| `hud-overlay` | maxd 1, 0.0026% | maxd 1, 0.0018% | maxd 1, 0.0027% |

`f538a1d` re-checked `daytime-downtown` only: maxd 1 at 0.0005%.

## THE ONE ROW THAT NEEDED WORK, AND IT IS NOT WAVED THROUGH

`wet-night-asphalt` at 2b read **maxd 31 at 0.0123%**, above its recorded floor of maxd 29 at
0.0056%. Being above the floor is not something to explain away, so it was measured rather than
argued:

- **Same-tree noise re-measured on the 2b tree, two renders back to back: maxd 27 at 0.0081%.** The
  recorded maxd 29 / 0.0056% is itself one measurement.
- A second cross-tree render of the same scene: **maxd 30 at 0.0112%**.
- So the cross-tree figure is **1.1x the same-tree magnitude and 1.4x its pixel share** - inside the
  band, at the top of it, and **not separable from noise with this data.**
- **What makes a structural change implausible rather than merely unproven is the rest of the
  column**: at 2b every other scene is maxd <= 1 and `car-paint-closeup` is exactly 0. A change
  confined to the single scene whose reflection pass is the documented noise source, while six
  others are pixel-perfect, would be a coincidence.
- **And the decisive one: 2c reads maxd 30 at 0.0130% - the same figure, after a commit that touched
  entirely different code.** That is what a noise floor looks like and what a drift does not.

Recording the floor for the next reader: **`wet-night-asphalt` same-tree, this tree, maxd 27 at
0.0081%.** Anyone still quoting maxd 4 will read their own noise as a regression.

## THE OTHER GATES

- `bash tools/lint.sh` -> `lint ok` at every step. **And the page was booted at every step, because
  `lint ok` does not mean runnable** - S3a lost a full revert of `world.js` to exactly that. Default
  path READY in 4.0 / 4.0 / 4.0 / 3.9 s across the four commits, `{"err":"","ready":true,"game":true}`
  each time.
- `node tools/_s3c-drive.mjs` -> exit 0, `S3C_PROBE_GREEN DRIVER_FINDINGS=7`, **0 WORLD failures**,
  `probeFailures: []`, `pageErrors: []`. **The same 7 non-fatal DRIVER findings as before the cut** -
  the already-owned `followPath` wander. Nothing new, nothing worse.
- `node tools/_t4-surface.mjs` -> **`T4 OK`**, `surfaceAt 0.2571 us/call`, `0.000257 ms/frame` at one
  call per frame. This is the check that the `surfaceAt` deletion did not break T4's off-road
  penalty, and it is the one that would have gone red had the publication swap been wrong.
- `#map=grid` in the URL is now simply ignored and boots the graph city, READY in 3.9 s. It is not a
  broken URL; it is an inert one.

Frame time is NOT reported. None was measured, so none is claimed.
Cold load was not re-measured after the cut; the flip's figure stands and `perf` still owns the bar.

## WHY `#map=grid` WENT AHEAD OF S5

The plan puts the `#map` branch's removal in S5. It went at 2c because **after the grid `surfaceAt`
is deleted the flag no longer selects between two worlds - it selects between a world and a page that
throws.** Keeping it to the letter of the plan would have meant shipping a URL that hands out a
crash. It survived exactly as long as it was worth something, which was long enough to prove 2a and
2b pixel-identical against the flip, and that was the entire point of keeping it.

## WHAT IS LEFT FOR S5, HONESTLY

Not "nothing". These are real and were deliberately not done here:

- **`GRAPH` is still read at `game/world.js` :1146, :1622, :1768, :3327, :3528, :3999, :4107, :4139.**
  Every one is now always-true. They are harmless and mechanical, and folding eight always-true
  guards in the same commits that deleted 274 lines would have widened the diff the pixel test has
  to certify for no gain. `:4107`'s `map: GRAPH ? 'graph' : 'grid'` publishes a mode string that can
  now only be `'graph'`.
- **`LAYOUT` survives and should**, per decision 6: it carries `carKit` (`game/world.js:3187`) and
  `hud.js` still reads it. Only `LAYOUT.roadW` is read inside `world.js` now, via `HALF`. **Deleting
  `LAYOUT.grid` and `LAYOUT.extent` is `rewire`'s**, because the minimap is what still draws them.
- `createWorld`'s `rng` argument is still passed by `main.js` and read by nothing.
- `world.js` still builds the WHOLE map at boot. **S4 residency is untouched by this piece.**
