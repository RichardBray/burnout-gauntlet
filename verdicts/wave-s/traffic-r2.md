# wave-s / traffic-r2 — the four defects, the boost event stream, and the POOL decision

Owns: `game/traffic.js` (exclusively) and my own new harness `tools/_traffic-r2.mjs`.
Written BEFORE any edit (process rule 1), appended as I work.

I run CONCURRENTLY with `handling-r2` and `menu-music`. **Every frame-time number in this file is a
SMOKE TEST, never a result**, and is labelled as such. Vehicle kinematics, event counts, spawn/retire
visibility and junction phase records are not contended and are reported as results.

`game/main.js` is FROZEN and owned by nobody this round. I do not touch it.

## 0. Tree check (process rule 2)

At start, `git status --short`:

```
 M PROMPT.md
 M driver.log
 M game/traffic.js
?? README.md
?? game/music/
?? verdicts/wave-s/perf-critic.md
```

The only edit to a file I own is `game/traffic.js`, and it is exactly the inherited `POOL` cut:

```
-const POOL = 56;
+// 56 -> 22, a 60% cut on the user's explicit instruction after driving it. ...
+const POOL = 22;
```

Unmeasured, and rule 2 says it gets justified or reverted, never inherited silently. Section 10 is
where I decide the number on played evidence and adopt it as mine.

**Tree context, recorded because every number below was taken against it.** By the time I finished,
both peers had landed (`446d1c1` menu-music, `92c2b39` handling-r2), so my later runs include a
rewritten `physics.js`/`camera.js`; the numbers most exposed to that are the hero-relative ones
(distance driven, hero km/h, the wrong-way clearance), and both sides of my HEAD-vs-mine A/Bs were
taken with the same tree, minutes apart. `game/main.js` is also DIRTY under me, +16/-0, and it is
not mine and not either peer's declared file: it force-compiles `crash.group` and `boostFx.group`
once at boot. It cannot change traffic behaviour. I did not touch it, I did not commit it, and I did
not measure with it reverted.

## 1. The work list

From `verdicts/wave-s/traffic-critic.md` section 7 and the round-2 brief:

1. Junction occupancy latch freezes up to 9 cars — `traffic.js:503-509` (HEAD numbering).
2. Highway pop-in inside 120 m about every 1.5 s — `SPAWN_MIN = 62` at `:62`.
3. Cars vanish in plain sight ahead of you at the ends of the road lines — `:458`.
4. Oncoming traffic does not react to a wrong-way hero at all — `:566-576`.
5. Hero drives THROUGH traffic — **NOT MINE.** `physics.collide()` only knows `world.blocks`;
   `t.vehicles` already publishes every box a collider needs. Routed to `handling-r2`, unchanged
   from round 1's routing. I add nothing to physics and I do not work around it.
6. Traffic goes to 0 off-network — recorded not-a-defect by the critic. Not chased.
7. The boost EVENT STREAM (`traffic.drainEvents()`), the contract in the round-2 brief.

Plus the `POOL` decision.

## 2. Instruments

- `tools/_trafficplay.mjs` — the round-1 CRITIC's harness, unmodified. Every before/after pair
  below that carries the words "critic's repro" is this tool on both sides.
- `tools/_traffic-r2.mjs` — MINE, new, and it exists because two of the quantities this round is
  judged on cannot be read with the critic's tool. `drainEvents()` is drain-on-read, so an event
  is simply lost unless something inside the page drains every frame; and the corridor ahead is a
  cone test on the hero's heading that nothing measured before. It also sweeps `POOL` inside ONE
  boot through `setPool()`, so the four-way A/B shares a machine, a code path and an RNG history.
  Modes: `--pools a,b,c`, `--drive city|highway`, `--offnet`, `--sit`, `--wrongway`.

