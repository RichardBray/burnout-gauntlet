// _hr2fix.mjs — the ROUND-2 REPAIR builder's headless harness. It is a deliberate near-clone of the
// round-2 critic's `tools/_hcr2-kill.mjs` (same import shim, same patch-a-copy-on-disk technique,
// same beat patterns, same metrics) for one reason: this round changes `driftEnterRatio` and
// `gripUse`, which are two of the critic's own kill-control ANCHORS, so `_hcr2-kill.mjs` throws
// "ANCHOR MISSING" against the repaired file by construction. Rather than edit the critic's
// instrument (not my file, and its logged BEFORE numbers are evidence), this file re-derives the
// same quantities and re-anchors the kill-controls on the values this round ships.
//
// Run it against the shipped file for AFTER, and against a copy of the pre-repair file
// (`--base <path>`) for BEFORE, so every number in the verdict is a paired A/B from one process.
//
// Sections, all headless (headless is correct here: a kill-control has to change ONE term inside
// substep(), which only a patched copy on disk can do; CD and POWER_BOOST are module-scope):
//   1  the three orderings (regression gate on the round-1 fix)
//   2  the ALTERNATING chain, per beat  <- the blocker
//   3  the builder's own load-then-alternate chain, per beat
//   4  one 200 ms tap after 0.5 s of load at 100/130/150 km/h
//   5  the grip edge + the yaw curve, at 0.85 / 0.95 / 1.00
//   6  the e-brake: monotone in hold time, never faster than entry
//   7  KILL-CONTROLS on this round's own mechanism
import { writeFileSync, mkdtempSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
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
const BRAKE_CAP = 0.6;                     // main.js:559, FROZEN
const argv = process.argv.slice(2);
const bi = argv.indexOf('--base');
const SRC = bi >= 0 ? resolve(argv[bi + 1]) : join(HERE, '..', 'game', 'physics.js');
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const want = (n) => only.length === 0 || only.includes(n);
const out = []; const say = (s) => { console.log(s); out.push(s); };
let vn = 0;

async function load(edits = null) {
  const dir = mkdtempSync(join(tmpdir(), 'hr2fix-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = readFileSync(SRC, 'utf8');
  for (const [f, t] of edits || []) {
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

// ---- 1. THE THREE ORDERINGS, byte-for-byte the critic's own metric ----------------------------
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
  return { peak: A.peak, centred: A.h, tap: B.h, held: C.h };
}
const fmt = (o) => `entry ${(o.peak * DEG).toFixed(1)} deg | centred ${o.centred.toFixed(2)} s`
  + ` | tap ${o.tap.toFixed(2)} s | held ${o.held.toFixed(2)} s`
  + ` | 1:${o.centred >= 2 ? 'HIT' : 'MISS'} 2:${o.tap > o.centred ? 'HIT' : 'MISS'} 3:${o.held < o.centred ? 'HIT' : 'MISS'}`;

// ---- the two chain shapes, PER BEAT ----------------------------------------------------------
// `loadFirst` is the difference between the two, and it is the whole argument: the published
// technique ("tap brake, left, tap brake, right") gives each beat NO steady load in its own
// direction, because the 800 ms before the tap was spent loaded the OTHER way.
function chain(mod, { kmh = 130, loadFirst = 0, beats = 6 } = {}) {
  const p = mk(mod, kmh / 3.6);
  if (loadFirst > 0) drive(p, loadFirst, { throttle: 1, steer: 1 });
  const rows = [];
  for (let i = 0; i < beats; i++) {
    const st = i % 2 === 0 ? 1 : -1;
    let pk = 0, nD = 0, n = 0;
    const tick = (t, s) => { pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) nD++; n++; };
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: st }, tick);
    drive(p, 0.8, { throttle: 1, steer: st }, tick);
    rows.push({ pk: pk * DEG, pct: 100 * nD / n });
  }
  return { rows, kmh: p.state.ground * 3.6 };
}
const chainFmt = (c) => c.rows.map((r) => `${r.pk.toFixed(1)}deg/${r.pct.toFixed(0)}%`).join(' | ')
  + `   final ${c.kmh.toFixed(0)} km/h`
  + `   ALL SIX >=10deg AND DRIFTING: ${c.rows.every((r) => r.pk >= 10 && r.pct > 0) ? 'HIT' : 'MISS'}`;

// ---- one tap after load ----------------------------------------------------------------------
async function tapProbe(mod, label) {
  const row = [];
  for (const kmh of [100, 130, 150]) {
    const p = mk(mod, kmh / 3.6);
    drive(p, 0.5, { throttle: 1, steer: 1 });
    let armed = false, dur = 0, pk = 0;
    drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) armed = true;
    });
    drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) { armed = true; dur = t; }
    });
    row.push(`${kmh}: armed ${armed ? 'Y' : 'N'} peak ${(pk * DEG).toFixed(1)} held ${dur.toFixed(2)}s`);
  }
  say(`  ${label}: ${row.join(' | ')}`);
}

