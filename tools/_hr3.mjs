// _hr3.mjs - round 3's kill-control harness for game/physics.js.
//
// Same technique as tools/_hr2v.mjs and tools/_hcr2-kill.mjs (patch a COPY of physics.js on disk and
// import that, because CD and POWER_BOOST are module-scope constants computed at import time, so
// mutating TUNE afterwards proves nothing). My own anchors, because round 3 changes lines that are
// two of the verify pass's anchors.
//
// BEFORE  = `git show 68c093b:game/physics.js`, the real file at HEAD when I started.
// AFTER   = game/physics.js in the working tree.
// Every number here is a slip angle, a yaw rate, a heading, a duration, a speed or a boost quantity.
// NO FRAME TIME. Usage: node tools/_hr3.mjs [section...]
import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Vector3 } from './_handling-critic.mjs?shim=1';

const HERE = dirname(fileURLToPath(import.meta.url));
const { registerHooks } = await import('node:module');
registerHooks({
  resolve(s, c, n) {
    return s === 'three'
      ? { url: new URL('./_handling-critic.mjs?shim=1', import.meta.url).href, shortCircuit: true }
      : n(s, c);
  },
});
const DEG = 180 / Math.PI, HZ = 120, DT = 1 / HZ;
const BRAKE_CAP = 0.6;                     // main.js:559, frozen
const out = []; const say = (s) => { console.log(s); out.push(s); };
let vn = 0;
const AFTER_SRC = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
const BEFORE_SRC = execFileSync('git', ['show', '68c093b:game/physics.js'], { cwd: join(HERE, '..'), encoding: 'utf8' });
const want = process.argv.slice(2);
const on = (n) => want.length === 0 || want.includes(String(n));

async function loadSrc(src0, edits = []) {
  const dir = mkdtempSync(join(tmpdir(), 'hr3-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = src0;
  for (const [f, t] of edits) {
    if (!src.includes(f)) throw new Error('KILL-CONTROL ANCHOR MISSING, patch not applied: ' + f);
    src = src.replace(f, t);
  }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const load = (edits = []) => loadSrc(AFTER_SRC, edits);

function mk(mod, speed, yaw = 0) {
  const p = mod.createPhysics({ blocks: [], bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), yaw, speed); return p;
}
function drive(p, sec, input, onTick) {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    p.setInput(typeof input === 'function' ? input(i * DT, p.state) : input);
    p.step(DT); onTick?.((i + 1) * DT, p.state);
  }
  return p.state;
}

// ---------------------------------------------------------------------------------------------
// The published alternating chain: 0.6 s of load, then [tap 200 ms, drive 800 ms] x 6.
// Copied in shape from tools/_hr2v.mjs so my numbers are comparable to the verify pass's, plus a
// FREE-ENERGY column: the biggest single-tick GAIN in ground speed anywhere in the run. A manoeuvre
// that redirects momentum cannot make one; a lateral-velocity injection makes one every beat.
function chain(mod, kmh = 130) {
  const p = mk(mod, kmh / 3.6);
  drive(p, 0.6, { throttle: 1, steer: 1 });
  const beats = []; let vmax = 0, gain = 0, prev = p.state.ground, aG = 0;
  for (let i = 0; i < 6; i++) {
    const st = i % 2 === 0 ? 1 : -1;
    let pk = 0, nD = 0, n = 0;
    const tick = (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle)); vmax = Math.max(vmax, Math.abs(s.vLat));
      gain = Math.max(gain, s.ground - prev); prev = s.ground; aG = Math.max(aG, Math.abs(s.accelG));
      if (s.drifting) nD++; n++;
    };
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: st }, tick);
    drive(p, 0.8, { throttle: 1, steer: st }, tick);
    beats.push(`${(pk * DEG).toFixed(1)}deg/${(100 * nD / n).toFixed(0)}%`);
  }
  return `${beats.join(' | ')} | peak|vLat| ${vmax.toFixed(2)} | max 1-tick GAIN ${(gain * 3.6).toFixed(2)} km/h`
    + ` | peak accelG ${aG.toFixed(1)} | final ${(p.state.ground * 3.6).toFixed(0)} km/h`;
}

