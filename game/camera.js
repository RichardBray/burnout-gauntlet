// camera.js — chase rig: critically-damped spring follow, speed/boost FOV, look-ahead,
// yaw lag, noise shake, collision pull-in, plus orbit + fixed modes.
// API: createCamRig(camera) -> rig. rig.configure({mode,distance,height,lookAhead,lookHeight,fov,
//   fovSpeed,fovBoost,shake,roll,orbitRadius,orbitHeight,orbitSpeed,orbitStart,orbitTarget,
//   offset,target,...}) then rig.update(dt, carState).
//   rig.tweak(o) partial edit. rig.snap() teleports the rig to its target (after repositioning
//   the car). rig.impulse(0..1) kicks the shake for an impact. rig.setColliders([{cx,cz,w,d}])
//   overrides the world blocks used for the occlusion raycast.
//
// FRAMING NOTE (reference/dusk-highway-chase-0{2,3}.jpg): Burnout's chase cam is much closer and
// much flatter than a generic "distance + height" rig. Measured off the stills at native
// resolution, with the horizon solved from the guardrail vanishing point (-02) and from two
// equal-height streetlamps (-03), the hero car covers 19.1-20.5% of frame height MEASURED TO THE
// ROOF PANEL (the -03 roof scoop and our wing are appendages ~1.8% above it; include them and the
// same cars read 20.9-21.7%), its contact line sits at 0.769-0.771 of frame height, the
// roof-to-horizon gap is 7.8-8.8%, and the horizon lands at 48-50%. The camera is barely tilted
// down (1-2 deg) on the ~42-44 deg lens the refs use, and it is ~2.1 m up, not the ~1.5 m this
// note used to claim.
//
// The load-bearing number is DEPRESSION = (roof - horizon) / (contact - horizon), target
// 0.29-0.30. It is SCENE-GENERIC: a ratio of two vertical offsets from the same horizon, so focal
// length, resolution and aspect all cancel out of it (confirmed by an empirical sweep — the r7
// sweep moves it only through real pose changes, never through the lens). The retired 0.21-0.22
// target came from measuring -03's roof SCOOP as if it were the roofline; do not resurrect it.
//
// Scene configs give the rig a classic distance/height/lookHeight triple; FRAME below reshapes
// that triple into the Burnout pose, so every chase scene inherits the same framing language —
// and, since r8, holds that pose at every speed rather than only at the one it was solved at.

import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep, makeRng } from './util.js';

const DEG = Math.PI / 180;
const V_REF = 78;         // m/s — physics TUNE.vMax, the speed all curves normalise against
const LOOKH_REF = 1.05;   // the lookHeight the pitch model is calibrated at

