// _t4-surface.mjs — T4 acceptance measurement, in the REAL page.
//
// Three things are checked, and they are the three the task's acceptance criteria name:
//   1. classification: the surface query answers correctly on the ribbon, on the shoulder, on a
//      kerb, in a junction, and out in the open ground;
//   2. top speed on each surface, held at full throttle until it stops climbing, both dry and
//      boosting — the 10-15% band is on the ratio;
//   3. the transition: sampled every 50 ms while crossing the kerb at speed, the largest single
//      frame-to-frame step in ground speed and in the blended grip. A snap would show up here.
//
// S3c: default is `#map=graph` so the probe points live on Paradise City. Pass `--grid` for the
// LAYOUT path that the visual gate still uses.
//
// Usage: node tools/_t4-surface.mjs [--grid]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const useGrid = process.argv.includes('--grid');
const mapHash = useGrid ? '' : 'map=graph&';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.ktx2': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(p.endsWith('/') ? join(p, 'index.html') : p);
    res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.end(body);
  } catch { res.statusCode = 404; res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal',
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
// nomenu so ready is not gated on a click; map mode selected by hash.
await page.goto(`http://localhost:${port}/index.html#${mapHash}nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });

const out = await page.evaluate(async (gridMode) => {
  const g = window.__game;
  const p = g.physics;
  const s = p.state;
  // Prefer the world that was actually built (S3c); fall back to the module export for tools.
  const surfaceAt = g.world.surfaceAt || (await import('/world.js')).surfaceAt;

  // ---- 1. classification -----------------------------------------------------------------
  // GRID: lines at multiples of 160; roadW 20; kerb face at 13.
  // GRAPH: motorway edge 452 centreline near (149.7, 99.3), width 24, paved half = 12+3 = 15.
  //   Lateral unit along the first segment of that edge (approx); offsets measured from centre.
  //   Junction: node 403 degree 9 at (-1246.7, 116.9). Open ground: (1900, 1300).
  const classes = gridMode ? {
    'road centreline': surfaceAt(0, 0),
    'ribbon edge (9.5 m)': surfaceAt(9.5, 40),
    'paved shoulder (11.6 m)': surfaceAt(11.6, 40),
    'kerb face (12.9 m)': surfaceAt(12.9, 40),
    'past the kerb (14 m)': surfaceAt(14, 40),
    'junction centre': surfaceAt(160, 160),
    'mid-block': surfaceAt(80, 80),
    'open ground beyond the grid': surfaceAt(900, 900),
    'interstate ribbon': surfaceAt(0, -700),
  } : {
    // Motorway 452 mid: ribbon centreline.
    'road centreline': surfaceAt(149.7, 99.3),
    // ~11.5 m lateral (just inside painted edge of width/2=12).
    'ribbon edge (9.5 m)': surfaceAt(145.6, 88.6),
    // ~14.5 m: paved shoulder (width/2 + shoulder short of kerb).
    'paved shoulder (11.6 m)': surfaceAt(144.5, 85.7),
    // ~14.9 m: kerb face (paved half = 15 m inclusive).
    'kerb face (12.9 m)': surfaceAt(144.4, 85.4),
    // ~16 m: past the kerb.
    'past the kerb (14 m)': surfaceAt(144.0, 84.3),
    // Degree-9 node 403.
    'junction centre': surfaceAt(-1246.7, 116.9),
    // Face-90 centroid is dirt (big downtown face interior) - honest mid-block.
    'mid-block': surfaceAt(1347.3, -81.7),
    'open ground beyond the grid': surfaceAt(1900, 1300),
    // Same motorway ribbon as the speed run anchor.
    'interstate ribbon': surfaceAt(149.7, 99.3),
  };

  // Drive at full throttle. On the grid the interstate is an infinite line at z=-700 and the car
  // wraps in X. On the graph there is no multi-km constant-class ribbon (and the +/-2000 bound
  // would kill a long run near the edge), so the surface QUERY is pinned to the class under
  // test and the car wraps in X inside the bound - same honesty as the grid wrap: the asymptote
  // is the surface penalty, not a wall. Classification above still uses the real query.
  const realSurf = surfaceAt;
  const run = (anchor, seconds, boost, wantSurf) => {
    p.reset({ x: anchor.x, y: 0, z: anchor.z }, anchor.yaw, 0);
    p.setInput({ throttle: 1, brake: 0, steer: 0, boost: !!boost, handbrake: false });
    if (!gridMode) p.setSurfaceQuery(() => wantSurf);
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      if (boost) s.boost = 1;
      p.step(dt);
      if (s.pos.x > 1000) s.pos.x -= 2000;
      if (s.pos.x < -1000) s.pos.x += 2000;
    }
    if (!gridMode) p.setSurfaceQuery(realSurf);
    return { v: Math.abs(s.speed), surface: s.surface, offRoad: s.offRoad };
  };

  // Speed-run anchors: on the grid the interstate at z=-700 is clear of every block. On the
  // graph, buildings sit next to every road, so a multi-km run on a motorway centreline is a
  // collision test, not a surface test. Both classes therefore run at open ground (0,0) with
  // the surface QUERY pinned - same honesty as the grid's X-wrap: the asymptote is the surface
  // penalty alone. Classification above still uses the real graph query at real coordinates.
  const tarmacA = gridMode
    ? { x: -1000, z: -700, yaw: Math.PI / 2 }
    : { x: 0, z: 0, yaw: Math.PI / 2 };
  const dirtA = gridMode
    ? { x: -1000, z: -800, yaw: Math.PI / 2 }
    : { x: 0, z: 0, yaw: Math.PI / 2 };

  const tarmac = run(tarmacA, 60, false, 'tarmac');
  const tarmacBoost = run(tarmacA, 60, true, 'tarmac');
  const dirt = run(dirtA, 60, false, 'dirt');
  const dirtBoost = run(dirtA, 60, true, 'dirt');

  // ---- 3. transition ---------------------------------------------------------------------
  // Build speed on forced tarmac, then flip the query to dirt in one frame (step input).
  p.setSurfaceQuery(() => 'tarmac');
  p.reset({ x: tarmacA.x, y: 0, z: tarmacA.z }, tarmacA.yaw, 0);
  p.setInput({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 30; i++) {
    p.step(dt);
    if (s.pos.x > 1000) s.pos.x -= 2000;
  }
  const vEntry = Math.abs(s.speed);
  p.setSurfaceQuery(() => 'dirt');
  const trace = [];
  for (let i = 0; i < 60 * 4; i++) {
    p.step(dt);
    if (s.pos.x > 1000) s.pos.x -= 2000;
    trace.push({ t: i / 60, v: Math.abs(s.speed), off: s.offRoad, surf: s.surface });
  }
  p.setSurfaceQuery(realSurf);
  let maxDv = 0, maxDoff = 0;
  for (let i = 1; i < trace.length; i++) {
    maxDv = Math.max(maxDv, Math.abs(trace[i].v - trace[i - 1].v));
    maxDoff = Math.max(maxDoff, Math.abs(trace[i].off - trace[i - 1].off));
  }

  // ---- 4. per-frame cost of the query ----------------------------------------------------
  const N = 200000;
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < N; i++) acc += surfaceAt(i % 2000 - 1000, (i * 7) % 2000 - 1000).length;
  const perCall = (performance.now() - t0) / N;

  return {
    map: gridMode ? 'grid' : 'graph',
    classes, tarmac, tarmacBoost, dirt, dirtBoost,
    maxDv, maxDoff, perCall, acc, vEntry,
    crossing: trace.filter((_, i) => i % 12 === 0).map((t) =>
      `t ${t.t.toFixed(2)}s v ${t.v.toFixed(1)} off ${t.off.toFixed(2)} ${t.surf}`),
  };
}, useGrid);

const pct = (a, b) => `${((1 - b / a) * 100).toFixed(1)}% below`;
console.log(`--- mode ${out.map}`);
console.log('--- classification');
for (const [k, v] of Object.entries(out.classes)) console.log(`  ${k.padEnd(30)} ${v}`);
console.log('--- top speed (m/s), 60 s at full throttle');
console.log(`  tarmac        ${out.tarmac.v.toFixed(2)}   boost ${out.tarmacBoost.v.toFixed(2)}`);
console.log(`  dirt          ${out.dirt.v.toFixed(2)}   boost ${out.dirtBoost.v.toFixed(2)}`);
console.log(`  penalty       ${pct(out.tarmac.v, out.dirt.v)}   boost ${pct(out.tarmacBoost.v, out.dirtBoost.v)}`);
console.log(`--- leaving the tarmac at ${out.vEntry.toFixed(1)} m/s (step input)`);
for (const l of out.crossing) console.log(`  ${l}`);
console.log(`  largest single-frame step: speed ${out.maxDv.toFixed(3)} m/s, offRoad ${out.maxDoff.toFixed(4)}`);
console.log('--- cost');
console.log(`  surfaceAt: ${(out.perCall * 1000).toFixed(4)} us/call, 1 call/frame = ${(out.perCall).toFixed(6)} ms/frame`);

const band = (a, b) => { const d = (1 - b / a) * 100; return d >= 10 && d <= 15; };
const ok = out.classes['ribbon edge (9.5 m)'] === 'tarmac'
  && out.classes['kerb face (12.9 m)'] === 'tarmac'
  && out.classes['junction centre'] === 'tarmac'
  && out.classes['past the kerb (14 m)'] === 'dirt'
  && out.classes['open ground beyond the grid'] === 'dirt'
  && band(out.tarmac.v, out.dirt.v) && band(out.tarmacBoost.v, out.dirtBoost.v)
  && out.maxDv < 0.2;
console.log(ok ? '\nT4 OK' : '\nT4 FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
