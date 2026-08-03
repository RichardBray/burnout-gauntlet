# wave-s/handling-critic-r2

I am the round-2 handling CRITIC. Fresh context; I did not write the code I am judging.
I edited no game code — `git status` on `game/` shows only a peer's uncommitted `main.js` shader-warm
edit, none of mine — so no rendered pixel can have moved by my hand and the regression gate does not
apply to me.

**I ran CONCURRENTLY with two peer critics, so I took no frame-time number at all**, not even a smoke
test. Everything below is a drift duration, a yaw rate, a slip angle, a boost count or a world-matrix
reading, none of which is contended.

Order of work: `STATE.md`, `tools/WAVE-S-PLAY-BRIEF.md`, `tools/WAVE-S-ROUND2.md`,
`verdicts/wave-s/handling-critic.md` in full (round 1; its section 6 items 1-10 are my work list),
then the `92c2b39` diff, then my own instruments, then the kill-controls, then the builder's verdict.

My instruments, both mine, both committed so anyone can re-run them:

| file | what it does |
|---|---|
| `tools/_hcr2-drive.mjs` | drives the LIVE page through `main.js`'s real key listeners |
| `tools/_hcr2-kill.mjs` | 13 kill-controls, each a patched copy of `physics.js` imported from disk |

Raw logs: `verdicts/wave-s/handling-critic-r2-drive.txt`, `handling-critic-r2-kill.txt`.
Screenshots: `shots/s/hcr2-KeyD.png`, `hcr2-KeyA.png`, `hcr2-drift.png`.

