// _hcr2-drive.mjs — the wave-S ROUND 2 handling critic drives the live page.
//
// Written from scratch, not adapted from the builder's `_handling-r2-drive.mjs`, because that tool's
// sampler is a `page.evaluate()` round trip every 50 ms and its key presses are bracketed by the same
// round trips. Two consequences that matter for the numbers this round turns on:
//   * a "0.15 s tap" of opposite lock is actually held for however long two IPC round trips take, and
//     `driftCounterGather` is 0.60 s, so the difference between a tap and a hold is exactly what that
//     jitter lands on. The whole second ordering rides on it.
//   * `driftFlick` injects lateral velocity in a SINGLE substep. A 50 ms sampler cannot see a step
//     that a 60 Hz tick applies and the tyres start eating on the next frame.
// So: the sampler and the key timeline both live INSIDE the page, in an rAF loop, and the keys still
// go through `window.dispatchEvent(new KeyboardEvent(...))` — i.e. through main.js's real listeners,
// which is the whole point. Nothing here reads a physics module directly.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].split('#')[0]));
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const out = [];
const say = (s) => { console.log(s); out.push(s); };
const DEG = 180 / Math.PI;
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const want = (n) => only.length === 0 || only.includes(String(n));

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.physics, null, { timeout: 120000 });
await page.waitForTimeout(2500);

say('== RENDER SIZE, verbatim from ctx.renderSize()');
say('  ' + JSON.stringify(await page.evaluate(() => window.__game.renderSize())));

// ---- the in-page rig -------------------------------------------------------------------------
await page.evaluate(() => {
  const g = window.__game;
  const R = {
    on: false, rec: false, t0: 0, samples: [], queue: [], wrecks: [], drainWrecks: false,
    sample() {
      const s = g.physics.state;
      g.car.shell.updateWorldMatrix(true, false);
      const m = g.car.shell.matrixWorld.elements;
      // The rig azimuth as an OBSERVABLE: the horizontal bearing from the camera to the car. That
      // is what the player sees, and unlike camera.js's private `camYaw` it cannot be read from a
      // constant. +PI because the bearing points camera -> car.
      const camAz = Math.atan2(g.camera.position.x - s.pos.x, g.camera.position.z - s.pos.z) + Math.PI;
      return {
        t: (performance.now() - R.t0) / 1000,
        yaw: s.yaw, drawnYaw: g.carRoot.rotation.y, camAz,
        slipAngle: s.slipAngle, slip: s.slip, yawRate: s.yawRate, drifting: !!s.drifting,
        speed: s.speed, vLat: s.vLat, ground: s.ground, accelG: s.accelG,
        boost: s.boost, boosting: !!s.boosting, impact: s.impact, lean: s.lean,
        x: s.pos.x, z: s.pos.z, steer: s.steer,
        roll: Math.atan2(m[4], m[5]), upTiltX: m[4], upTiltZ: m[6], upY: m[5],
        eventEarn: s.eventEarn,
      };
    },
    loop() {
      const now = performance.now();
      while (R.queue.length && R.queue[0].at <= now - R.t0) {
        const e = R.queue.shift();
        for (const k of (e.down || [])) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, bubbles: true }));
        for (const k of (e.up || [])) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true }));
      }
      // Drain the wreck queue every frame, which is exactly what the routed main.js one-liner will
      // do. Draining is the only way to see WHICH contact published a wreck; reading it once at the
      // end of a run cannot tell a 10 deg graze from the square hit that followed it.
      if (R.rec && R.drainWrecks && window.__game.physics.drainWreck) {
        const w = window.__game.physics.drainWreck();
        if (w) R.wrecks.push({ t: (performance.now() - R.t0) / 1000, speed: w.speed, severity: w.severity });
      }
      if (R.rec) R.samples.push(R.sample());
      requestAnimationFrame(R.loop);
    },
    install() { if (R.on) return; R.on = true; requestAnimationFrame(R.loop); },
    // `script` is [{at: ms, down: [codes], up: [codes]}], times relative to the call.
    run(script) {
      R.t0 = performance.now(); R.samples = []; R.wrecks = []; R.queue = script.slice().sort((a, b) => a.at - b.at);
      R.rec = true;
    },
    stop() {
      R.rec = false;
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft']) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true }));
      }
      return { samples: R.samples, wrecks: R.wrecks };
    },
  };
  window.__R = R; R.install();
});

