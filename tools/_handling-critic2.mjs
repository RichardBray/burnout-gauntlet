// _handling-critic2.mjs — wave-S handling critic, pass 2. Targeted at the four places where pass 1
// disagreed with the builder's report, plus the kill-controls pass 1 ran in the wrong scenario.
//
// 1. DRIFT HOLD. The builder scores `|state.slip| > half of peak |state.slip|`. `state.slip` is
//    CLAMPED to +-1 at slipRef = 0.45 rad (25.8 deg), so any entry deeper than 25.8 deg records a
//    "peak" of 1.00 and the half-peak bar becomes 12.9 deg of a slide that was really 60+ deg.
//    The deeper the entry, the lower the bar. Measured here against the UNCLAMPED slipAngle and
//    against an absolute angle, both alongside the builder's own reduction.
// 2. COLLISION GRAZE. Pass 1's shallow-yaw approach still hits the block's FRONT face nearly
//    square, so it is a head-on hit at a shallow heading, not a graze. Redone as a pass ALONG a
//    wall face.
// 3. slideDrop / scrubTransfer / driftMinHold / absHold kill-controls, run in a DRIFT, which is the
//    only scenario in which those terms are claimed to do anything.
// 4. Camera: separate the TRANSIENT punch from the sustained speed/boost widening by killing
//    kickFov and kickPunch.
import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export { Vector3, PerspectiveCamera, MathUtils } from './_handling-critic.mjs';
import { Vector3 } from './_handling-critic.mjs';

const IS_SHIM = import.meta.url.includes('shim=1');
if (!IS_SHIM) await main();

