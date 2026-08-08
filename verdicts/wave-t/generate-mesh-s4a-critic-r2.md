VERDICT: FAIL

## RESIDENT-CELL UNDER-BUILD RESULT

Four of eight resident cells have fewer instances with the filter ON than with the filter OFF:

| Cell Key | Default (OFF) | Filtered (ON) | Difference | Status |
|---|---|---|---|---|
| -1,-1 | 8780 | 8764 | 16 fewer | UNDER-BUILD |
| -1,0 | 8649 | 8649 | 0 | PASS |
| -1,1 | 7062 | 6481 | 581 fewer | UNDER-BUILD |
| 0,-1 | 3740 | 3732 | 8 fewer | UNDER-BUILD |
| 0,0 | 8464 | 8464 | 0 | PASS |
| 0,1 | 3265 | 3265 | 0 | PASS |
| 1,-1 | 3639 | 3597 | 42 fewer | UNDER-BUILD |
| 1,0 | 7056 | 7056 | 0 | PASS |
| **TOTALS** | **50655** | **50008** | **647 fewer** | **FAIL** |

The filter is dropping 647 instances that belong in resident cells. This violates the core invariant: residency decides which CELLS exist, not what is INSIDE them.

## FINDINGS

### BLOCKING: Edge filter AABB check under-builds resident cells - game/world.js:3674-3694, 3699

**What is wrong:** The coarse filter for edges checks if the edge's bounding box intersects the resident region expanded by ONE cell (RES+1 check, line 3688). If yes, the edge passes the filter and proceeds. But then content is placed at the edge's MIDPOINT cell (line 3699). An edge can pass the broad RES+1 check while its midpoint falls outside the RES boundary, causing content to be routed to deadRec and filtered out rather than placed in the resident cell it passes through.

**Root cause:** Two different checks. Line 3688 checks "does AABB intersect RES+1 cells" (broad). Line 3699 checks "is midpoint resident" (narrow). Edges satisfying broad but failing narrow have their content (lamps, wear, parked ranks) silently filtered.

**Concrete failure:** With #chunkres=1, four resident cells are lighter than with filter off:
- Cell -1,1: 581 instances missing (8.2% of cell content)
- Cell -1,-1: 16 missing (0.2%)
- Cell 1,-1: 42 missing (1.2%)
- Cell 0,-1: 8 missing (0.2%)

Total: 647 instances filtered that should be in resident cells (out of 15150 filtered overall).

**BLOCKS PASS:** Yes. The under-build means fewer instances render, which scores BETTER on all upper-bound pass conditions (residentCells, edges/total, blocks/total). The filter disarms the correctness check while passing the metrics. This is measurement-trap class #1 - a metric satisfied without the thing it claims to measure.

**VERIFIED:** Executed `node tools/probe.mjs` twice (default path and #chunkres=1) with `instancesPerCell` array, compared all eight resident cells.

### Round 1's blocker (resolve() throwing) - genuinely fixed, not disarmed

**Verification:** resolve() returns null for deadDesc by identity (game/world.js:1600), both call sites check and continue (hidePoles:2972, parkedCar.hide:3390). The throw for genuine misses is still live (line 1609). Tested: hide() on parked cars at #chunkres=1 succeeds with 0 errors.

**Not disarmed:** The comment at lines 1594-1599 explicitly states this is the ONE legitimate miss and guards it by IDENTITY, not by absence. A genuine miss (real descriptor not in sink.remap) still throws loudly. This is the distinction that keeps the check meaningful.

## WHAT YOU EXECUTED

```bash
# Per-cell instance comparison: default path
node tools/probe.mjs --scene daytime-downtown --expr \
"(()=>{const s=window.__game.world.chunkStats();const m=Object.fromEntries(s.instancesPerCell);const cells=['-1,-1','-1,0','0,0','1,0','-1,1','0,-1','1,-1','0,1'];const result={};cells.forEach(k=>{result[k]=m[k]||null});return result})()"

# Per-cell instance comparison: filtered path (#chunkres=1)
node tools/probe.mjs --scene daytime-downtown --hash chunkres=1 --expr \
"(()=>{const s=window.__game.world.chunkStats();return{residentCells:s.residentCells,residentKeys:s.residentKeys,instancesPerCell:s.instancesPerCell}})()"

# Edge case: #chunkres=0
node tools/probe.mjs --scene daytime-downtown --hash chunkres=0 --expr \
"(()=>{const s=window.__game.world.chunkStats();return{residentCells:s.residentCells,instances:s.instances}})()"

# Edge case: #chunkres=abc (nonsense)
node tools/probe.mjs --scene daytime-downtown --hash chunkres=abc --expr \
"(()=>{const s=window.__game.world.chunkStats();return{residentCells:s.residentCells,instances:s.instances}})()"

# Hide() test
node tools/probe.mjs --scene daytime-downtown --hash chunkres=1 --expr \
"(()=>{const w=window.__game.world;const parkIdx=[0,1,2];let hidCount=0;parkIdx.forEach(i=>{try{w.parkedCars[i].hide();hidCount++}catch(e){}});return{parked:w.parkedCars.length,testHide:parkIdx.length,successHide:hidCount}})()"

# Lint
bash tools/lint.sh
```

Results: Edge cases pass (chunkres=0 builds 1 cell, chunkres=abc falls back to default 191). Hide() succeeds with 0 errors. Lint clean.

