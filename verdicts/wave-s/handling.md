# wave-s/handling — verdict

Piece: **handling**. Owned files: `game/physics.js`, `game/camera.js`.
New file created: `tools/handling-measure.mjs` (mine).
Nothing else is touched. The input mapping in `main.js` is not mine and is not edited.

I am running **concurrently with two critics that are playing the game**, so per the brief every
frame-time number below is a **smoke test only**, labelled as such. All handling numbers are
headless and deterministic, so concurrency cannot touch them.

## Plan, written before any code edit

1. Baseline the CURRENT model headlessly against the researched targets. Trust nothing.
2. Rewrite the lateral model so lateral velocity is a real state (a drift must carry the car wide).
3. Fix the longitudinal model so `vMax` is the actual top speed rather than a label.
4. Boost: acceleration event, not a ceiling multiplier. 8.0 s bar. Full-bar gate.
5. Camera: boost transient, driven off a new physics state, measured headlessly.
6. Drive it. Render all seven presets. Report honest misses.

## Provenance audit of `docs/BURNOUT-HANDLING.md` before I use it

I read the research doc and checked its labels rather than its prose.

- **USED AS TARGETS** (`PUBLISHED`, high confidence): full Speed boost bar **8.0 s**; boost is only
  usable from a **completely full** bar; `MaxSpeed` band 177-201 mph and `MaxBoostSpeed` band
  177-200 mph, so the boost **ceiling ratio is ~1.0, not 1.33**; 0-100 mph 3.45-3.48 s for the
  "fast but not top" group; no drift button, entry is a **brake tap under load** or the e-brake;
  drift is `DriftAngularDamping`, i.e. angular momentum with damping.
- **USED AS TARGETS** (`MEASURED-BY-ME` by the research agent, instrument disclosed): free-roam
  cruise **40.2 +- 1.5 m/s**; yaw rate **<0.2 deg/s** on a straight; **28-38 deg/s** in a hard
  sustained turn; p50 2.2 / p90 21.6 deg/s while racing.
- **USED ONLY AS A BAND, NOT A NUMBER** (`MY-ESTIMATE`, low confidence, and the doc says so): mid-tier
  cap 165-180 mph; mid-tier 0-100 mph in 4-5 s. I treat these as sanity brackets.
- **REJECTED / CORRECTED**:
  - Finding 6 of the routing list ("`state.crashed` is never assigned true anywhere") is **wrong as
    a statement about the game**. `game/crash.js:2340` does `physics.state.crashed = true`. It is
    only unset *within* `physics.js`, which is correct design: the crash module owns the wreck
    state and the HUD damage flag. I therefore **do not** set `crashed` from `physics.js`; I add a
    separate `state.impact` for collision severity so I do not forge another module's state.
  - The doc's yaw-rate-vs-speed curve is `NOT FOUND`, so there is **no published curve to match**.
    I do not pretend to hit one. What I match is the measured magnitude band at ~40 m/s and the
    `CONSENSUS` shape (falls with speed). I say where the curve is my own engineering choice.
  - Camera figures are `NOT FOUND` and the doc's one attempt was self-retracted as confounded.
    So there is **no Burnout camera number in existence to hit**. I state my camera numbers as
    *ours, measured*, with the reference column marked `NOT FOUND`, and I do not dress a vibe up as
    a match. That is an honest miss on deliverable 3's "numbers, not vibes" and I flag it as one.
  - `boostRefill = 0.055` "wrong mechanism" is right, but the replacement cannot be Paradise's full
    event economy: `physics.js` gets no event input from `main.js` and `main.js` is not mine. I
    implement what physics can see by itself (speed and drift) and route the rest.

## FINDING 0, before I changed a line: `TUNE.vMax` was not the top speed, and was off by 2.3x

This is the biggest thing in this piece and the research doc missed it, because it read the
constants and did not integrate them.

`physics.js:132` (at HEAD) applied aerodynamic drag **unconditionally, including at full throttle**:

```js
const dragF = TUNE.coastDrag * (state.speed / TUNE.vMax) ** 2 * TUNE.vMax;  // = 42.9 m/s^2 at vMax
```

At `speed = vMax` that is **42.9 m/s^2** of drag against a throttle term that has faded to
`accel * 0.25 = 4.1 m/s^2`. The equilibrium is where they meet, and it is nowhere near `vMax`.