**One correction to the critic's pop-in numbers, and it matters for reading my own.** The critic's
recorder starts on the frame after `traffic.reset()`, and on its FIRST frame its `prev` map is
empty, so every live vehicle reads as a fresh spawn at whatever distance it happens to be. That is
where its near-field entries come from. The proof: those entries are BYTE-IDENTICAL across two runs
with different frame counts and different RNG histories — `[69.5, 73.7, 91.4, 106.8, 144.3, ...]`
appeared unchanged in three of my runs, including one where I had changed the spawn gate. My own
recorder arms only after a 2.5 s warm window and skips its first frame, and it caught itself
reporting an "8.7 m spawn" until I did. Both tools' *retire* numbers are unaffected.

## 3. DEFECT 1 — the junction occupancy latch. FIXED.

BEFORE, critic's repro `--adversary sit --secs 30`, hero parked dead centre of the box at (0, 0),
at HEAD (POOL 56): `owner` = 1 for the ENTIRE 30 s window, **zero phase flips**, and the stopped
count climbed monotonically to **8 on axis 0 and 7 on axis 1 = 15 of 56 vehicles frozen** by
t = 29.8 s. Stationary 5.77% of city vehicle-frames.

AFTER, same repro, POOL 30: **7 phase flips in 30 s** (run 1: 4 flips; run 2: 7), the stopped count
ends at **0 on axis 0 and 0 on axis 1**, stationary **1.31%** of vehicle-frames, longest single stop
5.82 s (was 9.69 s), and body-on-body overlap **0.000 m in 0 frames**.

My own `--sit` diagnostic, which dumps the fields that decide whether a stopped car will clear
rather than the symptom: **9 cars stopped within 62 m before, 1 after** — and that one is
`jOk:false` at a stop bar, i.e. correctly waiting for a red.

It took THREE mechanisms, and the middle one is the interesting one:

1. **A stalled body no longer arms the latch at all.** `j.occ` was one number; it is now split, and
   only MOVING occupancy (`j.occMove`, occupant speed >= 1.0 m/s) owns the phase.
2. **The leader test became geometric** (see section 7), so a body in the box is an obstacle to the
   crossing axis whether or not the signal says so. Without this, releasing the phase is unsafe.
3. **Vehicles go round what will not move**, and THE HERO COUNTS. This is the one I got wrong twice
   and both failures were measured, not reasoned:
   - **First failure: the hero is not in the pool.** With the latch bounded and an overtake keyed on
     `blocker`, the repro still froze **12 of 30**, because the head of the queue is stopped by the
     HERO clause and therefore has no `blocker` at all. The fan of cars stopped by the signal had
     simply been replaced by a fan stopped by the hero.
   - **Second failure: a per-frame decision oscillates.** With `heroWall` added, the repro froze
     **9 of 30** and `--sit` showed why: `lat` 0.00-0.23 m and `stallT` cycling 0.48 / 0.93 / 1.62 /
     1.77 s, never once reaching the 2.0 s trigger. The shy that clears the blockage is the same shy
     that makes the blockage stop registering. The manoeuvre is now LATCHED for `OVERTAKE_HOLD`.

**And a kill-control I ran on my own fix, because bounding the latch broke the module's hardest-won
invariant and I nearly shipped it.** With `OCC_HOLD_MAX = 3.2` the sit repro measured **1.776 m and
then 2.172 m of body-on-body overlap in 23-25 frames** against the critic's 0.000 m over nine
million pair tests. The worst pair was `{"x":5.1,"z":6.2}` vs `{"x":6.2,"z":5.1}` at 4.5 and 8.7 m/s
— two vehicles from PERPENDICULAR axes inside the box at once, which a 3.2 s bound permits because a
crawling occupant is still an occupant. Two things fixed it and both are in the file: the
moving-only latch above (a moving occupant is self-limiting, so the watchdog could go to 8.0 s), and
a lateral non-interpenetration guard, because the leader test only sees bodies AHEAD (`g > -1`) and
cannot stop a shy that moves sideways into a body already alongside. Final overlap: **0.000 m in 0
frames** across the sit, city, highway, ram, wrongway and rmash runs below.

## 4. DEFECT 2 — highway pop-in. FIXED.

`SPAWN_MIN` is a radius and a radius cannot tell "40 m behind the camera" from "63 m dead ahead on
an unoccluded six-lane straight". The gate is now a VIEW CONE on the hero's heading:
`SPAWN_FWD_MIN = 240` m inside it, `SPAWN_MIN = 62` m outside it, unchanged.

