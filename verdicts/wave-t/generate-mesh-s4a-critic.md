VERDICT: FAIL

## FINDINGS

### BLOCKING: Dead descriptor crash on hide() - game/world.js:2963, 3379, 3380

**What is wrong:** When an instance is filtered (non-resident), `pushMat` returns `[deadDesc, 0]` and this is recorded in the `used` array of affected emitters (parked cars, street lights). Later, when `hide()` is called to move the instance off-screen (parked car promoted by collision, pole knocked down), it calls `resolve(deadDesc, ...)` at game/world.js:2964 and 3380. Since `deadDesc` is never finalized, it does not exist in `sink.remap`, and `resolve()` throws with `"resolve: no finalized instance for pool undefined index 0"`.

**Concrete failure:** With `#chunkres=1`:
- Calling `hide()` on parked car index 0: throws immediately
- 79 out of 101 parked cars (78%) crash on `hide()`
- All tested street lights (10 out of 10) crash on `hide()`
- Default path (no filter) works: 0 errors on 10 parked cars tested

**Root cause:** Lines 3316 and 2985 record `push()` return values unconditionally, regardless of whether the instance was filtered. Dead descriptors should either be excluded from `used` or skipped in `hide()`.

**BLOCKS PASS:** Yes. This is a crash in live gameplay. S4b will default RES=1, making this the standard path.

---

## CLAIM TABLE

| claim | your measurement | verdict |
|---|---|---|
| Default path residentCells 191 | 191 | match |
| Default path instances 1191251 | 1191251 | match |
| Default path meshes 8447 | 8447 | match |
| Default path geometries 44 | 44 | match |
| Default path overflow 0 | 0 | match |
| Default path filtered 0 | 0 | match |
| Default path world.blocks.length 868 | 868 | match |
| `#chunkres=1` residentCells 8 | 8 | match |
| `#chunkres=1` areaKm2 0.32 | 0.32 | match |
| `#chunkres=1` edgesBuilt 27 / 929 | 27 / 929 | match |
| `#chunkres=1` blocksBuilt 33 / 868 | 33 / 868 | match |
| `#chunkres=1` chunkGeoms 37 vs 48 limit | 37 vs 48 | match |
| `#chunkres=1` overflow 0 | 0 | match |
| Zero new materials (programs 128) | 128 = 128 | match |
| Zero new materials (geometries 674) | 674 = 674 | match |
| Zero new materials (textures 92) | 92 = 92 | match |

---

## WHAT WAS EXECUTED

```bash
# Default path verification
node tools/probe.mjs --scene daytime-downtown --expr \
  "(()=>{const s=window.__game.world.chunkStats();return{ \
   residentCells:s.residentCells,mapOccupied:s.mapOccupiedCells, \
   areaKm2:+(s.residentCells*s.cell*s.cell/1e6).toFixed(3), \
   edges:s.edgesBuilt,edgesTotal:s.edgesTotal, \
   blocks:s.blocksBuilt,blocksTotal:s.blocksTotal, \
   instances:s.instances,meshes:s.meshes,geometries:s.geometries, \
   chunkGeoms:s.chunkGeoms,overflow:s.overflow.n,filtered:s.filtered, \
   worldBlocksLen:window.__game.world.blocks.length}})()"

# Filtered path verification
node tools/probe.mjs --scene daytime-downtown --hash chunkres=1 --expr \
  "(()=>{const s=window.__game.world.chunkStats();return{ \
   residentCells:s.residentCells,mapOccupied:s.mapOccupiedCells, \
   areaKm2:+(s.residentCells*s.cell*s.cell/1e6).toFixed(3), \
   edges:s.edgesBuilt,edgesTotal:s.edgesTotal, \
   blocks:s.blocksBuilt,blocksTotal:s.blocksTotal, \
   instances:s.instances,meshes:s.meshes,geometries:s.geometries, \
   chunkGeoms:s.chunkGeoms,overflow:s.overflow.n,filtered:s.filtered, \
   worldBlocksLen:window.__game.world.blocks.length}})()"

# Hide() crash test - parked cars
node tools/probe.mjs --scene daytime-downtown --hash chunkres=1 --expr \
  "(()=>{const w=window.__game.world;let errors=0; \
   for(let i=0;i<w.parkedCars.length;i++){ \
   try{w.parkedCars[i].hide()}catch(e){errors++}} \
   return{totalCars:w.parkedCars.length,errorCount:errors}})()"

# Hide() crash test - poles
node tools/probe.mjs --scene daytime-downtown --hash chunkres=1 --expr \
  "(()=>{const w=window.__game.world;let errors=0; \
   for(let i=0;i<Math.min(10,w.poles.length);i++){ \
   try{w.poles[i].hide()}catch(e){errors++}} \
   return{testCount:Math.min(10,w.poles.length),errorCount:errors}})()"

# Materials check
node tools/probe.mjs --scene daytime-downtown --expr \
  "(()=>{const r=window.__game.renderer.info; \
   return{programs:r.programs.length, \
   geometries:r.memory.geometries,textures:r.memory.textures}})()"

bash tools/lint.sh
```

