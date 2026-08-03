// _handling-critic-sign.mjs — the steering/lean SIGN verdict, done correctly.
//
// Two reductions in my first live pass were wrong and I am replacing them rather than reporting
// them:
//   * I projected the total displacement onto the camera's basis AT THE END of a 90 deg turn. The
//     screen-right direction has to be sampled BEFORE the turn starts, because it rotates with the
//     car. Fixed by taking the camera basis at t=0 and turning for only 1.0 s.
//   * I dotted the shell's world UP with the shell's world X. Those are two columns of the same
//     rotation matrix, so the dot product is identically zero and the test carried no information.
//     The real question is which way the up vector TILTS, so the test is the HORIZONTAL component
//     of the shell's world up, dotted with the car's horizontal LEFT direction.
//
// Physical ground truth for that second test: a car in a right-hand turn is thrown to its left,
// the left (outer) suspension compresses and the body rolls to the LEFT, which tilts the body's up
// vector to the LEFT. A motorcycle does the opposite. So in a RIGHT turn (D) the up vector must
// tilt toward the car's LEFT, i.e. the dot must be POSITIVE; in a LEFT turn (A), NEGATIVE.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const p = join(root, rel === '/' ? 'index.html' : rel);
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const out = []; const say = (s) => { console.log(s); out.push(s); };

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.physics, null, { timeout: 120000 });
await page.waitForTimeout(2500);

const probe = () => page.evaluate(() => {
  const g = window.__game, s = g.physics.state;
  g.car.shell.updateWorldMatrix(true, false);
  g.camera.updateWorldMatrix(true, false);
  const sm = g.car.shell.matrixWorld.elements, cm = g.camera.matrixWorld.elements;
  const up = [sm[4], sm[5], sm[6]];
  // The car's horizontal LEFT, from the physics yaw alone (uncontaminated by the body roll):
  // leftward(yaw) = (cos yaw, 0, -sin yaw), physics.js:383.
  const left = [Math.cos(s.yaw), 0, -Math.sin(s.yaw)];
  const upTilt = [up[0], 0, up[2]];
  const mag = Math.hypot(upTilt[0], upTilt[2]);
  return {
    yaw: s.yaw, x: s.pos.x, z: s.pos.z, lean: s.lean, ground: s.ground,
    camRight: [cm[0], cm[1], cm[2]],
    upTilt, tiltMag: mag, upDotLeft: upTilt[0] * left[0] + upTilt[2] * left[2],
    upY: up[1],
  };
});
async function reset(kmh) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.physics.clearPath();
    g.physics.reset(new g.THREE.Vector3(0, 0, 0), 0, v / 3.6);
    g.traffic.reset(g.physics.state.pos);
  }, kmh);
  await page.waitForTimeout(300);
}
async function hold(keys, ms) {
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); }, keys);
  await page.waitForTimeout(ms);
  const s = await probe();
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keyup', { code: k })); }, keys);
  return s;
}

for (const [label, key, wantRight] of [['D (right)', 'KeyD', true], ['A (left)', 'KeyA', false]]) {
  await reset(140);
  const t0 = await probe();
  const s = await hold(['KeyW', key], 1000);
  // screen-right sampled BEFORE the turn
  const dx = s.x - t0.x, dz = s.z - t0.z;
  const screenR = dx * t0.camRight[0] + dz * t0.camRight[2];
  const yawDeg = (s.yaw - t0.yaw) * 180 / Math.PI;
  say('');
  say(`== ${label}`);
  say(`  camera screen-right at t=0: (${t0.camRight.map((v) => v.toFixed(3)).join(', ')})`);
  say(`  1.0 s later: yaw ${yawDeg > 0 ? '+' : ''}${yawDeg.toFixed(1)} deg, world dx ${dx.toFixed(2)} m,`
    + ` dz ${dz.toFixed(2)} m, speed ${(s.ground * 3.6).toFixed(0)} km/h`);
  say(`  displacement . screen-right = ${screenR.toFixed(2)} m  ->`
    + ` the car went ${screenR > 0 ? 'RIGHT' : 'LEFT'} on screen. Required: ${wantRight ? 'RIGHT' : 'LEFT'}.`
    + `  ${(screenR > 0) === wantRight ? 'PASS' : 'FAIL'}`);
  say(`  lean = ${s.lean.toFixed(3)}; shell world up = (${s.upTilt[0].toFixed(4)}, ${s.upY.toFixed(4)},`
    + ` ${s.upTilt[2].toFixed(4)}), horizontal tilt magnitude ${s.tiltMag.toFixed(4)}`
    + ` = ${(Math.asin(Math.min(1, s.tiltMag)) * 180 / Math.PI).toFixed(2)} deg of body roll`);
  const wantPositive = wantRight;   // right turn => up must tilt toward the car's LEFT (positive)
  say(`  up_horizontal . carLeft = ${s.upDotLeft.toFixed(5)} -> the body rolls`
    + ` ${s.upDotLeft > 0 ? 'toward its LEFT' : 'toward its RIGHT'}, i.e.`
    + ` ${(s.upDotLeft > 0) === wantRight ? 'AWAY FROM' : 'INTO'} the turn centre.`
    + `  ${(s.upDotLeft > 0) === wantPositive ? 'PASS (outward, car-like)' : 'FAIL (inward, motorcycle-like)'}`);
  await page.screenshot({ path: resolve(root, `../shots/s/critic-sign-${key}.png`) });
}

// And the same check on the OLD model's sign, to show the test can fail: force lean positive in a
// left turn (which is what the retired model produced) and re-read the roll direction.
await reset(140);
await page.evaluate(() => { window.__game.physics.state.lean = 1.0; });
await page.evaluate(() => {
  const g = window.__game;
  g.car.update(0.016, { speed: 40, steer: 1, lean: 1.0, pitch: 0 });
  g.car.shell.updateWorldMatrix(true, false);
});
const forced = await probe();
say('');
say('== CONTROL: lean forced to +1 (what the RETIRED model produced in a LEFT turn)');
say(`  up_horizontal . carLeft = ${forced.upDotLeft.toFixed(5)} -> rolls toward its`
  + ` ${forced.upDotLeft > 0 ? 'LEFT' : 'RIGHT'}; in a LEFT turn that is`
  + ` ${forced.upDotLeft > 0 ? 'INTO the corner (the old bug, reproduced)' : 'outward'}`);

say('');
say(`== console/page errors: ${errors.length === 0 ? 'NONE' : errors.join(' | ')}`);
await writeFile(resolve(root, '../verdicts/wave-s/handling-critic-sign.txt'), out.join('\n') + '\n');
await browser.close();
server.close();
