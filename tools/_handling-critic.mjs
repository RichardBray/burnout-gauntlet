// _handling-critic.mjs — the wave-S handling CRITIC's own instrument. Independent of
// tools/handling-measure.mjs (the builder's): every quantity below is re-derived from
// game/physics.js and game/camera.js by this file's own reductions, so a bug in the builder's
// harness cannot launder itself into the verdict.
//
// Deliberate differences from the builder's harness, so the two are genuinely independent:
//   * top speed is read as an ASYMPTOTE (the 99%/99.9% crossing times and the 300 s value), not
//     as "the value after N seconds", because the drag law makes vMax approachable but never
//     reachable and a fixed-window read is therefore a function of the window;
//   * the yaw sweep is run BOTH with the speed pinned (the research doc's section 8.3 procedure)
//     and with the car free on the throttle, because pinning `state.speed` while `vLat` is free
//     changes the ground speed the model actually keys on;
//   * drift hold is measured as time above 50% of PEAK |slipAngle| AND as time the `drifting`
//     flag stays set, and both are reported, because those are different claims;
//   * kill-controls run against physically modified copies of physics.js on disk (module-level
//     constants like CD are frozen at import, so mutating TUNE afterwards proves nothing).
//
// Usage: node tools/_handling-critic.mjs
// three shim technique borrowed from the builder's harness (there is no node_modules/three);
// the shim body below is written fresh.

import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
}
export class PerspectiveCamera {
  constructor(fov = 50) {
    this.fov = fov; this.aspect = 16 / 9; this.near = 0.1; this.far = 2000;
    this.position = new Vector3(); this.up = new Vector3(0, 1, 0); this.rotation = { z: 0 };
    this._t = new Vector3();
  }
  updateProjectionMatrix() { }
  lookAt(v) { this._t.copy(v); }
  rotateZ(a) { this.rotation.z = a; }
  getWorldDirection(v) { return v.subVectors(this._t, this.position).normalize(); }
}
export const MathUtils = { degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI };

const IS_SHIM = import.meta.url.includes('shim=1');
if (!IS_SHIM) await main();

async function main() {
const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
const shimUrl = `${import.meta.url}?shim=1`;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: shimUrl, shortCircuit: true };
    return next(spec, ctx);
  },
});

const MPH = 2.2369362920544, KMH = 3.6, DEG = 180 / Math.PI, V100 = 44.704;
const HZ = 120, DT = 1 / HZ;

/** Load a (possibly patched) copy of physics.js. `edits` are literal string replacements. */
let variantN = 0;
async function loadPhysics(edits = null) {
  if (!edits) return import('../game/physics.js');
  const dir = mkdtempSync(join(tmpdir(), 'hcritic-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
  for (const [from, to] of edits) {
    if (!src.includes(from)) throw new Error(`kill-control anchor not found: ${from}`);
    src = src.replace(from, to);
  }
  writeFileSync(join(dir, `physics${++variantN}.js`), src);
  return import(pathToFileURL(join(dir, `physics${variantN}.js`)).href);
}

const base = await loadPhysics();
const { createCamRig } = await import('../game/camera.js');

function mk(mod, speed = 0, yaw = 0, blocks = []) {
  const p = mod.createPhysics({ blocks, bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), yaw, speed);
  return p;
}
function drive(p, sec, input, onTick) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    p.setInput(typeof input === 'function' ? input(i * DT, p.state) : input);
    p.step(DT);
    onTick?.((i + 1) * DT, p.state);
  }
  return p.state;
}
const out = [];
const say = (s) => { console.log(s); out.push(s); };
function hdr(t) { say(''); say('== ' + t); }

