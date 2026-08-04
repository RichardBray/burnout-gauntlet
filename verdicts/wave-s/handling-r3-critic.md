# wave-s/handling-r3-critic

I am the round-3 handling CRITIC. Fresh context. I did not write the code I am judging and I edited no
game code — `git status` shows no `game/` file of mine, so no rendered pixel can have moved by my hand
and the regression gate does not apply to me.
My own files are this verdict, `tools/_hr3c.mjs`, `tools/_hr3c-live.mjs` and their four logs.

I ran ALONE, and I still took **no frame-time number of any kind, not even a smoke test** — a
frame-time claim in this wave belongs to the perf critic. Everything below is a slip angle, a yaw
rate, a signed heading, a drift duration, a speed ratio, a boost quantity, a force ratio or a
world-matrix reading, none of which is contended.

Order of work: `STATE.md`, `tools/WAVE-S-PLAY-BRIEF.md`, `tools/WAVE-S-ROUND2.md`,
`verdicts/wave-s/handling-critic-r2.md` in full, `verdicts/wave-s/handling-r2-verify.md` in full,
then `git show 3e4e645 -- game/physics.js` against the builder's change list line by line, then my own
instruments, then the builder's own logs — last, and only to check the two places where my numbers and
theirs disagree.

| my file | what it does | log |
|---|---|---|
| `tools/_hr3c.mjs` | 5 sections, ~30 kill-controls. Patches a COPY of `physics.js` on disk and imports it (CD and POWER_BOOST are module-scope, so mutating TUNE after import proves nothing). BEFORE is loaded from `git show 68c093b:game/physics.js`. Every anchor throws if missing | `handling-r3-critic-kill.txt` |
| `tools/_hr3c-live.mjs` | LIVE page, real `KeyboardEvent`s through `main.js`'s listeners, in-page rAF sampler. SIGNED headings. Sections: turn-in, the boost join with the road emptied, the wreck join, the drawn nose | `handling-r3-critic-live.txt`, `-live-2.txt` |
| the ROUND-2 CRITIC's `tools/_hcr2-drive.mjs`, run **UNMODIFIED**, all ten sections | the strongest available re-derivation of round 2's wins: not the builder's tool and not mine, and every number in the verdict chain came out of it. I copied its output aside and restored its own log with `git checkout --`; `git status` shows it unmodified | `handling-r3-critic-drive.txt` |

