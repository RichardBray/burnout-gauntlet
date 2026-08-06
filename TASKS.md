# TASKS - user feature backlog (2026-08-06)

Seventeen features requested by the user, captured before implementation.
Each task is self-contained enough for a fresh model to pick up cold.

Read `STATE.md` and `tools/WAVE-S-PLAY-BRIEF.md` before starting any of these.
The standing rules there still bind: 60 fps at 1280x720 REAL pixels, visual regression gate,
NPC car count is user-set (`POOL = 24` in `traffic.js`, `NPC_DENSITY = 0.16` in `world.js`) and
must not be raised.

---

## STATUS as of 2026-08-06, end of wave 2. READ THIS BEFORE PICKING A TASK.

| task | status | landed in |
|---|---|---|
| **T1** struck parked/stopped cars | **DONE** for parked; the STOPPED-TRAFFIC half is UNVERIFIED | `80477c4`, `b3c69d4`, `3a417d3` |
| **T4** off-road speed penalty | **DONE** | `084894c` |
| **T7** soundtrack, genres + player UI | **DONE** | `489aad2`, `adcd0aa` |
| **T9** dev tuning menu | **DONE and DELETED** - figures applied, task closed | `f095b88`, `2082b36` |
| **T10** lighting sharpness | **DONE**, and the premise was mostly REFUTED - read below | `3160cb2` |
| **T11** BOOST OK! centre banner | **DONE** | `f1a5b63` |
| **T12** drift counter in metres | **DONE** | `45e7e6c` |
| **T13** full-bar burn is a burnout | **DONE** | `657dc3d` |
| **T14** menu cleanup, Enter starts | **DONE** | `c5770d7` |
| **T16** near misses in the boost feed | **DONE**, economy number outstanding | `77339f3` |
| **T17** remove the C key | **DONE** | `80477c4`, `7330f1a` |
| T2, T3, T5, T6, T8, T15, T18 | not started | - |

Full write-ups with measured numbers are in `verdicts/wave-s/`. Do not re-derive what is there.
For the wave-2 tasks the numbers are in the commit messages, which are long on purpose.

### The tuned handling figures, applied and closed (`2082b36`)

The T9 panel came back with six knobs moved; everything else was still on its code default.

| knob | was | now | where |
|---|---|---|---|
| `handbrakeSteerGain` | 1.94 | **2.30** | `physics.js` TUNE |
| `absHold` | 0.985 | **0.768** | `physics.js` TUNE |
| `stiffness` | 6.5 | **4.98** | `camera.js` DEFAULTS |
| `lookStiffness` | 8.0 | **5.96** | `camera.js` DEFAULTS |
| `yawLag` | 3.02 | **5.24** | `camera.js` DEFAULTS |
| `lookAhead` | 14 | **7.65** | `scenes.js` `dusk-highway-chase` |

`lookAhead` is edited in `scenes.js` and not in `camera.js` because **`dusk-highway-chase` IS the
play camera** - `main.js` defaults `sceneId` to it. Anything that scene configures is what the
player drives with, and that scene's reference still moves when it is touched.

`game/devtune.js`, its `main.js` import, `tools/_devtune-check.mjs` and the `export` on
`camera.js`'s `FRAME` are all gone. T9 is finished; do not resurrect the panel to tune something
else without saying so.

### Open decisions the user owns

- **T16's boost economy.** An empty bar filled in 56.2 s before T16 and 13.9 s after, which is
  too generous. Halving `NPC_DENSITY` has since taken it to 21.3 s. `boostPerNearMiss` is
  deliberately UNCHANGED at 0.060 - retuning is the user's call, not an agent's.
- **T1's stopped-traffic half.** `traffic.js`'s `wasStopped` fix (commit `7028fff`) is correct on
  inspection and was never demonstrated. No probe in the tree exercises it. Treat as open.
- **The 720p cap.** T10 established that the softness the user reported is the browser upscaling a
  720p buffer to the window, not a mis-sized shader term. The 1080p cap in the pause menu is the
  fix and it costs frames. Which one ships as the default is a taste-versus-budget call.

### OPEN DEFECTS reported by the user and NOT yet explained

- **A ~1 s hitch when BOOST OK! first fires.** Reported 2026-08-06, after T11 landed.
  **It is not the banner.** Measured on a 2560x1440 HUD canvas: median frame 0.70 ms with no
  banner, 0.80 ms with one up, 1.2 ms on the first draw, 2.7 ms worst of 40 frames. There is no
  image asset involved - the banner is drawn from `torn()` and `drawType()` like the rest of the
  HUD, so "reduce the image resolution" and "preload it" do not apply.
  Something else fires at the same moment as the first full bar and has not been found. Next step
  is a real-session profile (not the `hud-overlay` harness, which does not reproduce it): record a
  `performance` trace across the first fill and look at what allocates or compiles there. Suspect
  first-use costs that merely COINCIDE with the first full bar - a shader variant, a texture
  upload, or `audio.boostReady()`'s first voice.
- **The HUD canvas is CSS-window-sized, not capped at 1080p.** Raised by the user, on the
  reasonable suspicion that a 2560x1440 HUD is absurd for a game that renders at 1280x720.
  It is deliberate - `main.js`'s recorded decision is that dropping `resScale` or the 720p cap must
  NOT soften the HUD, and HUD text upscaled from 720p is exactly the mush T10 was chasing.
  **Measured, and it is not a cost worth chasing:** `hud.update()` p50 is 0.50 ms at 2560x1440
  (3.69 Mpx), 0.50 ms at 1920x1080 (2.07 Mpx) and 0.50 ms at 1280x720 (0.92 Mpx). Flat. HUD cost is
  path and type work, not fill area, so a 4x pixel count buys 0 ms. It is therefore NOT the source
  of the BOOST OK! hitch either.
  The real consequence of the size mismatch is the COMPOSITING PATH, not the pixels: whenever the
  HUD backing store differs from the drawing buffer, `syncHudPath()` falls back to DOM compositing
  (`domLayer=true` at all three sizes above, since the buffer is capped and the window is not). The
  single-layer in-frame path only ever engages at a 720p window with `resScale` 1. Whether that is
  worth having at all is a question nobody has asked yet.
