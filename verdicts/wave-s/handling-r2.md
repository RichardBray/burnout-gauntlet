# wave-s/handling-r2 — the drift, and the six things behind it

Written FIRST, before any edit, and appended as I worked (brief process rule 1).

**I RAN CONCURRENTLY** with `menu-music` and `traffic-r2`.
Therefore **every frame-time number in this file is a SMOKE TEST and is labelled as such.**
Handling numbers - slip angles, drift durations, yaw rates, speed retention, event counts - are not
contended and are reported as results.

## 0. THE TREE BEFORE I TOUCHED IT (process rule 2)

`git status` at start: `PROMPT.md`, `driver.log`, `game/traffic.js` modified (traffic is my peer's
file, not mine), `README.md`, `game/music/`, `verdicts/wave-s/perf-critic.md` untracked.
`git diff game/physics.js game/camera.js game/car.js` was **EMPTY**, so I inherited no unmeasured
edit in any file I own. Nothing to justify or revert.

## 1. WHAT I OWN, AND WHAT I ROUTED

Owned: `game/physics.js`, `game/camera.js`, and in `game/car.js` the body-roll scale only.
The brief calls that scale `car.js:2336`; in the tree it is **`car.js:2420`** (`shell.rotation.z =
-lean * 0.05`). It is the same line - `car.js` grew by 84 lines since the round-1 verdict quoted it -
and it is the only line of `car.js` I changed.

`game/main.js` is frozen. Every finding that needs it is in section 9.

## 2. THE ONE IDEA. Everything else in this verdict is a consequence of it.

Round 1's model was right about the architecture - real lateral velocity, real integrated yaw rate,
saturating tyres - and wrong about one line.
Inside a drift its stabiliser aimed the yaw rate at **the rate the driver was asking for**, which
with the steering centred is **zero**.
So a slide could not persist through centred steering, and a countersteer had no authority in either
direction because the assist was already steering for you.

The fix is to aim it at the rate that **holds the current slip angle** instead.
That rate is not a tuning constant; it is measurable from the forces the tyres are making this
substep.
A slide is steady when the car's heading rotates at exactly the rate the velocity vector is
rotating, and the velocity vector's rotation rate is the acceleration perpendicular to the velocity
divided by the speed:

```
aPerp = aLatBody * dirL - aXforce * dirS        // dirL, dirS = the velocity direction in body axes
rHold = aPerp / |v|
d(slipAngle)/dt = yawRate - rHold               // exactly, no approximation
```

`physics.js:855`.
Aim a servo at `rHold` and the slide sustains itself.
Aim one at `rTarget` and it cannot exist.

**KILL-CONTROL, and it is the strongest single result in this piece.**
One anchor swapped in a copy of `physics.js` on disk - `const ref = lerp(rSustain, rTarget, gather)`
becomes `const ref = rTarget` - and the hands-off drift hold goes
**2.35 s -> 0.59 s**, with the tapped countersteer at 0.58 s and the held one at 0.53 s.
That is round 1's measured 0.63 / 0.61 / 0.68 s reproduced from one line, from the other direction.
The mechanism is not an argument.

Two terms then make the three orderings distinguishable, and each is independently killed below:

- `driftAngularDamping` **now has a unit**: `rSustain = rHold - driftAngularDamping * slipAngle`
  makes `d(slipAngle)/dt = -k * slipAngle` exactly, so the constant IS the unwind rate in 1/s and the
  hold must track `1/k`. Measured at 0.24 / 0.30 / 0.48: **2.35 / 1.97 / 1.34 s**.
  Round 1's version damped the yaw rate toward zero, which fights the slide, and the round-1 critic
  measured it moving drift duration by 5%.
- `driftFlick` is a Scandinavian-flick impulse paid on the RATE at which opposite lock is applied, so
  a tap and a hold each pay it exactly once. It is what makes a TAP deepen the slide while a HELD
  input gathers the car up through `driftCounterGather`.

And a feed-forward, `driftYawAuthority`, because a servo alone cannot hold `rHold`: the tyres'
restoring moment in a 35 deg slide is a standing disturbance, so the steady-state error is that
moment divided by the gain. I measured gains of 4 / 8 / 12 / 18 buying 1.18 / 1.47 / 1.71 / 1.94 s of
hold - increasingly stiff and still short. Cancelling the disturbance makes the angle dynamics exact
and leaves the gain small (6.0).

**A measurement error I made and fixed, recorded because it inflated a headline number.**
My first `driftFlick` implementation took the rate of the signed countersteer, so RELEASING lock that
was held into the slide (counter -1 -> 0) read as applying a full countersteer and paid the flick.
That made the hands-off hold measure **2.83 s where the honest figure is 1.97 s at the same
damping**. The kill-control that caught it was `driftFlick -> 0` moving a number it should not have
been able to touch. `physics.js:869-874` now only counts the positive side, and
`driftAngularDamping` was lowered 0.30 -> 0.24 to buy the hold back honestly.

