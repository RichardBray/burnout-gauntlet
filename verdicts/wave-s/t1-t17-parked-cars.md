# T1 - struck parked and stopped cars must actually move. And T17 - remove the C key.

Task source: `TASKS.md` T1 and T17, wave 1 agent A.
Files owned and touched: `game/traffic.js`, `game/physics.js` (collision resolver only),
`game/main.js` (the KeyC handler).
Probes: `tools/_t1-repro.mjs`, `tools/_t1-t17-check.mjs`.

## T1: the repro came first, and it overturned three of the four prime suspects

The user chose "reproduce in a browser at normal driving speed before fixing", and that was the
right call: the promotion path built in `fe15782`/`5d4a85b` is **not broken**. It fires. The
problem is that what it hands the car is far too small to see.

`node tools/_t1-repro.mjs` drives the real page at a real parked body at a held closing speed.
BEFORE any change:

| closing | promoted | moved |
|---|---|---|
| 3 m/s | **NO** | - |
| 6 m/s | yes | 0.43 m |
| 10 m/s | yes | 1.55 m |
| 20 m/s | yes | 10.10 m |

0.43 m at 6 m/s is, on screen, a car bolted to the road. That is the user's report, and it is an
impulse-magnitude defect, not a plumbing one.

### The four prime suspects, settled

1. **`hit.rel < 4` gate** - **CONFIRMED, and it is one of two causes.** It is why 3 m/s produced
   nothing at all. It was also testing the wrong quantity: `rel` is the full relative velocity
   including tangential scrub, not the closing speed that actually shoves.
2. **Population coverage** - **REFUTED.** `world.parkedCars` is 342 bodies with
   `parkedCounts {rank: 295, queue: 47, culled: 2}`. The kerbside STOPPED QUEUES go through the
   same `parkedCar()` constructor as the ranks (`world.js:2511`) and land in the same array, so
   both consumers see both populations. There is no second baked stationary population.
3. **Pool slot starvation** - **REFUTED in normal play.** A slot was granted on every single
   promotion across every run; the steal-the-farthest fallback never had to fail. Not raising
   `POOL`, and no wreck reserve added - neither is needed by the evidence.
4. **`b.hide` missing** - **REFUTED.** 342 of 342 bodies carry a `hide()` closure.

So suspect 1 is real, and the rest of the defect is the impulse formula itself.

## The fix

### `physics.js` - the stamp now carries contact GEOMETRY, not just relative velocity

`hitCarBody()` stamped `{rel, sev, kx, kz}`. `(kx, kz)` is the full relative velocity, which
cannot distinguish a square hit from a corner clip, so every promoted car got the same push. Added
to the stamp:

- `closing` - the component along the contact normal. This is the shove.
- `nx, nz` - the normal, body toward hero. The car leaves along `-n`.
- `off` - where along the struck face the contact landed, `-1..1` of that face's half-extent.
  0 is dead centre, `+-1` is a corner. **This is the term that makes the impact angle matter.**

### `traffic.js` - a momentum exchange instead of a hand-tuned fraction

BEFORE (`traffic.js:918-921` in `5d4a85b`):

```js
const kick = clamp(hit.rel / 30, 0, 1);
slot.wvx = hit.kx * (0.35 + 0.35 * kick);
slot.wvz = hit.kz * (0.35 + 0.35 * kick);
slot.wspin = (rngRange(R, 0, 1) < 0.5 ? -1 : 1) * (1.0 + 3.0 * kick);
```

AFTER: a 1-D momentum exchange along the normal, a tangential drag term, and spin from the lever
arm.

```
v_body = (1 + e) * m_hero / (m_hero + m_body) * closing
```

New constants, `traffic.js:146-176`: `HERO_MASS 1500`, `PARKED_MASS 1400`,
`PARKED_MASS_VAN 1900`, `WRECK_RESTITUTION 0.35`, `WRECK_TANGENT 0.35`, `WRECK_SPIN_GAIN 0.30`,
`PROMOTE_MIN_CLOSING 1.2`. That works out to 0.70 of the closing speed.

**The random spin sign is gone.** Spin is now `-off * vN * WRECK_SPIN_GAIN`, the y-component of
`r x F`, so a dead-square hit does not rotate the car at all and a corner clip does.

`WRECK_SPIN_GAIN` was measured, not guessed: at 0.55 a 10 m/s corner clip peaked at 183 deg/s and
put the car through **202 degrees** - more than a half turn from one clip, still turning past the
2 s settle the task asks for. 0.30 gives ~84 deg/s and about 55 deg.