- ~~**`daytime-downtown` times out in `tools/shot.mjs`.**~~ **FIXED, wave 3.** It was never a
  bisect job and it was never only one scene - `hud-overlay` was failing the same way and nobody
  had noticed, because nothing renders all seven scenes in one go.

  Cause: `--shot` boots with `createAudio({ enabled: false })`, which returns the headless no-op
  shim in `audio.js`. That shim hand-listed its methods and had fallen behind the real api, so
  `traffic.js`'s horn callback hit `audio.horn is not a function` at tick ~355 of 360 and killed
  boot before `__ready`. Both failing scenes are `city`-path drives that get close enough to
  oncoming traffic to trigger a honk; the other five never fire one.

  It presented as a bare timeout because `index.html:56-59` catches boot failures into a hidden
  `#err` div instead of rethrowing, so `shot.mjs` saw an empty error list and a stalled flag.
  **That swallowing is the reason this looked unexplained for a whole wave.** `shot.mjs` now reads
  `#err` on failure and prints the real stack, and the shim is a `Proxy` that answers any name
  with a no-op so it cannot drift from the api again. `tools/_audio-shim-check.mjs` guards it.
  All seven scenes in `scenes.js` render. **T2 is unblocked.**

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

### Wave 2 - COMPLETE (2026-08-06)

All four items landed. What actually happened, against what was planned:

- The tuning figures arrived as two screenshots of the panel, covering the drift/handbrake and
  camera groups only. The green-versus-amber colouring in `devtune.js` is what made that
  sufficient: green means "differs from the code default", so the unphotographed groups could be
  confirmed unchanged with one question rather than another tuning session.
- **T4 shipped with TWO surface classes, not four.** The world's ground is a single flat plane of
  one colour - there is no grass, sand or soil in the tree to classify, so rows for them would be
  configuration nothing could return. `world.js`'s `surfaceAt()` and `physics.js`'s `SURFACES` are
  both keyed so that T3's map can add them as data with no caller edits.
- **T4's wheel dust/spray is NOT done**, and was not quietly dropped: `crash.js` owns the only
  dust system and it is internal to the crash cinematic, so this is a new emitter, and it has
  nothing to throw up until there is terrain to throw. It belongs with the surfaces it depicts.
- **T11's primitive was genuinely reused by T13**, no copy-paste: colourway, badge art, text and
  precedence are parameters. Precedence had to be explicit because a burnout refills the bar to
  full, which is itself a rising edge into `READY_AT` - without it BOOST OK! stamped over the
  burnout that caused it.
- **T7 cost more than expected for one reason: OpenGameArt's CC0 search filter returns CC-BY
  items.** Six of ten shortlisted candidates were CC-BY 3.0/4.0 or OGA-BY once their own pages
  were read, including every obvious pick for a driving game. Read the page, every time. The trap
  is written up in `game/music/README.md`.
- Every music file is now Ogg and loudness-normalised to -12 LUFS; they had arrived spread across
  9.4 LU. Fifteen harnesses under `tools/` needed `.ogg` adding to their MIME tables - a media
  element silently refuses `application/octet-stream`, which presents as "the music does not play"
  with nothing in the console.

### Wave 2 - two items gated on the user's figures, the rest on wave 1 (ORIGINAL PLAN)

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

### Wave 3 - polish. T10 DONE, the rest NOT STARTED.

- **T15**, gamepad. **DEFERRED, not skipped - asked and answered 2026-08-06.** The user was put
  the choice directly (build it unverified, or leave it) and chose to leave it. It stays blocked on
  hardware, not on anyone's time. Do not pick it up opportunistically: the acceptance criteria are
  all "verify by driving on a pad", so there is nothing an agent can honestly close here. Revisit
  when the user has a pad.
- **T10**, lighting sharpness. **DONE** (`3160cb2`), and it mostly refuted its own brief. Three of
  the four suspects cannot see the render size at all: PCSS's radius is in shadow-map texels off a
  fixed 4096 map, the bloom pyramid's offsets are in source-mip UV, and the sun halo is an
  analytic `pow(dot(view, sun))`. One real hit - the SSAO buffer was a constant fraction of the
  render target, now pinned to an absolute height so its footprint is a fixed fraction of the
  FRAME. Cost 9.61 -> 10.05 ms p50 at 720p. The blur the user reported is the display upscale.
- **T2**, geometry cleanup. **IN PROGRESS, at the approval gate with a PARTIAL list.** The shot
  timeout that blocked it is fixed, and all seven scenes render. What the evidence pass found so
  far is written up under T2 below - one finding is code-confirmed and ready to delete, one is
  photographed but NOT yet attributed to a cause. The list is not complete: only
  `wet-night-asphalt` and `dusk-highway-chase` have been read closely.

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

**Note on `sky.js`: there is no skyline geometry in it.** It is an analytic atmosphere - a baked
384x192 sky-view LUT plus two analytic cloud decks and a radial sun lobe. Nothing in it can be
"deleted" as stray geometry. The distant city silhouette is built in `world.js`. Do not go looking
for meshes in `sky.js`; that half of the brief is a misdirection.

### EVIDENCE PASS, 2026-08-06 - findings so far, for approval

Method: `node tools/shot.mjs` over all seven scenes at 1920x1080, then crops via
`tools/_cropimg.mjs`. Two scenes read closely so far (`wet-night-asphalt`, `dusk-highway-chase`).
**Nothing has been deleted. Nothing will be until the user approves the list.**

#### FINDING 1 - overhead wires attach to nothing, and some end in mid-air. CONFIRMED IN CODE.

`world.js:2286-2308`. This is exactly the "does not line up with the lamps" the user reported, and
it is visible against open sky in `wet-night-asphalt` around x 700-1200, y 260-300: two wires with
clean cut ends hanging over the street, anchored to nothing at either end.

The wire endpoints and the lamp positions are computed from the same grid but never from each
other:

| | lateral offset from road centre | height |
|---|---|---|
| street lamp (`world.js:2233-2234`) | `HALF + 2.4` | pole spans y 0.2 to **8.8** |
| wire (`world.js:2304-2306`) | `HALF + 3.0` | y **9.4 / 8.9 / 8.6**, sag 1.1-1.4 |

So every wire runs 0.6 m to the SIDE of the pole line and, for the y 9.4 run, 0.6 m ABOVE the top
of the poles it is meant to be strung between. They are near the lamps and joined to none of them.

Separately, the along-road runs overshoot. The loop is `for (x = -EX + 30; x <= EX; x += 62)`, and
inside it line 2306 draws a wire from `x + 31` to `x + 93` - so the final iteration lays wire up to
**93 m past `EX`**, over ground that has no poles at all. Line 2305 overshoots by 62 m the same way.
Those are the free ends in the screenshot.

