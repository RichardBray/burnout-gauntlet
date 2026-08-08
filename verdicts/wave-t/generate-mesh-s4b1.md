# generate-mesh S4b-1 - SUBSET THE PLANNERS

Piece: planner `opts.keep` filter behind `#chunkres`, still defaulting OFF.
Tree measurement: `node tools/_s4b1-check.mjs` (node only; no browser).

## Files changed with line numbers

### `game/map/blocks.js`
- **111-114**: JSDoc for optional `opts.keep(x0,x1,z0,z1)=>boolean` (AABB-overlap; topology always map-wide).
- **132-133**: resolve `keep` only when it is a function; else `undefined` (keep everything).
- **271**: `facesFillSkipped` counter.
- **282-296**: per-face polygon AABB; skip `fillFace` when `keep` rejects; empty fill stub.
- **296**: big-face ring stats only when fill actually ran.
- **404-410**: `params.keep: true` and `facesFillSkipped` published only when a keep filter ran (clause 4 identity).

### `game/map/pavement.js`
- **182-185**: JSDoc for optional `opts.keep`.
- **200-201**: resolve `keep` the same way.
- **226**: `facesMarchSkipped` counter.
- **228-237**: per-face AABB skip of the cross-section march when `keep` rejects.
- **643-644**: `facesMarchSkipped` only when keep ran.

### `game/world.js`
- **1318-1333**: `MAP_BLOCKS_TOTAL = 868`, `MAP_OCCUPIED_CELLS = 186`, `plannerKeep` = resident box expanded by one cell (`RES + 1`), or `undefined` when `RES` is not finite.
- **1844-1850**: pass `{ keep: plannerKeep }` into `createBlocks` / `planPavement` only when finite RES.
- **1857-1862**: when keep is on, publish `mapOccupiedCells = MAP_OCCUPIED_CELLS` instead of a shrunk live union; keep-OFF still recomputes live.
- **1939-1941**: `blocksTotal = plannerKeep ? MAP_BLOCKS_TOTAL : blocks.length`.
- **4280**: `chunkStats().blocksTotal` uses that denominator.

### `tools/_s4b1-check.mjs` (new)
Node harness: medians at keep OFF / RES=1,2,4; face identity; map-wide totals; clause-4 no-op vs self and vs HEAD; poison control.

## Constants changed

**Zero constants changed value.**

New local constants only (not edits of existing ones):
| name | file:line | value | role |
|---|---|---|---|
| `MAP_BLOCKS_TOTAL` | `world.js:1321` | 868 | pass-table denominator when keep subsets fill |
| `MAP_OCCUPIED_CELLS` | `world.js:1322` | 186 | published mapOccupiedCells when keep is on |

Existing knobs (`#chunkres`, `#chunkorigin`, pitch, walkW, etc.) untouched.

## Check tool output

Command: `node tools/_s4b1-check.mjs` (exit 0). Full output:

```
=== S4b-1 planner keep check ===
MAP_BLOCKS_TOTAL constant: 868
MAP_OCCUPIED_CELLS constant: 186

--- planner ms (median of 3) ---
keep OFF: createBlocks 342.2 ms, planPavement 588.9 ms | blocks 868, faces 240, pavCells 181, fillSkipped 0, marchSkipped 0
keep RES=1: createBlocks 177.4 ms, planPavement 136.5 ms | blocks 334, faces 240, pavCells 81, fillSkipped 200, marchSkipped 200
keep RES=2: createBlocks 198.6 ms, planPavement 233.2 ms | blocks 436, faces 240, pavCells 99, fillSkipped 160, marchSkipped 160
keep RES=4: createBlocks 265.6 ms, planPavement 312.3 ms | blocks 664, faces 240, pavCells 147, fillSkipped 87, marchSkipped 87

--- faces OFF vs ON (topology must match) ---
RES=1: faces len OFF=240 ON=240; ids match=true; euler OFF={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} ON={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} same=true; polygon floats compared=8618 differ=0
RES=2: faces len OFF=240 ON=240; ids match=true; euler OFF={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} ON={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} same=true; polygon floats compared=8618 differ=0
RES=4: faces len OFF=240 ON=240; ids match=true; euler OFF={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} ON={"V":692,"E":937,"F":247,"components":1,"chi":2,"expected":2} same=true; polygon floats compared=8618 differ=0

--- map-wide numbers ---
keep OFF: blocks.length=868 (must equal MAP_BLOCKS_TOTAL 868)
keep OFF: pav.cells=181
MAP_BLOCKS_TOTAL regenerate check: PASS (868 vs 868)
keep OFF mapOccupiedCells (road densify union)=185 (constant 186; world.js live path is authoritative)
RES=1: blocks kept=334, pav cells kept=81, mapOccupiedCells published=186 (must be 186), blocksTotal published=868
RES=2: blocks kept=436, pav cells kept=99, mapOccupiedCells published=186 (must be 186), blocksTotal published=868
RES=4: blocks kept=664, pav cells kept=147, mapOccupiedCells published=186 (must be 186), blocksTotal published=868

--- clause 4 no-op: keep OFF twice on current tree ---
blocks: compared=6944 differ=0
faces polygons: compared=8618 differ=0
stats (excl timing): same=true
pavement: compared=3046990 differ=0
TOTAL values compared=3062553 differing=0 (must be 0)

--- clause 4 no-op: current keep-OFF vs HEAD createBlocks/planPavement ---
HEAD blocks 868 faces 240 pav 181
blocks: compared=6944 differ=0
faces: compared=8618 differ=0
stats (excl timing): same=true
pavement: compared=3046990 differ=0
TOTAL values compared=3062553 differing=0 (must be 0)

--- poison control: perturb one face polygon by 1e-4 ---
poison polygon floats: compared=8618 differ=1 (must be > 0)
poison control PASS (comparison FAILS as required)

=== done ===
```

