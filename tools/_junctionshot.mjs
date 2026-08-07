// Point the camera at a world coordinate under #map=graph and screenshot it. Wave T, S3a.
//   node tools/_junctionshot.mjs --at -1246.7,116.9 --h 140 --out /tmp/j9.png
// Junction geometry is the part of `generate-mesh` that no numeric check can accept: a retreat
// distance and a triangle count are both perfectly happy on a polygon that looks like a torn bag.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const [AX, AZ] = String(args.at || '0,0').split(',').map(Number);
const H = +(args.h || 120), OUT = resolve(args.out || 'shots/junction.png');
const W = +(args.w || 1280), HT = +(args.ht || 720);
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = join(root, p === '/' ? '/index.html' : p);
    if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(await readFile(f));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: W, height: HT }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#scene=daytime-downtown&shot=1&map=graph`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await page.evaluate(([x, z, h]) => {
  const g = window.__game;
  g.camera.position.set(x + h * 0.75, h, z + h * 0.75);
  g.camera.lookAt(x, 0, z);
  g.camera.updateMatrixWorld(true);
  g.scene.updateMatrixWorld(true);
  for (let i = 0; i < 3; i++) g.composer.render();
}, [AX, AZ, H]);
await mkdir(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
console.log(`ok ${OUT}${errors.length ? `  ERRORS: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close(); server.close();