Proposed fix, for approval - this is a REPAIR, not a deletion, because the user asked for geometry
that does not belong to go, and a wire strung pole-to-pole does belong:

1. Draw wires from the recorded lamp positions instead of from re-derived grid maths, so the two
   can never drift apart again. `streetLight()` already pushes to `lampPositions`.
2. End each run at the last pole, killing the overshoot.
3. If a run has no pole at one end, do not draw it.

If the user would rather simply delete the wires, that is one line and also fine - but they are
carrying real thin shadows and the reference (`daytime-downtown-01`, "prop density is high ... and
the wires cast their own thin shadows") wants them present.

#### FINDING 2 - a hard-edged flat quad over the road. PHOTOGRAPHED, CAUSE NOT YET FOUND.

`wet-night-asphalt`, roughly x 1150-1900, y 830-990: a dull flat region with a razor-straight
horizontal top edge and a straight diagonal right edge, lying over the wet road to the car's
lower-right and occluding the reflection streaks that surround it. It reads as a stray plane.

**Do not act on this yet - three hypotheses have been tested and all three are REFUTED:**

- not the sun/moon shadow - `g.sky.sun.castShadow = false` leaves it pixel-unchanged;
- not a contact-shadow pad - hiding the `contactShadows` mesh leaves it pixel-unchanged;
- not ordinary scene geometry - `scene.overrideMaterial = MeshNormalMaterial` recolours the car
  and leaves this region untouched, so whatever draws it is not being drawn by that pass.

That last result is the informative one: it is drawn outside the main scene-graph pass, which
points at the post chain or the road's planar reflection (`road.js` `PLANE_Y = 0.03`, and the
header at `road.js:4` describes "an additive light-smear quad on the tarmac (used for wet-night
reflections)"). That quad is the strongest remaining suspect and is where the next session should
start.

Raycasting was tried and abandoned: `tools/_pickpx.mjs` returns hits whose screen positions do not
agree with the picture, so its camera mapping is wrong somewhere. Fix it or do not trust it.

#### Tools built for this pass, kept because the next session needs them

- `tools/_pickpx.mjs` - names the geometry under a screen pixel. **Camera mapping is suspect, see
  above.**
- `tools/_abtoggle.mjs` - screenshots a scene, applies a toggle expression against `window.__game`,
  re-renders and screenshots again. This is what refuted all three hypotheses above, and it is the
  cheap way to ask "is this thing responsible" without editing the tree.

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
7. **Every road connects.** The graph must be one connected component. No orphaned edge, no
   road that dead-ends into nothing, no segment reachable only by driving off-road.
   ADDED BY THE USER, 2026-08-06.

### Road connectivity - a hard constraint, not a nice-to-have

The user's rule: **no road may go nowhere.** Every drivable segment is reachable from every
other drivable segment by driving on road only.

This is a property of the DATA, so it is enforced on the data, at build time, not eyeballed:

- Write a validator alongside the graph - `game/map/validate.mjs` or similar - that loads the
  JSON and runs a flood fill from any node across the edge list. It must report: number of
  connected components (required: 1), the count of degree-1 nodes, and the coordinates of every
  one of them.
- **Degree-1 nodes are the failure mode to hunt.** A cul-de-sac that ends in a turning circle is
  legitimate and the user is not banning it; a road that simply stops mid-block because the
  digitising missed a junction is the bug. The validator cannot tell these apart, so every
  degree-1 node needs an explicit `deadEnd: true` flag in the JSON, set deliberately. Any
  degree-1 node WITHOUT that flag fails the check.
- Same for one-way flags: a one-way edge can strand a region that is reachable going in but not
  coming out. Run the flood fill a second time RESPECTING direction, and require strong
  connectivity too. A district you can drive into and never leave is exactly the orphan the user
  is describing.
- Run the validator in `tools/lint.sh` so a hand-edited graph cannot land broken.

Chunk streaming must not create the problem it is meant to hide: an edge crossing a chunk
boundary has to exist as one continuous drivable surface, not two segments that nearly meet.
Assert on the generated collision geometry as well as on the graph, because the graph can be
connected while the built road has a gap the car falls through.

### Acceptance criteria

- 60 fps sustained at 1280x720 real pixels while driving across district boundaries, p99 stated.
- No hitch above 30 ms at a chunk boundary. Streaming work must be amortised or off-thread.
- The road graph is recognisably Paradise City when the minimap is compared to the source map.
- The connectivity validator reports exactly one component, both undirected and directed, and
  every degree-1 node is explicitly flagged `deadEnd`. It runs inside `tools/lint.sh`.
- A drive probe crosses every chunk boundary on at least one route per district without the car
  dropping through a seam.
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

### First-run guidance, then hands off. ADDED BY THE USER, 2026-08-06.

On a fresh save the player is pointed at ONE event and nothing else:

- The first time attack is marked on the map and the minimap.
- Text sits in the **top right** of the HUD telling the player to go there. Keep it short - the
  event name and a distance readout is enough. It is a directive, not a tutorial box.
- Once that first event has been completed - finished, not merely started - the pointer text is
  gone for good and never returns.

After that the player is free to roam and to FIND things: further time attacks, billboards (T8),
ramps (T8), whatever else gets placed. Nothing is listed for them, nothing is waypointed for
them, and there is no "next objective" prompt. Discovery is the point.

Persist the "first event done" flag in the same `localStorage` schema as the best times, so
clearing storage puts a returning player back at the guided start.

**No fast travel. Anywhere. Ever.** No teleport to a marker, no "restart at event" shortcut that
moves the car across the map, no menu entry that relocates the hero. The drive between events IS
the game. This constrains T6's quit path too: quitting an event returns the player to free roam
AT THE PLACE THEY QUIT, not back at the marker. The only position reset in the game stays the
existing `KeyR` recovery, which must not be repurposed into a travel affordance.

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
| first-run pointer: top-right HUD text, distance, retire-on-completion | one builder (owns `hud.js`) |
| trigger, dwell countdown, race state machine, quit path | one builder |
| route arrows: placement along the route, look, animation | one builder |
| results UI, medals, `localStorage` schema | one builder |
| a critic that plays every event and checks the times are achievable | separate, fresh context |

### Acceptance criteria

- At least 6 events spread across the map.
- Gold/silver/bronze times are actually achievable and correctly spaced. The critic must set
  each gold time by driving it, not by estimating.
- Arrows are readable at 70 m/s, well before the turn.
- Quitting mid-race from the pause menu returns cleanly to free roam with no residual state,
  and leaves the car where it was, not back at the marker.
