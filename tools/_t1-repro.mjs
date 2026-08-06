// _t1-repro.mjs - T1 REPRO. "Crashing into a parked car leaves it perfectly still."
// Drives the REAL page at the hero into a real parked body at a chosen closing speed and reports
// what actually happened to that body: was it stamped, was it promoted, did it move.
// No fix here - this exists to find WHY the promotion path built in fe15782/5d4a85b does not fire
// from the user's seat. Usage: node tools/_t1-repro.mjs [speed ...]
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
const SPEEDS = speeds.length ? speeds : [3, 6, 10, 20];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(400);

// --- population coverage (prime suspect 2): is every stationary car actually handed to both
// consumers, or is there a second baked population that never reaches setParkedBodies?
const pop = await page.evaluate(() => {
  const g = window.__game;
  const list = g.world.parkedCars || [];
  return {
    parkedCars: list.length,
    counts: g.world.parkedCounts,
    withHide: list.filter((b) => typeof b.hide === 'function').length,   // suspect 4
    poolSize: g.traffic.debug ? undefined : undefined,
  };
});
console.log(`population: world.parkedCars = ${pop.parkedCars}, of which ${pop.withHide} have hide()`);
console.log(`            world.parkedCounts = ${JSON.stringify(pop.counts)}`);
console.log('');

