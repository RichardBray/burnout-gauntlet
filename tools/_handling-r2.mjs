// _handling-r2.mjs — the round-2 handling BUILDER's instrument. Everything the round-2 brief
// names a target for, measured on the SAME manoeuvres the round-1 critic used, so the before and
// after numbers are directly comparable to `verdicts/wave-s/handling-critic.md`.
//
// Rules this file obeys, each of which cost the critic a retraction to establish:
//   * DRIFT DURATION IS MEASURED ON THE UNCLAMPED `state.slipAngle`, never on `state.slip`.
//     `state.slip` saturates at slipRef = 0.45 rad, so a deeper entry lowers the half-peak bar and
//     the metric can be improved by entering harder (critic section 3).
//   * The entry manoeuvre is the critic's own: 40 m/s, 0.8 s of throttle + full lock + e-brake.
//     Any change in the numbers below is therefore a change in the MODEL, not in the procedure.
//   * Brake input is capped at 0.6 wherever a "player" brakes, because that is what the FROZEN
//     `main.js:559` hands physics. A chain-drift number taken with brake = 1.0 is not a number a
//     player can reach.
//   * Speeds are reported as GROUND speed (hypot(vLong, vLat)), because `state.speed` is only the
//     longitudinal component and under-reads by up to 52% in a deep slide.
//
// Usage: node tools/_handling-r2.mjs [--brief]
import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// NOTE the `?shim=1` on both lines. Importing _handling-critic.mjs bare RUNS THE CRITIC'S whole
// suite and REWRITES verdicts/wave-s/handling-critic-raw.txt, i.e. it destroys the evidence this
// round is being judged against. The query makes its own IS_SHIM guard true so only the class
// definitions load. Found by doing it once and having to `git checkout` the critic's raw log.
export { Vector3, PerspectiveCamera, MathUtils } from './_handling-critic.mjs?shim=1';
import { Vector3 } from './_handling-critic.mjs?shim=1';

const IS_SHIM = import.meta.url.includes('shim=1');
if (!IS_SHIM) await main();