- Best times survive a reload.
- A fresh save shows the top-right pointer at the first event; completing that event removes it
  permanently, and it stays gone across a reload.
- Nothing in the game moves the hero across the map. Grep the tree for any position write that
  is not physics, `KeyR` recovery, or initial spawn, and state what you found.
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

---

## T18 - Wrecked NPC cars should clear themselves away

**Mode: solo.**
**Depends on: nothing. Shares `traffic.js` with T1 and T16 - do not run alongside either.**

### What the user reported

> "I noticed that crashed cars, so NPC cars, stay still, they don't disappear. Is it better for
> them to disappear?"

Yes. They should go, on a timer, and the user is right that the current behaviour is wrong.

### Why they persist today

Wrecks already despawn, but only BY DISTANCE. `traffic.js:1053` says as much: a wreck "stays
where it stops as a live obstacle ... it despawns by distance like anyone else", and the retire
test is `v.pos.distanceTo(_hero) > DESPAWN_R` with `DESPAWN_R = 345`.

So a wreck that comes to rest anywhere near where the player is driving lives forever. Two costs,
and the first is the one that matters:

1. **It holds a pool slot.** `POOL = 24` is a hard ceiling the user set and it is not to be
   raised. A wreck parked in the middle of the district the player is circling permanently
   subtracts from the live traffic budget, and the promotion path at `traffic.js:979` already
   STEALS the farthest live car when no dead slot exists. Wrecks accumulating means the map
   quietly empties of moving traffic while the player racks up crashes.
2. Visual litter. A road strewn with static wrecks stops reading as a living city.

### What to build

A wreck retires on a timer, not only on distance:

- Start a per-vehicle timer when a wreck's speed reaches rest (`hypot(wvx, wvz)` at ~0 and
  `wspin` decayed out), not at the moment of impact. A wreck still sliding is part of the crash
  and must not evaporate mid-slide.
- Around 15 s at rest, then retire. Take the exact figure as tunable and state what you picked.
- **Never vanish in view.** `traffic.js` already has the machinery for exactly this: `inHeroView`
  and the `endHold` deferral at `traffic.js:879` exist so a line-end retire cannot pop in front
  of the player. Reuse that pattern rather than inventing a second one - hold the retire while
  the wreck is in the hero's view frustum, up to an `END_HOLD_MAX`-style ceiling so a player
  parked and staring at a wreck does not pin the slot forever.
- Prefer a short fade or sink-out over an instant cut, but only as the retire actually fires,
  i.e. off-screen or past the hold ceiling. If a fade cannot be done without a new material path,
  skip it and just retire - the slot mattering more than the flourish.

### Careful about

Retiring a wreck must clear the same state a distance retire clears: `live`, `wrecked`, `wvx`,
`wvz`, `wspin`, `nmOn`, `ctOn`, `endHold`. `traffic.js:757` and `traffic.js:475` are the two
existing places that reset this set - match them, and do not add a third partial reset.

A wreck the player is still batting around must not retire. Re-contact with the hero already
re-kicks it (`traffic.js:1087`); that has to reset the at-rest timer.

Do not let the retire fire while the wreck is inside the hero's collision reach, or the car will
pass through the space a solid object occupied a frame earlier.

### Acceptance criteria

- **Assert on the render side, not on `traffic.vehicles`.** See the carried-forward warning at
  the top of this file. The claim is "the wreck disappears", so the check is the submitted
  instance count or the instance matrix, not the simulation array. A `vehicles` check stays green
  under the exact bugs T1 kept hiding behind.
- A wreck left at rest off-screen is gone within the chosen timeout, and its pool slot is
  measurably reusable afterwards - show a live count recovering, not just a flag flipping.
- No wreck ever disappears while on screen and within the hold ceiling. Demonstrate by staring
  at one across the timeout.
- Crashing repeatedly in one small area does not reduce the moving traffic around the player.
  State live-car counts before and after ten crashes in the same block.
- No frame-time regression. State the per-frame cost of the timer pass.
- `bash tools/lint.sh` clean.

---

## T19 - Gauntlet: delegate instead of sleeping when every account is limited

**Mode: solo. Touches `run-gauntlet.sh` and `PROMPT.md` only, never `game/`.**
**Depends on: nothing.**

### What the user asked

> "For the gauntlet script, would it make sense to add the ability to keep an eye on my Claude
> usage? Or delegate to other models with the delegation skill where necessary instead of using a
> subagent if usage is high?"

**Usage monitoring: no. Delegation on lockout: yes.**

### Why not usage monitoring

`run-gauntlet.sh` already handles limits, and it handles them the right way - reactively, off the
CLI's own signal. `reset_epoch_from_log` parses `usage limit reached|<epoch seconds>` straight out
of the round log, `blocked_until[]` records when each account recovers, and `pick_account`
rotates between `~/.claude-work` and `~/.claude`.

A proactive usage watcher would be a poller for a number that only changes the behaviour at the
moment the script is already being told the answer for free. It is a second source of truth that
can disagree with the first. Do not build it.

Note the guard already learned the hard way at `run-gauntlet.sh:105`: a lockout ALWAYS exits
non-zero, and without that check the pattern match hits the driver reading its own log and
punishes a healthy round with a five-hour sleep. Any change here must keep that guard.

### The real gap

`pick_account` blocks when EVERY account is limited:

```
log "all ${#ACCOUNTS[@]} accounts limited - sleeping ${wait}s"
sleep "$wait"
```

That can be hours of a wave doing nothing. That is the only place where reaching for another
model beats waiting, and it is worth doing.

### What to build

When all accounts are blocked and the wait exceeds some threshold (start at 20 minutes):

- Run the round through a courier instead of sleeping through it. The `delegate` skill holds the
  routing table and the invocation mechanics for glm-5.2 (`opencode`), gpt (`codex exec`) and the
  Cursor/Grok runners - use it rather than hand-rolling a CLI call.
- Route by task shape, which is what the routing table is for: clear-spec mechanical work goes to
  glm-5.2, investigation and review to gpt. A wave's builder rounds are usually the former.
- Log the delegated round to `logs/` in the same shape as a normal round, with the model named in
  the filename, so `watch.sh` and the verdict trail still read straight.
- Fall back to the existing sleep if no courier is configured or the delegate exits non-zero. A
  missing `opencode` binary must not kill the loop.

**Delegated rounds are still bound by every rule in `PROMPT.md` and `STATE.md`**, including the
visual regression gate and the ban on raising `POOL` or `NPC_DENSITY`. Say so in the prompt handed
to the courier, because that model has none of this context and will not infer it.