/** One 200 ms tap after 0.5 s of load: does it arm, how deep, how long the state holds. */
function tap(mod, kmh) {
  const p = mk(mod, kmh / 3.6);
  drive(p, 0.5, { throttle: 1, steer: 1 });
  let pk = 0, armed = false, dur = 0, gain = 0, prev = p.state.ground;
  const tick = (t, s) => {
    pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) { armed = true; dur = t; }
    gain = Math.max(gain, s.ground - prev); prev = s.ground;
  };
  drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, tick);
  drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => tick(t + 0.2, s));
  return `${kmh}: armed ${armed ? 'Y' : 'N'} peak ${(pk * DEG).toFixed(1)} held ${dur.toFixed(2)}s`
    + ` gain ${(gain * 3.6).toFixed(2)}`;
}

/** The three orderings, off the round-1 critic's e-brake entry, on the UNCLAMPED slip angle. */
function orderings(mod) {
  const enter = () => {
    const p = mk(mod, 40);
    drive(p, 0.8, { throttle: 1, steer: 1, handbrake: true });
    return p;
  };
  const hold = (input) => {
    const p = enter();
    const peak = Math.abs(p.state.slipAngle);
    let h = 0, done = false;
    drive(p, 5, input, (tt, s) => {
      if (!done) { if (Math.abs(s.slipAngle) > peak * 0.5) h = tt; else done = true; }
    });
    return { peak, h };
  };
  const A = hold({ throttle: 1, steer: 0 });
  const B = hold((t) => ({ throttle: 1, steer: t < 0.15 ? -1 : 0 }));
  const C = hold({ throttle: 1, steer: -1 });
  return `entry ${(A.peak * DEG).toFixed(1)} deg | centred ${A.h.toFixed(2)} s | tap ${B.h.toFixed(2)} s`
    + ` | held ${C.h.toFixed(2)} s | 1:${A.h >= 2 ? 'HIT' : 'MISS'} 2:${B.h > A.h ? 'HIT' : 'MISS'}`
    + ` 3:${C.h < A.h ? 'HIT' : 'MISS'}`;
}

/** Held lock + full throttle for `sec`. Is there a power-on edge? */
function gripEdge(mod, kmh = 250, sec = 6) {
  const p = mk(mod, kmh / 3.6);
  let pk = 0, nD = 0, n = 0, pkYaw = 0; const yaws = [];
  drive(p, sec, { throttle: 1, steer: 1 }, (t, s) => {
    pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) nD++; n++;
    pkYaw = Math.max(pkYaw, Math.abs(s.yawRate));
    if (Math.abs(t * 10 % 6) < 1e-6) yaws.push((Math.abs(s.yawRate) * DEG).toFixed(0));
  });
  return `${String(kmh).padStart(3)} km/h: yaw ${yaws.join(' ')} deg/s | peak yaw ${(pkYaw * DEG).toFixed(0)}`
    + ` | peak slip ${(pk * DEG).toFixed(1)} deg | drifting ${(100 * nD / n).toFixed(0)}%`
    + ` | final ${(p.state.ground * 3.6).toFixed(0)} km/h`;
}

