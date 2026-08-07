# BRIEF — CRITIC for `generate-mesh` S3c

You are the CRITIC for step S3c of the `generate-mesh` piece, wave T, in
`/Users/robray/fc/demos/burnout-gauntlet`. You did NOT build this. You have fresh context and that
is the point: **your job is to find what the builder's own checks would stay green through.**

You may FIX NOTHING. You measure, you judge, you write a verdict, you pass or you fail.

## 0. WHAT WAS BUILT

The builder's brief is `/Users/robray/fc/demos/burnout-gauntlet/tools/BRIEF-S3C.md` — read it, it is
the contract you are judging against. The builder's report is
`/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c.md`.

Also binding: `tools/WAVE-T-MAP-BRIEF.md` and `tools/WAVE-S-PLAY-BRIEF.md`, both under
`/Users/robray/fc/demos/burnout-gauntlet/`.

S3c re-points four LAYOUT-grid consumers onto the road graph under `#map=graph`: `surfaceAt`,
`paths.city` / `paths.highway`, `heroDist`, and `physics.js`'s `bounds`. It builds no new geometry.

## 1. THE RULE THAT GOVERNS THIS REVIEW

**DO NOT TRUST A DOCSTRING; GREP THE CONSTANT.** The builder's report is checked against LITERAL
VALUES quoted with `file:line` in the tree as it stands, not against its prose. Every BEFORE/AFTER
row in its table gets independently verified. A row that does not match the tree is a fail.

**The recurring failure mode in this repository is a metric that passes without the thing it claims
to measure.** This wave alone: a planar-area identity that was a tautology and held on a broken
rotation system; a boundary bit-identity check that compared an object against itself; a block index
verified at the one parameter value where its bug could not appear; a harness that passed with 53%
of its own deliverable deleted. Assume the same shape is present here until you have tried to break
it.

**RUN A POISON CONTROL ON EVERY CHECK YOU BELIEVE.** Deliberately break the thing the check claims to
catch and confirm the check goes red. A check that cannot be made to fail is not a check. Quote the
poison control and what it did.

## 2. WHAT TO ATTACK, IN PRIORITY ORDER

1. **The seven spawn points.** The builder asserts all seven scenes spawn on tarmac under
   `#map=graph`. Verify independently: re-derive each spawn yourself from `game/scenes.js` and the
   built `paths`, and test with a `surfaceAt` you got from somewhere other than the code path the
   builder asserted through. **"On tarmac" is not the same as "drivable"** — a spawn point can be
   legally tarmac and be inside a building AABB, on the wrong side of a kerb, or 40 m in the air.
   Check the spawn against `world.blocks` too.
2. **The drive probe. This is the check the whole wave turns on.** The map brief's third
   wave-ending failure is "a connected graph over a world with a SEAM in it": the validator checks
   the DATA and passes happily. The probe must assert on the BUILT COLLISION GEOMETRY, one route per
   district, crossing every chunk boundary on the route. Verify it actually does that — that it is
   not querying the graph, or `world.blocks`, or a simulation array, but is driving the physics over
   what was built. **Poison it: introduce a wall or sever a route and confirm the probe fails.** If
   the probe cannot be made to fail, it is not a probe and this step does not pass.
3. **`paths.city` closure and continuity.** The 52 `motorway` edges are TWENTY connected components
   (largest 12 edges / 1285 m). Verify the builder used one connected chain and that neither path
   teleports: walk consecutive samples and quote the LARGEST gap in metres for both paths. A
   Catmull-Rom through disconnected points is smooth and completely wrong, and a samples-on-tarmac
   count will not catch it.
4. **`#map=grid` pixel stability, all seven scenes.** This is the visual regression gate.
   **`wet-night-asphalt`'s same-tree noise floor is maxd 29 at 0.0056%, NOT maxd 4** — measured twice
   off one tree. Anything quoting the old figure reads its own noise as a regression.
   **NEVER ASK FOR AN MD5 MATCH ON A RENDER**: 21 renders off one unchanged tree gave 21 distinct
   md5s. Judge on the pixel metrics against each scene's own noise floor.
