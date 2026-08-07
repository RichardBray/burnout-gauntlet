// Boot the game under a chosen #map mode, evaluate an expression, and optionally render one or
// more cameras. Wave T, S3b. The picture is the acceptance test for this piece and a numeric
// harness cannot take it, so this exists to make "render it and LOOK" cheap enough to do six times.
//
//   node tools/_cityshot.mjs --map graph --expr "window.__game.world.chunkStats()"
//   node tools/_cityshot.mjs --map graph --shots shots/s3b/plan.json
//
// A shot spec is {out, at:[x,z], h, eye, yaw, pitch}. With `eye` set the camera stands at
// (x, eye, z) and looks along `yaw`; otherwise it orbits in at altitude `h` on a 0.75h offset,
// which is `_junctionshot.mjs`'s framing kept identical on purpose so the two are comparable.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const MAP = String(args.map || 'graph');
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
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#scene=${args.scene || 'daytime-downtown'}&shot=1&map=${MAP}${args.extra?'&'+args.extra:''}`,
  { waitUntil: 'load' });
try {
  await page.waitForFunction('window.__ready === true', null, { timeout: +(process.env.BOOT_TIMEOUT||300000) });
} catch (e) {
  console.log(`BOOT FAILED after ${Date.now() - t0} ms; errors: ${errors.slice(0, 6).join(' | ') || '(none)'}`);
  await browser.close(); server.close(); process.exit(1);
}
console.log(`booted ${MAP} in ${Date.now() - t0} ms; console errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 8).join('\n'));

if (args.expr) {
  const v = await page.evaluate(`(() => { const r = (${args.expr}); return JSON.stringify(r, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? +x.toFixed(4) : x)); })()`);
  console.log(v);
}
if (args.exprfile) {
  const src = await readFile(resolve(args.exprfile), 'utf8');
  const v = await page.evaluate(`(() => { const r = (${src}); return JSON.stringify(r, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? +x.toFixed(4) : x)); })()`);
  console.log(v);
}
if (args.shots) {
  const plan = JSON.parse(await readFile(resolve(args.shots), 'utf8'));
  for (const s of plan) {
    await page.evaluate((sp) => {
      const g = window.__game;
      const [x, z] = sp.at;
      if (sp.eye != null) {
        const yaw = (sp.yaw || 0) * Math.PI / 180;
        g.camera.position.set(x, sp.eye, z);
        g.camera.lookAt(x + Math.sin(yaw) * 100, sp.eye + (sp.pitch || 0) * 100, z + Math.cos(yaw) * 100);
      } else {
        const h = sp.h || 120;
        g.camera.position.set(x + h * 0.75, h, z + h * 0.75);
        g.camera.lookAt(x, 0, z);
      }
      g.camera.updateMatrixWorld(true);
      g.scene.updateMatrixWorld(true);
      for (let i = 0; i < 3; i++) g.composer.render();
    }, s);
    const out = resolve(s.out);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`  shot ${out}`);
  }
}
if (args.dump) await writeFile(resolve(args.dump), errors.join('\n'));
console.log(`done; total console errors: ${errors.length}`);
await browser.close(); server.close();