// Turn-in from DEAD STRAIGHT: brake+lock vs throttle+lock. The verify pass's finding B.
//
// THE HEADING IS SIGNED AGAINST THE DIRECTION THE DRIVER ASKED FOR, and that is not a detail: I first
// wrote this with `Math.abs(yaw - yaw0)`, exactly as the verify pass's own live probe does
// (tools/_hr2v-live.mjs, `Math.abs(ang(end.yaw - win0.yaw))`), and it reported the pre-round-3 file
// sweeping 14.2 deg of heading at 250 km/h on brake and full LEFT lock. It was rotating 71 deg/s to
// the RIGHT. An unsigned heading metric scores a car spinning away from the corner as a car turning
// into it, which is permanent rule 3 in one line, so this reports the SIGNED heading and the worst
// wrong-way yaw rate separately. Every BEFORE number in section 3 and 7 of this file is the signed one.
function turnIn(mod, kmh, keys, win) {
  const p = mk(mod, kmh / 3.6);
  const yaw0 = p.state.yaw;
  const want = Math.sign(typeof keys === 'function' ? 1 : keys.steer || 1);
  let pk = 0, pkYaw = 0, wrong = 0, nD = 0, n = 0;
  drive(p, win, keys, (t, s) => {
    pk = Math.max(pk, want * s.slipAngle); pkYaw = Math.max(pkYaw, want * s.yawRate);
    wrong = Math.min(wrong, want * s.yawRate);
    if (s.drifting) nD++; n++;
  });
  return `heading ${(want * (p.state.yaw - yaw0) * DEG).toFixed(1)} deg | peak yaw ${(pkYaw * DEG).toFixed(0)}`
    + ` | worst WRONG-WAY yaw ${(wrong * DEG).toFixed(0)}`
    + ` | peak slip ${(pk * DEG).toFixed(1)} deg | drift ${(100 * nD / n).toFixed(0)}%`;
}

/** The e-brake: speed kept at 1/2/3 s and whether it ever exceeds its entry speed. */
function ebrake(mod, kmh) {
  const p = mk(mod, kmh / 3.6);
  const v0 = p.state.ground; const marks = {}; let over = false, pk = 0, pkYaw = 0;
  drive(p, 3, { throttle: 1, steer: 1, handbrake: true }, (t, s) => {
    if (s.ground > v0 + 1e-6) over = true;
    pk = Math.max(pk, Math.abs(s.slipAngle)); pkYaw = Math.max(pkYaw, Math.abs(s.yawRate));
    for (const q of [1, 2, 3]) if (Math.abs(t - q) < DT / 2) marks[q] = s.ground / v0;
  });
  return `${String(kmh).padStart(3)}: ${[1, 2, 3].map((q) => `${((marks[q] - 1) * 100).toFixed(0)}%`).join('/')}`
    + ` | slide ${(pk * DEG).toFixed(0)} deg | yaw ${(pkYaw * DEG).toFixed(0)} deg/s | faster-than-entry ${over}`;
}

/** Wall tiers: fraction of speed kept 0.3 s after contact, by angle to the FACE. */
function wall(mod) {
  const rows = [];
  for (const deg of [10, 20, 45, 90]) {
    const blocks = [{ cx: 0, cz: 400, w: 60, d: 800 }];
    const p = mod.createPhysics({ blocks, bounds: 1e9 });
    // Wall face is the x = -30 plane; travel at `deg` into it from the left.
    p.reset(new Vector3(-60, 0, 0), (90 - deg) * Math.PI / 180, 231 / 3.6);
    let hit = -1, kept = 0; const v0 = p.state.ground;
    drive(p, 4, { throttle: 1, steer: 0 }, (t, s) => {
      if (hit < 0 && s.impact > 0.001) hit = t;
      if (hit > 0 && t >= hit + 0.3 && kept === 0) kept = s.ground / v0;
    });
    rows.push(`${deg}deg ${(kept * 100).toFixed(0)}%`);
  }
  return rows.join(' | ');
}

const before = await loadSrc(BEFORE_SRC);
const after = await load();
const K = (src, name) => (new RegExp(`^  ${name}: ([\\d.]+),`, 'm').exec(src)?.[1] ?? 'ABSENT');