**New low threshold, and its justification.** `hit.rel < 4` (14.4 km/h) became
`closing < PROMOTE_MIN_CLOSING` at 1.2 m/s. 1.2 m/s is 4.3 km/h - a parking-manoeuvre touch,
below which a car should stay put. Above it, the user's 3 m/s nudge now moves the car.

## Acceptance criteria, measured

AFTER, same probe:

| closing | promoted | moved | settle |
|---|---|---|---|
| 3 m/s | yes | 0.22 m | 0.20 s |
| 6 m/s | yes | 1.26 m | 0.56 s |
| 10 m/s | yes | **3.60 m** | **0.98 s** |
| 20 m/s | yes | 14.61 m | 2.04 s |

Impact angle, at 10 m/s, displacement decomposed in the CAR'S OWN frame:

| geometry | moved | along its forward | across it | rotation | peak spin |
|---|---|---|---|---|---|
| square | 3.62 m | -3.62 | 0.00 | 0 deg | 0 deg/s |
| corner clip | 3.63 m | -3.63 | -0.00 | **57 deg** | 84 deg/s |
| side swipe | 3.66 m | 0.00 | **-3.66** | 0 deg | 0 deg/s |

Reproduced across three runs. A square hit shoves and does not rotate; a corner clip shoves and
spins; a side swipe pushes purely sideways. That is the criterion, met.

From `tools/_t1-t17-check.mjs`:

- settled struck car drifted **0.000 m in 1.5 s** - stays inert;
- still flagged `wrecked` - never rejoins traffic;
- still published in `traffic.vehicles` - remains a solid obstacle;
- console clean.

- Works for every stationary population: see suspect 2 above, ranks and queues are one array.

## T17 - the C key

Removed the `KeyC` handler and `CRASH_DEMO_SEVERITY` (`main.js`); `CRASH_HOLD_S` has other callers
and stays. Verified: pressing C does nothing, and a real crash still triggers.

### A CORRECTION TO TASKS.md T17, and it matters

T17 says the C handler "shares `crash.trigger()`, **the orbit camera configuration** and the
WRECKED banner with the genuine crash path". **The orbit camera was never shared.** In the
pre-change tree (`f095b88`) the only `mode: 'orbit'` in `main.js` was inside the KeyC block; the
real wreck join at `main.js:684` calls `crash.trigger()` + `audio.crash()` + `hud.banner()` and
leaves the camera to `crash.js`. Removing C removed the only orbit-camera caller in the file, and
that is not a regression because real crashes never had it. My first probe asserted the orbit cam
and failed against behaviour that never existed; the assertion was removed rather than the finding
buried.

## Not done, and why

`menu.js:354` still lists `['C', 'crash']` in the control list, and `menu.js:35/304/333/808`
carry four comments documenting KeyC as a discrete action excluded from `HELD_CODES`. **`menu.js`
is owned by a peer agent this round (T14).** Routed rather than reached across, per process rule
3. It is a five-line follow-up once T14 lands.

## Frame time - SMOKE TEST ONLY, NOT A RESULT

**Two peer agents were running while these were taken.** The play brief forbids reporting frame
time as a result under concurrency, because a peer stealing the GPU cannot be detected after the
fact. Labelled accordingly and to be re-taken alone.

| tree | p50 | p90 | p99 | mean |
|---|---|---|---|---|
| before (`f095b88` worktree) | 14.40 ms | 30.70 ms | 49.30 ms | 16.94 ms |
| after | 13.90 ms | 15.40 ms | 59.90 ms | 15.22 ms |

Both at `render 1280x720 @ pixelRatio 1 (devicePixelRatio 1, resScale 1)`. No regression visible.
The change is a handful of scalar operations at the moment of a contact and adds no per-frame
work, so a regression would be surprising.

## Regression gate

No geometry, material, pass or shader touched. This cannot move a rendered pixel except by moving
a car that was already drawn, which is the requested behaviour.

```progress-metrics
parked car @ 10 m/s: 3.60 m, settles 0.98 s (was 1.55 m)
parked car @ 3 m/s: 0.22 m (was: not promoted at all)
corner clip @ 10 m/s: 57 deg rotation, 84 deg/s peak (was: random sign)
side swipe @ 10 m/s: 3.66 m lateral, 0.00 m forward
p50: 13.90 ms after vs 14.40 ms before, 1280x720 @ ratio 1 (SMOKE TEST, peers running)
population: 342 parked bodies, 342 with hide(), 0 slot-grant failures
```
