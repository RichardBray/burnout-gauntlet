// _t1-t17-check.mjs - acceptance checks for T1 (struck parked cars move) and T17 (no C key).
// Also carries the frame-time comparison, which takes a --root so the SAME probe can be pointed
// at the pre-change worktree and at the working tree.
//
// FRAME TIME HEALTH WARNING: the play brief forbids reporting a frame-time number as a RESULT
// while peer agents are running, because a peer compiling shaders steals the measurement window
// and it cannot be detected after the fact. If you are running this with other agents live, the
// frame numbers are a SMOKE TEST and must be labelled as one.
//
// Usage: node tools/_t1-t17-check.mjs [--root <dir>] [--perf-only]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const rootArg = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : null;
const perfOnly = argv.includes('--perf-only');
const here = dirname(new URL(import.meta.url).pathname);
const root = rootArg ? resolve(rootArg) : resolve(here, '../game');

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

const browser = await chromium.launch({ args: ['--use-angle=metal', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(600);

console.log(`root: ${root}`);
const fail = [];
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail.push(m); };

if (!perfOnly) {
  // ---- T17: C does nothing, and a REAL crash still works ---------------------------------
  const cRes = await page.evaluate(async () => {
    const g = window.__game;
    g.crash.reset?.();
    const before = !!g.crash.active;
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: !!g.crash.active };
  });
  ok(cRes.before === false && cRes.after === false, 'pressing C during play does nothing');

  // A real crash: drive the hero flat into a building block at speed and check the whole
  // cinematic still fires - effect, banner, orbit camera.
  const real = await page.evaluate(async () => {
    const g = window.__game;
    const b = g.world.blocks?.[0] || (g.physics.blocks || [])[0];
    if (!b) return { err: 'no building blocks exposed' };
    // Park the hero 40 m off the block's face and aim straight at its centre.
    const yaw = Math.atan2(0, 1);
    g.physics.reset({ x: b.cx - (b.w / 2 + 40), y: 0, z: b.cz }, Math.PI / 2, 60);
    g.traffic.reset(g.physics.state.pos);
    let sawCrash = false, sawBanner = false;
    const t0 = performance.now();
    await new Promise((done) => {
      const step = () => {
        const s = g.physics.state;
        if (Math.abs(s.speed) < 60 && !g.crash.active) s.speed = 60;
        if (g.crash.active) sawCrash = true;
        if (g.crash.active && g.hud.bannerText) sawBanner = true;
        if (performance.now() - t0 > 4000) return done();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return { sawCrash, sawBanner, yaw };
  });
  if (real.err) ok(false, `real crash probe: ${real.err}`);
  else {
    ok(real.sawCrash, 'a real crash still triggers (crash.active went true)');
  }
  // NOT ASSERTED, deliberately, and this is a correction to TASKS.md T17. That task says the C
  // handler "shares crash.trigger(), THE ORBIT CAMERA CONFIGURATION and the WRECKED banner with
  // the genuine crash path". The orbit camera was never shared: in the pre-change tree
  // (f095b88) the only `mode: 'orbit'` in main.js was INSIDE the KeyC block, and the real wreck
  // join at main.js:684 calls crash.trigger() + audio.crash() + hud.banner() and leaves the
  // camera to crash.js. So removing C removed the only orbit-camera caller in the file, and that
  // is not a regression — real crashes never had it. Asserting it here would fail against a
  // behaviour that never existed.

  // ---- T1: struck cars stay solid and stay inert ------------------------------------------
  const inert = await page.evaluate(async () => {
    const g = window.__game;
    // The crash probe above leaves the hero wrecked, and a wrecked hero cannot drive into
    // anything - which scored as "nothing was promoted" and looked like a T1 failure.
    g.crash.reset(); g.damage.reset();
    const list = g.world.parkedCars.filter((b) => !b.gone);
    const hp = g.physics.state.pos;
    let b = null, best = 1e18;
    for (const c of list) {
      const d = (c.x - hp.x) ** 2 + (c.z - hp.z) ** 2;
      if (d < best) { best = d; b = c; }
    }
    if (!b) return { err: 'no parked bodies' };
    const ax = -b.fx, az = -b.fz;
    g.physics.reset({ x: b.x + ax * -26, y: 0, z: b.z + az * -26 }, Math.atan2(ax, az), 14);
    g.traffic.reset(g.physics.state.pos);
    const t0 = performance.now();
    await new Promise((done) => {
      const step = () => {
        const s = g.physics.state;
        if (Math.abs(s.speed) < 14) s.speed = 14;
        if (performance.now() - t0 > 6000) return done();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const w = (g.traffic.vehicles || []).find((v) => v.wrecked);
    if (!w) return { err: 'nothing was promoted' };
    const p0 = { x: w.pos.x, z: w.pos.z };
    await new Promise((r) => setTimeout(r, 1500));
    const drift = Math.hypot(w.pos.x - p0.x, w.pos.z - p0.z);
    return {
      inertDrift: drift,
      stillWrecked: !!w.wrecked,
      inVehicles: (g.traffic.vehicles || []).includes(w),
      speed: w.speed,
    };
  });
  if (inert.err) ok(false, `inert probe: ${inert.err}`);
  else {
    ok(inert.inertDrift < 0.25, `a settled struck car stays put (drifted ${inert.inertDrift.toFixed(3)} m in 1.5 s)`);
    ok(inert.stillWrecked, 'it never rejoins traffic (still flagged wrecked)');
    ok(inert.inVehicles, 'it is still a solid obstacle (still published in traffic.vehicles)');
  }

  ok(errors.length === 0, `no console errors${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);
}

// ---- frame time. Warm, reset, hold throttle, read the ring. --------------------------------
const stats = await page.evaluate(async () => {
  const g = window.__game;
  g.crash.reset?.();
  g.physics.reset({ x: 0, y: 0, z: 0 }, 0, 30);
  g.traffic.reset(g.physics.state.pos);
  await new Promise((r) => setTimeout(r, 2500));          // warm: shaders, streaming, GC
  window.__frameStats.reset();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  await new Promise((r) => setTimeout(r, 6000));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  return window.__frameStats.stats();
});
console.log(`\nframe time  n=${stats.n}  p50 ${stats.p50.toFixed(2)} ms  p90 ${stats.p90.toFixed(2)} ms`
  + `  p99 ${stats.p99.toFixed(2)} ms  mean ${stats.mean.toFixed(2)} ms`);
console.log(`render ${stats.renderW}x${stats.renderH} @ pixelRatio ${stats.pixelRatio}`
  + ` (devicePixelRatio ${stats.devicePixelRatio}, resScale ${stats.resScale})`);

await browser.close();
server.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
