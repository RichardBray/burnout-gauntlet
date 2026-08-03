# wave-s / traffic-critic - independent judgement of `wave-s/traffic` (commit 7d6badc)

Owns: `verdicts/wave-s/traffic-critic.md` and any tool I need under `tools/`.
Edits NO game code. Written BEFORE any measurement (wave-S process rule 1), appended as I work.

## 0. Tree check (process rule 2)

At start, `git status --short`:

```
 M PROMPT.md
 M driver.log
 M game/main.js
?? README.md
?? game/music/
```

`game/main.js` is dirty under me and it is NOT mine and NOT the traffic builder's - `git diff
game/main.js` is +24/-5 and belongs to a concurrently running peer (the physics/menu work). I do
not touch it and I note that every number below was taken against a tree that includes it. The
traffic commit itself (7d6badc) is clean and touched exactly three files: `game/traffic.js`,
`game/world.js`, `verdicts/wave-s/traffic.md`. No stray traffic edits outside the commit.

I am told I run concurrently with a physics rewrite, so **no frame-time number in this file is a
result**. Any that appear are smoke tests and labelled as such.

## 1. What I am judging, and what would make it fail

The defect this piece exists to fix: 2667 vehicles, zero of them moving. The pass condition is a
judgement, not a statistic: **would a player driving this build describe the traffic as alive.**
The opposite failure is equally disqualifying: the streets must not now read abandoned.

My plan, in order:

1. Re-derive the counts from the LIVE scene, not from the builder's report. Separate "exists" from
   "is actually moving", because a car that moves at 0.0 m/s is a parked car with extra code.
2. Drive for >= 30 s in city and on the highway and log per-vehicle kinematics every frame: lane
   discipline, speed distribution in km/h, body-on-body overlap, stationary fraction, spawn/retire
   visibility (pop-in in the camera frustum).
3. Kill-controls: hide the traffic group; freeze every vehicle's speed to 0; hide the world group.
   A claim that survives its own kill-control is about the wrong object.
4. Adversarial play: drive INTO traffic at speed, drive the wrong way up a carriageway, sit still
   in a junction box for 20 s, drive to the map edge, mash R.

## 2. Tool

`tools/_trafficplay.mjs` - my own harness, playwright + the same static server and chromium flag
set as `tools/fps.mjs`, driving the real playable path (`#nomenu=1`). It samples
`window.__game.traffic` every rAF frame from inside the page, so the per-frame record is not
sampled at node's polling rate. Nothing in it edits game code.

## 3. THE COUNTS, RE-DERIVED FROM THE LIVE SCENE

Not taken from `world.parkedCounts`. Counted off the sealed InstancedMeshes themselves: every
instance matrix in the mesh whose material `is` `world.carKit.carPaint` is decomposed and the
non-zero-scale ones are counted, then divided by 2 because `parkedCar()` pushes two `carBody`
instances per car (sill/slab + roof cap).

`node tools/_trafficplay.mjs --census --scene daytime-downtown`, headless chromium ANGLE/Metal,
1280x720, deviceScaleFactor 1:

| quantity | measured | builder said |
|---|---|---|
| baked `carPaint` instances | 2164, all non-zero scale | - |
| **standing (baked) vehicles** | **1082** | 1082 |
| `world.parkedCounts` | `{rank: 944, queue: 138, culled: 16}` (944+138 = 1082 exactly) | 944 / 138 |
| **live vehicles** | **56**, all 56 non-zero scale | 56 |
| `traffic.POOL` | 56 | 56 |
| scene meshes | 830 | 830 |
| traffic InstancedMeshes | 7 (5 with count > 0 in daylight, 7 at night - verified on `wet-night-asphalt`) | 7 / 5 / 7 |

**The counts are correct.** Live count over a 36 s city drive: mean 56.0, min 56, max 56. Over a
40 s highway drive: mean 56.0, min 55, max 56. It is a genuine hard ceiling, not an average.

### "Moving" verified as motion, not as code