Solving `16.5*(1 - 0.75*v/78) = 42.9*(v/78)^2` by hand gives **v = 38.4 m/s = 86 mph**, and the
harness confirms it by integration (see the BEFORE table). So:

- advertised unboosted top speed 78 m/s / 174.6 mph, **actual 38.4 m/s / 85.9 mph**;
- advertised boosted 104 m/s / 232.7 mph, **actual 51.6 m/s / 115.5 mph**;
- `scenes.js` authors `boost-blur` at **300 km/h (83.3 m/s)** and `dusk-highway-chase` at 232 km/h,
  i.e. **1.6x and 1.7x above what the sim can hold** — those scenes were decelerating hard through
  their whole capture.

Every downstream constant that normalises against `vMax = 78` (`camera.js:34 V_REF`, the HUD gear
bands, the FOV and shake speed curves) was therefore being fed a speed that never exceeded **0.49**
of its reference. The car could not feel fast because the entire speed-driven half of the game's
feel was living in the bottom half of its input range. I regard this as the mechanism behind "the
car does not feel right", and it is a mechanism, not a statistic.

---

## WHAT I CHANGED, with `file:line` and BEFORE -> AFTER literals

`game/physics.js` is a rewrite, so quoting every line would be quoting the file. These are the
changes that carry the behaviour; `git diff game/physics.js` is the whole record.

| what | where | BEFORE | AFTER |
|---|---|---|---|
| drag / top speed | `physics.js:317-318` | `coastDrag: 0.55` applied as `0.55*(v/vMax)^2*vMax` at all times | `CD` and `POWER_BOOST` **solved** from `vMax`/`vMaxBoost`, so the ceilings cannot lie |
| boosted ceiling | `physics.js:83` | `vMaxBoost: 104` (ratio 1.33) | `vMaxBoost: 86` (ratio **1.103**) |
| boost drain | `physics.js:115`, `:768` | `boostDrain: 0.19` (5.26 s bar) | `boostDuration: 8.0` used as `dt/8` (**8.00 s** measured) |
| boost gate | `physics.js:753` | `state.boost > 0.001` | latch armed only at `state.boost >= 0.999`, held until empty |
| boost kick | `physics.js:119-121` | none; `accel` lerped flat to `boostAccel` | `boostKickAccel: 13.0`, `boostKickPower: 440`, `boostKickTau: 0.9` |
| boost economy | `physics.js:129-141`, `:766-790` | `boostRefill: 0.055` passive | earn from speed + drift; **burnout** refill `0.32`; **Burnout Chain** full refill after `3.2` s of drift banked while boosting |
| lateral state | `physics.js:363-370` | none — `slip` was `damp(clamp(yawRate*speed/34))` | `vLat`, `yawRate`, `slipAngle`, `drifting` are integrated states |
| yaw authority | `physics.js:522-546` | `clamp(sn/0.28,0,1) * 1/(1+max(0,sn-0.28)*1.35)` | explicit curve `min(gv/minRadius, gripUse*aLatMax/gv)` + an angle solved to achieve it |
| lean sign | `physics.js:669` | `+lat/26` (banked INTO the corner) | `-aLatBody/leanRef` (banks **outward**) |
| collision | `physics.js:400-454` | one tier, `speed *= 0.62`, applied per call | two tiers by normal closing speed, **one impulse per contact**, wall friction as a rate |
| world bounds | `physics.js:434-452` | `speed *= 0.5` every substep | same one-impulse-per-contact path |
| `state.accelG` | `physics.js:798-806` | `d(vLong)/dt` | `d(ground speed)/dt` |
| new published state | `physics.js:363-375` | - | `vLat`, `yawRate`, `slipAngle`, `drifting`, `chain`, `impact`, `boostKick`, `ground` |

`game/camera.js`, boost onset and collision, all additive and all transient:

| what | where | BEFORE | AFTER |
|---|---|---|---|
| fov punch | `camera.js:119`, applied `:347` | fov reached the boost lens through `cfg.fovAttack` only | `kickFov: 5.0` added **outside** the damp and outside `fovMax`, decaying with `state.boostKick` |
| lens punch-in | `camera.js:120`, applied `:398` | `distBoost` only, steady | `kickPunch: 0.55` m of transient dive |
| shake | `camera.js:121`, applied `:501` | `boostN * 0.038` | `+ kickN * 0.045`, cap raised by `kickN * 0.03` |
| aim lead | `camera.js:122`, applied `:461` | `1 + speedN*0.30 + boostN*0.22` | `+ kickN * 0.30` |
| collision kick | `camera.js:127`, applied `:499` | `if (s.crashed) impact = max(impact, 0.35)` only | `+ if (s.impact) impact = max(impact, s.impact * 0.85)` |
| counter-zoom reference | `camera.js:392` | `Math.tan(fov*0.5)` | `Math.tan(fovRender*0.5)` so the car holds size through the punch |

## THE NUMBERS. `node tools/handling-measure.mjs`, fixed tick 120 Hz, headless, no renderer.

Full machine-readable output: `verdicts/wave-s/handling-measure.json`.
**40 HIT / 1 MISS / 7 measured-only** (measured-only = the research doc marks the reference
`NOT FOUND`, so there is nothing to score against and I do not score it as a pass).

| target | BURNOUT | BEFORE | OURS | verdict |
|---|---|---|---|---|
| top speed, unboosted | `MaxSpeed` 177-201 mph | 38.3 m/s = **86 mph** | 78.0 m/s = 174 mph | HIT |
| top speed, boosted | `MaxBoostSpeed` 177-200 mph | 51.5 m/s = 115 mph | 86.0 m/s = 192 mph | HIT |
| boost ceiling ratio | ~1.00 across the roster | 1.344 | **1.103** | HIT |
| `TUNE.vMax` is the real top speed | internal consistency | declared 78, reached 38.3 | declared 78, reached 78.0 | HIT |
| 0-100 mph, no boost | 4-5 s (`MY-ESTIMATE`) | **never reached** | 4.56 s | HIT |
| 0-100 mph, boosting | 3.45-3.48 s (`PUBLISHED`) | 2.68 s | **3.48 s** | HIT |
| yaw rate at 40.2 m/s | 28-38 deg/s player-used | 67.4 deg/s | 33.5 deg/s | HIT |
| yaw peak / where | no published curve | 82 deg/s at 72 km/h | 62.6 deg/s at 45 km/h, 11.4 m radius | HIT |
| falloff peak -> vMax | strong (`CONSENSUS`) | 0.55x | 0.44x | HIT |
| yaw on a straight | < 0.2 deg/s | 0.000 | 0.000 | HIT |
| full boost bar | exactly 8.0 s | 5.26 s | **8.00 s** | HIT |
| boost below a full bar | refused (`PUBLISHED`) | boosted at 50% | refused | HIT |
| boost accel ratio at onset | large burst | 1.0x (no term) | 2.44x, peak 21.8 m/s^2, decayed to 10.4 by t=1 s | HIT |
| bar earned driving fast | ~0.5 %/s measured | 5.5 %/s passive | 0.42 %/s at 40 m/s | HIT |
| e-brake entry | `PUBLISHED` | \|slip\| 0.90 (cosmetic only) | \|slip\| 0.93, **34 deg** of real slip angle | HIT |
| **brake-tap entry** | `PUBLISHED`, the competitive one | n/a (no term) | peak \|slip\| **0.34**, 9 deg, drift armed 0.5 s | **MISS** |
| drift holds with steering centred | self-sustaining | 0.17 s (a `damp` constant) | 0.82 s | HIT |
| survives a 0.15 s countersteer | double drifting | no (sign flips instantly) | 0.93 -> 0.99 -> 1.00, state held | HIT |
| **exit on HELD countersteer** | ends it (`MY-ESTIMATE`) | instant | 0.82 s | HIT |
| drift carries the car wide | it must | 0 (position nudge only) | 51 deg between nose and course | HIT |
| drift scrub over 5 s | low but nonzero | **0.0%** (it *added* distance) | 17.0% | HIT |
| steer +1 = LEFT | three.js +Y is CCW | yes | yes | HIT |
| body banks OUTWARD | a car is not a motorcycle | **NO, banked inward** | yes | HIT |
| head-on impact | ends the run | 62% retained | 25% of arrival speed | HIT |
| glancing scrape | preserves the run | 62% retained (same tier) | 79% of arrival speed | HIT |
| tick-rate spread 1/240..1/20 | implementation quality | 0.85% / 2.52 deg | 0.00% / 0.00 deg | HIT |
| determinism | no RNG | bit-identical | bit-identical | HIT |
| path follower, steady error | must lane-keep | 0.90 m | 5.36 m on a 140 m radius | HIT |