/** Run a key timeline for `ms` and return every frame's sample. */
async function play(script, ms) {
  await page.evaluate((s) => window.__R.run(s), script);
  await page.waitForTimeout(ms + 60);
  const r = await page.evaluate(() => window.__R.stop());
  lastWrecks = r.wrecks;
  return r.samples;
}
/** Place the car on the highway at a speed, clean. Never at the origin: that is inside downtown. */
async function reset(kmh = 0, { path = 'highway', at = 0.12 } = {}) {
  await page.evaluate(([v, p, a]) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.placeOnPath(g.world.paths[p], a, v / 3.6);
    g.physics.state.impact = 0; g.physics.state.boost = 1;
    if (g.traffic && g.traffic.reset) g.traffic.reset(g.physics.state.pos);
  }, [kmh, path, at]);
  await page.waitForTimeout(220);
}
let lastWrecks = [];
const peakOf = (a, f) => a.reduce((m, x) => Math.max(m, Math.abs(f(x))), 0);
const touched = (a) => a.some((x) => x.impact > 0.001);
const ang = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const trace = (a, f, n = 6) => a.filter((_, i) => i % n === 0).map((x) => f(x)).join(' ');

// =============================================================================================
if (want(1)) {
  say('');
  say('== 1. SIGN INVARIANT (automatic FAIL if broken) + BODY ROLL, from world matrices');
  for (const [key, label, wantRight] of [['KeyD', 'D', true], ['KeyA', 'A', false]]) {
    await reset(140);
    const camRight = await page.evaluate(() => {
      const c = window.__game.camera; c.updateWorldMatrix(true, false);
      const m = c.matrixWorld.elements; return [m[0], m[1], m[2]];
    });
    const s = await play([{ at: 0, down: ['KeyW', key] }], 2500);
    const p0 = s[0], last = s[s.length - 1], mid = s[Math.floor(s.length / 2)];
    const proj = (last.x - p0.x) * camRight[0] + (last.z - p0.z) * camRight[2];
    // Horizontal part of the shell's world UP, dotted with the car's horizontal LEFT (from the
    // YAW, not from the shell, whose own x is what is tilting). In a right turn the outer flank is
    // the left one, so an outward bank makes this POSITIVE.
    const lx = Math.cos(mid.yaw), lz = -Math.sin(mid.yaw);
    const dot = mid.upTiltX * lx + mid.upTiltZ * lz;
    say(`  ${label}: displacement . screen-right ${proj.toFixed(1)} m -> went ${proj > 0 ? 'RIGHT' : 'LEFT'}`
      + ` ${(proj > 0) === wantRight ? 'PASS' : 'FAIL'}`);
    say(`     lean ${mid.lean.toFixed(3)}  up.carLeft ${dot.toFixed(5)} -> banks`
      + ` ${(dot > 0) === wantRight ? 'AWAY FROM the turn centre PASS' : 'INTO the corner FAIL'}`);
    say(`     body roll: mid ${(Math.abs(mid.roll) * DEG).toFixed(2)} deg, peak`
      + ` ${(peakOf(s, (x) => x.roll) * DEG).toFixed(2)} deg (round 1: 3.31 deg)`);
    await page.screenshot({ path: resolve(root, `../shots/s/hcr2-${key}.png`) });
  }
}

