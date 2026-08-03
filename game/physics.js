// physics.js — hand-rolled arcade car handling (no physics engine, fully deterministic).
// API: createPhysics({blocks}) -> p.  p.state {pos,yaw,speed,steer,slip,lean,pitch,boost,...}
//   p.reset(pos,yaw,speed) p.setInput({throttle,brake,steer,boost,handbrake})
//   p.followPath(path, lookahead) drives itself; p.step(dt) advances one fixed tick.
//
// ============================================================================================
// WAVE S REWRITE. Read this before changing a constant; the numbers are sourced, not chosen.
// ============================================================================================
//
// The model this replaced was a single scalar speed along the heading plus an algebraic `slip`
// term that only tilted the body. Three things were wrong with it, in descending order of how
// much they cost the feel:
//
// 1. `TUNE.vMax` WAS NOT THE TOP SPEED. Drag was applied unconditionally, including at full
//    throttle, at `coastDrag * (v/vMax)^2 * vMax` = 42.9 m/s^2 at vMax, against a throttle term
//    that had faded to 4.1 m/s^2. The equilibrium was 38.3 m/s (86 mph), not the advertised 78
//    (175 mph): measured by integration, and independently observed by the fps piece, which
//    documented "this car's terminal speed" at 38.2 m/s in tools/fps.mjs. Everything downstream
//    that normalises against vMax = 78 (camera.js V_REF, the FOV and shake speed curves, the HUD
//    gear bands) was therefore being driven by a signal that never left the bottom half of its
//    range, and `scenes.js` authored two presets at 232 and 300 km/h that the sim could not hold.
//    FIX: the aerodynamic coefficient and the boost power are now SOLVED from the declared
//    ceilings (see DRAG below), so vMax is the top speed by construction and cannot drift into
//    being a label again.
//
// 2. THERE WAS NO LATERAL VELOCITY STATE, so a drift could not carry the car wide. `slip` was an
//    algebraic function of the current yaw rate, which means it could not persist through centred
//    steering and could not survive the brief countersteer that Paradise players use INSIDE a
//    drift to lengthen it (docs/BURNOUT-HANDLING.md section 4, quoting burninrubber0 on double
//    drifting: "let the car go back into the drift on its own"). FIX: a proper single-track
//    ("bicycle") model with lateral velocity and yaw rate as real integrated states and saturating
//    tyres. Every documented Paradise drift behaviour then falls out of the physics instead of
//    being scripted: the brake-tap entry works because braking transfers load off the rear axle,
//    the slide sustains because it is momentum, and a tapped countersteer does not cancel it
//    because the lateral velocity is still there when the tap ends.
//
// 3. BOOST HAD THE CEILING-VERSUS-ACCELERATION SPLIT BACKWARDS. Ours was a 33% ceiling lift;
//    Paradise's roster ratio is ~1.0 (the best MaxSpeed, 201 mph, beats EVERY car's
//    MaxBoostSpeed) and the felt event is `BoostKickAcceleration`, a front-loaded burst.
//    FIX: ceiling ratio 86/78 = 1.10, and a decaying kick that adds both traction-limited
//    acceleration and power (see boostKick*).
//
// SIGN CONVENTIONS. Get these wrong and the car banks into corners; all four were verified, and
// one of them was verified wrong and is fixed here.
//   * `yaw` grows counter-clockwise seen from above, i.e. a LEFT turn. Local +z is the car's
//     forward (car.js DIMS.frontZ = +1.50), so local +x is the car's LEFT.
//   * `steer` +1 is LEFT. That is fixed at the input mapping in main.js and this file keeps it:
//     positive steer produces positive yaw rate. car.js turns the front wheels to
//     `steer * 0.52` about +y, which is also left, so the wheels and the yaw agree.
//   * `slip` is POSITIVE in a left-hand slide (the tail out to the right), matching the retired
//     model so `carRoot.rotation.y = yaw - slip * 0.22` in main.js keeps its meaning. NOTE that
//     main.js term now partially CANCELS a slip angle this model already applies to `yaw`
//     itself; the drawn nose still points into the slide, just ~50% shallower than the physical
//     value. Routed finding: main.js:320 should become `carRoot.rotation.y = s.yaw`.
//   * `lean` IS SIGN-FLIPPED FROM THE OLD MODEL, on purpose. car.js:2336 does
//     `shell.rotation.z = -lean * 0.05`; a rotation about local +z takes local +x (LEFT) toward
//     +y (up), so a POSITIVE lean raised the car's left flank — it banked INTO the corner like a
//     motorcycle. Confirmed empirically, not by algebra: driving `car.update({lean: 1})` at yaw 0
//     and reading the shell's world up vector gives up = (+0.050, 0.9988, 0), i.e. tilted toward
//     world +x, which at yaw 0 is the car's left. So `lean` is now NEGATIVE in a left turn and
//     the body finally rolls OUTWARD, away from the turn centre.
//
// TICK RATE. step() substeps internally at SUBSTEP so the integration is stable and very nearly
// tick-rate invariant: the rAF loop hands us 16-50 ms, and an explicit tyre model integrated at
// 50 ms diverges. tools/handling-measure.mjs test 8 holds the speed spread across dt 1/240..1/20
// under 2% and the yaw spread under 3 deg over 6 s. No RNG anywhere; test 12 asserts that.
//
// MEASURE, DO NOT GUESS: `node tools/handling-measure.mjs` scores every constant below against
// docs/BURNOUT-HANDLING.md and prints HIT/MISS per target.

import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';

const G = 9.81;