say('== 0. THE TWO MODULES UNDER TEST');
for (const [n, s] of [['BEFORE (68c093b)', BEFORE_SRC], ['AFTER  (worktree)', AFTER_SRC]]) {
  say(`  ${n}: gripUse ${K(s, 'gripUse')} driftFlick ${K(s, 'driftFlick')}`
    + ` driftBreakRatio ${K(s, 'driftBreakRatio')} powerYawGain ${K(s, 'powerYawGain')}`
    + ` driftRefFloor ${K(s, 'driftRefFloor')}`);
}

if (on(1)) {
  say('');
  say('== 1. THE CHAIN, per beat, and the free-energy column');
  say('  BEFORE : ' + chain(before));
  say('  AFTER  : ' + chain(after));
  say('  BEFORE 100: ' + chain(before, 100));
  say('  AFTER  100: ' + chain(after, 100));
  say('  BEFORE 150: ' + chain(before, 150));
  say('  AFTER  150: ' + chain(after, 150));
}

if (on(2)) {
  say('');
  say('== 2. THE FLICK. Rotation vs injection, and the verify pass\'s driftFlick=0 baseline');
  say('  AFTER, driftFlick 0 : ' + chain(await load([['  driftFlick: 0.18,', '  driftFlick: 0,   // KILL-CONTROL']])));
  say('  BEFORE, driftFlick 0: ' + chain(await loadSrc(BEFORE_SRC, [['  driftFlick: 0.18,', '  driftFlick: 0,   // KILL-CONTROL']])));
  say('');
  say('  THE FREE ENERGY, MEASURED AT THE LINE ITSELF. A metered copy of each module reports the');
  say('  GROUND speed hypot(speed, vLat) immediately before and immediately after the flick and sums');
  say('  the difference. A momentum redirection makes zero; an injection makes some every beat.');
  const METER = `      state.fWork = (state.fWork || 0) + (Math.hypot(state.speed, state.vLat) - __g0);
      state.fMax = Math.max(state.fMax || 0, Math.abs(Math.hypot(state.speed, state.vLat) - __g0));`;
  const meterBefore = [[
    '      state.vLat -= dSign * TUNE.driftFlick * dCounter * gv;',
    '      const __g0 = Math.hypot(state.speed, state.vLat);\n      state.vLat -= dSign * TUNE.driftFlick * dCounter * gv;\n' + METER,
  ]];
  const meterAfter = [[
    '      const dPhi = -dSign * TUNE.driftFlick * dCounter;',
    '      const __g0 = Math.hypot(state.speed, state.vLat);\n      const dPhi = -dSign * TUNE.driftFlick * dCounter;',
  ], [
    '      state.speed = vRot;',
    '      state.speed = vRot;\n' + METER,
  ]];
  for (const [label, mod] of [
    ['BEFORE (injection)', await loadSrc(BEFORE_SRC, meterBefore)],
    ['AFTER  (rotation) ', await load(meterAfter)],
  ]) {
    const p = mk(mod, 130 / 3.6);
    drive(p, 0.6, { throttle: 1, steer: 1 });
    for (let i = 0; i < 6; i++) {
      const st = i % 2 === 0 ? 1 : -1;
      drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: st });
      drive(p, 0.8, { throttle: 1, steer: st });
    }
    say(`  ${label}: ground speed CREATED by the flick over 6 beats = ${(p.state.fWork || 0).toFixed(4)} m/s`
      + ` total, biggest single application ${(p.state.fMax || 0).toFixed(4)} m/s`);
  }
}

if (on(3)) {
  say('');
  say('== 3. TURN-IN FROM DEAD STRAIGHT: throttle+lock vs brake+lock (verify finding B)');
  for (const kmh of [100, 130, 200]) {
    for (const win of [0.4, 0.8]) {
      say(`  ${kmh} km/h ${win * 1000} ms  W+D  BEFORE ${turnIn(before, kmh, { throttle: 1, steer: 1 }, win)}`);
      say(`  ${kmh} km/h ${win * 1000} ms  W+D  AFTER  ${turnIn(after, kmh, { throttle: 1, steer: 1 }, win)}`);
      say(`  ${kmh} km/h ${win * 1000} ms  S+D  BEFORE ${turnIn(before, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, win)}`);
      say(`  ${kmh} km/h ${win * 1000} ms  S+D  AFTER  ${turnIn(after, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, win)}`);
    }
  }
}

