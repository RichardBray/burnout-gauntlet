# BRIEF — `generate-mesh` S3c ROUND 3. FIX THE PROBE, NOT THE WORLD.

Round 2 (`dfa3e98`) was FAILED by its critic. Read the `## ROUND 2` section of
`/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c-critic.md` first, then
`/Users/robray/fc/demos/burnout-gauntlet/tools/BRIEF-S3C-R2.md` and
`/Users/robray/fc/demos/burnout-gauntlet/tools/BRIEF-S3C.md`. All still bind, as do
`tools/WAVE-T-MAP-BRIEF.md` and `tools/WAVE-S-PLAY-BRIEF.md`.

**`paths.city` IS FIXED AND PASSED ITS CRITIC. DO NOT TOUCH IT.** Face 124, edges
`421,422,435,467,485,500,523,568,593,564,540,507,426`, all `arterial`/`street`, 998.889 m, largest
gap 1.553 m, closure 0.000 m, 900/900 tarmac. Its narrow district coverage is judged NON-BLOCKING.
Do not re-derive it, do not "improve" it, do not touch `paths.highway`.

**The ONLY file you should need to change is `tools/_s3c-drive.mjs`.** If you believe you need to
change anything under `game/`, stop and say why in the verdict instead.

## THE RULING YOU ARE FIXING, AND IT IS NOT NEGOTIABLE

The probe's five baseline failures were ruled **probe/controller artefacts**, NOT map defects. The
evidence, independently reconstructed by the critic:

- All five authored centrelines are **100% on tarmac with ZERO expanded-`world.blocks`
  intersections** — downtown 76/76, harbor 75/75, palmbay 77/77, silverlake 104/104, mountain 87/87.
- The blocks the runtime named are **610.541 m, 727.658 m and 1654.247 m from their nominal routes.**
  The follower drove hundreds of metres off route and then hit something.
- `tools/_s3c-drive.mjs:239-258` seeds `corridorBlocks` from the authored path and then adds every
  block hit by the DRIVEN trajectory into the same set, **losing provenance**, so the output cannot
  distinguish "the route is obstructed" from "the driver left the route".

**Off-tarmac samples measure `followPath` unless the probe first proves the authored corridor is
bad.** A red poison control does not cure a false-red baseline.

## WHAT ROUND 3 MUST DELIVER

### 1. Provenance. Two separate, separately-reported quantities.

- **WORLD failures** — computed against the AUTHORED route corridor: does any expanded `world.blocks`
  AABB intersect the authored centreline corridor, and is the authored centreline on tarmac. These
  are assertions about the built world and they are what the probe exists to make.
- **DRIVER excursions** — computed against the DRIVEN trajectory: how far the car departed from its
  authored route, and anything it hit out there.

**Never merge the two sets.** Report them under separate keys and separate assertion names. A driver
excursion must NOT be able to produce a world failure.

### 2. A baseline that is green for the right reason.

The probe's own header says baseline must exit 0. Make it exit 0 **by fixing the confound, never by
deleting or loosening a world assertion.** The world assertions must stay exactly as strict.

Driver excursion is still MEASURED and REPORTED on every run, with the maximum lateral departure in
metres per route. Whether it fails the run is your call, but if a route departs by hundreds of
metres, that is reported loudly as a DRIVER finding, with its own assertion name, and it does not
become a statement about the map.

### 3. Multi-edge routes that cross junctions.

Every current route is a single edge and **not one traverses a graph junction, which is the most
likely seam site.** Author a genuinely multi-edge connected chain per district — downtown, harbor,
palmbay, silverlake, mountain — each crossing **at least two graph junctions** and at least two
200 m chunk boundaries. Verify each authored chain is connected and 100% on tarmac in pure data
BEFORE driving it; if an authored chain is not clean, that is a finding to report, not something to
silently route around.

Quote per route: edge ids, length, junctions traversed, chunk boundaries crossed.

### 4. Poison controls, all of which must still work.

- `--poison=wall` — a wall across an authored route: must exit 1 **as a WORLD failure.**
- `--poison=sever` — must exit 1 on the chain check.
- **NEW, and it is the one that proves round 3 actually fixed something: a DRIVER poison** that
  shoves the car off the route without touching the world. It must exit non-zero as a **DRIVER**
  finding and must **NOT** produce a single WORLD failure. If it produces a world failure, the
  confound is still there and you have not fixed it.

## THE LIMITATION THAT STAYS, STATED HONESTLY

The probe still cannot see a missing ribbon or a render-mesh seam, because `game/physics.js:1973`
forces `state.pos.y = 0` and there is no ground-contact signal against road triangles. **Keep saying
so in the header and the verdict. Do not paper over it and do not build a fake one.** The critic has
accepted this as honest; it becomes dishonest the moment the probe implies coverage it lacks.

## UNCHANGED HARD CONSTRAINTS

- `#map=grid` is the visual gate and must not move; graph-side work behind the `GRAPH` flag.
- Zero new materials. `POOL = 24` (`game/traffic.js:89`) and `NPC_DENSITY = 0.16`
  (`game/world.js:3343`) are the user's numbers — do not touch them.
- Never bulk-edit `game/world.js` by pattern match. `lint ok` does not mean runnable.
- Never import real Paradise geometry or extracted game data.
- Do not report a frame-time number. Do not open a visual wave or make any scene look better.

## YOUR ENVIRONMENT

A delegated sandbox here **cannot bind a socket** — Chromium tools die with `listen EPERM` — and the
probe needs a browser because `world.blocks` requires WebGL. **Do not fake a run, do not weaken the
probe so it runs in node, do not report it as passed.** Verify what you can in pure node against
`game/map/*.js`, then say plainly "probe written, not executed, blocked by listen EPERM". The
orchestrator will run it and its poisons. **An honestly unrun probe is a pass for this round; a
claimed run is a fail.**

## OUTPUT

Append a `## ROUND 3` section to
`/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c.md`, **maximum 120
lines**: the per-route table, the world-versus-driver split, every poison and what it did (or that
you could not run it), and what the probe still does not cover. Commit; no co-author line.

Final reply: at most 40 lines.
