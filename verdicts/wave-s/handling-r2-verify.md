# wave-s/handling-r2-verify

I am the VERIFY pass on `handling-r2` after the repair round (`748e11c`).
Fresh context.
I did not write the code and I did not write the round-2 critic verdict I am checking against
(`verdicts/wave-s/handling-critic-r2.md`).
I edited no game code: only this file, my three instruments and their four raw logs.

I ran CONCURRENTLY with peers - a peer's uncommitted `game/main.js` shader-warm edit is in the tree -
so **I took no frame-time number at all**, not even a smoke test.
Everything below is a slip angle, a yaw rate, a heading, a drift duration, a speed ratio, a boost
quantity or a world-matrix reading, none of which is contended.

Render size for every live figure, verbatim from `ctx.renderSize()`:
`{"w":1280,"h":720,"cssW":1280,"cssH":720,"pixelRatio":1,"devicePixelRatio":1}`.

## METHOD, in the order I did it

1. **Constants against `git diff` before anything else** (rule 5). `git show 748e11c -- game/physics.js`.
2. **Re-ran the ROUND-2 CRITIC's own instrument, `tools/_hcr2-drive.mjs`, UNMODIFIED**, all ten
   sections, against the repaired HEAD. That is the strongest available re-derivation: it is not the
   builder's tool, it is not mine, and every number in the verdict I am auditing came out of it. It
   writes to `verdicts/wave-s/handling-critic-r2-drive.txt`, so I copied its output to
   `handling-r2-verify-drive.txt` and restored the critic's log with `git checkout --`; `git status`
   shows it unmodified.
3. **My own kill-controls**, `tools/_hr2v.mjs`, because `tools/_hcr2-kill.mjs` cannot be re-run
   unmodified: two of its anchors are `gripUse: 0.95` and `driftEnterRatio: 1.0` and the repair
   reverted both, so it throws `ANCHOR MISSING` by construction. Same technique (patch a COPY of
   physics.js on disk and import it, because `CD` and `POWER_BOOST` are module-scope), my own anchors.
   It loads the pre-repair module straight out of `git show 68d7547:game/physics.js`, so every BEFORE
   column here is the real pre-repair file and not an approximation of it.
4. **My own adversarial probes** for the thing the repair's own success creates and neither the
   builder nor the critic had to test: `tools/_hr2v2.mjs` (does the new instant entry fire on ordinary
   braking) and `tools/_hr2v-live.mjs` (the same question through the real key listeners).