export const TUNE = {
  // ---- ceilings. PUBLISHED: MaxSpeed band 177-201 mph, MaxBoostSpeed band 177-200 mph. -------
  // 78 m/s = 174.6 mph sits just under the roster's MaxSpeed band and inside the research's
  // 165-180 mph mid-tier estimate; it is kept at 78 because camera.js:34 V_REF and the HUD gear
  // bands are calibrated against that exact number. 86 m/s = 192.4 mph is inside the published
  // MaxBoostSpeed band, and the ratio is 1.10 rather than the old 1.33.
  vMax: 78,
  vMaxBoost: 86,

  // ---- longitudinal ---------------------------------------------------------------------------
  // Traction-limited at low speed, power-limited at high speed. tractionAccel is the tyre-limited
  // launch, powerMass is specific power in W/kg (12.0 and 520 give 0-100 mph in 4.5 s unboosted,
  // inside the research's 4-5 s mid-tier estimate).
  tractionAccel: 12.0,
  powerMass: 520,
  coastDecel: 1.6,      // m/s^2 of engine braking / rolling resistance at any speed
  brakeDecel: 24,       // DEMAND, not achieved: the per-axle ABS clamp below grip-limits it
  brakeSplitRear: 0.48,
  // Drive force is split across BOTH axles, i.e. the car is a rear-biased four-wheel drive. This
  // is not decoration: measured, a pure rear-drive split caps the launch at 8.9 m/s^2 (the rear
  // tyres' own friction circle at 53% static rear load), which puts 0-100 mph at 5.3 s and makes
  // BoostKickAcceleration literally unusable — the kick asks for 25 m/s^2 and the rear axle
  // refuses it, so boosting off the line measured 5.30 s against not boosting at 5.31 s. Burnout's
  // published 0-100 mph times of 2.22-3.48 s need 13-20 m/s^2 and no single-axle tyre model at any
  // sane mu will produce that. 0.65 keeps the rear working harder than the front, so power-on
  // oversteer survives.
  driveSplitRear: 0.65,
  handbrakeDecel: 6.0,  // rear-axle only, and it is the grip cut below that matters, not this
  // How close to locking a braked wheel is allowed to get, i.e. how much of its friction circle
  // the longitudinal force may spend. It is the ABS, and it is also THE brake-tap drift knob,
  // because what is left for cornering is sqrt(1 - absHold^2) of the circle: 0.92 leaves 39% and a
  // tap under load only reached a peak |slip| of 0.22, while 0.985 leaves 17% and the rear steps
  // out. Without any clamp at all a 24 m/s^2 demand locks the rear outright and every touch of the
  // brake is a spin.
  absHold: 0.985,
  reverseAccel: 5.0,
  reverseMax: 12,

  // ---- boost. PUBLISHED: a full Speed bar is exactly 8.0 s and is usable only when FULL. ------
  boostDuration: 8.0,
  // BoostKickAcceleration: PUBLISHED as "the initial burst of acceleration when boost starts",
  // with no unit recovered, so the magnitude is ours and the SHAPE is the sourced part. It adds
  // to both limits (traction at low speed, power at high speed) or the punch would vanish at
  // exactly the speeds Burnout's boost feels best at, and decays with boostKickTau.
  boostKickAccel: 13.0,
  boostKickPower: 440,
  boostKickTau: 0.9,
  // Boost economy. Paradise earns boost from EVENTS (near miss, oncoming, traffic check, air,
  // takedown, barrel roll, gas station) and has no passive time refill at all. physics.js is
  // handed no event input and main.js is not this piece's file, so the event stream is stood in
  // for by the two things physics can see by itself: how fast we are going and how hard we are
  // sliding. boostEarnCruise is set to the research's MEASURED ~0.5 %/s "merely driving fast in
  // traffic" figure; boostEarnDanger is the acknowledged substitute for the event stream and only
  // engages above 0.5 of vMax. Routed finding: give physics an event input and delete the danger
  // term.
  boostEarnCruise: 0.005,
  boostEarnDanger: 0.030,
  boostEarnDrift: 0.10,
  // PUBLISHED: spending the whole bar in one burst performs a "burnout" that refills a PORTION;
  // enough stunts performed WHILE boosting instead refill it completely (a Burnout Chain), which
  // ends only on button release, failure to refill, or a crash. Our stunt proxy is drift time.
  burnoutRefill: 0.32,
  chainDriftNeeded: 3.2,

  // ---- chassis --------------------------------------------------------------------------------
  mass: 1500,
  izz: 2150,            // kg m^2 yaw inertia
  wheelbase: 2.72,
  cgFront: 1.24,        // CG to front axle (a). a + b must equal wheelbase.
  cgRear: 1.48,         // CG to rear axle (b). a < b means the CG is FORWARD of centre: 54.4% of
                        // the static load on the front axle, which is what a mid-front-engined
                        // layout gives and what keeps the car from being a spinner.
  // Load transfer is what makes a brake tap bite, and it is also the loop that departs the car:
  // a big slide scrubs hard, hard deceleration transfers load onto the front, the unloaded rear
  // gives up more, the slide grows. 0.45 m of CG height with a 55% cap let that loop run away from
  // full lock at 60 m/s within 1.5 s (measured, unpinned: 30 deg/s held for 1.5 s, then departure
  // and a scrub to a standstill by t=3.0). A low-slung arcade car at 0.32 m and a 40% cap keeps
  // the bite and drops the loop gain below unity.
  cgHeight: 0.32,
  transferCap: 0.40,    // max fraction of an axle's static load that transfer may move

  // ---- tyres ----------------------------------------------------------------------------------
  // mu well above 2 is not a road tyre and is not meant to be: the target is a 2007 arcade racer
  // whose cars corner at rates a road car cannot. The value is set BY the yaw-rate target and the
  // grip reserve below, not chosen: 1.95/1.82 with no reserve measured 26 deg/s of yaw at 40 m/s,
  // BELOW the 28-38 deg/s the research measured a player actually using there — and ours is
  // maximum-available yaw, so it has to sit above the player-used band, not under it.
  // muFront > muRear by 7.8%, so the REAR lets go first and the car is driftable rather than a
  // plough. tyreStiff is normalised cornering stiffness (Ca = tyreStiff * Fz), so the rear
  // saturates at muRear/tyreStiff = 0.129 rad = 7.4 deg of slip, which is what driftEnterRatio
  // below is a multiple of.
  muFront: 2.50,
  muRear: 2.32,
  tyreStiff: 18.0,
  // COMMAND ONLY 85% OF THE GRIP. A car asked for exactly 100% of its lateral capability is
  // marginally stable by construction: both axles sit pinned at their friction circles, so any
  // perturbation — and the scrub-driven load transfer of a developing slide is a big one — has no
  // reserve to correct with, and the car departs. Measured, with no reserve: full lock at 60 m/s
  // held 30 deg/s for 1.5 s and then departed to a standstill by t=3.0 s, at every speed above
  // 55 m/s. With the reserve, steady cornering leaves both tyres inside their linear range, where
  // the single-track model is unconditionally stable, and mu is raised to keep the yaw rate in the
  // measured band. The reserve is also what the handbrake and the brake tap SPEND to break the
  // rear loose, so it is not dead weight.
  gripUse: 0.85,
  // DownForce is a real Paradise attribute (PUBLISHED, unit not recovered). It is what makes the
  // yaw-rate curve fall with speed more slowly than 1/v while still falling.
  downforce: 0.95,      // extra fraction of static load at vMax
  // Rear grip multiplier while the e-brake is held, at low speed and at vMax respectively, blended
  // on sn^3 so the whole low and middle range keeps the full cut. WHY IT IS SPEED-DEPENDENT: with a
  // flat 0.40, holding the e-brake and full lock at 280 km/h in the live game put the car through
  // 78 deg of slip angle at 137 deg/s of yaw - a flat spin, hard against the anti-pirouette clamp -
  // and there was nothing the player could do with it. A locked rear axle under 2x its static load
  // in downforce has more lateral capacity left than one at rest, so the cut easing off with speed
  // is the honest version as well as the playable one.
  handbrakeMu: 0.40,
  handbrakeMuHigh: 0.70,
  // THE FALLING BRANCH. A real tyre's force peaks at its saturation slip angle and then DROPS
  // toward a sliding value; a flat saturation (what this model had) gives a sliding tyre exactly as
  // much grip as a gripping one, and the consequence is that every slide self-corrects the instant
  // the trigger is released. Measured, with a flat cap: a brake tap under load peaked at 9.7 deg of
  // slip angle and was fully recovered 0.5 s later, and no amount of load-transfer tuning changed
  // it, because the recovery was the FRONT tyre still being at full peak grip. 22% of drop, reached
  // at three times the saturation angle, is a mild version of the real curve and it is what makes
  // "let the car go back into the drift on its own" (the published double-drift description)
  // possible at all.
  slideDrop: 0.22,
  // Lateral-force-induced drag, scaled. At full authority the raw Fy*sin(alpha) drag plus the
  // body-frame transport term took a 281 km/h e-brake turn to a standstill in 1.3 s — 4.5 g of
  // average deceleration, which is a wall, not a drift. Half of it is ~2.2 g, which is about what
  // turning a mu-2.5 car sideways should cost, and it keeps the 5 s chain-drift scrub inside the
  // "low but nonzero" band the research describes.
  scrubGain: 0.50,
  // How much of the scrub is allowed into the longitudinal LOAD TRANSFER (as opposed to into the
  // velocity, which is scrubGain's job). See the comment at `aTransfer`: at 1.0 a drift feeds its
  // own front-axle grip and becomes unrecoverable, at 0.0 drifts are noticeably shallower and
  // shorter-lived. 0.35 is where a held countersteer gathers the car up in about 0.8 s while a
  // tapped one still leaves the slide intact.
  scrubTransfer: 0.35,

  // ---- steering -------------------------------------------------------------------------------
  // THE YAW-RATE CURVE IS EXPLICIT, and this is the single most important structural decision in
  // the file, so here is why. The research doc has NO published yaw-rate-versus-speed curve
  // (`NOT FOUND`); what it has is a magnitude band (28-38 deg/s used in a hard sustained turn at
  // roughly 40 m/s), a shape (`CONSENSUS`: cars turn hard at low speed and go progressively
  // straighter toward top speed) and a straight-line figure (< 0.2 deg/s).
  //
  // So the target yaw rate is the smaller of two physical limits and nothing else:
  //   * geometric, at low speed:  |v| / minRadius
  //   * grip-limited, at speed:   aLatMax / |v|,  with aLatMax including downforce
  // They cross at sqrt(aLatMax * minRadius), and MEASURED (tools/handling-measure.mjs test 3, tick
  // 120 Hz, full lock, speed held) the curve peaks at 62.6 deg/s at 45 km/h on an 11.4 m radius,
  // falls monotonically above that, and reads 33.5 deg/s at the research's one calibrated 40.2 m/s
  // anchor and 27.8 deg/s at vMax - 0.44 of the peak.
  //
  // The steering angle is then whatever ACHIEVES that rate, not the Ackermann angle for it. That
  // distinction cost a measurement to find: commanding the bare Ackermann angle L*r/v produced
  // 17.9 deg/s at 40 m/s against a 33 deg/s grip limit, because a real tyre needs slip angle to
  // make force and the load transfer under throttle stiffens the rear. The understeer allowance
  // below closes that 2.25x gap from the tyre model's own numbers rather than from a fudge factor.
  minRadius: 11.5,      // m at low speed; measured 11.4 m and 62.6 deg/s at the peak
  steerMax: 0.40,       // rad, the MECHANICAL lock limit (23 deg); normally not the binding one
  steerRate: 10,        // 1/s the smoothed steer chases the input; keyboard is binary
  // YAW-RATE SERVO on the steering angle: this is the hands, and it is what a human does that a
  // feed-forward angle cannot. Open loop, the angle is solved for a steady state that does not
  // exist yet, so at 60 m/s the yaw rate (fast) outruns the sideslip (slow), both axles saturate,
  // the scrub drag transfers load onto the front, the front's moment beats the rear's and the car
  // departs: measured, 138 deg/s of flat spin within 1.4 s of holding full lock, at every speed
  // from 60 m/s up. Adding torque to the yaw equation could not fix that, because the divergence
  // is in the tyre force balance, not in the bookkeeping. Backing the ANGLE off - and letting it
  // go past zero into a real countersteer - fixes it where it happens.
  // It is cut hard while the e-brake is held: there the slide is the point, and the servo would be
  // catching the drift the player just asked for.
  steerServo: 0.45,     // rad of angle per rad/s of yaw-rate error
  steerServoDrift: 0.30,
  steerServoHandbrake: 0.10,
  // Yaw damping. `stabilityAssist` pulls the yaw rate toward the TARGET RATE OF THE CURVE ABOVE
  // (not toward a kinematic rate: that was the bug that spun the car, see the note at `yawRef`).
  // This is the arcade stability control that makes a binary keyboard input drivable at 250 km/h.
  // While drifting it is weakened to `driftStabilityAssist` and joined by `driftAngularDamping`,
  // our analogue of Paradise's own per-car `DriftAngularDamping` attribute: PUBLISHED, lower value
  // = drifts more sharply, so it is the knob for drift length.
  stabilityAssist: 2.6,
  driftStabilityAssist: 0.80,
  // With the e-brake held the player is explicitly ASKING for the tail out, so the assist all but
  // steps aside. At the gripping value it did not: an e-brake turn at 40 m/s reached only |slip|
  // 0.07 because the assist was still hauling the yaw rate back down to the target rate, which is
  // the opposite of what an e-brake is for. It now measures |slip| 0.94 at 37 deg of slip angle.
  handbrakeAssist: 0.25,
  driftAngularDamping: 0.40,
  // OVER-ROTATION DAMPER. Exactly zero while the yaw rate is at or under the rate the curve above
  // asked for, so it cannot touch ordinary cornering, ever — which is the property that makes it
  // checkable rather than a tuning fudge (kill-control: set it to 0 and full lock at 60 m/s
  // departs). It only bites on the excess, which is the signature of a departing car, and it does
  // not touch the LATERAL VELOCITY, so it limits spin without shortening a drift: a steady drift
  // needs a large slip angle, not a large yaw rate.
  spinDamp: 6.0,
  // Anti-pirouette guard. Sized ABOVE the peak cornering rate the grip model can produce
  // (measured 62.6 deg/s = 1.09 rad/s at 45 km/h) so it never binds while cornering, and only ever
  // catches a genuine spin. Named rather than inlined because a guard that silently binds during
  // normal play would be indistinguishable from a tuning choice.
  yawRateMax: 2.4,

  // ---- drift state machine --------------------------------------------------------------------
  // Hysteresis plus a minimum hold: the hold is what lets a brake TAP produce a drift that
  // survives the steering being centred, and the gap between enter and exit is what lets a
  // 0.15 s countersteer pass through without ending it (double drifting).
  //
  // The thresholds are RATIOS OF THE TYRE'S OWN SATURATION SLIP ANGLE (mu / tyreStiff), not
  // absolute angles, and that is load-bearing. With absolute thresholds the exit angle sat BELOW
  // saturation, so a car merely cornering hard could never leave the drift state: measured, that
  // pinned the assist at its drift value from 40 m/s upward and the yaw-rate curve read 16.6 deg/s
  // at 40 m/s (against a 33 deg/s grip limit) before spinning out above 60 m/s.
  // ENTRY ALSO NEEDS INTENT (brake, e-brake or reverse-throttle) - see the gate in substep().
  // As ratios they also scale correctly with the handbrake, which lowers rear mu and therefore
  // lowers the angle at which a slide counts as one.
  driftEnterRatio: 1.4,   // x saturation slip to enter
  driftExitRatio: 1.0,    // x saturation slip to leave
  driftMinHold: 0.50,   // s
  slipRef: 0.45,        // rad of body slip angle that reads as |slip| = 1
  leanRef: 22,          // m/s^2 of lateral acceleration that reads as |lean| = 1

  // ---- collision ------------------------------------------------------------------------------
  // Two tiers, because the reference has two outcomes: a light side-on scrape preserves the run
  // and does not even interrupt the boost, while a real hit ends it (MEASURED-BY-ME in the
  // research doc, timing only). The discriminator is the closing speed along the wall normal.
  scrapeKeep: 0.96,     // speed retained by a glancing contact
  hitKeep: 0.30,        // speed retained by a square hit
  hitNormalSpeed: 12,   // m/s of normal closing speed at which a contact counts as a full hit
  wallFriction: 5.0,    // m/s^2 while the car is held against a wall, applied as a RATE
  contactHold: 0.15,    // s a contact counts as the SAME contact, so one impact = one impulse
};

