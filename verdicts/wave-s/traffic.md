# wave-s / traffic — live-traffic builder

Owns: `game/traffic.js`, the vehicle-population code inside `game/world.js`.
Written BEFORE any code edit, appended as work proceeded (wave-S process rule 1).

## 0. Tree check before trusting it (process rule 2)

`git status` at start: `game/world.js` is modified. `git diff game/world.js` was ONE hunk at
world.js:2709 — the highway pier radius 1.5/1.7 -> 0.75/0.85, with a wave-Q/R rationale comment.
That is not in my ownership area (the parked-car block lives at 2400-2620) and it is documented, so
I inherit it untouched.

## 1. The defect

world.js baked 2667 vehicles into sealed InstancedMeshes; every one stood still. Three separate
mechanisms produced them and they are not equally wrong:

- `rank()` — kerbside parking at `PARK_OFF = HALF + 0.5 = 10.5 m`. Legitimate.
- `signalQueue()` — a stopped queue on the stop bar of a signalled junction. Legitimate.
- `laneTraffic()` — standing cars in BOTH carriageways of every road segment, lane centres 2.5 and
  7.5, both directions. This is the car park.

## 2. FIRST ACTION: the count split, measured

Instrumented `parkedCar()` with a per-population counter (`world.parkedCounts`, still published) and
booted `dusk-highway-chase` in headless chromium at 1280x720:

| population | emitted | share |
|---|---|---|
| `rank()` kerb parking | **1099** | 41.2% |
| `signalQueue()` stop bars | **313** | 11.7% |
| `laneTraffic()` carriageways | **1255** | 47.1% |
| (culled by `heroDist`) | 148 | — |
| **total emitted** | **2667** | |

So the single worst mechanism is just under half the total, and kerb parking — the population that
is *supposed* to stand still — is the second largest. That split is what set the plan: kill
`laneTraffic()` outright, thin the other two, and build the moving population fresh.

A second thing the count exposed: **`laneTraffic()` never touched the highway.** It looped over the
city grid `G` only. `dusk-highway-chase` therefore had exactly ZERO vehicles on the highway before
this wave — see `shots/s/traffic-before-dusk-highway-chase.png`, six lanes of empty tarmac.

## 3. What I built

`game/traffic.js`, 56 live vehicles, four mechanisms each chosen as the simple version:

1. **Network.** Every road here is axis-aligned and nothing needs to turn (a car that leaves the
   ring is retired, not routed), so a road is one axis-aligned LINE with lane offsets and a vehicle
   is `(line, dir, lane, s)`. Lane geometry is reused, not re-derived: road.js's city tile is
   `widthM 20 / lanes 4` so the lane centres are 2.5 / 7.5 either side of the centreline, and the
   highway tile is `widthM 36 / lanes 6` so 3 / 9 / 15. Right-hand traffic: for direction
   `(ax, az)` the lane sits `(-az, ax) * offset` off the centreline, the same normal world.js's
   ranks already use.
2. **Ring.** Spawn in an annulus (62..300 m), retire at 345 m, weighted toward the road line the
   hero is on by `1/(1 + lateral/45)`. This is the entire reason the count can be a constant: POOL
   caps the live population no matter how far the player drives, where the baked population scaled
   with the map.
3. **Junctions: a demand-actuated two-phase signal, one integer of state per junction.** Because
   nobody turns, the only conflict at a crossroads is two vehicles on perpendicular axes wanting
   the same box, so "which axis owns the box" settles it completely. A vehicle whose axis does not
   own the box brakes to the box edge. Permission is **latched** per vehicle per junction, and the
   phase cannot flip while the box is occupied or while an owner-axis car can no longer physically
   stop.
4. **Following: IDM (Treiber).** One leader, where leader is the nearest of {car ahead in my lane,
   the stop bar at a red, the hero if he is ahead in my lane}. All three are the same
   gap-plus-closing-speed shape, so it is the same four lines evaluated three times and the lowest
   acceleration wins. IDM rather than a hand-rolled brake curve because `(sStar/gap)^2` diverges as
   the gap closes, which makes the gap a barrier instead of a suggestion.

Hero reaction: traffic brakes for the hero when he is ahead in its lane, and shies up to 1.2 m
laterally away from his line when he is closing from behind faster than 8 m/s. You can still put
the car through the back of it — that is the point — but it is not a wall of parked metal.

## 4. Edits, with BEFORE -> AFTER literals

`game/traffic.js` — was a 35-line documented stub, now 597 lines. The header contract main.js is
written against is unchanged; `t.POOL` and `t.signalPhase(gx, gz)` are added.

`game/world.js`:

- **world.js:2621 `laneTraffic()` and its double loop DELETED**, replaced by a comment
  recording what it was and why it was wrong. BEFORE: `function laneTraffic(ox, oz, ax, az, a0, a1)`
  emitting `for (const lane of [2.5, 7.5]) for (const dir of [1, -1])` over every segment.
  AFTER: no such function; 1255 -> 0 vehicles.
