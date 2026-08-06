# T9 - dev tuning menu for steering and drift (temporary)

Task source: `TASKS.md` T9, wave 0.
Owner file: `game/devtune.js` (new), plus a one-line import in `game/main.js` and one `export`
keyword added to `game/camera.js`.

## What this piece is for

The user reports the steering does not feel right, especially while drifting and tapping space.
This piece does not tune anything. It builds the instrument that lets the user tune it live, reads
the resulting numbers back off the sliders, and is then deleted (T9's closing step, wave 2).

## Two corrections to TASKS.md, found by reading the code before building

TASKS.md was written against an older `physics.js` and names two knobs that do not exist.

1. **`gripLow` does not exist.** `grep -n gripLow game/physics.js` returns nothing.
2. **The `1/(1 + (sn-gripLow)*1.35)` yaw-rate-versus-speed decay factor does not exist either.**
   That literal is not in the file. The yaw-rate curve was rewritten in wave-S round 2 and is now
   explicit and physical (`physics.js:1016-1021`):

   ```
   rGrip  = gripUse * aLatMax / max(gv, 0.5)     // grip-limited, falls as 1/v
   rGeo   = gv / minRadius                        // geometric, rises with v
   rTarget = steer * min(rGrip, rGeo) * ...
   ```

   There is no decay factor to expose. The shape of that curve is governed by three constants
   instead, and those are what the panel exposes in its place:

   | knob | what it does to the curve |
   |---|---|
   | `minRadius` | sets the low-speed peak and the speed the peak occurs at |
   | `gripUse` | scales the falling branch; raising it flattens the falloff |
   | `downforce` | how much `aLatMax` grows with speed, i.e. how slowly yaw falls toward `vMax` |

   Sliding those three IS sliding "turnRate peak and the speed it peaks at" and "the yaw-rate-
   versus-speed decay", expressed in the constants the shipped model actually reads.

TASKS.md also gives `camera.js:286 slip*0.30` and `steerLead 0.26`. The live values are
`FRAME.slipAim = 0.32` (`camera.js:130`, applied at `camera.js:343` and `camera.js:345`) and
`steerLead = 0.146` (`camera.js:152`, after two user-driven -30%/-20% passes). The panel exposes
the live constants, not the ones in the task text.

## Design

- **Own module, `game/devtune.js`.** One import and one call in `main.js`. Deleting it later is
  one file plus two lines, plus reverting the `export` on `camera.js`'s `FRAME`.
- **Mutates the live objects in place**: `TUNE` from `physics.js`, `camRig.config` (the `cfg`
  object the rig reads every frame), and `FRAME` from `camera.js`. No reload, no re-plumbing -
  every one of these is read per frame by the sim, so a write lands on the next tick.
- **Zero cost when closed.** The panel runs its OWN `requestAnimationFrame` loop, started when it
  opens and cancelled when it closes. `main.js` gains no per-frame call at all - the only cost in
  the normal path is one `keydown` listener that compares `e.code`.
- **Gated** behind `?dev=1` / `#dev=1` for auto-open, and toggled by the backtick key at any time.
- **Persisted** in `localStorage` under `bg.devtune.v1`, so a reload keeps the session going.
  Only overridden keys are stored, so a default that changes in code is still picked up.
- **Reset** restores the snapshot taken at construction, BEFORE `localStorage` is applied, so it
  is a true reset to the shipped values rather than to the start of this session.

## Live readouts

Speed (km/h, from `state.ground`, the true ground speed - `state.speed` is only the longitudinal
component and under-reads by the cosine of the slip angle in exactly the deep drift the user is
trying to tune), yaw rate (deg/s), slip angle (deg, the UNCLAMPED `state.slipAngle`, never the
clamped `state.slip` proxy), drift state, and boost tank.

## Regression gate

This piece cannot move a rendered pixel with the panel closed: it adds no geometry, no material,
no pass, and no per-frame work in the normal path. The panel itself is a DOM overlay outside the
canvas. Gate skipped by the "if your change cannot move a pixel, say that and skip it" clause of
the play brief.

## Status

Built. See the numbers block below once the user's tuning session reports back.

```progress-metrics
per-frame cost when closed: 0 (no main-loop call; own rAF loop only while open)
sliders: 26 across steering / drift+handbrake / camera
removal cost: 1 file + 2 lines in main.js + 1 export keyword in camera.js
```
