# wave-s / traffic-critic-r2 - independent judgement of `wave-s/traffic-r2` (commit 3ab92a5)

Owns: `verdicts/wave-s/traffic-critic-r2.md` and `tools/_traffic-critic-r2.mjs`.
Edits NO game code.
Written BEFORE any measurement (wave-S process rule 1), appended as I work.
Round 1's critic verdict at `verdicts/wave-s/traffic-critic.md` is left untouched; it is the BEFORE
record for every repro below.

## 0. Tree check (process rule 2)

`git status --short` at start:

```
 M PROMPT.md
 M driver.log
 M game/main.js
 M progress.json
?? README.md
?? game/music/
?? verdicts/wave-s/perf-critic.md
```

`game/main.js` is dirty and belongs to a concurrently running peer (its diff is +16/-0, a
shader-warm block for crash/boost effects).
It is NOT the traffic wiring line: `grep -n setEventSource game/main.js` returns nothing, so
**the boost event stream is still unread by the shipped path** and the builder's "the join is
pending" is confirmed from the tree, not from its prose.
`game/traffic.js` is clean at `3ab92a5` (md5 `ee811cc7ff7f0d5c7aeb1916ca84593a`), and I re-checked
that md5 before and after every measurement run below.

I am told I run concurrently with two peer critics, so **no frame-time number in this file is a
result**.

## 1. What I have to decide

Round 1 named seven defects. Four of them are `traffic.js`'s and the builder claims all four closed.
So the questions, in order:

1. Re-run each round-1 repro and say, one at a time, whether it is ACTUALLY fixed.
2. Judge the boost event stream, which is new: events per km, is a "near miss" geometrically near,
   is "oncoming" actually oncoming, and does an EMPTY road produce nothing. An event stream that
   fires on a timer or on distance travelled is exactly the fake economy this piece exists to
   delete, so I try to break it that way.
3. Re-derive the counts and the moving fraction from the live scene, and confirm the survivors
   genuinely drive.

(sections appended below as I measure)

## 2. Tool

`tools/_traffic-critic-r2.mjs` - mine, playwright, the same static server and chromium flag set as
`tools/fps.mjs`, driving the real playable path (`#nomenu=1`) through the real key listeners.
It edits no game code; the one kill-control below wraps `traffic.update` from the page, exactly as
round 1's freeze control did, so the module still runs in full.
Two things in it are deliberately not round 1's harness:

- **Every event's geometry is re-derived independently of the code that emitted it.**
  I compute my own point-to-box clearance from the published `{pos, yaw, halfLen, halfWid}` and my
  own heading dot product for "oncoming", then match each drained event to the vehicle it names by
  position. A `type` tag is a claim; a clearance I computed myself is evidence.
- **It arms after a 2.5 s warm window and skips its first recorded frame.**
  Round 1's `_trafficplay.mjs` starts with an empty `prev` map, so its FIRST frame charges every
  live vehicle as a fresh spawn at whatever distance it happens to be. **The builder's R5
  observation is CONFIRMED and I can size it:** on the current build that first frame would have
  charged 10 near-field visible spawns on the highway at 49.4 / 60.0 / 69.3 / 102.4 / 117.3 /
  135.2 / 142.2 / 154.6 / 173.7 / 197.0 m. So about **5 of round 1's 26 "visible spawns inside
  120 m"** were the instrument, not the game. The defect was real anyway - the other ~21 were not -
  but the round-1 figure should be quoted as ~21, not 26.

## 3. THE FOUR ROUND-1 DEFECTS, RE-RUN ONE AT A TIME

All runs 1280x720, `deviceScaleFactor 1`, headless chromium ANGLE/Metal, `game/traffic.js` md5
`ee811cc7ff7f0d5c7aeb1916ca84593a` before and after each run.

### Defect 1 - parking in a junction box locks the signal and freezes up to 9 cars. **FIXED**

`node tools/_traffic-critic-r2.mjs --drive city --secs 30 --adversary sit` - the hero placed dead
centre of the junction at (0, 0), throttle never pressed, `signalPhase(0,0)` sampled every frame and
the stopped count on each axis every 15 frames.

