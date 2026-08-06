// _hr3c-live.mjs - the ROUND-3 CRITIC's LIVE probe. Drives the real page through main.js's own key
// listeners (window.dispatchEvent(new KeyboardEvent(...))), samples in an in-page rAF loop so a
// 0.2 s tap is really 0.2 s and a one-substep event is visible.
//
// The in-page rig design (rAF sampler + key timeline) is the ROUND-2 CRITIC's, from
// tools/_hcr2-drive.mjs. Credit where it is due; re-inventing it would only add a different
// sampler's artefacts. What is mine is every manoeuvre and every metric below.
//
// THE HEADING IS SIGNED. main.js maps LEFT to steer +1, so `KeyD` is steer -1 and a correct
// right-hand turn is a NEGATIVE yaw; WANT = -1 folds that in. An UNSIGNED heading scores a car
// spinning away from the corner as a car turning into it, which is how an inverted response survived
// a builder round, a critic round and a verify pass.
//
// Sections: 1 signed turn-in (brake+lock vs throttle+lock), 2 the boost join with the road EMPTIED,
// 3 the wreck join, 4 the drawn nose vs the physics heading.
// NO FRAME TIME. Usage: node tools/_hr3c-live.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const out = []; const say = (s) => { console.log(s); out.push(s); };
const DEG = 180 / Math.PI;

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

await page.evaluate(() => {
  const R = {
    on: false, rec: false, t0: 0, samples: [], queue: [],
    sample() {
      const s = window.__game.physics.state;
      const cr = window.__game.carRoot;
      const drawn = cr ? cr.rotation.y : NaN;
      return { t: (performance.now() - R.t0) / 1000, yaw: s.yaw, yawRate: s.yawRate,
        slipAngle: s.slipAngle, slip: s.slip, drifting: !!s.drifting, ground: s.ground,
        boost: s.boost, impact: s.impact, crashed: !!s.crashed, drawn,
        px: s.pos.x, pz: s.pos.z, crashActive: !!(window.__game.crash && window.__game.crash.active) };
    },
    loop() {
      const now = performance.now();
      while (R.queue.length && R.queue[0].at <= now - R.t0) {
        const e = R.queue.shift();
        for (const k of (e.down || [])) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, bubbles: true }));
        for (const k of (e.up || [])) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true }));
      }
      if (R.rec) R.samples.push(R.sample());
      requestAnimationFrame(R.loop);
    },
    install() { if (R.on) return; R.on = true; requestAnimationFrame(R.loop); },
    run(script) { R.t0 = performance.now(); R.samples = []; R.queue = script.slice().sort((a, b) => a.at - b.at); R.rec = true; },
    stop() {
      R.rec = false;
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true }));
      return R.samples;
    },
  };
  window.__R = R; R.install();
});
async function play(script, ms) {
  await page.evaluate((s) => window.__R.run(s), script);
  await page.waitForTimeout(ms + 60);
  return page.evaluate(() => window.__R.stop());
}
async function reset(kmh, boost = 1) {
  await page.evaluate(({ v, b }) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.placeOnPath(g.world.paths.highway, 0.12, v / 3.6);
    g.physics.state.impact = 0; g.physics.state.boost = b;
    g.physics.drainWreck();
    if (g.crash && g.crash.reset) g.crash.reset();
    if (g.traffic && g.traffic.reset) g.traffic.reset(g.physics.state.pos);
  }, { v: kmh, b: boost });
  await page.waitForTimeout(220);
}
const WANT = -1;   // every script presses KeyD; main.js maps right to steer -1
const ang = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

const ONLY = process.argv.slice(2);
const sec = (n) => ONLY.length === 0 || ONLY.includes(String(n));

// ================================================================================================
// 1. SIGNED TURN-IN. From dead straight, brake+lock against throttle+lock. Asking for rotation must
//    not give you less of it, and it must never give you rotation the WRONG WAY.
say('');
say('== 1. TURN-IN FROM DEAD STRAIGHT, LIVE, SIGNED (+ = the direction the driver asked for)');
if (sec(1)) for (const kmh of [100, 130, 200, 250]) {
  for (const [label, keys] of [['W+D (throttle+lock)', ['KeyW', 'KeyD']], ['S+D (brake+lock)   ', ['KeyS', 'KeyD']]]) {
    for (const win of [400, 800]) {
      await reset(kmh);
      const s = await play([{ at: 0, down: keys }, { at: win, up: ['KeyW', 'KeyD', 'KeyS'] }], win);
      const a = s[0], end = s[s.length - 1];
      const swept = WANT * ang(end.yaw - a.yaw) * DEG;
      const pkYaw = s.reduce((m, x) => Math.max(m, WANT * x.yawRate), -1e9) * DEG;
      const wrong = s.reduce((m, x) => Math.min(m, WANT * x.yawRate), 0) * DEG;
      const pkSlip = s.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0) * DEG;
      const dPct = 100 * s.filter((x) => x.drifting).length / Math.max(1, s.length);
      say(`  ${kmh} km/h ${label} ${win} ms: heading ${swept >= 0 ? '+' : ''}${swept.toFixed(1)} deg`
        + ` | peak yaw ${pkYaw.toFixed(0)} deg/s | worst WRONG-WAY yaw ${wrong.toFixed(0)} deg/s`
        + ` | peak |slip| ${pkSlip.toFixed(1)} deg | drift state ${dPct.toFixed(0)}%`
        + ` | ${(a.ground * 3.6).toFixed(0)}->${(end.ground * 3.6).toFixed(0)} km/h | contact ${s.some((x) => x.impact > 0.001)}`);
    }
  }
}

