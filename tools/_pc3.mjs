// wave-s/perf-critic-r3 — MY OWN instrument. I trust nothing in the builder's tool.
//
// Differences from tools/_perfr3.mjs that matter:
//   - the frame ring is MINE, installed in addInitScript before any page script runs, and lives
//     for the whole life of the document. window.__frameStats is read too and the two p50s are
//     printed side by side; if they disagree, one of them is broken.
//   - gl.drawingBufferWidth/Height is read off the DRIVER at the END of the window and the run
//     THROWS if it is not what was asked for.
//   - metres driven inside the window are printed, because a parked car is the cheapest fake.
//   - the HUD's own 2-D canvas size is printed per run (that is a shipped claim this round).
//
// usage: node tools/_pc3.mjs --root <gameDir> --scenario city --repeat 3 [--kill NAME] [--dsf 2]
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
  // revert perf-r3's sky reorder at runtime: the paired A/B for that change
  'sky-old': () => { const m = window.__game.sky.skyMesh; m.renderOrder = -1000; m.material.depthTest = false; m.material.needsUpdate = true; },
  // apply perf-r3's sky reorder at runtime (for use on the BEFORE tree)
  'sky-new': () => { const m = window.__game.sky.skyMesh; m.renderOrder = 1000; m.material.depthTest = true; m.material.needsUpdate = true; },
  'sky-off': () => { const m = window.__game.sky.skyMesh; if (m) m.visible = false; },
  'hud-off': () => { const h = window.__game.hud; if (h.setVisible) h.setVisible(false); if (h.group) h.group.visible = false; },
  'shadow-1024': () => { const sh = window.__game.sky.sun.shadow; sh.mapSize.set(1024, 1024); if (sh.map) { sh.map.dispose(); sh.map = null; } },
  'shadow-4096': () => { const sh = window.__game.sky.sun.shadow; sh.mapSize.set(4096, 4096); if (sh.map) { sh.map.dispose(); sh.map = null; } },
  'shadows-off': () => { window.__game.renderer.shadowMap.enabled = false; window.__game.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); }); },
  // undo perf-r3's one-raster-per-frame gate at runtime: back to three's per-render update
  'shadow-multi': () => { window.__game.renderer.shadowMap.autoUpdate = true; },
  // force the pre-r3 HUD backing store at runtime (only meaningful at dsf 2)
  'hud-dpr2': () => { const h = window.__game.hud; const c = document.querySelector('#hud canvas') || document.querySelectorAll('canvas')[1]; window.__forceHudDpr = 2; if (h.resize) { /* resize recomputes from devicePixelRatio; patch the canvas directly */ } if (c) { c.width = 2560; c.height = 1440; } },
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
console.log(`# _pc3 root=${ROOT} scenario=${SCEN} kill=${KILL || 'none'} dsf=${DSF} warm=${WARM} meas=${MEAS} repeat=${REPEAT} ${LABEL}`);
const rows = [];
for (let i = 0; i < REPEAT; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  // MY ring. Installed before any page script; independent of window.__frameStats.
  await page.addInitScript(() => {
    window.__mine = { d: [], last: performance.now(), mark: null };
    const f = (now) => {
      const c = window.__mine;
      c.d.push(now - c.last); c.last = now;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    window.__mineMark = () => { window.__mine.mark = window.__mine.d.length; };
  });
  const stopOsc = startOscillator(page, sc.oscillate);
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&res=1.0`, { waitUntil: 'load' });
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
    const sh = g.sky.sun.shadow;
    return {
      mine: window.__mine.d.slice(window.__mine.mark),
      fsRaw: g.frameStats.samples ? g.frameStats.samples() : null,
      fs: g.frameStats.stats(),
      rs: g.renderSize(), glW: gl.drawingBufferWidth, glH: gl.drawingBufferHeight,
      pr: g.renderer.getPixelRatio(), dpr: window.devicePixelRatio,
      paused: g.isPaused(), pos: { ...g.physics.state.pos },
      kmh: Math.abs(g.physics.state.speed) * 3.6,
      canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.width}x${c.height}`).join(' '),
      shadow: `${sh.mapSize.x}x${sh.mapSize.y} enabled=${g.renderer.shadowMap.enabled} auto=${g.renderer.shadowMap.autoUpdate}`,
      skyOrder: `${g.sky.skyMesh.renderOrder} depthTest=${g.sky.skyMesh.material.depthTest}`,
      progs: g.renderer.info.programs.length,
      resScale: g.getResScale ? g.getResScale() : null,
    };
  });
  if (r.glW !== 1280 || r.glH !== 720 || r.pr !== 1 || r.dpr !== DSF || r.paused) {
    throw new Error('BUFFER/STATE WRONG: ' + JSON.stringify({ glW: r.glW, glH: r.glH, pr: r.pr, dpr: r.dpr, paused: r.paused }));
  }
  const mine = derive(r.mine);
  const fs = r.fsRaw ? derive(r.fsRaw) : null;
  const dist = Math.hypot(r.pos.x - p0.x, r.pos.z - p0.z);
  rows.push({ mine, fs, dist });
  console.log(`run ${i + 1}: MINE p50 ${mine.p50.toFixed(2)} p90 ${mine.p90.toFixed(1)} p99 ${mine.p99.toFixed(1)} max ${mine.max.toFixed(1)} | ${mine.fps.toFixed(1)} fps delivered | ${mine.over.toFixed(1)}% over 16.7 | n ${mine.n}/${mine.raw}`);
  console.log(`        __frameStats p50 ${fs ? fs.p50.toFixed(2) : 'n/a'} fps ${fs ? fs.fps.toFixed(1) : ''} over ${fs ? fs.over.toFixed(1) : ''}% | drove ${dist.toFixed(0)} m at ${r.kmh.toFixed(0)} km/h | gl ${r.glW}x${r.glH} pr ${r.pr} dpr ${r.dpr} resScale ${r.resScale} | canvases ${r.canvases} | shadow ${r.shadow} | sky ${r.skyOrder} | progs ${r.progs}`);
  if (errs.length) console.log('  ERRORS: ' + errs.slice(0, 4).join(' | '));
  await stopOsc();
  await page.close();
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const g = (k) => rows.map((r) => r.mine[k]);
console.log(`\nSUMMARY ${SCEN} kill=${KILL || 'none'} dsf=${DSF} ${LABEL}: p50 ${g('p50').map((v) => v.toFixed(2)).join(' / ')} -> ${med(g('p50')).toFixed(2)} ms | fps ${g('fps').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('fps')).toFixed(1)} | over16.7 ${g('over').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('over')).toFixed(1)}% | p99 ${g('p99').map((v) => v.toFixed(1)).join(' / ')} -> ${med(g('p99')).toFixed(1)} | max -> ${med(g('max')).toFixed(1)} | drove ${rows.map((r) => r.dist.toFixed(0)).join('/')} m`);
await browser.close(); server.close(); process.exit(0);
