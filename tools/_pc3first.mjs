// wave-s/perf-critic-r3 — the first playable second, with kill-controls on the CAUSES.
// Same ring placement as tools/_perfcritic-r2-first.mjs (addInitScript, whole document life,
// __ready wall time, frames + worst delta in the 700 ms after it) plus:
//   --stubaudio 1   replace audio.start with a no-op AFTER __ready and BEFORE the first key.
//                   Kill-control for perf-r3's cause 2.
//   --hash <extra>  extra URL hash params, e.g. audiowarm=0 to disable the prewarm on HEAD.
//   --nokey 1       never press a key at all: separates the GPU-residency stall from the
//                   keydown/audio stall, because only one of the two needs an input.
// usage: node tools/_pc3first.mjs --root <dir> --label X --repeat 4 [--stubaudio 1] [--hash audiowarm=0]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const ROOT = resolve(arg('root', 'game'));
const LABEL = arg('label', 'run');
const REPEAT = +arg('repeat', 4);
const WIN = +arg('win', 700);
const STUB = arg('stubaudio', '') === '1';
const NOKEY = arg('nokey', '') === '1';
const EXTRA = arg('hash', '');

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

console.log(`# ${LABEL} root=${ROOT} win=${WIN} stubaudio=${STUB} nokey=${NOKEY} hash="${EXTRA}"`);
let hitches = 0;
for (let i = 0; i < REPEAT; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => {
    window.__first = { t: [], last: performance.now(), readyAt: null, long: [] };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__first.long.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]); })
        .observe({ entryTypes: ['longtask'] });
    } catch { /* not exposed */ }
    const f = (now) => { const c = window.__first; c.t.push([now, now - c.last]); c.last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    const iv = setInterval(() => {
      if (window.__ready === true && window.__first.readyAt === null) {
        window.__first.readyAt = performance.now(); clearInterval(iv);
      }
    }, 4);
  });
  const hash = `#nomenu=1&scene=dusk-highway-chase&res=1.0${EXTRA ? '&' + EXTRA : ''}`;
  await page.goto(`http://127.0.0.1:${port}/index.html${hash}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  if (STUB) await page.evaluate(() => { window.__game.audio.start = () => {}; });
  if (!NOKEY) await page.keyboard.down('KeyW');
  await sleep(2500);
  const r = await page.evaluate((win) => {
    const c = window.__first;
    const r0 = c.readyAt;
    const inWin = c.t.filter(([n]) => n >= r0 && n < r0 + win);
    const maxIn = inWin.reduce((m, [, d]) => Math.max(m, d), 0);
    const first12 = c.t.filter(([n]) => n >= r0).slice(0, 12).map(([, d]) => +d.toFixed(1));
    return { readyAt: r0, framesInWin: inWin.length, maxDeltaInWin: +maxIn.toFixed(1), first12,
      progs: window.__game.renderer.info.programs.length,
      warmStats: window.__warmStats || null,
      audioWarmMs: window.__audioWarmMs === undefined ? null : window.__audioWarmMs,
      audioRunning: (() => { try { return window.__game.audio.info().running; } catch { return null; } })(),
      longNearReady: c.long.filter((x) => x[0] > r0 - 100 && x[0] < r0 + win).slice(0, 6) };
  }, WIN);
  if (r.maxDeltaInWin > 100) hitches++;
  console.log(`run ${i + 1}: __ready ${r.readyAt.toFixed(0)} ms | frames in first ${WIN} ms = ${r.framesInWin} | max delta ${r.maxDeltaInWin} ms | progs ${r.progs} | warmStats ${JSON.stringify(r.warmStats)} | audioWarmMs ${r.audioWarmMs} | audioRunning ${r.audioRunning}`);
  console.log(`   first 12: ${r.first12.join(', ')}`);
  console.log(`   longtasks near ready: ${JSON.stringify(r.longNearReady)}`);
  if (errs.length) console.log('   ERRORS: ' + errs.slice(0, 4).join(' | '));
  await page.close();
}
console.log(`\n${LABEL}: ${hitches} of ${REPEAT} boots hitched (max delta > 100 ms in the first ${WIN} ms after __ready)`);
await browser.close(); server.close(); process.exit(0);