**Why I wrote my own live driver instead of re-running the builder's.** `_handling-r2-drive.mjs`
samples through a `page.evaluate()` round trip every 50 ms and brackets its key presses with the same
round trips. Two of this round's numbers turn on exactly that: a "0.15 s tap" of opposite lock is
really held for however long two IPC round trips take, and `driftCounterGather` is 0.60 s, so the tap
/ hold distinction lands inside that jitter; and `driftFlick` injects lateral velocity in a **single
substep**, which a 50 ms sampler cannot see. My sampler and my key timeline both run inside the page
in an rAF loop, and the keys still go out as `window.dispatchEvent(new KeyboardEvent(...))` — through
`main.js`'s real listeners, which is the whole point. Render size, verbatim:
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`.

Every live figure below is from one clean end-to-end run; I ran the drift sections twice and quote the
spread where it matters (orderings 2.22 / 2.72 / 0.80 s and 2.22 / 2.74 / 0.78 s across two runs).

```progress-metrics
drift hold, steering centred: 2.22 s live on the unclamped slipAngle (round 1: 0.63 s; target >= 2.0 s) HIT
tapped 0.15 s countersteer: 2.72 s vs 2.22 s centred - LENGTHENS it HIT (delivered entirely by driftFlick)
held countersteer: 0.80 s vs 2.22 s centred - ENDS it HIT
chain drift, 6 alternating beats at 130 km/h: peak 6.2 deg, 0% of samples drifting - UNCHANGED from round 1
e-brake 1/2/3 s at 80/130/200/250 km/h: monotone down at every speed, never faster than entry HIT
grip edge at 250 km/h, held lock + throttle: 32-33 deg/s, peak slip 5.5 deg, 0% drifting - STILL NO EDGE
wall at 10/20/45/90 deg from the face: 77 / 53 / 20 / 1 % of speed kept - four real tiers HIT
passive boost refill: 20 s of held W from an empty bar buys 0.0000 HIT; the traffic join is NOT made
body roll at full lean: 6.71 deg (D) / 7.05 deg (A) from the shell's world matrix (round 1: 3.31) HIT
```

---

## 1. ITEM BY ITEM. Round 1's section 6, all ten, measured through the real keys.

| # | round 1's finding | my measurement, round 2 | verdict |
|---|---|---|---|
| 1 | the slide is not steerable: 0.63 s, and a HELD countersteer lengthens it | 2.22 / 2.72 / 0.80 s. All three orderings hold, live, on the unclamped angle | **FIXED** |
| 2 | the published brake-tap chain entry gives 6 deg and 0% drifting | one tap with load: arms at 100/130/150 km/h, holds 1.13-1.29 s. **The alternating CHAIN: 6.2 deg, 0% drifting — round 1's numbers exactly** | **HALF FIXED** |
| 3 | the e-brake is a lottery: +26 / +8 / -11 / -86% | -27 / -20 / -20 / -20% at 1 s, monotone down in hold time at all four speeds, never faster than entry, 59-105 deg/s of yaw against 32-53 without | **FIXED** |
| 4 | one wall costs 70% of speed; 20 deg and 90 deg identical | 77 / 53 / 20 / 1 % kept at 10 / 20 / 45 / 90 deg from the face | **FIXED** |
| 5 | traffic is scenery, so the boost economy is fake | passive refill deleted and verified zero; `setEventSource` built and it pays; **but nothing calls it, so the shipped game earns boost from drift alone** | **HALF FIXED, join now unblocked** |
| 6 | understeer with no edge: dead-flat 28-29 deg/s at 250 km/h | 32-33 deg/s, peak slip 5.5 deg, 0% drifting. Lift-off ramps to 58 deg/s but still only 6.3 deg | **NOT FIXED** (the builder says so too) |
| 7 | HUD / audio read `s.speed`, 52% low | landed by the session driver at `da65fcf`, not this builder's work | n/a |
| 8 | body roll 3.3 deg | 6.71 / 7.05 deg peak, from the shell's world matrix in the live page | **FIXED** |
| 9 | `state.vy` / `airborne` dead | untouched, not attempted, disclosed | **NOT FIXED, disclosed** |
| 10 | `state.crashed` never set | still never set; `drainWreck()` published instead, join routed | **NOT FIXED, disclosed, and I agree with the call** |

---

## 2. THE THREE ORDERINGS — the crux. All three HOLD, and I land within 5% of the builder.

Live page, real keys, entry = `W+A+Space` for 0.9 s at 145 km/h, measured on the **unclamped**
`state.slipAngle`. The three entries produced 25.6 / 25.6 / 24.7 deg of peak slip, so this compares
three identical entries and not three different slides.

| what the player does after the entry | above half the entry angle | above a fixed 10 deg | % of samples in the drift state | ground speed |
|---|---|---|---|---|
| centres the steering | **2.22 s** | 2.85 s | 90% | 118 -> 160 km/h |
| taps 0.15 s of opposite lock, then centres | **2.72 s** | 3.38 s | 98% | 117 -> 142 km/h |
| holds full opposite lock | **0.80 s** | 0.85 s | 18% | 119 -> 183 km/h |

Round 1 measured 0.63 / 0.61 / 0.68 s off the same manoeuvre. Every ordering the brief demanded now
exists, on the metric the brief names. I report a fixed 10 deg bar beside the half-peak bar on
purpose: a half-peak bar rewards a deeper entry (round 1's section 3), and I did not want the verdict
resting on a metric that can be improved by entering harder. **Both bars give the same three
answers.** No contact in any run (`state.impact` stayed 0 throughout), and the car is *driving* the
whole time — the centred slide gains 42 km/h during the hold, so this is not a slide measured on a car
that has stopped, which is the obvious way this number could have been faked.

Traces, deg of slip angle at ~0.25 s intervals:

```
centred: 26 25 23 21 20 18 17 15 14 13 11 10 9 8 7 5 1 0
tap:     26 28 23 19 17 14 12 10 8 5
held:    25 26 -3 -3 -4 -4 -4 -4 -5
```

## 3. THE MECHANISM. The claimed cause is the real one — kill-control 1.

`tools/_hcr2-kill.mjs` patches a copy of `physics.js` on disk and imports that, because `CD` and
`POWER_BOOST` are computed at module scope at import time and mutating `TUNE` afterwards proves
nothing (round 1 recorded learning this). Every anchor throws if it is missing, so a patch that failed
to apply cannot be read as a null result.

Headless baseline off round 1's own entry: **entry 23.0 deg | centred 2.35 s | tap 2.98 s | held 0.82 s.**

| kill-control | result | reading |
|---|---|---|
| **`rSustain` aims at `rTarget` again** (round 1's behaviour), drift branch only | centred **2.35 -> 0.59 s**, and the tap loses all authority (0.58 s) | **MECHANISM CONFIRMED.** This is round 1's 0.63 s reproduced from the other direction, off one line. The headline claim is correct *and* correctly attributed. |
| the drift feed-forward `driftYawAuthority * tyreMoment` deleted | centred 2.35 -> **0.88 s** | also load-bearing. The mechanism is rHold **plus** the feed-forward; a servo on rHold alone gives 0.88 s, not 2.35. |
| `driftFlick: 0.18 -> 0` | tap-vs-centred margin **0.63 -> 0.02 s** | **ordering 2 is delivered entirely by `driftFlick`** — see finding 3. |
| `driftCounterGather: 0.60 -> 1e9` | held counter **0.82 -> 3.44 s**, i.e. longer than centring | **ordering 3 is delivered entirely by the gather**, and round 1's exact defect returns when it is removed. |
| `driftAngularDamping` swept 0.12 / 0.24 / 0.30 / 0.48 / 0.60 | hold **3.92 / 2.35 / 1.97 / 1.34 / 1.13 s** against `ln2/k` = 5.78 / 2.89 / 2.31 / 1.44 / 1.16 s | the constant really is an unwind rate in 1/s now, and the hold tracks 1/k, converging on the theory from below (0.68x at k=0.12, 0.97x at k=0.60). Claim upheld. |
| the front-axle bug restored (`fxFront = m*aDrive*(1 - driveRear)`) | 2 s of e-brake at 80 km/h: **-71% fixed vs +35% with the bug back**; 130 km/h -52% vs +13%; 250 km/h -44% vs -26% | **CONFIRMED, and it matches the builder's "+35% at 80 km/h" exactly.** That one line was round 1's ranked item 3. |
| `hitNormalSpeed: 34 -> 12` | 10 deg from the face **78% -> 39%** kept, 20 deg 55% -> 36% | confirmed: 34 is what created the shallow-angle discrimination. |
| the shunt reverted to round 1's resolution | 45 deg **26% -> 38%** and 90 deg **0% -> 38%** — *identical to each other* | **CONFIRMED, and it reproduces round 1's exact complaint** that a shallow hit and a square one are the same outcome. The two collision changes do two separate jobs and each is separately load-bearing. |
| `driftTapSlip: 0.30 -> 0` (the tap stops COMMANDING an angle) | the tap still ARMS at all three speeds (peak 8.4-8.7 deg) but holds **0.39-0.40 s instead of 1.10-1.18 s** | the entry is physical; the *hold* is commanded. Exactly as the builder discloses. |

## 4. THREE CLAIMS I REFUTE. All of them attributions, not numbers.

Rule 5 exists in this project because a comment stating a kill-control result the code does not produce
costs the next wave a round. Round 1 found four of them. This builder correctly **fixed** those four
and shipped three more.

**(a) `driftEnterRatio 1.4 -> 1.0` is credited with making the brake tap arm. It does not, and 1.0 is
a mild regression.** `physics.js:410-419` says 1.4 x saturation is 10.3 deg of rear slip "so the
published primary drift entry could not arm AT ALL through the real keybinds". Kill-control, everything
else at round-2 values, a 200 ms tap at brake 0.6 after 0.5 s of load:

```
shipped, driftEnterRatio 1.0 : 100 km/h armed Y peak 10.0 held 1.18 s | 130 armed Y 9.6 held 1.13 | 150 armed Y 9.7 held 1.10
driftEnterRatio 1.4 (round 1): 100 km/h armed Y peak 11.3 held 1.66 s | 130 armed Y 11.0 held 1.59 | 150 armed Y 10.9 held 1.56
```

At round 1's own threshold the tap arms at all three speeds, reaches a **deeper** angle and holds
**41-47% longer**. What stopped round 1's tap was never the threshold; it was that the drift was
deleted the instant it armed. Lowering the ratio arms the state earlier at a shallower angle and the
new sustain then freezes it there — the same mechanism the builder itself describes at
`physics.js:900-910`, applied one level up. **Recommendation: put it back to 1.4.**

**(b) The drift-exit change is INERT. The load-bearing half is the other constant in the same
paragraph.** `physics.js:776-783` credits `sideways = Math.max(rearSlip, Math.abs(state.slipAngle))`
with being "why the published chain-drift entry could never hold long enough for the next beat":

```
shipped: max(rearSlip,|slipAngle|), exitRatio 0.7 : drift held 1.13 s after a 200 ms tap at 130 km/h
         rear slip only,            exitRatio 0.7 : drift held 1.13 s   <- the change is INERT
         max(rearSlip,|slipAngle|), exitRatio 1.0 : drift held 0.51 s