## 3. EVERY CONSTANT I CHANGED. BEFORE -> AFTER, with `file:line` (rule 5).

| file:line | constant | BEFORE | AFTER |
|---|---|---|---|
| `physics.js:150` | `boostEarnCruise` | `0.005` | `0` |
| `physics.js:151` | `boostEarnDanger` | `0.030` | `0` |
| `physics.js:154` | `boostEarnDrift` | `0.10` | `0.10` (unchanged, the one legitimate earn) |
| `physics.js:161` | `boostPerNearMiss` | *(did not exist)* | `0.060` |
| `physics.js:162` | `boostPerOncoming` | *(did not exist)* | `0.085` |
| `physics.js:163` | `boostPerCheck` | *(did not exist)* | `0.100` |
| `physics.js:221` | `gripUse` | `0.85` | `0.95` |
| `physics.js:298` | `steerServoDrift` | `0.30` | `0.06` |
| `physics.js:331` | `driftStabilityAssist` | `0.80` | `6.00` |
| `physics.js:332` | `driftYawAuthority` | *(did not exist)* | `0.90` |
| `physics.js:344` | `driftAngularDamping` | `0.40` | `0.24` |
| `physics.js:359` | `driftTapSlip` | *(did not exist)* | `0.30` |
| `physics.js:360` | `driftTapBrake` | *(did not exist)* | `0.55` |
| `physics.js:361` | `driftFlick` | *(did not exist)* | `0.18` |
| `physics.js:362` | `driftCounterGather` | *(did not exist)* | `0.60` |
| `physics.js:363` | `driftCounterDecay` | *(did not exist)* | `3.0` |
| `physics.js:372` | `handbrakeSlip` | *(did not exist)* | `0.55` rad |
| `physics.js:373` | `handbrakeAssist` | `0.25` (a raw yaw-rate gain) | `1.60` (1/s of angle approach - **different quantity, same name**) |
| `physics.js:374` | `handbrakeRate` | *(did not exist)* | `0.75` |
| `physics.js:375` | `handbrakeGain` | *(did not exist)* | `9.0` |
| `physics.js:418` | `driftEnterRatio` | `1.4` | `1.0` |
| `physics.js:419` | `driftExitRatio` | `1.0` | `0.7` |
| `physics.js:447` | `grazeNormalSpeed` | *(did not exist)* | `2.5` |
| `physics.js:449` | `hitKeep` | `0.30` | `0.38` |
| `physics.js:450` | `hitNormalSpeed` | `12` | `34` |
| `physics.js:457` | `wreckSeverity` | *(did not exist)* | `0.92` |
| `camera.js:130` | `FRAME.slipAim` | *(did not exist)* | `0.32` |
| `car.js:2428` | body-roll scale | `-lean * 0.05` | `-lean * 0.105` |

Constants I did **not** change, and should be checked against any claim in this file:
`vMax 78`, `vMaxBoost 86`, `powerMass 520`, `tractionAccel 12.0`, `boostDuration 8.0`,
`muFront 2.50`, `muRear 2.32`, `tyreStiff 18.0`, `slideDrop 0.22`, `scrubGain 0.50`,
`scrubTransfer 0.35`, `stabilityAssist 2.6`, `spinDamp 6.0`, `steerServo 0.45`, `driftMinHold 0.50`,
`transferCap 0.40`, `slipRef 0.45`, `scrapeKeep 0.96`, `handbrakeMu 0.40`, `handbrakeMuHigh 0.70`.

Behaviour changes that are not a constant:

| file:line | what |
|---|---|
| `physics.js:696` | `fxFront = m*aDrive*(1 - driveRear)` -> `(1 - TUNE.driveSplitRear)`. **The e-brake bug**: `driveRear` is `handbrake ? 0 : 0.65`, so holding the e-brake handed the front axle 100% of the engine instead of removing the rear's share. |
| `physics.js:564-576` | new `shunt()`: decompose the world velocity on the contact normal, delete the inbound normal component, apply the retention factor to the TANGENTIAL component only, resolve back onto the car's axes. Used at `:591` (facades) and `:620` (world bounds). |
| `physics.js:783` | drift exit tests `max(rearSlip, |slipAngle|)`, not `rearSlip` alone. |
| `physics.js:850-905` | the whole drift/e-brake assist block: `rHold`, `counter`/`counterHold`/`gather`, the flick, the brake-tap angle command, the handbrake angle command, and `rAllow` for `spinDamp`. |
| `physics.js:697-720` (approx) | `setEventSource(fn)` and `drainWreck()` on the returned object; `state.eventEarn` published. |
| `camera.js:340-342` | `camYaw` target `s.yaw + slip*0.30` -> `s.yaw - slip*FRAME.slipAim`. **The sign was backwards.** |

