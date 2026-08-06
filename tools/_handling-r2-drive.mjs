// _handling-r2-drive.mjs — round-2 handling builder, IN THE LIVE PAGE, through the real key
// listeners in main.js. `lint ok` does not mean runnable (brief process rule 4) and a headless
// module import does not prove the game boots, so everything binding is re-checked here:
//   * zero console / page errors on the playable path,
//   * the SIGN INVARIANT: D turns right AND the body leans away from the turn centre, with the new
//     body-roll scale in car.js. This is the one thing in the file that is an automatic FAIL, and
//     the critic proved it cannot be settled by algebra - it needs the real world matrices,
//   * the three drift orderings, the chain-drift entry and the e-brake through real keys,
//   * the chase rig lagging the car's heading rather than leading it,
//   * setEventSource() wired to a fake emitter, since traffic.drainEvents() is a peer's file.
// The structure (local server, MIME table, KeyboardEvent dispatch, reset()) is lifted from
// tools/_handling-critic-drive.mjs, which is the best example in the repo of driving the real page.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const p = join(root, rel === '/' ? 'index.html' : rel);
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const out = []; const say = (s) => { console.log(s); out.push(s); };
const DEG = 180 / Math.PI;

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.physics, null, { timeout: 120000 });
await page.waitForTimeout(2500);

say('== RENDER SIZE, quoted verbatim from ctx.renderSize()');
say('  ' + JSON.stringify(await page.evaluate(() => window.__game.renderSize())));

async function drive(keys, ms, { sample = 60 } = {}) {
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, bubbles: true })); }, keys);
  const t0 = Date.now(); const samples = [];
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => {
      const g = window.__game, s = g.physics.state;
      g.car.shell.updateWorldMatrix(true, false);
      const m = g.car.shell.matrixWorld.elements;
      const camYaw = Math.atan2(g.camera.position.x - s.pos.x, g.camera.position.z - s.pos.z) + Math.PI;
      return {
        t: performance.now() / 1000, yaw: s.yaw, x: s.pos.x, z: s.pos.z,
        speed: s.speed, ground: s.ground, slip: s.slip, slipAngle: s.slipAngle, vLat: s.vLat,
        lean: s.lean, yawRate: s.yawRate, drifting: s.drifting, boost: s.boost, impact: s.impact,
        fov: g.camera.fov, camYaw,
        camDist: Math.hypot(g.camera.position.x - s.pos.x, g.camera.position.z - s.pos.z),
        upY: m[5], upTiltX: m[4], upTiltZ: m[6], leftAxis: [m[0], m[1], m[2]],
        roll: Math.atan2(m[4], m[5]),
      };
    }));
    await page.waitForTimeout(sample);
  }
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true })); }, keys);
  return samples;
}
// PLACE THE CAR ON THE HIGHWAY, not at the origin. Resetting to (0,0,0) - which is what the
// round-1 critic's driver does - drops the car among the downtown blocks, and a 145 km/h run of
// five seconds from there hits a facade: measured, the drift traces collapsed from 29 deg to 2 deg
// in one 0.3 s sample and the chain-drift run ended at 5 km/h. That is a contact, not a handling
// number, and it is exactly the kind of thing that gets reported as a physics result. Every run
// below therefore also reports whether it touched anything (`state.impact` going non-zero).
async function reset(kmh = 0) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.placeOnPath(g.world.paths.highway, 0.12, v / 3.6);
    g.physics.state.impact = 0;
    if (g.traffic && g.traffic.reset) g.traffic.reset(g.physics.state.pos);
  }, kmh);
  await page.waitForTimeout(200);
}
const touched = (arr) => arr.some((x) => x.impact > 0.001);
// WHICH FLANK WENT UP. Two traps here, both of which the round-1 critic fell into and recorded:
//   * dotting the shell's world UP with the shell's world X is identically zero - they are two
//     columns of the same rotation matrix. It carries no information and it reads as a clean 0.00000,
//     which is easy to mistake for a result. The question is which way the up vector TILTS, so the
//     test is the HORIZONTAL part of the shell's world up dotted with the car's horizontal LEFT.
//   * the car's LEFT must come from the yaw, not from the shell (whose local x is what is tilting).
// Ground truth: a car in a right-hand turn is thrown to its left, the left suspension compresses,
// the body rolls LEFT and its up vector tilts LEFT. So in a right turn this dot must be POSITIVE.
const dotUpLeft = (x) => {
  const lx = Math.cos(x.yaw), lz = -Math.sin(x.yaw);
  return x.upTiltX * lx + x.upTiltZ * lz;
};