| | BEFORE (critic, POOL 56, 40 s highway) | AFTER (mine, POOL 30, 30 s highway) |
|---|---|---|
| visible spawns (frustum + unoccluded) | 156 | 40 |
| ... of those inside 120 m | **26** (one per 1.5 s) | **0** |
| closest visible spawn | **62.9 m** | **241.2 m** |
| city, closest visible spawn | 69.5 m | **245.1 m** |

241.2 and 245.1 against a 240 m constant is the gate doing exactly what it says.

**`SPAWN_CONE` is 0.0, i.e. the entire half-plane in front of the hero, and it had to be.** I first
set it to 0.55 (a ~56 deg half-angle) and measured ten visible spawns still inside 240 m. The chase
camera sits ~20 m BEHIND the car, so a point 70 m out at 60 deg off the car's heading is only ~48
deg off the camera's and lands on screen. Half-plane measured none.

The initial fill is exempt (`spawnGate`), because a whole-scene reset has no pop-in to hide and is
also the one moment the hero's heading is unknown — `main.js` calls `reset(pos)` with no yaw, so
gating there would leave the road ahead permanently empty on every boot and every press of R.

## 5. DEFECT 3 — cars vanishing in plain sight. FIXED.

Two changes. The highway line's `lo/hi` were `-1150/1150` while `world.js:1139` builds the ribbon
from `-1200` to `1200`, so the line ended 50 m short of the tarmac; they are now the road's real
extent. And the line-end retire, which ignored the hero entirely, is now DEFERRED while the point is
inside the hero's view cone within `END_HIDE_R`, bounded by `END_HOLD_MAX` so a deferral can never
become a parked car.

| | BEFORE | AFTER |
|---|---|---|
| visible retires, 40 s highway | **3**, at 119.4 / 138.1 / 177.3 m | **0** |
| visible retires, 30 s highway (my recorder) | — | **0** of 14 retires |
| visible retires, 30 s city (my recorder) | — | **0** of 8 retires |

**A rejected variant, with the number that rejected it.** I first also BRAKED for the road end, so a
deferred vehicle stopped on the last of the tarmac instead of driving past it. It measured worse on
the thing that matters: the follower stops 6.2 m short of the leader, which is not `atEnd`, so it is
never retired at all. 40 s of highway went from **0.00% stationary to 7.76%**, with a 13.93 s
standstill, 0.173 m of overlap in 63 frames and a queue of cars parked at x = 1180. A car that
drives on for a few seconds past the last white line 200 m away in the fog is a much smaller lie
than a car park at the end of the map. The brake is gone; stationary is back to **0.00%**.

## 6. DEFECT 4 — oncoming traffic vs a wrong-way hero. FIXED.

The critic's repro puts the hero at `highwayZ + 6.5`, which is 3.5 m off the 9 m lane centre and
3.5 m off the 3 m one, so most of the population is correctly not reacting and the aggregate is
diluted. I ran that repro AND a fairer one that puts him DEAD ON the 9 m lane centre at -x, so every
`dir = +1` vehicle in that lane is on a literal collision course. **Both sides of this A/B are the
same instrument on the same machine, HEAD's `traffic.js` vs mine.**

| head-on, hero on the 9 m lane centre, 22 s / 1.51 km | HEAD (POOL 56) | AFTER (POOL 30) |
|---|---|---|
| vehicles engaged in the hero's own lane | 99 | 48 |
| of those that EVADED (`abs(lat) > 1.5 m`) | **0** | **13** |
| peak `abs(lat)` among them | **0.00 m** | **3.00 m** |
| min body-to-body clearance inside 40 m | **-0.95 m** (the hero passed THROUGH them) | **+0.45 m** |
| `oncoming` events emitted | **0** (no stream existed) | **7** |

The sign flip on clearance is the whole finding: head-on, the hero used to go straight through the
bodies; now they get out of the way with 45 cm to spare. On the critic's own repro, `lane error max`
moves **0.000 m -> 1.716 m** with stationary still 0.00% and overlap still 0.000 m.

