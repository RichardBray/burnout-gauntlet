// handling-measure.mjs — headless handling instrument for wave S.
//
// WHY THIS FILE EXISTS. Every handling target in docs/BURNOUT-HANDLING.md is a property of
// game/physics.js alone: a time, a yaw rate, a slip angle, a bar duration. None of them needs the
// renderer, so none of them can be disturbed by a peer agent stealing the GPU — which is the whole
// reason the brief lets handling numbers stand while frame-time numbers do not. The procedures are
// the ones the research doc's section 8 specifies, implemented literally, plus a camera pass and a
// path-following pass that section 8 could not specify because it did not know the rig existed.
//
// Determinism: physics.js has no RNG and step() substeps internally at a fixed rate, so a run is a
// pure function of (initial state, input sequence, dt). Test 12 asserts that by re-running.
//
// Usage:  node tools/handling-measure.mjs [--dt 120] [--json out.json] [--only 1,5,8]
// Every table prints OURS, the BURNOUT reference, the band and HIT/MISS. A `NOT FOUND` reference
// prints as MEAS (measured, nothing to compare against) and is never scored as a pass.
//
// WHY THIS FILE IS ITS OWN `three` SHIM. `game/index.html` pulls three from esm.sh through a
// browser import map, so there is no `node_modules/three` and a plain `import 'three'` in node
// fails. Rather than add a dependency (which would make this harness unrunnable for anyone who
// checks out the repo without installing it, i.e. the critic), the file exports the tiny slice of
// three that physics.js and camera.js actually use, and registers a module hook that resolves the
// bare specifier `three` back to ITSELF. The `?shim=1` query makes node treat that second import
// as a distinct module, and the SHIM guard below stops the measurement body running twice.
// Net effect: `node tools/handling-measure.mjs` works with zero install and zero network.

/** The three.Vector3 subset physics.js and camera.js call. Same semantics, same return values. */
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
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
}
/** Enough of a camera for camRig.update() to write into and for us to read fov/position off. */
export class PerspectiveCamera {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.position = new Vector3(); this.up = new Vector3(0, 1, 0); this.rotation = { z: 0 };
    this._target = new Vector3();
  }
  updateProjectionMatrix() { }
  lookAt(v) { this._target.copy(v); }
  rotateZ(a) { this.rotation.z = a; }
  getWorldDirection(v) { return v.subVectors(this._target, this.position).normalize(); }
}
export const MathUtils = { degToRad: (d) => d * Math.PI / 180, radToDeg: (r) => r * 180 / Math.PI };

const SHIM = import.meta.url.includes('shim=1');
if (!SHIM) await main();

async function main() {
const { registerHooks } = await import('node:module');
const selfShim = `${import.meta.url}?shim=1`;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: selfShim, shortCircuit: true };
    return next(spec, ctx);
  },
});
const THREE = await import(selfShim);
const { createPhysics, TUNE } = await import('../game/physics.js');
const { createCamRig } = await import('../game/camera.js');

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HZ = Number(argOf('--dt', 120));
const DT = 1 / HZ;
const ONLY = argOf('--only', null)?.split(',').map(Number) ?? null;

const MPH = 2.2369362920544;   // m/s -> mph
const KMH = 3.6;
const DEG = 180 / Math.PI;
const V100 = 44.704;           // 100 mph in m/s

const O = () => new THREE.Vector3(0, 0, 0);
const results = [];
let hits = 0, misses = 0, meas = 0;

function row(name, ours, ref, band, ok, note = '') {
  if (ok === null) meas++; else if (ok) hits++; else misses++;
  const verdict = ok === null ? 'MEAS' : ok ? 'HIT' : 'MISS';
  results.push({ name, ours, ref, band, verdict, note });
  console.log(`  ${verdict.padEnd(4)} | ${name.padEnd(42)} | ours ${String(ours).padEnd(22)} | burnout ${String(ref).padEnd(26)} | ${band}${note ? '  <- ' + note : ''}`);
}
const head = (n, t) => { if (!ONLY || ONLY.includes(n)) console.log(`\n== ${n}. ${t}`); return !ONLY || ONLY.includes(n); };

