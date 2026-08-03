# WAVE K VERDICT — chase-camera (k1)  =>  THIS IS THE WAVE L BUILD BRIEF for game/camera.js

PIECE: chase-camera   ROUND: k1
SCENE: dusk-highway-chase   OURS: shots/chase-camera-k1.png   REF: reference/dusk-highway-chase-0{2,3}.jpg
EVIDENCE: shots/chase-camera-k1-accel0.jpg / -accel+16.jpg / -brake-26.jpg
(all 1920x1080, same rig, ONLY accelG differs)

BLIND CALL: **on the STATIC still the critic could NOT pick the real one.** Pose, standoff, tilt
and horizon placement all read identical to -03. **On the BRAKING frame ours was picked
instantly**: the camera has climbed onto the car's tail, the car fills 40% of frame height and
its rear bumper is cropped off the bottom edge. No shipped chase cam does that.

VERDICT: real wins

## NUMBERS (ours from `tools/probe.mjs --w 1920 --h 1080` + `tools/_cammeas.js`; live frame)
  horizon 49.23%  roof PANEL 57.55  topmost(wing) 55.93  contact 76.85
  -> carH-to-ROOF-PANEL **19.30%**, carH-to-TOPMOST 20.92%, gap **8.31%**,
     depression **0.301**, contact **0.7685**

REF, re-derived independently (feature named on BOTH images, as instructed):
- **-02** (2560x1080): roof PANEL top y=626 (`tools/_cropimg.mjs 1230 1330 612 650 10 5` — the
  pale roof step is at 626, **NOT the 634 a 4x crop suggests**). Topmost point == roof (mirrors
  sit lower). Horizon y=549 from the two guardrail top-edge lines fitted at x=700..1200 /
  1350..1880.
- **-03** (5000x2813): roof PANEL top y=1588 (`_cropimg 2200 2750 1520 1660 3.4 20`); the scoop
  box at y=1548 is the TOPMOST point, 1.4% higher. Lowest bodywork y=2170 (`_cropimg 2150 2800
  2060 2260 2.9 20`) -> contact 0.7714, carH-to-ROOF-PANEL 20.69%.
- **So the reference band to the ROOF PANEL is 18.9-20.7%, and ours at 19.30 is INSIDE it.**

## SPEED SWEEP 0->78 m/s (shake off, 400-frame settle per point) — r8's claim REPRODUCES
  contact 0.7684 -> 0.7716 (travel 0.0032, exactly as claimed); carH 18.85 -> 19.75
  (spread 0.90); gap 8.27 -> 8.26 (flat to 0.01); depression 0.305 -> 0.295; fov 42.0 -> 46.8.
  Only defect: depression is 0.302-0.305 for v <= 30, i.e. just over the 0.30 band top.

## THE BEHAVIOUR THAT FAILS IS LONGITUDINAL ACCELERATION, NOT SPEED
At speed 40, sweeping accelG (with the matching physics `s.pitch = -accelG*0.0035`), 150 frames
after the step:

| accelG | -26 | -20 | -16 | -10 | 0 | +10 | +16 | +26 |
|---|---|---|---|---|---|---|---|---|
| carH | 39.57 | 31.95 | 28.27 | 24.09 | **19.30** | 16.07 | 14.71 | 12.94 |
| contact | 1.0243 | 0.9329 | 0.8878 | 0.8342 | **0.7698** | 0.7243 | 0.7044 | 0.6797 |
| width | 26.22 | 22.20 | 20.14 | 17.69 | **14.71** | 12.59 | 11.58 | 10.23 |
| depr | 0.248 | 0.265 | 0.274 | 0.285 | **0.300** | 0.311 | 0.314 | 0.318 |

**These are REAL sim values, not stress tests** — the critic drove `tools/probe.mjs` against
`physics.js` directly: full-throttle launch gives accelG +16.5 falling to +10 over 1.5 s, boost
launch **+29.8**, brake from 70 m/s **-29.25** falling to -17. At -26 the contact line is at
1.0243, i.e. **off the bottom of frame**, which the brake frame shows.

**TRANSIENTS ARE NOT TRANSIENT:** every trace above is a monotonic settle to a NEW steady pose
in ~1.2 s and **it never recovers while the input is held.**

