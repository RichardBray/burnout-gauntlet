VERDICT: PASS

## PRIMARY QUESTION: THE 647-INSTANCE DEFICIT

Orchestrator's claim verified by independent re-run:

**Item 5 (settling test at chunkres=2):** Inner 9 cells at `#chunkres=2` match the default path EXACTLY.
- Default path (inner 9): 50,655 instances
- Chunkres=2 (inner 9): 50,655 instances (identical, missing 0)
- Chunkres=1 (inner 9): 50,008 instances (missing 647)

This confirms the deficit is entirely a one-ring boundary effect that self-heals when the resident set expands.

**Item 3 (pool breakdown):** Deficit is entirely in building pools:
- gridMesh: -204, capMesh: -68, paintMesh: -43, braceMesh: -38, guardPost: -36, signFrame: -34, shopMesh: -30, strutMesh: -29, acMesh: -28, awnMesh: -23 (total 647)

**Item 2 (edge filter cause):** Orchestrator's logic is sound. Edge coarse filter (game/world.js:3697-3708) skips whole edges and increments `rec.stats.edges` for midpoint cell (3711-3714) for accounting only. All content routing is by individual `push()` calls based on instance position (3716+), not by midpoint. The edge filter cannot cause the deficit.

## SPECIFICATION CONFORMANCE: SECTION 5 QUOTED

From `tools/WAVE-T-GENERATE-MESH-PLAN.md` lines 465-478:

**"A block belongs to the single cell containing its centre: `owner(b) = (floor(b.cx/200), floor(b.cz/200))`. A block is not clipped and is not built twice."**

**"Consequence, stated plainly because it is a visible artefact: a large block whose centre is just the wrong side of a boundary pops in as a whole when its owner cell loads. With `RES = 1` the pop happens 400-600 m from the hero, behind the fog build-up (`world.js:1100` `uHazeD`), and it is `skyline`'s LOD job to cover it."**

The 647 missing instances are owned by blocks whose centres lie in cells just outside the 3x3 island at `RES = 1`. Their absence is the specified behaviour of section 5, not a bug. The piece is conformant.

The orchestrator's replacement acceptance bar - "equal except for content owned by non-resident cells, and exactly equal one ring in" - is the correct one. PASS.

## REMAINING FINDINGS

1. **Round 1's blocker, confirmed fixed:** `#chunkres=1`, hide() on all 146 poles and all 101 parked cars -> 0 errors, 247 total hide calls. Discriminate test: 43 poles and 22 cars are resident and genuinely hide; 103 poles and 79 cars are filtered and no-op. game/world.js:1600 identity check on deadDesc `p === deadDesc` still enforces loud failure on genuine miss. VERIFIED.

2. **mapOccupiedCells = 186:** Union of road-plan cells, pavement cells, and block-owner cells per game/world.js:1837-1844. Correct. VERIFIED.

3. **Default path unchanged:** residentCells 191, instances 1191251, meshes 8447, geometries 44, chunkGeoms 758, overflow 0, filtered 0, world.blocks.length 868, edgesBuilt 929, blocksBuilt 868. VERIFIED.

4. **Tests:** `node tools/_s3c-drive.mjs` exits 0, S3C_PROBE_GREEN, 7 DRIVER findings (all non-fatal), 0 WORLD failures, 0 probeFailures. `bash tools/lint.sh` returns "lint ok". VERIFIED.

## EXECUTION LOG

All measurements at 1280x720 from daytime-downtown scene:

- `node tools/probe.mjs --scene daytime-downtown --expr "...chunkStats()..."` -> default path validation
- `node tools/probe.mjs --scene daytime-downtown --hash "chunkres=1" --expr "...poolsPerCell..."` -> inner 9 cell instance counts at RES=1
- `node tools/probe.mjs --scene daytime-downtown --hash "chunkres=2" --expr "...poolsPerCell..."` -> inner 9 cell instance counts at RES=2 (settling test)
- `node tools/probe.mjs --scene daytime-downtown --hash "chunkres=1" --expr "hide() on poles and parkedCars..."` -> 0 hide errors, discriminate test
- `node tools/_s3c-drive.mjs` -> drive probe pass
- `bash tools/lint.sh` -> lint pass

All numbers derived from live `window.__game.world.chunkStats()` on rendered page.