// =============================================================================================
// THE THREE ORDERINGS. Same entry every time, measured on the UNCLAMPED slipAngle. The hold metric
// is the first crossing below HALF THE ENTRY PEAK, which is round 1's metric, so the two rounds are
// comparable; I also print a fixed 10 deg bar, because a half-peak bar rewards a deeper entry (the
// property round 1's section 3 warns about) and I do not want the verdict resting on it.
if (want(2)) {
  say('');
  say('== 2. THE THREE ORDERINGS, real keys, UNCLAMPED slipAngle, entry = W+A+Space 0.9 s at 145 km/h');
  const run = async (tail, ms) => {
    await reset(145);
    const s = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] },
      { at: 900, up: ['KeyA', 'Space'] }, ...tail], 900 + ms);
    const entry = s.filter((x) => x.t <= 0.95);
    const peak = peakOf(entry, (x) => x.slipAngle);
    const post = s.filter((x) => x.t > 0.95);
    const half = (bar) => {
      let h = 0;
      for (const x of post) { if (Math.abs(x.slipAngle) > bar) h = x.t - post[0].t; else break; }
      return h;
    };
    return {
      peak, hold: half(peak * 0.5), hold10: half(10 / DEG), hit: touched(s), post,
      tr: trace(post, (x) => `${(x.slipAngle * DEG).toFixed(0)}`, 15),
      spd: `${(post[0].ground * 3.6).toFixed(0)}->${(post[post.length - 1].ground * 3.6).toFixed(0)} km/h`,
      dpct: 100 * post.filter((x) => x.drifting).length / post.length,
    };
  };
  const A = await run([], 4500);
  const B = await run([{ at: 950, down: ['KeyD'] }, { at: 1100, up: ['KeyD'] }], 4500);
  const C = await run([{ at: 950, down: ['KeyD'] }], 4500);
  say(`  entry peak ${(A.peak * DEG).toFixed(1)} / ${(B.peak * DEG).toFixed(1)} / ${(C.peak * DEG).toFixed(1)} deg`
    + ` (the three entries must match for the comparison to mean anything)`);
  for (const [n, r] of [['A centred        ', A], ['B 0.15 s tap ctr ', B], ['C HELD counter   ', C]]) {
    say(`  ${n} half-peak ${r.hold.toFixed(2)} s | >10 deg ${r.hold10.toFixed(2)} s | drifting ${r.dpct.toFixed(0)}%`
      + ` | ${r.spd} | contact ${r.hit}`);
    say(`      ${r.tr}`);
  }
  say(`  ORDERING 1, persists centred:  ${A.hold.toFixed(2)} s (round 1: 0.63 s; target >= 2.0 s)`);
  say(`  ORDERING 2, tap LENGTHENS:     ${B.hold.toFixed(2)} vs ${A.hold.toFixed(2)}`
    + ` ${B.hold > A.hold ? 'HIT' : 'MISS'}   [10 deg bar: ${B.hold10.toFixed(2)} vs ${A.hold10.toFixed(2)}`
    + ` ${B.hold10 > A.hold10 ? 'HIT' : 'MISS'}]`);
  say(`  ORDERING 3, held ENDS it:      ${C.hold.toFixed(2)} vs ${A.hold.toFixed(2)}`
    + ` ${C.hold < A.hold ? 'HIT' : 'MISS'}   [10 deg bar: ${C.hold10.toFixed(2)} vs ${A.hold10.toFixed(2)}`
    + ` ${C.hold10 < A.hold10 ? 'HIT' : 'MISS'}]`);
  // THE CHEAT CHECK ON ORDERING 2. driftFlick injects lateral velocity directly, and
  // state.ground = hypot(speed, vLat), so the tap can only lengthen the slide by making the car
  // FASTER over the ground out of nothing. Look for the step.
  const step = (r) => {
    let best = 0, at = 0;
    for (let i = 1; i < r.post.length; i++) {
      const d = r.post[i].ground - r.post[i - 1].ground;
      if (d > best) { best = d; at = r.post[i].t; }
    }
    return `+${(best * 3.6).toFixed(2)} km/h in one frame at t=${at.toFixed(2)} s`
      + `, peak accelG ${peakOf(r.post, (x) => x.accelG).toFixed(1)} m/s^2`;
  };
  say(`  free-energy check, biggest one-frame GROUND-SPEED gain after entry:`);
  say(`      centred ${step(A)}`);
  say(`      tap     ${step(B)}`);
  say(`      held    ${step(C)}`);
  await page.screenshot({ path: resolve(root, '../shots/s/hcr2-drift.png') });
}

