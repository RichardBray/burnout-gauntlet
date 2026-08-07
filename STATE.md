# STATE — Burnout Gauntlet

Last updated: 2026-08-07 (session 18, wave T opened)

## READ THIS FIRST. IT SUPERSEDES EVERY OTHER "EXACT NEXT ACTION" IN THIS FILE OR IN THE ARCHIVE.

### THE PROJECT PIVOTED IN SESSION 16. THE VISUAL WAVES ARE CLOSED.

Waves K through R chased `reference/` photographs with pixel metrics, for eight waves and nine
pieces.
**That is over, by the user's explicit instruction.**
The visual bar is MET.
`reference/` and every pixel metric are now a **REGRESSION GATE, not a target**: no scene may be
made to look worse, and not one agent may be spent making a scene look better.
Burnout Paradise is a console game and this is a web game; that comparison is closed.

**Do not open a new visual wave.
Do not write a new visual critic sweep.
Do not read the visual record looking for a task.**

The bar is now **how it plays**, and it has two halves:

1. **60 fps sustained at 1280x720 REAL pixels**, measured on this machine, never estimated.
2. **Handling that feels like Burnout Paradise**, matched to researched numbers.

Everything binding about the new bar is in **`tools/WAVE-S-PLAY-BRIEF.md`**.
Brief every agent with that file path.
It carries the 720p measurement contract, the measured baseline, the instrument, the runtime knobs
and every process rule that survived from the visual waves.

### FILE LAYOUT

- **`STATE.md`** (this file) - the live record, the EXACT NEXT ACTION, and the permanent rules.
  Short on purpose. Read all of it.
- **`tools/WAVE-S-PLAY-BRIEF.md`** - the binding brief for the playability era.
  Complete; amend it, never rewrite it.
  **Still binding in wave T.** The map brief adds to it and does not replace it.
- **`tools/WAVE-T-MAP-BRIEF.md`** - the binding brief for **wave T, the map (T3)**.
  Graph schema, validator contract, chunk contract, load-time and frame-time rules, piece list.
  Brief every wave-T agent with BOTH brief paths.
- **`TASKS.md`** - the user's feature backlog and its own wave plan. Wave 4 is the map wave.
- **`STATE-HISTORY.md`** - the whole visual-wave record, waves K through R, reverse-chronological.
  **Never read this file.**
  Nothing in it is actionable.
  It exists only so a claim can be audited by `grep`.
- **`tools/STANDING-CONSTRAINTS.md`** - the retired and corrected visual targets and anchors, each
  claim cited to its verdict file.
  Only relevant if a regression-gate question comes up.
- **`tools/WAVE-P-BRIEF.md`**, **`tools/WAVE-Q-CRITIC-BRIEF.md`**, **`tools/WAVE-R-ADDENDUM.md`** -
  the visual-era briefs.
  Superseded by the play brief.
  Their process rules were folded into it; their targets were not, and must not be re-issued.

**THE TRIM RULE. When STATE.md passes ~400 lines, PREPEND the oldest block to `STATE-HISTORY.md`
and leave a one-line pointer where it was.**
Before you move a block, confirm its substance is preserved in `tools/WAVE-S-PLAY-BRIEF.md`, in
`tools/STANDING-CONSTRAINTS.md`, or in the wave's own `verdicts/` files.
Anything live and preserved nowhere else gets added to the play brief rather than dropped.
Opening a new wave block is the moment to do this, not later.

### WAVE T — LIVE. THE MAP. `TASKS.md` wave 4, task T3. Opened session 18, 2026-08-07.

**EXACT NEXT ACTION: the `generate` piece — build roads, kerbs, junctions and buildings FROM the
graph, and in the same commit flip `world.js`'s `surfaceAt` onto `game/map/graph.js`.** The
graph-backed `surfaceAt` is written, verified and fast; it is deliberately not wired, because the
world on screen is still the `LAYOUT` grid and the graph is a different city — pointing it at the
graph before `generate` would answer 'dirt' everywhere the player is and fire T4's off-road penalty
on every road. `world.js` carries a comment at the swap point saying so.

