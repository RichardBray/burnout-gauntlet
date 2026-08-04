// _hr3c.mjs - the ROUND-3 CRITIC's kill-control harness for game/physics.js. My own file.
//
// Technique is the house one (patch a COPY of physics.js on disk and import that, because CD and
// POWER_BOOST are module-scope and mutating TUNE after import proves nothing). Every patch anchor
// throws if it is missing, so a patch that silently failed cannot be read as a null result.
//
// BEFORE = `git show 68c093b:game/physics.js` (the file the round-3 builder started from)
// AFTER  = game/physics.js in the working tree at HEAD (3e4e645)
//
// NO FRAME TIME anywhere in this file. Usage: node tools/_hr3c.mjs [section...]
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
  const dir = mkdtempSync(join(tmpdir(), 'hr3c-'));
  cpSync(join(HERE, '..', 'game', 'util.js'), join(dir, 'util.js'));
  let src = src0;
  for (const [f, t] of edits) {
    if (!src.includes(f)) throw new Error('ANCHOR MISSING, patch not applied: ' + f);
    src = src.replace(f, t);
  }
  const f = join(dir, `p${++vn}.js`); writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}
const load = (edits = []) => loadSrc(AFTER_SRC, edits);
const loadB = (edits = []) => loadSrc(BEFORE_SRC, edits);

// The two round-3 halves, each deleted PROPERLY. Note that setting driftRefFloor to 1 does NOT
// disable the floor - floorFade = 1 - clamp((|slip|/satRear - 1)/(floor - 1), 0, 1) goes to 1, i.e.
// the floor becomes permanently FULLY ON. The only honest deletion is to hand `ref` the unfloored
// sustain reference, which is exactly the pre-round-3 line.
const FLOOR_OFF = [[`      const ref = floorFade > 0 && sT !== 0 && sT * refSustain < sT * rTarget
        ? lerp(refSustain, rTarget, floorFade) : refSustain;`,
  '      const ref = refSustain;  // KILL-CONTROL: the pre-round-3 line']];
const GATE_OFF = [['const proRotation = tyreMoment * Math.sign(rTarget || dSign) > 0;',
  'const proRotation = true;  // KILL-CONTROL: the pre-round-3 predicate']];

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
const ang = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

// The published alternating chain, worded from docs/BURNOUT-HANDLING.md the way both previous
// critics drove it: 0.6 s of load, then [brake tap 200 ms, drive 800 ms] x 6, alternating.
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
  return { beats, str: beats.join(' | '), final: p.state.ground * 3.6 };
}