// =============================================================================================
if (want(3)) {
  say('');
  say('== 3. CHAIN DRIFT: six beats of "tap brake, turn" through the real keys and the frozen 0.6 cap');
  for (const kmh of [130]) {
    await reset(kmh);
    const script = [{ at: 0, down: ['KeyW'] }];
    let t = 500;
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 === 0 ? 'KeyA' : 'KeyD', other = i % 2 === 0 ? 'KeyD' : 'KeyA';
      script.push({ at: t, up: ['KeyW', other], down: ['KeyS', dir] });
      script.push({ at: t + 200, up: ['KeyS'], down: ['KeyW'] });
      t += 1000;
    }
    script.push({ at: t, up: ['KeyA', 'KeyD'] });
    const s = await play(script, t + 800);
    say(`  ${kmh} km/h: peak slipAngle ${(peakOf(s, (x) => x.slipAngle) * DEG).toFixed(1)} deg`
      + ` (round 1: 6 deg) | drift-state samples ${(100 * s.filter((x) => x.drifting).length / s.length).toFixed(0)}%`
      + ` (round 1: 0%) | ${(s[0].ground * 3.6).toFixed(0)}->${(s[s.length - 1].ground * 3.6).toFixed(0)} km/h`
      + ` | contact ${touched(s)}`);
    say('   slip trace: ' + trace(s, (x) => `${(x.slipAngle * DEG).toFixed(0)}`, 10));
  }
}

// =============================================================================================
if (want(4)) {
  say('');
  say('== 4. ONE 200 ms BRAKE TAP after 0.5 s of load, at 100 / 130 / 150 km/h (brief target 2)');
  for (const kmh of [100, 130, 150]) {
    await reset(kmh);
    const s = await play([{ at: 0, down: ['KeyW', 'KeyA'] },
      { at: 500, up: ['KeyW'], down: ['KeyS'] },
      { at: 700, up: ['KeyS'], down: ['KeyW'] }], 3000);
    const post = s.filter((x) => x.t >= 0.5);
    const armed = post.some((x) => x.drifting);
    let armAt = 0, dur = 0;
    for (const x of post) { if (x.drifting) { if (!armAt) armAt = x.t; dur = x.t - armAt; } else if (armAt) break; }
    say(`  ${kmh} km/h: armed ${armed}${armed ? ` at t=${armAt.toFixed(2)} s, held ${dur.toFixed(2)} s (1.0 s beat)` : ''}`
      + ` | peak slip ${(peakOf(post, (x) => x.slipAngle) * DEG).toFixed(1)} deg | contact ${touched(s)}`);
    say('   ' + trace(post, (x) => `${(x.slipAngle * DEG).toFixed(0)}${x.drifting ? 'D' : ''}`, 10));
  }
}

