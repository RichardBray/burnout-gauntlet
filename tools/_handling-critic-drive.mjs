// _handling-critic-drive.mjs — the wave-S handling critic DRIVES the game. Everything here is a
// property of the live page, not of an imported module: the sign checks are done by pressing the
// real keys through the real listeners in main.js and reading the real three.js world matrices.
//
// The sign verdict cannot be reached by algebra and this file is why. `lean` reaches car.js through
// `shell.rotation.z = -lean * 0.05`, and whether that raises the inner or the outer flank depends
// on the shell's local axes, its parent chain and the chase camera's handedness. So the test is:
// press D, get the shell's world UP vector and the car's world RIGHT vector, and ask which flank
// went up. Plus screenshots at the apex so a human can look.
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

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.physics, null, { timeout: 120000 });
await page.waitForTimeout(2500);

say('== RENDER SIZE (quoted verbatim from ctx.renderSize())');
say('  ' + JSON.stringify(await page.evaluate(() => window.__game.renderSize())));

/** Hold a set of KeyboardEvent codes for ms, then release, sampling state. */
async function drive(keys, ms, { sample = 100 } = {}) {
  await page.evaluate((ks) => {
    window.__critic = { samples: [] };
    for (const k of ks) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, bubbles: true }));
  }, keys);
  const t0 = Date.now();
  const samples = [];
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => {
      const g = window.__game, s = g.physics.state;
      g.car.shell.updateWorldMatrix(true, false);
      g.carRoot.updateWorldMatrix(true, false);
      const m = g.car.shell.matrixWorld.elements;
      // columns 0,1,2 of the world matrix are the shell's world X, Y, Z axes
      const up = [m[4], m[5], m[6]];
      const carX = [m[0], m[1], m[2]];       // shell local +x in world = the car's LEFT
      return {
        t: performance.now() / 1000, yaw: s.yaw, x: s.pos.x, z: s.pos.z,
        speed: s.speed, ground: s.ground, slip: s.slip, slipAngle: s.slipAngle,
        lean: s.lean, yawRate: s.yawRate, drifting: s.drifting, boost: s.boost,
        boosting: s.boosting, boostKick: s.boostKick, impact: s.impact,
        fov: g.camera.fov, camY: g.camera.position.y,
        camDist: Math.hypot(g.camera.position.x - s.pos.x, g.camera.position.z - s.pos.z),
        upY: up[1], upTiltX: up[0], upTiltZ: up[2], leftAxis: carX,
      };
    }));
    await page.waitForTimeout(sample);
  }
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true })); }, keys);
  return samples;
}
async function reset(kmh = 0) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(0, 0, 0), 0, v / 3.6);
    g.traffic.reset(g.physics.state.pos);
  }, kmh);
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------------------------
say('');
say('== 1. PRESS D. DOES THE CAR GO RIGHT? (the user\'s headline bug)');
{
  await reset(140);
  const s = await drive(['KeyW', 'KeyD'], 2500);
  const last = s[s.length - 1];
  // Screen-right at yaw 0: the chase camera looks along the car's forward (+z at yaw 0) with up
  // +y, so its local +x -- screen right -- is world -x. Verified below from the camera itself.
  const camRight = await page.evaluate(() => {
    const c = window.__game.camera; c.updateWorldMatrix(true, false);
    const m = c.matrixWorld.elements; return [m[0], m[1], m[2]];
  });
  say(`  camera world RIGHT vector: (${camRight.map((v) => v.toFixed(3)).join(', ')})`);
  say(`  after 2.5 s of W+D: yaw ${(last.yaw * 180 / Math.PI).toFixed(1)} deg, world x ${last.x.toFixed(1)} m,`
    + ` yawRate ${(last.yawRate * 180 / Math.PI).toFixed(1)} deg/s, speed ${(last.ground * 3.6).toFixed(0)} km/h`);
  const wentRight = last.x * camRight[0] > 0;   // displacement projected on screen-right
  say(`  displacement projected on screen-right = ${(last.x * camRight[0] + last.z * camRight[2]).toFixed(1)} m`
    + `  -> D steers ${wentRight ? 'RIGHT (correct)' : 'LEFT (WRONG)'}`);
  const mid = s[Math.floor(s.length / 2)];
  say(`  mid-turn lean ${mid.lean.toFixed(3)}; shell world up = (${mid.upTiltX.toFixed(4)},`
    + ` ${mid.upY.toFixed(4)}, ${mid.upTiltZ.toFixed(4)}); car LEFT axis =`
    + ` (${mid.leftAxis.map((v) => v.toFixed(3)).join(', ')})`);
  // Which flank went up? Dot the shell's world up with the car's world LEFT: positive means the
  // left flank is raised. In a RIGHT turn the outer flank is the LEFT one, so this must be > 0.
  const dot = mid.upTiltX * mid.leftAxis[0] + mid.upY * mid.leftAxis[1] + mid.upTiltZ * mid.leftAxis[2];
  say(`  up . carLeft = ${dot.toFixed(5)}  -> in a RIGHT turn the OUTER flank is the left one, so`
    + ` this must be POSITIVE for an outward bank: ${dot > 0 ? 'OUTWARD (correct)' : 'INWARD (WRONG)'}`);
  await page.screenshot({ path: resolve(root, '../shots/s/critic-turn-right.png') });
}

