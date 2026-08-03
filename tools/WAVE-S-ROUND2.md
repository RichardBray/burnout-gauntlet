# WAVE S, ROUND 2 — the addendum. Read `tools/WAVE-S-PLAY-BRIEF.md` FIRST, then this.

Round 1 shipped six pieces. Three of them are the reason this round exists:

- `handling` **FAILED its critic on feel** while passing on numbers.
  `verdicts/wave-s/handling-critic.md` section 6 is a ranked list of ten things that make the car
  least fun to drive, each with the file, the line and the measured value.
  **That section is the work list for this round.** Read it. Do not re-derive it.
- `traffic` PASSED but with seven named defects and a repro for each
  (`verdicts/wave-s/traffic-critic.md` section 7).
- `menu` PASSED with seven routed defects (`verdicts/wave-s/menu-critic.md` section 6, D1-D7), and
  the whole music half of the user's request was never built at all.

`perf` is NOT in this round's builder batch. Frame-time work runs alone, after this batch lands.

## OWNERSHIP. Three builders run CONCURRENTLY. Process rule 3 is now a hard partition.

| piece | OWNS, exclusively | may READ anything, may EDIT nothing else |
|---|---|---|
| `handling-r2` | `game/physics.js`, `game/camera.js`, and in `game/car.js` the body-roll scale at `:2336` and nothing else | — |
| `menu-music` | `game/music.js`, `game/menu.js`, `game/audio.js` | — |
| `traffic-r2` | `game/traffic.js` | — |

**`game/main.js` IS OWNED BY NOBODY THIS ROUND.** It was edited by the session driver at `da65fcf`
before you started, to land the three cross-file findings round 1 routed to it, and it is now
FROZEN. If your fix needs `main.js`, write it up as a routed finding in your verdict and stop.
Three of you are running at once and `main.js` is the one file all three would otherwise touch.

Already landed for you in `da65fcf`, so do not do these again:

- The HUD and the engine audio now read `s.ground`, not `s.speed` (critic item 7). If you change
  what `state.ground` means, you have changed the speedometer; say so.
- `frameStats.push` no longer saturates `over16_7pct`.
- `game/music.js` is imported, instantiated as a module-level singleton, exposed as `ctx.music`,
  and `m.unlock()` is called from the START-menu click. Its contract is in its own header.

## THE CROSS-FILE CONTRACT: THE BOOST EVENT STREAM. Two files, agreed here, not negotiated later.

Critic item 5: traffic is scenery, so the boost economy is fake. `boostEarnDanger` fills a bar in
28.6 s of just holding W, so boost arrives on a timer rather than as a reward, and Paradise has no
passive refill at all — every point of boost is near miss, oncoming, traffic check, air, takedown,
barrel roll or gas station.

This needs `traffic.js` to emit and `physics.js` to consume. The seam, binding on both builders:

**`traffic.js` grows a drain-on-read event queue.**

```js
// traffic.js
// Returns and CLEARS the events accrued since the last call. Never returns null.
// Each event: { type, amount, at: {x,z}, meta? }
//   type: 'nearMiss'   | passed within NEAR_MISS_R of a vehicle above a speed floor
//         'oncoming'   | ... while travelling against that vehicle's lane direction
//         'check'      | hero contact that shunts a vehicle without wrecking the hero
// `amount` is a 0..1 INTENSITY (how close / how fast), NOT a boost quantity.
// Choosing what a near miss is worth in boost is physics.js's business, not traffic's.
traffic.drainEvents()
```

**`physics.js` consumes it through its existing input path.** `physics.setInput()` is called from
the frozen `main.js`, so physics may NOT be handed the events by main. Instead:

```js
// physics.js
// Optional. If set, physics.step() calls it once per tick and folds the returned
// events into the boost bar. Left unset, behaviour is unchanged.
physics.setEventSource(fn)   // fn() -> array of events, as above
```

and **the wiring is one line that the session driver will add to `main.js` after both of you have
landed** — `physics.setEventSource(() => traffic.drainEvents())`. Build your half against the
contract above, verify your half in isolation, and say in your verdict that the join is pending.
Neither of you edits `main.js`. If `traffic.drainEvents` does not exist yet when `handling-r2`
measures, `setEventSource` is simply unset and nothing breaks — that is why it is optional.