// =============================================================================================
if (want(5)) {
  say('');
  say('== 5. THE E-BRAKE: monotone in hold time? never accelerates? does it ROTATE the car?');
  say('  (all figures are ground speed = hypot(speed, vLat), i.e. how fast the car is really going)');
  for (const kmh of [80, 130, 200, 250]) {
    const row = [];
    for (const hold of [1000, 2000, 3000]) {
      await reset(kmh);
      const s = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] }, { at: hold, up: ['Space', 'KeyA'] }],
        hold + 200);
      const inner = s.filter((x) => x.t <= hold / 1000);
      const v0 = inner[0].ground, v1 = inner[inner.length - 1].ground;
      row.push({
        hold: hold / 1000, pct: 100 * (v1 / v0 - 1), peak: peakOf(inner, (x) => x.slipAngle),
        yaw: peakOf(inner, (x) => x.yawRate), maxV: peakOf(inner, (x) => x.ground) / v0,
        hit: touched(s),
      });
    }
    // Reference rotation: the same speed, same steering key, NO e-brake.
    await reset(kmh);
    const plain = await play([{ at: 0, down: ['KeyW', 'KeyA'] }], 2000);
    const plainYaw = peakOf(plain, (x) => x.yawRate);
    const plainHead = Math.abs(ang(plain[plain.length - 1].yaw - plain[0].yaw));
    await reset(kmh);
    const eb = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] }], 2000);
    const ebHead = Math.abs(ang(eb[eb.length - 1].yaw - eb[0].yaw));
    say(`  ${kmh} km/h: ` + row.map((r) => `${r.hold}s ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(0)}%`).join(' | ')
      + `  monotone-down ${row[0].pct > row[1].pct && row[1].pct > row[2].pct ? 'YES' : 'NO'}`
      + `  ever faster than entry: ${row.some((r) => r.maxV > 1.005) ? 'YES (' + row.map((r) => r.maxV.toFixed(3)).join('/') + ')' : 'no'}`);
    say(`     slide depth ${row.map((r) => (r.peak * DEG).toFixed(0)).join('/')} deg`
      + ` | peak yaw ${row.map((r) => (r.yaw * DEG).toFixed(0)).join('/')} deg/s vs ${(plainYaw * DEG).toFixed(0)} without`
      + ` | heading in 2 s ${(ebHead * DEG).toFixed(0)} vs ${(plainHead * DEG).toFixed(0)} deg without`
      + ` | contact ${row.some((r) => r.hit)}`);
  }
}

// =============================================================================================
if (want(6)) {
  say('');
  say('== 6. IS THERE A GRIP EDGE? six seconds of held lock at 250 km/h (round 1: dead-flat 28-29 deg/s)');
  for (const [label, keys] of [['throttle held', ['KeyW', 'KeyA']], ['lift off', ['KeyA']]]) {
    await reset(250);
    const s = await play([{ at: 0, down: keys }], 6000);
    const late = s.filter((x) => x.t > 1);
    const yaws = late.map((x) => Math.abs(x.yawRate) * DEG);
    say(`  ${label}: yaw ${Math.min(...yaws).toFixed(0)}-${Math.max(...yaws).toFixed(0)} deg/s`
      + ` | peak slipAngle ${(peakOf(s, (x) => x.slipAngle) * DEG).toFixed(1)} deg`
      + ` | drifting ${(100 * s.filter((x) => x.drifting).length / s.length).toFixed(0)}%`
      + ` | ${(s[0].ground * 3.6).toFixed(0)}->${(s[s.length - 1].ground * 3.6).toFixed(0)} km/h | contact ${touched(s)}`);
    say('   yaw trace: ' + trace(late, (x) => (Math.abs(x.yawRate) * DEG).toFixed(0), 20));
  }
}