/** Fresh sim with no walls and no bounds clamp, so nothing but the model is under test. */
function sim(speed = 0, yaw = 0) {
  const p = createPhysics({ blocks: [], bounds: 1e9 });
  p.reset(O(), yaw, speed);
  return p;
}
/** Run `sec` seconds of fixed-tick sim. `input` may be a function of elapsed time. */
function run(p, sec, input, onTick) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    p.setInput(typeof input === 'function' ? input(t, p.state) : input);
    p.step(DT);
    if (onTick) onTick(t + DT, p.state);
  }
  return p.state;
}

// ---------------------------------------------------------------------------
// 1. TOP SPEED  (research 8.1)
// ---------------------------------------------------------------------------
let topUnboosted = 0, topBoosted = 0;
if (head(1, 'Top speed — 120 s of held throttle (research 8.1)')) {
  topUnboosted = run(sim(), 120, { throttle: 1 }).speed;
  // The tank empties, so hold it full each tick to find the true boosted ceiling. Stated, per 8.1.
  const pb = sim();
  topBoosted = run(pb, 120, { throttle: 1, boost: true }, () => { pb.state.boost = 1; }).speed;
  const okU = topUnboosted * MPH >= 165 && topUnboosted * MPH <= 205;
  row('top speed, unboosted', `${topUnboosted.toFixed(1)} m/s = ${(topUnboosted * MPH).toFixed(0)} mph`,
    'MaxSpeed 177-201 mph', '165-205 mph (incl. mid-tier estimate)', okU);
  const okB = topBoosted * MPH >= 177 && topBoosted * MPH <= 205;
  row('top speed, boosted (tank forced full)', `${topBoosted.toFixed(1)} m/s = ${(topBoosted * MPH).toFixed(0)} mph`,
    'MaxBoostSpeed 177-200 mph', '177-205 mph', okB);
  const ratio = topBoosted / topUnboosted;
  row('boost CEILING ratio', ratio.toFixed(3), '~1.00 (200 vs 201 mph roster)', '1.00-1.15', ratio <= 1.15,
    ratio > 1.15 ? 'ceiling-vs-acceleration split still backwards' : 'boost is not a ceiling multiplier');
  const declared = TUNE.vMax;
  row('TUNE.vMax is the real top speed', `declared ${declared}, reached ${topUnboosted.toFixed(1)}`,
    'n/a — internal consistency', 'within 2%', Math.abs(topUnboosted - declared) / declared < 0.02);
}

// ---------------------------------------------------------------------------
// 2. TIME TO 100 MPH  (research 8.2)
// ---------------------------------------------------------------------------
function timeTo(target, input) {
  const p = sim();
  let t100 = null;
  run(p, 30, input, (t, s) => { if (t100 === null && s.speed >= target) t100 = t; });
  return t100;
}
let t100u = null, t100b = null;
if (head(2, 'Time to 100 mph = 44.704 m/s (research 8.2)')) {
  t100u = timeTo(V100, { throttle: 1 });
  t100b = timeTo(V100, { throttle: 1, boost: true });
  row('0-100 mph, no boost', t100u === null ? 'NEVER REACHED' : `${t100u.toFixed(2)} s`,
    'mid-tier estimate 4-5 s', '3.8-5.5 s', t100u !== null && t100u >= 3.8 && t100u <= 5.5);
  row('0-100 mph, boosting', t100b === null ? 'NEVER REACHED' : `${t100b.toFixed(2)} s`,
    '3.45-3.48 s (Vegas / Uberschall 8)', '3.2-3.8 s', t100b !== null && t100b >= 3.2 && t100b <= 3.8);
  const p = sim();
  let tv = null; run(p, 60, { throttle: 1 }, (t, s) => { if (tv === null && s.speed >= 0.90 * topUnboosted) tv = t; });
  row('time to 90% of top speed', tv === null ? 'NEVER' : `${tv.toFixed(1)} s`, 'NOT FOUND', 'reported, not scored', null);
}

