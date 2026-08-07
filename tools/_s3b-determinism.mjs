// Determinism AND order-independence of the `#map=graph` content build. Wave T, S3b.
//
// WHY BOTH, AND WHY THE SECOND ONE IS THE ONE THAT MATTERS. A build/rebuild test passes on a seed
// that secretly depends on the order things were visited in; S2 ran the permuted version and it
// found that 287 of 288 street-lamp panels were facing the sky, which no rebuild test would ever
// have shown. `world.js`'s `visitOrder()` shuffles every top-level population when
// `globalThis.__t3Perm` is set and is inert otherwise, so this harness sets it before the page
// script runs and compares the result against an unpermuted build.
//
// Every instance is harvested with its OWN world position deciding which cell it counts against -
// not the mesh name, which could lie - and canonicalised as
// `cell | drawState | 16 matrix values | 3 colour values`, sorted. A per-cell FNV-1a digest is
// compared over every cell; the six densest cells are ALSO compared value by value, so the report
// can say how many values were compared rather than only how many hashes matched.
//
//   node tools/_s3b-determinism.mjs
//   node tools/_s3b-determinism.mjs --poison       (control: must report a difference)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
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
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });

const HARVEST = `(([poison]) => {
  const CHUNK = 200;
  const g = window.__game;
  const cells = new Map();
  const m = new Array(16);
  g.scene.updateMatrixWorld(true);
  g.__game_dummy = null;
  const world = g.world.group;
  world.traverse((o) => {
    if (!o.isInstancedMesh) return;
    // A stable draw-state signature. uuids are per-boot and cannot be compared across runs.
    const mat = o.material;
    const geo = o.geometry;
    const ds = [mat.type, mat.color ? mat.color.getHexString() : '-', geo.type,
      geo.attributes.position.count, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0,
      o.renderOrder].join('/');
    const arr = o.instanceMatrix.array;
    const col = o.instanceColor ? o.instanceColor.array : null;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      for (let k = 0; k < 16; k++) m[k] = arr[b + k];
      const cx = Math.floor(m[12] / CHUNK), cz = Math.floor(m[14] / CHUNK);
      const key = cx + ',' + cz;
      let L = cells.get(key);
      if (!L) cells.set(key, L = []);
      const c = col ? [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]] : [1, 1, 1];
      L.push(ds + '|' + m.join(',') + '|' + c.join(','));
    }
  });
  const out = {};
  for (const [k, L] of cells) {
    L.sort();
    if (poison && k === poison.cell && L.length) L[0] = L[0] + 'X';
    let h = 2166136261 >>> 0;
    for (const s of L) {
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      h ^= 10; h = Math.imul(h, 16777619) >>> 0;
    }
    out[k] = { n: L.length, h };
  }
  // the six densest cells, in full, so a real value-by-value count is possible
  const dense = Object.keys(out).sort((a, b) => out[b].n - out[a].n).slice(0, 6);
  const full = {};
  for (const k of dense) full[k] = cells.get(k);
  return { cells: out, full, dense };
})`;

async function run(perm, poison) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (perm) await page.addInitScript(`globalThis.__t3Perm = ${perm};`);
  await page.goto(`http://127.0.0.1:${port}/index.html#scene=daytime-downtown&shot=1&map=graph`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  const r = await page.evaluate(`${HARVEST}([${poison ? JSON.stringify(poison) : 'null'}])`);
  await page.close();
  if (errs.length) console.log(`  page errors: ${errs.slice(0, 3).join(' | ')}`);
  return r;
}

const base = await run(0, null);
const nCells = Object.keys(base.cells).length;
const nInst = Object.values(base.cells).reduce((a, c) => a + c.n, 0);
const fullN = base.dense.reduce((a, k) => a + base.full[k].length, 0);
console.log(`baseline: ${nCells} cells, ${nInst} instances, ${fullN} instances compared value-by-value in ${base.dense.length} densest cells`);

const runs = [
  ['rebuild, same order', 0],
  ['permuted 0x5EED', 0x5EED],
  ['permuted 0xA11CE', 0xA11CE],
  ['permuted 0xBEEF', 0xBEEF],
  ['permuted 0x1234', 0x1234],
  ['permuted 0xFFFF', 0xFFFF],
];
let fail = 0;
for (const [label, perm] of runs) {
  const r = await run(perm, null);
  let cellsDiff = 0, valsDiff = 0, valsCmp = 0;
  const keys = new Set([...Object.keys(base.cells), ...Object.keys(r.cells)]);
  for (const k of keys) {
    const a = base.cells[k], b = r.cells[k];
    if (!a || !b || a.n !== b.n || a.h !== b.h) cellsDiff++;
  }
  for (const k of base.dense) {
    const A = base.full[k] || [], B = (r.full[k] || []).slice().sort();
    const n = Math.max(A.length, B.length);
    for (let i = 0; i < n; i++) {
      // one canonical string is 19 values plus the draw state
      valsCmp += 19;
      if (A[i] !== B[i]) valsDiff += 19;
    }
  }
  if (cellsDiff || valsDiff) fail++;
  console.log(`${label.padEnd(22)} cells ${Object.keys(r.cells).length}  differing cells ${cellsDiff}  values compared ${valsCmp}  differing ${valsDiff}`);
}

if (args.poison) {
  const p = { cell: base.dense[0] };
  const r = await run(0, p);
  let cellsDiff = 0;
  for (const k of Object.keys(base.cells)) if (base.cells[k].h !== (r.cells[k] || {}).h) cellsDiff++;
  console.log(`POISON CONTROL (one string in cell ${p.cell} perturbed): differing cells ${cellsDiff} (must be 1)`);
}
console.log(fail ? 'DETERMINISM: FAIL' : 'DETERMINISM: OK');
await browser.close(); server.close();