A car that moves at 0.0 m/s is a parked car with extra code, so I integrated distance travelled per
pool slot over the window:

- city, 36 s: per-slot distance **min 210.4 m, max 504.9 m; slots that never moved: 0**
- highway, 40 s: **min 789.3 m, max 1048.1 m; slots that never moved: 0**

Every one of the 56 is really driving.

### The `laneTraffic()` claim, verified from the diff, not the prose (process rule 5)

`git show 7d6badc -- game/world.js`. Every literal the builder quoted is in the diff:

- `if (R() < 0.30) continue;` -> `if (R() < 0.40) continue;`
- `const n = rngInt(R, 3, 5);` -> `const n = rngInt(R, 2, 4);`
- `- az * 2.6` / `+ ax * 2.6` -> `- az * 7.4` / `+ ax * 7.4`
- the `if (R() < 0.5) { ... }` second-arm block: deleted
- `const carWheel = inst(new THREE.CylinderGeometry(...))` -> `const carWheelGeo = ...` hoisted
- `function laneTraffic(...)` and both call sites deleted. The deleted call sites were
  `laneTraffic(0, G[j], 1, 0, a0, a1)` and `laneTraffic(G[j], 0, 0, 1, a0, a1)` inside a loop over
  `G` - **the grid only**, so the builder's claim that `dusk-highway-chase` had exactly zero
  vehicles on six lanes before this wave is confirmed from the source.

### One number of the builder's that is WRONG: the draw-call cost

The builder reported "**5 draw calls in every non-night preset**". That is the *mesh count*, not
the frame cost, and the two differ by the number of scene-drawing passes. Measured with the game
PAUSED (`ctx.setPaused(true)` keeps rendering but freezes the camera and every other object's
frustum state) and the group toggled visible/hidden three times, 30 frames each, median:

| preset | traffic shown | traffic hidden | **traffic's real cost** |
|---|---|---|---|
| `daytime-downtown` | 837.0 calls/frame | 824.0 | **13.0 calls/frame**, 26 992 tris/frame |
| `wet-night-asphalt` | 1661.0 calls/frame | 1629.0 | **32.0 calls/frame**, 62 720 tris/frame |

13/5 = 2.6 and 32/7 = 4.6: each mesh is submitted once per pass that draws the scene (shadow map,
SSAO depth prepass, RenderPass), and `frustumCulled = false` on all seven means three cannot skip
any of them in any pass. Still cheap - 13 of 1101 calls, 0.2% of triangles - but 5 is not the
number and a later wave hunting draw calls would be misled by it.

My FIRST attempt at this A/B took the two windows while the car was still driving and reported
44.5 calls, because everything else's culling had moved between the windows. That is the wrong
answer and I am recording it so nobody re-derives it.

## 4. WATCHING TRAFFIC DRIVE

`tools/_trafficplay.mjs --drive {city|highway}`, real playable path, `#nomenu=1`, throttle held,
`physics.followPath` so the drive stays on the road it claims to be on. All-pairs body overlap is
computed every frame from inside the page; every traffic yaw is a multiple of 90 deg so the boxes
are axis-aligned and the test is exact.

| | city (`daytime-downtown`, 36 s, 1143 frames) | highway (`dusk-highway-chase`, 40 s, 1472 frames) |
|---|---|---|
| vehicle-frames sampled | 64 008 | 82 399 |
| speed p10 / p50 / p90 / p99 km/h | 10.8 / **44.0** / 52.4 / 56.9 | 73.4 / **84.3** / 96.9 / 108.7 |
| mean km/h | 38.8 | 83.7 |
| desired band (traffic.js:101/109) | 12.5-16.5 m/s = **45-59 km/h** | 25-33 m/s = **90-119 km/h** |
| stationary (< 0.5 m/s) | 5.77% | **0.00%** |
| longest single stop | 9.69 s | 0.00 s |
| lane error, mean / max | **0.000 m** / 0.546 m | 0.009 m / 0.941 m |
| body-on-body overlap | **0.000 m in 0 frames** | **0.000 m in 0 frames** |