// ---------------------------------------------------------------------------
// 3. YAW RATE VERSUS SPEED  (research 8.3 / 8.4)
// ---------------------------------------------------------------------------
/** Steady-state yaw rate at a held speed: pin the speed, settle, then differentiate yaw. */
function yawAt(v, extra = {}) {
  const p = sim(v);
  const inp = Object.assign({ steer: 1, throttle: 1 }, extra);
  run(p, 3.0, inp, () => { p.state.speed = v; });
  const y0 = p.state.yaw;
  run(p, 1.0, inp, () => { p.state.speed = v; });
  return (p.state.yaw - y0) * DEG;   // over exactly 1 s => deg/s
}
if (head(3, 'Yaw rate versus speed, full lock (research 8.3)')) {
  const speeds = [5, 10, 12.5, 15, 17.5, 20, 30, 40, 40.2, 50, 60, 70, TUNE.vMax];
  const curve = speeds.map((v) => {
    const r = yawAt(v);
    return { v, kmh: v * KMH, deg: r, radius: r !== 0 ? v / (r / DEG) : Infinity };
  });
  console.log('   v m/s |  km/h |  yaw deg/s | turn radius m');
  for (const c of curve) console.log(`  ${c.v.toFixed(1).padStart(6)} | ${c.kmh.toFixed(0).padStart(5)} | ${c.deg.toFixed(1).padStart(10)} | ${(c.radius === Infinity ? 'inf' : c.radius.toFixed(1)).padStart(13)}`);
  const peak = curve.reduce((a, b) => (b.deg > a.deg ? b : a));
  const above = curve.filter((c) => c.v > peak.v);
  const mono = above.every((c, i) => i === 0 || c.deg <= above[i - 1].deg + 1e-6);
  row('curve falls monotonically above the peak', mono ? 'yes' : 'no', 'CONSENSUS: straighter with speed', 'must be yes', mono);
  row('peak yaw rate / at what speed', `${peak.deg.toFixed(0)} deg/s at ${peak.kmh.toFixed(0)} km/h`,
    'NOT FOUND (no published curve)', 'peak must be at a speed players use', peak.kmh >= 35 && peak.kmh <= 110);
  const at40 = curve.find((c) => c.v === 40.2).deg;
  row('yaw at 40.2 m/s (the one calibrated anchor)', `${at40.toFixed(1)} deg/s`,
    '28-38 deg/s player-USED', 'ours is max-available: 28-60 deg/s', at40 >= 28 && at40 <= 60,
    `${(at40 / 38).toFixed(2)}x the hardest observed player turn`);
  const atMax = curve[curve.length - 1].deg;
  row('falloff, peak -> vMax', `${(atMax / peak.deg).toFixed(2)}x`, 'CONSENSUS: strong falloff', '<= 0.45', atMax / peak.deg <= 0.45);
  row('yaw rate on a straight (steer 0)', `${yawAt(40.2, { steer: 0 }).toFixed(3)} deg/s`, '< 0.2 deg/s', '< 0.2 deg/s', Math.abs(yawAt(40.2, { steer: 0 })) < 0.2);
}

// ---------------------------------------------------------------------------
// 4. BOOST ECONOMY  (research 8.5 / 8.6 / 8.7)
// ---------------------------------------------------------------------------
if (head(4, 'Boost economy (research 8.5, 8.6)')) {
  const p = sim(40);
  p.state.boost = 1;
  // Measure how long BOOSTING lasts, not when `boost` reads 0: a burnout or a Burnout Chain
  // refills the tank on the same tick it empties, so the zero is never observable.
  let tEmpty = null, burning = 0;
  run(p, 20, { throttle: 1, boost: true }, (t, s) => { if (s.boosting) burning += DT; else if (tEmpty === null && burning > 0) tEmpty = burning; });
  row('full bar duration', tEmpty === null ? 'NEVER EMPTIES' : `${tEmpty.toFixed(2)} s`,
    'exactly 8.0 s (Burnout Wiki)', '7.6-8.4 s', tEmpty !== null && Math.abs(tEmpty - 8) <= 0.4);

  const q = sim(40); q.state.boost = 0.5;
  run(q, 0.5, { throttle: 1, boost: true });
  row('boost refuses below a full bar', q.state.boosting ? 'BOOSTED at 50%' : 'refused',
    'Speed boost usable only at 100%', 'must refuse', q.state.boosting === false);

  const r = sim(40); r.state.boost = 1;
  run(r, 0.5, { throttle: 1, boost: true });
  row('boost engages from a full bar', r.state.boosting ? 'engaged' : 'REFUSED', 'must engage', 'must engage', r.state.boosting === true);

  // Kick: peak longitudinal acceleration in the first second of a boost from cruise.
  const k = sim(40); k.state.boost = 1;
  let peakA = 0, aAt1s = 0;
  run(k, 2.0, { throttle: 1, boost: true }, (t, s) => { peakA = Math.max(peakA, s.accelG); if (Math.abs(t - 1.0) < DT) aAt1s = s.accelG; });
  const base = sim(40);
  let baseA = 0; run(base, 0.2, { throttle: 1 }, (t, s) => { baseA = s.accelG; });
  row('boost ACCELERATION ratio at onset', `${(peakA / Math.max(baseA, 0.01)).toFixed(2)}x (peak ${peakA.toFixed(1)} m/s^2)`,
    'BoostKickAcceleration: large initial burst', 'much larger than the ceiling ratio', peakA / Math.max(baseA, 0.01) > 2.0);
  row('kick has decayed by t=1.0 s', `${aAt1s.toFixed(1)} m/s^2 vs peak ${peakA.toFixed(1)}`, 'a kick, not a plateau', 'front-loaded', aAt1s < peakA * 0.75);

  const c = sim(40);
  c.state.boost = 0.2;
  run(c, 10, { throttle: 1 }, () => { c.state.speed = 40; });   // speed HELD at the anchor
  row('bar earned by driving fast (10 s held at 40 m/s)', `+${((c.state.boost - 0.2) * 10).toFixed(2)} %/s`,
    '~0.5 %/s measured while racing', '0.2-1.5 %/s', (c.state.boost - 0.2) * 10 >= 0.2 && (c.state.boost - 0.2) * 10 <= 1.5);
}

