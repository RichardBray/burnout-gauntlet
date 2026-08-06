// T2: name the geometry under a screen pixel. Boots a scene the same way shot.mjs does,
// then raycasts the render camera through normalised device coords and prints the hit
// chain (object name, type, material, parent) so a suspect quad in a screenshot can be
// traced back to the code that made it.
//
//   node tools/_pickpx.mjs --scene wet-night-asphalt --px 0.78 --py 0.86
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true])
);
const scene = args.scene || 'wet-night-asphalt';
const px = +(args.px ?? 0.5), py = +(args.py ?? 0.5);
const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

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

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const hits = await page.evaluate(async ([ndcX, ndcY]) => {
  // `window.__THREE__` is three's own revision STRING, not the namespace, so import it.
  // The page's importmap resolves the bare specifier to the same build the game uses.
  const T = await import('three');
  const g = window.__game;
  const cam = g.camera || g.camRig?.camera;
  const rc = new T.Raycaster();
  rc.setFromCamera(new T.Vector2(ndcX * 2 - 1, -(ndcY * 2 - 1)), cam);
  // Instanced meshes report instanceId, which is what pins the hit to one push() call.
  return rc.intersectObject(g.scene, true).slice(0, 8).map((h) => {
    const chain = [];
    for (let o = h.object; o; o = o.parent) chain.push(o.name || o.type);
    return {
      dist: +h.distance.toFixed(2),
      point: h.point.toArray().map((v) => +v.toFixed(2)),
      type: h.object.type,
      instanceId: h.instanceId ?? null,
      count: h.object.count ?? null,
      material: h.object.material?.type + ' ' + (h.object.material?.color?.getHexString?.() || ''),
      geometry: h.object.geometry?.type,
      // The instance's own scale is what pins an oversized quad to the push() that made it.
      xform: (() => {
        if (h.instanceId == null) return null;
        const m = new T.Matrix4(); h.object.getMatrixAt(h.instanceId, m);
        const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
        m.decompose(p, q, s);
        return { pos: p.toArray().map((v) => +v.toFixed(2)), scale: s.toArray().map((v) => +v.toFixed(2)) };
      })(),
      chain: chain.slice(0, 5).join(' < '),
    };
  });
}, [px, py]);
console.log(JSON.stringify(hits, null, 2));
await browser.close();
server.close();
process.exit(0);