say('');
say('== 2. PRESS A. MIRROR CHECK');
{
  await reset(140);
  const s = await drive(['KeyW', 'KeyA'], 2500);
  const last = s[s.length - 1], mid = s[Math.floor(s.length / 2)];
  const dot = mid.upTiltX * mid.leftAxis[0] + mid.upY * mid.leftAxis[1] + mid.upTiltZ * mid.leftAxis[2];
  say(`  after 2.5 s of W+A: yaw ${(last.yaw * 180 / Math.PI).toFixed(1)} deg, world x ${last.x.toFixed(1)} m`);
  say(`  mid-turn lean ${mid.lean.toFixed(3)}, up . carLeft = ${dot.toFixed(5)}`
    + `  -> in a LEFT turn the outer flank is the RIGHT one, so this must be NEGATIVE:`
    + ` ${dot < 0 ? 'OUTWARD (correct)' : 'INWARD (WRONG)'}`);
  await page.screenshot({ path: resolve(root, '../shots/s/critic-turn-left.png') });
}

say('');
say('== 3. HOLD W FROM REST: how long to feel fast, and what is the ceiling in play?');
{
  await reset(0);
  const s = await drive(['KeyW'], 22000, { sample: 250 });
  const at = (sec) => s.find((x) => x.t - s[0].t >= sec) ?? s[s.length - 1];
  for (const sec of [2, 5, 10, 15, 20]) {
    const q = at(sec); say(`  t=${sec}s: ${(q.ground * 3.6).toFixed(0)} km/h, fov ${q.fov.toFixed(1)}, camDist ${q.camDist.toFixed(2)} m`);
  }
}

say('');
say('== 4. BOOST AS AN EVENT: hold W, wait for a full bar, hit Shift');
{
  await reset(200);
  await page.evaluate(() => { window.__game.physics.state.boost = 1; });
  const pre = await drive(['KeyW'], 800, { sample: 60 });
  const s = await drive(['KeyW', 'ShiftLeft'], 9500, { sample: 60 });
  const p0 = pre[pre.length - 1];
  say(`  before: ${(p0.ground * 3.6).toFixed(0)} km/h, fov ${p0.fov.toFixed(2)}, camDist ${p0.camDist.toFixed(2)} m, tank ${p0.boost.toFixed(2)}`);
  const dt = (x) => x.t - s[0].t;
  for (const sec of [0.1, 0.25, 0.5, 1, 2, 4, 8]) {
    const q = s.find((x) => dt(x) >= sec); if (!q) continue;
    say(`  +${sec}s: ${(q.ground * 3.6).toFixed(0)} km/h, fov ${q.fov.toFixed(2)} (${(q.fov - p0.fov >= 0 ? '+' : '')}${(q.fov - p0.fov).toFixed(2)}),`
      + ` camDist ${q.camDist.toFixed(2)} (${(q.camDist - p0.camDist).toFixed(2)}), kick ${q.boostKick.toFixed(2)},`
      + ` tank ${q.boost.toFixed(2)}, boosting ${q.boosting}`);
  }
  const peakFov = s.reduce((a, b) => (b.fov > a.fov ? b : a));
  say(`  peak fov ${peakFov.fov.toFixed(2)} (+${(peakFov.fov - p0.fov).toFixed(2)}) at +${dt(peakFov).toFixed(2)} s`);
}