// ---------------------------------------------------------------------------
// 5. DRIFT  (research 8.8 / 8.9)
// ---------------------------------------------------------------------------
if (head(5, 'Drift entry / hold / countersteer / exit (research 8.8)')) {
  // Entry A: the e-brake, the published secondary entry.
  const a = sim(40);
  run(a, 0.8, { throttle: 1, steer: 1, handbrake: true });
  row('entry A: e-brake + steer produces a slide', `|slip| ${Math.abs(a.state.slip).toFixed(2)}, ${(a.state.slipAngle * DEG).toFixed(0)} deg`,
    'PUBLISHED entry', '|slip| > 0.35', Math.abs(a.state.slip) > 0.35);

  // Entry B: the competitive entry - a BRAKE TAP while loaded in a turn. Scored on the PEAK slide
  // the tap produces, with the residual and the hold time reported separately: "does a tap produce
  // a slide" is a question about the peak, and Paradise's own chain technique ("tap brake, left,
  // tap brake, right") says a single tap's drift is short and gets re-triggered, so scoring the
  // state 0.5 s later scores the wrong thing.
  const b = sim(40);
  run(b, 0.7, { throttle: 1, steer: 1 });                       // load the turn
  let peakTap = 0, holdTap = 0;
  const watch = (t, s) => { peakTap = Math.max(peakTap, Math.abs(s.slip)); if (s.drifting) holdTap += DT; };
  run(b, 0.18, { throttle: 0, brake: 1, steer: 1 }, watch);     // the tap
  run(b, 1.2, { throttle: 1, steer: 1 }, watch);
  row('entry B: brake TAP under load produces a slide', `peak |slip| ${peakTap.toFixed(2)}, ${(Math.asin(Math.min(1, peakTap * 0.45)) * DEG).toFixed(0)} deg of slip angle`,
    '"Tap brake, left, tap brake, right"', 'peak |slip| > 0.35', peakTap > 0.35);
  row('  ...and how long that tap drift lasts', `${holdTap.toFixed(2)} s in the drift state, residual |slip| ${Math.abs(b.state.slip).toFixed(2)}`,
    'a single chain-drift beat, re-triggered', 'reported, not scored', null);

  // Hold: enter, then CENTRE the steering and see how long half the peak survives.
  const h = sim(40);
  run(h, 0.8, { throttle: 1, steer: 1, handbrake: true });
  const peak = Math.abs(h.state.slip);
  let holdT = 0;
  run(h, 4, { throttle: 1, steer: 0 }, (t, s) => { if (Math.abs(s.slip) > peak * 0.5) holdT = t; });
  row('hold with steering CENTRED, |slip| > half peak', `${holdT.toFixed(2)} s`,
    'self-sustaining ("goes back into the drift on its own")', '> 0.5 s', holdT > 0.5);

  // Countersteer tolerance: the double-drift technique. A brief opposite input must not cancel it.
  const c = sim(40);
  run(c, 0.8, { throttle: 1, steer: 1, handbrake: true });
  const pk = Math.abs(c.state.slip);
  run(c, 0.15, { throttle: 1, steer: -1 });         // the brief countersteer
  const mid = Math.abs(c.state.slip);
  run(c, 0.6, { throttle: 1, steer: 0 });           // "let the car go back into the drift on its own"
  const after = Math.abs(c.state.slip);
  row('survives a 0.15 s countersteer', `peak ${pk.toFixed(2)} -> ${mid.toFixed(2)} -> ${after.toFixed(2)}`,
    'double drifting lengthens the drift', 'still > 0.4 of peak, and drift state held',
    after > pk * 0.4 && c.state.drifting === true);

  // Exit: HOLD the countersteer instead of tapping it.
  const e = sim(40);
  run(e, 0.8, { throttle: 1, steer: 1, handbrake: true });
  let exitT = null;
  run(e, 3, { throttle: 1, steer: -1 }, (t, s) => { if (exitT === null && !s.drifting) exitT = t; });
  row('exit on HELD countersteer', exitT === null ? 'NEVER EXITS' : `${exitT.toFixed(2)} s`,
    'MY-ESTIMATE: held countersteer ends it', 'exits within 1.5 s', exitT !== null && exitT < 1.5);

  // Does the drift actually carry the car wide? The old model could not.
  const w = sim(40, 0);
  const x0 = w.state.pos.x, z0 = w.state.pos.z;
  run(w, 1.2, { throttle: 1, steer: 1, handbrake: true });
  const head0 = new THREE.Vector3(Math.sin(w.state.yaw), 0, Math.cos(w.state.yaw));
  const disp = new THREE.Vector3(w.state.pos.x - x0, 0, w.state.pos.z - z0);
  const courseErr = Math.acos(Math.max(-1, Math.min(1, head0.dot(disp.clone().normalize())))) * DEG;
  row('car travels off its own heading while drifting', `${courseErr.toFixed(1)} deg between nose and course`,
    'a drift carries the car wide', '> 8 deg', courseErr > 8);

  // Scrub (8.9): drift 5 s versus grip 5 s from the same speed, throttle held in both.
  const g1 = sim(50); run(g1, 5, { throttle: 1 });
  // Entry is a 0.2 s e-brake TAP, then throttle and lock held: that is a chain drift, and it is
  // the thing the research says holds speed for minutes. Five seconds of HELD e-brake is a
  // handbrake turn and it scrubs 90%, which is a different manoeuvre with a different answer.
  const g2 = sim(50);
  run(g2, 0.2, { throttle: 1, steer: 1, handbrake: true });
  run(g2, 4.8, { throttle: 1, steer: 1 });
  const scrub = 100 * (1 - g2.state.speed / g1.state.speed);
  row('drift scrub over 5 s', `${scrub.toFixed(1)} % slower than a straight`, 'CONSENSUS: low but nonzero',
    '3-40 % (not 0, not catastrophic)', scrub > 3 && scrub < 40);
}

