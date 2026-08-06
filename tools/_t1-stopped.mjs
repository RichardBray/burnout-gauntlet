// _t1-stopped.mjs - the case the user is actually hitting: a STOPPED LIVE TRAFFIC car, not a
// baked parked car. Measured at spawn, the nearest baked parked car is ~240 m away, so most of
// what a player rear-ends in traffic is a pool car halted at a signal or in an IDM queue.
//
// That path is traffic.js's `check` shunt, which is NOT the parked-car promotion path, and it had
// its own defect: the stopped-car clause of the wreck test read `v.speed` after the shunt on the
// line above had already overwritten it, so the mitigation written for stopped cars was dead.
//
// Usage: node tools/_t1-stopped.mjs [speed ...]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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

const speeds = process.argv.slice(2).map(Number).filter(Number.isFinite);
const SPEEDS = speeds.length ? speeds : [4, 8, 12, 18];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(600);

const nearestParked = await page.evaluate(() => {
  const g = window.__game, hp = g.physics.state.pos;
  let best = 1e18;
  for (const c of g.world.parkedCars) if (!c.gone) best = Math.min(best, Math.hypot(c.x - hp.x, c.z - hp.z));
  return best;
});
console.log(`context: nearest BAKED parked car to spawn is ${nearestParked.toFixed(0)} m away`);
console.log('        so a rear-end in traffic is usually a live pool car, not one of those.\n');

const run = (want) => page.evaluate(async (target) => {
  const g = window.__game;
  g.crash.reset(); g.damage.reset();
  // ORDER MATTERS: the pool recycles cars by distance from the hero, so picking a vehicle and
  // THEN teleporting leaves a stale reference to a slot that has been re-seeded somewhere else -
  // which reads as "the car never moved" when in truth it was never the car being hit. Settle
  // the hero first, then choose from what is actually around it.
  const hp0 = g.physics.state.pos;
  g.physics.reset({ x: hp0.x, y: 0, z: hp0.z }, g.physics.state.yaw, 0);
  await new Promise((r) => setTimeout(r, 700));
  const hp = g.physics.state.pos;
  let v = null, best = 1e18;
  for (const x of (g.traffic.vehicles || [])) {
    if (x.wrecked) continue;
    const d = (x.pos.x - hp.x) ** 2 + (x.pos.z - hp.z) ** 2;
    if (d < best) { best = d; v = x; }
  }
  if (!v) return { err: 'no live vehicles' };
  // Hold it stationary so it is genuinely a STOPPED car, the way a signal queue is.
  v.speed = 0; v.vDes = 0;
  const bx = v.pos.x, bz = v.pos.z;
  const fx = Math.cos(v.yaw), fz = -Math.sin(v.yaw);
  // Line the hero up behind it, along its own axis: a square rear-end. Short approach, so the
  // pool has no reason to recycle anything between here and the contact.
  g.physics.reset({ x: bx - fx * 24, y: 0, z: bz - fz * 24 }, Math.atan2(fx, fz), target);
  const t0 = performance.now();
  let wrecked = false, peakSpin = 0;
  await new Promise((done) => {
    const step = () => {
      const s = g.physics.state;
      if (Math.abs(s.speed) < target) s.speed = target;
      v.vDes = 0;                       // keep it from driving away on its own
      if (!v.wrecked) v.speed = Math.min(v.speed, 0.2);
      if (v.wrecked) { wrecked = true; peakSpin = Math.max(peakSpin, Math.abs(v.wspin)); }
      if (performance.now() - t0 > (24 / target) * 1000 + 2500) return done();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return {
    target, wrecked,
    moved: Math.hypot(v.pos.x - bx, v.pos.z - bz),
    peakSpin: peakSpin * 180 / Math.PI,
  };
}, want);

console.log('closing    wrecked   moved(m)   peak spin');
for (const s of SPEEDS) {
  const r = await run(s);
  if (r.err) { console.log(`${s}\t${r.err}`); continue; }
  console.log(`${`${s} m/s`.padEnd(10)} ${(r.wrecked ? 'yes' : 'NO').padEnd(9)} `
    + `${r.moved.toFixed(2).padStart(8)}   ${r.peakSpin.toFixed(0).padStart(6)} deg/s`);
  await page.waitForTimeout(200);
}

console.log(errors.length ? `\nCONSOLE ERRORS: ${errors.slice(0, 4).join(' | ')}` : '\nconsole clean');
await browser.close();
server.close();