`physics.js` must also cut the passive refill hard: Paradise has none. `boostEarnCruise` and
`boostEarnDanger` (`physics.js:131-132`) are the passive terms. A drift earn is legitimate
(Paradise pays for drift by distance-in-slide). State the new numbers and what a full bar now
costs the player in events.

## WHAT EACH PIECE HAS TO ACHIEVE

### `handling-r2` — the drift, and the four cheap wins behind it

The critic's own words: *"Items 1, 2 and 3 are one piece: the drift. If the user takes one thing,
take that."* In priority order, with the critic's own targets:

1. **A STEERABLE SLIDE.** Today a 34 deg entry halves in 0.63 s and holding full opposite lock
   keeps you sideways *longer* (0.68 s) than centring (0.63 s), which is backwards. Required
   orderings, all three of which must hold and be measured:
   - the slide **persists** through centred steering (Paradise's is self-sustaining),
   - a **tapped** countersteer (~0.15 s) **lengthens** it,
   - a **held** countersteer **ends** it.
   Knobs the critic identified: `driftStabilityAssist` (0.80), `driftAngularDamping` (0.40 — the
   critic's kill-control shows it is nearly inert, and it is Paradise's own governing attribute),
   the `damp(state.vLat, ...)` path, and `steerServoDrift` (0.30), which is still catching the
   slide the player asked for. **Measure the UNCLAMPED `slipAngle`, never `state.slip`** — the
   critic explains why in its section 3.
2. **THE BRAKE-TAP ENTRY MUST WORK IN PLAY.** Six beats of "tap brake, left, tap brake, right" at
   130 km/h currently gives peak 6 deg and 0% of samples in the drift state, so chain drifting —
   the technique the research doc says world records are set with — is unreachable. Note the brake
   authority cap of 0.6 lives in the FROZEN `main.js`; if you need the full circle, either make
   the drift entry not depend on brake magnitude above 0.6, or route it. Target: a 200 ms tap at
   100-150 km/h with a half second of load arms the drift and holds it long enough for the next beat.
3. **THE E-BRAKE.** +26% speed at 80 km/h, +8% at 130, -11% at 200, -86% at 250. And
   `physics.js:501-504` sets `driveRear = handbrake ? 0 : 0.65` then
   `fxFront = m*aDrive*(1-driveRear)`, so **holding the e-brake hands the front axle 100% of the
   engine**. A locked rear axle does not send its torque forward. Target: monotone speed cost with
   hold time at every speed, and no configuration in which the e-brake accelerates you. It must
   also produce real yaw — the user's original report is that the handbrake adds no rotation at all.
4. **ONE WALL COSTS 70% OF SPEED AND SIX SECONDS.** 231 -> 69 km/h off one building, then a slow
   climb back. Keep the good sub-8-deg tiering. The 20-deg-plus tier either becomes a real crash
   (`state.crashed` is never set by anything, so `crash.js`'s whole state machine is unreachable —
   that is critic item 10) or keeps enough speed to drive out of. Fix `hitNormalSpeed: 12`
   saturating so early that 20 deg and 90 deg are identical.
5. **UNDERSTEER WITH NO EDGE.** `gripUse = 0.85` puts ordinary cornering inside the tyres' linear
   range by construction, so six seconds of held lock at 250 km/h is a dead-flat 28-29 deg/s.
   Throttle should be able to rotate the car, and the yaw-rate servo should stop catching it.
6. **BODY ROLL IS 3.3 DEG** at full lean because `car.js:2336` scales by 0.05. This is the one
   line of `car.js` you own. It is the visual channel the slide currently lacks. Do not touch
   anything else in that file.
7. **THE CAMERA.** Round 1 did not settle it and the user's report stands: `camera.js:286` defines
   camera yaw as `s.yaw + slip*0.30`, so the camera always rotates FURTHER than the car, and the
   e-brake's slip multiplier widens the gap exactly when the player is asking for rotation.
   `docs/BURNOUT-HANDLING.md` has the researched chase-camera relationship; if it does not, measure
   it from the capture rather than guessing. A chase camera that LAGS the car's heading through a
   corner is what makes a slide readable.

Boost consumption of the event stream is yours too (see the contract above).

### `menu-music` — the soundtrack, the two volume controls, and D1-D7

The music half of the user's request was never built. Everything binding is in the contract header
of `game/music.js`, which the session driver wrote and you now own. In summary: three MP3s already
on disk in `game/music/`; music gets **its own AudioContext and its own gain straight to
`destination`**, never through audio.js's glue bus / limiter / reverb; it **persists across a scene
change** rather than restarting; it respects the same click-to-unlock gesture. The menu needs track
selection and skip, and **SEPARATE music and SFX sliders** — audio.js's existing master `setVolume`
becomes the SFX control.

Then the seven menu defects the critic found, `verdicts/wave-s/menu-critic.md` section 6:

- **D1** the res slider blanks the HUD until you resume, every time.
- **D2** `C` and `R` fire THROUGH the pause menu and wreck or reset the run.
- **D3** `SPACE` is listed as HANDBRAKE and the handbrake does not brake. Coordinate the *label*
  with what `handling-r2` is doing to the e-brake; the label is yours, the behaviour is theirs.
- **D4** keys held or pressed while a menu is open leak into the drive.
- **D5** holding `W` across a pause loses the throttle on resume.
- **D6** arrow keys do not move the sliders; both are mouse-only.
- **D7** the card clips in windows shorter than ~600 px.

Also: the user asked for a **scene picker** in both menus. If the current menu does not have one,
that is the largest gap in this piece — a scene change without a reload. If a scene change requires
`main.js` (it re-runs `boot()`), route it and say exactly what you need; do not edit `main.js`.

### `traffic-r2` — make the seven defects go away, and emit the event stream

`verdicts/wave-s/traffic-critic.md` section 7, each with a repro:

1. **Parking in a junction box locks the signal and freezes up to 9 cars.** `traffic.js:503-509`.
2. **Highway pop-in inside 120 m, about every 1.5 s.** `traffic.js:62`, `SPAWN_MIN = 62`.
3. **Cars vanish in plain sight ahead of you** at the ends of the road lines. `traffic.js:458`.
4. **Oncoming traffic does not react to a wrong-way hero at all.** `traffic.js:566-576`.
5. Hero drives THROUGH traffic — routed to `physics.js`, i.e. to `handling-r2`, not yours. Say so.
6. Traffic goes to 0 off-network. Recorded as not-a-defect; do not chase it.
7. Plus the event stream in the contract above. This is what turns your cars from scenery into the
   boost economy, and it is the highest-value thing in your piece.

**Also: `POOL` is `22` in your working tree and `56` at HEAD, uncommitted, with a comment claiming
the user asked for the cut.** Process rule 2 says an unmeasured inherited edit gets justified or
reverted, never inherited silently. The user's instruction was "cut the count hard", so the
direction is right. Decide the number on played evidence, say what you decided and why, and commit
it as yours.

## PROCESS, unchanged and enforced

Every rule in `tools/WAVE-S-PLAY-BRIEF.md` still binds. The ones that bite hardest here:

- **VERDICT-FIRST.** `verdicts/wave-s/<piece>.md` is the first file you write. `handling-r2` and
  `traffic-r2` write to `handling-r2.md` and `traffic-r2.md`; do not overwrite round 1's verdicts,
  the critics' evidence lives in them.
- **RULE 5: quote BEFORE and AFTER literal constant values with `file:line`.** Your report is
  checked against `git diff`, not read as prose.
- **A KILL-CONTROL, NOT AN ARGUMENT.** Delete the cause and measure before you claim it.
- **`lint ok` DOES NOT MEAN RUNNABLE.** Boot the page and check the console.
- **YOU ARE RUNNING CONCURRENTLY WITH TWO PEERS.** Therefore: **any frame-time number you take is a
  SMOKE TEST and you must label it as such.** Handling numbers, drift durations, yaw rates, event
  counts and audio assertions are all fine — they are not contended. fps is.
- **The regression gate still applies.** If your change can move a pixel, render the presets it
  could touch before and after, look at both, and state whether anything got worse.
- **COMMIT ONLY YOUR OWN FILES.** One commit, `wave-s/<piece>: <one line>`. Never `git add -A`.
- Finish with `node tools/progress.mjs` and one fenced `progress-metrics` block in your verdict.
