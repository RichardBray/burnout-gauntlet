// wave-s/perf-critic-r4 — MY OWN instrument. Derived from tools/_pc3.mjs (the round-3 critic's),
// which is left unmodified. I trust nothing in the builder's tool.
//
//   - the frame ring is MINE, installed in addInitScript before any page script runs. Both my p50
//     and window.__frameStats's are printed on every run; if they disagree one of them is broken.
//   - gl.drawingBufferWidth/Height, renderer.getPixelRatio(), devicePixelRatio, resScale and
//     isPaused() are read off the DRIVER at the END of every window and the run THROWS if any of
//     them is not what was asked for.
//   - metres driven inside the window are printed (a parked car is the cheapest fake).
//   - hudPath() AND the real DOM state (canvas.parentNode, every canvas backing store) are printed
//     per run, and --want in|dom throws rather than printing a number for the wrong route.
//
// THE KILL-CONTROL THE BUILDER DID NOT HAVE: `hud-cheapdraw`. The builder's refutation rests on
// "layer present but NOT REDRAWN costs 0.00 ms", which cannot distinguish "compositing a dirty
// full-screen layer is free" from "Chrome skips a layer whose pixels never change". `hud-cheapdraw`
// keeps the layer in the document and DIRTIES IT EVERY FRAME with a trivial raster (one clearRect
// plus one 40 px fillRect that moves), so the compositor must re-raster, re-upload and re-composite
// a changed full-screen layer every frame while the expensive HUD drawing is gone. That is the cell
// that decides whether the HUD's 2.5 ms is its own drawing or the price of a changing layer.
//
// usage: node tools/_pc4.mjs --root <gameDir> --scenario cruise --repeat 3 [--kill NAME]
//                            [--hash hudgl=1] [--dsf 2] [--want in|dom] [--label ...]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const REPEAT = +arg('repeat', 3);
const SCEN = arg('scenario', 'cruise');
const KILL = arg('kill', '');
const WARM = +arg('warm', 3500);
const MEAS = +arg('meas', 8000);
const ROOT = resolve(arg('root', 'game'));
const DSF = +arg('dsf', 1);
const HASH = arg('hash', '');
const WANT = arg('want', '');
const LABEL = arg('label', '');

// scenario table copied verbatim from tools/fps.mjs:85-121
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
  // the HUD stops drawing AND stops compositing: the ceiling of what any HUD work can be worth.
  'hud-off': () => { const h = window.__game.hud; if (h.setVisible) h.setVisible(false); },
  // layer present, pixels frozen after the first frame (the builder's row 3).
  'hud-draw-off': () => {
    const h = window.__game.hud;
    const ou = h.update.bind(h);
    let done = false;
    h.update = function (dt, s) { if (!done) { done = true; return ou(dt, s); } };
  },
  // MY cell: layer present AND DIRTY every frame, with the expensive drawing gone.
  'hud-cheapdraw': () => {
    const h = window.__game.hud;
    const c = h.canvas.getContext('2d');
    let n = 0;
    window.__cheap = 0;
    h.update = function () {
      const w = h.canvas.width, ht = h.canvas.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, ht);
      c.fillStyle = 'rgba(255,40,40,0.5)';
      c.fillRect(0, (n++ % 2) ? ht - 60 : ht - 61, w, 40);
      window.__cheap++;
    };
  },
};

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
      while (!stop && Date.now() - t0 < osc.halfPeriodMs) await sleep(40);
      i++;
    }
    try { for (const k of osc.keys) await page.keyboard.up(k); } catch { /* gone */ }
  })();
  return async () => { stop = true; await loop; };
}

function derive(deltas) {
  const m = [];
  for (const d of deltas) { if (d < 3.5 && m.length) m[m.length - 1] += d; else m.push(d); }
  const s = [...m].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const total = m.reduce((a, b) => a + b, 0);
  return { n: m.length, raw: deltas.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
    max: s[s.length - 1], fps: (m.length / total) * 1000,
    over: (m.filter((d) => d > 16.7).length / m.length) * 100 };
}