// ---------------------------------------------------------------------------
// 6. SIGN INVARIANTS — the trap the brief warns about
// ---------------------------------------------------------------------------
if (head(6, 'Sign invariants (steer +1 = LEFT, body leans OUTWARD)')) {
  const p = sim(40, 0);   // yaw 0 => heading +z
  run(p, 1.2, { throttle: 1, steer: 1 });
  row('steer +1 turns LEFT (yaw increases)', `yaw ${p.state.yaw.toFixed(3)} rad`, 'three.js +Y is counter-clockwise', 'yaw > 0', p.state.yaw > 0);
  // car.js:2336 is `shell.rotation.z = -lean * 0.05`, and a rotation about the car's local +z
  // takes local +x (which IS the car's left) toward +y. Verified in the live page: setting
  // lean = 1 at yaw 0 gives a shell world up vector of (+0.050, 0.9988, 0), tilted toward the
  // car's left. So a car banking OUTWARD through a left turn needs lean < 0, and the retired
  // model's positive lean banked it inward like a motorcycle.
  row('lean banks OUTWARD in a left turn', `lean ${p.state.lean.toFixed(3)}`, 'a car rolls away from the turn centre', 'lean < 0 on a left turn', p.state.lean < 0);
  row('slip sign matches a left turn', `slip ${p.state.slip.toFixed(3)}`, 'carRoot.rotation.y = yaw - slip*0.22', 'slip > 0 on a left turn', p.state.slip > 0);
  const q = sim(40, 0);
  run(q, 1.2, { throttle: 1, steer: -1 });
  row('steer -1 turns RIGHT', `yaw ${q.state.yaw.toFixed(3)} rad`, '', 'yaw < 0', q.state.yaw < 0);
}