Plus `--adversary ram`, `wrongway`, `sit`, `sit-offset`, `edge`, `rmash`, `--kill freeze`: over
roughly 340 000 vehicle-frames and ~9 million pair tests across all runs, **maximum body-on-body
overlap is 0.000 m in every single run.** Nothing telescopes, nothing drives through anything, and
lane discipline is a centimetre. Zero console errors in every run.

**Speeds are below the desired bands and the builder said so.** I confirm the miss and quote it in
km/h: city p50 44.0 against a 45-59 km/h band, highway p50 84.3 against 90-119. Highway p01 is
42.5 km/h - the slowest 1% of vehicle-frames are at less than half the band minimum, which is
platooning behind a slow car with no lane changing, exactly the cause the builder named.

### Pop-in and visible vanish

"In the camera frustum" over-reports pop-in badly downtown, because most of the frustum is behind a
building. So a spawn only counts as VISIBLE if it is in the frustum, within 320 m, **and** the
camera has an unoccluded line to it (2-D slab test of the camera->target segment against
`world.blocks`, the same boxes `physics.collide()` uses).

Also: slot reuse is same-frame. `traffic.update()` retires at the top and `fill()`s at the bottom
of the same call and `fill()` takes the first free slot, usually the one just retired, so a
"was it live last frame" test misses most of the turnover. Every position discontinuity larger than
a legal one-frame move is therefore counted as a respawn and frustum-tested like a fresh one. My
first pass did not do this and reported 7 in-view spawns instead of 35.

| | city, 36 s | highway, 40 s |
|---|---|---|
| spawns (incl. recycled slots) | 218 | 240 |
| in frustum | 50 | 125 |
| **VISIBLE (frustum + unoccluded)** | **35** | **125** |
| of those, within 120 m | **2** (69.5 m, 107.5 m) | **26**, closest **62.9 m** |
| VISIBLE retires | 1 (at 247.6 m) | 3 (at 172.6 / 225.3 / 262.9 m) |

Downtown this is fine: one visible near-field pop in 36 s. **On the highway it is not.** The
highway is a flat unoccluded straight, so nothing hides a spawn: 125 visible spawns in 40 s, 26 of
them inside 120 m - a car materialising in clear view roughly every 1.5 s, the nearest at 62.9 m,
which is `SPAWN_MIN` (traffic.js:62) doing exactly what it says.

The three visible RETIRES on the highway are a separate defect and the arithmetic pins it: the hero
was at x = 976 and the highway line's `hi` is 1150, so the line end was 174 m directly ahead - and
the measured vanish distances are 172.6 / 225.3 / 262.9 m. `traffic.js:458` retires on
`v.s > v.line.hi - 4` **regardless of distance to the hero**, so driving toward either end of the
highway you watch cars wink out of existence in plain sight ahead of you.

## 5. IS IT ALIVE? IS IT ABANDONED? Both answered with the same instrument.

"1082 parked + 56 live" is a map statistic. What decides whether a street reads inhabited is how
many vehicles the player can SEE, so I counted, every 6th frame, the baked and live vehicles that
are within 260 m, in the frustum, and unoccluded - baked positions pulled once off world.js's
sealed `carBody` mesh.

| scene | baked on screen | live on screen | total |
|---|---|---|---|
| `daytime-downtown`, city drive | 17.1 | **5.6** | **22.7** |
| `wet-night-asphalt`, city drive | 20.5 | **8.1** | **28.6** |
| `dusk-highway-chase`, highway drive | 0.0 | **18.8** | **18.8** |

**ALIVE: yes.** Nineteen moving cars on screen at any instant on the highway, on a road that
carried literally zero vehicles before this wave; six to eight moving cars on screen downtown at
0.00 m of interpenetration and 0% stationary on the highway. A player would call this traffic
alive without being prompted, and that is my explicit judgement on the pass condition.