// SUBSTEP is the integration tick, independent of the frame rate. 1/240 is the coarsest step at
// which the tyre model is stable at full lock and full grip; the cost is 4 substeps per 60 Hz
// frame of scalar arithmetic, which does not show up in a frame-time measurement.
const SUBSTEP = 1 / 240;

// DRAG, SOLVED FROM THE CEILING RATHER THAN AUTHORED. Top speed is where power/v equals the
// resistances, so the quadratic coefficient is pinned by demanding that equality AT vMax. Boost
// power is then pinned the same way at vMaxBoost. Consequence: editing vMax moves the real top
// speed, and no constant in this file can quietly disagree with it again.
const CD = (TUNE.powerMass / TUNE.vMax - TUNE.coastDecel) / (TUNE.vMax * TUNE.vMax);
const POWER_BOOST = TUNE.vMaxBoost * (TUNE.coastDecel + CD * TUNE.vMaxBoost * TUNE.vMaxBoost);

/**
 * Lateral force an axle has left over after spending `fx` of its friction circle, on the falling
 * branch past its saturation slip angle `sat`. See TUNE.slideDrop.
 */
function latCapacity(mu, fz, fx, alpha, sat) {
  const slide = 1 - TUNE.slideDrop * clamp((Math.abs(alpha) / sat - 1) / 2, 0, 1);
  const cap = mu * fz * slide;
  const used = Math.min(1, Math.abs(fx) / Math.max(cap, 1));
  return cap * Math.sqrt(Math.max(0, 1 - used * used));
}