| | round 1 (HEAD 7d6badc) | now (3ab92a5) |
|---|---|---|
| phase flips in the window | **0** in 30 s (a second run: 1) | **7** in 22.8 s |
| stopped, each axis, at the end | 7 of 7 and 3 of 6 | **0 and 0** |
| worst stopped at any sample | 8 axis-0 + 3 axis-1 | **0 and 1** |
| stationary vehicle-frames | 5.77% | **1.47%** |
| per-slot distance over the window | - | min **200.6 m**, max 340.8 m, slots that never moved 0 |
| body-on-body overlap | 0.000 m | **0.000 m in 0 frames** |

Sit probe `[t, owner, nAxis0, stoppedAxis0, nAxis1, stoppedAxis1]`:

```
[0.7,1, 0,0, 1,0]
[9.4,1, 3,0, 3,0]
[12.3,0, 4,0, 3,1]     flip
[18.3,1, 3,0, 4,0]     flip
[22.7,0, 3,0, 3,0]     flip; six cars round the junction, none of them stopped
```

**KILL-CONTROL, and it settles the MECHANISM rather than the statistic.** The builder claims the fix
needed three things and that the load-bearing one is mechanism 4, "go round what will not move" -
not the watchdog on the latch. I wrapped `traffic.update` from the page so the module still runs in
full and then forced `v.lat = 0`, `v.swerve = 0`, `v.otT = 0` on every vehicle: braking for a
blockage still works, leaving the lane to pass it cannot.
Same repro, `--kill overtake`:

| | overtake live | overtake killed |
|---|---|---|
| stationary vehicle-frames | **1.47%** | **19.05%** |
| stopped at t = 30 s | 0 and 0 | **5 of 5 axis-0, 8 of 9 axis-1** |
| phase flips | 7 | **6 - the signal is still flipping** |

So the freeze comes straight back, at round 1's scale (13 frozen of 30, against 15 of 56), **while
the phase keeps changing.** Bounding the latch alone would not have fixed this defect, and the
builder's attribution is correct: the geometric leader test plus the overtake is what carries it.

### Defect 2 - highway pop-in inside 120 m, about every 1.5 s. **FIXED**

`--drive highway --secs 40`, twice. "Visible" = in the frustum, within 320 m, and with an
unoccluded 2-D line from the camera past every box in `world.blocks`.

| | round 1 | run A | run B |
|---|---|---|---|
| visible spawns | 125 in 40 s | 46 | 46 |
| **of those, inside 120 m** | **26**, nearest **62.9 m** | **0** | **0** |
| closest visible spawn | 62.9 m | **240.8 m** | **241.0 m** |

Against `SPAWN_FWD_MIN = 240` (traffic.js:96) and `SPAWN_CONE = 0.0` (:101), i.e. the whole forward
half-plane. City: closest visible spawn 239.9 m (`--drive city --secs 36`), round 1 69.5 m.
The gate is the mechanism it claims to be: with the hero driving 28 m clear of the outer lane and
the cone pointing down the road, spawns still land no closer than 241.9 m.

### Defect 3 - cars vanish in plain sight at the ends of the road lines. **FIXED as specified, and
re-opened by the reset key - see finding 1**

| | round 1 | highway 40 s A | highway 40 s B | city 36 s | wrongway 25 s |
|---|---|---|---|---|---|
| VISIBLE retires | **3** at 172.6 / 225.3 / 262.9 m | **0** | **0** | **0** | **0** |

Zero visible line-end retires in 141 s of driving, including two runs that end at x = 1165 with the
ribbon end 35 m ahead. The line-end clause is genuinely deferred now.
**The cost of the fix is real and I measured it: vehicles drive off the end of the tarmac.**
`world.js:1139` builds the ribbon -1200..1200 and the retire is deferred, so a body keeps driving
past it: **1302 of 79 843 vehicle-frames off the ribbon in a 40 s highway run, 794 of them
frustum-visible and unoccluded, worst overshoot 132.6 m** (156.2 m in a parked run at x = 1120).
I looked at it rather than only counting it - `shots/s/critic-r2-endpark.png` (dusk) and
`shots/s/critic-r2-endpark-midday.png` - and at 100-220 m those bodies are faint silhouettes at the
vanishing point in fog dense enough that the end of the tarmac is not itself visible.
I agree with the builder that this is a much smaller lie than a car winking out 120 m ahead.
Recorded as finding 3 so the next wave does not re-derive it.

