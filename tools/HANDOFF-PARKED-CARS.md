# HANDOFF - "struck parked/stopped cars do not move". Still unsolved.

Repo `/Users/robray/fc/demos/burnout-gauntlet`, branch `player-traffic-collision`, HEAD `7028fff`.
A static server is already running on **http://127.0.0.1:8100** serving `game/` (byte-identical to
HEAD, verified). Controls: `W/S/A/D`, `SHIFT` boost (only with throttle), `SPACE` handbrake,
`R` reset, backtick = dev slider panel. `#nomenu=1` skips the menu.

## THE REPORT

The user crashes into parked or stopped cars and **they do not move at all**. This has now survived
two rounds of "fixed" and the user has driven both. Treat any claim that it works as suspect until
it is shown in PIXELS.

## WHAT IS ACTUALLY ESTABLISHED (measured, reproducible)

- The promotion path fires. Stamp `heroHit` on a `world.parkedCars` body and within ~300 ms
  `b.gone === true` and a wrecked car appears in `traffic.vehicles`. Confirmed repeatedly.
- The promoted body moves in the SIMULATION: 3.60 m at a 10 m/s closing speed, settling in ~1 s,
  with the impact angle behaving correctly (square = no spin, corner = ~57 deg, side = pure
  lateral). `node tools/_t1-repro.mjs`.
- **The nearest baked parked car to spawn is ~240 m away.** Most of what a player rear-ends in
  traffic is a LIVE POOL car stopped at a signal, which is a different code path.

## THE LEAD THAT WAS DROPPED, AND IS THE MOST LIKELY CULPRIT

Instrumenting the instance matrices around one parked car's position:

- **before `hide()`: 18 instances near the spot. After: 17.** Only ONE instance disappeared.
- Isolated re-test on `parkedCars[10]`: 12 near the spot, 11 after. Again only one.
- Breaking it down per mesh, the instance that DID vanish belonged to a mesh whose `count` is
  **342** - exactly `world.parkedCars.length`. The instances that REMAINED belonged to meshes with
  counts **58, 14, 28, 16** and a `PlaneGeometry` with 6012.

**Those small counts were never identified.** `world.js` bakes each parked car into `carBody`
(cap 9600), `carCab` (4800), `carTrim` (9600) and `carWheel` (19200) - with 342 cars those counts
should be in the hundreds or thousands, not 14-58. So the geometry sitting at the parking spot
after `hide()` is coming from meshes that are NOT the ones `parkedCar()` records in its `used`
array.

If that is right, the baked car (or something drawn on top of it) stays on screen permanently
while an invisible wreck slides away - which is exactly "it does not move at all".

**Start here.** Identify what those meshes are. Candidate explanations nobody has ruled out:
a second stationary population drawn by a different system; traffic.js's own pool meshes drawing a
stopped live car in the same place; or `used` capturing the wrong indices.

## WHERE THE CODE IS

- `game/world.js:2511` `parkedCar()` - bakes a car, builds the `used` array, defines `hide()`.
  `hide()` pushes every recorded instance to y=-1000 at 1e-6 scale.
- `game/world.js:1073` `inst()` / `push()` - `userData.cap` is set here; `rec()` in `parkedCar()`
  silently records NOTHING if `m.count >= m.userData.cap`.
- `game/traffic.js` ~970 - "promote hit parked cars": calls `b.hide()`, steals a pool slot, boots
  it as a wrecked live car.
- `game/traffic.js` ~1300 - the `check` shunt for LIVE cars. Contains an UNVERIFIED fix
  (`wasStopped`): the stopped-car wreck clause used to read `v.speed` after the line above had
  overwritten it, so it was dead code. Fixed by inspection, never demonstrated.
- `game/physics.js` ~797 `hitCarBody()` - stamps `{rel, sev, kx, kz, closing, nx, nz, off}`.

## PROBES, AND WHICH ONES LIE

- `tools/_t1-repro.mjs` - data-side. PASSES. **It proves the simulation moves a body and proves
  nothing about the picture.** This is the probe that produced two false "fixed" claims.
- `tools/_t1-t17-check.mjs` - data-side acceptance. Passes.
- `tools/_t1-eyes.mjs` - fixed-camera visual probe. **Currently broken**: reports
  `promoted: false` in a setup where promotion demonstrably works.
- `tools/_t1-visual.mjs` - drives with the real W key. **Weak**: its aiming is wrong, it drove down
  an empty road and still reported "contact".