// =================================================================================================
// 1. CONSERVATION. Is the flick norm-preserving, metered AT THE LINE by me, not by the builder?
//
// I meter hypot(speed, vLat) immediately before and immediately after the flick block, in a patched
// copy, and sum the difference over the whole published chain. This is the brief's own test: show
// that ground speed is not INCREASED by the input. I run it on BEFORE and on AFTER with the SAME
// meter, so the meter cannot favour either.
if (on(1)) {
  say('');
  say('== 1. FREE ENERGY, METERED AT THE FLICK LINE BY ME. sum of |v| created over the 6-beat chain');
  const METER_HEAD = `    if (state.drifting && Math.abs(slipNow) > satRear * 0.5) {
      const __g0 = Math.hypot(state.speed, state.vLat);`;
  const METER_TAIL = (body) => `${METER_HEAD}
${body}
      const __g1 = Math.hypot(state.speed, state.vLat);
      globalThis.__flick = globalThis.__flick || { n: 0, sum: 0, max: 0, min: 0 };
      const __d = __g1 - __g0;
      globalThis.__flick.n++; globalThis.__flick.sum += __d;
      globalThis.__flick.max = Math.max(globalThis.__flick.max, __d);
      globalThis.__flick.min = Math.min(globalThis.__flick.min, __d);
    }`;
  const AFTER_BODY = `      const dPhi = -dSign * TUNE.driftFlick * dCounter;
      const cPhi = Math.cos(dPhi), sPhi = Math.sin(dPhi);
      const vRot = state.speed * cPhi - state.vLat * sPhi;
      state.vLat = state.speed * sPhi + state.vLat * cPhi;
      state.speed = vRot;`;
  const BEFORE_BODY = `      state.vLat -= dSign * TUNE.driftFlick * dCounter * gv;`;
  const AFTER_WHOLE = `    if (state.drifting && Math.abs(slipNow) > satRear * 0.5) {
${AFTER_BODY}
    }`;
  const BEFORE_WHOLE = `    if (state.drifting && Math.abs(slipNow) > satRear * 0.5) {
${BEFORE_BODY}
    }`;
  for (const [label, src, whole, body] of [
    ['BEFORE (68c093b, adds to state.vLat)', BEFORE_SRC, BEFORE_WHOLE, BEFORE_BODY],
    ['AFTER  (3e4e645, rotates the vector)', AFTER_SRC, AFTER_WHOLE, AFTER_BODY],
  ]) {
    globalThis.__flick = { n: 0, sum: 0, max: 0, min: 0 };
    const mod = await loadSrc(src, [[whole, METER_TAIL(body)]]);
    const c = chain(mod, 130);
    const f = globalThis.__flick;
    say(`  ${label}`);
    say(`    applications ${f.n} | TOTAL |v| created ${f.sum.toFixed(4)} m/s (${(f.sum * 3.6).toFixed(4)} km/h)`
      + ` | biggest single +${f.max.toFixed(4)} | most negative ${f.min.toFixed(4)} m/s`);
    say(`    chain: ${c.str}`);
  }
}

// =================================================================================================
// 2. CHAIN DEPTH, and how much of it is the flick. driftFlick 0 is the honest-number question.
if (on(2)) {
  say('');
  say('== 2. CHAIN PER BEAT at 130 km/h, headless, and the driftFlick 0 kill-control');
  const KILL = [['  driftFlick: 0.18,', '  driftFlick: 0,   // KILL-CONTROL']];
  say('  BEFORE 68c093b        : ' + chain(await loadB(), 130).str);
  say('  AFTER  3e4e645        : ' + chain(await load(), 130).str);
  say('  BEFORE, driftFlick 0  : ' + chain(await loadB(KILL), 130).str);
  say('  AFTER,  driftFlick 0  : ' + chain(await load(KILL), 130).str);
  say('  AFTER,  driftRefFloor 1 (floor OFF): '
    + chain(await load(FLOOR_OFF), 130).str);
  say('  AFTER,  driftFlick 0 + floor OFF   : ' + chain(await load([...KILL, ...FLOOR_OFF]), 130).str);
  say('  AFTER,  driftFlick 0 + gate OFF    : ' + chain(await load([...KILL, ...GATE_OFF]), 130).str);
  say('  AFTER,  driftFlick 0 + BOTH OFF    : ' + chain(await load([...KILL, ...FLOOR_OFF, ...GATE_OFF]), 130).str);
  say('  AFTER,  proRotation forced true    : '
    + chain(await load(GATE_OFF), 130).str);
}