### Defect 4 - oncoming traffic does not react to a wrong-way hero at all. **FIXED**

`--drive highway --secs 25 --adversary wrongway`, hero placed in the +x carriageway on the 9 m lane
centre pointed at -x, so the whole `dir = +1` population comes at him at a ~250-280 km/h closing
speed.

| | round 1 | now |
|---|---|---|
| max lane error (the shy itself) | **0.000 m** | **3.000 m** = `EVADE_LAT` clamped by the line's `latMax` 3.0 |
| min hero-to-body clearance | **-0.95 m** (the hero passed THROUGH them) | **+0.36 m** |
| hero-body-inside-a-traffic-body frames | 136 of 871 in the ram repro | **0** in this run |
| stationary | 0.00% | 0.00% |
| overlap | 0.000 m | 0.000 m |

The cars move out of the way and the hero misses them by 36 cm rather than driving through them.

## 4. THE BOOST EVENT STREAM. Every number re-derived, and three attempts to break it.

`traffic.drainEvents()` drained every frame from inside the page (nothing in the shipped path reads
it - `grep -n setEventSource game/main.js` is empty, so **the join really is pending**).

| run | km driven | events | per km | types |
|---|---|---|---|---|
| highway, lane-kept, A | 2.775 | 19 | **6.85** | 17 nearMiss, 1 oncoming, 1 check |
| highway, lane-kept, B | 2.778 | 20 | **7.20** | 19 nearMiss, 1 check |
| city, path-following | 1.124 | 6 | **5.34** | 4 oncoming, 1 nearMiss, 1 check |
| wet-night-asphalt, city | 0.616 | 6 | 9.74 | 5 oncoming, 1 nearMiss |
| wrong-way highway | 1.832 | 6 | 3.28 | 6 oncoming |
| ram (driving through cars) | 1.930 | 7 | 3.63 | 7 check |

The builder claimed 6.9-8.2 per km of highway; I measure **6.85 and 7.20**, n=2. Confirmed.

### Is a "near miss" actually near? YES, checked against my own geometry

For all 37 pass events across the runs above, the emitted `meta.clearance` and the clearance I
computed myself from the published pose agree **to the centimetre on every single event** (1.61 vs
1.61, 0.33 vs 0.33, 0.36 vs 0.36, ...). The distribution of the ones I measured myself:

- highway lane-kept: min **1.50 m**, p50 **1.68 m**, max **2.61 m** body-to-body
- city: 0.33 / 1.28 / 1.36 / 1.37 / 2.37 m
- wrong-way: min **0.36 m**, p50 0.59, max 0.66 m

Nothing fired at a clearance a player would call "not close". `NEAR_MISS_R` is 3.4 m
(traffic.js:121) but the geometry does not let a lane-keeping pass reach it: highway lanes are 6 m
apart, so an adjacent-lane pass clears by 4.1 m and scores nothing. **Every event above required the
hero to actually be out of his own lane.**

### Is "oncoming" actually oncoming? YES

Independent test: the dot product of the hero's heading with the vehicle's heading at the frame of
closest approach, computed by me from `yaw`, never from the tag.

- `oncoming` events with my dot > -0.4 (i.e. not oncoming): **0 of 11**
- `nearMiss` events with my dot < -0.4 (i.e. actually oncoming, mistagged): **0 of 37**

The 11 oncoming events read dot -0.63 to -1.00; the near misses read +0.96 to +1.00.

### Three attempts to break it as a timer or an odometer. ALL FAILED, which is the pass condition

1. **Empty road.** `--pool 0`: **1.605 km at 280 km/h, literally alone, 0 events.**
2. **Traffic present, never passed close.** `--adversary offlane`: hero drives the highway 28 m
   clear of the outermost lane centre with boost held - **1.635 km at 279 km/h, 30 live cars, 149
   spawns, minimum clearance to any body all run 11.09 m, 0 events.** A timer or a distance meter
   scores this the same as the lane-kept run; the stream scores it zero.
3. **Close but not moving.** `--adversary sit`, hero parked in a junction box for 23 s with traffic
   flowing past at a measured **0.72 m** minimum clearance: **0 events.** `EVENT_SPEED_MIN` (12 m/s,
   traffic.js:123) is real, so a player cannot farm the bar by standing next to a bus.