### Careful about

Do NOT swap subagents for other models during a normal round. The user's question raises it as an
option; the answer is that a healthy account should use its own subagents, because the delegation
is worth its coordination cost only when the alternative is a stalled loop.

A delegated round writes to the same tree. Two rounds must never run at once - the delegate call
replaces the `sleep`, it does not run beside a live round.

### Acceptance criteria

- With both accounts artificially marked blocked, the driver runs a delegated round instead of
  sleeping, and the log lands in `logs/` naming the model.
- With a normal account available, behaviour is byte-identical to today. No delegation path taken.
- Killing the courier binary from `PATH` makes the driver fall back to sleeping, not crash.
- The `status != 0` lockout guard at `run-gauntlet.sh:105` still behaves: a healthy round that
  merely MENTIONS a rate limit in its log is not punished.

---

## T20 - Loading screen art pass

**Mode: solo.**
**Depends on: nothing. Best done AFTER T3, so the logo can carry the map's identity - but it
does not block and does not conflict with anything.**
**Owns `game/index.html`'s boot block and the `stage()` helper in `main.js`. Nothing else.**

### What the user wants

The reference the user gave is Burnout Paradise's Big Surf Island loading screen:

    https://i.ytimg.com/vi/s_6XYEHBKoQ/sddefault.jpg
    saved to reference/loading/paradise-big-surf-island-loading.jpg

Read the saved copy before building. What is in it, top to bottom:

- Black letterbox bars top and bottom. The art occupies a band across the middle, not the
  whole screen.
- The band is dark grey asphalt/concrete, heavily textured, with tyre skid marks streaked
  across it and a lighter scuffed patch behind the centre.
- A centred badge-style logo: a crest with a city skyline rising out of it, a ribbon banner
  across, warm orange and teal against the grey. It has a soft reflection beneath it, as if the
  surface is wet.
- The word "Loading" low and right of centre, in a light plain sans, with a small circular
  spinner glyph beside it.

**The user wants a loading LINE, not that spinner.** That is the one deliberate departure from
the reference.

### What already exists

There is no spinner in the tree today - `game/index.html` already has a real progress bar, and
it is driven by real work, not a fake timer:

- `#boot` is a flex column: the word "loading", `#boottrack` (2px, `#1b222c`) holding `#bootbar`
  (`#e8863a`, `width` transitioned `.18s linear`), and `#bootlabel`.
- `main.js:143` `STAGE_MS` holds MEASURED per-stage costs (sky 337, road 654, world 154, car 231,
  sim 124, post 93, warm 78, measured 2026-08-03 via `?bootlog=1` in headless chromium at
  1280x720). `stage()` at `main.js:159` advances `#bootbar` by that weighting and yields two
  frames so the bar actually paints.

**Keep all of that.** The bar is already honest about progress; this task is an art pass over it,
not a rewrite of the mechanism. Do not replace measured weighting with a fake animation, and if
T3's chunk streaming adds a boot stage, add it to `STAGE_MS` with a measured figure rather than a
guess.

### Scope

1. Letterboxed band with a dark textured road surface and skid marks. Generate it - CSS gradients,
   an inline SVG, or a small canvas - rather than shipping a photo. It has to look deliberate at
   both 720p and 1080p and must not be a stretched bitmap.
2. Our own badge logo, centred, with the reflection beneath. **Our own art and our own name.** Do
   not reproduce the Paradise crest, its wordmark, or its typography - the reference is a
   composition and mood reference, exactly as T3 treats the map. Same rights line as T3.
3. Keep the loading line. Restyle it to sit in the composition - the reference's "Loading" text is
   low and right of centre, so the natural place for the line is under or beside that text rather
   than floating mid-screen. `#bootlabel`'s stage text stays; it is useful.
4. Keep the `.gone` opacity fade-out into the game.

### Careful about

`shotMode` returns from `stage()` immediately (`main.js:160`) because the screenshot harness wants
no extra frames. Whatever is added must stay invisible to that path, or every visual regression
still gains a loading overlay and the whole gate goes red.

`#boot` is plain DOM above the canvas, and it must stay that way. Do not move it into `hud.js`'s
canvas or into the three.js scene - it has to render before any of that exists, which is the
entire point of it.

No web fonts and no network fetch on the boot path. The screen's job is to be up instantly; a
font that arrives late is a screen that flashes. `system-ui` is already what the boot block uses.

### Acceptance criteria

- Screenshot at 1280x720 and at 1920x1080, both attached to the verdict. The band, the badge, the
  reflection and the line all sit correctly at both; nothing is stretched or clipped.
- The line still tracks real boot stages. Show it at rest mid-boot at a stage boundary, not just
  at 0% and 100%.
- Boot time is not measurably longer. State before and after with `?bootlog=1`.
- The visual regression gate is unchanged for every scene in `scenes.js` - i.e. `shotMode` never
  sees the new screen.
- Nothing on the boot path fetches from the network.
- No Paradise wordmark, crest or typeface reproduced. State in the verdict what the logo is
  instead.
- `bash tools/lint.sh` clean.

---

## T21 - Pausing with Esc must silence music and SFX

**Mode: solo.**
**Depends on: nothing. Owns `main.js`'s pause block, `audio.js` and `music.js`.**

### What the user reported

> "When I pause with Esc all music and SFX should pause."

### Why it happens today

`main.js:1055` is the whole story:

```js
if (paused) { renderFrame(); requestAnimationFrame(frame); return; }
```

The paused path returns before `physics`, before `tick()`, and therefore before anything that
drives audio. That is correct for the simulation and wrong for sound, because nothing in
`audio.js` is told to stop - it is simply never told anything again. The engine synth's `set()`
stops being called, so every oscillator and gain HOLDS at its last value and the engine becomes a
flat drone for as long as the menu is open. Music is a separate `<audio>` element (`music.js`) that
is not on the frame loop at all, so it just keeps playing.

`ctx.setPaused` (`main.js:1009`) currently does one thing - clears the key map. It is the hook.

### What to build

- Silence on pause, restore on resume, through `ctx.setPaused`. Do not scatter audio calls through
  `menu.js`; `setPaused` is already the single choke point and both the Esc path (`menu.js:738`)
  and the resume (`menu.js:756`) go through it.
- **Music pauses and resumes from position**, not from the start. It is an `<audio>` element, so
  `el.pause()` / `el.play()` already do exactly that. Do not reimplement it.
