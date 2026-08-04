// wave-s perf-critic-r2 — the FIRST PLAYABLE SECOND. My own instrument.
// Installs a rAF ring from the document's very first script evaluation (before boot() resolves),
// records __ready's wall time, then reports how many frames were delivered in the first N ms
// AFTER __ready and how long the largest single delta in that span was.
// usage: node tools/_perfcritic-r2-first.mjs <gameRoot> <label> [repeat] [windowMs]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.argv[2]);
const LABEL = process.argv[3] || 'run';
const REPEAT = +(process.argv[4] || 2);
const WIN = +(process.argv[5] || 700);

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
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`# ${LABEL} root=${root} window=${WIN}ms`);
for (let i = 0; i < REPEAT; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  // runs before any page script: one rAF ring for the WHOLE life of the document
  await page.addInitScript(() => {
    window.__first = { t: [], last: performance.now(), readyAt: null };
    const f = (now) => { const c = window.__first;
      c.t.push([now, now - c.last]); c.last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const iv = setInterval(() => {
      if (window.__ready === true && window.__first.readyAt === null) {
        window.__first.readyAt = performance.now(); clearInterval(iv);
      }
    }, 4);
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=dusk-highway-chase&res=1.0`,
    { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  await page.keyboard.down('KeyW');
  await sleep(2500);
  const r = await page.evaluate((win) => {
    const c = window.__first;
    const r0 = c.readyAt;
    const inWin = c.t.filter(([n]) => n >= r0 && n < r0 + win);
    const before = c.t.filter(([n]) => n < r0);
    const maxIn = inWin.reduce((m, [, d]) => Math.max(m, d), 0);
    const first10 = c.t.filter(([n]) => n >= r0).slice(0, 12).map(([, d]) => +d.toFixed(1));
    return { readyAt: r0, framesBeforeReady: before.length, framesInWin: inWin.length,
      maxDeltaInWin: +maxIn.toFixed(1), first12Deltas: first10,
      progs: window.__game.renderer.info.programs.length };
  }, WIN);
  console.log(`run ${i + 1}: __ready at ${r.readyAt.toFixed(0)} ms | frames in first ${WIN} ms after ready = ${r.framesInWin} | max delta in that window ${r.maxDeltaInWin} ms | progs ${r.progs}`);
  console.log(`   first 12 deltas after ready: ${r.first12Deltas.join(', ')}`);
  if (errs.length) console.log('   ERRORS: ' + errs.slice(0, 4).join(' | '));
  await page.close();
}
await browser.close(); server.close(); process.exit(0);