async function main() {
const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
const shimUrl = `${import.meta.url}?shim=1`;
registerHooks({ resolve(s, c, n) { return s === 'three' ? { url: shimUrl, shortCircuit: true } : n(s, c); } });
const DEG = 180 / Math.PI, KMH = 3.6, HZ = 120, DT = 1 / HZ;
const BRAKE_CAP = 0.6;                    // main.js:559, frozen
let vn = 0;
async function loadPhysics(edits = null) {
  if (!edits) return import('../game/physics.js');
  const dir = mkdtempSync(join(tmpdir(), 'hr2-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
  for (const [f, t] of edits) { if (!src.includes(f)) throw new Error('anchor missing: ' + f); src = src.replace(f, t); }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const base = await loadPhysics();
const { createCamRig } = await import('../game/camera.js');

function mk(mod, speed = 0, yaw = 0, blocks = [], bounds = 1e9) {
  const p = mod.createPhysics({ blocks, bounds });
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

// =============================================================================================
hdr('1. THE THREE DRIFT ORDERINGS (critic ranked item 1). Critic BEFORE: 0.63 / 0.61 / 0.68 s');
// The critic's entry, verbatim, so the numbers are comparable.
const enter = (mod = base, v = 40) => {
  const p = mk(mod, v);
  drive(p, 0.8, { throttle: 1, steer: 1, handbrake: true });
  return p;
};
async function orderings(mod, label) {
  const p0 = enter(mod);
  const peak = Math.abs(p0.state.slipAngle);
  const res = {};
  const cases = [
    ['centred', { throttle: 1, steer: 0 }],
    ['tap 0.15 s counter', (t) => ({ throttle: 1, steer: t < 0.15 ? -1 : 0 })],
    ['HELD counter', { throttle: 1, steer: -1 }],
    ['held INTO slide', { throttle: 1, steer: 1 }],
  ];
  for (const [k, inp] of cases) {
    const q = enter(mod);
    let hAng = 0, flag = 0, deepest = peak, gEnd = 0, done = false;
    drive(q, 6, inp, (t, s) => {
      // FIRST crossing below half the entry angle, not the last: a slide that has collapsed and
      // then been re-entered in the other direction is not "still held", and taking the last
      // sample above the bar would let that inflate the number.
      if (!done) { if (Math.abs(s.slipAngle) > peak * 0.5) hAng = t; else done = true; }
      if (s.drifting) flag = t;
      deepest = Math.max(deepest, Math.abs(s.slipAngle));
      gEnd = s.ground;
    });
    res[k] = { hAng, flag, deepest, gEnd };
  }
  say(`  ${label}: entry peak ${(peak * DEG).toFixed(1)} deg`);
  for (const [k] of cases) {
    const r = res[k];
    say(`    ${k.padEnd(20)} half-peak ${r.hAng.toFixed(2)} s | flag ${r.flag.toFixed(2)} s`
      + ` | deepest ${(r.deepest * DEG).toFixed(1)} deg | ground after 6 s ${(r.gEnd * KMH).toFixed(0)} km/h`);
  }
  const ok1 = res.centred.hAng >= 2.0;
  const ok2 = res['tap 0.15 s counter'].hAng > res.centred.hAng;
  const ok3 = res['HELD counter'].hAng < res.centred.hAng;
  say(`    ORDERING A persists through centred (>= 2.0 s): ${res.centred.hAng.toFixed(2)} s  ${ok1 ? 'HIT' : 'MISS'}`);
  say(`    ORDERING B tap LENGTHENS it: ${res['tap 0.15 s counter'].hAng.toFixed(2)} vs ${res.centred.hAng.toFixed(2)} s  ${ok2 ? 'HIT' : 'MISS'}`);
  say(`    ORDERING C held counter ENDS it: ${res['HELD counter'].hAng.toFixed(2)} vs ${res.centred.hAng.toFixed(2)} s  ${ok3 ? 'HIT' : 'MISS'}`);
  return res;
}
await orderings(base, 'shipped');
say('');
for (const v of [20, 30, 40, 55, 70]) {
  const p = enter(base, v);
  const peak = Math.abs(p.state.slipAngle);
  let hAng = 0, flag = 0;
  let done = false;
  drive(p, 6, { throttle: 1, steer: 0 }, (t, s) => {
    if (!done) { if (Math.abs(s.slipAngle) > peak * 0.5) hAng = t; else done = true; }
    if (s.drifting) flag = t;
  });
  say(`  entry at ${(v * KMH).toFixed(0).padStart(3)} km/h: peak ${(peak * DEG).toFixed(0).padStart(2)} deg,`
    + ` centred half-peak ${hAng.toFixed(2)} s, flag ${flag.toFixed(2)} s`);
}

// =============================================================================================
hdr('2. BRAKE-TAP CHAIN DRIFT through the real keybinds (critic BEFORE: peak 6 deg, 0% drifting)');
{
  // The critic's play test: six alternating beats of "tap brake, turn" at 130 km/h, brake capped
  // at main.js's 0.6. Beat = 0.2 s of brake with the new direction already commanded, then 0.8 s
  // of load on that direction.
  for (const v of [28, 36, 42]) {
    const p = mk(base, v);
    let peak = 0, nDrift = 0, nAll = 0, minG = 1e9;
    // 0.6 s of load in the first direction (what a player does approaching the first corner),
    // then repeating beats of "tap brake, turn the other way, hold".
    const BEAT = 1.0, TAP = 0.2, LEAD = 0.6;
    drive(p, 6 + LEAD, (t) => {
      if (t < LEAD) return { throttle: 1, steer: 1 };
      const beat = Math.floor((t - LEAD) / BEAT);
      const dir = beat % 2 === 0 ? 1 : -1;
      const inTap = ((t - LEAD) % BEAT) < TAP;
      return { throttle: inTap ? 0 : 1, brake: inTap ? BRAKE_CAP : 0, steer: dir };
    }, (t, s) => {
      peak = Math.max(peak, Math.abs(s.slipAngle)); nAll++; if (s.drifting) nDrift++;
      minG = Math.min(minG, s.ground);
    });
    say(`  chain at ${(v * KMH).toFixed(0)} km/h: peak ${(peak * DEG).toFixed(1)} deg,`
      + ` ${(100 * nDrift / nAll).toFixed(0)}% of samples drifting, ground ${(minG * KMH).toFixed(0)}`
      + `-${(p.state.ground * KMH).toFixed(0)} km/h`);
  }
  // The brief's own target: one 200 ms tap at 100-150 km/h after 0.5 s of load must ARM the drift
  // and hold it long enough for the next beat (>= 0.5 s).
  for (const v of [28, 36, 42]) {
    const p = mk(base, v);
    drive(p, 0.5, { throttle: 1, steer: 1 });
    let armed = false, peak = 0;
    drive(p, 0.2, { brake: BRAKE_CAP, steer: 1 }, (t, s) => { armed = armed || s.drifting; peak = Math.max(peak, Math.abs(s.slipAngle)); });
    let flag = 0;
    drive(p, 2.0, { throttle: 1, steer: 1 }, (t, s) => { if (s.drifting) flag = t; peak = Math.max(peak, Math.abs(s.slipAngle)); });
    say(`  single tap at ${(v * KMH).toFixed(0)} km/h after 0.5 s load: armed ${armed ? 'YES' : 'NO'},`
      + ` peak ${(peak * DEG).toFixed(1)} deg, drift flag held ${flag.toFixed(2)} s  `
      + `${armed && flag >= 0.5 ? 'HIT' : 'MISS'}`);
  }
}

// =============================================================================================
hdr('3. E-BRAKE (critic BEFORE: +26% at 80, +8% at 130, -11% at 200, -86% at 250 km/h)');
{
  say('   km/h |  hold 0.5 s |  hold 1.0 s |  hold 2.0 s |  hold 3.2 s | peak yaw | peak slip');
  for (const v of [80 / KMH, 130 / KMH, 200 / KMH, 250 / KMH]) {
    const row = [];
    let pkYaw = 0, pkSlip = 0;
    for (const hold of [0.5, 1.0, 2.0, 3.2]) {
      const p = mk(base, v);
      const g0 = p.state.ground;
      drive(p, hold, { throttle: 1, steer: 1, handbrake: true }, (t, s) => {
        pkYaw = Math.max(pkYaw, Math.abs(s.yawRate)); pkSlip = Math.max(pkSlip, Math.abs(s.slipAngle));
      });
      row.push((100 * (p.state.ground - g0) / g0));
    }
    let mono = true;
    for (let i = 1; i < row.length; i++) if (row[i] > row[i - 1] + 0.2) mono = false;
    const noAccel = row.every((r) => r <= 0);
    say(`   ${(v * KMH).toFixed(0).padStart(4)} | ${row.map((r) => (r >= 0 ? '+' : '') + r.toFixed(1) + '%').map((s) => s.padStart(11)).join(' | ')}`
      + ` | ${(pkYaw * DEG).toFixed(0).padStart(6)}/s | ${(pkSlip * DEG).toFixed(0).padStart(6)} deg`
      + `  ${mono ? 'monotone' : 'NON-MONOTONE'} ${noAccel ? '' : 'ACCELERATES'}`);
  }
  // Does it actually rotate the car? Yaw gained over 1.5 s of e-brake + lock, vs the same without.
  for (const v of [80 / KMH, 200 / KMH]) {
    const a = mk(base, v); const y0 = a.state.yaw; drive(a, 1.5, { throttle: 1, steer: 1, handbrake: true });
    const b = mk(base, v); const z0 = b.state.yaw; drive(b, 1.5, { throttle: 1, steer: 1 });
    say(`   rotation at ${(v * KMH).toFixed(0)} km/h over 1.5 s: e-brake ${((a.state.yaw - y0) * DEG).toFixed(0)} deg`
      + ` vs no e-brake ${((b.state.yaw - z0) * DEG).toFixed(0)} deg`);
  }
}

// =============================================================================================
hdr('4. WALL CONTACT (critic BEFORE: 231 -> 69 km/h, 30% retained at 20 deg AND at 90 deg)');
{
  // A single block whose FRONT face the car meets at a chosen angle. The car starts 40 m out,
  // aimed at the face, yawed by `ang` off the normal. Retained = ground speed 0.3 s after contact.
  // GRAZING ANGLE, i.e. the angle between the car's travel and the WALL FACE. This is the
  // parametrisation the critic had to correct itself on: a car yawed 1 deg off a wall's front face
  // is still hitting that face nearly head-on. Here the wall runs ALONG the direction of travel and
  // `ang` is how far the car is turned into it, so 1 deg really is a graze and 90 deg is square.
  for (const ang of [1, 3, 8, 20, 45, 90]) {
    const v = 64;   // 231 km/h, the critic's number
    const blocks = [{ cx: 60, cz: 0, w: 40, d: 4000 }];
    const p = mk(base, v, ang * Math.PI / 180, blocks);
    p.state.pos.z = -1500;
    const g0 = p.state.ground;
    let hit = null, gAfter = null;
    drive(p, 8, { throttle: 1 }, (t, s) => {
      if (hit === null && s.impact > 0) hit = t;
      if (hit !== null && gAfter === null && t > hit + 0.3) gAfter = s.ground;
    });
    say(`  ${String(ang).padStart(2)} deg INTO a wall face at ${(g0 * KMH).toFixed(0)} km/h:`
      + ` ${gAfter === null ? 'no contact' : (gAfter * KMH).toFixed(0) + ' km/h ('
        + (100 * gAfter / g0).toFixed(0) + '% retained)'}`
      + ` | 4 s later ${(p.state.ground * KMH).toFixed(0)} km/h`
      + ` | wreck ${p.drainWreck() ? 'YES' : 'no'}`);
  }
  // Glancing pass ALONG a wall face (the critic's corrected geometry): car parallel, drifting in.
  {
    const blocks = [{ cx: 30, cz: 0, w: 40, d: 400 }];
    const p = mk(base, 64, 0, blocks);
    p.state.pos.x = 8.9; p.state.pos.z = -100;
    const g0 = p.state.ground;
    let gMin = g0;
    drive(p, 3, { throttle: 1, steer: -0.08 }, (t, s) => { gMin = Math.min(gMin, s.ground); });
    say(`  graze ALONG a face at ${(g0 * KMH).toFixed(0)} km/h: min ${(gMin * KMH).toFixed(0)} km/h`
      + ` (${(100 * gMin / g0).toFixed(0)}% retained), end ${(p.state.ground * KMH).toFixed(0)} km/h`);
  }
}

// =============================================================================================
hdr('5. THE GRIP EDGE (critic BEFORE: dead-flat 28-29 deg/s, slip never above 4.9 deg at 250 km/h)');
{
  for (const v of [40.2, 69.4]) {   // 145 and 250 km/h
    for (const [label, inp] of [['throttle 1', { throttle: 1, steer: 1 }], ['throttle 0', { throttle: 0, steer: 1 }]]) {
      const p = mk(base, v);
      const trace = [];
      let pkSlip = 0;
      drive(p, 6, inp, (t, s) => {
        if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) trace.push((s.yawRate * DEG).toFixed(0));
        pkSlip = Math.max(pkSlip, Math.abs(s.slipAngle));
      });
      say(`  held lock at ${(v * KMH).toFixed(0)} km/h, ${label}: yaw ${trace.join(' ')} deg/s`
        + ` | peak slip ${(pkSlip * DEG).toFixed(1)} deg | end ${(p.state.ground * KMH).toFixed(0)} km/h`);
    }
  }
  // yaw-rate curve, pinned, for the regression check against the critic's table
  const speeds = [12.5, 20, 30, 40.2, 50, 60, 70, 78];
  const row = [];
  for (const v of speeds) {
    const p = mk(base, v);
    drive(p, 3, () => { p.state.speed = v; return { steer: 1, throttle: 1 }; });
    const y0 = p.state.yaw;
    drive(p, 1, () => { p.state.speed = v; return { steer: 1, throttle: 1 }; });
    row.push(`${v}:${((p.state.yaw - y0) * DEG).toFixed(1)}`);
  }
  say(`  pinned yaw curve (m/s:deg/s) ${row.join('  ')}`);
}

// =============================================================================================
hdr('6. BOOST ECONOMY: passive refill, and the event stream (contract in tools/WAVE-S-ROUND2.md)');
{
  // Passive: from empty, hold W at speed, no events, no drifting. Paradise: NEVER fills.
  const p = mk(base, 70);
  p.state.boost = 0;
  let t1 = null;
  drive(p, 90, { throttle: 1 }, (t, s) => { if (t1 === null && s.boost >= 0.999) t1 = t; });
  say(`  passive only, 90 s of holding W at ${(p.state.ground * KMH).toFixed(0)} km/h:`
    + ` bar ${(p.state.boost * 100).toFixed(1)}% ${t1 === null ? '(never fills)' : '(full at ' + t1.toFixed(1) + ' s)'}`);
  // setEventSource present?
  const q = mk(base, 60);
  if (typeof q.setEventSource !== 'function') { say('  setEventSource: ABSENT'); }
  else {
    for (const type of ['nearMiss', 'oncoming', 'check']) {
      const r = mk(base, 60); r.state.boost = 0;
      let n = 0, full = null;
      r.setEventSource(() => { n++; return [{ type, amount: 1, at: { x: 0, z: 0 } }]; });
      drive(r, 30, { throttle: 1 }, (t, s) => { if (full === null && s.boost >= 0.999) full = n; });
      say(`  ${type.padEnd(9)} at intensity 1.0: full bar after ${full === null ? '>' + n : full} events`
        + ` (bar ${(r.state.boost * 100).toFixed(0)}%)`);
    }
    // realistic mix at 0.65 intensity
    const r = mk(base, 60); r.state.boost = 0; let n = 0, full = null;
    const types = ['nearMiss', 'nearMiss', 'nearMiss', 'oncoming', 'check'];
    r.setEventSource(() => { const e = [{ type: types[n % types.length], amount: 0.65, at: { x: 0, z: 0 } }]; n++; return e; });
    drive(r, 60, { throttle: 1 }, (t, s) => { if (full === null && s.boost >= 0.999) full = n; });
    say(`  mixed 3:1:1 at intensity 0.65: full bar after ${full === null ? '>' + n : full} events`);
    // an unknown type must not throw and must not pay
    const z = mk(base, 60); z.state.boost = 0;
    z.setEventSource(() => [{ type: 'somethingElse', amount: 1 }, null, { amount: 1 }]);
    drive(z, 2, { throttle: 1 });
    say(`  malformed/unknown events over 2 s: bar ${(z.state.boost * 100).toFixed(2)}% (must be ~0), no throw`);
    // drift earn, which the brief says is legitimate
    const d = enter(base); d.state.boost = 0;
    drive(d, 4, { throttle: 1, steer: 0 });
    say(`  4 s of drift after an e-brake entry, no events: bar ${(d.state.boost * 100).toFixed(0)}%`);
  }
}

// =============================================================================================
hdr('7. CAMERA vs CAR through a slide (critic: camera.js:286 out-turns the car by construction)');
{
  const { PerspectiveCamera } = await import('./_handling-critic.mjs?shim=1');
  const cam = new PerspectiveCamera(44);
  const rig = createCamRig(cam);
  rig.configure({ mode: 'chase', distance: 7.4, height: 1.75, lookAhead: 9, lookHeight: 1.25, fov: 44 });
  const p = enter(base);
  rig.snap();
  say('    t |  yaw deg | camYaw deg | velHeading deg | cam-yaw | cam is');
  let worst = 0, side = new Set();
  drive(p, 2.0, { throttle: 1, steer: 0 }, (t, s) => {
    rig.update(DT, s);
    const camYaw = Math.atan2(cam.position.x - s.pos.x, cam.position.z - s.pos.z) + Math.PI;
    const vel = s.yaw + Math.atan2(s.vLat, Math.max(Math.abs(s.speed), 0.6));
    const d = ((camYaw - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(s.slipAngle) > 0.1) {
      // Which side of the car's heading does the rig sit on, relative to the slide?
      side.add(Math.sign(d) === Math.sign(s.slipAngle) ? 'AHEAD-of-car(bad)' : 'LAGS-toward-velocity(good)');
      worst = Math.max(worst, Math.abs(d));
    }
    if (Math.abs(t * 4 - Math.round(t * 4)) < 1e-6 && t <= 1.25) {
      say(`  ${t.toFixed(2)} | ${(s.yaw * DEG).toFixed(1).padStart(8)} | ${(camYaw * DEG).toFixed(1).padStart(10)}`
        + ` | ${(vel * DEG).toFixed(1).padStart(14)} | ${(d * DEG).toFixed(1).padStart(7)}`);
    }
  });
  say(`  rig azimuth vs car heading during the slide: ${[...side].join(', ')}; max offset ${(worst * DEG).toFixed(1)} deg`);
}


// =============================================================================================
hdr('8. KILL-CONTROLS. Every claim in the verdict, tested by DELETING the term (brief rule 6).');
// Each control is a physically modified copy of physics.js on disk, because module-level constants
// (CD, POWER_BOOST) are frozen at import and mutating TUNE afterwards proves nothing.
{
  async function kc(label, edits, what) {
    const mod = await loadPhysics(edits);
    const r = {};
    // orderings
    const en = (v = 40) => { const p = mk(mod, v); drive(p, 0.8, { throttle: 1, steer: 1, handbrake: true }); return p; };
    const p0 = en(); const peak = Math.abs(p0.state.slipAngle);
    for (const [k, inp] of [['centred', { throttle: 1, steer: 0 }],
      ['tap', (t) => ({ throttle: 1, steer: t < 0.15 ? -1 : 0 })],
      ['held', { throttle: 1, steer: -1 }]]) {
      const q = en(); let h = 0, done = false;
      drive(q, 6, inp, (t, st) => { if (!done) { if (Math.abs(st.slipAngle) > peak * 0.5) h = t; else done = true; } });
      r[k] = h;
    }
    // e-brake at 80 km/h, 2 s
    const e = mk(mod, 80 / KMH); const g0 = e.state.ground;
    drive(e, 2.0, { throttle: 1, steer: 1, handbrake: true });
    r.ebrake80 = 100 * (e.state.ground - g0) / g0;
    // 20 deg and 90 deg wall
    for (const ang of [20, 90]) {
      const blocks = [{ cx: 60, cz: 0, w: 40, d: 4000 }];
      const p = mk(mod, 64, ang * Math.PI / 180, blocks); p.state.pos.z = -1500;
      let hit = null, after = null;
      drive(p, 8, { throttle: 1 }, (t, st) => {
        if (hit === null && st.impact > 0) hit = t;
        if (hit !== null && after === null && t > hit + 0.3) after = st.ground;
      });
      r['wall' + ang] = after === null ? null : 100 * after / 64;
    }
    say(`  ${label}`);
    say(`      entry ${(peak * DEG).toFixed(0)} deg | centred ${r.centred.toFixed(2)} s | tap ${r.tap.toFixed(2)} s`
      + ` | held ${r.held.toFixed(2)} s | e-brake@80 2 s ${r.ebrake80 >= 0 ? '+' : ''}${r.ebrake80.toFixed(1)}%`
      + ` | wall 20/90 deg ${r.wall20 === null ? 'none' : r.wall20.toFixed(0) + '%'}/${r.wall90 === null ? 'none' : r.wall90.toFixed(0) + '%'}`);
    if (what) say(`      -> ${what}`);
    return r;
  }
  const base0 = await kc('BASELINE (shipped)', null, null);
  await kc('driftAngularDamping 0.24 -> 0.48 (it is a 1/s decay rate: the hold must HALVE)',
    [['  driftAngularDamping: 0.24,', '  driftAngularDamping: 0.48,']],
    'the hold must track 1/k, which is the whole claim that this constant has a unit');
  await kc('driftYawAuthority 0.90 -> 0 (the feed-forward that makes the angle dynamics exact)',
    [['  driftYawAuthority: 0.90,', '  driftYawAuthority: 0,']],
    'without it the tyre moment is an uncancelled disturbance and the slide decays on its own');
  await kc('driftFlick 0.18 -> 0 (the term that makes a TAPPED countersteer lengthen the slide)',
    [['  driftFlick: 0.18,', '  driftFlick: 0,']],
    'ordering B must collapse: tap should stop beating centred');
  await kc('rHold -> rTarget in the drift branch (round 1\'s formulation, restored)',
    [['      const ref = lerp(rSustain, rTarget, gather);', '      const ref = rTarget;']],
    'this is the round-1 bug in one line: aim the drift assist at the driver\'s rate, not the holding rate');
  await kc('the front-axle e-brake bug, restored (fxFront back to m*aDrive*(1-driveRear))',
    [['    let fxFront = m * aDrive * (1 - TUNE.driveSplitRear)', '    let fxFront = m * aDrive * (1 - driveRear)']],
    'the e-brake must ACCELERATE the car again at 80 km/h');
  await kc('the shunt removed (keep applied to state.speed, vLat thrown away: round 1)',
    [['          shunt(vx, vz, nx, nz, lerp(TUNE.scrapeKeep, TUNE.hitKeep, sev));',
      '          state.speed *= lerp(TUNE.scrapeKeep, TUNE.hitKeep, sev); state.vLat *= lerp(0.85, 0.2, sev);']],
    'a 20 deg graze must lose its tangential momentum again');
  await kc('hitNormalSpeed 34 -> 12 (round 1: the severity ramp saturating at 11 deg of approach)',
    [['  hitNormalSpeed: 34,', '  hitNormalSpeed: 12,']],
    '20 deg and 90 deg must become the same outcome again');
  say(`  baseline for comparison: centred ${base0.centred.toFixed(2)} | tap ${base0.tap.toFixed(2)} | held ${base0.held.toFixed(2)}`);
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-r2-raw.txt'), out.join('\n') + '\n');
say('');
say('raw -> verdicts/wave-s/handling-r2-raw.txt');
}