/** Reshapes scene config into the measured Burnout pose. See FRAMING NOTE. */
const FRAME = {
  // Standoff, expressed against the scene's BASE lens: the counter-zoom below multiplies it down
  // as the lens opens (0.941 at the 44.4 deg cruise lens), so 1.293 here is the 1.217 the pose was
  // solved at. Raised from 1.16 purely to hold the r7 pose once distSpeed stopped inflating it.
  distScale: 1.293,       // ~5.6 m of clear air behind the rear bumper, per the stills
  // Speed does NOT back the lens off. Burnout's chase cam holds the car at one size and lets the
  // WORLD stretch past it; a positive distSpeed here stacked with the FOV swing and the height
  // droop to shrink the car by 24% and walk the contact line 0.085 of frame height from rest to
  // vMax, which is why the pose only scored at one speed. See DOLLY-COUNTER-ZOOM below.
  distSpeed: 0.0,
  // Boost punches the lens IN while the FOV opens out, so the car holds its size in frame while
  // the world stretches past it — that pairing is the whole read of a Burnout boost shot, and the
  // counter-zoom below now delivers it exactly, so this term FLIPS SIGN: it is no longer the
  // punch-in, it is the residual give-back. A boost opens the lens ~10 deg more than speed alone,
  // where a full-authority counter-zoom would crowd the car 11% closer than boost-blur's authored
  // pose (which was solved against the old shrinking law: carH 28.0%, contact 0.836). +0.08 hands
  // that back. When a scene next re-authors its own boost standoff, this should go to 0.
  distBoost: 0.08,
  // LENS: Burnout's chase cam is a ~72 deg horizontal / ~44 deg vertical lens (solved off
  // dusk-highway-chase-03.jpg, where a 2.0 m car spans 23.1% of frame width). Scenes author a
  // sane base fov in the low 40s; the speed/boost swing is a *relative* widening on top of it,
  // and fovMax is the hard stop that keeps any scene from drifting back to a fisheye.
  fovGain: 0.60,          // scenes ask for 8-12 deg of swing, which lands at ~5-7 deg rendered
  fovMax: 58,
  // 1.05 minus the 4% droop the rig used to carry at cruise: the pose was solved WITH that droop
  // applied, so folding it in as a constant keeps the depression ratio where it was measured.
  heightScale: 1.029,
  // Height is what sets the depression ratio, and depression is the one pose number that is
  // scene-generic, so nothing speed-dependent may touch it: a droop here pulls the SAME way as
  // the FOV swing (car up the frame, contact line rising) instead of compensating it.
  heightDroop: 0.0,       // rig sinks this fraction at vMax
  // On the tight lens every degree of tilt is worth ~1.3x the pixels it was on the wide one, so
  // the down-pitch is trimmed to hold the horizon at 49-51% and the contact patch at 74-84%.
  pitchBase: 0.12,        // deg nose-down standing still
  pitchSpeed: 0.30,       // + deg at vMax: more road in frame the faster you go
  // SURGE IS AN IMPULSE, NOT AN OFFSET. Feeding acceleration into the spring TARGET (which
  // distAccel used to do at 0.16) is a *sustained proportional standoff offset*: hold the
  // throttle and the rig settles to a new pose in ~1.2 s and stays there, and the
  // dolly-counter-zoom cannot see it because that only compensates the authored term. On the
  // ~9.0 m standoff, the +/-26 m/s^2 the sim really produces (boost launch +29.8, braking from
  // 70 m/s -29.25) moved the standoff +/-46%, which put the car at 40% of frame height and
  // cropped its rear bumper off the bottom edge under braking.
  // So the surge is now injected as VELOCITY into the longitudinal spring, proportional to the
  // CHANGE in acceleration (jerk). A step in throttle or brake spends a fixed velocity budget
  // once; while the input is held the jerk is zero, so the critically-damped spring carries the
  // car back to the authored size on its own. distAccel is kept only as a small residual
  // positional authority so a sustained load still reads as a slightly deeper standoff.
  distAccel: 0.02,        // metres of standoff per m/s^2 of sustained longitudinal acceleration
  accelImpulse: 0.055,    // m/s of spring velocity per m/s^2 of CHANGE in acceleration
  // Deg of extra aim tilt per rad of CHASSIS pitch (physics.js saturates that at 0.05 rad under
  // any load, so this is the whole authority). It was 4.0, i.e. 0.2 deg at full brake/launch, and
  // on this lens 0.2 deg walks the horizon 0.49% of frame height — which shows up as a load-
  // proportional DEPRESSION drift of ~0.012, half of the 0.29-0.30 band, for a tilt too small to
  // see. Same defect class as distAccel: a sustained pose bias sold as a surge.
  pitchChassis: 1.5,
  pitchCrest: 0.55,       // deg per m/s of vertical velocity, raising the aim over crests
  pitchRate: 3.2,         // smoothing rate of the pitch angle itself

  // ---- BOOST ONSET (wave S) ---------------------------------------------------------------
  // WHAT IS SOURCED AND WHAT IS NOT, stated plainly because it matters here more than anywhere
  // else in this file. docs/BURNOUT-HANDLING.md section 5 marks every boost-camera figure
  // `NOT FOUND`: no source publishes Paradise's fov push, pull-back, shake or chromatic edge, and
  // the research agent's own attempt to measure it off footage was retracted as confounded (the
  // A/B frames differed in speed, a collision was in shot, and the red mask picked up sparks).
  // So there is NO Burnout number to match, and the four constants below are OURS. What IS sourced
  // is the character: `BoostKickAcceleration`, an initial burst rather than a sustained ceiling
  // lift, is the felt event of Paradise boost. Everything here is therefore keyed to
  // `state.boostKick` — physics.js's front-loaded envelope of exactly that burst, set to 1 on the
  // rising edge of the boost button and decaying with a 0.9 s time constant.
  //
  // The design consequence that is NOT arbitrary: these are TRANSIENTS, worth nothing after ~2 s.
  // The steady boost pose is authored by the scenes and was solved against the reference stills,
  // and the `boost-blur` preset captures at simTime 8.0 s with boost held from t=0, where
  // boostKick is e^(-8/0.9) = 1.2e-4. Measured, that preset's rendered fov and standoff are
  // unchanged to 0.01 deg and 0.01 m by everything below, which is exactly the point: the punch is
  // felt while driving and cannot move a still.
  // 5.0 deg, sized by a measurement rather than by taste: the scene's own boost swing arrives
  // through cfg.fovAttack over ~0.5 s, so for the onset to read as a PUNCH the kick has to deliver
  // most of the total swing inside the first 100 ms and then hand it back. At 3.5 deg it delivered
  // 57% of the swing in 100 ms and never exceeded the settled boost lens at all; at 5.0 it
  // delivers 76% in 100 ms and overshoots the settled value by 1.2 deg before decaying.
  kickFov: 5.0,
  kickPunch: 0.55,        // m the lens dives IN at kick = 1, on top of the steady boost standoff
  kickShake: 0.045,       // added shake amplitude at kick = 1
  kickLead: 0.30,         // extra fraction of lookAhead at kick = 1
  // Collision. physics.js now grades a contact by its closing speed along the wall normal and
  // publishes `state.impact` (0..1, decaying). The old rig could only see `crashed`, which crash.js
  // sets for a full wreck, so a 100 km/h square hit into a facade that did not trigger the crash
  // module moved the camera not at all.
  impactShake: 0.85,
  // Rad the rig azimuth lags the car's heading, toward the direction of travel, at |slip| = 1
  // (physics.js slipRef = 0.45 rad, so |slip| = 1 is a 25.8 deg slide). See the block at camYaw.
  slipAim: 0.32,
};