// ---------------------------------------------------------------------------------------------
hdr('A. TOP SPEED, read as an asymptote');
// The drag coefficient is solved so that thrust == resistance exactly AT vMax, which makes vMax
// an asymptote: the car never reaches it and "top speed after N seconds" is a function of N.
// So report the crossing times as well as the value.
{
  for (const [label, boost] of [['unboosted', false], ['boosted (tank pinned full)', true]]) {
    const p = mk(base);
    const marks = {};
    const cap = boost ? base.TUNE.vMaxBoost : base.TUNE.vMax;
    drive(p, 300, () => {
      if (boost) p.state.boost = 1;             // hold the tank full to find the true ceiling
      return { throttle: 1, boost };
    }, (t, s) => {
      for (const f of [0.90, 0.95, 0.99, 0.999]) {
        if (marks[f] === undefined && s.ground >= cap * f) marks[f] = t;
      }
    });
    say(`  ${label}: ground ${p.state.ground.toFixed(2)} m/s = ${(p.state.ground * MPH).toFixed(1)} mph`
      + ` = ${(p.state.ground * KMH).toFixed(1)} km/h  (TUNE cap ${cap})`);
    say(`    t to 90% ${marks[0.90]?.toFixed(2)} s | 95% ${marks[0.95]?.toFixed(2)} s`
      + ` | 99% ${marks[0.99]?.toFixed(2)} s | 99.9% ${marks[0.999]?.toFixed(2) ?? 'never'} s`);
  }
  // 30 s is the number a player could plausibly experience on a long straight.
  const p30 = mk(base); drive(p30, 30, { throttle: 1 });
  say(`  unboosted at t=30 s: ${p30.state.ground.toFixed(2)} m/s = ${(p30.state.ground * MPH).toFixed(1)} mph`);
  const p10 = mk(base); drive(p10, 10, { throttle: 1 });
  say(`  unboosted at t=10 s: ${p10.state.ground.toFixed(2)} m/s = ${(p10.state.ground * MPH).toFixed(1)} mph`);
}

// ---------------------------------------------------------------------------------------------
hdr('B. 0-100 mph (research: 2.22 s best in game, 3.45-3.48 s fast-not-top, 4-5 s mid-tier est)');
{
  for (const [label, inp, pin] of [
    ['no boost', { throttle: 1 }, false],
    ['boost from a full bar', { throttle: 1, boost: true }, false],
    ['boost, tank pinned full', { throttle: 1, boost: true }, true],
  ]) {
    const p = mk(base);
    let t100 = null, t60 = null;
    drive(p, 20, () => { if (pin) p.state.boost = 1; return inp; }, (t, s) => {
      if (t60 === null && s.ground >= 26.8224) t60 = t;
      if (t100 === null && s.ground >= V100) t100 = t;
    });
    say(`  ${label.padEnd(24)} 0-60 mph ${t60 === null ? 'NEVER' : t60.toFixed(2) + ' s'}`
      + ` | 0-100 mph ${t100 === null ? 'NEVER' : t100.toFixed(2) + ' s'}`);
  }
  // peak launch acceleration, and whether the boost kick is visible in it
  for (const [label, inp] of [['no boost', { throttle: 1 }], ['boost', { throttle: 1, boost: true }]]) {
    const p = mk(base); let peak = 0;
    drive(p, 3, inp, (t, s) => { peak = Math.max(peak, s.accelG); });
    say(`  peak launch accel, ${label}: ${peak.toFixed(2)} m/s^2 = ${(peak / 9.81).toFixed(2)} g`);
  }
}

