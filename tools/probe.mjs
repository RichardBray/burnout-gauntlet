// Debug probe: boots a scene and evaluates an arbitrary expression in the page.
//   node tools/probe.mjs --scene dusk-highway-chase --expr "..." [--w 1600 --h 1000]
//
// The launch flags, MIME table, COOP/COEP headers and default viewport are deliberately
// IDENTICAL to tools/shot.mjs and tools/damage-shot.mjs. They used to differ, and the
// mismatch made this tool time out on `window.__ready` at 1920x1080 while the other two
// harnesses booted the same page fine — which reads as a broken scene rather than a
// broken tool. Keep the three in sync.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'dusk-highway-chase';
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const W = +(args.w || 1600), H = +(args.h || 1000);
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
// --hash appends extra URL-hash params verbatim, e.g. --hash cap=1080. Same flag, same meaning
// as tools/shot.mjs's; the three harnesses are deliberately kept in sync.
const extra = args.hash ? `&${String(args.hash).replace(/^[#&]/, '')}` : '';
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1${extra}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
const out = await page.evaluate(args.expr || '1');
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