if (on(4)) {
  say('');
  say('== 4. THE POWER-ON EDGE, held lock + full throttle, 6 s, at four speeds');
  for (const kmh of [100, 130, 200, 250]) {
    say('  BEFORE ' + gripEdge(before, kmh));
    say('  AFTER  ' + gripEdge(after, kmh));
  }
}

if (on(5)) {
  say('');
  say('== 5. REGRESSION GATES: the orderings, the e-brake, the wall, the single tap');
  say('  orderings BEFORE: ' + orderings(before));
  say('  orderings AFTER : ' + orderings(after));
  for (const kmh of [80, 130, 200, 250]) {
    say('  e-brake BEFORE ' + ebrake(before, kmh));
    say('  e-brake AFTER  ' + ebrake(after, kmh));
  }
  say('  wall BEFORE: ' + wall(before));
  say('  wall AFTER : ' + wall(after));
  say('  tap BEFORE: ' + [100, 130, 150, 200, 250].map((k) => tap(before, k)).join(' | '));
  say('  tap AFTER : ' + [100, 130, 150, 200, 250].map((k) => tap(after, k)).join(' | '));
}

if (on(6)) {
  say('');
  say('== 6. STABILITY: does anything spin? full lock, full throttle, 10 s, and lift-off at full lock');
  for (const kmh of [60, 130, 200, 250, 280]) {
    say('  10 s throttle BEFORE ' + gripEdge(before, kmh, 10));
    say('  10 s throttle AFTER  ' + gripEdge(after, kmh, 10));
  }
  for (const [label, mod] of [['BEFORE', before], ['AFTER ', after]]) {
    for (const kmh of [145, 250]) {
      const p = mk(mod, kmh / 3.6);
      let pk = 0, pkYaw = 0;
      drive(p, 6, { throttle: 0, steer: 1 }, (t, s) => {
        pk = Math.max(pk, Math.abs(s.slipAngle)); pkYaw = Math.max(pkYaw, Math.abs(s.yawRate));
      });
      say(`  lift-off ${label} ${kmh} km/h: peak slip ${(pk * DEG).toFixed(1)} deg`
        + ` | peak yaw ${(pkYaw * DEG).toFixed(0)} deg/s | final ${(p.state.ground * 3.6).toFixed(0)} km/h`);
    }
  }
}

// The two halves of the trail-brake fix, each deleted ALONE. `KILL_FLOOR` puts the reference back to
// round 2's plain lerp; `KILL_PRO` puts the feed-forward gate back to `rearBroke && tapOut !== 0`.
const KILL_FLOOR = [['      const ref = floorFade > 0 && sT !== 0 && sT * refSustain < sT * rTarget\n        ? lerp(refSustain, rTarget, floorFade) : refSustain;',
  '      const ref = refSustain;   // KILL-CONTROL: the ref floor deleted']];
const KILL_PRO = [['      const entering = rearBroke && tapOut !== 0 && proRotation;',
  '      const entering = rearBroke && tapOut !== 0;   // KILL-CONTROL: the pro-rotation gate deleted']];

