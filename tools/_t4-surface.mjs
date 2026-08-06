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
// Usage: node tools/_t4-surface.mjs
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
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });

const out = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.physics;
  const s = p.state;
  const { surfaceAt } = await import('/world.js');

  // ---- 1. classification -----------------------------------------------------------------
  // Grid lines sit at multiples of 160 from -480; roadW is 20, the kerb face is at 13.
  const classes = {
    'road centreline': surfaceAt(0, 0),
    'ribbon edge (9.5 m)': surfaceAt(9.5, 40),
    'paved shoulder (11.6 m)': surfaceAt(11.6, 40),
    'kerb face (12.9 m)': surfaceAt(12.9, 40),
    'past the kerb (14 m)': surfaceAt(14, 40),
    'junction centre': surfaceAt(160, 160),
    'mid-block': surfaceAt(80, 80),
    'open ground beyond the grid': surfaceAt(900, 900),
    'interstate ribbon': surfaceAt(0, -700),
  };

  // Drive the car in a straight line at full throttle from a given position, dt-locked.
  //
  // WHY THE CAR IS WRAPPED. A top-speed run needs several kilometres of clear straight, and the
  // world does not have one: the grid roads run into blocks and everything runs into `bounds`
  // at 1400 m, where the position clamp kills the very number being measured. So the run happens
  // on the interstate line (z = -700, clear of every block) and the car is TELEPORTED 2000 m back
  // along X whenever it gets near the edge. Translating the position along a surface that does not
  // change class leaves velocity, load and tyre state untouched, so the asymptote is honest; the
  // first version of this probe skipped that and measured 48.5 m/s on BOTH surfaces, which was the
  // boundary clamp, not the car.
  const run = (z, seconds, boost) => {
    p.reset({ x: -1000, y: 0, z }, Math.PI / 2, 0);      // +X
    p.setInput({ throttle: 1, brake: 0, steer: 0, boost: !!boost, handbrake: false });
    const dt = 1 / 60;
    // Boost drains the bar, and this is a TOP SPEED measurement, not an endurance one: the bar is
    // re-armed every tick so the run measures the boosting ceiling rather than how long it lasts.
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      if (boost) s.boost = 1;
      p.step(dt);
      if (s.pos.x > 1000) s.pos.x -= 2000;
    }
    return { v: Math.abs(s.speed), surface: s.surface, offRoad: s.offRoad };
  };

  // ---- 2. top speed ----------------------------------------------------------------------
  // 60 s is well past the asymptote in both cases (tarmac settles by ~25 s).
  const tarmac = run(-700, 60, false);          // the interstate ribbon
  const tarmacBoost = run(-700, 60, true);
  const dirt = run(-800, 60, false);            // 100 m north of it, open ground, no geometry
  const dirtBoost = run(-800, 60, true);

  // ---- 3. transition ---------------------------------------------------------------------
  // A STEP INPUT, deliberately: the car is brought up to speed on the interstate and then displaced
  // straight off it, so the surface class flips between one frame and the next. Nothing the player
  // can do is harsher than that, so whatever the blend does here bounds what it does at a kerb.
  p.reset({ x: -1000, y: 0, z: -700 }, Math.PI / 2, 0);
  p.setInput({ throttle: 1, brake: 0, steer: 0, boost: false, handbrake: false });
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 30; i++) { p.step(dt); if (s.pos.x > 1000) s.pos.x -= 2000; }
  const vEntry = Math.abs(s.speed);
  s.pos.z = -800;                                  // off the ribbon, same instant
  const trace = [];
  for (let i = 0; i < 60 * 4; i++) {
    p.step(dt);
    if (s.pos.x > 1000) s.pos.x -= 2000;
    trace.push({ t: i / 60, v: Math.abs(s.speed), off: s.offRoad, surf: s.surface });
  }
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

  return { classes, tarmac, tarmacBoost, dirt, dirtBoost,
    maxDv, maxDoff, perCall, acc, vEntry,
    crossing: trace.filter((_, i) => i % 12 === 0).map((t) =>
      `t ${t.t.toFixed(2)}s v ${t.v.toFixed(1)} off ${t.off.toFixed(2)} ${t.surf}`) };
});

const pct = (a, b) => `${((1 - b / a) * 100).toFixed(1)}% below`;
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