// =================================================================================================
// 3. TURN-IN, SIGNED. brake+lock vs throttle+lock from dead straight. The sign is the whole point:
// |yaw - yaw0| scores a car spinning away from the corner as a car turning into it.
// steer +1 is LEFT (main.js maps left to +1), so a correct left turn is a POSITIVE yaw and the
// requested direction is +1 for every run below.
function turnIn(mod, kmh, keys, winMs) {
  const p = mk(mod, kmh / 3.6);
  const y0 = p.state.yaw;
  let pkYaw = -1e9, wrong = 0, pkSlip = 0, nD = 0, n = 0;
  drive(p, winMs / 1000, keys, (t, s) => {
    pkYaw = Math.max(pkYaw, s.yawRate); wrong = Math.min(wrong, s.yawRate);
    pkSlip = Math.max(pkSlip, Math.abs(s.slipAngle)); if (s.drifting) nD++; n++;
  });
  return { head: ang(p.state.yaw - y0) * DEG, pkYaw: pkYaw * DEG, wrong: wrong * DEG,
    pkSlip: pkSlip * DEG, dPct: 100 * nD / n };
}
if (on(3)) {
  say('');
  say('== 3. TURN-IN FROM DEAD STRAIGHT, SIGNED heading in 400 ms (+ = the way the driver asked)');
  const cases = [
    ['BEFORE 68c093b', await loadB()],
    ['AFTER  3e4e645', await load()],
    ['AFTER, driftRefFloor OFF', await load(FLOOR_OFF)],
    ['AFTER, proRotation gate OFF', await load(GATE_OFF)],
    ['AFTER, BOTH OFF', await load([...FLOOR_OFF, ...GATE_OFF])],
  ];
  for (const [label, mod] of cases) {
    for (const win of [400]) {
      const row = [];
      for (const kmh of [100, 130, 200, 250]) {
        const b = turnIn(mod, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, win);
        const w = turnIn(mod, kmh, { throttle: 1, steer: 1 }, win);
        row.push(`${kmh}: S+lock ${b.head >= 0 ? '+' : ''}${b.head.toFixed(1)} (wrong-way yaw ${b.wrong.toFixed(0)}) vs W+lock ${w.head >= 0 ? '+' : ''}${w.head.toFixed(1)}`);
      }
      say(`  ${label.padEnd(28)} ${win} ms`);
      for (const r of row) say('      ' + r);
    }
  }
}

