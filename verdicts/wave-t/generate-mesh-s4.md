# generate-mesh S4 - RESIDENCY. IN PROGRESS.

Step S4 of `tools/WAVE-T-GENERATE-MESH-PLAN.md` (staging plan line 813; pass table lines 696-706).

## THE BEFORE ROW, MEASURED, NOT ESTIMATED

Measured by the orchestrator on the live page at `window.__ready`, tree `f538a1d`, with a peer recon
agent running - these are OBJECT COUNTS, not frame times, so the peer does not invalidate them.

```
node tools/probe.mjs --scene daytime-downtown --expr "...world.chunkStats()..."
{ "residentCells": 191, "areaKm2": 7.64, "instances": 1191251,
  "meshes": 8447, "geometries": 44, "overflow": 0 }
```

Against the section 7 pass table this is the eager build the plan predicts, and worse than its own
estimate of it: 191 resident cells against a pass of `<= 9`, and 7.64 km2 against `<= 0.36`.

**`chunkStats()` DOES NOT YET IMPLEMENT THE SECTION 7 CONTRACT.** The probe expression asks for
eleven fields and six come back `undefined`: `mapOccupiedCells`, `edgesBuilt`, `edgesTotal`,
`blocksBuilt`, `blocksTotal`, `chunkGeoms`. `progs` is also absent because `window.__warmStats` is
not set on this path. Four of the seven pass conditions therefore cannot be evaluated at all today.
Adding those six fields is part of S4, not a follow-up, because the pass table is unmeasurable
without them - and each must be counted off the chunk records that EXIST, never off a running total.

Cold load for reference, from STATE.md, measured alone at `b52a253`: 4590 ms median, stages
sky 41 / road 548 / **world 1562** / car 178 / sim 84 / post 31 / warm 1611 ms.

## CONSTANTS TOUCHED

| constant | file:line | BEFORE | AFTER |
|---|---|---|---|
| (none yet) | | | |

## S4 IS SPLIT IN TWO, AND THE SPLIT IS THE DESIGN DECISION OF THIS SESSION

Recon (grok-4.5, read-only) mapped `createWorld`'s phases and found the shape that decides this:
the emission code is **seven EMIT regions interleaved with GLOBAL material and helper regions**
between `world.js:1591` and `:4041`, and it feeds **grow-only accumulators that a later phase reads**
- `frontages` and `towers` (declared `world.js:2342-2343`, pushed by the two block loops at `:2367`
and `:2461`, read by the signage loop at `:2673`), then `neons`, `lampPositions`, `poles`,
`signalLights`, `parkedBodies` and `contacts`, and finally one `contactMesh` allocated once at
`world.js:3873` and one `emitters` list built at `:3965` from the finished global lists.

**So making the emitter re-entrant is the expensive half of S4, and it is NOT what the pass table
asks for.** The pass table asks what EXISTS at `__ready`. That is bought by filtering the emitter's
INPUTS at boot, which needs no re-entrancy at all.

- **S4a - the residency FILTER, behind `#chunkres=N`, defaulting OFF.** Coarse filters on the block
  list, the road-plan cells, the pavement cells and the per-edge / per-node loops, plus a fine gate
  at `chunkAt` so a straddling edge cannot inflate `residentCells` past 9 by placing one prop.
  Plus the six missing `chunkStats()` fields. The emitter still runs exactly once.
- **S4b - RE-ENTRANCY.** `emitCells` / `disposeCells`, the `update()` pump with hysteresis,
  `world.settle()` for the shot path (risk 7), per-cell contact and emitter rebuild, cell ownership
  of the live registries. This is where the default flips to `RES = 1`.

**WHY THE KNOB DEFAULTS OFF, AND IT IS THE SAME DISCIPLINE S3a-S3d USED.** With the filter on, the
world outside a 600 x 600 m island does not exist, so the seven gate frames and
`tools/_s3c-drive.mjs` would legitimately go red. Defaulting off means S4a's own acceptance test is
**the default path being unchanged to the instance** - `residentCells 191`, `instances 1191251`,
`meshes 8447`, `filtered 0` - while `#chunkres=1` is measured against the section 7 pass table in the
same tree, on the same boot path. A combined S4 has neither check, because the world it produces is
different from the one it is being compared against.

## STATUS

S4a builder RUNNING (grok-4.5). No code edited yet at the time of writing.