Clean, no complaint: steer (1.0) and slip (0.5) — carH moves <0.3 pt, depression <0.002, width
swings 14.7 -> 17.5 on slip, which is correct. SHAKE — roof wander 0.37 pt p-p at rest, 1.64 at
vMax, 1.70 at vMax+boost, **zero DC bias** (mean roof 57.401 shake-on vs 57.41 shake-off);
impulse(1) decays in ~1.4 s. BOOST steady state at v70: fov 46.3 -> 52.3, carH 19.66 -> 18.86,
contact 0.7712 -> 0.7631.

## CLAIMS CHECKED
- "pose holds across the ENTIRE speed range" — **REPRODUCED exactly**, all four static targets
  hit at every speed. Contact travel 0.0032 and carH spread 0.9 both confirmed. The r7 live pose
  (gap 8.31 / depression 0.301 / contact 0.7685 / carH 19.30) reproduced **to the digit**.
- **Not reproduced / NOT TESTED BY r8: any state with accelG != 0.**

## BIGGEST REMAINING GAP: `FRAME.distAccel = 0.16` at `game/camera.js:73`
It feeds acceleration into the spring **TARGET** (`camera.js:321`, `+ accel * FRAME.distAccel`
inside `dist`), so it is a **sustained proportional standoff offset, not a surge.** On the ~9.0 m
authored standoff, +/-26 m/s^2 is +/-4.16 m — a **+/-46% standoff change**, which the
dolly-counter-zoom does not touch because it only compensates the authored term. **Result: the
pose r8 locked across speed is unlocked by the throttle instead.**
FIX MECHANISM: make the surge an **impulse, not an offset** — inject the acceleration into the
spring **VELOCITY** (`velL`, `camera.js:343-344`) so it overshoots and the critically-damped
spring returns the car to the authored size, and cut the residual positional authority to ~0.03.

## TARGETS FOR NEXT ROUND (re-derive with the accelG sweep above, speed 40, 150 frames post-step)
- across accelG -26..+26: **carH-to-ROOF-PANEL 19.3 +/-1.0 pt; contact 0.769 +/-0.015;
  depression 0.29-0.31; carWidthPct 14.7 +/-1.0.**
- Peak transient excursion **may** reach +/-2.5 pt of carH but must decay to within +/-1.0 pt in
  **under 0.8 s while the input is still held.**
- Keep the speed sweep at its current values (all in band).
- Secondary: depression <= 0.300 at v=0 (currently 0.305); contact >= 0.767 at v70/boost 1
  (currently 0.7631 — the known `distBoost` +0.08 compromise).

## RETIRED/CORRECTED
1. **`car height ~20.5% to the roof PANEL` is a -03-ONLY number.** -02's roof panel is at y=626
   and -03's at y=1588, giving 18.9-20.4% and 20.69%. **CORRECTED target: 19.1-20.7% to the ROOF
   PANEL (20.5-22.1% to the TOPMOST point). Ours at 19.30 already passes.**
2. **`contact 0.769-0.771` is FALSE PRECISION.** On -02 the dark-to-road transition under the car
   is a **26 px ramp, not an edge**: `_px.mjs` with 2-row bands at x 0.46,0.54 gives subBlack%
   53.4 (y818) -> 40.0 (830) -> 13.7 (838) -> 2.9 (846) -> 0.0 (856), monotonic, no step. The
   contact line is only locatable to **+/-1.3 pt of frame height** there, so a 0.2 pt band cannot
   be derived from it. **Widen to 0.769 +/-0.015** and always compare "lowest opaque bodywork" to
   our lowest projected vertex — the current comparison pits a hard geometric vertex against a
   soft shadow ramp, **which is this project's recurring failure mode.**
3. **NOT retired**: depression 0.29-0.30 and gap 7.8-8.8% both re-derived cleanly. Using the
   corrected roof 626 and the 0.769 contact convention, -02 gives gap 7.13-8.03% and depression
   0.26-0.29 depending on where in the shadow ramp the contact line is put — consistent with the
   band once the ramp uncertainty is admitted.

TOOLING NOTE FOR THE BUILDER: `tools/probe.mjs --expr` breaks on any `--` inside the expression
(its arg parser splits on `--`), so keep `----` out of comments in probe expressions.
