// _t1-eyes.mjs - DOES THE PICTURE CHANGE? A fixed camera is parked looking at one specific
// kerbside car, the hero is placed beside it, a known hit is stamped on it, and frames are
// written before and after. No driving, no aiming, nothing to miss.
//
// This exists because the data-side probe (_t1-repro.mjs) passes - the struck body genuinely
// moves in the simulation - while the user reports the car does not move on screen. Those are
// two different claims and only the second one is the bug being chased.
//
// Usage: node tools/_t1-eyes.mjs
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

const setup = await page.evaluate(() => {
  const g = window.__game;
  // A parked car near the hero's spawn, so traffic keeps its neighbourhood resident.
  const hp = g.physics.state.pos;
  let b = null, best = 1e18;
  for (const c of g.world.parkedCars) {
    if (c.gone) continue;
    const d = (c.x - hp.x) ** 2 + (c.z - hp.z) ** 2;
    if (d < best) { best = d; b = c; }
  }
  if (!b) return { err: 'no parked bodies' };
  window.__t = b;
  // Hero right beside it so the promotion's own distance culling keeps it alive, and so the
  // pool slot it steals is not immediately recycled.
  g.physics.reset({ x: b.x + b.fz * 6, y: 0, z: b.z - b.fx * 6 }, 0, 0);
  g.traffic.reset(g.physics.state.pos);
  // Camera: orbit mode with ZERO speed is a fixed camera aimed at a world point, which is
  // exactly what is wanted - the chase cam would follow the hero instead of watching the car.
  g.camRig.configure({
    mode: 'orbit', orbitRadius: 13, orbitHeight: 5.0, orbitSpeed: 0, orbitStart: 0.9,
    orbitTarget: { x: b.x, y: 0.9, z: b.z, isVector3: true,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
    fov: 46, shake: 0,
  });
  return { x: b.x, z: b.z, van: !!b.van };
});
if (setup.err) { console.log(setup.err); await browser.close(); server.close(); process.exit(1); }
console.log(`watching the parked car at (${setup.x.toFixed(1)}, ${setup.z.toFixed(1)})`);

await page.waitForTimeout(700);
await page.screenshot({ path: join(outDir, 'eyes-0-parked.png') });

// Stamp a 12 m/s square hit on it, in exactly the shape physics.js writes, and let traffic.js
// consume it on its next update.
const stamped = await page.evaluate(() => {
  const b = window.__t;
  const nx = b.fx, nz = b.fz;            // hero on its nose; body leaves along -n
  b.heroHit = { rel: 12, sev: 0.6, kx: -nx * 12, kz: -nz * 12,
    closing: 12, nx, nz, off: 0.55 };    // 0.55 = off-centre, so it should visibly rotate too
  return true;
});
await page.waitForTimeout(120);
const after1 = await page.evaluate(() => {
  const g = window.__game, b = window.__t;
  const w = (g.traffic.vehicles || []).find((v) => v.wrecked);
  return { gone: !!b.gone, wreck: w ? { x: w.pos.x, z: w.pos.z, wvx: w.wvx, wvz: w.wvz, yaw: w.yaw } : null };
});
console.log(`promoted: ${after1.gone}  wreck: ${after1.wreck
  ? `(${after1.wreck.x.toFixed(1)}, ${after1.wreck.z.toFixed(1)}) v=(${after1.wreck.wvx.toFixed(1)}, ${after1.wreck.wvz.toFixed(1)})`
  : 'NONE'}`);
await page.screenshot({ path: join(outDir, 'eyes-1-justhit.png') });

await page.waitForTimeout(600);
await page.screenshot({ path: join(outDir, 'eyes-2-plus0.6s.png') });
const mid = await page.evaluate(() => {
  const g = window.__game, b = window.__t;
  const w = (g.traffic.vehicles || []).find((v) => v.wrecked);
  return w ? { x: w.pos.x, z: w.pos.z, d: Math.hypot(w.pos.x - b.x, w.pos.z - b.z) } : null;
});
console.log(`+0.6 s: wreck ${mid ? `${mid.d.toFixed(2)} m from the parking spot` : 'NONE'}`);

await page.waitForTimeout(1400);
await page.screenshot({ path: join(outDir, 'eyes-3-plus2s.png') });
const end = await page.evaluate(() => {
  const g = window.__game, b = window.__t;
  const w = (g.traffic.vehicles || []).find((v) => v.wrecked);
  return w ? { d: Math.hypot(w.pos.x - b.x, w.pos.z - b.z) } : null;
});
console.log(`+2.0 s: wreck ${end ? `${end.d.toFixed(2)} m from the parking spot` : 'NONE'}`);

console.log(errors.length ? `\nCONSOLE ERRORS: ${errors.slice(0, 5).join(' | ')}` : '\nconsole clean');
await browser.close();
server.close();
