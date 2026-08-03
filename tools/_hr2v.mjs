// _hr2v.mjs — the VERIFY pass's kill-controls on the handling-r2 REPAIR (748e11c).
//
// I could not re-run tools/_hcr2-kill.mjs unmodified: two of its anchors are `gripUse: 0.95` and
// `driftEnterRatio: 1.0`, and the repair reverted both, so it throws ANCHOR MISSING by construction
// (and it also writes over the critic's own raw log). This is a from-scratch instrument that uses the
// same technique — patch a COPY of physics.js on disk and import that, because `CD` and `POWER_BOOST`
// are module-scope constants so mutating TUNE afterwards proves nothing — with my own anchors, and it
// writes only to my own log.
//
// Extra thing this file does that neither predecessor did: it loads the PRE-REPAIR physics.js
// straight out of `git show 68d7547:game/physics.js`, so every BEFORE number here is the real
// pre-repair module and not a patched approximation of it.
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
const SHIPPED = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
const PRE = execFileSync('git', ['show', '68d7547:game/physics.js'], { cwd: join(HERE, '..'), encoding: 'utf8' });

async function loadSrc(src0, edits = []) {
  const dir = mkdtempSync(join(tmpdir(), 'hr2v-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = src0;
  for (const [f, t] of edits) {
    if (!src.includes(f)) throw new Error('KILL-CONTROL ANCHOR MISSING, patch not applied: ' + f);
    src = src.replace(f, t);
  }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const load = (edits = []) => loadSrc(SHIPPED, edits);

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

/** The published alternating chain, per beat: 0.6 s of load then [tap 200 ms, drive 800 ms] x 6. */
function chain(mod, kmh = 130) {
  const p = mk(mod, kmh / 3.6);
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
  return `${beats.join(' | ')}   final ${(p.state.ground * 3.6).toFixed(0)} km/h`;
}

/** One 200 ms tap after 0.5 s of load: does it arm, how deep, how long does the state hold. */
function tap(mod, kmh) {
  const p = mk(mod, kmh / 3.6);
  drive(p, 0.5, { throttle: 1, steer: 1 });
  let pk = 0, armed = false, dur = 0;
  const tick = (t, s) => { pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) { armed = true; dur = t; } };
  drive(p, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, tick);
  drive(p, 2.5, { throttle: 1, steer: 1 }, (t, s) => tick(t + 0.2, s));
  return `${kmh}: armed ${armed ? 'Y' : 'N'} peak ${(pk * DEG).toFixed(1)} held ${dur.toFixed(2)}s`;
}

/** The three orderings, off the round-1 critic's entry, on the UNCLAMPED slip angle. */
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

/** Six seconds of held lock + throttle at 250 km/h. Is there a power-on edge at any gripUse? */
function gripEdge(mod) {
  const p = mk(mod, 250 / 3.6);
  let pk = 0, nD = 0, n = 0; const yaws = [];
  drive(p, 6, { throttle: 1, steer: 1 }, (t, s) => {
    pk = Math.max(pk, Math.abs(s.slipAngle)); if (s.drifting) nD++; n++;
    if (Math.abs(t * 10 % 6) < 1e-6) yaws.push((Math.abs(s.yawRate) * DEG).toFixed(0));
  });
  return `yaw ${yaws.join(' ')} deg/s | peak slip ${(pk * DEG).toFixed(1)} deg`
    + ` | drifting ${(100 * nD / n).toFixed(0)}% | final ${(p.state.ground * 3.6).toFixed(0)} km/h`;
}

const pre = await loadSrc(PRE);
const ship = await load();

// Read the constants off the DECLARATION line, anchored to the two leading spaces of the TUNE
// literal, never off a bare `gripUse: n` match — the comments quote candidate values too, and an
// unanchored regex reports the comment instead of the constant, which is rule 5 in miniature.
const K = (src, name) => (new RegExp(`^  ${name}: ([\\d.]+),`, 'm').exec(src)?.[1] ?? 'ABSENT');
say('== 0. THE TWO MODULES UNDER TEST');
say(`  PRE-REPAIR  = git show 68d7547:game/physics.js  (gripUse ${K(PRE, 'gripUse')},`
  + ` driftEnterRatio ${K(PRE, 'driftEnterRatio')}, driftBreakRatio ${K(PRE, 'driftBreakRatio')})`);
say(`  SHIPPED     = game/physics.js at HEAD          (gripUse ${K(SHIPPED, 'gripUse')},`
  + ` driftEnterRatio ${K(SHIPPED, 'driftEnterRatio')}, driftBreakRatio ${K(SHIPPED, 'driftBreakRatio')})`);

say('');
say('== 1. THE CRITIC\'S BLOCKER: the alternating chain, per beat, BEFORE vs AFTER');
say('  PRE-REPAIR : ' + chain(pre));
say('  SHIPPED    : ' + chain(ship));

say('');
say('== 2. MECHANISM, SINGLE-POINT: force `rearBroke` false and change nothing else');
{
  const mod = await load([[
    '    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;',
    '    const rearBroke = false && fyRearCap < fyRearDemand * TUNE.driftBreakRatio;   // KILL-CONTROL',
  ]]);
  say('  rearBroke=false: ' + chain(mod));
  say('  (if this equals the PRE-REPAIR row above, the whole repair is one predicate)');
}

say('');
say('== 3. THE THREE SUPPORTING CHANGES, each deleted alone, on the chain and on one tap');
{
  const cases = [
    ['re-arm deleted   ', [['      if (rearBroke && intent) driftHold = TUNE.driftMinHold;',
      '      if (false) driftHold = TUNE.driftMinHold;   // KILL-CONTROL']]],
    ['floor -> two-sided', [['      const tapOut = Math.sign(tapWant) * tapErr > 0\n        ? clamp(tapErr * TUNE.handbrakeAssist, -TUNE.handbrakeRate, TUNE.handbrakeRate) : 0;',
      '      const tapOut = clamp(tapErr * TUNE.handbrakeAssist, -TUNE.handbrakeRate, TUNE.handbrakeRate);   // KILL-CONTROL']]],
    ['moment cancelled  ', [['      const entering = rearBroke && tapOut !== 0;',
      '      const entering = false;   // KILL-CONTROL']]],
    ['flick floor removed', [['    if (state.drifting && Math.abs(slipNow) > satRear * 0.5) {',
      '    if (state.drifting) {   // KILL-CONTROL: round-2 unfloored flick']]],
  ];
  for (const [label, edits] of cases) {
    const mod = await load(edits);
    say(`  ${label}: ${chain(mod)}`);
    say(`  ${' '.repeat(label.length)}  ${tap(mod, 130)}   orderings: ${orderings(mod)}`);
  }
}

say('');
say('== 4. THE TWO REVERTED CONSTANTS. Is driftEnterRatio really INERT now, and does gripUse buy an edge?');
{
  say('  driftEnterRatio 1.4 (shipped): ' + [100, 130, 150].map((k) => tap(ship, k)).join(' | '));
  const m10 = await load([['  driftEnterRatio: 1.4,', '  driftEnterRatio: 1.0,   // KILL-CONTROL']]);
  say('  driftEnterRatio 1.0 (round 2): ' + [100, 130, 150].map((k) => tap(m10, k)).join(' | '));
  say('  chain at 1.0: ' + chain(m10));
  for (const g of ['0.85', '0.95', '1.00']) {
    const mod = g === '0.85' ? ship : await load([['  gripUse: 0.85,', `  gripUse: ${g},   // KILL-CONTROL`]]);
    say(`  gripUse ${g}: ${gripEdge(mod)}`);
  }
}

say('');
say('== 5. DOES THE REPAIR TOUCH THE CRITIC\'S CONFIRMED MECHANISM FOR ORDERING 1? (rHold -> rTarget)');
{
  say('  shipped        : ' + orderings(ship));
  say('  PRE-REPAIR     : ' + orderings(pre));
  const mod = await load([[
    '        : rHold - TUNE.driftAngularDamping * slipNow;',
    '        : rTarget;   // KILL-CONTROL: round 1 aimed at the driver\'s requested rate',
  ]]);
  say('  rSustain=rTarget: ' + orderings(mod));
}

say('');
say('== 6. THE HELD-BRAKE DEPTH the builder discloses as a scored regression (2 s of brake + lock)');
for (const [label, mod] of [['PRE-REPAIR', pre], ['SHIPPED   ', ship]]) {
  const row = [];
  for (const lock of [0.3, 0.6, 1.0]) {
    const p = mk(mod, 130 / 3.6);
    let pk = 0, py = 0;
    drive(p, 2, { throttle: -1, brake: BRAKE_CAP, steer: lock }, (t, s) => {
      pk = Math.max(pk, Math.abs(s.slipAngle)); py = Math.max(py, Math.abs(s.yawRate));
    });
    let rec = 0;
    drive(p, 3, { throttle: 1, steer: 0 }, (t, s) => { rec = Math.abs(s.slipAngle); });
    row.push(`lock ${lock}: ${(pk * DEG).toFixed(1)} deg at ${(py * DEG).toFixed(0)} deg/s, +3 s -> ${(rec * DEG).toFixed(1)} deg`);
  }
  say(`  ${label}: ${row.join(' | ')}`);
}

say('');
say('== 7. HOW MUCH OF THE CHAIN\'S HEADLINE ANGLE IS THE TYRE MODEL, AND HOW MUCH IS driftFlick?');
say('   In an ALTERNATING chain every beat\'s steering is opposite lock to the live slide, so');
say('   `driftFlick` - the one-substep lateral-velocity injection the round-2 critic called free');
say('   energy - is paid on every beat. The drift STATE is what the blocker was about; the ANGLE is');
say('   the number that was reported. These are not the same claim.');
{
  const p = (mod) => {
    let vmax = 0;
    const one = mk(mod, 130 / 3.6);
    drive(one, 0.6, { throttle: 1, steer: 1 });
    const beats = [];
    for (let i = 0; i < 6; i++) {
      const st = i % 2 === 0 ? 1 : -1;
      let pk = 0, nD = 0, n = 0;
      const tick = (t, s) => {
        pk = Math.max(pk, Math.abs(s.slipAngle)); vmax = Math.max(vmax, Math.abs(s.vLat));
        if (s.drifting) nD++; n++;
      };
      drive(one, 0.2, { throttle: -1, brake: BRAKE_CAP, steer: st }, tick);
      drive(one, 0.8, { throttle: 1, steer: st }, tick);
      beats.push(`${(pk * DEG).toFixed(1)}deg/${(100 * nD / n).toFixed(0)}%`);
    }
    return `${beats.join(' | ')} | peak |vLat| ${vmax.toFixed(2)} m/s | final ${(one.state.ground * 3.6).toFixed(0)} km/h`;
  };
  say('  shipped       : ' + p(ship));
  say('  driftFlick 0  : ' + p(await load([['  driftFlick: 0.18,', '  driftFlick: 0,   // KILL-CONTROL']])));
  say('  driftTapSlip 0: ' + p(await load([['  driftTapSlip: 0.30,', '  driftTapSlip: 0,   // KILL-CONTROL']])));
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-r2-verify-kill.txt'), out.join('\n') + '\n');