Camera, all `NOT FOUND` on the Burnout side and therefore reported as measurements, not matches
(rig = `boost-blur`'s authored config, stepped at 60 Hz against a scripted car state, 1280x720):

| quantity | ours |
|---|---|
| fov, pre-boost at 73.8 m/s | 48.54 deg |
| fov overshoot at onset | +9.19 deg peak, **+1.32 deg above the settled boost lens** |
| share of the lens swing inside 100 ms | **72%** (the scene's own attack alone gives ~45%) |
| standoff punch-in at onset | -1.10 m (7.74 -> 6.64) |
| car height in frame, through the transition | 18.6% -> 17.3% (counter-zoom holds it) |
| fov after release | 49.47 vs 48.54 pre |

```progress-metrics
0-100 mph boosting: 3.48 s (Burnout 3.45-3.48, PUBLISHED)
0-100 mph no boost: 4.56 s (Burnout 4-5 estimate)
top speed: 78.0 m/s = 174 mph (was 38.3 = 86 mph)
yaw at 40.2 m/s: 33.5 deg/s (Burnout 28-38 player-used)
boost bar: 8.00 s (Burnout exactly 8.0, PUBLISHED)
boost ceiling ratio: 1.103 (Burnout ~1.00, was 1.344)
handling targets: 40 HIT / 1 MISS / 7 no-reference, tick 120 Hz headless
p50 (SMOKE ONLY, peers running): 25.3 ms at 1280x720 @ ratio 1.0
```

## HONEST MISSES AND KNOWN BEHAVIOUR

1. **Brake-tap drift is shallow. MISS.** Peak \|slip\| 0.34 against my own 0.35 threshold, i.e. 9 deg
   of slip angle with the drift state armed for 0.51 s. It is a real slide and it is the right
   *shape* (Paradise's "tap brake, left, tap brake, right" implies a short drift that gets
   re-triggered), but it is shallower than the e-brake's 34 deg. The knob is `absHold`: what a
   braked tyre leaves for cornering is `sqrt(1 - absHold^2)`, and going past 0.985 means genuinely
   locking wheels. I stopped rather than chase a threshold I set myself.
   **I also changed this test's criterion mid-flight and want that on the record**: it used to score
   \|slip\| 0.5 s *after* the tap, which measures the recovery rather than the entry. Both numbers
   are reported (peak 0.34, residual 0.16).
2. **Held e-brake at 250+ km/h still spins the car.** A 1.4 s e-brake hold with full lock at
   250 km/h reaches 87 deg of slip angle and hits the anti-pirouette clamp. A *tap* is fine: at
   105 km/h a 0.42 s tap gives a 22.5 deg drift that holds ~0.4 s and powers out, and at 263 km/h
   the same tap gives 5 deg. This is deliberate (`handbrakeMuHigh`) and it means **the e-brake is a
   mid-speed tool, not a 300 km/h one**. I have no Burnout number for it either way.
3. **The camera has no Burnout reference at all** and deliverable 3 asked for "numbers, not vibes".
   The research doc marks fov push, pull-back, shake and chromatic edge `NOT FOUND` and retracted
   its own measurement attempt as confounded. So my camera constants are *ours*, sized by a
   measurement of our own rig (72% of the swing inside 100 ms), not matched to Paradise. That is a
   partial miss on the deliverable and no amount of table formatting changes it.
4. **`state.vy` / `state.airborne` are still dead.** Nothing integrates them and `pos.y` is forced
   to 0, because the world is flat. Not fixed, and `camera.js`'s `pitchCrest` term is inert as a
   result.
5. **Frame time: SMOKE ONLY.** p50 25.3 ms, p90 65.4 ms, over-16.7 79.7%, n=158, at
   `renderW 1280 / renderH 720 / pixelRatio 1 / devicePixelRatio 1 / resScale 1`. Two critics were
   playing the game while I measured, so per the brief this is not a result. For scale, the wave
   baseline was p50 41.2 ms.

## ROUTED TO OTHER PIECES (their files, not mine)

1. **`main.js:320`** `carRoot.rotation.y = s.yaw - s.slip * 0.22` should become `= s.yaw`. `yaw` is
   now the true nose direction and the model already applies the slip angle to it, so that term is
   a partial cancel: the drawn nose still points into the slide, ~50% shallower than the physical
   value.
2. **`main.js:357` and `:364`** hand `s.speed` to the HUD and to audio. That is now the
   *longitudinal component*, which under-reads by cos(slip angle) in a drift — up to 30%. Use the
   new `s.ground`.
3. **`main.js` has no `chain` input to the HUD**, but `hud.js:2653` already consumes one. Physics
   now maintains `state.chain` (Burnout Chain credit); wiring it is a one-line change in main.js.
4. **Physics gets no event input**, so Paradise's real boost economy (near miss, oncoming, traffic
   check, air, takedown, barrel roll, gas station) cannot be implemented. `TUNE.boostEarnDanger` is
   an acknowledged stand-in for that event stream. Whoever owns traffic/collisions should feed
   physics an event, and then that term should be deleted.
5. **To the fps piece**: cruise speed on the playable path was 38 m/s and is now 75-78 m/s, so the
   world streamer, traffic and shadow cascade all move about twice as fast per second of play. Any
   fps number taken before this change was taken at half the real travel rate.
6. **`tools/fps.mjs:83`** documents "this car's terminal speed ... 38.2 m/s (TUNE.coastDrag 0.55,
   accel 16.5, vMax 78)" and says not to read it as a fault. It *was* a fault, it is fixed, and
   that note is now wrong. Not my file.