- **SFX stop, they do not freeze.** Ramp the engine bus to zero rather than cutting it dead - a
  hard gain cut on a running oscillator bank clicks. `audio.js` already has a `ramp()` helper and
  the engine's own `set()` has a `gainMul`; use them. A short ramp (~60-80 ms, the same order as
  the existing envelope times) is enough.
- On resume the engine must come back at the CURRENT rpm and load, not at whatever it held when
  the menu opened.
- Prefer suspending the `AudioContext` outright over muting every node individually, if it
  restores cleanly. It is one call, it stops the CPU cost of the whole graph, and it cannot leave
  a node un-muted by omission. Ramp first, then suspend, or the suspend itself clicks.

### Careful about

`tools/shot.mjs` never constructs an `AudioContext` (`audio.js:38`), and `audio.js` is written to
never throw in that path. Anything added here must hold that: no unguarded `ctx.suspend()` on a
null context.

Browsers suspend an `AudioContext` on their own when a tab is backgrounded, and require a user
gesture to resume. Resuming must be robust to the context already being suspended or already
running - check `ctx.state` rather than assuming.

`music.js` reads `playing` off the element, never off an intent flag (`music.js:272`), precisely so
a stalled load cannot lie about itself. Keep that - pause must not introduce a separate "we think
it is playing" boolean that can drift from the element.

If the player pauses while muted, or with music already stopped, resume must not start music that
was not playing.

### Acceptance criteria

- Esc during play: music stops and all SFX go quiet within ~100 ms. No held engine drone, no click.
- Resume: music continues from where it stopped, and the engine returns at the correct rpm.
- Pausing with music already off leaves it off on resume.
- Pause/resume ten times in a row: no drift, no doubled playback, no orphaned oscillator.
- `tools/shot.mjs` unaffected, visual regression gate green.
- `bash tools/lint.sh` clean.

---

## T22 - Drivable pavements, and knockable street props

**Mode: solo.**
**Depends on: nothing, but RE-VERIFY after T3 - the map rewrites the block layout this reads.**
**Owns `physics.js` `collide()`, `polefall.js`, and `world.js`'s prop placement.**

### What the user reported

> "The collision on buildings in downtown should be reduced so I can drive on sidewalks, and small
> low fences are collidable like street lamps."

Two things. The first is a bug with a one-word fix; the second is new work.

### Part 1 - the invisible wall is at the kerb, not at the building

`world.js:1186` stores TWO extents per block, and has all along:

```js
blocks.push({ cx, cz, w, d, bw: w - LAYOUT.walkW * 2, bd: d - LAYOUT.walkW * 2 });
```

`w`/`d` is the paved block, **kerb to kerb**. `bw`/`bd` is the **building line**, held back by
`LAYOUT.walkW = 7.0` m so there is real pavement for props and awnings (`world.js:1184`).

`physics.js:862` `collide()` uses `b.w / 2` and `b.d / 2`. So the collision box is the kerb line,
and the car is stopped by a wall standing 7 m out in the open air from any actual facade. That is
exactly what the user is hitting.

`camera.js:265` already handles this correctly - `b.bw !== undefined ? b.bw : b.w` - so the camera
has been using the building line while physics used the kerb. Physics should match.

**The fix is to collide against `bw`/`bd`, with the same `!== undefined` fallback camera.js uses**,
so a block from anywhere that has not set them still behaves.

**No kerb penalty. The user's call: driving up onto the pavement is free.** No bump, no grip loss,
no speed cap. Do not add one, and do not fold pavements into T4's off-road surface.

Watch out for:

- The `+ 1.0` hero half-width in `collide()` stays; it is the car's radius, not part of the block.
- Parked cars and street furniture sit ON the pavement. Everything placed between `bw/2` and `w/2`
  is now somewhere the hero can reach, which is what part 2 is about.
- Traffic and parked ranks are placed off the kerb line elsewhere. Confirm nothing else in the
  tree assumed `w`/`d` was the drivable boundary - grep for `.w / 2` and `.d / 2` across `game/`
  and state what you found.
- The visual regression gate will not catch this because it is invisible geometry. Prove it by
  driving: the car reaches a facade and stops AT the facade.

### Part 2 - low props knock down like street lamps

`polefall.js` already does exactly what is wanted, for street lamps and traffic lights: on contact
the baked instanced prop is hidden via `world.js`'s `hide()`, a dynamic copy from a pool of 6
topples in the hero's direction hinged at its base, rests, sinks through the road and is released.
**The hero is deliberately unaffected - no shunt, no speed loss.** Contact is a 1.3 m disc test
against the hero's centre.

**The user confirmed: the low props get the SAME treatment. No effect on the car at all.** Plough
through, prop topples, speed unchanged.

The user's "small low fences" means the props already in the tree, not a new fence type. Do not add
fences. The candidates are placed in `world.js:2274`'s street-props block:

bollards, parking meters, hydrants (body + cap), bins, benches (seat + legs), planters (+ shrub),
palms (trunk + fronds).

Judgement calls the builder owns, and must state:

- **Bollards, meters, hydrants, bins** are unambiguously in. They are small, low and exactly what
  the user described.
- **Benches and planters** are heavier and read as fixed. Include them, but say how they look
  toppling - a planter that flips like a bollard will look wrong.
- **Palms** topple as trees, not as poles. If reusing the pole hinge makes a palm look like a
  falling lamppost, leave palms out and say so rather than shipping it broken.

### Scope for part 2

1. Extend `polefall.js` to take more prop kinds rather than writing a second system. It already
   re-poses its slot children per kind at knock time; that is the extension point.
2. `POOL = 6` was sized for lamps. Driving a pavement clips props in quick succession, so raise it,
   and state the count and its cost. Keep the oldest-stolen behaviour.
3. **`hide()` must route through `chunkRemap` in `world.js`.** This is the exact bug that cost T1
   three rounds: `hide()` wrote to a source instance pool the chunk cut had already zeroed, so it
   edited a mesh that no longer draws, and the prop stayed on screen. See the carried-forward
   warning at the top of this file. Every prop kind added here has the same failure mode.
4. `HIT_R = 1.3` is a lamp radius. A bench is wider than a bollard - per-kind radii, not one
   constant.

### Acceptance criteria

- The car drives freely onto and along the pavement anywhere in downtown, and is stopped only at
  the building facade. Show a position trace or a screenshot at the facade with the wall reached.
- No kerb penalty: speed across the kerb is unchanged. State the before/after speed.
- **Assert on the render side.** A knocked prop must be gone from the PICTURE - instance matrix or
  submitted instance count - not merely flagged hidden in an array. A simulation-side check stays
  green under the `chunkRemap` bug and this task is full of that bug's shape.