// =================================================================================================
// 4. THE POWER-ON EDGE, and the DISCLOSURE behind it. I probe the builder's central claim myself:
// "throttle makes the rear axle MORE capable, not less - rear demand/capacity is a flat 0.78 on
// throttle against 0.86 coasting". I instrument fyRearDemand / fyRearCap inside substep() and read
// it out, on throttle and coasting, at four speeds. If the ratio is BELOW 1 on throttle and HIGHER
// coasting, the disclosure is right and no amount of assist-killing can make an edge appear.
if (on(4)) {
  say('');
  say('== 4. POWER-ON EDGE. (a) the behaviour, (b) the demand/capacity ratio, (c) my kill-controls');
  const PROBE_ANCHOR = '    const rearBroke = fyRearCap < fyRearDemand * TUNE.driftBreakRatio;';
  const PROBE = PROBE_ANCHOR + `
    { const q = globalThis.__q; if (q) { q.push({ dem: fyRearDemand, cap: fyRearCap,
        fx: Math.abs(fxRear), mu: muRear * fzRear, fz: fzRear, fz0: fzRear0, fy: Math.abs(fyRear) }); } }`;
  const probed = await load([[PROBE_ANCHOR, PROBE]]);
  function held(mod, kmh, throttle, sec = 6) {
    const p = mk(mod, kmh / 3.6);
    let pkYaw = 0, pkSlip = 0, nD = 0, n = 0; const yaws = [];
    drive(p, sec, { throttle, steer: 1 }, (t, s) => {
      pkYaw = Math.max(pkYaw, Math.abs(s.yawRate)); pkSlip = Math.max(pkSlip, Math.abs(s.slipAngle));
      if (s.drifting) nD++; n++; if (n % 60 === 0) yaws.push((s.yawRate * DEG).toFixed(0));
    });
    return { pkYaw: pkYaw * DEG, pkSlip: pkSlip * DEG, dPct: 100 * nD / n,
      end: p.state.ground * 3.6, trace: yaws.join(' ') };
  }
  say('  (a) 6 s of held full lock, AFTER 3e4e645:');
  const after = await load();
  for (const kmh of [130, 200, 250]) {
    for (const [lab, th] of [['full throttle', 1], ['coasting     ', 0]]) {
      const r = held(after, kmh, th);
      say(`    ${kmh} km/h ${lab}: peak yaw ${r.pkYaw.toFixed(0)} deg/s | peak slip ${r.pkSlip.toFixed(1)} deg`
        + ` | drifting ${r.dPct.toFixed(0)}% | -> ${r.end.toFixed(0)} km/h | yaw/s trace ${r.trace}`);
    }
  }
  say('  (b) rear demand/capacity, sampled inside substep() over the same 6 s (mean, max):');
  for (const kmh of [100, 130, 200, 250]) {
    for (const [lab, th] of [['full throttle', 1], ['coasting     ', 0]]) {
      globalThis.__q = [];
      held(probed, kmh, th);
      const q = globalThis.__q; globalThis.__q = null;
      const r = q.map((x) => x.dem / Math.max(1e-9, x.cap));
      const fxShare = q.map((x) => x.fx / Math.max(1e-9, x.mu));
      const fzGain = q.map((x) => x.fz / Math.max(1e-9, x.fz0));
      const mean = (A) => A.reduce((s, x) => s + x, 0) / A.length;
      say(`    ${kmh} km/h ${lab}: demand/capacity mean ${mean(r).toFixed(3)} max ${Math.max(...r).toFixed(3)}`
        + ` | |fxRear|/(mu*fz) mean ${mean(fxShare).toFixed(3)}`
        + ` | fzRear/fzRear0 mean ${mean(fzGain).toFixed(3)}`);
    }
  }
  say('  (c) MY OWN kill-controls, 6 s full lock + full throttle at 250 km/h. peak slip / drifting:');
  const kills = [
    ['baseline AFTER', []],
    ['stabilityAssist 2.6 -> 0', [['  stabilityAssist: 2.6,', '  stabilityAssist: 0,  // KILL']]],
    ['spinDamp 6.0 -> 0', [['  spinDamp: 6.0,', '  spinDamp: 0,  // KILL']]],
    ['both servo terms 0', [['  stabilityAssist: 2.6,', '  stabilityAssist: 0,  // KILL'],
      ['  spinDamp: 6.0,', '  spinDamp: 0,  // KILL']]],
    ['intent gate takes throttle', [['const intent = handbrake || brake > 0.15 || throttle < 0;',
      'const intent = handbrake || brake > 0.15 || throttle < 0 || throttle > 0.5;  // KILL']]],
    ['driveSplitRear 0.65 -> 1.00', [['  driveSplitRear: 0.65,', '  driveSplitRear: 1.00,  // KILL']]],
    ['load transfer OFF (transferCap 0)', [['  transferCap: 0.40,', '  transferCap: 0.0,  // KILL']]],
    ['delta = mechanical lock', [['    const delta = clamp(L * rTarget / Math.max(gv, 4)',
      '    const delta = Math.sign(rTarget) * TUNE.steerMax + 0 * clamp(L * rTarget / Math.max(gv, 4)']]],
    ['muRear 2.32 -> 1.60 (rear made weak)', [['  muRear: 2.32,', '  muRear: 1.60,  // KILL']]],
  ];
  for (const [label, edits] of kills) {
    const mod = await load(edits);
    const r = held(mod, 250, 1);
    say(`    ${label.padEnd(36)} peak yaw ${r.pkYaw.toFixed(0)} deg/s | peak slip ${r.pkSlip.toFixed(1)} deg`
      + ` | drifting ${r.dPct.toFixed(0)}% | -> ${r.end.toFixed(0)} km/h`);
  }
}

