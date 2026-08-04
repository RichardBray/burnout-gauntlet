// wave-s perf-r4 — WHERE THE HUD'S REDRAW ACTUALLY GOES, per widget.
//
// perf-r3 section 7b measured hud.update at 1.84 ms of CPU per frame and enumerated the canvas ops
// (2127 lineTo, 199 strokeText, 118 fillText, 86 measureText, 39 drawImage, 14 filter per frame,
// for a speedometer) but never attributed them to a widget. This drives the real game, brackets
// each of the seven draw calls inside hud.js's draw() and prints ms/frame per widget.
//
// A CPU bracket is NOT a valid way to measure a 15 ms frame (GPU work is pipelined; see
// WAVE-S-PLAY-BRIEF) but it IS valid for main-thread 2-D canvas work, which is all this measures,
// and every attribution it produces is confirmed with a kill-control before it is claimed.
//
// Requires the temporary __hudProf bracket in hud.js's draw(). It reports `bracket absent` and
// exits non-zero if that is not present, so it can never silently print zeros.
//
// usage: node tools/_hudprof.mjs [--scenario city] [--secs 6]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SCEN = arg('scenario', 'cruise');
const SECS = +arg('secs', 6);
const ROOT = resolve(arg('root', 'game'));
const HASH = arg('hash', '');

const PLACE = {
  cruise: { path: 'highway', u: 0.30, kmh: 232, follow: 26 },
  city: { path: 'city', u: 0.34, kmh: 150, follow: 26 },
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => { window.__hudProf = {}; });
const extra = HASH ? '&' + String(HASH).replace(/^[#&]/, '') : '';
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&res=1.0${extra}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
await page.evaluate((pl) => {
  const g = window.__game;
  const path = g.world.paths[pl.path];
  g.physics.placeOnPath(path, pl.u, pl.kmh / 3.6);
  g.physics.followPath(path, pl.follow);
  g.traffic.reset(g.physics.state.pos);
  g.camRig.snap();
}, PLACE[SCEN]);
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 3000));
// also count the canvas ops per frame, by counting calls on the 2-D context prototype
await page.evaluate(() => {
  window.__hudProf = {};
  window.__ops = {};
  const P = CanvasRenderingContext2D.prototype;
  for (const k of ['lineTo', 'moveTo', 'arcTo', 'arc', 'fill', 'stroke', 'fillText', 'strokeText',
    'measureText', 'drawImage', 'createLinearGradient', 'createRadialGradient', 'save', 'clip',
    'fillRect', 'clearRect', 'putImageData', 'getImageData', 'beginPath', 'setTransform']) {
    const o = P[k];
    if (typeof o !== 'function' || o.__wrapped) return;
    P[k] = function (...a) { window.__ops[k] = (window.__ops[k] || 0) + 1; return o.apply(this, a); };
    P[k].__wrapped = true;
  }
  const fd = Object.getOwnPropertyDescriptor(P, 'filter');
  if (fd && fd.set) {
    Object.defineProperty(P, 'filter', { ...fd,
      set(v) { window.__ops.filter = (window.__ops.filter || 0) + 1; fd.set.call(this, v); } });
  }
});
await new Promise((r) => setTimeout(r, SECS * 1000));
const r = await page.evaluate(() => ({ prof: window.__hudProf, ops: window.__ops,
  rs: window.__game.renderSize(), hudPath: window.__game.hudPath ? window.__game.hudPath() : null }));
await page.keyboard.up('KeyW');
if (!r.prof || !r.prof.n) {
  console.error('bracket absent: hud.js draw() is not instrumented (window.__hudProf never filled)');
  await browser.close(); server.close(); process.exit(2);
}
const n = r.prof.n;
console.log(`# hud redraw profile, scenario=${SCEN}, ${n} draws, renderSize ${JSON.stringify(r.rs)}`);
console.log(`# hudPath ${JSON.stringify(r.hudPath)}`);
const rows = Object.entries(r.prof).filter(([k]) => k !== 'n')
  .map(([k, v]) => [k, v / n]).sort((a, b) => b[1] - a[1]);
const tot = rows.reduce((a, b) => a + b[1], 0);
for (const [k, v] of rows) console.log(`  ${k.padEnd(14)} ${v.toFixed(3)} ms/frame  ${(100 * v / tot).toFixed(1)}%`);
console.log(`  ${'TOTAL'.padEnd(14)} ${tot.toFixed(3)} ms/frame`);
console.log('# canvas ops per HUD draw (whole-process count / draws):');
console.log('  ' + Object.entries(r.ops).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(v / n).toFixed(0)}`).join('  '));
if (errs.length) console.log('ERRORS: ' + errs.slice(0, 5).join(' | '));
await browser.close(); server.close(); process.exit(0);
