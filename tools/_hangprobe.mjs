// Hang probe: boot a scene and, after --at seconds, PAUSE the main thread with the CDP
// debugger and print the JS call stack. `tools/probe.mjs` waits for `window.__ready` before
// it can evaluate anything, so it is useless on a boot that never reaches it.
//
//   node tools/_hangprobe.mjs --scene hud-overlay --hash map=graph --at 20 [--wait 900]
//
// Server, launch flags, MIME table and headers are copied from tools/probe.mjs on purpose;
// keep the harnesses in sync.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'hud-overlay';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const W = +(args.w || 1600), H = +(args.h || 1000);
const AT = +(args.at || 20) * 1000;
const WAIT = +(args.wait || 120) * 1000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[error]', String(e)));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Debugger.enable');
const scripts = new Map();
cdp.on('Debugger.scriptParsed', (s) => scripts.set(s.scriptId, s.url));

const t0 = Date.now();
let ready = false;
page.waitForFunction('window.__ready === true', null, { timeout: WAIT })
  .then(() => { ready = true; console.log(`READY in ${((Date.now() - t0) / 1000).toFixed(1)} s`); })
  .catch(() => {});

const extra = args.hash ? `&${String(args.hash).replace(/^[#&]/, '')}` : '';
page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1${extra}`, { waitUntil: 'load' })
  .catch((e) => console.log('[goto]', String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(AT);
if (!ready) {
  console.log(`--- pausing at ${(AT / 1000).toFixed(0)} s ---`);
  const paused = new Promise((r) => cdp.once('Debugger.paused', r));
  await cdp.send('Debugger.pause');
  const ev = await Promise.race([paused, sleep(15000).then(() => null)]);
  if (!ev) console.log('NO PAUSE EVENT in 15 s (main thread may be idle / in native code)');
  else {
    for (const f of ev.callFrames.slice(0, 30)) {
      const url = (scripts.get(f.location.scriptId) || '?').split('/').pop();
      console.log(`  at ${f.functionName || '(anon)'} (${url}:${f.location.lineNumber + 1}:${f.location.columnNumber})`);
    }
    // Second sample, 3 s later, to tell a loop from a slow linear pass.
    await cdp.send('Debugger.resume');
    await sleep(3000);
    const paused2 = new Promise((r) => cdp.once('Debugger.paused', r));
    await cdp.send('Debugger.pause');
    const ev2 = await Promise.race([paused2, sleep(15000).then(() => null)]);
    console.log('--- second sample, +3 s ---');
    if (!ev2) console.log('NO PAUSE EVENT');
    else for (const f of ev2.callFrames.slice(0, 30)) {
      const url = (scripts.get(f.location.scriptId) || '?').split('/').pop();
      console.log(`  at ${f.functionName || '(anon)'} (${url}:${f.location.lineNumber + 1}:${f.location.columnNumber})`);
    }
    await cdp.send('Debugger.resume').catch(() => {});
  }
}
const err = await page.evaluate(() => {
  const e = document.getElementById('err');
  return { err: e ? e.textContent : null, ready: !!window.__ready, game: !!window.__game };
}).catch((e) => String(e));
console.log('page state:', JSON.stringify(err));
if (!ready) {
  const left = WAIT - (Date.now() - t0);
  if (left > 0) { console.log(`waiting the remaining ${(left / 1000).toFixed(0)} s...`); await sleep(left + 1000); }
  console.log(ready ? `READY (late) at ${((Date.now() - t0) / 1000).toFixed(1)} s` : `STILL NOT READY after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
