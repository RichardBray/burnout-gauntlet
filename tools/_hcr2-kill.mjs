// _hcr2-kill.mjs — the round-2 handling critic's KILL-CONTROLS. Headless, deliberately: a
// kill-control has to change ONE thing, and the only way to change one term inside `substep()` is to
// patch a copy of physics.js on disk and import that. Mutating TUNE cannot do it - `CD` and
// `POWER_BOOST` are computed at module scope at import time (round 1 recorded getting this wrong) -
// and the live page cannot do it at all.
//
// Every patched module PRINTS ITS OWN PATCHED TEXT BACK, so a patch that silently failed to apply
// cannot be mistaken for a null result. The anchors throw if they are missing.
//
// The live page is where the VERDICT numbers come from (tools/_hcr2-drive.mjs). This file answers
// only "is the claimed mechanism the load-bearing one".
import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
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

async function load(edits = null) {
  if (!edits) return import('../game/physics.js');
  const dir = mkdtempSync(join(tmpdir(), 'hcr2-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
  for (const [f, t] of edits) {
    if (!src.includes(f)) throw new Error('KILL-CONTROL ANCHOR MISSING, patch not applied: ' + f);
    src = src.replace(f, t);
  }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
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
/** The three orderings, off the round-1 critic's own entry, on the UNCLAMPED slip angle. */
function orderings(mod) {
  const enter = () => {
    const p = mk(mod, 40);
    drive(p, 0.8, { throttle: 1, steer: 1, handbrake: true });
    return p;
  };
  const hold = (input) => {
    const p = enter();
    const peak = Math.abs(p.state.slipAngle);
    let t = 0, h = 0, done = false;
    drive(p, 5, input, (tt, s) => {
      t = tt;
      if (!done) { if (Math.abs(s.slipAngle) > peak * 0.5) h = tt; else done = true; }
    });
    void t;
    return { peak, h };
  };
  const A = hold({ throttle: 1, steer: 0 });
  const B = hold((t) => ({ throttle: 1, steer: t < 0.15 ? -1 : 0 }));
  const C = hold({ throttle: 1, steer: -1 });
  return { peak: A.peak, centred: A.h, tap: B.h, held: C.h };
}
const fmt = (o) => `entry ${(o.peak * DEG).toFixed(1)} deg | centred ${o.centred.toFixed(2)} s`
  + ` | tap ${o.tap.toFixed(2)} s | held ${o.held.toFixed(2)} s`
  + ` | 1:${o.centred >= 2 ? 'HIT' : 'MISS'} 2:${o.tap > o.centred ? 'HIT' : 'MISS'} 3:${o.held < o.centred ? 'HIT' : 'MISS'}`;

const base = await load();
say('== BASELINE, shipped file');
const b = orderings(base);
say('  ' + fmt(b));

// ---------------------------------------------------------------------------------------------
// KILL-CONTROL 1: THE CLAIMED MECHANISM. "the assist now servos rHold, not the driver's rate."
// Swap rHold back for rTarget in the drift branch ONLY (the e-brake branch is left alone, and the
// entry uses the e-brake, so the entry is unchanged and the comparison is clean).
say('');
say('== KILL-CONTROL 1: rSustain aims at rTarget again (round 1\'s behaviour), drift branch only');
{
  const mod = await load([[
    '        : rHold - TUNE.driftAngularDamping * slipNow;',
    '        : rTarget;   // KILL-CONTROL: round 1 aimed at the driver\'s requested rate',
  ]]);
  const k = orderings(mod);
  say('  patched line reads: `: rTarget;   // KILL-CONTROL: ...` (anchor matched, else this threw)');
  say('  ' + fmt(k));
  say(`  hands-off hold ${b.centred.toFixed(2)} -> ${k.centred.toFixed(2)} s`
    + `  ${k.centred < b.centred * 0.5 ? 'MECHANISM CONFIRMED' : 'MECHANISM NOT CONFIRMED'}`);
}

// KILL-CONTROL 2: the feed-forward, which the builder says is what makes the gain able to be small.
say('');
say('== KILL-CONTROL 2: the drift feed-forward (driftYawAuthority * tyreMoment) deleted');
{
  const mod = await load([[
    '      yawAccel -= TUNE.driftYawAuthority * tyreMoment * (1 - gather);',
    '      yawAccel -= 0 * tyreMoment * (1 - gather);   // KILL-CONTROL',
  ]]);
  say('  ' + fmt(orderings(mod)));
}

// KILL-CONTROL 3: driftFlick, which is the ONLY term the builder credits ordering 2 to.
say('');
say('== KILL-CONTROL 3: driftFlick -> 0. Ordering 2 (tap LENGTHENS) must collapse if it is the cause');
{
  const mod = await load([['  driftFlick: 0.18,', '  driftFlick: 0,   // KILL-CONTROL']]);
  const k = orderings(mod);
  say('  ' + fmt(k));
  say(`  tap-vs-centred margin ${(b.tap - b.centred).toFixed(2)} -> ${(k.tap - k.centred).toFixed(2)} s`);
}

// KILL-CONTROL 4: driftCounterGather, credited with ordering 3 (held ENDS it).
say('');
say('== KILL-CONTROL 4: driftCounterGather -> 1e9 (the gather can never engage). Ordering 3 must break');
{
  const mod = await load([['  driftCounterGather: 0.60,', '  driftCounterGather: 1e9,   // KILL-CONTROL']]);
  say('  ' + fmt(orderings(mod)));
}

// KILL-CONTROL 5: is driftAngularDamping really a 1/s rate now? The claim is the hold tracks 1/k.
say('');
say('== KILL-CONTROL 5: driftAngularDamping is claimed to be the unwind rate in 1/s (hold ~ 1/k)');
say('  theory: half-life = ln(2)/k, so the hold should scale as 1/k. Comment at physics.js:343');
say('  claims 0.24 / 0.30 / 0.60 -> 2.35 / 1.97 / 1.57 s; the verdict\'s change list says 0.48, not 0.60.');
for (const k of [0.12, 0.24, 0.30, 0.48, 0.60]) {
  const mod = await load([['  driftAngularDamping: 0.24,', `  driftAngularDamping: ${k},`]]);
  const o = orderings(mod);
  say(`  k=${k.toFixed(2)}: hold ${o.centred.toFixed(2)} s   (ln2/k = ${(Math.LN2 / k).toFixed(2)} s)`);
}

// KILL-CONTROL 6: gripUse. The comment says 1.00, the constant says 0.95. Does the difference show?
say('');
say('== KILL-CONTROL 6: gripUse. The comment at physics.js:209-220 argues for 1.00; the constant is 0.95');
for (const g of [0.85, 0.95, 1.00]) {
  const mod = g === 0.95 ? base : await load([['  gripUse: 0.95,', `  gripUse: ${g.toFixed(2)},`]]);
  const p = mk(mod, 69.4);                       // 250 km/h
  let minY = 1e9, maxY = 0, peakSlip = 0, drifted = 0, n = 0;
  drive(p, 6, { throttle: 1, steer: 1 }, (t, s) => {
    if (t > 1) { minY = Math.min(minY, Math.abs(s.yawRate)); maxY = Math.max(maxY, Math.abs(s.yawRate)); }
    peakSlip = Math.max(peakSlip, Math.abs(s.slipAngle)); if (s.drifting) drifted++; n++;
  });
  say(`  gripUse ${g.toFixed(2)}: held lock at 250 km/h -> yaw ${(minY * DEG).toFixed(1)}-${(maxY * DEG).toFixed(1)} deg/s,`
    + ` peak slip ${(peakSlip * DEG).toFixed(1)} deg, drifting ${(100 * drifted / n).toFixed(0)}%`);
  // The yaw-rate curve shape, which the research marks CONSENSUS on shape only, and the falloff.
  const yaws = [];
  for (const v of [12.5, 20, 30, 40.2, 50, 60, 70, 78]) {
    const q = mk(mod, v); let pk = 0;
    drive(q, 3, { throttle: 1, steer: 1 }, (t, s) => { if (t > 1) pk = Math.max(pk, Math.abs(s.yawRate)); });
    yaws.push(pk * DEG);
  }
  say(`    yaw curve 12.5..78 m/s: ${yaws.map((y) => y.toFixed(1)).join(' ')}`
    + ` | monotone non-increasing ${yaws.every((y, i) => i === 0 || y <= yaws[i - 1] + 0.05) ? 'yes' : 'NO'}`
    + ` | falloff vMax/peak ${(yaws[yaws.length - 1] / Math.max(...yaws)).toFixed(2)}`);
}

// KILL-CONTROL 7: the front-axle bug. Was that one line really +35% of speed at 80 km/h?
say('');
say('== KILL-CONTROL 7: put the front-axle bug BACK (fxFront gets 1 - driveRear again)');
for (const kmh of [80, 130, 250]) {
  const runs = [];
  for (const [label, mod] of [['fixed', base], ['bug restored', await load([[
    '    let fxFront = m * aDrive * (1 - TUNE.driveSplitRear)',
    '    let fxFront = m * aDrive * (1 - driveRear)   // KILL-CONTROL: the round-1 bug',
  ]])]]) {
    const p = mk(mod, kmh / 3.6);
    const v0 = p.state.ground || kmh / 3.6;
    drive(p, 2, { throttle: 1, steer: 1, handbrake: true });
    runs.push(`${label} ${(100 * (p.state.ground / v0 - 1)).toFixed(0)}%`);
  }
  say(`  ${kmh} km/h, 2 s of W+lock+e-brake: ${runs.join(' | ')}`);
}

// KILL-CONTROL 8: the shunt. Was the tangential decomposition what tiered the collision?
say('');
say('== KILL-CONTROL 8: the collision. hitNormalSpeed back to 12, and the shunt reverted separately');
{
  const geom = async (mod, label) => {
    const rows = [];
    for (const deg of [3, 10, 20, 45, 90]) {
      // A wall face at x = 60, approached at `deg` from the FACE at 231 km/h.
      const p = mod.createPhysics({ blocks: [{ cx: 160, cz: 0, w: 200, d: 200 }], bounds: 1e9 });
      const al = (90 - deg) * Math.PI / 180;
      const dx = Math.cos(al), dz = Math.sin(al);
      p.reset(new Vector3(60 - dx * 80, 0, -dz * 80), Math.atan2(dx, dz), 231 / 3.6);
      let v0 = 0, kept = 0, seen = false;
      drive(p, 3, { throttle: 1 }, (t, s) => {
        if (!seen && s.impact > 0.001) { seen = true; kept = s.ground; }
        if (!seen) v0 = s.ground;
      });
      rows.push(seen ? `${deg}deg ${(100 * kept / v0).toFixed(0)}%` : `${deg}deg miss`);
    }
    say(`  ${label}: ${rows.join(' | ')}`);
  };
  await geom(base, 'shipped                ');
  await geom(await load([['  hitNormalSpeed: 34,', '  hitNormalSpeed: 12,   // KILL-CONTROL']]),
    'hitNormalSpeed 12      ');
  await geom(await load([[
    '    forward(fwd); leftward(side);\n    state.speed = clamp(wx * fwd.x + wz * fwd.z, -TUNE.reverseMax, TUNE.vMaxBoost);\n    state.vLat = wx * side.x + wz * side.z;',
    '    forward(fwd); leftward(side);\n    // KILL-CONTROL: round 1\'s resolution - scale the longitudinal speed, throw the lateral away\n    state.speed = clamp(state.speed * keep, -TUNE.reverseMax, TUNE.vMaxBoost);\n    state.vLat *= keep < 0.6 ? 0.2 : 0.85;\n    void wx; void wz;',
  ]]), 'round-1 shunt reverted ');
}

// KILL-CONTROL 9: the brake tap COMMANDS an angle. Is the entry physical at all without it?
say('');
say('== KILL-CONTROL 9: driftTapSlip -> 0 (the brake tap stops COMMANDING a slip angle)');
for (const kmh of [100, 130, 150]) {
  const row = [];
  for (const [label, mod] of [['shipped', base],
    ['tap command off', await load([['  driftTapSlip: 0.30,', '  driftTapSlip: 0,   // KILL-CONTROL']])]]) {
    const p = mk(mod, kmh / 3.6);
    drive(p, 0.5, { throttle: 1, steer: 1 });
    let pk = 0, armed = false, dur = 0, seen = false;
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) armed = true;
    });
    drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle));
      if (s.drifting) { armed = true; seen = true; dur = t; } else if (seen) { /* keep last */ }
    });
    row.push(`${label}: armed ${armed}, peak ${(pk * DEG).toFixed(1)} deg, held ${dur.toFixed(2)} s`);
  }
  say(`  ${kmh} km/h  ${row.join('  |  ')}`);
}