// ---------------------------------------------------------------------------------------------
hdr('C. YAW RATE vs SPEED at full lock (research: 28-38 deg/s player-used at ~40.2 m/s; must fall)');
{
  const speeds = [5, 10, 12.5, 15, 20, 25, 30, 40.2, 50, 60, 70, 78];
  say('   v m/s |  km/h | PINNED deg/s | radius m | slipAng deg | FREE deg/s | free v m/s');
  const pinned = {};
  for (const v of speeds) {
    // (i) research 8.3 procedure: pin state.speed at the top of every tick.
    const p = mk(base, v);
    drive(p, 3, () => { p.state.speed = v; return { steer: 1, throttle: 1 }; });
    let y0 = p.state.yaw;
    drive(p, 1, () => { p.state.speed = v; return { steer: 1, throttle: 1 }; });
    const rate = (p.state.yaw - y0) * DEG;
    const radius = v / (rate / DEG || 1e-9);
    const slipA = p.state.slipAngle * DEG;
    pinned[v] = rate;
    // (ii) free: start at v, hold throttle and full lock, let the model choose its own speed.
    const q = mk(base, v);
    drive(q, 3, { steer: 1, throttle: 1 });
    const z0 = q.state.yaw;
    drive(q, 1, { steer: 1, throttle: 1 });
    const frate = (q.state.yaw - z0) * DEG;
    say(`   ${String(v).padStart(5)} | ${(v * KMH).toFixed(0).padStart(5)} | ${rate.toFixed(1).padStart(12)}`
      + ` | ${radius.toFixed(1).padStart(8)} | ${slipA.toFixed(1).padStart(11)}`
      + ` | ${frate.toFixed(1).padStart(10)} | ${q.state.ground.toFixed(1).padStart(10)}`);
  }
  // monotonic falloff check above the peak
  let peakV = speeds[0];
  for (const v of speeds) if (pinned[v] > pinned[peakV]) peakV = v;
  const above = speeds.filter((v) => v > peakV);
  let mono = true;
  for (let i = 1; i < above.length; i++) if (pinned[above[i]] > pinned[above[i - 1]] + 0.05) mono = false;
  say(`  peak ${pinned[peakV].toFixed(1)} deg/s at ${peakV} m/s (${(peakV * KMH).toFixed(0)} km/h);`
    + ` falls monotonically above the peak: ${mono ? 'YES' : 'NO'};`
    + ` vMax/peak ratio ${(pinned[78] / pinned[peakV]).toFixed(2)}`);
  // straight-line check (research: < 0.2 deg/s)
  const st = mk(base, 40.2); drive(st, 2, { throttle: 1 });
  const sy = st.state.yaw; drive(st, 2, { throttle: 1 });
  say(`  straight-line yaw at ~40 m/s, steer 0: ${(Math.abs(st.state.yaw - sy) / 2 * DEG).toExponential(2)} deg/s`);
}

// ---------------------------------------------------------------------------------------------
hdr('D. DRIFT ENTRY: what input arms it, and at what slip angle');
{
  const trials = [
    ['steer only, throttle',        (t) => ({ steer: 1, throttle: 1 })],
    ['steer + brake TAP 0.25 s',    (t) => ({ steer: 1, throttle: t < 0.25 ? 0 : 1, brake: t < 0.25 ? 1 : 0 })],
    ['steer + brake TAP 0.5 s',     (t) => ({ steer: 1, throttle: t < 0.5 ? 0 : 1, brake: t < 0.5 ? 1 : 0 })],
    ['steer + e-brake 0.6 s',       (t) => ({ steer: 1, throttle: t < 0.6 ? 0 : 1, handbrake: t < 0.6 })],
    ['steer + e-brake held 2 s',    (t) => ({ steer: 1, throttle: 0, handbrake: t < 2 })],
  ];
  for (const v of [20, 30, 41.7]) {   // 72, 108, 150 km/h
    for (const [label, inp] of trials) {
      const p = mk(base, v);
      drive(p, 1.0, { steer: 1, throttle: 1 });    // load the car up in a turn first
      let armed = null, peak = 0, peakSlip = 0;
      drive(p, 4, inp, (t, s) => {
        if (armed === null && s.drifting) armed = t;
        if (Math.abs(s.slipAngle) > peak) { peak = Math.abs(s.slipAngle); peakSlip = Math.abs(s.slip); }
      });
      say(`  ${(v * KMH).toFixed(0).padStart(3)} km/h ${label.padEnd(28)}`
        + ` drift ${armed === null ? 'NEVER  ' : 'at ' + armed.toFixed(2) + 's'}`
        + ` | peak slipAngle ${(peak * DEG).toFixed(1).padStart(5)} deg | peak |slip| ${peakSlip.toFixed(2)}`);
    }
  }
  const satRear = base.TUNE.muRear / base.TUNE.tyreStiff;
  say(`  tyre saturation slip angle: rear ${(satRear * DEG).toFixed(2)} deg;`
    + ` enter at ${(satRear * base.TUNE.driftEnterRatio * DEG).toFixed(2)} deg,`
    + ` exit at ${(satRear * base.TUNE.driftExitRatio * DEG).toFixed(2)} deg (e-brake lowers both)`);
}

