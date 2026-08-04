// wave-s perf-critic-r2 — MY OWN frame-time instrument. Written from scratch by the critic;
// it shares the scenario placement of round 1's harness (so the numbers are comparable) and
// nothing else. Cold boot per run, fresh page per run.
//
// What it asserts on EVERY window, not at boot:
//   - gl.drawingBufferWidth/Height read off the DRIVER (renderer.getContext()), not
//     renderer.getDrawingBufferSize(), which is a number the renderer computes about itself.
//   - the composer's own post render target size + sample count (the expensive passes run there).
//   - pixelRatio, devicePixelRatio, resScale, paused.
//   - metres travelled inside the window: a parked car reads 0 and would fake every number here.
//   - two INDEPENDENT rAF rings (mine and window.__frameStats) over the same window. Two honest
//     rAF rings must agree to every digit.
//   - renderer.info counters, and the road reflection / point-light census when they exist.
//
// usage: node tools/_perfcritic-r2.mjs <gameRoot> <label> [repeat] [scenarios] [res] [extraFlagsJson]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.argv[2]);
const LABEL = process.argv[3] || 'run';
const REPEAT = +(process.argv[4] || 3);
const SCN = (process.argv[5] || 'corner,cruise,city,boost,night-wet').split(',');
const RES = +(process.argv[6] || 1.0);
const OPT = JSON.parse(process.argv[7] || '{}');   // {hash, warmMs, measMs, kill}
const WARM = OPT.warmMs ?? 3500;
const MEAS = OPT.measMs ?? 8000;

const SCENARIOS = {
  cruise:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 } },
  boost:       { hold: ['KeyW', 'ShiftLeft'], place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 } },
  corner:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: false },
                 oscillate: { keys: ['KeyA', 'KeyD'], halfPeriodMs: 800 } },
  city:        { hold: ['KeyW'], place: { path: 'city', u: 0.34, kmh: 150, follow: 26 } },
  'night-wet': { hold: ['KeyW'], place: { path: 'city', u: 0.565, kmh: 150, follow: 26 },
                 tod: 'night', wet: 1 },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.round(p * (a.length - 1)))];
  return { n: a.length, mean: a.reduce((s, v) => s + v, 0) / a.length,
    p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: a[a.length - 1],
    over16_7pct: 100 * a.filter((v) => v > 16.7).length / a.length,
    over33pct: 100 * a.filter((v) => v > 33.4).length / a.length };
}

