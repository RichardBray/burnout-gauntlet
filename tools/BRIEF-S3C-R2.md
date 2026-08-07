# BRIEF — `generate-mesh` S3c ROUND 2

Round 1 was FAILED by its critic: `/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c-critic.md`.
Read that verdict and `/Users/robray/fc/demos/burnout-gauntlet/tools/BRIEF-S3C.md` (the original
contract) first. Everything in BRIEF-S3C.md still binds. So do
`tools/WAVE-T-MAP-BRIEF.md` and `tools/WAVE-S-PLAY-BRIEF.md`.

**The round-1 build is HONEST — the critic re-verified its constant table 16/16 with poison controls.
Do not rewrite what landed. Fix exactly the two blocking findings.**

## FINDING 2 (do this first, it is bounded): `paths.city` uses forbidden road classes

Decision 7 says `paths.city` comes from a closed circuit of **`arterial` / `street`** edges. The
delivered circuit carries **164.707 m on `service` edges 323 and 369** (7 segments / 161.305 m of the
underlying face boundary). `crash-cam` spawns on service edge 323.

Re-derive `paths.city` so **no `service` edge is used**. It must stay:

- genuinely CLOSED (`makePath(points, true)`), endpoint closure was 0.000 m and must stay ~0;
- continuous — largest consecutive sample gap was 4.069 m and must stay in that order. A Catmull-Rom
  through disconnected points is smooth and completely wrong;
- 900/900 samples on tarmac.

Round 1's circuit touched only Palm Bay (857.278 m) and Downtown (1132.171 m). Broader district
coverage is DESIRABLE but is NOT worth breaking closure or class purity for. If you cannot get a
closed arterial/street circuit through more districts, say so with the numbers and ship the pure one.

Quote: the edge ids used, their classes, total length, largest sample gap, endpoint closure,
samples-on-tarmac, and the per-district boundary length.

Re-check the seven spawn points afterwards — `crash-cam` moves when this path changes. All seven must
be on tarmac AND outside every `world.blocks` AABB expanded by the 1.0 m hero radius used at
`game/physics.js:923`. Round 1's margins are in the critic verdict §1; quote yours the same way.

## FINDING 1: the drive probe

**READ THIS DESIGN DECISION BEFORE YOU WRITE ANY CODE. IT IS MADE. DO NOT RE-OPEN IT.**

The critic established, correctly, that **the physics cannot observe road-mesh contact at all**:
`game/physics.js:1973` forces `state.pos.y = 0`, `airborne` is dead state at `:718`, and the surface
at `:1791-1793` comes from `surfaceAt`, i.e. graph DATA. Physics collides with `world.blocks`, other
cars and the scalar bounds — **never with ribbon or junction triangles**. So a "never loses ground
contact" assertion would stay green with the road geometry deleted.

Therefore: **a ribbon-mesh ground-contact probe is NOT buildable in this step and you must not fake
one.** Adding a raycast/BVH ground-contact system is a piece of its own with a frame-time cost and it
is not S3c's.

**What you WILL build is a probe that asserts on the collision geometry that actually exists**, which
is `world.blocks` — and that is not a consolation prize: `world.blocks` is a BUILT artifact produced
by `createBlocks` from the graph faces, and it is the thing that can strand a car today. The known
hazard is real and already measured: **31 frontage strips up to 432 m long are single AABBs**, each
an unbroken 432 m collision face.

The probe, in `tools/_s3c-drive.mjs` (do NOT extend `tools/_s3c-check.mjs`, which the critic
correctly rejected — it picks starts from `world.blocks` rather than graph routes, drives arbitrary
+X headings, teleports `pos.z` by up to 6 m, and has no failing assertion or non-zero exit):

1. **Author ONE ROUTE PER DISTRICT** — downtown, harbor, palmbay, silverlake, mountain — as a
   connected chain of graph edges. Routes are authored from the GRAPH, not from `world.blocks`.
2. Drive the REAL physics along each route with `followPath`, at the real substep.
3. **Enumerate every 200 m chunk boundary the route crosses** and confirm the car crossed it.
4. **ASSERT, with a non-zero exit on failure:** the car reaches the route end; it is never stopped or
   stuck (speed does not collapse and stay collapsed); it never leaves bounds; `surfaceAt` stays
   `tarmac` along the driven line; and no `world.blocks` AABB intersects the driven corridor.
   **No teleporting the car back onto the road. Ever.** If it leaves the road, that is the finding.
5. **POISON CONTROL, MANDATORY:** inject a synthetic block AABB across one route and confirm the
   probe goes RED and exits non-zero. A check that cannot be made to fail is not a check, and the
   critic will fail you again on exactly this. Also poison by severing a route.
6. **State the limitation in the probe's own header comment and in your verdict, in these terms:**
   this probe asserts on `world.blocks` collision and `surfaceAt` continuity along authored graph
   routes; it does NOT assert ribbon/junction mesh contact, because the physics has no such signal
   (`physics.js:1973` forces `pos.y = 0`); that gap is real, is named, and belongs to a later piece.
   **Do not claim the probe covers what it does not.** An honest limitation is worth more than a
   green claim; every step of this wave that hid one cost a round.

## A CONSTRAINT ON YOUR ENVIRONMENT — READ IT

The round-1 critic **could not run a browser at all**: `tools/shot.mjs` and `tools/_s3c-check.mjs`
both fail before Chromium launch with `listen EPERM` on `0.0.0.0` and `127.0.0.1` in a delegated
sandbox. **You may hit the same wall.** `world.blocks` needs `createWorld`, which needs WebGL, so the
drive probe needs a browser.

If you hit `listen EPERM`: **do not fake the run, do not weaken the probe so it runs in node, and do
not report it as passed.** Write the probe correctly, verify what you can in pure node against the
map modules (`game/map/*.js` are pure data and DO run in node — the critic used them), and say
plainly in your verdict: "probe written, not executed, blocked by listen EPERM". The orchestrator can
bind a socket and will run it. A probe you wrote and honestly did not run is a pass for this round;
a probe you claimed to run is a fail.

## UNCHANGED HARD CONSTRAINTS

- `#map=grid` is the visual regression gate and must not move. Everything behind the `GRAPH` flag at
  `game/world.js:1073`.
- Zero new materials. Round 1 added 0; keep it 0.
- `POOL = 24` (`game/traffic.js:89`) and `NPC_DENSITY = 0.16` (`game/world.js:3311`) are the user's
  numbers. Do not touch them. If the streets read empty, report it and leave the number alone.
- Never bulk-edit `game/world.js` by pattern match. Anchor on unique comments.
- `lint ok` does not mean runnable. If a page seems to hang, run `node tools/_hangprobe.mjs` first —
  a hang here is almost always an unwrapped throw in the pre-`__ready` tick loop at
  `game/main.js:896`, which leaves a live page with an empty console.
- Do not import real Paradise geometry or extracted game data, for any reason.
- Do not report a frame-time number. Do not open a visual wave or try to make any scene look better.
- Assert on the render side for anything the user would SEE. Post-boot per-instance edits route
  through `chunkRemap`, recording the `[descriptor, index]` that `push()` returned — NOT the pool
  handle. That bug class has appeared four times in this project.

## OUTPUT

Append to `/Users/robray/fc/demos/burnout-gauntlet/verdicts/wave-t/generate-mesh-s3c.md` a
`## ROUND 2` section, **maximum 150 lines**, with the BEFORE/AFTER literal and `file:line` of every
constant you touched, the numbers above, the poison controls you ran and what they did, and an honest
statement of what the probe does not cover. Then commit; do not add yourself as co-author.

Your final reply: at most 50 lines.