Four comments that stated kill-control results the shipped code does not produce (the round-1
critic's routed finding 6) are corrected in place with the critic's own measurements, at
`physics.js` `stabilityAssist`, `spinDamp`, `driftMinHold` and `handbrakeAssist`. I did not silently
delete them: each now says what the claim was, what the kill-control actually measured, and why
(all four were measured before `steerServo` existed and never re-run).

## 4. THE MEASUREMENTS. Round-1 critic value -> mine, headless and in the live page.

Headless: fixed 120 Hz, `createPhysics({blocks: [], bounds: 1e9})`, `tools/_handling-r2.mjs`.
Live: `tools/_handling-r2-drive.mjs`, real key listeners, `renderSize()` reported verbatim as
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`.
Every drift duration is time above **half the entry angle on the UNCLAMPED `state.slipAngle`**, taken
at the FIRST crossing below the bar (a slide that collapsed and was re-entered the other way is not
"still held" - taking the last sample above the bar let that inflate the number, and it did in my
first live run).

### Priority 1 - the three orderings. ALL THREE HIT, headless and in play.

| what the player does after entry | critic BEFORE | mine, headless | mine, LIVE PAGE |
|---|---|---|---|
| centres the steering | **0.63 s** | **2.35 s** | **2.32 s** |
| taps 0.15 s of opposite lock | 0.61 s (no authority) | **2.98 s** | **2.73 s** |
| **holds** opposite lock | 0.68 s (*longer* than centring) | **0.82 s** | **0.75 s** |
| holds lock into the slide | 0.82 s | 2.06 s | - |

- **A: persists through centred steering.** 2.35 s against a target of >= 2.0 s. HIT.
- **B: a tapped countersteer LENGTHENS it.** 2.98 > 2.35 headless, 2.73 > 2.32 live. HIT.
- **C: a held countersteer ENDS it.** 0.82 < 2.35 headless, 0.75 < 2.32 live. HIT.
  The live trace shows what that means: `27 33 28 16 -1 -3 -3` degrees - the car gathers up and
  settles slightly the other way, which is what a caught slide does.

The hold is essentially speed-independent, which is the property that makes it usable: entering at
72 / 108 / 144 / 198 / 252 km/h gives **2.72 / 2.41 / 2.35 / 2.34 / 2.42 s** on a 22-23 deg entry.
Speed cost over the whole 6 s window, centred: 145 -> 202 km/h, i.e. **the car accelerates through a
drift** rather than being punished for one.

### Priority 2 - the brake-tap chain drift. Reachable, through the frozen 0.6 brake cap.

| | critic BEFORE | mine, headless | mine, LIVE PAGE |
|---|---|---|---|
| six alternating beats at 130 km/h, peak slip angle | **6 deg** | **23.1 deg** | **15.0 deg** |
| " share of samples in the drift state | **0 %** | **25 %** | **21 %** |
| " speed across the chain | - | 130 -> 168 km/h | 129 -> **132 km/h** |
| one 200 ms tap after 0.5 s of load, arms? | no at 130/151 km/h | **YES at 101/130/151** | - |
| " drift state held after the tap | 0.00 s | **1.17 / 1.02 / 0.95 s** | - |

The brief's target was "a 200 ms tap at 100-150 km/h with a half second of load arms the drift and
holds it long enough for the next beat". 0.95-1.17 s against a 1.0 s beat. HIT.
Two mechanisms got it there and both are checkable: `driftEnterRatio` 1.4 -> 1.0 (10.3 deg of rear
slip was unreachable through a 0.6-capped brake; the tyre's own 7.38 deg saturation angle is the
honest threshold, and entry still requires INTENT so a cornering overshoot cannot arm a drift), and
the drift exit testing the body slip angle as well as the rear tyre's. That second one mattered more
than I expected: a sustained 11 deg body slide carries only ~5 deg of REAR slip, so a rear-only exit
dropped the drift state 0.40 s after the tap while the car was visibly still sideways.

**A tap COMMANDS A SLIP ANGLE (`driftTapSlip`), and I want to be explicit that this is a design
decision and not a derivation.** Holding the angle from the instant the drift arms froze it at the
entry threshold - the chain peaked at 7.1-7.2 deg, which is the rear tyre's saturation angle to two
decimal places. So while the brake is still down the entry is treated as still happening and the
angle is commanded, exactly as the e-brake commands one, just shallower (0.30 rad vs 0.55).
`main.js:559`'s 0.6 authority cap is frozen this round, which closes the purely physical route.

### Priority 3 - the e-brake. Monotone at every speed, and it never accelerates you.

Speed change from holding W + lock + Space, LIVE PAGE, no wall contact in any run:

| speed | 0.5 s | 1.0 s | 2.0 s | 3.1 s | peak slip | peak yaw | critic BEFORE (3.2 s) |
|---|---|---|---|---|---|---|---|
| 80 km/h | -9% | -26% | -74% | -94% | 32 deg | 103 deg/s | **+26%** |
| 130 km/h | -7% | -21% | -52% | -85% | 34 deg | 87 deg/s | **+8%** |
| 200 km/h | -8% | -19% | -45% | -70% | 35 deg | 59 deg/s | -11% |
| 250 km/h | -8% | -20% | -44% | -67% | 35 deg | 60 deg/s | **-86%** |

- **Monotone in hold time at every speed.** HIT.
- **No configuration in which the e-brake accelerates you.** HIT, and the kill-control proves the
  mechanism: restore `fxFront = m*aDrive*(1 - driveRear)` and the 2 s figure at 80 km/h goes
  **-70.6% -> +35.0%**. That one line was the whole low-speed half of the defect.
- **The same command gives the same slide at every speed**: 32 / 34 / 35 / 35 deg where round 1 gave
  29 / 47 / ~60 / 89 deg. The 89 deg flat spin at 250 km/h and the 86% speed loss behind it are gone.
- **It rotates the car.** Peak yaw 59-103 deg/s against ~32 deg/s for an ordinary corner at the same
  speed, and it holds the car 32-35 deg off its direction of travel where a gripping corner reaches
  5 deg. Total heading change over 1.5 s at 80 km/h: 79 deg with the e-brake, 60 deg without.
- **And you can catch it.** 2.5 s of W + opposite lock from every one of those four slides ends at
  2-3 deg of slip and 88 / 88 / 108 / 122 km/h. Nothing is a lottery any more: the two keys mean one
  thing.

### Priority 4 - the wall. A shunt, and 20 deg is no longer 90 deg.

Grazing angle = the angle between the car's travel and the wall FACE. (The round-1 critic had to
correct itself on this parametrisation and so did I: a car yawed 1 deg off a wall's *front* face is
hitting it nearly head-on. Here the wall runs along the direction of travel.)

| angle into the face at 231 km/h | retained 0.3 s later | 4 s later | wreck-grade? |
|---|---|---|---|
| 1 deg | no contact | 272 km/h | no |
| 3 deg | no contact | 272 km/h | no |
| 8 deg | 209 km/h (**91%**) | 205 km/h | no |
| 20 deg | 129 km/h (**56%**) | **188 km/h** | no |
| 45 deg | 50 km/h (22%) | 162 km/h | YES |
| 90 deg | 6 km/h (3%) | 133 km/h | YES |

The critic's headline case was 231 -> 69 km/h and "over three seconds of throttle later I was at
130". The comparable row is 20 deg: **231 -> 129 km/h, and 188 km/h four seconds later** - and the
retained momentum now points DOWN the wall, because the shunt keeps the tangential component instead
of scaling the longitudinal one and deleting the lateral one. That is Burnout's "brush a wall and get
shoved along it" affordance falling out of the geometry.

Two kill-controls separate the two mechanisms, which is worth having because they are easy to
conflate: `hitNormalSpeed` 34 -> 12 takes the 20 deg row **56% -> 38%** while 90 deg stays at 3%
(it is what stops the ramp saturating at 11 deg of approach, i.e. it is what makes 20 deg and 90 deg
different outcomes); removing the shunt takes 90 deg **3% -> 41%** (a square hit should not retain
41%) and costs 7 points at 20 deg. I am reporting the second half of that honestly: the shunt makes a
graze read as a graze and a square hit properly terminal, and it is very slightly *worse* than the
plain multiplier at 20 deg.

**`state.crashed` - I did NOT set it, deliberately, and this is a routed finding rather than a fix.**
A wreck-grade contact (severity >= 0.92) is published through **`physics.drainWreck()`**, cleared on
read, returning `{speed, dir, severity}` ready for `crash.trigger()`. Setting `state.crashed` from
physics with `main.js` frozen would raise `hud.js`'s WRECKED overlay (`hud.js:2697` ramps `crashMix`
at 16/s, `:988` draws the banner) with nothing to clear it and no replay behind it - a permanent
"WRECKED" screen while you keep driving, which is worse than the defect. See section 9.

### Priority 5 - the grip edge. PARTIAL, and I refuted the brief's nominated cause.

`gripUse` 0.85 -> 0.95. Held lock for 6 s:

| | critic BEFORE | AFTER |
|---|---|---|
| yaw at 250 km/h, throttle held | 28-29 deg/s, dead flat | **31-33 deg/s** |
| peak slip angle at 250 km/h, throttle held | 4.9 deg | **5.5 deg** |
| yaw at 250 km/h, throttle RELEASED | 28 -> 45 deg/s over 6 s | **31 -> 57 deg/s**, ends at 85 km/h |
| yaw at 145 km/h, throttle RELEASED | 35 -> 74 deg/s | **39 -> 77 deg/s**, ends at 47 km/h |

There is now an edge, and it is on the **lift-off** side: coming off the throttle at full lock walks
the yaw rate up and the car needs catching. On the **power** side it is still flat, and I could not
fix that honestly. **KILL-CONTROL that refuted the brief's own hypothesis**: the brief says "the
yaw-rate servo should stop catching it", so I gave up 60% of `steerServo`'s authority at full throttle
and the peak slip angle at 250 km/h moved **5.0 -> 5.0 deg**. Not at all. I reverted the change
rather than ship it unmeasured, and left the measurement in a comment at the servo.
The real reason is that the car is already AT its lateral limit there: `gripUse` swept 0.85 / 0.90 /
0.95 / 1.00 / 1.05 / 1.15 / 1.30 gives a flat 30-33 deg/s and 4.7-6.4 deg of slip at 250 km/h in
every case, because past ~1.0 the demand exceeds what the tyres can deliver and the achieved rate
stops following it. Values >= 1.00 also DEPART on lift-off (34-88 deg of slip, car stopped) and break
the falling shape of the yaw curve, so 0.95 is where I stopped. See the honest misses.

### Priority 6 - body roll. 3.31 deg -> 6.94 deg, and the sign invariant still holds.

Measured in the live page from the shell's world matrix, not from the constant:
**peak 6.94 deg (D) / 6.99 deg (A)** against the round-1 critic's measured 3.31 deg.

**THE SIGN INVARIANT, which is the one automatic FAIL in this piece, PASSES in both directions:**

```
D (right): displacement . screen-right(t=0) = +62.2 m -> went RIGHT              PASS
           up_horizontal . carLeft = +0.11925 -> rolls LEFT = AWAY from centre    PASS
A (left):  displacement . screen-right(t=0) = -76.7 m -> went LEFT               PASS
           up_horizontal . carLeft = -0.11956 -> rolls RIGHT = AWAY from centre   PASS
```

I fell into both of the traps the round-1 critic recorded and had to fix my own instrument:
dotting the shell's world UP with the shell's world X is **identically zero** (they are two columns
of one rotation matrix) and reads as a clean `0.00000` that is easy to mistake for a result - the
test has to be the HORIZONTAL part of the up vector against the car's LEFT taken from the yaw. And
the displacement must be relative to the start and projected on screen-right **as it was at t=0**.

### Priority 7 - the chase camera. It lags now, in 100% of samples.

`camera.js:340-342` had `wanted = s.yaw + slip * 0.30`. `slip` is positive in a left-hand slide and
`yaw` grows to the left, so it aimed the rig FURTHER round the corner than the car: the rig
out-rotated the car by construction, in both directions.

| | BEFORE | AFTER |
|---|---|---|
| headless, rig azimuth vs car heading through a slide | **AHEAD of the car**, up to 26.3 deg | **LAGS toward the velocity**, up to 9.3 deg |
| live page, samples where the rig leads the car | (all of them) | **0 of 29** |
| live page, max rig-to-nose offset in the slide | - | 12.3 deg |

**This is a MEASUREMENT, not a matched number, and I will not pretend otherwise.**
`docs/BURNOUT-HANDLING.md` marks every chase-camera figure `NOT FOUND` and retracts its own attempt
to measure one off footage with three named confounds. What I assert is the **ordering** - the rig
must lag the car's heading toward the direction of travel, never lead it - and `FRAME.slipAim = 0.32`
rad is ours. I did not go looking for a number in `reference/`; that is the closed era.

### The boost economy. No passive refill, and the event stream's physics half.

| | BEFORE | AFTER |
|---|---|---|
| holding W at top speed from an empty bar, no events | full bar in **28.6 s** | **never fills** (0.0% after 90 s headless, 0.0% after 6 s live) |
| full bar in nearMiss events at intensity 1.0 | n/a | **17** |
| " oncoming | n/a | **12** |
| " traffic check | n/a | **10** |
| " a realistic 3:1:1 mix at intensity 0.65 | n/a | **22 events** |
| 4 s of drift, no events | - | **26%** of a bar (`boostEarnDrift` is the one legitimate passive earn, and Paradise pays for drift by distance-in-slide) |

`physics.setEventSource(fn)` is built to the round-2 contract, verified in isolation **and in the
live page** (20 fake `nearMiss` events at intensity 1.0 fed through the real tick take the bar
0.00 -> 1.000, expected 20 x 0.060 = 1.00 capped at 1). Malformed input is tolerated by design -
a `null` entry, a missing `type` and an unknown `type` over 2 s pay 0.00% and do not throw - because
`traffic.js` is a peer's file being edited concurrently and an event stream that can throw inside the
physics tick would take the whole game down.

**THE JOIN IS PENDING.** `physics.setEventSource(() => traffic.drainEvents())` is one line in
`main.js`, which is frozen and owned by nobody this round, so **as shipped nothing calls
`setEventSource` and the only earn path in play is drift.** That is deliberate and it is the honest
failure mode: with the join missing the bar does not fill by itself, which is Paradise's behaviour,
rather than quietly reverting to a timer.

## 5. KILL-CONTROLS, all of them. Every claim above, tested by DELETING the term.

Each is a physically modified copy of `physics.js` on disk, not a mutated `TUNE`: `CD` and
`POWER_BOOST` are computed at module scope at import time, so mutating `TUNE` afterwards proves
nothing. `node tools/_handling-r2.mjs` section 8 re-runs the whole table.

| control | centred | tap | held | e-brake @80, 2 s | wall 20/90 deg | verdict |
|---|---|---|---|---|---|---|
| **BASELINE (shipped)** | **2.35 s** | **2.98 s** | **0.82 s** | **-70.6%** | **56% / 3%** | - |
| `ref = rTarget` (round 1's formulation) | **0.59** | 0.58 | 0.53 | -70.6% | 56/3 | **CONFIRMED** - round 1's 0.63/0.61/0.68 reproduced from one line |
| `driftAngularDamping` 0.24 -> 0.48 | **1.34** | 1.68 | 0.78 | -70.6% | 56/3 | **CONFIRMED** - the hold tracks 1/k, so the constant has a unit |
| `driftYawAuthority` 0.90 -> 0 | **1.32** | 1.47 | 0.83 | -94.8% | 56/3 | **CONFIRMED** - and the e-brake overshoots without it (entry 23 -> 43 deg) |
| `driftFlick` 0.18 -> 0 | 2.35 | **2.37** | 0.68 | -70.6% | 56/3 | **CONFIRMED** - ordering B collapses, tap stops beating centred |
| `fxFront` bug restored | 1.83 | 2.57 | 0.81 | **+35.0%** | 56/3 | **CONFIRMED** - the e-brake accelerates the car again |
| `shunt()` removed | 2.35 | 2.98 | 0.82 | -70.6% | **63% / 41%** | CONFIRMED in direction; a square hit retains 41% without it, and 20 deg is 7 points BETTER without it |
| `hitNormalSpeed` 34 -> 12 | 2.35 | 2.98 | 0.82 | -70.6% | **38% / 3%** | **CONFIRMED** - this, not the shunt, is what separates 20 deg from 90 deg |
| `steerServo` cut 60% at full throttle | - | - | - | - | - | **REFUTED** - peak slip at 250 km/h 5.0 -> 5.0 deg. Reverted, not shipped. |
| `transferCap` 0.40 -> 0.50 -> 0.60 | - | - | - | - | - | **INERT** on every drift number I measured; left at 0.40 |

## 6. THE REGRESSION GATE

My change can move a pixel: `physics.js` moves where the car is and how fast it is going, and the
autopilot the seven screenshot presets drive through goes through it; `car.js` changes the body roll;
`camera.js` changes the rig azimuth whenever `slip` is non-zero.

**Method.** `game/traffic.js` is being edited by a peer RIGHT NOW and `game/main.js` by the perf
piece, so rendering my working tree against `HEAD` would have measured their changes as mine. Instead
I used two detached `git worktree` checkouts of `HEAD` and copied **only my three files** into one of
them, so the A/B differs by exactly my diff. All seven presets, 1280x720, `deviceScaleFactor 1`.

| preset | `_px.mjs` full-frame mean RGB, A -> B |
|---|---|
| `dusk-highway-chase` | `90.1,83.4,69.6` -> `90.1,83.4,69.6` - identical to every decimal printed |
| `boost-blur` | `80.5,78.5,68.6` -> identical |
| `crash-cam` | `78.2,69.2,59.8` -> identical |
| `car-paint-closeup` | `74.9,66.8,59.0` -> identical |
| `hud-overlay` | `52.8,57.2,56.7` -> identical (satPx 0.306 -> 0.307) |
| `wet-night-asphalt` | `102.6,91.0,90.1` -> identical (p90 165.2 -> 165.1) |
| `daytime-downtown` | `97.1,108.4,123.2` -> `97.4,108.6,123.4`, p50 98.2 -> 98.6, nearRoad p10 59.6 -> 63.2 |

**I opened both PNGs of the one that moved and looked at them.** `daytime-downtown` is the same shot
with the car a few centimetres further down the street; the buildings, signage, road markings, wet
sheen and traffic are unchanged. Nothing got worse. Files kept at `shots/s/r2-dusk-A.png` /
`r2-dusk-B.png` and `shots/s/r2-downtown-A.png` / `r2-downtown-B.png`.

The presets never drift and never touch the e-brake, so none of the drift work can reach them - which
is why five of seven are identical rather than merely close.

## 7. `tools/handling-measure.mjs`: 40 HIT / 1 MISS -> 38 HIT / 3 MISS. All three explained.

That harness is round 1's and is not my file, so I did not touch it. Its three MISSes:

1. **"bar earned by driving fast: ours +0.00 %/s, target 0.2-1.5 %/s".** This is the passive refill
   the round-2 brief instructed me to delete ("Paradise has NO passive boost refill"). The harness's
   target now contradicts the brief. **Intentional.**
2. **"entry B: brake TAP under load produces a slide - ours peak |slip| 0.32, target > 0.35".**
   Scored on the CLAMPED `state.slip` proxy the round-1 critic's section 3 says not to use. On the
   real angle the same tap reaches 7.1-7.9 deg, arms the drift state and holds it 0.95-1.17 s, and
   the resulting chain drift reaches 23 deg. The harness measures the instant of the tap; the thing
   that was broken was what happened after it. **Honest partial** - see the misses.
3. **"falloff, peak -> vMax: ours 0.50x, target <= 0.45".** A real regression from 0.44, caused by
   `gripUse` 0.95 lifting the high-speed end of the curve. I am not hiding behind it, but two things
   are true: the `<= 0.45` band is anchored to our own previous value, which brief rule 7 forbids as
   a target, and the research doc marks the falloff `CONSENSUS` on SHAPE only. The shape survives:
   the pinned curve is 62.6 / 44.7 / 36.7 / 32.4 / 32.3 / 32.3 / 31.3 / 31.0 deg/s at 12.5 -> 78 m/s,
   monotone non-increasing above the peak, and the yaw at the research's one calibrated 40.2 m/s
   anchor is 32.4 deg/s, inside the 28-38 band. **Accepted, and stated as a scored MISS.**

## 8. HONEST MISSES

1. **The power-on grip edge is not fixed.** Full throttle at full lock is still a flat 31-33 deg/s
   and 5.5 deg of slip at 250 km/h. I swept `gripUse` across 0.85-1.30, killed 60% of the servo at
   full throttle, and the slip angle did not move; the car is at its lateral limit and the only ways
   past it are to let the demand exceed what the tyres can produce (a lie) or to remove the servo
   that stops the lift-off departure. **There is a defence and it is worth weighing**: the research
   doc says Paradise has no drift button and exactly two entries, a brake tap or the e-brake, so a
   car that will not oversteer on throttle alone is arguably faithful. But the brief asked for
   "throttle should be able to rotate the car" and it does not. Priority 5 is a PARTIAL.
2. **The falloff ratio regressed 0.44 -> 0.50** (section 7 item 3).
3. **A 2 s e-brake at 80 km/h still costs 74% of your speed.** It is monotone and it never
   accelerates you, which is what the brief asked for, but that is a lot: at 80 km/h a 2 s handbrake
   turn is most of a 180, so the number is defensible and I am not sure it is *right*. Nobody has a
   Burnout reference for it (`NOT FOUND`).
4. **The chain drift is shallower in the live page than headless** (15 deg vs 23 deg peak) because
   real key timing is coarser than a scripted 0.2 s tap. 21% of samples in the drift state is a
   working chain, not a comfortable one.
5. **`state.vy` / `airborne` are still dead** (critic item 9). Nothing integrates them, `pos.y` is
   still forced to 0 at `physics.js`. No air, no barrel roll, so two of Paradise's boost-refill events
   are unreachable and the event stream can never carry them. Not attempted this round.
6. **`state.eventEarn` is published and nothing reads it.** It is one multiply per tick and it is the
   hook a HUD needs to make a near miss legible, but until the join lands it is dead weight.
7. **I have no Burnout reference for `FRAME.slipAim`, `driftAngularDamping`, `driftFlick`,
   `driftTapSlip` or `handbrakeSlip`.** They are ours. What is sourced is the ORDERING each one
   delivers, and the orderings are what I scored.
8. **Frame time: I took no result.** Two peers were running. My only number is a smoke test.

## 9. ROUTED FINDINGS - all to `game/main.js`, which is FROZEN and owned by nobody this round

1. **THE BOOST EVENT JOIN, one line.** After `traffic-r2` lands:
   `physics.setEventSource(() => traffic.drainEvents());`
   Without it the bar only fills from drift. My half is built, tested in isolation and tested in the
   live page; `traffic.drainEvents()` did not exist while I measured, and `setEventSource` is optional
   precisely so that is safe.
2. **THE WRECK JOIN, two lines**, and this is what makes critic item 10 (`state.crashed` never set)
   actually reachable: in `tick()`, `const w = physics.drainWreck(); if (w && !crash.active)
   crash.trigger({speed: w.speed, dir: new THREE.Vector3(w.dir.x, 0, w.dir.z), severity: w.severity});`
   `physics.js` cannot do it itself - `crash.trigger()` is main's, and physics must not import
   `crash.js`. I deliberately did NOT set `state.crashed` from physics; see priority 4 for why that
   would be worse than the defect.
3. **`main.js:559` `brake: keys.KeyS ? 0.6 : 0`.** I worked around this rather than needing it: the
   brake tap now commands an angle, and `driftTapBrake` is 0.55 so a player pressing S reaches full
   authority. But the cap is still an arbitrary 60% of the brake, and if it goes to 1.0 the tap's
   authority scaling should be re-tuned rather than left to saturate.
4. **`main.js:320` `carRoot.rotation.y = s.yaw - s.slip * 0.22`** still half-cancels a slip angle the
   physics already applies to `yaw`. Round 1 routed it and the round-1 critic confirmed it. It now
   matters MORE, not less: the chase rig lags the car's heading by up to 12 deg to make the slide
   readable, and this term rotates the drawn nose back the other way by up to 5.6 deg, spending about
   half of what the camera fix bought. Recommend `= s.yaw`.
5. **`main.js:562-566`** still carries a comment citing `physics.js:141` as `yaw += steer*turnRate*dt`
   and `lat` at `:144`. Neither line has existed since round 1. The critic routed it; still there.

6. **`tools/progress.mjs` cannot see any round-2 piece, and I do not own it.** Its `PLAY` table at
   `tools/progress.mjs:48-55` keys the board on the ROUND-1 piece names (`handling`, `traffic`,
   `menu`), and it collects history from `<piece>.md` and `<piece>-critic.md` only. So
   `handling-r2.md`, `traffic-r2.md` and `menu-music.md` are all invisible: after my run,
   `progress.json` still shows the `handling` piece carrying the ROUND-1 CRITIC's metrics, including
   `drift hold, steering centred: 0.63 s`, which is now the number my change exists to move. The
   board is therefore reporting a superseded figure as current. Fix is one of: add the round-2 names
   to `PLAY`, or strip a `-r2` / `-music` suffix when grouping so a round-2 builder round joins its
   round-1 piece's history. My fenced `progress-metrics` block is present and correct as the brief
   requires; it simply is not read yet. I ran `node tools/progress.mjs` as my last step regardless.

To `docs/BURNOUT-HANDLING.md` (not my file): section 9.1 still says `TUNE.vMax = 78` "sits inside the
real 177-201 mph band". 78 m/s is 174.5 mph, below it. The round-1 critic routed this too.

Note for whoever measures next: **`game/main.js` is modified in the working tree** (a `renderer.compile`
warm-up for hidden crash/boost subtrees, from the perf piece) and `game/traffic.js` is modified by
`traffic-r2`. Every live-page number in this file was taken with those present. I committed neither.

## 10. VERDICT ON MY OWN PIECE

Of the seven priorities: **1 HIT (all three orderings, headless and in play), 2 HIT, 3 HIT,
4 HIT with the hard-crash half routed rather than faked, 5 PARTIAL and honestly so, 6 HIT, 7 HIT.**
Plus the physics half of the boost event contract, built and verified with the join pending.
One scored regression (`falloff 0.44 -> 0.50`), one refuted hypothesis of my own (the servo is not
what makes cornering inert), one measurement error of my own found and corrected by a kill-control
(the flick paid on a release), and no pixel made worse.

The thing I would put in front of the user: **the slide is now a place you can live.** It lasts 2.3
seconds hands-off instead of 0.63, a flick of opposite lock makes it deeper and longer, holding
opposite lock gathers it up in three quarters of a second, the car comes out the other side faster
than it went in, and the camera finally trails the nose so you can see it happening.

```progress-metrics
drift hold, steering centred: 2.32 s live / 2.35 s headless (round 1: 0.63 s; Burnout: self-sustaining)
tapped countersteer LENGTHENS: 2.73 s vs 2.32 s centred, live (round 1: 0.61 vs 0.63, no authority)
held countersteer ENDS it: 0.75 s vs 2.32 s centred, live (round 1: 0.68 s, i.e. LONGER)
chain drift, 6 beats at 130 km/h: peak 15 deg live / 23 deg headless, 21% of samples drifting (round 1: 6 deg, 0%)
e-brake at 80/130/200/250 km/h, 2 s: -74/-52/-45/-44% - monotone, never accelerates (round 1: +26/+8/-11/-86%)
one wall at 20 deg, 231 km/h: 129 km/h retained, 188 km/h 4 s later (round 1: 69 km/h, 130 after 3 s)
passive boost refill: NONE - bar never fills on throttle alone (round 1: full bar in 28.6 s of holding W)
body roll at full lean: 6.94 deg measured live (round 1: 3.31 deg)
chase rig through a slide: LAGS the car in 29/29 live samples, max 12.3 deg (round 1: led it by up to 26 deg)
frame time SMOKE TEST ONLY, peers running: p50 30.4 ms at 1280x720 @ ratio 1.0, dpr 1
```