### Timing table (ms, median of 3)

| config | createBlocks | planPavement | sum |
|---|---:|---:|---:|
| keep OFF | 342.2 | 588.9 | 931.1 |
| keep RES=1 | 177.4 | 136.5 | 313.9 |
| keep RES=2 | 198.6 | 233.2 | 431.8 |
| keep RES=4 | 265.6 | 312.3 | 577.9 |

At RES=1: ~3.0x total planner wall time reduction (931 -> 314 ms). Topology work still pays ~half of createBlocks.

### Faces comparison
All RES: length 240, ids match, euler identical (`chi=2`), 8618 polygon floats differ 0.

### Blocks / pavement kept
| RES | blocks kept | pav cells kept | fillSkipped | marchSkipped |
|---:|---:|---:|---:|---:|
| OFF | 868 | 181 | 0 | 0 |
| 1 | 334 | 81 | 200 | 200 |
| 2 | 436 | 99 | 160 | 160 |
| 4 | 664 | 147 | 87 | 87 |

### mapOccupiedCells
Published 186 at every keep-ON RES (constant). keep-OFF blocks regenerate to 868. Tool-side road-densify union alone reads 185; world's live path remains authoritative for the constant.

### No-op proof (clause 4)
- Current keep-OFF twice: 3_062_553 values compared, 0 differ.
- Current keep-OFF vs HEAD createBlocks/planPavement: 3_062_553 values compared, 0 differ.

### Poison control
Perturb one polygon coord by 1e-4: differ=1. Comparison fires. PASS.

## Lint output

```
$ bash tools/lint.sh
lint ok
```

Exit 0.

## Declared collision consequence from clause 7

`world.blocks` is COLLISION (`game/physics.js:922`). Subsetting the fill subsets the collision list.
That is **accepted for this piece**: the filter defaults OFF, and at `RES=1` the hero cannot leave the resident disk.
**Streaming collision is owned by S4b-2.** This piece does not fix it and does not claim the default path still has map-wide collision under `#chunkres`.

## Anything found but not fixed

1. **Tool-side keep-OFF `mapOccupiedCells` densify union = 185 vs published constant 186.** The check lacks the full world road-plan cell key set; world's live recompute path is authoritative. Not "fixed" to 191 (deliberate 5-cell gap from S4a).
2. **Block counts at RES=1 are 334, not recon's ~34.** Recon counted block centres inside the strict resident box; this piece keeps faces by AABB against the **expanded** box (`RES+1`), so more faces fill. Expected by contract, not a bug.
3. **Browser cold-load / `#chunkres=1` live page not run here** (machine cannot bind sockets for Chromium). Orchestrator owns `tools/_loadtime.mjs` / probe. Node-only check is the acceptance for this builder.
4. **createBlocks still ~177 ms at RES=1** because half-edge topology stays map-wide (clause 2). Further load wins need S4b-2 streaming or a different topology strategy, not a quieter fill skip.