Mechanism: the reaction is now keyed on TIME TO CONTACT, not on a distance band. Round 1's 90 m band
is 1.3 s at a 250 km/h closing speed, which is why nothing had time to move. And `idm`'s `vLead` is
no longer floored at 0 for an oncoming hero — a negative `vLead` is what makes `sStar` and the
`(sStar/gap)^2` term treat him as a closing wall rather than a slow leader.

**A second bug found while reading that clause, which nobody had reported.** Round 1's shy was
`sign(myLat - heroLat) * 1.2` with no `latSign` factor, and `place()` maps a positive `lat` to `+z`
only for `axis 0, dir +1`. On the other THREE of the four (axis, dir) combinations — half the city
network and one of the two highway carriageways — "shy away from the hero" moved the car TOWARD him.
It only ever looked right because the critic's `ram` repro happens to sit in the one working
quadrant.

## 7. THE GEOMETRIC LEADER TEST — the enabling change, not a defect on the list

Round 1 compared only same-line/same-dir/same-lane pairs, so a body stalled ACROSS a junction box was
not an obstacle to anybody and the ONLY thing keeping a crossing safe was the signal. That is
precisely why the occupancy latch could not be bounded. The test now projects every other body into
the vehicle's own (along, lateral) frame and takes the nearest one whose lateral extent overlaps.
It subsumes the old same-lane case, makes a perpendicular body real, and makes a shy or a shunt into
an adjacent lane something the car in that lane can see. Still O(POOL^2) with an early reject: ~900
comparisons a frame at POOL 30, against ~3000 at round 1's POOL 56.

## 8. DEFECT 5 — hero drives THROUGH traffic. ROUTED, NOT MINE, and I did not work around it.

`physics.collide()` knows only `world.blocks`; `t.vehicles` already publishes `{pos, yaw, speed,
halfLen, halfWid}` for every live body, which is everything a collider needs. Round 1 routed this to
`physics.js` and the round-2 brief re-routes it to `handling-r2`. Still measurable in my runs and I
report it rather than hiding it: **73 frames of hero-inside-a-traffic-body in the 30 s `ram` run**,
20 in a 36 s city cruise, 8 in a 40 s highway run.