// ---- the grip edge --------------------------------------------------------------------------
function gripEdge(mod, kmh) {
  const p = mk(mod, kmh / 3.6);
  let minY = 1e9, maxY = 0, peakSlip = 0, drifted = 0, n = 0;
  drive(p, 6, { throttle: 1, steer: 1 }, (t, s) => {
    if (t > 1) { minY = Math.min(minY, Math.abs(s.yawRate)); maxY = Math.max(maxY, Math.abs(s.yawRate)); }
    peakSlip = Math.max(peakSlip, Math.abs(s.slipAngle)); if (s.drifting) drifted++; n++;
  });
  return { minY: minY * DEG, maxY: maxY * DEG, slip: peakSlip * DEG, pct: 100 * drifted / n };
}
function yawCurve(mod) {
  const yaws = [];
  for (const v of [12.5, 20, 30, 40.2, 50, 60, 70, 78]) {
    const q = mk(mod, v); let pk = 0;
    drive(q, 3, { throttle: 1, steer: 1 }, (t, s) => { if (t > 1) pk = Math.max(pk, Math.abs(s.yawRate)); });
    yaws.push(pk * DEG);
  }
  return yaws;
}

// =============================================================================================
say(`== SOURCE: ${SRC}`);
const base = await load();

if (want(1)) {
  say('');
  say('== 1. THE THREE ORDERINGS (regression gate: 1 >= 2.0 s, 2 > 1, 3 < 1)');
  say('  ' + fmt(orderings(base)));
}

if (want(2)) {
  say('');
  say('== 2. THE BLOCKER: the ALTERNATING chain, no prior load, per beat, at 100/130/150 km/h');
  say('  "tap brake, left, tap brake, right" x6 at 1 s spacing, brake capped at the frozen 0.6');
  for (const kmh of [100, 130, 150]) say(`  ${kmh} km/h: ` + chainFmt(chain(base, { kmh })));
}

if (want(3)) {
  say('');
  say('== 3. the load-then-alternate chain (round 2\'s own manoeuvre): 0.6 s of load, then 6 beats');
  say('  130 km/h: ' + chainFmt(chain(base, { kmh: 130, loadFirst: 0.6 })));
}

if (want(4)) {
  say('');
  say('== 4. ONE 200 ms TAP after 0.5 s of load (the round-2 brief\'s literal target)');
  await tapProbe(base, 'shipped');
}

if (want(5)) {
  say('');
  say('== 5. THE GRIP EDGE: 6 s of held lock + throttle, and the yaw curve');
  for (const kmh of [130, 180, 250]) {
    const g = gripEdge(base, kmh);
    say(`  ${kmh} km/h: yaw ${g.minY.toFixed(1)}-${g.maxY.toFixed(1)} deg/s | peak slip ${g.slip.toFixed(1)} deg`
      + ` | drifting ${g.pct.toFixed(0)}%`);
  }
  const y = yawCurve(base);
  say(`  yaw curve 12.5..78 m/s: ${y.map((q) => q.toFixed(1)).join(' ')}`
    + ` | monotone non-increasing ${y.every((q, i) => i === 0 || q <= y[i - 1] + 0.05) ? 'yes' : 'NO'}`
    + ` | falloff vMax/peak ${(y[y.length - 1] / Math.max(...y)).toFixed(2)}`);
}