- Clipping ten props in a row leaves none stuck upright and none rendered twice.
- Hero speed is provably unchanged through every prop kind added.
- No frame-time regression. State the per-frame cost of the widened contact scan and confirm it is
  bounded by proximity, not by the size of the prop list.
- `bash tools/lint.sh` clean.

---

## T23 - Chase camera sits further back than Burnout's

**Mode: solo. One file, one measured number, no fan-out.**
**Depends on: nothing. Do it BEFORE T20's screenshots and before any new visual reference work,
because every scene shot in `scenes.js` reframes if this moves.**

### What the user reported

> "Compare the camera view to the view of Burnout Paradise - I think Burnout's camera is a bit
> closer."

**The user confirmed it reads too far AT ALL SPEEDS, including at rest.** That matters: it points
at the BASE POSE, not at the speed-varying terms. `distSpeed` is already `0.0` and `distBoost` only
`0.08`, so a rest-pose error cannot be coming from them.

### Do not start by tuning. Start by measuring.

This rig is already calibrated against Paradise, in unusual detail, and the calibration is
documented at `camera.js:10-27`. Read that block before touching anything. Measured off
`reference/dusk-highway-chase-02.jpg` and `-03.jpg` at native resolution, with the horizon solved
from the guardrail vanishing point (-02) and from two equal-height streetlamps (-03):

| quantity | Paradise reference |
|---|---|
| hero height in frame, **to the roof panel** | 19.1-20.5% |
| same, including scoop/wing appendages | 20.9-21.7% |
| contact line | 0.769-0.771 of frame height |
| roof-to-horizon gap | 7.8-8.8% |
| horizon | 48-50% |
| camera height | ~2.1 m |
| down-tilt | 1-2 deg on a 42-44 deg lens |
| **DEPRESSION** = (roof - horizon) / (contact - horizon) | **0.29-0.30** |

DEPRESSION is the load-bearing number and the one to trust. It is a ratio of two vertical offsets
from the same horizon, so focal length, resolution and aspect all cancel out of it - confirmed by
an empirical sweep. **The retired 0.21-0.22 target came from measuring -03's roof SCOOP as if it
were the roofline. `camera.js:24` says do not resurrect it. Do not resurrect it.**

**The user's call: re-measure the current build against these existing stills first.** The question
to answer before changing a single constant is whether the build still HITS its own documented
target. A rig that has drifted off 19-20% is a bug with a known fix; a rig sitting exactly on
19-20% that still feels far means the target is wrong, and that is a different task with a
different justification.

### How to measure - it already exists

`tools/_cammeas.js` is the harness. It projects every car vertex through the live camera at
1920x1080, takes the roofline from the body mesh only (`a.count > 1000`, the lofted shell - not the
wing) and the contact point from the lowest projected vertex, which is exactly the roof-panel
distinction the reference numbers depend on. `tools/_heromask.mjs` is the pixel-side cross-check.

Do not write a third measurement script. Two already disagreeing would be worse than either.

Measure at rest first, since that is where the user reports the problem, then across a speed sweep
to confirm the pose holds - `camera.js:27` claims that since r8 it holds at every speed rather than
only at the speed it was solved at, and that claim should be re-verified, not assumed.

### The knobs, in the order to reach for them