// ---------------------------------------------------------------------------------------------
hdr('E. DRIFT HOLD with steering centred, and the tapped-countersteer survival test');
{
  // Establish an e-brake slide at 130 km/h, release everything, and watch it decay.
  function slide(then) {
    const p = mk(base, 36.1);
    drive(p, 1.6, { steer: 1, throttle: 0, handbrake: true });
    const peak = Math.abs(p.state.slipAngle);
    const flagAt = p.state.drifting;
    let half = 0, flag = 0, samples = [];
    drive(p, 5, then, (t, s) => {
      if (Math.abs(s.slipAngle) > peak * 0.5) half = t;
      if (s.drifting) flag = t;
      if (Math.abs(t * 10 % 5) < 1e-6) samples.push(`${t.toFixed(1)}s:${(s.slipAngle * DEG).toFixed(0)}deg`);
    });
    return { peak: peak * DEG, half, flag, drifting: flagAt, samples };
  }
  const a = slide({ steer: 0, throttle: 1 });
  say(`  entry peak slipAngle ${a.peak.toFixed(1)} deg, drifting flag set at release: ${a.drifting}`);
  say(`  steer CENTRED, throttle on: |slipAngle| stays > 50% of peak for ${a.half.toFixed(2)} s;`
    + ` drifting flag held ${a.flag.toFixed(2)} s`);
  const b = slide((t) => ({ steer: t < 0.15 ? -1 : 0, throttle: 1 }));
  say(`  0.15 s TAPPED countersteer then centred: > 50% peak for ${b.half.toFixed(2)} s,`
    + ` flag ${b.flag.toFixed(2)} s  (drift must survive the tap)`);
  const c = slide({ steer: -1, throttle: 1 });
  say(`  HELD full opposite lock: > 50% peak for ${c.half.toFixed(2)} s, flag ${c.flag.toFixed(2)} s`
    + `  (must gather up)`);
  const d = slide({ steer: 1, throttle: 1 });
  say(`  steering HELD INTO the slide: > 50% peak for ${d.half.toFixed(2)} s, flag ${d.flag.toFixed(2)} s`);
}

// ---------------------------------------------------------------------------------------------
hdr('F. DRIFT SCRUB (research: low, nonzero, recoverable)');
{
  // Two 5 s passes from the same speed. One straight, one with an e-brake drift induced.
  const straight = mk(base, 41.7); drive(straight, 5, { throttle: 1 });
  const drifted = mk(base, 41.7);
  drive(drifted, 0.8, { steer: 1, throttle: 0, handbrake: true });
  drive(drifted, 4.2, { steer: 0, throttle: 1 });
  const dv = (drifted.state.ground - straight.state.ground) / straight.state.ground * 100;
  say(`  straight 5 s: ${straight.state.ground.toFixed(1)} m/s, ${straight.state.distance.toFixed(1)} m`);
  say(`  drifted  5 s: ${drifted.state.ground.toFixed(1)} m/s, ${drifted.state.distance.toFixed(1)} m`);
  say(`  speed delta ${dv.toFixed(1)} % (must be negative and small)`);
  // recovery: how long after the slide ends to get back to the straight-line speed
  let rec = null;
  drive(drifted, 8, { throttle: 1 }, (t, s) => {
    if (rec === null && s.ground >= straight.state.ground) rec = t;
  });
  say(`  recovers the straight-line speed ${rec === null ? 'NEVER within 8 s' : rec.toFixed(2) + ' s'} after`);
  // heading change carried through the drift, i.e. does it actually carry the car wide
  const w = mk(base, 41.7);
  const x0 = w.state.pos.x, z0 = w.state.pos.z;
  drive(w, 0.8, { steer: 1, throttle: 0, handbrake: true });
  drive(w, 2.2, { steer: 0, throttle: 1 });
  say(`  net heading change over a 3 s e-brake drift: ${(w.state.yaw * DEG).toFixed(0)} deg,`
    + ` displacement ${Math.hypot(w.state.pos.x - x0, w.state.pos.z - z0).toFixed(0)} m`);
}

