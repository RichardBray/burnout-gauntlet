// wave-s perf-r4 — my instrument for the HUD compositing change.
//
// Derived from tools/_perfr3.mjs --mode drive (the round-3 builder's tool, whose scenario table is
// itself copied verbatim from tools/fps.mjs:85-121), with four additions this piece needs and that
// tool does not have. _perfr3.mjs is left UNMODIFIED so a critic can cross-check every number here
// against it; everything below reproduces its output format so the two are directly comparable.
//
//   --hash k=v&k=v   extra URL hash params, so `#hudgl=0` can be A/B'd without a code edit
//   --probe          print ctx.hudPath() and every canvas's backing store, per run: which route
//                    the HUD is taking to the screen is the whole subject, so it is asserted, not
//                    assumed. The run THROWS if the requested route is not the live one.
//   --want in|dom    assert the HUD route. Refuses to print a number for the wrong configuration.
//   --kill NAME      hud-off (the critic's kill-control, reproduced) and hud-draw-off.
//
// THE PAIRED A/B FOR THIS PIECE IS `--hash hudgl=0`, NOT A KILL-CONTROL, and deliberately: both
// sides are real shipped paths reached by one knob on one tree, so neither side is a harness
// approximation of the other. The cross-commit BEFORE is taken with --root on a clean worktree.
//
// Unchanged from _perfr3.mjs and load-bearing: gl.drawingBufferWidth/Height are read off the
// DRIVER at the END of every window and the run throws rather than prints if the buffer is not
// what was asked for; sub-3.5 ms rAF deltas are merged into their predecessor before percentiles,
// delivered fps and share-over-16.7 (perf-critic-r2 section 1d: --disable-frame-rate-limit issues
// catch-up BeginFrames that are not presented frames).
//
// usage: node tools/_perfr4.mjs --scenario cruise --repeat 3 [--root game] [--hash hudgl=0]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const REPEAT = +arg('repeat', 3);
const SCEN = arg('scenario', 'cruise');
const KILL = arg('kill', '');
const WARM = +arg('warm', 3500);
const MEAS = +arg('meas', 8000);
const ROOT = resolve(arg('root', 'game'));
const DSF = +arg('dsf', 1);
const HASH = arg('hash', '');
const WANT = arg('want', '');
const PROBE = has('probe') || !!WANT;

const SCENARIOS = {
  cruise:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: 26 } },
  boost:       { hold: ['KeyW', 'ShiftLeft'], place: { path: 'highway', u: 0.22, kmh: 300, follow: 34 } },
  corner:      { hold: ['KeyW'], place: { path: 'highway', u: 0.30, kmh: 232, follow: false },
                 oscillate: { keys: ['KeyA', 'KeyD'], halfPeriodMs: 800 } },
  city:        { hold: ['KeyW'], place: { path: 'city', u: 0.34, kmh: 150, follow: 26 } },
  'night-wet': { hold: ['KeyW'], place: { path: 'city', u: 0.565, kmh: 150, follow: 26 },
                 tod: 'night', wet: 1 },
};

const KILLS = {
  none: () => {},
  // perf-critic-r3 section 8's kill-control, reproduced verbatim in behaviour: the HUD stops
  // drawing AND stops compositing. This is the ceiling of what this piece can be worth.
  'hud-off': () => { const h = window.__game.hud; if (h.setVisible) h.setVisible(false); },
  // Stops draw() after the first frame. On the DOM path that removes the redraw only (the layer
  // still composites every frame); on the in-frame path it removes the redraw AND every texture
  // upload after the first, because hud.generation stops moving. Run on both paths, the difference
  // between the two savings is the per-frame upload cost, with no production hook to measure it.
  'hud-draw-off': () => {
    const h = window.__game.hud;
    const ou = h.update.bind(h);
    let done = false;
    h.update = function (dt, s) { if (!done) { done = true; return ou(dt, s); } };
  },
};

