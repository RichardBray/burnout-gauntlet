# generate-mesh S4b-1 - INDEPENDENT CRITIC

Role: try to FAIL the piece. Do not fix.
Bound commits: `51852c0` (implementation) and parent context `0445708` (S4b split / recon).
Tree also has post-state `cbbf878` (loadtime note); product diff under attack is `51852c0`.

## Verdict

**PASS**

No product claim breaks hard enough to FAIL. Weak joints exist (check regenerator, stale comment, residual fill mislabeled as "topology"). Core contract holds under independent re-measurement.

---

## Binding reading (done)

| source | used for |
|---|---|
| `git show 51852c0` full patch | code surface: blocks/pavement/world/check/verdict |
| `tools/WAVE-T-MAP-BRIEF.md` | map/chunk contract, consumers of graph |
| `tools/WAVE-S-PLAY-BRIEF.md` | play measurement rules (no S4b-specific binds) |
| `tools/WAVE-T-GENERATE-MESH-PLAN.md` §5/§7 L696-707 | pass table: `blocks/blocksTotal`, `mapOccupiedCells` |
| `verdicts/wave-t/generate-mesh-s4b1.md` | builder claims to attack |

---

## Method

1. Re-ran builder harness: `node tools/_s4b1-check.mjs` → exit 0.
2. Independent harness: `node tools/_s4b1-critic.mjs` (topology × origins, own poison, timings).
3. Regenerated `mapOccupiedCells` with the **real** world union: `planRoads` ∪ `planPavement` ∪ block cells (not densify).
4. Grep consumers of `built.blocks`, `graphBuilt`, `world.blocks`, `blockIndex`, `pav.cells`.
5. Diff scan for `THREE.*Material` / new materials in `51852c0`.
6. Measured face-AABB overlap vs block centres vs fill residual cost.

---

## Attack 1 - MAP_OCCUPIED_CELLS 185 vs 186

| regenerator | value |
|---|---:|
| `MAP_BLOCKS_TOTAL` vs keep-OFF `createBlocks().blocks.length` | **868 = 868** |
| check densify (edge samples only) | **185** |
| **world-faithful: `planRoads` ∪ pav ∪ blocks** | **186** |

Live decomposition: roadPlan cells 180 → +pav 184 → +blocks **186**.

Densify misses `'-7,-7'` and `'4,-4'` present in `planRoads`; densify alone invents `'-8,-6'` not in road plan.

**Constant is correct.** `_s4b1-check.mjs` regenerator is incomplete and **does not assert** (it prints 185 and waves at "world authoritative"). Hardcoded constant with a lying regenerator is a process smell, not a ship blocker for the published number.

**Severity:** LOW (tools quality), not product FAIL.

---

## Attack 2 - Own poison (not builder's face float)

Builder poison only mutates one face polygon coord after two clean builds (post-hoc compare). Weak joint: does not prove block-field compare or keep predicate matter.

| poison | result |
|---|---|
| Invert keep at RES=1 | blocks **334 vs 534**; faces still 240/240 |
| Mutate first block field after clean pair | clean differ **0**, poisoned differ **1** |

Own poisons fire. Keep predicate changes fill population. Block-field comparator is not a silent no-op.

**Severity:** none - claim holds; builder poison was weak but not false.

---

## Attack 3 - Topology map-wide (RES + shifted origin)

Independent OFF baseline vs keep ON:

| config | faces | ids | polyDiff | euler χ | blocks | fillSkip |
|---|---:|---|---:|---:|---:|---:|
| RES=1 origin 0,0 | 240 | match | 0 | 2 | 334 | 200 |
| RES=2 origin 0,0 | 240 | match | 0 | 2 | 436 | 160 |
| RES=4 origin 0,0 | 240 | match | 0 | 2 | 664 | 87 |
| RES=1 origin 3,-2 | 240 | match | 0 | 2 | 232 | 190 |
| RES=1 origin -5,4 | 240 | match | 0 | 2 | 182 | 215 |
| RES=2 origin 2,2 | 240 | match | 0 | 2 | 294 | 159 |

Euler object identity (`V/E/F/components/chi`) matches full keep-OFF. Polygon float compare 0 diffs. Builder origin tests only (0,0); shifted origins also hold.

**Claim holds.** `graphPaths(roadPlan, built.faces)` still receives map-wide faces.

---

## Attack 4 - Other consumers of the subset