- `FRAME.distScale` (`camera.js:44`, currently `1.293`, "~5.6 m of clear air behind the rear
  bumper, per the stills"). The direct one. Note it was RAISED from 1.16 to hold the r7 pose once
  `distSpeed` stopped inflating it - so it is already carrying compensation for another change, and
  moving it moves the whole pose.
- `FRAME.heightScale` (`camera.js:66`, currently `1.029`). **Height is what sets DEPRESSION**
  (`camera.js:67`). Change distance and height together or DEPRESSION walks off its band while the
  car happens to look the right size.
- The scene triple at `camera.js:137`: `distance: 7.4`, `height: 1.75`, `fov: 44`.

Leave `distSpeed` at `0.0`. `camera.js:46` records why it is zero: a positive value stacked with
the FOV swing and the height droop to shrink the car by 24% and walk the contact line 0.085 of
frame height between rest and speed. That was a real regression, it was diagnosed, and it is not to
be reintroduced to solve a rest-pose complaint.

### Careful about

**Every scene in `scenes.js` inherits this framing** - that is the entire point of FRAME reshaping
the distance/height/lookHeight triple. Moving the camera moves every visual regression baseline at
once. Expect the gate to go red across the board, and treat that as the change being real rather
than as a failure to be suppressed. Re-baseline deliberately, in one commit, with the numbers
stated.

`camera.js:265` uses the block building line for its occlusion raycast. T22 changes what physics
considers solid; these two are independent and must stay independent - do not "fix" one via the
other.

The user said "a bit closer". A bit. Land inside the documented band and stop; do not chase a feel
past the measurement, because the measurement is the only thing here that is not an opinion.

### Acceptance criteria

- Measured before/after for the FULL table above, at rest, via `tools/_cammeas.js`. Not a
  screenshot and a claim.
- DEPRESSION inside 0.29-0.30 after the change, and stated.
- Hero at 19.1-20.5% of frame height to the roof panel at rest.
- A speed sweep showing the pose holds from rest to vMax and through a boost - state the drift in
  frame-height percent and in contact-line position.
- If the build was ALREADY inside the band before the change, say so explicitly and stop for the
  user's call rather than moving it anyway. That result means the reference target is what needs
  revisiting, and that is the user's decision, not a builder's.
- `camera.js`'s framing note updated with whatever the new numbers are. It is the only record of
  how this rig was derived and a stale one has already cost a round.
- Visual regression baselines re-taken for every scene, in one commit, with the reason in the
  message.
- `bash tools/lint.sh` clean.

---

## T24 - Source link in the menu

**Mode: solo. Trivial.**
**Depends on: nothing. Shares `menu.js` with T15 - do not run alongside it.**

### What the user wants

A link to the game's repository in the menu, at the bottom, with a sensible name:

    https://github.com/RichardBray/burnout-gauntlet

### Where it goes

`menu.js:609` already has the element to sit next to:

```js
const foot = h('div', 'foot', 'options apply live to the frame behind');
inner.appendChild(foot);
```

`foot` is the last child of `inner` and stays last in both modes - `orderCard()` (`menu.js:629`)
moves the controls block around it, never past it. So the footer is genuinely the bottom of the
card in both the start and the pause menu, which is what the user asked for.

Put the link in that footer. "Source on GitHub" or similar - the user asked for a sensible name,
not the bare URL.

### Careful about

- `target="_blank"` and `rel="noopener noreferrer"`. Without it the link navigates AWAY from a
  running game and the player loses their session. `noopener` is not optional on a `_blank` link.
- The menu owns its own DOM and its own styles in the `<style>` block built at `menu.js:98`. Add
  the anchor rule there with the rest, do not inline a `style=` attribute.
- The card is pointer-driven and sits over the canvas. Confirm the anchor is actually clickable -
  the HUD layer is `pointer-events: none` but the menu card is not, so this should just work;
  verify rather than assume.
- The start menu's click is the only legitimate user gesture on the boot path and is what unlocks
  WebAudio (`menu.js:6`). Clicking the link must not be mistaken for the DRIVE click or swallow it.
- Style it as a quiet footer link, not a button. The footer is deliberately low-emphasis and
  nothing in this task justifies competing with DRIVE for attention.

### Acceptance criteria

- The link appears at the bottom of BOTH the start and the pause menu, below the controls block in
  each.
- Clicking opens the repo in a new tab and the running game is untouched - still driving, still
  paused, whichever it was.
- `rel="noopener noreferrer"` present.
- No layout shift in either mode at 1280x720, where the card is already over-full (measured 956 px
  of content against 702 px of card, `menu.js:619`). State the new content height.
- `bash tools/lint.sh` clean.

---

## T25 - Dev tuning panel: bring it back, with a camera tab

**Mode: solo.**
**Depends on: nothing mechanically. Read the warning below before starting.**
**Requested by the user 2026-08-06, alongside T26.**

### What the user asked

> "In the dev mode with the slider, I would like a new tab with the option to adjust the game
> camera."

### Read this first: the panel does not exist any more

T9 built `game/devtune.js`, the user tuned with it, the six moved figures were applied in
`2082b36`, and the panel was then DELETED on purpose - the module, its `main.js` import,
`tools/_devtune-check.mjs` and the `export` on `camera.js`'s `FRAME` all went. T9's own closing
note says do not resurrect it to tune something else "without saying so".

**The user has now said so.** That is what this task is: a deliberate, recorded resurrection.
Recover the module from `f095b88` rather than rewriting it from scratch - it already carries the
green-versus-amber "differs from the code default" colouring, and that colouring is precisely what
made the last tuning session cheap to read back from two screenshots.

### Scope

- Restore `game/devtune.js` and its single `main.js` import, still behind `?dev=1` / backtick, so
  it can never appear in normal play and costs nothing when off.
- Restore the `export` on `camera.js`'s `FRAME` that the panel reads.
- **Add a CAMERA tab.** T9 already had camera sliders mixed into one long list; the user is asking
  for them to be their own tab. At minimum: chase distance, height, `lookAhead`, `lookHeight`,
  fov and `fovSpeed`, the yaw/look stiffnesses (`stiffness`, `lookStiffness`, `yawLag`), and the
  slip terms (`slipAim`, `steerLead`, `slipSwing`).
- **`lookAhead` is the trap.** It is set per scene in `scenes.js`, not in `camera.js`, and
  `dusk-highway-chase` IS the play camera (`main.js` defaults `sceneId` to it). A slider that
  writes `camera.js`'s default will appear to do nothing. Write through to the live rig and say in
  the panel which file the final figure has to land in.

### Relationship to T23

**T23 is the reason this is worth doing now.** T23 says the chase camera reads too far back at all
speeds, which is a BASE POSE error, and a base pose is exactly what a slider finds in a minute and
a static screenshot argues about for an hour. Do T25 first, then settle T23 on the panel.

### Acceptance criteria

- Panel appears only under `?dev=1` / backtick. Zero per-frame work when off - confirm it, do not
  assume it.
- Camera tab changes take effect instantly while driving, no reload.
- Every slider shows its live numeric value, and green/amber "differs from default" colouring is
  preserved.
- Live readouts for speed, yaw rate and slip angle are still present - tuning a camera blind is
  guesswork in the same way tuning drift blind was.
- Still removable in one commit: one module plus one import.
- `bash tools/lint.sh` clean.

---

## T26 - A pannable map in the menu

**Mode: solo.**
**Depends on: T3. This is a view onto the map, so there has to be a map worth panning.**
**Requested by the user 2026-08-06, alongside T25.**

### What the user asked

> "In the menu, there needs to be a map option for the player to pan around and see what else
> there is."

### Scope

- A MAP entry in the pause menu opening a full-card view of the road network, drawn from the same
  `game/map/` graph JSON T3 makes the durable artefact. Do not author a second map representation;
  if the minimap in `hud.js` and this view disagree, the graph is the one that is right.
- Pan by drag, zoom by wheel, both clamped to the map's bounds so it cannot be lost off-screen.
- Show the hero's current position and heading.
- Close returns to the pause menu with the game still paused and no input leaked to `main.js` -
  respect the capture-phase key handling at `menu.js:873`.

### The hard constraint this collides with: NO FAST TRAVEL

T6 states it flatly - no teleport to a marker, no menu entry that relocates the hero, "the drive
between events IS the game". A pannable map is one click away from becoming a travel affordance,
so **the map is READ-ONLY**. Nothing on it is clickable-to-go. It answers "what is out there",
which is the question the user actually asked, and nothing else.

### What may be shown on it, and what may not

T6 is equally explicit that discovery is the point: after the first guided event, nothing is
listed or waypointed for the player. So the map shows the ROAD NETWORK and the things the player
has already found or completed - not an index of everything that exists.

- Show: roads, districts and named landmarks; time attacks already completed, with their earned
  medal; billboards already smashed; the first-run guided event while it is still pending.
- Do not show: undiscovered time attacks, unsmashed billboards, ramps, or any "N of M collected"
  counter that turns discovery into a checklist.

If the user wants full disclosure later that is a one-line change, but shipping it that way by
default would quietly overrule T6.

### Acceptance criteria

- Opens from the pause menu, pans and zooms smoothly, clamped to bounds.
- Hero position and heading are correct - verify against `physics.state.pos` after driving.
- Nothing on the map moves the hero. Grep for position writes as T6 requires and state what
  you found.
- Undiscovered content is not revealed.
- No frame-time cost while the map is closed. The game is paused while it is open, so its own
  cost is not a 60 fps concern, but state what it is.
- Readable at 1280x720, where the menu card is already over-full (`menu.js:619`).
- `bash tools/lint.sh` clean.
