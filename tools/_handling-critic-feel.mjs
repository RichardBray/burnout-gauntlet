// _handling-critic-feel.mjs — the wave-S handling critic's PLAY pass. Everything here is a
// question the harness cannot answer: what does a player actually experience per second of holding
// a key. Each block prints a time series, because "how it feels" is a shape over time and a single
// scalar hides exactly the thing being judged.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' }); res.end(buf);
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

const S = () => page.evaluate(() => {
  const g = window.__game, s = g.physics.state;
  return {
    t: performance.now() / 1000, kmh: s.ground * 3.6, hudKmh: Math.abs(s.speed) * 3.6,
    slip: s.slipAngle * 180 / Math.PI, yawRate: s.yawRate * 180 / Math.PI, drifting: s.drifting,
    impact: s.impact, boost: s.boost, boosting: s.boosting, fov: g.camera.fov,
    accelG: s.accelG, x: s.pos.x, z: s.pos.z,
  };
});
async function onPath(kmh, u = 0.30) {
  await page.evaluate(({ v, u }) => {
    const g = window.__game;
    const path = g.world.paths.highway || Object.values(g.world.paths)[0];
    g.physics.placeOnPath(path, u, v / 3.6);
    g.physics.clearPath();
    g.traffic.reset(g.physics.state.pos);
  }, { v: kmh, u });
  await page.waitForTimeout(300);
}
async function hold(keys, ms, sampleMs = 100) {
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); }, keys);
  const t0 = Date.now(); const rows = [];
  while (Date.now() - t0 < ms) { rows.push(await S()); await page.waitForTimeout(sampleMs); }
  await page.evaluate((ks) => { for (const k of ks) window.dispatchEvent(new KeyboardEvent('keyup', { code: k })); }, keys);
  return rows;
}
const trace = (rows, f, every = 1) => rows.filter((_, i) => i % every === 0).map(f).join(' ');

say('== F1. DRIVING INTO A BUILDING at speed: how long does one mistake cost?');
{
  await onPath(280, 0.30);
  // aim off the road and hold throttle until something is hit
  const rows = await hold(['KeyW', 'KeyD'], 9000, 100);
  const hitIdx = rows.findIndex((r) => r.impact > 0);
  if (hitIdx < 0) say('  no contact in 9 s of driving off-road (the highway shoulder is clear)');
  else {
    const before = rows[hitIdx - 1] ?? rows[0];
    say(`  first contact at t=${(rows[hitIdx].t - rows[0].t).toFixed(1)} s: ${before.kmh.toFixed(0)} ->`
      + ` ${rows[hitIdx].kmh.toFixed(0)} km/h`);
    say('  km/h after: ' + trace(rows.slice(hitIdx), (r) => r.kmh.toFixed(0), 2));
    const back = rows.slice(hitIdx).findIndex((r) => r.kmh > before.kmh * 0.9);
    say(`  back to 90% of the pre-impact speed after ${back < 0 ? '>' + ((rows.length - hitIdx) * 0.1).toFixed(1) : (back * 0.1).toFixed(1)} s`);
  }
}

say('');
say('== F2. TRAFFIC: hold throttle down a lane and see what a car in the way costs');
{
  await onPath(200, 0.42);
  await page.evaluate(() => window.__game.physics.followPath(
    window.__game.world.paths.highway || Object.values(window.__game.world.paths)[0], 26));
  const rows = await hold(['KeyW'], 14000, 150);
  say('  km/h: ' + trace(rows, (r) => r.kmh.toFixed(0), 3));
  const drops = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i - 1].kmh - rows[i].kmh;
    if (d > 25) drops.push(`t=${(rows[i].t - rows[0].t).toFixed(1)}s -${d.toFixed(0)}km/h (impact ${rows[i].impact.toFixed(2)})`);
  }
  say(`  sudden losses > 25 km/h in one 150 ms sample: ${drops.length === 0 ? 'none' : drops.join(', ')}`);
  await page.evaluate(() => window.__game.physics.clearPath());
}

say('');
say('== F3. CHAIN DRIFT: the Paradise loop. tap-left, tap-right, alternating, at ~130 km/h');
{
  await onPath(140, 0.30);
  const rows = [];
  const t0 = Date.now();
  for (let beat = 0; beat < 6; beat++) {
    const steer = beat % 2 === 0 ? 'KeyA' : 'KeyD';
    rows.push(...await hold(['KeyS', steer], 220, 60));      // the brake tap, loaded
    rows.push(...await hold(['KeyW', steer], 700, 60));      // then throttle, lock held
  }
  say(`  6 alternating beats over ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  say('  slip deg: ' + trace(rows, (r) => r.slip.toFixed(0), 1));
  say('  km/h:     ' + trace(rows, (r) => r.kmh.toFixed(0), 2));
  say(`  peak |slip| ${Math.max(...rows.map((r) => Math.abs(r.slip))).toFixed(0)} deg,`
    + ` fraction of samples in the drift state ${(100 * rows.filter((r) => r.drifting).length / rows.length).toFixed(0)} %,`
    + ` speed ${rows[0].kmh.toFixed(0)} -> ${rows[rows.length - 1].kmh.toFixed(0)} km/h`);
}

say('');
say('== F4. E-BRAKE COST vs SPEED: hold Space + a steering key for 1.5 s and count the loss');
{
  for (const v of [80, 130, 200, 280]) {
    await onPath(v, 0.30);
    const rows = await hold(['KeyW', 'KeyA', 'Space'], 1500, 80);
    const after = await hold(['KeyW'], 1500, 100);
    const peak = Math.max(...rows.map((r) => Math.abs(r.slip)));
    say(`  ${String(v).padStart(3)} km/h: peak slip ${peak.toFixed(0).padStart(2)} deg,`
      + ` speed ${rows[0].kmh.toFixed(0)} -> ${rows[rows.length - 1].kmh.toFixed(0)} km/h`
      + ` (-${(100 * (1 - rows[rows.length - 1].kmh / rows[0].kmh)).toFixed(0)} %),`
      + ` and ${after[after.length - 1].kmh.toFixed(0)} km/h after 1.5 s more throttle`);
  }
}

say('');
say('== F5. UNDERSTEER: hold a steering key for 6 s at 250 km/h and see if it ever bites');
{
  await onPath(250, 0.30);
  const rows = await hold(['KeyW', 'KeyA'], 6000, 200);
  say('  yawRate deg/s: ' + trace(rows, (r) => r.yawRate.toFixed(0), 1));
  say('  km/h:          ' + trace(rows, (r) => r.kmh.toFixed(0), 1));
  say(`  slip stayed under ${Math.max(...rows.map((r) => Math.abs(r.slip))).toFixed(1)} deg throughout`
    + ` -> ${Math.max(...rows.map((r) => Math.abs(r.slip))) < 8 ? 'pure grip, never steps out' : 'steps out'}`);
}

say('');
say(`== console/page errors across the whole play session: ${errors.length === 0 ? 'NONE' : errors.join(' | ')}`);
await page.screenshot({ path: resolve(root, '../shots/s/critic-feel-end.png') });
await writeFile(resolve(root, '../verdicts/wave-s/handling-critic-feel.txt'), out.join('\n') + '\n');
await browser.close();
server.close();