5. **`heroDist`.** The `if (GRAPH) return Infinity;` short-circuit at `game/world.js:3335` must be
   gone and the cull must be real. Verify on the RENDER SIDE: the submitted instance count / the
   instance matrices, not a simulation array. A cull that is computed and not applied leaves a green
   count and cars in the road. Confirm no parked car sits on `paths.city`.
6. **Zero new materials.** `git diff | grep -c 'new THREE\..*Material'` must be 0. Also check the
   compiled program count did not move for `#map=grid`.
7. **The NPC car count was not raised.** `POOL = 24` in `game/traffic.js`, `NPC_DENSITY = 0.16` in
   `game/world.js`. Grep both.
8. **`bounds`.** `game/physics.js:696`. Confirm the graph gets the graph extent AND the grid still
   gets 1400, and that the extent is published from one place rather than hardcoded twice.
9. **Boot both modes and read the console.** `lint ok` does not mean runnable — that cost this
   project a full revert of `world.js` in S3a. If a page seems to hang, run
   `node tools/_hangprobe.mjs`: a hang at boot here is almost always an unwrapped throw in the
   pre-`__ready` tick loop at `game/main.js:896`, which yields a live page with an empty console.
10. **The eager-build rule.** S3c should not have made the boot build more of the world. If the
    `paths` derivation or anything else now walks the whole graph at boot, that is acceptable as
    DATA but must be declared with its cost. Assert on what EXISTS at `__ready`, never on a frame
    time.

## 3. WHAT IS ALREADY KNOWN AND IS NOT A FINDING

Do not spend a round rediscovering these. They are measured, recorded and deliberate:

- **31 frontage strips up to 432 m long are single AABBs**, so each is an unbroken 432 m collision
  face. Short side min 20 / median 32 / max 64 m; 30 of the 31 sit on a ring face. Deferred on
  purpose. If the drive probe dislikes them, the fix belongs in `game/map/blocks.js`, not in S3c.
  Report it as an input, not as an S3c defect.
- **`renderer.info.programs` under `#map=graph` is 180 against 131 for grid, and that is NOT new
  materials.** 39 of the 79 are a second point-light-count variant of already-compiled materials.
  Flagged for `perf`.
- **Cold load is over the bar today (12.6 s median on the grid default against 5.0 s)** and predates
  S3c. It belongs to the `perf` piece, which runs ALONE on the machine.
- **`daytime-downtown` is worse since S2** and is deliberately not fixed until S3d, when the graph
  city replaces that content wholesale. Do not ask for a salt re-roll.
- The pavement is a **7.8 m band, not a filled plot**, and 7% of the ring length has no pavement.
  Known, open, S3a's.
- Node and headless chromium classify exactly ONE of 29,635 pavement stations differently. Within one
  runtime the result is bit-exact. Do not read a node-vs-browser dump difference as a bug.

## 4. THINGS YOU MAY NOT DO

- Do not fix anything. Report.
- Do not report a frame-time number. Peer agents may be running and frame time is not measurable
  while they are.
- Do not open a visual wave, do not write a visual critic sweep, and do not ask for any scene to look
  BETTER. `reference/` is a regression gate, not a target.
- Do not raise the NPC car count or suggest raising it. If the streets read empty, report it and
  leave the number alone.

## 5. OUTPUT

Write `/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c-critic.md`.

**Maximum 350 lines.** An unbounded or chatty verdict is a failed acceptance criterion.

Structure:

1. **PASS or FAIL, in the first line.** Fail if any hard constraint is broken, if the drive probe
   cannot be made to fail under a poison control, or if any BEFORE/AFTER row does not match the tree.
2. **The builder's constant table, re-verified**, with your own `file:line` and literal for each row,
   and any row that did not match called out.
3. **Each check from §2 with the number you measured yourself**, plus the poison control you ran and
   what it did.
4. **Findings, each marked BLOCKING or NON-BLOCKING**, each with the evidence.
5. **What you could not check and why.** An honest gap is worth more than a green claim.

Your final reply to the orchestrator is at most 40 lines: the verdict, the blocking findings, and
the numbers that decided it.
