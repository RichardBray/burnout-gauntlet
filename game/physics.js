// physics.js — hand-rolled arcade car handling (no physics engine, fully deterministic).
// API: createPhysics({blocks}) -> p.  p.state {pos,yaw,speed,steer,slip,lean,pitch,boost,...}
//   p.reset(pos,yaw,speed) p.setInput({throttle,brake,steer,boost,handbrake})
//   p.followPath(path, lookahead) drives itself; p.step(dt) advances one fixed tick.

import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';

export const TUNE = {
  vMax: 78,          // m/s  (~281 km/h)
  vMaxBoost: 104,    // m/s  (~374 km/h)
  accel: 16.5,
  boostAccel: 30,
  brakeDecel: 30,
  coastDrag: 0.55,
  reverseMax: 12,
  turnRate: 1.55,    // rad/s at the sweet spot
  gripLow: 0.28,     // speed (fraction of vMax) where turning peaks
  driftGain: 0.9,
  boostDrain: 0.19,  // per second at full throttle
  boostRefill: 0.055,
};

export function createPhysics({ blocks = [], bounds = 1400 } = {}) {
  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,
    steer: 0,        // smoothed -1..1
    slip: 0,         // -1..1 lateral slide
    lean: 0,
    pitch: 0,
    boost: 1,        // 0..1 tank
    boosting: false,
    boostBlend: 0,   // 0..1 smoothed visual boost
    accelG: 0,
    airborne: false,
    vy: 0,
    crashed: false,
    distance: 0,
  };

  let input = { throttle: 0, brake: 0, steer: 0, boost: false, handbrake: false };
  let auto = null;

  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function forward(out) { return out.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)); }

  function collide() {
    // keep the car out of the building blocks (axis-aligned, sidewalk inclusive)
    for (const b of blocks) {
      const hx = b.w / 2 + 1.0, hz = b.d / 2 + 1.0;
      const dx = state.pos.x - b.cx, dz = state.pos.z - b.cz;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
        if (px < pz) state.pos.x = b.cx + Math.sign(dx || 1) * hx;
        else state.pos.z = b.cz + Math.sign(dz || 1) * hz;
        state.speed *= 0.62;
        return true;
      }
    }
    if (Math.abs(state.pos.x) > bounds) { state.pos.x = Math.sign(state.pos.x) * bounds; state.speed *= 0.5; }
    if (Math.abs(state.pos.z) > bounds) { state.pos.z = Math.sign(state.pos.z) * bounds; state.speed *= 0.5; }
    return false;
  }

  const p = {
    state, TUNE,

    reset(pos, yaw = 0, speed = 0) {
      state.pos.copy(pos); state.yaw = yaw; state.speed = speed;
      state.steer = 0; state.slip = 0; state.lean = 0; state.pitch = 0;
      state.boost = 1; state.boosting = false; state.boostBlend = 0;
      state.crashed = false; state.vy = 0; state.airborne = false; state.distance = 0;
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
    },

    step(dt) {
      if (auto) {
        const near = auto.path.nearest(state.pos);
        const du = auto.lookahead / auto.path.length;
        const target = auto.path.at(near.u + du);
        const toT = tmp.copy(target).sub(state.pos);
        const want = Math.atan2(toT.x, toT.z);
        let diff = want - state.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        input.steer = clamp(diff * 2.2, -1, 1);
        input.throttle = 1;
        input.brake = 0;
      }

      const prevSpeed = state.speed;
      state.steer = damp(state.steer, clamp(input.steer, -1, 1), 12, dt);

      const boosting = !!input.boost && state.boost > 0.001 && input.throttle > 0;
      state.boosting = boosting;
      state.boostBlend = damp(state.boostBlend, boosting ? 1 : 0, boosting ? 5 : 2.2, dt);
      if (boosting) state.boost = clamp(state.boost - TUNE.boostDrain * dt, 0, 1);
      else state.boost = clamp(state.boost + TUNE.boostRefill * dt, 0, 1);

      const vMax = lerp(TUNE.vMax, TUNE.vMaxBoost, state.boostBlend);
      const a = lerp(TUNE.accel, TUNE.boostAccel, state.boostBlend);

      if (input.throttle > 0) {
        const headroom = clamp(1 - state.speed / vMax, 0, 1);
        state.speed += a * input.throttle * (0.25 + 0.75 * headroom) * dt;
      } else if (input.throttle < 0) {
        state.speed -= TUNE.brakeDecel * 0.5 * dt;
        state.speed = Math.max(state.speed, -TUNE.reverseMax);
      }
      if (input.brake > 0) {
        state.speed -= TUNE.brakeDecel * input.brake * dt;
        if (state.speed < 0) state.speed = Math.max(state.speed, -TUNE.reverseMax);
      }
      // drag
      const dragF = TUNE.coastDrag * (state.speed / TUNE.vMax) ** 2 * TUNE.vMax;
      state.speed -= Math.sign(state.speed) * dragF * dt;
      if (input.throttle === 0 && input.brake === 0) state.speed = damp(state.speed, 0, 0.35, dt);
      state.speed = clamp(state.speed, -TUNE.reverseMax, vMax);

      // steering authority: nothing at rest, peak at ~30 % vMax, tapering at top end
      const sn = clamp(Math.abs(state.speed) / TUNE.vMax, 0, 1.4);
      const authority = clamp(sn / TUNE.gripLow, 0, 1) * (1 / (1 + Math.max(0, sn - TUNE.gripLow) * 1.35));
      const yawRate = state.steer * TUNE.turnRate * authority * Math.sign(state.speed || 1);
      state.yaw += yawRate * dt;

      // slide / body attitude
      const lat = yawRate * state.speed;
      const targetSlip = clamp(lat / 34, -1, 1) * (input.handbrake ? 2.2 : 1) * TUNE.driftGain;
      state.slip = damp(state.slip, targetSlip, 6, dt);
      state.lean = damp(state.lean, clamp(lat / 26, -1.2, 1.2), 7, dt);

      state.accelG = (state.speed - prevSpeed) / Math.max(dt, 1e-4);
      state.pitch = damp(state.pitch, clamp(-state.accelG * 0.0035, -0.05, 0.05), 6, dt);

      forward(fwd);
      // drifting means the car travels slightly sideways of where it points
      const side = tmp.set(fwd.z, 0, -fwd.x).multiplyScalar(state.slip * 0.16);
      state.pos.addScaledVector(fwd, state.speed * dt);
      state.pos.addScaledVector(side, state.speed * dt);
      state.distance += Math.abs(state.speed) * dt;

      collide();
      state.pos.y = 0;
      return state;
    },
  };

  return p;
}