| consumer | file | effect under finite RES |
|---|---|---|
| physics collide | `main.js:201` → `physics.js` | subset `world.blocks` - **declared** |
| camera colliders | `camera.js:251` | same list - **undeclared sibling** |
| traffic layout blocks | `main.js:223` | same list - **undeclared sibling** |
| `blockIndex` | `world.js:1936` from `graphBuilt.index` | index built over **subset** fill |
| deck clear | `world.js:3955` `blockIndex.at` | far blocks missing from index under keep |
| emission loop | `world.js:2495+` | already residency-gated (S4a); list itself is now also subset |
| `graphPaths` / parking paths | faces | map-wide faces - OK |
| `pav.cells` | kerb/walk meshes | subset march + S4a resident mesh skip |
| fill stats | insetArea/blockArea/buildArea/ringFaces | shrink under keep; not pass denominators |
| `droppedTiny` | pre-fill | 6 = 6 (unchanged) |

**Stale comment landmine:** `world.js:2497` still says  
`world.blocks / blockIndex still hold every block (collision); only this iteration is gated.`  
After S4b-1 that is **false** whenever `plannerKeep` is set. Builder verdict accepts collision subset for this piece; comment was not updated.

No silent consumer was found that assumes map-wide **faces** while receiving a subset (faces stay full). Consumers of **blocks** all see the subset; collision class accepted.

**Severity:** LOW/NOTE for declaration + stale comment. Not FAIL given builder clause 7.

---

## Attack 5 - The 334 and timing asymmetry

### Why 334 blocks, not recon ~34

| quantity (RES=1, origin 0,0, keep box = RES+1) | n |
|---|---:|
| faces total | 240 |
| faces AABB-overlap expanded keep | **40** |
| faces fill-skipped | 200 |
| blocks produced | **334** |
| blocks from those 40 faces (faceId join on full plan) | **334** |
| block centres in **strict** RES=1 cell box | **33** |
| block centres in expanded RES+1 box | **138** |
| kept blocks with centre **outside** expanded box | **196** |
| face centroids Chebyshev ≤1 | 9 |

Keep is face-AABB vs expanded box. One large face that clips the box fills **every** rect on that face, including centres far outside residency. Recon counted centres in the strict 3×3 (~33). Expected by contract (builder already notes this).

### Timing (critic machine, median of 3)

| | OFF ms | RES=1 ms | save fraction |
|---|---:|---:|---:|
| createBlocks | ~324 | ~176 | **~0.46** |
| planPavement | ~641 | ~117 | **~0.82** |

Builder table shape matches (their 342→177 / 589→137; my check re-run 328→172 / 668→116). Absolute ms are machine noise.

### Asymmetry explanation (measurement, not story)

`createBlocks` timing split (single run, RES=1 keep ON):

| stage | OFF ms | ON ms |
|---|---:|---:|
| fillMs | ~333 | ~178 |
| cross+index+traversal | ~5-10 | ~5 |
| buildMs total | ~323 | ~184 |

Under keep ON, **fill is still ~97% of createBlocks wall**. Residual cost is filling the **40 AABB-overlapping faces** (many rects each → 334 blocks), **not** half-edge topology. Topology is cheap (~few ms) and always map-wide.

Builder verdict line "Topology work still pays ~half of createBlocks" is **wrong diagnosis**. Half of wall vs keep-OFF is residual fill of oversized faces, not topology.

`planPavement` is almost pure per-face march → skipping 200/240 faces wins ~5.5×. Matches the 692→127 class of claim.

**Severity:** INFO (diagnosis wrong) / NOTE for S4b-2 load strategy. Not product FAIL.

---

## Attack 6 - No new THREE.Material

`git show 51852c0` on product files: **no** `new THREE.*Material`, no new material construction. Kerb/walk mesh path pre-existed; keep only skips march before sinks fill.

**Pass.**

---

## Attack 7 - Cannot reproduce builder verdict?

| claim | independent result |
|---|---|
| `node tools/_s4b1-check.mjs` exit 0 | **Reproduced** |
| faces 240, ids, euler χ=2, poly 0 diffs | **Reproduced** |
| keep-OFF self no-op 0 diffs (~3e6 values) | **Reproduced** |
| poison face float differ>0 | **Reproduced** |
| MAP_BLOCKS 868 regenerates | **Reproduced** |
| densify occ=185 note | **Reproduced** (and explained) |
| keep-OFF vs "HEAD" import | On today's tree HEAD already includes S4b-1 → check extracts parent modules to tmp; still 0 diffs at re-run |
| exact ms table | Same shape, different absolutes |
| browser `#chunkres=1` / probe pass table | **Not re-run** (node critic). Outside piece acceptance as builder framed it |