// KILL-CONTROL 10 / 11: the two state-machine changes, which is where the brake tap ARMS at all.
say('');
say('== KILL-CONTROL 10/11: driftEnterRatio back to 1.4, and the exit back to rear slip alone');
{
  const probe = async (mod, label) => {
    const row = [];
    for (const kmh of [100, 130, 150]) {
      const p = mk(mod, kmh / 3.6);
      drive(p, 0.5, { throttle: 1, steer: 1 });
      let armed = false, dur = 0, seen = false, pk = 0;
      drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, (t, s) => {
        pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) armed = true;
      });
      drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => {
        pk = Math.max(pk, Math.abs(s.slipAngle));
        if (s.drifting) { armed = true; seen = true; dur = t; } void seen;
      });
      row.push(`${kmh}: armed ${armed ? 'Y' : 'N'} peak ${(pk * DEG).toFixed(1)} held ${dur.toFixed(2)}s`);
    }
    say(`  ${label}: ${row.join(' | ')}`);
  };
  await probe(base, 'shipped                     ');
  await probe(await load([['  driftEnterRatio: 1.0,', '  driftEnterRatio: 1.4,   // KILL-CONTROL']]),
    'driftEnterRatio 1.4 (round 1)');
  await probe(await load([[
    '      const sideways = Math.max(rearSlip, Math.abs(state.slipAngle));',
    '      const sideways = rearSlip;   // KILL-CONTROL: round 1\'s rear-slip-only exit',
  ]]), 'exit on rear slip alone     ');
}

