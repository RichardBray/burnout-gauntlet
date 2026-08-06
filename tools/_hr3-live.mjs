// _hr3-live.mjs - round 3's LIVE probe, through main.js's own key listeners.
//
// It is tools/_hr2v-live.mjs (the verify pass's file) with ONE substantive change and it is the reason
// round 3 found a defect two previous passes missed: THE HEADING IS SIGNED against the direction the
// driver asked for -- and note the sign: main.js maps LEFT to steer +1, so the `KeyD` these scripts
// press is steer -1 and a correct right-hand turn is a NEGATIVE yaw. `WANT = -1` folds that in, so every
// heading and yaw rate printed below is already expressed in the direction the driver asked for.
// The verify pass measured `Math.abs(ang(end.yaw - win0.yaw))`, which scores a car
// spinning AWAY from the corner as a car turning into it, and at 200-250 km/h the pre-round-3 file was
// doing exactly that on brake plus lock. `wrongWay` is the worst yaw rate against the request.
//
// The in-page rig (an rAF sampler plus a key timeline, keys dispatched as real KeyboardEvents through
// main.js's own listeners) is the round-2 critic's design from tools/_hcr2-drive.mjs, reduced to the
// two manoeuvres I need. Credit where it is due: that file is the right way to drive this page and
// re-inventing it would only have introduced a different sampler's artefacts.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
      return { t: (performance.now() - R.t0) / 1000, yaw: s.yaw, yawRate: s.yawRate,
        slipAngle: s.slipAngle, drifting: !!s.drifting, ground: s.ground, steer: s.steer,
        impact: s.impact };
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
async function reset(kmh) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.placeOnPath(g.world.paths.highway, 0.12, v / 3.6);
    g.physics.state.impact = 0; g.physics.state.boost = 1;
    if (g.traffic && g.traffic.reset) g.traffic.reset(g.physics.state.pos);
  }, kmh);
  await page.waitForTimeout(220);
}
const WANT = -1;   // every script below presses KeyD, and main.js maps right to steer -1
const ang = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

// ===============================================================================================
// THE TRAIL BRAKE. Load the car for 0.5 s with W+D, then either keep W+D or add S, and measure how
// much HEADING the next 0.4 s and 0.8 s buy. A brake that costs heading is a dead zone the player
// feels at the entry of every corner they brake into.
say('');
say('== TRAIL BRAKE, live, real keys: heading swept in the window AFTER 0.5 s of W+D load');
for (const kmh of [100, 130, 200, 250]) {
  for (const [label, extra] of [['W+D held      ', []], ['W+D then S+D  ', ['KeyS']]]) {
    for (const win of [400, 800]) {
      await reset(kmh);
      const script = [{ at: 0, down: ['KeyW', 'KeyD'] }];
      if (extra.length) script.push({ at: 500, down: extra, up: ['KeyW'] });
      script.push({ at: 500 + win, up: ['KeyW', 'KeyD', 'KeyS'] });
      const s = await play(script, 500 + win);
      const win0 = s.find((x) => x.t >= 0.5) || s[0];
      const end = s[s.length - 1];
      const inWin = s.filter((x) => x.t >= 0.5);
      const swept = WANT * ang(end.yaw - win0.yaw) * DEG;
      const pkYaw = inWin.reduce((m, x) => Math.max(m, WANT * x.yawRate), 0) * DEG;
      const wrongWay = inWin.reduce((m, x) => Math.min(m, WANT * x.yawRate), 0) * DEG;
      const pkSlip = inWin.reduce((m, x) => Math.max(m, WANT * x.slipAngle), 0) * DEG;
      const dPct = 100 * inWin.filter((x) => x.drifting).length / Math.max(1, inWin.length);
      say(`  ${kmh} km/h ${label} +${win} ms: heading ${swept.toFixed(1)} deg | peak yaw ${pkYaw.toFixed(0)} deg/s`
        + ` | worst WRONG-WAY yaw ${wrongWay.toFixed(0)} | peak slip ${pkSlip.toFixed(1)} deg | drift state ${dPct.toFixed(0)}%`
        + ` | ${(win0.ground * 3.6).toFixed(0)}->${(end.ground * 3.6).toFixed(0)} km/h`
        + ` | contact ${s.some((x) => x.impact > 0.001)}`);
    }
  }
}

// ===============================================================================================
// THE SAME QUESTION FROM DEAD STRAIGHT, which is where the headless probe found a dead zone: the
// brake and the lock arriving on the SAME frame, with no load and no slip to inherit.
say('');
say('== TURN-IN FROM DEAD STRAIGHT, live: brake and lock pressed together vs throttle and lock');
for (const kmh of [100, 130, 200, 250]) {
  for (const [label, keys] of [['W+D    ', ['KeyW', 'KeyD']], ['S+D    ', ['KeyS', 'KeyD']]]) {
    for (const win of [400, 800]) {
      await reset(kmh);
      const s = await play([{ at: 0, down: keys }, { at: win, up: ['KeyW', 'KeyD', 'KeyS'] }], win);
      const a = s[0], end = s[s.length - 1];
      const swept = WANT * ang(end.yaw - a.yaw) * DEG;
      const pkYaw = s.reduce((m, x) => Math.max(m, WANT * x.yawRate), 0) * DEG;
      const wrongWay = s.reduce((m, x) => Math.min(m, WANT * x.yawRate), 0) * DEG;
      const pkSlip = s.reduce((m, x) => Math.max(m, WANT * x.slipAngle), 0) * DEG;
      const dPct = 100 * s.filter((x) => x.drifting).length / Math.max(1, s.length);
      say(`  ${kmh} km/h ${label} ${win} ms: heading ${swept.toFixed(1)} deg | peak yaw ${pkYaw.toFixed(0)} deg/s`
        + ` | worst WRONG-WAY yaw ${wrongWay.toFixed(0)} | peak slip ${pkSlip.toFixed(1)} deg | drift state ${dPct.toFixed(0)}%`
        + ` | ${(a.ground * 3.6).toFixed(0)}->${(end.ground * 3.6).toFixed(0)} km/h`
        + ` | contact ${s.some((x) => x.impact > 0.001)}`);
    }
  }
}

say('');
say('== CONSOLE / PAGE ERRORS');
say(`  ${errors.length === 0 ? 'NONE' : errors.join('\n  ')}`);
await writeFile(resolve(root, '..', 'verdicts', 'wave-s', 'handling-r3-live.txt'), out.join('\n') + '\n');
await browser.close(); server.close();
