// _hr2v2.mjs — the VERIFY pass's ADVERSARIAL probe on the repair's new drift entry.
//
// The repair replaced "has the rear slip angle got large" with "can the rear tyre still make the
// force this corner needs", and the new predicate is answered INSTANTLY rather than after the car has
// had time to move sideways. That is the whole point of it, and it is also the obvious way it could
// have broken something the critic never had to test: ordinary braking. So this file asks the
// question the repair's own success creates — does pressing the brake in a gentle bend, or braking in
// a straight line, or lifting off, now put the car into a drift the player did not ask for.
//
// Same technique as _hr2v.mjs: patch/load a copy of physics.js from disk. BEFORE column is the real
// pre-repair module out of `git show 68d7547:game/physics.js`.
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
const DEG = 180 / Math.PI, DT = 1 / 120;
const BRAKE_CAP = 0.6;
const out = []; const say = (s) => { console.log(s); out.push(s); };
let vn = 0;
async function loadSrc(src) {
  const dir = mkdtempSync(join(tmpdir(), 'hr2v2-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const SHIPPED = readFileSync(join(HERE, '..', 'game', 'physics.js'), 'utf8');
const ship = await loadSrc(SHIPPED);
const pre = await loadSrc(execFileSync('git', ['show', '68d7547:game/physics.js'], { cwd: join(HERE, '..'), encoding: 'utf8' }));
// Attribution copies: the shipped file with ONLY the new predicate killed, and the shipped file with
// ONLY gripUse put back to the pre-repair 0.95. Any difference in the B table has to be one of them.
const noBreak = await loadSrc(SHIPPED.replace(
  '    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;',
  '    const rearBroke = false && fyRearCap < fyRearDemand * TUNE.driftBreakRatio;   // KILL-CONTROL'));
const grip95 = await loadSrc(SHIPPED.replace('\n  gripUse: 0.85,', '\n  gripUse: 0.95,   // KILL-CONTROL'));

function mk(mod, speed) {
  const p = mod.createPhysics({ blocks: [], bounds: 1e9 });
  p.reset(new Vector3(0, 0, 0), 0, speed); return p;
}
function drive(p, sec, input, onTick) {
  for (let i = 0; i < Math.round(sec / DT); i++) { p.setInput(input); p.step(DT); onTick?.((i + 1) * DT, p.state); }
}
/** A player action: `sec` of the given input at `kmh`, then 1.5 s of coasting straight. */
function act(mod, kmh, input, sec) {
  const p = mk(mod, kmh / 3.6);
  let pk = 0, nD = 0, n = 0, py = 0;
  const tick = (t, s) => {
    pk = Math.max(pk, Math.abs(s.slipAngle)); py = Math.max(py, Math.abs(s.yawRate));
    if (s.drifting) nD++; n++;
  };
  drive(p, sec, input, tick);
  const armed = nD > 0;
  drive(p, 1.5, { throttle: 0, steer: 0 }, tick);
  return `armed ${armed ? 'Y' : 'n'} ${(100 * nD / n).toFixed(0)}% | peak ${(pk * DEG).toFixed(1)} deg`
    + ` at ${(py * DEG).toFixed(0)} deg/s | end ${(Math.abs(p.state.slipAngle) * DEG).toFixed(1)} deg`
    + ` ${(p.state.ground * 3.6).toFixed(0)} km/h`;
}

say('== A. STRAIGHT-LINE BRAKING. Should never arm a drift: ayDemand ~ 0.');
for (const kmh of [80, 130, 200, 250]) {
  say(`  ${kmh} km/h, 1.5 s of S, steer 0 : SHIPPED ${act(ship, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 0 }, 1.5)}`);
  say(`  ${' '.repeat(String(kmh).length)}                        PRE     ${act(pre, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 0 }, 1.5)}`);
}

say('');
say('== B. BRAKING INTO A BEND, a 0.4 s dab of S at increasing lock. The realistic player action.');
for (const kmh of [80, 130, 200]) {
  for (const lock of [0.1, 0.2, 0.4, 0.7, 1.0]) {
    say(`  ${kmh} km/h lock ${lock.toFixed(1)}, 0.4 s of S : SHIPPED ${act(ship, kmh, { throttle: -1, brake: BRAKE_CAP, steer: lock }, 0.4)}`);
    say(`  ${' '.repeat(String(kmh).length)}          ${' '.repeat(3)}              PRE     ${act(pre, kmh, { throttle: -1, brake: BRAKE_CAP, steer: lock }, 0.4)}`);
  }
}

say('');
say('== C. LIFT-OFF ONLY (throttle 0, no brake, no handbrake): `intent` is false, must never arm.');
for (const kmh of [130, 250]) {
  say(`  ${kmh} km/h, 2 s full lock, no brake : SHIPPED ${act(ship, kmh, { throttle: 0, steer: 1 }, 2)}`);
  say(`  ${' '.repeat(String(kmh).length)}                              PRE     ${act(pre, kmh, { throttle: 0, steer: 1 }, 2)}`);
}

say('');
say('== D. LOW SPEED. A car park manoeuvre: does the entry fire where the model is least valid?');
for (const kmh of [15, 30, 50]) {
  say(`  ${kmh} km/h lock 1.0, 1 s of S : SHIPPED ${act(ship, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 1)}`);
  say(`  ${' '.repeat(String(kmh).length)}                          PRE     ${act(pre, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 1)}`);
}

say('');
say('== E. ATTRIBUTION for the B table: is a shallower braked turn-in the new predicate or gripUse?');
for (const kmh of [130, 200]) {
  for (const lock of [0.2, 1.0]) {
    const inp = { throttle: -1, brake: BRAKE_CAP, steer: lock };
    say(`  ${kmh} km/h lock ${lock.toFixed(1)}, 0.4 s of S`);
    for (const [label, mod] of [['SHIPPED            ', ship], ['rearBroke killed   ', noBreak],
      ['gripUse 0.95 only  ', grip95], ['PRE-REPAIR         ', pre]]) {
      say(`      ${label} ${act(mod, kmh, inp, 0.4)}`);
    }
  }
}

say('');
say('== F. WHAT `state.drifting` NOW MEANS. Longest run of drift-state samples under 2 deg of slip.');
for (const [label, mod] of [['SHIPPED   ', ship], ['PRE-REPAIR', pre]]) {
  const row = [];
  for (const lock of [0.2, 0.5, 1.0]) {
    const p = mk(mod, 130 / 3.6);
    let n = 0, shallow = 0;
    drive(p, 0.4, { throttle: -1, brake: BRAKE_CAP, steer: lock }, (t, s) => {
      if (s.drifting) { n++; if (Math.abs(s.slipAngle) * DEG < 2) shallow++; }
    });
    drive(p, 1.0, { throttle: 1, steer: lock }, (t, s) => {
      if (s.drifting) { n++; if (Math.abs(s.slipAngle) * DEG < 2) shallow++; }
    });
    row.push(`lock ${lock}: ${n} drift samples, ${shallow} of them under 2 deg`);
  }
  say(`  ${label}: ${row.join(' | ')}`);
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-r2-verify-entry.txt'), out.join('\n') + '\n');