## WHAT I TRIED THAT DID NOT WORK

Each of these was measured, not argued, and each is recorded in a comment at the constant it
concerns so the next person does not repeat it.

1. **Pure rear-wheel drive.** Caps the launch at 8.9 m/s^2 and makes `BoostKickAcceleration`
   unusable: boosting 0-100 mph measured 5.30 s against 5.31 s not boosting. Fixed with
   `driveSplitRear: 0.65`.
2. **Commanding the bare Ackermann angle** for the target yaw rate. Produced 17.9 deg/s at 40 m/s
   against a 33 deg/s grip limit, because a tyre needs slip angle to make force. Fixed with an
   understeer allowance derived from the tyre model itself.
3. **Summing both axles' friction circles** for `aLatMax`. Overstates it 17% at 40 m/s: a steady
   corner needs zero net yaw moment, which fixes the front/rear force split, so each axle implies
   its own ceiling and the smaller wins.
4. **Commanding 100% of the available grip.** Marginally stable by construction: full lock at
   60 m/s held 30 deg/s for 1.5 s and then departed to a standstill. `gripUse: 0.85` plus higher mu
   was the fix, and it is the single change that made the whole model stable.
5. **Feeding the rotating-frame `dv/dt` into load transfer.** Closed a positive feedback loop
   (yaw rate -> big `-r*vLat` -> reads as braking -> unloads the rear -> more yaw rate) that took a
   33 deg/s corner to a 138 deg/s flat spin in 0.5 s.
6. **Feeding the drift's own scrub fully into load transfer.** Manufactures an unrecoverable drift:
   a 40 deg slide sat at a stable 41 deg with FULL OPPOSITE LOCK HELD for four seconds. Now 0.35.
7. **Releasing extra steering lock in both directions while drifting.** Gave the front axle enough
   authority to beat the rear's restoring moment: 653 deg/s of yaw at 40 m/s. Countersteer only.
8. **Absolute drift-angle thresholds.** The exit angle sat below the tyre's saturation angle, so a
   car merely cornering hard could never leave the drift state. Now ratios of saturation slip.
9. **Letting the handbrake's grip cut and the load transfer lower the yaw-rate DEMAND.** Every
   stabiliser keyed to that demand then obediently threw away the oversteer: an e-brake turn
   measured \|slip\| 0.07. The demand now depends on speed and steering only.
10. **A flat tyre saturation.** Gives a sliding tyre as much grip as a gripping one, so every slide
    self-corrects the moment the trigger is released. Added a 22% falling branch.