| my file | what it does | log |
|---|---|---|
| `tools/_hr2v.mjs` | 7 kill-controls, pre-repair vs shipped, chain / tap / orderings / gripUse sweep | `handling-r2-verify-kill.txt` |
| `tools/_hr2v2.mjs` | the new entry vs ordinary braking, with attribution copies | `handling-r2-verify-entry.txt` |
| `tools/_hr2v-live.mjs` | trail brake and turn-in, LIVE, real `KeyboardEvent`s through `main.js` | `handling-r2-verify-live.txt` |
| (the critic's tool, unmodified) | all ten of its sections at HEAD | `handling-r2-verify-drive.txt` |

```progress-metrics
chain drift, 6 beats at 130 km/h, LIVE real keys: 17.7 deg peak / 57% of samples drifting (critic measured 6.2 deg / 0%) FIXED
chain per beat, headless, beats 3-6: 16.2 deg at 69% drifting (pre-repair 6.0-6.6 deg at 0%) FIXED
of that 16.2 deg, driftFlick supplies 7.5: with driftFlick 0 the beats are 8.5-8.7 deg, i.e. under the critic's 10 deg bar
drift orderings, LIVE: 2.22 / 2.77 / 0.78 s centred / tapped / held (critic 2.22 / 2.72 / 0.80) HELD
turn-in from straight at 130 km/h, LIVE: S+D sweeps 2.8 deg of heading in 400 ms vs 11.9 deg for W+D - NEW REGRESSION
power-on grip edge at 250 km/h, LIVE: 28-29 deg/s, peak slip 4.9 deg, 0% drifting - STILL NO EDGE, third round
constants verified against git diff: gripUse 0.95 -> 0.85, driftEnterRatio 1.0 -> 1.4, driftBreakRatio new 1.0, driftTapLinger new 0.35
```

---

## 1. RULE 5 FIRST: THE CONSTANTS ARE REAL. This is not a comment-only repair.

Every constant the builder's change list claims is in `git show 748e11c -- game/physics.js` as a
`-`/`+` pair on the declaration line, and the file at HEAD reads the claimed value:

| file:line at HEAD | BEFORE | AFTER | in the diff |
|---|---|---|---|
| `game/physics.js:223` `gripUse` | `0.95` | **`0.85`** | yes, `-  gripUse: 0.95,` / `+  gripUse: 0.85,` |
| `game/physics.js:433` `driftEnterRatio` | `1.0` | **`1.4`** | yes |
| `game/physics.js:474` `driftBreakRatio` | did not exist | **`1.0`** | yes, added |
| `game/physics.js:487` `driftTapLinger` | did not exist | **`0.35`** | yes, added |
| `game/physics.js:850-851` | did not exist | `fyRearDemand` + `rearBroke` | yes |
| `game/physics.js:853` entry test | `rearSlip > satSlip * driftEnterRatio && intent` | **`(rearSlip > satSlip * driftEnterRatio \|\| rearBroke) && intent`** | yes |
| `game/physics.js:867` | did not exist | `if (rearBroke && intent) driftHold = TUNE.driftMinHold;` | yes |
| `game/physics.js:990` flick | `if (state.drifting) state.vLat -= ...` | **`if (state.drifting && Math.abs(slipNow) > satRear * 0.5)`** | yes |
| `game/physics.js:1026/1046-1048` tap | inline `const tap = clamp(brake/…)` | latched `tapCmd`, `steerFrac`-scaled `tapWant`, one-sided `tapOut` | yes |
| `game/physics.js:1085-1086` | `yawAccel -= …authority * tyreMoment * (1-gather)` | **`* (entering ? 0 : 1)`** | yes |

The four comment/constant mismatches the critic found in its section 4(c) are corrected **in place, at
the constant**, and I read all four: `:209-222` now states the measured 0.85/0.95/1.00 sweep and its
own retraction (it no longer says "-> 1.00" or "39 deg/s"); `:330-335` says "0.80 -> 6.00" against
`driftStabilityAssist: 6.00` at `:336`; `:338-354` quotes the real 3.92/2.35/1.97/1.34/1.13 s sweep and
says outright that 0.60 gives 1.13 s, not 1.57; `:365-370` says "At the shipped 0.60 s" against
`driftCounterGather: 0.60` at `:374`. The inert-attribution finding 4(b) is corrected at `:872-880`,
which now credits `driftExitRatio: 1.0 -> 0.7` and tells the next reader to go to the ratio and not to
the `sideways` line. **Rule 5 is satisfied and the worst outcome available in this project did not
happen.**

## 2. FINDING BY FINDING, the critic's section 5 and section 4, re-run by me

| # | the critic's finding | my own measurement at HEAD | verdict |
|---|---|---|---|
| **1** | the chain drift is NOT fixed: 6.2 deg / 0% drifting, beats 3-6 dead at 6.0 deg / 0% | LIVE, critic's tool unmodified, section 3: **17.7 deg peak, 57% of samples drifting**, 128 -> 161 km/h. Per beat (its section 10): **9.1 / 20.8 / 16.0 / 16.2 / 16.2 / 16.1 deg at 98 / 70 / 68 / 68 / 68 / 68%** against its 9.6 / 15.8 / 6.6 / 6.1 / 6.0 / 6.1 at 92 / 52 / 0 / 0 / 0 / 0%. Headless, pre-repair module vs shipped: 6.6/6.0/6.1/6.1 deg at 0% -> **16.2 deg at 69% on every one of beats 3-6** | **FIXED** (see finding A for what half of the angle is) |
| **2** | still no power-on grip edge; revert `gripUse` to 0.85 | constant reverted (verified above). The edge is still absent: LIVE 6 s of held lock at 250 km/h gives **28-29 deg/s, peak slip 4.9 deg, 0% drifting**; my own sweep reproduces the critic's to the decimal - 0.85 / 0.95 / 1.00 -> 28-29 / 31-32 / 32-33 deg/s, peak slip 5.0 / 5.5 / 5.8 deg, **0% drifting at every value** | **RECOMMENDATION HONOURED, FINDING NOT FIXED** |
| **3** | ordering 2 is bought with a lateral-velocity teleport, and it is free energy | biggest one-frame ground-speed gain on the tap **+2.79 -> +1.15 km/h** (the flick floor's side effect, as disclosed), but peak `accelG` **16.1 -> 20.4 m/s^2**, i.e. worse. The mechanism is untouched: `physics.js:990` still adds to `state.vLat` directly | **NOT FIXED, disclosed** - and the exposure GREW, see finding A |
| **4** | the camera is neutral against the DRAWN nose, wrong sign at peak | LIVE, critic's section 7: rig leads the physics yaw in **0 of 229 samples**, max lag 11.9 deg, but max \|rig - drawn nose\| is **6.4 deg** and it is **+1.9 deg (wrong sign) at the 33 deg peak** | **NOT FIXED, correctly routed to frozen `main.js:363`** |
| **5** | the boost join is missing, so the shipped game earns boost from drift alone | `traffic.drainEvents()` exists, `physics.setEventSource` exists and pays (20 nearMiss at intensity 1.0 -> bar 1.0000), 20 s of held W from empty -> **0.0000**, and **nothing calls `setEventSource`** | **NOT FIXED, correctly routed (frozen `main.js`)** |
| **6** | after a graze the car stays pinned to the wall | 10 deg from the face: 243 -> 186 km/h (**77% kept**) and **38 km/h 3.7 s later**. Tiers 77 / 52 / 20 / 1% at 10 / 20 / 45 / 90 deg | **NOT FIXED, disclosed, identical to the critic** |
| **7** | minor: held lock carries through zero to a settled -3 to -5 deg | trace C: `26 32 28 16 -0 -3 -3 -4 -4 -4 -4` | **unchanged, as before** |
| **4(a)** | `driftEnterRatio` should go back to 1.4: at 1.4 the tap is deeper and holds 41-47% longer | reverted to 1.4 as asked, **and it is now INERT**: one 200 ms tap at 100/130/150 km/h measures `peak 9.5 / 8.4 / 7.9 deg, held 2.08 / 1.70 / 1.51 s` at **1.4 and at 1.0 identically**, and the chain is identical too, because `rearBroke` arms first | **CONSTANT REVERTED; THE FINDING IS SUPERSEDED**, and the builder says so |
| **4(b)** | the `sideways` exit term is inert; `driftExitRatio` is the load-bearing half | comment corrected at `:872-880`, constant unchanged | **FIXED as a comment, correctly** |
| **4(c)** | four comment/constant mismatches | all four corrected in place, quoted in section 1 | **FIXED** |

Everything else the critic confirmed still holds at HEAD, measured with its own tool: the **sign
invariant** (D +53.3 m screen-right, A -77.2 m; `up.carLeft` +0.11687 / -0.11762, banks away from the
turn centre in both, so there is **no automatic FAIL**), body roll **6.46 / 6.90 deg** peak, the
**e-brake** monotone down at 80/130/200/250 km/h (-26/-70/-93, -20/-51/-81, -19/-44/-67,
-20/-43/-63% at 1/2/3 s) and never faster than entry with 59-105 deg/s of yaw against 28-48 without,
the three **orderings** at **2.22 / 2.77 / 0.78 s** (its 2.22 / 2.72 / 0.80), `handling-measure.mjs` at
**40 HIT / 1 MISS / 7 MEAS** with the one MISS the stale passive-refill target, `bash tools/lint.sh`
`lint ok`, and **zero console or page errors** across every scripted session of mine.

## 3. THE MECHANISM. Single-point, and it survives its own kill-control.

`tools/_hr2v.mjs` section 2 - force `rearBroke` false, change nothing else:

```
PRE-REPAIR      : 9.7deg/93% | 15.6deg/50% | 6.6deg/0% | 6.0deg/0% | 6.1deg/0% | 6.1deg/0%
SHIPPED         : 8.9deg/100% | 20.6deg/69% | 16.2deg/69% | 16.2deg/69% | 16.2deg/69% | 16.2deg/69%
rearBroke=false : 10.3deg/85% | 18.6deg/50% | 6.2deg/0% | 6.3deg/0% | 6.3deg/0% | 6.3deg/0%
```

One predicate takes beats 3-6 from 6.3 deg / 0% to 16.2 deg / 69% and killing it puts them back.
The claimed cause is the real one. My chain function was written from the research doc's wording, not
copied, and it reproduces the critic's headless pre-repair row (9.7/93 | 15.6/50 | 6.6/0 | 6.0/0 |
6.1/0 | 6.1/0) **digit for digit**, which is how I know my instrument and its instrument agree.

The three supporting changes are each separately load-bearing, deleted one at a time (section 3 of my
log): the re-arm is worth 69% -> 54% of samples drifting; the one-sided tap floor is worth 1.70 ->
1.54 s of hold at 130 km/h; leaving the tyre moment uncancelled while entering is worth 16.2 ->
14.4 deg and 1.70 -> 1.38 s. And the builder's own self-caught defect reproduces: removing the flick
floor drops the e-brake entry from **22.8 to 16.0 deg** and ordering 1 from 2.37 to 2.19 s.

The critic's confirmed mechanism for ordering 1 is untouched and still survives its kill-control:
swapping `rHold` back for `rTarget` collapses the centred hold **2.37 -> 0.57 s**.

## 4. MY OWN FINDINGS, ranked. Both are new; neither is in the critic's verdict.

**A. ABOUT HALF THE CHAIN'S HEADLINE ANGLE IS `driftFlick`, THE UNSOURCED IMPULSE - so the critic's
own "above 10 deg" bar is passed by a scripted lateral-velocity injection and not by the tyre model.**
In an ALTERNATING chain every beat's steering is opposite lock to the slide that is still live, so
`physics.js:990` is paid on every beat. Kill-control, `driftFlick: 0.18 -> 0`, nothing else
(`tools/_hr2v.mjs` section 7):

```
shipped      : 8.9 | 20.6 | 16.2 | 16.2 | 16.2 | 16.2 deg   peak |vLat| 11.55 m/s
driftFlick 0 : 8.9 | 13.5 |  8.5 |  8.6 |  8.7 |  8.7 deg   peak |vLat|  7.40 m/s
```

The drift STATE is unaffected - 69% on every beat either way - so the blocker as the critic stated it
("0% of samples in the drift state") is genuinely closed by `rearBroke` alone, and the builder's
single-point claim is true **of the state**. But the number that was reported is the ANGLE, and 7.5 of
its 16.2 deg comes from the impulse. Without it beats 3-6 sit at 8.5-8.7 deg, i.e. **below** the
critic's "all six beats above ~10 deg" bar. The builder's honest-miss list discloses `driftFlick` as
unsourced and says it did not address it; what is not disclosed is that the new chain leans on it
harder than anything before did. Repro: `node tools/_hr2v.mjs`, section 7.

**B. A NEW FEEL REGRESSION, ON THIS WAVE'S OWN BAR: press the brake and the steering together and the
car will not turn for the first ~0.4 s.** Because the new predicate is answered instantly, the drift
state arms at 0.5 deg of slip, which hands the yaw dynamics to the drift servo (`driftStabilityAssist`
6.00 tracking `rHold + tapOut`, a reference that holds the angle the car has *now*, approached at a
bounded rate) instead of to the driver's requested rate. LIVE, real keys, from dead straight
(`tools/_hr2v-live.mjs`):

```
130 km/h W+D 400 ms: heading 11.9 deg | peak yaw 35 deg/s | peak slip 3.4 deg | drift  0%
130 km/h S+D 400 ms: heading  2.8 deg | peak yaw 26 deg/s | peak slip 1.6 deg | drift 96%   <- 24% of the heading
130 km/h S+D 800 ms: heading 14.2 deg | peak yaw 39 deg/s | peak slip 14.3 deg | drift 98%  <- then it blows out
100 km/h S+D 400 ms: heading 11.8 vs 15.0 deg for W+D      200 km/h S+D 400 ms: heading 7.8 vs 10.1 deg
```

Attribution is clean and it is the new predicate, not the reverted `gripUse` (`tools/_hr2v2.mjs`
section E, headless, 130 km/h, 0.4 s of brake at full lock):

```
SHIPPED           : peak yaw 22 deg/s | peak slip 1.9 deg | heading  0 deg
rearBroke killed  : peak yaw 51 deg/s | peak slip 8.6 deg | heading 11 deg   <- the predicate
gripUse 0.95 only : peak yaw 23 deg/s | peak slip 1.8 deg | heading  0 deg   <- not gripUse
PRE-REPAIR        : peak yaw 44 deg/s | peak slip 8.6 deg | heading 11 deg
```

It is a dead zone at the START of the input, not a permanent loss - by 800 ms the braked car is past
the unbraked one - and it is worst at 130 km/h and mild at 100 and 200. It also does not fire on a
straight-line brake at any speed (0% armed at 80/130/200/250, because `ayDemand ~ 0`), nor on lift-off
(`intent` is false), which are the two ways it could have been much worse. But "dab the brake mid-turn
and the car briefly refuses to rotate" is the same class of complaint as the user's original "the
handbrake adds no rotation", and it did not exist before this commit. Repro:
`node tools/_hr2v-live.mjs`, second section; `node tools/_hr2v2.mjs`, sections B and E.

**C. Recorded, not scored: `state.drifting` no longer means "sideways".** At 130 km/h a 0.4 s brake dab
at 0.2 lock puts **98 of 98** drift-state samples under 2 deg of slip, where the pre-repair file had
zero drift samples at that input. I checked what consumes it before scoring it: **nothing outside
`physics.js` reads `state.drifting`** (grepped `game/`), and the boost earn is paid on
`driftAmount = |slipAngle| / slipRef` (`physics.js:1257,1302`), not on the flag, so a false arm earns
no boost. Its only cost is finding B. Worth knowing, because the next reader of `state.drifting` will
assume it means what its name says.

**D. Also unchanged and disclosed:** `state.vy` / airborne dead, `state.crashed` never set by this file
(`state.crashed false` on all four wall angles in my live run), the graze pin, the two 0.5/255 screenshot
moves. I opened `shots/s/r2fix-{BEFORE,AFTER}-daytime-downtown.png` myself: same framing, same light,
the car a few centimetres further down the same lane. **Nothing got worse**, so the regression gate
holds.

## 5. VERDICT

**VERDICT: PARTIAL - the blocker is genuinely closed at the mechanism, the constants are real, and
the repair introduced one new measured regression on the wave's own bar.**

The critic's blocking finding is fixed and fixed at the cause. Beats 3-6 of the published alternating
chain go from 6.0-6.6 deg at 0% of samples drifting to 16.2 deg at 69%, I reproduce that both live
through the critic's own unmodified driver (17.7 deg / 57% against its 6.2 deg / 0%) and headless
against the real pre-repair module, and forcing the one new predicate false puts every number back.
Both constants the critic's kill-controls refuted were reverted in the diff, all four bad comments and
the one bad attribution were corrected at the constant rather than argued with, and the builder's
disclosure list is accurate on every item I checked including two it scored against itself.

What stops this being a clean pass is two things I measured that nobody had. Half the chain's reported
angle - 7.5 of 16.2 deg - is `driftFlick`, the one-substep lateral-velocity injection that has now been
routed as free energy twice; with it zeroed the beats sit at 8.7 deg, under the critic's own 10 deg
bar, so the depth of the fixed chain rests on a scripted impulse rather than on the tyre model, and
that is exactly the shape of defect permanent rule 3 exists for. And the instant entry costs turn-in:
pressing brake and lock together at 130 km/h from straight sweeps 2.8 deg of heading in 400 ms against
11.9 deg for throttle and lock, live, with the drift state 96% on at 1.6 deg of slip - and killing the
predicate alone restores it, while reverting `gripUse` alone does not. Neither is a reason to revert
the repair: the chain drift is the thing the user cannot do at all, and it now works. Both are the
next round's first two items.

**Ranked for the next brief:** (1) rotate the velocity vector instead of adding to `vLat`, and re-measure
the chain's depth honestly afterwards; (2) the trail-brake dead zone - the drift servo should not take
the yaw over at 0.5 deg of slip, or `rSustain` should not be allowed below the driver's requested rate
while the angle is still small; (3) still no power-on grip edge, third round, and the levers are
`driveSplitRear` or `vMax`; (4) `main.js:363`, still the largest thing between the fixed drift and a
drift the player can see; (5) the boost join, one line in a frozen file, still unmade.