Render size for every live figure, verbatim from `ctx.renderSize()`:
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`.

```progress-metrics
free energy at the flick line, metered by me over the 6-beat chain: 6.2173 m/s of ground speed CREATED -> 0.0000 m/s (norm-preserving) FIXED
chain per beat, LIVE real keys via the round-2 critic's own tool: 14.2/22.6/14.9/14.9/14.9/14.9 deg at 98/69/68/68/68/68% - all six beats over 10 deg
chain depth WITHOUT the impulse (driftFlick 0), headless at HEAD: beats 3-6 sit at 6.4 deg, NOT the 8.5-8.7 deg the shipped comment claims
brake+lock vs throttle+lock, 130 km/h, 400 ms, LIVE SIGNED: +12.2 vs +12.2 deg (verify pass: 2.8 vs 11.9) FIXED; worst wrong-way yaw 0 at every speed
wrong-way yaw on brake+lock at 250 km/h: -92 deg/s BEFORE -> 0 AFTER, and both halves load-bearing (each deleted alone reproduces the defect) CONFIRMED
power-on grip edge at 250 km/h: 28-29 deg/s, peak slip 4.9 deg, 0% drifting - STILL ABSENT, and the structural-limit disclosure is CORRECT (rear demand/capacity 0.77 on throttle vs 0.86 coasting)
round 2's wins all survive LIVE: orderings 2.22/2.68/0.78 s (10 deg bar 2.85/3.23/0.82), e-brake monotone at 4 speeds, sign invariant PASS both ways, rig leads in 0/228
the three joins at 68c093b all verify: 1 km of held W earns 0.0000 with the road emptied and 0.2932 with 7 nearMisses; crash.js reached; carRoot.rotation.y - s.yaw = 0.0000 deg over a 25.5 deg slide
```

---

## 1. RULE 5 FIRST. THE CONSTANTS ARE REAL, AND ONE SHIPPED COMMENT IS NOT.

`git diff 68c093b 3e4e645` touches exactly `game/physics.js` (+119/-3), the two new tools, four logs
and the verdict — plus `STATE.md`, `progress.json` and `tools/progress.mjs`, which are the session
driver's, not the builder's. **`game/camera.js` is byte-identical** (`git diff 68c093b 3e4e645 --
game/camera.js` is empty), as claimed.

| claim | file:line at HEAD | BEFORE | AFTER | in the diff |
|---|---|---|---|---|
| new constant | `physics.js:521` `driftRefFloor` | did not exist | **`1.5`** | yes, added |
| the flick | `physics.js:1047-1052` | `state.vLat -= dSign * TUNE.driftFlick * dCounter * gv;` | the 5-line body-frame rotation | yes |
| the drift reference | `physics.js:1133-1138` | `const ref = lerp(rSustain, rTarget, gather);` | `floorFade` / `refSustain` / `sT` / the one-sided `ref` | yes |
| the feed-forward gate | `physics.js:1197-1198` | `const entering = rearBroke && tapOut !== 0;` | `+ && proRotation`, with `proRotation = tyreMoment * Math.sign(rTarget \|\| dSign) > 0` | yes |
| everything else | — | — | — | `gripUse: 0.85` (`:223`), `driftFlick: 0.18` (`:373`), `driftBreakRatio: 1.0` (`:474`), `driftEnterRatio: 1.4` (`:433`), `driftAngularDamping: 0.24` (`:354`), `driftYawAuthority: 0.90` (`:337`), `driftStabilityAssist: 6.00` (`:336`), `stabilityAssist: 2.6` (`:311`), `spinDamp: 6.0` (`:398`), `steerServo: 0.45` (`:292`), `steerServoDrift: 0.06` (`:300`), `driveSplitRear: 0.65` (`:118`), `absHold: 0.985` (`:126`), `transferCap: 0.40` (`:185`), `downforce: 0.95` (`:226`) — **all unchanged, all verified at the declaration line, `gripUse` still 0.85 as the brief required** |

The `driftRefFloor` comment's own measured table reproduces on my instrument almost digit for digit
(section 3 below): BEFORE `+7.2 / +0.4 / -9.3 / -14.2`, AFTER `+11.2 / +7.7 / +4.1 / +3.3` against the
comment's `+11.3` at 100 km/h, and the W+lock column `+12.6 / +10.8 / +9.0 / +8.6` exactly. So does its
`-92 deg/s -> 0` claim, and so do both of its per-half kill-control rows.

**ONE SHIPPED COMMENT STATES A KILL-CONTROL RESULT THE CODE DOES NOT PRODUCE, and it is the one number
the brief told me to check hardest.** `physics.js:1039-1043`:

> *"WHAT IS STILL UNSOURCED ... 7.4 of the chain's 16.1 deg is still this term. Zero it and beats 3-6
> sit at 8.5-8.7 deg."*

At HEAD, zeroing `driftFlick` puts beats 3-6 at **6.4 deg**, not 8.5-8.7, and the chain they are 6.4 deg
out of is **14.8-14.9 deg**, not 16.1. 8.5-8.7 / 16.1 are the figures for a *rotation-only* variant
that was never shipped. The same wrong pair is repeated in the verdict's honest-miss 1 and in the
commit message. The builder's own log has the right number on line 14 of
`verdicts/wave-s/handling-r3-kill.txt` (`AFTER, driftFlick 0 : ... 6.4deg/69% x4`), so this is a
transcription into prose and comment, not a fabricated measurement — but it is exactly the harm rule 5
exists for, it is favourable to the builder by 2.2 deg, and it changes the answer to the brief's own
item-1 question. Repro: `node tools/_hr3c.mjs 2`.

## 2. ITEM 1 — THE FREE ENERGY. **FIXED, and provably rather than approximately.**

The brief's test is conservation, so I metered it **at the line**, in a patched copy that records
`hypot(state.speed, state.vLat)` immediately before and immediately after the flick block and sums the
difference over the whole published six-beat chain. Same meter on both files, so it cannot favour
either:

```
BEFORE (68c093b, adds to state.vLat) : 923 applications | TOTAL |v| CREATED 6.2173 m/s (22.3824 km/h) | biggest single +0.0409
AFTER  (3e4e645, rotates the vector) : 822 applications | TOTAL |v| CREATED 0.0000 m/s (0.0000 km/h)  | biggest single +0.0000
```

I reproduce the builder's headline to four decimal places (6.2173 and 0.0409) without having read
their log first. **The mechanism is right for the right reason**: a body-frame rotation of
`(speed, vLat)` is norm-preserving, so this is zero algebraically and not zero by tuning — no later
retune of `driftFlick` can reintroduce it. `state.ground = hypot(speed, vLat)` (`physics.js:1432`) is
the speedometer and the engine note since `da65fcf`, so this was a real defect and it is properly
closed. Live, on the round-2 critic's own free-energy probe run unmodified, the biggest one-frame
ground-speed gain on the tapped ordering reads **+0.97 km/h** with peak `accelG` 17.5 m/s^2, against
the critic's pre-repair +2.79 / 16.1 and the verify pass's +1.15 / 20.4.

**THE HONEST DEPTH, which is the half of item 1 the builder got wrong.** Per beat at 130 km/h,
headless:

```
BEFORE 68c093b                   : 8.9 | 20.6 | 16.2 | 16.2 | 16.2 | 16.2 deg   (69% drifting on beats 2-6)
AFTER  3e4e645                   : 14.1 | 23.0 | 14.9 | 14.9 | 14.8 | 14.8 deg  (69%)
BEFORE, driftFlick 0             : 8.9 | 13.5 |  8.5 |  8.6 |  8.7 |  8.7 deg   (69%)
AFTER,  driftFlick 0             : 14.1 | 16.0 |  6.4 |  6.4 |  6.4 |  6.4 deg  (69%)   <- the honest number at HEAD
AFTER,  driftFlick 0 + gate OFF  : 11.6 | 16.0 |  8.3 |  8.3 |  8.4 |  8.4 deg  (69%)   <- the gate costs 2.0 deg of it
AFTER,  driftFlick 0 + BOTH OFF  :  8.9 | 13.5 |  8.5 |  8.6 |  8.7 |  8.7 deg  (69%)   <- reproduces BEFORE exactly
```

So `driftFlick` supplies **8.5 of the shipped chain's 14.9 deg, i.e. 57%**, not 7.4 of 16.1 (46%), and
the tyre-model residue went **8.6 -> 6.4 deg this round**, attributable by kill-control to the
`proRotation` gate. **Answering the brief's question plainly: without the impulse, chain drifting is
REACHABLE BUT NOT DEEP.** The drift STATE is genuinely earned by the tyre model — 69% of samples on
every beat with `driftFlick` at zero, against the 0% the round-2 critic measured — but 6.4 deg of slip
is round 1's and round 2's own dead-chain value (6.0-6.6 deg), and the round-2 critic's 10 deg bar is
cleared only with the scripted rotation switched on. Third round on this term; it is no longer free
energy and it is still not physics.

Live, through the round-2 critic's unmodified tool, the shipped chain reads
**14.2 / 22.6 / 14.9 / 14.9 / 14.9 / 14.9 deg at 98 / 69 / 68 / 68 / 68 / 68%** — every beat over the
10 deg bar for the first time, against round 2's 9.6/15.8/6.6/6.1/6.0/6.1 at 92/52/0/0/0/0% and the
verify pass's 9.1/20.8/16.0/16.2/16.2/16.1. Beat 1 really does go 9.6 -> 14.2 deg, and the deep beats
really are 1.2-1.3 deg shallower than the verify pass measured. **Both of the builder's disclosures on
this are honest and I confirm the trade is the right one**: six live beats over 10 deg beats four live
beats over 16 deg with two under it.

## 3. ITEM 2 — BRAKE PLUS LOCK. **FIXED at 130 km/h, and the defect was worse than the brief said.**

The builder's central claim is that this was never a dead zone but an **inverted response** hidden by
two unsigned instruments. I wrote my own signed probe before reading their reasoning, and it is true.
Headless, from dead straight, signed heading in 400 ms (+ = the direction the driver asked for):

| | 100 km/h | 130 km/h | 200 km/h | 250 km/h |
|---|---|---|---|---|
| **BEFORE** brake + full lock | +7.2 | **+0.4** | **-9.3** (wrong-way yaw -52 deg/s) | **-14.2** (wrong-way yaw **-92 deg/s**) |
| **AFTER** brake + full lock | +11.2 | +7.7 | +4.1 | +3.3, wrong-way yaw **0 at every speed** |
| throttle + full lock, either file | +12.6 | +10.8 | +9.0 | +8.6 |
| AFTER, `driftRefFloor` floor DELETED | +7.4 | +3.9 | +1.4 | +1.0 (sign fixed, rotation gone) |
| AFTER, `proRotation` gate DELETED | +10.4 | +2.8 | -7.3 | -12.5 (rotation back, still INVERTED) |
| AFTER, BOTH DELETED | +7.2 | +0.4 | -9.3 | -14.2 — **reproduces BEFORE to the decimal** |

**Both halves are load-bearing and neither is redundant**, and I land on the builder's own per-half
numbers digit for digit. One methodological note for the next reader, because I got it wrong first:
setting `driftRefFloor` to 1 does **not** disable the floor —
`floorFade = 1 - clamp((|slip|/satRear - 1)/(floor - 1), 0, 1)` goes to **1**, i.e. the floor becomes
permanently fully ON, and I measured a spurious "inert" result for ten minutes until I noticed. The
only honest deletion is to hand `ref` the unfloored sustain reference. That is what my `FLOOR_OFF`
patch does and it is commented in `tools/_hr3c.mjs`.

**LIVE, real keys, signed, which is the brief's own question** (`node tools/_hr3c-live.mjs 1`):

| | 400 ms brake+lock | 400 ms throttle+lock | 800 ms brake+lock | 800 ms throttle+lock |
|---|---|---|---|---|
| 100 km/h | **+15.8** | +4.7 | +9.8 | +30.2 |
| **130 km/h** | **+12.2** | **+12.2** | +13.6 | +26.4 |
| 200 km/h | +6.4 | +10.0 | **+23.5** | +22.0 |
| 250 km/h | +5.3 | +9.6 | **+24.7** | +20.9 |

Worst wrong-way yaw rate in every 400 ms window at every speed: **0 deg/s**. The brief's number to beat
was 2.8 vs 11.9 deg at 130 km/h; it is now **12.2 vs 12.2** — parity, live, on the instrument that found
the defect. At 200-250 km/h the braked car still under-rotates at 400 ms and passes the unbraked one by
800 ms, exactly as the builder discloses.

**Two pathology probes the fix could have failed and does not.** A one-sided floor that can only ADD
rotation is exactly the shape of change that gives the player rotation they did not ask for. A
straight-line brake (steer 0) for 1 s sweeps **0.000 deg and peaks at 0.00 deg/s of yaw at 80 / 130 /
200 / 250 km/h, on BOTH files** — the research doc's `< 0.2 deg/s` straight-line target, which
`handling-measure.mjs` also scores HIT at 0.000. And a **held** brake at full lock for 2 s still spins
the car (peak slip 72.9 deg at 130 km/h, worst yaw -138 deg/s) — but identically on both files (73.1 deg
and -138 AFTER), so the round-3 change does not touch it. Live at 800 ms I reproduce the builder's own
disclosed miss: worst wrong-way yaw **-54 / -25 deg/s at 100 / 130 km/h** as the overshoot gathers
back up. Disclosed, pre-existing, not fixed, and I agree it is not a regression.

**The shipped value 1.5 is right and I confirm the builder's self-catch.** Swept on my own harness at
1.2 / 1.5 / 2.0 / 3.0 / 6.0, the turn-in is **flat** (130 km/h reads 7.7 deg and 250 km/h 3.3 deg at
every value), so the fade width buys nothing on the defect it exists for — and what it costs is
ordering 2, the tapped countersteer, on the round-2 critic's **fixed 10 deg bar**:
`3.42 / 3.34 / 2.87 / 2.05 / 0.93 s` against a centred **2.89 s**. At 2.0 that is a MISS by 0.02 s; at
the shipped 1.5 it is a HIT by 0.45 s. The builder shipped 2.0 first, the round-2 critic's own live tool
caught it, and they corrected it before commit and recorded that their headless harness alone was not
sufficient. **That is the behaviour this loop exists to buy and it should be said in the same verdict
that finds their bad comment.**

## 4. ITEM 3 — THE POWER-ON EDGE. **STILL ABSENT, and the disclosure is CORRECT. That is a PASS on this item.**

The brief instructs me to judge a disclosure on its evidence rather than score it a miss, so, plainly:
**the builder is right, I attacked it independently, and I could not make an edge appear either.**

The behaviour first. Six seconds of held full lock, live, the round-2 critic's own section 6:
**28-29 deg/s dead flat, peak slipAngle 4.9 deg, 0% of samples drifting, 245 -> 222 km/h.** Headless at
130 / 200 / 250 km/h: 4.6 / 4.7 / 5.0 deg of peak slip and 0% drifting. Third round, unchanged.

Their central claim is that this is not an assist catching the car but the rear axle *gaining*
capability under power. I instrumented `fyRearDemand` and `fyRearCap` inside `substep()` myself and read
the ratio out over the same six seconds:

| | rear demand / capacity (mean, max) | `\|fxRear\|` as a share of `mu*Fz` | `fzRear / fzRear0` |
|---|---|---|---|
| 100 km/h full throttle | 0.768, 0.783 | 0.430 | **1.210** |
| 100 km/h coasting | 0.736, **0.859** | 0.000 | 0.992 |
| 200 km/h full throttle | 0.771, 0.785 | 0.317 | 1.143 |
| 200 km/h coasting | 0.844, **0.859** | 0.000 | 0.991 |
| 250 km/h full throttle | 0.777, 0.793 | 0.270 | 1.118 |
| 250 km/h coasting | 0.844, **0.859** | 0.000 | 0.991 |

The ratio never approaches 1.0 on throttle and it is **higher coasting**, at every speed — the builder's
0.78-vs-0.86 table, re-derived independently. The behavioural corollary is the cleanest evidence of all
and neither previous round measured it: **coasting rotates the car far harder than throttle does.** Six
seconds of held lock, headless: 130 km/h reaches **76 deg/s coasting against 35 on throttle**, 200 km/h
57 against 29, 250 km/h 45 against 29. Power in this model is a rear-grip GAIN, not a loss, and the
mechanism is visible in the two right-hand columns: drive spends 27-43% of the rear circle laterally
while the load transfer it causes hands the rear axle 12-21% more vertical load.

My own nine kill-controls, 6 s of full lock + full throttle at 250 km/h, peak slip / share drifting:

```
baseline AFTER                        29 deg/s | 5.0 deg | 0%
stabilityAssist 2.6 -> 0              29 deg/s | 5.0 deg | 0%     <- the real yaw servo, inert
spinDamp 6.0 -> 0                     29 deg/s | 5.0 deg | 0%     <- the over-rotation ceiling, inert
both servo terms 0                    29 deg/s | 5.0 deg | 0%     <- inert together, so not redundancy
intent gate takes throttle            29 deg/s | 5.0 deg | 0%     <- the drift state cannot even be armed into existence
driveSplitRear 0.65 -> 1.00           29 deg/s | 5.0 deg | 0%
load transfer OFF (transferCap 0)     29 deg/s | 5.5 deg | 0%     <- removing the gain barely moves it
delta = mechanical lock               53 deg/s | 5.2 deg | 0%     <- more YAW, no more SLIP
muRear 2.32 -> 1.60 (rear made WEAK)  19 deg/s | 3.4 deg | 0%     <- weaken the rear and peak slip goes DOWN
```

The last row is the second ceiling the builder names, and it is the more interesting half of their
disclosure: `delta` (`physics.js:842`) is an **inverse-model output** solving for the steer angle that
achieves `rTarget`, and `rTarget` is itself grip-limited by `aLatMax`. Make the rear tyre worse and the
whole car's target rate falls with it, so the player cannot ask the front axle for more slip than the
grip-limited rate needs. Handing `delta` the mechanical lock buys 53 deg/s of yaw and still only 5.2 deg
of slip. **No lever inside this model produces a power-on breakaway**, and the routed finding — a
single-track model has no track width, therefore no driven-axle left/right tractive split, which is the
dominant real source of power-on oversteer — is the correct diagnosis and correctly named as a piece of
work rather than a constant. It is also the right call not to have shipped an unsourced `powerYawGain`;
that would have been `driftFlick` again in a new place, and this project already carries one of those.

## 5. WHAT ROUND 2 WON, RE-CHECKED. All of it survives, LIVE, on the round-2 critic's own tool.

Run unmodified, all ten sections, zero console or page errors across the whole session:

- **THE SIGN INVARIANT — the one automatic FAIL — PASSES in both directions.** `D` displaced the car
  **+51.7 m** along screen-right, `A` **-77.0 m**; `up.carLeft` **+0.11709 (D)** / **-0.11827 (A)**, so
  the body banks AWAY from the turn centre both ways. Body roll peaks **6.47 / 6.98 deg**. From world
  matrices, in the live page.
- **The three drift orderings all HOLD, on both bars**, off three matched entries (25.5 / 25.4 / 25.5
  deg): centred **2.22 s** half-peak / **2.85 s** over 10 deg; tapped **2.68 / 3.23** (LENGTHENS);
  held **0.78 / 0.82** (ENDS). Round 2 measured 2.22 / 2.72 / 0.80. This is the win the round-3 change
  could most easily have broken — it moves the same servo — and it did not.
- **The e-brake is monotone in hold time at every speed and never accelerates the car**: -27/-70/-93%
  at 80 km/h, -20/-51/-81 at 130, -19/-44/-67 at 200, -20/-43/-63 at 250, at 1/2/3 s, with 59-105 deg/s
  of yaw against 28-48 for the same corner without it.
- **The passive boost refill is still gone** — see section 6, where I re-establish it the hard way,
  because the traffic join makes the round-2 test ambiguous.
- The wall still tiers (77% kept at 10 deg, 25% at 45 deg), the chase rig **leads the car in 0 of 228
  samples**, the single brake tap now holds 2.50-2.53 s at 13.4-14.0 deg (round 2: 1.53-2.05 s at
  8.0-9.5 deg), and `node tools/handling-measure.mjs` reports **40 HIT / 1 MISS / 7 measured-only** with
  the one MISS the stale passive-refill target the round-2 brief itself ordered deleted. `bash
  tools/lint.sh` reports `lint ok`.

## 6. THE THREE JOINS AT `68c093b`. All three verify, and one of them needed a new test.

**(1) BOOST IS EARNED FROM TRAFFIC EVENTS AND NOT ON A TIMER — verified with an A/B/A.** The join is
live: the game calls `traffic.drainEvents()` **90 times in 1.5 s**. But the round-2 test for a passive
refill is now ambiguous, because 20 s of held W at 250 km/h through normal traffic fills the bar to
**0.5890** — which is either the defect returning or the join working. So I drove **one kilometre** of
held throttle three times, counting the events fed to physics without consuming them:

```
road EMPTIED (setPool 0)  : 1000 m in 13.5 s -> bar 0.0000 -> 0.0000 | 0 events            | POOL 0
normal traffic (setPool 30): 1001 m in 13.6 s -> bar 0.0000 -> 0.2932 | 7 events {nearMiss:7} | POOL 30
road EMPTIED again        : 1000 m in 13.5 s -> bar 0.0000 -> 0.0000 | 0 events            | POOL 0
```

**A kilometre of driving with nothing to nearly miss buys exactly nothing, twice.** 7 near misses buy
0.2932 of a bar, i.e. a full bar costs about 24 events, matching the driver's own figure. Not a timer,
not an odometer.

**(2) A SEVERE CONTACT REACHES `crash.js`.** Driving into the biggest downtown facade at 250 km/h:
square-on, peak impact 0.96, **`crash.active` reached true and `state.crashed` reached true**; 45 deg
off, impact 0.92, both true again. `STATE.md` records that `physics.js` never asserts `state.crashed`
and `crash.js:2340` owns it, so `state.crashed` going true IS the proof that the wreck payload crossed
the join. **Negative control: 5 s of clean highway leaves `crash.active` false and `state.crashed`
false**, so the join is not firing on nothing. Corroborating detail from the round-2 critic's tool: its
own `drainWreck()` poll now returns **0** wrecks where round 2 saw them published, because `main.js`
drains the queue first — the join is consuming the queue, which is what it is for.

**(3) `carRoot.rotation.y` IS THE HEADING.** Through a deep e-brake slide, 212 live samples, peak
slipAngle 25.5 deg: **max |`carRoot.rotation.y` - `s.yaw`| = 0.0000 deg.** The old `- s.slip * 0.22`
term is gone; at this peak it would have been worth about 12.5 deg of drawn nose, with the wrong sign.
The round-2 critic's section 7 shows the consequence independently: `rig - yaw` and `rig - drawnNose`
are now **identical at every sample** (max 11.8 deg of readable lag, where round 2 measured 5.3 deg and
the wrong sign at peak slip). This closes the round-2 critic's finding 4 and the verify pass's ranked
item 4.

## 7. FINDINGS, RANKED, each with a repro

**1. THE SHIPPED COMMENT AND THE HONEST-MISS SECTION QUOTE THE WRONG VARIANT'S NUMBER FOR THE ONE
THING THE BRIEF ASKED FOR.** `physics.js:1039-1043` says zeroing `driftFlick` leaves beats 3-6 at
"8.5-8.7 deg" out of "16.1 deg". At HEAD it is **6.4 deg out of 14.9**. The correct figure is in the
builder's own log. Consequence: the tyre-model-sourced depth of the chain went **8.6 -> 6.4 deg this
round** (attributable by kill-control to the `proRotation` gate: `driftFlick 0 + gate OFF` reads
8.3-8.4 deg), which is a real if small regression on the one axis the brief said to measure, and the
comment hides it. **Fix is a two-line comment correction plus one line in the miss list; no constant
should move for it.** Repro: `node tools/_hr3c.mjs 2`.

**2. `driftFlick` IS STILL A SCRIPTED ROTATION AND IT NOW SUPPLIES 57% OF THE CHAIN'S DEPTH, UP FROM
46%.** No longer free energy — that is genuinely and algebraically closed — but a one-substep
instantaneous rotation of the velocity vector is still not a force, and the round-2 critic's 10 deg
per-beat bar is cleared only with it on (6.4 deg with it off). The builder declined to buy the depth
back out of `driftAngularDamping` / `driftYawAuthority` / `steerServoDrift` because those are the three
orderings' own constants, and I agree with that reasoning: trading a measured pass for an unmeasured
one would be worse. **This is the fourth round on this term. It is now the single largest unsourced
quantity in `physics.js` and it should be either sourced or declared permanent, not carried a fifth
time.** Repro: as above.

**3. BRAKE + LOCK STILL UNDER-ROTATES THROTTLE + LOCK AT 200-250 km/h IN THE FIRST 400 ms** (+6.4 vs
+10.0 and +5.3 vs +9.6 deg live). It is no longer inverted, no longer a dead zone, and past the
unbraked car by 800 ms (+23.5 vs +22.0, +24.7 vs +20.9). Disclosed by the builder. Repro:
`node tools/_hr3c-live.mjs 1`.

**4. A HELD BRAKE AT FULL LOCK STILL ENDS IN A SPIN, AND IT IS PRE-EXISTING.** 2 s of brake + full lock
after 0.5 s of load reaches **72.9 deg of slip at 130 km/h BEFORE and 73.1 deg AFTER**, with worst yaw
-138 deg/s on both. Live at 800 ms, worst wrong-way yaw -54 / -25 deg/s at 100 / 130 km/h. Round 2
disclosed it, round 3 disclosed it, neither fixed it, and my kill-controls confirm round 3 neither
helped nor hurt it. It is the last thing on the trail brake worth a round. Repro:
`node tools/_hr3c.mjs 5`, section (c).

**5. NO POWER-ON GRIP EDGE, THIRD ROUND — and I am recording it as a CORRECT DISCLOSURE rather than a
miss**, per the brief. Nine kill-controls of mine and eleven of theirs are inert; the demand/capacity
table and the coasting-rotates-harder result explain why. The routed model finding (a single-track
model has no lateral load transfer and no driven-axle tractive split, so it can have neither a real
Scandinavian flick nor real power-on oversteer) is one finding covering both open items and it is the
right level of abstraction. Repro: `node tools/_hr3c.mjs 4`.

**6. Minor, recorded so nobody re-derives it: `driftRefFloor` cannot be kill-controlled by setting it
to 1.** `floorFade` goes to 1 there, i.e. the floor becomes permanently fully ON, and the resulting
numbers look inert when they are the opposite. Delete the ternary instead. I lost time to this; the
next reader should not.

## 8. WHAT I CONFIRM WITHOUT RESERVATION

- The conservation fix, metered at the line by me: **6.2173 -> 0.0000 m/s**, zero algebraically.
- The inverted-response diagnosis, the signed-heading argument behind it, and **both** halves of the
  repair, each deleted alone, with BOTH deleted reproducing `68c093b` to the decimal.
- The structural-limit disclosure for the power-on edge, re-derived from inside `substep()`.
- `game/camera.js` byte-identical; `gripUse` untouched at 0.85; every one of the fifteen constants the
  builder lists as unchanged verified at its declaration line.
- The builder's self-catch on `driftRefFloor` 2.0 -> 1.5, which my own sweep reproduces (ordering 2 on
  the fixed 10 deg bar: 2.87 s against a centred 2.89 s at 2.0, 3.34 s at 1.5).
- The regression gate: the builder's claim that all seven presets are identical on every `_px.mjs`
  statistic is consistent with the mechanism they give for it — all three changes sit inside
  `if (handbrake) ... else if (state.drifting)` or are gated on `state.drifting`, and the shot presets
  never enter the drift state. I did not re-render; I edited no game code, so the gate is not mine, and
  their per-channel figures (5-270 channels of 3.69 M, max 15/255) sit inside `STATE.md`'s documented
  determinism caveat.
- Zero console and page errors across every scripted session of mine, `lint ok`, `handling-measure.mjs`
  40 HIT / 1 MISS / 7 measured-only.
- The three joins at `68c093b`, all three, with a negative control on each of the two that could fire
  on nothing.

## 9. ROUTED

To **`game/physics.js`** (next round, its own file):

1. Correct the comment at `physics.js:1039-1043`: `driftFlick 0` gives **6.4 deg** out of a **14.9 deg**
   chain at HEAD, not 8.5-8.7 out of 16.1. Finding 1.
2. `driftFlick` (`:373`) — source it or declare it permanent. Fourth round. Finding 2.
3. The held-brake spin (73 deg of slip in 2 s at 130 km/h) is the last live trail-brake defect.
   Finding 4.

To **whoever owns the model next**: I endorse the builder's routed finding verbatim. This is a
single-track model with zero track width, so it has neither lateral load transfer (the physical source
of a Scandinavian flick, i.e. `driftFlick`'s missing degrees) nor a driven-axle left/right tractive
split (power-on oversteer). Both open items reduce to that one absence. The number it must supply is
measured: **rear demand/capacity has to cross 1.0 on throttle and it currently sits at 0.77-0.78 at
every speed from 100 to 250 km/h against 0.86 coasting.**

To **any future turn-in instrument**: I second the builder's routed finding and I found the same thing
independently. An **unsigned** heading metric is not a metric — it scored a car spinning away from the
corner at 92 deg/s as a car turning into it, and it hid an inverted response through a builder round, a
critic round and a verify pass. Report the signed heading **and** the worst wrong-way yaw rate
separately, always.

To **`docs/BURNOUT-HANDLING.md`** (not my file): section 9.1 still says `TUNE.vMax = 78` "sits inside
the real 177-201 mph band". 78 m/s is 174.5 mph, below it. **Fifth round this has been routed.**

To **`tools/progress.mjs`**: the session driver fixed the PLAY table keys at `8bbbf77`, so the round-1
key complaint is closed; I ran `node tools/progress.mjs` as my last step and my block is picked up.

---

## 10. VERDICT

**VERDICT: PASS. Two of the three open items are closed at the mechanism, the third is closed as a
correct disclosure, every round-2 win survives, all three of the driver's joins verify, and there is
one bad comment.**

Item 1 is fixed and fixed for the right reason. I metered the flick line myself and the injection
created **6.2173 m/s of ground speed out of nothing** where the shipped rotation creates **0.0000** —
zero algebraically, because a rotation is norm-preserving, so no later retune can bring it back. That
matters more than it sounds: `state.ground` is the speedometer and the engine note.

Item 2 is fixed, and the builder found a defect that was four times worse than the brief described and
that two previous instruments could not see. From dead straight at 250 km/h the pre-round-3 file swept
**14.2 deg of heading the WRONG WAY at up to 92 deg/s** with a peak correct-way yaw of 1 deg/s. I wrote
my own signed probe before reading their reasoning and reproduced every figure, including both halves
of the repair deleted separately and both deleted together reproducing `68c093b` to the decimal. Live,
brake + lock at 130 km/h now sweeps **+12.2 deg against throttle + lock's +12.2**, from the brief's 2.8
against 11.9, with zero wrong-way yaw at any speed — and it does not buy that with rotation the player
did not ask for: a straight-line brake still yaws 0.000 deg.

Item 3 is a correct disclosure and the brief says to score that as a pass, so I do, plainly. I attacked
it with nine kill-controls of my own including the two the builder nominates as the real servo, and
every one is inert on peak slip. Then I instrumented the rear friction circle from inside `substep()`
and the disclosure's central claim is true: demand/capacity is **0.77 on throttle against 0.86
coasting**, and coasting rotates the car at **76 deg/s against 35 on throttle** at 130 km/h. Power in
this model is a rear-grip gain. Declining to ship an unsourced power-yaw term was the right call.

Round 2's wins all survive, measured live on round 2's own unmodified tool: the sign invariant passes
both directions from world matrices, the three orderings hold on both bars (2.22 / 2.68 / 0.78 s and
2.85 / 3.23 / 0.82 s), the e-brake is monotone at four speeds and never accelerates, and the passive
refill is gone — which I had to re-establish the hard way, because the new traffic join means a bar
that fills while you hold W is no longer evidence of a timer. A kilometre of held throttle with the
road emptied earns **0.0000**, twice; the same kilometre with 30 cars earns **0.2932** off 7 near
misses. The wreck join reaches `crash.js` on both wall angles with a clean negative control, and
`carRoot.rotation.y - s.yaw` is **0.0000 deg** across a 25.5 deg slide.

What keeps this from being flawless is one comment, and it is the specific failure rule 5 was written
for. `physics.js:1039-1043` says that zeroing `driftFlick` leaves the chain's beats at 8.5-8.7 deg out
of 16.1; at HEAD it is **6.4 out of 14.9**, the right number is in the builder's own log, and the wrong
pair is repeated in the verdict's honest-miss list and in the commit message. It matters because it is
the answer to the brief's own item-1 question: the honest, impulse-free chain is **reachable but not
deep** — 69% of samples in the drift state, earned by the tyre model, at 6.4 deg of slip, which is
round 1's dead value — and the tyre-model share went *down* 2.2 deg this round. The builder's paired
disclosure ("the headline number went DOWN and the critic is entitled to weigh that") is honest about
the direction and wrong about the size.

**Ranked, for the next brief:** (1) correct the `driftFlick` comment and the miss list to 6.4 / 14.9;
(2) `driftFlick` is now 57% of the chain's depth and unsourced for a fourth round — source it or
declare it permanent; (3) the held-brake spin at 130 km/h, 73 deg of slip in 2 s, pre-existing and
twice disclosed; (4) the power-on edge and the flick are ONE piece of work in the model, not two
constants, and the number it has to supply is measured; (5) `docs/BURNOUT-HANDLING.md` section 9.1,
fifth routing.