// ---------------------------------------------------------------------------------------------
say('');
say('== 1. THE SIGN INVARIANT, with the new body-roll scale. Automatic FAIL if either half breaks.');
for (const [key, label] of [['KeyD', 'D (right)'], ['KeyA', 'A (left)']]) {
  await reset(140);
  const camRight = await page.evaluate(() => {
    const c = window.__game.camera; c.updateWorldMatrix(true, false);
    const m = c.matrixWorld.elements; return [m[0], m[1], m[2]];
  });
  const s = await drive(['KeyW', key], 2500, { sample: 100 });
  const last = s[s.length - 1], mid = s[Math.floor(s.length / 2)], p0 = s[0];
  // Displacement RELATIVE TO THE START, projected on screen-right AS IT WAS AT t=0. Both halves
  // matter: the car no longer starts at the origin (it is placed on the highway), and screen-right
  // rotates with the car, so it has to be sampled before the turn.
  const proj = (last.x - p0.x) * camRight[0] + (last.z - p0.z) * camRight[2];
  const dot = dotUpLeft(mid);
  const wantRight = key === 'KeyD';
  say(`  ${label}: displacement . screen-right = ${proj.toFixed(1)} m`
    + ` -> went ${proj > 0 ? 'RIGHT' : 'LEFT'} ${((proj > 0) === wantRight) ? 'PASS' : 'FAIL'}`);
  say(`    lean ${mid.lean.toFixed(3)}, shell world up (${mid.upTiltX.toFixed(4)}, ${mid.upY.toFixed(4)},`
    + ` ${mid.upTiltZ.toFixed(4)}) = ${(Math.abs(mid.roll) * DEG).toFixed(2)} deg of body roll`);
  say(`    up . carLeft = ${dot.toFixed(5)} -> rolls toward its ${dot > 0 ? 'LEFT' : 'RIGHT'},`
    + ` i.e. ${((dot > 0) === wantRight) ? 'AWAY FROM the turn centre PASS' : 'INTO the corner FAIL'}`);
  const peakRoll = s.reduce((m2, x) => Math.max(m2, Math.abs(x.roll)), 0);
  say(`    peak body roll over the turn: ${(peakRoll * DEG).toFixed(2)} deg (round 1 measured 3.31)`);
  await page.screenshot({ path: resolve(root, `../shots/s/r2-turn-${key}.png`) });
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 2. THE THREE DRIFT ORDERINGS, through the real keys, on the UNCLAMPED slipAngle');
{
  const trace = (arr) => arr.filter((_, i) => i % 4 === 0)
    .map((x) => `${(x.t - arr[0].t).toFixed(1)}s:${(x.slipAngle * DEG).toFixed(0)}`).join(' ');
  const run = async (after) => {
    await reset(145);
    const a = await drive(['KeyW', 'KeyA', 'Space'], 900, { sample: 50 });
    const peak = a.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
    const b = await drive(after.keys, after.ms, { sample: 50 });
    let tail = b;
    if (after.then) tail = tail.concat(await drive(after.then, 3500, { sample: 50 }));
    // FIRST crossing below half the entry angle (see the headless harness for why).
    let hold = 0;
    for (const x of tail) { if (Math.abs(x.slipAngle) > peak * 0.5) hold = x.t - tail[0].t; else break; }
    return { peak, hold, trace: trace(tail), hit: touched(a) || touched(tail) };
  };
  const centred = await run({ keys: ['KeyW'], ms: 4400 });
  say(`  entry peak ${(centred.peak * DEG).toFixed(0)} deg`);
  say(`  centred:            half-peak ${centred.hold.toFixed(2)} s | contact ${centred.hit} | ${centred.trace}`);
  const tap = await run({ keys: ['KeyW', 'KeyD'], ms: 150, then: ['KeyW'] });
  say(`  0.15 s tap counter: half-peak ${tap.hold.toFixed(2)} s | contact ${tap.hit} | ${tap.trace}`);
  const held = await run({ keys: ['KeyW', 'KeyD'], ms: 4400 });
  say(`  HELD counter:       half-peak ${held.hold.toFixed(2)} s | contact ${held.hit} | ${held.trace}`);
  say(`  ORDERING A persists centred: ${centred.hold.toFixed(2)} s`);
  say(`  ORDERING B tap lengthens:    ${tap.hold.toFixed(2)} > ${centred.hold.toFixed(2)} ${tap.hold > centred.hold ? 'HIT' : 'MISS'}`);
  say(`  ORDERING C held ends it:     ${held.hold.toFixed(2)} < ${centred.hold.toFixed(2)} ${held.hold < centred.hold ? 'HIT' : 'MISS'}`);
  await page.screenshot({ path: resolve(root, '../shots/s/r2-drift.png') });
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 3. CHAIN DRIFT: six beats of "tap brake, turn" at 130 km/h, real keys, real 0.6 brake cap');
{
  await reset(130);
  let all = [];
  all = all.concat(await drive(['KeyW', 'KeyA'], 600, { sample: 50 }));
  for (let i = 0; i < 6; i++) {
    const dir = i % 2 === 0 ? 'KeyA' : 'KeyD';
    all = all.concat(await drive(['KeyS', dir], 200, { sample: 40 }));
    all = all.concat(await drive(['KeyW', dir], 800, { sample: 40 }));
  }
  const peak = all.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
  const nD = all.filter((x) => x.drifting).length;
  say(`  peak slipAngle ${(peak * DEG).toFixed(1)} deg | ${(100 * nD / all.length).toFixed(0)}% of samples`
    + ` in the drift state | speed ${(all[0].ground * 3.6).toFixed(0)} -> ${(all[all.length - 1].ground * 3.6).toFixed(0)} km/h`
    + ` | contact ${touched(all)}`);
  say('  slipAngle: ' + all.filter((_, i) => i % 3 === 0).map((x) => (x.slipAngle * DEG).toFixed(0)).join(' '));
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 4. E-BRAKE HELD, the four speeds the critic measured');
for (const v of [80, 130, 200, 250]) {
  await reset(v);
  const s = await drive(['KeyW', 'KeyA', 'Space'], 3200, { sample: 80 });
  const peak = s.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
  const pkYaw = s.reduce((m, x) => Math.max(m, Math.abs(x.yawRate)), 0);
  const at = (sec) => s.find((x) => x.t - s[0].t >= sec) || s[s.length - 1];
  const g0 = s[0].ground;
  say(`  ${String(v).padStart(3)} km/h: ${[0.5, 1.0, 2.0, 3.1].map((sec) =>
    `${sec}s ${(100 * (at(sec).ground - g0) / g0).toFixed(0)}%`).join(' | ')}`
    + ` | peak slip ${(peak * DEG).toFixed(0)} deg, peak yaw ${(pkYaw * DEG).toFixed(0)} deg/s`
    + ` | contact ${touched(s)}`);
  const r = await drive(['KeyW', 'KeyD'], 2500, { sample: 100 });
  say(`     then W+D 2.5 s: slip ${(r[r.length - 1].slipAngle * DEG).toFixed(0)} deg,`
    + ` ${(r[r.length - 1].ground * 3.6).toFixed(0)} km/h - gathered: ${Math.abs(r[r.length - 1].slipAngle) * DEG < 12}`);
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 5. THE CHASE RIG: does it lag the car through a slide, or lead it?');
{
  await reset(145);
  await drive(['KeyW', 'KeyA', 'Space'], 900, { sample: 50 });
  const s = await drive(['KeyW'], 2000, { sample: 60 });
  let lead = 0, lag = 0, worst = 0;
  for (const x of s) {
    if (Math.abs(x.slipAngle) < 0.12) continue;
    let d = ((x.camYaw - x.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.sign(d) === Math.sign(x.slipAngle)) lead++; else lag++;
    worst = Math.max(worst, Math.abs(d));
  }
  say(`  samples where the rig LEADS the car (bad): ${lead}; where it LAGS toward the velocity: ${lag}`);
  say(`  max rig-to-nose offset during the slide: ${(worst * DEG).toFixed(1)} deg`);
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 6. setEventSource IN THE LIVE PAGE (traffic.drainEvents() is a peer file; join pending)');
{
  await reset(200);
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.physics;
    if (typeof p.setEventSource !== 'function') return { ok: false };
    p.state.boost = 0;
    let n = 0;
    p.setEventSource(() => { n++; return n <= 20 ? [{ type: 'nearMiss', amount: 1, at: { x: 0, z: 0 } }] : []; });
    return { ok: true, before: p.state.boost };
  });
  if (!r.ok) say('  setEventSource ABSENT in the live page');
  else {
    await drive(['KeyW'], 1200, { sample: 100 });
    const after = await page.evaluate(() => {
      const p = window.__game.physics;
      const b = p.state.boost, e = p.state.eventEarn;
      p.setEventSource(null);
      return { b, e, wreck: p.drainWreck() };
    });
    say(`  20 nearMiss events at intensity 1.0 fed through the live tick: bar ${r.before.toFixed(2)}`
      + ` -> ${after.b.toFixed(3)} (expected 20 x 0.060 = 1.00, capped at 1), eventEarn pulse ${after.e.toFixed(2)}`);
    say(`  drainWreck() with no contact: ${JSON.stringify(after.wreck)}`);
  }
  // and with NO source attached, which is how it ships until the main.js join lands
  const passive = await page.evaluate(() => { window.__game.physics.state.boost = 0; return true; }) && await (async () => {
    await drive(['KeyW'], 6000, { sample: 500 });
    return page.evaluate(() => window.__game.physics.state.boost);
  })();
  say(`  no event source, 6 s of holding W from an empty bar: ${(passive * 100).toFixed(1)}%`
    + ` (round 1 filled a whole bar in 28.6 s of this)`);
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 7. FRAME TIME — SMOKE TEST ONLY. Two peer builders are running; this is not a result.');
{
  await page.evaluate(() => { window.__game.physics.followPath && 0; window.__frameStats.reset(); });
  await drive(['KeyW'], 6000, { sample: 500 });
  const st = await page.evaluate(() => window.__frameStats.stats());
  say(`  SMOKE TEST (concurrent peers on this machine, NOT a measurement):`
    + ` n ${st.n}, p50 ${st.p50.toFixed(1)} ms, p90 ${st.p90.toFixed(1)}, p99 ${st.p99.toFixed(1)},`
    + ` over16.7 ${st.over16_7pct.toFixed(0)}% (frameStats reports this already as a percentage),`
    + ` render ${st.renderW}x${st.renderH} @ ratio ${st.pixelRatio} (dpr ${st.devicePixelRatio})`);
}

say('');
say(errors.length ? `== CONSOLE / PAGE ERRORS: ${errors.length}\n  ` + errors.slice(0, 20).join('\n  ')
  : '== CONSOLE / PAGE ERRORS: NONE across the whole session');
await writeFile(resolve(root, '../verdicts/wave-s/handling-r2-drive.txt'), out.join('\n') + '\n');
await browser.close();
server.close();