// =================================================================================================
// 5. IS driftRefFloor 1.5 THE RIGHT VALUE, and does the floor create a pathology of its own?
//    (a) the builder claims the turn-in is FLAT across 1.2/1.5/2.0/3.0/6.0 and that the shipped value
//        is decided by ordering 2. I sweep both.
//    (b) the floor can only ADD rotation, so the thing to look for is rotation the player did not ask
//        for: a straight-line brake (no steer) and a brake dab held mid-corner.
if (on(5)) {
  say('');
  say('== 5. driftRefFloor SWEEP and the pathologies a one-sided rotation floor could create');
  function orderings(mod) {
    // entry: throttle + LEFT lock + handbrake for 0.9 s at 145 km/h, then A centred / B 0.15 s
    // opposite tap / C held opposite lock. Half-peak and a fixed 10 deg bar, as both critics scored it.
    const res = [];
    for (const mode of ['centred', 'tap', 'held']) {
      const p = mk(mod, 145 / 3.6);
      drive(p, 0.9, { throttle: 1, steer: 1, handbrake: true });
      const peak = Math.abs(p.state.slipAngle);
      let tHalf = 0, tTen = 0;
      drive(p, 4.0, (t) => {
        const ctr = mode === 'held' ? -1 : mode === 'tap' && t < 0.15 ? -1 : 0;
        return { throttle: 1, steer: ctr };
      }, (t, st) => {
        if (Math.abs(st.slipAngle) > peak * 0.5) tHalf = t;
        if (Math.abs(st.slipAngle) * DEG > 10) tTen = t;
      });
      res.push(`${mode} ${tHalf.toFixed(2)}s/${tTen.toFixed(2)}s`);
    }
    return res.join(' | ');
  }
  for (const v of ['1.2', '1.5', '2.0', '3.0', '6.0']) {
    const mod = v === '1.5' ? await load() : await load([['  driftRefFloor: 1.5,', `  driftRefFloor: ${v},  // SWEEP`]]);
    const t130 = turnIn(mod, 130, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 400);
    const t250 = turnIn(mod, 250, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 400);
    say(`  driftRefFloor ${v}${v === '1.5' ? ' (SHIPPED)' : '         '}: S+lock heading 130 ${t130.head.toFixed(1)} deg`
      + ` | 250 ${t250.head.toFixed(1)} deg | orderings (half-peak/10deg) ${orderings(mod)}`);
  }
  const floorOff = await load(FLOOR_OFF);
  say(`  floor DELETED             : S+lock heading 130 ${turnIn(floorOff, 130, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 400).head.toFixed(1)} deg`
    + ` | 250 ${turnIn(floorOff, 250, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, 400).head.toFixed(1)} deg | orderings ${orderings(floorOff)}`);
  say('  (b) rotation the player did NOT ask for. BEFORE vs AFTER, 1 s, |heading| and |peak yaw|:');
  for (const [lab, mod] of [['BEFORE', await loadB()], ['AFTER ', await load()]]) {
    for (const kmh of [80, 130, 200, 250]) {
      const st = turnIn(mod, kmh, { throttle: -1, brake: BRAKE_CAP, steer: 0 }, 1000);
      say(`    ${lab} ${kmh} km/h STRAIGHT-LINE brake, steer 0: heading ${st.head.toFixed(3)} deg`
        + ` | peak yaw ${st.pkYaw.toFixed(2)} deg/s | drifting ${st.dPct.toFixed(0)}%`);
    }
  }
  say('  (c) a brake DAB held through a corner (0.5 s of load, then brake + lock for 2 s):');
  for (const [lab, mod] of [['BEFORE', await loadB()], ['AFTER ', await load()]]) {
    for (const kmh of [130, 250]) {
      const p = mk(mod, kmh / 3.6);
      drive(p, 0.5, { throttle: 1, steer: 1 });
      const y0 = p.state.yaw;
      let pk = 0, wrong = 0;
      drive(p, 2.0, { throttle: -1, brake: BRAKE_CAP, steer: 1 }, (t, s2) => {
        pk = Math.max(pk, Math.abs(s2.slipAngle)); wrong = Math.min(wrong, s2.yawRate);
      });
      say(`    ${lab} ${kmh} km/h: heading in 2 s ${(ang(p.state.yaw - y0) * DEG).toFixed(1)} deg`
        + ` | peak |slip| ${(pk * DEG).toFixed(1)} deg | worst wrong-way yaw ${(wrong * DEG).toFixed(0)} deg/s`
        + ` | -> ${(p.state.ground * 3.6).toFixed(0)} km/h`);
    }
  }
}

writeFileSync(join(HERE, '..', 'verdicts', 'wave-s', 'handling-r3-critic-kill.txt'), out.join('\n') + '\n');