async function runOnce(name, i) {
  const sc = SCENARIOS[name];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  let stopOsc = async () => {};
  try {
    const hash = `#nomenu=1&scene=dusk-highway-chase&res=${RES}${OPT.hash || ''}`;
    const tGoto = Date.now();
    await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true && !!window.__frameStats', null, { timeout: 180000 });
    const bootMs = Date.now() - tGoto;
    if (sc.tod) await page.evaluate((t) => window.__game.applyTimeOfDay(t), sc.tod);
    if (sc.wet !== undefined) await page.evaluate((w) => window.__game.applyWet(w), sc.wet);
    if (OPT.kill) console.log('    KILL -> ' + JSON.stringify(await page.evaluate(OPT.kill)));
    await page.evaluate((p) => {
      const g = window.__game;
      const path = g.world.paths[p.path];
      g.physics.placeOnPath(path, p.u, p.kmh / 3.6);
      if (p.follow) g.physics.followPath(path, p.follow); else g.physics.clearPath();
      g.traffic.reset(g.physics.state.pos);
      g.camRig.snap();
    }, sc.place);
    for (const k of sc.hold) await page.keyboard.down(k);
    if (sc.oscillate) {
      let stop = false;
      const loop = (async () => {
        let j = 0;
        while (!stop) {
          const k = sc.oscillate.keys[j % 2], other = sc.oscillate.keys[(j + 1) % 2];
          try { await page.keyboard.up(other); await page.keyboard.down(k); } catch { return; }
          const t0 = Date.now();
          while (!stop && Date.now() - t0 < sc.oscillate.halfPeriodMs) await sleep(40);
          j++;
        }
      })();
      stopOsc = async () => { stop = true; await loop; };
    }
    // my own rAF ring, registered independently of window.__frameStats
    await page.evaluate(() => {
      window.__pc = { t: [], last: performance.now(), on: true };
      const f = (now) => { const c = window.__pc; if (!c.on) return;
        c.t.push(now - c.last); c.last = now; requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    await sleep(WARM);
    const probe = () => {
      const g = window.__game; const s = g.physics.state;
      const gl = g.renderer.getContext();
      const rk = g.roadKit || (g.world && g.world.roadKit);
      return { x: s.pos.x, z: s.pos.z, kmh: Math.abs(s.speed) * 3.6,
        glW: gl.drawingBufferWidth, glH: gl.drawingBufferHeight,
        dpr: window.devicePixelRatio, ratio: g.renderer.getPixelRatio(),
        resScale: g.getResScale(), paused: g.isPaused(),
        rt: g.composer ? `${g.composer.renderTarget1.width}x${g.composer.renderTarget1.height}` : null,
        rtSamples: g.composer ? g.composer.renderTarget1.samples : null,
        shadowPx: (() => { try { const sh = g.sky.sun.shadow;
          return `${sh.mapSize.x}x${sh.mapSize.y}/${g.renderer.shadowMap.enabled}`; } catch { return null; } })(),
        refl: rk && rk.reflStats ? rk.reflStats() : null,
        lights: g.world && g.world.lightStats ? g.world.lightStats() : null,
        boosting: !!s.boosting, boost: s.boost, slip: Math.abs(s.slip || 0),
        progs: g.renderer.info.programs ? g.renderer.info.programs.length : null };
    };
    const pre = await page.evaluate(probe);
    await page.evaluate(() => { window.__pc.t.length = 0; window.__frameStats.reset(); });
    await sleep(MEAS);
    const mine = await page.evaluate(() => ({ t: window.__pc.t.slice(),
      theirs: window.__frameStats.stats(),
      theirSamples: window.__frameStats.samples ? window.__frameStats.samples() : null }));
    const post = await page.evaluate(probe);
    const counters = await page.evaluate(async () => {
      const info = window.__game.renderer.info; const prev = info.autoReset;
      info.autoReset = false; info.reset();
      let seen = 0;
      await new Promise((d) => { const step = () => { if (++seen >= 40) return d(); requestAnimationFrame(step); }; requestAnimationFrame(step); });
      const o = { calls: info.render.calls / seen, tris: info.render.triangles / seen,
        progs: info.programs ? info.programs.length : null,
        geos: info.memory.geometries, texs: info.memory.textures, frames: seen };
      info.autoReset = prev; info.reset(); return o;
    });
    const dist = Math.hypot(post.x - pre.x, post.z - pre.z);
    const st = stats(mine.t);
    const theirs = mine.theirs;
    return { scenario: name, run: i + 1, bootMs, ...st, theirs, pre, post, counters,
      distM: dist, agree: theirs ? Math.abs(theirs.p50 - st.p50) : null,
      errs: errs.slice(0, 6), samples: mine.t };
  } finally { await stopOsc(); await page.close(); }
}

const all = [];
console.log(`# ${LABEL}  root=${root}  repeat=${REPEAT}  res=${RES}  opt=${JSON.stringify(OPT)}`);
const H = ['scenario', 'run', 'n', 'mean', 'p50', 'p90', 'p99', 'max', '>16.7%', '>33%',
  'glW', 'glH', 'dpr', 'ratio', 'rt', 'msaa', 'shadow', 'dist_m', 'km/h', 'calls', 'tris',
  'progs', 'their_p50'];
console.log(H.map((s) => String(s).padStart(9)).join(''));
for (const name of SCN) {
  const p50s = [], p99s = [];
  for (let i = 0; i < REPEAT; i++) {
    const r = await runOnce(name, i);
    all.push(r); p50s.push(r.p50); p99s.push(r.p99);
    console.log([name, r.run, r.n, r.mean.toFixed(2), r.p50.toFixed(2), r.p90.toFixed(2),
      r.p99.toFixed(2), r.max.toFixed(1), r.over16_7pct.toFixed(1), r.over33pct.toFixed(1),
      r.post.glW, r.post.glH, r.post.dpr, r.post.ratio, r.post.rt, r.post.rtSamples,
      r.post.shadowPx, r.distM.toFixed(0), r.post.kmh.toFixed(0),
      Math.round(r.counters.calls), Math.round(r.counters.tris), r.counters.progs,
      r.theirs ? r.theirs.p50.toFixed(2) : 'null'].map((s) => String(s).padStart(9)).join(''));
    if (r.post.refl) console.log(`    refl ${JSON.stringify(r.post.refl)} (pre ${JSON.stringify(r.pre.refl)})`);
    if (r.post.lights) console.log(`    lights used=${r.post.lights.used} inShot=${r.post.lights.inShot} max=${r.post.lights.maxInShot} pool=${r.post.lights.pool} frames=${r.post.lights.frames}`);
    if (r.errs.length) console.log('    ERRORS: ' + r.errs.join(' | '));
  }
  const s = p50s.slice().sort((a, b) => a - b);
  const s9 = p99s.slice().sort((a, b) => a - b);
  console.log(`  >> ${name} p50 [${p50s.map((v) => v.toFixed(2)).join(', ')}] med ${s[(s.length - 1) >> 1].toFixed(2)} spread ${(100 * (s[s.length - 1] - s[0]) / s[0]).toFixed(2)}%  |  p99 med ${s9[(s9.length - 1) >> 1].toFixed(2)}`);
}
await mkdir('/tmp/pcr2/out', { recursive: true });
await writeFile(`/tmp/pcr2/out/${LABEL}.json`, JSON.stringify(all, null, 1));
await browser.close(); server.close(); process.exit(0);