// ================================================================================================
// 2. THE BOOST JOIN. Two questions, and the SECOND is the one that matters:
//    (a) does an event stream actually reach the bar in the shipped build (join made)?
//    (b) with the road EMPTIED so no event can be emitted, does the bar still fill? If it does,
//        boost is on a timer or an odometer after all.
say('');
say('== 2. THE BOOST JOIN: physics.setEventSource(() => traffic.drainEvents())');
if (sec(2)) {
  // (a) is the source installed at all? Wrap traffic.drainEvents and see if the game calls it.
  const seen = await page.evaluate(async () => {
    const g = window.__game;
    let calls = 0, evs = 0; const kinds = {};
    const inner = g.traffic.drainEvents.bind(g.traffic);
    g.traffic.drainEvents = () => { calls++; const a = inner(); for (const e of a) { evs++; kinds[e.type] = (kinds[e.type] || 0) + 1; } return a; };
    await new Promise((r) => setTimeout(r, 1500));
    g.traffic.drainEvents = inner;
    return { calls, evs, kinds };
  });
  say(`  (a) the game calls traffic.drainEvents() ${seen.calls} times in 1.5 s -> the join IS made`
    + ` | events seen ${seen.evs} ${JSON.stringify(seen.kinds)}`);

  // (b) a kilometre of held throttle with the road EMPTIED. POOL 0 = nothing to near-miss.
  for (const [label, pool] of [['road EMPTIED (setPool 0)', 0], ['normal traffic (setPool 30)', 30],
    ['road EMPTIED again      ', 0]]) {
    await reset(250, 0);
    const r = await page.evaluate(async (p) => {
      const g = window.__game, ph = g.physics;
      if (g.traffic.setPool) g.traffic.setPool(p);
      g.traffic.reset(ph.state.pos);
      await new Promise((r2) => setTimeout(r2, 600));
      // count what the join actually feeds physics, without consuming it
      let nEv = 0; const kinds = {};
      const inner = g.traffic.drainEvents.bind(g.traffic);
      g.traffic.drainEvents = () => { const a = inner(); for (const e of a) { nEv++; kinds[e.type] = (kinds[e.type] || 0) + 1; } return a; };
      ph.state.boost = 0;
      const p0 = { x: ph.state.pos.x, z: ph.state.pos.z };
      const b0 = ph.state.boost;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      let dist = 0, last = { ...p0 }, drift = 0, n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 30000 && dist < 1000) {
        await new Promise((r2) => requestAnimationFrame(r2));
        const q = ph.state.pos;
        dist += Math.hypot(q.x - last.x, q.z - last.z); last = { x: q.x, z: q.z };
        if (ph.state.drifting) drift++; n++;
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
      g.traffic.drainEvents = inner;
      return { b0, b1: ph.state.boost, dist, secs: (performance.now() - t0) / 1000,
        driftPct: 100 * drift / Math.max(1, n), nEv, kinds, pool: g.traffic.POOL };
    }, pool);
    say(`  (b) ${label}: ${r.dist.toFixed(0)} m of held W in ${r.secs.toFixed(1)} s`
      + ` -> bar ${r.b0.toFixed(4)} -> ${r.b1.toFixed(4)} | traffic events fed to physics ${r.nEv}`
      + ` ${JSON.stringify(r.kinds)} | POOL ${r.pool} | samples drifting ${r.driftPct.toFixed(0)}%`);
  }
  await page.evaluate(() => { const g = window.__game; if (g.traffic.setPool) g.traffic.setPool(30); });
}

