# wave-s/handling-r3 - the impulse, the trail-brake dead zone, and the power-on edge

Written FIRST, before any edit, appended as I worked (play-brief process rule 1).

I own `game/physics.js` and `game/camera.js`. Nothing else. `game/main.js` is FROZEN.

**I am running with NO PEERS. Even so I report NO frame-time number as a result** - a frame-time
claim in this wave belongs to the perf critic, which runs after me and alone. Anything I take is
labelled a smoke test.

## 0. THE TREE BEFORE I TOUCHED IT (process rule 2)

`git status --short` at start: `PROMPT.md`, `driver.log`, `progress.json` modified (none of them
mine); `README.md`, `game/music/`, `verdicts/wave-s/perf-critic.md` untracked.
`git diff game/physics.js game/camera.js` was **EMPTY** - I inherited no unmeasured edit in either
file I own. Nothing to justify or revert. HEAD is `68c093b` (the driver's joins commit).

## 1. MY BRIEF, THREE ITEMS

1. `driftFlick` adds to `state.vLat` (free energy, and `state.ground` is now the speedometer AND the
   engine note). Rotate the velocity vector instead, then re-measure the chain honestly.
2. Brake + lock from straight at 130 km/h sweeps 2.8 deg of heading in 400 ms vs 11.9 deg for
   throttle + lock. Asking for rotation with the brake gets you LESS rotation.
3. No power-on grip edge, third round. `gripUse` is REFUTED and off limits. Find the real mechanism
   or disclose a structural limit with the kill-controls that show it.

(appended below as I worked)

## 2. WHAT I CHANGED. Rule 5: literal BEFORE -> AFTER with `file:line`.

`game/camera.js` is **NOT TOUCHED** - `md5 -q game/camera.js` is `f21d687ad144082d7e7b2db05872c0df`
and `git show 68c093b:game/camera.js | md5 -q` is the same string. `game/physics.js` is the only game
file in my diff: `git diff --stat game/` reads `game/physics.js | 119 +++...`, 116 insertions and 3
deletions, of which the non-comment part is exactly the four blocks below.

New constant:

| file:line | BEFORE | AFTER |
|---|---|---|
| `game/physics.js:521` `driftRefFloor` | *(did not exist)* | **`1.5`** |

Changed lines of behaviour, all three inside `substep()`:

| file:line | BEFORE | AFTER |
|---|---|---|
| `game/physics.js:1048-1052` (the flick) | `state.vLat -= dSign * TUNE.driftFlick * dCounter * gv;` | `const dPhi = -dSign * TUNE.driftFlick * dCounter;` / `const cPhi = Math.cos(dPhi), sPhi = Math.sin(dPhi);` / `const vRot = state.speed * cPhi - state.vLat * sPhi;` / `state.vLat = state.speed * sPhi + state.vLat * cPhi;` / `state.speed = vRot;` |
| `game/physics.js:1133-1138` (the drift reference) | `const ref = lerp(rSustain, rTarget, gather);` | `const floorFade = 1 - clamp((Math.abs(slipNow) / satRear - 1) / (TUNE.driftRefFloor - 1), 0, 1);` / `const refSustain = lerp(rSustain, rTarget, gather);` / `const sT = Math.sign(rTarget);` / `const ref = floorFade > 0 && sT !== 0 && sT * refSustain < sT * rTarget ? lerp(refSustain, rTarget, floorFade) : refSustain;` |
| `game/physics.js:1197-1198` (the feed-forward gate) | `const entering = rearBroke && tapOut !== 0;` | `const proRotation = tyreMoment * Math.sign(rTarget \|\| dSign) > 0;` / `const entering = rearBroke && tapOut !== 0 && proRotation;` |

**Constants I did NOT change, and any claim in this file should be checked against them:**
`gripUse 0.85` (explicitly off limits and I did not touch it), `driftFlick 0.18`,
`driftBreakRatio 1.0`, `driftEnterRatio 1.4`, `driftExitRatio 0.7`, `driftTapSlip 0.30`,
`driftTapBrake 0.55`, `driftTapLinger 0.35`, `driftStabilityAssist 6.00`, `driftYawAuthority 0.90`,
`driftAngularDamping 0.24`, `driftCounterGather 0.60`, `driftCounterDecay 3.0`, `stabilityAssist 2.6`,
`spinDamp 6.0`, `steerServo 0.45`, `steerServoDrift 0.06`, `driveSplitRear 0.65`, `absHold 0.985`,
`transferCap 0.40`, `downforce 0.95`, `muFront 2.50`, `muRear 2.32`, `tyreStiff 18.0`, `vMax 78`,
`handbrakeSlip 0.55`, `handbrakeAssist 1.60`, `handbrakeRate 0.75`, `handbrakeGain 9.0`,
`hitNormalSpeed 34`, `hitKeep 0.38`, `scrapeKeep 0.96`, `wreckSeverity 0.92`, all boost earns.

Comment work, and I flag it because rule 5 exists for exactly this: I wrote a comment at the flick
claiming the chain fell "16.2 -> 12.0 deg", measured it at **16.1**, and corrected the comment before
committing. Every number now in a comment I wrote is copied out of
`verdicts/wave-s/handling-r3-kill.txt`.

## 3. MY INSTRUMENTS, AND THE ONE THING I CHANGED IN THEM THAT FOUND EVERYTHING

| file | what | log |
|---|---|---|
| `tools/_hr3.mjs` | 8 sections, paired BEFORE/AFTER, ~25 kill-controls. BEFORE is `git show 68c093b:game/physics.js` loaded as a real module, not a patched approximation | `verdicts/wave-s/handling-r3-kill.txt` |
| `tools/_hr3-live.mjs` | LIVE, real `KeyboardEvent`s through `main.js`'s own listeners. `tools/_hr2v-live.mjs` with the SIGN fix below | `verdicts/wave-s/handling-r3-live.txt`, and the paired BEFORE at `handling-r3-live-BEFORE.txt` |
| `tools/_hcr2-drive.mjs`, the round-2 critic's own tool, UNMODIFIED | all ten of its sections at my HEAD, so my numbers are directly comparable to the critic's and the verify pass's | `verdicts/wave-s/handling-r3-drive.txt` (its own log restored with `git checkout --`; `git status` shows it unmodified) |

Render size for every live figure, verbatim from `ctx.renderSize()`:
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`.

**THE ONE INSTRUMENT CHANGE, AND IT IS THE MOST IMPORTANT THING IN THIS VERDICT.**
Both previous passes measured turn-in as `Math.abs(yaw_end - yaw_start)`.
Mine measures the heading **SIGNED against the direction the driver asked for**, and reports the worst
wrong-way yaw rate as a separate column.
The unsigned metric scores a car spinning AWAY from the corner as a car turning into it, and that is
permanent rule 3 in one line - a metric satisfiable by the wrong object.
It is the whole reason item 2 turned out to be four times worse than the brief said.
`tools/_hr3.mjs` carries the note; `tools/_hr3-live.mjs` also folds in that `main.js` maps LEFT to
`+1`, so `KeyD` is `steer -1` and a correct right-hand turn is a NEGATIVE yaw.

I reproduce the verify pass's own headless figures digit for digit before changing anything -
chain `8.9 / 20.6 / 16.2 / 16.2 / 16.2 / 16.2 deg at 69%`, `driftFlick 0` giving `8.5-8.7 deg`,
peak `|vLat|` `11.55` against `7.40`, orderings `2.37 / 2.98 / 0.83 s`, e-brake
`-26/-70/-93` at 80 km/h, grip edge `28-29 deg/s / 5.0 deg / 0%` at 250 - which is how I know my
harness and its harness agree.

## 4. ITEM 1 - THE IMPULSE. It is now a ROTATION, and the free energy is zero, not smaller.

`physics.js:1048` used to do `state.vLat -= dSign * driftFlick * dCounter * gv`.
Adding lateral velocity raises `hypot(speed, vLat)`, which is `state.ground`, which since `da65fcf`
is the speedometer AND the engine note.
It now rotates the body-frame velocity vector by `dPhi = -dSign * driftFlick * dCounter`, the same
angle the old impulse implied to first order, because `slipNow = -atan2(vLat, |v|)`.

**MEASURED AT THE LINE ITSELF** (`tools/_hr3.mjs` section 2 - a metered copy reports
`hypot(speed, vLat)` immediately either side of the flick and sums the difference over the published
six-beat chain at 130 km/h):

```
BEFORE (injection): ground speed CREATED = 6.2173 m/s total (22.4 km/h), biggest single application 0.0409 m/s
AFTER  (rotation) : ground speed CREATED = 0.0000 m/s total,             biggest single application 0.0000 m/s
```

This is not a tuned improvement. A rotation is norm-preserving, so the number is zero
**algebraically**, and no future retune can reintroduce it.

**WHAT IT COST, and it is much less than the verify pass predicted.** The verify pass expected the
chain to fall to the `driftFlick 0` figure of 8.7 deg. It does not, because the manufactured ground
speed was small next to `gv` - the injection's own feedback through `gv` was worth about a tenth of a
degree, not seven. Rotation alone, nothing else changed:

| | BEFORE | AFTER (rotation only) |
|---|---|---|
| chain beats 3-6 at 130 km/h | 16.2 deg | **16.1 deg** |
| " at 100 / 150 km/h | 15.8 / 16.6 | 15.7 / 16.4 |
| peak \|vLat\| | 11.55 m/s | 11.41 m/s |
| the three orderings | 2.37 / 2.98 / 0.83 s | 2.37 / 2.98 / 0.83 s (unmoved) |

Also visible in the round-2 critic's own free-energy probe, live, run unmodified: the biggest
one-frame ground-speed gain on the tapped ordering falls `+1.15 -> +1.06 km/h` and peak `accelG`
`20.4 -> 17.7 m/s^2`. The residue is the tap's ANGLE command, which is a rate reference and not an
injection.

**HONEST STATEMENT OF THE DEPTH, which the brief asked for either way.**
`driftFlick` still supplies **7.4 of the chain's 16.1 deg**: zero it and beats 3-6 sit at
**8.5-8.7 deg**, exactly the verify pass's number.
It is no longer free ENERGY, but it is still a scripted instantaneous rotation rather than a force,
and **I did not manage to source it from the tyre model.** See honest miss 1. I did not buy depth
back by re-tuning `driftAngularDamping` or `driftYawAuthority`, because those are the three orderings'
own constants and moving them to recover a number the flick was supplying would be trading a measured
pass for an unmeasured one.

## 5. ITEM 2 - THE TRAIL BRAKE. It was not a dead zone. THE CAR ROTATED THE WRONG WAY.

The brief and the verify pass both describe this as brake-plus-lock sweeping 2.8 deg where
throttle-plus-lock sweeps 11.9. That is true at 130 km/h. At 200 and 250 km/h the same input **rotated
the car in the opposite direction to the one the player asked for**, and neither previous pass could
see it because both measured an unsigned heading.

**LIVE, real keys through `main.js`, from dead straight, brake + full right lock, SIGNED heading in the
window, paired A/B against `68c093b` in the same script:**

| speed | BEFORE, 400 ms | AFTER, 400 ms | W+D 400 ms (the bar) | BEFORE, 800 ms | AFTER, 800 ms |
|---|---|---|---|---|---|
| 100 km/h | +11.0 deg | **+16.3** | +14.6 | +10.0 | +8.4 |
| 130 km/h | + 2.9 deg | **+11.0** | +12.2 | +14.1 | +13.7 |
| 200 km/h | **- 8.1 deg** | **+ 6.1** | +10.6 | **-31.8** | **+22.9** |
| 250 km/h | **-14.9 deg** | **+ 4.9** | +10.1 | **-41.8** | **+25.0** |

Worst wrong-way yaw rate anywhere in the window, live: **-96 deg/s at 250 km/h BEFORE, 0 deg/s at
every speed AFTER.** Headless (`_hr3.mjs` section 3) reproduces it: 250 km/h goes `-14.2 -> +3.3 deg`
with the worst wrong-way rate `-92 -> 0`, and the peak CORRECT-way yaw rate at 250 km/h BEFORE was
**1 deg/s** while the car was rotating the other way at 92.

**THE MECHANISM, instrumented rather than argued** (a metered copy printing `ref`, `rTarget`, `rHold`,
`tapOut` and `tyreMoment` per substep):

1. The capacity-based entry arms the drift state at **0.1 deg** of slip, so from that substep the yaw
   is governed by `lerp(rSustain, rTarget, gather)` instead of by the driver's requested rate. With no
   countersteer `gather` is 0, so the reference is `rHold + tapOut` - and `rHold` is *the rate that
   holds the angle the car has now*, which at entry is zero. At 130 km/h that reference reads
   **8 deg/s rising to 32** while `rTarget` reads **17 rising to 58**. Asking for rotation got you
   less rotation than not asking, which is what the brief says is backwards.
2. Worse, `entering = rearBroke && tapOut !== 0` left the tyres' yaw moment uncancelled on the claim
   (in round 2's own comment) that with the rear's circle spent it "IS the tail coming out". Measured,
   it is not: from dead straight the net moment is **-109 deg/s^2 at 130 km/h for the first 0.25 s**
   and **-908 deg/s^2 at 250 km/h for the whole entry** - flatly anti-rotation, because the brake's
   load transfer has loaded the front axle before `delta` has built a front slip angle. A 900 deg/s^2
   anti-rotation disturbance against a servo of gain 6.0 is how the car ended up rotating backwards.

**BOTH HALVES ARE LOAD-BEARING AND NEITHER IS REDUNDANT** (`_hr3.mjs` section 7, each deleted alone,
signed heading in 400 ms from straight, headless):

```
                    100 km/h   130 km/h   200 km/h   250 km/h   worst wrong-way yaw
BEFORE (68c093b)     + 7.2      + 0.4      - 9.3      -14.2      -92 deg/s
AFTER  (both)        +11.2      + 7.7      + 4.1      + 3.3        0
ref floor deleted    + 7.4      + 3.9      + 1.4      + 1.0        0    <- sign fixed, rotation gone
pro-rot gate deleted +10.4      + 2.8      - 7.3      -12.5      -83    <- rotation back, still inverted
both deleted         + 7.2      + 0.4      - 9.3      -14.2      -92    <- BEFORE, exactly
```

The last row reproducing BEFORE to the decimal is what says nothing else in my diff is carrying this.

**`driftRefFloor` WAS FIRST SHIPPED AT 2.0 AND THAT WAS WRONG, and the critic's own tool caught it.**
The turn-in figures are flat across `1.2 / 1.5 / 2.0 / 3.0 / 6.0` (130 km/h reads 7.7 deg at every
value), but the tapped countersteer measures `2.92 / 2.92 / 2.67 / 1.89 / 0.84 s`, and live at 2.0 the
round-2 critic's **fixed 10 deg bar** for ordering 2 read `2.77 s against a centred 2.85 s` = MISS,
where the verify pass had it at 3.40 s HIT. I re-ran `_hcr2-drive.mjs` unmodified, saw the MISS, took
1.5, and re-ran it: **ordering 2 is 2.68 vs 2.22 HIT and 3.25 vs 2.85 HIT on both bars.** I am
recording this because the first value would have shipped a scored regression that no headless number
of mine flagged.

**AND IT CLOSED ROUND 2'S OWN HONEST MISS 1.** Round 2 missed the critic's "all six beats above ~10
deg" bar on beat 1, at 9.0 deg live. Live, `_hcr2-drive.mjs` section 10 at my HEAD:

```
round 2 : beat1  9.0  beat2 20.6  beat3 16.2  beat4 16.2  beat5 16.2  beat6 16.3 deg
round 3 : beat1 15.4  beat2 24.2  beat3 15.6  beat4 15.0  beat5 15.5  beat6 14.9 deg
          68-98% of samples drifting on every beat
```

**All six beats are now above 10 deg.** Beats 3-6 are 0.7-1.3 deg shallower, which is the
pro-rotation gate's price (16.2 -> 14.4 headless with the gate alone) and it is a trade I am stating
rather than hiding: 5.6 deg on the wind-up beat and the elimination of a wrong-way spin, for 1.3 deg
on the steady beats.

**AND THE SINGLE BRAKE TAP, which was round 2's other scored regression** (it disclosed the tap
peaking 1-2 deg shallower than pre-repair). Live, `_hcr2-drive.mjs` section 4, one 200 ms tap after
0.5 s of load:

| | round 2 | round 3 |
|---|---|---|
| 100 km/h | peak 9.5 deg, held 2.05 s | **13.8 deg, 2.53 s** |
| 130 km/h | peak 8.5 deg, held 1.70 s | **13.9 deg, 2.54 s** |
| 150 km/h | peak 8.0 deg, held 1.53 s | **13.3 deg, 2.48 s** |

## 6. ITEM 3 - THE POWER-ON EDGE. A DISCLOSED STRUCTURAL LIMIT, with eleven kill-controls.

**I could not produce a power-on grip edge and I am not going to pretend I found a knob. Here is why,
measured.**

The brief named three candidates. All three are refuted by their own kill-control, and so are eight
more I added. `_hr3.mjs` section 8, six seconds of full lock and full throttle, peak slip / peak yaw /
% drifting / peak `latRatio`:

```
baseline (shipped)           100: 4.5deg/41/0%/0.78   130: 4.6deg/35/0%/0.78   250: 5.0deg/29/0%/0.79
1 spinDamp ceiling off       100: 4.5deg/41/0%/0.78   130: 4.6deg/35/0%/0.78   250: 5.0deg/29/0%/0.79
2 stabilityAssist 2.6 -> 0   100: 4.5deg/41/0%/0.78   130: 4.6deg/35/0%/0.78   250: 5.0deg/29/0%/0.79
3 both 1 and 2               100: 4.5deg/41/0%/0.78   130: 4.6deg/35/0%/0.78   250: 5.0deg/29/0%/0.79
4 steerServo 0.45 -> 0       100: 4.5deg/42/0%/0.78   130: 4.6deg/37/0%/0.78   250: 5.0deg/30/0%/0.79
5 driveSplitRear 0.65->0.80  100: 4.5deg/41/0%/0.86   130: 4.6deg/35/0%/0.85   250: 5.0deg/29/0%/0.81
6 driveSplitRear 0.65->1.00  100: 6.2deg/41/0%/1.09   130: 4.6deg/35/0%/1.01   250: 5.0deg/29/0%/0.84
7 intent gate takes throttle 100: 4.5deg/41/0%/0.78   130: 4.6deg/35/0%/0.78   250: 5.0deg/29/0%/0.79
8 load transfer OFF          100: 88.0deg/97/0%/2.97  130: 5.3deg/34/0%/1.06   250: 5.5deg/29/0%/0.90
9 downforce 0.95 -> 0        100: 4.5deg/36/0%/0.80   130: 4.6deg/29/0%/0.80   250: 4.8deg/17/0%/0.78
10 6 AND 7 together          100: 4.5deg/40/42%/1.09  130: 4.6deg/35/19%/1.02   250: 5.0deg/29/0%/0.84
11 delta = mechanical lock   100: 3.8deg/45/0%/0.79   130: 3.9deg/44/0%/0.79   250: 5.5deg/60/0%/0.80
(control) gripUse 0.85->1.30 100: 4.5deg/57/0%/1.21  130: 4.6deg/51/0%/1.20   250: 6.4deg/43/0%/1.22
```

Kill-controls 1, 2 and 3 are the brief's "the yaw-rate servo catching the car before the tyre can step
out". **It is not catching it.** Note this is a different object from the one round 2 tested and
correctly reported REFUTED: round 2 cut `steerServo`, the steering-ANGLE feedback inside `delta`
(that is number 4 here, also inert). Numbers 1-3 are `stabilityAssist` and `spinDamp`'s `rAllow`
ceiling, i.e. the actual yaw-rate servo, killed outright. Peak slip does not move by 0.1 deg.
Kill-control 7 is the brief's third candidate, the `intent` gate: also inert, because `rearBroke` is
false at ratio 0.78 so opening the gate gives it nothing to arm on.

**THE REAL MECHANISM, AND IT IS THE BRIEF'S SECOND CANDIDATE MEASURED AND FOUND TO POINT THE OTHER
WAY.** `latRatio` is the rear axle's share of the corner the driver is asking for divided by the
lateral force the rear tyre can actually make this substep - both quantities already computed inside
`substep()`. It has to reach 1.0 for the tail to step out. Steady state after 6 s of full lock:

| | latRatio | rear circle spent by DRIVE | rear axle LOAD vs undisturbed |
|---|---|---|---|
| full throttle 100 km/h | **0.782** | 34% | **116%** |
| full throttle 130 km/h | **0.783** | 33% | 115% |
| full throttle 200 km/h | **0.785** | 31% | 114% |
| full throttle 250 km/h | **0.787** | 29% | 113% |
| coasting 200 km/h | 0.859 | 0% | 99% |
| coasting 250 km/h | 0.859 | 0% | 99% |

**Throttle makes the rear axle MORE capable, not less.** The drive force spends 29-34% of the rear's
friction circle, which costs about 6% of its lateral capacity via `sqrt(1 - used^2)`; the longitudinal
load transfer it causes puts 13-16% MORE vertical load on the same axle. The second beats the first at
every speed, so `latRatio` on throttle is a near-constant **0.78** from 100 to 250 km/h while
**coasting reaches 0.86**. Power-on oversteer cannot happen because in this model power is a rear-grip
GAIN. Kill-control 8 is the direct proof: delete the load transfer and the ratio goes 0.78 -> 1.06 at
130 km/h and 2.97 at 100 km/h, where the car spins to 88 deg. Load transfer at `cgHeight 0.32` over a
2.72 m wheelbase at 12 m/s^2 is 2118 N against a 8070 N static rear load - that is real physics and
26% is the right number, so it is not available as a knob.

**AND THERE IS A SECOND, INDEPENDENT CEILING, which is why even forcing the ratio past 1.0 buys
nothing.** At ratio 1.09 (number 6) peak slip is 4.6 deg at 130 km/h; at 1.22 (the refuted `gripUse`
1.30) it is 4.6 deg and still 0% drifting; number 10 finally arms the drift state (42% / 19%) and peak
slip is *still* 4.5 / 4.6 deg. Number 11 is the control that names it: `delta` is not the player's
steering angle, it is an **inverse-model output that solves for the angle which achieves `rTarget`**,
so `state.steer` is a rate request and the player cannot ask the front tyre for more slip than the
grip-limited rate needs. Hand `delta` the mechanical 23 deg lock instead and peak slip goes DOWN at
road speed (3.8 / 3.9 deg at 100 / 130) because the inverse model was already applying more angle than
the lock. The steady-state body slip angle is pinned near `gripUse x satRear x` a geometry factor, and
there is no servo, damper, gate, split or steering parametrisation between the driver and it.

**WHAT THE MODEL IS ACTUALLY MISSING, stated as the routed next step and NOT shipped.** This is a
single-track (bicycle) model: zero track width, one force per axle. So it cannot represent the driven
axle's left/right tractive force split - the differential yaw moment - which is the dominant real
source of power-on rotation in a rear-biased car. That is a structural absence, not a tuning value,
and adding it means leaving the single-track model, which is a piece of work and not a constant.
**I deliberately did not ship an unsourced power-on yaw term.** It would have been `driftFlick` again
in a new place, and item 1 of my own brief is about removing exactly that class of thing.

**VERDICT ON ITEM 3: DISCLOSED STRUCTURAL LIMIT.** Third round, still 28-29 deg/s and 4.9 deg of slip
at 250 km/h live, 0% drifting. What the player does have is the lift-off edge (29 -> 47 deg/s over 6 s
at 250 km/h, live) and the brake tap, which now reaches 13.3-13.9 deg at 100-150 km/h and 6.1-6.3 deg
at 200-250, and Paradise's own published entries are exactly those two plus the e-brake.

## 7. REGRESSION GATES. Nothing the critic or the verify pass passed is allowed to move.

**LIVE, the round-2 critic's own `tools/_hcr2-drive.mjs` run UNMODIFIED**, all ten sections:

| gate | verify pass at `748e11c` | mine at HEAD+diff |
|---|---|---|
| **sign invariant** (automatic FAIL) | D +53.3 m right, A -77.2 m left; `up.carLeft` +0.11687 / -0.11762 | **D +52.2 m right, A -77.9 m left; +0.11739 / -0.11799 - banks AWAY from the turn centre in BOTH. PASS** |
| body roll peak | 6.46 / 6.90 deg | 6.53 / 6.98 deg |
| ordering 1, persists centred | 2.22 s | **2.22 s** HIT |
| ordering 2, tap LENGTHENS | 2.77 s [10 deg bar 3.40 vs 2.85] | **2.68 vs 2.22 HIT [3.25 vs 2.85 HIT]** |
| ordering 3, held ENDS it | 0.78 s [0.82 vs 2.85] | **0.77 s HIT [0.82 vs 2.85 HIT]** |
| e-brake 80/130/200/250 km/h at 1/2/3 s | -26/-70/-93, -20/-51/-81, -19/-45/-67, -20/-43/-63% | **-27/-70/-93, -20/-51/-81, -19/-44/-67, -20/-43/-63%** monotone, never faster than entry, 59-105 deg/s of yaw |
| the wall | 77% at 10 deg, 25% at 45 deg, `state.crashed` reachable via the landed join | **identical** |
| chase rig | leads the car in 0 of 229 samples | **0 of 226**, max readable lag 11.8 deg |
| chain, whole run | 17.7 deg / 57% | 14.8 deg / 56% (see honest miss 2) |
| console / page errors | NONE | **NONE**, all ten sections |
| `bash tools/lint.sh` | `lint ok` | **`lint ok`** |
| `node tools/handling-measure.mjs` | 40 HIT / 1 MISS / 7 measured-only | **40 HIT / 1 MISS / 7 measured-only** - the same single MISS, the stale passive-refill target |

Headless (`_hr3.mjs` sections 5 and 6), paired against `68c093b`: e-brake identical at all four
speeds, wall tiers identical, lift-off identical at 145 and 250 km/h, and **10 s of full lock and full
throttle at 60/130/200/250/280 km/h produces the same 28-58 deg/s and 4.6-5.1 deg of slip as BEFORE at
every speed - nothing spins.**

**THE PIXEL GATE.** My change can move a pixel: the seven screenshot presets drive the path follower
through `physics.step()`. All seven rendered at 1280x720 with my file and with `68c093b`'s file,
nothing else in the tree different (`shots/s/r3-{BEFORE,AFTER}-<scene>.png`).

- **Every `tools/_px.mjs` region statistic is IDENTICAL on all seven presets**, `diff` clean, not
  merely close.
- Raw per-channel decode: `dusk-highway-chase` 98 channels differ out of 3 686 400 (max 5/255),
  `boost-blur` 75 (max 2), `crash-cam` 5 (max 1), `wet-night-asphalt` 62 (max 5),
  `daytime-downtown` 270 (max 15), `car-paint-closeup` 11 (max 2), `hud-overlay` 29 (max 1).
  That is 0.0001-0.007% of channels, inside `STATE.md`'s documented determinism caveat.
- **I opened the worst pair, `daytime-downtown`, and looked at both.** Same framing, same light, same
  signage, road markings, wet sheen and traffic, car in the same place. **Nothing got worse.**

The presets never enter the drift state and never touch the e-brake, and all three of my changes are
inside `if (handbrake) ... else if (state.drifting)` or gated on `state.drifting`, which is why the
statistics are identical rather than merely close.

## 8. HONEST MISSES

1. **`driftFlick` is still an unsourced scripted rotation, and 7.4 of the chain's 16.1 deg is it.**
   The free energy is gone and provably so, which is what the brief asked for, but the brief also
   asked me to earn the depth from the tyre model if 8.7 deg was not enough, and **I did not.** Zero
   the term and beats 3-6 sit at 8.5-8.7 deg. I declined to buy it back by moving
   `driftAngularDamping`, `driftYawAuthority` or `steerServoDrift`, because those are the three
   orderings' own constants and trading a measured pass for an unmeasured one is worse than the miss.
   The honest source, if the next round wants one, is the same one item 3 needs: lateral load transfer,
   which a single-track model cannot have.
2. **The chain is 2.9 deg shallower live than the verify pass measured** (14.8 vs 17.7 deg peak, at
   56% vs 57% drifting). 0.1 deg of that is the rotation and the rest is the pro-rotation gate. I
   think it is the right trade - beat 1 goes 9.0 -> 15.4 deg so all six beats clear the critic's 10 deg
   bar for the first time, and the wrong-way spin is gone - but the headline peak went DOWN and the
   critic is entitled to weigh that.
3. **`driftRefFloor` at 2.0 would have shipped a scored regression** (ordering 2 MISS on the fixed
   10 deg bar) and only the critic's own live tool caught it. Shipped at 1.5. Recorded because it says
   my headless harness is not sufficient on its own.
4. **NO POWER-ON GRIP EDGE, third round, and I am closing it as a structural limit rather than a
   miss to retry.** Section 6. If the critic disagrees with the disclosure, the eleven kill-controls
   and the `latRatio` table are the things to attack.
5. **Brake + lock still under-rotates throttle + lock at 200-250 km/h** (+6.1 vs +10.6 and +4.9 vs
   +10.1 deg at 400 ms, live). It is no longer inverted and no longer a dead zone, and at 800 ms the
   braked car is well past the unbraked one (+22.9 vs +22.5 and +25.0 vs +20.9), but parity at 400 ms
   is not reached above 130 km/h.
6. **A held brake at 100-130 km/h still swings to 24-29 deg of slip in 800 ms and then needs catching**
   (worst wrong-way yaw -60 / -25 deg/s at 800 ms, live, which is the slide gathering back up after
   the overshoot). Round 2 disclosed the same behaviour and did not fix it; neither did I. It is not
   inverted response - it is a real deep slide that recovers.
7. **`state.vy` / `airborne` are still dead** and `state.crashed` is still never asserted by this file
   (`crash.js:2340` owns it, and the driver's wreck join now reaches it).
8. **No frame-time number of any kind, not even a smoke test.** I ran alone and I still took none: a
   frame-time claim in this wave belongs to the perf critic.

## 9. ROUTED FINDINGS

1. **To whoever owns the model next, and it is the same finding for items 1 and 3: this is a
   single-track model with zero track width.** It therefore has neither lateral load transfer (the
   physical source of a Scandinavian flick) nor a driven-axle left/right force split (the physical
   source of power-on oversteer). Both open items reduce to that one absence, and it is a piece of
   work, not a constant. The number the diff moment would have to supply is in section 6:
   `latRatio` has to cross 1.0 on throttle, and it currently sits at 0.78 at every speed.
2. **To `tools/_hr2v-live.mjs` and any future turn-in instrument: an unsigned heading metric is not a
   metric.** It scored a car spinning away from the corner at 96 deg/s as 41.8 deg of turn-in. Mine is
   signed and reports the worst wrong-way rate separately; please keep it that way.
3. **To `docs/BURNOUT-HANDLING.md` (not my file):** section 9.1 still says `TUNE.vMax = 78` "sits
   inside the real 177-201 mph band". 78 m/s is 174.5 mph, below it. Fourth round this has been routed.
4. **To `tools/progress.mjs` (not my file):** its `PLAY` table still keys on the ROUND-1 piece names,
   so `handling-r2.md`, `handling-r3.md` and `menu-music.md` are invisible and the board shows round
   1's superseded `0.63 s` drift hold as current. Fourth round this has been routed. My fenced
   `progress-metrics` block is present and correct; it is simply not read.

## 10. VERDICT ON MY OWN PIECE

**Item 1: DONE, and the win is stronger than a number - the free energy is zero algebraically, not
reduced. Item 2: DONE, and the defect was four times worse than the brief knew, because both previous
instruments were unsigned. Item 3: NOT DONE, closed as a disclosed structural limit with eleven
kill-controls and a measured ratio table that says power ADDS rear grip in this model.**

Two of round 2's own scored regressions closed as a side effect: all six chain beats are now above the
critic's 10 deg bar (beat 1 was 9.0), and the single brake tap went from 8.0-9.5 deg to 13.3-13.9 deg
and from 1.5-2.1 s to 2.5 s of hold. One value of mine (`driftRefFloor 2.0`) was caught by the
critic's own tool before it shipped and corrected to 1.5. `camera.js` is byte-identical to HEAD.
No pixel got worse. No frame-time number taken.

The thing I would put in front of the user: **you can now brake into a corner.** Before this round,
pressing the brake and the steering together at motorway speed rotated the car away from the corner at
up to 96 deg/s, and nobody had noticed because the tools measured how much the car turned without
asking which way.

```progress-metrics
brake+lock turn-in from straight, LIVE signed heading in 400 ms: 100/130/200/250 km/h now +16.3/+11.0/+6.1/+4.9 deg (was +11.0/+2.9/-8.1/-14.9, i.e. BACKWARDS at 200 and 250)
worst WRONG-WAY yaw rate on brake+lock, LIVE: 0 deg/s at every speed (was -96 deg/s at 250 km/h; two earlier passes measured heading unsigned and could not see it)
driftFlick free energy over a 6-beat chain, metered at the line: 0.0000 m/s created (was 6.2173 m/s = 22.4 km/h, straight into the speedometer and the engine note)
chain drift, all 6 beats, LIVE per beat: 15.4/24.2/15.6/15.0/15.5/14.9 deg at 68-98% drifting - all six above the critic's 10 deg bar for the first time (round 2: beat 1 was 9.0 deg)
one 200 ms brake tap after 0.5 s load, LIVE: 13.8/13.9/13.3 deg held 2.53/2.54/2.48 s at 100/130/150 km/h (round 2: 9.5/8.5/8.0 deg held 2.05/1.70/1.53 s)
three orderings, LIVE, matched 25.5 deg entries: 2.22 s centred / 2.68 s tapped / 0.77 s held - all three HIT on the half-peak AND the fixed 10 deg bar
power-on grip edge at 250 km/h, LIVE: 28-29 deg/s, 4.9 deg slip, 0% drifting - STRUCTURAL LIMIT, not a miss: 11 kill-controls inert, rear demand/capacity is 0.78 on throttle vs 0.86 coasting
regression gates LIVE, all unmoved: sign invariant PASS both ways, e-brake monotone -27/-70/-93% at 80 km/h, wall 77%/25%, rig leads the car 0/226 samples, handling-measure 40 HIT / 1 MISS, zero console errors
pixel gate: every _px.mjs statistic IDENTICAL on all 7 presets; raw decode 5-270 of 3686400 channels differ; opened the worst pair and looked - nothing worse
frame time: NOT MEASURED, not even a smoke test
```