Read the chunk contract in the brief BEFORE writing the generator, not after. The rule that decides
whether this task ships at 3.5 s or 14 s is that **nothing outside the hero's resident chunk set
may be BUILT during boot** — and it must be asserted on what EXISTS at `__ready`, never inferred
from a frame time.

The binding brief is **`tools/WAVE-T-MAP-BRIEF.md`**. Read it and the play brief before anything.
Its one-sentence version: replace `LAYOUT` in `world.js` with a road GRAPH, generate the world from
that graph in chunks around the hero, and prove the graph is connected before anything is built
from it.

| piece | owns | state |
|---|---|---|
| `digitise` | `game/map/paradise.json`, `game/map/validate.mjs` | **DONE.** `verdicts/wave-t/digitise.md` |
| `queries` | graph spatial index, `surfaceAt` off `LAYOUT` | **DONE.** `verdicts/wave-t/queries.md` |
| `generate` | graph -> roads, kerbs, junctions, buildings | **NEXT.** Owns the `surfaceAt` swap |
| `stream` | chunk build/dispose around the hero | not started; needs `generate` |
| `rewire` | `traffic.js`, parked ranks, signals, `physics.js` blocks, minimap, spawns | not started; needs `queries` |
| `skyline` | far LOD / impostors | not started |
| `perf` | load time and frame time | not started; runs ALONE on the machine |

**`digitise` IS DONE**, including two follow-up passes the user asked for. `game/map/paradise.json`:
**688 nodes, 929 edges, 78.81 km** of centreline over 4000 x 2861 m, ONE connected component,
strongly connected, **min degree 2, ZERO dead ends**.

**THE USER'S RULE IS STRICTER THAN THE BRIEF'S WAS, AND IT WINS: no hanging roads, no cul-de-sacs,
no dead ends, it all connects.** The brief originally allowed a degree-1 node if it was explicitly
flagged `deadEnd: true`. That is gone. Every node has degree 2 or more, `deadEnd` must be `false`
everywhere, and the validator rejects a graph that sets it - a flag is an annotation, not a road,
and the car still stops. Confirmed by `game/map/validate.mjs` AND independently by
`tools/_mapconnect.mjs`, a second implementation sharing no code with it: every node reaches every
other node and back, 200 random pairs round-tripped. `game/map/validate.mjs` runs from `tools/lint.sh` and is mutation-tested — a
severed network, a cleared `deadEnd`, a stranding `oneWay` and a ghost node reference all exit 1
while the real file exits 0. Rebuild the whole chain with `bash tools/map-build.sh`.

Full write-up, including what is honestly missing, is `verdicts/wave-t/digitise.md`. Three things
from it that will cost the next session a day if they are rediscovered instead of read:

- **THE OVERLAY IS THE ACCEPTANCE TEST, not a debug convenience.** `verdicts/wave-t/digitise-overlay.png`
  draws the graph back over the source image. Every numeric check on a road graph passes just as
  happily on a graph that looks nothing like the city, and the overlay caught two defects that no
  number in the pipeline would have shown: **the motorway was missing from the map entirely** (it
  is gold, and the mask was "bright and desaturated"), and then **the classifier found the event
  pins instead of the motorway** (pins are gold discs too).
- **Print the kilometre figure at every stage.** Merging nodes by PROXIMITY chained transitively
  and silently ate 40 of 83 km; contracting short EDGES is bounded and cannot. The stage-by-stage
  km print is the only reason that was caught.
- **THERE IS A RAILWAY ON THE MAP AND IT MUST NOT BE TRACED.** A dark reddish line loops the city;
  75% of it coincides with the motorway corridor the graph already has, and the other 25% runs over
  open water and mountainside with NO ROAD UNDER IT. That quarter is correctly uncovered. Do not
  chase it to raise a coverage number - it would lay drivable road across water.