One instrument note so nobody re-derives it as a discrepancy: on a `check` the emitted `relSpeed`
(46-53 m/s) is the PRE-shunt value and mine (25-29) is post-shunt, because my recorder reads state
after `traffic.update` has already applied `v.speed = 0.55*v.speed + 0.45*heroAlong`. Not a defect
in either; on near misses, where nothing is shunted, the two agree to 0.1-1.0 m/s.

## 5. COUNTS AND "DO THEY ACTUALLY DRIVE", re-derived from the live scene

`node tools/_trafficplay.mjs --census` (round 1's own census tool, unchanged):

| quantity | round 1 | now |
|---|---|---|
| `traffic.POOL` / `traffic.count` | 56 / 56 | **30 / 30** |
| traffic InstancedMeshes | 7 (5 non-zero in daylight) | 7 (5 non-zero: 60/30/60/120/30 = POOL x k) |
| night meshes non-zero | 7 | **7**, counts `[60,30,60,120,30,60,60]` on `wet-night-asphalt` |
| traffic draw-call cost, paused interleaved A/B x3 | 13.0 calls / 26 992 tris | **13.0 calls / 14 460 tris** |
| **baked (standing) vehicles** | **1082** (`{rank:944, queue:138}`) | **436** (`{rank:376, queue:60, culled:4}`) |

**The baked collapse is NOT this piece's.** `git log -- game/world.js` shows the only world.js edit
since round 1 is `40d2f1c wave-s/perf`, which scaled the parked ranks by a new `NPC_DENSITY`. It is
in the tree the builder measured both sides against, so the builder never saw it. It matters anyway,
and it is finding 2.

Live count stability, five runs: mean 29.7-30.0, min 26, max 30. A hard ceiling, not an average.

**They drive.** Per-slot distance integrated over each window, `slots that never moved` = 0 in every
run: highway 40 s **908.6-1122.0 m**, city 36 s **222.1-410.5 m**, parked-in-a-junction 30 s
**200.6-340.8 m**.

| | city (36 s) | highway (40 s) | module's desired band |
|---|---|---|---|
| speed p50 | **46.3 km/h** (round 1: 44.0) | **91.0 km/h** (round 1: 84.3) | 45-59 / 90-119 |
| speed p10 / p90 | 22.0 / 53.8 | 77.2 / 105.9 | - |
| stationary | 2.21% (round 1: 5.77%) | **0.00%** | - |
| lane error mean / max | 0.056 / 2.800 m | 0.091 / 2.314 m | max is the shy, by design |
| body-on-body overlap | **0.000 m in 0 frames** | **0.000 m in 0 frames** | - |

**The builder scored its own highway speed as a MISS at 89.0 km/h; I measure it INSIDE the band**, at
90.7 / 91.0 / 91.2 / 91.7 / 92.4 km/h across five runs. The band's lower edge is now met, marginally.
Overlap is 0.000 m over roughly 340 000 vehicle-frames across eleven runs including the ram, the
wrong-way, the R-mash and the overtake kill-control, so the invariant the builder was most worried
about survived the change. Zero console errors in every run, on three scenes.

Junction behaviour, spawn-ahead and despawn-behind all check out: the phase flips 6-7 times in 30 s
under the worst input available, spawns land at 241-300 m and only outside the view half-plane, and
retires are all either beyond 320 m or occluded.

## 6. FINDINGS, ranked, each with a repro

### 1. R RE-OPENS DEFECTS 2 AND 3, WORSE THAN ROUND 1. `game/traffic.js:646` (`spawnGate = false`)

`reset()` turns the view-cone gate OFF and re-spawns the whole population, and the comment at
traffic.js:336-340 justifies it with "a whole-scene reset has no pop-in to hide: the entire frame
appears at once". **That is not what R does on the playable path.** `main.js:526-530` calls
`physics.reset(state.pos, state.yaw, 0)` and then `traffic.reset(pos)`: the hero keeps his position
and his heading, the camera is not snapped, the world is untouched. Only the traffic changes.

Repro A, `--adversary rshot` (hero frozen on the highway at (0, highwayZ+9), one press of R):
**30 of 30 bodies teleport.** Two leave from **6.3 and 6.4 m** from the car; the nearest arrival is
**71.8 m** dead ahead. `shots/s/critic-r2-R-before.png` vs `shots/s/critic-r2-R-after.png` - sky,
gantries, signs, buildings, HUD and the hero car are identical, and the car alongside plus the van
on the shoulder are simply gone, with an empty road out to ~70 m.

Repro B, `--adversary rmash` (8 presses of R in 24 s of a normal highway drive):
**111 visible spawns, closest 66.4 m** (the steady state gives 0 inside 240 m), and **89 visible
in-place vanishes, closest 9.3 m** (the steady state gives 0).

Round 1's worst visible vanish was 172.6 m away. This one is 9.3 m, beside the driver's door, and it
is on the key a player presses after every crash. The fix is inside the file that owns it and needs
no `main.js`: `hfx`/`hfz` are module state that already hold the last known heading, so `reset()`
could keep them instead of forcing (0, 1) and leave `spawnGate` on - it only has to stay off for the
very first fill of a boot, where there is genuinely no previous frame.

### 2. THE VISIBLE POPULATION HAS FALLEN 65%, from two cuts neither builder could see. ROUTED

Same instrument as round 1 section 5 (vehicles within 260 m, in frustum, unoccluded, sampled every
6th frame):

| scene | round 1 | now |
|---|---|---|
| `daytime-downtown`, city drive | 17.1 baked + 5.6 live = **22.7** | 5.6 baked + 2.4 live = **8.0** |
| `dusk-highway-chase`, highway drive | 0.0 + 18.8 = **18.8** | 0.0 + 6.5 = **6.5** |

Two independent cuts multiplied: `40d2f1c wave-s/perf` took world.js's baked ranks from 1082 to 436,
and this piece took the live pool from 56 to 30. Each was defensible alone and the product is a
street with eight vehicles on screen where round 1 had twenty-three.
`shots/s/critic-r2-city.png` is a four-lane downtown street with one van and one distant car in it.
Round 1's pass condition had two halves and the second one was "the streets must not now read
abandoned"; this is the closest that has come to failing. Not chargeable to this piece alone - the
builder's own A/B was against a tree that already contained the perf cut - and the builder's corridor
table says the next value to try is **POOL 40**. Whoever owns the next round should decide POOL and
`NPC_DENSITY` together, once, with this instrument.

### 3. Vehicles drive up to 132 m past the end of the tarmac. Accepted, recorded

Measured above: 1302 off-ribbon vehicle-frames in 40 s of highway, 794 frustum-visible, worst
overshoot 132.6 m driving / 156.2 m parked, against a ribbon that ends at 1200 (`world.js:1139`).
Opened both `shots/s/critic-r2-endpark.png` and `-midday.png`: in the fog at 100-220 m these are
faint silhouettes near the vanishing point and the road end is not visible either, so the trade the
builder made is the right way round. Recorded so the next critic does not score it as new.

### 4. A 'check' pays the maximum for driving THROUGH a car, and the veto that is supposed to stop
that cannot fire. Mostly routed to `physics.js`

`--adversary ram`, hero on the 9 m lane centre at 280 km/h with boost held: **7 `check` events in
1.93 km, every one at `amount` 1.00**, with **37 frames of the hero's body inside a traffic body**,
minimum clearance **-0.88 m**, and no crash, no speed change and no sound. The contract says
physics vetoes the award on a wreck - but `physics.collide()` still knows only `world.blocks`, so
there is no wreck to veto with. When the join lands, the cheapest and highest-intensity boost in the
game will be driving straight through traffic. `traffic.js` is emitting the right fact; the missing
half is round 1's routed collision, still open.

### 5. RULE 5: the POOL table shipped in the comment does not reproduce. `game/traffic.js:78-82`

The comment a future agent will read says POOL 30 gives "9.5" near-miss events per km of highway and
"6.8" in the city. I measure **6.85 and 7.20 per km** (highway, n=2) and **5.34** (city), and **the
builder's own verdict says 6.9-8.2 and 6.3** - so the shipped number agrees with neither. The
corridor column in the same table does reproduce (5.7 vs my 5.11-5.23 highway, 3.5 vs my 3.30 city),
and the corridor is the quantity the decision was actually made on, so the DECISION stands. It is
the number in the file that is wrong, which is the failure mode this project has paid for five times.

### 6. Not findings, recorded so they are not re-derived

- The pass has no per-vehicle cooldown: it re-arms as soon as clearance exceeds
  `NEAR_MISS_R + NEAR_MISS_OUT` = 4.8 m, so weaving beside one car could in principle pay more than
  once. **I did not measure an exploit** and I am not scoring it; it is listed only so the next
  round knows it is unmeasured.
- `OCC_HOLD_MAX = 8.0` (traffic.js:150) is close to inert by construction - `occT` only accumulates
  while a MOVING body is in the box and such a body clears a 24.8 m box in under 2 s. The builder
  says exactly this in the comment above it, and my kill-control confirms the working mechanism is
  elsewhere. No contradiction; noted because "the watchdog fixed the deadlock" would be the wrong
  story to carry forward.
- Traffic goes to 0 off-network is still not a defect (round 1 item 6). `--adversary end` drives to
  the physics bound at x = 1400 and the live count falls to a mean of 24.9, because the only road
  line in range is the 88 m of highway still behind the hero.

## 7. FRAME TIME - SMOKE TEST ONLY, NOT A RESULT

I run concurrently with two peer critics, so per the wave contract nothing here is reportable. The
only readings contention cannot invert are the paused interleaved counter A/Bs in section 5: traffic
costs **13.0 draw calls/frame and 14 460 triangles/frame** in daylight at POOL 30, against round 1's
13.0 and 26 992 at POOL 56, i.e. the triangle cut is real and the call count did not move (same five
meshes).

## 8. VERDICT

```progress-metrics
junction latch: 7 phase flips in 22.8 s parked in the box, 0 cars frozen (was 0 flips, 15 frozen)
junction kill-control: 19.05% stationary with the overtake wrapped out vs 1.47% with it live
highway pop-in: closest VISIBLE spawn 240.8 / 241.0 m, 0 inside 240 m in 2x 40 s (was 62.9 m, 26 inside 120 m)
visible line-end retires: 0 in 141 s of driving across 5 runs (was 3 in 40 s)
wrong-way hero: cars shy 3.000 m and clear him by +0.36 m (was 0.000 m and -0.95 m, driven through)
boost events: 6.85 and 7.20 per km of highway, clearance 1.50-2.61 m verified independently
event controls: 0 events over 1.605 km alone and 0 over 1.635 km passing 30 cars 11.09 m clear
live vehicles: 30 of 30 moving, 908-1122 m each per 40 s, 0.000 m overlap over ~340k vehicle-frames
on screen (260 m, frustum, unoccluded): 8.0 city / 6.5 highway, was 22.7 / 18.8
```

**VERDICT: PASS**

All four defects this piece was given are genuinely closed, and closed at the mechanism rather than
at the statistic: the junction fix survives its own kill-control and the freeze comes straight back
at round-1 scale when the overtake is wrapped out, which is the opposite of the wave-Q failure where
a correct number sat on a wrong cause. The event stream is the strongest thing in the round. Every
clearance it reports is the clearance I measure myself, every `oncoming` tag is oncoming by a heading
dot product it never saw, and it scores exactly zero on all three attempts to make it behave like a
timer or an odometer - including 1.6 km at 279 km/h past thirty cars that were never closer than
11 m. Speeds are now inside both desired bands, the 0.000 m overlap invariant survived a large
rewrite, and there are no console errors on any scene.

Two things keep this short of unqualified. **Finding 1 is a real regression of the very defect this
round closed**, reachable with one press of R, at 9.3 m instead of round 1's 172 m, and it lives in
this file. **Finding 2 is not this piece's fault and is the bigger risk to the wave**: the visible
vehicle population is down 65% because a perf cut to the baked ranks and this piece's cut to the live
pool landed one after the other and neither builder could see the other. Eight vehicles on screen
downtown is the closest this project has come to failing the "must not read abandoned" half of the
traffic pass condition, and POOL and `NPC_DENSITY` now have to be decided together, once.

## 9. Files

- `tools/_traffic-critic-r2.mjs` - this critic's harness. Ten modes; edits no game code.
- `shots/s/critic-r2-{R-before,R-after,endpark,endpark-midday,city,lineend}.png` - `shots/` is
  gitignored, not committed.