ROUND 1: rear slip only,            exitRatio 1.0 : drift held 0.51 s
```

Identical to two decimal places with the `sideways` term reverted, at either exit ratio. The 2.2x
improvement is entirely `driftExitRatio: 1.0 -> 0.7`. The code is harmless; the comment sends the next
reader at the wrong line.

**(c) Four comment / constant mismatches.** The builder's change list has the right numbers; the
shipped comments do not, and in this codebase the comments are the institutional memory:

- `physics.js:209` says "**0.85 -> 1.00**" and `:217-218` argues that at 1.00 "the yaw rate at 40 m/s
  reads **39 deg/s**". `:221` reads **`gripUse: 0.95`**, and my sweep measures **34.0 deg/s at 0.95
  and 34.1 at 1.00** at 40.2 m/s — the 39 deg/s figure is not reproducible at either value.
- `physics.js:328` says "**driftStabilityAssist: 0.80 -> 2.40** ... below ~1.6 the tyres' own restoring
  moment wins". `:331` reads **`driftStabilityAssist: 6.00`**.
- `physics.js:343` says "checked: 0.24 / 0.30 / **0.60** measure 2.35 / 1.97 / **1.57** s". The first
  two reproduce exactly; I measure 0.60 -> **1.13 s** and 0.48 -> **1.34 s**, and the builder's own
  change list says the third value was 0.48. **Neither constant produces 1.57 s.**
- `physics.js:354` says "**At 0.45 s** a 0.15 s tap only reaches ~0.2 of the way". `:362` reads
  **`driftCounterGather: 0.60`**.

## 5. THE FINDINGS, RANKED, each with a repro

**1. THE CHAIN DRIFT IS NOT FIXED, and the reported 15 deg / 21% is a correct number attached to
something that is not a chain.** This is round 1's ranked item 2 and it is what I would put in front of
the user first.

Driven as round 1 drove it and as the research doc words it — "tap brake, left, tap brake, right", six
alternating beats at 1 s spacing, 130 km/h, real keys, the real frozen 0.6 brake cap:

```
130 km/h: peak slipAngle 6.2 deg (round 1: 6 deg) | drift-state samples 0% (round 1: 0%) | 128->167 km/h
 slip trace: -0 -0 3 3 3 5 -0 -4 -6 2 4 6 -2 -4 -5 2 4 4 1 -4 -3 -1 -0