// =============================================================================================
if (want(7)) {
  say('');
  say('== 7. THE CHASE RIG. Does it rotate FURTHER than the car, as the user reported?');
  say('  Three bearings, all from the live page: the physics yaw, the DRAWN nose (carRoot.rotation.y,');
  say('  which is what the player actually sees) and the rig azimuth (camera->car bearing).');
  await reset(200);
  const s = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] }, { at: 1500, up: ['Space', 'KeyA'] }], 4000);
  const rows = s.filter((x) => Math.abs(x.slipAngle) > 0.08);
  let lead = 0, lagMax = 0, drawnLagMax = 0, bad = 0;
  for (const x of rows) {
    const vel = x.yaw - x.slipAngle;               // heading of the velocity vector
    const dRig = ang(x.camAz - x.yaw);             // rig relative to the physics heading
    const dVel = ang(vel - x.yaw);
    // "lags toward the velocity" = same side as the velocity, and no further round than it.
    if (Math.sign(dRig) !== Math.sign(dVel) && Math.abs(dRig) > 0.005) { lead++; bad++; }
    lagMax = Math.max(lagMax, Math.abs(dRig));
    drawnLagMax = Math.max(drawnLagMax, Math.abs(ang(x.camAz - x.drawnYaw)));
  }
  say(`  ${rows.length} samples with |slip| > 4.6 deg; peak slipAngle ${(peakOf(s, (x) => x.slipAngle) * DEG).toFixed(0)} deg`);
  say(`  rig LEADS the physics heading (wrong side) in ${lead} / ${rows.length} samples;`
    + ` max |rig - yaw| ${(lagMax * DEG).toFixed(1)} deg`);
  say(`  max |rig - DRAWN nose| ${(drawnLagMax * DEG).toFixed(1)} deg  <- this is the readable lag on screen,`
    + ` and main.js:320 already rotates the drawn nose ` + `into the slide by s.slip*0.22`);
  say('  sample (t, slipAngle, rig-yaw, rig-drawnNose), all deg:');
  for (const x of rows.filter((_, i) => i % 12 === 0)) {
    say(`    ${x.t.toFixed(2)}  slip ${(x.slipAngle * DEG).toFixed(1)}  rig-yaw ${(ang(x.camAz - x.yaw) * DEG).toFixed(1)}`
      + `  rig-drawn ${(ang(x.camAz - x.drawnYaw) * DEG).toFixed(1)}`);
  }
  say(`  ${bad === 0 ? 'ORDERING HOLDS: the rig never leads the car.' : 'ORDERING BROKEN in ' + bad + ' samples.'}`);
}