// ---------------------------------------------------------------------------
// 7. BRAKING AND REVERSE
// ---------------------------------------------------------------------------
if (head(7, 'Braking and reverse')) {
  const p = sim(40);
  let stop = null, stopDist = 0;
  run(p, 6, { brake: 1, throttle: 0 }, (t, s) => { if (stop === null && s.speed <= 0.5) { stop = t; stopDist = s.distance; } });
  row('40 m/s to standstill', stop === null ? 'NEVER' : `${stop.toFixed(2)} s, ${stopDist.toFixed(0)} m`,
    'NOT FOUND', 'reported, not scored', null);
  const r = sim(0);
  run(r, 3, { throttle: -1, brake: 0.6 });
  row('reverse works', `${r.state.speed.toFixed(1)} m/s`, 'L2/LT reverses', 'speed < -2', r.state.speed < -2);
}

// ---------------------------------------------------------------------------
// 8. TICK-RATE ROBUSTNESS — the rAF loop hands physics 16-50 ms, not 8.3 ms
// ---------------------------------------------------------------------------
if (head(8, 'Tick-rate robustness (the live game runs at variable dt)')) {
  const at = (hz) => { const p = createPhysics({ blocks: [], bounds: 1e9 }); p.reset(O(), 0, 0); const n = Math.round(6 * hz); for (let i = 0; i < n; i++) { p.setInput({ throttle: 1, steer: 1 }); p.step(1 / hz); } return p.state; };
  const a = at(240), b = at(60), c = at(20);
  const dv = Math.max(Math.abs(a.speed - b.speed), Math.abs(a.speed - c.speed)) / a.speed * 100;
  const dy = Math.max(Math.abs(a.yaw - b.yaw), Math.abs(a.yaw - c.yaw)) * DEG;
  row('speed spread over dt 1/240..1/20', `${dv.toFixed(2)} %`, 'n/a — implementation quality', '< 2 %', dv < 2);
  row('yaw spread over dt 1/240..1/20', `${dy.toFixed(2)} deg after 6 s`, 'n/a', '< 3 deg', dy < 3);
}

// ---------------------------------------------------------------------------
// 9. THE PATH FOLLOWER — the screenshot presets depend on it staying on the road
// ---------------------------------------------------------------------------
if (head(9, 'Path follower (drives the seven screenshot presets)')) {
  // A closed circular path stands in for the world paths, which need world.js to build.
  const R = 140;
  const path = {
    length: 2 * Math.PI * R,
    at(u) { const a = u * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R); },
    tangentAt(u) { const a = u * Math.PI * 2; return new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); },
    nearest(pos) { let a = Math.atan2(pos.z, pos.x); if (a < 0) a += Math.PI * 2; return { u: a / (Math.PI * 2) }; },
  };
  const p = sim(0);
  p.placeOnPath(path, 0, 232 / KMH);
  p.followPath(path, 26);
  // Two numbers, because they answer different questions. The scenes PLACE the car at an authored
  // speed (232 km/h here) which may be well above what the corner allows, so the first seconds are
  // a deceleration transient the follower cannot steer its way out of; the steady error is the one
  // that says whether it lane-keeps.
  let peakErr = 0, steadyErr = 0, sumV = 0, n = 0;
  run(p, 20, {}, (t, s) => {
    const e = Math.abs(Math.hypot(s.pos.x, s.pos.z) - R);
    if (t > 2) peakErr = Math.max(peakErr, e);
    if (t > 6) { steadyErr = Math.max(steadyErr, e); sumV += s.speed; n++; }
  });
  row('steady lateral error on a 140 m radius', `${steadyErr.toFixed(2)} m`, 'n/a — must stay on the carriageway', '< 6 m (a lane is 3.5 m)', steadyErr < 6);
  row('worst error incl. the entry transient', `${peakErr.toFixed(2)} m`, 'n/a', 'reported: the scene places it above corner speed', null);
  row('speed it settles to on that radius', `${(sumV / n).toFixed(1)} m/s = ${(sumV / n * KMH).toFixed(0)} km/h`, 'n/a', 'reported', null);
}