- **A coverage metric over a noisy mask measures the noise.** Asking what share of the ROAD MASK
  had no graph edge near it returned 43.6%, which was rock, surf, beach and roofs. The honest
  quantity is coverage of the traced CENTRELINE: 13.5%, now 12.9%.
- **Dead ends are removed, not annotated.** Stubs are first SNAPPED into the network wherever a
  real junction was missed - 5 to a nearby node, 21 split onto the middle of another road to make a
  T-junction - and only what still dead-ends after that is deleted, 38 fragments totalling 2.51 km
  (3.1%). Every one was inspected on overlay crops first and not one was a genuine cul-de-sac; they
  are all places the mask lost a road that visibly continues.

`oneWay` is false everywhere and `elevationClass` is `ground` everywhere — both honest nulls, since
a top-down still shows neither. Do not read them as unfinished work to go and fill in blind.

**`queries` IS DONE.** `game/map/graph.js` indexes the graph's 2373 segments into a uniform 64 m
grid (2944 cells, 2.17 segments per cell, 92 KB, built in 3.0 ms) and answers:

- `surfaceAt(x, z)` at **189 ns**, 43x faster than a brute-force scan and identical to it on all
  10000 probes. Four wheels for one frame costs **0.00075 ms** of a 16.7 ms budget.
- `nearest(x, z)` at 760 ns, returning `{ dist, edge, t, x, z, seg }` — the edge, the parameter
  along it and the closest point, which is what `rewire` needs for traffic lanes and `generate`
  needs for junctions.

`tools/_mapquery.mjs` is the check and it compares against brute force written separately in the
harness. **Half the probes are on tarmac on purpose**: uniform random points over a 4000 x 2861 m
map are almost all dirt, so a uniform-only probe set passes against an index that always says
`dirt`. 6000 probes walk the segments with a jitter that straddles the kerb face, because the
boundary is where a grid index fails — by missing a segment registered in the next cell.

Uniform grid over an R-tree because road segments are short, similar in length and evenly spread;
CSR layout over per-cell arrays because chunk streaming will rebuild indices as the hero moves and
a few thousand small arrays per rebuild is garbage that world does not need.

One improvement over what it replaces: `LAYOUT` used a single hardcoded `PAVED_HALF = 13.0` for
every road; the graph version uses each edge's own `width / 2 + 3`, so a motorway's paved corridor
is properly wider than a service road's.

**WHAT LANDED IN THIS WAVE'S PREP (no game code touched):**

- **The source map is sourced and recorded.** `reference/map/street-names.jpg` (1759x1184) is the
  PRIMARY - it is the only candidate carrying district boundaries, and it labels all five
  districts and the airport, quarry, island and stock-car circuit. `reference/map/ign-map.jpg`
  (1349x965) is the SECONDARY, lower resolution but with a clean road network and legible road
  CLASS colouring. Both provenance-recorded with rejected candidates in `reference/map/SOURCES.md`.
  **Street names and elevation are NOT sourced and are not worth another session** - see that file.
- `tools/WAVE-T-MAP-BRIEF.md` written.
- The trim rule was run: session 16's plumbing commit and the whole wave-S record are now in
  `STATE-HISTORY.md`.

**THE FINDING THAT SHAPES THE WHOLE WAVE.** Every road-aware system in the tree reads `LAYOUT`
(`world.js:15`, twelve numbers) rather than any built geometry - `surfaceAt`, the road/kerb/building
generation, parked ranks, signal queues, `traffic.js` lanes, `physics.js` blocks, the minimap and
`scenes.js` spawns. So there is exactly ONE thing to replace, and the port order follows from it:
**give the consumers a graph query first, generate meshes second.** The reverse order rewrites
every one of them twice. `surfaceAt` is the canary - smallest consumer, already injected rather
than imported. If the graph cannot answer it cheaply per frame, the graph is wrong.

**THE FAILURE MODE THIS WAVE MUST NOT SHIP:** building the whole graph's meshes at boot and using
the chunk system only for disposal. It passes every functional test in T3 and quietly turns a
3493 ms cold load into ~14 s. Assert on what EXISTS at `__ready`, not on a frame time.