- **world.js:2562 `rank()` skip probability `if (R() < 0.30) continue;` -> `if (R() < 0.40) continue;`**
  1099 -> 944 kerbside cars.
- **world.js:2604-2605 `signalQueue()` lateral offset `2.6` -> `7.4`** (two call sites in the function
  body: `- az * 2.6` -> `- az * 7.4`, `+ ax * 2.6` -> `+ ax * 7.4`).
- **world.js:2600 `signalQueue()` length `rngInt(R, 3, 5)` -> `rngInt(R, 2, 4)`**, and the
  one-or-two-arms loop reduced to ONE arm: the `if (R() < 0.5) { ... signalQueue(gx, gz, ARMS[k2]...) }`
  second-arm block is deleted. 313 -> 138 queue cars.
- **world.js:2422 `const carWheel = inst(new THREE.CylinderGeometry(...), tyreMat, 19200);`** split
  into `const carWheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);` +
  `const carWheel = inst(carWheelGeo, tyreMat, 19200);` so the geometry can be shared.
- **world.js:2445 new `carKit`**, published as `LAYOUT.carKit` and `world.carKit`.
- **world.js:2888 `world.parkedCounts`** published.

### Why `signalQueue()` moved lanes rather than staying put

This is the one place I deviated from the brief's "keep, possibly thin" and it is a mechanism
argument, not a taste one. traffic.js runs LIVE cars in the city's inner lane. A baked stationary
car in the same lane as a live one is a **permanent immovable blockage**: the live car brakes
correctly, stops behind it, and stays there for the rest of the run. That is the car park again with
extra steps. There is also a read defect — a baked queue sits on the stop bar whether the live
signal has that arm green or red, so roughly half of them would be visibly stopped at a green light,
which is a worse artefact than the one being fixed.

At 7.4 (kerbside lane centre 7.5) the body spans 6.59-8.41 m: 1.2 m clear of the kerb parking at
10.5 and 3.2 m clear of the live inner lane. It stops reading as "waiting at the signal" and starts
reading as stopped/loading in the kerbside lane, which streets actually do. The population is kept,
thinned, and no longer contradicts the live signal. Same reason city live traffic uses the inner
lane (2.5) ONLY: geometric separation of the two populations is what makes them able to coexist.

## 5. Two defects the instrumentation caught, and the kill-controls

Both found by a 60 s / 3600-tick sim with an all-pairs body-overlap test (56 vehicles, ~1540 pairs
per frame, 5.5 M pair tests per run) — `daytime-downtown`, headless 1280x720.

**(a) Cars drove through each other in the junction box. Measured 3.24 m of body-on-body overlap at
(160, -160), frame 251.** Cause: the first version let any vehicle inside `BOX_HALF + COMMIT`
(18.4 m) proceed regardless of the owner, on the theory that it was past the point of stopping. A
vehicle that had never been given the green satisfies that test simply by having arrived. Fix:
permission is latched in `v.jOk`, set only by actually holding the green, cleared by a red we can
still stop for, cleared outright when the junction ahead changes. AFTER: **worst overlap 0.000 m,
0 overlap-frames.**

**(b) Signal deadlock. 11.8% of vehicle-frames stationary.** Cause: "imminent" was a fixed distance
band (`< BOX_HALF + COMMIT + 8` = 26.4 m) and the phase would not flip while an owner-axis car was
inside it — but a car STOPPED at the bar sits permanently inside that band, so it blocked the flip
it was itself waiting for. Fix: `imm` is now a braking fact, `v^2 / (2 * IDM_BRAKE_MAX) > dist to
bar`, so a stationary car contributes nothing. AFTER: 5.2% stationary, longest single stop 13.7 s
(one red plus a queue).

## 6. Headline numbers, with conditions

All from headless chromium, ANGLE/Metal, viewport 1280x720, `deviceScaleFactor: 1`
(`renderW 1280 / renderH 720 / pixelRatio 1 / devicePixelRatio 1 / resScale 1`).

| quantity | value |
|---|---|
| standing vehicles baked into world.js | **2667 -> 1082** (rank 1099->944, queue 313->138, lane 1255->0) |
| live moving vehicles | **56**, constant, hard-capped by POOL |
| scene meshes | 823 -> **830** (+7 InstancedMeshes; +2 of them cast shadows) |
| city mean speed, hero cruising the ring at 30 m/s, 60 s | **10.24 m/s** (36.9 km/h) vs 12.5-16.5 desired |
| city vehicle-frames stationary | **5.2%**; longest single stop 13.7 s |
| highway mean speed, 60 s | **23.23 m/s** (83.6 km/h) vs 25-33 desired; **0%** stationary |
| worst body-on-body overlap, 3600 frames x ~1540 pairs, city | **0.000 m** |
| worst body-on-body overlap, highway | **0.000 m** |

