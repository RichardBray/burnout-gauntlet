// _propmeas.mjs — INDEPENDENT prop-lead measurement for damage.js.
//
// Why this exists: `applyCrushToRigids` *sets* the prop's z so that
// (front - footSkinZ(box)) equals its rest value, where footSkinZ is the z-MAX of the
// skin inside the prop's (x, y) bounding box. Any metric built on that same z-MAX
// therefore reads 0 by construction and measures nothing (wave-K finding). This tool
// measures a DIFFERENT statistic: the prop footprint is cut into NxN cells, each cell's
// own skin z-max is taken, and the per-cell lead (prop front z - cell skin z-max) is
// compared against the same per-cell lead at rest. A grille pinned to one surviving high
// point while the rest of the fascia folds away shows up here as a large positive median.
//
//   node tools/_propmeas.mjs --scene daytime-downtown --levels 0,0.7,0.95 [--cells 5]
//
// Output per prop per level: median / p25 / p75 / min / max cell lead error in mm, plus
// the z-MAX error the setter defines to be zero (printed only to show it is zero).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; })
);
const scene = args.scene || 'daytime-downtown';
const levels = String(args.levels || '0,0.7,0.95').split(',').map(Number);
const cells = +(args.cells || 5);
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[error]', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=${scene}&shot=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const data = await page.evaluate(({ levels, N }) => {
  const g = window.__game, d = g.damage, car = g.car;
  const shell = car.bodyMesh.parent;
  const M4 = shell.matrixWorld.constructor;
  const B3c = (() => {
    const gm = car.bodyMesh.geometry;
    if (!gm.boundingBox) gm.computeBoundingBox();
    return gm.boundingBox.constructor;
  })();

  const props = [];
  const seen = new Set();
  for (const n of car.crushRigids || []) {
    if (!n || n.parent !== shell || seen.has(n)) continue;
    seen.add(n);
    props.push(n);
  }
  const targets = (car.deformTargets || [car.bodyMesh.geometry])
    .filter((t) => t && t.attributes && t.attributes.position);

  const inv = new M4();
  const bb = new B3c();
  const tmp = new M4();
  function geom(n) {
    shell.updateMatrixWorld(true);
    inv.copy(shell.matrixWorld).invert();
    n.updateMatrixWorld(true);
    let front = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    n.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bb.copy(o.geometry.boundingBox).applyMatrix4(tmp.copy(inv).multiply(o.matrixWorld));
      if (bb.max.z > front) front = bb.max.z;
      if (bb.min.x < x0) x0 = bb.min.x;
      if (bb.max.x > x1) x1 = bb.max.x;
      if (bb.min.y < y0) y0 = bb.min.y;
      if (bb.max.y > y1) y1 = bb.max.y;
    });
    return Number.isFinite(front) ? { front, x0, x1, y0, y1 } : null;
  }

  // per-cell skin z-max over the CURRENT (written) vertex arrays
  function cellZ(b, zCut) {
    const out = new Float64Array(N * N).fill(-Infinity);
    const dx = (b.x1 - b.x0) / N, dy = (b.y1 - b.y0) / N;
    for (const t of targets) {
      const arr = t.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        if (x < b.x0 || x > b.x1) continue;
        const y = arr[i + 1];
        if (y < b.y0 || y > b.y1) continue;
        const z = arr[i + 2];
        if (z < zCut) continue;
        let ci = dx > 0 ? Math.floor((x - b.x0) / dx) : 0;
        let cj = dy > 0 ? Math.floor((y - b.y0) / dy) : 0;
        if (ci >= N) ci = N - 1; if (ci < 0) ci = 0;
        if (cj >= N) cj = N - 1; if (cj < 0) cj = 0;
        const k = cj * N + ci;
        if (z > out[k]) out[k] = z;
      }
    }
    return out;
  }
  function zmax(b, zCut) {
    let m = -Infinity;
    for (const t of targets) {
      const arr = t.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        if (x < b.x0 || x > b.x1) continue;
        const y = arr[i + 1];
        if (y < b.y0 || y > b.y1) continue;
        const z = arr[i + 2];
        if (z >= zCut && z > m) m = z;
      }
    }
    return m;
  }

  function snap() {
    const out = [];
    for (const n of props) {
      const b = geom(n);
      if (!b) { out.push(null); continue; }
      const zCut = b.front - 1.20;
      out.push({ front: b.front, cz: Array.from(cellZ(b, zCut)), zm: zmax(b, zCut) });
    }
    return out;
  }

  // The REST footprint cells are the reference: same cell grid indices, so a cell that
  // caught no vertex at rest is dropped from the comparison rather than counted as zero.
  d.reset();
  g.scene.updateMatrixWorld(true);
  const rest = snap();

  const res = { props: props.map((n) => n.name || '(unnamed)'), levels: {} };
  for (const L of levels) {
    d.reset();
    if (L > 0) d.setLevel(L);
    g.scene.updateMatrixWorld(true);
    const now = snap();
    const rows = [];
    for (let p = 0; p < props.length; p++) {
      if (!rest[p] || !now[p]) { rows.push(null); continue; }
      const errs = [];
      for (let k = 0; k < rest[p].cz.length; k++) {
        if (!Number.isFinite(rest[p].cz[k]) || !Number.isFinite(now[p].cz[k])) continue;
        const leadRest = rest[p].front - rest[p].cz[k];
        const leadNow = now[p].front - now[p].cz[k];
        errs.push((leadNow - leadRest) * 1000);
      }
      errs.sort((a, b) => a - b);
      const q = (f) => (errs.length ? errs[Math.min(errs.length - 1, Math.floor(errs.length * f))] : NaN);
      rows.push({
        n: errs.length,
        med: +q(0.5).toFixed(1), p25: +q(0.25).toFixed(1), p75: +q(0.75).toFixed(1),
        min: +(errs[0] || 0).toFixed(1), max: +(errs[errs.length - 1] || 0).toFixed(1),
        zmaxErr: +(((now[p].front - now[p].zm) - (rest[p].front - rest[p].zm)) * 1000).toFixed(1),
      });
    }
    res.levels[L] = rows;
  }
  d.reset();
  return res;
}, { levels, N: cells });

console.log(`props: ${data.props.join(', ')}   cells ${cells}x${cells}`);
for (const [L, rows] of Object.entries(data.levels)) {
  console.log(`L=${L}`);
  rows.forEach((r, i) => {
    if (!r) { console.log(`  ${data.props[i].padEnd(10)} (no geometry)`); return; }
    console.log(`  ${data.props[i].padEnd(10)} n=${String(r.n).padStart(2)} med ${String(r.med).padStart(8)} mm  p25 ${String(r.p25).padStart(8)}  p75 ${String(r.p75).padStart(8)}  min ${String(r.min).padStart(8)}  max ${String(r.max).padStart(8)}  [zMAX ${r.zmaxErr}]`);
  });
}
await browser.close();
server.close();