const sc = SCENARIOS[SCEN];
if (!sc) throw new Error('unknown scenario ' + SCEN);
const extra = HASH ? '&' + String(HASH).replace(/^[#&]/, '') : '';
console.log(`# _pc4 root=${ROOT} scenario=${SCEN} hash=${extra || '(none)'} kill=${KILL || 'none'} dsf=${DSF} warm=${WARM} meas=${MEAS} repeat=${REPEAT} ${LABEL}`);
const rows = [];
for (let i = 0; i < REPEAT; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => {
    window.__mine = { d: [], last: performance.now(), mark: null };
    const f = (now) => { const c = window.__mine; c.d.push(now - c.last); c.last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    window.__mineMark = () => { window.__mine.mark = window.__mine.d.length; };
  });
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
  await page.evaluate(() => { window.__mineMark(); window.__game.frameStats.reset(); });
  await sleep(MEAS);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const gl = g.renderer.getContext();
    return {
      mine: window.__mine.d.slice(window.__mine.mark),
      fsRaw: g.frameStats.samples ? g.frameStats.samples() : null,
      fs: g.frameStats.stats(),
      rs: g.renderSize(), glW: gl.drawingBufferWidth, glH: gl.drawingBufferHeight,
      pr: g.renderer.getPixelRatio(), dpr: window.devicePixelRatio,
      paused: g.isPaused(), pos: { ...g.physics.state.pos },
      kmh: Math.abs(g.physics.state.speed) * 3.6,
      canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.width}x${c.height}`).join(' '),
      hudPath: g.hudPath ? g.hudPath() : null,
      hudInDoc: !!g.hud.canvas.parentNode,
      hudCanvas: `${g.hud.canvas.width}x${g.hud.canvas.height}`,
      hudVisible: g.hud.visible,
      hudGen: g.hud.generation === undefined ? null : g.hud.generation,
      cheap: window.__cheap === undefined ? null : window.__cheap,
      progs: g.renderer.info.programs.length,
      resScale: g.getResScale ? g.getResScale() : null,
    };
  });
  if (r.glW !== 1280 || r.glH !== 720 || r.pr !== 1 || r.dpr !== DSF || r.paused || r.resScale !== 1) {
    throw new Error('BUFFER/STATE WRONG: ' + JSON.stringify({ glW: r.glW, glH: r.glH, pr: r.pr, dpr: r.dpr, paused: r.paused, resScale: r.resScale }));
  }
  if (WANT) {
    const inFrame = !!(r.hudPath && r.hudPath.inFrame) && !r.hudInDoc;
    if (WANT === 'in' && !inFrame) throw new Error('WANTED the in-frame HUD, got ' + JSON.stringify({ hudPath: r.hudPath, inDoc: r.hudInDoc }));
    if (WANT === 'dom' && (inFrame || !r.hudInDoc)) throw new Error('WANTED the DOM-layer HUD, got ' + JSON.stringify({ hudPath: r.hudPath, inDoc: r.hudInDoc }));
  }
  const mine = derive(r.mine);
  const fs = r.fsRaw ? derive(r.fsRaw) : null;
  const dist = Math.hypot(r.pos.x - p0.x, r.pos.z - p0.z);
  rows.push({ mine, fs, dist });
  console.log(`run ${i + 1}: MINE p50 ${mine.p50.toFixed(2)} p90 ${mine.p90.toFixed(1)} p99 ${mine.p99.toFixed(1)} max ${mine.max.toFixed(1)} | ${mine.fps.toFixed(1)} fps delivered | ${mine.over.toFixed(1)}% over 16.7 | n ${mine.n}/${mine.raw}`);
  console.log(`        __frameStats p50 ${fs ? fs.p50.toFixed(2) : 'n/a'} fps ${fs ? fs.fps.toFixed(1) : ''} over ${fs ? fs.over.toFixed(1) : ''}% | drove ${dist.toFixed(0)} m at ${r.kmh.toFixed(0)} km/h | gl ${r.glW}x${r.glH} pr ${r.pr} dpr ${r.dpr} resScale ${r.resScale} | canvases ${r.canvases} | progs ${r.progs}`);
  console.log(`        hudCanvas ${r.hudCanvas} inDocument ${r.hudInDoc} visible ${r.hudVisible} gen ${r.hudGen} cheapDraws ${r.cheap} | hudPath ${JSON.stringify(r.hudPath)} | renderSize ${JSON.stringify(r.rs)}`);
  if (errs.length) console.log('  ERRORS: ' + errs.slice(0, 4).join(' | '));
  await stopOsc();
  await page.close();
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const g = (k) => rows.map((r) => r.mine[k]);
console.log(`\nSUMMARY ${SCEN} root=${ROOT} hash=${extra || 'none'} kill=${KILL || 'none'} dsf=${DSF} ${LABEL}: p50 ${g('p50').map((v) => v.toFixed(2)).join(' / ')} -> ${med(g('p50')).toFixed(2)} ms | fps ${g('fps').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('fps')).toFixed(1)} | over16.7 ${g('over').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('over')).toFixed(1)}% | p99 ${g('p99').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('p99')).toFixed(1)} | drove ${rows.map((r) => r.dist.toFixed(0)).join('/')} m | 1280x720 ratio 1 dpr ${DSF} resScale 1`);
await browser.close(); server.close(); process.exit(0);
