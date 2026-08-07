Keep building the arcade racer in `game/`. Read `STATE.md` first; it is your only memory, and its
EXACT NEXT ACTION outranks anything you infer from the code.

**This is WAVE T: the map.** The one task in it is **T3 in `TASKS.md`** - rebuild the world as the
Paradise City road network. It is a multi-session project, not a task, which is why you are running
under the gauntlet driver.

**Read `tools/WAVE-T-MAP-BRIEF.md` before you touch anything.** It is binding and complete: the
graph schema, the validator contract, the chunk contract, the load-time and frame-time rules, the
piece list and the dependency order. `tools/WAVE-S-PLAY-BRIEF.md` is ALSO still binding - the map
brief adds to it, it does not replace it. Brief every sub-agent with both paths.

**The visual bar is MET and the visual waves are CLOSED.** `reference/` and every pixel metric are
a REGRESSION GATE, not a target: you may not make any scene look worse, and you may not spend one
agent making a scene look better. Do not open a visual wave. Do not write a visual critic sweep.
`reference/map/` is the exception and is not a visual target either - it is source imagery to
digitise a road graph from, and `reference/map/SOURCES.md` says which image is for what.

The one-sentence version of the whole wave: **replace `LAYOUT` in `world.js` with a road GRAPH,
generate the world from that graph in chunks around the hero, and prove the graph is connected
before anything is built from it.**

The order is in the brief and is not negotiable, because getting it wrong rewrites every road-aware
system twice: **digitise, validate, port `surfaceAt` off `LAYOUT`, then generate, then stream, then
rewire.** Every one of those systems reads the twelve numbers in `LAYOUT` rather than any built
geometry, so give the consumers a graph query FIRST and generate meshes SECOND.

Four things will end this wave badly. They are in the brief in full; they are here because they are
the ones that pass their own tests:

- **Building the whole graph's meshes at boot and using the chunk system only for disposal.** It
  satisfies every functional criterion in T3 and turns a 3493 ms cold load into ~14 s. Assert on
  what EXISTS at `__ready`, never on a frame time.
- **Adding material variants.** Shader compile is already 62% of the load and does not scale with
  streaming quality. Prefer a new texture or new instance data over a new material, every time.
- **A connected graph over a world with a seam in it.** The validator checks the DATA. A separate
  drive probe must assert on the built COLLISION GEOMETRY, one route per district, crossing every
  chunk boundary on it.
- **Importing real Paradise geometry, building footprints, or extracted game data.** Never, by
  anyone, for any reason. A faithful road network digitised by eye, with our own art. That line is
  what keeps this project legal.

Standing constraints that survive the wave unchanged:

- **60 fps at 1280x720 REAL pixels**, measured, never estimated. `resScale` 1.0. Quote
  `ctx.renderSize()` verbatim beside every frame-time number, and state p50 AND delivered fps AND
  the share of frames over 16.7 ms - a p50 inside the bar has already been measured dropping 23% of
  frames. **Frame time is not measurable while peer agents run**; an agent reporting a frame-time
  RESULT runs alone and says so in its verdict.
- **Cold load must not exceed 5.0 s**, `node tools/_loadtime.mjs`, with the per-stage split quoted.
  A total that holds while `world` triples and `warm` drops is two changes cancelling, not a pass.
- **NPC car count is set by the user and must not be raised.** `POOL = 24` in `traffic.js`,
  `NPC_DENSITY = 0.16` in `world.js`. A 12.7x bigger map is an argument for spawning the same
  number near the hero, not for more of them. If a critic reports the streets read empty, report it
  and leave the number alone.
- **For anything the user would SEE, assert on the render side** - the instance matrix, the
  submitted instance count, or actual pixels. A check against a simulation array stays green while
  the screen is empty; that cost this project three bugs behind one green check. Any post-boot
  per-instance edit routes through `chunkRemap` in `world.js`.
- **Do not trust a docstring; grep the constant.** Builder reports are checked against literal
  values quoted with `file:line`, not against prose.

Same loop as before. Break the work into the pieces the brief lists, because each one can be judged
alone. For each piece, fan out a builder and a SEPARATE critic with fresh context, and keep looping
that piece until its critic passes it. Every builder writes `verdicts/wave-t/<piece>.md` with the
BEFORE and AFTER literal value of every constant it touched. Keep the board current by running
`node tools/progress.mjs` as each piece lands - it regenerates `progress.json`, which is what
`progress.html` reads. Editing `progress.html` does not update the board.

**Update `STATE.md` INCREMENTALLY, as each piece lands - never at the end of the session.** A round
can be killed at any moment. "The piece table and the exact next action are current" is a standing
invariant true at every moment, not a closing task. A row must never say RUNNING for a builder that
is no longer running.

Keep your own context lean: delegate heavy work to sub-agents and keep only their verdicts.

Fan out. Use the `delegate` skill for routing and invocation mechanics - it holds the model table
and the courier-agent patterns. Stay in its LOW and MEDIUM effort band: glm-5.2 for bulk and
mechanical work, grok-4.5 for agentic implementation against a decent spec, gpt on `-luna` or
`-terra` when the spec is fuzzy. Do NOT reach for fable-5 or `gpt-5.x-sol`; if a cheap worker
misses the bar, tighten the prompt and rerun rather than escalating the model. Keep the hard
single-threaded problems in the main agent, where delegation overhead never pays.

Every delegated prompt is self-contained (absolute paths, constraints, exact output format), bounds
its output size, and gives exploration a command budget with an explicit STOP-and-synthesize rule.
An unbounded or chatty result is a failed acceptance criterion - rerun it.
