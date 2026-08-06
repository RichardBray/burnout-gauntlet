// _promoteslot-live.mjs — "the parked car just disappears".
//
// The pool holds POOL_CAP slots but only POOL of them are DRAWN. Promotion used to claim the
// first dead slot without checking that, so once the live population reached its ceiling the
// struck car was promoted into an undrawn slot: simulated, collidable, invisible.
//
// This probe waits for the pool to actually saturate, promotes a parked car, then reads the
// INSTANCE MATRIX the renderer would submit and asserts the wreck is really on screen at the
// parking spot. Reading `traffic.vehicles` alone cannot catch this — the old bug was green
// there, which is the whole reason it survived.
//
//   node tools/_promoteslot-live.mjs
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
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1&scene=daytime-downtown&res=1`,
  { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 240000 });

// The ring fills over a few seconds; a promotion into a NON-full pool cannot reproduce the bug.
await page.waitForFunction(
  () => window.__game.traffic.count >= window.__game.traffic.POOL,
  null, { timeout: 60000 },
);

const out = await page.evaluate(async () => {
  const g = window.__game, t = g.traffic, s = g.physics.state;
  const liveBefore = t.count, POOL = t.POOL;

  // Park the hero next to a parked car and stamp the hit physics.js would stamp. Driving into
  // one is _parkedhit-live.mjs's job; what is under test here is which SLOT promotion picks,
  // and a stamp exercises that path exactly as a real contact does.
  let b = null, best = 1e9;
  for (const c of g.world.parkedCars) {
    if (c.gone) continue;
    const d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
    if (d > 30 && d < best) { best = d; b = c; }
  }
  if (!b) return { fail: 'no parked body' };
  b.heroHit = { rel: 14, sev: 0.7, kx: 14 * b.fx, kz: 14 * b.fz,
    closing: 14, nx: -b.fx, nz: -b.fz, off: 0 };

  await new Promise((r) => setTimeout(r, 400));   // let traffic.update() consume the stamp

  const wreck = t.vehicles.find((v) => v.wrecked
    && Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 40);
  if (!wreck) return { fail: 'no wreck appeared', gone: b.gone, liveBefore, POOL };

  // THE RENDER-SIDE READ. bodyMesh draws instances [0, count); a slot at k >= POOL writes
  // its matrix past that and is never submitted.
  let bodyMesh = null;
  g.scene.traverse((o) => { if (o.name === 'trafficBody') bodyMesh = o; });
  const m4 = new g.THREE.Matrix4(), p = new g.THREE.Vector3(),
    q = new g.THREE.Quaternion(), sc = new g.THREE.Vector3();
  const idx = wreck.k * 2;
  const drawn = idx < bodyMesh.count;
  bodyMesh.getMatrixAt(idx, m4);
  m4.decompose(p, q, sc);

  return {
    gone: b.gone, liveBefore, POOL, k: wreck.k, drawnCount: bodyMesh.count, drawn,
    scale: +sc.length().toFixed(4),
    distToSpot: +Math.hypot(p.x - b.x, p.z - b.z).toFixed(2),
  };
});
console.log(out);
let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok' : 'FAIL'}: ${m}`); if (!c) fail = 1; };
ok(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
if (out.fail) { ok(false, out.fail); }
else {
  ok(out.liveBefore >= out.POOL, `pool was saturated before the hit (${out.liveBefore}/${out.POOL})`);
  ok(out.gone === true, 'the baked parked body was hidden');
  ok(out.k < out.POOL, `promoted into a DRAWN slot (k ${out.k} < POOL ${out.POOL})`);
  ok(out.drawn, `its instance is inside the submitted range (${out.k * 2} < ${out.drawnCount})`);
  ok(out.scale > 0.5, `its instance is not zero-scaled (scale ${out.scale})`);
  ok(out.distToSpot < 6, `it is drawn AT the parking spot (${out.distToSpot} m away)`);
}
console.log(fail ? 'promoteslot-live: FAILED' : 'promoteslot-live: all checks passed');
await browser.close();
server.close();
process.exit(fail);
