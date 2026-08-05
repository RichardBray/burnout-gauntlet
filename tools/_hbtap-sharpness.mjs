// _hbtap-sharpness.mjs — check for the handbrake tap-chain depth mechanic: more taps while
// turning must command a durably deeper slip and turn the car harder. Same shim/harness pattern
// as _hr2fix.mjs. PASS = peak slip and heading gained over the window both rise monotonically
// with tap count 1 -> 2 -> 3, and a 5-tap mash stays under the depth cap's commanded angle.
import { Vector3 } from './_handling-critic.mjs?shim=1';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
registerHooks({
  resolve(s, c, n) {
    return s === 'three'
      ? { url: new URL('./_handling-critic.mjs?shim=1', import.meta.url).href, shortCircuit: true }
      : n(s, c);
  },
});
const mod = await import(pathToFileURL(join(HERE, '..', 'game', 'physics.js')).href);
const DEG = 180 / Math.PI, DT = 1 / 120;

function run(taps, kmh = 100) {
  const p = mod.createPhysics({ blocks: [], bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), 0, kmh / 3.6);
  const yaw0 = p.state.yaw;
  let pk = 0;
  // load the corner, then tap chain: 0.15 s press / 0.20 s gap (inside the 0.70 s chain window)
  const press = 0.15, gap = 0.20, t0 = 0.5, total = 4.0;
  for (let i = 0; i < Math.round(total / DT); i++) {
    const t = i * DT;
    let hb = false;
    for (let k = 0; k < taps; k++) {
      const s = t0 + k * (press + gap);
      if (t >= s && t < s + press) hb = true;
    }
    p.setInput({ throttle: 1, steer: 1, handbrake: hb });
    p.step(DT);
    pk = Math.max(pk, Math.abs(p.state.slipAngle));
  }
  return { pk: pk * DEG, turned: Math.abs(p.state.yaw - yaw0) * DEG };
}

const r = [1, 2, 3, 5, 6].map((n) => ({ n, ...run(n) }));
for (const { n, pk, turned } of r) {
  console.log(`${n} tap(s): peak slip ${pk.toFixed(1)} deg, heading turned ${turned.toFixed(1)} deg`);
}
const mono = (f) => f(r[0]) < f(r[1]) && f(r[1]) < f(r[2]);
const over270 = r[3].turned > 270 && r[4].turned > 270;
console.assert(mono((x) => x.pk), 'FAIL: peak slip not monotonic in tap count');
console.assert(mono((x) => x.turned), 'FAIL: heading not monotonic in tap count');
console.assert(r[3].pk < 70, 'FAIL: 5-tap mash slip runs away past the depth cap (allow ~57 deg command + overshoot)');
console.assert(over270, 'FAIL: 5-6 taps must carry the heading past 270 deg');
console.log(mono((x) => x.pk) && mono((x) => x.turned) && r[3].pk < 70 && over270 ? 'PASS' : 'FAIL');