// KILL-CONTROL 12: is the `sideways` exit inert, or merely REDUNDANT with driftExitRatio 1.0 -> 0.7?
say('');
say('== KILL-CONTROL 12: the exit, both halves, separately and together');
{
  const probe = async (edits, label) => {
    const mod = edits ? await load(edits) : base;
    const p = mk(mod, 130 / 3.6);
    drive(p, 0.5, { throttle: 1, steer: 1 });
    let dur = 0;
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 });
    drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => { if (s.drifting) dur = t; });
    say(`  ${label}: drift held ${dur.toFixed(2)} s after a 200 ms tap at 130 km/h`);
  };
  const EXIT = ['      const sideways = Math.max(rearSlip, Math.abs(state.slipAngle));',
    '      const sideways = rearSlip;   // KILL-CONTROL'];
  const RATIO = ['  driftExitRatio: 0.7,', '  driftExitRatio: 1.0,   // KILL-CONTROL'];
  await probe(null, 'shipped (max(rearSlip,|slipAngle|), exitRatio 0.7)');
  await probe([EXIT], 'rear slip only, exitRatio 0.7                    ');
  await probe([RATIO], 'max(...), exitRatio 1.0                          ');
  await probe([EXIT, RATIO], 'ROUND 1 EXIT: rear slip only, exitRatio 1.0      ');
}

