// _carhit.mjs — smallest check that hero-vs-traffic collision works. Reuses the three-shim
// from handling-measure.mjs (see the WHY THIS FILE IS ITS OWN `three` SHIM comment there).
//
// Usage: node tools/_carhit.mjs
import { registerHooks } from 'node:module';
const shim = new URL('./handling-measure.mjs?shim=1', import.meta.url).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'three') return { url: shim, shortCircuit: true };
    return next(spec, ctx);
  },
});
const THREE = await import(shim);
const { createPhysics, TUNE } = await import('../game/physics.js');

const DT = 1 / 120;

/** Drive straight at `throttle` for `s` seconds against a fixed set of traffic bodies. */
function run(bodies, { speed = 0, seconds = 3 } = {}) {
  const p = createPhysics({ blocks: [], bounds: 1e9 });
  p.setTrafficBodies(() => bodies);
  p.state.speed = speed;
  let peakImpact = 0;
  for (let t = 0; t < seconds; t += DT) {
    p.step(DT, { throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
    peakImpact = Math.max(peakImpact, p.state.impact);
  }
  p.peakImpact = peakImpact;
  return p;
}

const npc = (x, z, yaw, speed = 0) =>
  ({ pos: new THREE.Vector3(x, 0, z), yaw, speed, halfLen: 2.4, halfWid: 0.91 });

// 1. Head-on into a stationary car dead ahead (+z): car must not pass through, must lose
//    nearly all speed, and the contact must be wreck-grade (closing >> hitNormalSpeed).
{
  const p = run([npc(0, 60, -Math.PI / 2, 0)], { speed: 40, seconds: 2 });
  const w = p.drainWreck();
  assert(p.state.pos.z < 60, `stopped short of the body (z=${p.state.pos.z.toFixed(1)})`);
  assert(p.peakImpact > 0.9, `head-on impact severity ${p.peakImpact.toFixed(2)} > 0.9`);
  assert(w && w.severity >= TUNE.wreckSeverity, `head-on published a wreck (${w?.severity.toFixed(2)})`);
}

// 2. Rear-ending a car doing (nearly) the hero's speed: relative closing is tiny, so it must
//    be a scrape, not a wreck, and the hero keeps most of his speed.
{
  const p = run([npc(0, 30, -Math.PI / 2, 38)], { speed: 40, seconds: 1.5 });
  assert(!p.drainWreck(), 'matched-speed rear-end is not a wreck');
  assert(p.state.speed > 30, `kept speed through matched-speed contact (${p.state.speed.toFixed(1)} m/s)`);
}

// 2b. Parked car dead ahead: same head-on outcome via setParkedBodies.
{
  const p = createPhysics({ blocks: [], bounds: 1e9 });
  p.setParkedBodies([{ x: 0, z: 60, fx: 0, fz: 1, halfLen: 2.2, halfWid: 0.91 }]);
  p.state.speed = 40;
  let peak = 0;
  for (let t = 0; t < 2; t += DT) {
    p.step(DT, { throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
    peak = Math.max(peak, p.state.impact);
  }
  const w = p.drainWreck();
  assert(p.state.pos.z < 60, `stopped short of parked car (z=${p.state.pos.z.toFixed(1)})`);
  assert(peak > 0.9 && w, `head-on into parked car is a wreck (impact ${peak.toFixed(2)})`);
}

// 3. No bodies: identical run must be untouched by the traffic branch (sanity/regression).
{
  const a = run([], { speed: 40, seconds: 2 });
  const b = createPhysics({ blocks: [], bounds: 1e9 });
  b.state.speed = 40;
  for (let t = 0; t < 2; t += DT) b.step(DT, { throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
  assert(Math.abs(a.state.speed - b.state.speed) < 1e-9, 'empty bodies list changes nothing');
}

console.log('carhit: all checks passed');

function assert(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exit(1); }
  console.log(`  ok: ${label}`);
}