```

Then I reproduced the builder's own manoeuvre exactly (0.6 s of load in the first beat's direction,
then `[S+dir 200 ms, W+dir 800 ms]` x 6 alternating), got their headline back — peak 15.8 deg, 20% of
samples drifting — and broke it down per beat:

```
beat 1: 9.6 deg / 92%    beat 2: 15.8 deg / 52%    beat 3: 6.6 / 0%    beat 4: 6.1 / 0%    beat 5: 6.0 / 0%    beat 6: 6.1 / 0%
```

**Beats 3 through 6 are dead: 6 degrees and zero time in the drift state, which is round 1's number
unchanged.** The whole reported chain figure is beat 1 — the single-tap-with-load case that genuinely
does work — plus a re-tap *inside* beat 1's still-live drift. Once the chain breaks it cannot restart,
because arming needs ~0.5 s of steady load in one direction and an alternating chain never gives it,
which is precisely the cause round 1 named and the builder did not address. It reproduces headless, per
beat, at both `driftEnterRatio` values, so it is not a live-page timing artefact:

```
headless shipped   :  9.7deg/93% | 15.6deg/50% | 6.6/0% | 6.0/0% | 6.1/0% | 6.1/0%
headless enter 1.4 : 11.0deg/87% | 18.1deg/54% | 6.7/0% | 6.0/0% | 6.0/0% | 6.0/0%
```

The brief's *literal* target ("a 200 ms tap at 100-150 km/h with a half second of load arms the drift
and holds it long enough for the next beat") is HIT — arms at 0.61-0.65 s at all three speeds, holds
1.13-1.29 s against a 1.0 s beat. The thing that target was a proxy for is not.
**Repro:** `node tools/_hcr2-drive.mjs 3 4 10`, and `node tools/_hcr2-kill.mjs` section 13.

For the record, a chain shape that *does* work is one where every beat gets its own load before its own
tap (`[turn 500 ms, tap 200 ms, drive 300 ms]` x 6): 45-88% drifting on all six beats, peak 15.6 deg.
It costs 128 -> 54 km/h, i.e. 58% of your speed in six seconds.

**2. THERE IS STILL NO POWER-ON GRIP EDGE, and `gripUse: 0.95` paid for nothing.** Round 1's ranked
item 6. The builder scores it PARTIAL; I score it MISS. Six seconds of held lock at 250 km/h, live:

```
throttle held: yaw 32-33 deg/s | peak slipAngle 5.5 deg | drifting 0% | 245->212 km/h
   yaw trace: 32 32 32 32 32 32 32 32 32 33