// ---------------------------------------------------------------------------
// 10. COLLISION TIERS  (research 8.10)
// ---------------------------------------------------------------------------
if (head(10, 'Collision tiers (research 8.10)')) {
  const block = { cx: 0, cz: 60, w: 30, d: 30, bw: 30, bd: 30 };
  // The block's -x face is the wall under test (it spans x -16..16, z 44..76 with the 1 m pad).
  // A head-on case drives straight at that face; a glancing case runs almost parallel to it and
  // closes on it by only a couple of m/s, which is the geometry a real graze has.
  const hit = (x0, z0, yaw, sec = 2.5) => {
    const p = createPhysics({ blocks: [block], bounds: 1e9 });
    p.reset(new THREE.Vector3(x0, 0, z0), yaw, 40);
    // Speed 0.3 s after first contact: the impulse is the thing under test, and holding a car
    // against a wall for two more seconds measures wall friction instead.
    // Ratio against the speed the car actually ARRIVES at, not the speed it started at: the
    // approach to the glancing case is 46 m of coasting, which costs 3.6 m/s all by itself and
    // would be charged to the collision.
    let tHit = null, before = 40, after = 40, peak = 0, prev = 40;
    run(p, sec, { throttle: 0 }, (t, s) => {
      peak = Math.max(peak, s.impact);
      if (tHit === null && s.impact > 0) { tHit = t; before = prev; }
      if (tHit !== null && t <= tHit + 0.3) after = s.speed;
      prev = s.speed;
    });
    return { before, after, ratio: after / before, impact: peak };
  };
  const headOn = hit(-60, 60, Math.PI / 2);          // straight into the -x face
  const glance = hit(-18.5, 20, 0.055);              // 3.2 deg off parallel: 2.2 m/s of closing
  row('head-on impact speed retained', `${(headOn.ratio * 100).toFixed(0)} % of ${headOn.before.toFixed(1)} m/s`, 'a real hit ends the run', 'retains < 55 %', headOn.ratio < 0.55);
  row('glancing scrape speed retained', `${(glance.ratio * 100).toFixed(0)} % of ${glance.before.toFixed(1)} m/s`, 'a scrape preserves the run and the boost', 'retains > 75 %', glance.ratio > 0.75);
  row('the two tiers are distinguishable', `impact ${headOn.impact.toFixed(2)} vs ${glance.impact.toFixed(2)}`, 'two qualitatively different outcomes', 'head-on impact >= 2x scrape', headOn.impact >= glance.impact * 2);
}

