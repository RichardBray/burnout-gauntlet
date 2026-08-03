// _handling-critic3.mjs — wave-S handling critic, pass 3. Pass 2's collision geometry was wrong:
// a negative yaw sends the car AWAY from a wall on its +x side, so every trial read "no contact".
// Redone with the sign fixed, plus the spin-recovery probe pass 2's section Q raised.
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
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
}
const IS_SHIM = import.meta.url.includes('shim=1');
if (!IS_SHIM) await main();

async function main() {
const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
const shimUrl = `${import.meta.url}?shim=1`;
registerHooks({ resolve(s, c, n) { return s === 'three' ? { url: shimUrl, shortCircuit: true } : n(s, c); } });
const DEG = 180 / Math.PI, KMH = 3.6, DT = 1 / 120;
const base = await import('../game/physics.js');
function mk(speed = 0, yaw = 0, blocks = []) {
  const p = base.createPhysics({ blocks, bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), yaw, speed); return p;
}
function drive(p, sec, input, onTick) {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    p.setInput(typeof input === 'function' ? input(i * DT, p.state) : input);
    p.step(DT); onTick?.((i + 1) * DT, p.state);
  }
  return p.state;
}
const out = []; const say = (s) => { console.log(s); out.push(s); };
const hdr = (t) => { say(''); say('== ' + t); };

hdr('R2. COLLISION: a pass ALONG a wall face at increasing approach angles');
{
  // Long wall, inner face at x = 30 - 20 - 1 = +9 (the 1.0 m collision skin included).
  const wall = { cx: 30, cz: 0, w: 40, d: 6000 };
  for (const yawDeg of [1, 3, 8, 20, 45, 90]) {
    const yaw = yawDeg / DEG;          // POSITIVE yaw takes the nose toward +x, into the face
    const p = mk(50, yaw, [wall]);
    p.state.pos.set(0, 0, -400);
    let before = 50, firstAfter = null, minAfter = 1e9, contactT = null;
    drive(p, 12, { throttle: 1 }, (t, s) => {
      if (contactT === null && s.impact > 0) { contactT = t; firstAfter = s.ground; }
      if (contactT === null) before = s.ground; else minAfter = Math.min(minAfter, s.ground);
    });
    const closing = 50 * Math.sin(yaw);
    say(`  ${String(yawDeg).padStart(2)} deg approach (normal closing ~${closing.toFixed(1)} m/s):`
      + (contactT === null ? ' NO CONTACT in 12 s'
        : ` at t=${contactT.toFixed(2)}s  ${before.toFixed(1)} -> ${firstAfter.toFixed(1)} m/s`
          + ` (${(firstAfter / before * 100).toFixed(0)}% kept), min afterwards ${minAfter.toFixed(1)} m/s,`
          + ` end ${p.state.ground.toFixed(1)} m/s, crashed=${p.state.crashed}`));
  }
  say(`  TUNE: hitNormalSpeed ${base.TUNE.hitNormalSpeed} m/s, scrapeKeep ${base.TUNE.scrapeKeep},`
    + ` hitKeep ${base.TUNE.hitKeep}, wallFriction ${base.TUNE.wallFriction}`);
  // head-on into a wall face, the "real hit"
  const q = mk(50, 0, [{ cx: 0, cz: 400, w: 200, d: 200 }]);
  let b2 = 50, a2 = null;
  drive(q, 12, { throttle: 1 }, (t, s) => { if (a2 === null && s.impact > 0) a2 = s.ground; if (a2 === null) b2 = s.ground; });
  say(`  head-on into a facade: ${b2.toFixed(1)} -> ${a2.toFixed(1)} m/s (${(a2 / b2 * 100).toFixed(0)}% kept),`
    + ` end ${q.state.ground.toFixed(1)} m/s, crashed=${q.state.crashed}`);
}

hdr('V. SPIN RECOVERY: hold Space + A at speed, then let go. Can the player get out of it?');
{
  for (const v of [40, 55, 70]) {
    const p = mk(v);
    let peak = 0;
    drive(p, 2.5, { throttle: 1, steer: 1, handbrake: true }, (t, s) => { peak = Math.max(peak, Math.abs(s.slipAngle)); });
    const atRelease = { ang: p.state.slipAngle * DEG, yaw: p.state.yawRate * DEG, g: p.state.ground };
    // release everything but throttle and try to straighten with opposite lock
    let back = null;
    drive(p, 6, { throttle: 1, steer: -1 }, (t, s) => { if (back === null && Math.abs(s.slipAngle) * DEG < 10) back = t; });
    say(`  ${(v * KMH).toFixed(0).padStart(3)} km/h: peak slipAngle ${(peak * DEG).toFixed(0)} deg;`
      + ` at release ${atRelease.ang.toFixed(0)} deg / ${atRelease.yaw.toFixed(0)} deg/s / ${atRelease.g.toFixed(1)} m/s;`
      + ` straight again after ${back === null ? '>6 s' : back.toFixed(2) + ' s'};`
      + ` speed then ${p.state.ground.toFixed(1)} m/s`);
  }
}

hdr('W. STEERING RELEASE: does the car snap back when the key comes up?');
{
  for (const v of [20, 40, 70]) {
    const p = mk(v);
    drive(p, 2.5, { throttle: 1, steer: 1 });
    const r0 = p.state.yawRate * DEG;
    let t90 = null, overshoot = 0;
    drive(p, 2, { throttle: 1, steer: 0 }, (t, s) => {
      if (t90 === null && Math.abs(s.yawRate * DEG) < Math.abs(r0) * 0.1) t90 = t;
      if (Math.sign(s.yawRate) !== Math.sign(r0)) overshoot = Math.max(overshoot, Math.abs(s.yawRate) * DEG);
    });
    say(`  ${(v * KMH).toFixed(0).padStart(3)} km/h: steady ${r0.toFixed(1)} deg/s -> key released:`
      + ` down to 10% in ${t90 === null ? '>2 s' : t90.toFixed(2) + ' s'},`
      + ` counter-yaw overshoot ${overshoot.toFixed(1)} deg/s`);
  }
  say(`  steerRate ${base.TUNE.steerRate}/s, so the smoothed steer input itself takes`
    + ` ~${(3 / base.TUNE.steerRate).toFixed(2)} s to travel full lock -> centre`);
}

hdr('X. THE FEEL OF A CORNER: lateral g and the radius a player gets at road speeds');
{
  for (const v of [15, 20, 30, 40, 55, 70]) {
    const p = mk(v);
    drive(p, 3, () => { p.state.speed = v; return { throttle: 1, steer: 1 }; });
    const y0 = p.state.yaw;
    drive(p, 1, () => { p.state.speed = v; return { throttle: 1, steer: 1 }; });
    const r = (p.state.yaw - y0);
    say(`  ${(v * KMH).toFixed(0).padStart(3)} km/h: ${(r * DEG).toFixed(1).padStart(5)} deg/s,`
      + ` radius ${(v / r).toFixed(0).padStart(4)} m, lateral ${(r * v / 9.81).toFixed(2)} g,`
      + ` steer angle ${(p.state.steer).toFixed(2)} of lock`);
  }
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-critic-raw3.txt'), out.join('\n') + '\n');
}
