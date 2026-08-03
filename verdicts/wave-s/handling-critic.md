# wave-s/handling-critic

I am the handling CRITIC. Fresh context. I edited no game code, and `git diff` on `game/` from my
session is empty, so no rendered pixel can have moved by my hand and the regression gate does not
apply to me.

**I RAN ALONE.** Nothing else touched this machine or this repo for the duration of this verdict, so
the frame-time numbers in section 8 are real measurements and not smoke tests. They are the first
uncontended fps reading of wave S.

Order of work, so a reader can see what informed what:

1. `tools/WAVE-S-PLAY-BRIEF.md` in full.
2. `docs/BURNOUT-HANDLING.md` in full, and I formed my own view of which of its numbers bind BEFORE
   reading the builder's verdict. That view is section 1.
3. `game/physics.js`, `game/camera.js`, `game/main.js`, `game/car.js` at `e3da294`.
4. `tools/handling-measure.mjs` (the builder's), read for correctness, then NOT used for any number
   I report.
5. My own harnesses, then live driving, then kill-controls, then fps.

My instruments, all mine, all committed so anyone can re-run them:

| file | what it does |
|---|---|
| `tools/_handling-critic.mjs` | headless re-derivation of every headline number, plus kill-controls 1-3 |
| `tools/_handling-critic2.mjs` | the four places I disagreed with the builder, plus drift-scenario kill-controls |
| `tools/_handling-critic3.mjs` | collision geometry redone after I found my own first attempt wrong |
| `tools/_handling-critic-drive.mjs` | drives the live page through the real key listeners |
| `tools/_handling-critic-sign.mjs` | the steering/lean sign verdict, from world matrices in the live page |
| `tools/_handling-critic-feel.mjs` | the play pass: collisions, traffic, chain drifting, e-brake, understeer |

Raw logs: `verdicts/wave-s/handling-critic-raw.txt`, `-raw2.txt`, `-raw3.txt`,
`handling-critic-drive.txt`, `handling-critic-sign.txt`, `handling-critic-feel.txt`.

```progress-metrics
p50: 26.4 ms (median of 3 runs, cruise, 1280x720 @ ratio 1.0, dpr 1, alone on the machine)
p99: 110.8 ms (same run; night-wet p99 245-283 ms)
top speed: 78.00 m/s = 174.5 mph (Burnout MaxSpeed band 177-201; mid-tier estimate 165-180)
0-100 mph boosting: 3.45 s (Burnout PUBLISHED 3.45-3.48)
yaw at 40.2 m/s: 33.5 deg/s (Burnout MEASURED 28-38 player-used)
boost bar: 8.000 s (Burnout PUBLISHED exactly 8.0)
drift hold, steering centred: 0.63 s on the real slip angle (Burnout: self-sustaining)
chain drift through the real keybinds: 0 % of samples in the drift state, peak 6 deg
```

---

## 1. WHICH OF THE RESEARCH DOC'S NUMBERS I THINK BIND

I read `docs/BURNOUT-HANDLING.md` before the builder's verdict and formed this view independently.
It is an unusually honest research document - it logs four failed instruments and prints `NOT FOUND`
seven times rather than interpolating - and that changes which of its numbers a critic may score
against.

**Trustworthy enough to score HIT/MISS on:**

- **Full Speed boost bar = exactly 8.0 s.** `PUBLISHED` from the Burnout Wiki and independently
  corroborated by the doc's own bar-crop measurement at 8.7-8.9 s. The single most solid number in
  the file. Score it.
- **Boost is only usable from a completely full bar.** `PUBLISHED`, structural, unambiguous. Score it
  as a boolean.
- **Ceiling ratio ~1.00.** `PUBLISHED` and the derivation is airtight: the best `MaxSpeed` (201 mph)
  beats *every* car's `MaxBoostSpeed` (max 200). Score it.
- **0-100 mph 2.22 s / 3.45-3.48 s.** `PUBLISHED` datamined times. Score against the 3.45-3.48 band
  for "fast but not top of roster", which is the right slot for our single car.
- **`MaxSpeed` band 177-201 mph.** `PUBLISHED`. Score it, but see the caveat below.
- **Straight-line yaw < 0.2 deg/s.** `MEASURED-BY-ME` with a self-calibrating instrument. Score it.
- **No drift button; entry is a brake tap or the e-brake.** `PUBLISHED`. Score the *inputs*, and this
  is the one I weight most heavily on feel, because it is a statement about what the player does.

**Directional only, must NOT be scored as a band:**

- **Yaw rate 28-38 deg/s.** The doc says twice, in its own voice, that this is *player-used* yaw with
  the speed *bracketed rather than measured*, and that maximum-available yaw must sit above it. So
  landing inside 28-38 is not evidence of correctness; landing far outside it in either direction is
  evidence of a problem. I treat it as a sanity band, not a target, and I say so where I score it.
- **The falling shape of the yaw curve.** `CONSENSUS`. Score the shape (monotone above the peak),
  never a value.
- **Drift scrub "low, nonzero, recoverable".** `NOT FOUND` as a number. Any percentage band anyone
  invents here is self-anchored. I report the number and refuse to score it.
- **Mid-tier cap 165-180 mph and 0-100 in 4-5 s.** Both `MY-ESTIMATE`, confidence low, and both are
  interpolations off one end of a list. Useful as a plausibility check only.
- **Boost accumulation ~0.5 %/s.** One window, `MEASURED-BY-ME`, medium confidence, and the doc says
  it cannot separate time-based from event-based gain. Not scoreable.

**Cannot be scored at all, and anyone who scores them is inventing a reference:**

- **Every boost camera number.** `NOT FOUND`, twice over: no published figure, and the doc's own
  measurement attempt is retracted with three named confounds. Camera numbers are MEASUREMENTS in
  this wave, full stop.
- **Collision speed cost.** `NOT FOUND`. Only the *two-outcome structure* is established.
- **Drift hold duration in seconds.** `NOT FOUND`. What IS established is qualitative and strong:
  the slide persists with the steering off it, survives a tapped countersteer, and is re-entered "on
  its own". That is a behaviour test, not a stopwatch test, and it is the one I hold this build to.

**One correction to the doc I will act on.** Section 9.1 says `TUNE.vMax = 78` "sits inside the real
177-201 mph band". It does not: 78 m/s is 174.5 mph, which is *below* 177. It is inside the doc's own
mid-tier estimate. That matters because the builder inherited the "inside the band" phrasing and
scored 174 mph as a HIT against 177-201. Small, but it is exactly the kind of drift this project's
rule 5 exists to catch.

---

## 2. EVERY HEADLINE NUMBER, RE-DERIVED FROM SCRATCH

All physics numbers: fixed tick **120 Hz**, headless, `createPhysics({blocks: [], bounds: 1e9})`, no
walls and no bounds clamp, my own harness. Camera numbers: same, with `camera.js` stepped from the
same physics state. I read the builder's harness first (section 3) and then did not use it.

| quantity | OURS (mine) | BURNOUT | BAND | verdict |
|---|---|---|---|---|
| top speed, unboosted | **78.00 m/s = 174.5 mph = 281 km/h** | `MaxSpeed` 177-201 mph | inside 177-201 | **MISS by 1.4%** |
| " (vs the doc's mid-tier estimate) | 174.5 mph | 165-180 mph `MY-ESTIMATE` | inside | HIT |
| time to top speed | **90% in 10.95 s, 95% 14.13 s, 99% 21.58 s, 99.9% 32.27 s** | no reference | - | MEAS |
| top speed, boosted (tank pinned) | **86.00 m/s = 192.4 mph** | `MaxBoostSpeed` 177-200 | inside | HIT |
| boost ceiling ratio | **1.103** | ~1.00 | close to 1.0 | HIT (was 1.344) |
| 0-100 mph, boosting | **3.45 s** | 3.45-3.48 s `PUBLISHED` | inside | HIT |
| 0-100 mph, no boost | **4.56 s** | 4-5 s `MY-ESTIMATE` | inside | HIT (low confidence ref) |
| 0-60 mph, boosting / not | 1.69 s / 2.63 s | `NOT FOUND` | - | MEAS |
| peak launch accel, boost / not | **21.4 / 10.4 m/s² (2.18 / 1.06 g)** | `BoostKickAcceleration`, unit not recovered | - | MEAS |
| yaw at 12.5 m/s (45 km/h) | **62.6 deg/s, radius 11.4 m** | no curve published | - | MEAS |
| yaw at 20 m/s (72 km/h) | **49.0 deg/s, radius 23 m** | - | - | MEAS |
| yaw at 30 m/s (108 km/h) | **38.4 deg/s, radius 45 m** | - | - | MEAS |
| yaw at 40.2 m/s (145 km/h) | **33.5 deg/s, radius 69 m** | 28-38 player-used at ~40 m/s | sanity band | HIT (see caveat) |
| yaw at 50 / 60 / 70 / 78 m/s | **30.8 / 28.9 / 28.0 / 27.8 deg/s** | - | - | MEAS |
| yaw curve shape | peak at 12.5 m/s, **monotone falling above it**, vMax/peak **0.44** | falls progressively | must fall | HIT |
| straight-line yaw | **0.00e+0 deg/s** (exactly, no RNG) | < 0.2 deg/s | < 0.2 | HIT |
| drift entry, steering alone | **never arms**, peak 4.3-4.6 deg | no drift from steering alone | must refuse | HIT |
| drift entry, brake tap under load | **arms at 0.13-0.17 s, peak 14-16 deg** | brake tap is the entry | must arm | HIT (harness) / **FAIL in play** |
| drift entry, e-brake | **arms at 0.01 s, peak 65-89 deg** | e-brake is the other entry | must arm | HIT |
| drift entry threshold | **10.34 deg** rear slip = 1.4 x the 7.38 deg tyre saturation | `NOT FOUND` | - | MEAS |
| drift hold, steering centred | **0.63 s** on real slip angle / 0.82 s on the builder's clamped proxy / 0.78 s flag | self-sustaining | qualitative | **MISS** |
| drift survives a 0.15 s countersteer | 0.61 s vs 0.63 s centred - **the tap changes nothing** | tap lengthens it (double drift) | must not shorten it | MISS (no authority either way) |
| drift ends on HELD countersteer | **0.68 s, i.e. LONGER than centring** | held countersteer ends it | must be shorter | **MISS** |
| drift speed scrub, 5 s | **-24.0%** (mine), -17.0% (builder's manoeuvre) | `NOT FOUND` | unscoreable | MEAS |
| boost bar duration | **8.000 s** | exactly 8.0 s `PUBLISHED` | 8.0 | **HIT, exact** |
| boost below a full bar | refused at 0.5 / 0.9 / 0.998, allowed at 1.0 | must refuse | boolean | HIT |
| boost top-speed lift | **+8.00 m/s (+10.3%)** | small | small | HIT |
| boost accel lift at 20 / 60 m/s | **x2.18 / x3.39** | large burst | large | HIT |
| boost camera fov delta | **47.87 -> 53.19 at 100 ms, peak 56.06 (+8.19) at 0.70 s, settles +7.10** | `NOT FOUND` | - | MEAS |
| boost camera standoff delta | **8.80 -> 8.62 m at 100 ms, min 7.73 (-1.07) at 0.81 s, settles -0.77** | `NOT FOUND` | - | MEAS |
| collision, 1 / 3 / 8 / 20+ deg | **89% / 78% / 52% / 30% retained** | two distinguishable outcomes | two tiers | HIT |
| `state.crashed` | **never set by physics.js** | a crash is a state change | - | routed to crash.js |
| tick-rate invariance 20-240 Hz | **0.00% speed, 0.00 deg yaw spread over 6 s** | - | - | HIT |
| determinism | bit-identical re-run | no RNG | - | HIT |

Live-page confirmations of the same quantities, through the real key listeners at
`renderSize() = {"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`:
hold W from rest gives 71 km/h at 2 s, 165 at 5 s, 239 at 10 s, **276 km/h at 20 s**; Shift from a
full bar at 209 km/h gives fov +4.99 deg inside 100 ms, peak +8.13 at 1.02 s, standoff -1.23 m at
1.0 s, and 209 -> 292 km/h over the 8 s burn. Zero console or page errors across four separate
scripted sessions.

**Where I differ from the builder, and who is right:**

- Top speed 174.5 mph: the builder scored HIT against 177-201. It is **1.4% below** that band.
  Trivial in size, wrong in bookkeeping. Their own comment at `physics.js:78-81` states the honest
  version ("sits just under the roster's MaxSpeed band"), so the verdict table is where it drifted.
- 0-100 mph boosting: they report 3.48 s, I get **3.45 s**. Both inside the band; the difference is
  the sampling grain.
- fov overshoot: they report +9.19 deg, I get **+8.19** headless and **+8.13** in the live page. Their
  number comes from a scripted car state at 73.8 m/s, mine from a real drive from 55 m/s, so the
  speed term differs. Not a discrepancy, but their figure is the one taken at the higher speed and it
  is not labelled with that speed.
- Drift scrub: they report 17.0%, I get **24.0%** on the research doc's literal 8.9 procedure. Their
  manoeuvre (0.2 s e-brake tap then lock held) is a legitimately different and gentler manoeuvre,
  and they say so. Neither number is scoreable against Burnout.
- **Drift hold 0.82 s: reproduced exactly, and it is inflated by the instrument.** See section 4.
- **Collision: their "3.2 deg graze retains 79%" is CONFIRMED** - I measure 78% at 3 deg with my own
  geometry. My own first attempt at this test was wrong (a shallow *yaw* into a wall's front face is
  still a near-square hit) and I redid it as a pass along a wall face; I am recording that because
  the first reduction would have produced a false accusation.

**A tally correction.** The builder's `40 HIT / 1 MISS` includes at least three HITs scored against a
reference the research doc marks `NOT FOUND` or against a self-anchored band: "standoff punch-in at
onset" (burnout column literally reads `NOT FOUND`), "fov returns after release" (`n/a`), and "share
of the lens swing delivered in 100 ms", whose band `> 65%` is justified in the code as "the scene
attack alone gives ~45%" - our own previous value, which brief rule 7 forbids as a target. The honest
tally is closer to **37 HIT / 1 MISS / 10 measured-only**, and by my own scoring above, with the top
speed moved to MISS and the four drift-behaviour rows scored, **it is 33 HIT / 5 MISS / 12 MEAS.**

---

## 3. THE BUILDER'S HARNESS, READ BEFORE USE

`tools/handling-measure.mjs` is a good instrument and its `three` shim (a self-resolving module hook,
so `node tools/...` works with no `node_modules/three`) is a genuinely nice trick that I borrowed the
*technique* of, writing my own body. It runs clean and reports `40 HIT / 1 MISS / 7` as claimed.

Two defects that matter:

1. **Drift duration is scored on `state.slip`, which is clamped.** `state.slip` is
   `clamp(slipAngle / slipRef, -1, 1)` with `slipRef = 0.45 rad = 25.8 deg`. Their entry produces a
   **34.2 deg** slip angle, so the recorded "peak" is 0.927 rather than the real 1.32, and the
   half-peak bar becomes ~13 deg of a slide that was really 34 deg. **The deeper the entry, the
   lower the bar the hold test has to clear.** Measured both ways off their exact entry: their
   reduction says 0.82 s, the unclamped angle says **0.63 s**, and an absolute 10 deg bar says
   0.75 s. It is not a fabrication - it is a real 0.6-0.8 s of slide - but the metric can be improved
   by entering harder, which is the property brief rule 3 warns about.
2. **Three sections score HITs against `NOT FOUND` references or self-anchored bands** (above).

---

## 4. MECHANISM VERIFICATION: KILL-CONTROLS

Every kill-control below is a *physically modified copy of `physics.js` or `camera.js` on disk*, not
a mutated `TUNE`. That distinction is necessary and I would have got the wrong answer without it:
`CD` and `POWER_BOOST` are computed at module scope from `TUNE` at import time, so mutating
`TUNE.vMax` afterwards proves nothing. Each patched module prints its own `TUNE` value back so the
patch is provably applied.

### 4.1 FINDING 0, "vMax was a label" — **CONFIRMED, and it is the strongest result of the wave**

Four independent controls, all agreeing:

| control | result | what the story predicted |
|---|---|---|
| the pre-wave module, `git show HEAD~1:game/physics.js`, integrated for 300 s at full throttle | **38.35 m/s = 85.8 mph** against a declared `vMax` of 78 = 174.5 mph | yes: vMax was a label |
| same, boost held | **44.42 m/s = 99.4 mph** against a declared `vMaxBoost` of 104 = 232.6 mph | yes |
| `vMax: 78` -> `90` in the new module | top speed **exactly 90.00 m/s** | yes: solved from the ceiling |
| `state.speed = Math.min(state.speed, vMax)` deleted | top speed **unchanged at 78.00 m/s** | yes: drag sets it, the clamp is inert |
| the aero drag term zeroed | top speed **78.00 m/s**, i.e. the clamp becomes the only limiter | yes: drag and the clamp agree at exactly vMax |

So: the old car really did top out at 86 mph while advertising 175; `scenes.js` really was authoring
presets at 232 and 300 km/h that the sim could not hold; and the new top speed is genuinely *solved*
rather than clipped - moving `vMax` moves the real ceiling, and deleting the clamp changes nothing
because thrust and resistance are constructed to balance at exactly `vMax`. The mechanism, the
statistic and the causal story all hold. The independent corroboration in `tools/fps.mjs:83`
(which documented the 38.2 m/s terminal speed and told readers not to treat it as a fault) is real:
I read it.

One consequence the builder states and I confirm: `cruise` in `tools/fps.mjs` now reports **275 km/h**
where it used to report ~137. Every pre-change fps number was taken at half the real travel rate.

### 4.2 The `lean` sign inversion — **CONFIRMED by driving, in both directions, with a control**

This is the user's headline bug and the one thing I refused to settle by algebra. Done in the live
page, pressing the real keys through `main.js`'s real listeners, reading three.js world matrices.

I also had to throw away my own first two reductions, and I am recording that:

- I projected the displacement onto the camera basis **at the end** of a 90 deg turn. Screen-right
  rotates with the car, so it has to be sampled at t=0.
- I dotted the shell's world UP with the shell's world X. Those are two columns of the same rotation
  matrix; the dot product is identically zero and carried no information. The real question is which
  way the up vector **tilts**, so the test is the *horizontal* component of the shell's world up,
  dotted with the car's horizontal LEFT.

Ground truth for that test: a car in a right-hand turn is thrown to its left, the outer (left)
suspension compresses, the body rolls to the LEFT and its up vector tilts LEFT. A motorcycle does
the opposite. So in a right turn the dot must be positive.

```
== D (right)
  camera screen-right at t=0: (-0.994, 0.003, 0.113)
  1.0 s later: yaw -28.3 deg, world dx -7.14 m, dz 39.64 m, speed 160 km/h
  displacement . screen-right = 11.58 m  -> the car went RIGHT. Required: RIGHT.  PASS
  lean = 1.080; shell world up = (0.0574, 0.9983, 0.0058) = 3.31 deg of body roll
  up_horizontal . carLeft = 0.05331 -> rolls toward its LEFT, i.e. AWAY FROM the turn centre. PASS
== A (left)
  displacement . screen-right = -7.58 m  -> the car went LEFT. Required: LEFT.  PASS
  lean = -1.063; up_horizontal . carLeft = -0.05244 -> AWAY FROM the turn centre. PASS
== CONTROL: lean forced to +1 (what the RETIRED model produced in a LEFT turn)
  up_horizontal . carLeft = 0.04998 -> rolls toward its LEFT; in a LEFT turn that is INTO the
  corner (the old bug, reproduced)
```

The control is the part that makes this a test rather than an assertion: forcing `lean = +1` through
`car.update()` reproduces the inward bank, so the instrument can fail and did not. Confirmed
independently in the headless module too: the old model gives `lean = +1.200` in a left turn, the new
one `-1.056`. **Steering sign correct, lean sign correct, both directions, verified by driving. No
automatic FAIL here.** Eyeballed at `shots/s/critic-sign-KeyD.png`: the car is turning right with its
left flank visibly high. Body roll is only 3.3 deg, which is subtle but present.

### 4.3 Kill-controls the builder's own comments predicted, that **DID NOT** happen

`physics.js`'s comments are this project's institutional memory, which makes a comment that states a
kill-control result the code no longer produces the most expensive kind of error available. Four do.
Every patch below printed its own `TUNE` value back, so the patch was applied.

| the comment's claim | file:line | my kill-control | verdict |
|---|---|---|---|
| "with it set to zero (a kill-control anyone can run) full lock at 60 m/s diverges into a flat spin inside 1.3 s" | `physics.js:615-619` (`stabilityAssist`) | `stabilityAssist: 2.6 -> 0`. Full lock held 6 s at 40 / 60 / 78 m/s: peak yaw **33 / 29 / 29 deg/s**, peak slip 5 deg, no departure - **numerically identical to baseline to 3 s.f.** | **REFUTED** |
| "kill-control: set it to 0 and full lock at 60 m/s departs" | `physics.js:268-270` (`spinDamp`) | `spinDamp: 6.0 -> 0`. Identical to baseline at all three speeds | **REFUTED** |
| the min-hold "is what lets a brake TAP produce a drift that survives the steering being centred" | `physics.js:279-281` (`driftMinHold`) | `driftMinHold: 0.50 -> 0`. Brake tap peak 10.1 deg, armed=true, e-brake hold 0.63 s, gather 0.80 s - **identical to baseline in all three probes** | **REFUTED as stated** |
| "At the gripping value it did not: an e-brake turn at 40 m/s reached only \|slip\| 0.07" | `physics.js:259-262` (`handbrakeAssist`) | `handbrakeAssist: 0.25 -> 2.6` (the gripping value). E-brake entry **31 deg** of slip angle, hold 0.55 s. That is a big slide, not 0.07 | **REFUTED** |
| "Held e-brake above ~230 km/h barely bites - deliberate" (verdict, honest miss 2) | `TUNE.handbrakeMuHigh` | live page, 250 km/h, W+A+Space held 3.2 s: **peak 51 deg of slip, 106 deg/s of yaw, 246 -> 34 km/h**. Headless at 70 m/s: 89 deg, 107 deg/s. It bites so hard it nearly stops the car | **REFUTED, and inverted** |

The likely explanation for all four is benign and still costly: they were measured on intermediate
versions of the model, before the yaw-rate servo on the steering angle (`steerServo`) was added, and
were never re-run against the shipped file. `steerServo` now backs the steering *angle* off on
yaw-rate error, and it is doing the stabilising work those three terms are credited with. **A next
wave reading these comments would go tuning `stabilityAssist` and `spinDamp` to fix a spin, and
neither term is load-bearing.** That is precisely the failure mode brief rule 6 exists to stop.

### 4.4 Kill-controls that **DID** hold

| claim | kill-control | verdict |
|---|---|---|
| `absHold` is "THE brake-tap drift knob" (`physics.js:106-109`) | `0.985 -> 0.92`: brake-tap peak 10.1 -> **8.6 deg and the drift never arms** | **CONFIRMED** |
| `slideDrop`, the falling branch, is what lets a slide persist (`:193-200`) | `0.22 -> 0`: hold 0.63 -> **0.47 s**, gather 0.80 -> 0.49 s, tap recovery 0.07 -> 0.01 s | CONFIRMED in direction, **overstated in size** ("every slide self-corrects" - 0.47 s is not that) |
| `scrubTransfer` at 1.0 makes a drift unrecoverable (`:208-213`) | `0.35 -> 1.0`: gather on held opposite lock 0.80 -> **1.58 s**, hold 0.63 -> 0.78 s | **CONFIRMED** in direction; "stable 41 deg with full opposite lock for 4 s" is not reproduced at the shipped value of the other constants |
| the boost camera punch is a transient, not a new pose (`camera.js:105-121`) | `kickFov: 5.0 -> 0, kickPunch: 0.55 -> 0`: fov at 50 ms **52.88 -> 48.15**, at 100 ms 53.19 -> 48.71; standoff at 100 ms 8.62 -> 8.82 m | **CONFIRMED** - the kick is what delivers the onset; without it the lens takes ~4 s to arrive |
| `gripUse: 0.85` is what stabilises the car (`:170-179`) | `0.85 -> 1.00`: yaw at 40 m/s 33 -> 39 deg/s, and it **does not depart** at 40 / 60 / 78 m/s over 6 s of full lock | **PARTLY REFUTED** - it is a yaw-rate calibration knob, not the stability fix; "departed to a standstill from full lock at 60 m/s" is not reproducible |
| `driftAngularDamping` is our analogue of Paradise's governing drift attribute (`:264`) | `0.40 -> 0`: hold 0.63 -> **0.66 s** | **effectively inert.** The one Paradise attribute the research doc says *governs* drift moves our drift by 5% |

---

## 5. HOW IT ACTUALLY FEELS

I drove it: four scripted sessions through the real key listeners, plus the play pass in
`tools/_handling-critic-feel.mjs`. Zero console errors anywhere. Screenshots at
`shots/s/critic-sign-KeyD.png`, `critic-turn-left.png`, `critic-drift.png`, `critic-feel-end.png`.

**What is genuinely, unarguably better.** It goes fast now, and it goes fast in a way you feel over
time rather than in a step: 71 km/h at two seconds, 165 at five, 239 at ten, 276 at twenty. That
build-up is the single best thing about this change. Nothing reaches its top speed in one second and
nothing is secretly stuck at half its advertised range any more. The car is heavy in the right way -
it takes eleven seconds to reach 90% of its ceiling and the yaw rate falls from 63 deg/s at 45 km/h to
28 at 280, so it visibly stops being darty as it gets fast. Boost reads as an event and this is not a
close call: the lens snaps 5 degrees wider inside 100 ms, dives a metre in, the exhaust lights up,
and the speed goes 209 -> 292 km/h over the eight-second burn, then the bar empties and you have to
wait for it. The full-bar gate is the right call and it changes the rhythm exactly as advertised -
boost is a thing you bank and dump, not a thing you feather. And the steering is honest: no snap-back
(yaw rate to 10% in 0.21 s with 0.2 deg/s of counter-yaw overshoot), and the body finally leans the
right way.

**But it does not feel like Burnout Paradise, and the reason is specific: there is no slide in it.**

Paradise is a game about the car being slightly sideways, on purpose, for a long time, under your
control. That is what "chain drifting is the world-record technique" means. This build has three
separate states and none of them is that:

1. **Below the drift threshold, the car is on rails.** I held a steering key for six seconds at
   250 km/h: a dead-flat 28-29 deg/s of yaw, slip angle never exceeding 4.9 deg, speed bleeding
   gently 244 -> 222 km/h. Perfect, planted, and completely inert. There is no edge to find, no
   throttle-on rotation, no sense that the rear is doing anything at all. That is a good simulation
   of a competent GT car and it is the wrong feeling.
2. **The published Paradise entry produces nothing through the real keybinds.** I drove the exact
   documented technique - "tap brake, left, tap brake, right" - as six alternating beats over six
   seconds at 130 km/h. Result: **peak 6 degrees of slip angle and 0% of samples in the drift
   state.** Not a shallow drift. No drift. A single tap after a full second of loading up in one
   direction manages 11.3 deg, arms the state for a moment, and is gone inside 0.6 s. The builder's
   honest miss says "the brake tap is too polite"; it is not too polite, through the real bindings
   and the real technique it does not happen at all. (Part of this is `main.js:559` capping brake
   authority at 0.6 - see the routed findings.)
3. **The e-brake is the only way in, and what it gives you is not a drift, it is a lottery.** Hold
   Space and a steering key: at 80 km/h you *gain* speed (78 -> 98 km/h) while sliding 29 deg; at
   130 km/h you gain speed again (127 -> 137) through a 47 deg slide; at 200 km/h you lose 11%; hold
   it for 3.2 s at 250 km/h and you lose **86% of your speed** (246 -> 34 km/h) at 51 deg of slip and
   106 deg/s of yaw. Same two keys, four completely different outcomes, and nothing on screen tells
   you which one you are about to get.

And once you are sideways you are not driving, you are waiting. This is the finding I would put in
front of the user first: **the slide is not steerable.** Off the same entry, measured on the real slip
angle:

| what the player does after entry | time above half the entry angle |
|---|---|
| centres the steering | 0.63 s |
| taps 0.15 s of opposite lock, then centres | 0.61 s |
| **holds full opposite lock** | **0.68 s** |
| holds the lock into the slide | 0.82 s |

Holding full opposite lock keeps you sideways *longer* than doing nothing. Countersteer has no
authority over the slide in either direction; the slide simply decays on its own in about seven
tenths of a second no matter what you do with your hands. The live page agrees: from 35 deg, centred
gives 35 34 30 25 18 8 0 over one second, and full opposite lock gives 34 34 30 26 20 12 3. Those are
the same curve. Every documented Paradise drift behaviour - self-sustaining, steerable both ways,
lengthened by a tapped countersteer, ended by a held one - is absent, and the architecture is right
(real lateral velocity, real yaw rate, saturating tyres) while the tuning has the whole slide
region compressed into three-quarters of a second.

**Two more things actively work against the feel.**

*Forgiveness.* Burnout Paradise is famously forgiving: you brush a wall, you get shoved along it,
you keep going. Here I drove off the highway at 231 km/h and hit a building: **231 -> 69 km/h, and
over three seconds of throttle later I was at 130.** One mistake costs 70% of your speed and roughly
six seconds of grinding it back, with no crash cinematic, no reset, no Paradise-style shunt - just a
slow climb out of a hole. The tiering itself is right (89% at 1 deg, 78% at 3 deg, 52% at 8 deg, 30%
at 20+), and that is a real improvement over one flat 0.62; the problem is the top tier's magnitude
and the total absence of a recovery affordance.

*Traffic is inert.* I held throttle for fourteen seconds down a lane-kept highway lane through
traffic: speed climbed monotonically 195 -> 270 km/h with **zero losses above 25 km/h** in any
150 ms sample. Traffic is neither a threat nor an opportunity. In Paradise traffic *is* the boost
economy - near miss, oncoming, traffic check - and here it is scenery. That is not this piece's
file, but it is why the boost economy has to be faked: with no event stream, `boostEarnDanger`
refills a bar in **28.6 s of merely holding throttle at top speed**, giving an 8-on / 19-off cycle
that runs whether you drive well or not. Burnout has no passive time refill at all.

So: fast, heavy, correctly signed, with a boost that lands - and a physics demo where the drift
should be.

---

## 6. THE THINGS THAT MAKE IT LEAST FUN, RANKED. THIS IS THE NEXT BRIEF.

Ranked by how much fun each one costs, which is not the same as how wrong each one is.

1. **THE SLIDE IS NOT STEERABLE, AND IT LASTS 0.7 SECONDS.** Off a 34 deg entry the slip angle is
   halved in 0.63 s, and holding full opposite lock (0.68 s) keeps you sideways *longer* than
   centring (0.63 s) or tapping (0.61 s). The player has no authority over the one state Burnout is
   about. Fix target, from the research: the slide must persist through centred steering, be
   *lengthened* by a 0.15 s tapped countersteer, and be *ended* by a held one - three orderings that
   currently do not exist. The knobs are `driftStabilityAssist` (0.80), `driftAngularDamping` (0.40,
   which my kill-control shows is nearly inert and which is Paradise's own governing attribute), the
   `damp(state.vLat, ...)` path, and `steerServoDrift` (0.30) - note that inside a drift the servo is
   *still* catching the slide the player asked for. Measure with the *unclamped* `slipAngle`, never
   `state.slip`, for the reason in section 3.
2. **THE PUBLISHED BRAKE-TAP ENTRY DOES NOT WORK IN PLAY.** Six alternating beats of "tap brake,
   left, tap brake, right" at 130 km/h: peak 6 deg, 0% of samples in the drift state. Chain drifting
   - the technique the research doc says world records are set with - is unreachable. Two causes,
   both cheap: `main.js:559` caps brake authority at **0.6** where the tap needs the full circle, and
   the entry needs the car pre-loaded for a full second in one direction, which an alternating chain
   never gives it. Target: a 200 ms tap at 100-150 km/h with a half-second of load must arm the drift
   and hold it long enough for the next beat.
3. **HOLDING THE E-BRAKE IS A LOTTERY, AND AT SPEED IT IS A CATASTROPHE.** Same two keys: +26% speed
   at 80 km/h, +8% at 130, -11% at 200, and **-86% (246 -> 34 km/h) at 250 km/h held for 3.2 s**, at
   51 deg of slip and 106 deg/s of yaw. Note this *refutes* the shipped claim that the high-speed
   e-brake "barely bites". Part of the low-speed half is a specific defect:
   `physics.js:501-504` sets `driveRear = handbrake ? 0 : 0.65` and then
   `fxFront = m * aDrive * (1 - driveRear)`, so **holding the e-brake gives the front axle 100% of
   the engine** instead of removing that torque. A locked rear axle does not send its torque
   forward. Target: monotone speed cost with hold time at every speed, and no configuration in which
   the e-brake accelerates you.
4. **ONE WALL COSTS 70% OF YOUR SPEED AND SIX SECONDS.** 231 -> 69 km/h off a single building
   contact, then a slow climb back (69 72 74 77 80 83 89 95 100 105 109 115 119 124 130 over 3 s).
   No crash, no reset, no shunt-along - just a hole. Burnout's answer is a hard state transition
   *or* a glancing shove, and this is the middle case that Burnout does not have. The tiering below
   8 deg is good and should be kept. Target: the 20 deg-plus tier either becomes a real crash (it
   already has a `crashed` flag nobody sets and a whole `crash.js`) or it keeps enough speed to
   drive out of. Also fix `hitNormalSpeed: 12` saturating so early that 20 deg and 90 deg are
   identical outcomes.
5. **TRAFFIC IS SCENERY, SO THE BOOST ECONOMY IS FAKE.** Fourteen seconds of lane-kept highway
   through traffic: zero speed losses above 25 km/h, monotone 195 -> 270 km/h. With no event stream,
   `boostEarnDanger` fills a bar in 28.6 s of just holding W, so boost arrives on a timer rather than
   as a reward. Paradise has no passive refill at all: near miss, oncoming, traffic check, air,
   takedown, barrel roll, gas station. `physics.js` needs an event input and `traffic.js` needs to
   emit one. This is the largest remaining *gameplay* gap and it is a two-file job.
6. **UNDERSTEER THAT NEVER ENDS, BELOW THE DRIFT THRESHOLD.** Six seconds of held lock at 250 km/h:
   a flat 28-29 deg/s, slip never above 4.9 deg, nothing changing. There is no edge, no throttle-on
   rotation, no consequence for asking for too much. Cause: the target rate is `gripUse = 0.85` of
   the achievable lateral acceleration, so ordinary cornering is *by construction* inside the tyres'
   linear range and can never step out. Target: throttle should be able to rotate the car at road
   speed, and the yaw-rate servo should stop catching it when it does.
7. **THE HUD AND THE ENGINE LIE TO YOU BY UP TO 52% WHEN IT MATTERS MOST.** Measured live at 61 deg
   of slip: real ground speed 178 km/h, `state.speed` 86 km/h, so the speedo and the audio both read
   **52% low** exactly during the one moment the player is doing something interesting. The builder
   routed this at an estimated 30%; the real figure is worse. `main.js:357` / `:364` / `:346` /
   `:352` must read `s.ground`. One-line fix, disproportionate feel payoff.
8. **THE BODY ROLL IS ONLY 3.3 DEGREES.** Correct in sign now, but at 1.08 of full `lean` the shell
   tilts 3.31 deg, because `car.js:2336` scales by `0.05`. It reads as almost nothing on screen at
   1280x720. Cheap win, and it is the visual channel the whole slide currently lacks.
9. **`state.vy` / `airborne` are still dead, so there is no air and no `DownForce` in the sense
   Paradise means it.** `physics.js:348-349` declare them, nothing integrates them, `pos.y` is forced
   to 0. Barrel rolls and airtime - both boost-refill events in the reference - are unreachable.
10. **`state.crashed` is never set by anything in `physics.js`.** The two-tier collision produces
    `impact` but never a crash, so `crash.js`'s whole state machine is unreachable from driving. This
    is the mechanism behind item 4's missing hard transition.

Items 1, 2 and 3 are one piece: **the drift**. If the user takes one thing, take that.

---

## 7. ROUTED FINDINGS

To **main.js** (I verified each one in the live page, I did not edit them):

1. `main.js:357`, `:364` hand `s.speed` (the longitudinal component) to the HUD and audio; measured
   **52% under-read** at 61 deg of slip, worse than the builder's estimated 30%. Also `:346`
   (`boostFx`) and `:352` (`traffic`) and the `rpmOf`/`gearOf` calls. Use `s.ground`.
2. `main.js:559` `brake: keys.KeyS ? 0.6 : 0` caps brake authority at 60%, and the brake tap is the
   published primary drift entry. This is a contributing cause of ranked item 2.
3. `main.js:320` `carRoot.rotation.y = s.yaw - s.slip * 0.22` half-cancels a slip angle the physics
   already applies to `yaw`. The builder routed this; I confirm it and note the visible consequence
   is that the drawn nose points into the slide about half as far as the car really is sideways,
   which makes an already-invisible drift harder to read.
4. `main.js:560-566` still carries a comment describing `physics.js:141` as
   `yaw += steer * turnRate * dt` and `lat` at `physics.js:144`. Neither line exists any more. The
   sign conclusion it reaches is correct; the code it cites is gone.

To **physics.js** (its own file, next round):

5. `physics.js:501-504`: `driveRear = handbrake ? 0 : 0.65` with `fxFront = m*aDrive*(1-driveRear)`
   gives the front axle **100% of the engine** while the e-brake is held. Ranked item 3.
6. Four comments state kill-control results the shipped code does not produce (`stabilityAssist`,
   `spinDamp`, `driftMinHold`, `handbrakeAssist`). Section 4.3. They should be corrected or deleted -
   in this codebase the comments are the institutional memory, and these four will send someone at
   the wrong constant.
7. `driftAngularDamping` moves drift duration by 5% (0.63 -> 0.66 s at zero) while being named as
   our analogue of the one Paradise attribute the research says *governs* drift.

To **crash.js / traffic.js**: ranked items 4, 5, 10.

To **fps**: I confirm the builder's routed finding. `cruise` now reports **275 km/h** where it
reported ~137, so streaming, traffic and shadow load per second of play has roughly doubled, and
`tools/fps.mjs:83`'s "do not read the ~137 km/h as a fault" note is now factually wrong and should be
deleted before it misleads someone.

To **docs/BURNOUT-HANDLING.md**: section 9.1 says `vMax = 78` "sits inside the real 177-201 mph
band". 78 m/s is 174.5 mph, which is below it.

---

## 8. FRAME TIME — the first uncontended reading of wave S

`node tools/fps.mjs --repeat 3 --w 1280 --h 720 --res 1.0`, headless chromium, ANGLE/Metal, viewport
1280x720, `deviceScaleFactor: 1`. Every line carried **renderW 1280 / renderH 720 / ratio 1 / dpr 1 /
resScale 1**, and the live page independently reported
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`. Three runs each, as
the brief requires when alone.

| scenario | p50 (3 runs) | p90 | p99 | max | >16.7 ms | km/h |
|---|---|---|---|---|---|---|
| cruise | **34.71 / 25.61 / 26.38** ms | 68-89 | 92.7 / 110.8 / 186.0 | 208 | 63-67% | 275 |
| boost | **29.41 / 26.53 / 28.56** ms | 97-112 | 115.7 / 116.6 / 117.2 | 120 | 75-76% | 281 |
| corner | **36.98 / 23.73 / 33.66** ms | 65-67 | 69.6 / 69.6 / 82.7 | 97 | 60-66% | 248 |
| city | **23.95 / 25.47 / 24.32** ms | 89-92 | 107.2 / 110.7 / 110.9 | 132 | 71-76% | 178 |
| night-wet | **25.39 / 26.52 / 26.51** ms | 242-247 | 245.8 / 282.9 / 259.3 | 305 | 52-57% | 240 |

**60 fps means p50 <= 16.7 ms. The best p50 anywhere in this table is 23.73 ms (42 fps) and the
median is about 26.4 ms (38 fps), so the build is at roughly 63% of the frame-rate bar.** The p99 is
a separate defect and it is worse: 70-186 ms on the dry scenarios and **246-283 ms on night-wet**,
which is a quarter-second hitch, and `>16.7 ms` sits at 52-76% of all frames everywhere. The
run-to-run p50 spread is large on the steering scenarios (cruise 35.5%, corner 55.8%) and tight on
the others (city 6.3%, night-wet 4.5%), which is itself informative: the wide ones are the two that
place the car by kilometres per hour and let it move, so what varies between runs is *where the car
is*, not the machine.

Against the wave's pre-work baseline (p50 41.20 ms, p99 399.70 ms, 82.9% over 16.7 ms) this is a
real improvement of roughly 1.6x on p50 and 3.6x on p99. It is not 60 fps and nobody should quote it
as such. Not my piece, and I am reporting it because I was the one running alone.

---

## 9. VERDICT

The numbers half **passes**, convincingly. I re-derived every headline figure independently and the
important ones are right, several of them exactly right: the boost bar is **8.000 s** against a
published 8.0; 0-100 mph boosting is **3.45 s** against a published 3.45-3.48; the ceiling ratio is
**1.103** against a real ~1.00 where it used to be 1.344; the full-bar gate refuses at 0.998 and
allows at 1.000; the yaw curve peaks at 62.6 deg/s at 45 km/h and falls monotonically to 27.8 at
280 km/h; straight-line yaw is exactly zero; the model is deterministic and invariant from 20 to
240 Hz to within 0.00%. FINDING 0 is not just correct, it is the best-evidenced thing in this wave:
four independent kill-controls agree that the old car topped out at 85.8 mph while advertising 174.5,
and that the new ceiling is genuinely solved rather than clipped. The steering sign is right, the
lean sign is right, both verified by pressing the real keys and reading the real world matrices with
a control that reproduces the old bug. Nothing here is an automatic FAIL.

The feel half **fails**, and it fails on the thing Burnout Paradise is. Of the five qualities the
brief asks for - heavy, fast, forgiving, a long steerable slide, a boost that reads as an event -
three land and two do not. There is no steerable slide: it lasts seven tenths of a second, holding
full opposite lock keeps you sideways *longer* than doing nothing, and the published entry technique
that world records are set with produces six degrees of slip and zero time in the drift state when
driven through the real keybinds. And it is not forgiving: one building costs 70% of your speed and
six seconds, while holding the e-brake gains you speed at 130 km/h and takes 86% of it at 250.
Below the drift threshold the car is inert - six seconds of held lock at 250 km/h gives a dead-flat
29 deg/s and never steps out. That is an excellent GT car simulation and it is the wrong game.

Four of the shipped comments also state kill-control results the code no longer produces
(`stabilityAssist`, `spinDamp`, `driftMinHold`, `handbrakeAssist` - section 4.3). None of them
changes a number in the verdict, and all four would send the next wave at the wrong constant, which
is the specific harm this project's rule 6 was written for.

This is a large, well-evidenced, well-documented step that fixed the deepest defect in the project
and left the headline feature undone. The failing half is the drift.

**VERDICT: FAIL** — the numbers half passes; the FEEL half fails. Blocking defects, in order:
(1) the slide is not steerable and decays in 0.63 s regardless of input, and a held countersteer
lengthens it rather than ending it; (2) the published brake-tap chain-drift entry produces 6 deg and
0% drift-state time through the real keybinds; (3) the held e-brake is non-monotone in speed - it
*accelerates* the car at 80-130 km/h and costs 86% of it at 250 km/h; (4) one building contact costs
70% of your speed with no crash and no shunt-out.