// KILL-CONTROL 13: the CHAIN, headless, per beat, at both driftEnterRatio values. Section 3 of the
// live driver showed the alternating chain giving 6.3 deg and 0% drifting, and section 10 showed the
// builder's own 15 deg / 21% coming entirely from beats 1-2. Does the threshold explain it?
say('');
say('== KILL-CONTROL 13: the alternating chain, per beat, shipped vs driftEnterRatio 1.4');
for (const [label, edits] of [['shipped (enter 1.0)', null], ['enter 1.4 (round 1)',
  [['  driftEnterRatio: 1.0,', '  driftEnterRatio: 1.4,   // KILL-CONTROL']]]]) {
  const mod = edits ? await load(edits) : base;
  const p = mk(mod, 130 / 3.6);
  drive(p, 0.6, { throttle: 1, steer: 1 });
  const beats = [];
  for (let i = 0; i < 6; i++) {
    const st = i % 2 === 0 ? 1 : -1;
    let pk = 0, nD = 0, n = 0;
    const tick = (t, s) => { pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) nD++; n++; };
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: st }, tick);
    drive(p, 0.8, { throttle: 1, steer: st }, tick);
    beats.push(`${(pk * DEG).toFixed(1)}deg/${(100 * nD / n).toFixed(0)}%`);
  }
  say(`  ${label}: ${beats.join(' | ')}   final ${(p.state.ground * 3.6).toFixed(0)} km/h`);
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-critic-r2-kill.txt'), out.join('\n') + '\n');