Cannot break reproduction of node claims. Browser path still unmeasured here.

---

## Diff surface (product)

| file | change |
|---|---|
| `game/map/blocks.js` | `opts.keep` on fill only; empty fill stub; stats identity when keep off |
| `game/map/pavement.js` | `opts.keep` on march only |
| `game/world.js` | `MAP_*` constants, `plannerKeep`, wire keep, publish denominators |
| `tools/_s4b1-check.mjs` | new harness |
| `verdicts/wave-t/generate-mesh-s4b1.md` | builder writeup |

---

## Findings (severity | location | issue | proof)

1. **LOW | tools/_s4b1-check.mjs:~182-209 | regenerator undercounts mapOccupied (185) and does not fail |** densify ≠ planRoads; live union 186; check only logs.
2. **LOW | game/world.js:2497 | stale S4a comment claims full collision list |** false under `plannerKeep`; contradicts S4b-1 subset.
3. **NOTE | game/camera.js:251, main.js:223 | undeclared subset consumers |** same `world.blocks` as physics; declaration incomplete not separate bug class.
4. **NOTE | builder residual-cost story |** residual createBlocks ~fill of 40 faces, not topology (~5 ms); misguides S4b-2.
5. **INFO | RES=1 keeps 334/868 with 196 centres outside expanded box |** face-AABB overfills; recon ~33 is centres-in-strict.

None of the above is a hard contract break for S4b-1 as specified (keep default OFF; topology map-wide; denominators frozen; collision subset accepted).

---

## What matters most for S4b-2

1. **`world.blocks` and `blockIndex` are already residency-subset under `#chunkres`.** Streaming must push/pop collision blocks (and rebuild or delta the index) as the origin moves. Do not code against the stale "still hold every block" comment.
2. **Face-AABB keep overfills.** Expect centres outside the resident disk. If S4b-2 wants ~strict 3×3 collision/emission, filter by centre (or per-rect) at stream time; do not trust planner keep alone for the pass-table "blocksBuilt" numerator.
3. **Further load wins:** residual planner cost is **fill of large straddling faces**, not topology. Topology is already cheap and correctly map-wide for `graphPaths`. S4b-2 streaming of emission is the next lever; quieter keep predicates alone will not kill the remaining ~170 ms of createBlocks under RES=1.
4. **Fix the check regenerator** to import `planRoads` so `MAP_OCCUPIED_CELLS` cannot drift without a red assert.

---

## Harness evidence (this session)

```
node tools/_s4b1-check.mjs  → exit 0
  keep OFF: createBlocks ~328 ms, planPavement ~668 ms | blocks 868 faces 240
  keep RES=1: createBlocks ~172 ms, planPavement ~116 ms | blocks 334 fillSkipped 200
  faces/ids/euler/poly: match, 0 diffs
  no-op self + vs HEAD modules: 0 differ
  poison face: differ=1

node tools/_s4b1-critic.mjs → exit 0
  densify 185; planRoads live 186
  invert keep 334 vs 534; block poison fires
  topology × 6 configs (incl shifted origin): polyDiff=0 eulerSame

planRoads union script: fullUnion 186
```

## Scorecard

| claim | result |
|---|---|
| `opts.keep` on createBlocks / planPavement | PASS |
| world wires keep from `#chunkres` (expanded RES+1) | PASS |
| topology map-wide (faces/ids/poly/euler; origins) | PASS |
| MAP_BLOCKS_TOTAL = 868 | PASS |
| MAP_OCCUPIED_CELLS = 186 | PASS (real path); check densify FAIL as regenerator |
| keep-OFF identity | PASS |
| no new materials | PASS |
| collision subset declared | PASS (siblings undeclared) |
| 334 vs ~34 explained | PASS |
| residual createBlocks = topology | **FAIL as diagnosis** (still PASS as product) |

## Final

**PASS.** Ship S4b-1 as a planner-subset piece. Carry findings 1-4 into S4b-2 design; do not treat residual planner cost as half-edge work.