// ---------------------------------------------------------------------------------------------
hdr('G. BOOST: bar duration, the full-bar gate, and the ceiling lift');
{
  const p = mk(base, 20);
  let t0 = null, t1 = null;
  drive(p, 20, { throttle: 1, boost: true }, (t, s) => {
    if (t0 === null && s.boosting) t0 = t;
    if (t0 !== null && t1 === null && !s.boosting) t1 = t;
  });
  say(`  full bar lasts ${(t1 - t0).toFixed(3)} s  (BURNOUT 8.0 s PUBLISHED, exactly)`);
  say(`  tank after the burn: ${p.state.boost.toFixed(3)} (TUNE.burnoutRefill ${base.TUNE.burnoutRefill})`);
  // the full-bar gate
  for (const b of [0.5, 0.9, 0.998, 1.0]) {
    const q = mk(base, 20); q.state.boost = b;
    q.setInput({ throttle: 1, boost: true }); q.step(DT);
    say(`  tank ${b}: boosting = ${q.state.boosting}  (BURNOUT: only a FULL bar may be used)`);
  }
  // ceiling lift, from A
  const u = mk(base); drive(u, 300, { throttle: 1 });
  const bo = mk(base); drive(bo, 300, () => { bo.state.boost = 1; return { throttle: 1, boost: true }; });
  say(`  ceiling ratio boosted/unboosted = ${(bo.state.ground / u.state.ground).toFixed(3)}`
    + `  (BURNOUT ~1.00; best MaxSpeed 201 mph beats every MaxBoostSpeed)`);
  // acceleration lift: the thing Burnout's boost actually is
  const acc = (inp, pin) => {
    const q = mk(base, 20); let peak = 0;
    drive(q, 2, () => { if (pin) q.state.boost = 1; return inp; }, (t, s) => { peak = Math.max(peak, s.accelG); });
    return peak;
  };
  const a0 = acc({ throttle: 1 }, false), a1 = acc({ throttle: 1, boost: true }, true);
  say(`  accel lift from 20 m/s: ${a0.toFixed(2)} -> ${a1.toFixed(2)} m/s^2 = x${(a1 / a0).toFixed(2)}`
    + `  (BURNOUT: the lift belongs HERE, not in the ceiling)`);
  const a0h = acc({ throttle: 1 }, false);
  const q = mk(base, 60); let ph = 0; drive(q, 2, { throttle: 1 }, (t, s) => ph = Math.max(ph, s.accelG));
  const r = mk(base, 60); let pb = 0; drive(r, 2, () => { r.state.boost = 1; return { throttle: 1, boost: true }; }, (t, s) => pb = Math.max(pb, s.accelG));
  say(`  accel lift from 60 m/s: ${ph.toFixed(2)} -> ${pb.toFixed(2)} m/s^2 = x${(pb / ph).toFixed(2)}`);
  void a0h;
}