// ---------------------------------------------------------------------------
// 11. BOOST CAMERA — measured on the real rig, headlessly
// ---------------------------------------------------------------------------
if (head(11, 'Boost camera (camera.js), stepped at 60 Hz against a scripted car state')) {
  const cam = new THREE.PerspectiveCamera(44, 1280 / 720, 0.1, 4000);
  const rig = createCamRig(cam);
  // boost-blur's authored rig, so the numbers are the ones a real scene uses.
  rig.configure({ mode: 'chase', distance: 6.65, height: 1.77, lookAhead: 16, lookHeight: 1.05, fov: 44, fovSpeed: 8, fovBoost: 12, shake: 1.3, collide: false });
  const p = sim(70);
  const CDT = 1 / 60;
  const trace = [];
  let t = 0;
  const stepBoth = (sec, input) => {
    const n = Math.round(sec / CDT);
    for (let i = 0; i < n; i++) {
      p.setInput(input); p.step(CDT); rig.update(CDT, p.state);
      p.state.boost = 1;   // hold the tank so the window is a clean A/B on the button alone
      const s = p.state;
      const d = Math.hypot(cam.position.x - s.pos.x, cam.position.z - s.pos.z);
      // Fraction of frame height a 1.30 m tall car covers at that standoff and lens.
      const frac = 1.30 / (2 * d * Math.tan(cam.fov * 0.5 / DEG));
      trace.push({ t: (t += CDT), fov: cam.fov, dist: d, y: cam.position.y, frac, boostKick: s.boostKick, speed: s.speed });
    }
  };
  stepBoth(3.0, { throttle: 1 });                 // settle, no boost
  const pre = trace[trace.length - 1];
  stepBoth(4.0, { throttle: 1, boost: true });    // boost held, long enough for the kick to die
  const during = trace.slice(trace.length - 240);
  const fovPeak = Math.max(...during.map((r) => r.fov));
  const tPeak = during.find((r) => r.fov === fovPeak).t - pre.t;
  const settle = during[during.length - 1];
  const distMin = Math.min(...during.map((r) => r.dist));
  const ampPeak = Math.max(...during.map((r) => r.boostKick));
  stepBoth(2.0, { throttle: 1 });                 // release
  const rel = trace[trace.length - 1];
  console.log(`   pre-boost: fov ${pre.fov.toFixed(2)} deg, standoff ${pre.dist.toFixed(2)} m, car ${(pre.frac * 100).toFixed(1)} % of frame height, speed ${pre.speed.toFixed(1)} m/s`);
  console.log(`   boosting:  fov ${settle.fov.toFixed(2)} deg, standoff ${settle.dist.toFixed(2)} m, car ${(settle.frac * 100).toFixed(1)} %, speed ${settle.speed.toFixed(1)} m/s`);
  row('fov OVERSHOOT at boost onset', `+${(fovPeak - pre.fov).toFixed(2)} deg, peak at t+${tPeak.toFixed(2)} s`, 'NOT FOUND', 'measured, not scored', null);
  row('fov held while boosting (kick dead)', `+${(settle.fov - pre.fov).toFixed(2)} deg`, 'NOT FOUND', 'measured, not scored', null);
  // A punch is about ARRIVAL TIME, not peak value: how much of the whole boost lens swing lands in
  // the first 100 ms. The scene's own swing comes through cfg.fovAttack and takes ~0.5 s.
  const at100 = during[Math.round(0.1 * 60)];
  const frac100 = (at100.fov - pre.fov) / (settle.fov - pre.fov);
  row('share of the lens swing delivered in 100 ms', `${(frac100 * 100).toFixed(0)} %`,
    'BoostKickAcceleration is a burst, not a ramp', '> 65 % (the scene attack alone gives ~45 %)', frac100 > 0.65);
  row('the push is a TRANSIENT, not a new pose', `overshoot +${(fovPeak - settle.fov).toFixed(2)} deg over the held value`, 'a burst gives itself back', 'overshoot > 1 deg and decayed by the end', fovPeak - settle.fov > 1 && ampPeak > 0.5);
  row('standoff punch-in at onset', `${(distMin - pre.dist).toFixed(2)} m (min ${distMin.toFixed(2)})`, 'NOT FOUND', 'must be negative: lens punches IN', distMin < pre.dist);
  row('car size held through the transition', `${(pre.frac * 100).toFixed(1)} % -> ${(settle.frac * 100).toFixed(1)} %`,
    'Burnout holds the car and stretches the world', 'within 20 % relative', Math.abs(settle.frac / pre.frac - 1) < 0.20);
  row('fov returns after release', `${rel.fov.toFixed(2)} deg vs ${pre.fov.toFixed(2)} pre`, 'n/a', 'within 1.5 deg', Math.abs(rel.fov - pre.fov) < 1.5);
}

// ---------------------------------------------------------------------------
// 12. DETERMINISM GUARD  (research 8.11)
// ---------------------------------------------------------------------------
if (head(12, 'Determinism (research 8.11)')) {
  const trace = () => { const p = sim(0); const out = []; run(p, 5, (t) => ({ throttle: 1, steer: Math.sin(t * 3), boost: t > 2, handbrake: t > 3.5 && t < 3.7 }), (tt, s) => out.push(`${s.pos.x},${s.pos.z},${s.yaw},${s.speed},${s.slip}`)); return out.join(';'); };
  const a = trace(), b = trace();
  row('two identical runs produce identical traces', a === b ? 'bit-identical' : 'DIVERGED', 'no RNG in physics.js', 'must be identical', a === b);
}

console.log(`\n=== ${hits} HIT / ${misses} MISS / ${meas} measured-only (no Burnout reference exists) — tick ${HZ} Hz`);
const jsonOut = argOf('--json', null);
if (jsonOut) {
  const fs = await import('node:fs');
  fs.writeFileSync(jsonOut, JSON.stringify({ hz: HZ, hits, misses, meas, results }, null, 2));
  console.log(`wrote ${jsonOut}`);
}
}