// ================================================================================================
// 3. THE WRECK JOIN. physics.drainWreck() -> crash.trigger(). Drive square into a downtown facade
//    and ask whether crash.js's state machine actually runs: crash.active, and state.crashed, which
//    STATE.md says crash.js:2340 owns and physics.js never asserts.
say('');
say('== 3. THE WRECK JOIN: physics.drainWreck() -> crash.trigger()');
if (sec(3)) {
  const blocks = await page.evaluate(() => (window.__game.world.blocks || []).length);
  say(`  (${blocks} colliders in the live world)`);
  for (const deg of [0, 45]) {
    const r = await page.evaluate(async (d) => {
      const g = window.__game, ph = g.physics;
      // find the nearest collider ahead and aim at its centre
      // Same target the round-2 critic used: the biggest facade in world.blocks, approached from
      // 90 m out along a bearing `d` degrees off square to its west face.
      const bs = g.world.blocks || [];
      if (!bs.length) return { err: 'no colliders' };
      const b = bs.reduce((m, x) => (x.w * x.d > m.w * m.d ? x : m), bs[0]);
      const al = (90 - (90 - d)) * Math.PI / 180;
      const dx = Math.cos(al), dz = Math.sin(al);
      ph.clearPath();
      ph.reset(new g.THREE.Vector3(b.cx - b.w / 2 - dx * 90, 0, b.cz - dz * 90), Math.atan2(dx, dz), 250 / 3.6);
      ph.state.impact = 0;
      const bd = 90;
      ph.drainWreck(); if (g.crash && g.crash.reset) g.crash.reset();
      let sawWreck = 0, sawActive = false, sawCrashed = false, sawImpact = 0;
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      while (performance.now() - t0 < 6000) {
        await new Promise((r2) => requestAnimationFrame(r2));
        if (g.crash && g.crash.active) sawActive = true;
        if (ph.state.crashed) sawCrashed = true;
        sawImpact = Math.max(sawImpact, ph.state.impact || 0);
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
      return { dist: bd, sawWreck, sawActive, sawCrashed, sawImpact,
        crashTime: g.crash ? g.crash.time : null };
    }, deg);
    say(`  ${deg} deg off the bearing to the nearest facade, 250 km/h, throttle held:`
      + ` peak impact ${(r.sawImpact ?? 0).toFixed(2)} | crash.active reached ${r.sawActive}`
      + ` | state.crashed reached ${r.sawCrashed} | ${r.err || ''}`);
  }
  // the negative control: no contact, so the join must NOT fire
  await reset(200);
  const clean = await page.evaluate(async () => {
    const g = window.__game;
    g.crash.reset(); g.physics.drainWreck();
    let active = false;
    const t0 = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    while (performance.now() - t0 < 5000) { await new Promise((r) => requestAnimationFrame(r)); if (g.crash.active) active = true; }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    return { active, crashed: !!g.physics.state.crashed, impact: g.physics.state.impact };
  });
  say(`  NEGATIVE CONTROL, 5 s of clean highway: crash.active ${clean.active} | state.crashed ${clean.crashed}`);
}

// ================================================================================================
// 4. THE DRAWN NOSE. carRoot.rotation.y must EQUAL s.yaw now (the `- s.slip * 0.22` term is gone).
//    Measured through a deep slide, which is where the old term was worth the most and had the
//    wrong sign.
say('');
say('== 4. carRoot.rotation.y vs s.yaw through a deep e-brake slide');
if (sec(4)) {
  await reset(145);
  const s = await play([{ at: 0, down: ['KeyW', 'KeyA', 'Space'] }, { at: 900, up: ['KeyA', 'Space'] },
    { at: 3500, up: ['KeyW'] }], 3500);
  let worst = 0, worstSlip = 0, pkSlip = 0;
  for (const x of s) {
    if (!Number.isFinite(x.drawn)) continue;
    const d = Math.abs(ang(x.drawn - x.yaw)) * DEG;
    if (d > worst) { worst = d; worstSlip = Math.abs(x.slipAngle) * DEG; }
    pkSlip = Math.max(pkSlip, Math.abs(x.slipAngle) * DEG);
  }
  const predicted = pkSlip;   // what `- s.slip * 0.22` would have cost at the peak, in deg
  say(`  ${s.length} samples, peak |slipAngle| ${pkSlip.toFixed(1)} deg`);
  say(`  max |carRoot.rotation.y - s.yaw| = ${worst.toFixed(4)} deg (at ${worstSlip.toFixed(1)} deg of slip)`);
  say(`  for scale: the removed term -s.slip*0.22 was worth ${(0.22 * Math.min(1, predicted / 25.8) * DEG).toFixed(1)}`
    + ` deg at this peak if state.slip had reached |1| (slipRef 0.45 rad = 25.8 deg)`);
}

say('');
say('== CONSOLE / PAGE ERRORS ACROSS THE WHOLE SESSION');
say(`  ${errors.length === 0 ? 'NONE' : errors.join('\n  ')}`);
await writeFile(resolve(root, '..', 'verdicts', 'wave-s', 'handling-r3-critic-live' + (ONLY.length ? '-' + ONLY.join('') : '') + '.txt'), out.join('\n') + '\n');
await browser.close(); server.close();