// ---------------------------------------------------------------------------------------------
hdr('H. BOOST CAMERA: fov and standoff deltas across the onset (research: NOT FOUND, so MEASURED)');
{
  const cam = new PerspectiveCamera(44);
  const rig = createCamRig(cam);
  rig.configure({ mode: 'chase' });
  const p = mk(base, 55);
  // warm the rig so the pose is settled, then flip boost on and sample the transition
  let first = true;
  const sample = () => ({ fov: cam.fov, dist: Math.hypot(cam.position.x - p.state.pos.x, cam.position.z - p.state.pos.z), y: cam.position.y });
  const step = (inp) => {
    if (inp.boost) p.state.boost = 1;
    p.setInput(inp); p.step(DT);
    rig.update(DT, p.state, first); first = false;
  };
  for (let i = 0; i < 240; i++) step({ throttle: 1 });      // 2 s warm, no boost
  const before = sample();
  const trace = [];
  for (let i = 0; i < 360; i++) { step({ throttle: 1, boost: true }); trace.push(sample()); }
  let maxFov = before.fov, minDist = before.dist, tMaxFov = 0, tMinDist = 0;
  trace.forEach((s, i) => {
    if (s.fov > maxFov) { maxFov = s.fov; tMaxFov = (i + 1) * DT; }
    if (s.dist < minDist) { minDist = s.dist; tMinDist = (i + 1) * DT; }
  });
  const at100 = trace[Math.round(0.1 / DT) - 1];
  const settled = trace[trace.length - 1];
  say(`  before onset: fov ${before.fov.toFixed(2)} deg, standoff ${before.dist.toFixed(2)} m, height ${before.y.toFixed(2)} m`);
  say(`  peak fov ${maxFov.toFixed(2)} deg (+${(maxFov - before.fov).toFixed(2)}) at t=${tMaxFov.toFixed(3)} s`);
  say(`  fov at t=100 ms: ${at100.fov.toFixed(2)} (+${(at100.fov - before.fov).toFixed(2)}), i.e.`
    + ` ${((at100.fov - before.fov) / (maxFov - before.fov) * 100).toFixed(0)} % of the swing inside 100 ms`);
  say(`  min standoff ${minDist.toFixed(2)} m (${(minDist - before.dist).toFixed(2)} m) at t=${tMinDist.toFixed(3)} s`);
  say(`  settled at t=3 s: fov ${settled.fov.toFixed(2)} (+${(settled.fov - before.fov).toFixed(2)}),`
    + ` standoff ${settled.dist.toFixed(2)} m (${(settled.dist - before.dist).toFixed(2)} m)`);
  // release
  const rel = [];
  for (let i = 0; i < 360; i++) { p.setInput({ throttle: 1 }); p.step(DT); rig.update(DT, p.state, false); rel.push(sample()); }
  say(`  0.5 s after release: fov ${rel[Math.round(0.5 / DT) - 1].fov.toFixed(2)},`
    + ` 3 s after: fov ${rel[rel.length - 1].fov.toFixed(2)} (asymmetric attack/release is the claim)`);
}

// ---------------------------------------------------------------------------------------------
hdr('I. TICK-RATE INVARIANCE and DETERMINISM (my own check, not the builder\'s)');
{
  const at = (hz) => {
    const p = mk(base); const dt = 1 / hz;
    for (let i = 0; i < Math.round(6 * hz); i++) { p.setInput({ throttle: 1, steer: 1 }); p.step(dt); }
    return p.state;
  };
  const ref = at(120);
  for (const hz of [240, 60, 30, 20]) {
    const s = at(hz);
    say(`  ${String(hz).padStart(3)} Hz: ground ${s.ground.toFixed(3)} m/s (${((s.ground / ref.ground - 1) * 100).toFixed(2)} %),`
      + ` yaw ${(s.yaw * DEG).toFixed(2)} deg (${((s.yaw - ref.yaw) * DEG).toFixed(2)} deg)`);
  }
  const r1 = at(120), r2 = at(120);
  say(`  determinism: identical re-run = ${r1.ground === r2.ground && r1.yaw === r2.yaw && r1.vLat === r2.vLat}`);
}