const DEFAULTS = {
  mode: 'chase',          // 'chase' | 'orbit' | 'fixed'
  distance: 7.4,
  height: 1.75,
  lookAhead: 9.0,
  lookHeight: 1.25,
  fov: 44,
  fovSpeed: 8,            // extra degrees at vMax (before fovGain)
  fovBoost: 10,           // extra degrees at full boost (before fovGain)
  fovAttack: 7.5,         // punches out fast...
  fovRelease: 1.9,        // ...and crawls back
  // User tuning session (T9): 6.5 -> 4.98 and 8.0 -> 5.96. A laggier follow and a laggier aim, so
  // the car leads the frame under acceleration and the camera catches up instead of being welded on.
  stiffness: 4.98,        // base spring rate (see AXIS multipliers)
  lookStiffness: 5.96,
  shake: 1.0,
  roll: 0.55,             // camera bank into corners
  // User feel: left/right camera too snappy. 5.4 -> 3.78 (-30%) -> 3.02 (-20% more).
  // Then reversed by the T9 tuning session: 3.02 -> 5.24. Driven live rather than judged off a
  // still, 3.02 read as the rig failing to keep up through quick direction changes.
  yawLag: 5.24,           // rad/s the rig azimuth chases the car's yaw — lower = more lag
  slipSwing: 2.1,         // metres the tail swings across frame per unit of slip
  // Same stack: 0.26 -> 0.182 (-30%) -> 0.146 (-20% more).
  steerLead: 0.146,       // rad the aim point leads per unit of steer
  surface: 0,             // 0 smooth .. 1 broken tarmac, feeds the shake
  collide: true,          // raycast car -> desired camera position, pull in on a hit
  camRadius: 0.5,         // keep-out padding around geometry
  minHeight: 0.55,        // never sink into the road
  colliders: null,        // [{cx,cz,w,d}] AABBs; defaults to the world's building blocks
  // orbit mode
  orbitRadius: 9,
  orbitHeight: 3.2,
  orbitSpeed: 0.18,
  orbitStart: 0.0,
  orbitTarget: new THREE.Vector3(0, 0.9, 0),
  // fixed mode (car-local offset + look target)
  offset: new THREE.Vector3(4.2, 1.5, 3.6),
  target: new THREE.Vector3(0, 0.85, 0.6),
};

