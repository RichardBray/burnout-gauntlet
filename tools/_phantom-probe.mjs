// _phantom-probe.mjs — identify every InstancedMesh with an instance near a parked car,
// before and after hide(), to find the mystery meshes the handoff couldn't name.
//   node tools/_phantom-probe.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=daytime-downtown&res=1`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const g = window.__game;
  const b = g.world.parkedCars.find((c) => !c.gone);
  if (!b) return { fail: 'no parked car' };
  const scan = () => {
    const found = [];
    const m4 = new g.THREE.Matrix4(), v = new g.THREE.Vector3(),
      q = new g.THREE.Quaternion(), sc = new g.THREE.Vector3();
    g.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      let near = 0;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        m4.decompose(v, q, sc);
        if (Math.abs(v.x - b.x) < 3 && Math.abs(v.z - b.z) < 3 && sc.length() > 1e-3) near++;
      }
      if (near) found.push({
        name: o.name || '(unnamed)', count: o.count, cap: o.instanceMatrix.count,
        geo: o.geometry.type, mat: o.material.type,
        color: o.material.color ? '#' + o.material.color.getHexString() : null,
        near,
      });
    });
    return found;
  };
  const before = scan();
  b.hide && b.hide();
  const after = scan();
  return { pos: { x: b.x, z: b.z }, van: !!b.van, before, after };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