### SESSION 17 — TASKS.md WAVES 0 AND 1. Commits `f095b88`, `80477c4`, `c5770d7`, `7330f1a`, `45e7e6c`.

`TASKS.md` is the user's seventeen-feature backlog and its own wave plan. Waves 0 and 1 are done;
wave 1's T16 is the only item still open at the time of writing.

- **T9, the dev tuning menu** (`f095b88`). `game/devtune.js`, 26 sliders over steering, drift and
  camera, writing straight into the live `TUNE` / `camRig.config` / `FRAME` objects. **TEMPORARY:
  it is deleted once the user reports final figures**, and that closing step is wave 2.
  A `git worktree` at `../burnout-tune` is pinned to this commit so the user can tune against a
  stable tree while agents rewrite the main one.
- **T1, struck parked cars** (`80477c4`). The promotion path was never broken; the impulse was
  too small to see. Now a real momentum exchange, with spin from the lever arm rather than a coin
  flip. Full numbers in `verdicts/wave-s/t1-t17-parked-cars.md`.
- **T17, the C crash key** (`80477c4`, `7330f1a`). Gone, prose updated rather than deleted.
- **T14, menu cleanup** (`c5770d7`) and **T12, drift metres** (`45e7e6c`). Built by glm-5.2 and
  gpt-5.6 in live sessions against `tools/BRIEF-T14.md` and `tools/BRIEF-T12.md`, both verified
  independently before landing; T12 needed two defects fixed on top.

**Three corrections to `TASKS.md` were found by reading the code, and are recorded in the
verdicts rather than left to be rediscovered:** `gripLow` and the `1/(1+(sn-gripLow)*1.35)` yaw
decay factor do not exist (the curve was rewritten to `min(rGrip, rGeo)` in wave-S round 2); the
orbit camera was never shared between the C key and the real crash path; and T16 needs
`traffic.js`, which the wave-1 plan assigns to a different agent, so it was resequenced behind T1
rather than run concurrently.

**FRAME TIME IN THIS SESSION IS SMOKE-TEST ONLY.** Peer agents were running throughout, which the
play brief forbids reporting a frame number under. Re-take alone before quoting any of it.

**THE TRIM RULE WAS RUN when wave T opened**, taking this file from 474 lines back under 300.

### THE DEFECTS THE USER REPORTED FROM PLAYING IT. This is the source of the wave-S work list.

- **Steering was INVERTED.** Right steered left.
  **FIXED**, at the INPUT mapping in `game/main.js`, where left now maps to `+1`.
  It had to be fixed there and not on `yawRate`: `physics.js` integrates `yaw += yawRate*dt` and a
  positive Y rotation in three.js is counter-clockwise seen from above, i.e. a LEFT turn, but
  `yawRate` also feeds `lat`, which drives `slip` and `lean`, so negating `yawRate` would have made
  the car bank the wrong way through corners.
  **Any future change to this chain must preserve that invariant: D turns right AND the body leans
  away from the turn centre.**
- **The traffic was a car park.** 2667 vehicles, all standing still.
  Density won a screenshot metric, and a still frame cannot tell a parked car from a moving one, so
  the loop optimised toward something wrong.
  This is the clearest example in the whole project of a metric coming loose from the thing it was
  supposed to measure, and it is worth remembering that the loop produced it while every visual
  number improved.
- **The car did not feel right.**
- **No scene picker and undiscoverable controls.** The user had to ASK what boost was bound to.

### SESSION 16'S PLUMBING COMMIT AND THE ENTIRE WAVE-S RECORD — MOVED TO `STATE-HISTORY.md`.

Trimmed when wave T opened. What still binds from it lives in `tools/WAVE-S-PLAY-BRIEF.md` (the
720p contract, the baseline, the instrument, the runtime knobs) and in `verdicts/wave-s/`. The
archive is for auditing a claim by `grep`, not for reading.

### A MEASUREMENT RULE THIS WAVE ADDED, AND IT IS NOT OPTIONAL

