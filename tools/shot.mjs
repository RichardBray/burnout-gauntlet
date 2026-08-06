// Screenshot harness. Boots a static server over game/, loads a deterministic
// scene, waits for the game to say it is ready, writes a PNG.
//
//   node tools/shot.mjs --scene dusk-highway-chase --out shots/sky-r01.png
//
// Scene ids are whatever game/scenes.js registers; they mirror the camera
// situations labelled in reference/INDEX.md.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const scene = args.scene || 'dusk-highway-chase';
const out = resolve(args.out || `shots/${scene}.png`);
const W = +(args.w || 1920), H = +(args.h || 1080);
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');

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
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
try {
  // --hash appends extra URL-hash params verbatim, e.g. --hash tone=agx&bloom=dual
  const extra = args.hash ? `&${String(args.hash).replace(/^[#&]/, '')}` : '';
  await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1${extra}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`ok ${out}`);
} catch (e) {
  failed = true;
  console.error(`FAILED ${scene}: ${e.message}`);
  // index.html catches boot failures and writes them to a hidden #err div rather than
  // rethrowing, so a boot that dies mid-tick presents here as a bare 60 s timeout with an
  // empty error list. Read that div before giving up - it holds the real stack.
  const boot = await page.evaluate('document.querySelector("#err")?.textContent || ""').catch(() => '');
  if (boot.trim()) console.error(`boot error (#err):\n${boot.trim()}`);
} finally {
  if (errors.length) console.error('page errors:\n' + errors.slice(0, 20).join('\n'));
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}