function startOscillator(page, osc) {
  if (!osc) return async () => {};
  let stop = false;
  const loop = (async () => {
    let i = 0;
    while (!stop) {
      const k = osc.keys[i % osc.keys.length];
      const other = osc.keys[(i + 1) % osc.keys.length];
      try { await page.keyboard.up(other); await page.keyboard.down(k); } catch { return; }
      const t0 = Date.now();
      while (!stop && Date.now() - t0 < osc.halfPeriodMs) await new Promise((r) => setTimeout(r, 40));
      i++;
    }
    try { for (const k of osc.keys) await page.keyboard.up(k); } catch { /* page gone */ }
  })();
  return async () => { stop = true; await loop; };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(ROOT, p === '/' ? '/index.html' : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sc = SCENARIOS[SCEN];
if (!sc) throw new Error('unknown scenario ' + SCEN);
const extra = HASH ? '&' + String(HASH).replace(/^[#&]/, '') : '';
console.log(`# perf-r4 drive scenario=${SCEN} root=${ROOT} hash=${extra || '(none)'} kill=${KILL || 'none'} dsf=${DSF} warm=${WARM} meas=${MEAS} repeat=${REPEAT}`);
const out = [];
for (let i = 0; i < REPEAT; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  const stopOsc = startOscillator(page, sc.oscillate);
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&res=1.0${extra}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  if (sc.tod) await page.evaluate((t) => window.__game.applyTimeOfDay(t), sc.tod);
  if (sc.wet !== undefined) await page.evaluate((w) => window.__game.applyWet(w), sc.wet);
  await page.evaluate((pl) => {
    const g = window.__game;
    const path = g.world.paths[pl.path];
    g.physics.placeOnPath(path, pl.u, pl.kmh / 3.6);
    if (pl.follow) g.physics.followPath(path, pl.follow); else g.physics.clearPath();
    g.traffic.reset(g.physics.state.pos);
    g.camRig.snap();
  }, sc.place);
  if (KILL) {
    if (!KILLS[KILL]) throw new Error('unknown kill ' + KILL);
    await page.evaluate(`(${KILLS[KILL].toString()})()`);
  }
  for (const k of sc.hold) await page.keyboard.down(k);
  await sleep(WARM);
  const p0 = await page.evaluate(() => ({ ...window.__game.physics.state.pos }));
  await page.evaluate(() => window.__game.frameStats.reset());
  await sleep(MEAS);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    const s = g.frameStats.stats();
    return { s, raw: g.frameStats.samples ? g.frameStats.samples() : null, rs: g.renderSize(),
      glW: gl.drawingBufferWidth, glH: gl.drawingBufferHeight,
      pr: g.renderer.getPixelRatio(), dpr: window.devicePixelRatio,
      paused: g.isPaused(), pos: { ...g.physics.state.pos },
      kmh: Math.abs(g.physics.state.speed) * 3.6,
      canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.id || 'anon'}:${c.width}x${c.height}`).join(' '),
      hudPath: g.hudPath ? g.hudPath() : null,
      hudVisible: g.hud.visible,
      progs: g.renderer.info.programs.length };
  });
  if (r.glW !== 1280 || r.glH !== 720 || r.pr !== 1 || r.dpr !== DSF) {
    throw new Error(`BUFFER IS NOT 1280x720 ratio 1 dpr ${DSF}: ${JSON.stringify({ glW: r.glW, glH: r.glH, pr: r.pr, dpr: r.dpr })}`);
  }
  if (WANT) {
    const inFrame = !!(r.hudPath && r.hudPath.inFrame && !r.hudPath.inDocument);
    if (WANT === 'in' && !inFrame) throw new Error('WANTED the in-frame HUD, got ' + JSON.stringify(r.hudPath));
    if (WANT === 'dom' && inFrame) throw new Error('WANTED the DOM-layer HUD, got ' + JSON.stringify(r.hudPath));
  }
  let merged = null;
  if (r.raw && r.raw.length) {
    const m = [];
    for (const d of r.raw) { if (d < 3.5 && m.length) m[m.length - 1] += d; else m.push(d); }
    const sorted = [...m].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const total = m.reduce((a, b) => a + b, 0);
    merged = { n: m.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: sorted[sorted.length - 1],
      fps: (m.length / total) * 1000, over: (m.filter((d) => d > 16.7).length / m.length) * 100 };
  }
  const dist = Math.hypot(r.pos.x - p0.x, r.pos.z - p0.z);
  out.push({ ...r.s, merged, dist });
  const M = merged || {};
  console.log(`run ${i + 1}: p50 ${r.s.p50.toFixed(2)} | merged p50 ${(M.p50 || 0).toFixed(2)} p90 ${(M.p90 || 0).toFixed(1)} p99 ${(M.p99 || 0).toFixed(1)} max ${(M.max || 0).toFixed(1)} | ${(M.fps || 0).toFixed(1)} fps delivered | ${(M.over || 0).toFixed(1)}% over 16.7 | n ${M.n}/${r.s.n} | ${dist.toFixed(0)} m at ${r.kmh.toFixed(0)} km/h | progs ${r.progs} | renderSize ${JSON.stringify(r.rs)} glDrawingBuffer ${r.glW}x${r.glH} paused ${r.paused}`);
  if (PROBE) console.log(`  canvases ${r.canvases} | hudVisible ${r.hudVisible} | hudPath ${JSON.stringify(r.hudPath)}`);
  if (errs.length) console.log('  ERRORS: ' + errs.slice(0, 4).join(' | '));
  await stopOsc();
  await page.close();
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mp50 = out.map((o) => o.merged.p50), fps = out.map((o) => o.merged.fps),
  over = out.map((o) => o.merged.over), p99 = out.map((o) => o.merged.p99);
console.log(`\nSUMMARY ${SCEN} hash=${extra || 'none'} kill=${KILL || 'none'}: p50 ${mp50.map((v) => v.toFixed(2)).join(' / ')} -> median ${med(mp50).toFixed(2)} ms | fps ${fps.map((v) => v.toFixed(1)).join(' / ')} -> ${med(fps).toFixed(1)} | over16.7 ${over.map((v) => v.toFixed(1)).join(' / ')}% -> ${med(over).toFixed(1)}% | p99 ${p99.map((v) => v.toFixed(1)).join(' / ')} -> ${med(p99).toFixed(1)} ms | 1280x720 ratio 1 dpr ${DSF} resScale 1`);
await browser.close(); server.close(); process.exit(0);