Draw-call reasoning for the optimisation piece: **7 InstancedMeshes** — body (2/car), glasshouse
(1), bumpers (2), wheels (4), contact pad (1), tail lamps (2), head lamps (2). The two lamp meshes
drop to `count = 0` in daylight, so it is 5 in every non-night preset. The 56 is set by what one
frame can see, not by what fits: fog and the next junction close a city street at ~300 m, and 56
weighted toward the hero's line puts ~22 on the road he is on, one every ~55 m per direction, with
6-7 visible down the corridor ahead. It is a *pool*, so it is also the ceiling: driving for ten
minutes does not add a vehicle.

## 7. Visual regression gate — I looked at all six PNGs

`shots/s/traffic-{before,after}-{dusk-highway-chase,daytime-downtown,wet-night-asphalt}.png`, all
1280x720. Also rendered after-shots for `boost-blur`, `crash-cam`, `car-paint-closeup`,
`hud-overlay`; none regressed and no console errors on any.

- **dusk-highway-chase: strictly better, and not marginally.** BEFORE: six lanes of completely
  empty tarmac, because `laneTraffic()` only ever ran on the city grid. AFTER: a van running
  alongside the hero and four or five cars strung down the lanes ahead. The highway now reads as a
  highway.
- **daytime-downtown: still reads inhabited.** Kerb parking down both kerbs, a yellow box van and
  two saloons in the oncoming lanes mid-street, a light car in the near right lane. Fewer bodies in
  the immediate foreground than before; the mid-field population is comparable. Not abandoned.
- **wet-night-asphalt: reads inhabited, differently.** Slightly fewer bodies in the mid-field than
  before, but two pairs of red tail lamps down the street, which is an unambiguous read of *live*
  traffic that the before frame could not produce at all. Honest note: this is the one frame where
  the raw vehicle count in view went down. It does not read empty.

**Junction proof by watching one:** `shots/s/traffic-junction-watch.png` — the playable path,
camera parked 62 m over the junction at (320, -160), `signalPhase(320, -160) === 1` (N-S green). Two
cars are stopped at the stop bar on each E-W arm, the box is clear of E-W traffic, and N-S is
running through it. That is the rule, visible.

## 8. What did NOT work

- **Fixed-distance "committed" and fixed-band "imminent".** Section 5. Both looked correct and both
  were wrong in ways only the all-pairs overlap test and the stationary-fraction count exposed.
  A visual check would have passed either of them.
- **Own materials for the traffic cars.** A plain `MeshStandardMaterial` car sits in FRONT of the
  fog at 200 m, because world.js's `patchAtmo()` aerial-perspective/canyon-fill shader patch is what
  every other prop in the scene carries. `patchAtmo` is not exported and world.js's car materials
  were not published, so traffic.js now takes them via `LAYOUT.carKit`. That routing exists because
  `LAYOUT` is the only object main.js forwards to `createTraffic`, and the `createTraffic` signature
  is a contract I was told to keep.
- **No lane changing, and it costs measurable speed.** Highway mean is 23.2 m/s against a 29 m/s
  mean desired, i.e. ~80% of free flow, because a fast car stuck behind a slow one in the same lane
  can never pass. It looks fine and it never telescopes, but the number is a real miss against
  free-flow and I am reporting it rather than quoting the desired speeds as achieved.

## 9. Routed to other pieces

- **hero-vs-traffic collision is NOT implemented here.** `game/physics.js` is owned by another agent
  this wave and `collide()` in it only knows about `blocks`. `t.vehicles` is live and exposes
  `{pos, yaw, speed, halfLen, halfWid, k}` per vehicle (halfLen 2.40 saloon / 2.55 van, halfWid 0.91
  / 0.96), so an OBB-vs-OBB test is available; every traffic car is axis-aligned, so the test is a
  box-vs-OBB and cheap. **Routed to physics.** Until it lands the hero passes through traffic.
- **world.js's `trafficLight()` props are static geometry** and still show one fixed aspect, so the
  lamps do not agree with the phase the cars obey. `t.signalPhase(gx, gz)` returns 0 (E-W green),
  1 (N-S green) or -1 (idle) for any grid junction and is the state to drive them from. That code is
  street furniture, not vehicle population, so it is outside my ownership.
- **Frame time is not mine to spend.** Reported above: 7 draw calls, 56 vehicles, ~560 body
  instances against the ~24 000 the baked population carried.

## 10. Frame time — SMOKE TEST ONLY, three peer agents were running

Per the wave contract this is not a result and nothing was tuned against it. Playable path,
`#nomenu=1`, `daytime-downtown`, throttle held 6 s, 54 frames, `renderW 1280 / renderH 720 /
pixelRatio 1 / devicePixelRatio 1 / resScale 1`: mean 128.11 ms, p50 114.80 ms, p90 229.70 ms,
p99 259.40 ms. Meaningless in absolute terms with three peers on the GPU. Its only use here is that
the page booted, ran, and logged zero console errors with 56 vehicles integrating every frame.