**ABANDONED: no.** Kerb parking survived at 944 cars and the stop-bar queues at 138, and 17-21 of
them are on screen at once. `wet-night-asphalt` was the frame the builder honestly flagged as
losing raw in-view count; measured, it is the *most* populated of the three at 28.6 vehicles on
screen. The near field is parked cars at both kerbs and the carriageway is the moving population.
Screenshot: `shots/s/critic-traffic-none.png`, `shots/s/critic-traffic-night.png` (tail lamps read
clearly on two cars down the street).

## 6. KILL-CONTROLS

### (a) `traffic.group.visible = false`

Predicted change: the moving population disappears, the carriageways go to bare tarmac, and the
kerb parking stays. `shots/s/critic-traffic-hide.png` against `shots/s/critic-traffic-none.png`,
both taken from a **byte-identical parked hero pose** (`--adversary park`, hero frozen at
(-40, -325.1) facing +x, throttle released, so the camera is in the same world space in both).
Opened both: the green box van in the near right lane and the saloon mid-street both vanish; the
grey vans and cars along both kerbs remain. Draw calls 837 -> 824. **Exactly the predicted change.**

I deliberately do NOT report a pixel-diff percentage for this pair. The two runs diverge in spawn
RNG with frame count, so a diff number would be measuring wall-clock noise, not the kill-control.

### (b) freeze every vehicle's speed to 0

`traffic.update` wrapped from the page so the raw update still runs - population, spawning, lane
pose, junction state all intact - and then every `v.speed` is set to 0. Nothing else changes.

| | live | frozen |
|---|---|---|
| speed p10/p50/p90 km/h | 32.1 / 44.8 / 51.4 | **0.00 / 0.00 / 0.00** |
| per-slot distance over the window | 12.8 - 85.5 m | **0.47 - 0.53 m** (the lateral shy damp, nothing else) |
| slots that never moved | 0 | **56** |

The "alive" read collapses completely, so the claim is about vehicle motion and not about vehicle
count. **The right object.**

And the finding that matters most for this whole wave: `shots/s/critic-traffic-freeze.png` and
`shots/s/critic-traffic-none.png` are, as STILL FRAMES, near indistinguishable - both show cars
standing in a street. A still-frame critic would score the frozen build as a pass. That is the
wave-S pivot demonstrated on a plate: this piece cannot be judged from a screenshot, and the only
evidence that separates a live build from a car park is the kinematic record.

### (c) THE DEADLOCK, and the kill-control that names its owner

See section 7, finding 1. The kill-control is `--adversary sit-offset`.

## 7. THE BUGS THE BUILDER WOULD NOT SEE. Ranked, each with the repro.

### 1. Parking in a junction box locks the signal and freezes up to 9 cars. `game/traffic.js:503-509`

Repro: `node tools/_trafficplay.mjs --drive city --scene daytime-downtown --secs 30 --adversary sit`
- hero placed dead centre of the junction at (0, 0), throttle never pressed. Probe samples
`[t, signalPhase(0,0), nAxis0, stoppedAxis0, nAxis1, stoppedAxis1]` within 62 m every 15 frames:

```
[1.0, 1, 0,0, 1,0]      owner latches to N-S at t = 1.0 s
[9.4, 1, 3,2, 2,1]
[15.8,1, 5,5, 5,3]
[18.7,1, 7,5, 6,3]      owner has not changed once in 17.7 s; 8 of 56 vehicles standing still
```

A second run flipped once, at t = 18.8 s, and had reached 5 stopped on one axis and 4 on the other
by t = 31 s. Either way: park in a junction and roughly one sixth of the entire live population
freezes around it, with phase changes suppressed for 18 s at a stretch. That is the original defect
of this piece - vehicles that exist and do not move - regenerating locally, under an input a player
performs constantly.

**Kill-control, run:** `--adversary sit-offset` puts the SAME immovable hero in the SAME blocked
lane but 45 m short of the junction, so the car that stops behind him stops OUTSIDE the box:

```
[6.6, 0, 2,0, 2,1]
[8.4, 1, 2,0, 2,0]      flip
[16.7,0, 3,1, 2,0]      flip back; stopped never exceeds 1 on either axis
```

So the cause is not "the hero blocks a lane" - it is `if (j.occ > 0) { j.owner = j.occAxis;
j.heldT += step; continue; }` at traffic.js:503-509. Whoever is IN the box keeps it, forever, with
no watchdog on `heldT`, and a body stopped in the box is a body in the box. That line is also the
line that makes "cars never drive through each other" true, so it must not simply be deleted; it
needs a bounded hold.

### 2. Highway pop-in inside 120 m, about every 1.5 s. `game/traffic.js:62` (`SPAWN_MIN = 62`)

Repro: `--drive highway --secs 40`. 125 visible (frustum + unoccluded) spawns, 26 of them inside
120 m, nearest 62.9 m. Downtown the buildings hide it (2 in 36 s); the six-lane straight does not.

### 3. Cars vanish in plain sight ahead of you at the ends of the road lines. `game/traffic.js:458`

`if (_p.distanceTo(_hero) > DESPAWN_R || v.s < v.line.lo + 4 || v.s > v.line.hi - 4)`. The second
and third clauses ignore the hero entirely. Repro: `--drive highway --secs 40` ends with the hero
at x = 976 and the highway line `hi` = 1150; measured visible retires at 172.6 / 225.3 / 262.9 m,
i.e. right at the 174 m mark where the line ends.

### 4. Oncoming traffic does not react to a wrong-way hero AT ALL. `game/traffic.js:566-576`

Repro: `--drive highway --adversary wrongway --secs 25` - hero placed in the +x carriageway at
z = highwayZ + 6.5 pointed at -x, so the whole `dir = +1` population comes at him at a ~250 km/h
closing speed. Result: **stationary 0.00%, lane error max 0.000 m** - not one car braked and not one
shied. Mechanism: `hg = (heroP - p) - (v.halfLen + 2.4)` with `heroP = v.dir * heroX`, so the brake
clause needs the hero AHEAD in the car's own travel direction; a wrong-way hero is behind in that
coordinate, and the shy clause needs `heroAlong - v.speed > 8` where `heroAlong` is negative for an
oncoming hero. Both are unreachable head-on.

### 5. Hero drives THROUGH traffic. Not this file's - routed to `game/physics.js` by the builder.

Quantified, because "not implemented" understates it. Repro: `--drive highway --adversary ram
--secs 35`, hero on the 9 m lane centre with throttle held, running down slower cars in his own
lane. **136 of 871 frames (15.6%) with the hero's body geometrically inside a traffic car body**, at
155.9 km/h, with no crash, no speed change, no sound. A plain city cruise with no adversarial intent
scores 34-46 frames of the same thing. This is the biggest gap in the FEATURE; it is not a defect in
`traffic.js`, `t.vehicles` already publishes everything a collider needs, and `physics.collide()`
only knows `blocks`.

### 6. Not a defect, recorded so the next wave does not chase it: traffic goes to 0 off-network.

`--adversary edge` drives to the physics bound at (1400, -480) and `--adversary wrongway` in the
city ended at (-324, 1086); live count reaches **0** in both. Correct behaviour: `LINE_LAT_MAX` is
210 m and the grid spans +/-480 with `extent` 560, so anywhere past about |690| there is no road
line to spawn on - and no road either. `physics.js:24` allows a 2800 x 2800 m drivable box around a
1120 m road network. That is a world/bounds question, not a traffic one. Routed, not charged.

### 7. Robustness passes I could not break

- **R mashed 40 times in 20 s while driving** (`--adversary rmash`): live count stays exactly 56
  every frame, 0.000 m overlap, zero console errors, no leaked or double-lived slot.
- **Night**: 7 meshes non-zero on `wet-night-asphalt` vs 5 in daylight, tail and head lamps present
  and reading correctly, zero errors.