say('');
say('== 5. E-BRAKE DRIFT at 130 km/h: enter, hold centred, countersteer');
{
  await reset(130);
  const a = await drive(['KeyW', 'KeyA', 'Space'], 900, { sample: 50 });
  const peak = a.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
  say(`  entry (W+A+Space 0.9 s): peak slipAngle ${(peak * 180 / Math.PI).toFixed(0)} deg,`
    + ` drifting ${a[a.length - 1].drifting}, speed ${(a[a.length - 1].ground * 3.6).toFixed(0)} km/h`);
  const b = await drive(['KeyW'], 1800, { sample: 50 });
  const t0 = b[0].t;
  say('  after release (W only): ' + b.filter((_, i) => i % 3 === 0)
    .map((x) => `${(x.t - t0).toFixed(1)}s:${(x.slipAngle * 180 / Math.PI).toFixed(0)}deg`).join(' '));
  await reset(130);
  await drive(['KeyW', 'KeyA', 'Space'], 900, { sample: 50 });
  const c = await drive(['KeyW', 'KeyD'], 1800, { sample: 50 });
  const t1 = c[0].t;
  say('  held opposite lock:     ' + c.filter((_, i) => i % 3 === 0)
    .map((x) => `${(x.t - t1).toFixed(1)}s:${(x.slipAngle * 180 / Math.PI).toFixed(0)}deg`).join(' '));
  await page.screenshot({ path: resolve(root, '../shots/s/critic-drift.png') });
}

say('');
say('== 6. E-BRAKE HELD AT 250 km/h (the builder calls this deliberate; I want to see it)');
{
  await reset(250);
  const s = await drive(['KeyW', 'KeyA', 'Space'], 3200, { sample: 80 });
  const peak = s.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
  const peakYaw = s.reduce((m, x) => Math.max(m, Math.abs(x.yawRate)), 0);
  say(`  peak slipAngle ${(peak * 180 / Math.PI).toFixed(0)} deg, peak yawRate ${(peakYaw * 180 / Math.PI).toFixed(0)} deg/s,`
    + ` speed ${(s[0].ground * 3.6).toFixed(0)} -> ${(s[s.length - 1].ground * 3.6).toFixed(0)} km/h`);
  const r = await drive(['KeyW', 'KeyD'], 3000, { sample: 100 });
  say(`  then W+D for 3 s: slipAngle ${(r[r.length - 1].slipAngle * 180 / Math.PI).toFixed(0)} deg,`
    + ` speed ${(r[r.length - 1].ground * 3.6).toFixed(0)} km/h -- recoverable: `
    + `${Math.abs(r[r.length - 1].slipAngle) * 180 / Math.PI < 12}`);
}

say('');
say('== 7. BRAKE TAP under load at 130 km/h (the competitive Paradise entry)');
{
  await reset(130);
  await drive(['KeyW', 'KeyA'], 900, { sample: 50 });
  const tap = await drive(['KeyS', 'KeyA'], 250, { sample: 40 });
  const after = await drive(['KeyW', 'KeyA'], 1500, { sample: 50 });
  const all = [...tap, ...after];
  const peak = all.reduce((m, x) => Math.max(m, Math.abs(x.slipAngle)), 0);
  say(`  peak slipAngle after the tap: ${(peak * 180 / Math.PI).toFixed(1)} deg,`
    + ` drift state reached: ${all.some((x) => x.drifting)}`);
  say('  trace: ' + all.filter((_, i) => i % 2 === 0).map((x) => `${(x.slipAngle * 180 / Math.PI).toFixed(0)}`).join(' '));
}

say('');
say('== 8. HUD / AUDIO SPEED under-read while drifting (the builder\'s routed finding 2)');
{
  await reset(200);
  const s = await drive(['KeyW', 'KeyA', 'Space'], 1500, { sample: 60 });
  const worst = s.reduce((a, b) => (Math.abs(b.ground - Math.abs(b.speed)) > Math.abs(a.ground - Math.abs(a.speed)) ? b : a));
  say(`  worst gap: ground ${(worst.ground * 3.6).toFixed(0)} km/h vs state.speed ${(Math.abs(worst.speed) * 3.6).toFixed(0)} km/h`
    + ` = ${(100 * (1 - Math.abs(worst.speed) / worst.ground)).toFixed(0)} % under-read at`
    + ` ${(worst.slipAngle * 180 / Math.PI).toFixed(0)} deg of slip`);
  const hud = await page.evaluate(() => {
    const el = document.querySelector('canvas'); void el;
    return window.__game.hud ? Object.keys(window.__game.hud) : null;
  });
  say(`  (hud keys: ${hud ? hud.slice(0, 8).join(',') : 'n/a'})`);
}

say('');
say('== 9. CONSOLE / PAGE ERRORS across the whole session');
say(`  ${errors.length === 0 ? 'NONE' : errors.join('\n  ')}`);

await mkdir(resolve(root, '../verdicts/wave-s'), { recursive: true });
await writeFile(resolve(root, '../verdicts/wave-s/handling-critic-drive.txt'), out.join('\n') + '\n');
await browser.close();
server.close();