**`p50 <= 16.7 ms` IS NOT `60 fps sustained`. Report p50 AND delivered fps AND the share of frames
over 16.7 ms, every time.**
`cruise` sat at p50 15.90 ms — inside the bar — while dropping **23.3%** of its frames and
delivering 60.0 fps.
A p50 that passes with a quarter of the frames long does not feel like 60 fps, and reporting p50
alone would have declared the bar met on a scenario a player would call uneven.

**AND: MEASURE SIGNED, NOT ABSOLUTE.**
Round 3's biggest find was invisible to two previous instruments because both measured heading change
as `|yaw - yaw0|`.
An absolute value scores a car rotating the WRONG WAY as a car rotating well; the car was spinning
away from the corner at 96 deg/s and both instruments read it as a success.
**Any instrument measuring a directional quantity must keep the sign.**

## THE PERMANENT RULES. Everything above this line is the live record; everything below was paid for in rounds.

### NEW CONCURRENCY RULE — nine concurrent builders is PAST THE LIMIT

Wave N ran nine at once and the paired-A/B discipline nearly broke down. Recorded damage:
car.js went transiently NON-PARSING inside another builder's measurement window; road.js spent
part of the round rendering a blown-out false-colour debug ramp that zeroed every fill
statistic; scene exposure moved 73 -> 213 -> 72 mid-round; `intactFlank` swung 99.5 -> 194.7
across renders with identical damage.js. Three separate builders had to reconstruct their
pre-edit file byte-exactly (md5-verified) and interleave A,B,A,B to get a usable pair.