- **`--kill world`**, `--kill hide`, `--kill freeze`, six scenes: zero console errors anywhere.

## 8. FRAME TIME - SMOKE TEST ONLY, NOT A RESULT

I was told I am running concurrently with a physics rewrite, so per the wave contract this is not
reportable. `node tools/fps.mjs --subsystem --sub-scenario city --toggles traffic-hidden`,
`renderW 1280 / renderH 720 / pixelRatio 1 / devicePixelRatio 1 / resScale 1`: the harness's own
interleaved baseline windows came out p50 42.46 and 59.45 ms - a **40.01% range on the baseline
alone**, and hiding traffic scored a *negative* delta of -18.00 ms with sign 0/2. The machine is
too contended to attribute anything. The only usable readings from it are the ones contention
cannot invert: the page boots and runs clean with 56 vehicles integrating every frame, and the
paused interleaved counter A/B in section 3 (13 draw calls in daylight, 32 at night).

## 9. VERDICT

```progress-metrics
standing vehicles: 1082 baked (944 kerb + 138 queue), re-derived from the sealed InstancedMesh
live moving vehicles: 56, mean 56.0 min 55 max 56 over 76 s of driving at 1280x720 ratio 1
city speed p50: 44.0 km/h (desired 45-59), 5.77% stationary, 64008 vehicle-frames
highway speed p50: 84.3 km/h (desired 90-119), 0.00% stationary, 82399 vehicle-frames
body-on-body overlap: 0.000 m over ~340k vehicle-frames, 8 scenarios
on screen per frame: 22.7 city / 28.6 wet-night / 18.8 highway (in frustum, unoccluded, <260 m)
highway pop-in inside 120 m: 26 in 40 s (traffic.js:62 SPAWN_MIN 62 m)
traffic draw-call cost: 13.0/frame daylight, 32.0/frame night (paused interleaved A/B x3)
```

**VERDICT: PASS**

A player driving this build would describe the traffic as alive without being asked. The counts are
correct as reported, the mechanism is real rather than statistical, nothing interpenetrates over
nine million pair tests, lane discipline is a centimetre, the highway went from zero vehicles to
nineteen on screen, and the streets did not become abandoned - the kerb population survived at 1082
and puts 17-21 cars on screen beside the moving ones. Both kill-controls behave exactly as the
builder's claims predict and the freeze control collapses the read completely, so the claim is
about motion and not about count. Every defect I found is either self-inflicted and recoverable,
cosmetic, or in a file this piece does not own.

### The single biggest remaining gap owned by this piece

**`game/traffic.js:503-509` - the junction occupancy latch.** `if (j.occ > 0) { j.owner =
j.occAxis; j.heldT += step; continue; }` grants the phase to whatever is in the box for as long as
it is in the box, unbounded. A body that stops in the box therefore stops the signal, and the
result is 8-9 of 56 vehicles standing permanently still around one junction with no phase change for
18 s at a stretch - the exact failure this piece exists to fix, at 16% scale, reachable by parking.
`heldT` is already accumulated and already read on the flip test one branch below; it needs to bound
this branch too.

**Kill-control I ran to prove it is the right object:** `--adversary sit-offset` holds every other
variable - the same immovable hero, the same blocked lane, the same junction - and moves him 45 m
short of the junction so the car behind him stops *outside* the box. The phase then flips three
times in 17 s and stopped vehicles never exceed 1. Nothing about the hero changed; only whether a
stopped body was inside `BOX_HALF`.

The biggest gap in the FEATURE is hero-vs-traffic collision, measured at 136 of 871 frames with the
hero inside a traffic body at 155.9 km/h - but that is `game/physics.js`, the builder routed it
correctly, and `t.vehicles` already publishes the boxes a collider needs.

## 10. Files

- `tools/_trafficplay.mjs` - this critic's harness. Nine modes; edits no game code.
- `shots/s/critic-traffic-{none,hide,freeze,night,sit}.png` - `shots/` is gitignored, not committed.