export function createPhysics({ blocks = [], bounds = 1400 } = {}) {
  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,        // m/s ALONG THE HEADING (signed), i.e. the longitudinal component of the
                     // velocity, not its magnitude. Equal to the ground speed to within cos(slip),
                     // so identical on a straight and up to 30% under it in a deep drift. The HUD,
                     // audio and wheel spin read this; see `ground` below.
    steer: 0,        // smoothed -1..1
    slip: 0,         // -1..1 body slip angle, positive in a left-hand slide
    lean: 0,         // -1..1 body roll, NEGATIVE in a left turn so the car banks outward
    pitch: 0,
    boost: 1,        // 0..1 tank
    boosting: false,
    boostBlend: 0,   // 0..1 smoothed visual boost
    boostKick: 0,    // 0..1 front-loaded BoostKickAcceleration envelope; the camera reads this
    accelG: 0,
    airborne: false, // DEAD STATE, kept for its readers: nothing integrates vy and pos.y is
    vy: 0,           // forced to 0 below, because the world is flat. Routed, not fixed here.
    crashed: false,  // owned by crash.js (crash.js:2340 sets it); this file never asserts it
    impact: 0,       // 0..1 decaying collision severity, so the camera can kick on a real hit
    distance: 0,
    // --- rewrite additions, all readable by the camera and the harness ---
    vLat: 0,         // m/s lateral velocity in the car's frame, +left. The drift lives here.
    yawRate: 0,      // rad/s, an integrated state now, not an algebraic function of steer
    slipAngle: 0,    // rad, positive in a left-hand slide
    drifting: false,
    chain: 0,        // s-equivalent of drift banked while boosting, toward a Burnout Chain
    // True ground speed |v|, which is what a speedometer shows. ROUTED: main.js:357 hands `speed`
    // (vLong) to the HUD and to audio, and during a big drift that under-reads by up to the cosine
    // of the slip angle. Those are not this piece's files; `ground` is published for them.
    ground: 0,
  };

  let input = { throttle: 0, brake: 0, steer: 0, boost: false, handbrake: false };
  let auto = null;
  let boostLatch = false;   // the full-bar gate: armed only from a full tank, held until empty
  // Seconds of "still in this contact". A boolean was not enough: the resolver puts the car exactly
  // ON the face, so the next substep often finds it a hair outside, the contact reads as released,
  // and the next one re-charges the full impact impulse. With the impulse fired once per genuine
  // contact, a 3.2 deg graze now retains 79% of the speed it arrived with and a square hit 25%.
  let wallCool = 0;
  let driftHold = 0;
  let aLongPrev = 0;        // last substep's DRIVE/BRAKE acceleration, for load transfer only
  let prevGround = 0;       // last tick's signed ground speed, for accelG

  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function forward(out) { return out.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)); }
  /** The car's LEFT in world space. See SIGN CONVENTIONS. */
  function leftward(out) { return out.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)); }

  /**
   * Keep the car out of the building blocks, in two tiers. The old version applied one flat
   * `speed *= 0.62` to every contact regardless of angle, so kerbing a wall at 5 deg cost the
   * same as driving into it head on. Now the closing speed along the contact normal decides,
   * which is the same quantity that decides it in the reference footage.
   *
   * The impulse fires ONCE per contact, on the entry edge. It has to: collide() runs every
   * substep, so a car sliding along a facade with a per-call multiplier applied 240 times a
   * second is stationary within a tenth of a second — measured, a 3 deg graze retained 0% of its
   * speed. While the contact is held, all that remains is wall friction as a rate.
   */
  function collide(h) {
    for (const b of blocks) {
      const hx = b.w / 2 + 1.0, hz = b.d / 2 + 1.0;
      const dx = state.pos.x - b.cx, dz = state.pos.z - b.cz;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
        // World velocity, which during a drift is NOT the heading.
        forward(fwd); leftward(side);
        const vx = fwd.x * state.speed + side.x * state.vLat;
        const vz = fwd.z * state.speed + side.z * state.vLat;
        let nx = 0, nz = 0;
        if (px < pz) { state.pos.x = b.cx + Math.sign(dx || 1) * hx; nx = Math.sign(dx || 1); }
        else { state.pos.z = b.cz + Math.sign(dz || 1) * hz; nz = Math.sign(dz || 1); }
        const closing = Math.max(0, -(vx * nx + vz * nz));
        if (wallCool <= 0) {
          const sev = clamp(closing / TUNE.hitNormalSpeed, 0, 1);
          state.speed *= lerp(TUNE.scrapeKeep, TUNE.hitKeep, sev);
          // A wall cannot push the car sideways into itself: kill the inbound lateral component
          // and let the rest slide along the face, which is what makes a scrape read as a scrape.
          state.vLat *= lerp(0.85, 0.2, sev);
          state.yawRate *= lerp(0.9, 0.35, sev);
          state.impact = Math.max(state.impact, sev);
        } else {
          state.speed -= Math.sign(state.speed || 1) * TUNE.wallFriction * h;
          state.vLat *= Math.exp(-14 * h);
        }
        wallCool = TUNE.contactHold;
        return true;
      }
    }
    const outX = Math.abs(state.pos.x) > bounds, outZ = Math.abs(state.pos.z) > bounds;
    if (outX || outZ) {
      // The edge of the world takes the SAME one-impulse-per-contact treatment as a building, and
      // for the same reason, which cost a live drive to find: a bare `speed *= 0.5` here runs once
      // per substep, so sliding along the boundary at 245 km/h multiplied the speed by 0.5 two
      // hundred and forty times a second and the car was stationary in under a tenth of a second.
      if (outX) state.pos.x = Math.sign(state.pos.x) * bounds;
      if (outZ) state.pos.z = Math.sign(state.pos.z) * bounds;
      if (wallCool <= 0) {
        state.speed *= 0.5; state.vLat *= 0.5;
        state.impact = Math.max(state.impact, 0.5);
      } else {
        state.speed -= Math.sign(state.speed || 1) * TUNE.wallFriction * h;
      }
      wallCool = TUNE.contactHold;
      return true;
    }
    wallCool = Math.max(0, wallCool - h);
    return false;
  }

  /**
   * One integration substep of the single-track model. `h` is always SUBSTEP or smaller.
   *
   * Frame: x forward, y LEFT, z up (right-handed). Positive yawRate turns left, so a point `a`
   * ahead of the CG has lateral velocity vLat + a*yawRate and one `b` behind has vLat - b*yawRate.
   */
  function substep(h, throttle, brake, steerIn, boosting, handbrake) {
    const v = state.speed;
    const av = Math.abs(v);
    // GROUND SPEED is the car's real speed; `state.speed` is only its longitudinal component, and
    // the two are the same thing until the car starts sliding. Everything that is a property of how
    // fast the car is MOVING - downforce, the geometric turn rate, aerodynamic drag, the direction
    // drag and scrub act in - has to use this one. Keying them on the longitudinal component
    // instead is what made a fully sideways car behave like a stationary one: measured in the live
    // game, a 250 km/h e-brake turn reached 89 deg of slip angle and then slid sideways for
    // seconds, because at 89 deg the longitudinal component is ~0, so the commanded yaw rate went
    // to zero and the car had no idea it was still travelling at 172 km/h.
    const gv = Math.hypot(v, state.vLat);
    const sn = clamp(gv / TUNE.vMax, 0, 1.4);
    const L = TUNE.wheelbase, a = TUNE.cgFront, b = TUNE.cgRear, m = TUNE.mass;

    state.steer = damp(state.steer, clamp(steerIn, -1, 1), TUNE.steerRate, h);

    // ---- vertical loads: static split, downforce, longitudinal transfer --------------------
    const dfFactor = 1 + TUNE.downforce * sn * sn;
    const fzFront0 = m * G * (b / L) * dfFactor;
    const fzRear0 = m * G * (a / L) * dfFactor;
    const transfer = clamp(m * aLongPrev * TUNE.cgHeight / L,
      -TUNE.transferCap * fzFront0, TUNE.transferCap * fzRear0);
    const fzFront = Math.max(0.1 * fzFront0, fzFront0 - transfer);
    const fzRear = Math.max(0.1 * fzRear0, fzRear0 + transfer);
    const hbCut = lerp(TUNE.handbrakeMu, TUNE.handbrakeMuHigh, clamp(sn, 0, 1) ** 3);
    const muRear = TUNE.muRear * (handbrake ? hbCut : 1);

    // ---- longitudinal force demand ----------------------------------------------------------
    const kick = state.boostKick;
    const power = (boosting ? POWER_BOOST : TUNE.powerMass) + TUNE.boostKickPower * kick;
    const traction = TUNE.tractionAccel + TUNE.boostKickAccel * kick;
    let aDrive = 0;
    if (throttle > 0) {
      // Power-limited above ~43 m/s, traction-limited below it. The max() keeps v -> 0 finite.
      aDrive = Math.min(traction, power / Math.max(av, 4)) * throttle;
    } else if (throttle < 0 && v <= 0.25) {
      aDrive = TUNE.reverseAccel * throttle;         // S with the car stopped is reverse
    }
    let brakeDemand = brake * TUNE.brakeDecel;
    if (throttle < 0 && v > 0.25) brakeDemand += -throttle * TUNE.brakeDecel;
    // Per-axle longitudinal forces. Drive is rear only; braking is split; the handbrake is rear
    // only. Each is clamped to 92% of what the tyre can hold, which is an ABS: without it a
    // 24 m/s^2 demand locks the rear and every touch of the brake is a spin.
    // A held e-brake locks the rear wheels, so they transmit no drive at all. Without this the
    // throttle simply cancelled the handbrake force (measured: 11700 N of rear drive against
    // 9000 N of e-brake left +2700 N of NET DRIVE) and a handbrake turn came out as a slightly
    // slower ordinary corner.
    const driveRear = handbrake ? 0 : TUNE.driveSplitRear;
    let fxRear = m * aDrive * driveRear - brakeDemand * m * TUNE.brakeSplitRear
      - (handbrake ? TUNE.handbrakeDecel * m : 0);
    let fxFront = m * aDrive * (1 - driveRear) - brakeDemand * m * (1 - TUNE.brakeSplitRear);
    const fxRearCap = TUNE.absHold * muRear * fzRear;
    const fxFrontCap = TUNE.absHold * TUNE.muFront * fzFront;
    fxRear = clamp(fxRear, -fxRearCap, fxRearCap);
    fxFront = clamp(fxFront, -fxFrontCap, fxFrontCap);

    // ---- steering: the explicit yaw-rate curve, then the angle that achieves it --------------
    // ACHIEVABLE lateral acceleration, not the sum of the two friction circles. Holding a steady
    // corner needs zero net yaw moment, which fixes the split at fyF = m*ay*b/L and
    // fyR = m*ay*a/L, so each axle implies its own ceiling on ay and the smaller one wins. Summing
    // the circles instead overstates it by 17% at 40 m/s because it lets the front axle produce
    // force it does not have, and the target rate then sat permanently above what the car could
    // hold — the front tyre pinned at its cap while the assist kept asking for more.
    // THE DEMAND USES UNDISTURBED LOADS AND THE UNCUT REAR MU, and that is the most important line
    // in the drift model. The target rate is what the DRIVER is asking for: it may depend on speed
    // and on the steering input, and on nothing else. Let the e-brake's grip cut or the load
    // transfer off a brake tap lower the target too, and every stabiliser keyed to it dutifully
    // lowers the yaw rate to match the grip that was just thrown away — which is the exact
    // opposite of oversteer. Measured, with transfer and the handbrake cut folded in: a handbrake
    // turn came out as |slip| 0.07 and a brake tap under load moved the slip angle from 4.0 to
    // 7.0 deg and never armed the drift state at all. Grip loss belongs in the tyre forces below;
    // the GAP between the demand and what the tyres can deliver is the slide.
    const aLatMax = Math.min(TUNE.muFront * fzFront0 * L / (m * b),
      TUNE.muRear * fzRear0 * L / (m * a));
    const rGrip = TUNE.gripUse * aLatMax / Math.max(gv, 0.5);   // grip-limited, falls as 1/v
    const rGeo = gv / TUNE.minRadius;                 // geometric, rises with v
    const rTarget = state.steer * Math.min(rGrip, rGeo) * Math.sign(v || 1);
    // Steering angle for that rate: Ackermann plus the slip the tyres need to make the force.
    // (aR - aF) = (m*ay / (tyreStiff * L)) * (b/FzF - a/FzR), straight out of the linear tyre
    // model above, so it tracks load transfer and downforce instead of being a constant.
    const ayDemand = rTarget * gv;
    const understeer = (m * Math.abs(ayDemand) / (TUNE.tyreStiff * L))
      * (b / fzFront - a / fzRear);
    const servo = handbrake ? TUNE.steerServoHandbrake
      : state.drifting ? TUNE.steerServoDrift : TUNE.steerServo;
    const delta = clamp(L * rTarget / Math.max(gv, 4) + Math.sign(rTarget) * understeer
      + (rTarget - state.yawRate) * servo, -TUNE.steerMax, TUNE.steerMax);

    // ---- tyre slip angles -------------------------------------------------------------------
    // The floor in the denominator only has to keep the slip angle finite at a true standstill, and
    // it must NOT be large: at 2.5 m/s it clamped the slip angle of a sideways car to a value the
    // tyre model then treated as mild, and the lateral-state bleed below cleans up anything slower
    // than walking pace anyway.
    const vRef = Math.max(av, 0.6);
    const alphaF = Math.atan2(state.vLat + a * state.yawRate, vRef) - delta;
    const alphaR = Math.atan2(state.vLat - b * state.yawRate, vRef);
    const satFront = TUNE.muFront / TUNE.tyreStiff, satRear = muRear / TUNE.tyreStiff;
    const fyFrontCap = latCapacity(TUNE.muFront, fzFront, fxFront, alphaF, satFront);
    const fyRearCap = latCapacity(muRear, fzRear, fxRear, alphaR, satRear);
    const fyFront = clamp(-TUNE.tyreStiff * fzFront * alphaF, -fyFrontCap, fyFrontCap);
    const fyRear = clamp(-TUNE.tyreStiff * fzRear * alphaR, -fyRearCap, fyRearCap);

    // ---- drift state machine ----------------------------------------------------------------
    const rearSlip = Math.abs(alphaR);
    // satRear is the rear tyre's saturation slip angle, computed above: Fz cancels (both the cap
    // and the stiffness scale with it), so it is just mu / stiffness, and the handbrake's mu cut
    // moves it down, which is why the same ratios arm a drift much earlier on the e-brake.
    const satSlip = satRear;
    // ENTRY NEEDS INTENT, and this is the difference between a drift model and a car that spins
    // out of fast corners. Paradise has exactly two documented entries and both are deliberate: a
    // brake TAP under load, or the e-brake. Letting a bare rear-slip threshold arm the drift state
    // meant a cornering overshoot at 60 m/s — full lock on a keyboard, yaw responding faster than
    // sideslip — tripped it, the assist stepped back to its drift value, and the car went to a
    // 138 deg/s flat spin. Measured, on the way to and including 78 m/s.
    const intent = handbrake || brake > 0.15 || throttle < 0;
    if (!state.drifting) {
      if (rearSlip > satSlip * TUNE.driftEnterRatio && intent) {
        state.drifting = true;
        driftHold = TUNE.driftMinHold;
      }
    } else {
      driftHold = Math.max(0, driftHold - h);
      if (rearSlip < satSlip * TUNE.driftExitRatio && driftHold <= 0 && av > 1) state.drifting = false;
      if (av <= 1) state.drifting = false;
    }

    // ---- integrate ---------------------------------------------------------------------------
    const aLatBody = (fyFront + fyRear) / m;
    // Scrub: a saturated tyre drags along the direction of travel by Fy * sin(alpha). This is
    // where a drift loses speed, and it is why the research's "low scrub, recoverable" reads as
    // a few percent over five seconds rather than either zero or a handbrake turn.
    const scrub = TUNE.scrubGain
      * (Math.abs(fyFront * Math.sin(alphaF)) + Math.abs(fyRear * Math.sin(alphaR))) / m;
    // Drag and scrub both oppose the DIRECTION OF TRAVEL, so they are resolved along the velocity
    // vector rather than dumped entirely onto the longitudinal axis. On a straight the two are the
    // same thing; at 45 deg of slip, charging all of it to the longitudinal axis over-brakes the
    // car by 1/cos(45) and leaves the sideways component undamped.
    const aResist = TUNE.coastDecel + CD * gv * gv + scrub;
    const dirL = gv > 0.1 ? v / gv : Math.sign(v || 1);
    const dirS = gv > 0.1 ? state.vLat / gv : 0;
    // Longitudinal force the tyres and the air actually apply. This, NOT dv/dt in the rotating
    // body frame, is what loads the suspension, and the distinction is not academic: feeding the
    // rotating-frame value into the load transfer put a positive feedback loop through the tyres
    // (a big yaw rate makes a big -r*vLat term, which reads as heavy braking, which unloads the
    // rear, which lets the rear go, which grows the yaw rate) and the car went from a 33 deg/s
    // corner to a 138 deg/s flat spin in 0.5 s at 40 m/s. Measured, with fzRear collapsing from
    // 9600 N to 2870 N on the way.
    const aTyre = (fxFront + fxRear) / m - aResist * dirL;
    // LOAD TRANSFER COMES FROM THE FORCES THE DRIVER COMMANDS, i.e. drive and brake, and not from
    // the scrub of a sliding tyre. Both are longitudinal forces at the contact patch, so folding
    // scrub in looks more complete - but it manufactures a drift the player cannot get out of: the
    // deeper the slide, the bigger the scrub, the more load moves onto the front axle, the more
    // front grip there is to keep pulling the car around. Measured with scrub included, a 40 deg
    // e-brake slide sat at a stable 41 deg with FULL OPPOSITE LOCK HELD for four seconds and only
    // ended when the car ran out of speed. Aero drag is excluded for the honest reason too: it acts
    // at the aero centre, not at ground level, so it barely pitches the car.
    const aTransfer = (fxFront + fxRear) / m - TUNE.scrubTransfer * scrub * dirL;
    // The transport term belongs in the body-frame velocity update, and only there.
    let aLong = aTyre + state.yawRate * state.vLat;
    if (throttle > 0 && aDrive > 0) aLong = Math.min(aLong, traction);   // never out-pull the tyres

    // The assist pulls the yaw rate toward the curve's target rate. This is the arcade stability
    // control, and it is what makes a binary keyboard input drivable at 250 km/h: with it set to
    // zero (a kill-control anyone can run) full lock at 60 m/s diverges into a flat spin inside
    // 1.3 s, because past the grip limit the front tyre's pro-turn moment beats the rear's
    // restoring one. It is WEAKER but not absent while drifting, so a slide stays a slide — the
    // assist only ever touches the yaw rate, never the lateral velocity, and the lateral velocity
    // IS the drift. Note the target is a BOUNDED rate, so the assist can no longer chase a
    // kinematic rate the tyres cannot deliver and overshoot the car into a spin doing it.
    const yawRef = rTarget;
    let yawAccel = (a * fyFront - b * fyRear) / TUNE.izz;
    if (handbrake) {
      yawAccel += (yawRef - state.yawRate) * TUNE.handbrakeAssist
        - state.yawRate * TUNE.driftAngularDamping;
    } else if (state.drifting) {
      yawAccel += (yawRef - state.yawRate) * TUNE.driftStabilityAssist
        - state.yawRate * TUNE.driftAngularDamping;
    } else {
      yawAccel += (yawRef - state.yawRate) * TUNE.stabilityAssist;
    }
    const excess = Math.abs(state.yawRate) - Math.abs(rTarget);
    if (excess > 0) yawAccel -= Math.sign(state.yawRate) * excess * TUNE.spinDamp;

    state.speed = v + aLong * h;
    state.vLat += (aLatBody - aResist * dirS - state.yawRate * v) * h;
    state.yawRate = clamp(state.yawRate + yawAccel * h, -TUNE.yawRateMax, TUNE.yawRateMax);
    aLongPrev = aTransfer;

    if (state.speed < 0) state.speed = Math.max(state.speed, -TUNE.reverseMax);
    state.speed = Math.min(state.speed, boosting ? TUNE.vMaxBoost : TUNE.vMax);
    // Below walking pace nothing is sliding; bleed the lateral states out so a parked car does
    // not creep sideways forever on a residual. THE TEST IS GROUND SPEED, not `state.speed`:
    // `state.speed` is the longitudinal component, which passes through zero when the car is fully
    // sideways, and keying on it meant a car sliding sideways at 253 km/h was treated as parked and
    // had its entire drift deleted at 8/s. Measured in the live game: ground speed fell 253 -> 28
    // km/h in 0.24 s, i.e. 26 g of deceleration out of nowhere, and a high-speed e-brake turn always
    // ended at a standstill.
    if (Math.hypot(state.speed, state.vLat) < 1.5) {
      state.vLat = damp(state.vLat, 0, 8, h);
      state.yawRate = damp(state.yawRate, 0, 8, h);
    }

    state.yaw += state.yawRate * h;
    forward(fwd); leftward(side);
    state.pos.addScaledVector(fwd, state.speed * h);
    state.pos.addScaledVector(side, state.vLat * h);
    state.distance += Math.abs(state.speed) * h;

    // ---- body attitude ----------------------------------------------------------------------
    // slipAngle is the angle between where the nose points and where the car is going, positive
    // when the tail is out to the right (a left-hand slide), so it matches the retired `slip`.
    state.slipAngle = -Math.atan2(state.vLat, Math.max(av, 0.6));
    state.slip = damp(state.slip, clamp(state.slipAngle / TUNE.slipRef, -1, 1), 9, h);
    // NEGATIVE in a left turn: see SIGN CONVENTIONS. aLatBody is positive (leftward) in a left
    // turn, so the minus sign here is the whole fix for the body banking the wrong way.
    state.lean = damp(state.lean, clamp(-aLatBody / TUNE.leanRef, -1.2, 1.2), 7, h);
    return aLong;
  }

  const p = {
    state, TUNE,

    reset(pos, yaw = 0, speed = 0) {
      state.pos.copy(pos); state.yaw = yaw; state.speed = speed;
      state.steer = 0; state.slip = 0; state.lean = 0; state.pitch = 0;
      state.boost = 1; state.boosting = false; state.boostBlend = 0; state.boostKick = 0;
      state.crashed = false; state.vy = 0; state.airborne = false; state.distance = 0;
      state.vLat = 0; state.yawRate = 0; state.slipAngle = 0; state.drifting = false;
      state.chain = 0; state.impact = 0; state.accelG = 0;
      state.ground = Math.abs(speed); prevGround = speed;
      boostLatch = false; driftHold = 0; aLongPrev = 0; wallCool = 0;
    },

    setInput(i) { input = Object.assign({ throttle: 0, brake: 0, steer: 0, boost: false, handbrake: false }, i); },

    /** Steer toward a point `lookahead` metres down the given path. */
    followPath(path, lookahead = 24) { auto = { path, lookahead }; },
    clearPath() { auto = null; },

    /** Snap the car onto a path at parameter u, facing along it. */
    placeOnPath(path, u, speed = 0) {
      const pt = path.at(u), t = path.tangentAt(u);
      state.pos.copy(pt);
      state.yaw = Math.atan2(t.x, t.z);
      state.speed = speed;
      state.vLat = 0; state.yawRate = 0; state.slip = 0; state.slipAngle = 0;
      state.drifting = false; aLongPrev = 0;
    },

    step(dt) {
      if (auto) {
        // AUTOPILOT. The seven screenshot presets and tools/fps.mjs drive through here, so it has
        // to keep the car on the carriageway now that the car can no longer turn at a physically
        // impossible rate. Three terms: pure pursuit for the steering, a yaw-rate damper so the
        // binary-ish command does not weave, and a curvature speed cap so it slows for a corner
        // instead of understeering off it. Only steer/throttle/brake are written, never `boost`
        // — tools/fps.mjs relies on reading Shift off the live keyboard while lane-keeping.
        const path = auto.path;
        const near = path.nearest(state.pos);
        const du = auto.lookahead / path.length;
        const target = path.at(near.u + du);
        const toT = tmp.copy(target).sub(state.pos);
        const want = Math.atan2(toT.x, toT.z);
        let diff = want - state.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        // Heading error plus CROSS-TRACK error. A yaw-rate damping term was tried here instead and
        // it is wrong by construction: on a sustained curve the yaw rate is a constant, so damping
        // it is a constant steering bias, and the car settled 10.1 m wide of a 140 m radius and
        // stayed there. Cross-track error goes to zero when the car is on the line, which is the
        // property a lane-keeper needs.
        const onPath = path.at(near.u);
        leftward(side);
        const lat = (onPath.x - state.pos.x) * side.x + (onPath.z - state.pos.z) * side.z;
        input.steer = clamp(diff * 2.2 + lat * 0.06, -1, 1);
        // Curvature over the lookahead window, from the path's own tangents.
        const t0 = path.tangentAt(near.u), t1 = path.tangentAt(near.u + du * 2);
        let dAng = Math.atan2(t1.x, t1.z) - Math.atan2(t0.x, t0.z);
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        const kappa = Math.abs(dAng) / Math.max(auto.lookahead * 2, 1);
        const sn = clamp(Math.abs(state.speed) / TUNE.vMax, 0, 1.4);
        const aLatMax = Math.min(TUNE.muFront, TUNE.muRear) * G * (1 + TUNE.downforce * sn * sn);
        // Half the theoretical grip limit. The follower has to make the corner with the yaw rate
        // the car can actually hold, and `aLatMax` here is the optimistic version (no load
        // transfer, no moment-balance term, no gripUse reserve); at 0.65 the follower asked for a
        // 140 m radius at 55 m/s, sat at full lock and still ran 29 m wide in a limit cycle.
        const vSafe = Math.sqrt(0.50 * aLatMax / Math.max(kappa, 1e-5));
        input.throttle = state.speed < vSafe ? 1 : 0;
        input.brake = state.speed > vSafe * 1.05 ? 0.55 : 0;
      }

      const throttle = clamp(input.throttle, -1, 1);

      // ---- boost economy ---------------------------------------------------------------------
      // PUBLISHED: a Speed boost bar is usable only when COMPLETELY full. So the button ARMS a
      // latch from a full tank and the latch holds until the tank empties or the button is
      // released; there is no metering a sliver of bar. This is the single change that most
      // alters the rhythm of play: boost becomes a resource you bank and dump.
      if (input.boost && !boostLatch && state.boost >= 0.999 && throttle > 0) boostLatch = true;
      if (!input.boost || state.boost <= 0) boostLatch = false;
      const boosting = boostLatch && throttle > 0;
      const wasBoosting = state.boosting;
      state.boosting = boosting;
      state.boostBlend = damp(state.boostBlend, boosting ? 1 : 0, boosting ? 5 : 2.2, dt);
      // The kick fires on the RISING edge and decays; it is what boost feels like, per the
      // research's correction that Paradise boost is an acceleration event, not a ceiling lift.
      if (boosting && !wasBoosting) state.boostKick = 1;
      state.boostKick = boosting
        ? state.boostKick * Math.exp(-dt / TUNE.boostKickTau)
        : Math.max(0, state.boostKick - dt * 4);

      const driftAmount = clamp(Math.abs(state.slipAngle) / TUNE.slipRef, 0, 1);
      if (boosting) {
        state.boost = clamp(state.boost - dt / TUNE.boostDuration, 0, 1);
        state.chain += driftAmount * dt;
        if (state.boost <= 0) {
          if (state.chain >= TUNE.chainDriftNeeded) {
            state.boost = 1;            // Burnout Chain: refilled outright, the chain continues
            state.chain = 0;
          } else {
            state.boost = TUNE.burnoutRefill;   // a burnout refills a portion, and the run ends
            state.chain = 0;
            boostLatch = false;
          }
        }
      } else {
        state.chain = 0;
        const sn = clamp(Math.abs(state.speed) / TUNE.vMax, 0, 1.4);
        const danger = clamp((sn - 0.5) / 0.5, 0, 1);
        const earn = TUNE.boostEarnCruise * (0.35 + 0.65 * sn)
          + TUNE.boostEarnDanger * danger
          + TUNE.boostEarnDrift * driftAmount;
        state.boost = clamp(state.boost + earn * dt, 0, 1);
      }

      // ---- integrate the chassis at a fixed substep -------------------------------------------
      const n = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-9));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        substep(h, throttle, clamp(input.brake, 0, 1), input.steer, boosting, !!input.handbrake);
        collide(h);
      }

      // GROUND SPEED, not the body-frame longitudinal component. `state.speed` is vLong, which is
    // the right quantity for the tyre model but diverges from the real speed once the car is
    // sideways, and its derivative then reads as violent braking that never happened: measured, a
    // 60 deg drift produced accelG = -128 m/s^2 purely from the -yawRate*vLat transport term. That
    // is over camera.js's jerk > 70 threshold, so every hard drift used to fire the CRASH shake.
    state.ground = Math.hypot(state.speed, state.vLat);
    const groundSigned = state.ground * Math.sign(state.speed || 1);
    state.accelG = (groundSigned - prevGround) / Math.max(dt, 1e-4);
    prevGround = groundSigned;
      state.pitch = damp(state.pitch, clamp(-state.accelG * 0.0035, -0.05, 0.05), 6, dt);
      state.impact = Math.max(0, state.impact - dt * 2.2);
      state.pos.y = 0;
      return state;
    },
  };

  return p;
}