- `tools/_t1-stopped.mjs` - live stopped car. **Broken**: the pool recycles cars by distance, so a
  reference captured before a teleport goes stale; and writing `v.speed = 0` once loses to IDM long
  before the contact is processed. Both failure modes are the probe's, not the game's.

## KNOWN PROBE TRAPS IN THIS REPO

- `state.speed` is longitudinal only; use `state.ground`. `state.slip` is a clamped display proxy;
  use `state.slipAngle`.
- A synthetic `dispatchEvent` is `isTrusted: false`; WebAudio will not unlock for it.
- `bash tools/lint.sh` is syntax only and has passed a build that threw at runtime.
- `devicePixelRatio` is 2 on this machine; a 1280x720 canvas secretly renders 2560x1440.

## THE DECISION ON THE TABLE

The user has proposed deleting all parked cars, stopping cars from ever stopping, and removing all
parked/stopped collision logic. That would remove the bug by removing the feature. Arguments made
against doing it blind: the failure is still unexplained, so the demolition might not change what
the user sees; 342 parked cars are most of the street dressing and `world.js` warns that thinning
them makes streets read abandoned; and "cars never stop" also removes IDM braking, which is how
NPCs avoid each other at junctions.

A middle option raised but not chosen: keep parked cars as scenery, delete the promotion system,
and let them collide as plain solid obstacles like buildings.

**Diagnose the instance-count lead first. The user's call after that.**

---

# RESOLVED 2026-08-06

The instance-count lead above was correct, and it was one of three separate bugs.
Fixed in `b3c69d4` and `3a417d3` on this branch.

## 1. The mystery meshes: they were `pool:chunk` copies

The unidentified meshes with counts 58, 14, 28, 16 are the draw-call chunking pass at the bottom
of `world.js`.
It buckets pools by (geometry, material, shadow flags), re-cuts each bucket into one
`InstancedMesh` per 200 m cell named `<pool>:chunk`, and then sets the SOURCE pool's count to 0.
So the `[mesh, index]` pairs `parkedCar()` records at bake time point at a mesh that no longer
draws anything, and `hide()` was writing into it.

Only some parts of a car were affected, which is exactly why one instance vanished and the rest
stayed: `carBody` and `carCab` stayed in their own pools and really did hide, while trim and
wheels merged into the shared dark/tyre buckets and did not.

Fix: `chunkRemap` (source mesh -> source index -> [chunk mesh, chunk index]) is built during the
cut, and `hide()` routes through it.
**Any future post-boot per-instance edit must do the same.**

Probe: `tools/_phantom-probe.mjs` lists every InstancedMesh with an instance near a parking spot,
before and after `hide()`.
That is what finally named them.

## 2. Promotion into an undrawn pool slot

`pool` holds `POOL_CAP` (64) slots but `applyPool()` sets every mesh's count from `POOL` (24), so
a slot with `k >= POOL` is live, collidable and simulated while rendering nothing.
Promotion claimed the first `!live` slot with no `k < POOL` guard, so once the live population
reached its ceiling the first dead slot was exactly `k = POOL` and the struck car vanished on
contact.
It also made the steal-the-farthest-car path underneath unreachable.
`trySpawn()` had always carried the guard; only the promotion call site was missing it.

Probe: `tools/_promoteslot-live.mjs`.
It waits for the pool to actually saturate, then reads the INSTANCE MATRIX instead of
`traffic.vehicles` - a vehicles-list check stays green under this bug, which is why it survived.
Confirmed to fail on the pre-fix code and pass after.

## 3. Wrecks slid through buildings

A kerb car promoted by a hit toward the pavement crossed the facade line in under a second and
came to rest inside the block, invisible but live.
Wrecks now separate against `world.blocks` the same way `physics.js` does for the hero.

Probe: `tools/_wreckwall-live.mjs`.

## The decision on the table: not taken, and no longer needed

Parked cars were kept.
The population was halved instead (`NPC_DENSITY` 0.32 -> 0.16) on the user's request, and every
parked or stopped car now moves when hit, which is what the demolition was meant to buy.

## The probe lesson, restated

Every false "fixed" claim in this file came from a data-side probe.
`_t1-repro.mjs` proves the simulation moves a body and proves nothing about the picture, and the
slot bug was green in `traffic.vehicles` too.
For anything the user reports SEEING, assert on the render side: the instance matrix, the
submitted count, or pixels.