**From Wave P on: run builders in two batches of 4-5, and put coupled pieces in DIFFERENT
batches.** Known couplings: crash x boost (smear kernel), car x damage (`syncFromPaint` env
probe is `partUnder`'s only light), sky x everything (exposure/grade), and **NEW IN WAVE R:
boost x road** — boost's T1 denominator is the `road.js`-owned nofx frame, and a peer road edit
moved it 0.99 -> 1.08 (T1 0.394 -> 0.361) while boost's own fx frame stayed bit-stable. Builders must still
reconstruct-and-interleave; that technique worked and should be in the brief, not rediscovered.

### THE FOUR RULES THAT WERE PAID FOR IN ROUNDS. DO NOT REDISCOVER THEM.

1. **Critic sweeps and builder waves strictly alternate; never overlap.** Wave J proved
   concurrent builders perturb each other's headline metrics badly enough to invalidate
   unpaired before/after measurements (road watched its ratio move 0.86 -> 1.11 with zero
   road.js changes, because sky.js landed an aerial-perspective change mid-round).
2. **Per-piece run-to-run render noise is 0.00. Paired atomic A/Bs are still not optional.**
   The old "+/-0.04" figure in this rule is SUPERSEDED and must not be quoted again. Post
   determinism fix, measured frozen-tree noise is **0.00 on every metric across all four
   presets**, n=3 each, every replicate printing an identical `_facademeas` line including the
   integer band-pixel count (`verdicts/wave-p/post-determinism.md`); the honest pixel-level
   caveat is `<=0.005%` of pixels at `<=9/255`. Paired A/B therefore costs 2 renders, not 8.
   **Keep paired A/B anyway.** Its real job was never the noise floor: every large mid-round
   swing previously written off as noise was CROSS-PIECE COUPLING, and that hazard is untouched
   by the seed fix. `boost-blur` was not one of the four presets measured, so render it twice
   until someone measures it.
3. **A metric that can be satisfied by aliasing, by inaudible signal, or by the wrong object
   is not a metric.** This failure has now happened four times: car glass matched p99 while
   reading as corduroy; boost's spectral sweep scored perfectly at an inaudible -50 dB; boost's
   plume was stretched to 6.5:1 to match a HUD graphic instead of the car; road exceeded the
   12.48 grain anchor at 13.38 using per-pixel aliasing. The model fix is a SCALE-PERSISTENCE
   ratio — measure at 1920 and at 960 and require the ratio to hold, which aliasing cannot fake.
   **If a number says we match but the image reads wrong, the number is the broken thing.**

   **WAVE O AMENDMENT — SCALE-PERSISTENCE IS NOT A COMPLETE GUARD. This is the project's own
   safeguard and it has now been beaten.** P only rejects PER-PIXEL aliasing. A **20 px coherent
   comb scores 1.35** and sails through. Boost moved P 0.57 -> 1.36 by trading 1 px noise for a
   low-frequency herringbone (NP=16 stations x 12 wedges/radian), and `_heromask` fx-vs-nofx
   shows hpRms **1.70 -> 14.74** — an 8.7x HF *increase* from a pass that is supposed to be a
   BLUR (ref 5.26). **Always pair P with an fx/nofx ratio (a blur must REDUCE HF) and with a
   crop.** A pass that manufactures structure is not filtering.
4. **Check every gain/amplitude term against the dynamic range of whatever consumes it.**
   Four Wave K gaps were the same bug class: a quantity pushed past the range its own
   downstream falloff can represent. Crash sparks at 2.8x additive clipped the first 63% of the
   authored `pow(v,2.2)` taper; car glass slope exceeded the pane's blur kernel; road's chip lens
   warped mirror UVs +/-6 texels per pixel with no matching mip; boost's box-mean accumulation
   averaged away the contrast it was supposed to smear. r8's glass-albedo>1.0 bug was the first.

   **Wave M confirms this is the dominant bug class in the project.** Five of the eight Wave M
   gaps are the same shape: audio's IGN_DEC (93 dB in 0.17 s), car's ungated metalness (1.0
   zeroes diffuse), damage's envMapIntensity 2.0 (drowns aoMap), road's fixed LOD bias (no
   distance term), boost's max-over-jitter (amplifies estimator variance). **Before writing any
   gain, ask what consumes it and what range that consumer can represent.**

Wave O damage-shot tool defect and the wave-O crash x boost cross-piece table: see STATE-HISTORY.md; all live constraints are folded into tools/STANDING-CONSTRAINTS.md.

### RULE 5 — NEW IN WAVE M. DO NOT TRUST A DOCSTRING. VERIFY THE CONSTANT.

The Wave M crash-cam critic found that the Wave L crash.js builder **rewrote the comments and
changed zero constants.** `crash.js:2118-2127` says "gains are now scaled so peak r sits just
above 1.0"; `:2131` still reads `r = 2.8`. `:2098` claims the streak scaler and the 2.6 m ceiling
came down; `:485/:988/:2104` are unchanged. `:196-209` describes a `VC` nose split in
`streakTexture` that **does not exist**. `:1259` says the panel fold scaler "now uses 1.5";
`:1269` still reads `6.4`. And `shots/crash-l1-sparks.png` (04:04) measures fill 4.32% against
the current 14.46% — **the builder had the fix working and reverted it before saving.**

Consequences, binding on every future wave:
- **Critics: never read a comment as evidence.** Grep the constant. The crash-cam critic caught
  this only because it probed the live scene and diffed against an intermediate screenshot.
- **Builders: your report is checked against `git diff`-equivalent constant values, not prose.**
  A comment claiming a change that the code does not make is the worst outcome available here —
  it costs the next full critic round to detect and it poisons the brief chain.
- This is why every builder must write `verdicts/wave-<letter>/<piece>.md` for its own wave with
  the BEFORE and AFTER literal values of every constant it touched, quoted with `file:line`.

### ONE STANDING CROSS-FILE ROUTE — honour it

The environment fix needs the real fog density, but `world.js:2749` historically read
`scene.fog.density`, a dead `0.001` placeholder hardcoded at `sky.js:1404` — a file the SKY
builder owns. The arranged route: sky exposes the true preset `d0` on `sky.fogParams[0]`;
world.js reads it READ-ONLY and never edits sky.js. Check `verdicts/wave-m/sky-lighting.md`
and `verdicts/wave-m/environment.md` for the symbol that actually exists now.