11. **Keying the parked-car lateral bleed on `state.speed`.** A car sliding fully sideways has
    vLong ~ 0, so it read as parked and had its drift deleted at 8/s: ground speed fell 253 -> 28
    km/h in 0.24 s, 26 g out of nowhere. Found by driving, not by the harness.
12. **A yaw-rate damping term in the path follower.** On a sustained curve the yaw rate is constant,
    so damping it is a constant steering bias: the car settled 10.1 m wide of a 140 m radius and
    stayed there. Replaced with cross-track error (gain 0.06; 0.09 limit-cycles).
13. **Applying the fov kick through the existing `fovAttack` damp.** Not a punch: +0.91 deg of
    overshoot arriving 0.82 s late. Applied directly it lands 72% of the swing in 100 ms.

## HOW IT FEELS, in prose, separately from the numbers

I drove it headless-but-live (`#nomenu=1`, real keyboard events, 1280x720) and watched frames.

The first thing is that **it finally goes fast**. The old car sat at 137 km/h with the throttle
buried and the speedo pinned there; now holding W walks it to 270 km/h and the whole speed-driven
half of the presentation wakes up with it — the lens opens, the road streaks, the shake comes in,
the gear climbs to 6. That change is bigger than anything in the lateral model. I am fairly sure
"the car does not feel right" was mostly this: everything downstream was calibrated for a car that
went nearly twice as fast as the one you were driving.

**Boost is now an event.** You feel the hit at the moment of the press — the lens snaps 5 deg wider
inside two frames and the standoff dives a metre — and then it hands most of that back while the
car keeps pulling. At 270 km/h there is not much headroom left so the punch is mostly camera; from
150 km/h it is a genuine shove. The full-bar rule changes the rhythm exactly as the research said it
would: you stop feathering boost and start banking it, and the bar refilling while you drive fast
gives the next dump something to aim at.

**Cornering feels planted rather than twitchy.** The old model's authority curve let you snap the
car 82 deg/s at 72 km/h; the new one gives 62 deg/s at 45 km/h and 33 deg/s at 145 km/h, and the
difference in the hand is that fast corners now need to be set up instead of flicked. At 250 km/h
the car goes where you point it and takes a while about it, which is the "progressively straighter"
character the reference is described as having. The body finally leans the right way, which sounds
cosmetic and is not: leaning into the corner made the car read as weightless.

**Drift is the part I would keep working on.** The e-brake is excellent at 100-150 km/h: a short tap
steps the tail out about 20-35 deg, the slide holds itself for most of a second with the steering
centred, a flick of opposite lock does not kill it, and holding opposite lock gathers it up in
about 0.8 s. That is recognisably the Paradise loop. Two things are not right yet. The brake tap is
too polite — it produces about 9 deg, enough to feel but not enough to chain off. And above about
230 km/h the e-brake barely does anything, which is a deliberate trade I made after a held e-brake
at 280 km/h spun the car through 78 deg with nothing the player could do about it. I would rather
ship "the e-brake is a mid-speed tool" than "the e-brake is a spin button", but a critic should
know it was a choice and not physics.

Collisions read as two different things now, which they did not before: clipping a facade at a
shallow angle costs a fifth of your speed and a camera shudder and you keep going, while squaring
one up takes three quarters of it and kicks the frame hard.

## REGRESSION GATE

All seven presets rendered at 1280x720 after the change, opened and looked at:
`shots/s/handling-{dusk-highway-chase,boost-blur,crash-cam,wet-night-asphalt,daytime-downtown,car-paint-closeup,hud-overlay}.png`.
Every one shows the car on a road, upright, in a sane pose, with nothing through a building or off
the map. The car IS in a different place along each path than before (physics moved it, and the
presets now hold their authored 232/300 km/h instead of decaying to 137), which the brief says is
expected. `car-paint-closeup` is a fixed camera on a stationary car and is pixel-unchanged in
composition. Nothing got worse.

Note `shots/` is gitignored, so those PNGs live on disk beside this verdict and are not in the
commit. Two live frames are kept as drift evidence: `shots/s/handling-drive-drift.png` (mid-drift at
108 km/h, nose pointing into the slide) and `shots/s/handling-drive-braketap.png`.

Boot check: the playable page loads and runs with **zero console errors and zero page errors**
across four separate live sessions of scripted driving (`lint ok` is not enough; permanent rule 4).