// ---------------------------------------------------------------------------------------------
hdr('J. KILL-CONTROL 1 — the BEFORE model, to test FINDING 0 ("vMax was a label")');
{
  // Load the pre-wave-S physics.js straight out of git and integrate it. If the builder's story is
  // right, throttle held forever equilibrates near 38 m/s, not 78.
  const { execSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'hcritic-old-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  writeFileSync(join(dir, 'old.js'), execSync('git show HEAD~1:game/physics.js', { cwd: join(HERE, '..') }).toString());
  const old = await import(pathToFileURL(join(dir, 'old.js')).href);
  const p = old.createPhysics({ blocks: [], bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), 0, 0);
  for (let i = 0; i < 120 * 300; i++) { p.setInput({ throttle: 1 }); p.step(DT); }
  say(`  BEFORE, throttle held 300 s: ${p.state.speed.toFixed(2)} m/s = ${(p.state.speed * MPH).toFixed(1)} mph`
    + `  (TUNE.vMax was ${old.TUNE.vMax} = ${(old.TUNE.vMax * MPH).toFixed(1)} mph)`);
  const q = old.createPhysics({ blocks: [], bounds: 1e9 });
  q.reset(new Vector3(0, 0, 0), 0, 0);
  for (let i = 0; i < 120 * 300; i++) { q.setInput({ throttle: 1, boost: true }); q.step(DT); }
  say(`  BEFORE, boost held 300 s: ${q.state.speed.toFixed(2)} m/s = ${(q.state.speed * MPH).toFixed(1)} mph`
    + `  (TUNE.vMaxBoost was ${old.TUNE.vMaxBoost} = ${(old.TUNE.vMaxBoost * MPH).toFixed(1)} mph)`);
  // and the BEFORE yaw rate at the research's 40.2 m/s anchor, plus its lean sign
  const r = old.createPhysics({ blocks: [], bounds: 1e9 });
  r.reset(new Vector3(0, 0, 0), 0, 40.2);
  for (let i = 0; i < 120 * 3; i++) { r.state.speed = 40.2; r.setInput({ throttle: 1, steer: 1 }); r.step(DT); }
  const y0 = r.state.yaw;
  for (let i = 0; i < 120; i++) { r.state.speed = 40.2; r.setInput({ throttle: 1, steer: 1 }); r.step(DT); }
  say(`  BEFORE yaw at 40.2 m/s, full lock: ${((r.state.yaw - y0) * DEG).toFixed(1)} deg/s;`
    + ` lean in a LEFT turn = ${r.state.lean.toFixed(3)} (positive = banked INTO the corner)`);
  // AFTER, same probe
  const s = mk(base, 40.2);
  drive(s, 3, () => { s.state.speed = 40.2; return { throttle: 1, steer: 1 }; });
  say(`  AFTER  lean in a LEFT turn = ${s.state.lean.toFixed(3)} (negative = banked OUTWARD)`);
}

// ---------------------------------------------------------------------------------------------
hdr('K. KILL-CONTROL 2 — is the top speed really SOLVED from the ceiling, or is it the clamp?');
{
  // The story: CD and POWER_BOOST are solved from vMax/vMaxBoost, so moving vMax moves the real
  // top speed. If instead the number came from `Math.min(speed, vMax)`, deleting that clamp would
  // leave the top speed unchanged (drag equilibrium) -- and moving vMax with the clamp deleted
  // would still move it. So run both.
  const v90 = await loadPhysics([['  vMax: 78,', '  vMax: 90,']]);
  const p = mk(v90); drive(p, 300, { throttle: 1 });
  say(`  vMax 78 -> 90: top speed ${p.state.ground.toFixed(2)} m/s (predicted 90 if solved, 78-ish if not)`);
  const noclamp = await loadPhysics([[
    'state.speed = Math.min(state.speed, boosting ? TUNE.vMaxBoost : TUNE.vMax);',
    '/* clamp deleted by critic kill-control */']]);
  const q = mk(noclamp); drive(q, 300, { throttle: 1 });
  say(`  clamp deleted, vMax 78: top speed ${q.state.ground.toFixed(2)} m/s`
    + ` (if the clamp were doing the work this would run away)`);
  const both = await loadPhysics([
    ['  vMax: 78,', '  vMax: 90,'],
    ['state.speed = Math.min(state.speed, boosting ? TUNE.vMaxBoost : TUNE.vMax);', '/* deleted */']]);
  const r = mk(both); drive(r, 300, { throttle: 1 });
  say(`  clamp deleted AND vMax 90: top speed ${r.state.ground.toFixed(2)} m/s`);
  // Kill the drag term entirely: if drag is what sets the ceiling, this must run away.
  const nodrag = await loadPhysics([['const aResist = TUNE.coastDecel + CD * gv * gv + scrub;',
    'const aResist = TUNE.coastDecel + 0 * CD * gv * gv + scrub;']]);
  const s = mk(nodrag); drive(s, 300, { throttle: 1 });
  say(`  aero drag term zeroed: top speed ${s.state.ground.toFixed(2)} m/s (the clamp is the only thing left)`);
}

// ---------------------------------------------------------------------------------------------
hdr('L. KILL-CONTROL 3 — the stability terms the builder credits');
{
  const probe = async (label, edits) => {
    const mod = edits ? await loadPhysics(edits) : base;
    const lines = [];
    for (const v of [40, 60, 78]) {
      const p = mk(mod, v);
      let maxYaw = 0, maxSlip = 0;
      drive(p, 6, { steer: 1, throttle: 1 }, (t, s) => {
        maxYaw = Math.max(maxYaw, Math.abs(s.yawRate) * DEG);
        maxSlip = Math.max(maxSlip, Math.abs(s.slipAngle) * DEG);
      });
      lines.push(`${v} m/s: peak yaw ${maxYaw.toFixed(0)} deg/s, peak slip ${maxSlip.toFixed(0)} deg,`
        + ` end ground ${p.state.ground.toFixed(1)} m/s`);
    }
    say(`  ${label}`);
    for (const l of lines) say(`      ${l}`);
  };
  await probe('baseline, full lock held 6 s:', null);
  await probe('gripUse 0.85 -> 1.00 (builder: "marginally stable by construction"):',
    [['  gripUse: 0.85,', '  gripUse: 1.00,']]);
  await probe('spinDamp 6.0 -> 0 (builder: "set it to 0 and full lock at 60 m/s departs"):',
    [['  spinDamp: 6.0,', '  spinDamp: 0,']]);
  await probe('stabilityAssist 2.6 -> 0 (builder: "diverges into a flat spin inside 1.3 s"):',
    [['  stabilityAssist: 2.6,', '  stabilityAssist: 0,']]);
  await probe('slideDrop 0.22 -> 0 (builder: "every slide self-corrects"):',
    [['  slideDrop: 0.22,', '  slideDrop: 0,']]);
}

// ---------------------------------------------------------------------------------------------
hdr('M. COLLISION TIERS (research 8.10: two distinguishable outcomes)');
{
  const block = { cx: 0, cz: 300, w: 40, d: 40 };
  for (const [label, yaw] of [['head-on (0 deg)', 0], ['15 deg', 0.262], ['3 deg graze', 0.052]]) {
    const p = mk(base, 50, yaw, [block]);
    p.state.pos.set(-Math.tan(yaw) * 200, 0, 0);
    let before = 0, after = null;
    drive(p, 8, { throttle: 1 }, (t, s) => {
      if (after === null && s.impact > 0) { after = s.ground; }
      if (after === null) before = s.ground;
    });
    say(`  ${label.padEnd(16)} ${before.toFixed(1)} -> ${after === null ? 'no contact' : after.toFixed(1) + ' m/s'}`
      + ` (retained ${after === null ? '-' : (after / before * 100).toFixed(0) + '%'}), crashed=${p.state.crashed}`);
  }
}

// ---------------------------------------------------------------------------------------------
hdr('N. STEERING SIGN, in world coordinates (the user\'s headline bug)');
{
  // main.js:567 maps KeyD -> steer = -1. Follow that literally.
  const p = mk(base, 30);
  drive(p, 2.5, { steer: -1, throttle: 1 });
  const fx = Math.sin(p.state.yaw), fz = Math.cos(p.state.yaw);
  // Chase camera sits behind the car looking along its forward; screen-right is world -x when
  // yaw = 0 (camera forward +z, up +y => camera local +x = world -x).
  say(`  KeyD (steer -1) for 2.5 s from yaw 0: yaw ${(p.state.yaw * DEG).toFixed(1)} deg,`
    + ` pos x ${p.state.pos.x.toFixed(1)} m, forward (${fx.toFixed(2)}, ${fz.toFixed(2)})`);
  say(`  screen-right at yaw 0 is world -x, so KeyD must give NEGATIVE x: ${p.state.pos.x < 0 ? 'YES' : 'NO'}`);
  const q = mk(base, 30); drive(q, 2.5, { steer: 1, throttle: 1 });
  say(`  KeyA (steer +1): yaw ${(q.state.yaw * DEG).toFixed(1)} deg, pos x ${q.state.pos.x.toFixed(1)} m`
    + ` (must be POSITIVE)`);
  say(`  lean while turning right (KeyD): ${p.state.lean.toFixed(3)};`
    + ` car.js does shell.rotation.z = -lean*0.05 about local +z, local +x = car LEFT,`
    + ` so a right turn needs lean > 0 to drop the LEFT (outer) flank`);
  say(`  lean while turning left  (KeyA): ${q.state.lean.toFixed(3)} (must be NEGATIVE)`);
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-critic-raw.txt'), out.join('\n') + '\n');
console.log('\n(raw log written to verdicts/wave-s/handling-critic-raw.txt)');
}
