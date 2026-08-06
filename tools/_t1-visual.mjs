// _t1-visual.mjs - T1, VERIFIED IN PIXELS. The data-side probe (_t1-repro.mjs) passes while the
// user reports nothing moves, so the data is not the thing to trust. This drives the car with the
// REAL W key (no per-frame speed forcing) into a parked car and writes screenshots to look at.
//
// It also dumps, at each stage, what the RENDERER thinks: whether the baked instance was actually
// hidden, and where the promoted pool car's drawn matrix is - because "the body moved in the
// simulation" and "the picture changed" are different claims and only the second one is the bug.
//
// Usage: node tools/_t1-visual.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const outDir = resolve(dirname(new URL(import.meta.url).pathname), '../shots/t1');
await mkdir(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/index.html#nomenu=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(800);

// Line the hero up 34 m behind a parked car, pointing at it, STATIONARY. Positioning only - from
// here the car is driven with the real key handlers and nothing touches state.speed.
const setup = await page.evaluate(() => {
  const g = window.__game;
  const hp = g.physics.state.pos;
  let b = null, best = 1e18;
  for (const c of g.world.parkedCars) {
    if (c.gone) continue;
    const d = (c.x - hp.x) ** 2 + (c.z - hp.z) ** 2;
    if (d < best) { best = d; b = c; }
  }
  if (!b) return { err: 'no parked bodies' };
  const ax = -b.fx, az = -b.fz;
  g.physics.reset({ x: b.x + ax * -34, y: 0, z: b.z + az * -34 }, Math.atan2(ax, az), 0);
  g.traffic.reset(g.physics.state.pos);
  window.__target = b;
  return { x: b.x, z: b.z, van: !!b.van };
});
if (setup.err) { console.log(setup.err); await browser.close(); server.close(); process.exit(1); }
console.log(`target parked car at (${setup.x.toFixed(1)}, ${setup.z.toFixed(1)}) van=${setup.van}`);

// What the RENDERER is showing for this specific car: the world-space translation of every
// instance the baked body owns. If hide() worked, they are all at y = -1000.
const drawn = () => page.evaluate(() => {
  const g = window.__game;
  const b = window.__target;
  const m = new (window.__THREE_M || Object)();
  // Pull the instance matrices straight out of the meshes the world baked this car into.
  const out = [];
  const scan = (mesh) => {
    if (!mesh || !mesh.isInstancedMesh) return;
    const arr = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) {
      const o = i * 16;
      const x = arr[o + 12], y = arr[o + 13], z = arr[o + 14];
      if (Math.hypot(x - b.x, z - b.z) < 4 && y > -100) out.push({ x, y, z });
    }
  };
  const root3 = g.scene || g.world?.group;
  root3?.traverse?.((n) => scan(n));
  const w = (g.traffic.vehicles || []).find((v) => v.wrecked);
  return {
    instancesNearParkSpot: out.length,
    bodyGone: !!b.gone,
    wreck: w ? { x: w.pos.x, z: w.pos.z, wvx: w.wvx, wvz: w.wvz, yaw: w.yaw } : null,
  };
});

const shot = async (name) => { await page.screenshot({ path: join(outDir, `${name}.png`) }); };

console.log('\nstage                    instancesAtParkSpot  bodyGone  wreckPos');
const report = async (tag) => {
  const d = await drawn();
  console.log(`${tag.padEnd(24)} ${String(d.instancesNearParkSpot).padStart(19)}  ${String(d.bodyGone).padStart(8)}`
    + `  ${d.wreck ? `(${d.wreck.x.toFixed(1)}, ${d.wreck.z.toFixed(1)})` : '-'}`);
  return d;
};

await shot('0-before');
await report('before (parked)');

// DRIVE. Real keydown, real throttle, no speed forcing.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
const speedAt = () => page.evaluate(() => window.__game.physics.state.ground);
// Roll until contact or 6 s.
const t0 = Date.now();
let hit = false;
while (Date.now() - t0 < 6000) {
  await page.waitForTimeout(120);
  const d = await page.evaluate(() => ({ gone: !!window.__target.gone }));
  if (d.gone) { hit = true; break; }
}
const vAtHit = await speedAt();
console.log(`\ncontact: ${hit ? 'yes' : 'NO'}  hero ground speed ~${vAtHit.toFixed(1)} m/s`);
await shot('1-at-contact');
await report('at contact');

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
await page.waitForTimeout(400);
await shot('2-plus-0.4s');
await report('+0.4 s');
await page.waitForTimeout(1200);
await shot('3-plus-1.6s');
await report('+1.6 s');

console.log(errors.length ? `\nCONSOLE ERRORS: ${errors.slice(0, 5).join(' | ')}` : '\nconsole clean');
console.log(`\nscreenshots in ${outDir}`);
await browser.close();
server.close();
