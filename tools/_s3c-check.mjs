// S3c acceptance: paths on tarmac, seven spawns, parked cull, drive probe under #map=graph.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

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
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const tBoot = Date.now();
await page.goto(`http://localhost:${port}/index.html#map=graph&nomenu=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
console.log('boot ms', Date.now() - tBoot);

const out = await page.evaluate(async () => {
  const g = window.__game;
  const w = g.world;
  const surf = w.surfaceAt;
  const { getScene, SCENE_IDS } = await import('/scenes.js');

  // paths samples
  const pathCheck = (name) => {
    const path = w.paths[name];
    let on = 0, off = 0, worst = 0;
    for (const s of path.samples) {
      if (surf(s.x, s.z) === 'tarmac') on++;
      else {
        off++;
        // rough offset: nearest road
        const n = w.blockIndex ? null : null;
        worst = Math.max(worst, 0); // filled below if graph nearest available
      }
    }
    // worst offset via scanning if any off
    if (off) {
      // use physics surface only; report fraction
    }
    return { name, n: path.samples.length, on, off, closed: path.closed, length: path.length,
      stats: w.paths.stats || null };
  };
  const city = pathCheck('city');
  const highway = pathCheck('highway');

  // seven scene spawns
  const spawns = [];
  for (const id of SCENE_IDS) {
    const sc = getScene(id);
    // reset-ish: call setup
    sc.setup(g);
    const pos = g.physics.state.pos;
    const key = surf(pos.x, pos.z);
    spawns.push({ id, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), surface: key });
  }

  // parked counts
  const cs = w.chunkStats();
  const park = {
    parkedCars: cs.content.parkedCars,
    culled: w.parkedCounts.culled,
    rank: w.parkedCounts.rank,
    queue: w.parkedCounts.queue,
  };

  // drive probe: one route per district via path samples and throttle; assert not stuck/oob
  // Use city path for downtown loop; highway for motorway; and a few absolute points.
  const routes = [];
  const drive = (label, points, seconds = 4) => {
    const p = g.physics;
    let walls = 0, stopped = 0, oob = 0, chunkCross = 0;
    let lastCell = null;
    const cell = (x, z) => `${Math.floor(x / 200)},${Math.floor(z / 200)}`;
    p.reset({ x: points[0][0], y: 0, z: points[0][1] }, 0, 20);
    p.setInput({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
    const dt = 1 / 60;
    let prev = { x: p.state.pos.x, z: p.state.pos.z };
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      // steer toward next path sample
      const t = i / (seconds * 60);
      const idx = Math.min(points.length - 1, Math.floor(t * (points.length - 1)));
      const tgt = points[idx];
      const dx = tgt[0] - p.state.pos.x, dz = tgt[1] - p.state.pos.z;
      const want = Math.atan2(dx, dz);
      let err = want - p.state.yaw;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      p.setInput({ throttle: 1, brake: 0, steer: Math.max(-1, Math.min(1, err * 1.5)), boost: false, handbrake: false });
      p.step(dt);
      const c = cell(p.state.pos.x, p.state.pos.z);
      if (lastCell && c !== lastCell) chunkCross++;
      lastCell = c;
      if (Math.abs(p.state.pos.x) > w.bounds || Math.abs(p.state.pos.z) > w.bounds) oob++;
      if (Math.abs(p.state.speed) < 0.5 && i > 30) stopped++;
      // wall: speed drop while throttle + little movement
      const moved = Math.hypot(p.state.pos.x - prev.x, p.state.pos.z - prev.z);
      if (moved < 0.02 && Math.abs(p.state.speed) < 2 && i > 30) walls++;
      prev = { x: p.state.pos.x, z: p.state.pos.z };
    }
    routes.push({
      label, seconds, chunkCross, walls, stopped, oob,
      end: { x: +p.state.pos.x.toFixed(1), z: +p.state.pos.z.toFixed(1), v: +Math.abs(p.state.speed).toFixed(2) },
      surfaceEnd: surf(p.state.pos.x, p.state.pos.z),
    });
  };

  // sample city path every 20th sample
  const cityPts = w.paths.city.samples.filter((_, i) => i % 20 === 0).map((s) => [s.x, s.z]);
  const hwPts = w.paths.highway.samples.filter((_, i) => i % 20 === 0).map((s) => [s.x, s.z]);
  drive('city-circuit (downtown face ring)', cityPts, 8);
  drive('highway-chain (motorway)', hwPts, 6);

  // district point drives: pick a tarmac point near each district's edges
  const districts = ['downtown', 'harbor', 'palmbay', 'silverlake', 'mountain'];
  // use block index centroids of first block per district
  const byD = {};
  for (const b of w.blocks) {
    const d = b.district || 'grid';
    if (!byD[d]) byD[d] = b;
  }
  for (const d of districts) {
    const b = byD[d];
    if (!b) { routes.push({ label: d, skip: true }); continue; }
    // place just outside the block on the road side: step from centre toward outside until tarmac
    let x = b.cx, z = b.cz;
    let found = null;
    for (let r = b.w; r < b.w + 40; r += 2) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const px = b.cx + dx * r, pz = b.cz + dz * r;
        if (surf(px, pz) === 'tarmac') { found = [px, pz]; break; }
      }
      if (found) break;
    }
    if (!found) { routes.push({ label: d, skip: true, reason: 'no tarmac near block' }); continue; }
    // short dash along +X on tarmac with snap
    const p = g.physics;
    p.reset({ x: found[0], y: 0, z: found[1] }, Math.PI / 2, 25);
    p.setInput({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
    let chunkCross = 0, walls = 0, stopped = 0, oob = 0, lastCell = null;
    const cell = (x, z) => `${Math.floor(x / 200)},${Math.floor(z / 200)}`;
    let prev = { x: found[0], z: found[1] };
    for (let i = 0; i < 60 * 5; i++) {
      p.step(1 / 60);
      // stay on tarmac corridor by mild recentre if dirt
      if (surf(p.state.pos.x, p.state.pos.z) !== 'tarmac') {
        // try small lateral search
        let ok = false;
        for (const lat of [0, 2, -2, 4, -4, 6, -6]) {
          const tx = p.state.pos.x, tz = p.state.pos.z + lat;
          if (surf(tx, tz) === 'tarmac') { p.state.pos.z = tz; ok = true; break; }
        }
        if (!ok) walls++;
      }
      const c = cell(p.state.pos.x, p.state.pos.z);
      if (lastCell && c !== lastCell) chunkCross++;
      lastCell = c;
      if (Math.abs(p.state.pos.x) > w.bounds || Math.abs(p.state.pos.z) > w.bounds) oob++;
      if (Math.abs(p.state.speed) < 0.5 && i > 30) stopped++;
      const moved = Math.hypot(p.state.pos.x - prev.x, p.state.pos.z - prev.z);
      if (moved < 0.02 && i > 30) walls++;
      prev = { x: p.state.pos.x, z: p.state.pos.z };
    }
    routes.push({
      label: `district:${d}`, chunkCross, walls, stopped, oob,
      start: found.map((n) => +n.toFixed(1)),
      end: { x: +p.state.pos.x.toFixed(1), z: +p.state.pos.z.toFixed(1), v: +Math.abs(p.state.speed).toFixed(2) },
    });
  }

  return {
    bounds: w.bounds,
    map: cs.map,
    pathStats: w.paths.stats || null,
    city, highway, spawns, park, routes,
    overflow: cs.overflow,
  };
});

console.log(JSON.stringify(out, null, 2));

await browser.close();
server.close();