What I DID do is make traffic react to contact from its own side: `drainEvents` emits a `check` and
the vehicle is shunted (speed pulled toward the hero's, body shoved out of his line). It is one-sided
until physics collides, and the event contract says so — whether the hero survived the hit is
physics.js's call, and a wreck vetoes the award there.

## 9. THE BOOST EVENT STREAM — built, fired, and controlled

`traffic.drainEvents()` is built exactly to the round-2 contract: drain-on-read, never null, each
event `{type, amount, at:{x,z}, meta}`, `amount` a 0..1 intensity and NOT a boost quantity.
**THE JOIN IS PENDING**: the wiring is the session driver's one line in the FROZEN `main.js`
(`physics.setEventSource(() => traffic.drainEvents())`), so I verified my half in isolation, by
draining from inside the page every frame. Nothing in the shipped path reads the queue yet, which is
why `EVENT_CAP` exists — an undrained queue must not grow without bound.

A pass is scored ONCE, at its closest point, not per frame. Per-frame scoring pays sixty times for
standing still next to a bus, which is permanent rule 3's failure mode transplanted into a boost
economy.

**THEY FIRE** (POOL 30, hero draining every frame, `tools/_traffic-r2.mjs`):

| run | distance | nearMiss | oncoming | check | events/km | mean amount |
|---|---|---|---|---|---|---|
| highway, lane-kept, 30 s | 2168 m | 15 | 0 | 0 | **6.9** | 0.70 |
| highway, lane-kept, 20 s | 1335 m | 11 | 0 | 0 | **8.2** | 0.70 |
| city, 30 s | 1260 m | 0 | 5 | 3 | **6.3** | 0.82 |
| head-on wrong way, 22 s | 1513 m | 0 | 7 | 0 | **4.6** | — |

Compare round 1: **fourteen seconds of lane-kept highway through traffic produced ZERO events**,
because there was no stream. The type split is a correctness check in itself: a hero driving WITH the
highway traffic earns `nearMiss` and never `oncoming`; a hero on a city street, where the only cars
within 3.4 m are on the far side of the centreline, earns `oncoming` and never `nearMiss`; a hero
pointed the wrong way up a carriageway earns `oncoming` only. The modal highway event is
`amount 0.70` at `clearance 1.72 m`, which is an adjacent-lane pass that the car SHIED away from
(2.5 m lane offset + `SHY_LAT` 1.2 = 3.7 m centre separation, less two half-widths = 1.84 m). The
event metadata and the shy constant agree to 12 cm, which is a nice independent check on both.

**AND THEY DO NOT FIRE ON AN EMPTY ROAD.** Two controls, both driving over a kilometre:

| control | live vehicles | distance | events |
|---|---|---|---|
| `--pools 0`, highway (literally alone) | 0.0 | 1128 m | **0** |
| `--offnet`, POOL 30 (traffic exists, never passed close) | 23.7 | 1125 m | **0** |

The second is the sharper of the two: twenty-four moving cars in the world for 16 s and not one
event, so the stream is keyed on an actual close pass and not on traffic existing.

## 10. POOL — decided on played evidence, and adopted as mine

Process rule 2: the inherited `POOL = 22` was unmeasured, so it is justified or reverted, never
inherited silently. The user's instruction was "cut the count hard, a handful of moving cars beats
thousands of parked ones", so the direction is right and I am not putting it back to 56.

The quantity I set it by is **the corridor ahead** — live vehicles inside a 50 deg half-cone of the
hero's heading within 200 m — and the near-miss rate that follows from it, because that is what the
boost economy is actually paid out of. "On screen" is the wrong quantity: it counts cars behind the
camera and cars the fog has already eaten. Swept inside ONE boot via `setPool()`:

| POOL | highway ahead | highway ev/km | city ahead | city ev/km |
|---|---|---|---|---|
| 22 | 3.89 / 3.72 | 6.6 / 4.9 | 2.51 | 3.0 |
| **30** | **5.51 / 5.97** | **8.2 / 10.8** | **3.48** | **6.8** |
| 40 | 8.04 | 14.1 | 4.30 | 5.4 |
| 56 | 12.26 | 20.3 | 6.94 | 11.8 |

(Two values where I ran a replicate. Every window is 20 s, all on the highway — my first sweep
started at path u = 0.28, ran off the end of `paths.highway` and spent the tail of each window
off-network, so the four values had each driven a different road. Discarded and re-run at u = 0.03.)

**DECISION: `POOL = 30`.** It is the smallest value that keeps three or more moving cars in the
corridor in BOTH scenes. 22 puts 2.5 downtown, which is the "reads as an empty city whatever the
total says" failure the round-1 header itself warns about, and it is the weakest of the four on
events/km in the city (3.0). 56 puts twelve cars on an open freeway and 20 events/km, which is a jam
rather than traffic. At 30 the player earns a near miss every ~1.4 s of highway at 279 km/h and every
~3 s downtown. It is a 46% cut on round 1, and `POOL_CAP` 64 with `setPool()` means the next agent
can re-derive this in one boot instead of arguing with a constant.

**The honest cost, stated because it is a real loss:** moving cars on screen downtown fall from the
critic's 5.6 to 2.3 (`<260 m`, in frustum, unoccluded, 36 s city drive). The kerb parking is
untouched, so the street is not abandoned, but the moving population you can see at any instant is
now two or three cars rather than six.

## 11. Regression gate

My change moves pixels: it changes how many vehicles exist. Rendered `dusk-highway-chase`,
`daytime-downtown` and `wet-night-asphalt` at 1280x720 before (HEAD) and after, and opened all six:
`shots/s/traffic-r2-{HEAD,AFTER}-<scene>.png`.

Nothing got worse in the sense this gate means. Sky, exposure, grade, buildings, signs, road
markings, wet reflections, the hero car and every baked parked car are identical frame to frame. The
only difference in any pair is that some moving traffic cars are absent, which is the intended edit
and is the user's own instruction. Night still lights correctly: 7 traffic InstancedMeshes non-zero
on `wet-night-asphalt` at counts 60/30/60/120/30/60/60, tail lamps reading on a car down the street.

`setPool()`/`applyPool()` moves each mesh's drawn `count`, so a smaller pool really is fewer
instances submitted (60/30/60/120/30/60/60 at POOL 30 against 112/56/112/224/56/112/112 at 56) rather
than more zero-scale matrices. Capacity is allocated once at `POOL_CAP`.

## 12. Robustness, all with zero console errors

| run | live count | overlap | stationary |
|---|---|---|---|
| city 36 s | 30.0 (min 29) | 0.000 m | 2.62% |
| highway 40 s | 30.0 (min 29) | 0.000 m | 0.00% |
| `wet-night-asphalt` 20 s | 30.0 (min 29) | 0.000 m | — |
| `--adversary ram` 30 s | 30.0 | 0.000 m | 0.00% |
| `--adversary rmash` (R mashed 40x) 30 s | 29.9 (min 27) | 0.000 m | 0.00% |
| `--adversary wrongway` 25 s | 30.0 (min 29) | 0.000 m | 0.00% |
| `--adversary sit` 30 s | 30.0 | 0.000 m | 1.31% |

City speed p50 moved **44.0 -> 46.75 km/h**, which puts it INSIDE the 45-59 km/h desired band the
critic recorded as a miss. Highway p50 **84.3 -> 89.0 km/h** against a 90-119 band: still a miss,
smaller, and I am not claiming it fixed — see section 14.

## 13. Frame time — SMOKE TEST ONLY, NOT A RESULT

I was told I run concurrently with `handling-r2` and `menu-music`, so per the wave contract no
frame-time number here is reportable. `node tools/fps.mjs --scenarios cruise --repeat 1`,
`renderW 1280 / renderH 720 / ratio 1 / dpr 1 / resScale 1`, n=322 frames at 276.9 km/h:
**mean 24.95 ms, p50 20.93, p90 45.89, p99 81.44, 69.6% over 16.7 ms, 735 draw calls.** Not
comparable to the perf piece's committed 17.2 ms mean; the machine has three agents on it.

The only traffic-cost numbers contention cannot invert are the paused interleaved counter A/Bs, and
they are proportional to POOL as expected:

| | POOL 56 (critic) | POOL 30 (mine) |
|---|---|---|
| traffic draw calls/frame, `daytime-downtown`, paused A/B x3 | 13.0 | **13.0** (unchanged: same 5 meshes) |
| traffic triangles/frame | 26 992 | **14 460** (-46%) |
| instances submitted, daylight | 112/56/112/224/56/0/0 | **60/30/60/120/30/0/0** |

## 14. HONEST MISSES AND THINGS I DID NOT DO

1. **Highway speed p50 is still below its band.** 84.3 -> 89.0 km/h against the desired 90-119. The
   cause the round-1 builder named is still true and still unfixed: there is no lane changing, so a
   fast car platoons behind a slow one. My overtake shy is keyed on a STOPPED blocker (`speed < 2.0`
   after 2.0 s) and deliberately does not fire for "the car in front is a bit slower than me",
   because a general lane-change decision is a much larger change and I would not have been able to
   hold the 0.000 m overlap invariant while measuring it in one round. City p50 did cross into its
   band (44.0 -> 46.75 against 45-59).
2. **Cutting POOL costs visible moving cars downtown**: 5.6 -> 2.3 on screen. Stated in section 10.
   If the user drives it and says downtown feels dead, the corridor table in section 10 says the
   next value to try is 40, not 56.
3. **The event stream's join is UNVERIFIED END-TO-END.** I verified my half by draining from inside
   the page; `physics.setEventSource` is `handling-r2`'s and the one wiring line is the session
   driver's in the frozen `main.js`. Until that lands, `drainEvents()` is written and never read in
   the shipped path.
4. **A `check` shunts the vehicle but does not spin it.** I kept every traffic yaw a multiple of 90
   degrees on purpose: the critic's exact overlap instrument depends on the boxes being
   axis-aligned, and a yaw kick would have made its 0.000 m readings approximate on the very run I
   need it to be exact on. So a checked car is knocked along and sideways, not rotated.
5. **`heroSpeed` is `physics.state.speed`, a forward component,** and the hero's real velocity now
   has a lateral part after the round-1 handling rewrite. Every hero-relative quantity here — the
   oncoming brake, the TTC, the event `relSpeed` — is therefore computed from heading x forward
   speed and understates a heavily sliding hero. Fixing it needs a fifth argument from the frozen
   `main.js`; routed, not worked around. It cannot change any event's TYPE, only its `amount`.
6. **I did not chase the off-network zero**, per the brief, and I did not touch `world.js` or
   anything else outside `game/traffic.js` and my own new tool.

## 15. ROUTED FINDINGS (nothing here is mine to fix)

- **R1, to `handling-r2`:** `physics.collide()` must collide with `traffic.vehicles`. Still 73 frames
  of hero-inside-a-body in a 30 s ram run. `t.vehicles` publishes `{pos, yaw, speed, halfLen,
  halfWid}`; every yaw is a multiple of PI/2 so the test is an exact AABB overlap.
- **R2, to the session driver / `main.js`:** the one wiring line
  `physics.setEventSource(() => traffic.drainEvents())`. My half is landed and matches the contract.
- **R3, to the session driver / `main.js`:** `traffic.update(dt, pos, yaw, speed)` should also pass
  the hero's LATERAL velocity (`state.vLat`), for the reason in miss 5. A fifth optional argument
  would be enough and this module would use it immediately.
- **R4, to whoever owns `world.js` next:** `world.js`'s `trafficLight()` props are static geometry
  showing one aspect while `traffic.signalPhase(gx, gz)` now flips 4-7 times in 30 s at a junction
  the hero is parked in. The state to drive them from exists and is live. Round 1 routed this too.

## 16. RULE 5 — BEFORE and AFTER literal values, with `file:line`

Every line number is in `game/traffic.js` as committed.

| what | BEFORE | AFTER | line |
|---|---|---|---|
| population ceiling | `const POOL = 56;` (HEAD) / `22` (inherited, uncommitted) | `let POOL = 30;` | :86 |
| instanced capacity | did not exist (meshes sized `POOL*k`) | `const POOL_CAP = 64;` | :85 |
| forward spawn floor | did not exist | `const SPAWN_FWD_MIN = 240;` | :93 |
| forward cone | did not exist | `const SPAWN_CONE = 0.0;` (tried 0.55, rejected) | :98 |
| line-end retire defer radius | did not exist | `const END_HIDE_R = 260;` | :103 |
| line-end defer cap | did not exist | `const END_HOLD_MAX = 5.0;` | :104 |
| `SPAWN_MIN` | `62` | `62` — UNCHANGED, the radius was never the whole gate | :88 |
| `SPAWN_R` / `DESPAWN_R` | `300` / `345` | `300` / `345` — UNCHANGED | :87, :95 |
| hero shy | `1.2` inline | `const SHY_LAT = 1.2;` | :109 |
| head-on evasion | did not exist | `const EVADE_LAT = 3.2;` | :110 |
| overtake shy / arm / hold | did not exist | `2.6` / `2.0 s` / `4.0 s` | :111-113 |
| inner lateral clamp | `1.0 - v.lane` | `LAT_INNER = 1.7` -> `Math.max(-L.latMax, LAT_INNER - v.lane)` | :114, :901 |
| outer lateral clamp | `L.half - 1.0 - v.lane` | `Math.min(L.latMax, L.half - 1.0 - v.lane)` | :902 |
| per-line shy ceiling | did not exist | `latMax: 2.8` city, `latMax: 3.0` highway | :175-176, :187 |
| lateral shy clamp on the damp target | `clamp(v.swerve, -1.3, 1.3)` | `clamp(v.swerve, -EVADE_LAT, EVADE_LAT)` | :894 |
| lateral damp rate | `3.0` | `3.0`, or `7.0` while `abs(swerve) > 2` | :893 |
| highway line ends | `lo: -1150, hi: 1150` | `lo: -1200, hi: 1200` | :186 |
| junction occupancy latch | `if (j.occ > 0) { j.owner = j.occAxis; ... }`, unbounded | `if (j.occMove > 0 && j.occT < OCC_HOLD_MAX)` | :743 |
| occupancy watchdog | did not exist | `const OCC_HOLD_MAX = 8.0;` (tried `3.2`, rejected on overlap) | :147 |
| occupancy split | `j.occ++; j.occAxis = L.axis;` | `j.occ++`, then `occStill++` or `occMove++ / occAxis` | :714-715 |
| leader test key | `o.line !== L \|\| o.dir !== v.dir \|\| o.lane !== v.lane` | lateral-extent overlap in the vehicle's own frame | :792 |
| hero shy direction | `(Math.sign(myLat - heroLat) \|\| 1) * 1.2` | `... * latSign * SHY_LAT`, `latSign = a0 ? v.dir : -v.dir` | :836-837, :855 |
| hero brake `vLead` | `Math.max(0, heroAlong)` | `Math.max(heroAlong, -12)` | :846 |
| oncoming reaction | none (a 90 m distance band only) | `heroAlong < -3 && hg / closing < 3.0` -> `away * EVADE_LAT` | :853 |
| hero lateral influence band | `< 3.4` | `< 3.6` | :840 |
| near-miss radius / release | did not exist | `3.4` m / `+1.4` m | :118-119 |
| event floors | did not exist | `EVENT_SPEED_MIN = 12`, `EVENT_REL_MIN = 8` | :120-121 |
| hero clearance radius | did not exist | `HERO_HALF_W = 0.95` | :122 |
| check shunt / queue cap | did not exist | `CHECK_SHUNT = 2.6` / `EVENT_CAP = 96` | :124-125 |
| `drainEvents` / `setPool` / `eventsTotal` | did not exist | new API, header contract at :19-21 | :596, :611, :604 |

Constants I deliberately did NOT touch, so nobody has to diff for them: `IDM_A 2.6`, `IDM_B 4.2`,
`IDM_S0 6.2`, `IDM_T 1.35`, `IDM_BRAKE_MAX 9`, `BOX_HALF 12.4`, `APPROACH 62`, `COMMIT 6.0`,
`GREEN_MIN 7.0`, `LINE_LAT_MAX 210`, `SPAWN_PER_FRAME 4`, the city lane set `[2.5]`, the highway lane
set `[3, 9, 15]`, both speed bands (`12.5-16.5` and `25-33`), and every body dimension in
`writeMatrices`.

```progress-metrics
POOL: 30 live (was 56 at HEAD, 22 inherited unmeasured) - corridor ahead 5.5 highway / 3.5 city
boost events: 6.9-8.2 per km highway, 6.3 per km city, mean amount 0.70-0.82 (round 1: no stream)
empty-road control: 0 events over 1128 m alone and 1125 m with 23.7 cars never passed close
junction deadlock: 7 phase flips in 30 s parked in the box, 0 frozen (was 0 flips, 15 of 56 frozen)
highway pop-in: closest VISIBLE spawn 241.2 m, 0 inside 240 m (was 62.9 m, 26 inside 120 m in 40 s)
visible retires: 0 in 30 s highway and 30 s city (was 3 at 119/138/177 m)
wrong-way head-on: 13 of 48 evade, min clearance +0.45 m (was 0 evade, -0.95 m = drove through)
body-on-body overlap: 0.000 m in 0 frames across 7 scenarios, invariant held
frame time SMOKE ONLY (3 agents on the box): p50 20.93 ms at 1280x720 ratio 1, n=322
```

## 17. Files

- `game/traffic.js` — the only game file I edited.
- `tools/_traffic-r2.mjs` — my instrument. Edits no game code.
- `shots/s/traffic-r2-{HEAD,AFTER}-{dusk-highway-chase,daytime-downtown,wet-night-asphalt}.png` —
  the regression-gate pairs. `shots/` is gitignored, so they are not committed.