// =============================================================================================
if (want(8)) {
  say('');
  say('== 8. BOOST ECONOMY. (a) is there still a passive refill? (b) does an event actually pay?');
  await reset(250);
  await page.evaluate(() => { window.__game.physics.state.boost = 0; });
  const s = await play([{ at: 0, down: ['KeyW'] }], 20000);
  say(`  (a) 20 s of held W from an EMPTY bar at 250 km/h: bar ${s[0].boost.toFixed(4)} ->`
    + ` ${s[s.length - 1].boost.toFixed(4)} (round 1: a full bar in 28.6 s, so 20 s should have bought 0.70)`);
  // Also: a drift earn is legitimate and is the ONLY earn path in the shipped build, because the
  // main.js join is not made. Check it pays, and check it is the only thing that does.
  await reset(200);
  await page.evaluate(() => { window.__game.physics.state.boost = 0; });
  const d = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] }, { at: 2000, up: ['Space'] }], 4000);
  say(`  (a2) 4 s including a 2 s e-brake slide: bar 0.0000 -> ${d[d.length - 1].boost.toFixed(4)}`
    + ` (boostEarnDrift 0.10/s at full angle), drifting ${(100 * d.filter((x) => x.drifting).length / d.length).toFixed(0)}%`);
  // (b) The event stream, exercised through the published contract. main.js is frozen and the join
  // is not made, so the ONLY way to test physics.js's half is to attach the source myself, which is
  // exactly what the routed one-liner will do.
  const ev = await page.evaluate(() => {
    const g = window.__game, p = g.physics;
    if (typeof p.setEventSource !== 'function') return { ok: false };
    p.state.boost = 0;
    let n = 0; const fired = [];
    p.setEventSource(() => { if (n >= 20) return []; n++; fired.push(n); return [{ type: 'nearMiss', amount: 1, at: { x: 0, z: 0 } }]; });
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        if (n >= 20 || performance.now() - t0 > 3000) {
          const b = p.state.boost, e = p.state.eventEarn; p.setEventSource(null);
          res({ ok: true, n, boost: b, earn: e });
        } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  if (!ev.ok) say('  (b) setEventSource DOES NOT EXIST on the physics object. Contract not built.');
  else {
    say(`  (b) setEventSource exists. 20 nearMiss events at intensity 1.0 (boostPerNearMiss 0.060):`
      + ` bar 0.0000 -> ${ev.boost.toFixed(4)}, state.eventEarn ${ev.earn.toFixed(3)}`);
    const guard = await page.evaluate(() => {
      const p = window.__game.physics; p.state.boost = 0;
      // The defensive path the builder claims: a malformed payload must not throw inside the tick.
      p.setEventSource(() => [null, { type: 'takedown', amount: 3 }, { type: 'nearMiss' }, 'garbage', { type: 'check', amount: 0.5 }]);
      return new Promise((res) => setTimeout(() => { const b = p.state.boost; p.setEventSource(null); res(b); }, 400));
    });
    say(`  (b2) malformed payload (null, unknown type, missing amount, a string, a valid check):`
      + ` no throw, bar reached ${guard.toFixed(4)} (only the 'check' should pay)`);
    say(`  (b3) is the join made in the shipped build? `
      + await page.evaluate(() => (window.__game.traffic && typeof window.__game.traffic.drainEvents === 'function')
        ? 'traffic.drainEvents() EXISTS, but nothing calls physics.setEventSource() -> UNJOINED'
        : 'traffic.drainEvents() missing -> UNJOINED'));
  }
}

// =============================================================================================
if (want(9)) {
  say('');
  say('== 9. ONE WALL. Drive into a downtown facade at a shallow angle and at a square one.');
  const blocks = await page.evaluate(() => (window.__game.world.blocks || []).slice(0, 400)
    .map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d })));
  say(`  (${blocks.length} colliders in the live world)`);
  // ANGLE IS MEASURED FROM THE WALL FACE, NOT FROM ITS NORMAL, and saying so matters: round 1
  // recorded getting this exactly wrong ("a shallow YAW into a wall's front face is still a
  // near-square hit"). 20 deg from the face is a graze; 90 deg from the face is head-on. The
  // discriminator the code actually uses is the closing speed along the normal, so I print that too.
  for (const deg of [10, 20, 45, 90]) {
    const label = `${deg} deg from the face`;
    await page.evaluate(([a]) => {
      const g = window.__game, s = g.physics.state;
      const bs = (g.world.blocks || []);
      const b = bs.reduce((m, x) => (x.w * x.d > m.w * m.d ? x : m), bs[0]);
      const al = (90 - a) * Math.PI / 180;                  // angle off the +x axis (0 = head-on)
      const dx = Math.cos(al), dz = Math.sin(al);           // travel direction, world
      const stand = 90;
      g.physics.clearPath();
      g.physics.reset(new g.THREE.Vector3(b.cx - b.w / 2 - dx * stand, 0, b.cz - dz * stand),
        Math.atan2(dx, dz), 231 / 3.6);
      s.impact = 0;
    }, [deg]);
    await page.evaluate(() => { window.__R.drainWrecks = true; window.__game.physics.drainWreck(); });
    const s = await play([{ at: 0, down: ['KeyW'] }], 5000);
    const wr = lastWrecks;
    const iAt = s.findIndex((x) => x.impact > 0.001);
    if (iAt < 0) { say(`  ${label}: never reached a wall (approach geometry missed; ignore)`); continue; }
    const before = s[Math.max(0, iAt - 2)], after = s[Math.min(s.length - 1, iAt + 3)];
    const end = s[s.length - 1];
    const closing = before.ground * Math.cos((90 - deg) * Math.PI / 180);
    say(`  ${label}: normal closing speed ${closing.toFixed(1)} m/s (hitNormalSpeed is 34, grazeNormalSpeed 2.5`
      + ` -> severity ${Math.max(0, Math.min(1, (closing - 2.5) / 31.5)).toFixed(2)} predicted)`);
    say(`     ${(before.ground * 3.6).toFixed(0)} -> ${(after.ground * 3.6).toFixed(0)} km/h`
      + ` (${(100 * after.ground / before.ground).toFixed(0)}% kept, impact ${after.impact.toFixed(2)}),`
      + ` and ${(end.t - after.t).toFixed(1)} s later ${(end.ground * 3.6).toFixed(0)} km/h`);
    say(`     state.crashed ${await page.evaluate(() => !!window.__game.physics.state.crashed)};`
      + ` wrecks published (drained every frame, as the routed main.js join will): ${wr.length}`
      + (wr.length ? ` -> ` + wr.map((w) => `t=${w.t.toFixed(2)} sev=${w.severity.toFixed(2)}`).join(', ') : ''));
  }
}