// --- the drive. Aim the hero at a real parked body from 26 m back and hold the target speed
// with a per-frame correction, so the CLOSING speed at contact is the thing we asked for rather
// than whatever the throttle happened to build.
const run = (want, mode = 'rear') => page.evaluate(async ({ target, mode }) => {
  const g = window.__game;
  const list = g.world.parkedCars.filter((b) => !b.gone);
  const hp = g.physics.state.pos;
  // Nearest un-hit parked body to where the hero currently is.
  let b = null, best = 1e18;
  for (const c of list) {
    const d = (c.x - hp.x) ** 2 + (c.z - hp.z) ** 2;
    if (d < best) { best = d; b = c; }
  }
  if (!b) return { err: 'no parked bodies' };

  // main.js's heading convention is forward = (sin yaw, cos yaw). Aim straight at the body.
  const bx = b.x, bz = b.z;
  const before = { x: bx, z: bz, gone: !!b.gone };
  const start = 26;
  // THREE IMPACT GEOMETRIES, because the acceptance criterion is about the impact ANGLE:
  //   rear   - straight up the car's own forward axis, dead centre. Pure shove, no spin.
  //   corner - the same approach, offset laterally so the contact lands on a rear corner.
  //            Maximum lever arm, so this is the case that must SPIN the car.
  //   side   - across the car's lateral axis. Must push it sideways, off its own flank.
  // `lat` is the body's left, using this file's stored convention: forward (fx, fz), lateral
  // (fz, -fx).
  const ltx = b.fz, ltz = -b.fx;
  let ax, az, offX = 0, offZ = 0;
  if (mode === 'side') { ax = -ltx; az = -ltz; }
  else {
    ax = -b.fx; az = -b.fz;                     // unit vector from behind the car toward it
    // 0.75 of a half-width puts the hero's corner on the body's corner without missing it.
    if (mode === 'corner') { offX = ltx * b.halfWid * 1.5; offZ = ltz * b.halfWid * 1.5; }
  }
  const yaw = Math.atan2(ax, az);
  g.physics.reset({ x: bx + ax * -start + offX, y: 0, z: bz + az * -start + offZ }, yaw, target);
  g.traffic.reset(g.physics.state.pos);

  const stamps = [];
  const t0 = performance.now();
  let promoted = null, peakSpin = 0, settleMs = null, yaw0 = 0;
  // The struck body's own yaw at the moment of promotion, so `turned` is rotation CAUSED by the
  // hit rather than the parked orientation it started at.
  const trackWreck = () => {
    let bestD = 1e18, w = null;
    for (const v of (g.traffic.vehicles || [])) {
      if (!v.wrecked) continue;
      const d = (v.pos.x - bx) ** 2 + (v.pos.z - bz) ** 2;
      if (d < bestD) { bestD = d; w = v; }
    }
    return w;
  };
  await new Promise((done) => {
    const step = () => {
      const s = g.physics.state;
      // Hold the target speed: this probe is about the CONTACT, not about acceleration.
      if (Math.abs(s.speed) < target) s.speed = target;
      if (b.heroHit) stamps.push({ ...b.heroHit });
      if (b.gone && !promoted) { promoted = performance.now() - t0; yaw0 = trackWreck()?.yaw ?? 0; }
      if (promoted) {
        const w = trackWreck();
        if (w) {
          peakSpin = Math.max(peakSpin, Math.abs(w.wspin));
          // Settled = both the slide and the spin have effectively stopped.
          // PERCEPTUAL thresholds, not numerical ones: 0.4 m/s is walking pace and 0.25 rad/s is
          // 14 deg/s, both of which read as stopped on screen. Chasing wspin down to 0.05 rad/s
          // (2.9 deg/s) measures the exponential's tail, not the moment the car looks settled.
          if (settleMs === null && Math.hypot(w.wvx, w.wvz) < 0.4 && Math.abs(w.wspin) < 0.25) {
            settleMs = performance.now() - t0 - promoted;
          }
        }
      }
      // Long enough to COVER THE APPROACH at this speed and then watch the body settle.
      // A fixed window scored 3 and 6 m/s as "never promoted" when the hero had simply not
      // arrived yet - 26 m at 3 m/s is 8.7 s.
      if (performance.now() - t0 > (start / target) * 1000 + 2600) return done();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // Where did the body end up? If it was promoted it is now a wrecked pool car; find the
  // wrecked car nearest the body's parked position.
  let moved = null, fwdM = null, latM = null, turned = null;
  const veh = g.traffic.vehicles || [];
  let bestV = 1e18, hit = null;
  for (const v of veh) {
    if (!v.wrecked) continue;
    const d = (v.pos.x - bx) ** 2 + (v.pos.z - bz) ** 2;
    if (d < bestV) { bestV = d; hit = v; }
  }
  if (hit) {
    const mx = hit.pos.x - bx, mz = hit.pos.z - bz;
    moved = Math.hypot(mx, mz);
    // Decompose the displacement in the CAR'S OWN frame, so "shoved forward" and "pushed
    // sideways" are separable rather than both reading as "it moved".
    fwdM = mx * b.fx + mz * b.fz;
    latM = mx * ltx + mz * ltz;
    turned = (hit.yaw - yaw0) * 180 / Math.PI;
  }
  return {
    before, target, mode,
    stamped: stamps.length,
    promoted: promoted !== null, promotedAtMs: promoted,
    moved, fwdM, latM, turned, peakSpin: peakSpin * 180 / Math.PI, settleMs,
    wreckedInPool: veh.filter((v) => v.wrecked).length,
  };
}, { target: want, mode });

const row = (r) => [
  `${r.target} m/s`.padEnd(9),
  r.mode.padEnd(7),
  (r.promoted ? 'yes' : 'NO').padEnd(4),
  (r.moved === null ? '-' : r.moved.toFixed(2)).padStart(7),
  (r.fwdM === null ? '-' : r.fwdM.toFixed(2)).padStart(7),
  (r.latM === null ? '-' : r.latM.toFixed(2)).padStart(7),
  (r.turned === null ? '-' : r.turned.toFixed(0)).padStart(6),
  r.peakSpin.toFixed(0).padStart(7),
  (r.settleMs === null ? '>win' : `${r.settleMs | 0}`).padStart(7),
].join(' ');
const head = 'closing   mode    prom   moved   +fwd    +lat   turn  spin/s  settle';

console.log('--- SPEED SWEEP, square rear-end ------------------------------------------');
console.log(head);
for (const s of SPEEDS) {
  const r = await run(s, 'rear');
  if (r.err) { console.log(`${s}\t${r.err}`); continue; }
  console.log(row(r));
  await page.waitForTimeout(150);
}

console.log('\n--- IMPACT ANGLE at 10 m/s ------------------------------------------------');
console.log(head);
for (const m of ['rear', 'corner', 'side']) {
  const r = await run(10, m);
  if (r.err) { console.log(`${m}\t${r.err}`); continue; }
  console.log(row(r));
  await page.waitForTimeout(150);
}

console.log(errors.length ? `\nCONSOLE ERRORS: ${errors.slice(0, 5).join(' | ')}` : '\nconsole clean');
await browser.close();
server.close();
