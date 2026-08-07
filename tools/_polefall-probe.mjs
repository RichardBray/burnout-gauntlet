// _polefall-probe.mjs — RENDER-SIDE proof that knocking a pole down actually removes it.
//
//   node tools/_polefall-probe.mjs [--hash map=graph] [--scene hud-overlay] [--n 12]
//
// `world.poles[i].hide()` routes through `sink.resolve`, which maps an emitter's
// `[descriptor, index]` onto the finalized per-cell InstancedMesh the instance really landed in.
// A check against `poles` or against the source pool stays green while the pole is still on
// screen, so this walks the SUBMITTED instance matrices instead: every InstancedMesh in the
// scene, every instance, its world-space translation.
//
// For each sampled pole it asserts three things:
//   1. hide() does not throw (the S3b boot failure was `resolve: no finalized instance`);
//   2. the global instance-above-ground count falls by EXACTLY the pole's own part count
//      (lamp: pole, arm, head, bulb = 4; signal: pole, arm, head, 3 lenses = 6) - so hide()
//      removed the whole pole and moved nothing else in the city;
//   3. the standing instances within RADIUS of the pole fall by the same number. RADIUS is a
//      neighbourhood, not an identity: a second pole or a prop can stand inside it, so `after`
//      is not required to be zero. Criterion 2 is the exact one.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve as rp } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((s) => s.trim()).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; }));
const scene = args.scene || 'hud-overlay';
const hash = args.hash || '';
const N = +(args.n || 12);
const root = rp(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, p === '/' ? '/index.html' : p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const h = ['shot=1', `scene=${scene}`, hash].filter(Boolean).join('&');
await page.goto(`http://127.0.0.1:${port}/#${h}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', null, { timeout: 300000 });

const out = await page.evaluate((N) => {
  const g = window.__game;
  const THREE = g.THREE;
  const scene = g.scene;
  const RADIUS = 6.0;   // a lamp arm reaches 2.3 m and a signal arm 4.9 m from its own pole
  const YMIN = 1.0;     // ignore the ground pad / contact shadow, which hide() does not own

  // Every submitted instance, in world space. Rebuilt per sample so a stale read cannot pass.
  function census() {
    const pts = [];
    scene.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.visible) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        if (v.y > YMIN) pts.push([v.x, v.y, v.z]);
      }
    });
    return pts;
  }

  const poles = g.world.poles;
  if (!poles || !poles.length) return { err: 'no poles' };
  const near = (pts, p) => {
    let n = 0;
    for (const [x, , z] of pts) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < RADIUS * RADIUS) n++;
    }
    return n;
  };

  // Spread the sample over the whole array so it covers both kinds and many cells.
  const step = Math.max(1, Math.floor(poles.length / N));
  const rows = [];
  let pts = census();
  let globalBefore = pts.length;
  for (let k = 0; k < N; k++) {
    const p = poles[k * step];
    if (!p || p.hit) continue;
    const before = near(pts, p);
    let err = '';
    try { p.hide(); p.hit = true; } catch (e) { err = e.message; }
    pts = census();
    const after = near(pts, p);
    rows.push({ i: k * step, kind: p.kind, before, after,
      globalDrop: globalBefore - pts.length, err });
    globalBefore = pts.length;
  }
  return { poles: poles.length, rows };
}, N);

console.log(JSON.stringify(out, null, 1));
if (out.rows) {
  const parts = { lamp: 4, signal: 6 };
  const bad = out.rows.filter((r) => r.err || r.globalDrop !== parts[r.kind]
    || r.after !== r.before - parts[r.kind]);
  for (const r of bad) console.log('BAD', JSON.stringify(r));
  console.log(bad.length ? `FAIL ${bad.length}/${out.rows.length}` : `PASS ${out.rows.length}/${out.rows.length} poles hidden on the render side`);
}
await browser.close();
server.close();
