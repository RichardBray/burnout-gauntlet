# TASKS - user feature backlog (2026-08-06)

Seventeen features requested by the user, captured before implementation.
Each task is self-contained enough for a fresh model to pick up cold.

Read `STATE.md` and `tools/WAVE-S-PLAY-BRIEF.md` before starting any of these.
The standing rules there still bind: 60 fps at 1280x720 REAL pixels, visual regression gate,
NPC car count is user-set (`POOL = 24` in `traffic.js`, `NPC_DENSITY = 0.16` in `world.js`) and
must not be raised.

---

## STATUS as of 2026-08-06. READ THIS BEFORE PICKING A TASK.

| task | status | landed in |
|---|---|---|
| **T1** struck parked/stopped cars | **DONE** for parked; the STOPPED-TRAFFIC half is UNVERIFIED | `80477c4`, `b3c69d4`, `3a417d3` |
| **T9** dev tuning menu | **DONE**, and TEMPORARY - still awaiting the user's figures | `f095b88` |
| **T12** drift counter in metres | **DONE** | `45e7e6c` |
| **T14** menu cleanup, Enter starts | **DONE** | `c5770d7` |
| **T16** near misses in the boost feed | **DONE**, economy number outstanding | `77339f3` |
| **T17** remove the C key | **DONE** | `80477c4`, `7330f1a` |
| T2-T8, T10, T11, T13, T15 | not started | - |

Full write-ups with measured numbers are in `verdicts/wave-s/`. Do not re-derive what is there.

### Open decisions the user owns

- **T9's closing step.** The dev menu is deleted once the user reports final handling figures.
  Until then `game/devtune.js` stays and is not to be tidied away.
- **T16's boost economy.** An empty bar filled in 56.2 s before T16 and 13.9 s after, which is
  too generous. Halving `NPC_DENSITY` has since taken it to 21.3 s. `boostPerNearMiss` is
  deliberately UNCHANGED at 0.060 - retuning is the user's call, not an agent's.
- **T1's stopped-traffic half.** `traffic.js`'s `wasStopped` fix (commit `7028fff`) is correct on
  inspection and was never demonstrated. No probe in the tree exercises it. Treat as open.

### CARRIED-FORWARD WARNING: what T1 cost, and why

T1 was reported fixed twice and was still broken both times, because every probe asserted on the
SIMULATION and none on the PICTURE. The car moved in `traffic.vehicles` while the player saw
nothing at all. Three separate bugs were hiding behind that one green check:

1. `hide()` wrote to a source instance pool that the chunk cut had already zeroed, so it edited a
   mesh that no longer draws;
2. promotion claimed a pool slot with `k >= POOL`, which is live, collidable and simulated but
   never rendered;
3. wrecks slid through building facades and came to rest inside blocks.

**For anything the user reports SEEING, assert on the render side** - the instance matrix, the
submitted instance count, or actual pixels. A `traffic.vehicles` check stays green under bugs 1
and 2. See `tools/HANDOFF-PARKED-CARS.md` and `tools/_phantom-probe.mjs`.

**Any post-boot per-instance edit must route through `chunkRemap` in `world.js`**, or it silently
edits a pool that is not on screen.

## Execution mode key

| mode | meaning |
|---|---|
| **solo** | one model, one session, no fan-out needed |
| **subagents** | one session, but fan out builders/critics across sub-systems |
| **gauntlet** | too large for a session; run under `run-gauntlet.sh` with its own STATE block |

## Ordering

The user chose **map first**.
T3 (Paradise City map) rewrites the road layout, so everything that places objects on the road
must wait for it: T5 barriers, T6 time attacks, T8 ramps and billboards.

Everything else is ordered into waves below.
**Do not run all of it in parallel.** These tasks collide on files: T11/T12/T13/T16 are all
`hud.js`, T9/T14/T15 are all the input path and `menu.js`, and T1 shares `traffic.js` with T16.
Parallel agents editing one file is how a tree ends up half written.

Each wave is grouped by FILE OWNERSHIP, so agents inside a wave never touch the same file.

**Waves are gated on code LANDING, not on the user replying.**
Only two items in this whole list wait on a human: applying the tuned steering figures, and T2's
approval gate. Everything else runs as soon as the tree it needs is committed.

### Wave 0 - alone, first  **[COMPLETE]**

**T9, the dev tuning menu.**

It goes first because it unblocks the user, not because anything depends on its output.
The sooner the sliders exist, the sooner the tuning session can run **in parallel with wave 1**.
It is also small, so the cost of clearing it is low.

Wave 1 starts the moment T9 is committed. It does NOT wait for the tuning figures.

### Wave 1 - three agents in the background, while the user tunes  **[COMPLETE]**

| agent | tasks | owns |
|---|---|---|
| A | T1, T17 | `traffic.js`, `physics.js` collision path, the `KeyC` handler |
| B | T16, T12 | `hud.js` earn feed, `physics.js` earn path |
| C | T14 | `menu.js`, `main.js` menu wiring |

These are the defects the user hits while driving: parked cars that do not move, near misses that
never appear, a menu knob that should not exist. Fixing what is broken comes before adding to it.

None of them read the handling values in `TUNE`, so none of them care what the tuning session
concludes. They are independent of it in both directions.

**A and B both touch `physics.js`.** A works in the collision resolver (`hitCarBody`), B in the
earn/feed block. Different regions, but they must not run against a stale tree - whichever lands
second rebases and re-runs `bash tools/lint.sh`.

**The user will be DRIVING the build while these three rewrite it.** Reloading mid-edit picks up a
half-applied file. Either each agent commits atomically and the user only reloads between commits,
or the tuning session runs in a `git worktree` pinned to the T9 commit. The worktree is cleaner.

**HOW IT ACTUALLY RAN (2026-08-06).** The worktree was used and has since been removed. Two
lessons for the next wave:

- **The worktree was a trap here.** Pinned to the T9 commit, it did not contain any wave-1 fix, so
  the user tested T1 against a tree that never had it and reported it broken. If a worktree is
  used again, say explicitly which URL serves which commit.