// Per-axis spring rates, as multiples of cfg.stiffness. Longitudinal is the softest so the car
// visibly surges away under power and settles back into frame under braking; vertical is the
// stiffest so crests and kerbs do not bounce the whole frame.
// lat 1.65 -> 1.155 (-30%) -> 0.924 (-20% more): softer side-to-side spring on yaw.
const AXIS = { long: 0.80, lat: 0.924, vert: 2.30 };

/** Exact critically-damped spring step. Returns nothing; writes [error, velocity] into out. */
function springStep(err, vel, omega, dt, out) {
  const e = Math.exp(-omega * dt);
  const a = vel + omega * err;
  out[0] = (err + a * dt) * e;
  out[1] = (vel - a * omega * dt) * e;
}

/** Shortest signed angle from a to b. */
function angDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createCamRig(camera) {
  let cfg = Object.assign({}, DEFAULTS);

  const pos = new THREE.Vector3();          // sprung camera position (pre-shake)
  const look = new THREE.Vector3();         // smoothed aim point
  const desired = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const rigFwd = new THREE.Vector3();
  const rigSide = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const camSide = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const spring = [0, 0];

  // chase spring state, expressed in the rig's own frame (longitudinal / lateral / vertical)
  let offL = 0, offS = 0, offY = 0;
  let velL = 0, velS = 0, velY = 0;
  let tgtL = 0, tgtS = 0, tgtY = 0;
  let accel = 0;           // smoothed longitudinal acceleration, m/s^2
  let accelPrev = 0;       // previous frame's value, so the surge can be driven by its CHANGE
  let surgeV = 0;          // velocity budget queued for the longitudinal spring this frame
  let aheadL = 0, aheadS = 0;   // aim-point offset from the car, rig frame

  let time = 0;
  let roll = 0;
  let fov = cfg.fov;
  let camYaw = 0;          // lagged rig azimuth
  let pitch = FRAME.pitchBase * DEG;
  let occlude = 0;         // 0..1 how far the collision pull-in currently is engaged
  let impact = 0;          // decaying impact energy for the shake
  let first = true;
  let colliders = null;

  // --- deterministic value noise (no Math.random): smooth, band-limited, not jitter ----------
  const noiseRng = makeRng(0x51EED);
  const noiseTable = new Float32Array(512);
  for (let i = 0; i < noiseTable.length; i++) noiseTable[i] = noiseRng() * 2 - 1;
  const noise1 = (x, o) => {
    const xf = x + o * 97.13;
    const i = Math.floor(xf), f = xf - i;
    const a = noiseTable[((i % 512) + 512) % 512];
    const b = noiseTable[(((i + 1) % 512) + 512) % 512];
    return lerp(a, b, f * f * (3 - 2 * f));
  };
  /** Two-octave fbm, ~9 Hz body + ~26 Hz chatter — reads as a hand-held rig, not a random jump. */
  const fbm = (t, o) => noise1(t * 9.1, o) * 0.66 + noise1(t * 25.7, o + 5) * 0.34;

  // --- collision -----------------------------------------------------------------------------
  function resolveColliders() {
    if (cfg.colliders) return cfg.colliders;
    if (colliders) return colliders;
    // The rig is handed only the car state, so pick up the world's building footprints lazily.
    const w = (typeof window !== 'undefined' && window.__game) ? window.__game.world : null;
    colliders = (w && w.blocks) ? w.blocks : [];
    return colliders;
  }

  /**
   * Segment cast from the car to the desired camera position against the block AABBs.
   * Returns the fraction of the segment that is clear (1 = no hit).
   */
  function castClear(ox, oy, oz, dx, dy, dz) {
    const list = resolveColliders();
    if (!list.length) return 1;
    const pad = cfg.camRadius;
    let best = 1;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      // bw/bd is the building line; fall back to the paved block if it is absent.
      const hx = (b.bw !== undefined ? b.bw : b.w) * 0.5 + pad;
      const hz = (b.bd !== undefined ? b.bd : b.d) * 0.5 + pad;
      let t0 = 0, t1 = best;
      // x slab
      let p = ox - b.cx;
      if (Math.abs(dx) < 1e-6) { if (Math.abs(p) > hx) continue; } else {
        const inv = 1 / dx;
        let ta = (-hx - p) * inv, tb = (hx - p) * inv;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // z slab
      p = oz - b.cz;
      if (Math.abs(dz) < 1e-6) { if (Math.abs(p) > hz) continue; } else {
        const inv = 1 / dz;
        let ta = (-hz - p) * inv, tb = (hz - p) * inv;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // y slab: buildings are tall, the footprint starts at the kerb.
      if (oy + dy * t0 > 90 && oy + dy * t1 > 90) continue;
      if (t0 > 0 && t0 < best) best = t0;
    }
    return clamp(best, 0.18, 1);
  }

  const rig = {
    camera,
    get config() { return cfg; },
    /** Full replacement against the defaults — scenes own the whole rig config. */
    configure(o = {}) { cfg = Object.assign({}, DEFAULTS, o); first = true; return cfg; },
    /** Partial tweak that keeps whatever is already set. */
    tweak(o = {}) { cfg = Object.assign({}, cfg, o); return cfg; },
    snap() { first = true; },
    /** Kick the shake — crash/takedown/hard landing. strength 0..1. */
    impulse(strength = 1) { impact = clamp(Math.max(impact, impact + strength), 0, 1.6); },
    setColliders(list) { colliders = list || null; cfg.colliders = list || null; },

    update(dt, s) {
      dt = clamp(dt, 1 / 240, 1 / 15);
      time += dt;

      const speed = Math.abs(s.speed || 0);
      const speedN = clamp(speed / V_REF, 0, 1.35);
      const boostN = clamp(s.boostBlend || 0, 0, 1);
      // The BURST, not the level: 1 on the frame boost engages, decaying with physics.js's
      // boostKickTau. boostBlend is the sustained state and is already handled everywhere below.
      const kickN = clamp(s.boostKick || 0, 0, 1);
      const slip = s.slip || 0;
      const steer = s.steer || 0;

      fwd.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      side.set(fwd.z, 0, -fwd.x);

      const chase = cfg.mode === 'chase';

      // ---- rig azimuth: lags the car's yaw so the car rotates inside the frame -------------
      // ---- WAVE-S ROUND 2: THE SIGN OF THE DRIFT TERM WAS BACKWARDS. ------------------------
      // This read `s.yaw + slip * 0.30`. `slip` is POSITIVE in a left-hand slide (tail out to the
      // right) and `yaw` grows to the LEFT, so adding it aimed the rig FURTHER round the corner
      // than the car itself: the rig out-rotated the car by construction, in both directions, and
      // the e-brake's deep slip angles widened the gap exactly when the player was asking for
      // rotation. The consequence on screen is that the car's nose stays pinned to the centre of
      // frame however sideways the car is, which is why round 1's slide was unreadable even where
      // it existed - a chase camera that does not lag cannot show you a drift.
      //
      // The rig now aims BETWEEN the car's heading and its DIRECTION OF TRAVEL, on the travel side.
      // The velocity heading is `yaw - slipAngle` (slipAngle is the angle from the nose to the
      // velocity, positive tail-out-right), so with `slip` the normalised angle the term is
      // `- slip * slipAim`. At full slip the rig sits 18.3 deg behind the nose, so the car visibly
      // rotates inside the frame and its far flank comes into view - which is the whole read of a
      // Burnout slide. This is a MEASUREMENT, not a matched number: docs/BURNOUT-HANDLING.md marks
      // every chase-camera figure `NOT FOUND` (its own attempt to measure one off footage is
      // retracted with three named confounds), so what is asserted here is the ORDERING - the rig
      // must lag the car's heading toward the velocity vector, never lead it - and that ordering is
      // checked by tools/_handling-r2.mjs section 7 rather than scored against a reference.
      if (first) camYaw = s.yaw - slip * FRAME.slipAim;
      else {
        const wanted = s.yaw - slip * FRAME.slipAim;
        const lagK = cfg.yawLag * (1 + speedN * 0.55);
        camYaw += angDelta(camYaw, wanted) * (1 - Math.exp(-lagK * dt));
      }
      rigFwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
      rigSide.set(rigFwd.z, 0, -rigFwd.x);

      // ---- FOV: fast attack, slow release ---------------------------------------------------
      // Solved BEFORE the pose because the chase dolly counter-zooms against it in the same
      // frame (see DOLLY-COUNTER-ZOOM). `impact` is one frame old here, which is 16 ms of lag on
      // a term that is itself a damped decay — invisible, and worth it to keep the pose exact on
      // the very first (snapped) frame.
      const targetFov = Math.min(FRAME.fovMax, cfg.fov
        + (speedN * cfg.fovSpeed + boostN * cfg.fovBoost) * FRAME.fovGain
        + impact * 1.5);
      if (first) fov = targetFov;
      else fov = damp(fov, targetFov, targetFov > fov ? cfg.fovAttack : cfg.fovRelease, dt);
      // The kick rides ON TOP of the damped lens rather than through it, and outside fovMax, for
      // two reasons. Through the damp it is not a punch: at cfg.fovAttack = 7.5 the lens needs
      // ~0.3 s to chase a step, by which time the 0.9 s kick envelope has already given a third of
      // itself back, and the measured overshoot above the held boost lens was only +0.91 deg
      // arriving 0.82 s late. Applied directly it lands the full +3.5 deg on the frame the button
      // goes down and then decays exactly as the physics envelope does. Outside fovMax because it
      // is an overshoot past the scene's authored boost lens, and scenes that already sit near the
      // 58 deg ceiling (boost-blur renders 56.4) would otherwise lose the punch entirely.
      const fovRender = fov + kickN * FRAME.kickFov;
      if (Math.abs(camera.fov - fovRender) > 0.001) {
        camera.fov = fovRender; camera.updateProjectionMatrix();
      }

      // ---- desired pose --------------------------------------------------------------------
      let pitchTarget = pitch;
      if (cfg.mode === 'orbit') {
        const ang = cfg.orbitStart + time * cfg.orbitSpeed;
        const c = cfg.orbitTarget;
        desired.set(c.x + Math.sin(ang) * cfg.orbitRadius, c.y + cfg.orbitHeight,
          c.z + Math.cos(ang) * cfg.orbitRadius);
        desiredLook.copy(c);
      } else if (cfg.mode === 'fixed') {
        const o = cfg.offset;
        const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
        desired.set(
          s.pos.x + o.x * cos + o.z * sin,
          o.y,
          s.pos.z - o.x * sin + o.z * cos,
        );
        const t = cfg.target;
        desiredLook.set(
          s.pos.x + t.x * cos + t.z * sin,
          t.y,
          s.pos.z - t.x * sin + t.z * cos,
        );
      } else {
        // Longitudinal surge is driven by acceleration, not by speed: the springs below run in
        // the car's own frame, so cruising at 300 km/h costs no tracking lag while stamping on
        // the throttle (or the brake) still throws the car away from / into the lens.
        accel = damp(accel, clamp(s.accelG || 0, -26, 26), 9, dt);
        // Jerk, not level. The damp above already spreads a throttle step over ~0.3 s, so this
        // sums to exactly accelImpulse * (total change in acceleration) whatever the frame rate,
        // and goes to zero the moment the load stops changing.
        surgeV = -(accel - accelPrev) * FRAME.accelImpulse;
        accelPrev = accel;
        // DOLLY-COUNTER-ZOOM. An object of height h at distance d subtends
        // h / (d * tan(fov/2)) of the frame, so scaling d by tan(fovBase/2)/tan(fov/2) holds the
        // car at EXACTLY the size it has on the scene's base lens no matter how far the speed and
        // boost terms open that lens. The lens opening then reads as the world stretching past a
        // fixed car — Burnout's actual chase behaviour — instead of the car receding. Only the
        // authored standoff is compensated; the small residual acceleration term below is a real
        // dolly-out and is meant to shrink the car slightly, so it is added after the scaling.
        // The rest of the surge is an impulse into the spring velocity, see FRAME.accelImpulse.
        const zoomComp = Math.tan(cfg.fov * 0.5 * DEG) / Math.tan(fovRender * 0.5 * DEG);
        // The onset punch is a metre-denominated dive on top of the authored standoff, so it
        // survives the counter-zoom above (which only compensates the authored term) and reads as
        // the lens lunging at the car for the length of the burst.
        const dist = cfg.distance * FRAME.distScale * zoomComp
          * (1 + speedN * FRAME.distSpeed + boostN * FRAME.distBoost)
          + accel * FRAME.distAccel - kickN * FRAME.kickPunch;
        const hgt = Math.max(cfg.minHeight, cfg.height * FRAME.heightScale
          * (1 - speedN * FRAME.heightDroop) + boostN * 0.05);
        const swing = slip * cfg.slipSwing;
        tgtL = -dist; tgtS = -swing; tgtY = hgt - s.pos.y;
        desired.set(
          s.pos.x + rigFwd.x * tgtL + rigSide.x * tgtS,
          s.pos.y + tgtY,
          s.pos.z + rigFwd.z * tgtL + rigSide.z * tgtS,
        );
        pitchTarget = (FRAME.pitchBase + speedN * FRAME.pitchSpeed) * DEG
          - clamp((s.vy || 0) * FRAME.pitchCrest, -3, 3) * DEG
          - clamp(s.pitch || 0, -0.08, 0.08) * FRAME.pitchChassis * DEG;
      }

      // ---- position spring: critically damped, per-axis rates in the car's own frame --------
      if (first) {
        pos.copy(desired);
        offL = tgtL; offS = tgtS; offY = tgtY; velL = velS = velY = 0;
        accelPrev = accel; surgeV = 0;
      }
      if (chase && !first) {
        const base = cfg.stiffness * (1 + speedN * 0.35);
        // The throttle/brake surge enters here, as a velocity kick on the longitudinal spring,
        // so it overshoots and then recovers instead of biasing the pose (see FRAME.accelImpulse).
        velL += surgeV;
        springStep(offL - tgtL, velL, base * AXIS.long, dt, spring);
        offL = tgtL + spring[0]; velL = spring[1];
        springStep(offS - tgtS, velS, base * AXIS.lat, dt, spring);
        offS = tgtS + spring[0]; velS = spring[1];
        springStep(offY - tgtY, velY, base * AXIS.vert, dt, spring);
        offY = tgtY + spring[0]; velY = spring[1];
        pos.set(
          s.pos.x + rigFwd.x * offL + rigSide.x * offS,
          s.pos.y + offY,
          s.pos.z + rigFwd.z * offL + rigSide.z * offS,
        );
      } else if (!first) {
        // orbit / fixed rails are authored poses: track them hard, no spring personality.
        const k = 20;
        pos.x = damp(pos.x, desired.x, k, dt);
        pos.y = damp(pos.y, desired.y, k, dt);
        pos.z = damp(pos.z, desired.z, k, dt);
      }

      // ---- never push the camera through geometry ------------------------------------------
      if (cfg.collide && chase) {
        const ox = s.pos.x, oy = 1.15, oz = s.pos.z;
        const dx = pos.x - ox, dy = pos.y - oy, dz = pos.z - oz;
        const clear = castClear(ox, oy, oz, dx, dy, dz);
        const want = 1 - clear;
        // snap in on a hit, ease back out so leaving a wall does not fling the camera.
        occlude = first ? want : damp(occlude, want, want > occlude ? 24 : 3.5, dt);
        if (occlude > 1e-3) {
          const t = clamp(1 - occlude, 0.18, 1);
          pos.set(ox + dx * t, oy + dy * t, oz + dz * t);
        }
      }
      if (pos.y < cfg.minHeight) { pos.y = cfg.minHeight; if (velY < 0) velY = 0; }

      // ---- aim point: leads along the velocity vector and into the steering -----------------
      const lk = chase ? cfg.lookStiffness * (1 + speedN * 0.4) : 20;
      if (chase) {
        const la = cfg.lookAhead * (1 + speedN * 0.30 + boostN * 0.22 + kickN * FRAME.kickLead);
        // Lead angle: where the car is steering to, not where its nose currently points.
        const lead = steer * cfg.steerLead * (0.35 + 0.65 * smoothstep(0, 0.5, speedN))
          + slip * 0.18;
        const wantL = la * Math.cos(lead), wantS = la * Math.sin(lead);
        if (first) { aheadL = wantL; aheadS = wantS; }
        // Damped in the car's frame, so the lead does not shrink with road speed.
        aheadL = damp(aheadL, wantL, lk, dt);
        aheadS = damp(aheadS, wantS, lk * 0.55, dt);
        look.set(
          s.pos.x + fwd.x * aheadL + side.x * aheadS,
          0,
          s.pos.z + fwd.z * aheadL + side.z * aheadS,
        );
      }
      // (fov is snapped in the FOV block above, which now runs before the pose.)
      if (first) { pitch = pitchTarget; occlude = 0; }
      if (!chase) {
        if (first) look.copy(desiredLook);
        look.x = damp(look.x, desiredLook.x, lk, dt);
        look.z = damp(look.z, desiredLook.z, lk, dt);
      }
      if (chase) {
        pitch = damp(pitch, pitchTarget, FRAME.pitchRate, dt);
        // Solve the aim height from the pitch angle so the horizon lands where the reference
        // puts it, independent of how far ahead the aim point currently is.
        const flat = Math.hypot(look.x - pos.x, look.z - pos.z);
        look.y = pos.y - Math.tan(pitch) * flat + (cfg.lookHeight - LOOKH_REF) * 0.5;
      } else {
        look.y = damp(look.y, desiredLook.y, lk, dt);
      }

      // ---- shake ----------------------------------------------------------------------------
      impact = damp(impact, 0, 3.2, dt);
      const jerk = -(s.accelG || 0);
      if (jerk > 70) impact = Math.max(impact, clamp((jerk - 70) / 150, 0, 1));
      if (s.crashed) impact = Math.max(impact, 0.35);
      // Graded collision, not just the binary wreck flag. See FRAME.impactShake.
      if (s.impact) impact = Math.max(impact, clamp(s.impact * FRAME.impactShake, 0, 1));
      const amp = clamp(cfg.shake * (0.008 + speedN * speedN * 0.032 + boostN * 0.038
        + kickN * FRAME.kickShake
        + clamp(cfg.surface, 0, 1) * 0.028 + impact * 0.09), 0, 0.085 + kickN * 0.03);

      camFwd.subVectors(look, pos);
      const lookDist = Math.max(0.5, camFwd.length());
      camFwd.multiplyScalar(1 / lookDist);
      camSide.set(camFwd.z, 0, -camFwd.x).normalize();
      camUp.crossVectors(camSide, camFwd).normalize();

      const nx = fbm(time, 0), ny = fbm(time, 1), nz = fbm(time, 2);
      camera.position.set(
        pos.x + camSide.x * nx * amp + camUp.x * ny * amp * 0.75 + camFwd.x * nz * amp * 0.35,
        pos.y + camSide.y * nx * amp + camUp.y * ny * amp * 0.75 + camFwd.y * nz * amp * 0.35,
        pos.z + camSide.z * nx * amp + camUp.z * ny * amp * 0.75 + camFwd.z * nz * amp * 0.35,
      );

      // Angular component: swing the aim by a capped fraction of the shake so it reads as a
      // rig vibrating, never as a tripod letting go.
      const ang = Math.min(amp * lookDist * 0.30, 0.35);
      tmp.copy(look)
        .addScaledVector(camSide, fbm(time, 3) * ang)
        .addScaledVector(camUp, fbm(time, 4) * ang * 0.7);

      camera.up.set(0, 1, 0);
      camera.lookAt(tmp);

      // ---- bank -----------------------------------------------------------------------------
      const rollTarget = -slip * cfg.roll * 0.075 - (s.lean || 0) * cfg.roll * 0.012
        + fbm(time, 5) * amp * 0.5;
      roll = damp(roll, rollTarget, 6, dt);
      if (Math.abs(roll) > 1e-5) camera.rotateZ(roll);

      first = false;
    },
  };

  return rig;
}