if (want(6)) {
  say('');
  say('== 6. THE E-BRAKE, regression gate: monotone in hold time, never faster than entry');
  for (const kmh of [80, 130, 200, 250]) {
    const row = [];
    for (const sec of [1, 2, 3]) {
      const p = mk(base, kmh / 3.6);
      const v0 = p.state.ground || kmh / 3.6;
      let faster = false;
      drive(p, sec, { throttle: 1, steer: 1, handbrake: true }, (t, s) => {
        if (s.ground > v0 * 1.001) faster = true;
      });
      row.push({ pct: 100 * (p.state.ground / v0 - 1), faster });
    }
    say(`  ${kmh} km/h at 1/2/3 s: ${row.map((r) => `${r.pct.toFixed(0)}%`).join(' / ')}`
      + ` | monotone down ${row[0].pct > row[1].pct && row[1].pct > row[2].pct ? 'yes' : 'NO'}`
      + ` | ever faster than entry ${row.some((r) => r.faster) ? 'YES (FAIL)' : 'no'}`);
  }
}

// =============================================================================================
if (want(7)) {
  say('');
  say('== 7. KILL-CONTROLS on this round\'s own mechanism');
  // 7a. The new entry criterion, removed. If the chain is bought by anything else, this is a null.
  const HAS_BREAK = readFileSync(SRC, 'utf8').includes('rearBroke');
  if (!HAS_BREAK) {
    say('  (the `rearBroke` entry criterion is not present in this source - BEFORE run, nothing to kill)');
  } else {
    say('');
    say('  -- 7a. KILL: the rear-capacity entry criterion deleted (`rearBroke` forced false)');
    const mod = await load([['    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;',
      '    const rearBroke = false; void fyRearDemand;   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(mod, { kmh: 130 })));
    say('     orderings:            ' + fmt(orderings(mod)));
    await tapProbe(mod, '     one tap with load  ');
    say('');
    say('  -- 7b. KILL: driftBreakRatio swept (how big a rear-force deficit counts as a break)');
    for (const r of [0.4, 0.7, 1.0, 1.5, 3.0]) {
      const m2 = await load([['  driftBreakRatio: 1.0,', `  driftBreakRatio: ${r.toFixed(1)},`]]);
      const c = chain(m2, { kmh: 130 });
      const g = gripEdge(m2, 130);
      say(`     ratio ${r.toFixed(1)}: chain ${c.rows.map((x) => `${x.pk.toFixed(0)}/${x.pct.toFixed(0)}%`).join(' ')}`
        + ` | held-lock-no-brake drifting ${g.pct.toFixed(0)}% (must stay 0: no brake, no drift)`);
    }
    say('');
    say('  -- 7c. KILL: the tap command stops scaling with steering angle');
    const m3 = await load([['      const tapWant = TUNE.driftTapSlip * tap * steerFrac',
      '      const tapWant = TUNE.driftTapSlip * tap * 1.0   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(m3, { kmh: 130 })));
    say('');
    say('  -- 7e2. KILL: the tap-command LINGER removed (`tap = tapCmd` -> `tap = tapNow`)');
    const m6 = await load([['      const tap = tapCmd;   // latched above, so it outlives the pedal by driftTapLinger',
      '      const tap = tapNow;   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(m6, { kmh: 130 })));
    await tapProbe(m6, '     one tap with load  ');
    say('');
    say('  -- 7e3. KILL: the still-entering hold refresh removed');
    const m7 = await load([['      if (rearBroke && intent) driftHold = TUNE.driftMinHold;',
      '      if (false && intent) driftHold = TUNE.driftMinHold;   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(m7, { kmh: 130 })));
    say('');
    say('  -- 7e4. KILL: the tap servo goes back to TWO-SIDED (it may straighten the slide again)');
    const m8 = await load([['      const rSustain = tap > 0.01 && steerFrac > 0.05 && tapOut !== 0\n        ? rHold + tapOut',
      '      const rSustain = tap > 0.01 && steerFrac > 0.05\n        ? rHold + clamp(tapErr * TUNE.handbrakeAssist, -TUNE.handbrakeRate, TUNE.handbrakeRate)   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(m8, { kmh: 130 })));
    await tapProbe(m8, '     one tap with load  ');
    say('');
    say('  -- 7e5. KILL: the flick\'s "car must be sideways first" floor removed');
    const m9 = await load([['    if (state.drifting && Math.abs(slipNow) > satRear * 0.5) {',
      '    if (state.drifting) {   // KILL-CONTROL']]);
    say('     orderings:            ' + fmt(orderings(m9)));
    say('     alternating chain 130: ' + chainFmt(chain(m9, { kmh: 130 })));
    say('');
    say('  -- 7e6. KILL: the uncancelled-while-entering feed-forward put back (always cancelled)');
    const mA = await load([['      const entering = rearBroke && tapOut !== 0;',
      '      const entering = false; void rearBroke;   // KILL-CONTROL']]);
    say('     alternating chain 130: ' + chainFmt(chain(mA, { kmh: 130 })));
    await tapProbe(mA, '     one tap with load  ');
    say('');
    say('  -- 7f. TRIGGER-HAPPINESS: can the new entry arm a drift the player did not ask for?');
    for (const [label, input] of [
      ['straight line, full brake, no steer   ', { throttle: -1, brake: BRAKE_CAP, steer: 0 }],
      ['straight line, full brake, 10% steer  ', { throttle: -1, brake: BRAKE_CAP, steer: 0.1 }],
      ['straight line, full brake, 20% steer  ', { throttle: -1, brake: BRAKE_CAP, steer: 0.2 }],
      ['gentle bend (30% lock), no brake      ', { throttle: 1, steer: 0.3 }],
      ['full lock, full throttle, no brake    ', { throttle: 1, steer: 1 }],
      ['gentle bend (30% lock) + full brake   ', { throttle: -1, brake: BRAKE_CAP, steer: 0.3 }],
    ]) {
      const p = mk(base, 130 / 3.6);
      drive(p, 0.5, { throttle: 1, steer: 0 });
      let nD = 0, n = 0, pk = 0;
      drive(p, 2, input, (t, s) => { if (s.drifting) nD++; n++; pk = Math.max(pk, Math.abs(s.slipAngle)); });
      say(`     ${label}: drifting ${(100 * nD / n).toFixed(0)}% | peak slip ${(pk * DEG).toFixed(1)} deg`);
    }
  }
  say('');
  say('  -- 7d. gripUse re-swept on THIS file (the critic\'s finding 3)');
  for (const g of [0.85, 0.95, 1.00]) {
    const m4 = await load([[/gripUse: [\d.]+,/.exec(readFileSync(SRC, 'utf8'))[0], `gripUse: ${g.toFixed(2)},`]]);
    const e = gripEdge(m4, 250);
    const y = yawCurve(m4);
    say(`     gripUse ${g.toFixed(2)}: 250 km/h yaw ${e.minY.toFixed(1)}-${e.maxY.toFixed(1)} deg/s,`
      + ` peak slip ${e.slip.toFixed(1)} deg, drifting ${e.pct.toFixed(0)}%`
      + ` | falloff ${(y[y.length - 1] / Math.max(...y)).toFixed(2)} | yaw@40.2 ${y[3].toFixed(1)}`);
  }
  say('');
  say('  -- 7e. driftEnterRatio re-swept on THIS file (the critic\'s finding 2)');
  for (const r of [1.0, 1.4]) {
    const m5 = await load([[/driftEnterRatio: [\d.]+,/.exec(readFileSync(SRC, 'utf8'))[0],
      `driftEnterRatio: ${r.toFixed(1)},`]]);
    await tapProbe(m5, `     enterRatio ${r.toFixed(1)}`);
    say(`       alternating chain 130: ` + chainFmt(chain(m5, { kmh: 130 })));
  }
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s',
  `handling-r2-fix-${bi >= 0 ? 'BEFORE' : 'AFTER'}.txt`), out.join('\n') + '\n');