- **The ownership table above is wrong about T16.** T16's fix lives in `traffic.js`, which the
  table gives to agent A. B and A would have collided. T16 was resequenced to run after T1 landed.

### Wave 2 - two items gated on the user's figures, the rest on wave 1

Gated on the tuning figures arriving:

- **Apply the tuned steering values** to `physics.js` `TUNE` and `camera.js`, then delete
  `game/devtune.js` and its import (T9's closing step).
- **T4**, off-road penalty. Lands in `physics.js` alongside A and B, and off-road grip cannot be
  judged until the on-road steering is settled.

Gated only on wave 1 landing:

- **T11 then T13**, one owner, in that order. T11 builds the banner primitive T13 reuses.
  Waits for B, which is in the same file.
- **T7**, soundtrack. No conflicts with anything. Can run any time from now, including during
  wave 1 if there is a spare agent.

### Wave 3 - polish

- **T15**, gamepad. After T14, since it hooks the same capture-phase key handling.
- **T10**, lighting sharpness. No file conflict, but it contends for the perf harness and wants
  the frame budget to be stable first.
- **T2**, geometry cleanup. Has a user approval gate in the middle, so it will stall waiting on a
  reply. Start it when there is slack, not when it blocks something.

### Wave 4 - the map, then what sits on it

- **T3**, gauntlet, long-running.
- Then **T5**, **T6**, **T8**, which all place objects on the road layout.

Before starting T3: `PROMPT.md` still drives the wave-S playability loop and will need rewriting
for the map work, and `STATE.md` needs a fresh wave block. The gauntlet reads both every round.

---

## T1 - Struck parked and stopped cars must actually move

> **DONE for parked cars** (`80477c4`, `b3c69d4`, `3a417d3`). The STOPPED-LIVE-TRAFFIC half is
> UNVERIFIED - see the status block at the top. The four "prime suspects" below are preserved as
> written, but three were REFUTED by the repro and the real causes were elsewhere; read
> `verdicts/wave-s/t1-t17-parked-cars.md` and `tools/HANDOFF-PARKED-CARS.md` before touching this.

**Mode: solo.**
**Depends on: nothing.**

### What the user reported

Crashing into a parked or stopped NPC car leaves it perfectly still.
It should rebound, slide or spin according to the hero's speed, mass and impact angle, then come
to rest and stay inert (the user picked "shove, spin, settle", not "drive away", not "full chain
reaction between parked cars").

### What already exists

A promotion path was built in commits `fe15782` and `5d4a85b` and it is NOT working from the
user's seat.
Do not rebuild it blind.
Reproduce first, then find why it does not fire.

- `physics.js:771` `hitCarBody()` resolves the contact and stamps
  `o.heroHit = { rel, sev, kx, kz }` on the struck body.
- `physics.js:788` the `entry` flag makes a different body a new contact even inside `wallCool`,
  so a rank of parked cars each get their own stamp.
- `traffic.js:880` "promote hit parked cars" hides the baked instance via `b.hide()`, claims a
  pool slot, and boots it as a WRECKED live car with `wvx/wvz/wspin` from the hit.
- `traffic.js:944` the `v.wrecked` branch integrates that free 2-D body with `WRECK_FRICTION` and
  `WRECK_SPIN_DECAY`.
- `main.js:228` `physics.setParkedBodies(world.parkedCars)` and `main.js:243`
  `traffic.setStaticBodies(world.parkedCars)` are the wiring.

### Prime suspects, in order

1. **`hit.rel < 4` gate at `traffic.js:889`.** Any impact under 4 m/s relative is silently
   dropped and the car reads as bolted down. A slow nudge is exactly the case the user is
   describing.
2. **Population coverage.** `world.parkedCars` is the only list handed to both systems. The
   kerbside STOPPED QUEUES and signal queues that `world.js` bakes (see the `NPC_DENSITY` scaling
   and the 7.4 m stopped-queue offset referenced at `traffic.js:184-191`) may be a different
   array that never reaches `setParkedBodies`/`setStaticBodies`. If so those cars have no
   `heroHit` path at all. Confirm by dumping both counts at boot.
3. **Pool slot starvation.** With `POOL = 22` the steal-the-farthest fallback can fail
   (`if (!slot) continue`), dropping the stamp. Verify a slot is actually granted under normal
   play, and consider a small dedicated wreck reserve outside the 22 rather than raising `POOL`
   (the count is user-set and must not go up).
4. **`b.hide` missing.** `if (b.gone || !b.hide ...) continue` skips any baked body that was not
   given a `hide()` closure by `world.js`.

### Acceptance criteria

- Repro E2E in a browser at the user's normal driving speed, not just in a harness.
- A parked car hit at 10 m/s visibly translates and rotates, then settles within about 2 s.
- A parked car hit at 3 m/s still nudges perceptibly. Pick a new low threshold and justify it.
- Impulse direction follows the impact angle: a corner clip spins the car, a square rear-end
  shoves it forward, a side swipe pushes it sideways.
- Struck cars stay inert once settled. They do not rejoin traffic.
- Struck cars remain solid obstacles afterwards (they are already in `vehicles`, keep that true).
- No frame-time regression. Measure p50/p99 at 1280x720, pixel ratio capped, before and after.
- Works for every stationary population in the world, not just `world.parkedCars`.

---

## T2 - Remove geometry that does not belong

**Mode: solo, with one fresh-context critic subagent for the before/after judgement.**
**Depends on: nothing.**

### What the user reported

Looking at screenshots, especially the skyline and the street lamps, there is geometry that does
not line up with the lamps, the skyline, or the realism of the scene.
It should be removed.

### Approach the user chose

The agent captures its own evidence.
**The list of geometry to delete must be shown to the user for approval before anything is
deleted.**

1. Render every scene in `game/scenes.js` with `node tools/shot.mjs --scene <id> --out shots/...`.
2. Compare against the matching `reference/` stills, using `reference/INDEX.md`'s "what makes it
   look real" column.
3. Produce an itemised list: file, symbol/line, what the geometry is, why it does not belong,
   and a cropped screenshot showing it.
4. Get user approval on the list.
5. Delete, re-render, and confirm no scene got worse.

Focus areas named by the user: the skyline (`sky.js`) and the street lamps (`world.js` poles,
`polefall.js`).

### Acceptance criteria

- Approval list delivered before any deletion.
- Every scene re-rendered after the cut; the visual regression gate holds (no scene worse).
- Frame time same or better. Report the delta - removed geometry should be a small win.
- `bash tools/lint.sh` clean, game boots, no missing-reference errors from `polefall.js` if a
  pole set shrinks.

---

## T3 - Rebuild the world as the Paradise City map

**Mode: gauntlet. This is a multi-session project, not a task.**
**Depends on: nothing, but blocks T5, T6, T8.**

### Feasibility - the answer the user asked for

**Yes, this is feasible in a browser, with one hard qualification: it must be a faithful ROAD
NETWORK with our own art, not a 1:1 asset-level copy.**
That is the option the user chose.

Why it works:

- Paradise City is roughly 4x4 km of road network. That is geometry, not assets. A road graph of
  a few thousand segments is tens of kilobytes of JSON, generated into meshes at load.
- The current world already generates everything procedurally from `road.js`'s `createRoadKit()`
  and `world.js`'s `createWorld()`. Nothing is downloaded per building today. Scaling the graph
  up does not scale the download.
- The real cost is draw calls and triangles in view, and that is solved by chunking plus
  distance culling, which the map has to grow anyway. Only the 4-8 chunks near the hero are
  resident and instanced; the rest are unbuilt or a coarse LOD silhouette.
- `physics.js` already takes `bounds = 1400` and a `blocks` list, so the collision side is a
  data-scale change rather than a rewrite.

What would NOT work and must not be attempted: importing real Paradise geometry, real building
footprints, or extracted game data.
That path is both a browser-performance dead end and a rights problem.

### Scope

1. **Source the map.** The user is not supplying one. Use Firecrawl to find the highest
   resolution official Paradise City map available, save it under `reference/map/`, record the
   source URL.
2. **Digitise it into a road graph.** Nodes (junctions), edges (road segments with width, lane
   count, one-way flag, elevation class), districts, and the named landmarks that give the map
   its shape (the island, the airfield/quarry area, the downtown grid, the mountain roads).
   Store as a single JSON under `game/map/`. This is the durable artefact; everything else is
   generated from it.
3. **Generate the world from the graph.** Roads, junctions, kerbs, pavements, buildings, props,
   all procedural, all our own art. Keep the current material and lighting vocabulary so the
   regression gate still passes.
4. **Chunked streaming.** Build and dispose chunks around the hero. Coarse LOD or impostors for
   the far city so the skyline still reads.
5. **Rewire the dependent systems.** `traffic.js` lane lines, `world.js` parked ranks and
   signals, `physics.js` blocks and bounds, minimap in `hud.js`, spawn points in `scenes.js`.
6. **Free roam.** No invisible walls inside the map (see T5 for the perimeter).

### Acceptance criteria

- 60 fps sustained at 1280x720 real pixels while driving across district boundaries, p99 stated.
- No hitch above 30 ms at a chunk boundary. Streaming work must be amortised or off-thread.
- The road graph is recognisably Paradise City when the minimap is compared to the source map.
- Memory stable over a 10-minute drive across the whole map. No chunk leak.
- Traffic, parked cars, signals and the boost event stream all work anywhere on the map.
- Visual regression gate holds for every scene in `scenes.js` (respawn them onto the new map).

### Gauntlet setup

Open a new wave block in `STATE.md`.
Write a `tools/WAVE-T-MAP-BRIEF.md` carrying the graph schema, the chunk contract, and the
measurement rules, and brief every agent with that path.
Pieces that can be judged alone: map sourcing/digitising, graph-to-mesh generation, chunk
streaming, traffic rewiring, LOD skyline, perf.

---

## T4 - Off-road speed penalty

**Mode: solo.**
**Depends on: nothing. Re-verify after T3.**

### What the user wants

Driving off tarmac onto grass, sand or soil costs 10-15% of effective speed, to push the player
back onto the road.
The user chose the deeper version: per-surface grip and drag, not one flat number.

### Scope

- A surface query: given a world position, return the surface class (tarmac, grass, dirt, sand).
  `road.js`/`world.js` know where the roads are; the cheapest correct source is whatever the
  road generator already uses for its own extents, not a raycast per frame.
- Per-surface `grip` and `dragMul` in `physics.js` `TUNE`, applied so effective top speed lands
  10-15% below tarmac. Grass, dirt and sand each get their own values.
- Boost still works off-road but gains less.
- Dust/grass particle spray from the wheels, and a surface-appropriate tyre sound
  (`audio.js` already owns the SFX bus).
- The penalty must be felt, not just measured: it should read as loss of grip, not as an
  invisible speed cap.

### Acceptance criteria

- Measured top speed on each surface, stated, all within the 10-15% band below tarmac.
- Transition on and off tarmac is smooth, no snap in speed or grip at the boundary.
- No false positives: driving on a kerb, a junction, or a painted area is still tarmac.
- No frame-time regression from the surface query. State the per-frame cost.

---

## T5 - Real barriers at every world edge, no invisible walls

**Mode: solo.**
**Depends on: T3.**

### What the user wants

The player must never hit an invisible wall.
Every place the player cannot go gets visible physical geometry.

The user chose: **Armco (W-beam metal crash barrier) on posts** for road edges and cliffs,
**concrete Jersey barriers** at construction and urban edges, and **chain-link fence** where a
view-through reads better.
Research real Armco and Jersey barrier profiles and proportions with Firecrawl before modelling.

### Scope

- Replace the current hard clamp in `physics.js:898-905` (`bounds = 1400`, position clamped) with
  real collision against barrier geometry.
- Instanced barrier meshes so a perimeter of thousands of segments stays cheap.
- Correct collision response: a glancing hit scrapes and sparks (`noteGrind()` already exists),
  a square hit rebounds. Reuse the existing wall path in `physics.js`, do not invent a new one.
- Audit the whole map for anywhere the player is currently stopped without geometry, including
  building faces, water edges and unbuilt chunks.

### Acceptance criteria

- Drive the full perimeter and every dead end. Zero invisible walls found.
- Barriers are visually correct: W-beam profile, posts at a plausible spacing, right height.
- Hitting a barrier at 70 m/s does not eject the car through it or launch it into the sky.
- Instanced draw cost stated; no frame-time regression.

---

## T6 - Time attack events

**Mode: subagents. Several independent sub-systems.**
**Depends on: T3.**

### What the user wants

Marked locations on the map, Paradise-style.
The hero sits inside the marker circle for 3 seconds and a time attack starts.
Arrows on the track show the route, exactly like Paradise's directional arrows - research
these with Firecrawl before building.
Gold, silver and bronze target times. Beating one awards that medal.

**No AI opponents anywhere in this.**
The user's plan is that multiplayer racing comes later; offline is practice against the clock.
Do not add drivable NPC racers.

The user chose the full loop with saved results.

### Race lifecycle

1. Marker sits on the map with a visible circle and a HUD/world label.
2. Hero inside the circle for 3 s (show a countdown ring) arms the event.
3. Start: **the builder decides between an immediate start and a short fade to black.**
   Recommendation is a fast fade with the target times shown, because it also covers the moment
   the route arrows are placed.
4. During the race the player is on-route: arrows mark the path, and leaving it prompts a return.
   Free roam is suspended.
5. End conditions: finish line reached, or the player opens the pause menu and quits the event
   manually. Either way the world returns to free roam.
6. Results screen: time, medal earned, previous best, target times.

### Persistence and progression

- Best time and best medal per event, in `localStorage`.
- The marker shows the earned medal afterwards.
- No currency or unlock system. The user explicitly scoped that out for now.

### Sub-systems to fan out

| piece | owner |
|---|---|
| event definitions and marker placement on the map graph | one builder |
| trigger, dwell countdown, race state machine, quit path | one builder |
| route arrows: placement along the route, look, animation | one builder |
| results UI, medals, `localStorage` schema | one builder |
| a critic that plays every event and checks the times are achievable | separate, fresh context |

### Acceptance criteria

- At least 6 events spread across the map.
- Gold/silver/bronze times are actually achievable and correctly spaced. The critic must set
  each gold time by driving it, not by estimating.
- Arrows are readable at 70 m/s, well before the turn.
- Quitting mid-race from the pause menu returns cleanly to free roam with no residual state.
- Best times survive a reload.
- No frame-time regression while a race is running.

---

## T7 - Soundtrack: more genres, single-track player UI

**Mode: solo.**
**Depends on: nothing.**

### What the user wants

Two things.

**More music.** Today it is three rock tracks (`game/music/cc0-metal-energetic.ogg`,
`cc0-punk-flesh-and-blood.mp3`, `cc0-punk-rock-metal.mp3`). Add pop and electronic.
The user chose: **the agent sources CC0 / royalty-free tracks itself.**
Download into `game/music/`, record title, artist, licence and source URL in
`game/music/README.md`.
Verify the licence permits use. Do not ship anything ambiguous.

**A proper player UI.** The pause menu currently lists every track as a row of chips
(`menu.js:583`, the `trackBtns` segment).
Replace that with a single now-playing display plus previous / play-pause / next buttons.
`bPrev`, `bNext` and `bPlay` already exist at `menu.js:593-595`; the track chip list is what goes.

### Scope

- Source and add pop and electronic tracks. Aim for a few of each so a genre is not one song.
- Rework the soundtrack block in `menu.js`: now-playing title and artist, prev/play-pause/next.
  Drop the track chip list.
- Keep the existing separation: music runs through its own gain straight to destination and never
  through the master/limiter/reverb chain (`music.js` header explains why).
- Keep music persisting across scene changes and respecting the click-to-unlock gesture.
- Music and SFX volume sliders stay as they are.

### Acceptance criteria

- Pause menu shows exactly one track at a time with working prev/next/play-pause.
- Playlist wraps in both directions.
- Every new track has a verified licence recorded in `game/music/README.md`.
- Volumes are consistent across tracks. Normalise if a downloaded track is markedly louder.
- Music does not restart on scene change, and is not ducked or coloured by the SFX chain.

---

## T8 - Ramps and destructible billboards

**Mode: subagents. Asset generation, geometry and physics are separable.**
**Depends on: T3.**

### What the user wants

Ramps in the world, Paradise-style: lorry/truck trailer ramps and general jump ramps that launch
the car somewhere new.
Some ramps line up with **smashable billboards**, as in Paradise's billboard smashes.

Textures are to be generated with GPT-image-2 via the OpenAI API key already in the user's shell
(`OPENAI_API_KEY`).
The user chose **fictional in-world brands**: invented energy drink, tyre brand, radio station and
similar, matched to the game's palette, no real trademarks.

Research Paradise's ramp and billboard placement and behaviour with Firecrawl first.

### Scope

- Ramp geometry with correct collision: the car drives up and is launched, it does not clip or
  get stuck at the lip. Two families: parked-lorry ramps and built ramps.
- Placement on the map graph, positioned so each ramp has a landing that makes sense.
- Destructible billboards: a board that shatters on contact, with debris, a sound, and a HUD
  event. Reuse the existing crash/debris vocabulary in `crash.js` rather than a new system.
- Billboard smash count persisted in `localStorage`, like Paradise's collectibles.
- Generated textures written to disk as static assets. No API calls at runtime.

### Air-time audio

**No new library is needed.** `game/audio.js` already has every node this requires: a synthesised
convolution impulse response built offline (`audio.js:143`, a Schroeder/FDN reverberator), a
`ConvolverNode` with per-bus wet sends and named presets (`audio.js:2079`), biquad filters, a
WaveShaper and stereo panners.

The effect that sells a jump is mostly the ABSENCE of ground contact, not the reverb:

- Cut the tyre/road bus the instant the wheels leave the ground. That drop alone reads as
  airborne, and it is the single most important part.
- Lowpass the engine and duck it slightly for the air phase, then snap the filter open on
  landing. Muffled-then-punch is the whole trick.
- Ramp wind noise with vertical velocity.
- Raise the reverb send for the air phase using an existing open/space preset, so the engine sits
  in a bigger room while nothing is near it. Return it on touchdown.
- Landing: a one-shot impact plus a short suspension compress, both already in the SFX vocabulary.

The transitions must be ramped, not stepped, or every jump clicks.
Route all of it through the SFX bus so the music stays untouched (`audio.js:1443`).

Acceptance: a jump is identifiable with the screen covered. No clicks or zipper noise at takeoff
or landing. Music level unaffected throughout.

### Acceptance criteria

- A ramp taken at speed produces a clean launch, an airborne phase and a survivable landing.
  No clipping through the ramp, no sticking at the lip.
- Billboards smash convincingly and only once. Smashed state persists across a reload.
- At least a handful of ramp-to-billboard pairings that are hittable, and findable without help.
- Textures are original and brand-safe. Record the prompts used.
- No frame-time regression from the added geometry. Billboards must be instanced or culled.

---

## T9 - Dev tuning menu for steering and drift (temporary)

> **DONE** (`f095b88`), and TEMPORARY. Still awaiting the user's figures, so do not delete it yet.
> CORRECTION: `gripLow` and the `1/(1 + (sn-gripLow)*1.35)` yaw decay factor named below DO NOT
> EXIST. The yaw curve was rewritten to `min(rGrip, rGeo)`; the panel exposes `minRadius`,
> `gripUse` and `downforce` instead. Live camera values are `FRAME.slipAim` 0.32 and
> `steerLead` 0.146, not the 0.30/0.26 written below.

**Mode: solo. Small.**
**Depends on: nothing. Do this first.**

### What the user wants

The steering does not feel right yet, especially while drifting and tapping space for more drift.
The user wants an in-game debug menu of sliders to tune it live, then will hand back the final
figures for permanent application, after which **the dev menu gets deleted**.

The user chose **sliders only** - no JSON export, no config-file writing.
Values are read off the sliders and reported back verbally.
Label every slider with its current numeric value, clearly and legibly, so it can be read at a
glance.

### Scope

Sliders, each showing its live numeric value, applied instantly with no reload:

**Steering**
- steering sharpness / input rate
- `turnRate` peak and the `gripLow` speed it peaks at (`physics.js`, the speed-decay curve the
  play brief flags: "turning falls away with speed")
- yaw-rate-versus-speed decay factor (currently `1/(1 + (sn-gripLow)*1.35)`)
- counter-steer authority

**Drift and handbrake**
- `handbrakeDecel`, and the handbrake's yaw authority
- rear grip loss on handbrake, and how fast it recovers
- `absHold` (the brake-tap drift knob, `physics.js:126`)
- `driveSplitRear`
- `targetSlip` multiplier and slip response rate
- drift-hold: how much throttle catches or extends a slide

**Camera** (`camera.js`)
- the slip term on aim yaw (`camera.js:286`, `slip*0.30`)
- `steerLead` (0.26 rad)
- `slipSwing` (2.1 m)
- chase distance, height and follow lag

### Implementation notes

- Hide it behind `?dev=1` or a key such as backtick, so it can never appear in normal play.
- Persist slider values in `localStorage` so a reload keeps the tuning session going.
- Include a reset-to-defaults button.
- Show live readouts alongside the sliders: current speed, yaw rate, slip angle. Tuning drift
  blind is guesswork.
- Keep it in its own module, e.g. `game/devtune.js`, with a single import in `main.js`, so
  deleting it later is a one-line removal plus one file.

### Acceptance criteria

- Every slider takes effect immediately while driving, no reload.
- Numeric values are readable at a glance.
- Zero cost when the menu is off. Confirm no per-frame work in the normal path.
- The module is removable in one commit with no leftovers.

### Closing this task

When the user reports final figures, apply them to `physics.js` `TUNE` and `camera.js`, then
delete `game/devtune.js` and its import.
Note the applied values and their source in `STATE.md`.

---

## T10 - Lighting is too blurry at the fixed 720p/1080p render sizes

**Mode: solo.**
**Depends on: nothing.**

### What the user reported

The game is now restricted to 720p and 1080p (`main.js:87-88`, the `{ 720: 1280x720, 1080:
1920x1080 }` table, applied through `resScale` at `main.js:107` and `main.js:470`).
At those sizes the baked shadows, the global illumination and the sun halo no longer match the
image. They read as too blurry.

### Why this happens

These terms were tuned during the visual waves against a different effective resolution, and
several of them are almost certainly sized in pixels or in fractions of the render target rather
than in world units or angular size. Fixing the render size exposed that:

- Shadow map resolution and the PCF/soft-shadow radius. A radius in texels that looked right
  against one buffer size is wrong against another.
- Any half-res or quarter-res buffer feeding GI, ambient occlusion or the sun halo. A downsampled
  pass that was acceptable at one output size is visibly soft at another.
- Bloom/halo blur radii expressed as a fraction of the render target rather than as an angle.
  `hud.js:64` already does the right thing for the HUD flame ("radii are relative so the halo
  keeps its reach at any resolution"); the world-space equivalents may not.

### Scope

1. Audit every blur radius, kernel size, mip level and downsample factor in the shadow, GI and
   sun-halo paths. For each, record whether it is expressed in pixels, in a fraction of the
   target, or in world/angular units.
2. Anything in pixels or target-fractions that should be angular gets converted, so the same
   configuration is correct at both 720p and 1080p.
3. Raise shadow map resolution and tighten the filter radius until shadow edges are as sharp as
   the reference stills, then measure the frame-time cost.
4. Sharpen the sun halo the same way. It should read as a defined disc with a falloff, not a
   smear.
5. If the GI/AO buffer is half-res, either take it to full res if it fits the budget, or add a
   depth-aware upsample rather than a bilinear one.

### Acceptance criteria

- Side-by-side before/after at BOTH 720p and 1080p, against the matching `reference/` stills.
- The same settings look correct at both sizes. No per-resolution fudge factors.
- Shadow edges, GI contact darkening and the sun halo all measurably sharper. State the metric.
- 60 fps still sustained at 1280x720 real pixels, p50/p99 stated before and after. If the sharper
  configuration costs frames, say how many and what was traded for them.

---

## T11 - BOOST OK! centre-screen banner

**Mode: solo. Do with T12 and T13, in that order.**
**Depends on: nothing.**

### What the user wants

Reference: `reference/hud/boost-ok-banner.png`.

When the boost bar reaches full, a banner flashes across the centre of the screen: a circular
badge medallion on the left, then a torn slanted amber banner carrying **BOOST OK!** in heavy
slanted white type.

### Decisions already made

- **Canvas-drawn, in the existing HUD idiom.** No generated image assets. `hud.js` already draws
  brush-stroke frames (`hud.js:284`), slanted glowing type (`drawType`, used at `hud.js:1071`) and
  torn plates (`hud.js:1358`). Build the banner from those primitives so it stays sharp at 720p
  and 1080p and animates cleanly. It will not be pixel-identical to Paradise, and that is fine.
- **The existing corner readout goes.** `hud.js:2659` currently pushes a `['BOOST READY',
  '#d6ff8c']` line. Delete it. The centre banner fires once on the transition to full, then fades.
  The bar already turns amber at full (`C_READY`, `READY_AT = 0.97` at `hud.js:55` and `hud.js:79`)
  and that stays as the persistent indicator.

### Scope

- **Build this as a reusable centre-banner primitive**, because T13 needs the same thing in a
  different colourway with different type. One function, parameterised by badge art, banner
  colour, text and duration.
- Fires on the rising edge into `READY_AT`. It must not re-fire while the bar hovers at full,
  and it must not fire on a refill that was already full.
- Animation: sweep in from the left, hold, fade. Fast enough not to obstruct driving. Around
  1.2 s total is the right order.
- Scale with resolution, using relative units like the HUD flame halo already does.

### Acceptance criteria

- Fires exactly once per fill, on the rising edge.
- Legible at 720p, sharp at 1080p, same design at both.
- Does not obscure the road ahead at speed. Verify by driving, not by looking at a still.
- The primitive is genuinely reusable: T13 uses it with no copy-paste.
- No frame-time cost when no banner is showing.

---

## T12 - Drift counter in metres

> **DONE** (`45e7e6c`). HUD 47 m against 47.80 m independently integrated. Earn rate unmoved.

**Mode: solo. Do with T11 and T13.**
**Depends on: nothing.**

### What the user wants

Reference: `reference/hud/drift-metres.png`.

The drift readout should count distance, shown as `DRIFT: 142 m`, in the existing amber popup
style above the boost bar.

### Decision already made

**Display only.** The boost EARN stays time-based at `TUNE.boostEarnDrift = 0.10` per second
(`physics.js:169`). Only the HUD number changes to metres.

### What exists

`hud.js:2810-2822` turns `physics.state.earnFeed` entries into popups above the boost bar, with
`drift: 'DRIFT'` in the label map at `hud.js:2815`, and treats drift as a "passive chunk" with a
shorter popup life.

### Scope

- Accumulate slide distance in `physics.js` while the drift condition holds (the same condition
  that already drives `boostEarnDrift`, i.e. `|slipAngle| >= slipRef`). Distance travelled while
  drifting, in metres.
- The popup counts UP live during the drift rather than appearing once per earn chunk. In the
  reference it is a single row whose number climbs while the slide lasts.
- Reset the counter when the drift ends. The final value should be readable for a moment before
  it fades.
- Keep the amber slanted popup style exactly as it is.

### Acceptance criteria

- Number climbs smoothly during a slide and matches actual distance travelled. Verify against a
  known-length drift.
- Ends and fades cleanly. A chain of short drifts does not produce a flickering stack of rows.
- No change to how much boost a drift earns. Confirm the earn rate is untouched.

---

## T13 - Full-bar burn is a Burnout: full refill and a BURNOUT X N! banner

**Mode: solo. Do after T11.**
**Depends on: T11 for the banner primitive.**

### What the user wants

Reference: `reference/hud/burnout-x2-banner.png`.

Spending the entire boost bar in one continuous burn counts as a **burnout**: the bar refills
completely, and a centre banner fires reading **BURNOUT!**, then **BURNOUT X2!**, **X3!** and so
on for consecutive burnouts. Orange/flame colourway with a flame-edged badge, distinct from T11's
amber BOOST OK banner.

### This overrides the current behaviour, deliberately

`physics.js:1748-1752` currently splits the outcome: a Burnout Chain (drift banked while boosting
reaching `chainDriftNeeded = 3.2`) refills to `1`, and a plain full-bar burn refills only
`burnoutRefill = 0.32`. The 0.32 is sourced from the published "refills a PORTION" description
(`physics.js:171`).

**The user was shown that and chose the full refill anyway.** A full-bar burn now refills to 1
unconditionally. Change it, and update the comment at `physics.js:171-174` to record that the
published behaviour was knowingly overruled by the user rather than lost.

### Scope

- Full refill on any completed full-bar burn.
- A burnout counter that increments on each consecutive burnout and drives the `X N` in the
  banner. Decide and document what breaks the chain: a crash certainly does, and letting the bar
  sit unspent past some window probably should. State the rule in a comment.
- Banner via T11's primitive, orange/flame colourway, flame-edged badge, `BURNOUT!` /
  `BURNOUT X2!` type.
- Keep the existing Burnout Chain drift mechanic and its HUD look (`hud.js:1071` draws
  `BURNOUT CHAIN`, `chainMix` at `hud.js:148`) working alongside this. The two must not fight
  over the same screen space or the same bar state.
- Sound: the burnout deserves its own cue. `audio.js` owns it.

### Acceptance criteria

- Holding boost from a full bar to empty always refills to full and always fires the banner.
- Releasing boost early does NOT count and does not refill.
- The multiplier increments correctly across consecutive burnouts and resets on the documented
  break condition.
- BURNOUT and BOOST OK banners never overlap or queue confusingly. Define the precedence.
- The existing Burnout Chain behaviour still works and still reads distinctly.
- No frame-time regression.

---

## T14 - Menu cleanup: drop the render scale block, Enter starts the game

> **DONE** (`c5770d7`). 14/14 checks in `tools/_t14-check.mjs`.
> Note for any future input probe: a synthetic `dispatchEvent` is `isTrusted: false` and WebAudio
> will not unlock for it. Use a trusted keypress.

**Mode: solo. Small.**
**Depends on: nothing.**

### What the user wants

Two changes to `game/menu.js`.

**Remove the render scale block entirely.** Reference: `reference/hud/render-scale-block.png`.
The user chose to remove the whole thing, not just the slider: the "RENDER SCALE - LOWER TO BUY
FRAMES" heading, the slider, the resolution/scale/window readout, the fps line and the
paused-frame caveat all go.

The block is `menu.js:545` (`const resRow = addRow('res', 'Render scale - lower to buy frames')`)
through its readout at `menu.js:689`.
It existed to serve the frame-time work; the user has since fixed the game to 720p or 1080p and
does not want the knob.

**The 720p/1080p cap selector stays** (`menu.js:516-525`). That is a different control and the
user did not ask for it to go.

**Enter starts the game.** Today the start menu requires a click (`menu.js:818`, the `onStart`
call). Pressing Enter should do exactly the same thing.

### Scope

- Delete the render scale row, its slider, its readout and the caveat text. Remove any now-dead
  helpers, CSS and `ctx` plumbing it used alone. Check `ctx.renderSize()` and the fps sampler
  for other callers before deleting them.
- Keep `resScale` in `main.js` (`main.js:107`, `main.js:470`). It is pinned at 1.0 and stays as
  internal machinery, including the `#hudres` and HUD-path size comparison logic at `main.js:371`
  that depends on it. Only the UI goes.
- Enter on the start menu calls the same path as the start button, including
  `music.unlock()`. **The keypress is a legitimate user gesture for WebAudio, so unlocking still
  works** - but verify that, because it is the one thing that can silently break.
- Enter should also resume from the pause menu, for symmetry. Esc already closes it.
- Respect the existing capture-phase key handling at `menu.js:873` and the held-key
  re-assertion at `menu.js:845`, so Enter does not leak a keydown into `main.js`.

### Acceptance criteria

- Render scale block gone. Menu re-measured against the 720p fold constraint noted at
  `menu.js:647` - the card should now be comfortably shorter.
- No dead code, no orphaned CSS, no console errors from a removed `ctx` method.
- Enter starts the game from the start menu, and audio unlocks. Verify audio explicitly.
- Enter resumes from the pause menu.
- Mouse start still works exactly as before.
- 720p and 1080p both still render at the right internal size with the slider gone.

---

## T15 - Gamepad support

**Mode: solo, or subagents if bundled with T14 and T9.**
**Depends on: nothing. Coordinate with T9 - both touch the input path.**

### Layout

The user chose **Paradise's own layout**, no remapping UI:

- Left stick: steer (analog)
- RT: throttle (analog)
- LT: brake and reverse (analog)
- A: boost
- LB or B: handbrake

**Research the exact Burnout Paradise pad binding with Firecrawl before committing to it.**
The list above is the expected shape, not a verified source. Where the research contradicts it,
follow the research and note the correction.

### Analog steering

The user chose **a separate feel curve with sensible defaults and no sliders**.
The implementer picks the deadzone, response curve and saturation, and **must justify each in a
comment with what was tried**.

This matters: the keyboard path ramps a digital key into a steering value over time. Feeding a
stick through that ramp makes the pad feel laggy, because the player has already expressed the
exact angle they want. Analog input needs its own path that maps stick position more directly,
with the ramp reduced or removed.

Same for the triggers: RT/LT are analog and should modulate throttle and brake, not act as
on/off switches.

Do NOT add these to T9's dev menu. The user declined sliders for this.

### Scope beyond driving

The user asked for all three:

1. **Menu navigation.** D-pad and left stick move between rows, A confirms, B backs out, Start
   opens and closes the pause menu. Must work with the existing capture-phase key handling in
   `menu.js` rather than around it.
2. **Button prompt swapping.** The menu control list and any HUD prompts show controller glyphs
   when a pad is the active input and keyboard keys otherwise, switching live on the last input
   used. Include the control list the start menu already shows.
3. **Rumble on impacts.** Crashes, scrapes (`noteGrind()` already tracks a held grind), boost
   start, and landings. Use the Gamepad haptics API (`gamepad.vibrationActuator`). **Support is
   uneven across browsers and it must degrade silently** - a missing actuator is not an error,
   and there must be no per-frame cost when no pad is connected.

### Implementation notes

- The Gamepad API is poll-based, not event-based. Poll once per frame in the main loop, before
  input is assembled, and merge pad state with keyboard state so both work simultaneously.
- Handle connect and disconnect mid-session without a reload.
- Track "last input used" so the prompt swap has something to read.
- Test with at least one real pad. An untested gamepad implementation is worthless.

### Acceptance criteria

- Drive the whole game on a pad, start to finish, without touching the keyboard or mouse.
- Analog steering resolves small corrections that the keyboard cannot express. Verify by holding
  a shallow constant-radius line.
- Triggers are analog, not binary. Verify partial throttle produces partial acceleration.
- Keyboard still works identically, and both can be used in the same session.
- Prompts swap on the last input used, both directions.
- Rumble works where supported and is silent where not. Confirm on a browser without haptics.
- Connect and disconnect mid-drive with no crash and no stuck input.
- No frame-time cost when no pad is connected. State the per-frame poll cost when one is.

---

## T16 - Near misses must appear in the boost feed, with the chain multiplier

> **DONE** (`77339f3`). The ECONOMY NUMBER IS STILL THE USER'S CALL: fill went 56.2 s -> 13.9 s,
> and the later `NPC_DENSITY` halving took it to 21.3 s. `boostPerNearMiss` deliberately unchanged.

**Mode: solo. Do with T11-T13, same file.**
**Depends on: nothing. Shares `hud.js` earn-feed code with T12.**

### What the user reported

Drift and oncoming popups appear above the boost bar, but near misses never do.

### Almost all of this is already built

Do not build a new system. The pieces exist and the popup should already be showing:

- `traffic.js:500` emits `nearMiss` with an intensity.
- `main.js:221` wires it: `physics.setEventSource(() => traffic.drainEvents())`.
- `physics.js:1729-1734` applies the chain multiplier and pushes
  `{ type, mult, earn }` onto `state.earnFeed`.
- `hud.js:2813` maps `nearMiss: 'NEAR MISS'` and renders `x${mult}` at `hud.js:2822`.

So the wiring is complete end to end. The event is not firing often enough to be seen.

### The likely cause, and the fix the user chose

**Near miss only tests against LIVE traffic.** `traffic.js:1167` opens a near-miss pass while
iterating the 22-car pool. Parked cars reach `traffic.js` as `statics` and are used for pass
audio only (`traffic.js:746`, the `onPass` whoosh). Parked cars vastly outnumber live ones, so
most of what the player squeezes past can never fire an event.

**The user chose: parked cars count, at full intensity.**
Threading past a parked car at speed is a near miss and earns boost like any other.

This is a boost economy change, not just a HUD fix. Expect the bar to fill noticeably faster.
Measure the new fill rate under normal driving and report it. If it is now too generous, say so
with the number rather than quietly retuning `boostPerNearMiss`.

### Scope

- Fire `nearMiss` against static bodies using the same clearance geometry as the live path
  (`NEAR_MISS_R = 3.4`, `NEAR_MISS_OUT = 1.4`, `EVENT_SPEED_MIN = 12` at `traffic.js:128-130`).
  Reuse the open/close hysteresis; do not write a second detector with different thresholds.
- The static path needs per-body pass state, which live vehicles carry as `nmOn/nmMin/nmRel`
  (`traffic.js:317`). Statics have no such slot. Add one without making the static list expensive
  to scan - only bodies within the pass radius of the hero need tracking.
- Do not double-fire alongside the existing `onPass` whoosh. They should be the same pass.
- Confirm the whole path once statics are in: event drains, chain applies, popup renders.

### Multiplier

**Keep the existing shared chain**, `earnChainWindow = 3.0` and `earnChainMax = 4`
(`physics.js:154-155`). Two near misses inside 3 s gives x2, and mixing a near miss with an
oncoming pass or a traffic check chains too. That is Paradise's behaviour and it is already
correct. It was simply never visible.

Do not add a second near-miss-only counter.

### Popup text

**Drop the percentage.** `hud.js:2823` currently builds
`` `${name}${mult} +${...}%` ``.
Near miss renders as `NEAR MISS X2`, no `+6%`. The bar already shows the gain.

The user scoped this to near miss only, not to every popup type. Leave drift and traffic check
as they are unless they look inconsistent side by side, in which case raise it rather than
changing them unasked.

### Acceptance criteria

- Driving normally past parked cars produces visible NEAR MISS popups.
- Two near misses inside 3 s show `X2`; the chain climbs to `X4` and decays after 3 s of quiet.
- The chain is shared: near miss into oncoming into check escalates across types.
- No double-firing. One pass, one event, one whoosh.
- New boost fill rate under normal driving measured and reported.
- No frame-time regression from scanning static bodies. State the per-frame cost, and confirm the
  scan is bounded by proximity rather than by the size of the static list.

---

## T17 - Remove the C manual-crash key

> **DONE** (`80477c4`, `7330f1a`).
> CORRECTION: the orbit camera was NOT shared with the genuine crash path, contrary to the
> "Careful about" note below. The deleted block held the only `mode: 'orbit'` in `main.js`; a real
> crash never orbited and still does not.

**Mode: solo. Trivial.**
**Depends on: nothing.**

### What the user wants

The C key triggers a crash on demand. It was a development affordance for judging the crash
effect and is unnecessary now. Remove it.

### Where it lives

- `main.js:930` - the `if (e.code === 'KeyC' && !crash.active)` handler. It calls
  `crash.trigger()` with `CRASH_DEMO_SEVERITY`, `audio.crash()`, `hud.banner('WRECKED')` and
  reconfigures the camera to orbit.
- `CRASH_DEMO_SEVERITY` in `main.js` - check for other callers before deleting the constant.
- `menu.js:35`, `menu.js:309`, `menu.js:338`, `menu.js:846` - four comments documenting KeyC as a
  discrete action deliberately excluded from `HELD_CODES` and from the held-key re-assertion.
  Update the prose; do not just delete the mentions, because the reasoning about discrete versus
  held actions still applies to KeyR.
- The control list shown in the start and pause menus, if C is listed there.

### Careful about

Real crashes must be completely unaffected. The C handler shares `crash.trigger()`, the orbit
camera configuration and the WRECKED banner with the genuine crash path. Remove only the key
handler and anything used by nothing else. Deleting a shared helper because C was its most
visible caller would break crashing outright.

`KeyR` (reset) stays.

### Acceptance criteria

- Pressing C during play does nothing.
- A real crash still triggers correctly: effect, audio, WRECKED banner, orbit camera, recovery.
- No dead constants or unreferenced helpers left behind.
- Menu control list no longer mentions C, if it did.
- `bash tools/lint.sh` clean and the game boots.