async function main() {
const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
const shimUrl = `${import.meta.url}?shim=1`;
registerHooks({ resolve(s, c, n) { return s === 'three' ? { url: shimUrl, shortCircuit: true } : n(s, c); } });
const DEG = 180 / Math.PI, KMH = 3.6, HZ = 120, DT = 1 / HZ;
let vn = 0;
async function loadPhysics(edits = null) {
  if (!edits) return import('../game/physics.js');
  const dir = mkdtempSync(join(tmpdir(), 'hc2-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
  for (const [f, t] of edits) { if (!src.includes(f)) throw new Error('anchor missing: ' + f); src = src.replace(f, t); }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const base = await loadPhysics();
const { createCamRig } = await import('../game/camera.js');
function mk(mod, speed = 0, yaw = 0, blocks = []) {
  const p = mod.createPhysics({ blocks, bounds: 1e9 });
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

// ---------------------------------------------------------------------------------------------
hdr('P. DRIFT HOLD, the builder\'s own reduction vs the unclamped angle');
{
  // The builder's exact entry: 40 m/s, 0.8 s of throttle + full lock + e-brake.
  const enter = (mod = base) => {
    const p = mk(mod, 40);
    drive(p, 0.8, { throttle: 1, steer: 1, handbrake: true });
    return p;
  };
  const p = enter();
  say(`  builder's entry (40 m/s, 0.8 s throttle+lock+e-brake):`);
  say(`      |slip| (clamped proxy) = ${Math.abs(p.state.slip).toFixed(3)}  <- saturated at 1.0`);
  say(`      slipAngle (real)       = ${(p.state.slipAngle * DEG).toFixed(1)} deg`);
  say(`      slipRef = ${base.TUNE.slipRef} rad = ${(base.TUNE.slipRef * DEG).toFixed(1)} deg, so |slip|=1 at`
    + ` ${(base.TUNE.slipRef * DEG).toFixed(1)} deg and everything deeper reads the same`);
  for (const [label, inp] of [
    ['steer CENTRED, throttle on', { throttle: 1, steer: 0 }],
    ['0.15 s countersteer then centred', (t) => ({ throttle: 1, steer: t < 0.15 ? -1 : 0 })],
    ['HELD full opposite lock', { throttle: 1, steer: -1 }],
    ['steer HELD into the slide', { throttle: 1, steer: 1 }],
  ]) {
    const q = enter();
    const peakSlip = Math.abs(q.state.slip), peakAng = Math.abs(q.state.slipAngle);
    let hSlip = 0, hAng = 0, hAbs = 0, flag = 0;
    drive(q, 4, inp, (t, s) => {
      if (Math.abs(s.slip) > peakSlip * 0.5) hSlip = t;
      if (Math.abs(s.slipAngle) > peakAng * 0.5) hAng = t;
      if (Math.abs(s.slipAngle) * DEG > 10) hAbs = t;   // 10 deg: above the rear tyre's 7.4 deg sat
      if (s.drifting) flag = t;
    });
    say(`  ${label.padEnd(34)} builder's |slip|>half ${hSlip.toFixed(2)} s |`
      + ` slipAngle>half ${hAng.toFixed(2)} s | slipAngle>10deg ${hAbs.toFixed(2)} s |`
      + ` drifting flag ${flag.toFixed(2)} s`);
  }
  // Same probe at a road speed a player actually drifts at.
  say('');
  for (const v of [20, 30, 40, 55]) {
    const q = mk(base, v);
    drive(q, 0.8, { throttle: 1, steer: 1, handbrake: true });
    const pa = Math.abs(q.state.slipAngle);
    let hAng = 0, flag = 0;
    drive(q, 4, { throttle: 1, steer: 0 }, (t, s) => {
      if (Math.abs(s.slipAngle) > pa * 0.5) hAng = t; if (s.drifting) flag = t;
    });
    say(`  entry at ${(v * KMH).toFixed(0).padStart(3)} km/h: peak ${(pa * DEG).toFixed(0).padStart(2)} deg,`
      + ` half-peak survives ${hAng.toFixed(2)} s, flag ${flag.toFixed(2)} s`);
  }
}

// ---------------------------------------------------------------------------------------------
hdr('Q. HANDBRAKE HELD: what a player who just holds Space actually gets');
{
  for (const v of [15, 25, 40, 55, 70]) {
    const p = mk(base, v);
    let peak = 0, peakYaw = 0;
    drive(p, 3, { throttle: 1, steer: 1, handbrake: true }, (t, s) => {
      peak = Math.max(peak, Math.abs(s.slipAngle)); peakYaw = Math.max(peakYaw, Math.abs(s.yawRate));
    });
    say(`  ${(v * KMH).toFixed(0).padStart(3)} km/h: 3 s of e-brake+lock -> peak slipAngle`
      + ` ${(peak * DEG).toFixed(0).padStart(2)} deg, peak yaw ${(peakYaw * DEG).toFixed(0).padStart(3)} deg/s,`
      + ` end ground ${p.state.ground.toFixed(1)} m/s (from ${v})`);
  }
}

// ---------------------------------------------------------------------------------------------
hdr('R. COLLISION, done properly: a pass ALONG a wall face vs a square hit');
{
  // Wall face at x = +10 (block centred at cx=30, w=40 => face at x=10, plus the 1.0 m skin).
  // Car starts at x=9, heading +z at a small yaw INTO the face: closing speed = v*sin(yaw).
  const wall = { cx: 30, cz: 0, w: 40, d: 4000 };
  for (const yawDeg of [1, 3, 8, 20, 45, 90]) {
    const yaw = -yawDeg / DEG;   // negative yaw turns the nose toward +x, i.e. into the face
    const p = mk(base, 50, yaw, [wall]);
    p.state.pos.set(5, 0, -200);
    let before = 50, after = null, minAfter = 50;
    drive(p, 6, { throttle: 0 }, (t, s) => {
      if (after === null && s.impact > 0) after = s.ground;
      if (after === null) before = s.ground;
      if (after !== null) minAfter = Math.min(minAfter, s.ground);
    });
    say(`  approach ${String(yawDeg).padStart(2)} deg (normal closing ${(50 * Math.sin(yaw / 1) * -1).toFixed(1)} m/s):`
      + ` ${before.toFixed(1)} -> ${after === null ? 'no contact' : after.toFixed(1)} m/s`
      + ` (${after === null ? '-' : (after / before * 100).toFixed(0) + '% retained'}),`
      + ` min after ${minAfter.toFixed(1)} m/s, crashed=${p.state.crashed}`);
  }
  say(`  hitNormalSpeed ${base.TUNE.hitNormalSpeed} m/s, scrapeKeep ${base.TUNE.scrapeKeep},`
    + ` hitKeep ${base.TUNE.hitKeep}`);
}

// ---------------------------------------------------------------------------------------------
hdr('S. KILL-CONTROLS in the DRIFT scenario (pass 1 ran these at full lock, which is the wrong test)');
{
  const probe = async (label, edits) => {
    const mod = edits ? await loadPhysics(edits) : base;
    if (edits) for (const [f] of edits) {
      const k = f.trim().split(':')[0]; if (mod.TUNE[k] !== undefined) say(`      [patch check] TUNE.${k} = ${mod.TUNE[k]}`);
    }
    // (i) brake tap under load at 40 m/s
    const a = mk(mod, 40); drive(a, 0.7, { throttle: 1, steer: 1 });
    let pkTap = 0, armed = false;
    drive(a, 0.18, { brake: 1, steer: 1 }, (t, s) => { pkTap = Math.max(pkTap, Math.abs(s.slipAngle)); armed = armed || s.drifting; });
    let recov = null;
    drive(a, 2, { throttle: 1, steer: 1 }, (t, s) => {
      pkTap = Math.max(pkTap, Math.abs(s.slipAngle));
      if (recov === null && Math.abs(s.slipAngle) * DEG < 10) recov = t;
    });
    // (ii) e-brake entry then centred, hold time on the real angle
    const b = mk(mod, 40); drive(b, 0.8, { throttle: 1, steer: 1, handbrake: true });
    const pk = Math.abs(b.state.slipAngle); let hold = 0;
    drive(b, 4, { throttle: 1, steer: 0 }, (t, s) => { if (Math.abs(s.slipAngle) > pk * 0.5) hold = t; });
    // (iii) held opposite lock: does it gather up
    const c = mk(mod, 40); drive(c, 0.8, { throttle: 1, steer: 1, handbrake: true });
    let gather = null;
    drive(c, 4, { throttle: 1, steer: -1 }, (t, s) => { if (gather === null && Math.abs(s.slipAngle) * DEG < 10) gather = t; });
    say(`  ${label}`);
    say(`      brake tap: peak ${(pkTap * DEG).toFixed(1)} deg, armed=${armed},`
      + ` back under 10 deg after ${recov === null ? '>2 s' : recov.toFixed(2) + ' s'}`);
    say(`      e-brake entry ${(pk * DEG).toFixed(0)} deg -> centred: half-peak for ${hold.toFixed(2)} s;`
      + ` held opposite lock gathers in ${gather === null ? '>4 s' : gather.toFixed(2) + ' s'}`);
  };
  await probe('baseline:', null);
  await probe('slideDrop 0.22 -> 0 (builder: "every slide self-corrects"):', [['  slideDrop: 0.22,', '  slideDrop: 0,']]);
  await probe('scrubTransfer 0.35 -> 1.0 (builder: "unrecoverable, 41 deg with full opposite lock"):', [['  scrubTransfer: 0.35,', '  scrubTransfer: 1.0,']]);
  await probe('scrubTransfer 0.35 -> 0 (builder: "drifts noticeably shallower and shorter"):', [['  scrubTransfer: 0.35,', '  scrubTransfer: 0,']]);
  await probe('absHold 0.985 -> 0.92 (builder: "a tap only reached peak |slip| 0.22"):', [['  absHold: 0.985,', '  absHold: 0.92,']]);
  await probe('driftMinHold 0.50 -> 0 (builder: the hold "lets a brake TAP produce a drift"):', [['  driftMinHold: 0.50,', '  driftMinHold: 0,']]);
  await probe('handbrakeAssist 0.25 -> 2.6 (builder: "e-brake reached only |slip| 0.07"):', [['  handbrakeAssist: 0.25,', '  handbrakeAssist: 2.6,']]);
  await probe('driftAngularDamping 0.40 -> 0 (Paradise: lower = drifts more sharply):', [['  driftAngularDamping: 0.40,', '  driftAngularDamping: 0,']]);
  await probe('driftStabilityAssist 0.80 -> 0:', [['  driftStabilityAssist: 0.80,', '  driftStabilityAssist: 0,']]);
}

// ---------------------------------------------------------------------------------------------
hdr('T. BOOST CAMERA: transient PUNCH vs sustained widening (kill kickFov / kickPunch)');
{
  const camDir = mkdtempSync(join(tmpdir(), 'hc2cam-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(camDir, 'util.js'));
  async function rigOf(edits) {
    if (!edits) return createCamRig;
    let src = readFileSync(join(HERE, '..', 'game', 'camera.js'), 'utf8');
    for (const [f, t] of edits) { if (!src.includes(f)) throw new Error('cam anchor missing: ' + f); src = src.replace(f, t); }
    const f = join(camDir, `c${++vn}.js`); writeFileSync(f, src);
    return (await import(pathToFileURL(f).href)).createCamRig;
  }
  const { PerspectiveCamera } = await import('./_handling-critic.mjs');
  async function run(label, edits) {
    const make = await rigOf(edits);
    const cam = new PerspectiveCamera(44); const rig = make(cam); rig.configure({ mode: 'chase' });
    const p = mk(base, 55); let first = true;
    const dist = () => Math.hypot(cam.position.x - p.state.pos.x, cam.position.z - p.state.pos.z);
    const step = (inp) => { if (inp.boost) p.state.boost = 1; p.setInput(inp); p.step(DT); rig.update(DT, p.state, first); first = false; };
    for (let i = 0; i < 240; i++) step({ throttle: 1 });
    const f0 = cam.fov, d0 = dist();
    const tr = [];
    for (let i = 0; i < 480; i++) { step({ throttle: 1, boost: true }); tr.push({ t: (i + 1) * DT, fov: cam.fov, d: dist(), v: p.state.ground }); }
    const at = (s) => tr[Math.round(s / DT) - 1];
    const pk = tr.reduce((a, b) => (b.fov > a.fov ? b : a));
    const lo = tr.reduce((a, b) => (b.d < a.d ? b : a));
    say(`  ${label}`);
    say(`      fov ${f0.toFixed(2)} -> 50ms ${at(0.05).fov.toFixed(2)} | 100ms ${at(0.1).fov.toFixed(2)}`
      + ` | 200ms ${at(0.2).fov.toFixed(2)} | peak ${pk.fov.toFixed(2)}@${pk.t.toFixed(2)}s | 4s ${at(4).fov.toFixed(2)}`);
    say(`      standoff ${d0.toFixed(2)} -> 100ms ${at(0.1).d.toFixed(2)} | min ${lo.d.toFixed(2)}@${lo.t.toFixed(2)}s`
      + ` | 4s ${at(4).d.toFixed(2)} m   (speed ${55} -> ${at(4).v.toFixed(1)} m/s over the window)`);
  }
  await run('baseline rig:', null);
  await run('kickFov 5.0 -> 0, kickPunch 0.55 -> 0 (the TRANSIENT punch deleted):',
    [['  kickFov: 5.0,', '  kickFov: 0,'], ['  kickPunch: 0.55,', '  kickPunch: 0,']]);
  await run('boost terms deleted too (fovBoost 10 -> 0, distBoost 0.08 -> 0): pure speed widening',
    [['  kickFov: 5.0,', '  kickFov: 0,'], ['  kickPunch: 0.55,', '  kickPunch: 0,'],
     ['  fovBoost: 10,', '  fovBoost: 0,'], ['  distBoost: 0.08,', '  distBoost: 0,']]);
}

// ---------------------------------------------------------------------------------------------
hdr('U. BOOST ECONOMY: how often can a player boost, and does passive refill dominate?');
{
  const p = mk(base, 0);
  const events = [];
  let last = null;
  drive(p, 120, { throttle: 1, boost: true }, (t, s) => {
    if (s.boosting !== last) { events.push(`${t.toFixed(2)}s ${s.boosting ? 'ON' : 'off'} tank ${s.boost.toFixed(2)}`); last = s.boosting; }
  });
  say(`  holding throttle + Shift for 120 s from rest, boost on/off transitions:`);
  say('      ' + events.slice(0, 14).join(' | '));
  // pure passive refill rate at cruise, no drifting
  const q = mk(base, 78); q.state.boost = 0;
  let t1 = null; drive(q, 60, { throttle: 1 }, (t, s) => { if (t1 === null && s.boost >= 0.999) t1 = t; });
  say(`  from empty at vMax, no boost input, no drifting: full bar in ${t1 === null ? '>60 s' : t1.toFixed(1) + ' s'}`
    + `  (BURNOUT: no passive time-based refill AT ALL)`);
  const r = mk(base, 20); r.state.boost = 0;
  let t2 = null; drive(r, 200, { throttle: 1 }, (t, s) => { if (t2 === null && s.boost >= 0.999) t2 = t; });
  say(`  from empty at 72 km/h: full bar in ${t2 === null ? '>200 s' : t2.toFixed(1) + ' s'}`);
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-critic-raw2.txt'), out.join('\n') + '\n');
console.log('\n(raw log -> verdicts/wave-s/handling-critic-raw2.txt)');
}