if (on(7)) {
  say('');
  say('== 7. THE TRAIL-BRAKE FIX, ITS TWO HALVES DELETED ONE AT A TIME');
  const mods = [
    ['BEFORE (68c093b)  ', before],
    ['AFTER (both)      ', after],
    ['ref floor deleted ', await load(KILL_FLOOR)],
    ['pro-rot gate del. ', await load(KILL_PRO)],
    ['both deleted      ', await load([...KILL_FLOOR, ...KILL_PRO])],
  ];
  for (const [label, mod] of mods) {
    const row = [];
    for (const kmh of [100, 130, 200, 250]) {
      row.push(`${kmh}: ` + turnIn(mod, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 0.4)
        .replace(/ \| peak slip.*/, '').replace('heading ', ''));
    }
    say(`  ${label} S+D 400 ms  ${row.join('  ')}`);
  }
  say('  (W+D 400 ms, the thing brake+lock must not lose to: '
    + [100, 130, 200, 250].map((k) => `${k}: ` + turnIn(after, k, { throttle: 1, steer: 1 }, 0.4)
      .replace(/ \| peak slip.*/, '').replace('heading ', '')).join('  ') + ')');
  say('');
  say('  and the same five modules on the chain and the orderings:');
  for (const [label, mod] of mods) say(`  ${label} ${orderings(mod)}`);
  for (const [label, mod] of mods) say(`  ${label} chain ${chain(mod)}`);
  say('');
  say('  driftRefFloor swept, S+D 400 ms from dead straight:');
  for (const f of ['1.2', '1.5', '2.0', '3.0', '6.0']) {
    const mod = f === '2.0' ? after : await load([['  driftRefFloor: 2.0,', `  driftRefFloor: ${f},   // KILL-CONTROL`]]);
    say(`    driftRefFloor ${f}: ` + [100, 130, 200, 250].map((k) => `${k}: `
      + turnIn(mod, k, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 0.4)
        .replace(/ \| peak slip.*/, '').replace('heading ', '')).join('  ')
      + ` || ${orderings(mod)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// SECTION 8: THE POWER-ON EDGE. Nine kill-controls and the demand-vs-capacity ratio that explains
// why every one of them is inert. `latRatio` is the rear axle's SHARE OF THE CORNER THE DRIVER IS
// ASKING FOR divided by the lateral force the rear tyre can actually make right now, both already
// computed inside substep(). At 1.0 the rear runs out and the tail steps out; that IS oversteer.
const METER_RATIO = [['    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;',
  '    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;\n'
  + '    state.latRatio = fyRearDemand / Math.max(fyRearCap, 1);\n'
  + '    state.fyRearCap = fyRearCap; state.fyRearDemand = fyRearDemand;\n'
  + '    state.circleUsed = Math.min(1, Math.abs(fxRear) / Math.max(muRear * fzRear, 1));\n'
  + '    state.fzRearRel = fzRear / fzRear0;']];

if (on(8)) {
  say('');
  say('== 8. THE POWER-ON EDGE. Why the rear axle never runs out on throttle.');
  const met = await load(METER_RATIO);
  say('  Steady state after 6 s of full lock. latRatio = the rear axle\'s share of the corner the');
  say('  DRIVER asks for, over what the rear tyre can make. It has to reach 1.0 for the tail to go.');
  for (const [label, input] of [['full throttle', { throttle: 1, steer: 1 }],
    ['coasting     ', { throttle: 0, steer: 1 }]]) {
    for (const kmh of [100, 130, 200, 250]) {
      const p = mk(met, kmh / 3.6);
      drive(p, 6, input);
      const s = p.state;
      say(`  ${label} ${String(kmh).padStart(3)} km/h: latRatio ${s.latRatio.toFixed(3)}`
        + ` (demand ${(s.fyRearDemand / 1000).toFixed(1)} kN / capacity ${(s.fyRearCap / 1000).toFixed(1)} kN)`
        + ` | rear circle spent by DRIVE ${(s.circleUsed * 100).toFixed(0)}%`
        + ` | rear axle LOAD ${(s.fzRearRel * 100).toFixed(0)}% of undisturbed`
        + ` | slip ${(s.slipAngle * DEG).toFixed(1)} deg | ground ${(s.ground * 3.6).toFixed(0)} km/h`);
    }
  }
  say('');
  say('  THE NINE KILL-CONTROLS. Each deletes or reverses one nominated cause. peak slip / peak yaw /');
  say('  % of samples in the drift state, over 6 s of full lock and full throttle.');
  const cases = [
    ['baseline (shipped)          ', []],
    ['1 spinDamp ceiling off      ', [['    const excess = Math.abs(state.yawRate) - rAllow;',
      '    const excess = state.drifting || handbrake ? Math.abs(state.yawRate) - rAllow : -1;   // KC']]],
    ['2 stabilityAssist 2.6 -> 0  ', [['  stabilityAssist: 2.6,', '  stabilityAssist: 0,   // KC']]],
    ['3 both 1 and 2              ', [['    const excess = Math.abs(state.yawRate) - rAllow;',
      '    const excess = state.drifting || handbrake ? Math.abs(state.yawRate) - rAllow : -1;   // KC'],
    ['  stabilityAssist: 2.6,', '  stabilityAssist: 0,   // KC']]],
    ['4 steerServo 0.45 -> 0      ', [['  steerServo: 0.45,', '  steerServo: 0,   // KC']]],
    ['5 driveSplitRear 0.65->0.80 ', [['  driveSplitRear: 0.65,', '  driveSplitRear: 0.80,   // KC']]],
    ['6 driveSplitRear 0.65->1.00 ', [['  driveSplitRear: 0.65,', '  driveSplitRear: 1.00,   // KC']]],
    ['7 intent gate takes throttle', [['    const intent = handbrake || brake > 0.15 || throttle < 0;',
      '    const intent = handbrake || brake > 0.15 || throttle < 0 || throttle > 0.9;   // KC']]],
    ['8 load transfer OFF         ', [['  transferCap: 0.40,', '  transferCap: 0.0001,   // KC']]],
    ['9 downforce 0.95 -> 0       ', [['  downforce: 0.95,', '  downforce: 0,   // KC']]],
    ['10 6 AND 7 together         ', [['  driveSplitRear: 0.65,', '  driveSplitRear: 1.00,   // KC'],
      ['    const intent = handbrake || brake > 0.15 || throttle < 0;',
        '    const intent = handbrake || brake > 0.15 || throttle < 0 || throttle > 0.9;   // KC']]],
    // The one that finds the SECOND ceiling. `delta` is not the player's steering angle: it is an
    // inverse-model output that solves for the angle which ACHIEVES rTarget. So the player cannot ask
    // the front tyre for more slip than the grip-limited target rate needs, whatever the friction
    // circle is doing. This control hands `delta` the mechanical lock instead and changes nothing else.
    ['11 delta = mechanical lock  ', [['    const delta = clamp(L * rTarget / Math.max(gv, 4) + Math.sign(rTarget) * understeer\n      + (rTarget - state.yawRate) * servo, -TUNE.steerMax, TUNE.steerMax);',
      '    const delta = state.steer * TUNE.steerMax;   // KC: the player\'s key IS the steering angle']]],
    ['(control) gripUse 0.85->1.30', [['  gripUse: 0.85,', '  gripUse: 1.30,   // KC']]],
  ];
  for (const [label, edits] of cases) {
    const mod = edits.length ? await load([...edits, ...METER_RATIO]) : met;
    const row = [];
    for (const kmh of [100, 130, 250]) {
      const p = mk(mod, kmh / 3.6);
      let pk = 0, pkY = 0, nD = 0, n = 0, rMax = 0;
      drive(p, 6, { throttle: 1, steer: 1 }, (t, s) => {
        pk = Math.max(pk, Math.abs(s.slipAngle)); pkY = Math.max(pkY, Math.abs(s.yawRate));
        rMax = Math.max(rMax, s.latRatio); if (s.drifting) nD++; n++;
      });
      row.push(`${kmh}: ${(pk * DEG).toFixed(1)}deg/${(pkY * DEG).toFixed(0)}(deg/s)/${(100 * nD / n).toFixed(0)}%`
        + `/ratio ${rMax.toFixed(2)}`);
    }
    say(`  ${label} ${row.join('  ')}`);
  }
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-r3-kill.txt'), out.join('\n') + '\n');