// =============================================================================================
// THE CHAIN, THREE WAYS, PER BEAT. Section 3 above (alternate direction and tap on the same beat,
// which is what "tap brake, left, tap brake, right" says and what round 1 drove) gave 6.3 deg and
// 0% drifting - i.e. round 1's numbers, unchanged. The builder reports 15 deg and 21%. So the
// difference has to be in the manoeuvre, and this section finds out which beat the number came from.
if (want(10)) {
  say('');
  say('== 10. THE CHAIN, PER BEAT. Which beat does the builder\'s 15 deg / 21% actually come from?');
  const beats = (label, mk, pre) => ({ label, mk, pre });
  const shapes = [
    // (a) the builder's own manoeuvre: 0.6 s of load in the FIRST beat's direction, then
    //     [S+dir 200 ms, W+dir 800 ms] x 6 alternating.
    beats('builder: 0.6 s load then [tap 200, drive 800] x6', (i, t, dir, other) => ([
      { at: t, up: ['KeyW', other], down: ['KeyS', dir] },
      { at: t + 200, up: ['KeyS'], down: ['KeyW'] },
    ]), 600),
    // (b) the same, but every beat gets its own half second of load BEFORE the tap, which is what
    //     the brief's target actually specifies ("a 200 ms tap ... with a half second of load").
    beats('per-beat: [turn 500, tap 200, drive 300] x6', (i, t, dir, other) => ([
      { at: t, up: ['KeyW', other], down: ['KeyW', dir] },
      { at: t + 500, up: ['KeyW'], down: ['KeyS'] },
      { at: t + 700, up: ['KeyS'], down: ['KeyW'] },
    ]), 0),
  ];
  for (const sh of shapes) {
    await reset(130);
    const script = [{ at: 0, down: ['KeyW', 'KeyA'] }];
    let t = sh.pre;
    const marks = [];
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 === 0 ? 'KeyA' : 'KeyD', other = i % 2 === 0 ? 'KeyD' : 'KeyA';
      script.push(...sh.mk(i, t, dir, other));
      marks.push(t / 1000);
      t += 1000;
    }
    script.push({ at: t, up: ['KeyA', 'KeyD'] });
    const s = await play(script, t + 600);
    say(`  ${sh.label}`);
    say(`    WHOLE RUN: peak ${(peakOf(s, (x) => x.slipAngle) * DEG).toFixed(1)} deg |`
      + ` drifting ${(100 * s.filter((x) => x.drifting).length / s.length).toFixed(0)}% |`
      + ` ${(s[0].ground * 3.6).toFixed(0)}->${(s[s.length - 1].ground * 3.6).toFixed(0)} km/h | contact ${touched(s)}`);
    for (let i = 0; i < marks.length; i++) {
      const seg = s.filter((x) => x.t >= marks[i] && x.t < marks[i] + 1.0);
      if (!seg.length) continue;
      say(`    beat ${i + 1}: peak ${(peakOf(seg, (x) => x.slipAngle) * DEG).toFixed(1)} deg,`
        + ` drifting ${(100 * seg.filter((x) => x.drifting).length / seg.length).toFixed(0)}%`);
    }
  }
}

say('');
say('== CONSOLE / PAGE ERRORS ACROSS THE WHOLE SESSION');
say(`  ${errors.length === 0 ? 'NONE' : errors.join('\n  ')}`);

await mkdir(resolve(root, '../verdicts/wave-s'), { recursive: true });
await writeFile(resolve(root, '../verdicts/wave-s/handling-critic-r2-drive.txt'), out.join('\n') + '\n');
await browser.close();
server.close();