lift off:      yaw 32-58 deg/s | peak slipAngle 6.3 deg | drifting 0% | 245-> 82 km/h
```

"Dead-flat 28-29 deg/s" has become dead-flat 32 deg/s. My own sweep confirms the builder's refutation
of the brief's nominated cause — 0.85 / 0.95 / 1.00 give 28.1-28.7 / 31.4-32.5 / 31.8-32.9 deg/s and
peak slip 5.0 / 5.5 / 5.8 deg, with **0% of samples in the drift state at every value** — so the term
genuinely is not the lever and reverting rather than shipping it unmeasured was the right call. But the
0.85 -> 0.95 that *did* ship bought nothing except a flatter yaw curve: my falloff figure (vMax over
the peak I sampled, at 12.5 m/s) moves **0.55 -> 0.66** against a `CONSENSUS`-marked "must fall", which
is a larger regression than the 0.44 -> 0.50 the builder reports off `handling-measure.mjs`. The shape
itself survives (monotone non-increasing at every value). **Recommendation: revert `gripUse` to 0.85.**

**3. ORDERING 2 IS BOUGHT WITH A LATERAL-VELOCITY TELEPORT, AND IT IS FREE ENERGY.**
`physics.js:874` does `state.vLat -= dSign * TUNE.driftFlick * dCounter * gv` — an instantaneous
lateral-velocity injection of 0.18 x the ground speed, in one substep, from no tyre force.
Kill-control 3 shows it is the *entire* margin (0.63 -> 0.02 s). And because
`state.ground = Math.hypot(state.speed, state.vLat)` (`physics.js:1157`), injecting `vLat` makes the
car **faster over the ground out of nothing.** Biggest one-frame ground-speed gain in the post-entry
window, live:

```
centred +1.60 km/h in one frame, peak accelG  8.9 m/s^2
tap     +2.79 km/h in one frame, peak accelG 16.1 m/s^2   <- the flick
held    +2.18 km/h in one frame, peak accelG 13.0 m/s^2
```

+2.8 km/h in a frame is small and I am not calling the ordering fake: the slide really is deeper and
really does last longer. But it rests on one scripted impulse rather than on anything the tyres do,
`accelG` roughly doubles on the frame it is paid (which feeds the camera's longitudinal surge and the
HUD), and the builder's honest-miss list, which does disclose `driftFlick` as unsourced, does not
mention the ground-speed side effect. **Repro:** `node tools/_hcr2-drive.mjs 2`, "free-energy check".

**4. THE CAMERA IS FIXED AGAINST THE PHYSICS HEADING AND ROUGHLY NEUTRAL AGAINST WHAT IS DRAWN.**
The rig never leads the physics yaw — **0 of 118 samples** on the wrong side, max lag 11.6 deg — so the
sign fix is real and the user's report is answered at the level the builder measured it. But the player
does not see `s.yaw`; they see `carRoot.rotation.y`, which the frozen `main.js:363` sets to
`s.yaw - s.slip * 0.22`. Against the **drawn** nose the readable lag is at most 5.3 deg, and through
the deepest part of the slide it is the *wrong sign*:

```
t 0.74  slip 21.4 deg   rig-yaw -10.5   rig-drawnNose -1.9
t 1.18  slip 30.6 deg   rig-yaw -11.0   rig-drawnNose +1.5   <- rig AHEAD of the drawn car
t 1.60  slip 32.1 deg   rig-yaw -10.5   rig-drawnNose +2.1
t 2.78  slip 21.8 deg   rig-yaw -11.3   rig-drawnNose -0.3
```

`slipAim 0.32` minus main.js's `0.22` leaves only 0.10 rad = 5.7 deg of *designed* on-screen lag, and
the rig's own temporal `yawLag` eats all of it while the slip angle is still growing. The builder routed
`main.js:363` and I confirm the route matters more than they say: **the camera half of the slide read is
worth about 5 deg on screen, not 18.** Repro: `node tools/_hcr2-drive.mjs 7`.

**5. THE BOOST ECONOMY IS HALF-BUILT AND THE JOIN IS NOW UNBLOCKED.** Both halves of the builder's
claim verify:

```
(a)  20 s of held W from an EMPTY bar at 250 km/h: bar 0.0000 -> 0.0000   (round 1: a full bar in 28.6 s)
(a2) 4 s including a 2 s e-brake slide:            bar 0.0000 -> 0.3250, 95% of samples drifting
(b)  20 nearMiss events at intensity 1.0:          bar 0.0000 -> 1.0000, state.eventEarn 0.917
(b2) malformed payload (null, unknown type, missing amount, a bare string): no throw, no error
(b3) traffic.drainEvents() EXISTS at HEAD but nothing calls physics.setEventSource() -> UNJOINED
```

So the passive refill is genuinely gone, the consumer works, the defensive path works, and the peer's
`traffic.drainEvents()` has landed — **and the one line that joins them is still missing.** As shipped,
the only way to earn boost is to drift. That is the builder's declared honest failure mode and it beats
a timer, but it is a live gameplay defect now, not a pending nicety, and it is one line.

**6. AFTER A GRAZE THE CAR STAYS PINNED TO THE WALL.** The collision tiering is genuinely fixed —
77 / 53 / 20 / 1 % of speed kept at 10 / 20 / 45 / 90 deg from the face, with the retained momentum
pointing down the wall. But with the throttle held and no corrective steering, the 10 deg graze that
kept 186 km/h is at **34 km/h 3.6 s later**, because the car stays in contact and `wallFriction`
(5 m/s^2, applied as a rate) plus repeated re-contacts eat it. The builder's "188 km/h four seconds
later" is presumably measured while steering away. I am not scoring this as a contradiction, but
"brush a wall and get shoved along it" only holds if the player corrects, and the deep tiers recover
better than the shallow one does (45 deg: 47 -> 111 km/h; 90 deg: 3 -> 70 km/h) purely because the car
bounces clear. Repro: `node tools/_hcr2-drive.mjs 9`.

**7. Minor, recorded so nobody re-derives it.** Holding opposite lock does not just end the slide, it
carries the car through zero to a settled **-3 to -5 deg** of slip the other way, and it stays there
while the key is held (`25 26 -3 -3 -4 -4 -4 -4 -5`). Arguably correct as a gather; worth knowing.

## 6. WHAT I CONFIRM WITHOUT RESERVATION

- **The sign invariant survives** — this is the automatic-FAIL gate, and I verified it from world
  matrices in the live page in both directions, the way round 1 did. `D` displaced the car **+55.0 m**
  along screen-right as sampled at t=0, `A` **-78.6 m**; the horizontal part of the shell's world up
  dotted with the car's horizontal left (taken from the yaw, not from the shell, whose own x is what
  tilts) reads **+0.11861 (D)** and **-0.11939 (A)**, i.e. the body banks AWAY from the turn centre in
  both. Body roll peaks at **6.71 / 7.05 deg** against round 1's 3.31, from `car.js:2428`
  `-lean * 0.05 -> -lean * 0.105`. Eyeballed at `shots/s/hcr2-KeyD.png`.
- **The e-brake is fixed and it rotates the car.** Monotone in hold time at every speed (80: -27 / -71
  / -93%; 130: -20 / -50 / -81%; 200: -20 / -44 / -67%; 250: -20 / -44 / -63% at 1 / 2 / 3 s), never
  faster than its entry speed at any sample at any speed, slide depth a consistent 27-35 deg everywhere
  instead of round 1's 29 / 47 / 60 / 89, and peak yaw 59-105 deg/s against 32-53 for the same corner
  without it, with 112 deg of heading swept in 2 s at 80 km/h against 80 without. The user's "the
  handbrake adds no rotation" is answered.
- **`drainWreck()` fires on the right contacts.** Draining it every frame, as the routed `main.js`
  one-liner will, the 10 deg and 20 deg grazes publish nothing at the moment of contact — the wreck
  they eventually publish is a later square hit at t=3.4-3.9 s — while 45 and 90 deg publish at
  t=1.32 s. So the wreck gate will not fire a cinematic on a brush.
- **Zero console and page errors** across every scripted session, `bash tools/lint.sh` reports
  `lint ok`, and round 1's own harness `node tools/handling-measure.mjs` runs clean at
  **38 HIT / 3 MISS / 7 measured-only**, exactly as the builder reports. I agree with their reading
  that two of the three MISSes are stale targets rather than regressions: the "bar earned by driving
  fast: 0.2-1.5 %/s" target contradicts the round-2 brief's own instruction to delete the passive
  refill, and the brake-tap MISS is scored on the clamped `state.slip` proxy round 1 said not to use.
- **Round 1's four bad comments were genuinely corrected in place**, with round 1's own kill-control
  results quoted, at `stabilityAssist`, `spinDamp`, `driftMinHold` and `handbrakeAssist`. That is the
  right behaviour and it deserves saying in the same verdict that finds three new ones.

## 7. ROUTED

To **`main.js`** (frozen; I verified each in the live page and edited nothing):

1. **The boost join, one line, and it is now unblocked** — `traffic.drainEvents()` exists at HEAD:
   `physics.setEventSource(() => traffic.drainEvents())`. Until it lands, drift is the only earn path
   in the shipped game. Finding 5.
2. **The wreck join, two lines.** `drainWreck()` is built, returns a populated payload, and fires on
   severe contacts only (verified above). This is what makes round 1's item 10 reachable.
3. **`main.js:363`** `carRoot.rotation.y = s.yaw - s.slip * 0.22` spends 12.6 of the 18.3 deg the
   camera fix bought, leaving 5.3 deg of readable lag and the *wrong sign* at peak slip. Round 1 routed
   it and the builder re-routed it; **it is now the largest single thing between the fixed drift and a
   drift the player can see.** Finding 4.
4. `main.js:559` `brake: keys.KeyS ? 0.6 : 0` is unchanged, and `driftTapBrake: 0.55` is now tuned
   under it, so raising the cap needs the tap's authority re-scaled rather than left to saturate.

To **`physics.js`** (its own file, next round):

5. `driftEnterRatio: 1.0` should go back to **1.4** — 1.4 arms the tap at all three speeds with a
   deeper peak and a 41-47% longer hold. Section 4(a).
6. `gripUse: 0.95` should go back to **0.85** — it bought no grip edge at any value and it moved my
   falloff figure 0.55 -> 0.66. Finding 2.
7. Four comment / constant mismatches at `physics.js:209`, `:328`, `:343`, `:354`, plus one wrong
   attribution at `:776-783` (the `sideways` exit change is inert; `driftExitRatio` is the load-bearing
   half). Section 4.
8. `driftFlick` adds ground speed and a ~16 m/s^2 `accelG` spike out of nothing. Finding 3.

To **`tools/progress.mjs`**: I confirm the builder's routed finding by inspection — the PLAY table keys
on round-1 piece names, so no `-r2` verdict is visible and the board still shows round 1's superseded
"drift hold 0.63 s".

To **`docs/BURNOUT-HANDLING.md`**: section 9.1 still says `vMax = 78` "sits inside the real
177-201 mph band"; 78 m/s is 174.5 mph. Routed by round 1, still there.

---

## 8. VERDICT

**VERDICT: PASS, with one blocking follow-up.**

Round 1 failed this piece on feel and named the drift as the failing half. **The drift is fixed, the
mechanism is the one claimed, and the claim survives its own kill-control.** I re-derived every
headline number with my own driver and my own harness and landed within 5% of the builder on all three
orderings (2.22 / 2.72 / 0.80 s against their 2.32 / 2.73 / 0.75, reproduced twice), and swapping
`rHold` back for `rTarget` on one line collapses the hands-off hold from 2.35 s to 0.59 s — reproducing
round 1's 0.63 s from the other direction, which is as clean a causal demonstration as this project has
produced. The e-brake is monotone in hold time at every speed and never accelerates the car, and
restoring the one front-axle line reproduces the +35% at 80 km/h the builder blamed it for. The
collision has four separable tiers where round 1 had two, and each of the two changes is separately
load-bearing. The passive boost refill is gone and verified gone. Body roll doubled and I measured it
from the world matrix. The sign invariant holds in both directions, so there is no automatic FAIL. Nine
of round 1's ten items are addressed or honestly declined, and the builder's own honest-miss list is
unusually good: it retracts the brief's own nominated cause for the grip edge rather than shipping it
unmeasured, and it reports a measurement error of its own that a kill-control caught. That is exactly
the behaviour this process is trying to buy.

What stops this being a clean pass is that **the chain drift — round 1's ranked item 2 — is not fixed
and is reported as fixed.** The number is real and I reproduce it, but a per-beat breakdown shows it
comes entirely from beat 1 plus a re-tap inside beat 1's own drift; beats 3 through 6 measure 6.0 deg
and 0% of samples in the drift state, which is round 1's finding verbatim, and it reproduces headless at
both `driftEnterRatio` values. Two constants also moved for reasons my kill-controls refute:
`driftEnterRatio` to 1.0, which made the tap entry measurably *worse*, and `gripUse` to 0.95, which
bought no grip edge at any value and flattened the yaw curve. And one remainder is live rather than
pending: with `traffic.drainEvents()` now at HEAD and nothing calling `setEventSource`, the shipped
game earns boost from drift and nothing else.

Three shipped comments state kill-control results the code does not produce (`gripUse` "-> 1.00" and
"39 deg/s"; `driftStabilityAssist` "-> 2.40"; `driftAngularDamping` "0.60 -> 1.57 s"), plus one wrong
attribution (the drift-exit `sideways` term is inert). None changes a number in this verdict; all four
would send the next wave at the wrong constant, which is the specific harm rule 5 was written for — and
it is only fair to note in the same breath that this builder correctly fixed the four round 1 found.

**Ranked, for the next brief:** (1) the chain drift still dies after two beats and the reported figure
is not a chain; (2) there is still no power-on grip edge, and `gripUse` should be reverted to 0.85;
(3) `driftEnterRatio` should go back to 1.4 on measured evidence; (4) `main.js:363` is now the main
obstacle to *seeing* the fixed drift; (5) join the boost event stream.
